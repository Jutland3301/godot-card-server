"use strict";

const Triggers = require("./triggers");

const TURN_TIME_LIMIT_SECONDS = 45.0;
const MANA_GAIN_PER_TURN = 1;
const MAX_MANA = 10;
const MAX_HAND_SIZE = 7;

function ensureState(state) {
  if (!state || typeof state !== "object") {
    return {};
  }

  if (!state.players || typeof state.players !== "object") {
    state.players = {};
  }

  if (!state.players.A && state.player1) {
    state.players.A = state.player1;
  }

  if (!state.players.B && state.player2) {
    state.players.B = state.player2;
  }

  if (state.players.A) {
    state.player1 = state.players.A;
  }

  if (state.players.B) {
    state.player2 = state.players.B;
  }

  if (!state.seat_to_owner_id || typeof state.seat_to_owner_id !== "object") {
    state.seat_to_owner_id = { A: "player1", B: "player2" };
  }

  if (!state.owner_to_seat_id || typeof state.owner_to_seat_id !== "object") {
    state.owner_to_seat_id = { player1: "A", player2: "B" };
  }

  if (!Array.isArray(state.battle_log_messages)) {
    state.battle_log_messages = [];
  }

  if (!Array.isArray(state.log)) {
    state.log = [];
  }

  if (!state.turn_seat) {
    if (state.current_player_id === "player2") {
      state.turn_seat = "B";
    } else {
      state.turn_seat = "A";
    }
  }

  if (!state.current_player_id) {
    state.current_player_id = state.turn_seat === "B" ? "player2" : "player1";
  }

  normalizePlayer(state.players.A, "Player1");
  normalizePlayer(state.players.B, "Player2");

  return state;
}

function normalizePlayer(player, fallbackName) {
  if (!player || typeof player !== "object") {
    return;
  }

  if (!Array.isArray(player.deck)) {
    player.deck = [];
  }

  if (!Array.isArray(player.hand)) {
    player.hand = [];
  }

  if (!Array.isArray(player.board)) {
    player.board = [];
  }

  if (!Array.isArray(player.graveyard)) {
    player.graveyard = [];
  }

  if (!player.name) {
    player.name = fallbackName;
  }

  player.hp = Number(player.hp ?? 20);
  player.max_hp = Number(player.max_hp ?? 20);
  player.mana = Number(player.mana ?? 0);
  player.max_mana = Number(player.max_mana ?? 0);
}

function getPlayer(state, seatId) {
  ensureState(state);

  if (seatId === "A") {
    return state.players.A || null;
  }

  if (seatId === "B") {
    return state.players.B || null;
  }

  return null;
}

function getOpponentSeat(seatId) {
  return seatId === "A" ? "B" : "A";
}

function getOwnerIdForSeat(seatId) {
  return seatId === "A" ? "player1" : seatId === "B" ? "player2" : "";
}

function addLog(state, message) {
  ensureState(state);

  const text = String(message || "");
  if (!text) {
    return;
  }

  state.status_message = text;
  state.battle_log_messages.push(text);
  state.log.push(text);

  if (state.battle_log_messages.length > 80) {
    state.battle_log_messages.splice(0, state.battle_log_messages.length - 80);
  }

  if (state.log.length > 80) {
    state.log.splice(0, state.log.length - 80);
  }
}

function drawOneCard(state, seatId) {
  const player = getPlayer(state, seatId);

  if (!player) {
    return null;
  }

  if (player.deck.length <= 0) {
    return null;
  }

  const card = player.deck.pop();

  if (player.hand.length >= MAX_HAND_SIZE) {
    player.graveyard.push(card);
    return card;
  }

  player.hand.push(card);
  return card;
}

function refreshUnitsForNewTurn(player) {
  if (!player || !Array.isArray(player.board)) {
    return;
  }

  for (const unit of player.board) {
    if (!unit) {
      continue;
    }

    unit.summoned_this_turn = false;
    unit.can_attack = true;
    unit.exhausted = false;
    unit.has_attacked_this_turn = false;
    unit.attacks_this_turn = 0;

    if (Array.isArray(unit.keywords) && unit.keywords.includes("immobile")) {
      unit.can_attack = false;
      unit.exhausted = true;
    }

    if (!unit.once_per_turn_flags || typeof unit.once_per_turn_flags !== "object") {
      unit.once_per_turn_flags = {};
    }
  }
}

function clearPendingState(state) {
  state.selecting_target = false;
  state.selecting_hand_card = false;
  state.pending_action_type = "none";
  state.pending_card = null;
  state.pending_hand_index = -1;
  state.pending_card_owner = "";
  state.pending_attacker_index = -1;
  state.selected_attacker_owner = "";
  state.selected_attacker_index = -1;
  state.pending_ability = {};
  state.selected = null;
  state.pending_deaths = [];
  state.pending_summons = [];
}

function checkGameOver(state) {
  ensureState(state);

  const playerA = state.players.A;
  const playerB = state.players.B;

  if (!playerA || !playerB || state.game_over) {
    return;
  }

  if (Number(playerA.hp || 0) <= 0 && Number(playerB.hp || 0) <= 0) {
    state.game_over = true;
    state.turn_timer_active = false;
    state.turn_timer_timeout_handled = true;
    state.winner_seat = null;
    state.loser_seat = null;
    addLog(state, "Both players were defeated. Draw.");
    return;
  }

  if (Number(playerA.hp || 0) <= 0) {
    state.game_over = true;
    state.turn_timer_active = false;
    state.turn_timer_timeout_handled = true;
    state.winner_seat = "B";
    state.loser_seat = "A";
    addLog(state, "Player2 wins.");
    return;
  }

  if (Number(playerB.hp || 0) <= 0) {
    state.game_over = true;
    state.turn_timer_active = false;
    state.turn_timer_timeout_handled = true;
    state.winner_seat = "A";
    state.loser_seat = "B";
    addLog(state, "Player1 wins.");
  }
}

function beginTurn(state, seatId, deps = {}) {
  ensureState(state);

  const activeSeat = seatId || state.turn_seat || "A";
  const player = getPlayer(state, activeSeat);

  if (!player) {
    return { ok: false, state, message: "Invalid active seat." };
  }

  if (state.game_over) {
    return { ok: false, state, message: "Game is already over." };
  }

  state.turn_seat = activeSeat;
  state.current_player_id = getOwnerIdForSeat(activeSeat);

  if (Triggers && typeof Triggers.clearExpiredTemporaryKeywords === "function") {
    Triggers.clearExpiredTemporaryKeywords(state, activeSeat);
  }

  const drawn = drawOneCard(state, activeSeat);

  if (!drawn) {
    state.game_over = true;
    state.turn_timer_active = false;
    state.turn_timer_timeout_handled = true;
    state.winner_seat = getOpponentSeat(activeSeat);
    state.loser_seat = activeSeat;
    addLog(state, player.name + " loses because they cannot draw a card.");
    return { ok: true, state };
  }

  player.max_mana = Math.min(Number(player.max_mana || 0) + MANA_GAIN_PER_TURN, MAX_MANA);
  player.mana = player.max_mana;

  refreshUnitsForNewTurn(player);

  state.turn_time_left = TURN_TIME_LIMIT_SECONDS;
  state.turn_timer_active = true;
  state.turn_timer_timeout_handled = false;

  if (Triggers && typeof Triggers.resolveTurnStart === "function") {
    Triggers.resolveTurnStart(state, activeSeat, deps);
  }

  addLog(state, "Turn " + Number(state.turn_number || 1) + ": " + player.name + "'s turn started.");
  checkGameOver(state);

  return { ok: true, state };
}

function endTurn(state, seatId, deps = {}) {
  ensureState(state);

  const activeSeat = seatId || state.turn_seat || "A";
  const player = getPlayer(state, activeSeat);

  if (!player) {
    return { ok: false, state, message: "Invalid active seat." };
  }

  if (state.game_over) {
    return { ok: false, state, message: "Game is already over." };
  }

  if (state.turn_seat && state.turn_seat !== activeSeat) {
    return { ok: false, state, message: "Not your turn." };
  }

  state.turn_timer_active = false;
  state.turn_timer_timeout_handled = true;
  state.turn_time_left = 0.0;

  if (Triggers && typeof Triggers.resolveTurnEnd === "function") {
    Triggers.resolveTurnEnd(state, activeSeat, deps);
  }

  addLog(state, player.name + "'s turn ended.");

  clearPendingState(state);

  const nextSeat = getOpponentSeat(activeSeat);
  state.turn_seat = nextSeat;
  state.current_player_id = getOwnerIdForSeat(nextSeat);
  state.turn_number = Number(state.turn_number || 1) + 1;

  checkGameOver(state);

  if (!state.game_over) {
    return beginTurn(state, nextSeat, deps);
  }

  return { ok: true, state };
}

function surrender(state, seatId) {
  ensureState(state);

  const loser = getPlayer(state, seatId);
  const winnerSeat = getOpponentSeat(seatId);
  const winner = getPlayer(state, winnerSeat);

  if (!loser || !winner) {
    return { ok: false, state, message: "Invalid surrender seat." };
  }

  loser.hp = 0;
  state.game_over = true;
  state.turn_timer_active = false;
  state.turn_timer_timeout_handled = true;
  state.winner_seat = winnerSeat;
  state.loser_seat = seatId;

  clearPendingState(state);
  addLog(state, loser.name + " surrendered. " + winner.name + " wins.");

  return { ok: true, state };
}

function handleBattleAction(match, seatId, payload, deps = {}) {
  if (!match || typeof match !== "object") {
    return { ok: false, message: "Match is missing." };
  }

  const state = ensureState(match.state || {});
  match.state = state;

  const action = String(payload && payload.action ? payload.action : "");

  if (!seatId || (seatId !== "A" && seatId !== "B")) {
    return { ok: false, state, message: "Invalid seat." };
  }

  switch (action) {
    case "end_turn":
      return endTurn(state, seatId, deps);

    case "surrender":
      return surrender(state, seatId);

    default:
      return {
        ok: false,
        state,
        message: "Unknown battle action: " + action
      };
  }
}

function playCardFromHand(state, seatId, handIndex, target = null, deps = {}) {
  return {
    ok: false,
    state,
    message: "playCardFromHand is not implemented in actions.js yet."
  };
}

module.exports = {
  handleBattleAction,
  beginTurn,
  endTurn,
  playCardFromHand
};

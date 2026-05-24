"use strict";

const C = require("./constants");
const U = require("./utils");

function addLog(state, message) {
  if (!state) return;

  const text = String(message || "");
  if (!text) return;

  state.status_message = text;

  if (!Array.isArray(state.battle_log_messages)) {
    state.battle_log_messages = [];
  }

  if (!Array.isArray(state.log)) {
    state.log = [];
  }

  state.battle_log_messages.push(text);
  state.log.push(text);

  if (state.battle_log_messages.length > 80) {
    state.battle_log_messages.splice(0, state.battle_log_messages.length - 80);
  }

  if (state.log.length > 80) {
    state.log.splice(0, state.log.length - 80);
  }
}

function normalizeCard(card) {
  if (!card) return card;

  card.card_id = String(card.card_id || card.id || "");
  card.card_name = String(card.card_name || card.name || card.card_id || "Unknown Card");
  card.card_type = String(card.card_type || "spell");
  card.effect_id = String(card.effect_id || "none");
  card.target_type = String(card.target_type || "none");

  card.cost = Number(card.cost || 0);
  card.power = Number(card.power || 0);
  card.attack = Number(card.attack || 0);
  card.hp = Number(card.hp ?? card.max_hp ?? card.base_hp ?? 0);
  card.max_hp = Number(card.max_hp ?? card.base_hp ?? card.hp ?? 0);
  card.base_attack = Number(card.base_attack ?? card.attack ?? 0);
  card.base_hp = Number(card.base_hp ?? card.max_hp ?? card.hp ?? 0);
  card.armor = Number(card.armor || 0);

  card.keywords = U.ensureArray(card.keywords);
  card.traits = U.ensureArray(card.traits);
  card.tags = U.ensureArray(card.tags);
  card.abilities = U.ensureArray(card.abilities);

  card.can_attack = !!card.can_attack;
  card.exhausted = !!card.exhausted;
  card.summoned_this_turn = !!card.summoned_this_turn;
  card.has_attacked_this_turn = !!card.has_attacked_this_turn;
  card.attacks_this_turn = Number(card.attacks_this_turn || 0);
  card.max_attacks_per_turn = Number(card.max_attacks_per_turn || 1);

  if (!card.once_per_turn_flags || typeof card.once_per_turn_flags !== "object") {
    card.once_per_turn_flags = {};
  }

  return card;
}

function normalizePlayer(player, fallbackOwnerId = "") {
  if (!player) return null;

  player.owner_id = String(player.owner_id || fallbackOwnerId || "");
  player.name = String(player.name || (player.owner_id === "player2" ? "Player2" : "Player1"));

  player.hp = Number(player.hp ?? C.STARTING_HP);
  player.max_hp = Number(player.max_hp ?? C.STARTING_HP);
  player.mana = Number(player.mana ?? C.STARTING_MANA);
  player.max_mana = Number(player.max_mana ?? C.STARTING_MANA);

  player.deck = U.ensureArray(player.deck);
  player.hand = U.ensureArray(player.hand);
  player.board = U.ensureArray(player.board);
  player.graveyard = U.ensureArray(player.graveyard);

  for (const card of player.deck) normalizeCard(card);
  for (const card of player.hand) normalizeCard(card);
  for (const card of player.board) normalizeCard(card);
  for (const card of player.graveyard) normalizeCard(card);

  player.last_spell_cast = player.last_spell_cast || null;
  player.scholar_cards_played_this_game = Number(player.scholar_cards_played_this_game || player.scholar_played_count || 0);
  player.inflation_counters = Number(player.inflation_counters || player.inflation_counter || 0);

  return player;
}

function normalizeState(state) {
  if (!state || typeof state !== "object") {
    state = {};
  }

  if (!state.player1 && state.players?.A) state.player1 = state.players.A;
  if (!state.player2 && state.players?.B) state.player2 = state.players.B;

  normalizePlayer(state.player1, "player1");
  normalizePlayer(state.player2, "player2");

  state.players = {
    A: state.player1,
    B: state.player2
  };

  state.seat_to_owner_id = state.seat_to_owner_id || { A: "player1", B: "player2" };
  state.owner_to_seat_id = state.owner_to_seat_id || { player1: "A", player2: "B" };

  state.turn_number = Number(state.turn_number || 1);
  state.current_player_id = String(state.current_player_id || "player1");
  state.turn_seat = String(state.turn_seat || state.owner_to_seat_id[state.current_player_id] || "A");

  state.game_over = !!state.game_over;
  state.status_message = String(state.status_message || "");

  state.turn_time_left = Number(state.turn_time_left ?? C.TURN_TIME_LIMIT_SECONDS);
  state.turn_timer_active = !!state.turn_timer_active;
  state.turn_timer_timeout_handled = !!state.turn_timer_timeout_handled;

  state.selecting_target = !!state.selecting_target;
  state.selecting_hand_card = !!state.selecting_hand_card;
  state.pending_action_type = String(state.pending_action_type || C.ACTION_NONE);
  state.pending_card = state.pending_card || null;
  state.pending_hand_index = Number(state.pending_hand_index ?? -1);
  state.pending_card_owner = String(state.pending_card_owner || "");
  state.pending_attacker_index = Number(state.pending_attacker_index ?? -1);
  state.selected_attacker_owner = String(state.selected_attacker_owner || "");
  state.selected_attacker_index = Number(state.selected_attacker_index ?? -1);
  state.pending_ability = state.pending_ability && typeof state.pending_ability === "object" ? state.pending_ability : {};

  state.selected = state.selected || null;
  state.pending_deaths = U.ensureArray(state.pending_deaths);
  state.pending_summons = U.ensureArray(state.pending_summons);
  state.battle_log_messages = U.ensureArray(state.battle_log_messages);
  state.log = U.ensureArray(state.log);

  return state;
}

function syncLegacy(state) {
  normalizeState(state);

  state.player1 = state.players.A;
  state.player2 = state.players.B;

  if (state.turn_seat === "A") {
    state.current_player_id = "player1";
  } else if (state.turn_seat === "B") {
    state.current_player_id = "player2";
  } else {
    state.turn_seat = state.owner_to_seat_id[state.current_player_id] || "A";
  }

  for (const message of state.log) {
    const text = String(message || "");
    if (text && !state.battle_log_messages.includes(text)) {
      state.battle_log_messages.push(text);
    }
  }

  for (const message of state.battle_log_messages) {
    const text = String(message || "");
    if (text && !state.log.includes(text)) {
      state.log.push(text);
    }
  }

  if (state.player1.hp <= 0 && state.player2.hp <= 0 && !state.game_over) {
    state.game_over = true;
    state.winner_seat = "";
    state.loser_seat = "";
    addLog(state, "Both leaders were defeated. Draw.");
  } else if (state.player1.hp <= 0 && !state.game_over) {
    state.game_over = true;
    state.winner_seat = "B";
    state.loser_seat = "A";
    addLog(state, "Player2 wins.");
  } else if (state.player2.hp <= 0 && !state.game_over) {
    state.game_over = true;
    state.winner_seat = "A";
    state.loser_seat = "B";
    addLog(state, "Player1 wins.");
  }

  if (state.winner_seat && !state.game_over) {
    state.game_over = true;
  }

  if (state.game_over) {
    state.turn_timer_active = false;
    state.turn_timer_timeout_handled = true;
  }

  return state;
}

function clearSelection(state) {
  state.selecting_target = false;
  state.selecting_hand_card = false;
  state.pending_action_type = C.ACTION_NONE;
  state.pending_card = null;
  state.pending_hand_index = -1;
  state.pending_card_owner = "";
  state.pending_attacker_index = -1;
  state.selected_attacker_owner = "";
  state.selected_attacker_index = -1;
  state.pending_ability = {};
  state.selected = null;
}

function beginTurnBasics(state, seatId) {
  normalizeState(state);

  const player = U.getPlayer(state, seatId);
  if (!player || state.game_over) return false;

  state.turn_seat = seatId;
  state.current_player_id = U.seatToOwnerId(seatId);
  clearSelection(state);

  player.max_mana = Math.min(Number(player.max_mana || 0) + C.MANA_GAIN_PER_TURN, C.MAX_MANA);
  player.mana = player.max_mana;

  for (const unit of player.board) {
    normalizeCard(unit);
    unit.summoned_this_turn = false;
    unit.can_attack = true;
    unit.exhausted = false;
    unit.has_attacked_this_turn = false;
    unit.attacks_this_turn = 0;
    unit.once_per_turn_flags = {};

    if (U.hasKeyword(unit, C.KEYWORD_IMMOBILE)) {
      unit.can_attack = false;
      unit.exhausted = true;
    }
  }

  state.turn_time_left = C.TURN_TIME_LIMIT_SECONDS;
  state.turn_timer_active = true;
  state.turn_timer_timeout_handled = false;

  return true;
}

function markGameOver(state, winnerSeat, loserSeat, reason) {
  state.game_over = true;
  state.winner_seat = winnerSeat || "";
  state.loser_seat = loserSeat || "";
  state.turn_timer_active = false;
  state.turn_timer_timeout_handled = true;

  if (loserSeat) {
    const loser = U.getPlayer(state, loserSeat);
    if (loser) loser.hp = Math.min(0, Number(loser.hp || 0));
  }

  addLog(state, reason || "Game over.");
}

module.exports = {
  addLog,
  normalizeCard,
  normalizePlayer,
  normalizeState,
  syncLegacy,
  clearSelection,
  beginTurnBasics,
  markGameOver
};

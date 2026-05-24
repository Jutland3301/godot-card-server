"use strict";

const C = require("./constants");
const U = require("./utils");
const S = require("./state");
const CardOps = require("./card_ops");
const Combat = require("./combat");
const Effects = require("./effects");
const Targets = require("./targets");
const Triggers = require("./triggers");

function ensureState(state) {
  S.normalizeState(state);
  S.syncLegacy(state);
  return state;
}

function addLog(state, message) {
  S.addLog(state, message);
}

function getOpponentSeat(seatId) {
  return U.otherSeat(seatId);
}

function getOwnerIdForSeat(seatId) {
  return U.seatToOwnerId(seatId);
}

function clearPendingState(state) {
  S.clearSelection(state);

  state.selecting_hand_card = false;
  state.pending_hand_selection_effect = "";
  state.pending_hand_selection_owner = "";
  state.pending_hand_candidate_indexes = [];

  if (!Array.isArray(state.pending_deaths)) {
    state.pending_deaths = [];
  }

  if (!Array.isArray(state.pending_summons)) {
    state.pending_summons = [];
  }
}

function validateTurnAction(state, seatId) {
  if (state.game_over) {
    return { ok: false, message: "Game is already over." };
  }

  if (state.turn_seat !== seatId) {
    return { ok: false, message: "Not your turn." };
  }

  return { ok: true, message: "ok" };
}

function getPayloadHandIndex(payload) {
  const raw =
    payload.hand_index ??
    payload.handIndex ??
    payload.index ??
    payload.card_index ??
    payload.cardIndex ??
    -1;

  return Number(raw);
}

function getPayloadBoardIndex(payload) {
  const raw =
    payload.board_index ??
    payload.boardIndex ??
    payload.target_index ??
    payload.targetIndex ??
    payload.unit_index ??
    payload.unitIndex ??
    payload.index ??
    -1;

  return Number(raw);
}

function getPayloadOwnerSeat(state, payload, fallbackSeat = "") {
  const raw =
    payload.owner_seat ??
    payload.ownerSeat ??
    payload.owner_id ??
    payload.ownerId ??
    payload.owner ??
    payload.target_owner ??
    payload.targetOwner ??
    payload.player_id ??
    payload.playerId ??
    fallbackSeat;

  return U.normalizeOwnerToSeat(state, raw);
}

function getFirstPlayableAbility(card) {
  const abilities = U.getAbilities(card);

  if (!Array.isArray(abilities) || abilities.length <= 0) {
    return {};
  }

  const battlecry = abilities.find(ability => {
    return String(ability.trigger || ability.trigger_id || "") === C.TRIGGER_BATTLECRY;
  });

  if (battlecry) return battlecry;

  const noTrigger = abilities.find(ability => {
    return !ability.trigger && !ability.trigger_id;
  });

  return noTrigger || abilities[0] || {};
}

function getSelectedAttackerSeat(state) {
  if (!state.selected_attacker_owner) {
    return "";
  }

  return U.normalizeOwnerToSeat(state, state.selected_attacker_owner);
}

function getPendingCardSeat(state) {
  if (!state.pending_card_owner) {
    return "";
  }

  return U.normalizeOwnerToSeat(state, state.pending_card_owner);
}

function setPendingCardTarget(state, seatId, handIndex, card) {
  state.selecting_target = true;
  state.selecting_hand_card = false;
  state.pending_action_type = U.isSpell(card) ? C.ACTION_SPELL : C.ACTION_ABILITY;
  state.pending_card = U.copyCardData(card);
  state.pending_hand_index = Number(handIndex);
  state.pending_card_owner = getOwnerIdForSeat(seatId);
  state.pending_attacker_index = -1;
  state.selected_attacker_owner = "";
  state.selected_attacker_index = -1;
  state.pending_ability = getFirstPlayableAbility(card) || {};
  state.selected = null;

  addLog(state, `Select target for ${U.cardName(card)}.`);
}

function setSelectedAttacker(state, seatId, boardIndex, attacker) {
  state.selecting_target = true;
  state.selecting_hand_card = false;
  state.pending_action_type = C.ACTION_UNIT_ATTACK;
  state.pending_card = null;
  state.pending_hand_index = -1;
  state.pending_card_owner = "";
  state.pending_attacker_index = Number(boardIndex);
  state.selected_attacker_owner = getOwnerIdForSeat(seatId);
  state.selected_attacker_index = Number(boardIndex);
  state.pending_ability = {};
  state.selected = {
    type: "unit",
    owner_seat: seatId,
    board_index: Number(boardIndex)
  };

  addLog(state, `Selected attacker: ${U.cardName(attacker)}.`);
}

function cancelTargetSelection(state, seatId) {
  ensureState(state);

  if (!state.selecting_target && !state.selecting_hand_card) {
    return { ok: true, state };
  }

  const pendingSeat = getPendingCardSeat(state);

  if (pendingSeat && pendingSeat !== seatId) {
    return { ok: false, state, message: "This pending action belongs to another player." };
  }

  if (state.pending_action_type === C.ACTION_SPELL && state.pending_card) {
    const player = U.getPlayer(state, seatId);
    if (player) {
      CardOps.returnCardToHand(player, state.pending_card);
      addLog(state, `Target selection cancelled. ${U.cardName(state.pending_card)} returned to hand.`);
    }
  } else if (state.pending_action_type === C.ACTION_UNIT_ATTACK) {
    addLog(state, "Attack target selection cancelled.");
  } else if (state.pending_action_type === C.ACTION_ABILITY) {
    addLog(state, "Ability target selection cancelled.");
  } else if (state.pending_action_type === C.ACTION_HAND_SELECTION) {
    addLog(state, "Hand selection cancelled.");
  } else {
    addLog(state, "Selection cancelled.");
  }

  clearPendingState(state);
  S.syncLegacy(state);

  return { ok: true, state };
}

function validateCanPlayCard(state, seatId, player, card) {
  const turn = validateTurnAction(state, seatId);
  if (!turn.ok) {
    return { ok: false, message: turn.message };
  }

  if (!player) {
    return { ok: false, message: "Player is missing." };
  }

  if (!card) {
    return { ok: false, message: "Card is missing." };
  }

  if (state.selecting_target || state.selecting_hand_card) {
    return { ok: false, message: "Already selecting a target." };
  }

  const cost = CardOps.getCardPlayCost(player, card);
  if (Number(player.mana || 0) < cost) {
    return { ok: false, message: "Not enough mana." };
  }

  if (U.isUnit(card) && Array.isArray(player.board) && player.board.length >= C.MAX_BOARD_SIZE) {
    return { ok: false, message: "Board is full." };
  }

  if (U.isSpell(card)) {
    if (!Targets.hasValidPlayTargetForCard(state, seatId, card)) {
      return { ok: false, message: "No valid target for this card." };
    }
  }

  return { ok: true, message: "ok" };
}

function consumeCardFromHandAndPayCost(state, seatId, handIndex) {
  const player = U.getPlayer(state, seatId);
  if (!player) return null;

  const index = Number(handIndex);
  if (index < 0 || index >= player.hand.length) return null;

  const card = player.hand[index];
  S.normalizeCard(card);

  const cost = CardOps.getCardPlayCost(player, card);
  if (!CardOps.spendMana(player, cost)) {
    return null;
  }

  const playedCard = CardOps.removeCardFromHand(player, index);
  if (!playedCard) {
    player.mana = Number(player.mana || 0) + cost;
    return null;
  }

  CardOps.applyPlayCostPostEffects(player, playedCard);
  S.normalizeCard(playedCard);

  return playedCard;
}

function playCardFromHand(state, seatId, handIndex, target = null, deps = {}) {
  ensureState(state);

  const player = U.getPlayer(state, seatId);
  const index = Number(handIndex);
  const card = player?.hand?.[index] || null;

  const playCheck = validateCanPlayCard(state, seatId, player, card);
  if (!playCheck.ok) {
    return { ok: false, state, message: playCheck.message };
  }

  const needsTarget =
    String(card.target_type || C.TARGET_NONE) !== C.TARGET_NONE &&
    String(card.target_type || "") !== "";

  if (needsTarget) {
    const targetCheck = Targets.isValidTargetForCard(state, seatId, card, target);
    if (!targetCheck.ok) {
      return { ok: false, state, message: targetCheck.message };
    }
  }

  const playedCard = consumeCardFromHandAndPayCost(state, seatId, index);
  if (!playedCard) {
    return { ok: false, state, message: "Failed to play card." };
  }

  clearPendingState(state);

  if (U.isUnit(playedCard)) {
    return playUnitCard(state, seatId, playedCard, target, deps);
  }

  if (U.isSpell(playedCard)) {
    return playSpellCard(state, seatId, playedCard, target, deps);
  }

  CardOps.moveCardToGraveyard(player, playedCard);
  addLog(state, `${player.name} played ${U.cardName(playedCard)}.`);
  S.syncLegacy(state);

  return { ok: true, state };
}

function playUnitCard(state, seatId, playedCard, target = null, deps = {}) {
  const player = U.getPlayer(state, seatId);
  if (!player) {
    return { ok: false, state, message: "Player is missing." };
  }

  Combat.applySummonState(playedCard, player);

  player.board.push(playedCard);

  CardOps.incrementPlayedTraitCounts(player, playedCard);

  const battlecryAbilities = U.getAbilities(playedCard, C.TRIGGER_BATTLECRY);

  if (battlecryAbilities.length > 0) {
    Triggers.resolveBattlecry(state, seatId, playedCard, {
      played_seat: seatId,
      played_card: playedCard,
      target
    }, deps);
  }

  Triggers.resolveOnUnitPlayed(state, seatId, playedCard, deps);

  Combat.processDeathQueue(state, deps);
  addLog(state, `${player.name} played ${U.cardName(playedCard)}.`);
  S.syncLegacy(state);

  return { ok: true, state };
}

function playSpellCard(state, seatId, playedCard, target = null, deps = {}) {
  const player = U.getPlayer(state, seatId);
  if (!player) {
    return { ok: false, state, message: "Player is missing." };
  }

  const ability = getFirstPlayableAbility(playedCard);

  if (String(playedCard.effect_id || "") !== C.EFFECT_ADD_ZERO_COST_COPIES_OF_LAST_SPELL) {
    CardOps.setLastSpell(player, playedCard);
  }

  const result = Effects.resolveSpellOrCardEffect(
    state,
    seatId,
    playedCard,
    target,
    ability,
    deps
  );

  if (result && result.pending) {
    /*
      手札選択系はカードを消費済みのままpendingにする。
      選択完了時にEffects側で墓地へ送る。
    */
    S.syncLegacy(state);
    return { ok: true, state };
  }

  Triggers.resolveOnSpellPlayed(state, seatId, playedCard, deps);

  CardOps.moveCardToGraveyard(player, playedCard);

  Combat.processDeathQueue(state, deps);
  addLog(state, `${player.name} cast ${U.cardName(playedCard)}.`);
  S.syncLegacy(state);

  return { ok: true, state };
}

function resolvePendingCardTarget(state, seatId, target, deps = {}) {
  ensureState(state);

  const pendingSeat = getPendingCardSeat(state);

  if (!pendingSeat) {
    return { ok: false, state, message: "No pending card owner." };
  }

  if (pendingSeat !== seatId) {
    return { ok: false, state, message: "This pending action belongs to another player." };
  }

  const turn = validateTurnAction(state, seatId);
  if (!turn.ok) {
    return { ok: false, state, message: turn.message };
  }

  if (state.pending_action_type === C.ACTION_ABILITY) {
    return Triggers.resolvePendingAbilityTarget(state, seatId, target, deps);
  }

  const handIndex = Number(state.pending_hand_index ?? -1);
  const player = U.getPlayer(state, seatId);

  if (!player || handIndex < 0 || handIndex >= player.hand.length) {
    clearPendingState(state);
    return { ok: false, state, message: "Pending hand card is missing." };
  }

  const card = player.hand[handIndex];
  const targetCheck = Targets.isValidTargetForCard(state, seatId, card, target);

  if (!targetCheck.ok) {
    return { ok: false, state, message: targetCheck.message };
  }

  return playCardFromHand(state, seatId, handIndex, target, deps);
}

function handleHandCardClicked(state, seatId, payload, deps = {}) {
  ensureState(state);

  const turn = validateTurnAction(state, seatId);
  if (!turn.ok) {
    return { ok: false, state, message: turn.message };
  }

  if (state.selecting_hand_card) {
    const handIndex = getPayloadHandIndex(payload);
    return Effects.resolveHandSelection(state, seatId, handIndex, deps);
  }

  if (state.selecting_target) {
    return { ok: false, state, message: "Target selection is active." };
  }

  const player = U.getPlayer(state, seatId);
  if (!player) {
    return { ok: false, state, message: "Player is missing." };
  }

  const handIndex = getPayloadHandIndex(payload);
  if (handIndex < 0 || handIndex >= player.hand.length) {
    return { ok: false, state, message: "Invalid hand index." };
  }

  const card = player.hand[handIndex];
  S.normalizeCard(card);

  const playCheck = validateCanPlayCard(state, seatId, player, card);
  if (!playCheck.ok) {
    return { ok: false, state, message: playCheck.message };
  }

  const needsTarget =
    String(card.target_type || C.TARGET_NONE) !== C.TARGET_NONE &&
    String(card.target_type || "") !== "";

  if (needsTarget) {
    setPendingCardTarget(state, seatId, handIndex, card);
    S.syncLegacy(state);
    return { ok: true, state };
  }

  return playCardFromHand(state, seatId, handIndex, null, deps);
}

function handleBoardSlotClicked(state, seatId, payload, deps = {}) {
  ensureState(state);

  const clickedSeat = getPayloadOwnerSeat(state, payload, seatId);
  const boardIndex = getPayloadBoardIndex(payload);

  if (!clickedSeat || boardIndex < 0) {
    return { ok: false, state, message: "Invalid board click payload." };
  }

  const clickedPlayer = U.getPlayer(state, clickedSeat);
  if (!clickedPlayer || boardIndex >= clickedPlayer.board.length) {
    return { ok: false, state, message: "Clicked unit is missing." };
  }

  const clickedUnit = clickedPlayer.board[boardIndex];

  if (state.selecting_hand_card) {
    return { ok: false, state, message: "Hand selection is active." };
  }

  if (state.selecting_target && state.pending_action_type !== C.ACTION_UNIT_ATTACK) {
    const target = {
      type: "unit",
      owner_seat: clickedSeat,
      board_index: boardIndex
    };

    if (state.pending_action_type === C.ACTION_SPELL) {
      if (!Targets.isValidTargetForPendingSpell(state, seatId, clickedSeat, "unit")) {
        return { ok: false, state, message: "Invalid spell target." };
      }
    }

    if (state.pending_action_type === C.ACTION_ABILITY) {
      if (!Targets.isValidTargetForPendingAbility(state, seatId, clickedSeat, "unit")) {
        return { ok: false, state, message: "Invalid ability target." };
      }
    }

    return resolvePendingCardTarget(state, seatId, target, deps);
  }

  if (state.pending_action_type === C.ACTION_UNIT_ATTACK || Number(state.selected_attacker_index ?? -1) >= 0) {
    const attackerSeat = getSelectedAttackerSeat(state);
    const attackerIndex = Number(state.selected_attacker_index ?? state.pending_attacker_index ?? -1);

    if (!attackerSeat || attackerIndex < 0) {
      clearPendingState(state);
      return { ok: false, state, message: "Selected attacker is missing." };
    }

    if (attackerSeat !== seatId) {
      return { ok: false, state, message: "Selected attacker belongs to another player." };
    }

    if (clickedSeat === attackerSeat) {
      const player = U.getPlayer(state, attackerSeat);
      const attacker = player?.board?.[boardIndex] || null;
      const can = Combat.canAttack(state, attackerSeat, attacker, "unit");

      if (!attacker || !can.ok) {
        return { ok: false, state, message: can.message || "This unit cannot attack." };
      }

      setSelectedAttacker(state, attackerSeat, boardIndex, attacker);
      S.syncLegacy(state);
      return { ok: true, state };
    }

    return Combat.attackUnit(
      state,
      attackerSeat,
      attackerIndex,
      clickedSeat,
      boardIndex,
      deps
    );
  }

  if (clickedSeat === seatId) {
    const turn = validateTurnAction(state, seatId);
    if (!turn.ok) {
      return { ok: false, state, message: turn.message };
    }

    const can = Combat.canAttack(state, seatId, clickedUnit, "unit");
    const canFace = Combat.canAttack(state, seatId, clickedUnit, "player");

    if (!can.ok && !canFace.ok) {
      return { ok: false, state, message: can.message || canFace.message || "This unit cannot attack." };
    }

    setSelectedAttacker(state, seatId, boardIndex, clickedUnit);
    S.syncLegacy(state);

    return { ok: true, state };
  }

  return { ok: false, state, message: "Select an attacker first." };
}

function handlePlayerFaceClicked(state, seatId, payload, deps = {}) {
  ensureState(state);

  const clickedSeat = getPayloadOwnerSeat(state, payload, seatId);
  if (!clickedSeat) {
    return { ok: false, state, message: "Invalid player target." };
  }

  if (state.selecting_hand_card) {
    return { ok: false, state, message: "Hand selection is active." };
  }

  if (state.selecting_target && state.pending_action_type !== C.ACTION_UNIT_ATTACK) {
    const target = {
      type: "player",
      owner_seat: clickedSeat
    };

    if (state.pending_action_type === C.ACTION_SPELL) {
      if (!Targets.isValidTargetForPendingSpell(state, seatId, clickedSeat, "player")) {
        return { ok: false, state, message: "Invalid spell target." };
      }
    }

    if (state.pending_action_type === C.ACTION_ABILITY) {
      if (!Targets.isValidTargetForPendingAbility(state, seatId, clickedSeat, "player")) {
        return { ok: false, state, message: "Invalid ability target." };
      }
    }

    return resolvePendingCardTarget(state, seatId, target, deps);
  }

  if (state.pending_action_type === C.ACTION_UNIT_ATTACK || Number(state.selected_attacker_index ?? -1) >= 0) {
    const attackerSeat = getSelectedAttackerSeat(state);
    const attackerIndex = Number(state.selected_attacker_index ?? state.pending_attacker_index ?? -1);

    if (!attackerSeat || attackerIndex < 0) {
      clearPendingState(state);
      return { ok: false, state, message: "Selected attacker is missing." };
    }

    if (attackerSeat !== seatId) {
      return { ok: false, state, message: "Selected attacker belongs to another player." };
    }

    if (clickedSeat === attackerSeat) {
      return { ok: false, state, message: "Cannot attack own leader." };
    }

    return Combat.attackFace(
      state,
      attackerSeat,
      attackerIndex,
      clickedSeat,
      deps
    );
  }

  return { ok: false, state, message: "Select an attacker or pending card first." };
}

function handleSelectHandCard(state, seatId, payload, deps = {}) {
  ensureState(state);

  if (!state.selecting_hand_card) {
    return { ok: false, state, message: "No hand selection is active." };
  }

  const turn = validateTurnAction(state, seatId);
  if (!turn.ok) {
    return { ok: false, state, message: turn.message };
  }

  const handIndex = getPayloadHandIndex(payload);
  return Effects.resolveHandSelection(state, seatId, handIndex, deps);
}

function beginTurn(state, seatId, deps = {}) {
  ensureState(state);

  const activeSeat = seatId || state.turn_seat || C.SEAT_A;
  const player = U.getPlayer(state, activeSeat);

  if (!player) {
    return { ok: false, state, message: "Invalid active seat." };
  }

  if (state.game_over) {
    return { ok: false, state, message: "Game is already over." };
  }

  clearPendingState(state);

  S.beginTurnBasics(state, activeSeat);

  const drawn = CardOps.drawOne(state, activeSeat);

  if (!drawn) {
    S.syncLegacy(state);
    if (state.game_over) {
      return { ok: true, state };
    }
  }

  Triggers.resolveTurnStart(state, activeSeat, deps);

  addLog(state, `Turn ${Number(state.turn_number || 1)}: ${player.name}'s turn started.`);

  Combat.processDeathQueue(state, deps);
  S.syncLegacy(state);

  return { ok: true, state };
}

function endTurn(state, seatId, deps = {}) {
  ensureState(state);

  const activeSeat = seatId || state.turn_seat || C.SEAT_A;
  const player = U.getPlayer(state, activeSeat);

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

  Triggers.resolveTurnEnd(state, activeSeat, deps);

  Combat.processDeathQueue(state, deps);
  addLog(state, `${player.name}'s turn ended.`);

  clearPendingState(state);

  const nextSeat = getOpponentSeat(activeSeat);
  state.turn_seat = nextSeat;
  state.current_player_id = getOwnerIdForSeat(nextSeat);
  state.turn_number = Number(state.turn_number || 1) + 1;

  S.syncLegacy(state);

  if (!state.game_over) {
    return beginTurn(state, nextSeat, deps);
  }

  return { ok: true, state };
}

function surrender(state, seatId) {
  ensureState(state);

  const loser = U.getPlayer(state, seatId);
  const winnerSeat = getOpponentSeat(seatId);
  const winner = U.getPlayer(state, winnerSeat);

  if (!loser || !winner) {
    return { ok: false, state, message: "Invalid surrender seat." };
  }

  loser.hp = 0;
  S.markGameOver(state, winnerSeat, seatId, `${loser.name} surrendered. ${winner.name} wins.`);

  clearPendingState(state);
  S.syncLegacy(state);

  return { ok: true, state };
}

function handleBattleAction(match, seatId, payload, deps = {}) {
  if (!match || typeof match !== "object") {
    return { ok: false, message: "Match is missing." };
  }

  const state = ensureState(match.state || {});
  match.state = state;

  const action = String(payload && payload.action ? payload.action : "");

  if (!seatId || (seatId !== C.SEAT_A && seatId !== C.SEAT_B)) {
    return { ok: false, state, message: "Invalid seat." };
  }

  switch (action) {
    case "end_turn":
      return endTurn(state, seatId, deps);

    case "surrender":
      return surrender(state, seatId);

    case "hand_card_clicked":
      return handleHandCardClicked(state, seatId, payload || {}, deps);

    case "board_slot_clicked":
      return handleBoardSlotClicked(state, seatId, payload || {}, deps);

    case "player_face_clicked":
      return handlePlayerFaceClicked(state, seatId, payload || {}, deps);

    case "select_hand_card":
    case "hand_selection_clicked":
      return handleSelectHandCard(state, seatId, payload || {}, deps);

    case "cancel_target_selection":
    case "cancel_hand_selection":
    case "cancel_selection":
      return cancelTargetSelection(state, seatId);

    default:
      return {
        ok: false,
        state,
        message: "Unknown battle action: " + action
      };
  }
}

module.exports = {
  handleBattleAction,

  beginTurn,
  endTurn,
  surrender,

  playCardFromHand,
  playUnitCard,
  playSpellCard,

  handleHandCardClicked,
  handleBoardSlotClicked,
  handlePlayerFaceClicked,
  handleSelectHandCard,

  cancelTargetSelection
};

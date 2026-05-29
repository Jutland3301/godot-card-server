"use strict";

const C = require("./constants");
const U = require("./utils");
const S = require("./state");
const CardOps = require("./card_ops");
const Combat = require("./combat");
const Effects = require("./effects");
const Targets = require("./targets");
const Triggers = require("./triggers");
const Cards = require("../cards_database");

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
  state.pending_card_selection_zone = "hand";
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

function isManaTraceEnabled(deps = {}) {
  return Boolean(deps && deps.manaTrace);
}

function getManaTraceBase(deps = {}) {
  const trace = deps && deps.manaTrace ? deps.manaTrace : {};
  return {
    action_type: String(trace.action_type || trace.action || ""),
    client_id: String(trace.client_id || ""),
    match_id: String(trace.match_id || ""),
    seat_id: String(trace.seat_id || "")
  };
}

function getPlayerTrace(state, seatId, player) {
  return {
    current_player: String(state.current_player_id || state.turn_owner_id || state.turn_seat || ""),
    current_turn_player: String(state.turn_seat || ""),
    player_side: String(player && player.side ? player.side : ""),
    player_index: seatId === C.SEAT_A ? 1 : seatId === C.SEAT_B ? 2 : -1
  };
}

function getCardTrace(card) {
  if (!card || typeof card !== "object") {
    return {
      card_id: "",
      card_name: "",
      cost: null,
      effective_cost: null
    };
  }

  return {
    card_id: String(card.card_id || card.cardId || card.id || ""),
    card_name: String(card.card_name || card.cardName || card.name || ""),
    cost: Number(card.cost || 0),
    effective_cost: null
  };
}

function getCardId(card) {
  return String(card?.card_id || card?.cardId || card?.id || "").trim();
}

function rejectUnknownHandCard(state, seatId, player, handIndex, card, deps = {}, label = "unknown_card") {
  const cardId = getCardId(card);
  const reason = "Unknown card_id: " + cardId;

  manaTrace(deps, label, {
    ...getPlayerTrace(state, seatId, player),
    hand_index: Number(handIndex),
    raw_card: getCardTrace(card),
    player_mana: player ? Number(player.mana || 0) : null,
    validate_ok: false,
    reject_reason: reason,
    board_added: false,
    hand_removed: false,
    mana_consumed: false
  });

  addLog(state, reason);
  S.syncLegacy(state);

  return { ok: false, state, message: reason };
}

function isKnownHandCard(card) {
  const cardId = getCardId(card);
  if (cardId === "") {
    return false;
  }

  return Cards.hasCardDefinition(cardId);
}

function manaTrace(deps, label, data = {}) {
  if (!isManaTraceEnabled(deps)) return;
  console.log("[MANA_TRACE]", label, JSON.stringify({
    ...getManaTraceBase(deps),
    ...data
  }));
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
    addLog(state, `Target selection cancelled. ${U.cardName(state.pending_card)} remains in hand.`);
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

function validateCanPlayCard(state, seatId, player, card, options = {}) {
  const traceDeps = options.traceDeps || {};
  const allowDuringSelection = Boolean(options.allowDuringSelection || false);

  const turn = validateTurnAction(state, seatId);
  if (!turn.ok) {
    manaTrace(traceDeps, "validateCanPlayCard", {
      ...getPlayerTrace(state, seatId, player),
      hand_index: Number(options.handIndex ?? -1),
      player_mana: player ? Number(player.mana || 0) : null,
      effective_cost: player && card ? CardOps.getCardPlayCost(player, card) : null,
      validate_ok: false,
      reject_reason: turn.message
    });
    return { ok: false, message: turn.message };
  }

  if (!player) {
    manaTrace(traceDeps, "validateCanPlayCard", {
      ...getPlayerTrace(state, seatId, player),
      hand_index: Number(options.handIndex ?? -1),
      validate_ok: false,
      reject_reason: "Player is missing."
    });
    return { ok: false, message: "Player is missing." };
  }

  if (!card) {
    manaTrace(traceDeps, "validateCanPlayCard", {
      ...getPlayerTrace(state, seatId, player),
      hand_index: Number(options.handIndex ?? -1),
      player_mana: Number(player.mana || 0),
      validate_ok: false,
      reject_reason: "Card is missing."
    });
    return { ok: false, message: "Card is missing." };
  }

  if (!allowDuringSelection && (state.selecting_target || state.selecting_hand_card)) {
    manaTrace(traceDeps, "validateCanPlayCard", {
      ...getPlayerTrace(state, seatId, player),
      hand_index: Number(options.handIndex ?? -1),
      player_mana: Number(player.mana || 0),
      effective_cost: CardOps.getCardPlayCost(player, card),
      validate_ok: false,
      reject_reason: "Already selecting a target."
    });
    return { ok: false, message: "Already selecting a target." };
  }

  const cost = CardOps.getCardPlayCost(player, card);
  if (Number(player.mana || 0) < cost) {
    manaTrace(traceDeps, "validateCanPlayCard", {
      ...getPlayerTrace(state, seatId, player),
      hand_index: Number(options.handIndex ?? -1),
      card: {
        ...getCardTrace(card),
        effective_cost: cost
      },
      player_mana: Number(player.mana || 0),
      effective_cost: cost,
      validate_ok: false,
      reject_reason: "Not enough mana."
    });
    return { ok: false, message: "Not enough mana." };
  }

  if (U.isUnit(card) && Array.isArray(player.board) && player.board.length >= C.MAX_BOARD_SIZE) {
    if (String(card.card_id || "") !== "nimbus_outpost") {
      manaTrace(traceDeps, "validateCanPlayCard", {
        ...getPlayerTrace(state, seatId, player),
        hand_index: Number(options.handIndex ?? -1),
        card: {
          ...getCardTrace(card),
          effective_cost: cost
        },
        player_mana: Number(player.mana || 0),
        effective_cost: cost,
        validate_ok: false,
        reject_reason: "Board is full."
      });
      return { ok: false, message: "Board is full." };
    }
  }
  if (U.isSpell(card)) {
    if (!Targets.hasValidPlayTargetForCard(state, seatId, card)) {
      manaTrace(traceDeps, "validateCanPlayCard", {
        ...getPlayerTrace(state, seatId, player),
        hand_index: Number(options.handIndex ?? -1),
        card: {
          ...getCardTrace(card),
          effective_cost: cost
        },
        player_mana: Number(player.mana || 0),
        effective_cost: cost,
        validate_ok: false,
        reject_reason: "No valid target for this card."
      });
      return { ok: false, message: "No valid target for this card." };
    }
  }

  manaTrace(traceDeps, "validateCanPlayCard", {
    ...getPlayerTrace(state, seatId, player),
    hand_index: Number(options.handIndex ?? -1),
    card: {
      ...getCardTrace(card),
      effective_cost: cost
    },
    player_mana: Number(player.mana || 0),
    effective_cost: cost,
    validate_ok: true,
    reject_reason: ""
  });

  return { ok: true, message: "ok" };
}

function consumeCardFromHandAndPayCost(state, seatId, handIndex, deps = {}) {
  const player = U.getPlayer(state, seatId);
  manaTrace(deps, "consumeCardFromHandAndPayCost.enter", {
    ...getPlayerTrace(state, seatId, player),
    hand_index: Number(handIndex),
    entered_consume: true
  });
  if (!player) {
    manaTrace(deps, "consumeCardFromHandAndPayCost.exit", {
      ...getPlayerTrace(state, seatId, player),
      hand_index: Number(handIndex),
      consumed: false,
      reject_reason: "Player is missing."
    });
    return null;
  }

  const index = Number(handIndex);
  if (index < 0 || index >= player.hand.length) {
    manaTrace(deps, "consumeCardFromHandAndPayCost.exit", {
      ...getPlayerTrace(state, seatId, player),
      hand_index: index,
      player_mana: Number(player.mana || 0),
      consumed: false,
      reject_reason: "Invalid hand index."
    });
    return null;
  }

  const card = player.hand[index];
  S.normalizeCard(card);
  if (!isKnownHandCard(card)) {
  manaTrace(deps, "consumeCardFromHandAndPayCost.unknown_card", {
    ...getPlayerTrace(state, seatId, player),
    hand_index: index,
    raw_card: getCardTrace(card),
    player_mana: Number(player.mana || 0),
    consumed: false,
    reject_reason: "Unknown card_id: " + getCardId(card),
    board_added: false,
    hand_removed: false,
    mana_consumed: false
  });

  return null;
}

  const cost = CardOps.getCardPlayCost(player, card);
  const manaBefore = Number(player.mana || 0);
  manaTrace(deps, "consumeCardFromHandAndPayCost.before_spend", {
    ...getPlayerTrace(state, seatId, player),
    hand_index: index,
    raw_card: getCardTrace(card),
    hydrated_card: {
      ...getCardTrace(card),
      effective_cost: cost
    },
    player_mana: manaBefore,
    mana_before: manaBefore,
    effective_cost: cost
  });
  if (!CardOps.spendMana(player, cost)) {
    manaTrace(deps, "consumeCardFromHandAndPayCost.spend_failed", {
      ...getPlayerTrace(state, seatId, player),
      hand_index: index,
      player_mana: Number(player.mana || 0),
      mana_before: manaBefore,
      mana_after: Number(player.mana || 0),
      effective_cost: cost,
      consumed: false,
      reject_reason: "spendMana returned false"
    });
    return null;
  }

  const manaAfterSpend = Number(player.mana || 0);
  const playedCard = CardOps.removeCardFromHand(player, index);
  if (!playedCard) {
    player.mana = Number(player.mana || 0) + cost;
    manaTrace(deps, "consumeCardFromHandAndPayCost.remove_failed", {
      ...getPlayerTrace(state, seatId, player),
      hand_index: index,
      player_mana: Number(player.mana || 0),
      mana_before: manaBefore,
      mana_after: Number(player.mana || 0),
      mana_after_spend: manaAfterSpend,
      effective_cost: cost,
      consumed: false,
      reject_reason: "removeCardFromHand returned null"
    });
    return null;
  }

  CardOps.applyPlayCostPostEffects(player, playedCard);
  S.normalizeCard(playedCard);

  manaTrace(deps, "consumeCardFromHandAndPayCost.exit", {
    ...getPlayerTrace(state, seatId, player),
    hand_index: index,
    played_card: {
      ...getCardTrace(playedCard),
      effective_cost: cost
    },
    player_mana: Number(player.mana || 0),
    mana_before: manaBefore,
    mana_after: Number(player.mana || 0),
    effective_cost: cost,
    consumed: true
  });

  return playedCard;
}

function playCardFromHand(state, seatId, handIndex, target = null, deps = {}, options = {}) {
  ensureState(state);

  const allowDuringSelection = Boolean(options.allowDuringSelection || false);

  const player = U.getPlayer(state, seatId);
  const index = Number(handIndex);
  const card = player?.hand?.[index] || null;

  if (card && !isKnownHandCard(card)) {
  return rejectUnknownHandCard(
    state,
    seatId,
    player,
    index,
    card,
    deps,
    "playCardFromHand.unknown_card"
  );
}

  manaTrace(deps, "playCardFromHand.enter", {
    ...getPlayerTrace(state, seatId, player),
    hand_index: index,
    raw_card: getCardTrace(card),
    hydrated_card: card ? {
      ...getCardTrace(card),
      effective_cost: player ? CardOps.getCardPlayCost(player, card) : null
    } : getCardTrace(card),
    player_mana: player ? Number(player.mana || 0) : null,
    effective_cost: player && card ? CardOps.getCardPlayCost(player, card) : null,
    board_count_before: player && Array.isArray(player.board) ? player.board.length : null
  });

  const playCheck = validateCanPlayCard(state, seatId, player, card, {
    allowDuringSelection,
    handIndex: index,
    traceDeps: deps
  });

  if (!playCheck.ok) {
    manaTrace(deps, "playCardFromHand.rejected", {
      ...getPlayerTrace(state, seatId, player),
      hand_index: index,
      player_mana: player ? Number(player.mana || 0) : null,
      effective_cost: player && card ? CardOps.getCardPlayCost(player, card) : null,
      validate_ok: false,
      reject_reason: playCheck.message,
      board_added: false
    });
    return { ok: false, state, message: playCheck.message };
  }

  const targetType = String(card.target_type || C.TARGET_NONE).toLowerCase();
  const needsTarget =
    targetType !== String(C.TARGET_NONE).toLowerCase() &&
    targetType !== "";

  if (needsTarget) {
    const targetCheck = Targets.isValidTargetForCard(state, seatId, card, target);
    if (!targetCheck.ok) {
      return { ok: false, state, message: targetCheck.message };
    }
  }

  const playedCard = consumeCardFromHandAndPayCost(state, seatId, index, deps);
  if (!playedCard) {
    manaTrace(deps, "playCardFromHand.consume_failed", {
      ...getPlayerTrace(state, seatId, player),
      hand_index: index,
      player_mana: player ? Number(player.mana || 0) : null,
      reject_reason: "Failed to play card.",
      board_added: false
    });
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
  manaTrace(deps, "playCardFromHand.non_unit_non_spell", {
    ...getPlayerTrace(state, seatId, player),
    hand_index: index,
    played_card: getCardTrace(playedCard),
    player_mana: Number(player.mana || 0),
    board_added: false
  });
  addLog(state, `${player.name} played ${U.cardName(playedCard)}.`);
  S.syncLegacy(state);

  return { ok: true, state };
}

function playUnitCard(state, seatId, playedCard, target = null, deps = {}) {
  const player = U.getPlayer(state, seatId);
  if (!player) {
    manaTrace(deps, "playUnitCard.rejected", {
      ...getPlayerTrace(state, seatId, player),
      played_card: getCardTrace(playedCard),
      board_added: false,
      reject_reason: "Player is missing."
    });
    return { ok: false, state, message: "Player is missing." };
  }

  if (String(playedCard.card_id || "") === "nimbus_outpost") {
    if (!target || String(target.type || "") !== "unit") {
      return { ok: false, state, message: "Nimbus Outpost needs an allied unit target." };
    }

    const targetSeat = U.normalizeOwnerToSeat(
      state,
      target.owner_seat ?? target.owner ?? target.owner_id ?? target.ownerId ?? seatId
    );

    const targetIndex = Number(target.board_index ?? target.boardIndex ?? target.index ?? -1);

    if (targetSeat !== seatId) {
      return { ok: false, state, message: "Nimbus Outpost must destroy your own unit." };
    }

    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= player.board.length) {
      return { ok: false, state, message: "Nimbus Outpost target not found." };
    }

    const sacrificed = player.board[targetIndex];
    if (!sacrificed || sacrificed === playedCard) {
      return { ok: false, state, message: "Nimbus Outpost target not found." };
    }

    const gainedAttack = Number(sacrificed.attack || 0);
    const gainedHp = Number(sacrificed.max_hp || sacrificed.hp || 0);

    player.board.splice(targetIndex, 1);
    CardOps.moveCardToGraveyard(player, sacrificed);

    playedCard.attack = Number(playedCard.attack || 0) + gainedAttack;
    playedCard.max_hp = Number(playedCard.max_hp || playedCard.hp || 0) + gainedHp;
    playedCard.hp = Number(playedCard.hp || 0) + gainedHp;
    playedCard.base_attack = Number(playedCard.attack || 0);
    playedCard.base_hp = Number(playedCard.max_hp || playedCard.hp || 0);

    Combat.applySummonState(playedCard, player);
    const boardCountBeforeNimbus = player.board.length;
    player.board.push(playedCard);
    manaTrace(deps, "playUnitCard.board_added", {
      ...getPlayerTrace(state, seatId, player),
      played_card: getCardTrace(playedCard),
      player_mana: Number(player.mana || 0),
      board_count_before: boardCountBeforeNimbus,
      board_count_after: player.board.length,
      board_added: true
    });

    CardOps.incrementPlayedTraitCounts(player, playedCard);
    Triggers.resolveOnUnitPlayed(state, seatId, playedCard, deps);

    Combat.processDeathQueue(state, deps);
    addLog(state, `${player.name} sacrificed ${U.cardName(sacrificed)} to play ${U.cardName(playedCard)}.`);
    S.syncLegacy(state);

    return { ok: true, state };
  }

  Combat.applySummonState(playedCard, player);

  const boardCountBefore = player.board.length;
  player.board.push(playedCard);
  manaTrace(deps, "playUnitCard.board_added", {
    ...getPlayerTrace(state, seatId, player),
    played_card: getCardTrace(playedCard),
    player_mana: Number(player.mana || 0),
    board_count_before: boardCountBefore,
    board_count_after: player.board.length,
    board_added: true
  });

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
    manaTrace(deps, "playSpellCard.rejected", {
      ...getPlayerTrace(state, seatId, player),
      played_card: getCardTrace(playedCard),
      board_added: false,
      reject_reason: "Player is missing."
    });
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
    manaTrace(deps, "playSpellCard.pending", {
      ...getPlayerTrace(state, seatId, player),
      played_card: getCardTrace(playedCard),
      player_mana: Number(player.mana || 0),
      board_added: false
    });
    S.syncLegacy(state);
    return { ok: true, state };
  }

  if (result && result.ok === false) {
    clearPendingState(state);
    S.syncLegacy(state);
    return {
      ok: false,
      state,
      message: result.message || "Spell effect failed."
    };
  }

  Triggers.resolveOnSpellPlayed(state, seatId, playedCard, deps);

  CardOps.moveCardToGraveyard(player, playedCard);

  Combat.processDeathQueue(state, deps);
  manaTrace(deps, "playSpellCard.resolved", {
    ...getPlayerTrace(state, seatId, player),
    played_card: getCardTrace(playedCard),
    player_mana: Number(player.mana || 0),
    board_added: false
  });
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

  return playCardFromHand(state, seatId, handIndex, target, deps, {
    allowDuringSelection: true
  });
}

function handleHandCardClicked(state, seatId, payload, deps = {}) {
  ensureState(state);
  const initialHandIndex = getPayloadHandIndex(payload);
  manaTrace(deps, "handleHandCardClicked.enter", {
    ...getPlayerTrace(state, seatId, U.getPlayer(state, seatId)),
    hand_index: initialHandIndex,
    payload
  });

  const turn = validateTurnAction(state, seatId);
  if (!turn.ok) {
    manaTrace(deps, "handleHandCardClicked.rejected", {
      ...getPlayerTrace(state, seatId, U.getPlayer(state, seatId)),
      hand_index: initialHandIndex,
      validate_ok: false,
      reject_reason: turn.message
    });
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
    manaTrace(deps, "handleHandCardClicked.rejected", {
      ...getPlayerTrace(state, seatId, player),
      hand_index: initialHandIndex,
      validate_ok: false,
      reject_reason: "Player is missing."
    });
    return { ok: false, state, message: "Player is missing." };
  }

  const handIndex = getPayloadHandIndex(payload);
  if (handIndex < 0 || handIndex >= player.hand.length) {
    manaTrace(deps, "handleHandCardClicked.rejected", {
      ...getPlayerTrace(state, seatId, player),
      hand_index: handIndex,
      player_mana: Number(player.mana || 0),
      validate_ok: false,
      reject_reason: "Invalid hand index."
    });
    return { ok: false, state, message: "Invalid hand index." };
  }

  const card = player.hand[handIndex];
  S.normalizeCard(card);
  
  if (!isKnownHandCard(card)) {
    return rejectUnknownHandCard(
      state,
      seatId,
      player,
      handIndex,
      card,
      deps,
      "handleHandCardClicked.unknown_card"
    );
  }

  manaTrace(deps, "handleHandCardClicked.card", {
    ...getPlayerTrace(state, seatId, player),
    hand_index: handIndex,
    raw_card: getCardTrace(card),
    hydrated_card: {
      ...getCardTrace(card),
      effective_cost: CardOps.getCardPlayCost(player, card)
    },
    player_mana: Number(player.mana || 0),
    effective_cost: CardOps.getCardPlayCost(player, card)
  });

  const playCheck = validateCanPlayCard(state, seatId, player, card, {
    handIndex,
    traceDeps: deps
  });
  if (!playCheck.ok) {
    manaTrace(deps, "handleHandCardClicked.rejected", {
      ...getPlayerTrace(state, seatId, player),
      hand_index: handIndex,
      player_mana: Number(player.mana || 0),
      effective_cost: CardOps.getCardPlayCost(player, card),
      validate_ok: false,
      reject_reason: playCheck.message,
      board_added: false
    });
    return { ok: false, state, message: playCheck.message };
  }

  const targetType = String(card.target_type || C.TARGET_NONE).toLowerCase();
  const needsTarget =
    targetType !== String(C.TARGET_NONE).toLowerCase() &&
    targetType !== "";

  if (needsTarget) {
    setPendingCardTarget(state, seatId, handIndex, card);
    S.syncLegacy(state);
    manaTrace(deps, "handleHandCardClicked.pending_target", {
      ...getPlayerTrace(state, seatId, player),
      hand_index: handIndex,
      player_mana: Number(player.mana || 0),
      effective_cost: CardOps.getCardPlayCost(player, card),
      validate_ok: true,
      board_added: false
    });
    return { ok: true, state };
  }

  manaTrace(deps, "handleHandCardClicked.playCardFromHand", {
    ...getPlayerTrace(state, seatId, player),
    hand_index: handIndex,
    player_mana: Number(player.mana || 0),
    effective_cost: CardOps.getCardPlayCost(player, card),
    validate_ok: true
  });
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

    const attackResult = Combat.attackUnit(
      state,
      attackerSeat,
      attackerIndex,
      clickedSeat,
      boardIndex,
      deps
    );

    if (attackResult.ok) {
      clearPendingState(state);
      S.syncLegacy(state);
    }

    return attackResult;
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

    const attackResult = Combat.attackFace(
      state,
      attackerSeat,
      attackerIndex,
      clickedSeat,
      deps
    );

    if (attackResult.ok) {
      clearPendingState(state);
      S.syncLegacy(state);
    }

    return attackResult;
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

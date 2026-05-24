"use strict";

const C = require("./battle/constants");
const S = require("./battle/state");
const Actions = require("./battle/actions");
const CardOps = require("./battle/card_ops");
const Combat = require("./battle/combat");
const Effects = require("./battle/effects");
const Triggers = require("./battle/triggers");
const Targets = require("./battle/targets");
const Utils = require("./battle/utils");

function handleBattleAction(match, seatId, payload, deps = {}) {
  return Actions.handleBattleAction(match, seatId, payload, deps);
}

function normalizeStateRuntime(state) {
  return S.normalizeState(state);
}

function startTurn(state, seatId, deps = {}) {
  return Actions.beginTurn(state, seatId, deps);
}

function endTurn(state, seatId, deps = {}) {
  return Actions.endTurn(state, seatId, deps);
}

function drawCard(state, seatId, amount = 1) {
  return CardOps.drawCards(state, seatId, amount);
}

function playHandCard(state, seatId, handIndex, target = null, deps = {}) {
  return Actions.playCardFromHand(state, seatId, handIndex, target, deps);
}

function attackTarget(state, seatId, boardIndex, target, deps = {}) {
  if (!target) {
    return { ok: false, state, message: "Attack target is missing." };
  }

  if (target.type === "player") {
    return Combat.attackFace(state, seatId, boardIndex, target.owner_seat, deps);
  }

  if (target.type === "unit") {
    return Combat.attackUnit(state, seatId, boardIndex, target.owner_seat, target.board_index, deps);
  }

  return { ok: false, state, message: "Invalid attack target." };
}

function validateTarget(state, sourceOwnerSeat, sourceCard, target) {
  return Targets.isValidTargetForCard(state, sourceOwnerSeat, sourceCard, target);
}

function validateAttackTarget(state, attackerOwnerSeat, attacker, target) {
  if (!target) {
    return { ok: false, reason: "attack target required" };
  }

  if (target.type === "player") {
    return { ok: true, reason: "ok" };
  }

  if (target.type === "unit") {
    return { ok: true, reason: "ok" };
  }

  return { ok: false, reason: "invalid attack target" };
}

function processDeathQueue(state, deps = {}) {
  return Combat.processDeathQueue(state, deps);
}

function processSummonQueue(_state, _deps = {}) {
  // 現在は即時 summon 処理に統一。
  return;
}

function resolveEffect(state, sourceOwnerSeat, sourceCard, ability = {}, explicitTarget = null, deps = {}) {
  return Effects.resolveSpellOrCardEffect(state, sourceOwnerSeat, sourceCard, explicitTarget, ability, deps);
}

function resolveTriggeredAbilities(state, sourceOwnerSeat, sourceCard, triggerName, context = {}, deps = {}) {
  return Triggers.resolveCardTrigger(state, sourceOwnerSeat, sourceCard, triggerName, context, deps);
}

function resolveGlobalTrigger(state, triggerName, context = {}, deps = {}) {
  return Triggers.resolveGlobalTrigger(state, triggerName, context, deps);
}

module.exports = {
  C,

  handleBattleAction,
  normalizeStateRuntime,
  startTurn,
  endTurn,
  drawCard,
  playHandCard,
  attackTarget,
  validateTarget,
  validateAttackTarget,
  processDeathQueue,
  processSummonQueue,
  resolveEffect,
  resolveTriggeredAbilities,
  resolveGlobalTrigger,

  normalizeOwnerToSeat: Utils.normalizeOwnerToSeat,
  normalizeSeatToOwner: Utils.normalizeSeatToOwner,

  _modules: {
    state: S,
    actions: Actions,
    cardOps: CardOps,
    combat: Combat,
    effects: Effects,
    triggers: Triggers,
    targets: Targets,
    utils: Utils
  }
};

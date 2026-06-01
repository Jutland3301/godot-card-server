"use strict";

const C = require("./battle/constants");
const State = require("./battle/state");
const Actions = require("./battle/actions");
const CardOps = require("./battle/card_ops");
const Combat = require("./battle/combat");
const Effects = require("./battle/effects");
const Triggers = require("./battle/triggers");
const Targets = require("./battle/targets");
const Utils = require("./battle/utils");

function normalizeStateRuntime(state) {
  State.normalizeState(state);
  State.syncLegacy(state);
  return state;
}

function normalizeStateWithDeps(state, deps = {}) {
  State.normalizeState(state);
  if (deps && typeof deps.makeCardFromId === "function" && typeof State.hydrateKnownCardDefinitions === "function") {
    State.hydrateKnownCardDefinitions(state, deps.makeCardFromId);
  }
  State.syncLegacy(state);
  return state;
}

function makePublicState(state) {
  if (!state || typeof state !== "object") {
    return {};
  }

  State.normalizeState(state);
  State.syncLegacy(state);

  if (typeof State.makePublicState === "function") {
    return State.makePublicState(state);
  }

  return state;
}

function handleBattleAction(match, seatId, payload, deps = {}) {
  if (!match || typeof match !== "object") {
    return {
      ok: false,
      message: "Match is missing.",
      state: {}
    };
  }

  if (!match.state || typeof match.state !== "object") {
    match.state = {};
  }

  normalizeStateWithDeps(match.state, deps);

  const result = Actions.handleBattleAction(
    match,
    seatId,
    payload || {},
    deps || {}
  );

  normalizeStateWithDeps(match.state, deps);

  return {
    ok: result && result.ok === true,
    message: result && result.message ? result.message : "",
    reason: result && result.reason ? result.reason : "",
    state: makePublicState(match.state)
  };
}

function startTurn(state, seatId, deps = {}) {
  State.normalizeState(state);
  const result = Actions.beginTurn(state, seatId, deps);
  State.syncLegacy(state);
  return result;
}

function endTurn(state, seatId, deps = {}) {
  State.normalizeState(state);
  const result = Actions.endTurn(state, seatId, deps);
  State.syncLegacy(state);
  return result;
}

function drawCard(state, seatId, amount = 1) {
  State.normalizeState(state);
  const result = CardOps.drawCards(state, seatId, amount);
  State.syncLegacy(state);
  return result;
}

function playHandCard(state, seatId, handIndex, target = null, deps = {}) {
  normalizeStateWithDeps(state, deps);
  const result = Actions.playCardFromHand(state, seatId, handIndex, target, deps);
  normalizeStateWithDeps(state, deps);
  return result;
}

function attackTarget(state, seatId, boardIndex, target, deps = {}) {
  State.normalizeState(state);

  if (!target) {
    return {
      ok: false,
      state,
      message: "Attack target is missing."
    };
  }

  let result = null;

  if (target.type === "player") {
    result = Combat.attackFace(state, seatId, boardIndex, target.owner_seat, deps);
  } else if (target.type === "unit") {
    result = Combat.attackUnit(state, seatId, boardIndex, target.owner_seat, target.board_index, deps);
  } else {
    result = {
      ok: false,
      state,
      message: "Invalid attack target."
    };
  }

  State.syncLegacy(state);
  return result;
}

function validateTarget(state, sourceOwnerSeat, sourceCard, target) {
  State.normalizeState(state);
  return Targets.isValidTargetForCard(state, sourceOwnerSeat, sourceCard, target);
}

function validateAttackTarget(_state, _attackerOwnerSeat, _attacker, target) {
  if (!target) {
    return {
      ok: false,
      reason: "attack target required"
    };
  }

  if (target.type === "player" || target.type === "unit") {
    return {
      ok: true,
      reason: "ok"
    };
  }

  return {
    ok: false,
    reason: "invalid attack target"
  };
}

function processDeathQueue(state, deps = {}) {
  State.normalizeState(state);
  const result = Combat.processDeathQueue(state, deps);
  State.syncLegacy(state);
  return result;
}

function processSummonQueue(_state, _deps = {}) {
  return;
}

function resolveEffect(state, sourceOwnerSeat, sourceCard, ability = {}, explicitTarget = null, deps = {}) {
  State.normalizeState(state);
  const result = Effects.resolveSpellOrCardEffect(
    state,
    sourceOwnerSeat,
    sourceCard,
    explicitTarget,
    ability,
    deps
  );
  State.syncLegacy(state);
  return result;
}

function resolveTriggeredAbilities(state, sourceOwnerSeat, sourceCard, triggerName, context = {}, deps = {}) {
  State.normalizeState(state);
  const result = Triggers.resolveCardTrigger(
    state,
    sourceOwnerSeat,
    sourceCard,
    triggerName,
    context,
    deps
  );
  State.syncLegacy(state);
  return result;
}

function resolveGlobalTrigger(state, triggerName, context = {}, deps = {}) {
  State.normalizeState(state);
  const result = Triggers.resolveGlobalTrigger(state, triggerName, context, deps);
  State.syncLegacy(state);
  return result;
}

module.exports = {
  C,

  handleBattleAction,
  makePublicState,
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
    state: State,
    actions: Actions,
    cardOps: CardOps,
    combat: Combat,
    effects: Effects,
    triggers: Triggers,
    targets: Targets,
    utils: Utils
  }
};

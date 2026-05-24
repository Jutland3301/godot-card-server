"use strict";

const Triggers = require("./triggers");

function resolveAbility(state, sourceSeat, sourceCard, ability, context = {}, ctx = {}) {
  if (!ability || typeof ability !== "object") {
    return;
  }

  const trigger = String(ability.trigger || ability.trigger_id || "");

  if (trigger === "battlecry") {
    Triggers.resolveBattlecryAbility(state, sourceSeat, sourceCard, ability, context, ctx);
    return;
  }

  Triggers.resolveGenericAbility(state, sourceSeat, sourceCard, ability, context, ctx);
}

function resolveNamedBattlecry(state, sourceSeat, sourceCard, ability = {}, ctx = {}) {
  Triggers.resolveBattlecryAbility(state, sourceSeat, sourceCard, ability, {}, ctx);
}

module.exports = {
  resolveAbility,
  resolveNamedBattlecry
};

"use strict";

const C = require("./constants");
const U = require("./utils");
const S = require("./state");
const Abilities = require("./abilities");

function passesTriggerFilters(state, sourceSeat, sourceCard, ability, context) {
  const includeSelf = ability.include_self !== undefined ? !!ability.include_self : true;

  if (!includeSelf && context.played_card && sourceCard === context.played_card) {
    return false;
  }

  const onlyFriendly = ability.only_friendly !== undefined ? !!ability.only_friendly : false;
  if (onlyFriendly) {
    const eventSeat = context.played_seat || context.attacker_seat || context.source_seat || "";
    if (eventSeat && eventSeat !== sourceSeat) return false;
  }

  const onlyEnemy = ability.only_enemy !== undefined ? !!ability.only_enemy : false;
  if (onlyEnemy) {
    const eventSeat = context.played_seat || context.attacker_seat || context.source_seat || "";
    if (eventSeat && eventSeat === sourceSeat) return false;
  }

  const requiredTrait = String(ability.trait || "");
  if (requiredTrait && context.played_card && !U.hasTrait(context.played_card, requiredTrait)) {
    return false;
  }

  return true;
}

function resolveCardTrigger(state, sourceSeat, sourceCard, triggerName, context = {}, ctx = {}) {
  if (!sourceCard) return;

  const abilities = U.getAbilities(sourceCard, triggerName);

  for (const ability of abilities) {
    if (!passesTriggerFilters(state, sourceSeat, sourceCard, ability, context)) {
      continue;
    }

    Abilities.resolveAbility(state, sourceSeat, sourceCard, ability, context, ctx);
  }
}

function resolveGlobalTrigger(state, triggerName, context = {}, ctx = {}) {
  for (const seatId of ["A", "B"]) {
    const player = U.getPlayer(state, seatId);
    if (!player) continue;

    const snapshot = [...player.board];

    for (const sourceCard of snapshot) {
      if (!sourceCard) continue;
      if (!player.board.includes(sourceCard)) continue;

      resolveCardTrigger(state, seatId, sourceCard, triggerName, context, ctx);
    }
  }
}

function resolveBattlecry(state, sourceSeat, sourceCard, context = {}, ctx = {}) {
  resolveCardTrigger(state, sourceSeat, sourceCard, C.TRIGGER_BATTLECRY, context, ctx);
}

function resolveTurnStart(state, activeSeat, ctx = {}) {
  const player = U.getPlayer(state, activeSeat);
  if (!player) return;

  for (const unit of [...player.board]) {
    resolveCardTrigger(state, activeSeat, unit, C.TRIGGER_TURN_START, {
      active_seat: activeSeat
    }, ctx);
  }
}

function resolveTurnEnd(state, activeSeat, ctx = {}) {
  const player = U.getPlayer(state, activeSeat);
  if (!player) return;

  for (const unit of [...player.board]) {
    resolveCardTrigger(state, activeSeat, unit, C.TRIGGER_TURN_END, {
      active_seat: activeSeat
    }, ctx);
  }
}

function resolveOnUnitPlayed(state, playedSeat, playedCard, ctx = {}) {
  resolveGlobalTrigger(state, C.TRIGGER_ON_UNIT_PLAYED, {
    played_seat: playedSeat,
    played_card: playedCard
  }, ctx);
}

function resolveOnSpellPlayed(state, playedSeat, playedSpell, ctx = {}) {
  resolveGlobalTrigger(state, C.TRIGGER_ON_SPELL_PLAYED, {
    played_seat: playedSeat,
    played_spell: playedSpell
  }, ctx);
}

function clearExpiredTemporaryKeywords(state, seatId) {
  const player = U.getPlayer(state, seatId);
  if (!player) return;

  for (const unit of player.board) {
    if (!Array.isArray(unit.temporary_keywords)) continue;

    for (const keyword of unit.temporary_keywords) {
      U.removeKeyword(unit, keyword);
    }

    unit.temporary_keywords = [];
  }

  for (const unit of player.board) {
    if (unit.temporary_immobile) {
      U.removeKeyword(unit, C.KEYWORD_IMMOBILE);
      unit.temporary_immobile = false;
    }
  }
}

module.exports = {
  resolveCardTrigger,
  resolveGlobalTrigger,
  resolveBattlecry,
  resolveTurnStart,
  resolveTurnEnd,
  resolveOnUnitPlayed,
  resolveOnSpellPlayed,
  clearExpiredTemporaryKeywords
};

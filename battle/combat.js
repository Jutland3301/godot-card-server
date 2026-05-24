"use strict";

const C = require("./constants");
const U = require("./utils");
const S = require("./state");

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getBoardIndex(player, unit) {
  if (!player || !Array.isArray(player.board)) return -1;
  return player.board.indexOf(unit);
}

function hasEnemyTaunt(state, defenderSeat) {
  const defender = U.getPlayer(state, defenderSeat);
  if (!defender) return false;

  return defender.board.some(unit => {
    return unit && U.hasKeyword(unit, C.KEYWORD_TAUNT);
  });
}

function isTauntTargetRequired(state, attackerSeat, targetUnit) {
  const defenderSeat = U.otherSeat(attackerSeat);
  if (!hasEnemyTaunt(state, defenderSeat)) return false;
  return !U.hasKeyword(targetUnit, C.KEYWORD_TAUNT);
}

function applySummonState(card) {
  if (!card) return card;

  S.normalizeCard(card);

  card.summoned_this_turn = true;
  card.attacks_this_turn = 0;
  card.has_attacked_this_turn = false;

  if (!card.once_per_turn_flags || typeof card.once_per_turn_flags !== "object") {
    card.once_per_turn_flags = {};
  }

  if (U.hasKeyword(card, C.KEYWORD_IMMOBILE)) {
    card.can_attack = false;
    card.exhausted = true;
    return card;
  }

  if (U.hasKeyword(card, C.KEYWORD_HASTE) || U.hasKeyword(card, C.KEYWORD_RUSH)) {
    card.can_attack = true;
    card.exhausted = false;
  } else {
    card.can_attack = false;
    card.exhausted = true;
  }

  return card;
}

function canAttack(state, attackerSeat, attacker, targetType = "unit") {
  if (!state || !attacker) {
    return { ok: false, message: "Attacker is missing." };
  }

  const owner = U.getPlayer(state, attackerSeat);
  if (!owner || !owner.board.includes(attacker)) {
    return { ok: false, message: "Attacker is not on board." };
  }

  if (state.game_over) {
    return { ok: false, message: "Game is already over." };
  }

  if (state.turn_seat !== attackerSeat) {
    return { ok: false, message: "Not your turn." };
  }

  if (U.hasKeyword(attacker, C.KEYWORD_IMMOBILE)) {
    return { ok: false, message: "This unit is immobile." };
  }

  if (attacker.exhausted || attacker.can_attack === false) {
    return { ok: false, message: "This unit cannot attack now." };
  }

  const maxAttacks = Math.max(1, asNumber(attacker.max_attacks_per_turn, 1));
  const attacksThisTurn = asNumber(attacker.attacks_this_turn, 0);

  if (attacksThisTurn >= maxAttacks) {
    return { ok: false, message: "This unit already attacked enough times." };
  }

  if (targetType === "player" && U.hasKeyword(attacker, C.KEYWORD_RUSH) && !U.hasKeyword(attacker, C.KEYWORD_HASTE)) {
    return { ok: false, message: "Rush unit cannot attack leader this turn." };
  }

  return { ok: true, message: "ok" };
}

function markAttackSpent(attacker) {
  if (!attacker) return;

  attacker.attacks_this_turn = asNumber(attacker.attacks_this_turn, 0) + 1;

  const maxAttacks = Math.max(1, asNumber(attacker.max_attacks_per_turn, 1));
  if (attacker.attacks_this_turn >= maxAttacks) {
    attacker.can_attack = false;
    attacker.exhausted = true;
    attacker.has_attacked_this_turn = true;
  }
}

function giveArmor(unit, amount) {
  if (!unit) return;

  unit.armor = Math.max(0, asNumber(unit.armor, 0) + Math.max(0, asNumber(amount, 0)));
}

function damageArmorFirst(target, amount) {
  let remaining = Math.max(0, asNumber(amount, 0));
  if (!target || remaining <= 0) return 0;

  const armor = Math.max(0, asNumber(target.armor, 0));
  if (armor > 0) {
    const absorbed = Math.min(armor, remaining);
    target.armor = armor - absorbed;
    remaining -= absorbed;
  }

  return remaining;
}

function damagePlayer(state, seatId, amount) {
  const player = U.getPlayer(state, seatId);
  if (!player) return 0;

  const damage = damageArmorFirst(player, amount);
  if (damage <= 0) return 0;

  player.hp = asNumber(player.hp, C.STARTING_HP) - damage;
  S.syncLegacy(state);
  return damage;
}

function healPlayer(player, amount) {
  if (!player) return 0;

  const heal = Math.max(0, asNumber(amount, 0));
  const before = asNumber(player.hp, C.STARTING_HP);
  const maxHp = Math.max(1, asNumber(player.max_hp, C.STARTING_HP));

  player.hp = Math.min(maxHp, before + heal);
  return player.hp - before;
}

function damageUnit(state, ownerSeat, unit, amount) {
  if (!unit) return 0;

  if (U.hasKeyword(unit, C.KEYWORD_INVINCIBLE)) {
    return 0;
  }

  const damage = damageArmorFirst(unit, amount);
  if (damage <= 0) return 0;

  unit.hp = asNumber(unit.hp, 0) - damage;

  if (unit.hp <= 0) {
    queueDeath(state, ownerSeat, unit);
  }

  return damage;
}

function healUnit(unit, amount) {
  if (!unit) return 0;

  const heal = Math.max(0, asNumber(amount, 0));
  const before = asNumber(unit.hp, 0);
  const maxHp = Math.max(before, asNumber(unit.max_hp, before));

  unit.hp = Math.min(maxHp, before + heal);
  return unit.hp - before;
}

function buffUnit(unit, attackDelta, hpDelta) {
  if (!unit) return;

  const atk = asNumber(attackDelta, 0);
  const hp = asNumber(hpDelta, 0);

  unit.attack = asNumber(unit.attack, 0) + atk;
  unit.hp = asNumber(unit.hp, 0) + hp;
  unit.max_hp = asNumber(unit.max_hp, 0) + hp;

  if (unit.max_hp < 1) unit.max_hp = 1;

  if (unit.hp <= 0) {
    unit.hp = 0;
  }
}

function setUnitAttack(unit, value) {
  if (!unit) return;
  unit.attack = Math.max(0, asNumber(value, 0));
}

function queueDeath(state, ownerSeat, unit) {
  if (!state || !unit) return;

  if (!Array.isArray(state.pending_deaths)) {
    state.pending_deaths = [];
  }

  const alreadyQueued = state.pending_deaths.some(entry => {
    return entry && entry.card === unit;
  });

  if (alreadyQueued) return;

  state.pending_deaths.push({
    owner_seat: ownerSeat,
    card: unit
  });
}

function destroyUnit(state, ownerSeat, unit) {
  if (!unit) return;
  unit.hp = 0;
  queueDeath(state, ownerSeat, unit);
}

function processDeathQueue(state, ctx = {}) {
  if (!state) return;

  if (!Array.isArray(state.pending_deaths)) {
    state.pending_deaths = [];
  }

  let safety = 0;

  while (state.pending_deaths.length > 0 && safety < 100) {
    safety++;

    const entry = state.pending_deaths.shift();
    if (!entry || !entry.card) continue;

    const ownerSeat = entry.owner_seat;
    const owner = U.getPlayer(state, ownerSeat);
    if (!owner) continue;

    const unit = entry.card;
    const index = getBoardIndex(owner, unit);

    if (index < 0) {
      continue;
    }

    owner.board.splice(index, 1);

    try {
      const Triggers = require("./triggers");
      if (Triggers && typeof Triggers.resolveCardTrigger === "function") {
        Triggers.resolveCardTrigger(state, ownerSeat, unit, C.TRIGGER_WHEN_DESTROYED, {
          destroyed_seat: ownerSeat,
          destroyed_card: unit
        }, ctx);
      }
    } catch (err) {
      S.addLog(state, "Death trigger failed: " + String(err && err.message ? err.message : err));
    }

    if (!Array.isArray(owner.graveyard)) {
      owner.graveyard = [];
    }

    owner.graveyard.push(unit);
    S.addLog(state, `${U.cardName(unit)} was destroyed.`);
  }

  S.syncLegacy(state);
}

function summonCard(state, seatId, cardId, amount, ctx = {}, modify = null) {
  const player = U.getPlayer(state, seatId);
  if (!player || typeof ctx.makeCardFromId !== "function") return 0;

  let count = 0;
  const n = Math.max(0, asNumber(amount, 0));

  for (let i = 0; i < n; i++) {
    if (player.board.length >= C.MAX_BOARD_SIZE) break;

    const card = ctx.makeCardFromId(cardId);
    if (!card) continue;

    S.normalizeCard(card);

    if (typeof modify === "function") {
      modify(card);
    }

    applySummonState(card);
    player.board.push(card);
    count++;

    try {
      const Triggers = require("./triggers");
      if (Triggers && typeof Triggers.resolveOnUnitPlayed === "function") {
        Triggers.resolveOnUnitPlayed(state, seatId, card, ctx);
      }
    } catch (err) {
      S.addLog(state, "Summon trigger failed: " + String(err && err.message ? err.message : err));
    }
  }

  return count;
}

function resolveCombatDamage(state, attackerSeat, attacker, defenderSeat, defender) {
  const attackerAttack = Math.max(0, asNumber(attacker.attack, 0));
  const defenderAttack = Math.max(0, asNumber(defender.attack, 0));

  const attackerDeadly = U.hasKeyword(attacker, C.KEYWORD_DEADLY);
  const defenderDeadly = U.hasKeyword(defender, C.KEYWORD_DEADLY);

  damageUnit(state, defenderSeat, defender, attackerAttack);
  damageUnit(state, attackerSeat, attacker, defenderAttack);

  if (attackerDeadly && attackerAttack > 0 && !U.hasKeyword(defender, C.KEYWORD_INVINCIBLE)) {
    destroyUnit(state, defenderSeat, defender);
  }

  if (defenderDeadly && defenderAttack > 0 && !U.hasKeyword(attacker, C.KEYWORD_INVINCIBLE)) {
    destroyUnit(state, attackerSeat, attacker);
  }
}

function attackUnit(state, attackerSeat, attackerIndex, defenderSeat, defenderIndex, ctx = {}) {
  S.normalizeState(state);

  const attackerOwner = U.getPlayer(state, attackerSeat);
  const defenderOwner = U.getPlayer(state, defenderSeat);

  if (!attackerOwner || !defenderOwner) {
    return { ok: false, state, message: "Invalid combat owner." };
  }

  const attacker = attackerOwner.board[attackerIndex] || null;
  const defender = defenderOwner.board[defenderIndex] || null;

  if (!attacker || !defender) {
    return { ok: false, state, message: "Invalid combat target." };
  }

  if (attackerSeat === defenderSeat) {
    return { ok: false, state, message: "Cannot attack friendly unit." };
  }

  const can = canAttack(state, attackerSeat, attacker, "unit");
  if (!can.ok) {
    return { ok: false, state, message: can.message };
  }

  if (isTauntTargetRequired(state, attackerSeat, defender)) {
    return { ok: false, state, message: "Must attack taunt unit first." };
  }

  try {
    const Triggers = require("./triggers");
    if (Triggers && typeof Triggers.resolveGlobalTrigger === "function") {
      Triggers.resolveGlobalTrigger(state, C.TRIGGER_ON_ALLY_UNIT_ATTACK, {
        attacker_seat: attackerSeat,
        attacker: attacker,
        defender_seat: defenderSeat,
        defender: defender
      }, ctx);
    }

    if (Triggers && typeof Triggers.resolveCardTrigger === "function") {
      Triggers.resolveCardTrigger(state, defenderSeat, defender, C.TRIGGER_WHEN_ATTACKED, {
        attacker_seat: attackerSeat,
        attacker: attacker,
        defender_seat: defenderSeat,
        defender: defender
      }, ctx);
    }
  } catch (err) {
    S.addLog(state, "Attack trigger failed: " + String(err && err.message ? err.message : err));
  }

  resolveCombatDamage(state, attackerSeat, attacker, defenderSeat, defender);
  markAttackSpent(attacker);

  S.addLog(state, `${U.cardName(attacker)} attacked ${U.cardName(defender)}.`);

  processDeathQueue(state, ctx);
  S.clearSelection(state);
  S.syncLegacy(state);

  return { ok: true, state };
}

function attackFace(state, attackerSeat, attackerIndex, defenderSeat, ctx = {}) {
  S.normalizeState(state);

  const attackerOwner = U.getPlayer(state, attackerSeat);
  const defenderOwner = U.getPlayer(state, defenderSeat);

  if (!attackerOwner || !defenderOwner) {
    return { ok: false, state, message: "Invalid face attack owner." };
  }

  const attacker = attackerOwner.board[attackerIndex] || null;

  if (!attacker) {
    return { ok: false, state, message: "Invalid attacker." };
  }

  if (attackerSeat === defenderSeat) {
    return { ok: false, state, message: "Cannot attack own leader." };
  }

  const can = canAttack(state, attackerSeat, attacker, "player");
  if (!can.ok) {
    return { ok: false, state, message: can.message };
  }

  if (hasEnemyTaunt(state, defenderSeat)) {
    return { ok: false, state, message: "Must attack taunt unit first." };
  }

  try {
    const Triggers = require("./triggers");
    if (Triggers && typeof Triggers.resolveGlobalTrigger === "function") {
      Triggers.resolveGlobalTrigger(state, C.TRIGGER_ON_ALLY_UNIT_ATTACK, {
        attacker_seat: attackerSeat,
        attacker: attacker,
        defender_seat: defenderSeat,
        defender_player: defenderOwner
      }, ctx);
    }
  } catch (err) {
    S.addLog(state, "Face attack trigger failed: " + String(err && err.message ? err.message : err));
  }

  const dealt = damagePlayer(state, defenderSeat, asNumber(attacker.attack, 0));
  markAttackSpent(attacker);

  S.addLog(state, `${U.cardName(attacker)} attacked ${defenderOwner.name} for ${dealt}.`);

  processDeathQueue(state, ctx);
  S.clearSelection(state);
  S.syncLegacy(state);

  return { ok: true, state };
}

module.exports = {
  applySummonState,
  canAttack,
  giveArmor,
  damagePlayer,
  healPlayer,
  damageUnit,
  healUnit,
  buffUnit,
  setUnitAttack,
  queueDeath,
  destroyUnit,
  processDeathQueue,
  summonCard,
  attackUnit,
  attackFace
};

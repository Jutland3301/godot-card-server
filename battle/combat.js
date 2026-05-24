"use strict";

const C = require("./constants");
const U = require("./utils");
const S = require("./state");

function lazyTriggers() {
  try {
    return require("./triggers");
  } catch (_err) {
    return null;
  }
}

function getCtx(ctx = {}) {
  return ctx && typeof ctx === "object" ? ctx : {};
}

function addLog(state, message) {
  if (!state || !message) return;

  if (S && typeof S.addLog === "function") {
    S.addLog(state, String(message));
    return;
  }

  if (!Array.isArray(state.battle_log_messages)) {
    state.battle_log_messages = [];
  }

  if (!Array.isArray(state.log)) {
    state.log = [];
  }

  const text = String(message);
  state.status_message = text;
  state.battle_log_messages.push(text);
  state.log.push(text);
}

function normalizeStateSoft(state) {
  if (!state || typeof state !== "object") {
    return state;
  }

  if (!state.players || typeof state.players !== "object") {
    state.players = {
      [C.SEAT_A]: state.player1,
      [C.SEAT_B]: state.player2
    };
  }

  if (state.players[C.SEAT_A]) {
    state.player1 = state.players[C.SEAT_A];
  }

  if (state.players[C.SEAT_B]) {
    state.player2 = state.players[C.SEAT_B];
  }

  if (!Array.isArray(state.pending_deaths)) {
    state.pending_deaths = [];
  }

  if (!Array.isArray(state.pending_summons)) {
    state.pending_summons = [];
  }

  for (const seat of [C.SEAT_A, C.SEAT_B]) {
    const player = U.getPlayer(state, seat);

    if (!player) {
      continue;
    }

    if (!Array.isArray(player.deck)) player.deck = [];
    if (!Array.isArray(player.hand)) player.hand = [];
    if (!Array.isArray(player.board)) player.board = [];
    if (!Array.isArray(player.graveyard)) player.graveyard = [];
  }

  return state;
}

function getPlayer(state, seatId) {
  normalizeStateSoft(state);
  return U.getPlayer(state, seatId);
}

function getOpponentSeat(seatId) {
  return U.otherSeat(seatId);
}

function getUnitIndex(player, unitOrIndex) {
  if (!player || !Array.isArray(player.board)) {
    return -1;
  }

  if (typeof unitOrIndex === "number") {
    const index = Number(unitOrIndex);
    return index >= 0 && index < player.board.length ? index : -1;
  }

  return player.board.indexOf(unitOrIndex);
}

function getUnit(state, seatId, unitOrIndex) {
  const player = getPlayer(state, seatId);

  if (!player) {
    return null;
  }

  const index = getUnitIndex(player, unitOrIndex);

  if (index < 0) {
    return null;
  }

  return player.board[index] || null;
}

function hasKeyword(card, keyword) {
  return U.hasEffectiveKeyword
    ? U.hasEffectiveKeyword(card, null, keyword)
    : U.hasKeyword(card, keyword);
}

function isInvincible(unit) {
  if (!unit) return false;

  if (U.hasKeyword && U.hasKeyword(unit, C.KEYWORD_INVINCIBLE || "invincible")) {
    return true;
  }

  if (U.hasKeyword && U.hasKeyword(unit, "invincible")) {
    return true;
  }

  if (Array.isArray(unit.keywords)) {
    return unit.keywords.includes(C.KEYWORD_INVINCIBLE || "invincible") || unit.keywords.includes("invincible");
  }

  return false;
}

function isDeadUnit(unit) {
  if (!unit) return false;
  if (isInvincible(unit)) return false;
  return Number(unit.hp || 0) <= 0 || Number(unit.max_hp || 0) <= 0;
}

function syncState(state) {
  if (!state) return state;

  if (S && typeof S.syncLegacy === "function") {
    S.syncLegacy(state);
  } else if (S && typeof S.normalizeState === "function") {
    S.normalizeState(state);
  }

  return state;
}

function markGameOverIfNeeded(state) {
  if (!state || state.game_over) {
    return;
  }

  const playerA = getPlayer(state, C.SEAT_A);
  const playerB = getPlayer(state, C.SEAT_B);

  if (!playerA || !playerB) {
    return;
  }

  const aDead = Number(playerA.hp || 0) <= 0;
  const bDead = Number(playerB.hp || 0) <= 0;

  if (aDead && bDead) {
    state.game_over = true;
    state.winner_seat = "";
    state.loser_seat = "";
    state.turn_timer_active = false;
    state.turn_timer_timeout_handled = true;
    state.turn_time_left = 0.0;
    addLog(state, "Draw.");
    return;
  }

  if (aDead) {
    state.game_over = true;
    state.winner_seat = C.SEAT_B;
    state.loser_seat = C.SEAT_A;
    state.turn_timer_active = false;
    state.turn_timer_timeout_handled = true;
    state.turn_time_left = 0.0;
    addLog(state, `${playerB.name || "Player2"} wins.`);
    return;
  }

  if (bDead) {
    state.game_over = true;
    state.winner_seat = C.SEAT_A;
    state.loser_seat = C.SEAT_B;
    state.turn_timer_active = false;
    state.turn_timer_timeout_handled = true;
    state.turn_time_left = 0.0;
    addLog(state, `${playerA.name || "Player1"} wins.`);
  }
}

function applyDamageToUnit(unit, amount) {
  if (!unit) {
    return 0;
  }

  if (isInvincible(unit)) {
    return 0;
  }

  let remaining = Math.max(0, Number(amount || 0));
  let actualDamage = 0;

  const armor = Math.max(0, Number(unit.armor || 0));

  if (armor > 0 && remaining > 0) {
    const blocked = Math.min(armor, remaining);
    unit.armor = armor - blocked;
    remaining -= blocked;
  }

  if (remaining > 0) {
    unit.hp = Number(unit.hp || 0) - remaining;
    actualDamage += remaining;
  }

  return actualDamage;
}

function damageUnit(state, ownerSeat, unitOrIndex, amount, ctx = {}) {
  normalizeStateSoft(state);

  const player = getPlayer(state, ownerSeat);
  if (!player) {
    return 0;
  }

  const index = getUnitIndex(player, unitOrIndex);
  if (index < 0) {
    return 0;
  }

  const unit = player.board[index];
  if (!unit) {
    return 0;
  }

  const actualDamage = applyDamageToUnit(unit, amount);

  if (actualDamage > 0) {
    const Triggers = lazyTriggers();

    if (Triggers && typeof Triggers.resolveOnAllyUnitDamagedTriggers === "function") {
      Triggers.resolveOnAllyUnitDamagedTriggers(state, ownerSeat, unit, actualDamage, ctx);
    }
  }

  if (isDeadUnit(unit)) {
    queueDeath(state, ownerSeat, unit);
  }

  markGameOverIfNeeded(state);
  return actualDamage;
}

function damagePlayer(state, ownerSeat, amount) {
  normalizeStateSoft(state);

  const player = getPlayer(state, ownerSeat);
  if (!player) {
    return 0;
  }

  const damage = Math.max(0, Number(amount || 0));
  player.hp = Number(player.hp || 0) - damage;

  markGameOverIfNeeded(state);
  return damage;
}

function healUnit(state, ownerSeat, unitOrIndex, amount) {
  normalizeStateSoft(state);

  const unit = getUnit(state, ownerSeat, unitOrIndex);
  if (!unit) {
    return 0;
  }

  const before = Number(unit.hp || 0);
  const maxHp = Number(unit.max_hp || before);
  unit.hp = Math.min(maxHp, before + Math.max(0, Number(amount || 0)));

  return unit.hp - before;
}

function healPlayer(state, ownerSeat, amount) {
  normalizeStateSoft(state);

  const player = getPlayer(state, ownerSeat);
  if (!player) {
    return 0;
  }

  const before = Number(player.hp || 0);
  const maxHp = Number(player.max_hp || before);
  player.hp = Math.min(maxHp, before + Math.max(0, Number(amount || 0)));

  return player.hp - before;
}

function queueDeath(state, ownerSeat, unitOrIndex) {
  normalizeStateSoft(state);

  const player = getPlayer(state, ownerSeat);
  if (!player) {
    return false;
  }

  const index = getUnitIndex(player, unitOrIndex);
  if (index < 0) {
    return false;
  }

  const unit = player.board[index];
  if (!unit || isInvincible(unit)) {
    return false;
  }

  if (!Array.isArray(state.pending_deaths)) {
    state.pending_deaths = [];
  }

  const alreadyQueued = state.pending_deaths.some((entry) => {
    return entry && entry.owner_seat === ownerSeat && entry.card === unit;
  });

  if (!alreadyQueued) {
    state.pending_deaths.push({
      owner_seat: ownerSeat,
      seat: ownerSeat,
      board_index: index,
      card: unit
    });
  }

  return true;
}

function destroyUnit(state, ownerSeat, unitOrIndex, ctx = {}) {
  normalizeStateSoft(state);

  const player = getPlayer(state, ownerSeat);
  if (!player) {
    return false;
  }

  const index = getUnitIndex(player, unitOrIndex);
  if (index < 0) {
    return false;
  }

  const unit = player.board[index];
  if (!unit || isInvincible(unit)) {
    return false;
  }

  unit.hp = 0;
  queueDeath(state, ownerSeat, unit);
  processDeathQueue(state, ctx);

  return true;
}

function processDeathQueue(state, ctx = {}) {
  normalizeStateSoft(state);

  if (!state || state.game_over) {
    return {
      ok: true,
      state,
      destroyed: []
    };
  }

  const destroyed = [];
  const Triggers = lazyTriggers();

  let safety = 0;
  let foundDeath = true;

  while (foundDeath && safety < 20) {
    safety++;
    foundDeath = false;

    for (const seat of [C.SEAT_A, C.SEAT_B]) {
      const player = getPlayer(state, seat);
      if (!player || !Array.isArray(player.board)) {
        continue;
      }

      for (let i = player.board.length - 1; i >= 0; i--) {
        const unit = player.board[i];

        if (!unit || !isDeadUnit(unit)) {
          continue;
        }

        foundDeath = true;

        const removed = player.board.splice(i, 1)[0];
        player.graveyard.push(removed);

        destroyed.push({
          owner_seat: seat,
          seat,
          board_index: i,
          card: removed
        });

        if (Triggers && typeof Triggers.resolveWhenDestroyedAbilities === "function") {
          Triggers.resolveWhenDestroyedAbilities(state, seat, removed, ctx);
        }
      }
    }
  }

  state.pending_deaths = [];

  markGameOverIfNeeded(state);
  syncState(state);

  return {
    ok: true,
    state,
    destroyed
  };
}

function dealDamageToAllEnemyUnitsForPlayer(state, sourceSeat, amount, ctx = {}) {
  normalizeStateSoft(state);

  const enemySeat = getOpponentSeat(sourceSeat);
  const enemy = getPlayer(state, enemySeat);

  if (!enemy || !Array.isArray(enemy.board)) {
    return 0;
  }

  let hitCount = 0;
  const snapshot = enemy.board.slice();

  for (const unit of snapshot) {
    if (!unit || !enemy.board.includes(unit)) {
      continue;
    }

    const actual = damageUnit(state, enemySeat, unit, amount, ctx);
    if (actual > 0) {
      hitCount++;
    }
  }

  processDeathQueue(state, ctx);
  return hitCount;
}

function dealDamageToAllUnits(state, amount, ctx = {}) {
  normalizeStateSoft(state);

  let hitCount = 0;

  for (const seat of [C.SEAT_A, C.SEAT_B]) {
    const player = getPlayer(state, seat);
    if (!player || !Array.isArray(player.board)) {
      continue;
    }

    const snapshot = player.board.slice();

    for (const unit of snapshot) {
      if (!unit || !player.board.includes(unit)) {
        continue;
      }

      const actual = damageUnit(state, seat, unit, amount, ctx);
      if (actual > 0) {
        hitCount++;
      }
    }
  }

  processDeathQueue(state, ctx);
  return hitCount;
}

function applySummonState(card, owner = null) {
  if (!card) {
    return card;
  }

  card.summoned_this_turn = true;
  card.has_attacked_this_turn = false;
  card.attacks_this_turn = 0;

  if (!card.once_per_turn_flags || typeof card.once_per_turn_flags !== "object") {
    card.once_per_turn_flags = {};
  }

  const hasHaste = U.hasKeyword
    ? U.hasKeyword(card, C.KEYWORD_HASTE || "haste") || U.hasKeyword(card, "haste")
    : Array.isArray(card.keywords) && card.keywords.includes("haste");

  const hasRush = U.hasKeyword
    ? U.hasKeyword(card, C.KEYWORD_RUSH || "rush") || U.hasKeyword(card, "rush")
    : Array.isArray(card.keywords) && card.keywords.includes("rush");

  const hasImmobile = U.hasKeyword
    ? U.hasKeyword(card, C.KEYWORD_IMMOBILE || "immobile") || U.hasKeyword(card, "immobile")
    : Array.isArray(card.keywords) && card.keywords.includes("immobile");

  if (hasImmobile) {
    card.can_attack = false;
    card.exhausted = true;
    return card;
  }

  if (hasHaste || hasRush) {
    card.can_attack = true;
    card.exhausted = false;
    return card;
  }

  card.can_attack = false;
  card.exhausted = true;

  if (owner && U.refreshAttackPermissionsForPlayer) {
    U.refreshAttackPermissionsForPlayer(owner);
  }

  return card;
}

function summonCard(state, ownerSeat, cardId, amount = 1, ctx = {}, mutateNewCard = null) {
  normalizeStateSoft(state);

  const owner = getPlayer(state, ownerSeat);
  const context = getCtx(ctx);

  if (!owner || !cardId) {
    return 0;
  }

  if (!Array.isArray(owner.board)) {
    owner.board = [];
  }

  if (!Array.isArray(owner.graveyard)) {
    owner.graveyard = [];
  }

  if (typeof context.makeCardFromId !== "function") {
    addLog(state, `makeCardFromId is missing. Cannot summon ${cardId}.`);
    return 0;
  }

  let summoned = 0;
  const count = Math.max(0, Number(amount || 0));

  for (let i = 0; i < count; i++) {
    if (owner.board.length >= C.MAX_BOARD_SIZE) {
      break;
    }

    const card = context.makeCardFromId(String(cardId));

    if (!card || typeof card !== "object") {
      continue;
    }

    if (S && typeof S.normalizeCard === "function") {
      S.normalizeCard(card);
    }

    if (typeof mutateNewCard === "function") {
      mutateNewCard(card);
    }

    applySummonState(card, owner);
    owner.board.push(card);
    summoned++;
  }

  if (U.refreshAttackPermissionsForPlayer) {
    U.refreshAttackPermissionsForPlayer(owner);
  }

  syncState(state);
  return summoned;
}

function canAttack(state, attackerSeat, attacker, targetType = "unit") {
  normalizeStateSoft(state);

  if (!state || state.game_over) {
    return {
      ok: false,
      message: "Game is already over."
    };
  }

  if (state.turn_seat && state.turn_seat !== attackerSeat) {
    return {
      ok: false,
      message: "Not your turn."
    };
  }

  const owner = getPlayer(state, attackerSeat);
  if (!owner || !attacker || !Array.isArray(owner.board) || !owner.board.includes(attacker)) {
    return {
      ok: false,
      message: "Attacker is missing."
    };
  }

  if (!U.isUnit(attacker)) {
    return {
      ok: false,
      message: "Only units can attack."
    };
  }

  if (hasKeyword(attacker, C.KEYWORD_IMMOBILE || "immobile") || hasKeyword(attacker, "immobile")) {
    return {
      ok: false,
      message: "This unit is immobile."
    };
  }

  if (!attacker.can_attack || attacker.exhausted) {
    return {
      ok: false,
      message: "This unit cannot attack."
    };
  }

  if (Number(attacker.attacks_this_turn || 0) >= Number(attacker.max_attacks_per_turn || 1)) {
    return {
      ok: false,
      message: "This unit has already attacked enough times."
    };
  }

  if (targetType === "player") {
    if (attacker.cannot_attack_leader) {
      return {
        ok: false,
        message: "This unit cannot attack leader."
      };
    }

    const hasRush = U.hasKeyword
      ? U.hasKeyword(attacker, C.KEYWORD_RUSH || "rush") || U.hasKeyword(attacker, "rush")
      : Array.isArray(attacker.keywords) && attacker.keywords.includes("rush");

    const hasHaste = U.hasKeyword
      ? U.hasKeyword(attacker, C.KEYWORD_HASTE || "haste") || U.hasKeyword(attacker, "haste")
      : Array.isArray(attacker.keywords) && attacker.keywords.includes("haste");

    if (hasRush && attacker.summoned_this_turn && !hasHaste) {
      return {
        ok: false,
        message: "Rush units cannot attack leader on the turn they are summoned."
      };
    }
  }

  return {
    ok: true,
    message: "ok"
  };
}

function spendAttack(attacker) {
  if (!attacker) {
    return;
  }

  attacker.attacks_this_turn = Number(attacker.attacks_this_turn || 0) + 1;
  attacker.has_attacked_this_turn = true;

  if (Number(attacker.attacks_this_turn || 0) >= Number(attacker.max_attacks_per_turn || 1)) {
    attacker.can_attack = false;
    attacker.exhausted = true;
  } else {
    attacker.can_attack = true;
    attacker.exhausted = false;
  }
}

function hasTauntBlocking(defenderPlayer, targetUnit = null) {
  if (!defenderPlayer || !Array.isArray(defenderPlayer.board)) {
    return false;
  }

  const taunts = defenderPlayer.board.filter((unit) => {
    return unit && (
      (U.isTauntUnit && U.isTauntUnit(defenderPlayer, defenderPlayer.board.indexOf(unit))) ||
      (U.hasKeyword && (U.hasKeyword(unit, C.KEYWORD_TAUNT || "taunt") || U.hasKeyword(unit, "taunt"))) ||
      (Array.isArray(unit.keywords) && unit.keywords.includes("taunt"))
    );
  });

  if (taunts.length <= 0) {
    return false;
  }

  if (!targetUnit) {
    return true;
  }

  return !taunts.includes(targetUnit);
}

function attackFace(state, attackerSeat, attackerIndex, defenderSeat, ctx = {}) {
  normalizeStateSoft(state);

  const attackerOwner = getPlayer(state, attackerSeat);
  const defenderOwner = getPlayer(state, defenderSeat);

  if (!attackerOwner || !defenderOwner) {
    return {
      ok: false,
      state,
      message: "Invalid attacker or defender."
    };
  }

  const attacker = getUnit(state, attackerSeat, Number(attackerIndex));

  const can = canAttack(state, attackerSeat, attacker, "player");
  if (!can.ok) {
    return {
      ok: false,
      state,
      message: can.message
    };
  }

  if (attackerSeat === defenderSeat) {
    return {
      ok: false,
      state,
      message: "Cannot attack own leader."
    };
  }

  if (hasTauntBlocking(defenderOwner, null)) {
    return {
      ok: false,
      state,
      message: "Enemy taunt unit must be attacked first."
    };
  }

  const Triggers = lazyTriggers();

  if (Triggers && typeof Triggers.resolveOnAllyUnitAttackTriggers === "function") {
    Triggers.resolveOnAllyUnitAttackTriggers(state, attackerSeat, attacker, ctx);
  }

  const damage = Math.max(0, Number(attacker.attack || 0));
  damagePlayer(state, defenderSeat, damage);
  spendAttack(attacker);

  addLog(state, `${U.cardName(attacker)} attacked enemy leader for ${damage}.`);

  processDeathQueue(state, ctx);
  markGameOverIfNeeded(state);
  syncState(state);

  return {
    ok: true,
    state
  };
}

function attackUnit(state, attackerSeat, attackerIndex, defenderSeat, defenderIndex, ctx = {}) {
  normalizeStateSoft(state);

  const attackerOwner = getPlayer(state, attackerSeat);
  const defenderOwner = getPlayer(state, defenderSeat);

  if (!attackerOwner || !defenderOwner) {
    return {
      ok: false,
      state,
      message: "Invalid attacker or defender."
    };
  }

  const attacker = getUnit(state, attackerSeat, Number(attackerIndex));
  const defender = getUnit(state, defenderSeat, Number(defenderIndex));

  const can = canAttack(state, attackerSeat, attacker, "unit");
  if (!can.ok) {
    return {
      ok: false,
      state,
      message: can.message
    };
  }

  if (!defender) {
    return {
      ok: false,
      state,
      message: "Target unit is missing."
    };
  }

  if (attackerSeat === defenderSeat) {
    return {
      ok: false,
      state,
      message: "Cannot attack own unit."
    };
  }

  if (hasTauntBlocking(defenderOwner, defender)) {
    return {
      ok: false,
      state,
      message: "Enemy taunt unit must be attacked first."
    };
  }

  const Triggers = lazyTriggers();

  if (Triggers && typeof Triggers.resolveOnAllyUnitAttackTriggers === "function") {
    Triggers.resolveOnAllyUnitAttackTriggers(state, attackerSeat, attacker, ctx);
  }

  if (Triggers && typeof Triggers.resolveWhenAttackedAbilities === "function") {
    Triggers.resolveWhenAttackedAbilities(state, defenderSeat, defender, attackerSeat, attacker, ctx);
  }

  const attackerDamage = Math.max(0, Number(attacker.attack || 0));
  const defenderDamage = Math.max(0, Number(defender.attack || 0));

  const attackerDeadly =
    (U.hasKeyword && (U.hasKeyword(attacker, C.KEYWORD_DEADLY || "deadly") || U.hasKeyword(attacker, "deadly"))) ||
    (Array.isArray(attacker.keywords) && attacker.keywords.includes("deadly"));

  const defenderDeadly =
    (U.hasKeyword && (U.hasKeyword(defender, C.KEYWORD_DEADLY || "deadly") || U.hasKeyword(defender, "deadly"))) ||
    (Array.isArray(defender.keywords) && defender.keywords.includes("deadly"));

  if (attackerDeadly && attackerDamage > 0) {
    defender.hp = 0;
    queueDeath(state, defenderSeat, defender);
  } else {
    damageUnit(state, defenderSeat, defender, attackerDamage, ctx);
  }

  if (defenderDeadly && defenderDamage > 0) {
    attacker.hp = 0;
    queueDeath(state, attackerSeat, attacker);
  } else {
    damageUnit(state, attackerSeat, attacker, defenderDamage, ctx);
  }

  const attackerRicochet =
    (U.hasKeyword && (U.hasKeyword(attacker, C.KEYWORD_RICOCHET || "ricochet") || U.hasKeyword(attacker, "ricochet"))) ||
    (Array.isArray(attacker.keywords) && attacker.keywords.includes("ricochet"));

  if (attackerRicochet && attackerDamage > 0) {
    damagePlayer(state, defenderSeat, attackerDamage);
  }

  spendAttack(attacker);

  const defenderWillDie = isDeadUnit(defender);
  const attackerWillSurvive = !isDeadUnit(attacker);

  processDeathQueue(state, ctx);

  if (
    defenderWillDie &&
    attackerWillSurvive &&
    Triggers &&
    typeof Triggers.resolveWhenKillsAbilities === "function"
  ) {
    Triggers.resolveWhenKillsAbilities(state, attackerSeat, attacker, ctx);
    processDeathQueue(state, ctx);
  }

  addLog(state, `${U.cardName(attacker)} attacked ${U.cardName(defender)}.`);

  markGameOverIfNeeded(state);
  syncState(state);

  return {
    ok: true,
    state
  };
}

function canUnitAttackEnemyPlayerForUI(state, attackerSeat, attacker) {
  if (!state || !attacker) {
    return false;
  }

  const can = canAttack(state, attackerSeat, attacker, "player");
  if (!can.ok) {
    return false;
  }

  const defender = getPlayer(state, U.otherSeat(attackerSeat));
  if (hasTauntBlocking(defender, null)) {
    return false;
  }

  return true;
}

function hasValidEnemyUnitAttackTarget(state, attackerSeat) {
  const enemy = getPlayer(state, U.otherSeat(attackerSeat));
  if (!enemy || !Array.isArray(enemy.board)) {
    return false;
  }

  if (enemy.board.length <= 0) {
    return false;
  }

  if (U.hasTauntUnit && U.hasTauntUnit(enemy)) {
    return true;
  }

  return enemy.board.some((unit) => !!unit);
}

function hasAnyValidAttackTargetForUnit(state, attackerSeat, attacker) {
  if (!attacker) {
    return false;
  }

  if (hasValidEnemyUnitAttackTarget(state, attackerSeat)) {
    return true;
  }

  return canUnitAttackEnemyPlayerForUI(state, attackerSeat, attacker);
}

module.exports = {
  damagePlayer,
  damageUnit,
  healPlayer,
  healUnit,

  destroyUnit,
  queueDeath,
  processDeathQueue,

  dealDamageToAllEnemyUnitsForPlayer,
  dealDamageToAllUnits,

  summonCard,
  applySummonState,

  canAttack,
  attackFace,
  attackUnit,

  canUnitAttackEnemyPlayerForUI,
  hasValidEnemyUnitAttackTarget,
  hasAnyValidAttackTargetForUnit
};

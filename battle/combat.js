"use strict";

const C = require("./constants");
const U = require("./utils");

function getTargetFromPayload(state, payload = {}) {
  if (!state || !payload || typeof payload !== "object") {
    return null;
  }

  const rawOwner =
    payload.owner_seat ??
    payload.ownerSeat ??
    payload.target_owner ??
    payload.targetOwner ??
    payload.board_owner ??
    payload.boardOwner ??
    payload.owner_id ??
    payload.ownerId ??
    payload.owner ??
    payload.player_owner ??
    payload.playerOwner ??
    payload.player_id ??
    payload.playerId ??
    "";

  const ownerSeat = U.normalizeOwnerToSeat(state, rawOwner);

  const rawIndex =
    payload.board_index ??
    payload.boardIndex ??
    payload.target_index ??
    payload.targetIndex ??
    payload.unit_index ??
    payload.unitIndex ??
    payload.index ??
    -1;

  const boardIndex = Number(rawIndex);

  const rawType = String(
    payload.target_type ??
    payload.targetType ??
    payload.target_kind ??
    payload.targetKind ??
    payload.kind ??
    payload.type ??
    ""
  );

  const isLeader =
    payload.is_leader === true ||
    payload.isLeader === true ||
    payload.face === true ||
    payload.is_face === true ||
    payload.isFace === true ||
    rawType === "player" ||
    rawType === "face" ||
    rawType === "leader";

  if (isLeader) {
    if (!ownerSeat) return null;

    return {
      type: "player",
      owner_seat: ownerSeat
    };
  }

  if (ownerSeat && boardIndex >= 0) {
    return {
      type: "unit",
      owner_seat: ownerSeat,
      board_index: boardIndex
    };
  }

  return null;
}

function getUnitByTarget(state, target) {
  if (!state || !target || target.type !== "unit") {
    return null;
  }

  const owner = U.getPlayer(state, target.owner_seat);
  if (!owner || !Array.isArray(owner.board)) {
    return null;
  }

  const index = Number(target.board_index);
  if (index < 0 || index >= owner.board.length) {
    return null;
  }

  return owner.board[index] || null;
}

function getPlayerByTarget(state, target) {
  if (!state || !target || target.type !== "player") {
    return null;
  }

  return U.getPlayer(state, target.owner_seat);
}

function getTargetOwner(state, target) {
  if (!state || !target) return null;
  return U.getPlayer(state, target.owner_seat);
}

function getTargetOwnerId(state, target) {
  if (!state || !target) return "";
  return U.seatToOwnerId(target.owner_seat);
}

function isFriendlyTarget(sourceSeat, targetSeat) {
  return sourceSeat === targetSeat;
}

function isEnemyTarget(sourceSeat, targetSeat) {
  return sourceSeat !== targetSeat;
}

function spellCanTargetUnitByAbilityFilter(state, sourceSeat, card, unit) {
  if (!state || !card || !unit) {
    return false;
  }

  const abilities = U.getAbilities(card);

  if (abilities.length <= 0) {
    return true;
  }

  const ability = abilities[0];
  if (!ability || typeof ability !== "object") {
    return true;
  }

  const requiredTrait = U.normalizeLowerString(ability.trait || "");
  if (requiredTrait && !U.hasTrait(unit, requiredTrait)) {
    return false;
  }

  const damagedOnly = Boolean(ability.damaged_only || false);
  if (damagedOnly && Number(unit.hp || 0) >= Number(unit.max_hp || 0)) {
    return false;
  }

  return true;
}

function canSpellAffectUnit(state, sourceSeat, card, targetSeat, unit) {
  if (!state || !card || !unit) {
    return false;
  }

  const owner = U.getPlayer(state, targetSeat);

  if (U.isUntrickableUnit(owner, unit)) {
    return false;
  }

  const effectId = String(card.effect_id || "");

  if (
    effectId === C.EFFECT_ADD_KEYWORD ||
    effectId === C.EFFECT_DESTROY_FRIENDLY_TRAIT_UNIT_COPY_TO_HAND_BUFF ||
    effectId === C.EFFECT_POETRY_OF_RESILIENCE
  ) {
    return spellCanTargetUnitByAbilityFilter(state, sourceSeat, card, unit);
  }

  return true;
}

function hasValidAnyUnitTargetForSpell(state, sourceSeat, card) {
  for (const seat of [C.SEAT_A, C.SEAT_B]) {
    const player = U.getPlayer(state, seat);
    if (!player || !Array.isArray(player.board)) continue;

    for (const unit of player.board) {
      if (!unit || !U.isUnit(unit)) continue;

      if (!canSpellAffectUnit(state, sourceSeat, card, seat, unit)) {
        continue;
      }

      return true;
    }
  }

  return false;
}

function hasValidFriendlyUnitTargetForSpell(state, sourceSeat, card) {
  const player = U.getPlayer(state, sourceSeat);
  if (!player || !Array.isArray(player.board)) {
    return false;
  }

  for (const unit of player.board) {
    if (!unit || !U.isUnit(unit)) continue;

    if (!canSpellAffectUnit(state, sourceSeat, card, sourceSeat, unit)) {
      continue;
    }

    return true;
  }

  return false;
}

function hasValidEnemyUnitTargetForSpell(state, sourceSeat, card) {
  const enemySeat = U.otherSeat(sourceSeat);
  const enemy = U.getPlayer(state, enemySeat);

  if (!enemy || !Array.isArray(enemy.board)) {
    return false;
  }

  for (const unit of enemy.board) {
    if (!unit || !U.isUnit(unit)) continue;

    if (!canSpellAffectUnit(state, sourceSeat, card, enemySeat, unit)) {
      continue;
    }

    return true;
  }

  return false;
}

function hasValidPlayTargetForCard(state, sourceSeat, card) {
  if (!state || !card) {
    return false;
  }

  const targetType = String(card.target_type || C.TARGET_NONE);
  const effectId = String(card.effect_id || "");

  if (targetType === C.TARGET_NONE || targetType === "") {
    return true;
  }

  if (targetType === C.TARGET_FRIENDLY_PLAYER) {
    return U.getPlayer(state, sourceSeat) !== null;
  }

  if (targetType === C.TARGET_ENEMY_PLAYER) {
    return U.getPlayer(state, U.otherSeat(sourceSeat)) !== null;
  }

  if (targetType === C.TARGET_ENEMY_UNIT) {
    return hasValidEnemyUnitTargetForSpell(state, sourceSeat, card);
  }

  if (targetType === C.TARGET_FRIENDLY_UNIT) {
    return hasValidFriendlyUnitTargetForSpell(state, sourceSeat, card);
  }

  if (targetType === C.TARGET_ANY_FRIENDLY) {
    if (
      effectId === C.EFFECT_ADD_KEYWORD ||
      effectId === C.EFFECT_DESTROY_FRIENDLY_TRAIT_UNIT_COPY_TO_HAND_BUFF ||
      effectId === C.EFFECT_POETRY_OF_RESILIENCE ||
      effectId === C.EFFECT_NOBLES_OBLIGE ||
      effectId === C.EFFECT_FORBIDDEN_BOOK
    ) {
      return hasValidFriendlyUnitTargetForSpell(state, sourceSeat, card);
    }

    return U.getPlayer(state, sourceSeat) !== null;
  }

  if (targetType === C.TARGET_ANY_ENEMY) {
    if (U.getPlayer(state, U.otherSeat(sourceSeat)) !== null) {
      return true;
    }

    return hasValidEnemyUnitTargetForSpell(state, sourceSeat, card);
  }

  if (targetType === C.TARGET_ANY_UNIT) {
    return hasValidAnyUnitTargetForSpell(state, sourceSeat, card);
  }

  if (targetType === C.TARGET_ANY || targetType === C.ABILITY_TARGET_ANY) {
    return true;
  }

  return true;
}

function isValidTargetForPendingSpell(state, sourceSeat, targetOwnerSeat, targetKind) {
  if (!state) return false;

  const card = state.pending_card;
  if (!card) return false;

  const effectId = String(card.effect_id || "");
  const targetType = String(card.target_type || C.TARGET_NONE);

  const isFriendly = targetOwnerSeat === sourceSeat;
  const isEnemy = targetOwnerSeat !== sourceSeat;

  if (effectId === C.EFFECT_DESTROY_FRIENDLY_TRAIT_UNIT_COPY_TO_HAND_BUFF) {
    return isFriendly && targetKind === "unit";
  }

  if (effectId === C.EFFECT_POETRY_OF_RESILIENCE) {
    return isFriendly && targetKind === "unit";
  }

  if (effectId === C.EFFECT_NOBLES_OBLIGE) {
    return isFriendly && targetKind === "unit";
  }

  if (effectId === C.EFFECT_FORBIDDEN_BOOK) {
    return isFriendly && targetKind === "unit";
  }

  if (effectId === C.EFFECT_RUNIC_TUNING) {
    return isFriendly && targetKind === "unit";
  }

  if (effectId === C.EFFECT_LAMENTATION_OF_LIFE) {
    return isEnemy && targetKind === "unit";
  }

  if (effectId === C.EFFECT_TRANSCRIBE_OF_THE_WICKED) {
    return isEnemy && targetKind === "unit";
  }

  switch (targetType) {
    case C.TARGET_ANY_ENEMY:
      return isEnemy;

    case C.TARGET_ANY_FRIENDLY:
      return isFriendly;

    case C.TARGET_ENEMY_UNIT:
      return isEnemy && targetKind === "unit";

    case C.TARGET_FRIENDLY_UNIT:
      return isFriendly && targetKind === "unit";

    case C.TARGET_ANY_UNIT:
      return targetKind === "unit";

    case C.TARGET_FRIENDLY_PLAYER:
      return isFriendly && targetKind === "player";

    case C.TARGET_ENEMY_PLAYER:
      return isEnemy && targetKind === "player";

    case C.TARGET_ANY_PLAYER:
      return targetKind === "player";

    case C.TARGET_NONE:
      return false;

    default:
      return false;
  }
}

function isValidTargetForPendingAbility(state, sourceSeat, targetOwnerSeat, targetKind) {
  if (!state) return false;

  const ability = state.pending_ability || {};
  if (!ability || typeof ability !== "object") return false;

  const targetType = String(ability.target || "");
  const isFriendly = targetOwnerSeat === sourceSeat;
  const isEnemy = targetOwnerSeat !== sourceSeat;

  switch (targetType) {
    case C.ABILITY_TARGET_ANY:
      return true;

    case C.ABILITY_TARGET_ANY_ENEMY:
      return isEnemy;

    case C.ABILITY_TARGET_ANY_FRIENDLY:
      return isFriendly;

    case C.ABILITY_TARGET_ENEMY_PLAYER:
      return isEnemy && targetKind === "player";

    case C.ABILITY_TARGET_FRIENDLY_PLAYER:
      return isFriendly && targetKind === "player";

    case C.ABILITY_TARGET_ENEMY_UNIT:
      return isEnemy && targetKind === "unit";

    case C.ABILITY_TARGET_FRIENDLY_UNIT:
      return isFriendly && targetKind === "unit";

    case C.ABILITY_TARGET_ANY_UNIT:
      return targetKind === "unit";

    case C.ABILITY_TARGET_ANY_PLAYER:
      return targetKind === "player";

    default:
      return false;
  }
}

function isValidTargetForCard(state, sourceSeat, card, target) {
  if (!state || !card) {
    return { ok: false, message: "Card is missing." };
  }

  const targetType = String(card.target_type || C.TARGET_NONE);

  if (targetType === C.TARGET_NONE || targetType === "") {
    return { ok: true, message: "ok" };
  }

  if (!target) {
    return { ok: false, message: "Target is missing." };
  }

  const targetSeat = target.owner_seat;
  const targetKind = target.type === "player" ? "player" : "unit";

  if (!targetSeat) {
    return { ok: false, message: "Target owner is missing." };
  }

  if (!isValidTargetForPendingCardLike(state, sourceSeat, card, targetSeat, targetKind)) {
    return { ok: false, message: "Invalid target for this card." };
  }

  if (target.type === "unit") {
    const unit = getUnitByTarget(state, target);
    if (!unit) {
      return { ok: false, message: "Target unit is missing." };
    }

    if (!canSpellAffectUnit(state, sourceSeat, card, targetSeat, unit)) {
      return { ok: false, message: "Target unit cannot be affected." };
    }
  }

  return { ok: true, message: "ok" };
}

function isValidTargetForPendingCardLike(state, sourceSeat, card, targetOwnerSeat, targetKind) {
  const previousPending = state.pending_card;
  state.pending_card = card;

  const ok = isValidTargetForPendingSpell(state, sourceSeat, targetOwnerSeat, targetKind);

  state.pending_card = previousPending;

  return ok;
}

function isBoardTargetableNow(state, sourceSeat, ownerSeat, boardIndex) {
  if (!state) return false;

  const targetPlayer = U.getPlayer(state, ownerSeat);
  if (!targetPlayer || !Array.isArray(targetPlayer.board)) {
    return false;
  }

  const index = Number(boardIndex);
  if (index < 0 || index >= targetPlayer.board.length) {
    return false;
  }

  const currentOwnerSeat = sourceSeat;

  if (state.selecting_target) {
    switch (state.pending_action_type) {
      case C.ACTION_SPELL: {
        const targetUnit = targetPlayer.board[index];

        if (U.isUntrickableUnit(targetPlayer, targetUnit)) {
          return false;
        }

        const pendingCard = state.pending_card;
        if (
          pendingCard &&
          (
            String(pendingCard.effect_id || "") === C.EFFECT_ADD_KEYWORD ||
            String(pendingCard.effect_id || "") === C.EFFECT_DESTROY_FRIENDLY_TRAIT_UNIT_COPY_TO_HAND_BUFF ||
            String(pendingCard.effect_id || "") === C.EFFECT_POETRY_OF_RESILIENCE
          )
        ) {
          if (!spellCanTargetUnitByAbilityFilter(state, sourceSeat, pendingCard, targetUnit)) {
            return false;
          }
        }

        return isValidTargetForPendingSpell(state, sourceSeat, ownerSeat, "unit");
      }

      case C.ACTION_ABILITY:
        return isValidTargetForPendingAbility(state, sourceSeat, ownerSeat, "unit");

      case C.ACTION_UNIT_ATTACK:
        if (ownerSeat === currentOwnerSeat) {
          return false;
        }

        if (
          Number(state.pending_attacker_index ?? -1) < 0 ||
          Number(state.pending_attacker_index ?? -1) >= U.getPlayer(state, currentOwnerSeat).board.length
        ) {
          return false;
        }

        if (U.hasTauntUnit(targetPlayer) && !U.isTauntUnit(targetPlayer, index)) {
          return false;
        }

        return true;

      default:
        return false;
    }
  }

  if (Number(state.selected_attacker_index ?? -1) !== -1) {
    const selectedOwnerSeat = U.normalizeOwnerToSeat(state, state.selected_attacker_owner);

    if (selectedOwnerSeat !== currentOwnerSeat) {
      return false;
    }

    if (ownerSeat === currentOwnerSeat) {
      return false;
    }

    if (U.hasTauntUnit(targetPlayer) && !U.isTauntUnit(targetPlayer, index)) {
      return false;
    }

    return true;
  }

  return false;
}

function isFaceTargetableNow(state, sourceSeat, ownerSeat) {
  if (!state) return false;

  const clickedPlayer = U.getPlayer(state, ownerSeat);
  if (!clickedPlayer) {
    return false;
  }

  const currentOwnerSeat = sourceSeat;

  if (state.selecting_target) {
    switch (state.pending_action_type) {
      case C.ACTION_SPELL:
        if (state.pending_card && String(state.pending_card.effect_id || "") === C.EFFECT_ADD_KEYWORD) {
          return false;
        }

        return isValidTargetForPendingSpell(state, sourceSeat, ownerSeat, "player");

      case C.ACTION_ABILITY:
        return isValidTargetForPendingAbility(state, sourceSeat, ownerSeat, "player");

      case C.ACTION_UNIT_ATTACK: {
        if (ownerSeat === currentOwnerSeat) {
          return false;
        }

        const player = U.getPlayer(state, currentOwnerSeat);
        const attackerIndex = Number(state.pending_attacker_index ?? -1);

        if (!player || attackerIndex < 0 || attackerIndex >= player.board.length) {
          return false;
        }

        const attacker = player.board[attackerIndex];
        return canUnitAttackEnemyPlayerForUI(state, currentOwnerSeat, attacker);
      }

      default:
        return false;
    }
  }

  if (Number(state.selected_attacker_index ?? -1) !== -1) {
    const selectedOwnerSeat = U.normalizeOwnerToSeat(state, state.selected_attacker_owner);

    if (selectedOwnerSeat !== currentOwnerSeat) {
      return false;
    }

    if (ownerSeat === currentOwnerSeat) {
      return false;
    }

    const player = U.getPlayer(state, currentOwnerSeat);
    const attackerIndex = Number(state.selected_attacker_index ?? -1);

    if (!player || attackerIndex < 0 || attackerIndex >= player.board.length) {
      return false;
    }

    const attacker = player.board[attackerIndex];
    return canUnitAttackEnemyPlayerForUI(state, currentOwnerSeat, attacker);
  }

  return false;
}

function canUnitAttackEnemyPlayerForUI(state, attackerSeat, attacker) {
  if (!state || !attacker) return false;

  if (attacker.cannot_attack_leader) {
    return false;
  }

  if (!U.isUnit(attacker)) {
    return false;
  }

  const attackerOwner = U.getPlayer(state, attackerSeat);
  if (!U.canUnitAttackNowWithAura(attackerOwner, attacker, true)) {
    return false;
  }

  const defenderOwner = U.getPlayer(state, U.otherSeat(attackerSeat));
  if (U.hasTauntUnit(defenderOwner)) {
    return false;
  }

  return true;
}

module.exports = {
  getTargetFromPayload,
  getUnitByTarget,
  getPlayerByTarget,
  getTargetOwner,
  getTargetOwnerId,

  isFriendlyTarget,
  isEnemyTarget,

  spellCanTargetUnitByAbilityFilter,
  canSpellAffectUnit,

  hasValidAnyUnitTargetForSpell,
  hasValidFriendlyUnitTargetForSpell,
  hasValidEnemyUnitTargetForSpell,
  hasValidPlayTargetForCard,

  isValidTargetForPendingSpell,
  isValidTargetForPendingAbility,
  isValidTargetForCard,

  isBoardTargetableNow,
  isFaceTargetableNow,
  canUnitAttackEnemyPlayerForUI
};

"use strict";

const C = require("./constants");
const U = require("./utils");

function getTargetFromPayload(state, payload) {
  payload = payload || {};
  const target = payload.target && typeof payload.target === "object" ? payload.target : {};

  const rawOwner =
    payload.owner_seat ||
    payload.target_owner ||
    payload.board_owner ||
    payload.owner_id ||
    payload.owner ||
    payload.player_owner ||
    payload.player_id ||
    target.owner_seat ||
    target.target_owner ||
    target.board_owner ||
    target.owner_id ||
    target.owner ||
    target.player_owner ||
    target.player_id ||
    "";

  const ownerSeat = U.normalizeOwnerToSeat(state, rawOwner);

  const boardIndexRaw =
    payload.board_index ??
    payload.target_index ??
    payload.unit_index ??
    payload.index ??
    target.board_index ??
    target.target_index ??
    target.unit_index ??
    target.index ??
    null;

  const targetType =
    payload.target_type ||
    payload.targetType ||
    target.target_type ||
    target.targetType ||
    "";

  if (
    targetType === "player" ||
    targetType === C.TARGET_ENEMY_PLAYER ||
    targetType === C.TARGET_FRIENDLY_PLAYER ||
    payload.is_leader === true ||
    payload.target_is_leader === true ||
    target.is_leader === true ||
    target.target_is_leader === true
  ) {
    return {
      type: "player",
      owner_seat: ownerSeat
    };
  }

  if (ownerSeat && boardIndexRaw !== null && boardIndexRaw !== undefined) {
    return {
      type: "unit",
      owner_seat: ownerSeat,
      board_index: Number(boardIndexRaw)
    };
  }

  return null;
}

function getUnitByTarget(state, target) {
  if (!target || target.type !== "unit") return null;
  const player = U.getPlayer(state, target.owner_seat);
  if (!player) return null;
  return player.board[target.board_index] || null;
}

function spellCanTargetUnitByAbilityFilter(card, unit) {
  if (!card || !unit) return false;

  const ability = Array.isArray(card.abilities) && card.abilities[0] && typeof card.abilities[0] === "object"
    ? card.abilities[0]
    : {};

  const requiredTrait = String(ability.trait || "");
  if (requiredTrait && !U.hasTrait(unit, requiredTrait)) {
    return false;
  }

  const damagedOnly = !!ability.damaged_only;
  if (damagedOnly && Number(unit.hp || 0) >= Number(unit.max_hp || 0)) {
    return false;
  }

  return true;
}

function isValidTargetForCard(state, sourceSeat, card, target) {
  if (!card) return { ok: false, message: "Card is missing." };

  const targetType = String(card.target_type || C.TARGET_NONE);

  if (targetType === C.TARGET_NONE || targetType === "") {
    return { ok: target == null, message: target == null ? "ok" : "This card does not need target." };
  }

  if (!target) {
    return { ok: false, message: "Target required." };
  }

  if (target.type === "player") {
    if (targetType === C.TARGET_FRIENDLY_PLAYER) {
      return { ok: target.owner_seat === sourceSeat, message: "Invalid friendly player target." };
    }

    if (targetType === C.TARGET_ENEMY_PLAYER || targetType === C.TARGET_ANY_ENEMY) {
      return { ok: target.owner_seat !== sourceSeat, message: "Invalid enemy player target." };
    }

    if (targetType === C.TARGET_ANY_FRIENDLY) {
      return { ok: target.owner_seat === sourceSeat, message: "Invalid friendly target." };
    }

    return { ok: false, message: "Player target is not allowed." };
  }

  if (target.type === "unit") {
    const unit = getUnitByTarget(state, target);
    if (!unit) return { ok: false, message: "Target unit is missing." };

    if (U.hasKeyword(unit, C.KEYWORD_UNTRICKABLE) && U.isSpell(card)) {
      return { ok: false, message: "Target is untrickable." };
    }

    if (targetType === C.TARGET_ENEMY_UNIT) {
      return { ok: target.owner_seat !== sourceSeat, message: "Invalid enemy unit target." };
    }

    if (targetType === C.TARGET_ANY_UNIT) {
      return { ok: true, message: "ok" };
    }

    if (targetType === C.TARGET_ANY_ENEMY) {
      return { ok: target.owner_seat !== sourceSeat, message: "Invalid enemy target." };
    }

    if (targetType === C.TARGET_ANY_FRIENDLY) {
      if (target.owner_seat !== sourceSeat) {
        return { ok: false, message: "Invalid friendly target." };
      }

      if (
        card.effect_id === C.EFFECT_ADD_KEYWORD ||
        card.effect_id === C.EFFECT_DESTROY_FRIENDLY_TRAIT_UNIT_COPY_TO_HAND_BUFF ||
        card.effect_id === C.EFFECT_POETRY_OF_RESILIENCE
      ) {
        return {
          ok: spellCanTargetUnitByAbilityFilter(card, unit),
          message: "Target does not pass ability filter."
        };
      }

      return { ok: true, message: "ok" };
    }

    return { ok: false, message: "Unit target is not allowed." };
  }

  return { ok: false, message: "Unknown target." };
}

function hasValidPlayTargetForCard(state, sourceSeat, card) {
  if (!card) return false;

  const targetType = String(card.target_type || C.TARGET_NONE);
  if (targetType === C.TARGET_NONE) return true;

  const owner = U.getPlayer(state, sourceSeat);
  const enemy = U.getPlayer(state, U.otherSeat(sourceSeat));

  if (targetType === C.TARGET_FRIENDLY_PLAYER) return !!owner;
  if (targetType === C.TARGET_ENEMY_PLAYER || targetType === C.TARGET_ANY_ENEMY) return !!enemy;

  const checkUnit = (seatId, unit) => {
    if (!unit || !U.isUnit(unit)) return false;
    if (U.hasKeyword(unit, C.KEYWORD_UNTRICKABLE) && U.isSpell(card)) return false;

    if (
      card.effect_id === C.EFFECT_ADD_KEYWORD ||
      card.effect_id === C.EFFECT_DESTROY_FRIENDLY_TRAIT_UNIT_COPY_TO_HAND_BUFF ||
      card.effect_id === C.EFFECT_POETRY_OF_RESILIENCE
    ) {
      return spellCanTargetUnitByAbilityFilter(card, unit);
    }

    return true;
  };

  if (targetType === C.TARGET_ENEMY_UNIT) {
    return !!enemy && enemy.board.some(unit => checkUnit(U.otherSeat(sourceSeat), unit));
  }

  if (targetType === C.TARGET_ANY_UNIT) {
    return (!!owner && owner.board.some(unit => checkUnit(sourceSeat, unit))) ||
      (!!enemy && enemy.board.some(unit => checkUnit(U.otherSeat(sourceSeat), unit)));
  }

  if (targetType === C.TARGET_ANY_FRIENDLY) {
    return !!owner && owner.board.some(unit => checkUnit(sourceSeat, unit));
  }

  return true;
}

module.exports = {
  getTargetFromPayload,
  getUnitByTarget,
  spellCanTargetUnitByAbilityFilter,
  isValidTargetForCard,
  hasValidPlayTargetForCard
};

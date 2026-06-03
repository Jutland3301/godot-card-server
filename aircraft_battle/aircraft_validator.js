"use strict";

const { getCardById } = require("./aircraft_cards");
const { normalizeInt } = require("./aircraft_rules");

const ACTION_TYPES = new Set([
  "play_card",
  "play_card_with_target",
  "fire_weapon",
  "fire_weapon_at_part",
  "extra_draw",
  "leader_ability",
  "end_turn",
  "surrender",
  "reset_battle",
  "cancel_targeting",
]);

function getCurrentPlayer(state) {
  return state.players[state.current_player_index];
}

function getEffectiveCardCost(player, card) {
  return Math.max(0, normalizeInt(card.cost, 0) + normalizeInt(player.next_bonuses.card_cost, 0));
}

function getEffectiveWeaponAttackCost(player, weapon) {
  return Math.max(0, normalizeInt(weapon.attack_cost, 0) + normalizeInt(player.next_bonuses.weapon_attack_cost, 0));
}

function validateSlot(slots, index, emptyRequired = true) {
  if (!Number.isInteger(index) || index < 0 || index >= slots.length) return { ok: false, reason: "Invalid slot index." };
  if (emptyRequired && slots[index]) return { ok: false, reason: "Slot is already occupied." };
  return { ok: true };
}

function validateCrewRequirement(_player, _card) {
  return { ok: true };
}

function validateTarget(state, action) {
  const targetPlayerIndex = action.target_player_index ?? (state.current_player_index === 0 ? 1 : 0);
  const targetPlayer = state.players[targetPlayerIndex];
  if (!targetPlayer) return { ok: false, reason: "Invalid target player." };
  const part = targetPlayer.parts[action.part_index];
  if (!part) return { ok: false, reason: "Invalid target part." };
  if (part.destroyed) return { ok: false, reason: "Target part is already destroyed." };
  return { ok: true, targetPlayer, part };
}

function validateCardPlay(state, action) {
  const player = getCurrentPlayer(state);
  const cardIndex = normalizeInt(action.card_index, -1);
  const card = player.hand[cardIndex];
  if (!card) return { ok: false, reason: "Invalid card index." };
  const known = getCardById(card.id);
  if (!known) return { ok: false, reason: "Unknown card id." };
  const cost = getEffectiveCardCost(player, card);
  if (player.mana < cost) return { ok: false, reason: "Not enough mana." };
  if (card.type === "crew") return validateSlot(player.crew, action.slot_index, true);
  if (card.type === "weapon") return validateSlot(player.weapons, action.slot_index, true);
  if (card.type === "equipment") return validateSlot(player.equipment, action.slot_index, true);
  return validateCrewRequirement(player, card);
}

function validateAction(state, action) {
  if (!state || !Array.isArray(state.players)) return { ok: false, reason: "Invalid battle state." };
  if (state.battle_over && action.type !== "reset_battle") return { ok: false, reason: "Battle is already over." };
  if (!action || !ACTION_TYPES.has(action.type)) return { ok: false, reason: "Invalid action type." };
  if (["play_card", "play_card_with_target"].includes(action.type)) return validateCardPlay(state, action);
  if (action.type === "extra_draw") {
    const player = getCurrentPlayer(state);
    const group = String(action.group || "");
    if (!["Crew", "Hardware", "Action", "crew", "hardware", "action"].includes(group)) return { ok: false, reason: "Invalid draw group." };
    if (player.draw_state && player.draw_state.extra_draw_used) return { ok: false, reason: "Extra draw already used." };
    if (player.mana < 4) return { ok: false, reason: "Not enough mana." };
  }
  if (action.type === "fire_weapon_at_part") {
    const player = getCurrentPlayer(state);
    const weapon = player.weapons[action.weapon_index];
    if (!weapon) return { ok: false, reason: "Invalid weapon index." };
    if (weapon.used_this_turn) return { ok: false, reason: "Weapon already used this turn." };
    if (weapon.disabled) return { ok: false, reason: "Weapon is disabled." };
    const cost = getEffectiveWeaponAttackCost(player, weapon);
    if (player.mana < cost) return { ok: false, reason: "Not enough mana." };
    return validateTarget(state, action);
  }
  return { ok: true };
}

module.exports = {
  validateAction,
  validateCardPlay,
  validateSlot,
  validateCrewRequirement,
  validateTarget,
  getEffectiveCardCost,
  getEffectiveWeaponAttackCost,
};

"use strict";

const { createInitialBattle } = require("./aircraft_state");
const { getDrawGroup } = require("./aircraft_cards");
const { dealDamageToPart } = require("./aircraft_damage");
const { validateAction, getEffectiveCardCost, getEffectiveWeaponAttackCost } = require("./aircraft_validator");
const { clampStability, manaForTurn, normalizeInt } = require("./aircraft_rules");

function getCurrentPlayer(state) {
  return state.players[state.current_player_index];
}

function getOpponent(state) {
  return state.players[state.current_player_index === 0 ? 1 : 0];
}

function addLog(state, text) {
  state.battle_log.push(text);
  if (state.battle_log.length > 120) state.battle_log.shift();
}

function drawCard(player) {
  const card = player.deck.shift();
  if (card) {
    player.hand.push(card);
    return card;
  }
  player.draw_state.fatigue += 1;
  player.full_hp = Math.max(0, player.full_hp - player.draw_state.fatigue);
  return null;
}

function drawCardByGroup(player, group) {
  const normalizedGroup = String(group || "").toLowerCase();
  const index = player.deck.findIndex((card) => getDrawGroup(card) === normalizedGroup);
  if (index < 0) return drawCard(player);
  const [card] = player.deck.splice(index, 1);
  player.hand.push(card);
  return card;
}

function startTurn(state, player) {
  player.max_mana = manaForTurn(state.turn_number);
  player.mana = player.max_mana;
  player.draw_state.extra_draw_used = false;
  for (const weapon of player.weapons) {
    if (weapon) weapon.used_this_turn = false;
  }
  drawCard(player);
  addLog(state, `${player.aircraft_name} started turn ${state.turn_number}.`);
}

function endTurn(state) {
  state.current_player_index = state.current_player_index === 0 ? 1 : 0;
  if (state.current_player_index === 0) state.turn_number += 1;
  startTurn(state, getCurrentPlayer(state));
}

function checkWin(state) {
  for (const player of state.players) {
    const fuselage = player.parts.find((part) => part.part_name.includes("Fuselage"));
    if (player.full_hp <= 0 || player.stability <= 0 || (fuselage && fuselage.destroyed)) {
      player.has_lost = true;
    }
  }
  const losers = state.players.filter((player) => player.has_lost);
  if (losers.length > 0) {
    state.battle_over = true;
    const winner = state.players.find((player) => !player.has_lost);
    state.winner_index = winner ? winner.player_index : null;
    state.result_text = winner ? `${winner.aircraft_name} wins.` : "Draw.";
    addLog(state, state.result_text);
  }
}

function payCardCost(player, card) {
  const cost = getEffectiveCardCost(player, card);
  player.mana -= cost;
  player.next_bonuses.card_cost = 0;
  return cost;
}

function cardToCrew(card) {
  return { card_id: card.id, name: card.name, role: card.role || "crew", hp: card.hp || 3, max_hp: card.hp || 3, injured: false, status: "healthy" };
}

function cardToWeapon(card) {
  return { card_id: card.id, name: card.name, damage: card.damage || 0, attack_cost: card.attack_cost || 1, tags: card.tags || [], used_this_turn: false, disabled: false };
}

function cardToEquipment(card) {
  return { card_id: card.id, name: card.name, disabled: false, armor_bonus: card.armor_bonus || 0 };
}

function healPart(player, partNameFragment, amount) {
  const parts = player.parts.filter((part) => part.part_name.includes(partNameFragment));
  for (const part of parts) {
    part.hp = Math.min(part.max_hp, part.hp + amount);
    if (part.hp > 0) {
      part.destroyed = false;
      part.disabled = false;
    }
  }
  return parts.length;
}

function resolveCardEffect(state, player, card, action, rng = Math.random) {
  const opponent = getOpponent(state);
  const amount = normalizeInt(card.amount, 0);
  switch (card.effect_id) {
    case "play_crew":
      player.crew[action.slot_index] = cardToCrew(card);
      addLog(state, `${player.aircraft_name} crew joined: ${card.name}.`);
      break;
    case "add_weapon":
      player.weapons[action.slot_index] = cardToWeapon(card);
      addLog(state, `${player.aircraft_name} installed weapon: ${card.name}.`);
      break;
    case "add_equipment":
    case "add_equipment_engine_guard":
    case "add_equipment_stabilizer":
    case "add_equipment_aux_reactor":
      player.equipment[action.slot_index] = cardToEquipment(card);
      if (card.effect_id === "add_equipment_stabilizer") player.stability = Math.min(player.tolerance, player.stability + 6);
      if (card.effect_id === "add_equipment_aux_reactor") player.mana += 1;
      addLog(state, `${player.aircraft_name} installed equipment: ${card.name}.`);
      break;
    case "add_equipment_armor":
      player.equipment[action.slot_index] = cardToEquipment(card);
      player.parts.forEach((part) => { part.armor += card.armor_bonus || 1; });
      addLog(state, `${card.name} raised armor on all own parts.`);
      break;
    case "repair_part":
      player.parts.forEach((part) => { part.hp = Math.min(part.max_hp, part.hp + amount); });
      addLog(state, `${card.name} repaired all own parts.`);
      break;
    case "repair_fuselage":
      healPart(player, "Fuselage", amount);
      break;
    case "repair_engine":
      healPart(player, "Engine", amount);
      break;
    case "repair_wing":
    case "repair_all_wings":
      healPart(player, "Wing", amount);
      break;
    case "repair_tail":
      healPart(player, "Tail", amount);
      break;
    case "repair_restart_engine":
      healPart(player, "Engine", amount);
      player.stability = Math.min(player.tolerance, player.stability + 6);
      break;
    case "heal_crew":
    case "heal_crew_or_draw": {
      const crew = player.crew.find((item) => item && item.injured);
      if (crew) {
        crew.injured = false;
        crew.status = "healthy";
        crew.hp = Math.max(1, crew.hp);
        addLog(state, `${crew.name} recovered.`);
      } else {
        drawCard(player);
        addLog(state, `${card.name} drew a card.`);
      }
      break;
    }
    case "gain_stability":
      player.stability = Math.min(player.tolerance, player.stability + amount);
      break;
    case "lose_stability":
      player.stability -= amount;
      clampStability(player);
      break;
    case "gain_mana":
      player.mana += amount;
      break;
    case "buff_next_weapon_damage":
      player.next_bonuses.weapon_damage += amount;
      break;
    case "buff_next_weapon_attack_cost":
      player.next_bonuses.weapon_attack_cost += amount;
      break;
    case "buff_next_card_cost":
      player.next_bonuses.card_cost += amount;
      break;
    case "armor_all_own_parts":
      player.parts.forEach((part) => { part.armor += Math.max(1, amount || 1); });
      break;
    case "draw_hardware":
      drawCardByGroup(player, "hardware");
      break;
    case "draw_group":
      drawCardByGroup(player, card.draw_group || "action");
      break;
    case "draw_crew_and_hardware":
      drawCardByGroup(player, "crew");
      drawCardByGroup(player, "hardware");
      break;
    case "supply_drop":
      drawCard(player);
      player.mana += 1;
      break;
    case "radio_jam":
      opponent.next_bonuses.card_cost += 1;
      addLog(state, `${opponent.aircraft_name}'s next card costs 1 more.`);
      break;
    case "special_funeral_bombing_run":
      fireWeaponAtPart(state, player, { name: card.name, damage: 24, attack_cost: 0, tags: ["random_splash_6"] }, opponent.parts.find((part) => !part.destroyed), rng);
      break;
    case "special_reactor_overpressure":
      player.mana += 3;
      player.stability -= 6;
      clampStability(player);
      break;
    case "special_reckless_ace_dive":
      player.next_bonuses.weapon_damage += 12;
      player.stability = Math.max(0, player.stability - 4);
      break;
    case "special_armor_faith_speech":
      player.stability = Math.min(player.tolerance, player.stability + 14);
      break;
    case "special_cathedral_funeral_bell":
      opponent.stability = Math.max(0, opponent.stability - 10);
      break;
    case "special_tortoise_shell_protocol":
      player.parts.forEach((part) => { part.armor += 2; });
      player.stability = Math.min(player.tolerance, player.stability + 8);
      break;
    default:
      addLog(state, `${card.name} resolved as placeholder.`);
      break;
  }
  clampStability(player);
  clampStability(opponent);
}

function parseTagValue(tag, prefix) {
  if (!tag.startsWith(prefix)) return null;
  return normalizeInt(tag.slice(prefix.length), 0);
}

function fireWeaponAtPart(state, player, weapon, part, rng = Math.random) {
  const opponent = state.players.find((candidate) => candidate !== player);
  let damage = normalizeInt(weapon.damage, 0) + normalizeInt(player.next_bonuses.weapon_damage, 0);
  for (const tag of weapon.tags || []) {
    const engineBonus = parseTagValue(tag, "engine_bonus_damage_");
    const tailBonus = parseTagValue(tag, "tail_bonus_stability_damage_");
    const selfStability = parseTagValue(tag, "self_stability_minus_");
    const selfPartDamage = parseTagValue(tag, "self_random_part_damage_");
    if (engineBonus && part.part_name.includes("Engine")) damage += engineBonus;
    if (tailBonus && part.part_name.includes("Tail")) opponent.stability = Math.max(0, opponent.stability - tailBonus);
    if (selfStability) player.stability = Math.max(0, player.stability - selfStability);
    if (selfPartDamage) {
      const ownPart = player.parts[Math.floor(rng() * player.parts.length)];
      dealDamageToPart(state, player, ownPart, selfPartDamage, `${weapon.name} backlash`, rng).log_lines.forEach((line) => addLog(state, line));
    }
  }
  player.next_bonuses.weapon_damage = 0;
  const result = dealDamageToPart(state, opponent, part, damage, weapon.name, rng);
  result.log_lines.forEach((line) => addLog(state, line));
  for (const tag of weapon.tags || []) {
    const splash = parseTagValue(tag, "random_splash_");
    if (splash) {
      const splashTargets = opponent.parts.filter((candidate) => candidate !== part && !candidate.destroyed);
      if (splashTargets.length > 0) {
        const splashPart = splashTargets[Math.floor(rng() * splashTargets.length)];
        dealDamageToPart(state, opponent, splashPart, splash, `${weapon.name} splash`, rng).log_lines.forEach((line) => addLog(state, line));
      }
    }
  }
}

function clearTargeting(state) {
  state.targeting = { active: false, mode: "", card_index: -1, weapon_index: -1, source_player_index: -1, target_side: "", target_kind: "", prompt: "" };
}

function applyAction(state, action, options = {}) {
  const rng = options.rng || Math.random;
  if (action && action.type === "reset_battle") return { ok: true, state: createInitialBattle(action.options || {}) };
  const validation = validateAction(state, action);
  if (!validation.ok) return { ok: false, reason: validation.reason, state };

  const player = getCurrentPlayer(state);
  if (action.type === "play_card" || action.type === "play_card_with_target") {
    const card = player.hand[action.card_index];
    payCardCost(player, card);
    player.hand.splice(action.card_index, 1);
    resolveCardEffect(state, player, card, action, rng);
    addLog(state, `${player.aircraft_name} played ${card.name}.`);
  } else if (action.type === "fire_weapon") {
    state.targeting = { active: true, mode: "fire_weapon_at_part", card_index: -1, weapon_index: action.weapon_index, source_player_index: state.current_player_index, target_side: "enemy", target_kind: "part", prompt: "Choose enemy part to fire at." };
  } else if (action.type === "fire_weapon_at_part") {
    const weapon = player.weapons[action.weapon_index];
    const cost = getEffectiveWeaponAttackCost(player, weapon);
    player.mana -= cost;
    player.next_bonuses.weapon_attack_cost = 0;
    weapon.used_this_turn = true;
    fireWeaponAtPart(state, player, weapon, validation.part, rng);
    clearTargeting(state);
  } else if (action.type === "extra_draw") {
    if (player.draw_state.extra_draw_used) return { ok: false, reason: "Extra draw already used.", state };
    const beforeMana = player.mana;
    const group = String(action.group || "");
    player.mana -= 4;
    player.draw_state.extra_draw_used = true;
    const drawn = drawCardByGroup(player, group);
    addLog(state, `${player.aircraft_name} used extra draw: ${group}.`);
    if (drawn) addLog(state, `${player.aircraft_name} drew ${drawn.name}.`);
    if (!drawn) addLog(state, `${player.aircraft_name} had no card to draw.`);
    if (options.client_id) {
      console.log("[AIRCRAFT_ACTION_CHECK] extra_draw", {
        client_id: options.client_id,
        group,
        before_mana: beforeMana,
        before_deck: options.before_deck,
        before_hand: options.before_hand,
        after_mana: player.mana,
        after_deck: player.deck.length,
        after_hand: player.hand.length
      });
    }
  } else if (action.type === "leader_ability") {
    if (player.leader_ability_used) return { ok: false, reason: "Leader ability already used.", state };
    player.leader_ability_used = true;
    player.stability = Math.min(player.tolerance, player.stability + 8);
    player.next_bonuses.weapon_damage += 4;
    addLog(state, `${player.leader_name} used leader ability.`);
  } else if (action.type === "end_turn") {
    clearTargeting(state);
    endTurn(state);
  } else if (action.type === "surrender") {
    player.has_lost = true;
    state.battle_over = true;
    state.winner_index = player.player_index === 0 ? 1 : 0;
    state.result_text = `${state.players[state.winner_index].aircraft_name} wins by surrender.`;
    addLog(state, state.result_text);
  } else if (action.type === "cancel_targeting") {
    clearTargeting(state);
  }
  checkWin(state);
  return { ok: true, state };
}

module.exports = {
  applyAction,
  getCurrentPlayer,
  getOpponent,
  addLog,
  drawCard,
  drawCardByGroup,
  startTurn,
  endTurn,
  checkWin,
  payCardCost,
  resolveCardEffect,
  fireWeaponAtPart,
};

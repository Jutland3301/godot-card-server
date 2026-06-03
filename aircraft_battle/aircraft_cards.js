"use strict";

const { isValidAircraftId } = require("./aircraft_rules");

const CARD_DEFS = [
  { id: "rookie_pilot", name: "Rookie Pilot", type: "crew", cost: 1, role: "pilot", hp: 2, effect_id: "play_crew" },
  { id: "veteran_pilot", name: "Veteran Pilot", type: "crew", cost: 3, role: "pilot", hp: 4, effect_id: "play_crew", text: "Reliable command crew." },
  { id: "young_gunner", name: "Young Gunner", type: "crew", cost: 2, role: "gunner", hp: 3, effect_id: "play_crew" },
  { id: "field_mechanic", name: "Field Mechanic", type: "crew", cost: 2, role: "mechanic", hp: 3, effect_id: "play_crew" },
  { id: "combat_medic", name: "Combat Medic", type: "crew", cost: 2, role: "medic", hp: 3, effect_id: "play_crew" },
  { id: "radio_operator", name: "Radio Operator", type: "crew", cost: 2, role: "radio", hp: 3, effect_id: "play_crew" },
  { id: "senior_mechanic", name: "Senior Mechanic", type: "crew", cost: 4, role: "mechanic", hp: 5, effect_id: "play_crew" },
  { id: "calm_medic", name: "Calm Medic", type: "crew", cost: 3, role: "medic", hp: 4, effect_id: "play_crew" },

  { id: "light_machine_gun", name: "Light Machine Gun", type: "weapon", cost: 2, damage: 10, attack_cost: 1, tags: [], effect_id: "add_weapon" },
  { id: "heavy_machine_gun", name: "Heavy Machine Gun", type: "weapon", cost: 3, damage: 16, attack_cost: 2, tags: [], effect_id: "add_weapon" },
  { id: "wing_cannon", name: "Wing Cannon", type: "weapon", cost: 4, damage: 22, attack_cost: 3, tags: ["random_splash_4"], effect_id: "add_weapon" },
  { id: "bomb_rack", name: "Bomb Rack", type: "weapon", cost: 4, damage: 26, attack_cost: 3, tags: ["self_stability_minus_4"], effect_id: "add_weapon" },
  { id: "cathedral_heavy_bomb", name: "Cathedral Heavy Bomb", type: "weapon", cost: 6, damage: 38, attack_cost: 4, tags: ["random_splash_8", "self_stability_minus_6"], effect_id: "add_weapon" },
  { id: "engine_piercer", name: "Engine Piercer", type: "weapon", cost: 3, damage: 14, attack_cost: 2, tags: ["engine_bonus_damage_8"], effect_id: "add_weapon" },
  { id: "tail_cutter", name: "Tail Cutter", type: "weapon", cost: 3, damage: 13, attack_cost: 2, tags: ["tail_bonus_stability_damage_8"], effect_id: "add_weapon" },
  { id: "nose_gun", name: "Nose Gun", type: "weapon", cost: 2, damage: 12, attack_cost: 1, tags: [], effect_id: "add_weapon" },

  { id: "extra_armor_plate", name: "Extra Armor Plate", type: "equipment", cost: 2, armor_bonus: 1, effect_id: "add_equipment_armor" },
  { id: "engine_guard", name: "Engine Guard", type: "equipment", cost: 2, effect_id: "add_equipment_engine_guard" },
  { id: "stabilizer_fin", name: "Stabilizer Fin", type: "equipment", cost: 2, effect_id: "add_equipment_stabilizer" },
  { id: "auxiliary_reactor", name: "Auxiliary Reactor", type: "equipment", cost: 3, effect_id: "add_equipment_aux_reactor" },
  { id: "armor_refit", name: "Armor Refit", type: "equipment", cost: 4, effect_id: "armor_all_own_parts", amount: 1 },
  { id: "fuel_line_shield", name: "Fuel Line Shield", type: "equipment", cost: 2, effect_id: "add_equipment" },

  { id: "patch_the_fuselage", name: "Patch the Fuselage", type: "repair", cost: 2, effect_id: "repair_fuselage", amount: 12 },
  { id: "emergency_engine_repair", name: "Emergency Engine Repair", type: "repair", cost: 2, effect_id: "repair_engine", amount: 10 },
  { id: "wing_repair_crew", name: "Wing Repair Crew", type: "repair", cost: 2, effect_id: "repair_wing", amount: 10 },
  { id: "tail_rebalance", name: "Tail Rebalance", type: "repair", cost: 2, effect_id: "repair_tail", amount: 10 },
  { id: "general_repair_team", name: "General Repair Team", type: "repair", cost: 4, effect_id: "repair_part", amount: 8 },
  { id: "engine_restart_ritual", name: "Engine Restart Ritual", type: "repair", cost: 3, effect_id: "repair_restart_engine", amount: 8 },

  { id: "evasive_roll", name: "Evasive Roll", type: "maneuver", cost: 1, effect_id: "gain_stability", amount: 8 },
  { id: "dive_attack", name: "Dive Attack", type: "maneuver", cost: 2, effect_id: "buff_next_weapon_damage", amount: 8 },
  { id: "defensive_formation", name: "Defensive Formation", type: "maneuver", cost: 2, effect_id: "armor_all_own_parts", amount: 1 },
  { id: "open_firing_line", name: "Open Firing Line", type: "maneuver", cost: 1, effect_id: "buff_next_weapon_attack_cost", amount: -1 },

  { id: "radioed_supply_drop", name: "Radioed Supply Drop", type: "support", cost: 2, effect_id: "supply_drop" },
  { id: "radio_jam", name: "Radio Jam", type: "support", cost: 2, effect_id: "radio_jam" },
  { id: "emergency_supply_signal", name: "Emergency Supply Signal", type: "support", cost: 1, effect_id: "draw_group", draw_group: "hardware" },
  { id: "maintenance_order", name: "Maintenance Order", type: "support", cost: 2, effect_id: "heal_crew_or_draw" },

  { id: "realist_officer_order", name: "Realist Officer Order", type: "special", cost: 3, effect_id: "draw_crew_and_hardware" },
  { id: "funeral_bombing_run", name: "Funeral Bombing Run", type: "special", cost: 5, effect_id: "special_funeral_bombing_run" },
  { id: "reactor_overpressure", name: "Reactor Overpressure", type: "special", cost: 3, effect_id: "special_reactor_overpressure" },
  { id: "armor_faith_speech", name: "Armor Faith Speech", type: "special", cost: 3, effect_id: "special_armor_faith_speech" },
  { id: "cathedral_funeral_bell", name: "Cathedral Funeral Bell", type: "special", cost: 4, effect_id: "special_cathedral_funeral_bell" },
  { id: "tortoise_shell_protocol", name: "Tortoise Shell Protocol", type: "special", cost: 4, effect_id: "special_tortoise_shell_protocol" },
  { id: "reckless_ace_dive", name: "Reckless Ace Dive", type: "special", cost: 3, effect_id: "special_reckless_ace_dive" },
];

const CARD_BY_ID = Object.fromEntries(CARD_DEFS.map((card) => [card.id, card]));
const ARCHETYPE_CARDS = {
  swift_needle: ["rookie_pilot", "young_gunner", "light_machine_gun", "nose_gun", "evasive_roll", "dive_attack", "open_firing_line", "reckless_ace_dive", "tail_cutter", "emergency_supply_signal"],
  iron_gull: ["veteran_pilot", "radio_operator", "field_mechanic", "heavy_machine_gun", "engine_piercer", "extra_armor_plate", "radioed_supply_drop", "radio_jam", "realist_officer_order", "general_repair_team"],
  bastion_tortoise: ["senior_mechanic", "combat_medic", "wing_cannon", "engine_guard", "stabilizer_fin", "armor_refit", "defensive_formation", "armor_faith_speech", "tortoise_shell_protocol", "wing_repair_crew"],
  crown_cathedral: ["calm_medic", "radio_operator", "bomb_rack", "cathedral_heavy_bomb", "auxiliary_reactor", "fuel_line_shield", "patch_the_fuselage", "funeral_bombing_run", "cathedral_funeral_bell", "reactor_overpressure"],
};

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function getAllCards() {
  return CARD_DEFS.map(deepCopy);
}

function getCardById(cardId) {
  return CARD_BY_ID[cardId] ? deepCopy(CARD_BY_ID[cardId]) : null;
}

function createCard(cardId) {
  const card = getCardById(cardId);
  if (!card) throw new Error(`Unknown aircraft card id: ${cardId}`);
  return card;
}

function createDeckFromIds(cardIds) {
  if (!Array.isArray(cardIds)) throw new Error("Deck ids must be an array.");
  return cardIds.map(createCard);
}

function createDeckForAircraft(aircraftId) {
  if (!isValidAircraftId(aircraftId)) throw new Error(`Invalid aircraft id: ${aircraftId}`);
  const base = ARCHETYPE_CARDS[aircraftId];
  const deckIds = [];
  while (deckIds.length < 40) {
    for (const id of base) {
      if (deckIds.length < 40) deckIds.push(id);
    }
  }
  return createDeckFromIds(deckIds);
}

function getDrawGroup(card) {
  if (!card) return "other";
  if (["weapon", "equipment"].includes(card.type)) return "hardware";
  if (card.type === "crew") return "crew";
  return "action";
}

function checkDuplicateCardIds(cardIds) {
  const counts = {};
  for (const id of cardIds) counts[id] = (counts[id] || 0) + 1;
  return Object.entries(counts).filter(([, count]) => count > 4).map(([id, count]) => ({ id, count }));
}

function countCardsByType(cards) {
  const counts = {};
  for (const card of cards) counts[card.type] = (counts[card.type] || 0) + 1;
  return counts;
}

module.exports = {
  getAllCards,
  getCardById,
  createCard,
  createDeckForAircraft,
  createDeckFromIds,
  getDrawGroup,
  checkDuplicateCardIds,
  countCardsByType,
};

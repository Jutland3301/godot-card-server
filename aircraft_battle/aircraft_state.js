"use strict";

const { createCard, createDeckForAircraft, createDeckFromIds } = require("./aircraft_cards");
const { manaForTurn } = require("./aircraft_rules");

const AIRCRAFT_DEFS = {
  swift_needle: {
    name: "Swift Needle", full_hp: 90, tolerance: 36, slots: { crew: 4, weapons: 2, equipment: 2 }, leader: "Ace of Reckless Speed",
    parts: [
      ["Engine", 18, 0, true], ["Left Wing", 25, 1, true], ["Right Wing", 25, 1, true], ["Fuselage", 45, 2, false], ["Tail", 18, 0, true],
    ],
  },
  iron_gull: {
    name: "Iron Gull", full_hp: 120, tolerance: 48, slots: { crew: 5, weapons: 3, equipment: 3 }, leader: "Realist Air Officer",
    parts: [
      ["Left Engine", 22, 1, true], ["Right Engine", 22, 1, true], ["Left Wing", 32, 2, true], ["Right Wing", 32, 2, true], ["Fuselage", 60, 3, false], ["Tail", 24, 1, true],
    ],
  },
  bastion_tortoise: {
    name: "Bastion Tortoise", full_hp: 160, tolerance: 64, slots: { crew: 6, weapons: 3, equipment: 4 }, leader: "Old Commander of Armor Faith",
    parts: [
      ["Left Engine", 28, 2, true], ["Right Engine", 28, 2, true], ["Left Wing", 42, 4, true], ["Right Wing", 42, 4, true], ["Fuselage", 95, 6, false], ["Tail", 30, 3, true],
    ],
  },
  crown_cathedral: {
    name: "Crown Cathedral", full_hp: 190, tolerance: 76, slots: { crew: 8, weapons: 5, equipment: 5 }, leader: "Funeral Captain of the Bomber",
    parts: [
      ["Engine 1", 26, 1, true], ["Engine 2", 26, 1, true], ["Engine 3", 26, 1, true], ["Engine 4", 26, 1, true], ["Left Wing", 45, 2, true], ["Right Wing", 45, 2, true], ["Fuselage", 90, 4, false], ["Tail", 32, 1, true],
    ],
  },
};

function partFromTuple(tuple) {
  const [part_name, max_hp, armor, can_be_disabled] = tuple;
  return { part_name, hp: max_hp, max_hp, armor, destroyed: false, disabled: false, can_be_disabled };
}

function makeEmptySlots(count) {
  return Array.from({ length: count }, () => null);
}

function makeStarterPilot() {
  const pilot = createCard("rookie_pilot");
  return { card_id: pilot.id, name: "Starter Pilot", role: "pilot", hp: 2, max_hp: 2, injured: false, status: "healthy" };
}

function createPlayer(index, aircraftId, deckIds) {
  const def = AIRCRAFT_DEFS[aircraftId];
  const deck = Array.isArray(deckIds) && deckIds.length > 0 ? createDeckFromIds(deckIds) : createDeckForAircraft(aircraftId);
  const player = {
    player_index: index,
    aircraft_id: aircraftId,
    aircraft_name: def.name,
    leader_name: def.leader,
    full_hp: def.full_hp,
    max_full_hp: def.full_hp,
    tolerance: def.tolerance,
    stability: def.tolerance,
    mana: 0,
    max_mana: 0,
    slots: { ...def.slots },
    parts: def.parts.map(partFromTuple),
    crew: makeEmptySlots(def.slots.crew),
    weapons: makeEmptySlots(def.slots.weapons),
    equipment: makeEmptySlots(def.slots.equipment),
    deck,
    hand: [],
    discard: [],
    draw_state: { fatigue: 0, extra_draw_used: false },
    next_bonuses: { weapon_damage: 0, weapon_attack_cost: 0, card_cost: 0 },
    leader_ability_used: false,
    has_lost: false,
  };
  player.crew[0] = makeStarterPilot();
  return player;
}

function drawOpening(player, count) {
  for (let i = 0; i < count; i += 1) {
    const card = player.deck.shift();
    if (card) player.hand.push(card);
  }
}

function createInitialBattle(options = {}) {
  const p1Aircraft = options.player1_aircraft_id || "iron_gull";
  const p2Aircraft = options.player2_aircraft_id || "crown_cathedral";
  const state = {
    schema_version: 1,
    game_type: "aircraft_local_mvp",
    turn_number: 1,
    current_player_index: 0,
    battle_over: false,
    winner_index: null,
    result_text: "",
    players: [
      createPlayer(0, p1Aircraft, options.player1_deck_ids),
      createPlayer(1, p2Aircraft, options.player2_deck_ids),
    ],
    battle_log: [],
    targeting: {
      active: false,
      mode: "",
      card_index: -1,
      weapon_index: -1,
      source_player_index: -1,
      target_side: "",
      target_kind: "",
      prompt: "",
    },
    rng_note: "server_rng",
  };
  drawOpening(state.players[0], 4);
  drawOpening(state.players[1], 5);
  for (const player of state.players) {
    player.max_mana = manaForTurn(1);
    player.mana = player.player_index === state.current_player_index ? player.max_mana : 0;
  }
  state.battle_log.push("[Aircraft] Server battle created.");
  state.battle_log.push("[Aircraft] Player 1 starts turn 1.");
  return state;
}

module.exports = { AIRCRAFT_DEFS, createInitialBattle };

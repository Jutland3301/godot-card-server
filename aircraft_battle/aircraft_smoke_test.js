"use strict";

const assert = require("assert");
const { createInitialBattle } = require("./aircraft_state");
const { applyAction } = require("./aircraft_engine");
const { serializeBattle, validateBattleState } = require("./aircraft_serializer");

function firstCardIndex(player, predicate) {
  return player.hand.findIndex(predicate);
}

function main() {
  let state = createInitialBattle({
    player1_aircraft_id: "iron_gull",
    player2_aircraft_id: "crown_cathedral",
    player1_deck_ids: [
      "light_machine_gun", "rookie_pilot", "extra_armor_plate", "evasive_roll",
      "nose_gun", "field_mechanic", "patch_the_fuselage", "radioed_supply_drop",
      "wing_cannon", "engine_piercer", "tail_cutter", "heavy_machine_gun",
      "defensive_formation", "open_firing_line", "general_repair_team", "radio_jam",
      "veteran_pilot", "young_gunner", "combat_medic", "senior_mechanic",
      "calm_medic", "bomb_rack", "cathedral_heavy_bomb", "auxiliary_reactor",
      "armor_refit", "fuel_line_shield", "emergency_engine_repair", "wing_repair_crew",
      "tail_rebalance", "engine_restart_ritual", "dive_attack", "emergency_supply_signal",
      "realist_officer_order", "funeral_bombing_run", "reactor_overpressure", "armor_faith_speech",
      "cathedral_funeral_bell", "tortoise_shell_protocol", "reckless_ace_dive", "radio_operator",
    ],
  });

  let player = state.players[0];
  assert.strictEqual(state.players[0].hand.length, 4, "player 1 opening hand should be 4");
  assert.strictEqual(state.players[1].hand.length, 5, "player 2 opening hand should be 5");
  assert.ok(state.players[0].deck.length > 0, "player 1 deck should be built");
  assert.ok(state.players[1].deck.length > 0, "player 2 deck should be built");
  assert.strictEqual(state.players[0].max_mana, 1, "player 1 max mana should initialize");
  assert.strictEqual(state.players[1].max_mana, 1, "player 2 max mana should initialize");
  player.mana = 10;
  player.max_mana = 10;
  const weaponIndex = firstCardIndex(player, (card) => card.type === "weapon");
  assert.ok(weaponIndex >= 0, "expected a weapon in opening hand");
  let result = applyAction(state, { type: "play_card", card_index: weaponIndex, slot_index: 0 });
  assert.strictEqual(result.ok, true, result.reason);
  state = result.state;
  assert.ok(state.players[0].weapons[0], "weapon should be installed");

  result = applyAction(state, { type: "fire_weapon", weapon_index: 0 });
  assert.strictEqual(result.ok, true, result.reason);
  assert.strictEqual(result.state.targeting.active, true);

  result = applyAction(state, { type: "fire_weapon_at_part", weapon_index: 0, target_player_index: 1, part_index: 0 });
  assert.strictEqual(result.ok, true, result.reason);
  state = result.state;
  assert.ok(state.players[1].parts[0].hp < state.players[1].parts[0].max_hp, "target part should take damage");

  const beforeDrawMana = state.players[0].mana;
  const beforeDrawDeck = state.players[0].deck.length;
  const beforeDrawHand = state.players[0].hand.length;
  result = applyAction(state, { type: "extra_draw", group: "Crew" });
  assert.strictEqual(result.ok, true, result.reason);
  state = result.state;
  assert.strictEqual(state.players[0].mana, beforeDrawMana - 4, "extra draw should cost 4 mana");
  assert.strictEqual(state.players[0].deck.length, beforeDrawDeck - 1, "extra draw should remove one deck card");
  assert.strictEqual(state.players[0].hand.length, beforeDrawHand + 1, "extra draw should add one hand card");
  result = applyAction(state, { type: "leader_ability" });
  assert.strictEqual(result.ok, true, result.reason);
  result = applyAction(state, { type: "end_turn" });
  assert.strictEqual(result.ok, true, result.reason);
  state = result.state;
  assert.strictEqual(state.current_player_index, 1);

  result = applyAction(state, { type: "surrender" });
  assert.strictEqual(result.ok, true, result.reason);
  assert.strictEqual(result.state.battle_over, true);

  result = applyAction(result.state, { type: "reset_battle" });
  assert.strictEqual(result.ok, true, result.reason);
  const serialized = serializeBattle(result.state);
  assert.doesNotThrow(() => JSON.stringify(serialized));
  assert.strictEqual(validateBattleState(serialized).ok, true);

  console.log("[AircraftSmokeTest] passed");
}

try {
  main();
} catch (error) {
  console.error("[AircraftSmokeTest] failed");
  console.error(error);
  process.exit(1);
}

"use strict";

const assert = require("assert");
const { createInitialBattle } = require("./aircraft_state");
const { makeAction, validateAction } = require("./aircraft_actions");
const { serializeBattle, cloneBattleState, validateBattleState } = require("./aircraft_serializer");
const { getAllCards, checkDuplicateCardIds, countCardsByType } = require("./aircraft_cards");

function main() {
  const state = createInitialBattle();
  const serialized = serializeBattle(state);
  const clone = cloneBattleState(serialized);
  const validation = validateBattleState(clone);
  assert.strictEqual(validation.ok, true, validation.reason);

  const rootKeys = ["schema_version", "game_type", "turn_number", "current_player_index", "battle_over", "winner_index", "result_text", "players", "battle_log", "targeting", "rng_note"];
  for (const key of rootKeys) assert.ok(Object.prototype.hasOwnProperty.call(clone, key), `missing root key ${key}`);

  const playerKeys = ["aircraft_id", "aircraft_name", "full_hp", "max_full_hp", "tolerance", "stability", "mana", "max_mana", "slots", "parts", "crew", "weapons", "equipment", "deck", "hand", "draw_state", "next_bonuses", "has_lost"];
  for (const player of clone.players) {
    for (const key of playerKeys) assert.ok(Object.prototype.hasOwnProperty.call(player, key), `missing player key ${key}`);
  }

  const invalid = validateAction(clone, makeAction("not_real"));
  assert.strictEqual(invalid.ok, false);
  assert.strictEqual(clone.schema_version, 1);
  assert.strictEqual(clone.game_type, "aircraft_local_mvp");
  assert.strictEqual(clone.rng_note, "server_rng");

  const cards = getAllCards();
  assert.ok(cards.length >= 40, "expected at least 40 Aircraft cards");
  const typeCounts = countCardsByType(cards);
  assert.ok(typeCounts.crew >= 8, "crew cards missing");
  assert.ok(typeCounts.weapon >= 8, "weapon cards missing");
  assert.deepStrictEqual(checkDuplicateCardIds(cards.map((card) => card.id)), []);

  console.log("[AircraftSchemaParityTest] passed");
}

try {
  main();
} catch (error) {
  console.error("[AircraftSchemaParityTest] failed");
  console.error(error);
  process.exit(1);
}

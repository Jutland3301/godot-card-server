"use strict";

function cloneBattleState(state) {
  return JSON.parse(JSON.stringify(state));
}

function requiredKeys(object, keys) {
  return keys.every((key) => Object.prototype.hasOwnProperty.call(object, key));
}

function validateBattleState(state) {
  const rootKeys = ["schema_version", "game_type", "turn_number", "current_player_index", "battle_over", "winner_index", "result_text", "players", "battle_log", "targeting", "rng_note"];
  if (!state || typeof state !== "object") return { ok: false, reason: "State must be an object." };
  if (!requiredKeys(state, rootKeys)) return { ok: false, reason: "Missing root state keys." };
  if (state.schema_version !== 1) return { ok: false, reason: "Unsupported schema version." };
  if (state.game_type !== "aircraft_local_mvp") return { ok: false, reason: "Invalid game type." };
  if (!Array.isArray(state.players) || state.players.length !== 2) return { ok: false, reason: "State must have two players." };
  const playerKeys = ["aircraft_id", "aircraft_name", "full_hp", "max_full_hp", "tolerance", "stability", "mana", "max_mana", "slots", "parts", "crew", "weapons", "equipment", "deck", "hand", "draw_state", "next_bonuses", "has_lost"];
  for (const player of state.players) {
    if (!requiredKeys(player, playerKeys)) return { ok: false, reason: "Missing player keys." };
  }
  return { ok: true };
}

function normalizeBattleState(state) {
  const clone = cloneBattleState(state);
  clone.schema_version = 1;
  clone.game_type = "aircraft_local_mvp";
  clone.rng_note = "server_rng";
  return clone;
}

function serializeBattle(state) {
  return normalizeBattleState(state);
}

module.exports = {
  validateBattleState,
  cloneBattleState,
  serializeBattle,
  normalizeBattleState,
};

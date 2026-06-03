"use strict";

const { createInitialBattle } = require("./aircraft_state");
const { applyAction } = require("./aircraft_engine");
const { serializeBattle, validateBattleState } = require("./aircraft_serializer");

function firstEmptySlot(slots) {
  if (!Array.isArray(slots)) return -1;
  return slots.findIndex((slot) => slot === null || typeof slot === "undefined");
}

function normalizeAircraftAction(action = {}, state = null) {
  if (action.type) {
    return action;
  }

  const actionType = String(action.action_type || "");
  const payload = action.payload && typeof action.payload === "object" ? action.payload : {};
  const normalized = {
    type: actionType,
    ...payload,
  };

  if (payload.target && typeof payload.target === "object") {
    normalized.target_player_index = payload.target.player_index;
    if (payload.target.kind === "part") {
      normalized.part_index = payload.target.index;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "target_part_index")) {
    normalized.part_index = payload.target_part_index;
  }

  if (state && ["play_card", "play_card_with_target"].includes(normalized.type) && !Object.prototype.hasOwnProperty.call(normalized, "slot_index")) {
    const player = Array.isArray(state.players) ? state.players[state.current_player_index] : null;
    const card = player && Array.isArray(player.hand) ? player.hand[Number(normalized.card_index)] : null;
    if (card && card.type === "crew") normalized.slot_index = firstEmptySlot(player.crew);
    if (card && card.type === "weapon") normalized.slot_index = firstEmptySlot(player.weapons);
    if (card && card.type === "equipment") normalized.slot_index = firstEmptySlot(player.equipment);
  }

  return normalized;
}

function createAircraftMatchState(options = {}) {
  return serializeBattle(createInitialBattle(options));
}

function applyAircraftAction(state, action, options = {}) {
  const result = applyAction(state, normalizeAircraftAction(action, state), options);
  if (result.state) result.state = serializeBattle(result.state);
  return result;
}

function serializeAircraftState(state) {
  return serializeBattle(state);
}

function validateAircraftState(state) {
  return validateBattleState(state);
}

module.exports = {
  createAircraftMatchState,
  applyAircraftAction,
  serializeAircraftState,
  validateAircraftState,
  normalizeAircraftAction,
};

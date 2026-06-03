"use strict";

const VALID_AIRCRAFT_IDS = new Set([
  "swift_needle",
  "iron_gull",
  "bastion_tortoise",
  "crown_cathedral",
]);

function normalizeInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNonNegative(value) {
  return Math.max(0, normalizeInt(value, 0));
}

function manaForTurn(turnNumber) {
  return Math.min(10, Math.max(1, normalizeInt(turnNumber, 1)));
}

function clampStability(player) {
  player.stability = Math.max(0, Math.min(player.tolerance, normalizeInt(player.stability, 0)));
  return player.stability;
}

function stabilityBand(player) {
  const tolerance = Math.max(1, normalizeInt(player.tolerance, 1));
  const ratio = normalizeInt(player.stability, 0) / tolerance;
  if (ratio <= 0) return "broken";
  if (ratio < 0.34) return "critical";
  if (ratio < 0.67) return "shaken";
  return "steady";
}

function isValidAircraftId(aircraftId) {
  return VALID_AIRCRAFT_IDS.has(aircraftId);
}

module.exports = {
  VALID_AIRCRAFT_IDS,
  manaForTurn,
  clampStability,
  stabilityBand,
  normalizeInt,
  clampNonNegative,
  isValidAircraftId,
};

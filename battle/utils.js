"use strict";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function randomInt(max) {
  if (max <= 0) return -1;
  return Math.floor(Math.random() * max);
}

function randomItem(array) {
  if (!Array.isArray(array) || array.length <= 0) return null;
  return array[randomInt(array.length)];
}

function removeAt(array, index) {
  if (!Array.isArray(array)) return null;
  if (index < 0 || index >= array.length) return null;
  return array.splice(index, 1)[0] || null;
}

function otherSeat(seatId) {
  return seatId === "A" ? "B" : "A";
}

function seatToOwnerId(seatId) {
  if (seatId === "A") return "player1";
  if (seatId === "B") return "player2";
  return "";
}

function ownerIdToSeat(ownerId) {
  if (ownerId === "player1") return "A";
  if (ownerId === "player2") return "B";
  return "";
}

function normalizeOwnerToSeat(state, rawOwner) {
  const value = String(rawOwner || "");

  if (value === "A" || value === "B") return value;
  if (value === "player1") return "A";
  if (value === "player2") return "B";

  if (state && state.owner_to_seat_id && state.owner_to_seat_id[value]) {
    return state.owner_to_seat_id[value];
  }

  return value;
}

function normalizeSeatToOwner(state, rawSeat) {
  const value = String(rawSeat || "");

  if (value === "player1" || value === "player2") return value;
  if (value === "A") return "player1";
  if (value === "B") return "player2";

  if (state && state.seat_to_owner_id && state.seat_to_owner_id[value]) {
    return state.seat_to_owner_id[value];
  }

  return value;
}

function getPlayer(state, seatId) {
  if (!state) return null;

  if (!state.players) {
    state.players = {
      A: state.player1,
      B: state.player2
    };
  }

  return state.players[seatId] || null;
}

function getOpponent(state, seatId) {
  return getPlayer(state, otherSeat(seatId));
}

function getOwnerSeatOfCard(state, card) {
  if (!state || !card) return "";

  for (const seatId of ["A", "B"]) {
    const player = getPlayer(state, seatId);
    if (!player) continue;

    if (Array.isArray(player.board) && player.board.includes(card)) return seatId;
    if (Array.isArray(player.hand) && player.hand.includes(card)) return seatId;
    if (Array.isArray(player.graveyard) && player.graveyard.includes(card)) return seatId;
  }

  return "";
}

function isUnit(card) {
  return !!card && String(card.card_type || "").toLowerCase() === "unit";
}

function isSpell(card) {
  return !!card && String(card.card_type || "").toLowerCase() === "spell";
}

function cardName(card) {
  return card?.card_name || card?.card_id || "Unknown Card";
}

function cardId(card) {
  return card?.card_id || "";
}

function hasKeyword(card, keyword) {
  if (!card || !keyword) return false;
  const k = String(keyword).toLowerCase();
  return ensureArray(card.keywords).some(v => String(v).toLowerCase() === k);
}

function addKeyword(card, keyword) {
  if (!card || !keyword) return;
  if (!Array.isArray(card.keywords)) card.keywords = [];

  const text = String(keyword);
  if (!card.keywords.includes(text)) {
    card.keywords.push(text);
  }
}

function removeKeyword(card, keyword) {
  if (!card || !Array.isArray(card.keywords)) return;
  card.keywords = card.keywords.filter(v => String(v) !== String(keyword));
}

function hasTrait(card, trait) {
  if (!card || !trait) return false;
  const t = String(trait).toLowerCase();
  return ensureArray(card.traits).some(v => String(v).toLowerCase() === t);
}

function hasAnyTrait(card, traits) {
  for (const trait of ensureArray(traits)) {
    if (hasTrait(card, trait)) return true;
  }
  return false;
}

function addTrait(card, trait) {
  if (!card || !trait) return;
  if (!Array.isArray(card.traits)) card.traits = [];
  const text = String(trait);
  if (!card.traits.includes(text)) card.traits.push(text);
}

function getAbilities(card, triggerName = "") {
  const abilities = ensureArray(card?.abilities);
  if (!triggerName) return abilities;

  const trigger = String(triggerName).toLowerCase();
  return abilities.filter(ability => {
    if (!ability || typeof ability !== "object") return false;
    return String(ability.trigger || ability.trigger_id || "").toLowerCase() === trigger;
  });
}

function findRandomIndex(array, predicate) {
  if (!Array.isArray(array)) return -1;

  const candidates = [];
  for (let i = 0; i < array.length; i++) {
    if (predicate(array[i], i)) candidates.push(i);
  }

  if (candidates.length <= 0) return -1;
  return candidates[randomInt(candidates.length)];
}

module.exports = {
  deepClone,
  ensureArray,
  randomInt,
  randomItem,
  removeAt,
  otherSeat,
  seatToOwnerId,
  ownerIdToSeat,
  normalizeOwnerToSeat,
  normalizeSeatToOwner,
  getPlayer,
  getOpponent,
  getOwnerSeatOfCard,
  isUnit,
  isSpell,
  cardName,
  cardId,
  hasKeyword,
  addKeyword,
  removeKeyword,
  hasTrait,
  hasAnyTrait,
  addTrait,
  getAbilities,
  findRandomIndex
};

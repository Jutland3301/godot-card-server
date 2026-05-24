"use strict";

const C = require("./constants");
const U = require("./utils");
const S = require("./state");

function drawOne(state, seatId) {
  const player = U.getPlayer(state, seatId);
  if (!player) return null;

  if (player.deck.length <= 0) {
    player.hp -= 1;
    S.addLog(state, `${player.name} took 1 fatigue damage.`);
    return null;
  }

  const card = player.deck.pop();
  S.normalizeCard(card);

  if (player.hand.length >= C.MAX_HAND_SIZE) {
    player.graveyard.push(card);
    S.addLog(state, `${player.name} burned ${U.cardName(card)} because hand is full.`);
    return card;
  }

  player.hand.push(card);
  return card;
}

function drawCards(state, seatId, amount) {
  const count = Math.max(0, Number(amount || 0));
  const drawn = [];

  for (let i = 0; i < count; i++) {
    const card = drawOne(state, seatId);
    if (card) drawn.push(card);
  }

  return drawn;
}

function burnRandomCardFromHand(state, seatId, predicate = null) {
  const player = U.getPlayer(state, seatId);
  if (!player || player.hand.length <= 0) return null;

  const index = U.findRandomIndex(player.hand, (card) => {
    if (!predicate) return true;
    return predicate(card);
  });

  if (index < 0) return null;

  const card = player.hand.splice(index, 1)[0];
  player.graveyard.push(card);
  return card;
}

function drawRandomFromDeck(state, seatId, predicate) {
  const player = U.getPlayer(state, seatId);
  if (!player || player.deck.length <= 0) return null;

  const index = U.findRandomIndex(player.deck, predicate || (() => true));
  if (index < 0) return null;

  const card = player.deck.splice(index, 1)[0];
  S.normalizeCard(card);

  if (player.hand.length >= C.MAX_HAND_SIZE) {
    player.graveyard.push(card);
  } else {
    player.hand.push(card);
  }

  return card;
}

function addCardToHand(state, seatId, cardId, makeCardFromId, modify = null) {
  const player = U.getPlayer(state, seatId);
  if (!player || typeof makeCardFromId !== "function") return null;

  const card = makeCardFromId(cardId);
  if (!card) return null;

  S.normalizeCard(card);

  if (typeof modify === "function") {
    modify(card);
  }

  if (player.hand.length >= C.MAX_HAND_SIZE) {
    player.graveyard.push(card);
  } else {
    player.hand.push(card);
  }

  return card;
}

function addCopiesToDeck(state, seatId, cardId, amount, makeCardFromId, modify = null) {
  const player = U.getPlayer(state, seatId);
  if (!player || typeof makeCardFromId !== "function") return 0;

  let count = 0;
  const n = Math.max(0, Number(amount || 0));

  for (let i = 0; i < n; i++) {
    const card = makeCardFromId(cardId);
    if (!card) continue;

    S.normalizeCard(card);

    if (typeof modify === "function") {
      modify(card);
    }

    player.deck.push(card);
    count++;
  }

  return count;
}

function spendMana(player, amount) {
  const cost = Math.max(0, Number(amount || 0));
  if (!player || Number(player.mana || 0) < cost) return false;
  player.mana -= cost;
  return true;
}

function getCardPlayCost(player, card) {
  if (!player || !card) return 0;

  let cost = Number(card.cost || 0);

  if (U.isUnit(card) && Number(player.inflation_counters || 0) > 0) {
    cost += 1;
  }

  return Math.max(0, cost);
}

function applyPlayCostPostEffects(player, card) {
  if (!player || !card) return;

  if (U.isUnit(card) && Number(player.inflation_counters || 0) > 0) {
    player.inflation_counters -= 1;
    card.attack = Number(card.attack || 0) + 2;
    card.hp = Number(card.hp || 0) + 1;
    card.max_hp = Number(card.max_hp || 0) + 1;
  }
}

function removeCardFromHand(player, index) {
  if (!player || !Array.isArray(player.hand)) return null;
  if (index < 0 || index >= player.hand.length) return null;
  return player.hand.splice(index, 1)[0] || null;
}

function moveCardToGraveyard(player, card) {
  if (!player || !card) return;
  if (!Array.isArray(player.graveyard)) player.graveyard = [];
  player.graveyard.push(card);
}

function setLastSpell(player, card) {
  if (!player || !card) return;
  player.last_spell_cast = U.deepClone(card);
}

function countTraitOnBoard(player, trait) {
  if (!player || !Array.isArray(player.board)) return 0;
  return player.board.filter(card => U.hasTrait(card, trait)).length;
}

function countSpellsInGraveyard(player) {
  if (!player || !Array.isArray(player.graveyard)) return 0;
  return player.graveyard.filter(card => U.isSpell(card)).length;
}

module.exports = {
  drawOne,
  drawCards,
  burnRandomCardFromHand,
  drawRandomFromDeck,
  addCardToHand,
  addCopiesToDeck,
  spendMana,
  getCardPlayCost,
  applyPlayCostPostEffects,
  removeCardFromHand,
  moveCardToGraveyard,
  setLastSpell,
  countTraitOnBoard,
  countSpellsInGraveyard
};

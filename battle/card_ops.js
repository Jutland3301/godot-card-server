"use strict";

const C = require("./constants");
const U = require("./utils");
const S = require("./state");

function drawOne(state, seatId) {
  const player = U.getPlayer(state, seatId);
  if (!player) return null;

  if (!Array.isArray(player.deck)) player.deck = [];
  if (!Array.isArray(player.hand)) player.hand = [];
  if (!Array.isArray(player.graveyard)) player.graveyard = [];

  if (player.deck.length <= 0) {
    state.game_over = true;
    state.winner_seat = U.otherSeat(seatId);
    state.loser_seat = seatId;
    state.turn_timer_active = false;
    state.turn_timer_timeout_handled = true;
    state.turn_time_left = 0.0;
    S.addLog(state, `${player.name} loses because they cannot draw a card.`);
    S.syncLegacy(state);
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
    if (card) {
      drawn.push(card);
    } else if (state.game_over) {
      break;
    }
  }

  return drawn;
}

function burnRandomCardFromHand(state, seatId, predicate = null) {
  const player = U.getPlayer(state, seatId);
  if (!player || !Array.isArray(player.hand) || player.hand.length <= 0) {
    return null;
  }

  if (!Array.isArray(player.graveyard)) {
    player.graveyard = [];
  }

  const index = U.findRandomIndex(player.hand, (card) => {
    if (!predicate) return true;
    return predicate(card);
  });

  if (index < 0) return null;

  const card = player.hand.splice(index, 1)[0];
  if (card) {
    player.graveyard.push(card);
  }

  return card || null;
}

function drawRandomFromDeck(state, seatId, predicate = null) {
  const player = U.getPlayer(state, seatId);
  if (!player || !Array.isArray(player.deck) || player.deck.length <= 0) {
    return null;
  }

  if (!Array.isArray(player.hand)) player.hand = [];
  if (!Array.isArray(player.graveyard)) player.graveyard = [];

  const index = U.findRandomIndex(player.deck, predicate || (() => true));
  if (index < 0) return null;

  const card = player.deck.splice(index, 1)[0];
  S.normalizeCard(card);

  if (player.hand.length >= C.MAX_HAND_SIZE) {
    player.graveyard.push(card);
    S.addLog(state, `${player.name} burned ${U.cardName(card)} because hand is full.`);
  } else {
    player.hand.push(card);
  }

  return card;
}

function drawRandomSpellFromDeck(state, seatId) {
  return drawRandomFromDeck(state, seatId, (card) => U.isSpell(card));
}

function drawRandomTraitCardFromDeck(state, seatId, traitName, amount, costIncrease = 0, unitOnly = false) {
  const player = U.getPlayer(state, seatId);
  if (!player) return [];

  const drawn = [];
  const count = Math.max(0, Number(amount || 0));
  const trait = U.normalizeLowerString(traitName);

  for (let i = 0; i < count; i++) {
    const card = drawRandomFromDeck(state, seatId, (deckCard) => {
      if (!deckCard) return false;
      if (unitOnly && !U.isUnit(deckCard)) return false;
      return U.hasTrait(deckCard, trait);
    });

    if (!card) break;

    card.cost = Math.max(0, Number(card.cost || 0) + Number(costIncrease || 0));
    drawn.push(card);
  }

  return drawn;
}

function addCardToHand(state, seatId, cardId, makeCardFromId, modify = null) {
  const player = U.getPlayer(state, seatId);
  if (!player || typeof makeCardFromId !== "function") return null;

  if (!Array.isArray(player.hand)) player.hand = [];
  if (!Array.isArray(player.graveyard)) player.graveyard = [];

  const card = makeCardFromId(cardId);
  if (!card) return null;

  S.normalizeCard(card);

  if (typeof modify === "function") {
    modify(card);
  }

  if (player.hand.length >= C.MAX_HAND_SIZE) {
    player.graveyard.push(card);
    S.addLog(state, `${player.name} burned ${U.cardName(card)} because hand is full.`);
  } else {
    player.hand.push(card);
  }

  return card;
}

function addCopiesToDeck(state, seatId, cardId, amount, makeCardFromId, modify = null, shouldShuffle = true) {
  const player = U.getPlayer(state, seatId);
  if (!player || typeof makeCardFromId !== "function") return 0;

  if (!Array.isArray(player.deck)) {
    player.deck = [];
  }

  const count = Math.max(0, Number(amount || 0));
  let added = 0;

  for (let i = 0; i < count; i++) {
    const card = makeCardFromId(cardId);
    if (!card) continue;

    S.normalizeCard(card);

    if (typeof modify === "function") {
      modify(card);
    }

    player.deck.push(card);
    added++;
  }

  if (shouldShuffle) {
    shuffleArray(player.deck);
  }

  return added;
}

function addCopiesToHand(state, seatId, sourceCard, amount, modify = null) {
  const player = U.getPlayer(state, seatId);
  if (!player || !sourceCard) return 0;

  if (!Array.isArray(player.hand)) player.hand = [];
  if (!Array.isArray(player.graveyard)) player.graveyard = [];

  const count = Math.max(0, Number(amount || 0));
  let added = 0;

  for (let i = 0; i < count; i++) {
    const copied = U.copyCardData(sourceCard);
    if (!copied) continue;

    if (typeof modify === "function") {
      modify(copied);
    }

    if (player.hand.length >= C.MAX_HAND_SIZE) {
      player.graveyard.push(copied);
    } else {
      player.hand.push(copied);
      added++;
    }
  }

  return added;
}

function shuffleArray(array) {
  if (!Array.isArray(array)) return;

  for (let i = array.length - 1; i > 0; i--) {
    const j = U.randomInt(i + 1);
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
}

function spendMana(player, amount) {
  const cost = Math.max(0, Number(amount || 0));
  if (!player || Number(player.mana || 0) < cost) return false;

  player.mana = Number(player.mana || 0) - cost;
  return true;
}

function gainMana(player, amount) {
  if (!player) return 0;

  const gain = Math.max(0, Number(amount || 0));
  if (gain <= 0) return 0;

  const oldMana = Number(player.mana || 0);
  const maxMana = Number(player.max_mana || C.MAX_MANA);

  player.mana = Math.min(oldMana + gain, maxMana);
  return player.mana - oldMana;
}

function getPlayedTraitCount(player, traitName) {
  if (!player) return 0;

  const trait = U.normalizeLowerString(traitName);

  if (trait === "scholar") {
    return Number(player.scholar_cards_played_this_game || player.scholar_played_count || 0);
  }

  if (!player.played_trait_counts || typeof player.played_trait_counts !== "object") {
    return 0;
  }

  return Number(player.played_trait_counts[trait] || 0);
}

function incrementPlayedTraitCounts(player, card) {
  if (!player || !card) return;

  if (!player.played_trait_counts || typeof player.played_trait_counts !== "object") {
    player.played_trait_counts = {};
  }

  for (const traitValue of U.ensureArray(card.traits)) {
    const trait = U.normalizeLowerString(traitValue);
    if (!trait) continue;

    player.played_trait_counts[trait] = Number(player.played_trait_counts[trait] || 0) + 1;

    if (trait === "scholar") {
      player.scholar_cards_played_this_game = Number(player.scholar_cards_played_this_game || 0) + 1;
      player.scholar_played_count = player.scholar_cards_played_this_game;
    }
  }
}

function getCardPlayCost(player, card) {
  if (!player || !card) return 0;

  let cost = U.getEffectiveCardCost(card, player);

  const cardId = U.cardId(card);

  if (cardId === C.EFFECT_FORBIDDEN_BOOK || String(card.effect_id || "") === C.EFFECT_FORBIDDEN_BOOK) {
    cost -= getPlayedTraitCount(player, "scholar");
  }

  if (cardId === C.EFFECT_ALL_KNOWING_ARCHIVIST || String(card.effect_id || "") === C.EFFECT_ALL_KNOWING_ARCHIVIST) {
    cost += getPlayedTraitCount(player, "scholar");
    cost = Math.min(cost, 10);
  }

  if (U.isUnit(card) && Number(player.inflation_counters || 0) > 0) {
    cost += 1;
  }

  return Math.max(0, Number(cost || 0));
}

function applyPlayCostPostEffects(player, card) {
  if (!player || !card) return;

  if (U.isUnit(card) && Number(player.inflation_counters || 0) > 0) {
    player.inflation_counters = Math.max(0, Number(player.inflation_counters || 0) - 1);

    card.attack = Number(card.attack || 0) + 2;
    card.hp = Number(card.hp || 0) + 1;
    card.max_hp = Number(card.max_hp || 0) + 1;
  }
}

function removeCardFromHand(player, index) {
  if (!player || !Array.isArray(player.hand)) return null;

  const i = Number(index);
  if (i < 0 || i >= player.hand.length) return null;

  return player.hand.splice(i, 1)[0] || null;
}

function returnCardToHand(player, card) {
  if (!player || !card) return false;

  if (!Array.isArray(player.hand)) player.hand = [];
  if (!Array.isArray(player.graveyard)) player.graveyard = [];

  if (player.hand.length >= C.MAX_HAND_SIZE) {
    player.graveyard.push(card);
    return false;
  }

  player.hand.push(card);
  return true;
}

function moveCardToGraveyard(player, card) {
  if (!player || !card) return;

  if (!Array.isArray(player.graveyard)) {
    player.graveyard = [];
  }

  player.graveyard.push(card);
}

function removeCardFromZone(player, zoneName, card) {
  if (!player || !card) return false;

  const zone = player[zoneName];
  if (!Array.isArray(zone)) return false;

  const index = zone.indexOf(card);
  if (index < 0) return false;

  zone.splice(index, 1);
  return true;
}

function setLastSpell(player, card) {
  if (!player || !card) return;

  player.last_spell_cast = U.copyCardData(card);
}

function getLastSpell(player) {
  if (!player || !player.last_spell_cast) return null;
  return player.last_spell_cast;
}

function countTraitOnBoard(player, traitName) {
  if (!player || !Array.isArray(player.board)) return 0;

  const trait = U.normalizeLowerString(traitName);

  return player.board.filter(card => {
    return card && U.isUnit(card) && U.hasTrait(card, trait);
  }).length;
}

function countSpellsInGraveyard(player) {
  if (!player || !Array.isArray(player.graveyard)) return 0;

  return player.graveyard.filter(card => U.isSpell(card)).length;
}

function countDifferentTraitsOnBoard(state) {
  const traitSet = new Set();

  for (const seat of [C.SEAT_A, C.SEAT_B]) {
    const player = U.getPlayer(state, seat);
    if (!player) continue;

    for (const unit of U.ensureArray(player.board)) {
      if (!unit || !U.isUnit(unit)) continue;

      for (const traitValue of U.ensureArray(unit.traits)) {
        const trait = U.normalizeLowerString(traitValue);
        if (trait) traitSet.add(trait);
      }
    }
  }

  return traitSet.size;
}

function getRandomUnitInHandWithTrait(player, traitName) {
  if (!player || !Array.isArray(player.hand)) return null;

  const trait = U.normalizeLowerString(traitName);

  const candidates = player.hand.filter(card => {
    return card && U.isUnit(card) && U.hasTrait(card, trait);
  });

  return U.randomItem(candidates);
}

function getRandomCardInHandWithTrait(player, traitName) {
  if (!player || !Array.isArray(player.hand)) return null;

  const trait = U.normalizeLowerString(traitName);

  const candidates = player.hand.filter(card => {
    return card && U.hasTrait(card, trait);
  });

  return U.randomItem(candidates);
}

function buffUnitsInDeckWithTrait(player, traitName, attackBonus, hpBonus) {
  if (!player || !Array.isArray(player.deck)) return 0;

  const trait = U.normalizeLowerString(traitName);
  let affected = 0;

  for (const deckCard of player.deck) {
    if (!deckCard || !U.isUnit(deckCard)) continue;
    if (!U.hasTrait(deckCard, trait)) continue;

    U.buffCardStats(deckCard, attackBonus, hpBonus);
    affected++;
  }

  return affected;
}

function buffFriendlyUnitsWithTrait(player, traitName, attackBonus, hpBonus, includeSelfCard = null) {
  if (!player || !Array.isArray(player.board)) return 0;

  const trait = U.normalizeLowerString(traitName);
  let affected = 0;

  for (const unit of player.board) {
    if (!unit || !U.isUnit(unit)) continue;
    if (includeSelfCard === false && unit === includeSelfCard) continue;
    if (!U.hasTrait(unit, trait)) continue;

    U.buffCardStats(unit, attackBonus, hpBonus);
    affected++;
  }

  return affected;
}

function burnAllCardsInHand(player) {
  if (!player) return [];

  if (!Array.isArray(player.hand)) player.hand = [];
  if (!Array.isArray(player.graveyard)) player.graveyard = [];

  const burned = player.hand.splice(0, player.hand.length);
  for (const card of burned) {
    if (card) player.graveyard.push(card);
  }

  return burned;
}

function findCardIndexInHand(player, card) {
  if (!player || !Array.isArray(player.hand) || !card) return -1;
  return player.hand.indexOf(card);
}

function findCardIndexInBoard(player, card) {
  if (!player || !Array.isArray(player.board) || !card) return -1;
  return player.board.indexOf(card);
}

module.exports = {
  drawOne,
  drawCards,
  burnRandomCardFromHand,
  drawRandomFromDeck,
  drawRandomSpellFromDeck,
  drawRandomTraitCardFromDeck,

  addCardToHand,
  addCopiesToDeck,
  addCopiesToHand,

  shuffleArray,
  spendMana,
  gainMana,

  getPlayedTraitCount,
  incrementPlayedTraitCounts,
  getCardPlayCost,
  applyPlayCostPostEffects,

  removeCardFromHand,
  returnCardToHand,
  moveCardToGraveyard,
  removeCardFromZone,

  setLastSpell,
  getLastSpell,

  countTraitOnBoard,
  countSpellsInGraveyard,
  countDifferentTraitsOnBoard,

  getRandomUnitInHandWithTrait,
  getRandomCardInHandWithTrait,

  buffUnitsInDeckWithTrait,
  buffFriendlyUnitsWithTrait,
  burnAllCardsInHand,

  findCardIndexInHand,
  findCardIndexInBoard
};

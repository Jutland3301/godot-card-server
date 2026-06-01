"use strict";

const C = require("./constants");
const U = require("./utils");

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

function getCardPlayCost(player, card) {
  if (!player || !card) return 0;

  let cost = U.getEffectiveCardCost(card, player);
  const cardId = U.cardId(card);

  if (cardId === C.EFFECT_FORBIDDEN_BOOK || String(card.effect_id || "") === C.EFFECT_FORBIDDEN_BOOK) {
    cost -= getPlayedTraitCount(player, "scholar");
  }

  if (cardId === "the_tale_of_bravery" || String(card.effect_id || "") === C.EFFECT_THE_TALE_OF_BRAVERY) {
    cost -= getPlayedTraitCount(player, "music");
  }

  if (cardId === C.EFFECT_ALL_KNOWING_ARCHIVIST || String(card.effect_id || "") === C.EFFECT_ALL_KNOWING_ARCHIVIST) {
    cost += getPlayedTraitCount(player, "scholar");
    cost = Math.min(cost, 10);
  }

  if (cardId === "fenrir_bound_wolf") {
    cost -= Number(player.animal_deaths_this_game || 0);
  }

  if (player.prophecy_ouroboros_active && !player.prophet_zero_cost_used_this_turn && U.hasTrait(card, "prophet")) {
    cost = 0;
  }

  return Math.max(0, Number(cost || 0));
}

module.exports = {
  getPlayedTraitCount,
  getCardPlayCost
};

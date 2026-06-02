"use strict";

const assert = require("assert");
const {
  NORMAL_CARD_IDS,
  PACK_RARITY_WEIGHTS,
  getAvailableCardIds,
  getCardRarity,
  getPackEligibleCardIds
} = require("../cards_database");

assert.strictEqual(NORMAL_CARD_IDS.length, 9);
assert.strictEqual(Object.values(PACK_RARITY_WEIGHTS).reduce((sum, value) => sum + value, 0), 100);
assert.strictEqual(NORMAL_CARD_IDS.filter((cardId) => getPackEligibleCardIds().includes(cardId)).length, 0);
assert.strictEqual(getCardRarity("magus_imagination"), "silver");
assert.strictEqual(getCardRarity("economics_overflow"), "amethyst");
assert.strictEqual(getCardRarity("the_godless_testament"), "legend");
assert.strictEqual(
  getAvailableCardIds().length,
  NORMAL_CARD_IDS.length + getPackEligibleCardIds().length
);

console.log("[PROGRESSION_CATALOG_SMOKE] PASS");

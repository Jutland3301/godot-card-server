"use strict";

const C = require("./constants");

function deepClone(value) {
  if (value === undefined || value === null) {
    return value;
  }

  return JSON.parse(JSON.stringify(value));
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function randomInt(maxExclusive) {
  const max = Math.max(0, Number(maxExclusive || 0));
  if (max <= 0) return -1;
  return Math.floor(Math.random() * max);
}

function randomItem(array) {
  if (!Array.isArray(array) || array.length <= 0) return null;
  return array[randomInt(array.length)] || null;
}

function removeAt(array, index) {
  if (!Array.isArray(array)) return null;

  const i = Number(index);
  if (i < 0 || i >= array.length) return null;

  return array.splice(i, 1)[0] || null;
}

function otherSeat(seatId) {
  return seatId === C.SEAT_A ? C.SEAT_B : C.SEAT_A;
}

function seatToOwnerId(seatId) {
  if (seatId === C.SEAT_A) return C.OWNER_PLAYER1;
  if (seatId === C.SEAT_B) return C.OWNER_PLAYER2;
  return "";
}

function ownerIdToSeat(ownerId) {
  if (ownerId === C.OWNER_PLAYER1) return C.SEAT_A;
  if (ownerId === C.OWNER_PLAYER2) return C.SEAT_B;
  return "";
}

function normalizeOwnerToSeat(state, rawOwner) {
  const value = String(rawOwner || "");

  if (value === C.SEAT_A || value === C.SEAT_B) {
    return value;
  }

  if (value === C.OWNER_PLAYER1) {
    return C.SEAT_A;
  }

  if (value === C.OWNER_PLAYER2) {
    return C.SEAT_B;
  }

  if (state && state.owner_to_seat_id && state.owner_to_seat_id[value]) {
    return state.owner_to_seat_id[value];
  }

  return "";
}

function normalizeSeatToOwner(state, rawSeat) {
  const value = String(rawSeat || "");

  if (value === C.OWNER_PLAYER1 || value === C.OWNER_PLAYER2) {
    return value;
  }

  if (value === C.SEAT_A) {
    return C.OWNER_PLAYER1;
  }

  if (value === C.SEAT_B) {
    return C.OWNER_PLAYER2;
  }

  if (state && state.seat_to_owner_id && state.seat_to_owner_id[value]) {
    return state.seat_to_owner_id[value];
  }

  return "";
}

function getPlayer(state, seatId) {
  if (!state) return null;

  if (!state.players || typeof state.players !== "object") {
    state.players = {};
  }

  if (!state.players[C.SEAT_A] && state.player1) {
    state.players[C.SEAT_A] = state.player1;
  }

  if (!state.players[C.SEAT_B] && state.player2) {
    state.players[C.SEAT_B] = state.player2;
  }

  if (seatId === C.SEAT_A) {
    return state.players[C.SEAT_A] || state.player1 || null;
  }

  if (seatId === C.SEAT_B) {
    return state.players[C.SEAT_B] || state.player2 || null;
  }

  return null;
}

function getOpponent(state, seatId) {
  return getPlayer(state, otherSeat(seatId));
}

function getOpponentSeatOfPlayer(state, player) {
  const seat = getSeatOfPlayer(state, player);
  if (!seat) return "";
  return otherSeat(seat);
}

function getOpponentOfPlayer(state, player) {
  const seat = getSeatOfPlayer(state, player);
  if (!seat) return null;
  return getOpponent(state, seat);
}

function getSeatOfPlayer(state, player) {
  if (!state || !player) return "";

  if (getPlayer(state, C.SEAT_A) === player) {
    return C.SEAT_A;
  }

  if (getPlayer(state, C.SEAT_B) === player) {
    return C.SEAT_B;
  }

  return "";
}

function getOwnerIdForPlayer(state, player) {
  const seat = getSeatOfPlayer(state, player);
  return seatToOwnerId(seat);
}

function getPlayerForOwnerId(state, ownerId) {
  return getPlayer(state, ownerIdToSeat(ownerId));
}

function getOwnerSeatOfCard(state, card) {
  if (!state || !card) return "";

  const seats = [C.SEAT_A, C.SEAT_B];

  for (const seat of seats) {
    const player = getPlayer(state, seat);
    if (!player) continue;

    if (Array.isArray(player.hand) && player.hand.includes(card)) return seat;
    if (Array.isArray(player.board) && player.board.includes(card)) return seat;
    if (Array.isArray(player.deck) && player.deck.includes(card)) return seat;
    if (Array.isArray(player.graveyard) && player.graveyard.includes(card)) return seat;
  }

  return "";
}

function getOwnerOfCard(state, card) {
  const seat = getOwnerSeatOfCard(state, card);
  return getPlayer(state, seat);
}

function isUnit(card) {
  return !!card && String(card.card_type || card.type || "") === C.CARD_TYPE_UNIT;
}

function isSpell(card) {
  return !!card && String(card.card_type || card.type || "") === C.CARD_TYPE_SPELL;
}

function cardName(card) {
  if (!card) return "Unknown Card";
  return String(card.card_name || card.name || card.card_id || "Unknown Card");
}

function cardId(card) {
  if (!card) return "";
  return String(card.card_id || card.id || "");
}

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeLowerString(value) {
  return normalizeString(value).toLowerCase();
}

function hasKeyword(card, keywordName) {
  if (!card) return false;

  const keyword = normalizeLowerString(keywordName);
  if (!keyword) return false;

  return ensureArray(card.keywords).map(normalizeLowerString).includes(keyword);
}

function addKeyword(card, keywordName) {
  if (!card) return;

  const keyword = normalizeLowerString(keywordName);
  if (!keyword) return;

  if (!Array.isArray(card.keywords)) {
    card.keywords = [];
  }

  if (!hasKeyword(card, keyword)) {
    card.keywords.push(keyword);
  }
}

function removeKeyword(card, keywordName) {
  if (!card || !Array.isArray(card.keywords)) return;

  const keyword = normalizeLowerString(keywordName);
  if (!keyword) return;

  card.keywords = card.keywords.filter(item => normalizeLowerString(item) !== keyword);
}

function hasTrait(card, traitName) {
  if (!card) return false;

  const trait = normalizeLowerString(traitName);
  if (!trait) return false;

  return ensureArray(card.traits).map(normalizeLowerString).includes(trait);
}

function hasAnyTrait(card, traits) {
  if (!card || !Array.isArray(traits)) return false;

  for (const trait of traits) {
    if (hasTrait(card, trait)) {
      return true;
    }
  }

  return false;
}

function addTrait(card, traitName) {
  if (!card) return;

  const trait = normalizeLowerString(traitName);
  if (!trait) return;

  if (!Array.isArray(card.traits)) {
    card.traits = [];
  }

  if (!hasTrait(card, trait)) {
    card.traits.push(trait);
  }
}

function getAbilities(card, triggerName = "") {
  if (!card || !Array.isArray(card.abilities)) {
    return [];
  }

  const trigger = String(triggerName || "");

  if (!trigger) {
    return card.abilities.filter(ability => ability && typeof ability === "object");
  }

  return card.abilities.filter(ability => {
    if (!ability || typeof ability !== "object") return false;
    return String(ability.trigger || ability.trigger_id || "") === trigger;
  });
}

function findRandomIndex(array, predicate) {
  if (!Array.isArray(array)) return -1;

  const candidates = [];

  for (let i = 0; i < array.length; i++) {
    if (typeof predicate !== "function" || predicate(array[i], i)) {
      candidates.push(i);
    }
  }

  if (candidates.length <= 0) {
    return -1;
  }

  return candidates[randomInt(candidates.length)];
}

function buffCardStats(card, attackBonus, hpBonus) {
  if (!card) return;

  const attack = Number(attackBonus || 0);
  const hp = Number(hpBonus || 0);

  card.attack = Number(card.attack || 0) + attack;
  card.max_hp = Number(card.max_hp || 0) + hp;
  card.hp = Number(card.hp || 0) + hp;

  if (card.max_hp < 1) {
    card.max_hp = 1;
  }
}

function copyCardData(originalCard) {
  if (!originalCard) return null;

  const copied = deepClone(originalCard);

  copied.card_id = String(copied.card_id || "");
  copied.card_name = String(copied.card_name || copied.name || copied.card_id || "");
  copied.card_type = String(copied.card_type || C.CARD_TYPE_SPELL);
  copied.cost = Number(copied.cost || 0);
  copied.power = Number(copied.power || 0);
  copied.effect_id = String(copied.effect_id || C.EFFECT_NONE);
  copied.target_type = String(copied.target_type || C.TARGET_NONE);
  copied.description = String(copied.description || "");
  copied.trigger_id = String(copied.trigger_id || C.ACTION_NONE);

  copied.attack = Number(copied.attack || 0);
  copied.hp = Number(copied.hp || 0);
  copied.max_hp = Number(copied.max_hp || copied.hp || 0);
  copied.base_attack = Number(copied.base_attack || copied.attack || 0);
  copied.base_hp = Number(copied.base_hp || copied.max_hp || 0);
  copied.armor = Number(copied.armor || 0);

  copied.can_attack = false;
  copied.exhausted = true;
  copied.summoned_this_turn = false;
  copied.has_attacked_this_turn = false;
  copied.attacks_this_turn = 0;
  copied.max_attacks_per_turn = Number(copied.max_attacks_per_turn || 1);
  copied.cannot_attack_leader = Boolean(copied.cannot_attack_leader || false);
  copied.flying_fortress_prevent_used_this_turn = false;

  copied.rarity = String(copied.rarity || "common");
  copied.tags = ensureArray(copied.tags).map(String);
  copied.keywords = ensureArray(copied.keywords).map(normalizeLowerString).filter(Boolean);
  copied.traits = ensureArray(copied.traits).map(normalizeLowerString).filter(Boolean);
  copied.temporary_keywords = copied.temporary_keywords && typeof copied.temporary_keywords === "object"
    ? deepClone(copied.temporary_keywords)
    : {};
  copied.once_per_turn_flags = copied.once_per_turn_flags && typeof copied.once_per_turn_flags === "object"
    ? deepClone(copied.once_per_turn_flags)
    : {};

  copied.abilities = ensureArray(copied.abilities).map(ability => {
    if (ability && typeof ability === "object") {
      return deepClone(ability);
    }

    return ability;
  });

  copied.attack_sfx = String(copied.attack_sfx || "");
  copied.defense_sfx = String(copied.defense_sfx || "");
  copied.play_sfx = String(copied.play_sfx || "");
  copied.death_sfx = String(copied.death_sfx || "");

  return copied;
}

function getDamageAfterArmor(unit, rawDamage) {
  if (!unit) return 0;

  const amount = Math.max(0, Number(rawDamage || 0));
  if (amount <= 0) return 0;

  const armorValue = Math.max(0, Number(unit.armor || 0));
  return Math.max(amount - armorValue, 0);
}

function isKeywordGrantedByFriendlyAura(owner, targetCard, keywordName) {
  if (!owner || !targetCard) return false;

  const keyword = normalizeLowerString(keywordName);
  if (!keyword) return false;

  for (const auraSource of ensureArray(owner.board)) {
    if (!auraSource) continue;

    for (const ability of getAbilities(auraSource, C.TRIGGER_AURA)) {
      if (String(ability.effect || "") !== C.ABILITY_EFFECT_GRANT_KEYWORDS_TO_TRAIT) {
        continue;
      }

      const target = String(ability.target || "");
      if (target !== C.ABILITY_TARGET_FRIENDLY_UNITS_WITH_TRAIT) {
        continue;
      }

      if (ability.exclude_self === true && auraSource === targetCard) {
        continue;
      }

      const requiredTrait = normalizeLowerString(ability.trait || "");
      if (!requiredTrait) continue;

      if (!hasTrait(targetCard, requiredTrait)) {
        continue;
      }

      const grantedKeywords = ensureArray(ability.keywords).map(normalizeLowerString);

      if (grantedKeywords.includes(keyword)) {
        return true;
      }
    }
  }

  return false;
}

function hasEffectiveKeyword(card, owner, keywordName) {
  if (!card) return false;

  if (hasKeyword(card, keywordName)) {
    return true;
  }

  if (owner && isKeywordGrantedByFriendlyAura(owner, card, keywordName)) {
    return true;
  }

  return false;
}

function addTemporaryKeywordToUnit(unit, keywordName, expireTurnNumber) {
  if (!unit) return;

  const keyword = normalizeLowerString(keywordName);
  if (!keyword) return;

  if (!unit.temporary_keywords || typeof unit.temporary_keywords !== "object") {
    unit.temporary_keywords = {};
  }

  unit.temporary_keywords[keyword] = Number(expireTurnNumber || 0);
  addKeyword(unit, keyword);
}

function clearExpiredTemporaryKeywordsForPlayer(player, currentTurnNumber) {
  if (!player) return;

  const turn = Number(currentTurnNumber || 0);

  for (const unit of ensureArray(player.board)) {
    if (!unit || !unit.temporary_keywords || typeof unit.temporary_keywords !== "object") {
      continue;
    }

    for (const keyword of Object.keys(unit.temporary_keywords)) {
      const expireTurn = Number(unit.temporary_keywords[keyword] || 0);

      if (expireTurn <= turn) {
        delete unit.temporary_keywords[keyword];
        removeKeyword(unit, keyword);
      }
    }
  }
}

function clearExpiredTemporaryKeywords(state, seatId) {
  const player = getPlayer(state, seatId);
  if (!player) return;

  clearExpiredTemporaryKeywordsForPlayer(player, Number(state.turn_number || 0));
}

function getSpellDamageBonus(player) {
  if (!player) return 0;

  let bonus = 0;

  for (const unit of ensureArray(player.board)) {
    if (!unit || !isUnit(unit)) continue;

    for (const ability of getAbilities(unit, C.TRIGGER_AURA)) {
      if (String(ability.effect || "") !== C.ABILITY_EFFECT_SPELL_DAMAGE_BONUS) {
        continue;
      }

      if (String(ability.target || "") !== C.ABILITY_TARGET_FRIENDLY_DAMAGE_SPELLS) {
        continue;
      }

      bonus += Number(ability.amount || 0);
    }
  }

  return bonus;
}

function getEffectiveSpellDamage(spellCard, caster, baseDamage) {
  const base = Number(baseDamage || 0);

  if (!spellCard || !caster) {
    return base;
  }

  if (!isSpell(spellCard)) {
    return base;
  }

  if (base <= 0) {
    return base;
  }

  return base + getSpellDamageBonus(caster);
}

function getHandSpellCostReduction(player) {
  if (!player) return 0;

  let reduction = 0;

  for (const unit of ensureArray(player.board)) {
    if (!unit || !isUnit(unit)) continue;

    for (const ability of getAbilities(unit, C.TRIGGER_AURA)) {
      if (String(ability.effect || "") !== C.ABILITY_EFFECT_REDUCE_HAND_SPELL_COST) {
        continue;
      }

      if (String(ability.target || "") !== C.ABILITY_TARGET_FRIENDLY_SPELLS_IN_HAND) {
        continue;
      }

      reduction += Number(ability.amount || 0);
    }
  }

  return reduction;
}

function getHandCardCostModifierByTrait(player, card) {
  if (!player || !card) return 0;

  let modifier = 0;

  for (const unit of ensureArray(player.board)) {
    if (!unit || !isUnit(unit)) continue;

    for (const ability of getAbilities(unit, C.TRIGGER_AURA)) {
      if (String(ability.effect || "") !== C.ABILITY_EFFECT_MODIFY_HAND_COST_BY_TRAIT) {
        continue;
      }

      const traitName = normalizeLowerString(ability.trait || "");
      if (!traitName) continue;

      if (!hasTrait(card, traitName)) {
        continue;
      }

      const cardTypeFilter = String(ability.card_type || "");
      if (cardTypeFilter && String(card.card_type || "") !== cardTypeFilter) {
        continue;
      }

      modifier += Number(ability.amount || 0);
    }
  }

  return modifier;
}

function getEffectiveCardCost(card, player) {
  if (!card) return 0;

  let effectiveCost = Number(card.cost || 0);

  if (player && isSpell(card)) {
    effectiveCost -= getHandSpellCostReduction(player);
  }

  if (player) {
    effectiveCost += getHandCardCostModifierByTrait(player, card);
  }

  return Math.max(0, effectiveCost);
}

function isUntrickableUnit(unitOwner, unit) {
  return hasEffectiveKeyword(unit, unitOwner, C.KEYWORD_UNTRICKABLE);
}

function hasTauntUnit(player) {
  if (!player) return false;

  return ensureArray(player.board).some(unit => {
    return unit && isUnit(unit) && hasEffectiveKeyword(unit, player, C.KEYWORD_TAUNT);
  });
}

function isTauntUnit(player, unitIndex) {
  if (!player || !Array.isArray(player.board)) return false;

  const index = Number(unitIndex);
  if (index < 0 || index >= player.board.length) {
    return false;
  }

  const unit = player.board[index];
  return !!unit && isUnit(unit) && hasEffectiveKeyword(unit, player, C.KEYWORD_TAUNT);
}

function canUnitAttackNowWithAura(attackerOwner, attacker, allowFaceAttack) {
  if (!attacker) return false;

  if (!isUnit(attacker)) return false;

  if (hasEffectiveKeyword(attacker, attackerOwner, C.KEYWORD_IMMOBILE)) {
    return false;
  }

  if (!attacker.can_attack) {
    return false;
  }

  if (Number(attacker.attacks_this_turn || 0) >= Number(attacker.max_attacks_per_turn || 1)) {
    return false;
  }

  if (attacker.summoned_this_turn) {
    const hasRush = hasEffectiveKeyword(attacker, attackerOwner, C.KEYWORD_RUSH);
    const hasHaste = hasEffectiveKeyword(attacker, attackerOwner, C.KEYWORD_HASTE);

    if (!hasRush && !hasHaste) {
      return false;
    }

    /*
      このゲームの仕様:
      Rush = 出したターンから顔にも攻撃できる
      Haste = 出したターンからユニットには攻撃できるが、顔には攻撃できない
    */
    if (allowFaceAttack && hasHaste && !hasRush) {
      return false;
    }
  }

  return true;
}
function refreshAttackPermissionsForPlayer(player) {
  if (!player) return;

  for (const unit of ensureArray(player.board)) {
    if (!unit || !isUnit(unit)) continue;

    if (hasEffectiveKeyword(unit, player, C.KEYWORD_IMMOBILE)) {
      unit.can_attack = false;
      unit.exhausted = true;
      continue;
    }

    if (Number(unit.attacks_this_turn || 0) >= Number(unit.max_attacks_per_turn || 1)) {
      unit.can_attack = false;
      unit.exhausted = true;
      continue;
    }

    if (!unit.summoned_this_turn) {
      continue;
    }

    const hasRush = hasEffectiveKeyword(unit, player, C.KEYWORD_RUSH);
    const hasHaste = hasEffectiveKeyword(unit, player, C.KEYWORD_HASTE);

    if (hasRush || hasHaste) {
      unit.can_attack = true;
      unit.exhausted = false;
    } else {
      unit.can_attack = false;
      unit.exhausted = true;
    }
  }
}

function applySummonState(unit, owner) {
  if (!unit) return;

  unit.summoned_this_turn = true;
  unit.attacks_this_turn = 0;
  unit.has_attacked_this_turn = false;

  if (hasEffectiveKeyword(unit, owner, C.KEYWORD_IMMOBILE)) {
    unit.can_attack = false;
    unit.exhausted = true;
    return;
  }

  if (
    hasEffectiveKeyword(unit, owner, C.KEYWORD_RUSH) ||
    hasEffectiveKeyword(unit, owner, C.KEYWORD_HASTE)
  ) {
    unit.can_attack = true;
    unit.exhausted = false;
  } else {
    unit.can_attack = false;
    unit.exhausted = true;
  }
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
  getOpponentSeatOfPlayer,
  getOpponentOfPlayer,
  getSeatOfPlayer,
  getOwnerIdForPlayer,
  getPlayerForOwnerId,
  getOwnerSeatOfCard,
  getOwnerOfCard,

  isUnit,
  isSpell,
  cardName,
  cardId,

  normalizeString,
  normalizeLowerString,

  hasKeyword,
  addKeyword,
  removeKeyword,
  hasTrait,
  hasAnyTrait,
  addTrait,

  getAbilities,
  findRandomIndex,

  buffCardStats,
  copyCardData,
  getDamageAfterArmor,

  isKeywordGrantedByFriendlyAura,
  hasEffectiveKeyword,
  addTemporaryKeywordToUnit,
  clearExpiredTemporaryKeywordsForPlayer,
  clearExpiredTemporaryKeywords,

  getSpellDamageBonus,
  getEffectiveSpellDamage,
  getHandSpellCostReduction,
  getHandCardCostModifierByTrait,
  getEffectiveCardCost,

  isUntrickableUnit,
  hasTauntUnit,
  isTauntUnit,
  canUnitAttackNowWithAura,
  refreshAttackPermissionsForPlayer,
  applySummonState
};

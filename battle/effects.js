"use strict";

const C = require("./constants");
const U = require("./utils");
const S = require("./state");
const CardOps = require("./card_ops");
const Combat = require("./combat");
const Targets = require("./targets");

function getAmount(card, ability, fallback = 0) {
  if (ability) {
    if (ability.amount !== undefined) return Number(ability.amount);
    if (ability.value !== undefined) return Number(ability.value);
    if (ability.damage !== undefined) return Number(ability.damage);
    if (ability.power !== undefined) return Number(ability.power);
  }

  if (card && card.power !== undefined) return Number(card.power || 0);
  return Number(fallback || 0);
}

function getEffectiveSpellDamage(state, sourceSeat, card, baseAmount) {
  const player = U.getPlayer(state, sourceSeat);
  let amount = Number(baseAmount || 0);

  if (!player) return amount;

  for (const unit of player.board) {
    for (const ability of U.getAbilities(unit)) {
      if (String(ability.effect || "") === C.ABILITY_EFFECT_SPELL_DAMAGE_BONUS) {
        amount += Number(ability.amount || ability.bonus || 0);
      }
    }
  }

  return amount;
}

function applyEffectToTarget(state, sourceSeat, sourceCard, target, effectId, amount, ability, ctx) {
  if (!target) return false;

  if (target.type === "player") {
    const player = U.getPlayer(state, target.owner_seat);
    if (!player) return false;

    if (effectId === C.EFFECT_DAMAGE || effectId === C.ABILITY_EFFECT_DAMAGE || effectId.includes("damage")) {
      const effectiveAmount = U.isSpell(sourceCard)
        ? getEffectiveSpellDamage(state, sourceSeat, sourceCard, amount)
        : amount;

      Combat.damagePlayer(state, target.owner_seat, effectiveAmount);
      S.addLog(state, `${U.cardName(sourceCard)} dealt ${effectiveAmount} damage to ${player.name}.`);
      return true;
    }

    if (effectId === C.EFFECT_HEAL || effectId.includes("heal")) {
      Combat.healPlayer(player, amount);
      S.addLog(state, `${U.cardName(sourceCard)} healed ${player.name} for ${amount}.`);
      return true;
    }

    return false;
  }

  if (target.type === "unit") {
    const unit = Targets.getUnitByTarget(state, target);
    if (!unit) return false;

    if (effectId === C.EFFECT_DAMAGE || effectId === C.ABILITY_EFFECT_DAMAGE || effectId.includes("damage")) {
      const effectiveAmount = U.isSpell(sourceCard)
        ? getEffectiveSpellDamage(state, sourceSeat, sourceCard, amount)
        : amount;

      Combat.damageUnit(state, target.owner_seat, unit, effectiveAmount);
      S.addLog(state, `${U.cardName(sourceCard)} dealt ${effectiveAmount} damage to ${U.cardName(unit)}.`);
      return true;
    }

    if (effectId === C.EFFECT_HEAL || effectId.includes("heal")) {
      Combat.healUnit(unit, amount);
      S.addLog(state, `${U.cardName(sourceCard)} healed ${U.cardName(unit)} for ${amount}.`);
      return true;
    }

    if (effectId === C.EFFECT_DESTROY_UNIT || effectId.includes("destroy")) {
      Combat.destroyUnit(state, target.owner_seat, unit);
      S.addLog(state, `${U.cardName(sourceCard)} destroyed ${U.cardName(unit)}.`);
      return true;
    }

    if (effectId === C.EFFECT_ADD_KEYWORD) {
      const keyword = String(ability.keyword || "");
      if (keyword) {
        U.addKeyword(unit, keyword);
        S.addLog(state, `${U.cardName(unit)} gained ${keyword}.`);
      }
      return true;
    }

    if (effectId === C.EFFECT_ADD_KEYWORDS_TO_UNIT) {
      const keywords = Array.isArray(ability.keywords) ? ability.keywords : [];
      for (const keyword of keywords) U.addKeyword(unit, keyword);
      S.addLog(state, `${U.cardName(unit)} gained keywords from ${U.cardName(sourceCard)}.`);
      return true;
    }

    if (effectId === C.EFFECT_RUNIC_TUNING) {
      const attack = Number(ability.attack || ability.attack_delta || 1);
      const hp = Number(ability.hp || ability.hp_delta || 1);
      Combat.buffUnit(unit, attack, hp);
      S.addLog(state, `${U.cardName(unit)} gained +${attack}/+${hp}.`);
      return true;
    }

    if (effectId === C.EFFECT_POETRY_OF_RESILIENCE) {
      Combat.giveArmor(unit, Number(ability.armor || 3));
      U.addTrait(unit, "music");
      S.addLog(state, `${U.cardName(unit)} gained Armor and music trait.`);
      return true;
    }

    if (effectId === C.EFFECT_LAMENTATION_OF_LIFE) {
      Combat.damageUnit(state, target.owner_seat, unit, amount || Number(sourceCard.power || 0));
      const owner = U.getPlayer(state, sourceSeat);
      if (owner) Combat.healPlayer(owner, amount || Number(sourceCard.power || 0));
      return true;
    }

    return false;
  }

  return false;
}

function buffAllAllyUnits(state, sourceSeat, attack, hp) {
  const player = U.getPlayer(state, sourceSeat);
  if (!player) return 0;

  let count = 0;
  for (const unit of player.board) {
    Combat.buffUnit(unit, attack, hp);
    count++;
  }

  return count;
}

function damageAllEnemyUnits(state, sourceSeat, amount, sourceCard, ctx) {
  const enemySeat = U.otherSeat(sourceSeat);
  const enemy = U.getPlayer(state, enemySeat);
  if (!enemy) return 0;

  let count = 0;
  for (const unit of [...enemy.board]) {
    Combat.damageUnit(state, enemySeat, unit, amount);
    count++;
  }

  Combat.processDeathQueue(state, ctx);
  return count;
}

function resolveSpellOrCardEffect(state, sourceSeat, sourceCard, target, ability = {}, ctx = {}) {
  if (!sourceCard) return { ok: true, state };

  const effectId = String(ability.effect || ability.effect_id || sourceCard.effect_id || C.EFFECT_NONE);
  const amount = getAmount(sourceCard, ability, 0);
  const owner = U.getPlayer(state, sourceSeat);
  const enemySeat = U.otherSeat(sourceSeat);
  const enemy = U.getPlayer(state, enemySeat);

  if (effectId === C.EFFECT_NONE || effectId === "") {
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_DRAW) {
    CardOps.drawCards(state, sourceSeat, amount || 1);
    S.addLog(state, `${owner.name} drew ${amount || 1} card(s).`);
    return { ok: true, state };
  }

  if (target) {
    const resolved = applyEffectToTarget(state, sourceSeat, sourceCard, target, effectId, amount, ability, ctx);
    if (resolved) {
      Combat.processDeathQueue(state, ctx);
      return { ok: true, state };
    }
  }

  if (effectId === C.EFFECT_DAMAGE && sourceCard.target_type === C.TARGET_ENEMY_PLAYER) {
    Combat.damagePlayer(state, enemySeat, getEffectiveSpellDamage(state, sourceSeat, sourceCard, amount));
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_HEAL && sourceCard.target_type === C.TARGET_FRIENDLY_PLAYER) {
    Combat.healPlayer(owner, amount);
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_BUFF_ALL_ALLY_UNITS || effectId === "buff_all_ally_units") {
    buffAllAllyUnits(state, sourceSeat, Number(ability.attack || 1), Number(ability.hp || 1));
    S.addLog(state, `${U.cardName(sourceCard)} buffed all allied units.`);
    return { ok: true, state };
  }

  if (effectId === "economics_overflow") {
    owner.inflation_counters = Number(owner.inflation_counters || 0) + 4;
    S.addLog(state, `${owner.name} gained 4 Inflation Counters.`);
    return { ok: true, state };
  }

  if (effectId === "humble_librarian") {
    const burnCount = owner.hand.length;
    while (owner.hand.length > 0) {
      owner.graveyard.push(owner.hand.shift());
    }
    CardOps.drawCards(state, sourceSeat, burnCount);
    S.addLog(state, `${U.cardName(sourceCard)} burned hand and drew ${burnCount}.`);
    return { ok: true, state };
  }

  if (effectId === "book_of_rushwater") {
    damageAllEnemyUnits(state, sourceSeat, Number(sourceCard.power || 4), sourceCard, ctx);
    return { ok: true, state };
  }

  if (effectId === "introduction_to_armory") {
    for (const unit of owner.board) Combat.giveArmor(unit, 1);
    S.addLog(state, `${U.cardName(sourceCard)} gave allied units Armor 1.`);
    return { ok: true, state };
  }

  if (effectId === "monochro_blueprint" || effectId === C.EFFECT_BUFF_DECK_TRAIT) {
    const trait = String(ability.trait || "gadget");
    const attack = Number(ability.attack || 1);
    const hp = Number(ability.hp || 1);

    for (const card of owner.deck) {
      if (U.hasTrait(card, trait)) Combat.buffUnit(card, attack, hp);
    }

    S.addLog(state, `${U.cardName(sourceCard)} buffed ${trait} cards in deck.`);
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_HEAL_ALL_ALLIES_GAIN_MAX_HP) {
    const heal = Number(ability.amount || sourceCard.power || 1);
    for (const unit of owner.board) {
      unit.max_hp += heal;
      Combat.healUnit(unit, heal);
    }
    Combat.healPlayer(owner, heal);
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_REDUCE_ENEMY_MAX_HP_THEN_ADD_COPIES) {
    const reduce = Number(ability.amount || sourceCard.power || 1);
    enemy.max_hp = Math.max(1, Number(enemy.max_hp || 20) - reduce);
    enemy.hp = Math.min(enemy.hp, enemy.max_hp);

    const cardId = String(ability.card_id || sourceCard.card_id);
    const copies = Number(ability.copies || 2);
    CardOps.addCopiesToDeck(state, sourceSeat, cardId, copies, ctx.makeCardFromId);
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_ADD_ZERO_COST_COPIES_OF_LAST_SPELL) {
    const lastSpell = owner.last_spell_cast;
    const copies = Number(ability.amount || sourceCard.power || 1);

    if (lastSpell && lastSpell.card_id) {
      for (let i = 0; i < copies; i++) {
        CardOps.addCardToHand(state, sourceSeat, lastSpell.card_id, ctx.makeCardFromId, card => {
          card.cost = 0;
        });
      }
    }

    return { ok: true, state };
  }

  if (effectId === C.EFFECT_DRAW_RANDOM_TRAIT_FROM_DECK_INCREASE_COST) {
    const trait = String(ability.trait || "mage");
    const count = Number(ability.amount || sourceCard.power || 1);
    const increase = Number(ability.cost_increase || 1);

    for (let i = 0; i < count; i++) {
      const drawn = CardOps.drawRandomFromDeck(state, sourceSeat, card => U.hasTrait(card, trait));
      if (drawn) drawn.cost += increase;
    }

    return { ok: true, state };
  }

  if (effectId === C.EFFECT_HAP_HAZARD) {
    const allTargets = [];
    for (const unit of owner.board) allTargets.push({ type: "unit", owner_seat: sourceSeat, unit });
    for (const unit of enemy.board) allTargets.push({ type: "unit", owner_seat: enemySeat, unit });
    allTargets.push({ type: "player", owner_seat: sourceSeat });
    allTargets.push({ type: "player", owner_seat: enemySeat });

    const picked = U.randomItem(allTargets);
    if (picked?.type === "unit") Combat.damageUnit(state, picked.owner_seat, picked.unit, amount || 3);
    if (picked?.type === "player") Combat.damagePlayer(state, picked.owner_seat, amount || 3);

    Combat.processDeathQueue(state, ctx);
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_DAMAGE_BY_BOARD_TRAIT_COUNT) {
    const trait = String(ability.trait || "");
    const count = CardOps.countTraitOnBoard(owner, trait);
    Combat.damagePlayer(state, enemySeat, count);
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_RESURRECT_TRAIT_UNITS_FROM_GRAVEYARD) {
    const trait = String(ability.trait || "");
    const amountToRes = Number(ability.amount || sourceCard.power || 1);
    let revived = 0;

    for (let i = owner.graveyard.length - 1; i >= 0 && revived < amountToRes; i--) {
      const card = owner.graveyard[i];
      if (!U.isUnit(card)) continue;
      if (trait && !U.hasTrait(card, trait)) continue;
      if (owner.board.length >= C.MAX_BOARD_SIZE) break;

      owner.graveyard.splice(i, 1);
      Combat.applySummonState(card);
      owner.board.push(card);
      revived++;
    }

    return { ok: true, state };
  }

  if (effectId === C.EFFECT_TEMPORARY_IMMOBILE_ALL_ENEMY_UNITS) {
    for (const unit of enemy.board) {
      U.addKeyword(unit, C.KEYWORD_IMMOBILE);
      unit.temporary_immobile = true;
      unit.can_attack = false;
      unit.exhausted = true;
    }
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_RETURN_RANDOM_HAND_UNIT_DRAW_ANOTHER_TRAIT_UNIT) {
    const returned = CardOps.burnRandomCardFromHand(state, sourceSeat, card => U.isUnit(card));
    if (returned) {
      owner.deck.unshift(returned);
      owner.graveyard.pop();

      const excludedTraits = returned.traits || [];
      CardOps.drawRandomFromDeck(state, sourceSeat, card => {
        if (!U.isUnit(card)) return false;
        return !U.hasAnyTrait(card, excludedTraits);
      });
    }
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_MASTERWORK_OF_ART) {
    const burnt = owner.graveyard.splice(0, owner.graveyard.length);
    const traits = new Set();

    for (const card of burnt) {
      for (const trait of U.ensureArray(card.traits)) traits.add(trait);
    }

    const doodle = ctx.makeCardFromId ? ctx.makeCardFromId("doodle") : null;
    if (doodle && owner.board.length < C.MAX_BOARD_SIZE) {
      S.normalizeCard(doodle);
      doodle.traits = Array.from(traits);
      doodle.max_attacks_per_turn = Math.max(1, doodle.traits.length);
      Combat.applySummonState(doodle);
      owner.board.push(doodle);
    }
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_INCANTATION_OF_MINSTREL) {
    const spellCount = owner.graveyard.filter(card => U.isSpell(card)).length;
    Combat.damagePlayer(state, enemySeat, spellCount);
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_LIGHTNING_CEREMONY) {
    damageAllEnemyUnits(state, sourceSeat, Number(ability.amount || sourceCard.power || 2), sourceCard, ctx);
    Combat.damagePlayer(state, enemySeat, Number(ability.face_damage || 0));
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_SCAVENGE_COMMAND) {
    CardOps.drawRandomFromDeck(state, sourceSeat, card => U.isUnit(card));
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_DUEL_ON_SEA) {
    const ally = U.randomItem(owner.board);
    const enemyUnit = U.randomItem(enemy.board);
    if (ally && enemyUnit) {
      Combat.damageUnit(state, enemySeat, enemyUnit, Number(ally.attack || 0));
      Combat.damageUnit(state, sourceSeat, ally, Number(enemyUnit.attack || 0));
      Combat.processDeathQueue(state, ctx);
    }
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_RIME_OF_THE_ANCIENT_MARINER) {
    Combat.summonCard(state, sourceSeat, "ancient_mariner", 1, ctx);
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_ENCOMPASSED_COMPASS) {
    CardOps.drawRandomFromDeck(state, sourceSeat, card => U.hasTrait(card, "marine"));
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_STORM_AND_TIDES) {
    damageAllEnemyUnits(state, sourceSeat, Number(sourceCard.power || 2), sourceCard, ctx);
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_CALL_OF_OMEN) {
    CardOps.addCardToHand(state, sourceSeat, String(ability.card_id || "omen"), ctx.makeCardFromId);
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_CONVIVIAL_HUMMING) {
    const x = CardOps.countSpellsInGraveyard(owner);
    damageAllEnemyUnits(state, sourceSeat, x, sourceCard, ctx);
    return { ok: true, state };
  }

  if (effectId === C.EFFECT_DESTROY_FRIENDLY_TRAIT_UNIT_COPY_TO_HAND_BUFF && target?.type === "unit") {
    const unit = Targets.getUnitByTarget(state, target);
    if (unit && target.owner_seat === sourceSeat) {
      const copyId = unit.card_id;
      Combat.destroyUnit(state, sourceSeat, unit);
      CardOps.addCardToHand(state, sourceSeat, copyId, ctx.makeCardFromId, card => {
        Combat.buffUnit(card, Number(ability.attack || 2), Number(ability.hp || 2));
      });
      Combat.processDeathQueue(state, ctx);
    }
    return { ok: true, state };
  }

  S.addLog(state, `${U.cardName(sourceCard)} effect not fully migrated yet: ${effectId}`);
  return { ok: true, state };
}

module.exports = {
  getAmount,
  getEffectiveSpellDamage,
  applyEffectToTarget,
  buffAllAllyUnits,
  damageAllEnemyUnits,
  resolveSpellOrCardEffect
};

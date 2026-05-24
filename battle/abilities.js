"use strict";

const C = require("./constants");
const U = require("./utils");
const S = require("./state");
const CardOps = require("./card_ops");
const Combat = require("./combat");
const Effects = require("./effects");

function resolveAbility(state, sourceSeat, sourceCard, ability, context = {}, ctx = {}) {
  if (!sourceCard || !ability || typeof ability !== "object") {
    return;
  }

  const effect = String(ability.effect || "");
  const owner = U.getPlayer(state, sourceSeat);
  const enemySeat = U.otherSeat(sourceSeat);
  const enemy = U.getPlayer(state, enemySeat);
  const amount = Number(ability.amount || 0);

  if (!owner) return;

  if (effect === C.ABILITY_EFFECT_DAMAGE) {
    const target = String(ability.target || "");

    if (target === C.TARGET_ALL_ENEMY_UNITS) {
      Effects.damageAllEnemyUnits(state, sourceSeat, amount, sourceCard, ctx);
      S.addLog(state, `${U.cardName(sourceCard)} dealt ${amount} damage to all enemy units.`);
      return;
    }

    if (context.target) {
      Effects.applyEffectToTarget(state, sourceSeat, sourceCard, context.target, C.EFFECT_DAMAGE, amount, ability, ctx);
      Combat.processDeathQueue(state, ctx);
      return;
    }

    Combat.damagePlayer(state, enemySeat, amount);
    return;
  }

  if (effect === C.ABILITY_EFFECT_DRAW) {
    CardOps.drawCards(state, sourceSeat, amount || 1);
    S.addLog(state, `${owner.name}'s ${U.cardName(sourceCard)} drew ${amount || 1} card(s).`);
    return;
  }

  if (effect === C.ABILITY_EFFECT_GAIN_MANA) {
    const gain = amount || 1;
    owner.mana = Math.min(Number(owner.max_mana || 0), Number(owner.mana || 0) + gain);
    return;
  }

  if (effect === C.ABILITY_EFFECT_BUFF_SELF) {
    Combat.buffUnit(sourceCard, Number(ability.attack || 0), Number(ability.hp || 0));
    return;
  }

  if (effect === C.ABILITY_EFFECT_BUFF_ATTACKER && context.attacker) {
    Combat.buffUnit(context.attacker, Number(ability.attack || 0), Number(ability.hp || 0));
    return;
  }

  if (effect === C.ABILITY_EFFECT_BUFF_TRAIT) {
    const trait = String(ability.trait || "");
    const attack = Number(ability.attack || 0);
    const hp = Number(ability.hp || 0);

    for (const unit of owner.board) {
      if (U.hasTrait(unit, trait)) {
        Combat.buffUnit(unit, attack, hp);
      }
    }
    return;
  }

  if (effect === C.ABILITY_EFFECT_GRANT_KEYWORDS_TO_TRAIT) {
    const trait = String(ability.trait || "");
    const keywords = Array.isArray(ability.keywords) ? ability.keywords : [];

    for (const unit of owner.board) {
      if (!trait || U.hasTrait(unit, trait)) {
        for (const keyword of keywords) {
          U.addKeyword(unit, keyword);
        }
      }
    }
    return;
  }

  if (effect === C.ABILITY_EFFECT_BUFF_OTHER_FRIENDLY_TRAIT_UNITS) {
    const trait = String(ability.trait || "");
    const attack = Number(ability.attack || 0);
    const hp = Number(ability.hp || 0);

    for (const unit of owner.board) {
      if (unit === sourceCard) continue;
      if (trait && !U.hasTrait(unit, trait)) continue;
      Combat.buffUnit(unit, attack, hp);
    }
    return;
  }

  if (effect === C.ABILITY_EFFECT_BUFF_RANDOM_HAND_TRAIT) {
    const trait = String(ability.trait || "");
    const candidates = owner.hand.filter(card => U.hasTrait(card, trait));
    const picked = U.randomItem(candidates);
    if (picked) Combat.buffUnit(picked, Number(ability.attack || 0), Number(ability.hp || 0));
    return;
  }

  if (effect === C.ABILITY_EFFECT_BURN_SPELL_FROM_HAND_THEN_BUFF_SELF) {
    const burned = CardOps.burnRandomCardFromHand(state, sourceSeat, card => U.isSpell(card));
    if (burned) {
      Combat.buffUnit(sourceCard, Number(ability.attack || 1), Number(ability.hp || 1));
    }
    return;
  }

  if (effect === C.ABILITY_EFFECT_ADD_COPIES_TO_DECK) {
    const cardId = String(ability.card_id || sourceCard.card_id);
    const copies = Number(ability.amount || ability.copies || 1);
    CardOps.addCopiesToDeck(state, sourceSeat, cardId, copies, ctx.makeCardFromId);
    return;
  }

  if (effect === C.ABILITY_EFFECT_REDUCE_ENEMY_MAX_HP) {
    const reduce = amount || 1;
    enemy.max_hp = Math.max(1, Number(enemy.max_hp || 20) - reduce);
    enemy.hp = Math.min(enemy.hp, enemy.max_hp);
    return;
  }

  if (effect === C.ABILITY_EFFECT_LOSE_STATS_FOR_OTHER_ALLY_UNITS) {
    const otherCount = owner.board.filter(unit => unit && unit !== sourceCard && U.isUnit(unit)).length;
    Combat.buffUnit(
      sourceCard,
      -Number(ability.attack_loss || 1) * otherCount,
      -Number(ability.hp_loss || 1) * otherCount
    );

    if (sourceCard.hp <= 0) {
      Combat.destroyUnit(state, sourceSeat, sourceCard);
      Combat.processDeathQueue(state, ctx);
    }
    return;
  }

  if (effect === C.ABILITY_EFFECT_MODIFY_HAND_COST_BY_TRAIT) {
    const trait = String(ability.trait || "");
    const delta = Number(ability.cost_delta || ability.amount || 0);

    for (const card of owner.hand) {
      if (!trait || U.hasTrait(card, trait)) {
        card.cost = Math.max(0, Number(card.cost || 0) + delta);
      }
    }
    return;
  }

  if (effect === C.ABILITY_EFFECT_DAMAGE_RANDOM_ENEMY_UNIT_OR_FACE) {
    const targets = enemy.board.map(unit => ({ type: "unit", unit }));
    targets.push({ type: "player" });

    const picked = U.randomItem(targets);
    const dmg = amount || 1;

    if (picked?.type === "unit") {
      Combat.damageUnit(state, enemySeat, picked.unit, dmg);
      Combat.processDeathQueue(state, ctx);
    } else {
      Combat.damagePlayer(state, enemySeat, dmg);
    }
    return;
  }

  if (effect === C.ABILITY_EFFECT_SUMMON_CARDS) {
    const cardId = String(ability.card_id || "");
    const summonAmount = Number(ability.amount || 1);
    Combat.summonCard(state, sourceSeat, cardId, summonAmount, ctx);
    return;
  }

  if (effect === C.ABILITY_EFFECT_DESTROY_LOWEST_HEALTH_ENEMY_UNIT) {
    if (enemy.board.length <= 0) return;

    let lowest = enemy.board[0];
    for (const unit of enemy.board) {
      if (Number(unit.hp || 0) < Number(lowest.hp || 0)) lowest = unit;
    }

    Combat.destroyUnit(state, enemySeat, lowest);
    Combat.processDeathQueue(state, ctx);
    return;
  }

  if (effect === C.ABILITY_EFFECT_DESTROY_FRIENDLY_UNIT_GAIN_STATS && context.target?.type === "unit") {
    const unit = require("./targets").getUnitByTarget(state, context.target);
    if (unit && context.target.owner_seat === sourceSeat && unit !== sourceCard) {
      const attack = Number(unit.attack || 0);
      const hp = Number(unit.hp || 0);
      Combat.destroyUnit(state, sourceSeat, unit);
      Combat.buffUnit(sourceCard, attack, hp);
      Combat.processDeathQueue(state, ctx);
    }
    return;
  }

  if (effect === C.ABILITY_EFFECT_DAMAGE_ENEMY_LEADER_ON_ALLY_ATTACK) {
    Combat.damagePlayer(state, enemySeat, amount || 1);
    return;
  }

  if (effect === C.ABILITY_EFFECT_REMOVE_IMMOBILE_SET_ATTACK_FOR_TRAIT) {
    const trait = String(ability.trait || "");
    const attack = Number(ability.attack || 0);

    for (const unit of owner.board) {
      if (trait && !U.hasTrait(unit, trait)) continue;
      U.removeKeyword(unit, C.KEYWORD_IMMOBILE);
      Combat.setUnitAttack(unit, attack);
      unit.can_attack = true;
      unit.exhausted = false;
    }
    return;
  }

  if (effect === C.ABILITY_EFFECT_RETURN_RANDOM_HAND_TRAIT_CARD_THEN_DAMAGE_ALL_ENEMY_UNITS) {
    const trait = String(ability.trait || "");
    const returned = CardOps.burnRandomCardFromHand(state, sourceSeat, card => U.hasTrait(card, trait));
    if (returned) {
      owner.graveyard.pop();
      owner.deck.unshift(returned);
      Effects.damageAllEnemyUnits(state, sourceSeat, amount || 3, sourceCard, ctx);
    }
    return;
  }

  if (effect === C.ABILITY_EFFECT_DESTROY_ENEMY_UNIT_AND_HEAL_LEADER) {
    if (context.target?.type === "unit") {
      const unit = require("./targets").getUnitByTarget(state, context.target);
      if (unit && context.target.owner_seat === enemySeat) {
        const healAmount = Number(unit.hp || amount || 0);
        Combat.destroyUnit(state, enemySeat, unit);
        Combat.healPlayer(owner, healAmount);
        Combat.processDeathQueue(state, ctx);
      }
    }
    return;
  }

  if (effect === C.ABILITY_EFFECT_GAIN_ATTACK_FROM_ALLIED_TRAIT_ATTACK_TOTAL) {
    const trait = String(ability.trait || "");
    let total = 0;

    for (const unit of owner.board) {
      if (unit === sourceCard) continue;
      if (trait && !U.hasTrait(unit, trait)) continue;
      total += Number(unit.attack || 0);
    }

    Combat.buffUnit(sourceCard, total, 0);
    return;
  }

  if (effect === C.ABILITY_EFFECT_DRAW_CARD_THAT_COSTS_MORE) {
    const cost = Number(sourceCard.cost || 0);
    CardOps.drawRandomFromDeck(state, sourceSeat, card => Number(card.cost || 0) > cost);
    return;
  }

  if (effect === C.ABILITY_EFFECT_DRAW_RANDOM_TRAIT_UNIT_FROM_DECK) {
    const trait = String(ability.trait || "");
    CardOps.drawRandomFromDeck(state, sourceSeat, card => U.isUnit(card) && U.hasTrait(card, trait));
    return;
  }

  if (effect === C.ABILITY_EFFECT_LOOK_TOP_DECK_KEEP_OR_BOTTOM) {
    if (owner.deck.length > 0) {
      const top = owner.deck[owner.deck.length - 1];
      S.addLog(state, `${owner.name} looked at top deck card: ${U.cardName(top)}.`);
    }
    return;
  }

  if (effect === C.ABILITY_EFFECT_ADD_CARD_TO_HAND) {
    CardOps.addCardToHand(state, sourceSeat, String(ability.card_id || ""), ctx.makeCardFromId);
    return;
  }

  if (effect === C.ABILITY_EFFECT_GAIN_TEMPORARY_KEYWORD) {
    const keyword = String(ability.keyword || "");
    if (keyword) {
      U.addKeyword(sourceCard, keyword);
      sourceCard.temporary_keywords = sourceCard.temporary_keywords || [];
      sourceCard.temporary_keywords.push(keyword);
    }
    return;
  }

  if (effect === C.ABILITY_EFFECT_ADD_CARD_TO_HAND_IF_TRAIT_PLAYED_COUNT) {
    const trait = String(ability.trait || "");
    const required = Number(ability.required_count || ability.count || 1);
    const playedCount = Number(owner.scholar_cards_played_this_game || 0);

    if (!trait || playedCount >= required) {
      CardOps.addCardToHand(state, sourceSeat, String(ability.card_id || ""), ctx.makeCardFromId);
    }
    return;
  }

  if (effect === C.ABILITY_EFFECT_REMOVE_KEYWORD_THEN_BUFF_SELF) {
    const keyword = String(ability.keyword || C.KEYWORD_IMMOBILE);
    if (U.hasKeyword(sourceCard, keyword)) {
      U.removeKeyword(sourceCard, keyword);
      Combat.buffUnit(sourceCard, Number(ability.attack || 0), Number(ability.hp || 0));
    }
    return;
  }

  if (effect === C.ABILITY_EFFECT_SUMMON_THREE_KEYWORD_COPIES) {
    const cardId = String(ability.card_id || sourceCard.card_id);
    const keyword = String(ability.keyword || "");
    Combat.summonCard(state, sourceSeat, cardId, 3, ctx, card => {
      if (keyword) U.addKeyword(card, keyword);
    });
    return;
  }

  if (effect === C.ABILITY_EFFECT_DESTROY_ALL_OTHER_UNITS_AND_FULL_HEAL_LEADER) {
    for (const seatId of ["A", "B"]) {
      const player = U.getPlayer(state, seatId);
      for (const unit of [...player.board]) {
        if (unit !== sourceCard) Combat.destroyUnit(state, seatId, unit);
      }
    }

    owner.hp = owner.max_hp;
    Combat.processDeathQueue(state, ctx);
    return;
  }

  if (effect === C.ABILITY_EFFECT_DAMAGE_PLAYED_UNIT && context.played_card) {
    Combat.damageUnit(state, context.played_seat, context.played_card, amount || 1);
    Combat.processDeathQueue(state, ctx);
    return;
  }

  if (effect === C.ABILITY_EFFECT_HEAL_DAMAGED_ALLY_GADGET_AND_DAMAGE_ENEMY_LEADER) {
    const damaged = owner.board.find(unit => U.hasTrait(unit, "gadget") && Number(unit.hp || 0) < Number(unit.max_hp || 0));
    if (damaged) {
      Combat.healUnit(damaged, amount || 2);
      Combat.damagePlayer(state, enemySeat, amount || 2);
    }
    return;
  }

  if (effect === "humble_librarian" || effect === "scribe_of_history" || effect === "blind_researcher" || effect === "all_knowing_archivist") {
    resolveNamedBattlecry(state, sourceSeat, sourceCard, ability, context, ctx);
    return;
  }

  S.addLog(state, `Unsupported ability effect: ${effect} on ${U.cardName(sourceCard)}.`);
}

function resolveNamedBattlecry(state, sourceSeat, sourceCard, ability, context, ctx) {
  const effect = String(ability.effect || "");
  const owner = U.getPlayer(state, sourceSeat);
  const enemy = U.getPlayer(state, U.otherSeat(sourceSeat));

  if (effect === "humble_librarian") {
    const burnCount = owner.hand.length;
    while (owner.hand.length > 0) owner.graveyard.push(owner.hand.shift());
    CardOps.drawCards(state, sourceSeat, burnCount);
    return;
  }

  if (effect === "scribe_of_history") {
    const count = enemy.board.length;
    Combat.buffUnit(sourceCard, count, count);
    return;
  }

  if (effect === "blind_researcher") {
    CardOps.drawRandomFromDeck(state, sourceSeat, card => U.hasTrait(card, "scholar"));
    return;
  }

  if (effect === "all_knowing_archivist") {
    Combat.damagePlayer(state, U.otherSeat(sourceSeat), Number(sourceCard.cost || 0));
  }
}

module.exports = {
  resolveAbility,
  resolveNamedBattlecry
};

"use strict";

const C = require("./constants");
const U = require("./utils");
const S = require("./state");
const CardOps = require("./card_ops");
const Combat = require("./combat");

function lazyEffects() {
  try {
    return require("./effects");
  } catch (_err) {
    return null;
  }
}

function getCtx(ctx = {}) {
  return ctx && typeof ctx === "object" ? ctx : {};
}

function addLog(state, message) {
  if (!state || !message) return;
  S.addLog(state, String(message));
}

function getOwnerSeatOrFallback(state, sourceCard, fallbackSeat = "") {
  const ownerSeat = U.getOwnerSeatOfCard(state, sourceCard);
  if (ownerSeat) return ownerSeat;
  return fallbackSeat || state.turn_seat || C.SEAT_A;
}

function getOpponentSeatSafe(seatId) {
  if (seatId === C.SEAT_A || seatId === C.SEAT_B) {
    return U.otherSeat(seatId);
  }

  return C.SEAT_B;
}

function getAbilityEffect(ability) {
  return String((ability && ability.effect) || "");
}

function getAbilityTarget(ability) {
  return String((ability && ability.target) || "");
}

function getAbilityAmount(ability, fallback = 0) {
  return Number((ability && ability.amount) ?? fallback);
}

function getAbilitiesByTrigger(card, trigger) {
  return U.getAbilities(card, trigger);
}

function passesOnlyFriendlyEnemy(sourceSeat, playedSeat, ability) {
  const onlyFriendly = Boolean(ability.only_friendly || false);
  const onlyEnemy = Boolean(ability.only_enemy || false);

  if (onlyFriendly && sourceSeat !== playedSeat) {
    return false;
  }

  if (onlyEnemy && sourceSeat === playedSeat) {
    return false;
  }

  return true;
}

function setPendingAbilityTarget(state, sourceSeat, sourceCard, ability) {
  state.selecting_target = true;
  state.selecting_hand_card = false;
  state.pending_action_type = C.ACTION_ABILITY;
  state.pending_card = sourceCard;
  state.pending_hand_index = -1;
  state.pending_card_owner = U.seatToOwnerId(sourceSeat);
  state.pending_attacker_index = -1;
  state.selected_attacker_owner = "";
  state.selected_attacker_index = -1;
  state.pending_ability = U.deepClone(ability || {});
  state.selected = null;

  addLog(state, `Select a target for ${U.cardName(sourceCard)}'s ability.`);
}

function resolveAbilityTargetDamage(state, sourceSeat, sourceCard, ability, target, ctx = {}) {
  const amount = getAbilityAmount(ability, 0);

  if (!target || amount <= 0) {
    return false;
  }

  if (target.type === "player") {
    Combat.damagePlayer(state, target.owner_seat, amount);
    addLog(state, `${U.cardName(sourceCard)} dealt ${amount} damage to ${U.cardName({ card_name: U.getPlayer(state, target.owner_seat)?.name || "leader" })}.`);
    return true;
  }

  if (target.type === "unit") {
    Combat.damageUnit(state, target.owner_seat, Number(target.board_index), amount, ctx);
    addLog(state, `${U.cardName(sourceCard)} dealt ${amount} damage to a unit.`);
    return true;
  }

  return false;
}

function resolvePendingAbilityTarget(state, sourceSeat, target, ctx = {}) {
  const sourceCard = state.pending_card || null;
  const ability = state.pending_ability || {};

  if (!sourceCard || !ability || Object.keys(ability).length <= 0) {
    S.clearSelection(state);
    return { ok: false, state, message: "No pending ability." };
  }

  const effect = getAbilityEffect(ability);

  switch (effect) {
    case C.ABILITY_EFFECT_DAMAGE:
      resolveAbilityTargetDamage(state, sourceSeat, sourceCard, ability, target, ctx);
      break;

    case C.ABILITY_EFFECT_DESTROY_FRIENDLY_UNIT_GAIN_STATS:
      if (!target || target.type !== "unit") {
        return { ok: false, state, message: "Invalid ability target." };
      }
      resolveDestroyFriendlyUnitGainStats(state, sourceSeat, sourceCard, target.owner_seat, Number(target.board_index), ability, ctx);
      break;

    default:
      addLog(state, `Unsupported ability effect: ${effect}.`);
      break;
  }

  S.clearSelection(state);
  Combat.processDeathQueue(state, ctx);
  S.syncLegacy(state);

  return { ok: true, state };
}

function resolveBattlecry(state, sourceSeat, sourceCard, context = {}, ctx = {}) {
  if (!state || !sourceCard) return;

  const abilities = getAbilitiesByTrigger(sourceCard, C.TRIGGER_BATTLECRY);
  if (abilities.length <= 0) return;

  for (const ability of abilities) {
    resolveBattlecryAbility(state, sourceSeat, sourceCard, ability, context, ctx);
  }

  Combat.processDeathQueue(state, ctx);
  S.syncLegacy(state);
}

function resolveBattlecryAbility(state, sourceSeat, sourceCard, ability, context = {}, ctx = {}) {
  if (!state || !sourceCard || !ability) return;

  const effect = getAbilityEffect(ability);
  const target = getAbilityTarget(ability);

  switch (effect) {
    case C.ABILITY_EFFECT_DAMAGE: {
      const amount = getAbilityAmount(ability, 0);

      if (target === C.ABILITY_TARGET_ALL_ENEMY_UNITS) {
        const hitCount = Combat.dealDamageToAllEnemyUnitsForPlayer(state, sourceSeat, amount, ctx);
        addLog(state, `${U.cardName(sourceCard)} dealt ${amount} damage to all enemy units. Hit units: ${hitCount}.`);
        return;
      }

      if (context && context.target) {
        resolveAbilityTargetDamage(state, sourceSeat, sourceCard, ability, context.target, ctx);
        return;
      }

      setPendingAbilityTarget(state, sourceSeat, sourceCard, ability);
      return;
    }

    case C.ABILITY_EFFECT_BUFF_TRAIT:
      if (target === C.ABILITY_TARGET_FRIENDLY_UNITS_WITH_TRAIT) {
        buffFriendlyUnitsWithTraitFromAbility(state, sourceSeat, sourceCard, ability);
      } else {
        addLog(state, `Unsupported buff trait target: ${target}.`);
      }
      return;

    case C.ABILITY_EFFECT_BURN_SPELL_FROM_HAND_THEN_BUFF_SELF:
      burnSpellFromHandThenBuffSelf(state, sourceSeat, sourceCard, ability);
      return;

    case C.ABILITY_EFFECT_ADD_COPIES_TO_DECK:
      addCopiesToOwnersDeck(state, sourceSeat, sourceCard, ability, ctx);
      return;

    case C.ABILITY_EFFECT_LOSE_STATS_FOR_OTHER_ALLY_UNITS:
      resolveLoseStatsForOtherAllyUnits(state, sourceSeat, sourceCard, ability, ctx);
      return;

    case C.ABILITY_EFFECT_SUMMON_CARDS: {
      const cardId = String(ability.card_id || "");
      const amount = getAbilityAmount(ability, 0);
      const summonedCount = Combat.summonCard(state, sourceSeat, cardId, amount, ctx);
      addLog(state, `${U.cardName(sourceCard)} summoned ${summonedCount} ${cardId}.`);
      return;
    }

    case C.ABILITY_EFFECT_DESTROY_FRIENDLY_UNIT_GAIN_STATS:
      if (context && context.target && context.target.type === "unit") {
        resolveDestroyFriendlyUnitGainStats(state, sourceSeat, sourceCard, context.target.owner_seat, Number(context.target.board_index), ability, ctx);
      } else {
        setPendingAbilityTarget(state, sourceSeat, sourceCard, ability);
      }
      return;

    case C.ABILITY_EFFECT_REMOVE_IMMOBILE_SET_ATTACK_FOR_TRAIT:
      resolveRemoveImmobileSetAttackForTrait(state, sourceSeat, sourceCard, ability);
      return;

    case C.ABILITY_EFFECT_DESTROY_ENEMY_UNIT_AND_HEAL_LEADER:
      resolveDestroyEnemyUnitAndHealLeader(state, sourceSeat, sourceCard, ability, ctx);
      return;

    case C.ABILITY_EFFECT_GAIN_ATTACK_FROM_ALLIED_TRAIT_ATTACK_TOTAL:
      resolveGainAttackFromAlliedTraitAttackTotal(state, sourceSeat, sourceCard, ability);
      return;

    case C.ABILITY_EFFECT_LOOK_TOP_DECK_KEEP_OR_BOTTOM:
      lookTopDeckKeepOrBottomTemporary(state, sourceSeat, sourceCard);
      return;

    case C.ABILITY_EFFECT_GAIN_TEMPORARY_KEYWORD:
      gainTemporaryKeywordFromAbility(state, sourceSeat, sourceCard, ability);
      return;

    case C.ABILITY_EFFECT_ADD_CARD_TO_HAND_IF_TRAIT_PLAYED_COUNT:
      addCardToHandIfTraitPlayedCount(state, sourceSeat, sourceCard, ability, ctx);
      return;

    case C.ABILITY_EFFECT_SUMMON_THREE_KEYWORD_COPIES:
      summonThreeKeywordCopiesFromAbility(state, sourceSeat, sourceCard, ability, ctx);
      return;

    case C.ABILITY_EFFECT_DESTROY_ALL_OTHER_UNITS_AND_FULL_HEAL_LEADER:
      destroyAllOtherUnitsAndFullHealLeader(state, sourceSeat, sourceCard, ability, ctx);
      return;

    case C.EFFECT_HUMBLE_LIBRARIAN:
      resolveHumbleLibrarianBattlecry(state, sourceSeat, sourceCard);
      return;

    case C.EFFECT_SCRIBE_OF_HISTORY:
      resolveScribeOfHistoryBattlecry(state, sourceSeat, sourceCard);
      return;

    case C.EFFECT_BLIND_RESEARCHER:
      resolveBlindResearcherBattlecry(state, sourceSeat, sourceCard);
      return;

    case C.EFFECT_ALL_KNOWING_ARCHIVIST:
      resolveAllKnowingArchivistBattlecry(state, sourceSeat, sourceCard);
      return;

    default:
      addLog(state, `Unsupported battlecry effect: ${effect}.`);
  }
}

function resolveTurnStart(state, activeSeat, ctx = {}) {
  if (!state) return;

  U.clearExpiredTemporaryKeywords(state, activeSeat);

  const player = U.getPlayer(state, activeSeat);
  if (!player) return;

  for (const unit of U.ensureArray(player.board)) {
    if (unit) {
      unit.flying_fortress_prevent_used_this_turn = false;
      if (!unit.once_per_turn_flags || typeof unit.once_per_turn_flags !== "object") {
        unit.once_per_turn_flags = {};
      } else {
        unit.once_per_turn_flags = {};
      }
    }
  }

  resolveTurnStartTriggers(state, activeSeat, ctx);
  Combat.processDeathQueue(state, ctx);
  U.refreshAttackPermissionsForPlayer(player);
  S.syncLegacy(state);
}

function resolveTurnStartTriggers(state, seatId, ctx = {}) {
  const player = U.getPlayer(state, seatId);
  if (!player) return;

  const boardSnapshot = U.ensureArray(player.board).slice();

  for (const sourceCard of boardSnapshot) {
    if (!sourceCard || !player.board.includes(sourceCard)) continue;

    for (const ability of getAbilitiesByTrigger(sourceCard, C.TRIGGER_TURN_START)) {
      resolveTurnStartAbility(state, seatId, sourceCard, ability, ctx);
    }
  }
}

function resolveTurnStartAbility(state, sourceSeat, sourceCard, ability, ctx = {}) {
  if (!state || !sourceCard || !ability) return;

  const owner = U.getPlayer(state, sourceSeat);
  if (!owner) return;

  const effect = getAbilityEffect(ability);

  switch (effect) {
    case C.ABILITY_EFFECT_DRAW_RANDOM_SPELL_FROM_DECK: {
      const amount = getAbilityAmount(ability, 1);
      for (let i = 0; i < amount; i++) {
        CardOps.drawRandomSpellFromDeck(state, sourceSeat);
      }
      addLog(state, `${U.cardName(sourceCard)} drew ${amount} random spell card(s).`);
      return;
    }

    case C.ABILITY_EFFECT_BUFF_OTHER_FRIENDLY_TRAIT_UNITS:
      buffOtherFriendlyTraitUnits(state, sourceSeat, sourceCard, ability, "turn start");
      return;

    case C.ABILITY_EFFECT_BUFF_TRAIT:
      buffFriendlyUnitsWithTraitFromAbility(state, sourceSeat, sourceCard, ability);
      return;

    case C.ABILITY_EFFECT_SUMMON_CARDS: {
      const cardId = String(ability.card_id || "");
      const amount = getAbilityAmount(ability, 0);
      const summonedCount = Combat.summonCard(state, sourceSeat, cardId, amount, ctx);
      addLog(state, `${U.cardName(sourceCard)} summoned ${summonedCount} ${cardId}.`);
      return;
    }

    case C.ABILITY_EFFECT_REMOVE_KEYWORD_THEN_BUFF_SELF:
      removeKeywordThenBuffSelfFromAbility(state, sourceSeat, sourceCard, ability);
      return;

    case C.ABILITY_EFFECT_BUFF_SELF:
      buffSelfFromAbility(state, sourceSeat, sourceCard, ability, ctx);
      return;

    case C.ABILITY_EFFECT_DESTROY_LOWEST_HEALTH_ENEMY_UNIT:
      destroyLowestHealthEnemyUnitAtTurnStart(state, sourceSeat, sourceCard, ability, ctx);
      return;

    default:
      addLog(state, `${U.cardName(sourceCard)} has unknown turn_start effect: ${effect}.`);
  }
}

function resolveTurnEnd(state, activeSeat, ctx = {}) {
  resolveTurnEndTriggers(state, activeSeat, ctx);
  Combat.processDeathQueue(state, ctx);
  S.syncLegacy(state);
}

function resolveTurnEndTriggers(state, seatId, ctx = {}) {
  const player = U.getPlayer(state, seatId);
  if (!player) return;

  const boardSnapshot = U.ensureArray(player.board).slice();

  for (const sourceCard of boardSnapshot) {
    if (!sourceCard || !player.board.includes(sourceCard)) continue;

    for (const ability of getAbilitiesByTrigger(sourceCard, C.TRIGGER_TURN_END)) {
      resolveTurnEndAbility(state, seatId, sourceCard, ability, ctx);
    }
  }
}

function resolveTurnEndAbility(state, sourceSeat, sourceCard, ability, ctx = {}) {
  const effect = getAbilityEffect(ability);

  switch (effect) {
    case C.ABILITY_EFFECT_BUFF_OTHER_FRIENDLY_TRAIT_UNITS:
      buffOtherFriendlyTraitUnits(state, sourceSeat, sourceCard, ability, "turn end");
      return;

    case C.ABILITY_EFFECT_BUFF_TRAIT:
      buffFriendlyUnitsWithTraitFromAbility(state, sourceSeat, sourceCard, ability);
      return;

    case C.ABILITY_EFFECT_RETURN_RANDOM_HAND_TRAIT_CARD_THEN_DAMAGE_ALL_ENEMY_UNITS:
      returnRandomHandTraitCardThenDamageAllEnemyUnits(state, sourceSeat, sourceCard, ability, ctx);
      return;

    case C.ABILITY_EFFECT_BUFF_SELF:
      buffSelfFromAbility(state, sourceSeat, sourceCard, ability, ctx);
      return;

    default:
      addLog(state, `${U.cardName(sourceCard)} has unknown turn_end effect: ${effect}.`);
  }
}

function resolveOnUnitPlayed(state, playedSeat, playedCard, ctx = {}) {
  if (!state || !playedCard || !U.isUnit(playedCard)) return;

  for (const sourceSeat of [C.SEAT_A, C.SEAT_B]) {
    const sourceOwner = U.getPlayer(state, sourceSeat);
    if (!sourceOwner) continue;

    const boardSnapshot = U.ensureArray(sourceOwner.board).slice();

    for (const sourceCard of boardSnapshot) {
      if (!sourceCard || !sourceOwner.board.includes(sourceCard)) continue;

      for (const ability of getAbilitiesByTrigger(sourceCard, C.TRIGGER_ON_UNIT_PLAYED)) {
        resolveOnUnitPlayedAbility(
          state,
          sourceSeat,
          sourceCard,
          ability,
          playedSeat,
          playedCard,
          ctx
        );
      }
    }
  }

  Combat.processDeathQueue(state, ctx);
  S.syncLegacy(state);
}

function resolveOnUnitPlayedAbility(state, sourceSeat, sourceCard, ability, playedSeat, playedCard, ctx = {}) {
  if (!state || !sourceCard || !ability || !playedCard) return;

  const includeSelf = ability.include_self !== undefined ? Boolean(ability.include_self) : true;
  if (!includeSelf && sourceCard === playedCard) return;

  const requiredTrait = U.normalizeLowerString(ability.trait || "");
  if (requiredTrait && !U.hasTrait(playedCard, requiredTrait)) return;

  if (!passesOnlyFriendlyEnemy(sourceSeat, playedSeat, ability)) return;

  const effect = getAbilityEffect(ability);
  const amount = getAbilityAmount(ability, 0);

  switch (effect) {
    case C.ABILITY_EFFECT_DRAW:
      if (amount <= 0) return;
      CardOps.drawCards(state, sourceSeat, amount);
      addLog(state, `${U.cardName(sourceCard)} triggered. Drew ${amount} card(s).`);
      return;

    case C.ABILITY_EFFECT_REMOVE_KEYWORDS_FROM_PLAYED_UNIT:
      removeKeywordsFromPlayedUnit(state, playedSeat, sourceCard, ability, playedCard);
      return;

    case C.ABILITY_EFFECT_DRAW_RANDOM_TRAIT_UNIT_FROM_DECK:
      drawRandomTraitUnitFromDeckOnUnitPlayed(state, sourceSeat, sourceCard, ability, playedSeat, playedCard);
      return;

    case C.ABILITY_EFFECT_DAMAGE_PLAYED_UNIT: {
      if (amount <= 0) return;
      Combat.damageUnit(state, playedSeat, playedCard, amount, ctx);
      addLog(state, `${U.cardName(sourceCard)} dealt ${amount} damage to ${U.cardName(playedCard)}.`);
      return;
    }

    default:
      addLog(state, `Unsupported on_unit_played effect: ${effect}.`);
  }
}

function resolveOnSpellPlayed(state, playedSeat, playedSpell, ctx = {}) {
  if (!state || !playedSpell || !U.isSpell(playedSpell)) return;

  for (const sourceSeat of [C.SEAT_A, C.SEAT_B]) {
    const sourceOwner = U.getPlayer(state, sourceSeat);
    if (!sourceOwner) continue;

    const boardSnapshot = U.ensureArray(sourceOwner.board).slice();

    for (const sourceCard of boardSnapshot) {
      if (!sourceCard || !sourceOwner.board.includes(sourceCard)) continue;

      for (const ability of getAbilitiesByTrigger(sourceCard, C.TRIGGER_ON_SPELL_PLAYED)) {
        resolveOnSpellPlayedAbility(
          state,
          sourceSeat,
          sourceCard,
          ability,
          playedSeat,
          playedSpell,
          ctx
        );
      }
    }
  }

  Combat.processDeathQueue(state, ctx);
  S.syncLegacy(state);
}

function resolveOnSpellPlayedAbility(state, sourceSeat, sourceCard, ability, playedSeat, playedSpell, ctx = {}) {
  if (!passesOnlyFriendlyEnemy(sourceSeat, playedSeat, ability)) return;

  const effect = getAbilityEffect(ability);
  const attackBonus = Number(ability.attack || 0);
  const hpBonus = Number(ability.hp || 0);

  switch (effect) {
    case C.ABILITY_EFFECT_BUFF_SELF:
      U.buffCardStats(sourceCard, attackBonus, hpBonus);
      addLog(state, `${U.cardName(sourceCard)} gained +${attackBonus}/+${hpBonus}.`);
      return;

    case C.ABILITY_EFFECT_DAMAGE_RANDOM_ENEMY_UNIT_OR_FACE:
      damageRandomEnemyUnitOrFaceOnSpellPlayed(state, sourceSeat, sourceCard, ability, ctx);
      return;

    default:
      addLog(state, `Unsupported on_spell_played effect: ${effect}.`);
  }
}

function resolveWhenKillsAbilities(state, sourceSeat, sourceCard, ctx = {}) {
  if (!state || !sourceCard) return;

  for (const ability of getAbilitiesByTrigger(sourceCard, C.TRIGGER_WHEN_KILLS)) {
    resolveWhenKillsAbility(state, sourceSeat, sourceCard, ability, ctx);
  }

  Combat.processDeathQueue(state, ctx);
  S.syncLegacy(state);
}

function resolveWhenKillsAbility(state, sourceSeat, sourceCard, ability, ctx = {}) {
  const effect = getAbilityEffect(ability);
  const target = getAbilityTarget(ability);
  const amount = getAbilityAmount(ability, 0);

  switch (effect) {
    case C.ABILITY_EFFECT_DAMAGE:
      if (target === C.ABILITY_TARGET_ALL_ENEMY_UNITS) {
        const owner = U.getPlayer(state, sourceSeat);
        const effectiveAmount = U.getEffectiveSpellDamage(sourceCard, owner, amount);
        const hitCount = Combat.dealDamageToAllEnemyUnitsForPlayer(state, sourceSeat, effectiveAmount, ctx);
        addLog(state, `${U.cardName(sourceCard)}'s kill effect dealt ${effectiveAmount} damage to all enemy units. Hit units: ${hitCount}.`);
      } else {
        addLog(state, `Unsupported when_kills damage target: ${target}.`);
      }
      return;

    case C.ABILITY_EFFECT_GAIN_MANA: {
      const owner = U.getPlayer(state, sourceSeat);
      const gained = CardOps.gainMana(owner, amount);
      addLog(state, `${U.cardName(sourceCard)}'s kill effect gave ${gained} mana.`);
      return;
    }

    default:
      addLog(state, `Unsupported when_kills effect: ${effect}.`);
  }
}

function resolveWhenDestroyedAbilities(state, destroyedSeat, destroyedCard, ctx = {}) {
  if (!state || !destroyedCard) return;

  for (const ability of getAbilitiesByTrigger(destroyedCard, C.TRIGGER_WHEN_DESTROYED)) {
    resolveWhenDestroyedAbility(state, destroyedSeat, destroyedCard, ability, ctx);
  }

  Combat.processDeathQueue(state, ctx);
  S.syncLegacy(state);
}

function resolveWhenDestroyedAbility(state, destroyedSeat, destroyedCard, ability, ctx = {}) {
  const owner = U.getPlayer(state, destroyedSeat);
  if (!owner) return;

  const effect = getAbilityEffect(ability);
  const target = getAbilityTarget(ability);
  const traitName = U.normalizeLowerString(ability.trait || "");
  const attackBonus = Number(ability.attack || 0);
  const hpBonus = Number(ability.hp || 0);

  switch (effect) {
    case C.ABILITY_EFFECT_MODIFY_HAND_COST_BY_TRAIT:
      modifyHandCostByTraitFromAbility(state, destroyedSeat, destroyedCard, ability);
      return;

    case C.ABILITY_EFFECT_BUFF_RANDOM_HAND_TRAIT: {
      if (target !== C.ABILITY_TARGET_RANDOM_HAND_UNIT_WITH_TRAIT) {
        addLog(state, `Unsupported when_destroyed target: ${target}.`);
        return;
      }

      const targetCard = CardOps.getRandomUnitInHandWithTrait(owner, traitName);
      if (!targetCard) {
        addLog(state, `${U.cardName(destroyedCard)} found no ${traitName} unit in hand.`);
        return;
      }

      U.buffCardStats(targetCard, attackBonus, hpBonus);
      addLog(state, `${U.cardName(destroyedCard)} gave ${U.cardName(targetCard)} +${attackBonus}/+${hpBonus}.`);
      return;
    }

    case C.ABILITY_EFFECT_COPY_SELF_TO_BOARD: {
      const copiedCard = U.copyCardData(destroyedCard);
      if (!copiedCard) return;

      U.buffCardStats(copiedCard, attackBonus, hpBonus);
      copiedCard.hp = copiedCard.max_hp;

      if (owner.board.length >= C.MAX_BOARD_SIZE) {
        owner.graveyard.push(copiedCard);
        addLog(state, `${U.cardName(destroyedCard)} created a copy, but board was full.`);
        return;
      }

      Combat.applySummonState(copiedCard, owner);
      owner.board.push(copiedCard);
      U.refreshAttackPermissionsForPlayer(owner);

      addLog(state, `${U.cardName(destroyedCard)} summoned a +${attackBonus}/+${hpBonus} copy.`);
      return;
    }

    case C.ABILITY_EFFECT_SUMMON_CARDS:
      summonCardsFromAbility(state, destroyedSeat, destroyedCard, ability, ctx);
      return;

    case C.ABILITY_EFFECT_DRAW_CARD_THAT_COSTS_MORE:
      drawCardThatCostsMoreThanSource(state, destroyedSeat, destroyedCard, ability);
      return;

    case C.ABILITY_EFFECT_DRAW: {
      const amount = getAbilityAmount(ability, 1);
      CardOps.drawCards(state, destroyedSeat, amount);
      addLog(state, `${U.cardName(destroyedCard)} drew ${amount} card(s).`);
      return;
    }

    case C.ABILITY_EFFECT_ADD_CARD_TO_HAND:
      addCardToHandFromAbility(state, destroyedSeat, destroyedCard, ability, ctx);
      return;

    default:
      addLog(state, `Unsupported when_destroyed effect: ${effect}.`);
  }
}

function resolveOnDestroyTargetAbilities(state, sourceSeat, sourceCard, targetWasFriendly, ctx = {}) {
  if (!state || !sourceCard) return;

  const abilities = getAbilitiesByTrigger(sourceCard, C.TRIGGER_ON_DESTROY_TARGET)
    .concat(U.getAbilities(sourceCard, "on_destroy_target"));

  for (const ability of abilities) {
    resolveOnDestroyTargetAbility(state, sourceSeat, sourceCard, ability, targetWasFriendly, ctx);
  }
}

function resolveOnDestroyTargetAbility(state, sourceSeat, sourceCard, ability, targetWasFriendly, _ctx = {}) {
  const condition = String(ability.condition || "");
  const effect = getAbilityEffect(ability);
  const amount = getAbilityAmount(ability, 0);

  if (condition === C.ABILITY_CONDITION_TARGET_WAS_FRIENDLY && !targetWasFriendly) {
    return;
  }

  switch (effect) {
    case C.ABILITY_EFFECT_GAIN_MANA: {
      const owner = U.getPlayer(state, sourceSeat);
      const gained = CardOps.gainMana(owner, amount);
      addLog(state, `${U.cardName(sourceCard)} gave ${gained} mana.`);
      return;
    }

    default:
      addLog(state, `Unsupported on_destroy_target effect: ${effect}.`);
  }
}

function resolveWhenAttackedAbilities(state, defenderSeat, defender, attackerSeat, attacker, ctx = {}) {
  if (!state || !defender || !attacker) return;

  for (const ability of getAbilitiesByTrigger(defender, C.TRIGGER_WHEN_ATTACKED)) {
    resolveWhenAttackedAbility(state, defenderSeat, defender, attackerSeat, attacker, ability, ctx);
  }

  Combat.processDeathQueue(state, ctx);
  S.syncLegacy(state);
}

function resolveWhenAttackedAbility(state, defenderSeat, defender, attackerSeat, attacker, ability, ctx = {}) {
  const effect = getAbilityEffect(ability);

  switch (effect) {
    case C.ABILITY_EFFECT_DEBUFF_ATTACKER:
      debuffAttackerFromWhenAttacked(state, defenderSeat, defender, attackerSeat, attacker, ability, ctx);
      return;

    default:
      addLog(state, `${U.cardName(defender)} has unknown when_attacked effect: ${effect}.`);
  }
}

function resolveOnAllyUnitAttackTriggers(state, attackerSeat, attacker, ctx = {}) {
  const attackerOwner = U.getPlayer(state, attackerSeat);
  if (!state || !attackerOwner || !attacker) return;

  const boardSnapshot = U.ensureArray(attackerOwner.board).slice();

  for (const sourceCard of boardSnapshot) {
    if (!sourceCard || !attackerOwner.board.includes(sourceCard)) continue;

    for (const ability of getAbilitiesByTrigger(sourceCard, C.TRIGGER_ON_ALLY_UNIT_ATTACK)) {
      resolveOnAllyUnitAttackAbility(state, attackerSeat, sourceCard, attacker, ability, ctx);
    }
  }

  Combat.processDeathQueue(state, ctx);
  S.syncLegacy(state);
}

function resolveOnAllyUnitAttackAbility(state, sourceSeat, sourceCard, attacker, ability, ctx = {}) {
  const effect = getAbilityEffect(ability);
  const amount = getAbilityAmount(ability, 0);

  switch (effect) {
    case C.ABILITY_EFFECT_DAMAGE_ENEMY_LEADER_ON_ALLY_ATTACK: {
      const enemySeat = U.otherSeat(sourceSeat);
      Combat.damagePlayer(state, enemySeat, amount);
      addLog(state, `${U.cardName(sourceCard)} dealt ${amount} damage to enemy leader.`);
      return;
    }

    case C.ABILITY_EFFECT_BUFF_ATTACKER: {
      const attackBonus = Number(ability.attack || 0);
      const hpBonus = Number(ability.hp || 0);
      U.buffCardStats(attacker, attackBonus, hpBonus);
      addLog(state, `${U.cardName(sourceCard)} gave ${U.cardName(attacker)} +${attackBonus}/+${hpBonus} before the attack.`);
      return;
    }

    default:
      addLog(state, `Unsupported on_ally_unit_attack effect: ${effect}.`);
  }

  Combat.processDeathQueue(state, ctx);
}

function resolveOnAllyUnitDamagedTriggers(state, damagedSeat, damagedUnit, actualDamage, ctx = {}) {
  if (!state || !damagedUnit || actualDamage <= 0) return;

  const damagedOwner = U.getPlayer(state, damagedSeat);
  if (!damagedOwner) return;

  const boardSnapshot = U.ensureArray(damagedOwner.board).slice();

  for (const sourceCard of boardSnapshot) {
    if (!sourceCard || !damagedOwner.board.includes(sourceCard)) continue;

    for (const ability of getAbilitiesByTrigger(sourceCard, C.TRIGGER_ON_ALLY_UNIT_DAMAGED)) {
      resolveOnAllyUnitDamagedAbility(state, damagedSeat, sourceCard, damagedUnit, ability, ctx);
    }
  }

  Combat.processDeathQueue(state, ctx);
  S.syncLegacy(state);
}

function resolveOnAllyUnitDamagedAbility(state, sourceSeat, sourceCard, damagedUnit, ability, _ctx = {}) {
  const effect = getAbilityEffect(ability);

  switch (effect) {
    case C.ABILITY_EFFECT_HEAL_DAMAGED_ALLY_GADGET_AND_DAMAGE_ENEMY_LEADER:
      resolveAllyGadgetDamagedFromAbility(state, sourceSeat, sourceCard, damagedUnit, ability);
      return;

    default:
      addLog(state, `Unsupported on_ally_unit_damaged effect: ${effect}.`);
  }
}

function resolveCardTrigger(state, sourceSeat, sourceCard, trigger, context = {}, ctx = {}) {
  if (!state || !sourceCard) return;

  switch (trigger) {
    case C.TRIGGER_BATTLECRY:
      for (const ability of getAbilitiesByTrigger(sourceCard, trigger)) {
        resolveBattlecryAbility(state, sourceSeat, sourceCard, ability, context, ctx);
      }
      return;

    case C.TRIGGER_WHEN_KILLS:
      resolveWhenKillsAbilities(state, sourceSeat, sourceCard, ctx);
      return;

    case C.TRIGGER_WHEN_DESTROYED:
      resolveWhenDestroyedAbilities(state, sourceSeat, sourceCard, ctx);
      return;

    case C.TRIGGER_WHEN_ATTACKED:
      resolveWhenAttackedAbilities(
        state,
        sourceSeat,
        sourceCard,
        context.attacker_seat,
        context.attacker,
        ctx
      );
      return;

    default:
      for (const ability of getAbilitiesByTrigger(sourceCard, trigger)) {
        resolveGenericAbility(state, sourceSeat, sourceCard, ability, context, ctx);
      }
  }
}

function resolveGlobalTrigger(state, trigger, context = {}, ctx = {}) {
  if (!state) return;

  switch (trigger) {
    case C.TRIGGER_ON_ALLY_UNIT_ATTACK:
      if (context.attacker_seat && context.attacker) {
        resolveOnAllyUnitAttackTriggers(state, context.attacker_seat, context.attacker, ctx);
      }
      return;

    default:
      for (const seat of [C.SEAT_A, C.SEAT_B]) {
        const player = U.getPlayer(state, seat);
        if (!player) continue;

        for (const sourceCard of U.ensureArray(player.board).slice()) {
          if (!sourceCard || !player.board.includes(sourceCard)) continue;

          for (const ability of getAbilitiesByTrigger(sourceCard, trigger)) {
            resolveGenericAbility(state, seat, sourceCard, ability, context, ctx);
          }
        }
      }
  }
}

function resolveGenericAbility(state, sourceSeat, sourceCard, ability, context = {}, ctx = {}) {
  const effect = getAbilityEffect(ability);

  switch (effect) {
    case C.ABILITY_EFFECT_BUFF_SELF:
      buffSelfFromAbility(state, sourceSeat, sourceCard, ability, ctx);
      return;

    case C.ABILITY_EFFECT_SUMMON_CARDS:
      summonCardsFromAbility(state, sourceSeat, sourceCard, ability, ctx);
      return;

    case C.ABILITY_EFFECT_DRAW:
      CardOps.drawCards(state, sourceSeat, getAbilityAmount(ability, 1));
      return;

    default:
      addLog(state, `Unsupported generic ability effect: ${effect}.`);
  }
}

function clearExpiredTemporaryKeywords(state, seatId) {
  U.clearExpiredTemporaryKeywords(state, seatId);
}

/* ============================================================================
 * Ability helper implementations
 * ========================================================================== */

function buffSelfFromAbility(state, sourceSeat, sourceCard, ability, ctx = {}) {
  const attackBonus = Number(ability.attack || 0);
  const hpBonus = Number(ability.hp || 0);

  U.buffCardStats(sourceCard, attackBonus, hpBonus);

  if (sourceCard.hp <= 0) {
    Combat.destroyUnit(state, sourceSeat, sourceCard, ctx);
    return;
  }

  addLog(state, `${U.cardName(sourceCard)} gained ${attackBonus}/${hpBonus}.`);
}

function buffFriendlyUnitsWithTraitFromAbility(state, sourceSeat, sourceCard, ability) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner) return;

  const traitName = U.normalizeLowerString(ability.trait || "");
  const attackBonus = Number(ability.attack || 0);
  const hpBonus = Number(ability.hp || 0);

  if (!traitName) return;

  let affected = 0;

  for (const unit of U.ensureArray(owner.board)) {
    if (!unit || !U.isUnit(unit)) continue;
    if (!U.hasTrait(unit, traitName)) continue;

    U.buffCardStats(unit, attackBonus, hpBonus);

    const keywords = U.ensureArray(ability.keywords);
    for (const keyword of keywords) {
      U.addKeyword(unit, keyword);
    }

    affected++;
  }

  addLog(state, `${U.cardName(sourceCard)} gave friendly ${traitName} units +${attackBonus}/+${hpBonus}. Affected units: ${affected}.`);
  U.refreshAttackPermissionsForPlayer(owner);
}

function buffOtherFriendlyTraitUnits(state, sourceSeat, sourceCard, ability, phaseText) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner) return;

  const traitName = U.normalizeLowerString(ability.trait || "");
  const attackBonus = Number(ability.attack || 0);
  const hpBonus = Number(ability.hp || 0);

  if (!traitName) return;

  let affected = 0;

  for (const unit of U.ensureArray(owner.board)) {
    if (!unit || !U.isUnit(unit)) continue;
    if (unit === sourceCard) continue;
    if (!U.hasTrait(unit, traitName)) continue;

    U.buffCardStats(unit, attackBonus, hpBonus);
    affected++;
  }

  if (affected > 0) {
    addLog(state, `${U.cardName(sourceCard)} gave other friendly ${traitName} units +${attackBonus}/+${hpBonus} at ${phaseText}. Affected units: ${affected}.`);
  }
}

function burnSpellFromHandThenBuffSelf(state, sourceSeat, sourceCard, ability) {
  const burned = CardOps.burnRandomCardFromHand(state, sourceSeat, (card) => {
    return card !== sourceCard && U.isSpell(card);
  });

  if (!burned) {
    addLog(state, `${U.cardName(sourceCard)} found no spell to burn.`);
    return;
  }

  const attackBonus = Number(ability.attack || 0);
  const hpBonus = Number(ability.hp || 0);

  U.buffCardStats(sourceCard, attackBonus, hpBonus);
  addLog(state, `${U.cardName(sourceCard)} burned ${U.cardName(burned)} and gained +${attackBonus}/+${hpBonus}.`);
}

function addCopiesToOwnersDeck(state, sourceSeat, sourceCard, ability, ctx = {}) {
  const cardId = String(ability.card_id || "");
  const amount = getAbilityAmount(ability, 0);
  const shouldShuffle = ability.shuffle !== undefined ? Boolean(ability.shuffle) : true;

  if (!cardId || amount <= 0) return;

  const context = getCtx(ctx);
  if (typeof context.makeCardFromId !== "function") {
    addLog(state, `makeCardFromId is missing for ${U.cardName(sourceCard)}.`);
    return;
  }

  const added = CardOps.addCopiesToDeck(
    state,
    sourceSeat,
    cardId,
    amount,
    context.makeCardFromId,
    null,
    shouldShuffle
  );

  addLog(state, `${U.cardName(sourceCard)} added ${added} ${cardId} card(s) to deck.`);
}

function resolveLoseStatsForOtherAllyUnits(state, sourceSeat, sourceCard, ability, ctx = {}) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner) return;

  let otherAllyCount = 0;

  for (const unit of U.ensureArray(owner.board)) {
    if (!unit || unit === sourceCard || !U.isUnit(unit)) continue;
    otherAllyCount++;
  }

  const attackLoss = Number(ability.attack_loss || 1) * otherAllyCount;
  const hpLoss = Number(ability.hp_loss || 1) * otherAllyCount;

  sourceCard.attack = Number(sourceCard.attack || 0) - attackLoss;
  sourceCard.max_hp = Number(sourceCard.max_hp || 0) - hpLoss;
  sourceCard.hp = Number(sourceCard.hp || 0) - hpLoss;

  addLog(state, `${U.cardName(sourceCard)} lost -${attackLoss}/-${hpLoss} for ${otherAllyCount} other ally unit(s).`);

  if (sourceCard.hp <= 0 || sourceCard.max_hp <= 0) {
    Combat.destroyUnit(state, sourceSeat, sourceCard, ctx);
  }
}

function resolveDestroyFriendlyUnitGainStats(state, sourceSeat, sourceCard, targetSeat, unitIndex, ability, ctx = {}) {
  if (targetSeat !== sourceSeat) {
    addLog(state, `${U.cardName(sourceCard)} can only destroy an ally unit.`);
    return;
  }

  const owner = U.getPlayer(state, targetSeat);
  if (!owner || unitIndex < 0 || unitIndex >= owner.board.length) {
    addLog(state, "Invalid ally unit target.");
    return;
  }

  const targetUnit = owner.board[unitIndex];
  if (!targetUnit || targetUnit === sourceCard) {
    addLog(state, `${U.cardName(sourceCard)} cannot destroy itself for this effect.`);
    return;
  }

  const gainedAttack = Number(targetUnit.attack || 0);
  const gainedHp = Number(targetUnit.max_hp || targetUnit.hp || 0);
  const targetName = U.cardName(targetUnit);

  Combat.destroyUnit(state, targetSeat, unitIndex, ctx);
  U.buffCardStats(sourceCard, gainedAttack, gainedHp);
  sourceCard.hp = sourceCard.max_hp;

  addLog(state, `${U.cardName(sourceCard)} destroyed ${targetName} and gained +${gainedAttack}/+${gainedHp}.`);
}

function resolveRemoveImmobileSetAttackForTrait(state, sourceSeat, sourceCard, ability) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner) return;

  const traitName = U.normalizeLowerString(ability.trait || "gadget");
  const attackValue = Number(ability.attack || 4);
  let affected = 0;

  for (const unit of U.ensureArray(owner.board)) {
    if (!unit || !U.isUnit(unit)) continue;
    if (!U.hasTrait(unit, traitName)) continue;

    U.removeKeyword(unit, C.KEYWORD_IMMOBILE);

    if (unit.temporary_keywords && typeof unit.temporary_keywords === "object") {
      delete unit.temporary_keywords[C.KEYWORD_IMMOBILE];
    }

    unit.attack = attackValue;
    affected++;
  }

  U.refreshAttackPermissionsForPlayer(owner);
  addLog(state, `${U.cardName(sourceCard)} removed Immobile from allied ${traitName} units and set their attack to ${attackValue}. Affected units: ${affected}.`);
}

function resolveDestroyEnemyUnitAndHealLeader(state, sourceSeat, sourceCard, ability, ctx = {}) {
  const enemySeat = U.otherSeat(sourceSeat);
  const enemy = U.getPlayer(state, enemySeat);

  if (!enemy || enemy.board.length <= 0) {
    addLog(state, `${U.cardName(sourceCard)} found no enemy unit to destroy.`);
    return;
  }

  let targetIndex = -1;
  let highestValue = -999999;

  for (let i = 0; i < enemy.board.length; i++) {
    const unit = enemy.board[i];
    if (!unit || !U.isUnit(unit)) continue;
    if (U.isUntrickableUnit(enemy, unit)) continue;

    const value = Number(unit.attack || 0) + Number(unit.hp || 0) + Number(unit.armor || 0);

    if (value > highestValue) {
      highestValue = value;
      targetIndex = i;
    }
  }

  if (targetIndex < 0) {
    addLog(state, `${U.cardName(sourceCard)} found no valid enemy unit to destroy.`);
    return;
  }

  const destroyedName = U.cardName(enemy.board[targetIndex]);
  Combat.destroyUnit(state, enemySeat, targetIndex, ctx);

  const healAmount = Number(ability.heal || 4);
  Combat.healPlayer(state, sourceSeat, healAmount);

  addLog(state, `${U.cardName(sourceCard)} destroyed ${destroyedName} and healed leader for ${healAmount}.`);
}

function resolveGainAttackFromAlliedTraitAttackTotal(state, sourceSeat, sourceCard, ability) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner) return;

  const traitName = U.normalizeLowerString(ability.trait || "music");
  let divisor = Number(ability.divisor || 2);
  const includeSelf = ability.include_self !== undefined ? Boolean(ability.include_self) : true;

  if (divisor <= 0) divisor = 2;

  let totalAttack = 0;

  for (const unit of U.ensureArray(owner.board)) {
    if (!unit) continue;
    if (unit === sourceCard && !includeSelf) continue;
    if (U.hasTrait(unit, traitName)) {
      totalAttack += Number(unit.attack || 0);
    }
  }

  const bonus = Math.floor(totalAttack / divisor);
  sourceCard.attack = Number(sourceCard.attack || 0) + bonus;

  addLog(state, `${U.cardName(sourceCard)} gained +${bonus} ATK from allied ${traitName} units.`);
  U.refreshAttackPermissionsForPlayer(owner);
}

function lookTopDeckKeepOrBottomTemporary(state, sourceSeat, sourceCard) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner) return;

  if (!owner.deck || owner.deck.length <= 0) {
    addLog(state, `${U.cardName(sourceCard)} looked at the deck, but it was empty.`);
    return;
  }

  const topCard = owner.deck[owner.deck.length - 1];
  addLog(state, `${U.cardName(sourceCard)} looked at the top card: ${U.cardName(topCard)}. It stayed on top.`);
}

function gainTemporaryKeywordFromAbility(state, sourceSeat, sourceCard, ability) {
  const keywordName = U.normalizeLowerString(ability.keyword || "");
  const expireAfterTurns = Number(ability.expire_after_turns || 1);

  if (!keywordName) return;

  const expireTurnNumber = Number(state.turn_number || 0) + expireAfterTurns;

  U.addTemporaryKeywordToUnit(sourceCard, keywordName, expireTurnNumber);

  const owner = U.getPlayer(state, sourceSeat);
  U.refreshAttackPermissionsForPlayer(owner);

  addLog(state, `${U.cardName(sourceCard)} gained temporary ${keywordName}.`);
}

function addCardToHandIfTraitPlayedCount(state, sourceSeat, sourceCard, ability, ctx = {}) {
  const traitName = U.normalizeLowerString(ability.trait || "");
  const requiredCount = Number(ability.required_count || 0);
  const cardId = String(ability.card_id || "");
  const amount = Number(ability.amount || 1);

  if (!traitName || !cardId) return;

  const owner = U.getPlayer(state, sourceSeat);
  const playedCount = CardOps.getPlayedTraitCount(owner, traitName);

  if (playedCount < requiredCount) {
    addLog(state, `${U.cardName(sourceCard)} checked ${traitName} cards played: ${playedCount}/${requiredCount}.`);
    return;
  }

  addCardToHandFromAbility(state, sourceSeat, sourceCard, {
    card_id: cardId,
    amount
  }, ctx);
}

function summonThreeKeywordCopiesFromAbility(state, sourceSeat, sourceCard, ability, ctx = {}) {
  const cardId = String(ability.card_id || "");
  const keywords = U.ensureArray(ability.keywords);

  if (!cardId) return;

  let summonedCount = 0;

  for (const keywordValue of keywords) {
    const keywordName = U.normalizeLowerString(keywordValue);
    const count = Combat.summonCard(state, sourceSeat, cardId, 1, ctx, (newCard) => {
      if (keywordName) U.addKeyword(newCard, keywordName);
    });

    summonedCount += count;
  }

  addLog(state, `${U.cardName(sourceCard)} summoned ${summonedCount} divided saint(s).`);
}

function destroyAllOtherUnitsAndFullHealLeader(state, sourceSeat, sourceCard, ctx = {}) {
  let destroyedCount = 0;

  for (const seat of [C.SEAT_A, C.SEAT_B]) {
    const player = U.getPlayer(state, seat);
    if (!player) continue;

    const snapshot = player.board.slice();

    for (const unit of snapshot) {
      if (!unit || unit === sourceCard) continue;

      if (Combat.destroyUnit(state, seat, unit, ctx)) {
        destroyedCount++;
      }
    }
  }

  const owner = U.getPlayer(state, sourceSeat);
  if (owner) {
    owner.hp = owner.max_hp;
  }

  addLog(state, `${U.cardName(sourceCard)} destroyed all other units. Destroyed units: ${destroyedCount}. Leader fully healed.`);
}

function removeKeywordThenBuffSelfFromAbility(state, sourceSeat, sourceCard, ability) {
  const once = Boolean(ability.once || false);
  const flagKey = "remove_keyword_then_buff_self";

  if (!sourceCard.once_per_turn_flags || typeof sourceCard.once_per_turn_flags !== "object") {
    sourceCard.once_per_turn_flags = {};
  }

  if (once && sourceCard.once_per_turn_flags[flagKey]) {
    return;
  }

  const keywordName = U.normalizeLowerString(ability.keyword || "");
  const attackBonus = Number(ability.attack || 0);
  const hpBonus = Number(ability.hp || 0);

  if (keywordName) {
    U.removeKeyword(sourceCard, keywordName);
    if (sourceCard.temporary_keywords && typeof sourceCard.temporary_keywords === "object") {
      delete sourceCard.temporary_keywords[keywordName];
    }
  }

  U.buffCardStats(sourceCard, attackBonus, hpBonus);

  const owner = U.getPlayer(state, sourceSeat);
  U.refreshAttackPermissionsForPlayer(owner);

  if (once) {
    sourceCard.once_per_turn_flags[flagKey] = true;
  }

  addLog(state, `${U.cardName(sourceCard)} awakened. It lost ${keywordName} and gained +${attackBonus}/+${hpBonus}.`);
}

function returnRandomHandTraitCardThenDamageAllEnemyUnits(state, sourceSeat, sourceCard, ability, ctx = {}) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner) return;

  const traitName = U.normalizeLowerString(ability.trait || "mage");
  const damageAmount = Number(ability.amount || 3);

  const index = U.findRandomIndex(owner.hand, (card) => {
    return card && U.hasTrait(card, traitName);
  });

  if (index < 0) {
    addLog(state, `${U.cardName(sourceCard)} found no ${traitName} card in hand.`);
    return;
  }

  const returnedCard = owner.hand.splice(index, 1)[0];
  owner.deck.push(returnedCard);
  CardOps.shuffleArray(owner.deck);

  const hitCount = Combat.dealDamageToAllEnemyUnitsForPlayer(state, sourceSeat, damageAmount, ctx);
  addLog(state, `${U.cardName(sourceCard)} returned ${U.cardName(returnedCard)} to deck and dealt ${damageAmount} damage to all enemy units. Hit units: ${hitCount}.`);
}

function removeKeywordsFromPlayedUnit(state, playedSeat, sourceCard, ability, playedCard) {
  const keywordsToRemove = U.ensureArray(ability.keywords);
  const removed = [];

  for (const keyword of keywordsToRemove) {
    const key = U.normalizeLowerString(keyword);
    if (U.hasKeyword(playedCard, key)) {
      U.removeKeyword(playedCard, key);
      removed.push(key);
    }
  }

  if (removed.length <= 0) return;

  addLog(state, `${U.cardName(sourceCard)} removed ${removed.join(", ")} from ${U.cardName(playedCard)}.`);

  const owner = U.getPlayer(state, playedSeat);
  U.refreshAttackPermissionsForPlayer(owner);
}

function drawRandomTraitUnitFromDeckOnUnitPlayed(state, sourceSeat, sourceCard, ability, playedSeat, playedCard) {
  const onlyFriendly = ability.only_friendly !== undefined ? Boolean(ability.only_friendly) : true;
  if (onlyFriendly && sourceSeat !== playedSeat) return;

  const includeSelf = Boolean(ability.include_self || false);
  if (!includeSelf && playedCard === sourceCard) return;

  if (!sourceCard.once_per_turn_flags || typeof sourceCard.once_per_turn_flags !== "object") {
    sourceCard.once_per_turn_flags = {};
  }

  const traitName = U.normalizeLowerString(ability.trait || "");
  const amount = Number(ability.amount || 1);
  const oncePerTurn = Boolean(ability.once_per_turn || false);
  const flagKey = `on_unit_played_${String(ability.effect || "")}_${traitName}`;

  if (oncePerTurn && sourceCard.once_per_turn_flags[flagKey]) return;
  if (!traitName || amount <= 0) return;

  const drawn = CardOps.drawRandomTraitCardFromDeck(state, sourceSeat, traitName, amount, 0, true);

  if (drawn.length <= 0) {
    addLog(state, `${U.cardName(sourceCard)} found no ${traitName} unit in deck.`);
    return;
  }

  if (oncePerTurn) {
    sourceCard.once_per_turn_flags[flagKey] = true;
  }

  addLog(state, `${U.cardName(sourceCard)} drew ${drawn.length} random ${traitName} unit card(s) from deck.`);
}

function damageRandomEnemyUnitOrFaceOnSpellPlayed(state, sourceSeat, sourceCard, ability, ctx = {}) {
  const enemySeat = U.otherSeat(sourceSeat);
  const enemy = U.getPlayer(state, enemySeat);
  if (!enemy) return;

  const amount = Number(ability.amount || 0);
  if (amount <= 0) return;

  const candidates = [];

  for (let i = 0; i < enemy.board.length; i++) {
    const unit = enemy.board[i];
    if (!unit || !U.isUnit(unit)) continue;
    candidates.push(i);
  }

  if (candidates.length <= 0) {
    Combat.damagePlayer(state, enemySeat, amount);
    addLog(state, `${U.cardName(sourceCard)} dealt ${amount} damage to enemy leader.`);
    return;
  }

  const selectedIndex = candidates[U.randomInt(candidates.length)];
  const targetUnit = enemy.board[selectedIndex];

  Combat.damageUnit(state, enemySeat, selectedIndex, amount, ctx);
  addLog(state, `${U.cardName(sourceCard)} dealt ${amount} damage to random enemy unit ${U.cardName(targetUnit)}.`);
}

function modifyHandCostByTraitFromAbility(state, ownerSeat, sourceCard, ability) {
  const owner = U.getPlayer(state, ownerSeat);
  if (!owner) return;

  const traitName = U.normalizeLowerString(ability.trait || "");
  const amount = Number(ability.amount || 0);
  const cardTypeFilter = String(ability.card_type || "");

  if (!traitName || amount === 0) return;

  let affected = 0;

  for (const handCard of U.ensureArray(owner.hand)) {
    if (!handCard) continue;
    if (!U.hasTrait(handCard, traitName)) continue;
    if (cardTypeFilter && String(handCard.card_type || "") !== cardTypeFilter) continue;

    handCard.cost = Math.max(0, Number(handCard.cost || 0) + amount);
    affected++;
  }

  addLog(state, `${U.cardName(sourceCard)} changed the cost of ${affected} ${traitName} card(s) in hand by ${amount}.`);
}

function summonCardsFromAbility(state, ownerSeat, sourceCard, ability, ctx = {}) {
  const cardId = String(ability.card_id || "");
  const amount = Number(ability.amount || 1);

  if (!cardId || amount <= 0) return;

  const summonedCount = Combat.summonCard(state, ownerSeat, cardId, amount, ctx);
  addLog(state, `${U.cardName(sourceCard)} summoned ${summonedCount} ${cardId}.`);
}

function drawCardThatCostsMoreThanSource(state, ownerSeat, sourceCard, ability) {
  const owner = U.getPlayer(state, ownerSeat);
  if (!owner) return;

  const costMore = Number(ability.amount || 3);
  const targetCost = Number(sourceCard.cost || 0) + costMore;

  const index = U.findRandomIndex(owner.deck, (card) => card && Number(card.cost || 0) === targetCost);

  if (index < 0) {
    addLog(state, `${U.cardName(sourceCard)} found no card that costs ${targetCost}.`);
    return;
  }

  const drawnCard = owner.deck.splice(index, 1)[0];

  if (owner.hand.length >= C.MAX_HAND_SIZE) {
    owner.graveyard.push(drawnCard);
    addLog(state, `${U.cardName(sourceCard)} found ${U.cardName(drawnCard)}, but hand was full so it went to graveyard.`);
    return;
  }

  owner.hand.push(drawnCard);
  addLog(state, `${U.cardName(sourceCard)} drew ${U.cardName(drawnCard)} that costs ${targetCost}.`);
}

function addCardToHandFromAbility(state, ownerSeat, sourceCard, ability, ctx = {}) {
  const cardId = String(ability.card_id || "");
  const amount = Number(ability.amount || 1);
  const context = getCtx(ctx);

  if (!cardId || amount <= 0) return;
  if (typeof context.makeCardFromId !== "function") {
    addLog(state, `makeCardFromId is missing for ${U.cardName(sourceCard)}.`);
    return;
  }

  let added = 0;

  for (let i = 0; i < amount; i++) {
    const card = CardOps.addCardToHand(state, ownerSeat, cardId, context.makeCardFromId);
    if (card) added++;
  }

  addLog(state, `${U.cardName(sourceCard)} added ${added} ${cardId} card(s) to hand.`);
}

function debuffAttackerFromWhenAttacked(state, defenderSeat, defender, attackerSeat, attacker, ability, ctx = {}) {
  const attackDelta = Number(ability.attack || 0);
  const hpDelta = Number(ability.hp || 0);

  if (attackDelta === 0 && hpDelta === 0) return;

  U.buffCardStats(attacker, attackDelta, hpDelta);

  const attackerOwner = U.getPlayer(state, attackerSeat);

  if (attacker.hp <= 0) {
    Combat.destroyUnit(state, attackerSeat, attacker, ctx);
    return;
  }

  addLog(state, `${U.cardName(defender)} weakened the attacker. ${U.cardName(attacker)} gained ${attackDelta}/${hpDelta}.`);
  U.refreshAttackPermissionsForPlayer(attackerOwner);
}

function destroyLowestHealthEnemyUnitAtTurnStart(state, sourceSeat, sourceCard, ability, ctx = {}) {
  const enemySeat = U.otherSeat(sourceSeat);
  const enemy = U.getPlayer(state, enemySeat);
  if (!enemy) return;

  let lowestIndex = -1;
  let lowestHp = 999999;

  for (let i = 0; i < enemy.board.length; i++) {
    const unit = enemy.board[i];
    if (!unit || !U.isUnit(unit)) continue;

    const hp = Number(unit.hp || 0);
    if (hp < lowestHp) {
      lowestHp = hp;
      lowestIndex = i;
    }
  }

  if (lowestIndex < 0) {
    addLog(state, `${U.cardName(sourceCard)} found no enemy unit to destroy.`);
    return;
  }

  const targetName = U.cardName(enemy.board[lowestIndex]);
  Combat.destroyUnit(state, enemySeat, lowestIndex, ctx);
  addLog(state, `${U.cardName(sourceCard)} destroyed the enemy unit with the lowest health: ${targetName}.`);
}

function resolveAllyGadgetDamagedFromAbility(state, sourceSeat, sourceCard, damagedUnit, ability) {
  const damagedOwner = U.getPlayer(state, sourceSeat);
  if (!damagedOwner) return;

  const traitName = U.normalizeLowerString(ability.trait || "gadget");
  if (traitName && !U.hasTrait(damagedUnit, traitName)) return;

  const healAmount = Number(ability.heal || 3);
  const damageAmount = Number(ability.damage || 2);

  const damagedIndex = damagedOwner.board.indexOf(damagedUnit);
  if (damagedIndex < 0) return;

  if (healAmount > 0) {
    Combat.healUnit(state, sourceSeat, damagedIndex, healAmount);
  }

  if (damageAmount > 0) {
    Combat.damagePlayer(state, U.otherSeat(sourceSeat), damageAmount);
  }

  addLog(state, `${U.cardName(sourceCard)} healed ${U.cardName(damagedUnit)} for ${healAmount} and dealt ${damageAmount} damage to the enemy leader.`);
}

function resolveHumbleLibrarianBattlecry(state, sourceSeat, sourceCard) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner) return;

  const burnCount = owner.hand.length;

  if (burnCount <= 0) {
    addLog(state, `${U.cardName(sourceCard)} found no cards to burn.`);
    return;
  }

  CardOps.burnAllCardsInHand(owner);
  CardOps.drawCards(state, sourceSeat, burnCount);

  addLog(state, `${U.cardName(sourceCard)} burned ${burnCount} card(s) and drew ${burnCount} card(s).`);
}

function resolveScribeOfHistoryBattlecry(state, sourceSeat, sourceCard) {
  const enemy = U.getPlayer(state, U.otherSeat(sourceSeat));
  if (!enemy) return;

  const bonus = enemy.board.length;
  if (bonus <= 0) return;

  U.buffCardStats(sourceCard, bonus, bonus);
  addLog(state, `${U.cardName(sourceCard)} gained +${bonus}/+${bonus} for enemy units.`);
}

function resolveBlindResearcherBattlecry(state, sourceSeat, sourceCard) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner) return;

  for (let i = owner.deck.length - 1; i >= 0; i--) {
    const deckCard = owner.deck[i];
    if (!deckCard) continue;
    if (!U.hasTrait(deckCard, "scholar")) continue;

    owner.deck.splice(i, 1);

    if (owner.hand.length < C.MAX_HAND_SIZE) {
      owner.hand.push(deckCard);
      addLog(state, `${U.cardName(sourceCard)} drew ${U.cardName(deckCard)}.`);
    } else {
      owner.graveyard.push(deckCard);
      addLog(state, `${U.cardName(sourceCard)} burned ${U.cardName(deckCard)} because hand is full.`);
    }

    return;
  }

  addLog(state, `${U.cardName(sourceCard)} found no Scholar card in deck.`);
}

function resolveAllKnowingArchivistBattlecry(state, sourceSeat, sourceCard) {
  const enemySeat = U.otherSeat(sourceSeat);
  const owner = U.getPlayer(state, sourceSeat);
  const damageAmount = CardOps.getCardPlayCost(owner, sourceCard);

  Combat.damagePlayer(state, enemySeat, damageAmount);
  addLog(state, `${U.cardName(sourceCard)} dealt ${damageAmount} damage to enemy leader.`);
}

module.exports = {
  getAbilitiesByTrigger,

  resolvePendingAbilityTarget,

  resolveBattlecry,
  resolveBattlecryAbility,

  resolveTurnStart,
  resolveTurnStartTriggers,
  resolveTurnStartAbility,

  resolveTurnEnd,
  resolveTurnEndTriggers,
  resolveTurnEndAbility,

  resolveOnUnitPlayed,
  resolveOnUnitPlayedTriggers: resolveOnUnitPlayed,
  resolveOnUnitPlayedAbility,

  resolveOnSpellPlayed,
  resolveOnSpellPlayedTriggers: resolveOnSpellPlayed,
  resolveOnSpellPlayedAbility,

  resolveWhenKillsAbilities,
  resolveWhenKillsAbility,

  resolveWhenDestroyedAbilities,
  resolveWhenDestroyedAbility,

  resolveOnDestroyTargetAbilities,
  resolveOnDestroyTargetAbility,

  resolveWhenAttackedAbilities,
  resolveWhenAttackedAbility,

  resolveOnAllyUnitAttackTriggers,
  resolveOnAllyUnitAttackAbility,

  resolveOnAllyUnitDamagedTriggers,
  resolveOnAllyUnitDamagedAbility,

  resolveCardTrigger,
  resolveGlobalTrigger,
  resolveGenericAbility,

  clearExpiredTemporaryKeywords
};

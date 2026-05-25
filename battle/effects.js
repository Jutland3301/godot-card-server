"use strict";

const C = require("./constants");
const U = require("./utils");
const S = require("./state");
const CardOps = require("./card_ops");
const Combat = require("./combat");
const Targets = require("./targets");

function lazyTriggers() {
  try {
    return require("./triggers");
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

function getAmount(card, ability = {}, fallback = 0) {
  if (ability && ability.amount !== undefined) {
    return Number(ability.amount || 0);
  }

  if (card && card.power !== undefined) {
    return Number(card.power || 0);
  }

  return Number(fallback || 0);
}

function getEffectiveSpellDamage(card, caster, baseDamage) {
  return U.getEffectiveSpellDamage(card, caster, baseDamage);
}

function getTargetUnit(state, target) {
  return Targets.getUnitByTarget(state, target);
}

function getTargetPlayer(state, target) {
  return Targets.getPlayerByTarget(state, target);
}

function beginHandSelection(state, sourceSeat, effectId, sourceCard, candidateIndexes, message) {
  state.selecting_hand_card = true;
  state.selecting_target = false;
  state.pending_action_type = C.ACTION_HAND_SELECTION;
  state.pending_hand_selection_effect = String(effectId || "");
  state.pending_hand_selection_owner = U.seatToOwnerId(sourceSeat);
  state.pending_card_owner = U.seatToOwnerId(sourceSeat);
  state.pending_card = U.copyCardData(sourceCard);
  state.pending_hand_candidate_indexes = Array.isArray(candidateIndexes)
    ? candidateIndexes.map(index => Number(index)).filter(index => Number.isFinite(index))
    : [];
  state.pending_ability = {};
  state.pending_attacker_index = -1;
  state.selected_attacker_owner = "";
  state.selected_attacker_index = -1;
  state.status_message = String(message || "Choose a card in your hand.");

  addLog(state, state.status_message);
  S.syncLegacy(state);

  return { pending: true, state };
}

function clearHandSelection(state) {
  state.selecting_hand_card = false;
  state.pending_hand_selection_effect = "";
  state.pending_hand_selection_owner = "";
  state.pending_hand_candidate_indexes = [];
  state.pending_action_type = C.ACTION_NONE;
  state.pending_card = null;
  state.pending_card_owner = "";
  state.pending_ability = {};
}

function getCandidateIndexesByPredicate(player, predicate) {
  const indexes = [];

  if (!player || !Array.isArray(player.hand)) {
    return indexes;
  }

  for (let i = 0; i < player.hand.length; i++) {
    const card = player.hand[i];
    if (!card) continue;

    if (typeof predicate !== "function" || predicate(card, i)) {
      indexes.push(i);
    }
  }

  return indexes;
}

function finishPendingSpellAfterHandSelection(state, sourceSeat, sourceCard, ctx = {}) {
  const player = U.getPlayer(state, sourceSeat);
  if (!player || !sourceCard) return;

  const Triggers = lazyTriggers();
  if (Triggers && typeof Triggers.resolveOnSpellPlayed === "function") {
    Triggers.resolveOnSpellPlayed(state, sourceSeat, sourceCard, ctx);
  }

  CardOps.moveCardToGraveyard(player, sourceCard);
  clearHandSelection(state);
  Combat.processDeathQueue(state, ctx);
  S.syncLegacy(state);
}

function resolveHandSelection(state, sourceSeat, handIndex, ctx = {}) {
  S.normalizeState(state);

  const pendingSeat = U.normalizeOwnerToSeat(state, state.pending_hand_selection_owner || state.pending_card_owner);
  if (!pendingSeat || pendingSeat !== sourceSeat) {
    return { ok: false, state, message: "This hand selection belongs to another player." };
  }

  const player = U.getPlayer(state, sourceSeat);
  if (!player) {
    clearHandSelection(state);
    return { ok: false, state, message: "Player is missing." };
  }

  const index = Number(handIndex);
  if (index < 0 || index >= player.hand.length) {
    return { ok: false, state, message: "Invalid hand selection index." };
  }

  const candidates = Array.isArray(state.pending_hand_candidate_indexes)
    ? state.pending_hand_candidate_indexes.map(Number)
    : [];

  if (candidates.length > 0 && !candidates.includes(index)) {
    return { ok: false, state, message: "Selected card is not a valid candidate." };
  }

  const sourceCard = state.pending_card || null;
  const selectedCard = player.hand[index] || null;
  const effect = String(state.pending_hand_selection_effect || "");

  if (!sourceCard || !selectedCard) {
    clearHandSelection(state);
    return { ok: false, state, message: "Pending hand selection card is missing." };
  }

  switch (effect) {
    case C.EFFECT_INCANTATION_OF_MINSTREL:
      resolveIncantationOfMinstrelSelectedCard(state, sourceSeat, sourceCard, selectedCard);
      break;

    case C.EFFECT_LIGHTNING_CEREMONY:
      resolveLightningCeremonySelectedCard(state, sourceSeat, sourceCard, selectedCard);
      break;

    case C.EFFECT_SCAVENGE_COMMAND:
      resolveScavengeCommandSelectedCard(state, sourceSeat, sourceCard, selectedCard);
      break;

    case C.EFFECT_DUEL_ON_SEA:
      resolveDuelOnSeaSelectedCard(state, sourceSeat, sourceCard, selectedCard, ctx);
      break;

    case C.EFFECT_TARNISHED_BOOKSHELF:
      resolveTarnishedBookshelfSelectedCard(state, sourceSeat, sourceCard, selectedCard, ctx);
      break;

    default:
      addLog(state, `Unsupported hand selection effect: ${effect}.`);
      break;
  }

  finishPendingSpellAfterHandSelection(state, sourceSeat, sourceCard, ctx);

  return { ok: true, state };
}

function applyEffectToTarget(state, sourceSeat, sourceCard, target, ability = {}, ctx = {}) {
  const effectId = String(sourceCard?.effect_id || ability.effect || "");
  const caster = U.getPlayer(state, sourceSeat);

  if (!sourceCard || !caster) {
    return { ok: false, pending: false, message: "Source card or caster is missing." };
  }

  switch (effectId) {
    case C.EFFECT_DAMAGE: {
      const baseDamage = getAmount(sourceCard, ability, 0);
      const damage = getEffectiveSpellDamage(sourceCard, caster, baseDamage);

      if (!target) {
        return { ok: false, pending: false, message: "Damage target is missing." };
      }

      if (target.type === "player") {
        Combat.damagePlayer(state, target.owner_seat, damage);
        addLog(state, `${U.cardName(sourceCard)} dealt ${damage} damage to leader.`);
        return { ok: true, pending: false };
      }

      if (target.type === "unit") {
        Combat.damageUnit(state, target.owner_seat, Number(target.board_index), damage, ctx);
        addLog(state, `${U.cardName(sourceCard)} dealt ${damage} damage to a unit.`);
        return { ok: true, pending: false };
      }

      return { ok: false, pending: false, message: "Invalid damage target." };
    }

    case C.EFFECT_HEAL: {
      const amount = getAmount(sourceCard, ability, 0);

      if (!target) {
        return { ok: false, pending: false, message: "Heal target is missing." };
      }

      if (target.type === "player") {
        const healed = Combat.healPlayer(state, target.owner_seat, amount);
        addLog(state, `${U.cardName(sourceCard)} healed leader for ${healed}.`);
        return { ok: true, pending: false };
      }

      if (target.type === "unit") {
        const healed = Combat.healUnit(state, target.owner_seat, Number(target.board_index), amount);
        addLog(state, `${U.cardName(sourceCard)} healed a unit for ${healed}.`);
        return { ok: true, pending: false };
      }

      return { ok: false, pending: false, message: "Invalid heal target." };
    }

    case C.EFFECT_DESTROY_UNIT: {
      if (!target || target.type !== "unit") {
        return { ok: false, pending: false, message: "Destroy target is missing." };
      }

      const targetOwner = U.getPlayer(state, target.owner_seat);
      const targetUnit = targetOwner?.board?.[Number(target.board_index)] || null;
      const targetWasFriendly = target.owner_seat === sourceSeat;
      const targetName = U.cardName(targetUnit);

      Combat.destroyUnit(state, target.owner_seat, Number(target.board_index), ctx);

      const Triggers = lazyTriggers();
      if (Triggers && typeof Triggers.resolveOnDestroyTargetAbilities === "function") {
        Triggers.resolveOnDestroyTargetAbilities(state, sourceSeat, sourceCard, targetWasFriendly, ctx);
      }

      addLog(state, `${U.cardName(sourceCard)} destroyed ${targetName}.`);
      return { ok: true, pending: false };
    }

    case C.EFFECT_ADD_KEYWORD: {
      if (!target || target.type !== "unit") {
        return { ok: false, pending: false, message: "Keyword target is missing." };
      }

      const targetOwner = U.getPlayer(state, target.owner_seat);
      const targetUnit = targetOwner?.board?.[Number(target.board_index)] || null;

      if (!targetUnit) {
        return { ok: false, pending: false, message: "Keyword target unit is missing." };
      }

      resolveAddKeywordSpellOnFriendlyUnit(state, sourceSeat, sourceCard, targetUnit);
      return { ok: true, pending: false };
    }

    case C.EFFECT_ADD_KEYWORDS_TO_UNIT: {
      if (!target || target.type !== "unit") {
        return { ok: false, pending: false, message: "Keyword target is missing." };
      }

      const targetOwner = U.getPlayer(state, target.owner_seat);
      const targetUnit = targetOwner?.board?.[Number(target.board_index)] || null;

      resolveAddKeywordsToUnitSpell(state, sourceSeat, sourceCard, targetUnit);
      return { ok: true, pending: false };
    }

    case C.EFFECT_DAMAGE_BY_BOARD_TRAIT_COUNT: {
      if (!target || target.type !== "unit") {
        return { ok: false, pending: false, message: "Trait damage target is missing." };
      }

      const damageAmount = CardOps.countDifferentTraitsOnBoard(state);
      Combat.damageUnit(state, target.owner_seat, Number(target.board_index), damageAmount, ctx);
      addLog(state, `${U.cardName(sourceCard)} dealt ${damageAmount} damage. X = different traits on board.`);
      return { ok: true, pending: false };
    }

    case C.EFFECT_DESTROY_FRIENDLY_TRAIT_UNIT_COPY_TO_HAND_BUFF: {
      if (!target || target.type !== "unit") {
        return { ok: false, pending: false, message: "Invalid Short Circuit target." };
      }

      resolveDestroyFriendlyTraitUnitCopyToHandBuff(state, sourceSeat, sourceCard, target.owner_seat, Number(target.board_index), ctx);
      return { ok: true, pending: false };
    }

    case C.EFFECT_RUNIC_TUNING: {
      if (!target || target.type !== "unit") {
        return { ok: false, pending: false, message: "Invalid Runic Tuning target." };
      }

      const owner = U.getPlayer(state, target.owner_seat);
      const unit = owner?.board?.[Number(target.board_index)] || null;
      resolveRunicTuning(state, sourceSeat, sourceCard, unit);
      return { ok: true, pending: false };
    }

    case C.EFFECT_LAMENTATION_OF_LIFE: {
      if (!target || target.type !== "unit") {
        return { ok: false, pending: false, message: "Invalid Lamentation target." };
      }

      resolveLamentationOfLife(state, sourceSeat, sourceCard, target.owner_seat, Number(target.board_index), ctx);
      return { ok: true, pending: false };
    }

    case C.EFFECT_POETRY_OF_RESILIENCE: {
      if (!target || target.type !== "unit") {
        return { ok: false, pending: false, message: "Invalid Poetry target." };
      }

      const owner = U.getPlayer(state, target.owner_seat);
      const unit = owner?.board?.[Number(target.board_index)] || null;
      resolvePoetryOfResilience(state, sourceSeat, sourceCard, unit);
      return { ok: true, pending: false };
    }

    case C.EFFECT_NOBLES_OBLIGE: {
      if (!target || target.type !== "unit") {
        return { ok: false, pending: false, message: "Invalid Nobles Oblige target." };
      }

      const owner = U.getPlayer(state, target.owner_seat);
      const unit = owner?.board?.[Number(target.board_index)] || null;
      resolveNoblesOblige(state, sourceSeat, sourceCard, unit);
      return { ok: true, pending: false };
    }

    case C.EFFECT_FORBIDDEN_BOOK: {
      if (!target || target.type !== "unit") {
        return { ok: false, pending: false, message: "Invalid Forbidden Book target." };
      }

      resolveForbiddenBook(state, sourceSeat, sourceCard, target.owner_seat, Number(target.board_index), ctx);
      return { ok: true, pending: false };
    }

    case C.EFFECT_TRANSCRIBE_OF_THE_WICKED: {
      if (!target || target.type !== "unit") {
        return { ok: false, pending: false, message: "Invalid Transcribe target." };
      }

      resolveTranscribeOfTheWicked(state, sourceSeat, sourceCard, target.owner_seat, Number(target.board_index), ctx);
      return { ok: true, pending: false };
    }

    default:
      return { ok: false, pending: false, message: `Unsupported targeted effect: ${effectId}.` };
  }
}

function resolveSpellOrCardEffect(state, sourceSeat, sourceCard, target = null, ability = {}, ctx = {}) {
  S.normalizeState(state);

  const player = U.getPlayer(state, sourceSeat);
  if (!player || !sourceCard) {
    return { ok: false, pending: false, message: "Source player or card is missing." };
  }

  const effectId = String(sourceCard.effect_id || C.EFFECT_NONE);

  if (target) {
    const targetedResult = applyEffectToTarget(state, sourceSeat, sourceCard, target, ability, ctx);
    Combat.processDeathQueue(state, ctx);
    S.syncLegacy(state);
    return targetedResult;
  }

  switch (effectId) {
    case C.EFFECT_NONE:
    case C.EFFECT_UNIT:
      return { ok: true, pending: false };

    case C.EFFECT_DRAW: {
      const amount = getAmount(sourceCard, ability, 0);
      CardOps.drawCards(state, sourceSeat, amount);
      addLog(state, `${U.cardName(sourceCard)} drew ${amount} card(s).`);
      return { ok: true, pending: false };
    }

    case C.EFFECT_BUFF_DECK_TRAIT:
      resolveAbsoluteLoyalty(state, sourceSeat, sourceCard);
      return { ok: true, pending: false };

    case C.EFFECT_HEAL_ALL_ALLIES_GAIN_MAX_HP:
      resolveHealAllAlliesGainMaxHp(state, sourceSeat, sourceCard);
      return { ok: true, pending: false };

    case C.EFFECT_REDUCE_ENEMY_MAX_HP_THEN_ADD_COPIES:
      resolveProphetsOfRuin(state, sourceSeat, sourceCard, ctx);
      return { ok: true, pending: false };

    case C.EFFECT_ADD_ZERO_COST_COPIES_OF_LAST_SPELL:
      resolveAddZeroCostCopiesOfLastSpell(state, sourceSeat, sourceCard);
      return { ok: true, pending: false };

    case C.EFFECT_DRAW_RANDOM_TRAIT_FROM_DECK_INCREASE_COST:
      resolveDrawRandomTraitFromDeckIncreaseCost(state, sourceSeat, sourceCard);
      return { ok: true, pending: false };

    case C.EFFECT_HAP_HAZARD:
      resolveHapHazard(state, sourceSeat, sourceCard, ctx);
      return { ok: true, pending: false };

    case C.EFFECT_RESURRECT_TRAIT_UNITS_FROM_GRAVEYARD:
      resolveResurrectTraitUnitsFromGraveyard(state, sourceSeat, sourceCard);
      return { ok: true, pending: false };

    case C.EFFECT_TEMPORARY_IMMOBILE_ALL_ENEMY_UNITS:
      resolveTemporaryImmobileAllEnemyUnits(state, sourceSeat, sourceCard);
      return { ok: true, pending: false };

    case C.EFFECT_RETURN_RANDOM_HAND_UNIT_DRAW_ANOTHER_TRAIT_UNIT:
      resolveReturnRandomHandUnitDrawAnotherTraitUnit(state, sourceSeat, sourceCard);
      return { ok: true, pending: false };

    case C.EFFECT_MASTERWORK_OF_ART:
      resolveMasterworkOfArt(state, sourceSeat, sourceCard, ctx);
      return { ok: true, pending: false };

    case C.EFFECT_INCANTATION_OF_MINSTREL:
      return resolveIncantationOfMinstrel(state, sourceSeat, sourceCard);

    case C.EFFECT_RIME_OF_THE_ANCIENT_MARINER:
      resolveRimeOfTheAncientMariner(state, sourceSeat, sourceCard, ctx);
      return { ok: true, pending: false };

    case C.EFFECT_ENCOMPASSED_COMPASS:
      resolveEncompassedCompass(state, sourceSeat, sourceCard);
      return { ok: true, pending: false };

    case C.EFFECT_LIGHTNING_CEREMONY:
      return resolveLightningCeremony(state, sourceSeat, sourceCard);

    case C.EFFECT_SCAVENGE_COMMAND:
      return resolveScavengeCommand(state, sourceSeat, sourceCard);

    case C.EFFECT_DUEL_ON_SEA:
      return resolveDuelOnSea(state, sourceSeat, sourceCard);

    case C.EFFECT_STORM_AND_TIDES:
      resolveStormAndTides(state, sourceSeat, sourceCard, ctx);
      return { ok: true, pending: false };

    case C.EFFECT_CALL_OF_OMEN:
      resolveCallOfOmen(state, sourceSeat, sourceCard, ctx);
      return { ok: true, pending: false };

    case C.EFFECT_BUFF_ALL_ALLY_UNITS:
      resolveBuffAllAllyUnits(state, sourceSeat, sourceCard);
      return { ok: true, pending: false };

    case C.EFFECT_CONVIVIAL_HUMMING:
      resolveConvivialHumming(state, sourceSeat, sourceCard, ctx);
      return { ok: true, pending: false };

    case C.EFFECT_ECONOMICS_OVERFLOW:
      resolveEconomicsOverflow(state, sourceSeat, sourceCard);
      return { ok: true, pending: false };

    case C.EFFECT_MONOCHRO_BLUEPRINT:
      resolveMonochroBlueprint(state, sourceSeat, sourceCard, ctx);
      return { ok: true, pending: false };

    case C.EFFECT_BOOK_OF_RUSHWATER:
      resolveBookOfRushwater(state, sourceSeat, sourceCard, ctx);
      return { ok: true, pending: false };

    case C.EFFECT_INTRODUCTION_TO_ARMORY:
      resolveIntroductionToArmory(state, sourceSeat, sourceCard);
      return { ok: true, pending: false };

    default:
      addLog(state, `Unsupported spell effect: ${effectId}.`);
      return { ok: false, pending: false, message: `Unsupported spell effect: ${effectId}.` };
  }
}

/* ============================================================================
 * Normal spell helpers
 * ========================================================================== */

function resolveAbsoluteLoyalty(state, sourceSeat, sourceCard) {
  const player = U.getPlayer(state, sourceSeat);
  if (!player) return;

  const ability = U.getAbilities(sourceCard)[0] || {};
  const traitName = U.normalizeLowerString(ability.trait || "soldier");
  const attackPerUnit = Number(ability.attack || 1);
  const hpPerUnit = Number(ability.hp || 1);

  const traitCount = CardOps.countTraitOnBoard(player, traitName);
  const attackBonus = traitCount * attackPerUnit;
  const hpBonus = traitCount * hpPerUnit;
  const affected = CardOps.buffUnitsInDeckWithTrait(player, traitName, attackBonus, hpBonus);

  addLog(state, `${U.cardName(sourceCard)}: X=${traitCount}. ${affected} ${traitName} units in deck gained +${attackBonus}/+${hpBonus}.`);
}

function resolveHealAllAlliesGainMaxHp(state, sourceSeat, sourceCard) {
  const player = U.getPlayer(state, sourceSeat);
  if (!player) return;

  let healedCount = 0;

  for (const unit of U.ensureArray(player.board)) {
    if (!unit || !U.isUnit(unit)) continue;

    if (Number(unit.hp || 0) < Number(unit.max_hp || 0)) {
      unit.hp = unit.max_hp;
      healedCount++;
    }
  }

  const maxHpGain = healedCount * Number(sourceCard.power || 0);
  player.max_hp = Number(player.max_hp || C.STARTING_HP) + maxHpGain;
  player.hp = Math.min(Number(player.hp || 0), player.max_hp);

  addLog(state, `${U.cardName(sourceCard)} healed ${healedCount} ally unit(s). Leader gained +${maxHpGain} max HP.`);
}

function resolveProphetsOfRuin(state, sourceSeat, sourceCard, ctx = {}) {
  const enemySeat = U.otherSeat(sourceSeat);
  const enemy = U.getPlayer(state, enemySeat);

  if (!enemy) return;

  let reduceAmount = Number(sourceCard.power || 0);
  if (reduceAmount <= 0) reduceAmount = 2;

  enemy.max_hp = Math.max(Number(enemy.max_hp || C.STARTING_HP) - reduceAmount, 1);
  enemy.hp = Math.min(Number(enemy.hp || enemy.max_hp), enemy.max_hp);

  const context = getCtx(ctx);
  if (typeof context.makeCardFromId === "function") {
    CardOps.addCopiesToDeck(state, sourceSeat, "prophets_of_ruin", 2, context.makeCardFromId, null, true);
  }

  addLog(state, `${U.cardName(sourceCard)} reduced enemy max HP by ${reduceAmount} and added 2 copies to deck.`);
}

function resolveAddZeroCostCopiesOfLastSpell(state, sourceSeat, sourceCard) {
  const player = U.getPlayer(state, sourceSeat);
  if (!player) return;

  const lastSpell = CardOps.getLastSpell(player);

  if (!lastSpell) {
    addLog(state, `${U.cardName(sourceCard)} found no previous spell.`);
    return;
  }

  let amount = Number(sourceCard.power || 0);
  if (amount <= 0) amount = 2;

  const added = CardOps.addCopiesToHand(state, sourceSeat, lastSpell, amount, (copy) => {
    copy.cost = 0;
    copy.description = String(copy.description || "") + " Generated by The Arcana Tales.";
  });

  addLog(state, `${U.cardName(sourceCard)} added ${added} 0-cost copies of ${U.cardName(lastSpell)} to hand.`);
}

function resolveDrawRandomTraitFromDeckIncreaseCost(state, sourceSeat, sourceCard) {
  const ability = U.getAbilities(sourceCard)[0] || {};
  const traitName = U.normalizeLowerString(ability.trait || "mage");
  const amount = Number(ability.amount || sourceCard.power || 1);
  const costIncrease = Number(ability.cost_increase || 0);

  const drawn = CardOps.drawRandomTraitCardFromDeck(state, sourceSeat, traitName, amount, costIncrease, false);
  addLog(state, `${U.cardName(sourceCard)} drew ${drawn.length} random ${traitName} card(s).`);
}

function resolveHapHazard(state, sourceSeat, sourceCard, ctx = {}) {
  const owner = U.getPlayer(state, sourceSeat);
  const enemy = U.getPlayer(state, U.otherSeat(sourceSeat));
  if (!owner || !enemy) return;

  addLog(state, `${U.cardName(sourceCard)} was cast.`);

  const allyCandidates = U.ensureArray(owner.board).filter(unit => unit && U.isUnit(unit));
  const enemyCandidates = U.ensureArray(enemy.board).filter(unit => unit && U.isUnit(unit) && !U.isUntrickableUnit(enemy, unit));

  const allyTarget = U.randomItem(allyCandidates);
  if (allyTarget) {
    U.buffCardStats(allyTarget, 2, 2);
    addLog(state, `${U.cardName(allyTarget)} gained +2/+2.`);
  } else {
    addLog(state, "No ally unit was available.");
  }

  const enemyTarget = U.randomItem(enemyCandidates);
  if (enemyTarget) {
    Combat.modifyUnitStats(state, U.otherSeat(sourceSeat), enemyTarget, -2, -2, ctx);
    addLog(state, `${U.cardName(enemyTarget)} gained -2/-2.`);
  } else {
    addLog(state, "No enemy unit was available.");
  }
}

function resolveResurrectTraitUnitsFromGraveyard(state, sourceSeat, sourceCard) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner) return;

  let traitName = "phantom";
  let amount = 2;
  let keywordsToAdd = [C.KEYWORD_HASTE];

  const ability = U.getAbilities(sourceCard)[0] || {};
  traitName = U.normalizeLowerString(ability.trait || traitName);
  amount = Number(ability.amount || amount);
  keywordsToAdd = U.ensureArray(ability.keywords || keywordsToAdd);

  let resurrected = 0;

  for (let i = owner.graveyard.length - 1; i >= 0 && resurrected < amount; i--) {
    if (owner.board.length >= C.MAX_BOARD_SIZE) break;

    const graveCard = owner.graveyard[i];
    if (!graveCard || !U.isUnit(graveCard) || !U.hasTrait(graveCard, traitName)) continue;

    owner.graveyard.splice(i, 1);

    graveCard.hp = graveCard.max_hp;
    graveCard.can_attack = false;
    graveCard.exhausted = true;
    graveCard.summoned_this_turn = false;
    graveCard.has_attacked_this_turn = false;
    graveCard.attacks_this_turn = 0;
    graveCard.temporary_keywords = {};

    for (const keyword of keywordsToAdd) {
      U.addKeyword(graveCard, keyword);
    }

    Combat.applySummonState(graveCard, owner);
    owner.board.push(graveCard);
    U.refreshAttackPermissionsForPlayer(owner);

    resurrected++;
  }

  addLog(state, `${U.cardName(sourceCard)} resurrected ${resurrected} ${traitName} unit(s).`);
}

function resolveTemporaryImmobileAllEnemyUnits(state, sourceSeat, sourceCard) {
  const enemySeat = U.otherSeat(sourceSeat);
  const enemy = U.getPlayer(state, enemySeat);
  if (!enemy) return;

  const ability = U.getAbilities(sourceCard)[0] || {};
  const expireAfterTurns = Number(ability.expire_after_turns || 2);
  const expireTurnNumber = Number(state.turn_number || 0) + expireAfterTurns;

  let affected = 0;

  for (const unit of U.ensureArray(enemy.board)) {
    if (!unit || !U.isUnit(unit)) continue;

    U.addTemporaryKeywordToUnit(unit, C.KEYWORD_IMMOBILE, expireTurnNumber);
    affected++;
  }

  U.refreshAttackPermissionsForPlayer(enemy);
  addLog(state, `${U.cardName(sourceCard)} made enemy units Immobile. Affected units: ${affected}.`);
}

function resolveReturnRandomHandUnitDrawAnotherTraitUnit(state, sourceSeat, sourceCard) {
  const player = U.getPlayer(state, sourceSeat);
  if (!player) return;

  const returnCandidates = [];

  for (let i = 0; i < player.hand.length; i++) {
    const card = player.hand[i];
    if (card && U.isUnit(card)) {
      returnCandidates.push(i);
    }
  }

  if (returnCandidates.length <= 0) {
    addLog(state, `${U.cardName(sourceCard)} found no unit in hand to return.`);
    return;
  }

  const selectedHandIndex = returnCandidates[U.randomInt(returnCandidates.length)];
  const returnedCard = player.hand.splice(selectedHandIndex, 1)[0];
  const returnedTraits = U.ensureArray(returnedCard.traits).map(U.normalizeLowerString);

  player.deck.push(returnedCard);
  CardOps.shuffleArray(player.deck);

  const deckCandidates = [];

  for (let i = 0; i < player.deck.length; i++) {
    const deckCard = player.deck[i];
    if (!deckCard || !U.isUnit(deckCard)) continue;

    let hasAnotherTrait = false;
    for (const traitValue of U.ensureArray(deckCard.traits)) {
      const trait = U.normalizeLowerString(traitValue);
      if (trait && !returnedTraits.includes(trait)) {
        hasAnotherTrait = true;
        break;
      }
    }

    if (hasAnotherTrait) {
      deckCandidates.push(i);
    }
  }

  if (deckCandidates.length <= 0) {
    addLog(state, `${U.cardName(sourceCard)} returned ${U.cardName(returnedCard)} to deck, but found no unit with another trait.`);
    return;
  }

  const selectedDeckIndex = deckCandidates[U.randomInt(deckCandidates.length)];
  const drawnCard = player.deck.splice(selectedDeckIndex, 1)[0];

  U.buffCardStats(drawnCard, 2, 2);
  drawnCard.cost = Math.max(Number(drawnCard.cost || 0) - 1, 0);

  if (player.hand.length >= C.MAX_HAND_SIZE) {
    player.graveyard.push(drawnCard);
    addLog(state, `${U.cardName(sourceCard)} drew ${U.cardName(drawnCard)}, but hand was full.`);
    return;
  }

  player.hand.push(drawnCard);
  addLog(state, `${U.cardName(sourceCard)} returned ${U.cardName(returnedCard)} and drew ${U.cardName(drawnCard)}. It gained +2/+2 and costs 1 less.`);
}

function resolveMasterworkOfArt(state, sourceSeat, sourceCard, ctx = {}) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner) return;

  const traitSet = new Set();

  for (const graveCard of U.ensureArray(owner.graveyard)) {
    if (!graveCard) continue;

    for (const traitValue of U.ensureArray(graveCard.traits)) {
      const trait = U.normalizeLowerString(traitValue);
      if (trait) traitSet.add(trait);
    }
  }

  const burntCount = owner.graveyard.length;
  owner.graveyard = [];

  if (owner.board.length >= C.MAX_BOARD_SIZE) {
    addLog(state, `${U.cardName(sourceCard)} burned ${burntCount} card(s), but board was full.`);
    return;
  }

  const context = getCtx(ctx);
  if (typeof context.makeCardFromId !== "function") {
    addLog(state, `${U.cardName(sourceCard)} failed. makeCardFromId is missing.`);
    return;
  }

  const doodle = context.makeCardFromId("doodle");
  if (!doodle) {
    addLog(state, `${U.cardName(sourceCard)} failed to create Doodle.`);
    return;
  }

  doodle.traits = Array.from(traitSet);
  doodle.max_attacks_per_turn = doodle.traits.length;
  doodle.attacks_this_turn = 0;

  Combat.applySummonState(doodle, owner);
  owner.board.push(doodle);
  U.refreshAttackPermissionsForPlayer(owner);

  addLog(state, `${U.cardName(sourceCard)} burned ${burntCount} card(s) and summoned Doodle with ${doodle.traits.length} trait(s).`);
}

function resolveRimeOfTheAncientMariner(state, sourceSeat, sourceCard, ctx = {}) {
  const owner = U.getPlayer(state, sourceSeat);
  const enemy = U.getPlayer(state, U.otherSeat(sourceSeat));
  if (!owner || !enemy) return;

  if (owner.board.length >= C.MAX_BOARD_SIZE) {
    addLog(state, `${U.cardName(sourceCard)} failed. Board was full.`);
    return;
  }

  const context = getCtx(ctx);
  if (typeof context.makeCardFromId !== "function") {
    addLog(state, `${U.cardName(sourceCard)} failed. makeCardFromId is missing.`);
    return;
  }

  const mariner = context.makeCardFromId("ancient_mariner");
  if (!mariner) {
    addLog(state, `${U.cardName(sourceCard)} failed to summon Ancient Mariner.`);
    return;
  }

  const enemyUnitCount = U.ensureArray(enemy.board).filter(unit => unit && U.isUnit(unit)).length;
  const statLoss = enemyUnitCount * 2;

  mariner.attack = Math.max(0, Number(mariner.attack || 0) - statLoss);
  mariner.max_hp = Math.max(1, Number(mariner.max_hp || mariner.hp || 1) - statLoss);
  mariner.hp = mariner.max_hp;

  Combat.applySummonState(mariner, owner);
  owner.board.push(mariner);
  U.refreshAttackPermissionsForPlayer(owner);

  addLog(state, `${U.cardName(sourceCard)} summoned Ancient Mariner. Enemy units: ${enemyUnitCount}. It gained -${statLoss}/-${statLoss}.`);
}

function resolveEncompassedCompass(state, sourceSeat, sourceCard) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner) return;

  if (owner.board.length >= C.MAX_BOARD_SIZE) {
    addLog(state, `${U.cardName(sourceCard)} failed. Board was full.`);
    return;
  }

  let targetIndex = -1;

  for (let i = owner.graveyard.length - 1; i >= 0; i--) {
    const graveCard = owner.graveyard[i];
    if (graveCard && U.isUnit(graveCard)) {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex < 0) {
    addLog(state, `${U.cardName(sourceCard)} found no unit card in graveyard.`);
    return;
  }

  const resurrected = owner.graveyard.splice(targetIndex, 1)[0];

  resurrected.hp = resurrected.max_hp;
  resurrected.can_attack = false;
  resurrected.exhausted = true;
  resurrected.summoned_this_turn = false;
  resurrected.has_attacked_this_turn = false;
  resurrected.attacks_this_turn = 0;
  resurrected.temporary_keywords = {};
  resurrected.cannot_attack_leader = true;

  Combat.applySummonState(resurrected, owner);
  owner.board.push(resurrected);
  U.refreshAttackPermissionsForPlayer(owner);

  addLog(state, `${U.cardName(sourceCard)} resurrected ${U.cardName(resurrected)}. It cannot attack the opponent's leader.`);
}

function resolveStormAndTides(state, sourceSeat, sourceCard, ctx = {}) {
  const enemySeat = U.otherSeat(sourceSeat);
  const enemy = U.getPlayer(state, enemySeat);
  if (!enemy) return;

  const enemyBefore = enemy.board.slice();

  Combat.dealDamageToAllUnits(state, 2, ctx);

  let killedEnemyCount = 0;
  for (const oldUnit of enemyBefore) {
    if (oldUnit && !enemy.board.includes(oldUnit)) {
      killedEnemyCount++;
    }
  }

  addLog(state, `${U.cardName(sourceCard)} dealt 2 damage to all units.`);

  if (killedEnemyCount > 0) {
    Combat.dealDamageToAllUnits(state, 2, ctx);
    addLog(state, `${U.cardName(sourceCard)} repeated because it destroyed ${killedEnemyCount} enemy unit(s).`);
  }
}

function resolveCallOfOmen(state, sourceSeat, sourceCard, ctx = {}) {
  const enemySeat = U.otherSeat(sourceSeat);
  const enemy = U.getPlayer(state, enemySeat);
  if (!enemy) return;

  let debuffed = 0;
  let destroyed = 0;

  for (const unit of U.ensureArray(enemy.board)) {
    if (!unit || !U.isUnit(unit)) continue;
    if (U.isUntrickableUnit(enemy, unit)) continue;

    unit.attack = Number(unit.attack || 0) - 1;
    debuffed++;
  }

  const snapshot = enemy.board.slice();

  for (const unit of snapshot) {
    if (!unit || !enemy.board.includes(unit)) continue;
    if (U.isUntrickableUnit(enemy, unit)) continue;

    if (Number(unit.attack || 0) <= 1) {
      if (Combat.destroyUnit(state, enemySeat, unit, ctx)) {
        destroyed++;
      }
    }
  }

  addLog(state, `${U.cardName(sourceCard)} debuffed ${debuffed} enemy unit(s) and destroyed ${destroyed} unit(s).`);
}

function resolveBuffAllAllyUnits(state, sourceSeat, sourceCard) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner) return;

  const ability = U.getAbilities(sourceCard)[0] || {};
  const attackBonus = Number(ability.attack || 1);
  const hpBonus = Number(ability.hp || 1);

  let affected = 0;

  for (const unit of U.ensureArray(owner.board)) {
    if (!unit || !U.isUnit(unit)) continue;

    U.buffCardStats(unit, attackBonus, hpBonus);
    affected++;
  }

  addLog(state, `${U.cardName(sourceCard)} gave all allied units +${attackBonus}/+${hpBonus}. Affected units: ${affected}.`);
}

function resolveConvivialHumming(state, sourceSeat, sourceCard, ctx = {}) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner) return;

  const spellCount = CardOps.countSpellsInGraveyard(owner);
  const damageAmount = spellCount;

  if (damageAmount <= 0) {
    addLog(state, `${U.cardName(sourceCard)}: X=${spellCount}. No damage dealt.`);
    return;
  }

  const hitCount = Combat.dealDamageToAllEnemyUnitsForPlayer(state, sourceSeat, damageAmount, ctx);
  addLog(state, `${U.cardName(sourceCard)} dealt ${damageAmount} damage to all enemy units. Hit units: ${hitCount}.`);
}

function resolveEconomicsOverflow(state, sourceSeat, sourceCard) {
  const player = U.getPlayer(state, sourceSeat);
  if (!player) return;

  player.inflation_counters = Number(player.inflation_counters || 0) + 4;
  addLog(state, `${U.cardName(sourceCard)} added 4 Inflation Counters. Total: ${player.inflation_counters}.`);
}

function resolveMonochroBlueprint(state, sourceSeat, sourceCard, ctx = {}) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner) return;

  const targetIndex = (() => {
    for (let i = owner.graveyard.length - 1; i >= 0; i--) {
      const card = owner.graveyard[i];
      if (card && U.isUnit(card) && U.hasTrait(card, "gadget")) {
        return i;
      }
    }
    return -1;
  })();

  if (targetIndex < 0) {
    addLog(state, `${U.cardName(sourceCard)} found no Gadget unit in graveyard.`);
    return;
  }

  const baseCard = owner.graveyard.splice(targetIndex, 1)[0];
  const copies = [baseCard, U.copyCardData(baseCard), U.copyCardData(baseCard)];

  let summoned = 0;

  for (const card of copies) {
    if (!card) continue;
    if (owner.board.length >= C.MAX_BOARD_SIZE) {
      owner.graveyard.push(card);
      continue;
    }

    card.hp = card.max_hp;
    Combat.applySummonState(card, owner);
    owner.board.push(card);
    summoned++;
  }

  U.refreshAttackPermissionsForPlayer(owner);
  addLog(state, `${U.cardName(sourceCard)} resurrected ${U.cardName(baseCard)} and summoned ${summoned} total Gadget unit(s).`);
}

function resolveBookOfRushwater(state, sourceSeat, sourceCard, ctx = {}) {
  const damage = Number(sourceCard.power || 4);
  const hitCount = Combat.dealDamageToAllEnemyUnitsForPlayer(state, sourceSeat, damage, ctx);
  addLog(state, `${U.cardName(sourceCard)} dealt ${damage} damage to all enemy units. Hit units: ${hitCount}.`);
}

function resolveIntroductionToArmory(state, sourceSeat, sourceCard) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner) return;

  const armorGain = Number(sourceCard.power || 1);
  let affected = 0;

  for (const unit of U.ensureArray(owner.board)) {
    if (!unit || !U.isUnit(unit)) continue;

    Combat.giveArmor(unit, armorGain);
    affected++;
  }

  addLog(state, `${U.cardName(sourceCard)} gave Armor ${armorGain} to allied units. Affected units: ${affected}.`);
}

/* ============================================================================
 * Targeted spell helpers
 * ========================================================================== */

function resolveAddKeywordSpellOnFriendlyUnit(state, sourceSeat, sourceCard, targetUnit) {
  if (!targetUnit) {
    addLog(state, "Invalid target unit.");
    return;
  }

  const ability = U.getAbilities(sourceCard)[0] || {};
  const requiredTrait = U.normalizeLowerString(ability.trait || "");
  const keywordName = U.normalizeLowerString(ability.keyword || "");

  if (requiredTrait && !U.hasTrait(targetUnit, requiredTrait)) {
    addLog(state, `${U.cardName(sourceCard)} can only target ${requiredTrait} units.`);
    return;
  }

  if (!keywordName) {
    addLog(state, `${U.cardName(sourceCard)} has no keyword to add.`);
    return;
  }

  U.addKeyword(targetUnit, keywordName);
  addLog(state, `${U.cardName(targetUnit)} gained ${keywordName}.`);
}

function resolveAddKeywordsToUnitSpell(state, sourceSeat, sourceCard, targetUnit) {
  if (!targetUnit) {
    addLog(state, "Invalid target unit.");
    return;
  }

  const ability = U.getAbilities(sourceCard)[0] || {};
  const keywordsToAdd = U.ensureArray(ability.keywords);

  for (const keyword of keywordsToAdd) {
    U.addKeyword(targetUnit, keyword);
  }

  const owner = U.getOwnerOfCard(state, targetUnit);
  U.refreshAttackPermissionsForPlayer(owner);

  addLog(state, `${U.cardName(targetUnit)} gained keywords: ${keywordsToAdd.join(", ")}.`);
}

function resolveDestroyFriendlyTraitUnitCopyToHandBuff(state, sourceSeat, sourceCard, targetSeat, unitIndex, ctx = {}) {
  if (targetSeat !== sourceSeat) {
    addLog(state, `${U.cardName(sourceCard)} can only target an ally unit.`);
    return;
  }

  const owner = U.getPlayer(state, sourceSeat);
  if (!owner || unitIndex < 0 || unitIndex >= owner.board.length) {
    addLog(state, "Invalid unit target.");
    return;
  }

  const targetUnit = owner.board[unitIndex];
  const ability = U.getAbilities(sourceCard)[0] || {};
  const traitName = U.normalizeLowerString(ability.trait || "gadget");
  const attackBonus = Number(ability.attack || 2);
  const hpBonus = Number(ability.hp || 4);

  if (!targetUnit || !U.hasTrait(targetUnit, traitName)) {
    addLog(state, `${U.cardName(sourceCard)} can only target ally ${traitName} units.`);
    return;
  }

  const copied = U.copyCardData(targetUnit);
  const targetName = U.cardName(targetUnit);

  Combat.destroyUnit(state, sourceSeat, unitIndex, ctx);

  if (!copied) {
    addLog(state, `${U.cardName(sourceCard)} failed to create a copy.`);
    return;
  }

  U.buffCardStats(copied, attackBonus, hpBonus);
  copied.hp = copied.max_hp;
  copied.can_attack = false;
  copied.exhausted = true;
  copied.summoned_this_turn = false;
  copied.has_attacked_this_turn = false;
  copied.attacks_this_turn = 0;

  if (owner.hand.length >= C.MAX_HAND_SIZE) {
    owner.graveyard.push(copied);
    addLog(state, `Hand was full, so copied ${targetName} went to graveyard.`);
    return;
  }

  owner.hand.push(copied);
  addLog(state, `${U.cardName(sourceCard)} added a +${attackBonus}/+${hpBonus} copy of ${targetName} to hand.`);
}

function resolveRunicTuning(state, sourceSeat, sourceCard, targetUnit) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner || !targetUnit) return;

  U.buffCardStats(targetUnit, 2, 2);
  U.addKeyword(targetUnit, C.KEYWORD_HASTE);

  let gained = 0;
  if (U.hasTrait(targetUnit, "music")) {
    gained = CardOps.gainMana(owner, 1);
  }

  U.refreshAttackPermissionsForPlayer(owner);

  addLog(state, `${U.cardName(sourceCard)} gave ${U.cardName(targetUnit)} +2/+2 and Haste.${gained > 0 ? " Gained 1 mana." : ""}`);
}

function resolveLamentationOfLife(state, sourceSeat, sourceCard, targetSeat, unitIndex, ctx = {}) {
  const owner = U.getPlayer(state, targetSeat);
  if (!owner || unitIndex < 0 || unitIndex >= owner.board.length) {
    addLog(state, "Invalid target for Lamentation of Life.");
    return;
  }

  const targetUnit = owner.board[unitIndex];

  if (U.isUntrickableUnit(owner, targetUnit)) {
    addLog(state, `${U.cardName(targetUnit)} is Untrickable and cannot be affected.`);
    return;
  }

  if (Number(targetUnit.attack || 0) > 3) {
    addLog(state, `Lamentation of Life failed. ${U.cardName(targetUnit)} has more than 3 ATK.`);
    return;
  }

  const targetName = U.cardName(targetUnit);
  Combat.destroyUnit(state, targetSeat, unitIndex, ctx);
  addLog(state, `${U.cardName(sourceCard)} destroyed ${targetName}.`);
}

function resolvePoetryOfResilience(state, sourceSeat, sourceCard, targetUnit) {
  if (!targetUnit) {
    addLog(state, "Invalid Poetry of Resilience target.");
    return;
  }

  const hp = Number(targetUnit.hp || 0);
  const maxHp = Number(targetUnit.max_hp || targetUnit.base_hp || hp || 0);

  if (hp >= maxHp) {
    addLog(state, `${U.cardName(sourceCard)} can only target a damaged allied unit.`);
    return;
  }

  const ability = U.getAbilities(sourceCard)[0] || {};
  const armorGain = Number(ability.armor || sourceCard.power || 3);
  const traitName = U.normalizeLowerString(ability.trait || "music");

  targetUnit.armor = Number(targetUnit.armor || 0) + armorGain;

  if (traitName) {
    U.addTrait(targetUnit, traitName);
  }

  addLog(state, `${U.cardName(targetUnit)} gained Armor ${armorGain} and ${traitName} trait.`);
}

function resolveNoblesOblige(state, sourceSeat, sourceCard, targetUnit) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner || !targetUnit) return;

  const spent = Number(owner.mana || 0);
  owner.mana = 0;

  U.buffCardStats(targetUnit, spent, spent);
  addLog(state, `${U.cardName(sourceCard)} spent ${spent} mana. ${U.cardName(targetUnit)} gained +${spent}/+${spent}.`);
}

function resolveForbiddenBook(state, sourceSeat, sourceCard, targetSeat, unitIndex, ctx = {}) {
  if (targetSeat !== sourceSeat) {
    addLog(state, `${U.cardName(sourceCard)} can only target an allied unit.`);
    return;
  }

  const owner = U.getPlayer(state, sourceSeat);
  const enemySeat = U.otherSeat(sourceSeat);
  if (!owner || unitIndex < 0 || unitIndex >= owner.board.length) return;

  const targetUnit = owner.board[unitIndex];
  const damage = Number(targetUnit.cost || 0);
  const targetName = U.cardName(targetUnit);

  Combat.destroyUnit(state, sourceSeat, unitIndex, ctx);
  Combat.damagePlayer(state, enemySeat, damage);

  addLog(state, `${U.cardName(sourceCard)} destroyed ${targetName} and dealt ${damage} damage to enemy leader.`);
}

function resolveTranscribeOfTheWicked(state, sourceSeat, sourceCard, targetSeat, unitIndex, ctx = {}) {
  const owner = U.getPlayer(state, targetSeat);
  if (!owner || unitIndex < 0 || unitIndex >= owner.board.length) return;

  const targetUnit = owner.board[unitIndex];

  if (Number(targetUnit.hp || 0) >= 4) {
    addLog(state, `${U.cardName(sourceCard)} failed. Target has 4 or more HP.`);
    return;
  }

  const targetName = U.cardName(targetUnit);
  Combat.destroyUnit(state, targetSeat, unitIndex, ctx);
  addLog(state, `${U.cardName(sourceCard)} destroyed ${targetName}.`);
}

/* ============================================================================
 * Hand selection effects
 * ========================================================================== */

function resolveIncantationOfMinstrel(state, sourceSeat, sourceCard) {
  const player = U.getPlayer(state, sourceSeat);
  if (!player) return { ok: true, pending: false };

  const candidates = getCandidateIndexesByPredicate(player, () => true);

  if (candidates.length <= 0) {
    addLog(state, `${U.cardName(sourceCard)} found no card in hand to choose.`);
    return { ok: true, pending: false };
  }

  return beginHandSelection(
    state,
    sourceSeat,
    C.EFFECT_INCANTATION_OF_MINSTREL,
    sourceCard,
    candidates,
    "Choose a card in your hand."
  );
}

function resolveIncantationOfMinstrelSelectedCard(state, sourceSeat, sourceCard, selectedCard) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner || !selectedCard) return;

  const boardCount = U.ensureArray(owner.board).filter(unit => unit && U.isUnit(unit)).length;
  const oldCost = Number(selectedCard.cost || 0);

  selectedCard.cost = Math.max(0, oldCost - boardCount);

  const shouldDraw = U.hasTrait(selectedCard, "mage") || U.hasTrait(selectedCard, "music");

  if (shouldDraw) {
    CardOps.drawCards(state, sourceSeat, 1);
  }

  addLog(state, `${U.cardName(sourceCard)} reduced ${U.cardName(selectedCard)} by ${oldCost - selectedCard.cost}.${shouldDraw ? " Drew 1 card." : ""}`);
}

function resolveLightningCeremony(state, sourceSeat, sourceCard) {
  const player = U.getPlayer(state, sourceSeat);
  if (!player) return { ok: true, pending: false };

  const candidates = getCandidateIndexesByPredicate(player, () => true);

  if (candidates.length <= 0) {
    addLog(state, `${U.cardName(sourceCard)} found no card to burn.`);
    return { ok: true, pending: false };
  }

  return beginHandSelection(
    state,
    sourceSeat,
    C.EFFECT_LIGHTNING_CEREMONY,
    sourceCard,
    candidates,
    "Choose a card to burn."
  );
}

function resolveLightningCeremonySelectedCard(state, sourceSeat, sourceCard, selectedCard) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner || !selectedCard) return;

  const index = owner.hand.indexOf(selectedCard);
  if (index < 0) {
    addLog(state, `${U.cardName(sourceCard)} failed. Selected card is no longer in hand.`);
    return;
  }

  const burnedName = U.cardName(selectedCard);

  owner.hand.splice(index, 1);
  owner.graveyard.push(selectedCard);

  CardOps.drawCards(state, sourceSeat, 3);

  addLog(state, `${U.cardName(sourceCard)} burned ${burnedName} and drew 3 cards.`);
}

function resolveScavengeCommand(state, sourceSeat, sourceCard) {
  const player = U.getPlayer(state, sourceSeat);
  if (!player) return { ok: true, pending: false };

  const candidates = getCandidateIndexesByPredicate(player, card => U.isUnit(card) && U.hasTrait(card, "marine"));

  if (candidates.length <= 0) {
    addLog(state, `${U.cardName(sourceCard)} found no Marine unit in hand.`);
    return { ok: true, pending: false };
  }

  return beginHandSelection(
    state,
    sourceSeat,
    C.EFFECT_SCAVENGE_COMMAND,
    sourceCard,
    candidates,
    "Choose a Marine unit in your hand."
  );
}

function resolveScavengeCommandSelectedCard(state, sourceSeat, sourceCard, selectedCard) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner || !selectedCard) return;

  if (!owner.hand.includes(selectedCard)) {
    addLog(state, `${U.cardName(sourceCard)} failed. Selected card is no longer in hand.`);
    return;
  }

  if (!U.isUnit(selectedCard) || !U.hasTrait(selectedCard, "marine")) {
    addLog(state, `${U.cardName(sourceCard)} can only choose a Marine unit.`);
    return;
  }

  U.addKeyword(selectedCard, C.KEYWORD_HASTE);

  selectedCard.abilities = U.ensureArray(selectedCard.abilities);
  selectedCard.abilities.push({
    trigger: C.TRIGGER_WHEN_DESTROYED,
    effect: C.ABILITY_EFFECT_MODIFY_HAND_COST_BY_TRAIT,
    trait: "marine",
    amount: -1
  });

  addLog(state, `${U.cardName(selectedCard)} gained Haste and death effect: Marine cards in hand cost 1 less.`);
}

function resolveDuelOnSea(state, sourceSeat, sourceCard) {
  const player = U.getPlayer(state, sourceSeat);
  if (!player) return { ok: true, pending: false };

  const candidates = getCandidateIndexesByPredicate(player, card => U.isUnit(card) && U.hasTrait(card, "marine"));

  if (candidates.length <= 0) {
    addLog(state, `${U.cardName(sourceCard)} found no Marine unit to reveal.`);
    return { ok: true, pending: false };
  }

  return beginHandSelection(
    state,
    sourceSeat,
    C.EFFECT_DUEL_ON_SEA,
    sourceCard,
    candidates,
    "Reveal a Marine unit in your hand."
  );
}

function resolveDuelOnSeaSelectedCard(state, sourceSeat, sourceCard, selectedCard, ctx = {}) {
  const owner = U.getPlayer(state, sourceSeat);
  const enemySeat = U.otherSeat(sourceSeat);
  const enemy = U.getPlayer(state, enemySeat);

  if (!owner || !enemy || !selectedCard) return;

  if (!owner.hand.includes(selectedCard)) {
    addLog(state, `${U.cardName(sourceCard)} failed. Selected card is no longer in hand.`);
    return;
  }

  if (!U.isUnit(selectedCard) || !U.hasTrait(selectedCard, "marine")) {
    addLog(state, `${U.cardName(sourceCard)} can only reveal a Marine unit.`);
    return;
  }

  const threshold = Number(selectedCard.attack || 0);
  let destroyed = 0;

  const snapshot = enemy.board.slice();

  for (const enemyUnit of snapshot) {
    if (!enemyUnit || !enemy.board.includes(enemyUnit)) continue;
    if (U.isUntrickableUnit(enemy, enemyUnit)) continue;

    if (Number(enemyUnit.attack || 0) < threshold) {
      if (Combat.destroyUnit(state, enemySeat, enemyUnit, ctx)) {
        destroyed++;
      }
    }
  }

  addLog(state, `${U.cardName(sourceCard)} revealed ${U.cardName(selectedCard)} with ${threshold} ATK. Destroyed ${destroyed} enemy unit(s).`);
}

function resolveTarnishedBookshelfSelectedCard(state, sourceSeat, sourceCard, selectedCard, ctx = {}) {
  const owner = U.getPlayer(state, sourceSeat);
  if (!owner || !selectedCard) return;

  if (!owner.hand.includes(selectedCard)) {
    addLog(state, `${U.cardName(sourceCard)} failed. Selected card is no longer in hand.`);
    return;
  }

  if (!U.hasTrait(selectedCard, "scholar")) {
    addLog(state, `${U.cardName(sourceCard)} can only choose a Scholar card.`);
    return;
  }

  const context = getCtx(ctx);
  const amount = 4;

  if (typeof context.makeCardFromId === "function" && U.cardId(selectedCard)) {
    CardOps.addCopiesToDeck(state, sourceSeat, U.cardId(selectedCard), amount, context.makeCardFromId, null, true);
  } else {
    for (let i = 0; i < amount; i++) {
      owner.deck.push(U.copyCardData(selectedCard));
    }
    CardOps.shuffleArray(owner.deck);
  }

  addLog(state, `${U.cardName(sourceCard)} added 4 copies of ${U.cardName(selectedCard)} to deck.`);
}


module.exports = {
  getAmount,
  getEffectiveSpellDamage,

  beginHandSelection,
  clearHandSelection,
  resolveHandSelection,

  applyEffectToTarget,
  resolveSpellOrCardEffect,

  resolveAbsoluteLoyalty,
  resolveHealAllAlliesGainMaxHp,
  resolveProphetsOfRuin,
  resolveAddZeroCostCopiesOfLastSpell,
  resolveDrawRandomTraitFromDeckIncreaseCost,
  resolveHapHazard,
  resolveResurrectTraitUnitsFromGraveyard,
  resolveTemporaryImmobileAllEnemyUnits,
  resolveReturnRandomHandUnitDrawAnotherTraitUnit,
  resolveMasterworkOfArt,
  resolveRimeOfTheAncientMariner,
  resolveEncompassedCompass,
  resolveStormAndTides,
  resolveCallOfOmen,
  resolveBuffAllAllyUnits,
  resolveConvivialHumming,
  resolveEconomicsOverflow,
  resolveMonochroBlueprint,
  resolveBookOfRushwater,
  resolveIntroductionToArmory,

  resolveAddKeywordSpellOnFriendlyUnit,
  resolveAddKeywordsToUnitSpell,
  resolveDestroyFriendlyTraitUnitCopyToHandBuff,
  resolveRunicTuning,
  resolveLamentationOfLife,
  resolvePoetryOfResilience,
  resolveNoblesOblige,
  resolveForbiddenBook,
  resolveTranscribeOfTheWicked,

  resolveIncantationOfMinstrel,
  resolveLightningCeremony,
  resolveScavengeCommand,
  resolveDuelOnSea
};

"use strict";

/*
  battle_engine.js

  Node authoritative battle engine.
  Godot client sends input only.
  This file owns:
  - target validation
  - unit / spell play
  - battlecry / trigger dispatch
  - combat
  - death queue
  - summon queue
  - basic generic effect resolution

  Expected loose state shape:
  state = {
    match_id,
    turn_seat: "A" | "B",
    winner_seat: null | "A" | "B",
    loser_seat: null | "A" | "B",
    turn_number,
    selected: null | {
      seat_id,
      source_zone: "hand" | "board",
      source_index,
      action_type: "play_card" | "attack",
      card_id
    },
    players: {
      A: { hp, max_hp, mana, max_mana, deck, hand, board, graveyard, side, scholar_played_count, inflation_counter },
      B: { hp, max_hp, mana, max_mana, deck, hand, board, graveyard, side, scholar_played_count, inflation_counter }
    },
    log: []
  }
*/

const MAX_MANA = 10;
const MAX_HAND_SIZE = 7;
const MAX_BOARD_SIZE = 5;

function nowLog(state, text) {
  if (!state.log) state.log = [];
  state.log.push(String(text));
  if (state.log.length > 80) {
    state.log.splice(0, state.log.length - 80);
  }
}

function otherSeat(seatId) {
  return seatId === "A" ? "B" : "A";
}

function getPlayer(state, seatId) {
  return state.players?.[seatId] || null;
}

function getOpponent(state, seatId) {
  return getPlayer(state, otherSeat(seatId));
}

function isUnit(card) {
  return card && String(card.card_type || card.type || "").toLowerCase() === "unit";
}

function isSpell(card) {
  return card && String(card.card_type || card.type || "").toLowerCase() === "spell";
}

function cardName(card) {
  return card?.card_name || card?.name || card?.card_id || "Unknown Card";
}

function cardId(card) {
  return card?.card_id || card?.id || "";
}

function ensureArray(v) {
  return Array.isArray(v) ? v : [];
}

function normalizeCardRuntime(card) {
  if (!card) return card;

  if (typeof card.attack !== "number") {
    card.attack = Number(card.attack || 0);
  }

  if (typeof card.hp !== "number") {
    card.hp = Number(card.hp || card.max_hp || card.base_hp || 0);
  }

  if (typeof card.max_hp !== "number") {
    card.max_hp = Number(card.max_hp || card.base_hp || card.hp || 0);
  }

  if (typeof card.base_attack !== "number") {
    card.base_attack = Number(card.base_attack || card.attack || 0);
  }

  if (typeof card.base_hp !== "number") {
    card.base_hp = Number(card.base_hp || card.max_hp || card.hp || 0);
  }

  if (typeof card.armor !== "number") {
    card.armor = Number(card.armor || 0);
  }

  if (typeof card.cost !== "number") {
    card.cost = Number(card.cost || 0);
  }

  if (typeof card.max_attacks_per_turn !== "number") {
    card.max_attacks_per_turn = Number(card.max_attacks_per_turn || 1);
  }

  if (typeof card.attacks_this_turn !== "number") {
    card.attacks_this_turn = Number(card.attacks_this_turn || 0);
  }

  if (typeof card.can_attack !== "boolean") {
    card.can_attack = false;
  }

  card.keywords = ensureArray(card.keywords);
  card.tags = ensureArray(card.tags);
  card.traits = ensureArray(card.traits);
  card.abilities = ensureArray(card.abilities);

  return card;
}

function normalizePlayerRuntime(player) {
  if (!player) return;

  player.deck = ensureArray(player.deck);
  player.hand = ensureArray(player.hand);
  player.board = ensureArray(player.board);
  player.graveyard = ensureArray(player.graveyard);

  for (const c of player.deck) normalizeCardRuntime(c);
  for (const c of player.hand) normalizeCardRuntime(c);
  for (const c of player.board) normalizeCardRuntime(c);
  for (const c of player.graveyard) normalizeCardRuntime(c);

  if (typeof player.hp !== "number") player.hp = Number(player.hp || 20);
  if (typeof player.max_hp !== "number") player.max_hp = Number(player.max_hp || 20);
  if (typeof player.mana !== "number") player.mana = Number(player.mana || 0);
  if (typeof player.max_mana !== "number") player.max_mana = Number(player.max_mana || 0);
  if (typeof player.scholar_played_count !== "number") player.scholar_played_count = Number(player.scholar_played_count || 0);
  if (typeof player.inflation_counter !== "number") player.inflation_counter = Number(player.inflation_counter || 0);
}

function normalizeStateRuntime(state) {
  if (!state.players) state.players = {};
  normalizePlayerRuntime(state.players.A);
  normalizePlayerRuntime(state.players.B);
  if (!state.selected) state.selected = null;
  if (!state.pending_deaths) state.pending_deaths = [];
  if (!state.pending_summons) state.pending_summons = [];
  if (typeof state.turn_number !== "number") state.turn_number = Number(state.turn_number || 1);
}

function hasKeyword(card, keyword) {
  if (!card || !keyword) return false;
  const k = String(keyword).toLowerCase();
  return ensureArray(card.keywords).some(x => String(x).toLowerCase() === k);
}

function hasTrait(card, trait) {
  if (!card || !trait) return false;
  const t = String(trait).toLowerCase();
  return ensureArray(card.traits).some(x => String(x).toLowerCase() === t);
}

function hasTag(card, tag) {
  if (!card || !tag) return false;
  const t = String(tag).toLowerCase();
  return ensureArray(card.tags).some(x => String(x).toLowerCase() === t);
}

function getAbilities(card, triggerName = null) {
  const abilities = ensureArray(card?.abilities);
  if (!triggerName) return abilities;

  const target = String(triggerName).toLowerCase();
  return abilities.filter(a => {
    const trigger = String(a.trigger || a.trigger_id || "").toLowerCase();
    return trigger === target;
  });
}

function canAttack(card, ownerSeat, state) {
  if (!card || !isUnit(card)) return false;
  normalizeCardRuntime(card);

  if (card.hp <= 0) return false;
  if (hasKeyword(card, "immobile")) return false;

  if (card.attacks_this_turn >= card.max_attacks_per_turn) return false;

  if (card.can_attack === true) return true;
  if (hasKeyword(card, "haste")) return true;
  if (hasKeyword(card, "rush")) return true;

  return false;
}

function getTauntUnits(player) {
  return ensureArray(player?.board).filter(c => c && c.hp > 0 && hasKeyword(c, "taunt"));
}

function spendMana(player, amount) {
  const cost = Number(amount || 0);
  if (player.mana < cost) return false;
  player.mana -= cost;
  return true;
}

function healPlayer(player, amount) {
  const v = Math.max(0, Number(amount || 0));
  player.hp = Math.min(player.max_hp || 20, player.hp + v);
}

function damagePlayer(state, seatId, amount) {
  const player = getPlayer(state, seatId);
  if (!player) return;

  const v = Math.max(0, Number(amount || 0));
  player.hp -= v;

  if (player.hp <= 0 && !state.winner_seat) {
    state.loser_seat = seatId;
    state.winner_seat = otherSeat(seatId);
    nowLog(state, `Winner: ${state.winner_seat}`);
  }
}

function damageUnit(state, ownerSeat, unit, amount) {
  if (!unit) return;
  normalizeCardRuntime(unit);

  let dmg = Math.max(0, Number(amount || 0));

  if (unit.armor > 0 && dmg > 0) {
    const blocked = Math.min(unit.armor, dmg);
    unit.armor -= blocked;
    dmg -= blocked;
  }

  unit.hp -= dmg;

  if (unit.hp <= 0) {
    enqueueDeath(state, ownerSeat, unit);
  }
}

function healUnit(unit, amount) {
  if (!unit) return;
  normalizeCardRuntime(unit);

  const v = Math.max(0, Number(amount || 0));
  unit.hp = Math.min(unit.max_hp || unit.hp, unit.hp + v);
}

function buffUnit(unit, attackDelta, hpDelta) {
  if (!unit) return;
  normalizeCardRuntime(unit);

  const a = Number(attackDelta || 0);
  const h = Number(hpDelta || 0);

  unit.attack += a;
  unit.hp += h;
  unit.max_hp += h;

  if (unit.hp <= 0) {
    unit.hp = 0;
  }
}

function giveArmor(unit, amount) {
  if (!unit) return;
  normalizeCardRuntime(unit);
  unit.armor += Math.max(0, Number(amount || 0));
}

function enqueueDeath(state, ownerSeat, unit) {
  if (!state.pending_deaths) state.pending_deaths = [];

  const board = getPlayer(state, ownerSeat)?.board || [];
  const index = board.indexOf(unit);
  if (index < 0) return;

  const already = state.pending_deaths.some(d => d.owner_seat === ownerSeat && d.card === unit);
  if (already) return;

  state.pending_deaths.push({
    owner_seat: ownerSeat,
    board_index: index,
    card: unit
  });
}

function processDeathQueue(state) {
  if (!state.pending_deaths) state.pending_deaths = [];

  while (state.pending_deaths.length > 0) {
    const death = state.pending_deaths.shift();
    const player = getPlayer(state, death.owner_seat);
    if (!player) continue;

    const index = player.board.indexOf(death.card);
    if (index < 0) continue;

    const deadCard = player.board.splice(index, 1)[0];
    player.graveyard.push(deadCard);

    nowLog(state, `${cardName(deadCard)} destroyed.`);

    resolveTriggeredAbilities(state, death.owner_seat, deadCard, "when_destroyed", {
      source_card: deadCard,
      source_owner: death.owner_seat
    });

    resolveGlobalTrigger(state, "unit_destroyed", {
      destroyed_card: deadCard,
      destroyed_owner: death.owner_seat
    });
  }
}

function drawCard(state, seatId, amount = 1) {
  const player = getPlayer(state, seatId);
  if (!player) return;

  const count = Math.max(0, Number(amount || 1));

  for (let i = 0; i < count; i++) {
    if (player.deck.length <= 0) {
      damagePlayer(state, seatId, 1);
      nowLog(state, `${seatId} fatigue damage 1.`);
      continue;
    }

    const card = player.deck.pop();
    normalizeCardRuntime(card);

    if (player.hand.length >= MAX_HAND_SIZE) {
      player.graveyard.push(card);
      nowLog(state, `${seatId} burned ${cardName(card)} because hand is full.`);
    } else {
      player.hand.push(card);
      nowLog(state, `${seatId} drew a card.`);
    }
  }
}

function startTurn(state, seatId) {
  state.turn_seat = seatId;
  state.selected = null;

  const player = getPlayer(state, seatId);
  if (!player) return;

  player.max_mana = Math.min(MAX_MANA, player.max_mana + 1);
  player.mana = player.max_mana;

  for (const unit of player.board) {
    normalizeCardRuntime(unit);
    unit.attacks_this_turn = 0;
    unit.can_attack = true;
  }

  drawCard(state, seatId, 1);

  resolveGlobalTrigger(state, "turn_start", {
    active_seat: seatId
  });

  processDeathQueue(state);
  processSummonQueue(state);
}

function endTurn(state, seatId) {
  if (state.turn_seat !== seatId) {
    nowLog(state, `Reject end_turn from ${seatId}: not current turn.`);
    return false;
  }

  resolveGlobalTrigger(state, "turn_end", {
    active_seat: seatId
  });

  processDeathQueue(state);
  processSummonQueue(state);

  state.selected = null;
  state.turn_number += 1;

  startTurn(state, otherSeat(seatId));
  return true;
}

function getTargetFromPayload(state, payload) {
  const target = payload.target || {};

  const targetType =
    payload.target_type ||
    target.target_type ||
    payload.targetType ||
    target.targetType ||
    null;

  const ownerSeat =
    payload.owner_seat ||
    payload.target_owner ||
    payload.board_owner ||
    target.owner_seat ||
    target.target_owner ||
    target.board_owner ||
    null;

  const boardIndexRaw =
    payload.board_index ??
    payload.target_index ??
    payload.unit_index ??
    target.board_index ??
    target.target_index ??
    target.unit_index ??
    null;

  if (targetType === "enemy_player" || targetType === "friendly_player" || targetType === "player") {
    return {
      type: "player",
      owner_seat: ownerSeat
    };
  }

  if (ownerSeat != null && boardIndexRaw != null) {
    return {
      type: "unit",
      owner_seat: String(ownerSeat),
      board_index: Number(boardIndexRaw)
    };
  }

  return null;
}

function getUnitByTarget(state, target) {
  if (!target || target.type !== "unit") return null;
  const player = getPlayer(state, target.owner_seat);
  if (!player) return null;
  return player.board[target.board_index] || null;
}

function getCardTargetType(card) {
  return String(card?.target_type || "none").toLowerCase();
}

function validateTarget(state, sourceOwnerSeat, sourceCard, target) {
  const targetType = getCardTargetType(sourceCard);

  if (targetType === "none" || targetType === "" || targetType === "target_none") {
    return { ok: target == null, reason: "target not required" };
  }

  if (!target) {
    return { ok: false, reason: "target required" };
  }

  if (target.type === "player") {
    if (targetType.includes("enemy")) {
      return {
        ok: target.owner_seat === otherSeat(sourceOwnerSeat),
        reason: "requires enemy player"
      };
    }

    if (targetType.includes("friendly") || targetType.includes("ally")) {
      return {
        ok: target.owner_seat === sourceOwnerSeat,
        reason: "requires friendly player"
      };
    }

    if (targetType.includes("player")) {
      return { ok: true, reason: "ok" };
    }

    return { ok: false, reason: "player target not allowed" };
  }

  if (target.type === "unit") {
    const unit = getUnitByTarget(state, target);
    if (!unit) return { ok: false, reason: "unit target missing" };

    if (hasKeyword(unit, "untrickable") && isSpell(sourceCard)) {
      return { ok: false, reason: "target has untrickable" };
    }

    if (targetType.includes("enemy")) {
      if (target.owner_seat !== otherSeat(sourceOwnerSeat)) {
        return { ok: false, reason: "requires enemy unit" };
      }
    }

    if (targetType.includes("friendly") || targetType.includes("ally")) {
      if (target.owner_seat !== sourceOwnerSeat) {
        return { ok: false, reason: "requires friendly unit" };
      }
    }

    if (targetType.includes("unit") || targetType.includes("enemy") || targetType.includes("friendly") || targetType.includes("ally") || targetType.includes("any")) {
      return { ok: true, reason: "ok" };
    }

    return { ok: false, reason: "unit target not allowed" };
  }

  return { ok: false, reason: "unknown target" };
}

function validateAttackTarget(state, attackerOwnerSeat, attacker, target) {
  if (!target) return { ok: false, reason: "attack target required" };

  if (!canAttack(attacker, attackerOwnerSeat, state)) {
    return { ok: false, reason: "attacker cannot attack" };
  }

  const defenderSeat = otherSeat(attackerOwnerSeat);
  const defender = getPlayer(state, defenderSeat);
  const taunts = getTauntUnits(defender);

  if (target.type === "player") {
    if (target.owner_seat !== defenderSeat) {
      return { ok: false, reason: "can only attack enemy player" };
    }

    if (taunts.length > 0) {
      return { ok: false, reason: "must attack taunt first" };
    }

    return { ok: true, reason: "ok" };
  }

  if (target.type === "unit") {
    if (target.owner_seat !== defenderSeat) {
      return { ok: false, reason: "can only attack enemy unit" };
    }

    const targetUnit = getUnitByTarget(state, target);
    if (!targetUnit) {
      return { ok: false, reason: "target unit missing" };
    }

    if (taunts.length > 0 && !hasKeyword(targetUnit, "taunt")) {
      return { ok: false, reason: "must attack taunt first" };
    }

    return { ok: true, reason: "ok" };
  }

  return { ok: false, reason: "invalid attack target" };
}

function getEffectAmount(card, ability, fallback = 0) {
  if (ability) {
    if (ability.amount != null) return Number(ability.amount);
    if (ability.value != null) return Number(ability.value);
    if (ability.damage != null) return Number(ability.damage);
    if (ability.heal != null) return Number(ability.heal);
    if (ability.power != null) return Number(ability.power);
  }

  if (card?.power != null) return Number(card.power);
  return Number(fallback || 0);
}

function collectTargetsByScope(state, sourceOwnerSeat, scope) {
  const s = String(scope || "target").toLowerCase();
  const owner = getPlayer(state, sourceOwnerSeat);
  const enemy = getOpponent(state, sourceOwnerSeat);

  if (s === "all_enemy_units") return enemy.board.map((_, i) => ({ type: "unit", owner_seat: otherSeat(sourceOwnerSeat), board_index: i }));
  if (s === "all_friendly_units" || s === "all_ally_units") return owner.board.map((_, i) => ({ type: "unit", owner_seat: sourceOwnerSeat, board_index: i }));
  if (s === "all_units") {
    return [
      ...owner.board.map((_, i) => ({ type: "unit", owner_seat: sourceOwnerSeat, board_index: i })),
      ...enemy.board.map((_, i) => ({ type: "unit", owner_seat: otherSeat(sourceOwnerSeat), board_index: i }))
    ];
  }
  if (s === "enemy_player") return [{ type: "player", owner_seat: otherSeat(sourceOwnerSeat) }];
  if (s === "friendly_player" || s === "ally_player") return [{ type: "player", owner_seat: sourceOwnerSeat }];

  return [];
}

function applyEffectToTarget(state, sourceOwnerSeat, sourceCard, target, effectType, amount, ability = {}) {
  const type = String(effectType || "").toLowerCase();

  if (!target) return;

  if (target.type === "player") {
    const targetPlayer = getPlayer(state, target.owner_seat);
    if (!targetPlayer) return;

    if (type.includes("damage")) {
      damagePlayer(state, target.owner_seat, amount);
      nowLog(state, `${cardName(sourceCard)} dealt ${amount} damage to player ${target.owner_seat}.`);
      return;
    }

    if (type.includes("heal")) {
      healPlayer(targetPlayer, amount);
      nowLog(state, `${cardName(sourceCard)} healed player ${target.owner_seat} for ${amount}.`);
      return;
    }

    return;
  }

  if (target.type === "unit") {
    const unit = getUnitByTarget(state, target);
    if (!unit) return;

    if (type.includes("damage")) {
      damageUnit(state, target.owner_seat, unit, amount);
      nowLog(state, `${cardName(sourceCard)} dealt ${amount} damage to ${cardName(unit)}.`);
      return;
    }

    if (type.includes("heal")) {
      healUnit(unit, amount);
      nowLog(state, `${cardName(sourceCard)} healed ${cardName(unit)} for ${amount}.`);
      return;
    }

    if (type.includes("armor")) {
      giveArmor(unit, amount);
      nowLog(state, `${cardName(unit)} gained ${amount} armor.`);
      return;
    }

    if (type.includes("buff") || type.includes("gain_stats") || type.includes("stats")) {
      const attack = Number(ability.attack ?? ability.attack_delta ?? ability.atk ?? amount ?? 0);
      const hp = Number(ability.hp ?? ability.hp_delta ?? ability.health ?? amount ?? 0);
      buffUnit(unit, attack, hp);
      nowLog(state, `${cardName(unit)} gained +${attack}/+${hp}.`);
      return;
    }

    if (type.includes("destroy")) {
      damageUnit(state, target.owner_seat, unit, 999999);
      nowLog(state, `${cardName(sourceCard)} destroyed ${cardName(unit)}.`);
      return;
    }
  }
}

function resolveEffect(state, sourceOwnerSeat, sourceCard, ability = {}, explicitTarget = null) {
  if (!sourceCard) return;

  const rawEffect =
    ability.effect ||
    ability.effect_id ||
    ability.type ||
    sourceCard.effect_id ||
    "none";

  const effect = String(rawEffect || "none").toLowerCase();
  const amount = getEffectAmount(sourceCard, ability, 0);

  if (effect === "none" || effect === "" || effect === "effect_none") {
    return;
  }

  if (effect.includes("draw")) {
    drawCard(state, sourceOwnerSeat, amount || 1);
    return;
  }

  if (effect.includes("inflation")) {
    const player = getPlayer(state, sourceOwnerSeat);
    player.inflation_counter += amount || 1;

    for (const c of player.hand) {
      normalizeCardRuntime(c);
      if (isUnit(c)) {
        c.cost += 1;
        c.attack += 2;
        c.hp += 1;
        c.max_hp += 1;
      }
    }

    nowLog(state, `${sourceOwnerSeat} inflation counter = ${player.inflation_counter}.`);
    return;
  }

  if (effect.includes("remainder_mana") || effect.includes("remaining_mana")) {
    const player = getPlayer(state, sourceOwnerSeat);
    const x = Math.max(0, player.mana);
    player.mana = 0;

    if (explicitTarget?.type === "unit") {
      const unit = getUnitByTarget(state, explicitTarget);
      if (unit) {
        buffUnit(unit, x, x);
        nowLog(state, `${cardName(unit)} gained +${x}/+${x}.`);
      }
    }
    return;
  }

  if (effect.includes("burn_hand_draw_same")) {
    const player = getPlayer(state, sourceOwnerSeat);
    const burned = player.hand.length;
    while (player.hand.length > 0) {
      player.graveyard.push(player.hand.shift());
    }
    drawCard(state, sourceOwnerSeat, burned);
    nowLog(state, `${sourceOwnerSeat} burned hand and drew ${burned}.`);
    return;
  }

  if (effect.includes("summon")) {
    const cardToSummon = ability.card || ability.card_id || ability.summon_card_id || sourceCard.summon_card_id;
    const count = Number(ability.count || 1);
    if (cardToSummon) {
      enqueueSummon(state, sourceOwnerSeat, cardToSummon, count);
    } else {
      nowLog(state, `summon effect missing card_id on ${cardName(sourceCard)}.`);
    }
    return;
  }

  const scope = ability.scope || ability.target_scope || null;

  if (scope) {
    const targets = collectTargetsByScope(state, sourceOwnerSeat, scope);
    for (const t of targets) {
      applyEffectToTarget(state, sourceOwnerSeat, sourceCard, t, effect, amount, ability);
    }
    return;
  }

  if (explicitTarget) {
    applyEffectToTarget(state, sourceOwnerSeat, sourceCard, explicitTarget, effect, amount, ability);
    return;
  }

  nowLog(state, `effect not fully migrated yet: ${cardName(sourceCard)} / ${effect}`);
}

function resolveTriggeredAbilities(state, sourceOwnerSeat, sourceCard, triggerName, context = {}) {
  const abilities = getAbilities(sourceCard, triggerName);

  for (const ability of abilities) {
    resolveEffect(state, sourceOwnerSeat, sourceCard, ability, context.target || null);
  }
}

function resolveGlobalTrigger(state, triggerName, context = {}) {
  for (const seatId of ["A", "B"]) {
    const player = getPlayer(state, seatId);
    if (!player) continue;

    for (const unit of [...player.board]) {
      resolveTriggeredAbilities(state, seatId, unit, triggerName, context);
    }
  }
}

function enqueueSummon(state, ownerSeat, cardIdToSummon, count = 1) {
  if (!state.pending_summons) state.pending_summons = [];
  const n = Math.max(1, Number(count || 1));

  for (let i = 0; i < n; i++) {
    state.pending_summons.push({
      owner_seat: ownerSeat,
      card_id: String(cardIdToSummon)
    });
  }
}

function processSummonQueue(state) {
  if (!state.pending_summons) state.pending_summons = [];
  if (typeof state.makeCardFromId !== "function") return;

  while (state.pending_summons.length > 0) {
    const item = state.pending_summons.shift();
    const player = getPlayer(state, item.owner_seat);
    if (!player) continue;

    if (player.board.length >= MAX_BOARD_SIZE) {
      nowLog(state, `summon failed: board full.`);
      continue;
    }

    const card = state.makeCardFromId(item.card_id);
    if (!card) {
      nowLog(state, `summon failed: missing card_id ${item.card_id}`);
      continue;
    }

    normalizeCardRuntime(card);
    player.board.push(card);
    nowLog(state, `${item.owner_seat} summoned ${cardName(card)}.`);

    resolveGlobalTrigger(state, "on_unit_summoned", {
      summoned_card: card,
      summoned_owner: item.owner_seat
    });
  }
}

function playHandCard(state, seatId, handIndex, target = null) {
  const player = getPlayer(state, seatId);

  if (!player) return false;
  if (state.turn_seat !== seatId) {
    nowLog(state, `Reject play from ${seatId}: not current turn.`);
    return false;
  }

  const index = Number(handIndex);
  const card = player.hand[index];

  if (!card) {
    nowLog(state, `Reject play: hand index missing ${index}.`);
    return false;
  }

  normalizeCardRuntime(card);

  const targetType = getCardTargetType(card);
  const requiresTarget = !(targetType === "none" || targetType === "" || targetType === "target_none");

  if (requiresTarget && !target) {
    state.selected = {
      seat_id: seatId,
      source_zone: "hand",
      source_index: index,
      action_type: "play_card",
      card_id: cardId(card)
    };
    nowLog(state, `${seatId} selected ${cardName(card)}.`);
    return true;
  }

  if (requiresTarget) {
    const validation = validateTarget(state, seatId, card, target);
    if (!validation.ok) {
      nowLog(state, `Reject target for ${cardName(card)}: ${validation.reason}.`);
      return false;
    }
  }

  if (!spendMana(player, card.cost)) {
    nowLog(state, `Reject play ${cardName(card)}: not enough mana.`);
    return false;
  }

  player.hand.splice(index, 1);

  if (isUnit(card)) {
    if (player.board.length >= MAX_BOARD_SIZE) {
      player.hand.splice(index, 0, card);
      player.mana += card.cost;
      nowLog(state, `Reject summon ${cardName(card)}: board full.`);
      return false;
    }

    card.can_attack = hasKeyword(card, "haste") || hasKeyword(card, "rush");
    card.attacks_this_turn = 0;

    player.board.push(card);
    nowLog(state, `${seatId} played unit ${cardName(card)}.`);

    if (hasTrait(card, "scholar")) {
      player.scholar_played_count += 1;
    }

    resolveTriggeredAbilities(state, seatId, card, "battlecry", {
      source_card: card,
      source_owner: seatId,
      target
    });

    resolveGlobalTrigger(state, "on_unit_played", {
      played_card: card,
      played_owner: seatId,
      target
    });

    processDeathQueue(state);
    processSummonQueue(state);
    return true;
  }

  if (isSpell(card)) {
    player.graveyard.push(card);
    nowLog(state, `${seatId} played spell ${cardName(card)}.`);

    resolveEffect(state, seatId, card, {}, target);

    resolveTriggeredAbilities(state, seatId, card, "on_played", {
      source_card: card,
      source_owner: seatId,
      target
    });

    resolveGlobalTrigger(state, "on_spell_played", {
      played_card: card,
      played_owner: seatId,
      target
    });

    processDeathQueue(state);
    processSummonQueue(state);
    return true;
  }

  player.graveyard.push(card);
  nowLog(state, `${seatId} played ${cardName(card)}.`);
  return true;
}

function attackTarget(state, seatId, boardIndex, target) {
  const player = getPlayer(state, seatId);
  if (!player) return false;

  if (state.turn_seat !== seatId) {
    nowLog(state, `Reject attack from ${seatId}: not current turn.`);
    return false;
  }

  const attacker = player.board[Number(boardIndex)];
  if (!attacker) {
    nowLog(state, `Reject attack: attacker missing.`);
    return false;
  }

  normalizeCardRuntime(attacker);

  const validation = validateAttackTarget(state, seatId, attacker, target);
  if (!validation.ok) {
    nowLog(state, `Reject attack by ${cardName(attacker)}: ${validation.reason}.`);
    return false;
  }

  attacker.attacks_this_turn += 1;

  resolveTriggeredAbilities(state, seatId, attacker, "before_attack", {
    attacker,
    attacker_owner: seatId,
    target
  });

  if (target.type === "player") {
    damagePlayer(state, target.owner_seat, attacker.attack);
    nowLog(state, `${cardName(attacker)} attacked player ${target.owner_seat} for ${attacker.attack}.`);

    resolveTriggeredAbilities(state, seatId, attacker, "after_attack", {
      attacker,
      attacker_owner: seatId,
      target
    });

    processDeathQueue(state);
    processSummonQueue(state);
    return true;
  }

  const defender = getUnitByTarget(state, target);
  if (!defender) return false;

  normalizeCardRuntime(defender);

  const attackerDamage = attacker.attack;
  const defenderDamage = defender.attack;

  if (hasKeyword(attacker, "deadly")) {
    damageUnit(state, target.owner_seat, defender, 999999);
  } else {
    damageUnit(state, target.owner_seat, defender, attackerDamage);
  }

  if (defender.hp > 0) {
    if (hasKeyword(defender, "deadly")) {
      damageUnit(state, seatId, attacker, 999999);
    } else {
      damageUnit(state, seatId, attacker, defenderDamage);
    }
  }

  nowLog(state, `${cardName(attacker)} fought ${cardName(defender)}.`);

  if (defender.hp <= 0) {
    resolveTriggeredAbilities(state, seatId, attacker, "when_kills", {
      attacker,
      attacker_owner: seatId,
      killed_card: defender,
      killed_owner: target.owner_seat
    });
  }

  if (hasKeyword(attacker, "ricochet")) {
    const enemy = getPlayer(state, target.owner_seat);
    const splashTargets = enemy.board
      .map((u, i) => ({ unit: u, index: i }))
      .filter(x => x.unit && x.unit !== defender);

    if (splashTargets.length > 0) {
      const splash = splashTargets[0];
      damageUnit(state, target.owner_seat, splash.unit, 1);
      nowLog(state, `${cardName(attacker)} ricochet dealt 1 to ${cardName(splash.unit)}.`);
    }
  }

  resolveTriggeredAbilities(state, seatId, attacker, "after_attack", {
    attacker,
    attacker_owner: seatId,
    target
  });

  processDeathQueue(state);
  processSummonQueue(state);
  return true;
}

function handleSelectedTarget(state, seatId, target) {
  const selected = state.selected;

  if (!selected || selected.seat_id !== seatId) {
    nowLog(state, `Reject target: no selected action for ${seatId}.`);
    return false;
  }

  state.selected = null;

  if (selected.action_type === "play_card" && selected.source_zone === "hand") {
    return playHandCard(state, seatId, selected.source_index, target);
  }

  if (selected.action_type === "attack" && selected.source_zone === "board") {
    return attackTarget(state, seatId, selected.source_index, target);
  }

  nowLog(state, `Reject selected target: unknown selected action.`);
  return false;
}

function surrender(state, seatId) {
  if (state.winner_seat) return true;

  state.loser_seat = seatId;
  state.winner_seat = otherSeat(seatId);
  nowLog(state, `${seatId} surrendered. Winner: ${state.winner_seat}`);
  return true;
}

function selectAttacker(state, seatId, boardIndex) {
  const player = getPlayer(state, seatId);
  if (!player) return false;

  const unit = player.board[Number(boardIndex)];
  if (!unit) return false;

  const can = canAttack(unit, seatId, state);
  if (!can) {
    nowLog(state, `Reject select attacker ${cardName(unit)}: cannot attack.`);
    return false;
  }

  state.selected = {
    seat_id: seatId,
    source_zone: "board",
    source_index: Number(boardIndex),
    action_type: "attack",
    card_id: cardId(unit)
  };

  nowLog(state, `${seatId} selected attacker ${cardName(unit)}.`);
  return true;
}

function handleBattleAction(match, seatId, payload, deps = {}) {
  const state = match.state || match;
  normalizeStateRuntime(state);

  if (typeof deps.makeCardFromId === "function") {
    state.makeCardFromId = deps.makeCardFromId;
  }

  const action = String(payload.action || payload.type || "");

  if (state.winner_seat) {
    nowLog(state, `Reject action ${action}: match already finished.`);
    return { ok: false, state, reason: "match finished" };
  }

  if (action === "cancel_selection") {
    state.selected = null;
    return { ok: true, state };
  }

  if (action === "surrender") {
    surrender(state, seatId);
    return { ok: true, state };
  }

  if (action === "end_turn") {
    const ok = endTurn(state, seatId);
    return { ok, state };
  }

  if (action === "hand_card_clicked") {
    const handIndex = payload.hand_index ?? payload.card_index ?? payload.index;
    const target = getTargetFromPayload(state, payload);
    const ok = playHandCard(state, seatId, Number(handIndex), target);
    return { ok, state };
  }

  if (action === "board_slot_clicked") {
    const target = getTargetFromPayload(state, payload);

    if (state.selected) {
      const ok = handleSelectedTarget(state, seatId, target);
      return { ok, state };
    }

    const ownerSeat = payload.owner_seat || payload.board_owner || payload.target_owner || seatId;
    const boardIndex = payload.board_index ?? payload.unit_index ?? payload.index;

    if (String(ownerSeat) === String(seatId)) {
      const ok = selectAttacker(state, seatId, Number(boardIndex));
      return { ok, state };
    }

    nowLog(state, `Reject board click: enemy unit clicked without selected action.`);
    return { ok: false, state };
  }

  if (action === "player_face_clicked") {
    const ownerSeat = payload.owner_seat || payload.target_owner || payload.player_seat || otherSeat(seatId);
    const target = {
      type: "player",
      owner_seat: String(ownerSeat)
    };

    if (state.selected) {
      const ok = handleSelectedTarget(state, seatId, target);
      return { ok, state };
    }

    nowLog(state, `Reject face click: no selected action.`);
    return { ok: false, state };
  }

  nowLog(state, `Unknown battle action: ${action}`);
  return { ok: false, state, reason: "unknown action" };
}

module.exports = {
  handleBattleAction,
  normalizeStateRuntime,
  startTurn,
  endTurn,
  drawCard,
  playHandCard,
  attackTarget,
  validateTarget,
  validateAttackTarget,
  processDeathQueue,
  processSummonQueue,
  resolveEffect,
  resolveTriggeredAbilities,
  resolveGlobalTrigger
};

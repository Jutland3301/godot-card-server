"use strict";

const C = require("./constants");
const U = require("./utils");
const Costs = require("./costs");

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function addLog(state, message) {
  if (!state) return;

  const text = String(message || "");
  if (!text) return;

  if (!Array.isArray(state.battle_log_messages)) {
    state.battle_log_messages = [];
  }

  if (!Array.isArray(state.log)) {
    state.log = [];
  }

  state.status_message = text;
  state.battle_log_messages.append ? state.battle_log_messages.append(text) : state.battle_log_messages.push(text);
  state.log.push(text);

  while (state.battle_log_messages.length > 80) {
    state.battle_log_messages.shift();
  }

  while (state.log.length > 80) {
    state.log.shift();
  }
}

function normalizeCard(card) {
  if (!card || typeof card !== "object") {
    return null;
  }

  card.card_id = String(card.card_id || card.id || "");
  card.card_name = String(card.card_name || card.name || card.display_name || card.card_id || "Unknown Card");
  card.display_name = String(card.display_name || card.card_name);
  card.card_type = String(card.card_type || card.type || C.CARD_TYPE_SPELL);
  card.cost = asNumber(card.cost, 0);
  card.base_cost = asNumber(card.base_cost, card.cost);
  card.power = asNumber(card.power, 0);
  card.effect_id = String(card.effect_id || C.EFFECT_NONE);
  card.target_type = String(card.target_type || C.TARGET_NONE);
  card.trigger_id = String(card.trigger_id || C.ACTION_NONE);
  card.description = String(card.description || "");
  card.side = String(card.side || C.CARD_SIDE_HUMAN);
  card.image_path = String(card.image_path || "");

  card.attack = asNumber(card.attack, 0);
  card.hp = asNumber(card.hp, 0);
  card.max_hp = asNumber(card.max_hp, card.hp);
  card.base_attack = asNumber(card.base_attack, card.attack);
  card.base_hp = asNumber(card.base_hp, card.max_hp);
  card.armor = asNumber(card.armor, 0);

  card.can_attack = asBoolean(card.can_attack, false);
  card.exhausted = asBoolean(card.exhausted, false);
  card.summoned_this_turn = asBoolean(card.summoned_this_turn, false);
  card.has_attacked_this_turn = asBoolean(card.has_attacked_this_turn, false);
  card.attacks_this_turn = asNumber(card.attacks_this_turn, 0);
  card.max_attacks_per_turn = Math.max(1, asNumber(card.max_attacks_per_turn, 1));
  card.cannot_attack_leader = asBoolean(card.cannot_attack_leader, false);
  card.flying_fortress_prevent_used_this_turn = asBoolean(card.flying_fortress_prevent_used_this_turn, false);

  card.rarity = String(card.rarity || "silver");
  card.tags = normalizeArray(card.tags).map(item => String(item || "")).filter(Boolean);
  card.keywords = normalizeArray(card.keywords).map(item => String(item || "").toLowerCase()).filter(Boolean);
  card.traits = normalizeArray(card.traits).map(item => String(item || "").toLowerCase()).filter(Boolean);
  card.abilities = normalizeArray(card.abilities).map(ability => {
    if (ability && typeof ability === "object") {
      return U.deepClone(ability);
    }

    return ability;
  });

  card.temporary_keywords = normalizeObject(card.temporary_keywords);
  card.once_per_turn_flags = normalizeObject(card.once_per_turn_flags);

  card.attack_sfx = String(card.attack_sfx || "");
  card.defense_sfx = String(card.defense_sfx || "");
  card.play_sfx = String(card.play_sfx || "");
  card.death_sfx = String(card.death_sfx || "");

  if (card.base_attack === 0 && card.attack !== 0) {
    card.base_attack = card.attack;
  }

  if (card.base_hp === 0 && card.max_hp !== 0) {
    card.base_hp = card.max_hp;
  }

  return card;
}

function normalizeCardArray(cards) {
  const result = normalizeArray(cards);

  for (let i = result.length - 1; i >= 0; i--) {
    if (!result[i] || typeof result[i] !== "object") {
      result.splice(i, 1);
      continue;
    }

    normalizeCard(result[i]);
  }

  return result;
}

function getCardLookupId(card) {
  if (!card || typeof card !== "object") return "";

  return String(
    card.card_id ||
    card.cardId ||
    card.id ||
    card.card_name ||
    card.cardName ||
    card.name ||
    card.display_name ||
    ""
  ).trim();
}

function isStalePlaceholderCard(card, canonicalCard) {
  if (!card || !canonicalCard) return false;

  const traits = normalizeArray(card.traits);
  const abilities = normalizeArray(card.abilities);
  const looksLikePlaceholder =
    asNumber(card.cost, 0) === 0 &&
    asNumber(card.attack, 0) === 0 &&
    asNumber(card.hp, 0) <= 1 &&
    asNumber(card.max_hp, card.hp) <= 1 &&
    String(card.description || "") === "" &&
    traits.length <= 0 &&
    abilities.length <= 0;

  const canonicalLooksReal =
    asNumber(canonicalCard.cost, 0) !== asNumber(card.cost, 0) ||
    asNumber(canonicalCard.attack, 0) !== asNumber(card.attack, 0) ||
    asNumber(canonicalCard.max_hp, canonicalCard.hp) !== asNumber(card.max_hp, card.hp) ||
    String(canonicalCard.description || "") !== "" ||
    normalizeArray(canonicalCard.traits).length > 0 ||
    normalizeArray(canonicalCard.abilities).length > 0;

  return looksLikePlaceholder && canonicalLooksReal;
}

function hydrateKnownCard(card, makeCardFromId) {
  if (!card || typeof card !== "object" || typeof makeCardFromId !== "function") {
    return card || null;
  }

  const lookupId = getCardLookupId(card);
  if (!lookupId) return card;

  const canonicalCard = makeCardFromId(lookupId);
  if (!isStalePlaceholderCard(card, canonicalCard)) {
    return card;
  }

  const runtime = {
    can_attack: card.can_attack,
    exhausted: card.exhausted,
    summoned_this_turn: card.summoned_this_turn,
    has_attacked_this_turn: card.has_attacked_this_turn,
    attacks_this_turn: card.attacks_this_turn,
    max_attacks_per_turn: card.max_attacks_per_turn,
    temporary_keywords: U.deepClone(card.temporary_keywords || {}),
    once_per_turn_flags: U.deepClone(card.once_per_turn_flags || {}),
    cursed_after_play_damage: asNumber(card.cursed_after_play_damage, 0),
    cursed_after_attack_damage: asNumber(card.cursed_after_attack_damage, 0),
    cursed_on_draw_damage: asNumber(card.cursed_on_draw_damage, 0),
    death_damage_owner_leader: asNumber(card.death_damage_owner_leader, 0)
  };

  Object.assign(card, U.deepClone(canonicalCard), runtime);
  return normalizeCard(card);
}

function hydrateKnownCardArray(cards, makeCardFromId) {
  const result = normalizeArray(cards);

  for (let i = 0; i < result.length; i++) {
    if (result[i] && typeof result[i] === "object") {
      result[i] = hydrateKnownCard(result[i], makeCardFromId);
    }
  }

  return result;
}

function hydrateKnownCardDefinitions(state, makeCardFromId) {
  if (!state || typeof state !== "object" || typeof makeCardFromId !== "function") {
    return state;
  }

  normalizeState(state);

  for (const player of [state.player1, state.player2]) {
    if (!player) continue;

    player.deck = hydrateKnownCardArray(player.deck, makeCardFromId);
    player.hand = hydrateKnownCardArray(player.hand, makeCardFromId);
    player.board = hydrateKnownCardArray(player.board, makeCardFromId);
    player.graveyard = hydrateKnownCardArray(player.graveyard, makeCardFromId);
    player.phantom_death_history = hydrateKnownCardArray(player.phantom_death_history, makeCardFromId);

    if (player.last_spell_cast && typeof player.last_spell_cast === "object") {
      player.last_spell_cast = hydrateKnownCard(player.last_spell_cast, makeCardFromId);
    }
  }

  if (state.pending_card && typeof state.pending_card === "object") {
    state.pending_card = hydrateKnownCard(state.pending_card, makeCardFromId);
  }

  syncLegacy(state);
  return state;
}

function normalizePlayer(player, fallbackOwnerId = "") {
  if (!player || typeof player !== "object") {
    player = {};
  }

  player.owner_id = String(player.owner_id || fallbackOwnerId || "");
  player.name = String(player.name || player.owner_id || "Player");

  player.hp = asNumber(player.hp, C.STARTING_HP);
  player.max_hp = asNumber(player.max_hp, C.STARTING_HP);
  player.mana = asNumber(player.mana, 0);
  player.max_mana = asNumber(player.max_mana, 0);

  player.deck = normalizeCardArray(player.deck);
  player.hand = normalizeCardArray(player.hand);
  player.board = normalizeCardArray(player.board);
  player.graveyard = normalizeCardArray(player.graveyard);

  player.inflation_counters = asNumber(player.inflation_counters, 0);
  player.scholar_cards_played_this_game = asNumber(player.scholar_cards_played_this_game, 0);
  player.scholar_played_count = asNumber(player.scholar_played_count, player.scholar_cards_played_this_game);

  if (player.scholar_cards_played_this_game <= 0 && player.scholar_played_count > 0) {
    player.scholar_cards_played_this_game = player.scholar_played_count;
  }

  if (player.scholar_played_count <= 0 && player.scholar_cards_played_this_game > 0) {
    player.scholar_played_count = player.scholar_cards_played_this_game;
  }

  player.played_trait_counts = normalizeObject(player.played_trait_counts);
  player.prophecy_ouroboros_active = asBoolean(player.prophecy_ouroboros_active, false);
  player.prophet_zero_cost_used_this_turn = asBoolean(player.prophet_zero_cost_used_this_turn, false);
  player.animal_deaths_this_game = asNumber(player.animal_deaths_this_game, 0);
  player.phantom_death_history = normalizeCardArray(player.phantom_death_history);

  if (player.scholar_cards_played_this_game > 0 && !player.played_trait_counts.scholar) {
    player.played_trait_counts.scholar = player.scholar_cards_played_this_game;
  }

  if (player.last_spell_cast && typeof player.last_spell_cast === "object") {
    normalizeCard(player.last_spell_cast);
  } else {
    player.last_spell_cast = null;
  }

  return player;
}

function normalizeState(state) {
  if (!state || typeof state !== "object") {
    state = {};
  }

  if (!state.player1 && state.players && state.players[C.SEAT_A]) {
    state.player1 = state.players[C.SEAT_A];
  }

  if (!state.player2 && state.players && state.players[C.SEAT_B]) {
    state.player2 = state.players[C.SEAT_B];
  }

  state.player1 = normalizePlayer(state.player1, C.OWNER_PLAYER1);
  state.player2 = normalizePlayer(state.player2, C.OWNER_PLAYER2);

  state.players = {
    [C.SEAT_A]: state.player1,
    [C.SEAT_B]: state.player2
  };

  state.owner_to_seat_id = {
    [C.OWNER_PLAYER1]: C.SEAT_A,
    [C.OWNER_PLAYER2]: C.SEAT_B
  };

  state.seat_to_owner_id = {
    [C.SEAT_A]: C.OWNER_PLAYER1,
    [C.SEAT_B]: C.OWNER_PLAYER2
  };

  state.turn_number = Math.max(1, asNumber(state.turn_number, 1));

  state.turn_seat = String(state.turn_seat || "");
  state.current_player_id = String(state.current_player_id || "");
  state.first_player_seat = String(state.first_player_seat || "");
  state.first_player_id = String(state.first_player_id || "");
  state.first_player_side = String(state.first_player_side || "").toLowerCase();

  if (!state.turn_seat && state.current_player_id) {
    state.turn_seat = U.ownerIdToSeat(state.current_player_id);
  }

  if (!state.turn_seat) {
    state.turn_seat = C.SEAT_A;
  }

  if (!state.current_player_id) {
    state.current_player_id = U.seatToOwnerId(state.turn_seat);
  }

  state.status_message = String(state.status_message || "");
  state.game_over = asBoolean(state.game_over, false);
  state.winner_seat = String(state.winner_seat || "");
  state.loser_seat = String(state.loser_seat || "");

  state.battle_log_messages = normalizeArray(state.battle_log_messages).map(item => String(item || ""));
  state.log = normalizeArray(state.log).map(item => String(item || ""));

  if (state.battle_log_messages.length <= 0 && state.log.length > 0) {
    state.battle_log_messages = state.log.slice();
  }

  if (state.log.length <= 0 && state.battle_log_messages.length > 0) {
    state.log = state.battle_log_messages.slice();
  }

  state.selecting_target = asBoolean(state.selecting_target, false);
  state.selecting_hand_card = asBoolean(state.selecting_hand_card, false);

  state.pending_action_type = String(state.pending_action_type || C.ACTION_NONE);

  if (!state.selecting_target && !state.selecting_hand_card && state.pending_action_type === "") {
    state.pending_action_type = C.ACTION_NONE;
  }

  if (state.pending_card && typeof state.pending_card === "object" && Object.keys(state.pending_card).length > 0) {
    normalizeCard(state.pending_card);
  } else {
    state.pending_card = null;
  }

  state.pending_hand_index = asNumber(state.pending_hand_index, -1);
  state.pending_card_owner = String(state.pending_card_owner || "");
  state.pending_attacker_index = asNumber(state.pending_attacker_index, -1);

  state.selected_attacker_owner = String(state.selected_attacker_owner || "");
  state.selected_attacker_index = asNumber(state.selected_attacker_index, -1);

  state.pending_ability = normalizeObject(state.pending_ability);
  state.selected = state.selected && typeof state.selected === "object" ? state.selected : null;

  state.pending_hand_selection_effect = String(state.pending_hand_selection_effect || "");
  state.pending_hand_selection_owner = String(state.pending_hand_selection_owner || "");
  state.pending_card_selection_owner = String(state.pending_card_selection_owner || state.pending_hand_selection_owner || "");
  state.pending_card_selection_zone = state.pending_card_selection_zone === "graveyard" ? "graveyard" : "hand";
  state.pending_hand_candidate_indexes = normalizeArray(state.pending_hand_candidate_indexes).map(index => asNumber(index, -1)).filter(index => index >= 0);
  state.pending_end_turn_after_hand_selection = asBoolean(state.pending_end_turn_after_hand_selection, false);
  state.pending_end_turn_seat = String(state.pending_end_turn_seat || "");

  state.pending_deaths = normalizeArray(state.pending_deaths);
  state.pending_summons = normalizeArray(state.pending_summons);

  state.turn_time_left = asNumber(state.turn_time_left, C.TURN_TIME_LIMIT_SECONDS);
  state.turn_timer_active = asBoolean(state.turn_timer_active, false);
  state.turn_timer_timeout_handled = asBoolean(state.turn_timer_timeout_handled, false);

  syncLegacyNoNormalize(state);

  return state;
}

function syncLegacyNoNormalize(state) {
  if (!state) return state;

  state.players = {
    [C.SEAT_A]: state.player1,
    [C.SEAT_B]: state.player2
  };

  state.player1.owner_id = C.OWNER_PLAYER1;
  state.player2.owner_id = C.OWNER_PLAYER2;

  if (state.turn_seat === C.SEAT_A || state.turn_seat === C.SEAT_B) {
    state.current_player_id = U.seatToOwnerId(state.turn_seat);
  } else if (state.current_player_id) {
    state.turn_seat = U.ownerIdToSeat(state.current_player_id) || C.SEAT_A;
  } else {
    state.turn_seat = C.SEAT_A;
    state.current_player_id = C.OWNER_PLAYER1;
  }

  if (!Array.isArray(state.battle_log_messages)) {
    state.battle_log_messages = [];
  }

  if (!Array.isArray(state.log)) {
    state.log = [];
  }

  if (state.log.length <= 0 && state.battle_log_messages.length > 0) {
    state.log = state.battle_log_messages.slice();
  }

  if (state.battle_log_messages.length <= 0 && state.log.length > 0) {
    state.battle_log_messages = state.log.slice();
  }

  if (!state.game_over) {
    const p1Hp = asNumber(state.player1.hp, C.STARTING_HP);
    const p2Hp = asNumber(state.player2.hp, C.STARTING_HP);

    if (p1Hp <= 0 && p2Hp <= 0) {
      state.game_over = true;
      state.winner_seat = "";
      state.loser_seat = "";
      state.status_message = "Draw.";
      state.turn_timer_active = false;
    } else if (p1Hp <= 0) {
      markGameOver(state, C.SEAT_B, C.SEAT_A, `${state.player2.name} wins.`);
    } else if (p2Hp <= 0) {
      markGameOver(state, C.SEAT_A, C.SEAT_B, `${state.player1.name} wins.`);
    }
  }

  if (state.game_over) {
    state.turn_timer_active = false;
    state.turn_timer_timeout_handled = true;
  }

  return state;
}

function syncLegacy(state) {
  normalizeState(state);
  return syncLegacyNoNormalize(state);
}

function clearSelection(state) {
  if (!state) return;

  state.selecting_target = false;
  state.selecting_hand_card = false;

  state.pending_action_type = C.ACTION_NONE;

  state.pending_card = null;
  state.pending_hand_index = -1;
  state.pending_card_owner = "";
  state.pending_attacker_index = -1;
  state.pending_ability = {};

  state.selected_attacker_owner = "";
  state.selected_attacker_index = -1;
  state.selected = null;

  state.pending_hand_selection_effect = "";
  state.pending_hand_selection_owner = "";
  state.pending_card_selection_owner = "";
  state.pending_card_selection_zone = "hand";
  state.pending_hand_candidate_indexes = [];
}

function beginTurnBasics(state, seatId) {
  normalizeState(state);

  const activeSeat = seatId || state.turn_seat || C.SEAT_A;
  const player = U.getPlayer(state, activeSeat);

  if (!player) {
    return;
  }

  state.turn_seat = activeSeat;
  state.current_player_id = U.seatToOwnerId(activeSeat);

  clearSelection(state);

  player.prophet_zero_cost_used_this_turn = false;
  player.max_mana = Math.min(C.MAX_MANA, asNumber(player.max_mana, 0) + C.MANA_GAIN_PER_TURN);
  player.mana = player.max_mana;

  for (const unit of player.board) {
    if (!unit) continue;

    unit.summoned_this_turn = false;
    unit.has_attacked_this_turn = false;
    unit.attacks_this_turn = 0;

    if (!unit.once_per_turn_flags || typeof unit.once_per_turn_flags !== "object") {
      unit.once_per_turn_flags = {};
    } else {
      unit.once_per_turn_flags = {};
    }

    if (U.hasEffectiveKeyword(unit, player, C.KEYWORD_IMMOBILE)) {
      unit.can_attack = false;
      unit.exhausted = true;
    } else {
      unit.can_attack = true;
      unit.exhausted = false;
    }
  }

  U.refreshAttackPermissionsForPlayer(player);

  state.turn_time_left = C.TURN_TIME_LIMIT_SECONDS;
  state.turn_timer_active = true;
  state.turn_timer_timeout_handled = false;

  syncLegacy(state);
}

function markGameOver(state, winnerSeat, loserSeat, reason = "") {
  if (!state) return;

  state.game_over = true;
  state.winner_seat = String(winnerSeat || "");
  state.loser_seat = String(loserSeat || "");
  state.status_message = String(reason || "Game over.");

  state.turn_timer_active = false;
  state.turn_timer_timeout_handled = true;
  state.turn_time_left = 0.0;

  state.selecting_target = false;
  state.selecting_hand_card = false;
  state.pending_action_type = C.ACTION_NONE;

  if (reason) {
    addLog(state, reason);
  }
}

function serializeCard(card, owner = null) {
  const normalized = normalizeCard(card);
  if (!normalized) return null;

  const data = {
    card_id: normalized.card_id,
    card_name: normalized.card_name,
    display_name: normalized.display_name,
    card_type: normalized.card_type,
    cost: normalized.cost,
    base_cost: normalized.base_cost,
    current_cost: normalized.cost,
    power: normalized.power,
    attack: normalized.attack,
    hp: normalized.hp,
    max_hp: normalized.max_hp,
    armor: normalized.armor,
    base_attack: normalized.base_attack,
    base_hp: normalized.base_hp,
    effect_id: normalized.effect_id,
    target_type: normalized.target_type,
    trigger_id: normalized.trigger_id,
    description: normalized.description,
    side: normalized.side,
    image_path: normalized.image_path,

    keywords: normalized.keywords.slice(),
    traits: normalized.traits.slice(),
    tags: normalized.tags.slice(),
    abilities: U.deepClone(normalized.abilities),

    can_attack: normalized.can_attack,
    exhausted: normalized.exhausted,
    summoned_this_turn: normalized.summoned_this_turn,
    has_attacked_this_turn: normalized.has_attacked_this_turn,
    attacks_this_turn: normalized.attacks_this_turn,
    max_attacks_per_turn: normalized.max_attacks_per_turn,
    cannot_attack_leader: normalized.cannot_attack_leader,
    flying_fortress_prevent_used_this_turn: normalized.flying_fortress_prevent_used_this_turn,

    temporary_keywords: U.deepClone(normalized.temporary_keywords),
    once_per_turn_flags: U.deepClone(normalized.once_per_turn_flags),

    attack_sfx: normalized.attack_sfx,
    defense_sfx: normalized.defense_sfx,
    play_sfx: normalized.play_sfx,
    death_sfx: normalized.death_sfx
  };

  if (owner) {
    data.play_cost = Costs.getCardPlayCost(owner, normalized);
    data.effective_cost = data.play_cost;
  }

  return data;
}

function serializeCardArray(cards, owner = null) {
  return normalizeArray(cards)
    .map(card => serializeCard(card, owner))
    .filter(card => card !== null);
}

function serializePlayer(player) {
  const normalized = normalizePlayer(player);

  return {
    owner_id: normalized.owner_id,
    name: normalized.name,

    hp: normalized.hp,
    max_hp: normalized.max_hp,
    mana: normalized.mana,
    max_mana: normalized.max_mana,

    deck: serializeCardArray(normalized.deck),
    hand: serializeCardArray(normalized.hand, normalized),
    board: serializeCardArray(normalized.board),
    graveyard: serializeCardArray(normalized.graveyard),

    inflation_counters: normalized.inflation_counters,
    scholar_cards_played_this_game: normalized.scholar_cards_played_this_game,
    scholar_played_count: normalized.scholar_played_count,
    played_trait_counts: U.deepClone(normalized.played_trait_counts),
    prophecy_ouroboros_active: normalized.prophecy_ouroboros_active,
    prophet_zero_cost_used_this_turn: normalized.prophet_zero_cost_used_this_turn,
    animal_deaths_this_game: normalized.animal_deaths_this_game,
    phantom_death_history: serializeCardArray(normalized.phantom_death_history),
    last_spell_cast: normalized.last_spell_cast ? serializeCard(normalized.last_spell_cast) : null
  };
}

function makePublicState(state) {
  normalizeState(state);

  return {
    turn_number: state.turn_number,
    current_player_id: state.current_player_id,
    turn_seat: state.turn_seat,
    first_player_id: state.first_player_id,
    first_player_seat: state.first_player_seat,
    first_player_side: state.first_player_side,

    status_message: state.status_message,
    game_over: state.game_over,
    winner_seat: state.winner_seat,
    loser_seat: state.loser_seat,

    battle_log_messages: state.battle_log_messages.slice(),
    log: state.log.slice(),

    selecting_target: state.selecting_target,
    selecting_hand_card: state.selecting_hand_card,
    pending_action_type: state.pending_action_type,
    pending_attacker_index: state.pending_attacker_index,
    selected_attacker_owner: state.selected_attacker_owner,
    selected_attacker_index: state.selected_attacker_index,

    pending_ability: U.deepClone(state.pending_ability),
    pending_card: state.pending_card ? serializeCard(state.pending_card) : {},

    pending_hand_selection_effect: state.pending_hand_selection_effect,
    pending_hand_selection_owner: state.pending_hand_selection_owner,
    pending_card_selection_owner: state.pending_card_selection_owner,
    pending_card_selection_zone: state.pending_card_selection_zone,
    pending_hand_candidate_indexes: state.pending_hand_candidate_indexes.slice(),
    pending_end_turn_after_hand_selection: state.pending_end_turn_after_hand_selection,
    pending_end_turn_seat: state.pending_end_turn_seat,

    turn_time_left: state.turn_time_left,
    turn_timer_active: state.turn_timer_active,
    turn_timer_timeout_handled: state.turn_timer_timeout_handled,

    player1: serializePlayer(state.player1),
    player2: serializePlayer(state.player2),

    players: {
      [C.SEAT_A]: serializePlayer(state.player1),
      [C.SEAT_B]: serializePlayer(state.player2)
    },

    owner_to_seat_id: U.deepClone(state.owner_to_seat_id),
    seat_to_owner_id: U.deepClone(state.seat_to_owner_id)
  };
}

function isValidGameState(state) {
  if (!state || typeof state !== "object") return false;
  if (!state.player1 || typeof state.player1 !== "object") return false;
  if (!state.player2 || typeof state.player2 !== "object") return false;

  const currentPlayerId = String(state.current_player_id || "");
  if (currentPlayerId && currentPlayerId !== C.OWNER_PLAYER1 && currentPlayerId !== C.OWNER_PLAYER2) {
    return false;
  }

  return true;
}

module.exports = {
  addLog,

  normalizeCard,
  normalizeCardArray,
  hydrateKnownCardDefinitions,
  normalizePlayer,
  normalizeState,
  syncLegacy,

  clearSelection,
  beginTurnBasics,
  markGameOver,

  serializeCard,
  serializeCardArray,
  serializePlayer,
  makePublicState,
  isValidGameState
};

const fs = require("fs");
const path = require("path");

const CARD_LIBRARY_PATH = process.env.CARD_LIBRARY_PATH || path.join(__dirname, "CardLibrary.gd");

const CONSTANTS = {
  CARD_TYPE_SPELL: "spell",
  CARD_TYPE_UNIT: "unit",

  EFFECT_DAMAGE: "damage",
  EFFECT_HEAL: "heal",
  EFFECT_DRAW: "draw",
  EFFECT_UNIT: "unit",
  EFFECT_NONE: "none",
  EFFECT_BUFF_DECK_TRAIT: "buff_deck_trait",
  EFFECT_ADD_KEYWORD: "add_keyword",
  EFFECT_HEAL_ALL_ALLIES_GAIN_MAX_HP: "heal_all_allies_gain_max_hp",
  EFFECT_DESTROY_UNIT: "destroy_unit",
  EFFECT_REDUCE_ENEMY_MAX_HP_THEN_ADD_COPIES: "reduce_enemy_max_hp_then_add_copies",
  EFFECT_ADD_ZERO_COST_COPIES_OF_LAST_SPELL: "add_zero_cost_copies_of_last_spell",
  EFFECT_DRAW_RANDOM_TRAIT_FROM_DECK_INCREASE_COST: "draw_random_trait_from_deck_increase_cost",
  EFFECT_HAP_HAZARD: "hap_hazard",
  EFFECT_DAMAGE_BY_BOARD_TRAIT_COUNT: "damage_by_board_trait_count",
  EFFECT_ADD_KEYWORDS_TO_UNIT: "add_keywords_to_unit",
  EFFECT_RESURRECT_TRAIT_UNITS_FROM_GRAVEYARD: "resurrect_trait_units_from_graveyard",
  EFFECT_TEMPORARY_IMMOBILE_ALL_ENEMY_UNITS: "temporary_immobile_all_enemy_units",
  EFFECT_DESTROY_FRIENDLY_TRAIT_UNIT_COPY_TO_HAND_BUFF: "destroy_friendly_trait_unit_copy_to_hand_buff",
  EFFECT_RETURN_RANDOM_HAND_UNIT_DRAW_ANOTHER_TRAIT_UNIT: "return_random_hand_unit_draw_another_trait_unit",
  EFFECT_MASTERWORK_OF_ART: "masterwork_of_art",
  EFFECT_RUNIC_TUNING: "runic_tuning",
  EFFECT_LAMENTATION_OF_LIFE: "lamentation_of_life",
  EFFECT_INCANTATION_OF_MINSTREL: "incantation_of_minstrel",
  EFFECT_RIME_OF_THE_ANCIENT_MARINER: "rime_of_the_ancient_mariner",
  EFFECT_ENCOMPASSED_COMPASS: "encompassed_compass",
  EFFECT_LIGHTNING_CEREMONY: "lightning_ceremony",
  EFFECT_SCAVENGE_COMMAND: "scavenge_command",
  EFFECT_DUEL_ON_SEA: "duel_on_sea",
  EFFECT_STORM_AND_TIDES: "storm_and_tides",
  EFFECT_CALL_OF_OMEN: "call_of_omen",
  EFFECT_BUFF_ALL_ALLY_UNITS: "buff_all_ally_units",
  EFFECT_POETRY_OF_RESILIENCE: "poetry_of_resilience",
  EFFECT_CONVIVIAL_HUMMING: "convivial_humming",
  EFFECT_NOBLES_OBLIGE: "nobles_oblige",
  EFFECT_ECONOMICS_OVERFLOW: "economics_overflow",
  EFFECT_HUMBLE_LIBRARIAN: "humble_librarian",
  EFFECT_TARNISHED_BOOKSHELF: "tarnished_bookshelf",
  EFFECT_SCRIBE_OF_HISTORY: "scribe_of_history",
  EFFECT_FORBIDDEN_BOOK: "forbidden_book",
  EFFECT_BLIND_RESEARCHER: "blind_researcher",
  EFFECT_ALL_KNOWING_ARCHIVIST: "all_knowing_archivist",
  EFFECT_MONOCHRO_BLUEPRINT: "monochro_blueprint",
  EFFECT_BOOK_OF_RUSHWATER: "book_of_rushwater",
  EFFECT_INTRODUCTION_TO_ARMORY: "introduction_to_armory",
  EFFECT_TRANSCRIBE_OF_THE_WICKED: "transcribe_of_the_wicked",
  
  TARGET_NONE: "none",
  TARGET_FRIENDLY_PLAYER: "friendly_player",
  TARGET_ENEMY_PLAYER: "enemy_player",
  TARGET_ANY_ENEMY: "any_enemy",
  TARGET_ANY_FRIENDLY: "any_friendly",
  TARGET_ANY: "any",
  TARGET_ENEMY_UNIT: "enemy_unit",
  TARGET_ANY_UNIT: "any_unit",
  TARGET_HAND_SCHOLAR: "NONE",
  TARGET_FRIENDLY_UNIT: "friendly_unit",
  TARGET_ANY_PLAYER: "any_player",
  
  ACTION_ABILITY: "ability",
  ACTION_NONE: "none",
  ACTION_SPELL: "spell",
  ACTION_UNIT_ATTACK: "unit_attack",
  ACTION_HAND_SELECTION: "hand_selection",

  KEYWORD_TAUNT: "taunt",
  KEYWORD_RUSH: "rush",
  KEYWORD_HASTE: "haste",
  KEYWORD_IMMOBILE: "immobile",
  KEYWORD_UNTRICKABLE: "untrickable",
  KEYWORD_INVINCIBLE: "invincible",
  KEYWORD_RICOCHET: "ricochet",
  KEYWORD_DEADLY: "deadly",
  
  ABILITY_EFFECT_DAMAGE: "damage",
  ABILITY_TARGET_ANY: "any",
  ABILITY_EFFECT_BUFF_TRAIT: "buff_trait",
  ABILITY_TARGET_FRIENDLY_UNITS_WITH_TRAIT: "friendly_units_with_trait",
  ABILITY_EFFECT_GRANT_KEYWORDS_TO_TRAIT: "grant_keywords_to_trait",
  ABILITY_EFFECT_DRAW: "draw",
  ABILITY_TARGET_ALL_ENEMY_UNITS: "all_enemy_units",
  ABILITY_EFFECT_BUFF_RANDOM_HAND_TRAIT: "buff_random_hand_trait",
  ABILITY_TARGET_RANDOM_HAND_UNIT_WITH_TRAIT: "random_hand_unit_with_trait",
  ABILITY_EFFECT_SPELL_DAMAGE_BONUS: "spell_damage_bonus",
  ABILITY_TARGET_FRIENDLY_DAMAGE_SPELLS: "friendly_damage_spells",
  ABILITY_EFFECT_DRAW_RANDOM_SPELL_FROM_DECK: "draw_random_spell_from_deck",
  ABILITY_EFFECT_MODIFY_HAND_COST_BY_TRAIT: "modify_hand_cost_by_trait",
  ABILITY_EFFECT_BUFF_OTHER_FRIENDLY_TRAIT_UNITS: "buff_other_friendly_trait_units",
  ABILITY_TARGET_FRIENDLY_CARDS_IN_HAND_WITH_TRAIT: "friendly_cards_in_hand_with_trait",
  ABILITY_EFFECT_DAMAGE_RANDOM_ENEMY_UNIT_OR_FACE: "damage_random_enemy_unit_or_face",
  ABILITY_EFFECT_SUMMON_CARDS: "summon_cards",
  ABILITY_EFFECT_DESTROY_LOWEST_HEALTH_ENEMY_UNIT: "destroy_lowest_health_enemy_unit",
  ABILITY_EFFECT_DESTROY_FRIENDLY_UNIT_GAIN_STATS: "destroy_friendly_unit_gain_stats",
  ABILITY_EFFECT_DAMAGE_ENEMY_LEADER_ON_ALLY_ATTACK: "damage_enemy_leader_on_ally_attack",
  ABILITY_EFFECT_REMOVE_IMMOBILE_SET_ATTACK_FOR_TRAIT: "remove_immobile_set_attack_for_trait",
  ABILITY_EFFECT_RETURN_RANDOM_HAND_TRAIT_CARD_THEN_DAMAGE_ALL_ENEMY_UNITS: "return_random_hand_trait_card_then_damage_all_enemy_units",
  ABILITY_EFFECT_DESTROY_ENEMY_UNIT_AND_HEAL_LEADER: "destroy_enemy_unit_and_heal_leader",
  ABILITY_EFFECT_GAIN_ATTACK_FROM_ALLIED_TRAIT_ATTACK_TOTAL: "gain_attack_from_allied_trait_attack_total",
  ABILITY_EFFECT_DAMAGE_PLAYED_UNIT: "damage_played_unit",
  ABILITY_EFFECT_BUFF_ATTACKER: "buff_attacker",
  ABILITY_EFFECT_HEAL_DAMAGED_ALLY_GADGET_AND_DAMAGE_ENEMY_LEADER: "heal_damaged_ally_gadget_and_damage_enemy_leader",
  ABILITY_EFFECT_BUFF_SELF: "buff_self",
  ABILITY_EFFECT_REDUCE_HAND_SPELL_COST: "reduce_hand_spell_cost",
  ABILITY_EFFECT_BURN_SPELL_FROM_HAND_THEN_BUFF_SELF: "burn_spell_from_hand_then_buff_self",
  ABILITY_EFFECT_ADD_COPIES_TO_DECK: "add_copies_to_deck",
  ABILITY_EFFECT_LOSE_STATS_FOR_OTHER_ALLY_UNITS: "lose_stats_for_other_ally_units",
  ABILITY_EFFECT_REMOVE_KEYWORDS_FROM_PLAYED_UNIT: "remove_keywords_from_played_unit",
  ABILITY_EFFECT_DRAW_RANDOM_TRAIT_UNIT_FROM_DECK: "draw_random_trait_unit_from_deck",
  ABILITY_EFFECT_GAIN_MANA: "gain_mana",
  ABILITY_EFFECT_COPY_SELF_TO_BOARD: "copy_self_to_board",
  ABILITY_EFFECT_DRAW_CARD_THAT_COSTS_MORE: "draw_card_that_costs_more",
  ABILITY_EFFECT_ADD_CARD_TO_HAND: "add_card_to_hand",
  ABILITY_EFFECT_LOOK_TOP_DECK_KEEP_OR_BOTTOM: "look_top_deck_keep_or_bottom",
  ABILITY_EFFECT_GAIN_TEMPORARY_KEYWORD: "gain_temporary_keyword",
  ABILITY_EFFECT_ADD_CARD_TO_HAND_IF_TRAIT_PLAYED_COUNT: "add_card_to_hand_if_trait_played_count",
  ABILITY_EFFECT_SUMMON_THREE_KEYWORD_COPIES: "summon_three_keyword_copies",
  ABILITY_EFFECT_DESTROY_ALL_OTHER_UNITS_AND_FULL_HEAL_LEADER: "destroy_all_other_units_and_full_heal_leader",
  ABILITY_EFFECT_REMOVE_KEYWORD_THEN_BUFF_SELF: "remove_keyword_then_buff_self",
  ABILITY_EFFECT_DEBUFF_ATTACKER: "debuff_attacker",

  ABILITY_TARGET_ANY_ENEMY: "any_enemy",
  ABILITY_TARGET_ANY_FRIENDLY: "any_friendly",
  ABILITY_TARGET_ENEMY_PLAYER: "enemy_player",
  ABILITY_TARGET_FRIENDLY_PLAYER: "friendly_player",
  ABILITY_TARGET_ENEMY_UNIT: "enemy_unit",
  ABILITY_TARGET_FRIENDLY_UNIT: "friendly_unit",
  ABILITY_TARGET_ANY_UNIT: "any_unit",
  ABILITY_TARGET_ANY_PLAYER: "any_player",
  ABILITY_TARGET_FRIENDLY_SPELLS_IN_HAND: "friendly_spells_in_hand",
  ABILITY_CONDITION_TARGET_WAS_FRIENDLY: "target_was_friendly",
  
  TRIGGER_ON_ALLY_UNIT_ATTACK: "on_ally_unit_attack",
  TRIGGER_ON_ALLY_UNIT_DAMAGED: "on_ally_unit_damaged",
  TRIGGER_AURA: "aura",
  TRIGGER_ON_UNIT_PLAYED: "on_unit_played",
  TRIGGER_BATTLECRY: "battlecry",
  TRIGGER_WHEN_KILLS: "when_kills",
  TRIGGER_WHEN_DESTROYED: "when_destroyed",
  TRIGGER_TURN_END: "turn_end",
  TRIGGER_TURN_START: "turn_start",
  TRIGGER_TURN_END: "turn_end",
  TRIGGER_ON_SPELL_PLAYED: "on_spell_played",
  TRIGGER_WHEN_ATTACKED: "when_attacked",
  TRIGGER_ON_DESTROY_TARGET: "on_destroy_target",
  TRIGGER_SPELL_EFFECT: "spell_effect",
  
  CARD_SIDE_HUMAN: "human",
  CARD_SIDE_GOD: "god",
  CARD_SIDE_NEUTRAL: "neutral"
};

let cachedDatabase = null;

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stripGDScriptComments(source) {
  const lines = String(source || "").split(/\r?\n/);

  return lines.map((line) => {
    let inString = false;
    let escaped = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === "\\") {
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (!inString && ch === "#") {
        return line.slice(0, i);
      }
    }

    return line;
  }).join("\n");
}

function findMatchingBrace(source, openBraceIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = openBraceIndex; i < source.length; i++) {
    const ch = source[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (ch === "{") {
      depth += 1;
      continue;
    }

    if (ch === "}") {
      depth -= 1;

      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function extractCardAssignments(source) {
  const assignments = [];
  const pattern = /card_database\["([^"]+)"\]\s*=\s*\{/g;
  let match = null;

  while ((match = pattern.exec(source)) !== null) {
    const cardId = match[1];
    const openBraceIndex = source.indexOf("{", match.index);
    const closeBraceIndex = findMatchingBrace(source, openBraceIndex);

    if (closeBraceIndex < 0) {
      throw new Error("Could not find closing brace for card_id: " + cardId);
    }

    const objectText = source.slice(openBraceIndex, closeBraceIndex + 1);

    assignments.push({
      cardId,
      objectText
    });

    pattern.lastIndex = closeBraceIndex + 1;
  }

  return assignments;
}

function replaceConstantsOutsideStrings(source) {
  let result = "";
  let token = "";
  let inString = false;
  let escaped = false;

  function flushToken() {
    if (!token) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(CONSTANTS, token)) {
      result += JSON.stringify(CONSTANTS[token]);
    } else if (token === "true" || token === "false" || token === "null") {
      result += token;
    } else {
      result += token;
    }

    token = "";
  }

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (inString) {
      result += ch;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === "\\") {
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = false;
      }

      continue;
    }

    if (ch === '"') {
      flushToken();
      inString = true;
      result += ch;
      continue;
    }

    if (/^[A-Za-z0-9_]$/.test(ch)) {
      token += ch;
      continue;
    }

    flushToken();
    result += ch;
  }

  flushToken();

  return result;
}

function parseGDScriptDictionary(objectText, cardId) {
  const withoutComments = stripGDScriptComments(objectText);
  const converted = replaceConstantsOutsideStrings(withoutComments);

  try {
    return Function("'use strict'; return (" + converted + ");")();
  } catch (error) {
    throw new Error("Failed to parse card_id " + cardId + ": " + error.message + "\n" + converted);
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item || "")).filter(Boolean);
}

function normalizeAbilityArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return deepClone(value);
}

function normalizeCardDefinition(cardId, rawData) {
  const data = rawData && typeof rawData === "object" ? rawData : {};
  const cardType = String(data.type || "spell");
  const attack = Number(data.attack || 0);
  const hp = Number(data.hp || 0);

  return {
    card_id: String(cardId || ""),
    name: String(data.name || cardId || ""),
    type: cardType,
    cost: Number(data.cost || 0),
    power: Number(data.power || 0),
    effect_id: String(data.effect_id || "none"),
    target_type: String(data.target_type || "none"),
    description: String(data.description || ""),
    side: String(data.side || "human"),
    image_path: String(data.image_path || ""),

    attack,
    hp,
    max_hp: Number(data.max_hp || hp),
    base_attack: Number(data.base_attack || attack),
    base_hp: Number(data.base_hp || hp),
    armor: Number(data.armor || 0),
    max_attacks_per_turn: Number(data.max_attacks_per_turn || 1),

    keywords: normalizeStringArray(data.keywords),
    tags: normalizeStringArray(data.tags),
    traits: normalizeStringArray(data.traits),
    abilities: normalizeAbilityArray(data.abilities),

    attack_sfx: String(data.attack_sfx || ""),
    defense_sfx: String(data.defense_sfx || ""),
    play_sfx: String(data.play_sfx || ""),
    death_sfx: String(data.death_sfx || "")
  };
}

function loadCardDatabaseFromFile(filePath = CARD_LIBRARY_PATH) {
  if (!fs.existsSync(filePath)) {
    throw new Error("CardLibrary.gd not found: " + filePath);
  }

  const source = fs.readFileSync(filePath, "utf8");
  const assignments = extractCardAssignments(source);
  const database = {};

  for (const assignment of assignments) {
    const rawData = parseGDScriptDictionary(assignment.objectText, assignment.cardId);
    database[assignment.cardId] = normalizeCardDefinition(assignment.cardId, rawData);
  }

  return database;
}

function getCardDatabase() {
  if (cachedDatabase === null) {
    cachedDatabase = loadCardDatabaseFromFile(CARD_LIBRARY_PATH);
    console.log("[CARD DB] loaded", Object.keys(cachedDatabase).length, "cards from", CARD_LIBRARY_PATH);
  }

  return cachedDatabase;
}

function reloadCardDatabase() {
  cachedDatabase = loadCardDatabaseFromFile(CARD_LIBRARY_PATH);
  console.log("[CARD DB] reloaded", Object.keys(cachedDatabase).length, "cards from", CARD_LIBRARY_PATH);
  return cachedDatabase;
}

function getCardDefinition(cardId) {
  const cleanCardId = String(cardId || "").trim();
  const database = getCardDatabase();

  if (!Object.prototype.hasOwnProperty.call(database, cleanCardId)) {
    return null;
  }

  return database[cleanCardId];
}

function hasCardDefinition(cardId) {
  return getCardDefinition(cardId) !== null;
}

function getAvailableCardIds() {
  return Object.keys(getCardDatabase());
}

function makeCardFromId(cardId) {
  const cleanCardId = String(cardId || "").trim();
  const data = getCardDefinition(cleanCardId);

  if (!data) {
    console.log("[CARD DB] Unknown card_id:", cleanCardId);

    return {
      card_id: cleanCardId,
      card_name: cleanCardId,
      display_name: cleanCardId,
      cost: 0,
      power: 0,
      card_type: "unit",
      target_type: "none",
      effect_id: "none",
      trigger_id: "none",
      description: "",

      attack: 0,
      hp: 1,
      max_hp: 1,
      armor: 0,
      base_attack: 0,
      base_hp: 1,

      side: "neutral",
      traits: [],
      keywords: [],
      tags: [],
      abilities: [],

      can_attack: false,
      exhausted: true,
      summoned_this_turn: false,
      has_attacked_this_turn: false,
      attacks_this_turn: 0,
      max_attacks_per_turn: 1,

      temporary_keywords: {},
      once_per_turn_flags: {},

      attack_sfx: "",
      defense_sfx: "",
      play_sfx: "",
      death_sfx: ""
    };
  }

  const attack = Number(data.attack || 0);
  const hp = Number(data.hp || 0);

  return {
    card_id: cleanCardId,
    card_name: String(data.name || cleanCardId),
    display_name: String(data.name || cleanCardId),
    cost: Number(data.cost || 0),
    power: Number(data.power || 0),
    card_type: String(data.type || "spell"),
    target_type: String(data.target_type || "none"),
    effect_id: String(data.effect_id || "none"),
    trigger_id: String(data.trigger_id || "none"),
    description: String(data.description || ""),

    attack,
    hp,
    max_hp: Number(data.max_hp || hp),
    armor: Number(data.armor || 0),
    base_attack: Number(data.base_attack || attack),
    base_hp: Number(data.base_hp || hp),

    side: String(data.side || "human"),
    traits: normalizeStringArray(data.traits),
    keywords: normalizeStringArray(data.keywords),
    tags: normalizeStringArray(data.tags),
    abilities: normalizeAbilityArray(data.abilities),

    can_attack: false,
    exhausted: true,
    summoned_this_turn: false,
    has_attacked_this_turn: false,
    attacks_this_turn: 0,
    max_attacks_per_turn: Number(data.max_attacks_per_turn || 1),

    temporary_keywords: {},
    once_per_turn_flags: {},

    attack_sfx: String(data.attack_sfx || ""),
    defense_sfx: String(data.defense_sfx || ""),
    play_sfx: String(data.play_sfx || ""),
    death_sfx: String(data.death_sfx || "")
  };
}

module.exports = {
  CONSTANTS,
  CARD_LIBRARY_PATH,
  getCardDatabase,
  reloadCardDatabase,
  getCardDefinition,
  hasCardDefinition,
  getAvailableCardIds,
  makeCardFromId,
  loadCardDatabaseFromFile
};

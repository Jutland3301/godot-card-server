extends Node
class_name CardLibrary

const CARD_TYPE_SPELL := "spell"
const CARD_TYPE_UNIT := "unit"

const EFFECT_DAMAGE := "damage"
const EFFECT_HEAL := "heal"
const EFFECT_DRAW := "draw"
const EFFECT_UNIT := "unit"
const EFFECT_NONE := "none"
const EFFECT_BUFF_DECK_TRAIT := "buff_deck_trait"
const EFFECT_ADD_KEYWORD := "add_keyword"
const EFFECT_HEAL_ALL_ALLIES_GAIN_MAX_HP := "heal_all_allies_gain_max_hp"
const EFFECT_DESTROY_UNIT := "destroy_unit"
const EFFECT_REDUCE_ENEMY_MAX_HP_THEN_ADD_COPIES := "reduce_enemy_max_hp_then_add_copies"
const EFFECT_ADD_ZERO_COST_COPIES_OF_LAST_SPELL := "add_zero_cost_copies_of_last_spell"
const EFFECT_DRAW_RANDOM_TRAIT_FROM_DECK_INCREASE_COST := "draw_random_trait_from_deck_increase_cost"
const EFFECT_HAP_HAZARD := "hap_hazard"
const EFFECT_DAMAGE_BY_BOARD_TRAIT_COUNT := "damage_by_board_trait_count"
const EFFECT_ADD_KEYWORDS_TO_UNIT := "add_keywords_to_unit"
const EFFECT_RESURRECT_TRAIT_UNITS_FROM_GRAVEYARD := "resurrect_trait_units_from_graveyard"
const EFFECT_TEMPORARY_IMMOBILE_ALL_ENEMY_UNITS := "temporary_immobile_all_enemy_units"
const EFFECT_DESTROY_FRIENDLY_TRAIT_UNIT_COPY_TO_HAND_BUFF := "destroy_friendly_trait_unit_copy_to_hand_buff"
const EFFECT_RETURN_RANDOM_HAND_UNIT_DRAW_ANOTHER_TRAIT_UNIT := "return_random_hand_unit_draw_another_trait_unit"
const EFFECT_MASTERWORK_OF_ART := "masterwork_of_art"
const EFFECT_RUNIC_TUNING := "runic_tuning"
const EFFECT_LAMENTATION_OF_LIFE := "lamentation_of_life"
const EFFECT_INCANTATION_OF_MINSTREL := "incantation_of_minstrel"
const EFFECT_RIME_OF_THE_ANCIENT_MARINER := "rime_of_the_ancient_mariner"
const EFFECT_ENCOMPASSED_COMPASS := "encompassed_compass"
const EFFECT_LIGHTNING_CEREMONY := "lightning_ceremony"
const EFFECT_SCAVENGE_COMMAND := "scavenge_command"
const EFFECT_DUEL_ON_SEA := "duel_on_sea"
const EFFECT_STORM_AND_TIDES := "storm_and_tides"
const EFFECT_CALL_OF_OMEN := "call_of_omen"
const EFFECT_BUFF_ALL_ALLY_UNITS := "buff_all_ally_units"
const EFFECT_POETRY_OF_RESILIENCE := "poetry_of_resilience"
const EFFECT_CONVIVIAL_HUMMING := "convivial_humming"
const EFFECT_RAISE_THE_ANCHOR := "raise_the_anchor"
const EFFECT_SYMPHONIC_ILLUSION := "symphonic_illusion"
const EFFECT_THE_TALE_OF_BRAVERY := "the_tale_of_bravery"
const EFFECT_PROPHECY_OUROBOROS := "prophecy_ouroboros"

const TARGET_NONE := "none"
const TARGET_FRIENDLY_PLAYER := "friendly_player"
const TARGET_ENEMY_PLAYER := "enemy_player"
const TARGET_ANY_ENEMY := "any_enemy"
const TARGET_ANY_FRIENDLY := "any_friendly"
const TARGET_ANY := "any"
const TARGET_ENEMY_UNIT := "enemy_unit"
const TARGET_ANY_UNIT := "any_unit"
const TARGET_HAND_SCHOLAR := "NONE"
const ACTION_ABILITY := "ability"

const ABILITY_EFFECT_DAMAGE := "damage"
const ABILITY_TARGET_ANY := "any"
const ABILITY_EFFECT_BUFF_TRAIT := "buff_trait"
const ABILITY_TARGET_FRIENDLY_UNITS_WITH_TRAIT := "friendly_units_with_trait"
const ABILITY_EFFECT_GRANT_KEYWORDS_TO_TRAIT := "grant_keywords_to_trait"
const ABILITY_EFFECT_DRAW := "draw"
const ABILITY_TARGET_ALL_ENEMY_UNITS := "all_enemy_units"
const ABILITY_EFFECT_BUFF_RANDOM_HAND_TRAIT := "buff_random_hand_trait"
const ABILITY_TARGET_RANDOM_HAND_UNIT_WITH_TRAIT := "random_hand_unit_with_trait"
const ABILITY_EFFECT_SPELL_DAMAGE_BONUS := "spell_damage_bonus"
const ABILITY_TARGET_FRIENDLY_DAMAGE_SPELLS := "friendly_damage_spells"
const ABILITY_EFFECT_DRAW_RANDOM_SPELL_FROM_DECK := "draw_random_spell_from_deck"
const ABILITY_EFFECT_MODIFY_HAND_COST_BY_TRAIT := "modify_hand_cost_by_trait"
const ABILITY_EFFECT_BUFF_OTHER_FRIENDLY_TRAIT_UNITS := "buff_other_friendly_trait_units"
const ABILITY_TARGET_FRIENDLY_CARDS_IN_HAND_WITH_TRAIT := "friendly_cards_in_hand_with_trait"
const ABILITY_EFFECT_DAMAGE_RANDOM_ENEMY_UNIT_OR_FACE := "damage_random_enemy_unit_or_face"
const ABILITY_EFFECT_SUMMON_CARDS := "summon_cards"
const ABILITY_EFFECT_DESTROY_LOWEST_HEALTH_ENEMY_UNIT := "destroy_lowest_health_enemy_unit"
const ABILITY_EFFECT_DESTROY_FRIENDLY_UNIT_GAIN_STATS := "destroy_friendly_unit_gain_stats"
const ABILITY_EFFECT_DAMAGE_ENEMY_LEADER_ON_ALLY_ATTACK := "damage_enemy_leader_on_ally_attack"
const ABILITY_EFFECT_REMOVE_IMMOBILE_SET_ATTACK_FOR_TRAIT := "remove_immobile_set_attack_for_trait"
const ABILITY_EFFECT_RETURN_RANDOM_HAND_TRAIT_CARD_THEN_DAMAGE_ALL_ENEMY_UNITS := "return_random_hand_trait_card_then_damage_all_enemy_units"
const ABILITY_EFFECT_DESTROY_ENEMY_UNIT_AND_HEAL_LEADER := "destroy_enemy_unit_and_heal_leader"
const ABILITY_EFFECT_GAIN_ATTACK_FROM_ALLIED_TRAIT_ATTACK_TOTAL := "gain_attack_from_allied_trait_attack_total"
const ABILITY_EFFECT_DAMAGE_PLAYED_UNIT := "damage_played_unit"
const ABILITY_EFFECT_BUFF_ATTACKER := "buff_attacker"
const ABILITY_EFFECT_HEAL_DAMAGED_ALLY_GADGET_AND_DAMAGE_ENEMY_LEADER := "heal_damaged_ally_gadget_and_damage_enemy_leader"

const TRIGGER_ON_ALLY_UNIT_ATTACK := "on_ally_unit_attack"
const TRIGGER_ON_ALLY_UNIT_DAMAGED := "on_ally_unit_damaged"
const TRIGGER_AURA := "aura"
const TRIGGER_ON_UNIT_PLAYED := "on_unit_played"
const TRIGGER_BATTLECRY := "battlecry"
const TRIGGER_WHEN_KILLS := "when_kills"
const TRIGGER_WHEN_DESTROYED := "when_destroyed"
const TRIGGER_TURN_END := "turn_end"

const CARD_SIDE_HUMAN := "human"
const CARD_SIDE_GOD := "god"
const CARD_SIDE_NEUTRAL := "neutral"

var card_database: Dictionary = {}

var temporary_keywords: Dictionary = {}

func _ready() -> void:
	load_card_database()

func load_card_database() -> void:
	card_database.clear()

	card_database["slash"] = {
		"name": "Slash",
		"type": CARD_TYPE_SPELL,
		"cost": 1,
		"power": 2,
		"effect_id": EFFECT_DAMAGE,
		"target_type": TARGET_ANY_ENEMY,
		"description": "Deal 2 damage.",
		"attack": 0,
		"hp": 0,
		"keywords": [],
		"tags": ["basic"],
		"image_path": "res://Arts/CardImages/Slash.png"
	}

	card_database["fireball"] = {
		"name": "Fireball",
		"type": CARD_TYPE_SPELL,
		"cost": 2,
		"power": 4,
		"effect_id": EFFECT_DAMAGE,
		"target_type": TARGET_ANY_ENEMY,
		"description": "Deal 4 damage.",
		"attack": 0,
		"hp": 0,
		"keywords": [],
		"tags": ["basic"],
		"image_path": "res://Arts/CardImages/Fireball.png"
	}

	card_database["heal"] = {
		"name": "Heal",
		"type": CARD_TYPE_SPELL,
		"cost": 1,
		"power": 3,
		"effect_id": EFFECT_HEAL,
		"target_type": TARGET_ANY_FRIENDLY,
		"description": "Restore 3 health.",
		"attack": 0,
		"hp": 0,
		"keywords": [],
		"tags": ["basic"],
		"image_path": "res://Arts/CardImages/Heal.png"
	}

	card_database["insight"] = {
		"name": "Insight",
		"type": CARD_TYPE_SPELL,
		"cost": 2,
		"power": 2,
		"effect_id": EFFECT_DRAW,
		"target_type": TARGET_FRIENDLY_PLAYER,
		"description": "Draw 2 cards.",
		"attack": 0,
		"hp": 0,
		"keywords": [],
		"tags": ["basic"],
		"image_path": "res://Arts/CardImages/Insight.png"
	}

	card_database["Novice Soldier"] = {
		"name": "Novice Soldier",
		"type": CARD_TYPE_UNIT,
		"cost": 1,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "A basic unit.",
		"attack": 1,
		"hp": 2,
		"keywords": [],
		"tags": ["basic"],
		"traits": ["soldier"],
		"attack_sfx": "slash_hit",
		"defense_sfx": "shield_hit",
		"image_path": "res://Arts/CardImages/NoviceSoldier.png"
	}

	card_database["guardian"] = {
		"name": "Guardian",
		"type": CARD_TYPE_UNIT,
		"cost": 2,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "A sturdy unit.",
		"attack": 2,
		"hp": 3,
		"keywords": [],
		"tags": ["basic"],
		"traits": ["soldier"],
		"image_path": "res://Arts/CardImages/Guardian.png"
	}

	card_database["quick_blade"] = {
		"name": "Quick Blade",
		"type": CARD_TYPE_UNIT,
		"cost": 3,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Rush.",
		"attack": 2,
		"hp": 1,
		"keywords": ["rush"],
		"tags": ["basic"],
		"image_path": "res://Arts/CardImages/QuickBlade.png"
	}
	card_database["stone_wall_guard"] = {
		"name": "Stone Wall Guard",
		"type": CARD_TYPE_UNIT,
		"cost": 4,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Taunt. Enemy units must attack this before non-Taunt targets.",
		"attack": 4,
		"hp": 4,
		"keywords": ["taunt"],
		"tags": ["basic", "defender"],
		"traits": ["soldier"],
		"image_path": "res://Arts/CardImages/StoneWallGuard.png"
	}

	card_database["spark_mage"] = {
		"name": "Spark Mage",
		"type": CARD_TYPE_UNIT,
		"cost": 3,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Battlecry: Deal 2 damage to any target.",
		"attack": 2,
		"hp": 2,
		"keywords": [],
		"tags": ["basic", "battlecry"],
		"traits":["mage"],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"trigger": "battlecry",
				"effect": "damage",
				"target": "any",
				"amount": 2
			}
		],
		"image_path": "res://Arts/CardImages/SparkMage.png"
	}

	card_database["swift_raider"] = {
		"name": "Swift Raider",
		"type": CARD_TYPE_UNIT,
		"cost": 4,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Haste. Can attack enemy units on the turn it is summoned.",
		"attack": 3,
		"hp": 5,
		"keywords": ["haste"],
		"tags": ["basic", "attacker"],
		"image_path": "res://Arts/CardImages/SwiftRaider.png"
	}
	card_database["battalion_captain"] = {
		"name": "Battalion Captain",
		"type": CARD_TYPE_UNIT,
		"cost": 4,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Battlecry: Give all Soldier units +1/+1 and Taunt.",
		"attack": 1,
		"hp": 1,
		"keywords": [],
		"tags": ["basic", "buffer", "battlecry"],
		"traits": ["soldier"],
		"abilities": [
			{
				"trigger": "battlecry",
				"effect": "buff_trait",
				"target": "friendly_units_with_trait",
				"trait": "soldier",
				"attack": 1,
				"hp": 1,
				"keywords": ["taunt"]
			}
		],
		"image_path": "res://Arts/CardImages/BattalionCaptain.png"
	}
	card_database["tiny_commander"] = {
		"name": "Tiny Commander",
		"type": CARD_TYPE_UNIT,
		"cost": 6,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Aura: All friendly Soldier units have Haste and Untrickable.",
		"attack": 3,
		"hp": 4,
		"keywords": [],
		"tags": ["basic", "commander", "aura"],
		"traits": ["soldier"],
		"abilities": [
			{
				"trigger": "aura",
				"effect": "grant_keywords_to_trait",
				"target": "friendly_units_with_trait",
				"trait": "soldier",
				"keywords": ["haste", "untrickable"]
			}
		],
		"image_path": "res://Arts/CardImages/TinyCommander.png"
	}
	card_database["armored_knight"] = {
		"name": "Armored Knight",
		"type": CARD_TYPE_UNIT,
		"cost": 3,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Armored 1",
		"attack": 3,
		"hp": 2,
		"armor": 1,
		"keywords": [],
		"tags": ["basic", "defender", "armored"],
		"traits": ["soldier"],
		"image_path": "res://Arts/CardImages/ArmoredKnight.png"
	}
	card_database["shy_sharpshooter"] = {
		"name": "Shy Sharpshooter",
		"type": CARD_TYPE_UNIT,
		"cost": 2,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Ricochet. When this attacks a unit, deal the actual damage dealt to that unit to the enemy leader.",
		"attack": 2,
		"hp": 1,
		"armor": 0,
		"keywords": ["ricochet"],
		"tags": ["basic", "attacker"],
		"traits": ["soldier"],
		"image_path": "res://Arts/CardImages/ShySharpshooter.png"
	}

	card_database["archery_lessons"] = {
		"name": "Archery Lessons",
		"type": CARD_TYPE_SPELL,
		"cost": 2,
		"power": 0,
		"effect_id": EFFECT_ADD_KEYWORD,
		"target_type": TARGET_ANY_FRIENDLY,
		"description": "Give a friendly Soldier unit Ricochet.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "training"],
		"traits": [],
		"abilities": [
			{
				"effect": "add_keyword",
				"target": "friendly_unit_with_trait",
				"trait": "soldier",
				"keyword": "ricochet"
			}
		],
		"image_path": "res://Arts/CardImages/ArcheryLesson.png"
	}
	card_database["royal_strategist"] = {
		"name": "Royal Strategist",
		"type": CARD_TYPE_UNIT,
		"cost": 3,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Once per turn, whenever another Soldier is played, draw a card.",
		"attack": 1,
		"hp": 3,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "engine"],
		"traits": ["soldier"],
		"abilities": [
			{
				"trigger": "on_unit_played",
				"effect": "draw",
				"trait": "soldier",
				"amount": 1,
				"include_self": false,
				"only_friendly": true,
				"once_per_turn": true
			}
		],
		"image_path": "res://Arts/CardImages/RoyalStrategist.png"
	}
	card_database["absolute_loyalty"] = {
		"name": "Absolute Loyalty",
		"type": CARD_TYPE_SPELL,
		"cost": 6,
		"power": 0,
		"effect_id": EFFECT_BUFF_DECK_TRAIT,
		"target_type": TARGET_NONE,
		"description": "Give all Soldier units in your deck +X/+X. X is the number of Soldier units on your field.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "buff"],
		"traits": [],
		"abilities": [
			{
				"effect": "buff_deck_trait",
				"trait": "soldier",
				"attack": 1,
				"hp": 1
			}
		],
		"image_path": "res://Arts/CardImages/AbsoluteLoyalty.png"
	}
	card_database["royal_guard"] = {
		"name": "The Royal Guard",
		"type": CARD_TYPE_UNIT,
		"cost": 7,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Armor 2. Taunt. Immobile.",
		"attack": 8,
		"hp": 8,
		"armor": 2,
		"keywords": ["taunt", "immobile"],
		"tags": ["basic", "defender"],
		"traits": ["soldier"],
		"image_path": "res://Arts/CardImages/RoyalGuard.png"
	}
	card_database["magic_missiles"] = {
		"name": "Magic Missiles",
		"type": CARD_TYPE_SPELL,
		"cost": 1,
		"power": 1,
		"effect_id": EFFECT_DAMAGE,
		"target_type": TARGET_ENEMY_UNIT,
		"description": "Deal 1 damage to an enemy unit. When it kills, deal 1 damage to all enemy units.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "damage"],
		"traits": [],
		"abilities": [
			{
				"trigger": "when_kills",
				"effect": "damage",
				"target": "all_enemy_units",
				"amount": 1
			}
		],
		"image_path": "res://Arts/CardImages/MagicMissles.png"
	}
	card_database["natures_decision"] = {
		"name": "The Nature's Decision",
		"type": CARD_TYPE_SPELL,
		"cost": 8,
		"power": 2,
		"effect_id": EFFECT_HEAL_ALL_ALLIES_GAIN_MAX_HP,
		"target_type": TARGET_NONE,
		"description": "Heal all ally units to their max health. Your leader heals 2 health for each unit actually healed.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "heal"],
		"traits": [],
		"side": CARD_SIDE_GOD,
		"abilities": [],
		"image_path": "res://Arts/CardImages/TheNaturesDescision.png"
	}
	card_database["holy_missiles"] = {
		"name": "Holy Missiles",
		"type": CARD_TYPE_SPELL,
		"cost": 5,
		"power": 4,
		"effect_id": EFFECT_DESTROY_UNIT,
		"target_type": TARGET_ANY_UNIT,
		"description": "Destroy a unit. If it destroys an ally unit, gain 4 mana.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "destroy"],
		"traits": [],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"trigger": "on_destroy_target",
				"condition": "target_was_friendly",
				"effect": "gain_mana",
				"amount": 4
			}
		],
		"image_path": "res://Arts/CardImages/HolyMissles.png"
	}
	card_database["lone_knight"] = {
		"name": "The Lone Knight",
		"type": CARD_TYPE_UNIT,
		"cost": 1,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "When destroyed: Choose a Soldier unit in your hand. Give it +1/+1.",
		"attack": 1,
		"hp": 1,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "death"],
		"traits": ["soldier"],
		"abilities": [
			{
				"trigger": "when_destroyed",
				"effect": "buff_random_hand_trait",
				"target": "random_hand_unit_with_trait",
				"trait": "soldier",
				"attack": 1,
				"hp": 1
			}
		],
		"image_path": "res://Arts/CardImages/LoneKnight.png"
	}
	card_database["eigenspirits"] = {
		"name": "Eigenspirits",
		"type": CARD_TYPE_UNIT,
		"cost": 10,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Haste. When destroyed: Summon a copy of this card with +2/+2.",
		"attack": 1,
		"hp": 1,
		"armor": 0,
		"keywords": ["haste"],
		"tags": ["basic", "death", "scaling"],
		"traits": [],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"trigger": "when_destroyed",
				"effect": "copy_self_to_board",
				"attack": 2,
				"hp": 2
			}
		],
		"image_path": "res://Arts/CardImages/Eigenspirits.png"
	}
	card_database["magician_in_red"] = {
		"name": "Magician in Red",
		"type": CARD_TYPE_UNIT,
		"cost": 3,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Aura: Your damage spells deal +2 damage on units.",
		"attack": 1,
		"hp": 1,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "mage", "aura"],
		"traits": ["mage"],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"trigger": "aura",
				"effect": "spell_damage_bonus",
				"target": "friendly_damage_spells",
				"amount": 2
			}
		],
		"image_path": "res://Arts/CardImages/MagicianInRed.png"
	}
	card_database["mystic_elder"] = {
		"name": "Mystic Elder",
		"type": CARD_TYPE_UNIT,
		"cost": 6,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Aura: Spells in your hand cost 1 less.",
		"attack": 4,
		"hp": 3,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "aura", "mage"],
		"traits": ["mage"],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"trigger": "aura",
				"effect": "reduce_hand_spell_cost",
				"target": "friendly_spells_in_hand",
				"amount": 1
			}
		],
		"image_path": "res://Arts/CardImages/MysticElder.png"
	}
	card_database["arrogant_apprentice"] = {
		"name": "Arrogant Apprentice",
		"type": CARD_TYPE_UNIT,
		"cost": 2,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Turn start: Draw a random spell from your deck.",
		"attack": 0,
		"hp": 4,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "draw", "engine", "mage"],
		"traits": ["mage"],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"trigger": "turn_start",
				"effect": "draw_random_spell_from_deck",
				"amount": 1
			}
		],
		"image_path": "res://Arts/CardImages/ArrogantApprentice.png"
	}	

	card_database["rogue_smith"] = {
		"name": "Rogue Smith",
		"type": CARD_TYPE_UNIT,
		"cost": 3,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Taunt. Whenever a unit is played from hand, remove its original Rush and Haste permanently.",
		"attack": 1,
		"hp": 4,
		"armor": 0,
		"keywords": ["taunt"],
		"tags": ["basic", "defender", "anti_rush", "engine"],
		"traits": [],
		"abilities": [
			{
				"trigger": "on_unit_played",
				"effect": "remove_keywords_from_played_unit",
				"keywords": ["rush","haste"],
				"include_self": false
			}
		],
		"image_path": "res://Arts/CardImages/RogueSmith.png"
	}

	card_database["spellblader"] = {
		"name": "Spellblader",
		"type": CARD_TYPE_UNIT,
		"cost": 4,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "When played: If possible, choose and burn a spell in your hand. Gain +2/+3.",
		"attack": 3,
		"hp": 3,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "battlecry", "self_buff", "mage", "soldier"],
		"traits": ["mage", "soldier"],
		"abilities": [
			{
				"trigger": "battlecry",
				"effect": "burn_spell_from_hand_then_buff_self",
				"attack": 2,
				"hp": 3
			}
		],
		"image_path": "res://Arts/CardImages/SpellBlader.png"
	}

	card_database["the_arcana_tales"] = {
		"name": "The Arcana Tales",
		"type": CARD_TYPE_SPELL,
		"cost": 9,
		"power": 2,
		"effect_id": EFFECT_ADD_ZERO_COST_COPIES_OF_LAST_SPELL,
		"target_type": TARGET_NONE,
		"description": "Add 2 0-cost copies of the last spell you cast to your hand.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "spell", "late_game", "combo", "mage"],
		"traits": ["mage"],
		"side": CARD_SIDE_GOD,
		"abilities": [],
		"image_path": "res://Arts/CardImages/ArcanaTales.png"
	}

	card_database["the_prophet"] = {
		"name": "The Prophet",
		"type": CARD_TYPE_UNIT,
		"cost": 9,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "When played: Add 4 Prophets of Ruin to your deck.",
		"attack": 8,
		"hp": 8,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "battlecry", "late_game", "deck_generator"],
		"traits": ["prophet"],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"trigger": "battlecry",
				"effect": "add_copies_to_deck",
				"card_id": "prophets_of_ruin",
				"amount": 4,
				"shuffle": true
			}
		],
		"image_path": "res://Arts/CardImages/TheProphet.png"
	}

	card_database["prophets_of_ruin"] = {
		"name": "Prophets of Ruin",
		"type": CARD_TYPE_SPELL,
		"cost": 1,
		"power": 2,
		"effect_id": EFFECT_REDUCE_ENEMY_MAX_HP_THEN_ADD_COPIES,
		"target_type": TARGET_NONE,
		"description": "Reduce your opponent's max health by 2. Add 2 Prophets of Ruin to your deck.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["token", "spell", "ruin", "deck_generator", "max_hp_damage"],
		"traits": ["prophet"],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"trigger": "spell_effect",
				"effect": "reduce_enemy_max_hp",
				"amount": 2
			},
			{
				"trigger": "spell_effect",
				"effect": "add_copies_to_deck",
				"card_id": "prophets_of_ruin",
				"amount": 2,
				"shuffle": true
			}
		],
		"image_path": "res://Arts/CardImages/ProphetsOfRuin.png"
	}
	card_database["musketeer"] = {
		"name": "Musketeer",
		"type": CARD_TYPE_UNIT,
		"cost": 5,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Soldier. When played: Deal 4 damage to any target.",
		"attack": 2,
		"hp": 3,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "battlecry", "damage", "soldier"],
		"traits": ["soldier"],
		"abilities": [
			{
				"trigger": "battlecry",
				"effect": "damage",
				"target": "any",
				"amount": 4
			}
		],
		"image_path": "res://Arts/CardImages/Musketeer.png"
	}

	card_database["doubleblades"] = {
		"name": "Doubleblades",
		"type": CARD_TYPE_UNIT,
		"cost": 7,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Soldier. Rush. This card can attack twice per turn.",
		"attack": 3,
		"hp": 2,
		"armor": 0,
		"max_attacks_per_turn": 2,
		"keywords": ["rush"],
		"tags": ["basic", "attacker", "soldier"],
		"traits": ["soldier"],
		"image_path": "res://Arts/CardImages/DoubleBlades.png"
	}

	card_database["hammerman"] = {
		"name": "Hammerman",
		"type": CARD_TYPE_UNIT,
		"cost": 3,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "When played: This card loses -1/-1 for each other ally unit on board.",
		"attack": 4,
		"hp": 5,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "battlecry"],
		"traits": [],
		"abilities": [
			{
				"trigger": "battlecry",
				"effect": "lose_stats_for_other_ally_units",
				"attack_loss": 1,
				"hp_loss": 1
			}
		],
		"image_path": "res://Arts/CardImages/Hammerman.png"
	}
	card_database["crossbow_expert"] = {
		"name": "Crossbow Expert",
		"type": CARD_TYPE_UNIT,
		"cost": 7,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Soldier. Ricochet. Haste.",
		"attack": 5,
		"hp": 4,
		"armor": 0,
		"keywords": ["ricochet", "haste"],
		"tags": ["basic", "attacker", "soldier"],
		"traits": ["soldier"],
		"image_path": "res://Arts/CardImages/CrossbowExpert.png"
	}

	card_database["magus_imagination"] = {
		"name": "Magus Imagination",
		"type": CARD_TYPE_SPELL,
		"cost": 1,
		"power": 2,
		"effect_id": EFFECT_DRAW_RANDOM_TRAIT_FROM_DECK_INCREASE_COST,
		"target_type": TARGET_NONE,
		"description": "Draw 2 random Mage cards from your deck. They cost 1 more.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "draw", "mage", "spell"],
		"traits": ["mage"],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"effect": "draw_random_trait_from_deck_increase_cost",
				"trait": "mage",
				"amount": 2,
				"cost_increase": 1
			}
		],
		"image_path": "res://Arts/CardImages/MagusImagination.png"
	}

	card_database["cauldron"] = {
		"name": "Cauldron",
		"type": CARD_TYPE_UNIT,
		"cost": 5,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Mage. Taunt. When you play a spell: This gains +1/+1.",
		"attack": 3,
		"hp": 6,
		"armor": 0,
		"keywords": ["taunt"],
		"tags": ["basic", "mage", "engine", "taunt"],
		"traits": ["mage"],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"trigger": "on_spell_played",
				"effect": "buff_self",
				"attack": 1,
				"hp": 1,
				"only_friendly": true
			}
		],
		"image_path": "res://Arts/CardImages/Cauldron.png"
	}
	card_database["hap_hazard"] = {
		"name": "Hap-hazard",
		"type": CARD_TYPE_SPELL,
		"cost": 3,
		"power": 0,
		"effect_id": EFFECT_HAP_HAZARD,
		"target_type": TARGET_NONE,
		"description": "A random ally unit gains +2/+2. A random enemy unit gains -2/-2.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "random", "buff", "debuff"],
		"traits": [],
		"side": CARD_SIDE_GOD,
		"abilities": [],
		"image_path": "res://Arts/CardImages/HapHazard.png"
	}

	card_database["dreamseeking_pallet"] = {
		"name": "Dreamseeking Pallet",
		"type": CARD_TYPE_SPELL,
		"cost": 1,
		"power": 0,
		"effect_id": EFFECT_DAMAGE_BY_BOARD_TRAIT_COUNT,
		"target_type": TARGET_ANY_UNIT,
		"description": "Deal X damage to a unit. X is the number of different traits on the board.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "damage", "trait"],
		"traits": [],
		"side": CARD_SIDE_GOD,
		"abilities": [],
		"image_path": "res://Arts/CardImages/DreamseekingPallet.png"
	}

	card_database["headhunter"] = {
		"name": "Headhunter",
		"type": CARD_TYPE_UNIT,
		"cost": 4,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Haste. When this destroys a unit: Gain 1 mana.",
		"attack": 4,
		"hp": 2,
		"armor": 0,
		"keywords": ["haste"],
		"tags": ["basic", "attacker", "mana"],
		"traits": [],
		"abilities": [
			{
				"trigger": "when_kills",
				"effect": "gain_mana",
				"amount": 1
			}
		],
		"image_path": "res://Arts/CardImages/Headhunter.png"
	}
	card_database["bard_in_trip"] = {
		"name": "Bard in Trip",
		"type": CARD_TYPE_UNIT,
		"cost": 6,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Music. All Music spells in your hand cost 1 less. All Music units in your hand cost 1 more.",
		"attack":6,
		"hp": 6,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "music", "aura"],
		"traits": ["music"],
		"abilities": [
			{
				"trigger": "aura",
				"effect": "modify_hand_cost_by_trait",
				"target": "friendly_cards_in_hand_with_trait",
				"trait": "music",
				"card_type": "spell",
				"amount": -1
			},
			{
				"trigger": "aura",
				"effect": "modify_hand_cost_by_trait",
				"target": "friendly_cards_in_hand_with_trait",
				"trait": "music",
				"card_type": "unit",
				"amount": 1
			}
		],
		"image_path": "res://Arts/CardImages/BardInTrip.png"
	}
	card_database["gig_drummer"] = {
		"name": "Gig Drummer",
		"type": CARD_TYPE_UNIT,
		"cost": 2,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Music. Turn Start: Other allied Music units gain +0/+1.",
		"attack": 2,
		"hp": 2,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "music", "engine"],
		"traits": ["music"],
		"abilities": [
			{
				"trigger": "turn_start",
				"effect": "buff_other_friendly_trait_units",
				"trait": "music",
				"attack": 0,
				"hp": 1
			}
		],
		"image_path": "res://Arts/CardImages/GigDrummer.png"
	}

	card_database["runic_tuning"] = {
		"name": "Runic Tuning",
		"type": CARD_TYPE_SPELL,
		"cost": 3,
		"power": 0,
		"effect_id": EFFECT_RUNIC_TUNING,
		"target_type": TARGET_ANY_FRIENDLY,
		"description": "Choose an allied unit. It gains +2/+2 and Haste. If it is a Music unit, gain 1 mana.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "music", "spell", "buff", "haste"],
		"traits": ["music"],
		"abilities": [],
		"image_path": "res://Arts/CardImages/RunicTuning.png"
	}

	card_database["lamentation_of_life"] = {
		"name": "Lamentation of Life",
		"type": CARD_TYPE_SPELL,
		"cost": 3,
		"power": 0,
		"effect_id": EFFECT_LAMENTATION_OF_LIFE,
		"target_type": TARGET_ENEMY_UNIT,
		"description": "Destroy an enemy unit with 3 or less ATK.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "music", "spell", "destroy"],
		"traits": ["music"],
		"abilities": [],
		"image_path": "res://Arts/CardImages/LamentationOfLife.png"
	}

	card_database["incantation_of_minstrel"] = {
		"name": "Incantation of Minstrel",
		"type": CARD_TYPE_SPELL,
		"cost": 3,
		"power": 0,
		"effect_id": EFFECT_INCANTATION_OF_MINSTREL,
		"target_type": TARGET_NONE,
		"description": "Choose a card in your hand. It costs 1 less for each allied unit on board. If it is a Mage or Music card, draw 1 card.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "music", "mage", "spell", "cost_reduction", "draw"],
		"traits": ["mage", "music"],
		"abilities": [],
		"image_path": "res://Arts/CardImages/IncantationOfMinstrel.png"
	}

	card_database["obsidian_harp"] = {
		"name": "The Obsidian Harp",
		"type": CARD_TYPE_UNIT,
		"cost": 7,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Music. Taunt. When played: Choose and destroy an enemy unit, then heal your leader for 4.",
		"attack": 2,
		"hp": 7,
		"armor": 0,
		"keywords": ["taunt"],
		"tags": ["basic", "music", "battlecry", "destroy", "heal", "defender"],
		"traits": ["music"],
		"abilities": [
			{
				"trigger": "battlecry",
				"effect": "destroy_enemy_unit_and_heal_leader",
				"target": "enemy_unit",
				"heal": 4
			}
		],
		"image_path": "res://Arts/CardImages/ObsidianHarp.png"
	}

	card_database["angelic_singer"] = {
		"name": "Angelic Singer",
		"type": CARD_TYPE_UNIT,
		"cost": 7,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Music. Untrickable. Turn End and Turn Start: All allied Music units gain +1/+1.",
		"attack": 4,
		"hp": 4,
		"armor": 0,
		"keywords": ["untrickable"],
		"tags": ["basic", "music", "engine", "buffer"],
		"traits": ["music"],
		"abilities": [
			{
				"trigger": "turn_end",
				"effect": "buff_trait",
				"target": "friendly_units_with_trait",
				"trait": "music",
				"attack": 1,
				"hp": 1
			},
			{
				"trigger": "turn_start",
				"effect": "buff_trait",
				"target": "friendly_units_with_trait",
				"trait": "music",
				"attack": 1,
				"hp": 1
			}
		],
		"image_path": "res://Arts/CardImages/AngelicSinger.png"
	}

	card_database["rogue_songwriter"] = {
		"name": "Rogue Songwriter",
		"type": CARD_TYPE_UNIT,
		"cost": 6,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Music. Haste. Ricochet. When played: Gain +X ATK. X is half of the total ATK of all allied Music units on board, rounded down.",
		"attack": 0,
		"hp": 2,
		"armor": 0,
		"keywords": ["haste", "ricochet"],
		"tags": ["basic", "music", "battlecry", "finisher"],
		"traits": ["music"],
		"abilities": [
			{
				"trigger": "battlecry",
				"effect": "gain_attack_from_allied_trait_attack_total",
				"trait": "music",
				"divisor": 2,
				"include_self": true
			}
		],
		"image_path": "res://Arts/CardImages/RogueSongwriter.png"
	}

	card_database["overtuned"] = {
		"name": "Overtuned",
		"type": CARD_TYPE_SPELL,
		"cost": 1,
		"power": 0,
		"effect_id": EFFECT_ADD_KEYWORDS_TO_UNIT,
		"target_type": TARGET_ANY_UNIT,
		"description": "Music. Make a unit gain Immobile and Taunt.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "music", "spell", "keyword"],
		"traits": ["music"],
		"abilities": [
			{
				"effect": "add_keywords_to_unit",
				"target": "any_unit",
				"keywords": ["immobile", "taunt"]
			}
		],
		"image_path": "res://Arts/CardImages/Overtuned.png"
	}

	card_database["marching_trumpeter"] = {
		"name": "Marching Trumpeter",
		"type": CARD_TYPE_UNIT,
		"cost": 2,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Soldier. Music. Turn Start: All other ally Music units gain +1 Attack.",
		"attack": 2,
		"hp": 2,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "soldier", "music", "engine"],
		"traits": ["soldier", "music"],
		"abilities": [
			{
				"trigger": "turn_start",
				"effect": "buff_other_friendly_trait_units",
				"trait": "music",
				"attack": 1,
				"hp": 0
			}
		],
		"image_path": "res://Arts/CardImages/MarchingTrumpeter.png"
	}
	card_database["circus_of_illusion"] = {
		"name": "Circus of Illusion",
		"type": CARD_TYPE_SPELL,
		"cost": 6,
		"power": 2,
		"effect_id": EFFECT_RESURRECT_TRAIT_UNITS_FROM_GRAVEYARD,
		"target_type": TARGET_NONE,
		"description": "Phantom. Resurrect 2 Phantom units from your graveyard. They gain Haste.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "phantom", "spell", "resurrect"],
		"traits": ["phantom"],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"effect": "resurrect_trait_units_from_graveyard",
				"trait": "phantom",
				"amount": 2,
				"keywords": ["haste"]
			}
		],
		"image_path": "res://Arts/CardImages/CircusOfIllusion.png"
	}

	card_database["pyromancer"] = {
		"name": "Pyromancer",
		"type": CARD_TYPE_UNIT,
		"cost": 5,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Mage. When a spell is played: Deal 3 damage to a random enemy unit. If there is no enemy unit, deal 3 damage to the enemy leader instead.",
		"attack": 2,
		"hp": 6,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "mage", "engine", "spell_trigger"],
		"traits": ["mage"],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"trigger": "on_spell_played",
				"effect": "damage_random_enemy_unit_or_face",
				"amount": 3,
				"only_friendly": false
			}
		],
		"image_path": "res://Arts/CardImages/Pyromancer.png"
	}

	card_database["glacial_world"] = {
		"name": "Glacial World",
		"type": CARD_TYPE_SPELL,
		"cost": 5,
		"power": 0,
		"effect_id": EFFECT_TEMPORARY_IMMOBILE_ALL_ENEMY_UNITS,
		"target_type": TARGET_NONE,
		"description": "All enemy units become Immobile until the end of next turn.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "spell", "freeze"],
		"traits": [],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"effect": "temporary_immobile_all_enemy_units",
				"expire_after_turns": 2
			}
		],
		"image_path": "res://Arts/CardImages/GlacialWorld.png"
	}
	card_database["the_bastion"] = {
		"name": "The Bastion",
		"type": CARD_TYPE_UNIT,
		"cost": 5,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Gadget. Soldier. Immobile. Taunt. When played: Summon 2 Novice Soldiers. Turn Start: Summon 1 Novice Soldier.",
		"attack": 2,
		"hp": 5,
		"armor": 0,
		"keywords": ["immobile", "taunt"],
		"tags": ["basic", "gadget", "soldier", "summon", "defender"],
		"traits": ["gadget", "soldier"],
		"abilities": [
			{
				"trigger": "battlecry",
				"effect": "summon_cards",
				"card_id": "Novice Soldier",
				"amount": 2
			},
			{
				"trigger": "turn_start",
				"effect": "summon_cards",
				"card_id": "Novice Soldier",
				"amount": 1
			}
		],
		"image_path": "res://Arts/CardImages/TheBastion.png"
	}

	card_database["mega_balista"] = {
		"name": "Mega-Balista",
		"type": CARD_TYPE_UNIT,
		"cost": 4,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Gadget. Immobile. Turn Start: Destroy the enemy unit with the lowest health.",
		"attack": 0,
		"hp": 4,
		"armor": 0,
		"keywords": ["immobile"],
		"tags": ["basic", "gadget", "engine"],
		"traits": ["gadget"],
		"abilities": [
			{
				"trigger": "turn_start",
				"effect": "destroy_lowest_health_enemy_unit"
			}
		],
		"image_path": "res://Arts/CardImages/MegaBalista.png"
	}

	card_database["short_circuit"] = {
		"name": "Short Circuit",
		"type": CARD_TYPE_SPELL,
		"cost": 1,
		"power": 0,
		"effect_id": EFFECT_DESTROY_FRIENDLY_TRAIT_UNIT_COPY_TO_HAND_BUFF,
		"target_type": TARGET_ANY_FRIENDLY,
		"description": "Destroy an ally Gadget unit. Add a copy of that unit to your hand with +2/+4.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "gadget", "destroy", "copy"],
		"traits": ["gadget"],
		"abilities": [
			{
				"effect": "destroy_friendly_trait_unit_copy_to_hand_buff",
				"trait": "gadget",
				"attack": 2,
				"hp": 4
			}
		],"image_path": "res://Arts/CardImages/ShortCircuit.png"
	}
	card_database["nimbus_outpost"] = {
	"name": "Nimbus Outpost",
	"type": CARD_TYPE_UNIT,
	"cost": 2,
	"power": 0,
	"effect_id": "nimbus_outpost",
	"target_type": TARGET_ANY_FRIENDLY,
	"description": "Gadget. Immobile. Taunt. Destroy an allied unit to play this. This gains stats equal to that destroyed unit.",
	"attack": 2,
	"hp": 2,
	"armor": 0,
	"keywords": ["immobile", "taunt"],
	"tags": ["basic", "gadget", "sacrifice", "defender"],
	"traits": ["gadget"],
	"abilities": [],
	"image_path": "res://Arts/CardImages/NimbusOutpost.png"
	}

	card_database["autocannon"] = {
		"name": "Autocannon",
		"type": CARD_TYPE_UNIT,
		"cost": 3,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Gadget. Immobile. When an ally unit attacks, deal 2 damage to the enemy leader.",
		"attack": 1,
		"hp": 4,
		"armor": 0,
		"keywords": ["immobile"],
		"tags": ["basic", "gadget", "engine"],
		"traits": ["gadget"],
		"abilities": [
			{
				"trigger": "on_ally_unit_attack",
				"effect": "damage_enemy_leader_on_ally_attack",
				"amount": 2
			}
		],
		"image_path": "res://Arts/CardImages/Autocannnon.png"
	}

	card_database["wooden_mecha"] = {
		"name": "Wooden Mecha",
		"type": CARD_TYPE_UNIT,
		"cost": 7,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Gadget. Haste. When played: Remove Immobile from all allied Gadget units and set all allied Gadget units' attack to 4.",
		"attack": 4,
		"hp": 3,
		"armor": 0,
		"keywords": ["haste"],
		"tags": ["basic", "gadget", "finisher"],
		"traits": ["gadget"],
		"abilities": [
			{
				"trigger": "battlecry",
				"effect": "remove_immobile_set_attack_for_trait",
				"trait": "gadget",
				"attack": 4
			}
		],
		"image_path": "res://Arts/CardImages/WoodenMecha.png"
	}
	card_database["mad_scientist"] = {
		"name": "Mad Scientist",
		"type": CARD_TYPE_UNIT,
		"cost": 4,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Gadget. Untrickable. Turn End: All other allied Gadget units gain +0/+2.",
		"attack": 2,
		"hp": 4,
		"armor": 0,
		"keywords": ["untrickable"],
		"tags": ["basic", "gadget", "engine"],
		"traits": ["gadget"],
		"abilities": [
			{
				"trigger": "turn_end",
				"effect": "buff_other_friendly_trait_units",
				"trait": "gadget",
				"attack": 0,
				"hp": 2
			}
		],
		"image_path": "res://Arts/CardImages/MadScientist.png"
	}

	card_database["witchcraft_trap"] = {
		"name": "Witchcraft Trap",
		"type": CARD_TYPE_UNIT,
		"cost": 3,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Gadget. Immobile. Turn End: If possible, choose a Gadget card in your hand and return it to your deck: Deal 3 damage to all enemy units.",
		"attack": 2,
		"hp": 5,
		"armor": 0,
		"keywords": ["immobile"],
		"tags": ["basic", "gadget", "mage", "engine"],
		"traits": ["gadget", "mage"],
		"abilities": [
			{
				"trigger": "turn_end",
				"effect": "return_random_hand_trait_card_then_damage_all_enemy_units",
				"trait": "gadget",
				"amount": 3
			}
		],
		"image_path": "res://Arts/CardImages/WitchcraftTrap.png"
	}

	card_database["paint_barrel"] = {
		"name": "Paint Barrel",
		"type": CARD_TYPE_SPELL,
		"cost": 2,
		"power": 0,
		"effect_id": EFFECT_RETURN_RANDOM_HAND_UNIT_DRAW_ANOTHER_TRAIT_UNIT,
		"target_type": TARGET_NONE,
		"description": "Choose a unit in your hand and return it to your deck. Draw a random unit with another trait from your deck. It gains +2/+2 and costs 1 less.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "spell", "gadget", "draw"],
		"traits": ["gadget"],
		"abilities": [],
		"image_path": "res://Arts/CardImages/PaintBarrel.png"
	}
	card_database["masterwork_of_art"] = {
		"name": "Masterwork of Art",
		"type": CARD_TYPE_SPELL,
		"cost": 6,
		"power": 0,
		"effect_id": EFFECT_MASTERWORK_OF_ART,
		"target_type": TARGET_NONE,
		"description": "Burn all cards in your graveyard. Summon a Doodle. It gains all different traits from the burnt cards.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "spell", "art", "graveyard"],
		"traits": [],
		"side": CARD_SIDE_GOD,
		"abilities": [],
		"image_path": "res://Arts/CardImages/MasterworkOfArt.png"
	}

	card_database["doodle"] = {
		"name": "Doodle",
		"type": CARD_TYPE_UNIT,
		"cost": 0,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Rush. This card can attack X times in 1 turn. X is the number of traits it holds.",
		"attack": 2,
		"hp": 1,
		"armor": 0,
		"max_attacks_per_turn": 1,
		"keywords": ["rush"],
		"tags": ["token", "art", "doodle"],
		"traits": [],
		"side": CARD_SIDE_GOD,
		"image_path": "res://Arts/CardImages/Doodle.png"
	}
	card_database["the_rime_of_the_ancient_mariner"] = {
		"name": "The Rime of the Ancient Mariner",
		"type": CARD_TYPE_SPELL,
		"cost": 8,
		"power": 0,
		"effect_id": EFFECT_RIME_OF_THE_ANCIENT_MARINER,
		"target_type": TARGET_NONE,
		"description": "Summon an Ancient Mariner. For each enemy unit on board, it gains -2/-2.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "marine", "spell", "summon", "late_game"],
		"traits": ["marine"],
		"abilities": [],
		"image_path": "res://Arts/CardImages/RimeOfTheAncientMariner.png"
	}

	card_database["ancient_mariner"] = {
		"name": "Ancient Mariner",
		"type": CARD_TYPE_UNIT,
		"cost": 0,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Marine. Immobile. Turn End: This gains -2/-2. When destroyed: Summon an Awaken Mariner.",
		"attack": 10,
		"hp": 10,
		"armor": 0,
		"keywords": ["immobile"],
		"tags": ["token", "marine", "death", "late_game"],
		"traits": ["marine"],
		"abilities": [
			{
				"trigger": "turn_end",
				"effect": "buff_self",
				"attack": -2,
				"hp": -2
			},
			{
				"trigger": "when_destroyed",
				"effect": "summon_cards",
				"card_id": "awaken_mariner",
				"amount": 1
			}
		],
		"image_path": "res://Arts/CardImages/AncientMariner.png"
	}

	card_database["awaken_mariner"] = {
		"name": "Awaken Mariner",
		"type": CARD_TYPE_UNIT,
		"cost": 0,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Marine. Haste. Taunt. Armor 2. Untrickable.",
		"attack": 10,
		"hp": 10,
		"armor": 2,
		"keywords": ["haste", "taunt", "untrickable"],
		"tags": ["token", "marine", "finisher"],
		"traits": ["marine"],
		"abilities": [],
		"image_path": "res://Arts/CardImages/AwakenMariner.png"
	}

	card_database["encompassed_compass"] = {
		"name": "Encompassed Compass",
		"type": CARD_TYPE_SPELL,
		"cost": 5,
		"power": 0,
		"effect_id": EFFECT_ENCOMPASSED_COMPASS,
		"target_type": TARGET_NONE,
		"description": "Resurrect a unit card from your graveyard. It cannot attack the opponent's leader.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "marine", "spell", "resurrect", "graveyard"],
		"traits": ["marine"],
		"abilities": [],
		"image_path": "res://Arts/CardImages/EncompassedCompass.png"
	}

	card_database["star_gazer"] = {
		"name": "Star Gazer",
		"type": CARD_TYPE_UNIT,
		"cost": 2,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Marine. Haste. When played: Look at the top card of your deck. Keep it on top or put it on the bottom. When destroyed: Draw a card.",
		"attack": 1,
		"hp": 1,
		"armor": 0,
		"keywords": ["haste"],
		"tags": ["basic", "marine", "battlecry", "death", "draw", "deck"],
		"traits": ["marine"],
		"abilities": [
			{
				"trigger": "battlecry",
				"effect": "look_top_deck_keep_or_bottom"
			},
			{
				"trigger": "when_destroyed",
				"effect": "draw",
				"amount": 1
			}
		],
		"image_path": "res://Arts/CardImages/StarGazer.png"
	}

	card_database["hidden_shipyard"] = {
		"name": "Hidden Shipyard",
		"type": CARD_TYPE_UNIT,
		"cost": 3,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Gadget. Marine. Immobile. Once per turn, when an allied unit card is played, draw a random Marine unit card from your deck.",
		"attack": 2,
		"hp": 2,
		"armor": 0,
		"keywords": ["immobile"],
		"tags": ["basic", "gadget", "marine", "engine", "draw"],
		"traits": ["gadget", "marine"],
		"abilities": [
			{
				"trigger": "on_unit_played",
				"effect": "draw_random_trait_unit_from_deck",
				"trait": "marine",
				"amount": 1,
				"include_self": false,
				"only_friendly": true,
				"once_per_turn": true
			}
		],
		"image_path": "res://Arts/CardImages/HiddenShipyard.png"
	}

	card_database["the_sailor"] = {
	"name": "The Sailor",
	"type": CARD_TYPE_UNIT,
	"cost": 1,
	"power": 0,
	"effect_id": EFFECT_NONE,
	"target_type": TARGET_NONE,
	"description": "Marine. When destroyed: Draw a card. It costs 3 more.",
	"attack": 2,
	"hp": 2,
	"armor": 0,
	"keywords": [],
	"tags": ["basic", "marine", "death", "draw"],
	"traits": ["marine"],
	"abilities": [
		{
			"trigger": "when_destroyed",
			"effect": "draw_card_then_increase_cost",
			"amount": 1,
			"cost_increase": 3
		}
	],
	"image_path": "res://Arts/CardImages/Sailor.png"
	}

	card_database["the_beloved_cannoneer"] = {
		"name": "The Beloved Cannoneer",
		"type": CARD_TYPE_UNIT,
		"cost": 6,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Marine. When played: Deal 3 damage to all enemy units.",
		"attack": 3,
		"hp": 2,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "marine", "battlecry", "aoe", "damage"],
		"traits": ["marine"],
		"abilities": [
			{
				"trigger": "battlecry",
				"effect": "damage",
				"target": "all_enemy_units",
				"amount": 3
			}
		],
		"image_path": "res://Arts/CardImages/BelovedCannoneer.png"
	}

	card_database["lone_lighthouse_keeper"] = {
		"name": "Lone-Lighthouse Keeper",
		"type": CARD_TYPE_UNIT,
		"cost": 4,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Marine. Taunt. When attacked, the attacker loses 1 ATK.",
		"attack": 2,
		"hp": 5,
		"armor": 0,
		"keywords": ["taunt"],
		"tags": ["basic", "marine", "defender", "debuff"],
		"traits": ["marine"],
		"abilities": [
			{
				"trigger": "when_attacked",
				"effect": "debuff_attacker",
				"attack": -1,
				"hp": 0
			}
		],
		"image_path": "res://Arts/CardImages/LoneLighthouseKeeper.png"
	}

	card_database["scavenge_command"] = {
		"name": "Scavenge Command",
		"type": CARD_TYPE_SPELL,
		"cost": 3,
		"power": 0,
		"effect_id": EFFECT_SCAVENGE_COMMAND,
		"target_type": TARGET_NONE,
		"description": "Choose a Marine unit in your hand. It gains Haste and 'When destroyed: Marine units in your hand cost 1 less.'",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "marine", "spell", "hand", "buff"],
		"traits": ["marine"],
		"abilities": [],
		"image_path": "res://Arts/CardImages/ScavengeCommand.png"
	}

	card_database["the_duel_on_sea"] = {
		"name": "The Duel on Sea",
		"type": CARD_TYPE_SPELL,
		"cost": 6,
		"power": 0,
		"effect_id": EFFECT_DUEL_ON_SEA,
		"target_type": TARGET_NONE,
		"description": "Reveal a Marine unit in your hand. Destroy all enemy units with less ATK than it.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "marine", "spell", "reveal", "destroy"],
		"traits": ["marine"],
		"abilities": [],
		"image_path": "res://Arts/CardImages/DuelOnSea.png"
	}

	card_database["storm_and_tides"] = {
		"name": "Storm and Tides",
		"type": CARD_TYPE_SPELL,
		"cost": 4,
		"power": 2,
		"effect_id": EFFECT_STORM_AND_TIDES,
		"target_type": TARGET_NONE,
		"description": "Deal 2 damage to all units. If this destroys an enemy unit, deal 2 damage to all units again.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "marine", "spell", "aoe", "damage"],
		"traits": ["marine"],
		"abilities": [],
		"image_path": "res://Arts/CardImages/StormAndTides.png"
	}

	card_database["the_lightning_ceremony"] = {
		"name": "The Lightning Ceremony",
		"type": CARD_TYPE_SPELL,
		"cost": 3,
		"power": 0,
		"effect_id": EFFECT_LIGHTNING_CEREMONY,
		"target_type": TARGET_NONE,
		"description": "Burn a card in your hand, then draw 3 cards.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "marine", "spell", "burn", "draw"],
		"traits": ["marine"],
		"abilities": [],
		"image_path": "res://Arts/CardImages/LightningCeremony.png"
	}

	card_database["hugin_crow_of_thought"] = {
		"name": "Hugin, Crow of Thought",
		"type": CARD_TYPE_UNIT,
		"cost": 4,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Animal. Haste. When destroyed: Add Muninn, Crow of Memory to your hand.",
		"attack": 4,
		"hp": 3,
		"armor": 0,
		"keywords": ["haste"],
		"tags": ["basic", "god", "animal", "death"],
		"traits": ["animal"],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"trigger": "when_destroyed",
				"effect": "add_card_to_hand",
				"card_id": "muninn_crow_of_memory",
				"amount": 1
			}
		]
	}

	card_database["muninn_crow_of_memory"] = {
		"name": "Muninn, Crow of Memory",
		"type": CARD_TYPE_UNIT,
		"cost": 4,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Animal. Deadly. Taunt. When destroyed: Add Hugin, Crow of Thought to your hand.",
		"attack": 1,
		"hp": 4,
		"armor": 0,
		"keywords": ["deadly", "taunt"],
		"tags": ["basic", "god", "animal", "death"],
		"traits": ["animal"],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"trigger": "when_destroyed",
				"effect": "add_card_to_hand",
				"card_id": "hugin_crow_of_thought",
				"amount": 1
			}
		]
	}

	card_database["guardian_of_the_seventh_gate"] = {
		"name": "Guardian of the Seventh Gate",
		"type": CARD_TYPE_UNIT,
		"cost": 9,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Taunt. When played: This gains Invincible until the end of next turn. Invincible: This cannot be damaged or destroyed.",
		"attack": 3,
		"hp": 3,
		"armor": 0,
		"keywords": ["taunt"],
		"tags": ["basic", "god", "defender", "battlecry"],
		"traits": [],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"trigger": "battlecry",
				"effect": "gain_temporary_keyword",
				"keyword": "invincible",
				"expire_after_turns": 2
			}
		],
		"image_path": "res://Arts/CardImages/GateGuardian.png"
	}

	card_database["the_first_oracle"] = {
		"name": "The First Oracle",
		"type": CARD_TYPE_UNIT,
		"cost": 1,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Prophet. When played: If you have played 10 or more Prophet cards this game, add The Final Oracle to your hand.",
		"attack": 1,
		"hp": 1,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "god", "prophet", "battlecry"],
		"traits": ["prophet"],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"trigger": "battlecry",
				"effect": "add_card_to_hand_if_trait_played_count",
				"trait": "prophet",
				"required_count": 10,
				"card_id": "the_final_oracle",
				"amount": 1
			}
		],
		"image_path": "res://Arts/CardImages/FirstOracle.png"
	}

	card_database["the_call_of_omen"] = {
		"name": "The Call of Omen",
		"type": CARD_TYPE_SPELL,
		"cost": 3,
		"power": 0,
		"effect_id": EFFECT_CALL_OF_OMEN,
		"target_type": TARGET_NONE,
		"description": "All enemy units get -1 ATK. Destroy all enemy units with 1 or less ATK.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "god", "prophet", "spell", "debuff", "destroy"],
		"traits": ["prophet"],
		"side": CARD_SIDE_GOD,
		"abilities": [],
		"image_path": "res://Arts/CardImages/CallOfOmen.png"
	}

	card_database["the_sleeping_seer"] = {
	"name": "The Sleeping Seer",
	"type": CARD_TYPE_UNIT,
	"cost": 5,
	"power": 0,
	"effect_id": EFFECT_NONE,
	"target_type": TARGET_NONE,
	"description": "Prophet. Immobile. Turn Start: Remove Immobile, gain +6/+6, and lose this effect.",
	"attack": 3,
	"hp": 3,
	"armor": 0,
	"keywords": ["immobile"],
	"tags": ["basic", "god", "prophet", "turn_start"],
	"traits": ["prophet"],
	"side": CARD_SIDE_GOD,
	"abilities": [
		{
			"trigger": "turn_start",
			"effect": "remove_keyword_then_buff_self",
			"keyword": "immobile",
			"attack": 6,
			"hp": 6,
			"once": true,
			"remove_this_ability_after_resolve": true,
			"refresh_attack_after_immobile_removed": true
		}
	],
	"image_path": "res://Arts/CardImages/SleepingSeer.png"
	}

	card_database["the_sane_saint"] = {
		"name": "The Sane Saint",
		"type": CARD_TYPE_UNIT,
		"cost": 7,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "When played: Summon 3 Threefold Saints. They separately gain Haste, Taunt, and Ricochet.",
		"attack": 2,
		"hp": 2,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "god","saint", "battlecry", "summon"],
		"traits": ["prophet"],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"trigger": "battlecry",
				"effect": "summon_three_keyword_copies",
				"card_id": "the_threefold_saint_token",
				"keywords": ["haste", "taunt", "ricochet"]
			}
		],
		"image_path": "res://Arts/CardImages/SaneSaint.png"
	}

	card_database["the_threefold_saint_token"] = {
		"name": "Threefold Saint",
		"type": CARD_TYPE_UNIT,
		"cost": 0,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "A divided saint.",
		"attack": 2,
		"hp": 2,
		"armor": 0,
		"keywords": [],
		"tags": ["token", "god", "saint"],
		"traits": ["saint"],
		"side": CARD_SIDE_GOD,
		"abilities": [],
		"image_path": "res://Arts/CardImages/SaneSaint.png"
	}

	card_database["the_final_oracle"] = {
		"name": "The Final Oracle",
		"type": CARD_TYPE_UNIT,
		"cost": 10,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Prophet. When played: Destroy all other units. Fully heal your leader.",
		"attack": 5,
		"hp": 10,
		"armor": 0,
		"keywords": [],
		"tags": ["token", "god", "prophet", "battlecry", "finisher"],
		"traits": ["prophet"],
		"side": CARD_SIDE_GOD,
		"abilities": [
			{
				"trigger": "battlecry",
				"effect": "destroy_all_other_units_and_full_heal_leader"
			}
		],
		"image_path": "res://Arts/CardImages/FinalOracle.png"
	}


	card_database["the_marching_tune"] = {
		"name": "The Marching Tune",
		"type": CARD_TYPE_SPELL,
		"cost": 3,
		"power": 0,
		"effect_id": EFFECT_BUFF_ALL_ALLY_UNITS,
		"target_type": TARGET_NONE,
		"description": "Music. All allied units gain +1/+1.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "music", "spell", "buff"],
		"traits": ["music"],
		"abilities": [
			{
				"effect": "buff_all_ally_units",
				"attack": 1,
				"hp": 1
			}
		],
		"image_path": "res://Arts/CardImages/MarchingTune.png"
	}

	card_database["poetry_of_resilience"] = {
		"name": "Poetry of Resilience",
		"type": CARD_TYPE_SPELL,
		"cost": 4,
		"power": 0,
		"effect_id": EFFECT_POETRY_OF_RESILIENCE,
		"target_type": TARGET_ANY_FRIENDLY,
		"description": "Music. Choose a damaged allied unit. It gains Armor 3 and Music trait.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "music", "spell", "armor", "trait"],
		"traits": ["music"],
		"abilities": [
			{
				"effect": "poetry_of_resilience",
				"target": "friendly_unit",
				"damaged_only": true,
				"armor": 3,
				"trait": "music"
			}
		],
		"image_path": "res://Arts/CardImages/PoetryOfResilience.png"
	}

	card_database["convivial_humming"] = {
		"name": "Convivial Humming",
		"type": CARD_TYPE_SPELL,
		"cost": 4,
		"power": 0,
		"effect_id": EFFECT_CONVIVIAL_HUMMING,
		"target_type": TARGET_NONE,
		"description": "Music. Deal X damage to all enemy units. X is the number of spell cards in your graveyard.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "music", "spell", "aoe", "damage", "graveyard"],
		"traits": ["music"],
		"abilities": [],
		"image_path": "res://Arts/CardImages/ConvivialHumming.png"
	}

	card_database["one_eye_albatross"] = {
		"name": "The One-Eye Albatross",
		"type": CARD_TYPE_UNIT,
		"cost": 5,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Marine. When an enemy unit is played: Deal 2 damage to that unit.",
		"attack": 3,
		"hp": 4,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "marine", "engine", "damage"],
		"traits": ["marine"],
		"abilities": [
			{
				"trigger": "on_unit_played",
				"effect": "damage_played_unit",
				"amount": 2,
				"only_enemy": true,
				"include_self": false
			}
		],
		"image_path": "res://Arts/CardImages/OneEyeAlbatross.png"
	}

	card_database["independent_patchwork"] = {
		"name": "Independent Patchwork",
		"type": CARD_TYPE_UNIT,
		"cost": 2,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Gadget. Turn Start: This gains +1/+2.",
		"attack": 1,
		"hp": 1,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "gadget", "scaling"],
		"traits": ["gadget"],
		"abilities": [
			{
				"trigger": "turn_start",
				"effect": "buff_self",
				"attack": 1,
				"hp": 2
			}
		],
		"image_path": "res://Arts/CardImages/IndependentPatchwork.png"
	}

	card_database["the_legendary_builder"] = {
		"name": "The Legendary Builder",
		"type": CARD_TYPE_UNIT,
		"cost": 8,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Gadget. All other Gadget units have Taunt. When an allied Gadget unit is damaged: Heal that unit for 3 HP and deal 2 damage to the enemy leader.",
		"attack": 4,
		"hp": 4,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "gadget", "aura", "heal", "damage", "late_game"],
		"traits": ["gadget"],
		"abilities": [
			{
				"trigger": "aura",
				"effect": "grant_keywords_to_trait",
				"target": "friendly_units_with_trait",
				"trait": "gadget",
				"keywords": ["taunt"],
				"exclude_self": true
			},
			{
				"trigger": "on_ally_unit_damaged",
				"effect": "heal_damaged_ally_gadget_and_damage_enemy_leader",
				"trait": "gadget",
				"heal": 3,
				"damage": 2
			}
		],
		"image_path": "res://Arts/CardImages/LegendaryBuilder.png"
	}

	card_database["the_undefeated_general"] = {
		"name": "The Undefeated General",
		"type": CARD_TYPE_UNIT,
		"cost": 8,
		"power": 0,
		"effect_id": EFFECT_NONE,
		"target_type": TARGET_NONE,
		"description": "Soldier. Before an allied unit attacks: That unit gains +2/+2.",
		"attack": 4,
		"hp": 9,
		"armor": 0,
		"keywords": [],
		"tags": ["basic", "soldier", "commander", "attack_trigger", "late_game"],
		"traits": ["soldier"],
		"abilities": [
			{
				"trigger": "on_ally_unit_attack",
				"effect": "buff_attacker",
				"attack": 2,
				"hp": 2
			}
		],
		"image_path": "res://Arts/CardImages/General.png"
	}
	card_database["flying_fortress"] = {
	"name": "Flying Fortress",
	"type": CARD_TYPE_UNIT,
	"cost": 6,
	"power": 0,
	"effect_id": EFFECT_NONE,
	"target_type": TARGET_NONE,
	"description": "Once per turn, the first time this fights an enemy unit, prevent all combat damage this would take from that unit.",
	"attack": 5,
	"hp": 4,
	"armor": 0,
	"keywords": [],
	"tags": [],
	"traits": ["gadget"],
	"side": CARD_SIDE_HUMAN,
	"image_path": "res://Arts/CardImages/FlyingFortress.png",
	"abilities": []
}
	card_database["nobles_oblige"] = {
	"name": "Nobles Oblige",
	"type": CARD_TYPE_SPELL,
	"cost": 1,
	"power": 0,
	"effect_id": "nobles_oblige",
	"target_type": TARGET_ANY_FRIENDLY,
	"description": "Spend all remaining mana. Give an allied unit +X/+X. X is the amount of mana spent this way.",
	"attack": 0,
	"hp": 0,
	"armor": 0,
	"keywords": [],
	"tags": [],
	"traits": [],
	"side": CARD_SIDE_HUMAN,
	"image_path": "res://Arts/CardImages/NoblesOblige.png",
	"abilities": []
}
	card_database["economics_overflow"] = {
	"name": "Economics Overflow",
	"type": CARD_TYPE_SPELL,
	"cost": 1,
	"power": 0,
	"effect_id": "economics_overflow",
	"target_type": TARGET_NONE,
	"description": "Add 4 Inflation Counters. After you play a unit, if you can pay 1 additional mana, consume 1 Inflation Counter and that unit gains +2/+1.",
	"attack": 0,
	"hp": 0,
	"armor": 0,
	"keywords": [],
	"tags": [],
	"traits": [],
	"side": CARD_SIDE_HUMAN,
	"image_path": "res://Arts/CardImages/EconomicsOverflow.png",
	"abilities": []
}

	card_database["humble_librarian"] = {
		"name": "The Humble Librarian",
		"type": CARD_TYPE_UNIT,
		"cost": 4,
		"power": 0,
		"effect_id": "humble_librarian",
		"target_type": TARGET_NONE,
		"description": "Battlecry: Burn all cards in your hand. Draw the same number of cards.",
		"attack": 4,
		"hp": 4,
		"armor": 0,
		"keywords": [],
		"tags": [],
		"traits": ["scholar"],
		"side": CARD_SIDE_HUMAN,
		"abilities": [
			{"trigger": "battlecry", "effect": "humble_librarian"}
		]
	}

	card_database["tarnished_bookshelf"] = {
		"name": "Tarnished Bookshelf",
		"type": CARD_TYPE_UNIT,
		"cost": 5,
		"power": 0,
		"effect_id": "tarnished_bookshelf",
		"target_type": TARGET_HAND_SCHOLAR,
		"description": "Taunt. Battlecry: Choose a Scholar card in your hand. Add 4 copies of it to your deck.",
		"attack": 3,
		"hp": 5,
		"armor": 0,
		"keywords": ["taunt"],
		"tags": [],
		"traits": ["scholar"],
		"side": CARD_SIDE_HUMAN,
		"image_path": "res://Arts/CardImages/TarnishedBookshelf.png",
		"abilities": [
			{"trigger": "battlecry", "effect": "tarnished_bookshelf"}
		]
	}

	card_database["scribe_of_history"] = {
		"name": "Scribe of History",
		"type": CARD_TYPE_UNIT,
		"cost": 3,
		"power": 0,
		"effect_id": "scribe_of_history",
		"target_type": TARGET_NONE,
		"description": "Battlecry: Gain +1/+1 for each enemy unit.",
		"attack": 2,
		"hp": 2,
		"armor": 0,
		"keywords": [],
		"tags": [],
		"traits": ["scholar"],
		"side": CARD_SIDE_HUMAN,
		"abilities": [
			{"trigger": "battlecry", "effect": "scribe_of_history"}
		]
	}

	card_database["forbidden_book"] = {
		"name": "The Forbidden Book",
		"type": CARD_TYPE_SPELL,
		"cost": 10,
		"power": 0,
		"effect_id": "forbidden_book",
		"target_type": TARGET_ANY_FRIENDLY,
		"description": "Costs 1 less for each Scholar card you played this game. Destroy an allied unit. Deal damage to the enemy leader equal to that unit's cost.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": [],
		"traits": ["scholar"],
		"side": CARD_SIDE_HUMAN,
		"abilities": []
	}

	card_database["blind_researcher"] = {
		"name": "The Blind Researcher",
		"type": CARD_TYPE_UNIT,
		"cost": 2,
		"power": 0,
		"effect_id": "blind_researcher",
		"target_type": TARGET_NONE,
		"description": "Battlecry: Draw a Scholar card.",
		"attack": 2,
		"hp": 1,
		"armor": 0,
		"keywords": [],
		"tags": [],
		"traits": ["scholar"],
		"side": CARD_SIDE_HUMAN,
		"image_path": "res://Arts/CardImages/BlindResearcher.png",
		"abilities": [
			{"trigger": "battlecry", "effect": "blind_researcher"}
		]
	}

	card_database["all_knowing_archivist"] = {
		"name": "The All-Knowing Archivist",
		"type": CARD_TYPE_UNIT,
		"cost": 1,
		"power": 0,
		"effect_id": "all_knowing_archivist",
		"target_type": TARGET_NONE,
		"description": "Costs 1 more for each Scholar card you played this game, up to 10. Battlecry: Deal damage to the enemy leader equal to this card's cost.",
		"attack": 1,
		"hp": 1,
		"armor": 0,
		"keywords": [],
		"tags": [],
		"traits": ["scholar"],
		"side": CARD_SIDE_HUMAN,
		"image_path": "res://Arts/CardImages/AllKnowingArchivist.png",
		"abilities": [
			{"trigger": "battlecry", "effect": "all_knowing_archivist"}
		]
	}

	card_database["monochro_blueprint"] = {
		"name": "Monochro-Blueprint",
		"type": CARD_TYPE_SPELL,
		"cost": 8,
		"power": 0,
		"effect_id": "monochro_blueprint",
		"target_type": TARGET_NONE,
		"description": "Resurrect a Gadget unit from your graveyard. Then summon 2 copies of it.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": [],
		"traits": ["gadget", "scholar"],
		"side": CARD_SIDE_HUMAN,
		"image_path": "res://Arts/CardImages/MonochroBlueprint.png",
		"abilities": []
	}

	card_database["book_of_rushwater"] = {
		"name": "The Book of Rushwater",
		"type": CARD_TYPE_SPELL,
		"cost": 7,
		"power": 4,
		"effect_id": "book_of_rushwater",
		"target_type": TARGET_NONE,
		"description": "Deal 4 damage to all enemy units.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": [],
		"traits": ["scholar"],
		"side": CARD_SIDE_HUMAN,
		"image_path": "res://Arts/CardImages/BookOfRushwater.png",
		"abilities": []
	}

	card_database["introduction_to_armory"] = {
		"name": "Introduction to Armory",
		"type": CARD_TYPE_SPELL,
		"cost": 3,
		"power": 1,
		"effect_id": "introduction_to_armory",
		"target_type": TARGET_NONE,
		"description": "All allied units gain Armor 1.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": [],
		"traits": ["scholar"],
		"side": CARD_SIDE_HUMAN,
		"image_path": "res://Arts/CardImages/IntroductionToArmory.png",
		"abilities": []
	}

	card_database["transcribe_of_the_wicked"] = {
		"name": "Transcribe of the Wicked",
		"type": CARD_TYPE_SPELL,
		"cost": 3,
		"power": 0,
		"effect_id": "transcribe_of_the_wicked",
		"target_type": TARGET_ANY_ENEMY,
		"description": "Destroy an enemy unit with less than 4 HP.",
		"attack": 0,
		"hp": 0,
		"armor": 0,
		"keywords": [],
		"tags": [],
		"traits": ["scholar"],
		"side": CARD_SIDE_HUMAN,
		"image_path": "res://Arts/CardImages/TranscribeOfTheWicked.png",
		"abilities": []
	}

	card_database["ratatoskr_root_messenger"] = {
		"name": "Ratatoskr, Root Messenger", "type": CARD_TYPE_UNIT, "cost": 1, "attack": 1, "hp": 1,
		"description": "When played: Draw a card. Then choose a card from your hand and put it on the bottom of your deck.",
		"traits": ["animal"], "side": CARD_SIDE_GOD, "image_path": "res://Arts/CardImages/RatatoskrRootMessenger.png",
		"abilities": [{"trigger": "battlecry", "effect": "draw_then_choose_bottom_hand"}]
	}
	card_database["sleipnir_eight_legged_steed"] = {
		"name": "Sleipnir, Eight-Legged Steed", "type": CARD_TYPE_UNIT, "cost": 6, "attack": 4, "hp": 6,
		"description": "Haste. When this attacks, draw a card. If it is an Animal, it costs 1 less.",
		"keywords": ["haste"], "traits": ["animal"], "side": CARD_SIDE_GOD, "image_path": "res://Arts/CardImages/SleipnirEightLeggedSteed.png",
		"abilities": [{"trigger": "on_ally_unit_attack", "effect": "draw_then_discount_trait", "trait": "animal", "cost_reduction": 1, "only_self": true}]
	}
	card_database["fenrir_bound_wolf"] = {
		"name": "Fenrir, Bound Wolf", "type": CARD_TYPE_UNIT, "cost": 8, "attack": 7, "hp": 7,
		"description": "Taunt. Costs 1 less for each Animal that died this game. When played: Destroy the enemy unit with the highest Attack.",
		"keywords": ["taunt"], "traits": ["animal"], "side": CARD_SIDE_GOD, "image_path": "res://Arts/CardImages/FenrirBoundWolf.png",
		"abilities": [{"trigger": "battlecry", "effect": "destroy_highest_attack_enemy_unit"}]
	}
	card_database["jormungandr_world_serpent"] = {
		"name": "Jormungandr, World Serpent", "type": CARD_TYPE_UNIT, "cost": 10, "attack": 8, "hp": 12,
		"description": "When played: Shuffle all Animal cards from your graveyard into your deck. They cost 2 less.",
		"traits": ["animal"], "side": CARD_SIDE_GOD, "image_path": "res://Arts/CardImages/JormungandrWorldSerpent.png",
		"abilities": [{"trigger": "battlecry", "effect": "shuffle_graveyard_trait_into_deck_discount", "trait": "animal", "cost_reduction": 2}]
	}
	card_database["cerberus_gatehound"] = {
		"name": "Cerberus Gatehound", "type": CARD_TYPE_UNIT, "cost": 4, "attack": 3, "hp": 4,
		"description": "When destroyed: Draw a card. If it is a unit, summon a 2/2 Hound Head.",
		"traits": ["animal"], "side": CARD_SIDE_GOD, "image_path": "res://Arts/CardImages/CerberusGatehound.png",
		"abilities": [{"trigger": "when_destroyed", "effect": "draw_then_summon_if_unit", "card_id": "hound_head"}]
	}
	card_database["hound_head"] = {
		"name": "Hound Head", "type": CARD_TYPE_UNIT, "cost": 0, "attack": 2, "hp": 2,
		"description": "A loyal hound head.", "tags": ["token"], "traits": ["animal"], "side": CARD_SIDE_GOD,
		"image_path": "res://Arts/CardImages/HoundHead.png", "abilities": []
	}
	card_database["pegasus_of_dawn"] = {
		"name": "Pegasus of Dawn", "type": CARD_TYPE_UNIT, "cost": 3, "attack": 2, "hp": 3,
		"description": "Haste. When played: Give another allied Animal +1/+1.",
		"keywords": ["haste"], "traits": ["animal"], "side": CARD_SIDE_GOD, "image_path": "res://Arts/CardImages/PegasusOfDawn.png",
		"abilities": [{"trigger": "battlecry", "effect": "buff_random_other_friendly_trait_unit", "trait": "animal", "attack": 1, "hp": 1}]
	}
	card_database["phoenix_ashling"] = {
		"name": "Phoenix Ashling", "type": CARD_TYPE_UNIT, "cost": 2, "attack": 1, "hp": 1,
		"description": "When destroyed: Shuffle Phoenix Ashling into your deck with +2/+2.",
		"traits": ["animal"], "side": CARD_SIDE_GOD, "image_path": "res://Arts/CardImages/PhoenixAshling.png",
		"abilities": [{"trigger": "when_destroyed", "effect": "shuffle_buffed_copy_to_deck", "attack": 2, "hp": 2}]
	}
	card_database["sacred_cow_of_plenty"] = {
		"name": "Sacred Cow of Plenty", "type": CARD_TYPE_UNIT, "cost": 3, "attack": 1, "hp": 4,
		"description": "Turn End: Restore 2 health to your leader.", "traits": ["animal"], "side": CARD_SIDE_GOD,
		"image_path": "res://Arts/CardImages/SacredCowOfPlenty.png",
		"abilities": [{"trigger": "turn_end", "effect": "heal_leader", "amount": 2}]
	}
	card_database["white_stag"] = {
		"name": "White Stag", "type": CARD_TYPE_UNIT, "cost": 2, "attack": 2, "hp": 3,
		"description": "When played: If your hand has 5 or more cards, gain +1/+1.", "traits": ["animal"], "side": CARD_SIDE_GOD,
		"image_path": "res://Arts/CardImages/WhiteStag.png",
		"abilities": [{"trigger": "battlecry", "effect": "buff_self_if_hand_size_at_least", "required_count": 5, "attack": 1, "hp": 1}]
	}
	card_database["divine_menagerie"] = {
		"name": "Divine Menagerie", "type": CARD_TYPE_SPELL, "cost": 5, "effect_id": "divine_menagerie", "target_type": TARGET_NONE,
		"description": "Draw 2 Animal cards. They gain +1/+1.", "traits": ["animal"], "side": CARD_SIDE_GOD,
		"image_path": "res://Arts/CardImages/DivineMenagerie.png", "abilities": []
	}
	card_database["call_of_the_wild_gods"] = {
		"name": "Call of the Wild Gods", "type": CARD_TYPE_SPELL, "cost": 7, "effect_id": "call_of_the_wild_gods", "target_type": TARGET_NONE,
		"description": "Summon two random Animal units from your deck with cost 4 or less.", "traits": ["animal"], "side": CARD_SIDE_GOD,
		"image_path": "res://Arts/CardImages/CallOfTheWildGods.png", "abilities": []
	}

	card_database["wandering_shade"] = {
		"name": "Wandering Shade", "type": CARD_TYPE_UNIT, "cost": 1, "attack": 1, "hp": 1,
		"description": "When destroyed: Add a 1/1 Phantom Echo to your graveyard.", "traits": ["phantom"], "side": CARD_SIDE_GOD,
		"image_path": "res://Arts/CardImages/WanderingShade.png",
		"abilities": [{"trigger": "when_destroyed", "effect": "add_card_to_graveyard", "card_id": "phantom_echo"}]
	}
	card_database["phantom_echo"] = {
		"name": "Phantom Echo", "type": CARD_TYPE_UNIT, "cost": 1, "attack": 1, "hp": 1,
		"description": "Haste. At the end of your turn, destroy this.", "keywords": ["haste"], "tags": ["token"], "traits": ["phantom"],
		"side": CARD_SIDE_GOD, "image_path": "res://Arts/CardImages/PhantomEcho.png",
		"abilities": [{"trigger": "turn_end", "effect": "destroy_self"}]
	}
	card_database["grave_whisperer"] = {
		"name": "Grave Whisperer", "type": CARD_TYPE_UNIT, "cost": 2, "attack": 1, "hp": 3,
		"description": "When played: If a Phantom is in your graveyard, draw a card.", "traits": ["phantom"], "side": CARD_SIDE_GOD,
		"image_path": "res://Arts/CardImages/GraveWhisperer.png",
		"abilities": [{"trigger": "battlecry", "effect": "draw_if_graveyard_has_trait", "trait": "phantom", "amount": 1}]
	}
	card_database["pale_mourner"] = {
		"name": "Pale Mourner", "type": CARD_TYPE_UNIT, "cost": 3, "attack": 2, "hp": 4,
		"description": "Whenever an allied Phantom is destroyed, this gains +2 Attack.", "traits": ["phantom"], "side": CARD_SIDE_GOD,
		"image_path": "res://Arts/CardImages/PaleMourner.png",
		"abilities": [{"trigger": "on_ally_unit_destroyed", "effect": "buff_self_if_destroyed_trait", "trait": "phantom", "attack": 2}]
	}
	card_database["mirror_wraith"] = {
		"name": "Mirror Wraith", "type": CARD_TYPE_UNIT, "cost": 4, "attack": 3, "hp": 3,
		"description": "When played: Copy the last allied Phantom that died this game into your hand. It costs 1 more.", "traits": ["phantom"],
		"side": CARD_SIDE_GOD, "image_path": "res://Arts/CardImages/MirrorWraith.png",
		"abilities": [{"trigger": "battlecry", "effect": "copy_last_destroyed_trait_to_hand", "trait": "phantom", "cost_increase": 1}]
	}
	card_database["cemetery_lantern"] = {
		"name": "Cemetery Lantern", "type": CARD_TYPE_SPELL, "cost": 2, "effect_id": "cemetery_lantern", "target_type": TARGET_NONE,
		"description": "Resurrect a Phantom with 2 or less Attack. It is destroyed at the end of your turn.", "traits": ["phantom"],
		"side": CARD_SIDE_GOD, "image_path": "res://Arts/CardImages/CemeteryLantern.png", "abilities": []
	}
	card_database["the_unfinished_duelist"] = {
		"name": "The Unfinished Duelist", "type": CARD_TYPE_UNIT, "cost": 4, "attack": 5, "hp": 3,
		"description": "Haste. When this attacks and survives, return this to your hand.", "keywords": ["haste"], "traits": ["phantom"],
		"side": CARD_SIDE_GOD, "image_path": "res://Arts/CardImages/TheUnfinishedDuelist.png",
		"abilities": [{"trigger": "on_ally_unit_attack", "effect": "return_self_to_hand_after_attack", "only_self": true}]
	}
	card_database["bride_beneath_the_veil"] = {
		"name": "Bride Beneath the Veil", "type": CARD_TYPE_UNIT, "cost": 6, "attack": 3, "hp": 6,
		"description": "Taunt. When destroyed: Resurrect the lowest-cost Phantom from your graveyard.", "keywords": ["taunt"], "traits": ["phantom"],
		"side": CARD_SIDE_GOD, "image_path": "res://Arts/CardImages/BrideBeneathTheVeil.png",
		"abilities": [{"trigger": "when_destroyed", "effect": "resurrect_lowest_cost_trait_unit", "trait": "phantom"}]
	}
	card_database["king_of_empty_graves"] = {
		"name": "King of Empty Graves", "type": CARD_TYPE_UNIT, "cost": 8, "attack": 6, "hp": 6,
		"description": "When played: Resurrect up to 3 Phantoms. Then destroy all allied non-Phantom units.", "traits": ["phantom"],
		"side": CARD_SIDE_GOD, "image_path": "res://Arts/CardImages/KingOfEmptyGraves.png",
		"abilities": [{"trigger": "battlecry", "effect": "resurrect_trait_then_destroy_non_trait", "trait": "phantom", "amount": 3}]
	}
	card_database["mausoleum_pact"] = {
		"name": "Mausoleum Pact", "type": CARD_TYPE_SPELL, "cost": 4, "effect_id": "mausoleum_pact", "target_type": TARGET_NONE,
		"description": "Choose a Phantom in your graveyard. Add it to your hand. It costs 2 less and dies at turn end after it is played.",
		"traits": ["phantom"], "side": CARD_SIDE_GOD, "image_path": "res://Arts/CardImages/MausoleumPact.png", "abilities": []
	}
	card_database["the_last_haunting"] = {
		"name": "The Last Haunting", "type": CARD_TYPE_SPELL, "cost": 9, "effect_id": "the_last_haunting", "target_type": TARGET_NONE,
		"description": "Resurrect all allied Phantoms that died this game. They gain Haste. At the end of your turn, destroy them.",
		"traits": ["phantom"], "side": CARD_SIDE_GOD, "image_path": "res://Arts/CardImages/TheLastHaunting.png", "abilities": []
	}

	card_database["candle_bearer_acolyte"] = {
		"name": "Candle-Bearer Acolyte", "type": CARD_TYPE_UNIT, "cost": 1, "attack": 1, "hp": 1,
		"description": "Relic. When played: Choose a card in the enemy hand and give it Cursed. After it is played, its owner takes 1 damage.",
		"traits": ["relic"], "side": CARD_SIDE_GOD, "abilities": [{"trigger": "battlecry", "effect": "curse_random_enemy_hand", "amount": 1}]
	}
	card_database["ashen_page"] = {
		"name": "Ashen Page", "type": CARD_TYPE_UNIT, "cost": 1, "attack": 1, "hp": 1,
		"description": "Relic. When played: If a Relic is in your graveyard, draw a card and deal 1 damage to your leader.",
		"traits": ["relic"], "side": CARD_SIDE_GOD, "abilities": [{"trigger": "battlecry", "effect": "draw_if_graveyard_has_trait_and_damage_leader", "trait": "relic", "draw": 1, "damage": 1}]
	}
	card_database["beggar_of_blessings"] = {
		"name": "Beggar of Blessings", "type": CARD_TYPE_UNIT, "cost": 4, "attack": 1, "hp": 4,
		"description": "Relic. Taunt. After an enemy unit attacks this, its death deals 2 damage to its owner's leader.",
		"keywords": ["taunt"], "traits": ["relic"], "side": CARD_SIDE_GOD, "abilities": [{"trigger": "when_attacked", "effect": "give_attacker_death_damage_owner_leader", "amount": 2}]
	}
	card_database["name_scratcher"] = {
		"name": "Name-Scratcher", "type": CARD_TYPE_UNIT, "cost": 2, "attack": 1, "hp": 3,
		"description": "When played: Choose a card name from the enemy graveyard. The next enemy card with that name costs 2 more.",
		"traits": [], "side": CARD_SIDE_GOD, "abilities": [{"trigger": "battlecry", "effect": "name_scratcher"}]
	}
	card_database["the_unpaid_prayer"] = {
		"name": "The Unpaid Prayer", "type": CARD_TYPE_SPELL, "cost": 2, "effect_id": "the_unpaid_prayer", "target_type": TARGET_NONE,
		"description": "During the enemy's next turn, after their first card, they lose 1 mana or take 3 damage.",
		"traits": [], "side": CARD_SIDE_GOD, "abilities": []
	}
	card_database["relic_moth"] = {
		"name": "Relic Moth", "type": CARD_TYPE_UNIT, "cost": 4, "attack": 3, "hp": 1,
		"description": "Relic. Animal. Haste. When played: Give Cursed to all enemy units. After they attack, their owner takes 1 damage.",
		"keywords": ["haste"], "traits": ["relic", "animal"], "side": CARD_SIDE_GOD, "abilities": [{"trigger": "battlecry", "effect": "curse_all_enemy_units", "amount": 1}]
	}
	card_database["the_kneeling_idol"] = {
		"name": "The Kneeling Idol", "type": CARD_TYPE_UNIT, "cost": 3, "attack": 1, "hp": 5,
		"description": "Relic. After the enemy plays a spell, this gains +1 ATK.",
		"traits": ["relic"], "side": CARD_SIDE_GOD, "abilities": [{"trigger": "on_spell_played", "effect": "buff_self_attack", "attack": 1, "only_friendly": false, "only_enemy": true}]
	}
	card_database["relic_undertaker"] = {
		"name": "Relic Undertaker", "type": CARD_TYPE_UNIT, "cost": 3, "attack": 2, "hp": 4,
		"description": "Relic. Whenever an allied Relic is destroyed, choose a card in the enemy hand. It costs 1 more.",
		"traits": ["relic"], "side": CARD_SIDE_GOD, "abilities": [{"trigger": "on_ally_unit_destroyed", "effect": "tax_random_enemy_hand_if_destroyed_trait", "trait": "relic", "amount": 1}]
	}
	card_database["bell_ringer_of_silence"] = {
		"name": "Bell-Ringer of Silence", "type": CARD_TYPE_UNIT, "cost": 3, "attack": 1, "hp": 4,
		"description": "Relic. After the enemy plays a Battlecry unit, that unit gets -1/-1.",
		"traits": ["relic"], "side": CARD_SIDE_GOD, "abilities": [{"trigger": "on_unit_played", "effect": "debuff_battlecry_unit", "only_enemy": true}]
	}
	card_database["saintbone_clerk"] = {
		"name": "Saintbone Clerk", "type": CARD_TYPE_UNIT, "cost": 3, "attack": 1, "hp": 5,
		"description": "Relic. Turn Start: If you have 3 or more Relics in your graveyard, deal 2 damage to a random enemy.",
		"traits": ["relic"], "side": CARD_SIDE_GOD, "abilities": [{"trigger": "turn_start", "effect": "damage_random_enemy_if_graveyard_trait_count", "trait": "relic", "required_count": 3, "amount": 2}]
	}
	card_database["omen_taxman"] = {
		"name": "Omen Taxman", "type": CARD_TYPE_UNIT, "cost": 4, "attack": 2, "hp": 5,
		"description": "Relic. Prophet. When the enemy plays their third card in a turn, deal 6 damage to their leader and destroy this.",
		"traits": ["relic", "prophet"], "side": CARD_SIDE_GOD, "abilities": []
	}
	card_database["the_friendly_curse"] = {
		"name": "The Friendly Curse", "type": CARD_TYPE_SPELL, "cost": 4, "effect_id": "the_friendly_curse", "target_type": TARGET_ENEMY_UNIT,
		"description": "Give an enemy unit +2/+2. Its death deals 6 damage to its owner's leader.",
		"traits": [], "side": CARD_SIDE_GOD, "abilities": []
	}
	card_database["contract_of_soft_ruin"] = {
		"name": "Contract of Soft Ruin", "type": CARD_TYPE_SPELL, "cost": 4, "effect_id": "contract_of_soft_ruin", "target_type": TARGET_NONE,
		"description": "Give all enemy units -2/-2.", "traits": [], "side": CARD_SIDE_GOD, "abilities": []
	}
	card_database["phantom_reliquary"] = {
		"name": "Phantom Reliquary", "type": CARD_TYPE_UNIT, "cost": 5, "attack": 2, "hp": 5,
		"description": "Relic. Phantom. Whenever an allied unit is destroyed, give Cursed to a random card in the enemy deck. When drawn, it deals 2 damage to its owner.",
		"traits": ["relic", "phantom"], "side": CARD_SIDE_GOD, "abilities": [{"trigger": "on_ally_unit_destroyed", "effect": "curse_random_enemy_deck_card", "amount": 2}]
	}
	card_database["grave_counting_angel"] = {
		"name": "Grave-Counting Angel", "type": CARD_TYPE_UNIT, "cost": 6, "attack": 3, "hp": 6,
		"description": "Relic. Turn End: If 5 or more Relics have been destroyed this game, deal 5 damage to a random enemy.",
		"traits": ["relic"], "side": CARD_SIDE_GOD, "abilities": [{"trigger": "turn_end", "effect": "damage_random_enemy_if_relic_destroyed_count", "required_count": 5, "amount": 5}]
	}
	card_database["the_last_confession"] = {
		"name": "The Last Confession", "type": CARD_TYPE_SPELL, "cost": 1, "effect_id": "the_last_confession", "target_type": TARGET_NONE,
		"description": "Choose a card in the enemy hand. It costs 3 more.",
		"traits": [], "side": CARD_SIDE_GOD, "abilities": []
	}
	card_database["maw_of_the_reliquary"] = {
		"name": "Maw of the Reliquary", "type": CARD_TYPE_UNIT, "cost": 6, "attack": 5, "hp": 5,
		"description": "Battlecry: Destroy an allied unit. Deal damage equal to its HP to an enemy unit.",
		"traits": [], "side": CARD_SIDE_GOD, "abilities": [{"trigger": "battlecry", "effect": "maw_of_the_reliquary"}]
	}
	card_database["relic_of_final_shelter"] = {
		"name": "Relic of Final Shelter", "type": CARD_TYPE_UNIT, "cost": 8, "attack": 3, "hp": 10,
		"description": "Relic. Untrickable. While this is on board, your leader's HP cannot go below 1.",
		"keywords": ["untrickable"], "traits": ["relic"], "side": CARD_SIDE_GOD, "abilities": []
	}
	card_database["the_godless_testament"] = {
		"name": "The Godless Testament", "type": CARD_TYPE_UNIT, "cost": 9, "attack": 6, "hp": 9,
		"description": "Relic. Turn End: If the enemy has 3 or more Cursed cards in hand, deal 9 damage to the enemy leader.",
		"traits": ["relic"], "side": CARD_SIDE_GOD, "abilities": [{"trigger": "turn_end", "effect": "damage_leader_if_enemy_cursed_hand_count", "required_count": 3, "amount": 9}]
	}
	card_database["relic_of_the_end"] = {
		"name": "Relic of the End", "type": CARD_TYPE_SPELL, "cost": 10, "effect_id": "relic_of_the_end", "target_type": TARGET_NONE,
		"description": "Relic. For each Relic card you played this game, deal 3 damage to a random enemy or the enemy leader.",
		"traits": ["relic"], "side": CARD_SIDE_GOD, "abilities": []
	}

	card_database["the_overworking_engineer"] = {
		"name": "The Overworking Engineer", "type": CARD_TYPE_UNIT, "cost": 5, "attack": 2, "hp": 3,
		"effect_id": EFFECT_NONE, "target_type": TARGET_NONE,
		"description": "Turn end: Deal X DMG to the enemy leader. X is the number of Gadget units on your board.",
		"traits": ["gadget"], "side": CARD_SIDE_HUMAN,
		"abilities": [{"trigger": "turn_end", "effect": "damage_enemy_leader_by_board_trait_count", "trait": "gadget"}]
	}
	card_database["leftover_scraps"] = {
		"name": "Leftover Scraps", "type": CARD_TYPE_UNIT, "cost": 0, "attack": 1, "hp": 1,
		"effect_id": EFFECT_NONE, "target_type": TARGET_NONE,
		"description": "", "traits": ["gadget"], "side": CARD_SIDE_HUMAN, "abilities": []
	}
	card_database["mecha_juggernaut"] = {
		"name": "Mecha-Juggernaut", "type": CARD_TYPE_UNIT, "cost": 7, "attack": 3, "hp": 6,
		"effect_id": EFFECT_NONE, "target_type": TARGET_NONE,
		"description": "Armor 1. Taunt. When damaged by an enemy unit: This deals 2 DMG to all enemy units.",
		"armor": 1, "keywords": ["taunt"], "traits": ["gadget"], "side": CARD_SIDE_HUMAN, "abilities": []
	}
	card_database["raise_the_anchor"] = {
		"name": "Raise the Anchor!", "type": CARD_TYPE_SPELL, "cost": 2, "effect_id": EFFECT_RAISE_THE_ANCHOR, "target_type": TARGET_ENEMY_UNIT,
		"description": "Select an enemy unit. That unit is granted: \"When your own turn ends: destroy this.\"",
		"traits": ["marine"], "side": CARD_SIDE_HUMAN, "abilities": []
	}
	card_database["helmet_helmsman"] = {
		"name": "Helmet Helmsman", "type": CARD_TYPE_UNIT, "cost": 1, "attack": 0, "hp": 1,
		"effect_id": EFFECT_NONE, "target_type": TARGET_NONE,
		"description": "When played: If you played another Marine card this turn already, this gains +2/+2.",
		"traits": ["marine"], "side": CARD_SIDE_HUMAN, "abilities": [{"trigger": "battlecry", "effect": "helmet_helmsman"}]
	}
	card_database["the_captain_on_fire"] = {
		"name": "The Captain on Fire", "type": CARD_TYPE_UNIT, "cost": 7, "attack": 2, "hp": 5,
		"effect_id": EFFECT_NONE, "target_type": TARGET_NONE,
		"description": "When played: Destroy another unit on the board. Your Marine units have Deadly.",
		"traits": ["marine"], "side": CARD_SIDE_HUMAN,
		"abilities": [
			{"trigger": "battlecry", "effect": "the_captain_on_fire"},
			{"trigger": "aura", "effect": "grant_keywords_to_trait", "target": "friendly_units_with_trait", "trait": "marine", "keywords": ["deadly"]}
		]
	}
	card_database["symphonic_illusion"] = {
		"name": "Symphonic Illusion", "type": CARD_TYPE_SPELL, "cost": 5, "effect_id": EFFECT_SYMPHONIC_ILLUSION, "target_type": TARGET_NONE,
		"description": "Summon a Gig Drummer and Marching Trumpeter on your field. Then all ally Music units gain +1 HP.",
		"traits": ["music"], "side": CARD_SIDE_HUMAN, "abilities": []
	}
	card_database["the_forbidden_music_box"] = {
		"name": "The Forbidden Music Box", "type": CARD_TYPE_UNIT, "cost": 5, "attack": 4, "hp": 4,
		"effect_id": EFFECT_NONE, "target_type": TARGET_NONE,
		"description": "Each once per turn, when an ally Music unit attacks: draw 1 Music unit from your deck. when an ally Music spell is played: draw 1 Music spell from your deck.",
		"traits": ["music", "gadget"], "side": CARD_SIDE_HUMAN,
		"abilities": [
			{"trigger": "on_ally_unit_attack", "effect": "draw_trait_unit_from_deck_once", "trait": "music", "flag": "music_unit_attack"},
			{"trigger": "on_spell_played", "effect": "draw_trait_spell_from_deck_once", "trait": "music", "flag": "music_spell_played"}
		]
	}
	card_database["the_tale_of_bravery"] = {
		"name": "The Tale of Bravery", "type": CARD_TYPE_SPELL, "cost": 10, "effect_id": EFFECT_THE_TALE_OF_BRAVERY, "target_type": TARGET_ANY_FRIENDLY,
		"description": "This spell costs 1 less for each Music card you have played this game. When played: Select an ally unit. That unit has Rush.",
		"traits": ["music"], "side": CARD_SIDE_HUMAN, "abilities": []
	}
	card_database["bookworm"] = {
		"name": "Bookworm", "type": CARD_TYPE_UNIT, "cost": 1, "attack": 0, "hp": 2,
		"effect_id": EFFECT_NONE, "target_type": TARGET_NONE,
		"description": "Turn Start: Draw 2 cards from your deck and destroy this card.",
		"traits": ["scholar"], "side": CARD_SIDE_HUMAN, "abilities": [{"trigger": "turn_start", "effect": "draw_then_destroy_self", "amount": 2}]
	}
	card_database["the_hieroglyphic_scribe"] = {
		"name": "The Hieroglyphic Scribe", "type": CARD_TYPE_UNIT, "cost": 5, "attack": 3, "hp": 4,
		"effect_id": EFFECT_NONE, "target_type": TARGET_NONE,
		"description": "When played: Select and resurrect a Scribe unit from your graveyard.",
		"traits": ["scholar"], "side": CARD_SIDE_HUMAN, "abilities": [{"trigger": "battlecry", "effect": "the_hieroglyphic_scribe"}]
	}
	card_database["crystal_ball"] = {
		"name": "Crystal Ball", "type": CARD_TYPE_UNIT, "cost": 3, "attack": 3, "hp": 3,
		"effect_id": EFFECT_NONE, "target_type": TARGET_NONE,
		"description": "When played: If possible, select and burn a Prophet card in your hand, and this gains +X/+X. X is that burnt card's cost.",
		"traits": ["prophet"], "side": CARD_SIDE_GOD, "abilities": [{"trigger": "battlecry", "effect": "crystal_ball"}]
	}
	card_database["the_acolyte_of_dreams"] = {
		"name": "The Acolyte of Dreams", "type": CARD_TYPE_UNIT, "cost": 7, "attack": 3, "hp": 2,
		"effect_id": EFFECT_NONE, "target_type": TARGET_NONE,
		"description": "Rush. When played: All non-Prophet units gain Immobile until the end of next turn.",
		"keywords": ["rush"], "traits": ["prophet"], "side": CARD_SIDE_GOD, "abilities": [{"trigger": "battlecry", "effect": "the_acolyte_of_dreams"}]
	}
	card_database["the_believer_of_souls"] = {
		"name": "The Believer of Souls", "type": CARD_TYPE_UNIT, "cost": 6, "attack": 4, "hp": 5,
		"effect_id": EFFECT_NONE, "target_type": TARGET_NONE,
		"description": "Heal X HP to your leader. X is the number of ally units in your graveyard.",
		"traits": ["prophet", "phantom"], "side": CARD_SIDE_GOD, "abilities": [{"trigger": "battlecry", "effect": "the_believer_of_souls"}]
	}
	card_database["prophecy_ouroboros"] = {
		"name": "Prophecy Ouroboros", "type": CARD_TYPE_SPELL, "cost": 9, "effect_id": EFFECT_PROPHECY_OUROBOROS, "target_type": TARGET_NONE,
		"description": "For the rest of the battle: Each turn, the first Prophet card you play costs 0 instead.",
		"traits": ["prophet"], "side": CARD_SIDE_GOD, "abilities": []
	}


func make_test_deck() -> Array[CardData]:
	var deck_ids: Array[String] = [
		"slash", "slash", "slash", "slash",
		"fireball", "fireball", "fireball", "fireball",
		"armored_knight", "armored_knight", "armored_knight", "armored_knight",
		"Novice Soldier", "Novice Soldier", "Novice Soldier", "Novice Soldier",
		"guardian", "guardian",
		"quick_blade", "quick_blade",
		"slash", "slash",
		"fireball", "fireball",
		"armored_knight", "armored_knight",
		"Novice Soldier", "Novice Soldier",
		"guardian", "quick_blade"
	]

	var deck: Array[CardData] = []

	for card_id in deck_ids:
		var card := make_card_from_id(card_id)
		if card != null:
			deck.append(card)

	return deck


func make_spell_card(card_name: String, cost: int, power: int, effect_id: String, target_type: String) -> CardData:
	var card := CardData.new()
	card.card_name = card_name
	card.cost = cost
	card.power = power
	card.effect_id = effect_id
	card.card_type = CARD_TYPE_SPELL
	card.target_type = target_type

	match effect_id:
		EFFECT_DAMAGE:
			card.description = "Deal %d damage." % power
		EFFECT_HEAL:
			card.description = "Heal %d HP." % power
		EFFECT_DRAW:
			card.description = "Draw %d card(s)." % power
		_:
			card.description = "No effect."

	return card


@warning_ignore("shadowed_variable_base_class")
func make_unit_card(name: String, cost: int, attack: int, hp: int, keywords: Array[String] = []) -> CardData:
	var card := CardData.new()

	card.card_name = name
	card.cost = cost
	card.power = 0
	card.effect_id = "none"
	card.description = ""

	card.card_type = "unit"
	card.target_type = "none"

	card.attack = attack
	card.hp = hp
	card.max_hp = hp
	card.base_attack = attack
	card.base_hp = hp
	card.can_attack = false
	card.exhausted = true
	card.summoned_this_turn = false
	card.has_attacked_this_turn = false
	
	card.rarity = "common"
	card.tags = []
	card.keywords = keywords.duplicate()

	return card
	
func get_all_card_definitions() -> Array[Dictionary]:
	var definitions: Array[Dictionary] = []

	for card_id in card_database.keys():
		var data: Dictionary = card_database[card_id]

		var tags: Array = data.get("tags", [])
		if tags.has("token"):
			continue

		definitions.append({
			"id": str(card_id),
			"name": str(data.get("name", card_id)),
			"type": str(data.get("type", CARD_TYPE_SPELL)),
			"cost": int(data.get("cost", 0)),
			"power": int(data.get("power", 0)),
			"attack": int(data.get("attack", 0)),
			"hp": int(data.get("hp", 0)),
			"armor": int(data.get("armor", 0)),
			"description": str(data.get("description", "")),
			"keywords": data.get("keywords", []).duplicate(true),
			"tags": data.get("tags", []).duplicate(true),
			"traits": data.get("traits", []).duplicate(true),
			"side": str(data.get("side", CARD_SIDE_HUMAN)),
			"image_path": str(data.get("image_path", ""))
		})

	return definitions
	
func get_card_definition(card_id: String) -> Dictionary:
	for card_def in get_all_card_definitions():
		if card_def.get("id", "") == card_id:
			return card_def

	return {}

func get_available_card_ids() -> Array[String]:
	var ids: Array[String] = []

	for card_id in card_database.keys():
		ids.append(str(card_id))

	return ids
	
func get_card_display_name(card_id: String) -> String:
	card_id = resolve_card_id(card_id)
	if not card_database.has(card_id):
		return card_id

	return str(card_database[card_id].get("name", card_id))


func resolve_card_id(raw_card_id: String) -> String:
	var clean_id: String = raw_card_id.strip_edges()
	if clean_id == "":
		return ""

	if card_database.has(clean_id):
		return clean_id

	var lower_id: String = clean_id.to_lower()
	for database_id in card_database.keys():
		var key: String = str(database_id)
		if key.to_lower() == lower_id:
			return key

	var snake_id: String = clean_id.to_lower().replace("'", "").replace(",", "").replace("!", "").replace("?", "")
	snake_id = snake_id.replace("-", " ").replace("/", " ").replace(":", " ").replace(".", " ")
	while snake_id.find("  ") >= 0:
		snake_id = snake_id.replace("  ", " ")
	snake_id = snake_id.strip_edges().replace(" ", "_")
	if card_database.has(snake_id):
		return snake_id

	for database_id in card_database.keys():
		var key: String = str(database_id)
		var data: Dictionary = card_database[key]
		if str(data.get("name", key)).to_lower() == lower_id:
			return key

	return clean_id
			
func make_card_from_id(card_id: String) -> CardData:
	card_id = resolve_card_id(card_id)
	if not card_database.has(card_id):
		print("Unknown card_id in CardLibrary: ", card_id)
		return null

	var data: Dictionary = card_database[card_id]
	var card := CardData.new()

	card.card_id = card_id
	card.card_name = str(data.get("name", card_id))
	card.card_type = str(data.get("type", CARD_TYPE_SPELL))
	card.cost = int(data.get("cost", 0))
	card.power = int(data.get("power", 0))
	card.effect_id = str(data.get("effect_id", EFFECT_NONE))
	card.target_type = str(data.get("target_type", TARGET_NONE))
	card.description = str(data.get("description", ""))
	card.side = str(data.get("side", CARD_SIDE_HUMAN))
	card.image_path = str(data.get("image_path", ""))
	
	card.attack = int(data.get("attack", 0))
	card.hp = int(data.get("hp", 0))
	card.max_hp = card.hp
	card.base_attack = card.attack
	card.base_hp = card.max_hp
	card.armor = int(data.get("armor", 0))
	
	card.can_attack = false
	card.exhausted = true
	card.summoned_this_turn = false
	card.has_attacked_this_turn = false
	card.max_attacks_per_turn = int(data.get("max_attacks_per_turn", 1))
	card.attacks_this_turn = 0

	card.attack_sfx = str(data.get("attack_sfx", ""))
	card.defense_sfx = str(data.get("defense_sfx", ""))
	card.play_sfx = str(data.get("play_sfx", ""))
	card.death_sfx = str(data.get("death_sfx", ""))
	
	card.keywords = []
	if data.has("keywords"):
		for keyword in data["keywords"]:
			card.keywords.append(str(keyword))

	card.tags = []
	if data.has("tags"):
		for tag in data["tags"]:
			card.tags.append(str(tag))

	card.traits = []
	if data.has("traits"):
		for trait_name in data["traits"]:
			card.traits.append(str(trait_name))

	card.abilities = []
	if data.has("abilities"):
		for ability in data["abilities"]:
			card.abilities.append(ability.duplicate(true))
	
	return card

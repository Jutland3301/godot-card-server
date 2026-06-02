"use strict";

const assert = require("assert");
const C = require("../battle/constants");
const Effects = require("../battle/effects");
const BattleEngine = require("../battle_engine");
const Targets = require("../battle/targets");
const Triggers = require("../battle/triggers");
const State = require("../battle/state");
const { makeCardFromId } = require("../cards_database");

function makeState() {
  const state = {
    turn_seat: "A",
    current_player_id: "player1",
    turn_number: 1,
    game_over: false,
    player1: { name: "A", hp: 20, max_hp: 20, mana: 100, max_mana: 100, deck: [], hand: [], board: [], graveyard: [] },
    player2: { name: "B", hp: 20, max_hp: 20, mana: 100, max_mana: 100, deck: [], hand: [], board: [], graveyard: [] },
    log: [],
    battle_log_messages: []
  };
  State.normalizeState(state);
  return state;
}

{
  const state = makeState();
  const nonMarine = makeCardFromId("guardian");
  const marine = makeCardFromId("star_gazer");
  state.player1.hand.push(nonMarine, marine);
  const spell = makeCardFromId("scavenge_command");

  const result = Effects.resolveSpellOrCardEffect(state, "A", spell);
  assert.strictEqual(result.pending, true, "Scavenge Command should wait for a visible card choice.");
  assert.deepStrictEqual(state.pending_hand_candidate_indexes, [1], "Only the Marine hand position should be a candidate.");

  const resolved = Effects.resolveHandSelection(state, "A", 0);
  assert.strictEqual(resolved.ok, true, "Visible candidate index 0 should select the only displayed Marine.");
  assert.ok(marine.keywords.includes(C.KEYWORD_HASTE), "The selected Marine should gain Haste.");
}

{
  const state = makeState();
  const firstUnit = makeCardFromId("guardian");
  const chosenUnit = makeCardFromId("armored_knight");
  state.player1.graveyard.push(firstUnit, chosenUnit);
  const spell = makeCardFromId("encompassed_compass");

  const result = Effects.resolveSpellOrCardEffect(state, "A", spell);
  assert.strictEqual(result.pending, true, "Encompassed Compass should wait for graveyard selection.");
  assert.strictEqual(state.pending_card_selection_zone, "graveyard", "Compass candidates should come from graveyard.");
  assert.deepStrictEqual(state.pending_hand_candidate_indexes, [0, 1], "All unit graveyard candidates should be visible.");
  assert.strictEqual(State.makePublicState(state).pending_card_selection_zone, "graveyard", "Graveyard selection zone should be sent to clients.");

  Effects.resolveHandSelection(state, "A", 1);
  assert.ok(state.player1.board.includes(chosenUnit), "Compass should resurrect the chosen graveyard unit.");
  assert.ok(state.player1.graveyard.includes(firstUnit), "Compass should preserve the unchosen graveyard unit.");
  assert.strictEqual(chosenUnit.cannot_attack_leader, true, "Compass leader restriction should remain applied.");
}

{
  const state = makeState();
  const chosenGadget = makeCardFromId("flying_fortress");
  const otherGadget = makeCardFromId("autocannon");
  state.player1.graveyard.push(chosenGadget, otherGadget);
  const spell = makeCardFromId("monochro_blueprint");

  const result = Effects.resolveSpellOrCardEffect(state, "A", spell);
  assert.strictEqual(result.pending, true, "Monochro-Blueprint should wait for graveyard selection.");
  assert.strictEqual(state.pending_card_selection_zone, "graveyard", "Blueprint candidates should come from graveyard.");

  Effects.resolveHandSelection(state, "A", 0);
  assert.ok(state.player1.board.includes(chosenGadget), "Blueprint should summon the chosen Gadget.");
  assert.strictEqual(state.player1.board.length, 3, "Blueprint should summon the chosen Gadget and two copies.");

  const serialized = State.makePublicState(state);
  assert.strictEqual(serialized.pending_card_selection_zone, "hand", "Completed selection should serialize as cleared.");
}

{
  const state = makeState();
  const spell = makeCardFromId("paint_barrel");
  const returnedUnit = makeCardFromId("guardian");
  const drawnUnit = makeCardFromId("star_gazer");
  state.player1.hand.push(spell, returnedUnit);
  state.player1.deck.push(drawnUnit);

  let result = BattleEngine.handleBattleAction({ state }, "A", { action: "hand_card_clicked", hand_index: 0 }, { makeCardFromId });
  assert.strictEqual(result.ok, true, "Paint Barrel should wait for a visible unit choice.");
  assert.strictEqual(state.selecting_hand_card, true, "Paint Barrel selection should be active.");

  result = BattleEngine.handleBattleAction({ state }, "A", { action: "select_hand_card", hand_index: 0 }, { makeCardFromId });
  assert.strictEqual(result.ok, true, "Paint Barrel visible choice should resolve.");
  assert.ok(state.player1.hand.includes(drawnUnit), "Paint Barrel should draw the eligible another-trait unit.");
  assert.ok(state.player1.graveyard.some(card => card.card_id === "paint_barrel"), "Paint Barrel should enter graveyard after selection.");
}

{
  const state = makeState();
  const spell = makeCardFromId("paint_barrel");
  state.player1.hand.push(spell, makeCardFromId("guardian"));
  state.player1.deck.push(makeCardFromId("star_gazer"));
  const manaBefore = state.player1.mana;

  BattleEngine.handleBattleAction({ state }, "A", { action: "hand_card_clicked", hand_index: 0 }, { makeCardFromId });
  const result = BattleEngine.handleBattleAction({ state }, "A", { action: "cancel_hand_selection" }, { makeCardFromId });

  assert.strictEqual(result.ok, true, "Hand selection cancellation should succeed.");
  assert.strictEqual(state.player1.mana, manaBefore, "Cancelled hand selection should refund mana.");
  assert.ok(state.player1.hand.some(card => card.card_id === "paint_barrel"), "Cancelled hand selection should return the spell.");
}

{
  const state = makeState();
  const ratatoskr = makeCardFromId("ratatoskr_root_messenger");
  const chosenCard = makeCardFromId("guardian");
  state.player1.hand.push(ratatoskr, chosenCard);
  state.player1.deck.push(makeCardFromId("star_gazer"));

  BattleEngine.handleBattleAction({ state }, "A", { action: "hand_card_clicked", hand_index: 0 }, { makeCardFromId });
  assert.strictEqual(state.selecting_hand_card, true, "Ratatoskr should wait for a visible hand choice.");
  assert.deepStrictEqual(state.pending_hand_candidate_indexes, [0, 1], "Ratatoskr should expose the post-draw hand.");

  BattleEngine.handleBattleAction({ state }, "A", { action: "select_hand_card", hand_index: 0 }, { makeCardFromId });
  assert.strictEqual(state.player1.deck[0].card_id, "guardian", "Ratatoskr should bottom the chosen hand card.");
}

{
  const state = makeState();
  const spell = makeCardFromId("the_last_confession");
  const firstEnemyCard = makeCardFromId("guardian");
  const chosenEnemyCard = makeCardFromId("star_gazer");
  state.player2.hand.push(firstEnemyCard, chosenEnemyCard);

  const result = Effects.resolveSpellOrCardEffect(state, "A", spell);
  assert.strictEqual(result.pending, true, "The Last Confession should wait for an enemy hand choice.");
  assert.deepStrictEqual(state.pending_hand_candidate_indexes, [0, 1], "The Last Confession should expose the full enemy hand.");
  assert.strictEqual(State.makePublicState(state).pending_card_selection_owner, "player2", "Clients should rebuild candidates from the enemy hand.");

  Effects.resolveHandSelection(state, "A", 1);
  assert.strictEqual(chosenEnemyCard.cost, 5, "The chosen enemy card should cost 3 more.");
  assert.strictEqual(firstEnemyCard.cost, 2, "The unchosen enemy card should remain unchanged.");
}

{
  const state = makeState();
  const strategist = makeCardFromId("royal_strategist");
  state.player1.board.push(strategist);
  state.player1.deck.push(makeCardFromId("guardian"), makeCardFromId("guardian"));

  Triggers.resolveOnUnitPlayed(state, "A", makeCardFromId("Novice Soldier"));
  Triggers.resolveOnUnitPlayed(state, "A", makeCardFromId("Novice Soldier"));
  assert.strictEqual(state.player1.hand.length, 1, "Royal Strategist should trigger only once per turn.");

  State.beginTurnBasics(state, "A");
  Triggers.resolveOnUnitPlayed(state, "A", makeCardFromId("Novice Soldier"));
  assert.strictEqual(state.player1.hand.length, 2, "Royal Strategist should reset on its owner's next turn.");
}

{
  const state = makeState();
  const harp = makeCardFromId("obsidian_harp");
  const firstEnemyUnit = makeCardFromId("guardian");
  const chosenEnemyUnit = makeCardFromId("star_gazer");
  state.player1.hp = 15;
  state.player1.hand.push(harp);
  state.player2.board.push(firstEnemyUnit, chosenEnemyUnit);

  let result = BattleEngine.handleBattleAction({ state }, "A", { action: "hand_card_clicked", hand_index: 0 }, { makeCardFromId });
  assert.strictEqual(result.ok, true, "Obsidian Harp should enter target selection.");
  assert.strictEqual(state.selecting_target, true, "Obsidian Harp should wait for the player's enemy unit choice.");

  result = BattleEngine.handleBattleAction({ state }, "A", { action: "board_slot_clicked", owner_id: "player2", board_index: 1 }, { makeCardFromId });
  assert.strictEqual(result.ok, true, "Obsidian Harp selected target should resolve.");
  assert.ok(state.player2.board.includes(firstEnemyUnit), "Obsidian Harp should preserve the unchosen enemy unit.");
  assert.ok(!state.player2.board.includes(chosenEnemyUnit), "Obsidian Harp should destroy the chosen enemy unit.");
  assert.strictEqual(state.player1.hp, 19, "Obsidian Harp should heal its leader for 4.");
}

{
  const state = makeState();
  const spellblader = makeCardFromId("spellblader");
  const firstSpell = makeCardFromId("holy_missiles");
  const chosenSpell = makeCardFromId("paint_barrel");
  state.player1.hand.push(firstSpell, chosenSpell);

  Triggers.resolveBattlecry(state, "A", spellblader);
  assert.strictEqual(state.selecting_hand_card, true, "Spellblader should wait for a visible spell choice.");
  Effects.resolveHandSelection(state, "A", 1);
  assert.ok(state.player1.hand.includes(firstSpell), "Spellblader should preserve the unchosen spell.");
  assert.ok(state.player1.graveyard.includes(chosenSpell), "Spellblader should burn the chosen spell.");
  assert.strictEqual(spellblader.attack, 5, "Spellblader should gain +2 ATK after the chosen burn.");
}

{
  const state = makeState();
  const acolyte = makeCardFromId("candle_bearer_acolyte");
  const firstEnemyCard = makeCardFromId("guardian");
  const chosenEnemyCard = makeCardFromId("star_gazer");
  state.player2.hand.push(firstEnemyCard, chosenEnemyCard);

  Triggers.resolveBattlecry(state, "A", acolyte);
  assert.strictEqual(state.pending_card_selection_owner, "player2", "Candle-Bearer should expose the enemy hand.");
  Effects.resolveHandSelection(state, "A", 1);
  assert.strictEqual(Number(firstEnemyCard.cursed_after_play_damage || 0), 0, "Candle-Bearer should preserve the unchosen enemy card.");
  assert.strictEqual(chosenEnemyCard.cursed_after_play_damage, 1, "Candle-Bearer should curse the chosen enemy card.");
}

{
  const state = makeState();
  const loneKnight = makeCardFromId("lone_knight");
  const firstSoldier = makeCardFromId("guardian");
  const chosenSoldier = makeCardFromId("armored_knight");
  const firstAttackBefore = firstSoldier.attack;
  const chosenAttackBefore = chosenSoldier.attack;
  state.player1.hand.push(firstSoldier, chosenSoldier);

  Triggers.resolveWhenDestroyedAbilities(state, "A", loneKnight);
  assert.strictEqual(state.selecting_hand_card, true, "Lone Knight should wait for a visible Soldier choice.");
  Effects.resolveHandSelection(state, "A", 1);
  assert.strictEqual(firstSoldier.attack, firstAttackBefore, "Lone Knight should preserve the unchosen Soldier.");
  assert.strictEqual(chosenSoldier.attack, chosenAttackBefore + 1, "Lone Knight should buff the chosen Soldier.");
}

{
  const state = makeState();
  const undertaker = makeCardFromId("relic_undertaker");
  const destroyedRelic = makeCardFromId("candle_bearer_acolyte");
  const firstEnemyCard = makeCardFromId("guardian");
  const chosenEnemyCard = makeCardFromId("star_gazer");
  state.player1.board.push(undertaker);
  state.player2.hand.push(firstEnemyCard, chosenEnemyCard);

  Triggers.resolveOnAllyUnitDestroyedTriggers(state, "A", destroyedRelic);
  assert.strictEqual(state.pending_card_selection_owner, "player2", "Relic Undertaker should expose the enemy hand.");
  Effects.resolveHandSelection(state, "A", 1);
  assert.strictEqual(firstEnemyCard.cost, 2, "Relic Undertaker should preserve the unchosen enemy card.");
  assert.strictEqual(chosenEnemyCard.cost, 3, "Relic Undertaker should tax the chosen enemy card.");
}

{
  const state = makeState();
  const trap = makeCardFromId("witchcraft_trap");
  const chosenGadget = makeCardFromId("paint_barrel");
  const untouchedGadget = makeCardFromId("autocannon");
  state.player1.board.push(trap);
  state.player1.hand.push(chosenGadget, untouchedGadget);
  state.player2.board.push(makeCardFromId("guardian"));

  let result = BattleEngine.handleBattleAction({ state }, "A", { action: "end_turn" }, { makeCardFromId });
  assert.strictEqual(state.selecting_hand_card, true, "Witchcraft Trap should pause turn transition for a visible hand choice.");
  assert.strictEqual(state.turn_seat, "A", "Turn should remain active until Witchcraft Trap choice resolves.");
  result = BattleEngine.handleBattleAction({ state }, "A", { action: "select_hand_card", hand_index: 0 }, { makeCardFromId });
  assert.strictEqual(result.ok, true, "Witchcraft Trap chosen card should resolve.");
  assert.strictEqual(state.turn_seat, "B", "Turn should advance after Witchcraft Trap choice resolves.");
  assert.ok(!state.player1.hand.includes(chosenGadget), "Witchcraft Trap should return the chosen Gadget.");
  assert.ok(state.player1.hand.includes(untouchedGadget), "Witchcraft Trap should preserve the unchosen Gadget.");
}

{
  const state = makeState();
  state.player1.board.push(makeCardFromId("witchcraft_trap"));
  state.player1.hand.push(makeCardFromId("paint_barrel"));

  BattleEngine.handleBattleAction({ state }, "A", { action: "end_turn" }, { makeCardFromId });
  const result = BattleEngine.handleBattleAction({ state }, "A", { action: "cancel_hand_selection" }, { makeCardFromId });
  assert.strictEqual(result.ok, true, "Cancelling an automatic hand choice should succeed.");
  assert.strictEqual(state.turn_seat, "B", "Cancelling Witchcraft Trap choice should still complete the turn transition.");
  assert.strictEqual(state.player1.hand.length, 1, "Cancelling Witchcraft Trap choice should preserve the hand.");
}

{
  const state = makeState();
  const lamentation = makeCardFromId("lamentation_of_life");
  const largeUnit = makeCardFromId("guardian");
  largeUnit.attack = 4;
  state.player2.board.push(largeUnit);
  assert.strictEqual(Targets.hasValidPlayTargetForCard(state, "A", lamentation), false, "Lamentation should not accept units above 3 ATK.");
}

{
  const state = makeState();
  const lamentation = makeCardFromId("lamentation_of_life");
  const validUnit = makeCardFromId("star_gazer");
  const invalidUnit = makeCardFromId("guardian");
  invalidUnit.attack = 4;
  state.player1.hand.push(lamentation);
  state.player2.board.push(validUnit, invalidUnit);
  const manaBefore = state.player1.mana;

  BattleEngine.handleBattleAction({ state }, "A", { action: "hand_card_clicked", hand_index: 0 }, { makeCardFromId });
  const result = BattleEngine.handleBattleAction({ state }, "A", { action: "board_slot_clicked", owner_id: "player2", board_index: 1 }, { makeCardFromId });

  assert.strictEqual(result.ok, false, "Lamentation should reject a no-effect target payload.");
  assert.strictEqual(state.selecting_target, false, "Invalid target clicks should cancel target selection.");
  assert.strictEqual(state.player1.mana, manaBefore, "Invalid target cancellation should not spend mana.");
  assert.ok(state.player1.hand.includes(lamentation), "Invalid target cancellation should preserve the spell in hand.");
}

console.log("[CARD_SELECTION_SMOKE] PASS");

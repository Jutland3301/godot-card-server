"use strict";

const assert = require("assert");
const C = require("../battle/constants");
const Effects = require("../battle/effects");
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

console.log("[CARD_SELECTION_SMOKE] PASS");

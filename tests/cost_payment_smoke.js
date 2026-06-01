"use strict";

const assert = require("assert");
const BattleEngine = require("../battle_engine");
const C = require("../battle/constants");
const State = require("../battle/state");
const { getAvailableCardIds, isDeckBuildableCard, makeCardFromId } = require("../cards_database");

assert.strictEqual(C.MAX_HAND_SIZE, 9, "Battle hand limit should be 9.");

assert.strictEqual(isDeckBuildableCard("the_threefold_saint_token"), false, "Generated saint token must not be deck-buildable.");
assert.strictEqual(isDeckBuildableCard("hound_head"), false, "Generated hound token must not be deck-buildable.");
assert.strictEqual(isDeckBuildableCard("doodle"), false, "Generated Doodle token must not be deck-buildable.");

for (const cardId of getAvailableCardIds()) {
  assert.strictEqual(isDeckBuildableCard(cardId), true, `Available card list contains a non-deck card: ${cardId}`);
}

function makeState(seat, card) {
  const otherSeat = seat === "A" ? "B" : "A";
  return {
    turn_seat: seat,
    current_player_id: seat === "A" ? "player1" : "player2",
    turn_number: 6,
    game_over: false,
    selecting_target: false,
    selecting_hand_card: false,
    players: {
      [seat]: {
        name: seat === "A" ? "Human" : "God",
        hp: 30,
        max_hp: 30,
        mana: card.cost,
        max_mana: card.cost,
        deck: [],
        hand: [card],
        board: [],
        graveyard: []
      },
      [otherSeat]: {
        name: "Opponent",
        hp: 30,
        max_hp: 30,
        mana: 0,
        max_mana: 0,
        deck: [],
        hand: [],
        board: [],
        graveyard: []
      }
    },
    owner_to_seat_id: { player1: "A", player2: "B" },
    seat_to_owner_id: { A: "player1", B: "player2" },
    log: [],
    battle_log_messages: []
  };
}

for (const side of ["human", "god"]) {
  for (const cardId of getAvailableCardIds()) {
    const card = makeCardFromId(cardId);
    if (!card || card.side !== side || card.card_type !== "unit") continue;
    if (card.card_id === "nimbus_outpost") continue;

    const seat = side === "human" ? "A" : "B";
    const state = makeState(seat, card);
    const result = BattleEngine.handleBattleAction({ state }, seat, {
      action: "hand_card_clicked",
      hand_index: 0
    }, { makeCardFromId });

    assert.strictEqual(result.ok, true, `${side} exact-cost unit failed: ${card.card_id} cost=${card.cost} msg=${result.message}`);
    assert.strictEqual(state.players[seat].mana, 0, `${side} exact-cost unit did not spend all mana: ${card.card_id}`);
  }
}

const inflationCard = makeCardFromId("guardian");
const inflationState = makeState("A", inflationCard);
inflationState.players.A.mana = 3;
inflationState.players.A.max_mana = 3;
inflationState.players.A.inflation_counters = 1;
const publicInflationState = State.makePublicState(inflationState);
assert.strictEqual(publicInflationState.players.A.hand[0].play_cost, 2, "Inflation must not increase the visible unit play cost.");

let inflationResult = BattleEngine.handleBattleAction({ state: inflationState }, "A", {
  action: "hand_card_clicked",
  hand_index: 0
}, { makeCardFromId });
assert.strictEqual(inflationResult.ok, true, "Inflation unit play should resolve.");
assert.strictEqual(inflationState.players.A.mana, 0, "Inflation should spend 1 additional mana after the normal unit cost.");
assert.strictEqual(inflationState.players.A.inflation_counters, 0, "Paid Inflation should consume one counter.");
assert.strictEqual(inflationState.players.A.board[0].attack, 4, "Paid Inflation should grant +2 ATK.");
assert.strictEqual(inflationState.players.A.board[0].max_hp, 4, "Paid Inflation should grant +1 max HP.");

const insufficientInflationCard = makeCardFromId("guardian");
const insufficientInflationState = makeState("A", insufficientInflationCard);
insufficientInflationState.players.A.mana = 2;
insufficientInflationState.players.A.max_mana = 2;
insufficientInflationState.players.A.inflation_counters = 1;
inflationResult = BattleEngine.handleBattleAction({ state: insufficientInflationState }, "A", {
  action: "hand_card_clicked",
  hand_index: 0
}, { makeCardFromId });
assert.strictEqual(inflationResult.ok, true, "Exact-cost unit play should still resolve with Inflation counters.");
assert.strictEqual(insufficientInflationState.players.A.mana, 0, "Exact-cost unit play should spend only its normal cost.");
assert.strictEqual(insufficientInflationState.players.A.inflation_counters, 1, "Unpaid Inflation should preserve its counter.");
assert.strictEqual(insufficientInflationState.players.A.board[0].attack, 2, "Unpaid Inflation should not grant ATK.");

const godCard = makeCardFromId("ashen_page");
const godState = makeState("B", godCard);
const publicGodState = State.makePublicState(godState);
assert.strictEqual(publicGodState.players.B.hand[0].play_cost, 1, "Public state must expose God hand play_cost.");

console.log("[COST_PAYMENT_SMOKE] PASS");

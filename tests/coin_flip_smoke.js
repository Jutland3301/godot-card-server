"use strict";

const assert = require("assert");
const CoinFlip = require("../battle/coin_flip");
const State = require("../battle/state");

const reversedSides = {
  A: { side: "god" },
  B: { side: "human" }
};

const seatAFirst = CoinFlip.chooseFirstPlayer(reversedSides, () => 0.1);
assert.deepStrictEqual(seatAFirst, {
  first_player_seat: "A",
  first_player_id: "player1",
  first_player_side: "god"
});

const seatBFirst = CoinFlip.chooseFirstPlayer(reversedSides, () => 0.9);
assert.deepStrictEqual(seatBFirst, {
  first_player_seat: "B",
  first_player_id: "player2",
  first_player_side: "human"
});

const state = {
  turn_number: 1,
  turn_seat: "B",
  current_player_id: "player2",
  first_player_seat: "B",
  first_player_id: "player2",
  first_player_side: "human",
  player1: { deck: [], hand: [], board: [], graveyard: [] },
  player2: { deck: [], hand: [], board: [], graveyard: [] }
};

const publicState = State.makePublicState(state);
assert.strictEqual(publicState.current_player_id, "player2");
assert.strictEqual(publicState.first_player_seat, "B");
assert.strictEqual(publicState.first_player_id, "player2");
assert.strictEqual(publicState.first_player_side, "human");

console.log("[COIN_FLIP_SMOKE] PASS");

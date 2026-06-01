"use strict";

const assert = require("assert");
const BattleEngine = require("../battle_engine");
const { makeCardFromId } = require("../cards_database");

function makeState(card, seat = "A", mana = 0) {
  const otherSeat = seat === "A" ? "B" : "A";

  return {
    turn_seat: seat,
    current_player_id: seat === "A" ? "player1" : "player2",
    turn_number: 1,
    game_over: false,
    selecting_target: false,
    selecting_hand_card: false,
    players: {
      [seat]: { name: "God", hp: 30, max_hp: 30, mana, max_mana: mana, deck: [], hand: [card], board: [], graveyard: [] },
      [otherSeat]: { name: "Human", hp: 30, max_hp: 30, mana: 0, max_mana: 0, deck: [], hand: [], board: [], graveyard: [] }
    },
    owner_to_seat_id: { player1: "A", player2: "B" },
    seat_to_owner_id: { A: "player1", B: "player2" },
    log: [],
    battle_log_messages: []
  };
}

const pageByName = makeCardFromId("Ashen Page");
assert(pageByName, "Ashen Page must hydrate from display name.");
assert.strictEqual(pageByName.card_id, "ashen_page");
assert.strictEqual(pageByName.cost, 1);
assert.strictEqual(pageByName.attack, 1);
assert.strictEqual(pageByName.hp, 1);
assert.ok(Array.isArray(pageByName.abilities) && pageByName.abilities.length > 0, "Ashen Page must keep its abilities.");

assert.strictEqual(makeCardFromId("missing_card_for_smoke"), null, "Unknown cards must not become 0/1 units.");

const state = makeState(pageByName);
const result = BattleEngine.playHandCard(state, "A", 0, null, { makeCardFromId });
assert.strictEqual(result.ok, false, "God card must not be playable with insufficient mana.");
assert.strictEqual(state.players.A.hand.length, 1, "Failed play must keep the card in hand.");
assert.strictEqual(state.players.A.board.length, 0, "Failed play must not summon the card.");

const stalePlaceholder = {
  card_id: "ashen_page",
  card_name: "Ashen Page",
  card_type: "unit",
  cost: 0,
  attack: 0,
  hp: 1,
  max_hp: 1,
  description: "",
  traits: [],
  abilities: []
};
const godSeatState = makeState(stalePlaceholder, "B", 1);
godSeatState.players.B.hand.push({ ...stalePlaceholder });
const firstGodPlay = BattleEngine.playHandCard(godSeatState, "B", 0, null, { makeCardFromId });
assert.strictEqual(firstGodPlay.ok, true, "God side should play the hydrated 1-cost card with 1 mana.");
assert.strictEqual(godSeatState.players.B.mana, 0, "God side mana must decrease after playing a hydrated 1-cost card.");
assert.strictEqual(godSeatState.players.B.board.length, 1, "Hydrated God card should be summoned.");
assert.strictEqual(godSeatState.players.B.board[0].cost, 1, "Played stale God card should be restored to its real cost.");
const secondGodPlay = BattleEngine.playHandCard(godSeatState, "B", 0, null, { makeCardFromId });
assert.strictEqual(secondGodPlay.ok, false, "God side must not play another 1-cost card after mana reaches 0.");
assert.strictEqual(godSeatState.players.B.hand.length, 1, "Rejected second God card should remain in hand.");

const actionMatch = { state: makeState({ ...stalePlaceholder }, "B", 1) };
actionMatch.state.players.B.hand.push({ ...stalePlaceholder });
const actionPlay = BattleEngine.handleBattleAction(actionMatch, "B", {
  action: "hand_card_clicked",
  hand_index: 0
}, { makeCardFromId });
assert.strictEqual(actionPlay.ok, true, "Authoritative God action should hydrate stale hand cards before paying cost.");
assert.strictEqual(actionMatch.state.players.B.mana, 0, "Authoritative God action must spend mana after hydration.");
const actionSecondPlay = BattleEngine.handleBattleAction(actionMatch, "B", {
  action: "hand_card_clicked",
  hand_index: 0
}, { makeCardFromId });
assert.strictEqual(actionSecondPlay.ok, false, "Authoritative God action must reject the second 1-cost play at 0 mana.");

const humanTwoCost = makeCardFromId("guardian");
assert(humanTwoCost, "Guardian must hydrate.");
assert.strictEqual(humanTwoCost.side, "human");
assert.strictEqual(humanTwoCost.cost, 2);
const humanSeatState = makeState(humanTwoCost, "A", 2);
const humanPlay = BattleEngine.playHandCard(humanSeatState, "A", 0, null, { makeCardFromId });
assert.strictEqual(humanPlay.ok, true, "Human side must be able to play an exact 2-cost card with 2 mana.");
assert.strictEqual(humanSeatState.players.A.mana, 0, "Human side exact-cost play must spend all mana.");
assert.strictEqual(humanSeatState.players.A.board.length, 1, "Human exact-cost unit should be summoned.");

console.log("[GOD_CARD_HYDRATION_SMOKE] PASS");

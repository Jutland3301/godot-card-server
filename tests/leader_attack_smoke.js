"use strict";

const assert = require("assert");
const Combat = require("../battle/combat");
const State = require("../battle/state");
const { makeCardFromId } = require("../cards_database");

function makeState(unit) {
  return {
    turn_seat: "A",
    current_player_id: "player1",
    turn_number: 1,
    game_over: false,
    players: {
      A: { name: "A", hp: 20, max_hp: 20, mana: 0, max_mana: 0, deck: [], hand: [], board: [unit], graveyard: [] },
      B: { name: "B", hp: 20, max_hp: 20, mana: 0, max_mana: 0, deck: [], hand: [], board: [], graveyard: [] }
    },
    owner_to_seat_id: { player1: "A", player2: "B" },
    seat_to_owner_id: { A: "player1", B: "player2" },
    log: [],
    battle_log_messages: []
  };
}

function makeUnit(keywords = []) {
  const unit = makeCardFromId("Novice Soldier");
  unit.keywords = keywords.slice();
  unit.attack = 2;
  unit.max_attacks_per_turn = 1;
  unit.cannot_attack_leader = false;
  return unit;
}

const normal = makeUnit();
const normalState = makeState(normal);
Combat.applySummonState(normal, normalState.players.A);
assert.strictEqual(normal.cannot_attack_leader, false, "A normal summon must not gain permanent leader restriction.");
State.beginTurnBasics(normalState, "A");
assert.strictEqual(Combat.attackFace(normalState, "A", 0, "B").ok, true, "A normal unit must attack leader on a later turn.");

const haste = makeUnit(["haste"]);
const hasteState = makeState(haste);
Combat.applySummonState(haste, hasteState.players.A);
assert.strictEqual(Combat.attackFace(hasteState, "A", 0, "B").ok, false, "Haste must not attack leader on its summon turn.");
State.beginTurnBasics(hasteState, "A");
assert.strictEqual(Combat.attackFace(hasteState, "A", 0, "B").ok, true, "Haste must attack leader on later turns.");

const rush = makeUnit(["rush"]);
const rushState = makeState(rush);
Combat.applySummonState(rush, rushState.players.A);
assert.strictEqual(Combat.attackFace(rushState, "A", 0, "B").ok, true, "Rush must attack leader on its summon turn.");

const permanentlyRestricted = makeUnit(["rush"]);
permanentlyRestricted.cannot_attack_leader = true;
const restrictedState = makeState(permanentlyRestricted);
Combat.applySummonState(permanentlyRestricted, restrictedState.players.A);
assert.strictEqual(
  Combat.attackFace(restrictedState, "A", 0, "B").ok,
  false,
  "Card effects that forbid leader attacks must remain enforced."
);

console.log("[LEADER_ATTACK_SMOKE] PASS");

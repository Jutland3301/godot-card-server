"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

const authRoutes = read("auth_routes.js");
const server = read("server.js");
const networkClient = read(path.join("..", "card-battle-demo", "scripts", "network", "NetworkClient.gd"));
const lobbyScene = read(path.join("..", "card-battle-demo", "scenes", "LobbyScene", "LobbyScene.gd"));
const packScene = read(path.join("..", "card-battle-demo", "scenes", "PackScene", "PackScene.gd"));

assert.ok(authRoutes.includes("gold: result.user.gold"), "Login and registration responses must expose gold.");
assert.ok(server.includes('type: "battle_result"'), "Battle completion must push authoritative progression.");
assert.ok(server.includes("logResult.rows.length > 0 && validWinner"), "Gold rewards must depend on the unique match log insert.");
assert.ok(server.includes("new_gold: Number(newGoldResult.rows[0].gold || 0)"), "Pack responses must expose the post-purchase gold.");
assert.ok(server.includes("gold: Number(newGoldResult.rows[0].gold || 0)"), "Pack responses must expose a standard gold field.");
assert.ok(server.includes("const PACK_COST = 200;"), "Packs must cost 200 gold.");
assert.ok(server.includes("const PACK_SIZE = 5;"), "Packs must contain 5 cards.");
assert.ok(server.includes('error: "Not enough gold."'), "Insufficient gold must be rejected visibly.");
assert.ok(server.includes('error: "Developer accounts already have every card."'), "Developer accounts must not use normal pack purchases.");
assert.ok(server.includes("DO UPDATE SET count = user_cards.count + EXCLUDED.count"), "Opened cards must be persisted into the collection.");
assert.ok(networkClient.includes('"battle_result":'), "Godot must accept battle progression messages.");
assert.ok(networkClient.includes("AuthManager.set_progression("), "Godot must apply server progression to shared auth state.");
assert.ok(lobbyScene.includes("await APIClient.get_collection()"), "Lobby display must refresh gold and collection from the server.");
assert.ok(packScene.includes('call_deferred("_sync_progression")'), "Pack screen must refresh gold before purchase.");

console.log("[PROGRESSION_SYNC_SMOKE] PASS");

"use strict";

const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");
const { Pool } = require("pg");
const { makeCardFromId, getAvailableCardIds } = require("./cards_database");
const BattleEngine = require("./battle_engine");
const { createAuthService } = require("./auth_service");
const { createAuthRoutes } = require("./auth_routes");
const { createAuthMiddleware } = require("./auth_middleware");
const { chooseFirstPlayer } = require("./battle/coin_flip");

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || "";

const STARTING_HP = 20;
const STARTING_HAND_SIZE = 3;
const STARTING_MANA = 0;
const TURN_TIME_LIMIT_SECONDS = 45.0;
const MAX_HAND_SIZE = 7;
const MATCH_TIMER_TICK_MS = 250;

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false
    })
  : null;

let nextClientNumber = 1;
let nextHostNumber = 1;
let nextMatchNumber = 1;

const clients = new Map();
const hosts = new Map();
const queue = [];
const matches = new Map();

function makeId(prefix, number) {
  return `${prefix}_${number}_${Date.now()}`;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(JSON.stringify(payload));
}

function safeSend(ws, message) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    ws.send(JSON.stringify(message));
    return true;
  } catch (error) {
    console.error("[WS SEND ERROR]", error && error.stack ? error.stack : error);
    return false;
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function sendError(ws, message) {
  safeSend(ws, {
    type: "error",
    message
  });
}

function sendActionRejected(clientId, message) {
  const client = clients.get(clientId);

  if (!client) {
    return;
  }

  safeSend(client.ws, {
    type: "action_rejected",
    message: String(message || "Action rejected.")
  });
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();

      if (body.length > 1024 * 1024) {
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (_error) {
        resolve(null);
      }
    });

    req.on("error", () => {
      resolve(null);
    });
  });
}

async function dbQuery(text, params = []) {
  if (!pool) {
    throw new Error("DATABASE_URL is not set.");
  }

  return await pool.query(text, params);
}

const authService = createAuthService({ query: dbQuery });
const authMiddleware = createAuthMiddleware({ authService, sendJson });
const authRoutes = createAuthRoutes({ authService, readJsonBody, sendJson });

let deckSchemaReady = false;

async function ensureDeckSchema() {
  if (deckSchemaReady) {
    return;
  }

  await dbQuery("ALTER TABLE decks ADD COLUMN IF NOT EXISTS slot_index INTEGER NOT NULL DEFAULT 0");
  await dbQuery(`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, side ORDER BY created_at ASC, id ASC) AS new_slot
      FROM decks
      WHERE slot_index <= 0
    )
    UPDATE decks
    SET slot_index = ranked.new_slot
    FROM ranked
    WHERE decks.id = ranked.id
  `);
  deckSchemaReady = true;
}

async function requireUser(req, res) {
  return await authMiddleware.requireAuth(req, res);
}

function normalizeSide(value) {
  const side = String(value || "human").trim().toLowerCase();

  if (side === "god") {
    return "god";
  }

  return "human";
}

function countCards(cardIds) {
  const counts = new Map();

  for (const raw of cardIds) {
    const cardId = String(raw || "").trim();

    if (!cardId) {
      continue;
    }

    counts.set(cardId, (counts.get(cardId) || 0) + 1);
  }

  return counts;
}

// ============================================================================
// HTTP API
// ============================================================================
async function handleCollection(req, res) {
  const user = await requireUser(req, res);

  if (!user) {
    return;
  }

  const result = await dbQuery(
    `
    SELECT card_id, count
    FROM user_cards
    WHERE user_id = $1
    ORDER BY card_id ASC
    `,
    [user.id]
  );

  sendJson(res, 200, { ok: true, cards: result.rows });
}

async function handleOpenPack(req, res) {
  const user = await requireUser(req, res);

  if (!user) {
    return;
  }

  const body = await readJsonBody(req);

  if (body === null) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON" });
    return;
  }

  const packType = String(body.pack_type || body.packType || "test");
  const count = Math.max(1, Math.min(20, Number(body.count || 5)));
  const availableCardIds = getAvailableCardIds();

  if (availableCardIds.length <= 0) {
    sendJson(res, 400, { ok: false, error: "No cards available." });
    return;
  }

  const opened = [];

  for (let i = 0; i < count; i++) {
    opened.push(availableCardIds[Math.floor(Math.random() * availableCardIds.length)]);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const packLogResult = await client.query(
      "INSERT INTO pack_logs (user_id, pack_type) VALUES ($1, $2) RETURNING id",
      [user.id, packType]
    );

    const packLogId = packLogResult.rows[0].id;
    const openedCounts = countCards(opened);

    for (const [cardId, amount] of openedCounts.entries()) {
      await client.query(
        `
        INSERT INTO user_cards (user_id, card_id, count)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, card_id)
        DO UPDATE SET count = user_cards.count + EXCLUDED.count
        `,
        [user.id, cardId, amount]
      );

      await client.query(
        "INSERT INTO pack_results (pack_log_id, card_id, amount) VALUES ($1, $2, $3)",
        [packLogId, cardId, amount]
      );
    }

    await client.query("COMMIT");

    const cards = Array.from(openedCounts.entries()).map(([cardId, amount]) => ({
      card_id: cardId,
      count: amount,
      amount
    }));

    sendJson(res, 200, {
      ok: true,
      pack_log_id: packLogId,
      cards,
      results: cards
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function handleGetDecks(req, res) {
  const user = await requireUser(req, res);

  if (!user) {
    return;
  }

  await ensureDeckSchema();

  const decksResult = await dbQuery(
    `
    SELECT id, name, side, slot_index, created_at, updated_at
    FROM decks
    WHERE user_id = $1
    ORDER BY side ASC, slot_index ASC, id ASC
    `,
    [user.id]
  );

  const decks = [];

  for (const deck of decksResult.rows) {
    const cardsResult = await dbQuery(
      `
      SELECT card_id, count
      FROM deck_cards
      WHERE deck_id = $1
      ORDER BY card_id ASC
      `,
      [deck.id]
    );

    const cardIds = [];

    for (const row of cardsResult.rows) {
      const amount = Number(row.count || 0);

      for (let i = 0; i < amount; i++) {
        cardIds.push(row.card_id);
      }
    }

    decks.push({
      id: deck.id,
      deck_id: deck.id,
      name: deck.name,
      side: deck.side,
      slot_index: Number(deck.slot_index || 0),
      cards: cardIds,
      card_ids: cardIds,
      card_counts: cardsResult.rows,
      created_at: deck.created_at,
      updated_at: deck.updated_at
    });
  }

  sendJson(res, 200, { ok: true, decks });
}

async function handleSaveDeck(req, res) {
  const user = await requireUser(req, res);

  if (!user) {
    return;
  }

  await ensureDeckSchema();

  const body = await readJsonBody(req);

  if (body === null) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON" });
    return;
  }

  const deckId = Number(body.deck_id || body.id || 0);
  const name = String(body.name || body.deck_name || "New Deck").trim();
  const side = normalizeSide(body.side);
  let slotIndex = Number(body.slot_index || 0);
  const cardSource = Array.isArray(body.cards)
    ? body.cards
    : Array.isArray(body.card_ids)
      ? body.card_ids
      : [];

  const cardIds = cardSource.map((value) => String(value || "").trim()).filter(Boolean);

  if (!name) {
    sendJson(res, 400, { ok: false, error: "Deck name is empty." });
    return;
  }

  const cardCounts = countCards(cardIds);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let finalDeckId = deckId;

    if (slotIndex <= 0) {
      const slotResult = await client.query(
        "SELECT COALESCE(MAX(slot_index), 0) + 1 AS next_slot FROM decks WHERE user_id = $1 AND side = $2",
        [user.id, side]
      );
      slotIndex = Number(slotResult.rows[0].next_slot || 1);
    }

    if (finalDeckId > 0) {
      const updateResult = await client.query(
        `
        UPDATE decks
        SET name = $1, side = $2, slot_index = $3, updated_at = NOW()
        WHERE id = $4 AND user_id = $5
        RETURNING id
        `,
        [name, side, slotIndex, finalDeckId, user.id]
      );

      if (updateResult.rows.length <= 0) {
        finalDeckId = 0;
      }
    }

    if (finalDeckId <= 0) {
      const insertResult = await client.query(
        `
        INSERT INTO decks (user_id, name, side, slot_index)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        `,
        [user.id, name, side, slotIndex]
      );

      finalDeckId = insertResult.rows[0].id;
    }

    await client.query("DELETE FROM deck_cards WHERE deck_id = $1", [finalDeckId]);

    for (const [cardId, amount] of cardCounts.entries()) {
      await client.query(
        `
        INSERT INTO deck_cards (deck_id, card_id, count)
        VALUES ($1, $2, $3)
        `,
        [finalDeckId, cardId, amount]
      );
    }

    await client.query("COMMIT");

    sendJson(res, 200, {
      ok: true,
      deck: {
        id: finalDeckId,
        deck_id: finalDeckId,
        name,
        side,
        slot_index: slotIndex,
        cards: cardIds,
        card_ids: cardIds
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function handleDeleteDeck(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  await ensureDeckSchema();
  const body = await readJsonBody(req);
  if (body === null) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON" });
    return;
  }

  const deckId = Number(body.deck_id || body.id || 0);
  if (deckId <= 0) {
    sendJson(res, 400, { ok: false, error: "deck_id is required." });
    return;
  }

  const result = await dbQuery(
    "DELETE FROM decks WHERE id = $1 AND user_id = $2 RETURNING id",
    [deckId, user.id]
  );
  if (result.rows.length <= 0) {
    sendJson(res, 404, { ok: false, error: "Deck not found." });
    return;
  }

  sendJson(res, 200, { ok: true, deck_id: deckId });
}

async function handleRankedProfile(req, res) {
  const user = await requireUser(req, res);

  if (!user) {
    return;
  }

  await dbQuery(
    "INSERT INTO rank_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
    [user.id]
  );

  const result = await dbQuery(
    `
    SELECT user_id, rating, rank_points, wins, losses, draws
    FROM rank_profiles
    WHERE user_id = $1
    LIMIT 1
    `,
    [user.id]
  );

  sendJson(res, 200, { ok: true, profile: result.rows[0] });
}

async function handleRankedResult(req, res) {
  const user = await requireUser(req, res);

  if (!user) {
    return;
  }

  const body = await readJsonBody(req);

  if (body === null) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON" });
    return;
  }

  const resultText = String(body.result || "").toLowerCase();
  const opponentId = Number(body.opponent_id || 0);

  if (resultText !== "win" && resultText !== "loss" && resultText !== "draw") {
    sendJson(res, 400, { ok: false, error: "result must be win, loss, or draw." });
    return;
  }

  await dbQuery(
    "INSERT INTO rank_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
    [user.id]
  );

  const beforeResult = await dbQuery(
    "SELECT rating, rank_points, wins, losses, draws FROM rank_profiles WHERE user_id = $1 LIMIT 1",
    [user.id]
  );

  const before = beforeResult.rows[0];
  const ratingBefore = Number(before.rating || 1000);
  let ratingAfter = ratingBefore;
  let rankDelta = 0;

  if (resultText === "win") {
    ratingAfter += 10;
    rankDelta = 10;
  } else if (resultText === "loss") {
    ratingAfter = Math.max(0, ratingAfter - 8);
    rankDelta = -5;
  } else {
    ratingAfter += 1;
    rankDelta = 1;
  }

  if (resultText === "win") {
    await dbQuery(
      `
      UPDATE rank_profiles
      SET rating = $2,
          rank_points = GREATEST(0, rank_points + $3),
          wins = wins + 1
      WHERE user_id = $1
      `,
      [user.id, ratingAfter, rankDelta]
    );
  } else if (resultText === "loss") {
    await dbQuery(
      `
      UPDATE rank_profiles
      SET rating = $2,
          rank_points = GREATEST(0, rank_points + $3),
          losses = losses + 1
      WHERE user_id = $1
      `,
      [user.id, ratingAfter, rankDelta]
    );
  } else {
    await dbQuery(
      `
      UPDATE rank_profiles
      SET rating = $2,
          rank_points = GREATEST(0, rank_points + $3),
          draws = draws + 1
      WHERE user_id = $1
      `,
      [user.id, ratingAfter, rankDelta]
    );
  }

  await dbQuery(
    `
    INSERT INTO match_logs (player1_id, player2_id, winner_id, loser_id, result)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [
      user.id,
      opponentId > 0 ? opponentId : null,
      resultText === "win" ? user.id : null,
      resultText === "loss" ? user.id : null,
      resultText
    ]
  );

  const profileResult = await dbQuery(
    `
    SELECT user_id, rating, rank_points, wins, losses, draws
    FROM rank_profiles
    WHERE user_id = $1
    LIMIT 1
    `,
    [user.id]
  );

  sendJson(res, 200, {
    ok: true,
    result: resultText,
    rating_before: ratingBefore,
    rating_after: ratingAfter,
    profile: profileResult.rows[0]
  });
}

async function handleHttp(req, res) {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 200, { ok: true });
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    if (path === "/" || path === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "godot-card-node-authoritative",
        db: !!pool,
        clients: clients.size,
        hosts: hosts.size,
        queued: queue.length,
        matches: matches.size,
        card_count: getAvailableCardIds().length
      });
      return;
    }

    if (!pool) {
      sendJson(res, 500, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }

    if (req.method === "POST" && path === "/register") {
      await authRoutes.register(req, res);
      return;
    }

    if (req.method === "POST" && path === "/login") {
      await authRoutes.login(req, res);
      return;
    }

    if (req.method === "POST" && path === "/logout") {
      await authRoutes.logout(req, res);
      return;
    }

    if (req.method === "GET" && path === "/me") {
      await authRoutes.me(req, res, requireUser);
      return;
    }

    if (req.method === "GET" && path === "/collection") {
      await handleCollection(req, res);
      return;
    }

    if (req.method === "POST" && path === "/open_pack") {
      await handleOpenPack(req, res);
      return;
    }

    if (req.method === "GET" && path === "/decks") {
      await handleGetDecks(req, res);
      return;
    }

    if (req.method === "POST" && path === "/save_deck") {
      await handleSaveDeck(req, res);
      return;
    }

    if (req.method === "POST" && path === "/delete_deck") {
      await handleDeleteDeck(req, res);
      return;
    }

    if (req.method === "GET" && path === "/ranked/profile") {
      await handleRankedProfile(req, res);
      return;
    }

    if (req.method === "POST" && path === "/ranked/result") {
      await handleRankedResult(req, res);
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    console.error("[HTTP ERROR]", error && error.stack ? error.stack : error);
    sendJson(res, 500, { ok: false, error: error.message });
  }
}

const server = http.createServer(handleHttp);
const wss = new WebSocketServer({ server });

// ============================================================================
// Battle state helpers
// ============================================================================
function removeClientFromQueue(clientId) {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].client_id === clientId) {
      queue.splice(i, 1);
    }
  }
}

function getSideFromDeckData(deckData) {
  if (!deckData || typeof deckData !== "object") {
    return "";
  }

  return String(deckData.side || "").toLowerCase();
}

function destroyMatchesForClient(clientId, reason = "Client started a new queue.") {
  const targetClientId = String(clientId || "");

  if (targetClientId === "") {
    return;
  }

  const matchIdsToDestroy = [];

  for (const [matchId, match] of matches.entries()) {
    if (!match || !match.seats) {
      continue;
    }

    const aClientId = match.seats.A ? String(match.seats.A.client_id || "") : "";
    const bClientId = match.seats.B ? String(match.seats.B.client_id || "") : "";

    if (aClientId === targetClientId || bClientId === targetClientId) {
      matchIdsToDestroy.push(matchId);
    }
  }

  for (const matchId of matchIdsToDestroy) {
    destroyMatch(matchId, reason);
  }
}

function getCardIdsFromDeckData(deckData) {
  if (!deckData || typeof deckData !== "object") {
    return [];
  }

  const source = Array.isArray(deckData.card_ids)
    ? deckData.card_ids
    : Array.isArray(deckData.cards)
      ? deckData.cards
      : [];

  return source.map((value) => String(value || "").trim()).filter(Boolean);
}

function validateDeckData(deckData) {
  if (!deckData || typeof deckData !== "object") {
    return "deck_data is missing.";
  }

  const side = getSideFromDeckData(deckData);

  if (side !== "human" && side !== "god") {
    return "deck_data.side must be human or god.";
  }

  const cards = getCardIdsFromDeckData(deckData);

  if (cards.length <= 0) {
    return "deck_data has no cards.";
  }

  return "";
}

function findQueuePair() {
  for (let i = 0; i < queue.length; i++) {
    for (let j = i + 1; j < queue.length; j++) {
      const a = queue[i];
      const b = queue[j];

      if (!a || !b) {
        continue;
      }

      if (!clients.has(a.client_id) || !clients.has(b.client_id)) {
        continue;
      }

      if (a.side === b.side) {
        continue;
      }

      return {
        entryA: a.side === "human" ? a : b,
        entryB: a.side === "human" ? b : a
      };
    }
  }

  return null;
}

function drawOneCard(player) {
  if (!player) {
    return null;
  }

  if (!Array.isArray(player.deck)) {
    player.deck = [];
  }

  if (!Array.isArray(player.hand)) {
    player.hand = [];
  }

  if (!Array.isArray(player.graveyard)) {
    player.graveyard = [];
  }

  if (player.deck.length <= 0) {
    return null;
  }

  const card = player.deck.pop();

  if (player.hand.length >= MAX_HAND_SIZE) {
    player.graveyard.push(card);
    return card;
  }

  player.hand.push(card);
  return card;
}

function makeInitialPlayerState(ownerId, deckData) {
  const cardIds = getCardIdsFromDeckData(deckData);
  const deck = cardIds
    .map((cardId) => makeCardFromId(cardId))
    .filter((card) => card && typeof card === "object");

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }

  return {
    owner_id: ownerId,
    name: ownerId === "player1" ? "Player1" : "Player2",

    hp: STARTING_HP,
    max_hp: STARTING_HP,

    mana: STARTING_MANA,
    max_mana: STARTING_MANA,

    deck,
    hand: [],
    board: [],
    graveyard: [],

    inflation_counters: 0,
    scholar_cards_played_this_game: 0,
    scholar_played_count: 0,
    played_trait_counts: {},
    last_spell_cast: null
  };
}

function makeInitialMatchState(match) {
  const player1 = makeInitialPlayerState("player1", match.seats.A.deck_data);
  const player2 = makeInitialPlayerState("player2", match.seats.B.deck_data);
  const coinFlip = chooseFirstPlayer(match.seats);

  for (let i = 0; i < STARTING_HAND_SIZE; i++) {
    drawOneCard(player1);
    drawOneCard(player2);
  }

  const state = {
    match_id: match.match_id,
    authority_mode: "server",

    turn_number: 1,
    current_player_id: coinFlip.first_player_id,
    turn_seat: coinFlip.first_player_seat,
    first_player_id: coinFlip.first_player_id,
    first_player_seat: coinFlip.first_player_seat,
    first_player_side: coinFlip.first_player_side,

    status_message: "",
    game_over: false,
    winner_seat: "",
    loser_seat: "",

    turn_time_left: TURN_TIME_LIMIT_SECONDS,
    turn_timer_active: false,
    turn_timer_timeout_handled: false,

    player1,
    player2,
    players: {
      A: player1,
      B: player2
    },

    owner_to_seat_id: {
      player1: "A",
      player2: "B"
    },
    seat_to_owner_id: {
      A: "player1",
      B: "player2"
    },

    battle_log_messages: [],
    log: [],

    selecting_target: false,
    selecting_hand_card: false,
    pending_action_type: "none",
    pending_card: null,
    pending_hand_index: -1,
    pending_card_owner: "",
    pending_attacker_index: -1,
    selected_attacker_owner: "",
    selected_attacker_index: -1,
    pending_ability: {},
    selected: null,
    pending_deaths: [],
    pending_summons: [],
    pending_hand_selection_effect: "",
    pending_hand_selection_owner: "",
    pending_card_selection_zone: "hand",
    pending_hand_candidate_indexes: []
  };

  const result = BattleEngine.startTurn(state, coinFlip.first_player_seat, { makeCardFromId });

  if (result && result.ok === false) {
    throw new Error(result.message || "Failed to start first turn.");
  }

  return normalizeAuthoritativeState(state);
}

function normalizeAuthoritativeState(state) {
  if (!state || typeof state !== "object") {
    return {};
  }

  if (BattleEngine && typeof BattleEngine.normalizeStateRuntime === "function") {
    BattleEngine.normalizeStateRuntime(state);
  }

  if (!state.players || typeof state.players !== "object") {
    state.players = {
      A: state.player1,
      B: state.player2
    };
  }

  if (state.players.A) {
    state.player1 = state.players.A;
  }

  if (state.players.B) {
    state.player2 = state.players.B;
  }

  if (!state.owner_to_seat_id || typeof state.owner_to_seat_id !== "object") {
    state.owner_to_seat_id = {
      player1: "A",
      player2: "B"
    };
  }

  if (!state.seat_to_owner_id || typeof state.seat_to_owner_id !== "object") {
    state.seat_to_owner_id = {
      A: "player1",
      B: "player2"
    };
  }

  if (state.turn_seat === "A") {
    state.current_player_id = "player1";
  } else if (state.turn_seat === "B") {
    state.current_player_id = "player2";
  } else {
    state.turn_seat = state.owner_to_seat_id[state.current_player_id] || "A";
    state.current_player_id = state.seat_to_owner_id[state.turn_seat] || "player1";
  }

  if (!Array.isArray(state.battle_log_messages)) {
    state.battle_log_messages = [];
  }

  if (!Array.isArray(state.log)) {
    state.log = [];
  }

  for (const message of state.log) {
    const text = String(message || "");

    if (text && !state.battle_log_messages.includes(text)) {
      state.battle_log_messages.push(text);
    }
  }

  if (state.battle_log_messages.length > 80) {
    state.battle_log_messages.splice(0, state.battle_log_messages.length - 80);
  }

  if (state.log.length > 80) {
    state.log.splice(0, state.log.length - 80);
  }

  if (state.game_over) {
    state.turn_timer_active = false;
    state.turn_timer_timeout_handled = true;
  }

  return state;
}

function getPublicBattleState(match) {
  if (!match || !match.state) {
    return {};
  }

  try {
    if (BattleEngine && typeof BattleEngine.makePublicState === "function") {
      const publicState = BattleEngine.makePublicState(match.state);

      if (publicState && typeof publicState === "object") {
        publicState.match_id = match.match_id;
        return publicState;
      }
    }
  } catch (error) {
    console.error(
      "[PUBLIC STATE ERROR]",
      match.match_id || "",
      error && error.stack ? error.stack : error
    );
  }

  const fallback = normalizeAuthoritativeState(match.state);
  fallback.match_id = match.match_id;
  return fallback;
}

function broadcastMatchState(matchId) {
  const match = matches.get(matchId);

  if (!match) {
    return;
  }

  match.state = normalizeAuthoritativeState(match.state);
  const publicState = getPublicBattleState(match);

  const clientA = clients.get(match.seats.A.client_id);
  const clientB = clients.get(match.seats.B.client_id);

  if (clientA) {
    safeSend(clientA.ws, {
      type: "match_state",
      match_id: matchId,
      seat_id: "A",
      state: publicState
    });
  }

  if (clientB) {
    safeSend(clientB.ws, {
      type: "match_state",
      match_id: matchId,
      seat_id: "B",
      state: publicState
    });
  }
}

function sendMatchFound(matchId) {
  const match = matches.get(matchId);

  if (!match) {
    console.error("[MATCH FOUND SEND ERROR] match not found", matchId);
    return;
  }

  let publicState = {};

  try {
    publicState = getPublicBattleState(match);
  } catch (error) {
    console.error(
      "[MATCH FOUND PUBLIC STATE ERROR]",
      matchId,
      error && error.stack ? error.stack : error
    );
    publicState = match.state || {};
  }

  const clientA = clients.get(match.seats.A.client_id);
  const clientB = clients.get(match.seats.B.client_id);

  const sideA = match.seats.A.side;
  const sideB = match.seats.B.side;

  const payloadA = {
    type: "match_found",
    match_id: matchId,
    seat_id: "A",
    side: sideA,
    opponent_side: sideB,
    display_name: match.seats.A.display_name,
    opponent_display_name: match.seats.B.display_name,
    first_player_id: publicState.first_player_id,
    first_player_seat: publicState.first_player_seat,
    first_player_side: publicState.first_player_side,
    state: publicState
  };

  const payloadB = {
    type: "match_found",
    match_id: matchId,
    seat_id: "B",
    side: sideB,
    opponent_side: sideA,
    display_name: match.seats.B.display_name,
    opponent_display_name: match.seats.A.display_name,
    first_player_id: publicState.first_player_id,
    first_player_seat: publicState.first_player_seat,
    first_player_side: publicState.first_player_side,
    state: publicState
  };

  let sentA = false;
  let sentB = false;

  if (clientA && clientA.ws) {
    sentA = safeSend(clientA.ws, payloadA);
  }

  if (clientB && clientB.ws) {
    sentB = safeSend(clientB.ws, payloadB);
  }

  console.log(
    "[MATCH FOUND SEND]",
    matchId,
    "A_client=",
    match.seats.A.client_id,
    "A_ws=",
    clientA && clientA.ws ? clientA.ws.readyState : "missing",
    "A_sent=",
    sentA,
    "B_client=",
    match.seats.B.client_id,
    "B_ws=",
    clientB && clientB.ws ? clientB.ws.readyState : "missing",
    "B_sent=",
    sentB
  );

  if (sentA) {
    safeSend(clientA.ws, {
      type: "match_state",
      match_id: matchId,
      seat_id: "A",
      state: publicState
    });
  }

  if (sentB) {
    safeSend(clientB.ws, {
      type: "match_state",
      match_id: matchId,
      seat_id: "B",
      state: publicState
    });
  }
}

function tryMakeMatch() {
  while (queue.length >= 2) {
    const pair = findQueuePair();

    if (!pair) {
      console.log("[MATCH] Waiting for compatible queue pair. queue=", queue.length);
      return;
    }

    const entryA = pair.entryA;
    const entryB = pair.entryB;

    removeClientFromQueue(entryA.client_id);
    removeClientFromQueue(entryB.client_id);

    const clientA = clients.get(entryA.client_id);
    const clientB = clients.get(entryB.client_id);

    if (!clientA || !clientB) {
      continue;
    }

    if (!clientA.ws || clientA.ws.readyState !== WebSocket.OPEN) {
      continue;
    }

    if (!clientB.ws || clientB.ws.readyState !== WebSocket.OPEN) {
      continue;
    }

    const matchId = makeId("match", nextMatchNumber++);

    const match = {
      match_id: matchId,
      state: {},
      seats: {
        A: {
          client_id: entryA.client_id,
          user_id: clientA.user_id,
          username: clientA.username,
          display_name: clientA.display_name,
          deck_data: entryA.deck_data,
          side: entryA.side
        },
        B: {
          client_id: entryB.client_id,
          user_id: clientB.user_id,
          username: clientB.username,
          display_name: clientB.display_name,
          deck_data: entryB.deck_data,
          side: entryB.side
        }
      },
      created_at: Date.now(),
      last_timer_update_at: Date.now()
    };

    try {
      match.state = makeInitialMatchState(match);
    } catch (error) {
      console.error(
        "[MATCH CREATE ERROR]",
        matchId,
        error && error.stack ? error.stack : error
      );

      clientA.queued = false;
      clientB.queued = false;

      sendError(clientA.ws, "Server failed while creating match.");
      sendError(clientB.ws, "Server failed while creating match.");
      continue;
    }

    matches.set(matchId, match);

    clientA.match_id = matchId;
    clientA.seat_id = "A";
    clientA.queued = false;

    clientB.match_id = matchId;
    clientB.seat_id = "B";
    clientB.queued = false;

    console.log(
      "[MATCH] Created Node authoritative match",
      matchId,
      "A=",
      entryA.client_id,
      "user_id=",
      clientA.user_id,
      "display_name=",
      clientA.display_name,
      entryA.side,
      "B=",
      entryB.client_id,
      "user_id=",
      clientB.user_id,
      "display_name=",
      clientB.display_name,
      entryB.side,
      "first_side=",
      match.state.first_player_side,
      "first_seat=",
      match.state.first_player_seat
    );

    if (clientA.user_id === clientB.user_id) {
      console.log("[MATCH] Same user test match allowed. user_id=", clientA.user_id);
    }

    sendMatchFound(matchId);
  }
}

function tickMatchTimers() {
  const now = Date.now();

  for (const [matchId, match] of matches.entries()) {
    try {
      if (!match || !match.state) {
        continue;
      }

      const state = match.state;

      if (state.game_over) {
        continue;
      }

      if (!state.turn_timer_active) {
        match.last_timer_update_at = now;
        continue;
      }

      if (state.turn_timer_timeout_handled) {
        match.last_timer_update_at = now;
        continue;
      }

      const last = Number(match.last_timer_update_at || now);
      const deltaSeconds = Math.max(0, (now - last) / 1000.0);
      match.last_timer_update_at = now;

      if (deltaSeconds <= 0) {
        continue;
      }

      state.turn_time_left = Math.max(0, Number(state.turn_time_left || 0) - deltaSeconds);

      if (state.turn_time_left > 0) {
        continue;
      }

      state.turn_time_left = 0;
      state.turn_timer_timeout_handled = true;

      console.log(
        "[MATCH TIMER] timeout",
        matchId,
        "turn=",
        state.turn_number,
        "seat=",
        state.turn_seat
      );

      const seatId = state.turn_seat || (
        state.current_player_id === "player2" ? "B" : "A"
      );

      const result = BattleEngine.handleBattleAction(match, seatId, {
        action: "end_turn",
        reason: "timeout"
      }, {
        makeCardFromId
      });

      if (!result || result.ok !== true) {
        console.error(
          "[MATCH TIMER] auto end_turn failed",
          matchId,
          result && (result.message || result.reason)
            ? (result.message || result.reason)
            : "unknown error"
        );

        state.turn_timer_active = false;
        continue;
      }

      match.state = normalizeAuthoritativeState(match.state);
      match.last_timer_update_at = Date.now();

      broadcastMatchState(matchId);

      if (match.state && match.state.game_over) {
        destroyMatch(matchId, "Match finished by timer.");
      }
    } catch (error) {
      console.error(
        "[MATCH TIMER ERROR]",
        matchId,
        error && error.stack ? error.stack : error
      );
    }
  }
}

function destroyMatch(matchId, reason = "Match destroyed.") {
  const match = matches.get(matchId);

  if (!match) {
    return;
  }

  const clientA = match.seats && match.seats.A ? clients.get(match.seats.A.client_id) : null;
  const clientB = match.seats && match.seats.B ? clients.get(match.seats.B.client_id) : null;

  if (clientA) {
    clientA.match_id = "";
    clientA.seat_id = "";
    clientA.queued = false;
  }

  if (clientB) {
    clientB.match_id = "";
    clientB.seat_id = "";
    clientB.queued = false;
  }

  matches.delete(matchId);

  console.log("[MATCH] destroyed", matchId, reason);

  tryMakeMatch();
}

// ============================================================================
// WebSocket
// ============================================================================
async function handleClientMessage(client, message) {
  const type = String(message.type || "");

  switch (type) {
    case "auth": {
      const user = await authService.getUserBySessionToken(String(message.token || ""));

      if (!user) {
        client.is_authenticated = false;
        safeSend(client.ws, { type: "auth_error", message: "Invalid token" });
        return;
      }

      client.user_id = user.id;
      client.username = user.username;
      client.display_name = user.display_name;
      client.is_authenticated = true;

      safeSend(client.ws, { type: "auth_ok", user });
      console.log(
        "[AUTH] client authenticated",
        client.client_id,
        "user_id=",
        client.user_id,
        "display_name=",
        client.display_name
      );
      return;
    }

    case "queue_join": {
      if (!client.is_authenticated) {
        safeSend(client.ws, { type: "auth_error", message: "Authentication required." });
        return;
      }

      const deckData = message.deck_data || {};
      const validationError = validateDeckData(deckData);

      if (validationError) {
        sendError(client.ws, validationError);
        return;
      }

      removeClientFromQueue(client.client_id);
      destroyMatchesForClient(client.client_id, "Client re-entered queue.");
      client.queued = true;
      client.match_id = "";
      client.seat_id = "";

      const side = getSideFromDeckData(deckData);

      queue.push({
        client_id: client.client_id,
        side,
        deck_data: deckData,
        joined_at: Date.now()
      });

      console.log(
        "[QUEUE] joined",
        client.client_id,
        "user_id=",
        client.user_id,
        "display_name=",
        client.display_name,
        "side=",
        side,
        "queue=",
        queue.length
      );

      safeSend(client.ws, {
        type: "queue_joined",
        side,
        queue_size: queue.length
      });

      tryMakeMatch();
      return;
    }

    case "queue_leave": {
      removeClientFromQueue(client.client_id);
      client.queued = false;
      safeSend(client.ws, { type: "queue_left" });
      console.log("[QUEUE] left", client.client_id, "queue=", queue.length);
      return;
    }

    case "battle_action": {
      if (!client.is_authenticated) {
        safeSend(client.ws, { type: "auth_error", message: "Authentication required." });
        return;
      }

      const matchId = String(message.match_id || "");
      const seatId = String(message.seat_id || "");
      const action = String(message.action || "");
      const payload = message.payload && typeof message.payload === "object" ? message.payload : {};

      if (!matchId || !seatId || !action) {
        sendActionRejected(client.client_id, "Invalid battle_action message.");
        return;
      }

      const match = matches.get(matchId);

      if (!match) {
        sendActionRejected(client.client_id, "Match not found.");
        return;
      }

      if (client.match_id !== matchId) {
        sendActionRejected(client.client_id, "You are not in this match.");
        return;
      }

      if (client.seat_id !== seatId) {
        sendActionRejected(client.client_id, "Invalid seat for this client.");
        return;
      }

      const enginePayload = {
        ...payload,
        action
      };

      let result = null;

      try {
        match.state = normalizeAuthoritativeState(match.state);

        result = BattleEngine.handleBattleAction(match, seatId, enginePayload, {
          makeCardFromId
        });
      } catch (error) {
        console.error(
          "[BATTLE ACTION ERROR]",
          client.client_id,
          "match=",
          matchId,
          "seat=",
          seatId,
          "action=",
          action
        );
        console.error(error && error.stack ? error.stack : error);
        sendActionRejected(client.client_id, "Server failed while resolving battle action.");
        return;
      }

      if (!result || result.ok !== true) {
        sendActionRejected(
          client.client_id,
          result && (result.reason || result.message)
            ? (result.reason || result.message)
            : "Action rejected."
        );
        return;
      }

      match.state = normalizeAuthoritativeState(match.state);
      match.last_timer_update_at = Date.now();

      broadcastMatchState(matchId);

      if (match.state && match.state.game_over) {
        destroyMatch(matchId, "Match finished.");
      }

      return;
    }

    case "ping": {
      safeSend(client.ws, { type: "pong" });
      return;
    }

    default: {
      console.log("[CLIENT] Unknown message", client.client_id, message);
      sendError(client.ws, "Unknown client message type: " + type);
    }
  }
}

function handleHostMessage(host, message) {
  const type = String(message.type || "");

  switch (type) {
    case "host_ready": {
      host.ready = true;

      if (message.host_id) {
        host.host_id = String(message.host_id);
        hosts.set(host.host_id, host);
      }

      host.capacity = Number(message.capacity || 1);
      console.log("[HOST] ready ignored in Node authoritative mode", host.host_id);
      return;
    }

    case "pong":
      return;

    default:
      console.log("[HOST] Ignored message in Node authoritative mode", host.host_id, message);
  }
}

function handleDisconnect(connection) {
  if (connection.role === "client") {
    const client = connection;
    console.log("[CLIENT] disconnected", client.client_id);

    removeClientFromQueue(client.client_id);

    if (client.match_id) {
      const match = matches.get(client.match_id);

      if (match) {
        const seatId = client.seat_id;
        const otherSeatId = seatId === "A" ? "B" : "A";
        const otherSeat = match.seats[otherSeatId];

        if (seatId && match.seats[seatId]) {
          match.seats[seatId].disconnected = true;
          match.seats[seatId].disconnected_at = Date.now();
        }

        console.log(
          "[MATCH] client disconnected but match kept temporarily",
          match.match_id,
          "seat=",
          seatId
        );

        if (otherSeat) {
          const otherClient = clients.get(otherSeat.client_id);

          if (otherClient && otherClient.ws) {
            safeSend(otherClient.ws, {
              type: "opponent_connection_lost",
              match_id: match.match_id,
              message: "Opponent connection was lost."
            });
          }
        }
      }
    }

    clients.delete(client.client_id);
    return;
  }

  if (connection.role === "host") {
    const host = connection;
    console.log("[HOST] disconnected", host.host_id);
    hosts.delete(host.host_id);
    return;
  }

  console.log("[WS] disconnected unknown connection");
}

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const role = url.searchParams.get("role") || "client";

  if (role === "host") {
    const hostId = makeId("host", nextHostNumber++);

    const host = {
      role: "host",
      ws,
      host_id: hostId,
      ready: false,
      capacity: 1,
      current_match_id: ""
    };

    hosts.set(hostId, host);

    console.log("[HOST] connected but unused in Node authoritative mode", hostId);

    safeSend(ws, {
      type: "host_welcome",
      host_id: hostId,
      mode: "node_authoritative"
    });

    ws.on("message", (data) => {
      try {
        const text = data.toString();
        const message = safeParse(text);

        if (!message) {
          console.log("[HOST] invalid JSON from", hostId, "raw=", text);
          return;
        }

        console.log("[HOST MESSAGE]", hostId, JSON.stringify(message));
        handleHostMessage(host, message);
      } catch (error) {
        console.error("[HOST MESSAGE ERROR]", hostId);
        console.error(error && error.stack ? error.stack : error);
      }
    });

    ws.on("close", (code, reason) => {
      console.log(
        "[HOST] socket close",
        hostId,
        "code=",
        code,
        "reason=",
        reason ? reason.toString() : ""
      );

      handleDisconnect(host);
    });

    ws.on("error", (error) => {
      console.error("[HOST] socket error", hostId, error && error.stack ? error.stack : error);
    });

    return;
  }

  const clientId = makeId("client", nextClientNumber++);

  const client = {
    role: "client",
    ws,
    client_id: clientId,
    user_id: 0,
    username: "",
    display_name: "",
    is_authenticated: false,
    queued: false,
    match_id: "",
    seat_id: ""
  };

  clients.set(clientId, client);

  console.log("[CLIENT] connected", clientId);

  safeSend(ws, {
    type: "welcome",
    client_id: clientId
  });

  ws.on("message", (data) => {
    try {
      const text = data.toString();
      const message = safeParse(text);

      if (!message) {
        console.log("[CLIENT] invalid JSON from", clientId, "raw=", text);
        sendError(ws, "Invalid JSON.");
        return;
      }

      console.log("[CLIENT MESSAGE]", clientId, "type=", String(message.type || ""));
      Promise.resolve(handleClientMessage(client, message)).catch((error) => {
        console.error("[CLIENT MESSAGE ERROR]", clientId);
        console.error(error && error.stack ? error.stack : error);
        sendError(ws, "Server failed while handling client message.");
      });
    } catch (error) {
      console.error("[CLIENT MESSAGE ERROR]", clientId);
      console.error(error && error.stack ? error.stack : error);
      sendError(ws, "Server failed while handling client message.");
    }
  });

  ws.on("close", (code, reason) => {
    console.log(
      "[CLIENT] socket close",
      clientId,
      "code=",
      code,
      "reason=",
      reason ? reason.toString() : ""
    );

    handleDisconnect(client);
  });

  ws.on("error", (error) => {
    console.error("[CLIENT] socket error", clientId, error && error.stack ? error.stack : error);
  });
});

setInterval(tickMatchTimers, MATCH_TIMER_TICK_MS);

async function startServer() {
  if (pool) {
    await authService.ensureSchema();
  }

  server.listen(PORT, () => {
    console.log(`[SERVER] Node authoritative gateway + save API listening on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("[SERVER START ERROR]", error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

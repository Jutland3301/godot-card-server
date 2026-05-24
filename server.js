const http = require("http");
const { WebSocketServer } = require("ws");
const { Pool } = require("pg");
const { makeCardFromId, getAvailableCardIds } = require("./cards_database");
const {
  handleBattleAction,
  normalizeStateRuntime,
  startTurn
} = require("./battle_engine");

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || "";

const STARTING_HP = 20;
const STARTING_HAND_SIZE = 3;
const STARTING_MANA = 0;
const MANA_GAIN_PER_TURN = 1;
const MAX_MANA = 10;
const TURN_TIME_LIMIT_SECONDS = 45.0;
const MAX_HAND_SIZE = 7;
const MAX_BOARD_SIZE = 5;

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
const hosts = new Map(); // 互換用。Node authoritative戦闘では使わない。
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
  if (!ws || ws.readyState !== ws.OPEN) {
    return false;
  }

  ws.send(JSON.stringify(message));
  return true;
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
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
    message
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

function makeUserToken(userId) {
  return `user:${userId}`;
}

function parseUserToken(token) {
  const text = String(token || "").trim();

  if (!text.startsWith("user:")) {
    return 0;
  }

  const id = Number(text.slice("user:".length));

  if (!Number.isInteger(id) || id <= 0) {
    return 0;
  }

  return id;
}

function getBearerToken(req) {
  const value = String(req.headers.authorization || "");

  if (!value.startsWith("Bearer ")) {
    return "";
  }

  return value.slice("Bearer ".length).trim();
}

async function getUserByRequest(req) {
  const token = getBearerToken(req);
  const userId = parseUserToken(token);

  if (userId <= 0) {
    return null;
  }

  const result = await dbQuery(
    "SELECT id, username FROM users WHERE id = $1 LIMIT 1",
    [userId]
  );

  if (result.rows.length <= 0) {
    return null;
  }

  return result.rows[0];
}

async function requireUser(req, res) {
  const user = await getUserByRequest(req);

  if (!user) {
    sendJson(res, 401, {
      ok: false,
      error: "Unauthorized"
    });
    return null;
  }

  return user;
}

function normalizeUsername(value) {
  return String(value || "").trim();
}

function normalizePassword(value) {
  return String(value || "").trim();
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
async function handleRegister(req, res) {
  const body = await readJsonBody(req);

  if (body === null) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON" });
    return;
  }

  const username = normalizeUsername(body.username);
  const password = normalizePassword(body.password);

  if (username.length < 3) {
    sendJson(res, 400, { ok: false, error: "Username must be at least 3 characters." });
    return;
  }

  if (password.length < 3) {
    sendJson(res, 400, { ok: false, error: "Password must be at least 3 characters." });
    return;
  }

  try {
    const result = await dbQuery(
      "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username",
      [username, password]
    );

    const user = result.rows[0];

    await dbQuery(
      "INSERT INTO rank_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
      [user.id]
    );

    sendJson(res, 200, {
      ok: true,
      user: { id: user.id, username: user.username },
      token: makeUserToken(user.id)
    });
  } catch (error) {
    if (String(error.message).includes("duplicate") || error.code === "23505") {
      sendJson(res, 409, { ok: false, error: "Username already exists." });
      return;
    }

    throw error;
  }
}

async function handleLogin(req, res) {
  const body = await readJsonBody(req);

  if (body === null) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON" });
    return;
  }

  const username = normalizeUsername(body.username);
  const password = normalizePassword(body.password);

  const result = await dbQuery(
    "SELECT id, username, password FROM users WHERE username = $1 LIMIT 1",
    [username]
  );

  if (result.rows.length <= 0) {
    sendJson(res, 401, { ok: false, error: "Invalid username or password." });
    return;
  }

  const user = result.rows[0];

  if (String(user.password) !== password) {
    sendJson(res, 401, { ok: false, error: "Invalid username or password." });
    return;
  }

  await dbQuery(
    "INSERT INTO rank_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
    [user.id]
  );

  sendJson(res, 200, {
    ok: true,
    user: { id: user.id, username: user.username },
    token: makeUserToken(user.id)
  });
}

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
    sendJson(res, 400, { ok: false, error: "No cards available in CardLibrary.gd." });
    return;
  }

  const opened = [];

  for (let i = 0; i < count; i++) {
    const index = Math.floor(Math.random() * availableCardIds.length);
    opened.push(availableCardIds[index]);
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

  const decksResult = await dbQuery(
    `
    SELECT id, name, side, created_at, updated_at
    FROM decks
    WHERE user_id = $1
    ORDER BY updated_at DESC, id DESC
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

  const body = await readJsonBody(req);

  if (body === null) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON" });
    return;
  }

  const deckId = Number(body.deck_id || body.id || 0);
  const name = String(body.name || body.deck_name || "New Deck").trim();
  const side = normalizeSide(body.side);
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

  if (cardIds.length <= 0) {
    sendJson(res, 400, { ok: false, error: "Deck has no cards." });
    return;
  }

  const cardCounts = countCards(cardIds);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let finalDeckId = deckId;

    if (finalDeckId > 0) {
      const updateResult = await client.query(
        `
        UPDATE decks
        SET name = $1, side = $2, updated_at = NOW()
        WHERE id = $3 AND user_id = $4
        RETURNING id
        `,
        [name, side, finalDeckId, user.id]
      );

      if (updateResult.rows.length <= 0) {
        finalDeckId = 0;
      }
    }

    if (finalDeckId <= 0) {
      const insertResult = await client.query(
        `
        INSERT INTO decks (user_id, name, side)
        VALUES ($1, $2, $3)
        RETURNING id
        `,
        [user.id, name, side]
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
        service: "godot-card-node-authoritative-step2",
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
      await handleRegister(req, res);
      return;
    }

    if (req.method === "POST" && path === "/login") {
      await handleLogin(req, res);
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
    console.log("[HTTP ERROR]", error);
    sendJson(res, 500, { ok: false, error: error.message });
  }
}

const server = http.createServer(handleHttp);
const wss = new WebSocketServer({ server });

// ============================================================================
// Node authoritative battle helpers
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

    if (!clientA.ws || clientA.ws.readyState !== clientA.ws.OPEN) {
      continue;
    }

    if (!clientB.ws || clientB.ws.readyState !== clientB.ws.OPEN) {
      continue;
    }

    const matchId = makeId("match", nextMatchNumber++);

    const match = {
      match_id: matchId,
      state: {},
      seats: {
        A: {
          client_id: entryA.client_id,
          deck_data: entryA.deck_data,
          side: entryA.side
        },
        B: {
          client_id: entryB.client_id,
          deck_data: entryB.deck_data,
          side: entryB.side
        }
      },
      created_at: Date.now()
    };

    match.state = makeInitialMatchState(match);

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
      entryA.side,
      "B=",
      entryB.client_id,
      entryB.side
    );

    sendMatchFound(matchId, match.state);
  }
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }

  return array;
}

function makeInitialPlayerState(ownerId, deckData) {
  const cardIds = getCardIdsFromDeckData(deckData);
  const deck = shuffleArray(cardIds.map((cardId) => makeCardFromId(cardId)));

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

    last_spell_cast: null,
    scholar_cards_played_this_game: 0,
    inflation_counters: 0
  };
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

function drawCards(player, amount) {
  for (let i = 0; i < amount; i++) {
    drawOneCard(player);
  }
}

function getOwnerIdForSeat(seatId) {
  if (seatId === "A") {
    return "player1";
  }

  if (seatId === "B") {
    return "player2";
  }

  return "";
}

function getEnemyOwnerId(ownerId) {
  if (ownerId === "player1") {
    return "player2";
  }

  if (ownerId === "player2") {
    return "player1";
  }

  return "";
}

function getPlayerForOwnerId(state, ownerId) {
  if (!state) {
    return null;
  }

  if (ownerId === "player1") {
    return state.player1 || null;
  }

  if (ownerId === "player2") {
    return state.player2 || null;
  }

  return null;
}

function getOpponentForOwnerId(state, ownerId) {
  return getPlayerForOwnerId(state, getEnemyOwnerId(ownerId));
}

function ensureStateCollections(state) {
  if (!Array.isArray(state.battle_log_messages)) {
    state.battle_log_messages = [];
  }
}

function addBattleLog(state, message) {
  ensureStateCollections(state);
  const text = String(message || "");
  state.status_message = text;
  state.battle_log_messages.push(text);
}

function hasKeyword(card, keyword) {
  if (!card || !Array.isArray(card.keywords)) {
    return false;
  }

  return card.keywords.includes(keyword);
}

function addKeyword(card, keyword) {
  if (!card) {
    return;
  }

  if (!Array.isArray(card.keywords)) {
    card.keywords = [];
  }

  if (!card.keywords.includes(keyword)) {
    card.keywords.push(keyword);
  }
}

function removeKeyword(card, keyword) {
  if (!card || !Array.isArray(card.keywords)) {
    return;
  }

  card.keywords = card.keywords.filter((value) => value !== keyword);
}

function hasTrait(card, trait) {
  if (!card || !Array.isArray(card.traits)) {
    return false;
  }

  return card.traits.includes(trait);
}

function changeStats(card, attackDelta, hpDelta) {
  if (!card) {
    return;
  }

  const attackChange = Number(attackDelta || 0);
  const hpChange = Number(hpDelta || 0);

  card.attack = Number(card.attack || 0) + attackChange;
  card.hp = Number(card.hp || 0) + hpChange;
  card.max_hp = Number(card.max_hp || 0) + hpChange;
  card.base_attack = Number(card.base_attack || 0) + attackChange;
  card.base_hp = Number(card.base_hp || 0) + hpChange;
}

function damageCard(card, amount) {
  if (!card) {
    return 0;
  }

  if (hasKeyword(card, "invincible")) {
    return 0;
  }

  let remaining = Math.max(0, Number(amount || 0));
  let actualDamage = 0;
  const armor = Math.max(0, Number(card.armor || 0));

  if (armor > 0 && remaining > 0) {
    const blocked = Math.min(armor, remaining);
    card.armor = armor - blocked;
    remaining -= blocked;
  }

  if (remaining > 0) {
    card.hp = Number(card.hp || 0) - remaining;
    actualDamage += remaining;
  }

  return actualDamage;
}

function healCard(card, amount) {
  if (!card) {
    return 0;
  }

  const before = Number(card.hp || 0);
  const maxHp = Number(card.max_hp || before);
  card.hp = Math.min(maxHp, before + Math.max(0, Number(amount || 0)));
  return card.hp - before;
}

function damagePlayer(player, amount) {
  if (!player) {
    return 0;
  }

  const damage = Math.max(0, Number(amount || 0));
  player.hp = Number(player.hp || 0) - damage;
  return damage;
}

function healPlayer(player, amount) {
  if (!player) {
    return 0;
  }

  const before = Number(player.hp || 0);
  const maxHp = Number(player.max_hp || before);
  player.hp = Math.min(maxHp, before + Math.max(0, Number(amount || 0)));
  return player.hp - before;
}

function removeDeadUnits(state) {
  const destroyed = [];

  for (const ownerId of ["player1", "player2"]) {
    const player = getPlayerForOwnerId(state, ownerId);

    if (!player || !Array.isArray(player.board)) {
      continue;
    }

    const survivors = [];

    for (const unit of player.board) {
      if (unit && Number(unit.hp || 0) <= 0 && !hasKeyword(unit, "invincible")) {
        player.graveyard.push(unit);
        destroyed.push({ ownerId, unit });
      } else {
        survivors.push(unit);
      }
    }

    player.board = survivors;
  }

  return destroyed;
}

function checkGameOver(state) {
  if (!state || state.game_over) {
    return;
  }

  const player1 = state.player1;
  const player2 = state.player2;

  if (!player1 || !player2) {
    return;
  }

  if (Number(player1.hp || 0) <= 0 && Number(player2.hp || 0) <= 0) {
    state.game_over = true;
    state.turn_timer_active = false;
    addBattleLog(state, "Both leaders were defeated. Draw.");
    return;
  }

  if (Number(player1.hp || 0) <= 0) {
    state.game_over = true;
    state.turn_timer_active = false;
    addBattleLog(state, "Player2 wins.");
    return;
  }

  if (Number(player2.hp || 0) <= 0) {
    state.game_over = true;
    state.turn_timer_active = false;
    addBattleLog(state, "Player1 wins.");
  }
}

function applySummonState(card) {
  if (!card) {
    return;
  }

  card.summoned_this_turn = true;
  card.has_attacked_this_turn = false;
  card.attacks_this_turn = 0;

  if (hasKeyword(card, "haste") || hasKeyword(card, "rush")) {
    card.can_attack = true;
    card.exhausted = false;
    return;
  }

  card.can_attack = false;
  card.exhausted = true;
}

function startServerTurn(state) {
  if (!state || state.game_over) {
    return;
  }

  const currentPlayerId = String(state.current_player_id || "player1");
  const currentPlayer = state[currentPlayerId];

  if (!currentPlayer) {
    return;
  }

  const drawn = drawOneCard(currentPlayer);

  if (!drawn) {
    state.game_over = true;
    state.status_message = currentPlayer.name + " loses because they cannot draw a card.";
    state.battle_log_messages.push(state.status_message);
    state.turn_timer_active = false;
    return;
  }

  currentPlayer.max_mana = Math.min(Number(currentPlayer.max_mana || 0) + MANA_GAIN_PER_TURN, MAX_MANA);
  currentPlayer.mana = currentPlayer.max_mana;

  if (Array.isArray(currentPlayer.board)) {
    for (const unit of currentPlayer.board) {
      if (!unit) {
        continue;
      }

      unit.summoned_this_turn = false;
      unit.can_attack = true;
      unit.exhausted = false;
      unit.has_attacked_this_turn = false;
      unit.attacks_this_turn = 0;

      if (hasKeyword(unit, "immobile")) {
        unit.can_attack = false;
        unit.exhausted = true;
      }

      if (!unit.once_per_turn_flags || typeof unit.once_per_turn_flags !== "object") {
        unit.once_per_turn_flags = {};
      }
    }
  }

  state.turn_time_left = TURN_TIME_LIMIT_SECONDS;
  state.turn_timer_active = true;
  state.turn_timer_timeout_handled = false;

  addBattleLog(state, "Turn " + state.turn_number + ": " + currentPlayer.name + "'s turn started.");
}

function makeInitialMatchState(match) {
  const player1 = makeInitialPlayerState("player1", match.seats.A.deck_data);
  const player2 = makeInitialPlayerState("player2", match.seats.B.deck_data);

  for (let i = 0; i < STARTING_HAND_SIZE; i++) {
    drawOneCard(player1);
    drawOneCard(player2);
  }

  const state = {
    match_id: match.match_id,
    authority_mode: "server",

    turn_number: 1,
    current_player_id: "player1",

    // battle_engine.js 互換用
    turn_seat: "A",
    winner_seat: null,
    loser_seat: null,

    game_over: false,
    status_message: "",
    turn_time_left: TURN_TIME_LIMIT_SECONDS,
    turn_timer_active: false,
    turn_timer_timeout_handled: false,

    player1,
    player2,

    // battle_engine.js 互換用。
    // 同じ player object を参照させるので、player1/player2 と二重管理にならない。
    players: {
      A: player1,
      B: player2
    },

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

    // battle_engine.js 互換用
    selected: null,
    pending_deaths: [],
    pending_summons: [],

    battle_log_messages: [],

    // battle_engine.js 互換用
    log: [],

    seat_to_owner_id: { A: "player1", B: "player2" },
    owner_to_seat_id: { player1: "A", player2: "B" }
  };

  // 既存Godot表示形式用のターン開始。
  // ここで初手3枚のあと、先攻1ドロー + mana 1 になる。
  startServerTurn(state);

  // startServerTurn後に current_player_id / timer / mana が確定するので同期。
  state.turn_seat = state.owner_to_seat_id[state.current_player_id] || "A";

  // battle_engine.js 側の normalize は players.A/B 前提なので、
  // ここでは state.players を作った後に呼ぶ。
  normalizeStateRuntime(state);

  // normalizeStateRuntime が log を見るので、既存ログも合わせる。
  if (Array.isArray(state.battle_log_messages) && Array.isArray(state.log)) {
    for (const message of state.battle_log_messages) {
      if (!state.log.includes(message)) {
        state.log.push(message);
      }
    }
  }

  return state;
}

function clearPendingSelection(state) {
  state.selecting_target = false;
  state.selecting_hand_card = false;
  state.pending_action_type = "none";
  state.pending_card = null;
  state.pending_hand_index = -1;
  state.pending_card_owner = "";
  state.pending_attacker_index = -1;
  state.selected_attacker_owner = "";
  state.selected_attacker_index = -1;
  state.pending_ability = {};
}

function findRandomIndex(array, predicate) {
  const candidates = [];

  for (let i = 0; i < array.length; i++) {
    if (predicate(array[i], i)) {
      candidates.push(i);
    }
  }

  if (candidates.length <= 0) {
    return -1;
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

function drawRandomCardFromDeck(player, predicate) {
  if (!player || !Array.isArray(player.deck)) {
    return null;
  }

  const index = findRandomIndex(player.deck, predicate);

  if (index < 0) {
    return null;
  }

  const card = player.deck.splice(index, 1)[0];

  if (!Array.isArray(player.hand)) {
    player.hand = [];
  }

  if (player.hand.length >= MAX_HAND_SIZE) {
    player.graveyard.push(card);
  } else {
    player.hand.push(card);
  }

  return card;
}

function resolveSimpleSpellEffect(state, ownerId, card, payload) {
  const player = getPlayerForOwnerId(state, ownerId);
  const opponent = getOpponentForOwnerId(state, ownerId);
  const effectId = String(card.effect_id || "none");
  const power = Number(card.power || 0);

  if (effectId === "draw") {
    drawCards(player, power);
    addBattleLog(state, player.name + " drew " + power + " card(s).");
    return { ok: true, state };
  }

  if (effectId === "damage" && String(card.target_type || "none") === "enemy_player") {
    damagePlayer(opponent, power);
    addBattleLog(state, card.card_name + " dealt " + power + " damage to enemy leader.");
    checkGameOver(state);
    return { ok: true, state };
  }

  if (effectId === "heal" && String(card.target_type || "none") === "friendly_player") {
    healPlayer(player, power);
    addBattleLog(state, card.card_name + " healed allied leader for " + power + ".");
    return { ok: true, state };
  }

  if (effectId === "buff_all_ally_units") {
    for (const unit of player.board) {
      changeStats(unit, 1, 1);
    }
    addBattleLog(state, card.card_name + " gave all allied units +1/+1.");
    return { ok: true, state };
  }

  if (effectId === "economics_overflow") {
    player.inflation_counters = Number(player.inflation_counters || 0) + 4;
    addBattleLog(state, player.name + " gained 4 Inflation Counters.");
    return { ok: true, state };
  }

  if (effectId === "book_of_rushwater") {
    for (const unit of opponent.board) {
      damageCard(unit, Number(card.power || 4));
    }
    removeDeadUnits(state);
    checkGameOver(state);
    addBattleLog(state, card.card_name + " dealt damage to all enemy units.");
    return { ok: true, state };
  }

  if (effectId === "introduction_to_armory") {
    for (const unit of player.board) {
      unit.armor = Number(unit.armor || 0) + 1;
    }
    addBattleLog(state, card.card_name + " gave allied units Armor 1.");
    return { ok: true, state };
  }

  if (effectId === "none") {
    addBattleLog(state, player.name + " cast " + card.card_name + ".");
    return { ok: true, state };
  }

  addBattleLog(state, player.name + " cast " + card.card_name + " but effect is not fully migrated yet: " + effectId);
  return { ok: true, state };
}

function beginTargetSelection(state, ownerId, handIndex, card) {
  state.selecting_target = true;
  state.selecting_hand_card = false;
  state.pending_action_type = "play_card_target";
  state.pending_card = deepClone(card);
  state.pending_hand_index = handIndex;
  state.pending_card_owner = ownerId;
  state.pending_ability = {};

  addBattleLog(state, "Choose a target for " + String(card.card_name || card.card_id) + ".");

  return { ok: true, state };
}

function canTargetPlayer(card, ownerId, targetOwnerId) {
  const targetType = String(card.target_type || "none");

  if (targetType === "friendly_player") {
    return ownerId === targetOwnerId;
  }

  if (targetType === "enemy_player") {
    return ownerId !== targetOwnerId;
  }

  if (targetType === "any_enemy") {
    return ownerId !== targetOwnerId;
  }

  if (targetType === "any_friendly") {
    return ownerId === targetOwnerId;
  }

  if (targetType === "any") {
    return true;
  }

  return false;
}

function canTargetUnit(card, ownerId, targetOwnerId, unit) {
  if (!unit) {
    return false;
  }

  const targetType = String(card.target_type || "none");

  if (targetType === "enemy_unit") {
    return ownerId !== targetOwnerId;
  }

  if (targetType === "any_unit") {
    return true;
  }

  if (targetType === "any_enemy") {
    return ownerId !== targetOwnerId;
  }

  if (targetType === "any_friendly") {
    return ownerId === targetOwnerId;
  }

  if (targetType === "any") {
    return true;
  }

  return false;
}

function resolveTargetedCardOnPlayer(state, targetOwnerId) {
  const ownerId = String(state.pending_card_owner || "");
  const player = getPlayerForOwnerId(state, ownerId);
  const targetPlayer = getPlayerForOwnerId(state, targetOwnerId);
  const card = state.pending_card;

  if (!ownerId || !player || !targetPlayer || !card) {
    return { ok: false, message: "No pending targeted card." };
  }

  if (!canTargetPlayer(card, ownerId, targetOwnerId)) {
    return { ok: false, message: "Invalid player target." };
  }

  if (card.effect_id === "damage") {
    damagePlayer(targetPlayer, Number(card.power || 0));
    addBattleLog(state, card.card_name + " dealt " + Number(card.power || 0) + " damage.");
  } else if (card.effect_id === "heal") {
    healPlayer(targetPlayer, Number(card.power || 0));
    addBattleLog(state, card.card_name + " healed " + Number(card.power || 0) + ".");
  } else {
    addBattleLog(state, card.card_name + " resolved on leader. effect not fully migrated: " + card.effect_id);
  }

  player.graveyard.push(card);
  clearPendingSelection(state);
  checkGameOver(state);

  return { ok: true, state };
}

function resolveTargetedCardOnUnit(state, targetOwnerId, unitIndex) {
  const ownerId = String(state.pending_card_owner || "");
  const player = getPlayerForOwnerId(state, ownerId);
  const targetPlayer = getPlayerForOwnerId(state, targetOwnerId);
  const card = state.pending_card;

  if (!ownerId || !player || !targetPlayer || !card) {
    return { ok: false, message: "No pending targeted card." };
  }

  if (!Array.isArray(targetPlayer.board) || unitIndex < 0 || unitIndex >= targetPlayer.board.length) {
    return { ok: false, message: "Invalid unit target." };
  }

  const targetUnit = targetPlayer.board[unitIndex];

  if (!canTargetUnit(card, ownerId, targetOwnerId, targetUnit)) {
    return { ok: false, message: "Invalid unit target." };
  }

  if (hasKeyword(targetUnit, "untrickable") && ownerId !== targetOwnerId) {
    return { ok: false, message: "Target is untrickable." };
  }

  if (card.effect_id === "damage") {
    damageCard(targetUnit, Number(card.power || 0));
    addBattleLog(state, card.card_name + " dealt " + Number(card.power || 0) + " damage to " + targetUnit.card_name + ".");
  } else if (card.effect_id === "heal") {
    healCard(targetUnit, Number(card.power || 0));
    addBattleLog(state, card.card_name + " healed " + targetUnit.card_name + ".");
  } else if (card.effect_id === "destroy_unit") {
    targetUnit.hp = 0;
    addBattleLog(state, card.card_name + " destroyed " + targetUnit.card_name + ".");
  } else if (card.effect_id === "add_keyword") {
    const ability = Array.isArray(card.abilities) && card.abilities.length > 0 ? card.abilities[0] : {};
    const keyword = String(ability.keyword || "");

    if (keyword) {
      addKeyword(targetUnit, keyword);
      addBattleLog(state, targetUnit.card_name + " gained " + keyword + ".");
    }
  } else if (card.effect_id === "add_keywords_to_unit") {
    const ability = Array.isArray(card.abilities) && card.abilities.length > 0 ? card.abilities[0] : {};
    const keywords = Array.isArray(ability.keywords) ? ability.keywords : [];

    for (const keyword of keywords) {
      addKeyword(targetUnit, String(keyword));
    }

    addBattleLog(state, targetUnit.card_name + " gained keywords from " + card.card_name + ".");
  } else {
    addBattleLog(state, card.card_name + " resolved on unit. effect not fully migrated: " + card.effect_id);
  }

  player.graveyard.push(card);
  removeDeadUnits(state);
  clearPendingSelection(state);
  checkGameOver(state);

  return { ok: true, state };
}

function resolveBattlecry(state, ownerId, card) {
  const player = getPlayerForOwnerId(state, ownerId);
  const opponent = getOpponentForOwnerId(state, ownerId);

  if (!player || !card || !Array.isArray(card.abilities)) {
    return;
  }

  for (const ability of card.abilities) {
    if (!ability || String(ability.trigger || "") !== "battlecry") {
      continue;
    }

    const effect = String(ability.effect || "");

    if (effect === "draw") {
      drawCards(player, Number(ability.amount || 1));
      addBattleLog(state, card.card_name + " drew cards.");
    } else if (effect === "summon_cards") {
      const amount = Number(ability.amount || 1);
      const cardId = String(ability.card_id || "");

      for (let i = 0; i < amount; i++) {
        if (player.board.length >= MAX_BOARD_SIZE) {
          break;
        }

        const summoned = makeCardFromId(cardId);
        applySummonState(summoned);
        player.board.push(summoned);
      }

      addBattleLog(state, card.card_name + " summoned " + amount + " card(s).");
    } else if (effect === "buff_trait") {
      const trait = String(ability.trait || "");

      for (const unit of player.board) {
        if (hasTrait(unit, trait)) {
          changeStats(unit, Number(ability.attack || 0), Number(ability.hp || 0));
          const keywords = Array.isArray(ability.keywords) ? ability.keywords : [];
          for (const keyword of keywords) {
            addKeyword(unit, String(keyword));
          }
        }
      }
    } else if (effect === "scribe_of_history") {
      const count = Array.isArray(opponent.board) ? opponent.board.length : 0;
      changeStats(card, count, count);
    } else if (effect === "blind_researcher") {
      drawRandomCardFromDeck(player, (deckCard) => hasTrait(deckCard, "scholar"));
    } else if (effect === "humble_librarian") {
      const burnCount = player.hand.length;
      while (player.hand.length > 0) {
        player.graveyard.push(player.hand.shift());
      }
      drawCards(player, burnCount);
    } else if (effect === "all_knowing_archivist") {
      damagePlayer(opponent, Number(card.cost || 0));
    } else {
      addBattleLog(state, card.card_name + " battlecry not fully migrated: " + effect);
    }
  }

  removeDeadUnits(state);
  checkGameOver(state);
}

function playCardFromHand(match, seatId, handIndex) {
  const state = match.state || {};
  const ownerId = getOwnerIdForSeat(seatId);
  const player = getPlayerForOwnerId(state, ownerId);

  if (!ownerId || !player) {
    return { ok: false, message: "Invalid player." };
  }

  if (state.game_over) {
    return { ok: false, message: "Game is already over." };
  }

  if (state.current_player_id !== ownerId) {
    return { ok: false, message: "Not your turn." };
  }

  if (!Array.isArray(player.hand)) {
    player.hand = [];
  }

  if (!Array.isArray(player.board)) {
    player.board = [];
  }

  if (!Array.isArray(player.graveyard)) {
    player.graveyard = [];
  }

  if (handIndex < 0 || handIndex >= player.hand.length) {
    return { ok: false, message: "Invalid hand index." };
  }

  const card = player.hand[handIndex];

  if (!card) {
    return { ok: false, message: "Selected card is missing." };
  }

  let cost = Number(card.cost || 0);

  if (card.card_type === "unit" && Number(player.inflation_counters || 0) > 0) {
    cost += 1;
  }

  if (Number(player.mana || 0) < cost) {
    return {
      ok: false,
      message: "Not enough mana to play " + String(card.card_name || card.card_id || "card") + "."
    };
  }

  if (card.card_type === "unit" && player.board.length >= MAX_BOARD_SIZE) {
    return { ok: false, message: "Board is full." };
  }

  const targetType = String(card.target_type || "none");

  if (targetType !== "none") {
    player.mana = Number(player.mana || 0) - cost;
    player.hand.splice(handIndex, 1);
    return beginTargetSelection(state, ownerId, handIndex, card);
  }

  player.mana = Number(player.mana || 0) - cost;
  player.hand.splice(handIndex, 1);

  if (card.card_type === "unit") {
    if (Number(player.inflation_counters || 0) > 0) {
      player.inflation_counters = Number(player.inflation_counters || 0) - 1;
      changeStats(card, 2, 1);
    }

    applySummonState(card);
    player.board.push(card);

    if (hasTrait(card, "scholar")) {
      player.scholar_cards_played_this_game = Number(player.scholar_cards_played_this_game || 0) + 1;
    }

    addBattleLog(state, player.name + " summoned " + String(card.card_name || card.card_id) + ".");
    resolveBattlecry(state, ownerId, card);

    return { ok: true, state };
  }

  if (card.card_type === "spell") {
    player.last_spell_cast = deepClone(card);
    player.graveyard.push(card);

    if (hasTrait(card, "scholar")) {
      player.scholar_cards_played_this_game = Number(player.scholar_cards_played_this_game || 0) + 1;
    }

    const result = resolveSimpleSpellEffect(state, ownerId, card, {});
    checkGameOver(state);
    return result;
  }

  return { ok: false, message: "Unknown card type: " + String(card.card_type || "") };
}

function resolveAttack(match, seatId, attackerIndex, targetOwnerId, targetIndex, targetIsLeader) {
  const state = match.state || {};
  const ownerId = getOwnerIdForSeat(seatId);
  const attackerPlayer = getPlayerForOwnerId(state, ownerId);
  const defenderPlayer = getPlayerForOwnerId(state, targetOwnerId);

  if (!ownerId || !attackerPlayer || !defenderPlayer) {
    return { ok: false, message: "Invalid attacker or target." };
  }

  if (state.game_over) {
    return { ok: false, message: "Game is already over." };
  }

  if (state.current_player_id !== ownerId) {
    return { ok: false, message: "Not your turn." };
  }

  if (!Array.isArray(attackerPlayer.board) || attackerIndex < 0 || attackerIndex >= attackerPlayer.board.length) {
    return { ok: false, message: "Invalid attacker index." };
  }

  const attacker = attackerPlayer.board[attackerIndex];

  if (!attacker) {
    return { ok: false, message: "Attacker is missing." };
  }

  if (!attacker.can_attack || attacker.exhausted || hasKeyword(attacker, "immobile")) {
    return { ok: false, message: "This unit cannot attack." };
  }

  if (Number(attacker.attacks_this_turn || 0) >= Number(attacker.max_attacks_per_turn || 1)) {
    return { ok: false, message: "This unit has already attacked enough times." };
  }

  if (targetIsLeader) {
    if (ownerId === targetOwnerId) {
      return { ok: false, message: "Cannot attack your own leader." };
    }

    if (hasKeyword(attacker, "rush") && attacker.summoned_this_turn && !hasKeyword(attacker, "haste")) {
      return { ok: false, message: "Rush units cannot attack leader on the turn they are summoned." };
    }

    const taunts = defenderPlayer.board.filter((unit) => hasKeyword(unit, "taunt"));

    if (taunts.length > 0) {
      return { ok: false, message: "Enemy taunt unit must be attacked first." };
    }

    damagePlayer(defenderPlayer, Number(attacker.attack || 0));
    attacker.attacks_this_turn = Number(attacker.attacks_this_turn || 0) + 1;

    if (Number(attacker.attacks_this_turn || 0) >= Number(attacker.max_attacks_per_turn || 1)) {
      attacker.can_attack = false;
      attacker.exhausted = true;
    }

    addBattleLog(state, attacker.card_name + " attacked enemy leader for " + Number(attacker.attack || 0) + ".");
    checkGameOver(state);
    return { ok: true, state };
  }

  if (!Array.isArray(defenderPlayer.board) || targetIndex < 0 || targetIndex >= defenderPlayer.board.length) {
    return { ok: false, message: "Invalid target unit index." };
  }

  const defender = defenderPlayer.board[targetIndex];

  if (!defender) {
    return { ok: false, message: "Target unit is missing." };
  }

  if (ownerId === targetOwnerId) {
    return { ok: false, message: "Cannot attack your own unit." };
  }

  const taunts = defenderPlayer.board.filter((unit) => hasKeyword(unit, "taunt"));

  if (taunts.length > 0 && !hasKeyword(defender, "taunt")) {
    return { ok: false, message: "Enemy taunt unit must be attacked first." };
  }

  const attackerDamage = Number(attacker.attack || 0);
  const defenderDamage = Number(defender.attack || 0);

  if (hasKeyword(attacker, "deadly") && attackerDamage > 0) {
    defender.hp = 0;
  } else {
    damageCard(defender, attackerDamage);
  }

  if (hasKeyword(defender, "deadly") && defenderDamage > 0) {
    attacker.hp = 0;
  } else {
    damageCard(attacker, defenderDamage);
  }

  if (hasKeyword(attacker, "ricochet") && attackerDamage > 0) {
    damagePlayer(defenderPlayer, attackerDamage);
  }

  attacker.attacks_this_turn = Number(attacker.attacks_this_turn || 0) + 1;

  if (Number(attacker.attacks_this_turn || 0) >= Number(attacker.max_attacks_per_turn || 1)) {
    attacker.can_attack = false;
    attacker.exhausted = true;
  }

  removeDeadUnits(state);
  addBattleLog(state, attacker.card_name + " attacked " + defender.card_name + ".");
  checkGameOver(state);

  return { ok: true, state };
}

function finishMatchBySurrender(match, seatId) {
  const state = match.state || {};
  const loserOwnerId = getOwnerIdForSeat(seatId);
  const winnerOwnerId = getEnemyOwnerId(loserOwnerId);

  if (!loserOwnerId || !winnerOwnerId) {
    return { ok: false, message: "Invalid surrender seat." };
  }

  const loser = state[loserOwnerId];
  const winner = state[winnerOwnerId];

  if (!loser || !winner) {
    return { ok: false, message: "Invalid surrender players." };
  }

  loser.hp = 0;
  state.game_over = true;
  state.turn_timer_active = false;
  state.turn_timer_timeout_handled = true;
  clearPendingSelection(state);

  addBattleLog(state, loser.name + " surrendered. " + winner.name + " wins.");

  return { ok: true, state };
}

function endServerTurn(match, seatId) {
  const state = match.state || {};
  const ownerId = getOwnerIdForSeat(seatId);

  if (!ownerId) {
    return { ok: false, message: "Invalid seat." };
  }

  if (state.game_over) {
    return { ok: false, message: "Game is already over." };
  }

  if (state.current_player_id !== ownerId) {
    return { ok: false, message: "Not your turn." };
  }

  const current = state[state.current_player_id];

  if (current) {
    state.battle_log_messages.push(current.name + "'s turn ended.");
  }

  state.current_player_id = ownerId === "player1" ? "player2" : "player1";
  state.turn_number = Number(state.turn_number || 1) + 1;
  clearPendingSelection(state);

  startServerTurn(state);

  return { ok: true, state };
}

function syncBattleEngineStateToLegacyState(state) {
  if (!state) {
    return state;
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

  if (!state.seat_to_owner_id || typeof state.seat_to_owner_id !== "object") {
    state.seat_to_owner_id = { A: "player1", B: "player2" };
  }

  if (!state.owner_to_seat_id || typeof state.owner_to_seat_id !== "object") {
    state.owner_to_seat_id = { player1: "A", player2: "B" };
  }

  if (state.turn_seat === "A") {
    state.current_player_id = "player1";
  } else if (state.turn_seat === "B") {
    state.current_player_id = "player2";
  } else if (!state.current_player_id) {
    state.current_player_id = "player1";
    state.turn_seat = "A";
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

  if (state.winner_seat && !state.game_over) {
    state.game_over = true;
    state.turn_timer_active = false;
    state.turn_timer_timeout_handled = true;

    const winnerOwnerId = state.seat_to_owner_id[state.winner_seat] || "";
    const loserOwnerId = state.seat_to_owner_id[state.loser_seat] || "";

    if (winnerOwnerId && state[winnerOwnerId]) {
      state.status_message = state[winnerOwnerId].name + " wins.";
    } else {
      state.status_message = "Winner: " + state.winner_seat;
    }

    if (state.status_message && !state.battle_log_messages.includes(state.status_message)) {
      state.battle_log_messages.push(state.status_message);
    }

    if (loserOwnerId && state[loserOwnerId]) {
      state[loserOwnerId].hp = Math.min(0, Number(state[loserOwnerId].hp || 0));
    }
  }

  if (state.game_over) {
    state.turn_timer_active = false;
  }

  return state;
}

function broadcastMatchState(matchId, state) {
  const match = matches.get(matchId);

  if (!match) {
    return;
  }

  match.state = state || {};

  const clientA = clients.get(match.seats.A.client_id);
  const clientB = clients.get(match.seats.B.client_id);

  if (clientA) {
    safeSend(clientA.ws, { type: "match_state", match_id: matchId, seat_id: "A", state: match.state });
  }

  if (clientB) {
    safeSend(clientB.ws, { type: "match_state", match_id: matchId, seat_id: "B", state: match.state });
  }
}

function sendMatchFound(matchId, state) {
  const match = matches.get(matchId);

  if (!match) {
    return;
  }

  const clientA = clients.get(match.seats.A.client_id);
  const clientB = clients.get(match.seats.B.client_id);

  const sideA = match.seats.A.side;
  const sideB = match.seats.B.side;

  if (clientA) {
    safeSend(clientA.ws, {
      type: "match_found",
      match_id: matchId,
      seat_id: "A",
      side: sideA,
      opponent_side: sideB,
      state: state || {}
    });
  }

  if (clientB) {
    safeSend(clientB.ws, {
      type: "match_found",
      match_id: matchId,
      seat_id: "B",
      side: sideB,
      opponent_side: sideA,
      state: state || {}
    });
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
// WebSocket message handling
// ============================================================================
function handleClientMessage(client, message) {
  const type = String(message.type || "");

  switch (type) {
    case "auth": {
      client.user_id = String(message.user_id || "");
      safeSend(client.ws, { type: "auth_ok", user_id: client.user_id });
      return;
    }

    case "queue_join": {
      const deckData = message.deck_data || {};
      const validationError = validateDeckData(deckData);

      if (validationError) {
        sendError(client.ws, validationError);
        return;
      }

      removeClientFromQueue(client.client_id);

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

      console.log("[QUEUE] joined", client.client_id, "side=", side, "queue=", queue.length);

      safeSend(client.ws, { type: "queue_joined", side, queue_size: queue.length });

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

      if (!match.state.players || typeof match.state.players !== "object") {
        match.state.players = {
          A: match.state.player1,
          B: match.state.player2
        };
      }

      if (!match.state.turn_seat) {
        match.state.turn_seat = match.state.owner_to_seat_id
          ? match.state.owner_to_seat_id[match.state.current_player_id] || "A"
          : "A";
      }

      const enginePayload = {
        ...payload,
        action
      };

      const result = handleBattleAction(match, seatId, enginePayload, {
        makeCardFromId
      });

      if (!result.ok) {
        sendActionRejected(client.client_id, result.reason || result.message || "Action rejected.");
        return;
      }

      match.state = syncBattleEngineStateToLegacyState(result.state || match.state);
      broadcastMatchState(matchId, match.state);

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
        const otherSeatId = client.seat_id === "A" ? "B" : "A";
        const otherSeat = match.seats[otherSeatId];

        if (otherSeat) {
          const otherClient = clients.get(otherSeat.client_id);

          if (otherClient) {
            safeSend(otherClient.ws, {
              type: "opponent_left",
              match_id: match.match_id,
              message: "Opponent left the match."
            });

            otherClient.match_id = "";
            otherClient.seat_id = "";
          }
        }

        destroyMatch(match.match_id, "Client disconnected.");
      }
    }

    clients.delete(client.client_id);
    return;
  }

  if (connection.role === "host") {
    const host = connection;
    console.log("[HOST] disconnected", host.host_id);
    hosts.delete(host.host_id);
  }
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
      const message = safeParse(data.toString());

      if (!message) {
        console.log("[HOST] invalid JSON from", hostId);
        return;
      }

      handleHostMessage(host, message);
    });

    ws.on("close", () => handleDisconnect(host));
    ws.on("error", (error) => console.log("[HOST] socket error", hostId, error.message));

    return;
  }

  const clientId = makeId("client", nextClientNumber++);

  const client = {
    role: "client",
    ws,
    client_id: clientId,
    user_id: "",
    queued: false,
    match_id: "",
    seat_id: ""
  };

  clients.set(clientId, client);

  console.log("[CLIENT] connected", clientId);

  safeSend(ws, { type: "welcome", client_id: clientId });

  ws.on("message", (data) => {
    const message = safeParse(data.toString());

    if (!message) {
      console.log("[CLIENT] invalid JSON from", clientId);
      sendError(ws, "Invalid JSON.");
      return;
    }

    handleClientMessage(client, message);
  });

  ws.on("close", () => handleDisconnect(client));
  ws.on("error", (error) => console.log("[CLIENT] socket error", clientId, error.message));
});

server.listen(PORT, () => {
  console.log(`[SERVER] Node authoritative gateway + save API listening on port ${PORT}`);
});

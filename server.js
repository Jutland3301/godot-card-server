const http = require("http");
const { WebSocketServer } = require("ws");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || "";

const STARTING_HP = 20;
const STARTING_HAND_SIZE = 3;
const STARTING_MANA = 0;
const MANA_GAIN_PER_TURN = 1;
const MAX_MANA = 10;
const TURN_TIME_LIMIT_SECONDS = 45.0;
const MAX_HAND_SIZE = 7;

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
const hosts = new Map(); // 互換用に残す。Node authoritative戦闘では使わない。
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
    sendJson(res, 400, {
      ok: false,
      error: "Invalid JSON"
    });
    return;
  }

  const username = normalizeUsername(body.username);
  const password = normalizePassword(body.password);

  if (username.length < 3) {
    sendJson(res, 400, {
      ok: false,
      error: "Username must be at least 3 characters."
    });
    return;
  }

  if (password.length < 3) {
    sendJson(res, 400, {
      ok: false,
      error: "Password must be at least 3 characters."
    });
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
      user: {
        id: user.id,
        username: user.username
      },
      token: makeUserToken(user.id)
    });
  } catch (error) {
    if (String(error.message).includes("duplicate") || error.code === "23505") {
      sendJson(res, 409, {
        ok: false,
        error: "Username already exists."
      });
      return;
    }

    throw error;
  }
}

async function handleLogin(req, res) {
  const body = await readJsonBody(req);

  if (body === null) {
    sendJson(res, 400, {
      ok: false,
      error: "Invalid JSON"
    });
    return;
  }

  const username = normalizeUsername(body.username);
  const password = normalizePassword(body.password);

  const result = await dbQuery(
    "SELECT id, username, password FROM users WHERE username = $1 LIMIT 1",
    [username]
  );

  if (result.rows.length <= 0) {
    sendJson(res, 401, {
      ok: false,
      error: "Invalid username or password."
    });
    return;
  }

  const user = result.rows[0];

  if (String(user.password) !== password) {
    sendJson(res, 401, {
      ok: false,
      error: "Invalid username or password."
    });
    return;
  }

  await dbQuery(
    "INSERT INTO rank_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
    [user.id]
  );

  sendJson(res, 200, {
    ok: true,
    user: {
      id: user.id,
      username: user.username
    },
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

  sendJson(res, 200, {
    ok: true,
    cards: result.rows
  });
}

async function handleOpenPack(req, res) {
  const user = await requireUser(req, res);

  if (!user) {
    return;
  }

  const body = await readJsonBody(req);

  if (body === null) {
    sendJson(res, 400, {
      ok: false,
      error: "Invalid JSON"
    });
    return;
  }

  const packType = String(body.pack_type || body.packType || "test");
  const count = Math.max(1, Math.min(20, Number(body.count || 5)));

  const cardsResult = await dbQuery(
    `
    SELECT card_id
    FROM cards
    WHERE enabled = TRUE
    ORDER BY card_id ASC
    `
  );

  if (cardsResult.rows.length <= 0) {
    sendJson(res, 400, {
      ok: false,
      error: "No enabled cards in cards table."
    });
    return;
  }

  const poolCards = cardsResult.rows.map((row) => String(row.card_id));
  const opened = [];

  for (let i = 0; i < count; i++) {
    const index = Math.floor(Math.random() * poolCards.length);
    opened.push(poolCards[index]);
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

  sendJson(res, 200, {
    ok: true,
    decks
  });
}

async function handleSaveDeck(req, res) {
  const user = await requireUser(req, res);

  if (!user) {
    return;
  }

  const body = await readJsonBody(req);

  if (body === null) {
    sendJson(res, 400, {
      ok: false,
      error: "Invalid JSON"
    });
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
    sendJson(res, 400, {
      ok: false,
      error: "Deck name is empty."
    });
    return;
  }

  if (cardIds.length <= 0) {
    sendJson(res, 400, {
      ok: false,
      error: "Deck has no cards."
    });
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

    await client.query(
      "DELETE FROM deck_cards WHERE deck_id = $1",
      [finalDeckId]
    );

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

  sendJson(res, 200, {
    ok: true,
    profile: result.rows[0]
  });
}

async function handleRankedResult(req, res) {
  const user = await requireUser(req, res);

  if (!user) {
    return;
  }

  const body = await readJsonBody(req);

  if (body === null) {
    sendJson(res, 400, {
      ok: false,
      error: "Invalid JSON"
    });
    return;
  }

  const resultText = String(body.result || "").toLowerCase();
  const opponentId = Number(body.opponent_id || 0);

  if (resultText !== "win" && resultText !== "loss" && resultText !== "draw") {
    sendJson(res, 400, {
      ok: false,
      error: "result must be win, loss, or draw."
    });
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
        service: "godot-card-node-authoritative-step1",
        db: !!pool,
        clients: clients.size,
        hosts: hosts.size,
        queued: queue.length,
        matches: matches.size
      });
      return;
    }

    if (!pool) {
      sendJson(res, 500, {
        ok: false,
        error: "DATABASE_URL is not set."
      });
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

    sendJson(res, 404, {
      ok: false,
      error: "Not found"
    });
  } catch (error) {
    console.log("[HTTP ERROR]", error);
    sendJson(res, 500, {
      ok: false,
      error: error.message
    });
  }
}

const server = http.createServer(handleHttp);
const wss = new WebSocketServer({ server });

// ============================================================================
// Node authoritative battle helpers - Step 1
// ============================================================================
function removeClientFromQueue(clientId) {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].client_id === clientId) {
      queue.splice(i, 1);
    }
  }
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

function getCardIdsFromDeckData(deckData) {
  if (!deckData || typeof deckData !== "object") {
    return [];
  }

  const source = Array.isArray(deckData.card_ids)
    ? deckData.card_ids
    : Array.isArray(deckData.cards)
      ? deckData.cards
      : [];

  return source
    .map((value) => String(value || "").trim())
    .filter(Boolean);
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

function makeInitialCardState(cardId) {
  const cleanCardId = String(cardId || "").trim();

  return {
    card_id: cleanCardId,
    card_name: cleanCardId,
    display_name: cleanCardId,
    cost: 0,
    power: 0,
    card_type: "unit",
    target_type: "none",
    effect_id: "",
    trigger_id: "none",

    attack: 0,
    hp: 1,
    max_hp: 1,
    armor: 0,
    base_attack: 0,
    base_hp: 1,

    side: "neutral",
    traits: [],
    keywords: [],
    tags: [],
    abilities: [],

    can_attack: false,
    exhausted: false,
    summoned_this_turn: false,
    has_attacked_this_turn: false,
    attacks_this_turn: 0,
    max_attacks_per_turn: 1,

    temporary_keywords: {},
    once_per_turn_flags: {}
  };
}

function makeInitialPlayerState(ownerId, deckData) {
  const cardIds = getCardIdsFromDeckData(deckData);
  const deck = shuffleArray(cardIds.map((cardId) => makeInitialCardState(cardId)));

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

  currentPlayer.max_mana = Math.min(
    Number(currentPlayer.max_mana || 0) + MANA_GAIN_PER_TURN,
    MAX_MANA
  );
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

      if (!unit.once_per_turn_flags || typeof unit.once_per_turn_flags !== "object") {
        unit.once_per_turn_flags = {};
      }
    }
  }

  state.turn_time_left = TURN_TIME_LIMIT_SECONDS;
  state.turn_timer_active = true;
  state.turn_timer_timeout_handled = false;

  state.status_message = "Turn " + state.turn_number + ": " + currentPlayer.name + "'s turn started.";
  state.battle_log_messages.push(state.status_message);
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
    game_over: false,
    status_message: "",
    turn_time_left: TURN_TIME_LIMIT_SECONDS,
    turn_timer_active: false,
    turn_timer_timeout_handled: false,

    player1,
    player2,

    selecting_target: false,
    selecting_hand_card: false,
    pending_action_type: "none",
    pending_card: null,
    pending_attacker_index: -1,
    selected_attacker_owner: "",
    selected_attacker_index: -1,
    pending_ability: {},

    battle_log_messages: [],

    seat_to_owner_id: {
      A: "player1",
      B: "player2"
    },
    owner_to_seat_id: {
      player1: "A",
      player2: "B"
    }
  };

  startServerTurn(state);

  return state;
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

function finishMatchBySurrender(match, seatId) {
  const state = match.state || {};
  const loserOwnerId = getOwnerIdForSeat(seatId);
  const winnerOwnerId = getEnemyOwnerId(loserOwnerId);

  if (!loserOwnerId || !winnerOwnerId) {
    return {
      ok: false,
      message: "Invalid surrender seat."
    };
  }

  const loser = state[loserOwnerId];
  const winner = state[winnerOwnerId];

  if (!loser || !winner) {
    return {
      ok: false,
      message: "Invalid surrender players."
    };
  }

  loser.hp = 0;
  state.game_over = true;
  state.turn_timer_active = false;
  state.turn_timer_timeout_handled = true;
  state.selecting_target = false;
  state.selecting_hand_card = false;
  state.pending_action_type = "none";
  state.pending_card = null;
  state.pending_attacker_index = -1;
  state.selected_attacker_owner = "";
  state.selected_attacker_index = -1;
  state.pending_ability = {};

  state.status_message = loser.name + " surrendered. " + winner.name + " wins.";
  state.battle_log_messages.push(state.status_message);

  return {
    ok: true,
    state
  };
}

function endServerTurn(match, seatId) {
  const state = match.state || {};
  const ownerId = getOwnerIdForSeat(seatId);

  if (!ownerId) {
    return {
      ok: false,
      message: "Invalid seat."
    };
  }

  if (state.game_over) {
    return {
      ok: false,
      message: "Game is already over."
    };
  }

  if (state.current_player_id !== ownerId) {
    return {
      ok: false,
      message: "Not your turn."
    };
  }

  const current = state[state.current_player_id];

  if (current) {
    state.battle_log_messages.push(current.name + "'s turn ended.");
  }

  state.current_player_id = ownerId === "player1" ? "player2" : "player1";
  state.turn_number = Number(state.turn_number || 1) + 1;
  state.selecting_target = false;
  state.selecting_hand_card = false;
  state.pending_action_type = "none";
  state.pending_card = null;
  state.pending_attacker_index = -1;
  state.selected_attacker_owner = "";
  state.selected_attacker_index = -1;
  state.pending_ability = {};

  startServerTurn(state);

  return {
    ok: true,
    state
  };
}

function handleServerBattleAction(match, seatId, action, payload) {
  if (!match) {
    return {
      ok: false,
      message: "Match not found."
    };
  }

  if (!match.state) {
    return {
      ok: false,
      message: "Match state is missing."
    };
  }

  switch (action) {
    case "end_turn":
      return endServerTurn(match, seatId);

    case "surrender":
      return finishMatchBySurrender(match, seatId);

    default:
      return {
        ok: false,
        message: "Node battle action not implemented yet: " + action
      };
  }
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
    safeSend(clientA.ws, {
      type: "match_state",
      match_id: matchId,
      seat_id: "A",
      state: match.state
    });
  }

  if (clientB) {
    safeSend(clientB.ws, {
      type: "match_state",
      match_id: matchId,
      seat_id: "B",
      state: match.state
    });
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

  const clientA = match.seats && match.seats.A
    ? clients.get(match.seats.A.client_id)
    : null;

  const clientB = match.seats && match.seats.B
    ? clients.get(match.seats.B.client_id)
    : null;

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

function getSideFromDeckData(deckData) {
  if (!deckData || typeof deckData !== "object") {
    return "";
  }

  return String(deckData.side || "").toLowerCase();
}

function validateDeckData(deckData) {
  if (!deckData || typeof deckData !== "object") {
    return "deck_data is missing.";
  }

  const side = getSideFromDeckData(deckData);

  if (side !== "human" && side !== "god") {
    return "deck_data.side must be human or god.";
  }

  const cards = Array.isArray(deckData.card_ids)
    ? deckData.card_ids
    : Array.isArray(deckData.cards)
      ? deckData.cards
      : [];

  if (cards.length <= 0) {
    return "deck_data has no cards.";
  }

  return "";
}

// ============================================================================
// WebSocket message handling
// ============================================================================
function handleClientMessage(client, message) {
  const type = String(message.type || "");

  switch (type) {
    case "auth": {
      client.user_id = String(message.user_id || "");

      safeSend(client.ws, {
        type: "auth_ok",
        user_id: client.user_id
      });

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

      safeSend(client.ws, {
        type: "queue_left"
      });

      console.log("[QUEUE] left", client.client_id, "queue=", queue.length);
      return;
    }

    case "battle_action": {
      const matchId = String(message.match_id || "");
      const seatId = String(message.seat_id || "");
      const action = String(message.action || "");
      const payload = message.payload && typeof message.payload === "object"
        ? message.payload
        : {};

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

      const result = handleServerBattleAction(match, seatId, action, payload);

      if (!result.ok) {
        sendActionRejected(client.client_id, result.message || "Action rejected.");
        return;
      }

      match.state = result.state || match.state;
      broadcastMatchState(matchId, match.state);

      if (match.state && match.state.game_over) {
        destroyMatch(matchId, "Match finished.");
      }

      return;
    }

    case "ping": {
      safeSend(client.ws, {
        type: "pong"
      });
      return;
    }

    default: {
      console.log("[CLIENT] Unknown message", client.client_id, message);
      sendError(client.ws, "Unknown client message type: " + type);
    }
  }
}

// 互換用。Aルートではhost接続は戦闘に使わない。
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

    case "pong": {
      return;
    }

    default: {
      console.log("[HOST] Ignored message in Node authoritative mode", host.host_id, message);
    }
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

    ws.on("close", () => {
      handleDisconnect(host);
    });

    ws.on("error", (error) => {
      console.log("[HOST] socket error", hostId, error.message);
    });

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

  safeSend(ws, {
    type: "welcome",
    client_id: clientId
  });

  ws.on("message", (data) => {
    const message = safeParse(data.toString());

    if (!message) {
      console.log("[CLIENT] invalid JSON from", clientId);
      sendError(ws, "Invalid JSON.");
      return;
    }

    handleClientMessage(client, message);
  });

  ws.on("close", () => {
    handleDisconnect(client);
  });

  ws.on("error", (error) => {
    console.log("[CLIENT] socket error", clientId, error.message);
  });
});

server.listen(PORT, () => {
  console.log(`[SERVER] Node authoritative gateway + save API listening on port ${PORT}`);
});

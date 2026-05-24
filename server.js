const http = require("http");
const { WebSocketServer } = require("ws");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || "";

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
        service: "godot-card-authoritative-gateway",
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

function removeClientFromQueue(clientId) {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].client_id === clientId) {
      queue.splice(i, 1);
    }
  }
}

function getAvailableHost() {
  for (const host of hosts.values()) {
    if (!host.ready) {
      continue;
    }

    if (host.current_match_id) {
      continue;
    }

    if (!host.ws || host.ws.readyState !== host.ws.OPEN) {
      continue;
    }

    return host;
  }

  return null;
}

function tryMakeMatch() {
  while (queue.length >= 2) {
    const host = getAvailableHost();

    if (!host) {
      console.log("[MATCH] No available host. queue=", queue.length);
      return;
    }

    const entryA = queue.shift();
    const entryB = queue.shift();

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
      host_id: host.host_id,
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
      }
    };

    matches.set(matchId, match);

    clientA.match_id = matchId;
    clientA.seat_id = "A";
    clientA.queued = false;

    clientB.match_id = matchId;
    clientB.seat_id = "B";
    clientB.queued = false;

    host.current_match_id = matchId;

    console.log(
      "[MATCH] Creating match",
      matchId,
      "host=",
      host.host_id,
      "A=",
      entryA.client_id,
      entryA.side,
      "B=",
      entryB.client_id,
      entryB.side
    );

    safeSend(host.ws, {
      type: "host_create_match",
      host_id: host.host_id,
      match_id: matchId,
      seats: {
        A: {
          client_id: entryA.client_id,
          side: entryA.side,
          deck_data: entryA.deck_data
        },
        B: {
          client_id: entryB.client_id,
          side: entryB.side,
          deck_data: entryB.deck_data
        }
      }
    });
  }
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

  const host = hosts.get(match.host_id);

  if (host && host.current_match_id === matchId) {
    host.current_match_id = "";
    safeSend(host.ws, {
      type: "host_destroy_match",
      host_id: host.host_id,
      match_id: matchId,
      reason
    });
  }

  const clientA = clients.get(match.seats.A.client_id);
  const clientB = clients.get(match.seats.B.client_id);

  if (clientA) {
    clientA.match_id = "";
    clientA.seat_id = "";
  }

  if (clientB) {
    clientB.match_id = "";
    clientB.seat_id = "";
  }

  matches.delete(matchId);
  tryMakeMatch();
}

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

      const host = hosts.get(match.host_id);

      if (!host || !host.ws || host.ws.readyState !== host.ws.OPEN) {
        sendActionRejected(client.client_id, "Battle host is not available.");
        return;
      }

      safeSend(host.ws, {
        type: "host_battle_action",
        host_id: host.host_id,
        match_id: matchId,
        seat_id: seatId,
        action,
        payload
      });

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

      console.log("[HOST] ready", host.host_id, "capacity=", host.capacity);

      tryMakeMatch();
      return;
    }

    case "host_match_created": {
      const matchId = String(message.match_id || "");
      const state = message.state && typeof message.state === "object"
        ? message.state
        : {};

      if (!matches.has(matchId)) {
        console.log("[HOST] match_created for unknown match", matchId);
        return;
      }

      console.log("[HOST] match_created", matchId);

      sendMatchFound(matchId, state);
      return;
    }

    case "host_match_state": {
      const matchId = String(message.match_id || "");
      const state = message.state && typeof message.state === "object"
        ? message.state
        : {};

      if (!matches.has(matchId)) {
        console.log("[HOST] match_state for unknown match", matchId);
        return;
      }

      broadcastMatchState(matchId, state);
      return;
    }

    case "host_action_rejected": {
      const matchId = String(message.match_id || "");
      const seatId = String(message.seat_id || "");
      const text = String(message.message || "Action rejected.");

      const match = matches.get(matchId);

      if (!match) {
        return;
      }

      const seat = match.seats[seatId];

      if (!seat) {
        return;
      }

      const client = clients.get(seat.client_id);

      if (!client) {
        return;
      }

      safeSend(client.ws, {
        type: "action_rejected",
        match_id: matchId,
        seat_id: seatId,
        message: text
      });

      return;
    }

    case "host_match_finished": {
      const matchId = String(message.match_id || "");
      const state = message.state && typeof message.state === "object"
        ? message.state
        : {};

      if (!matches.has(matchId)) {
        return;
      }

      broadcastMatchState(matchId, state);
      destroyMatch(matchId, "Match finished.");
      return;
    }

    case "host_match_destroyed": {
      const matchId = String(message.match_id || "");
      const match = matches.get(matchId);

      if (match) {
        matches.delete(matchId);
      }

      if (host.current_match_id === matchId) {
        host.current_match_id = "";
      }

      tryMakeMatch();
      return;
    }

    case "host_error": {
      const matchId = String(message.match_id || "");
      const text = String(message.message || "Host error.");

      console.log("[HOST ERROR]", host.host_id, matchId, text);

      const match = matches.get(matchId);

      if (match) {
        const clientA = clients.get(match.seats.A.client_id);
        const clientB = clients.get(match.seats.B.client_id);

        if (clientA) {
          safeSend(clientA.ws, {
            type: "error",
            message: text
          });
        }

        if (clientB) {
          safeSend(clientB.ws, {
            type: "error",
            message: text
          });
        }

        destroyMatch(matchId, text);
      }

      host.current_match_id = "";
      tryMakeMatch();
      return;
    }

    case "pong": {
      return;
    }

    default: {
      console.log("[HOST] Unknown message", host.host_id, message);
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

    const affectedMatches = [];

    for (const match of matches.values()) {
      if (match.host_id === host.host_id) {
        affectedMatches.push(match.match_id);
      }
    }

    for (const matchId of affectedMatches) {
      const match = matches.get(matchId);

      if (!match) {
        continue;
      }

      const clientA = clients.get(match.seats.A.client_id);
      const clientB = clients.get(match.seats.B.client_id);

      if (clientA) {
        safeSend(clientA.ws, {
          type: "opponent_left",
          match_id: matchId,
          message: "Battle host disconnected."
        });

        clientA.match_id = "";
        clientA.seat_id = "";
      }

      if (clientB) {
        safeSend(clientB.ws, {
          type: "opponent_left",
          match_id: matchId,
          message: "Battle host disconnected."
        });

        clientB.match_id = "";
        clientB.seat_id = "";
      }

      matches.delete(matchId);
    }

    hosts.delete(host.host_id);
    tryMakeMatch();
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

    console.log("[HOST] connected", hostId);

    safeSend(ws, {
      type: "host_welcome",
      host_id: hostId
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
  console.log(`[SERVER] Authoritative gateway + save API listening on port ${PORT}`);
});

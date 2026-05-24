const http = require("http");
const WebSocket = require("ws");
const { Pool } = require("pg");

const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL || "";

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    })
  : null;

// =============================
// Utility
// =============================

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();

      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (body.length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

function requireDb(res) {
  if (!pool) {
    sendJson(res, 500, {
      ok: false,
      error: "DATABASE_URL is not set"
    });
    return false;
  }

  return true;
}

function getBearerUserId(req) {
  const auth = req.headers["authorization"] || "";
  const prefix = "Bearer ";

  if (!auth.startsWith(prefix)) {
    return 0;
  }

  const token = auth.slice(prefix.length).trim();

  if (!token.startsWith("test-user-")) {
    return 0;
  }

  const rawId = token.replace("test-user-", "");
  const userId = Number(rawId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return 0;
  }

  return userId;
}

async function ensureRankProfile(userId) {
  await pool.query(
    `
    INSERT INTO rank_profiles (user_id, rating, rank_points, wins, losses)
    VALUES ($1, 1000, 0, 0, 0)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [userId]
  );
}

async function giveTestStarterCards(userId) {
  const result = await pool.query(
    `
    SELECT card_id
    FROM cards
    WHERE enabled = TRUE
    ORDER BY card_id ASC
    `
  );

  for (const row of result.rows) {
    await pool.query(
      `
      INSERT INTO user_cards (user_id, card_id, count)
      VALUES ($1, $2, 4)
      ON CONFLICT (user_id, card_id)
      DO UPDATE SET count = GREATEST(user_cards.count, 4)
      `,
      [userId, row.card_id]
    );
  }
}

// =============================
// Setup DB
// =============================

async function handleSetupDb(req, res) {
  if (!requireDb(res)) return;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cards (
        card_id TEXT PRIMARY KEY,
        side TEXT NOT NULL DEFAULT 'neutral',
        rarity TEXT NOT NULL DEFAULT 'common',
        enabled BOOLEAN NOT NULL DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS user_cards (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        card_id TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, card_id)
      );

      CREATE TABLE IF NOT EXISTS decks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        side TEXT NOT NULL DEFAULT 'human',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS deck_cards (
        deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        card_id TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (deck_id, card_id)
      );

      CREATE TABLE IF NOT EXISTS pack_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        pack_type TEXT NOT NULL DEFAULT 'test',
        opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pack_results (
        pack_log_id INTEGER NOT NULL REFERENCES pack_logs(id) ON DELETE CASCADE,
        card_id TEXT NOT NULL,
        amount INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS rank_profiles (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL DEFAULT 1000,
        rank_points INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS match_logs (
        id SERIAL PRIMARY KEY,
        player1_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        player2_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        loser_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      INSERT INTO cards (card_id, side, rarity, enabled) VALUES
      ('test_human_001', 'human', 'common', TRUE),
      ('test_human_002', 'human', 'common', TRUE),
      ('test_god_001', 'god', 'common', TRUE),
      ('test_neutral_001', 'neutral', 'common', TRUE)
      ON CONFLICT (card_id) DO NOTHING;
    `);

    sendJson(res, 200, {
      ok: true,
      message: "Database setup completed"
    });
  } catch (e) {
    console.error("setup db error:", e);
    sendJson(res, 500, {
      ok: false,
      error: "database setup failed",
      detail: e.message
    });
  }
}

// =============================
// HTTP API
// =============================

async function handleRegister(req, res) {
  if (!requireDb(res)) return;

  let body = {};

  try {
    body = await readBody(req);
  } catch (e) {
    sendJson(res, 400, {
      ok: false,
      error: e.message
    });
    return;
  }

  const username = String(body.username || "").trim();
  const password = String(body.password || "").trim();

  if (username.length < 1 || password.length < 1) {
    sendJson(res, 400, {
      ok: false,
      error: "username and password are required"
    });
    return;
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO users (username, password)
      VALUES ($1, $2)
      RETURNING id, username, created_at
      `,
      [username, password]
    );

    const user = result.rows[0];

    await ensureRankProfile(user.id);
    await giveTestStarterCards(user.id);

    sendJson(res, 200, {
      ok: true,
      user,
      token: "test-user-" + user.id
    });
  } catch (e) {
    if (String(e.message).includes("duplicate key")) {
      sendJson(res, 409, {
        ok: false,
        error: "username already exists"
      });
      return;
    }

    console.error("register error:", e);
    sendJson(res, 500, {
      ok: false,
      error: "register failed",
      detail: e.message
    });
  }
}

async function handleLogin(req, res) {
  if (!requireDb(res)) return;

  let body = {};

  try {
    body = await readBody(req);
  } catch (e) {
    sendJson(res, 400, {
      ok: false,
      error: e.message
    });
    return;
  }

  const username = String(body.username || "").trim();
  const password = String(body.password || "").trim();

  if (username.length < 1 || password.length < 1) {
    sendJson(res, 400, {
      ok: false,
      error: "username and password are required"
    });
    return;
  }

  try {
    const result = await pool.query(
      `
      SELECT id, username, created_at
      FROM users
      WHERE username = $1 AND password = $2
      LIMIT 1
      `,
      [username, password]
    );

    if (result.rows.length === 0) {
      sendJson(res, 401, {
        ok: false,
        error: "invalid username or password"
      });
      return;
    }

    const user = result.rows[0];

    await ensureRankProfile(user.id);

    sendJson(res, 200, {
      ok: true,
      user,
      token: "test-user-" + user.id
    });
  } catch (e) {
    console.error("login error:", e);
    sendJson(res, 500, {
      ok: false,
      error: "login failed",
      detail: e.message
    });
  }
}

async function handleCollection(req, res) {
  if (!requireDb(res)) return;

  const userId = getBearerUserId(req);

  if (userId <= 0) {
    sendJson(res, 401, {
      ok: false,
      error: "missing or invalid token"
    });
    return;
  }

  try {
    const result = await pool.query(
      `
      SELECT card_id, count
      FROM user_cards
      WHERE user_id = $1
      ORDER BY card_id ASC
      `,
      [userId]
    );

    sendJson(res, 200, {
      ok: true,
      user_id: userId,
      cards: result.rows
    });
  } catch (e) {
    console.error("collection error:", e);
    sendJson(res, 500, {
      ok: false,
      error: "failed to load collection",
      detail: e.message
    });
  }
}

async function handleOpenPack(req, res) {
  if (!requireDb(res)) return;

  const userId = getBearerUserId(req);

  if (userId <= 0) {
    sendJson(res, 401, {
      ok: false,
      error: "missing or invalid token"
    });
    return;
  }

  let body = {};

  try {
    body = await readBody(req);
  } catch (e) {
    sendJson(res, 400, {
      ok: false,
      error: e.message
    });
    return;
  }

  const packType = String(body.pack_type || "test").trim();
  const packSize = Number(body.pack_size || 5);

  const safePackSize =
    Number.isInteger(packSize) && packSize > 0 && packSize <= 20
      ? packSize
      : 5;

  try {
    const cardResult = await pool.query(
      `
      SELECT card_id
      FROM cards
      WHERE enabled = TRUE
      ORDER BY RANDOM()
      LIMIT $1
      `,
      [safePackSize]
    );

    if (cardResult.rows.length === 0) {
      sendJson(res, 500, {
        ok: false,
        error: "no cards available for pack"
      });
      return;
    }

    const packLogResult = await pool.query(
      `
      INSERT INTO pack_logs (user_id, pack_type)
      VALUES ($1, $2)
      RETURNING id, user_id, pack_type, opened_at
      `,
      [userId, packType]
    );

    const packLog = packLogResult.rows[0];
    const results = [];

    for (const row of cardResult.rows) {
      const cardId = row.card_id;
      const amount = 1;

      await pool.query(
        `
        INSERT INTO pack_results (pack_log_id, card_id, amount)
        VALUES ($1, $2, $3)
        `,
        [packLog.id, cardId, amount]
      );

      await pool.query(
        `
        INSERT INTO user_cards (user_id, card_id, count)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, card_id)
        DO UPDATE SET count = user_cards.count + EXCLUDED.count
        `,
        [userId, cardId, amount]
      );

      results.push({
        card_id: cardId,
        amount: amount
      });
    }

    sendJson(res, 200, {
      ok: true,
      pack_log: packLog,
      results: results
    });
  } catch (e) {
    console.error("open pack error:", e);
    sendJson(res, 500, {
      ok: false,
      error: "failed to open pack",
      detail: e.message
    });
  }
}

async function handleGetDecks(req, res) {
  if (!requireDb(res)) return;

  const userId = getBearerUserId(req);

  if (userId <= 0) {
    sendJson(res, 401, {
      ok: false,
      error: "missing or invalid token"
    });
    return;
  }

  try {
    const deckResult = await pool.query(
      `
      SELECT id, name, side, created_at, updated_at
      FROM decks
      WHERE user_id = $1
      ORDER BY updated_at DESC, id DESC
      `,
      [userId]
    );

    const decks = [];

    for (const deck of deckResult.rows) {
      const cardResult = await pool.query(
        `
        SELECT card_id, count
        FROM deck_cards
        WHERE deck_id = $1
        ORDER BY card_id ASC
        `,
        [deck.id]
      );

      decks.push({
        id: deck.id,
        name: deck.name,
        side: deck.side,
        created_at: deck.created_at,
        updated_at: deck.updated_at,
        cards: cardResult.rows
      });
    }

    sendJson(res, 200, {
      ok: true,
      decks: decks
    });
  } catch (e) {
    console.error("get decks error:", e);
    sendJson(res, 500, {
      ok: false,
      error: "failed to load decks",
      detail: e.message
    });
  }
}

async function handleSaveDeck(req, res) {
  if (!requireDb(res)) return;

  const userId = getBearerUserId(req);

  if (userId <= 0) {
    sendJson(res, 401, {
      ok: false,
      error: "missing or invalid token"
    });
    return;
  }

  let body = {};

  try {
    body = await readBody(req);
  } catch (e) {
    sendJson(res, 400, {
      ok: false,
      error: e.message
    });
    return;
  }

  const deckId = Number(body.deck_id || 0);
  const name = String(body.name || "New Deck").trim();
  const side = String(body.side || "human").trim();
  const cards = body.cards;

  if (!(cards instanceof Array)) {
    sendJson(res, 400, {
      ok: false,
      error: "cards must be an array"
    });
    return;
  }

  try {
    let savedDeck = null;

    if (Number.isInteger(deckId) && deckId > 0) {
      const updateResult = await pool.query(
        `
        UPDATE decks
        SET name = $1,
            side = $2,
            updated_at = NOW()
        WHERE id = $3 AND user_id = $4
        RETURNING id, name, side, created_at, updated_at
        `,
        [name, side, deckId, userId]
      );

      if (updateResult.rows.length === 0) {
        sendJson(res, 404, {
          ok: false,
          error: "deck not found"
        });
        return;
      }

      savedDeck = updateResult.rows[0];

      await pool.query(
        `
        DELETE FROM deck_cards
        WHERE deck_id = $1
        `,
        [savedDeck.id]
      );
    } else {
      const insertResult = await pool.query(
        `
        INSERT INTO decks (user_id, name, side)
        VALUES ($1, $2, $3)
        RETURNING id, name, side, created_at, updated_at
        `,
        [userId, name, side]
      );

      savedDeck = insertResult.rows[0];
    }

    for (const item of cards) {
      const cardId = String(item.card_id || "").trim();
      const count = Number(item.count || 0);

      if (cardId === "" || !Number.isInteger(count) || count <= 0) {
        continue;
      }

      await pool.query(
        `
        INSERT INTO deck_cards (deck_id, card_id, count)
        VALUES ($1, $2, $3)
        ON CONFLICT (deck_id, card_id)
        DO UPDATE SET count = EXCLUDED.count
        `,
        [savedDeck.id, cardId, count]
      );
    }

    const cardResult = await pool.query(
      `
      SELECT card_id, count
      FROM deck_cards
      WHERE deck_id = $1
      ORDER BY card_id ASC
      `,
      [savedDeck.id]
    );

    sendJson(res, 200, {
      ok: true,
      deck: {
        id: savedDeck.id,
        name: savedDeck.name,
        side: savedDeck.side,
        created_at: savedDeck.created_at,
        updated_at: savedDeck.updated_at,
        cards: cardResult.rows
      }
    });
  } catch (e) {
    console.error("save deck error:", e);
    sendJson(res, 500, {
      ok: false,
      error: "failed to save deck",
      detail: e.message
    });
  }
}

async function handleDbTest(req, res) {
  if (!requireDb(res)) return;

  try {
    const result = await pool.query("SELECT NOW() AS now");
    sendJson(res, 200, {
      ok: true,
      database_time: result.rows[0].now
    });
  } catch (e) {
    console.error("db test error:", e);
    sendJson(res, 500, {
      ok: false,
      error: "database connection failed",
      detail: e.message
    });
  }
}

// =============================
// HTTP Server
// =============================

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, {
      ok: true
    });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/") {
    sendText(res, 200, "Godot card test server is running.\n");
    return;
  }

  if (req.method === "GET" && url.pathname === "/db_test") {
    await handleDbTest(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/setup_db") {
    await handleSetupDb(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/register") {
    await handleRegister(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/login") {
    await handleLogin(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/collection") {
    await handleCollection(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/open_pack") {
    await handleOpenPack(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/decks") {
    await handleGetDecks(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/save_deck") {
    await handleSaveDeck(req, res);
    return;
  }

  sendJson(res, 404, {
    ok: false,
    error: "Not found"
  });
});

// =============================
// WebSocket Relay
// =============================

const wss = new WebSocket.Server({ server });

let nextClientId = 1;
const clients = new Map();
const rooms = new Map();

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastToRoom(roomId, data, exceptWs = null) {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const clientId of room) {
    const client = clients.get(clientId);
    if (!client) continue;
    if (client.ws === exceptWs) continue;

    send(client.ws, data);
  }
}

function leaveRoom(client) {
  if (!client.roomId) return;

  const room = rooms.get(client.roomId);

  if (room) {
    room.delete(client.id);

    broadcastToRoom(client.roomId, {
      type: "peer_left",
      client_id: client.id
    });

    if (room.size === 0) {
      rooms.delete(client.roomId);
    }
  }

  client.roomId = "";
}

wss.on("connection", (ws) => {
  const client = {
    id: nextClientId++,
    ws,
    roomId: ""
  };

  clients.set(client.id, client);

  send(ws, {
    type: "welcome",
    client_id: client.id
  });

  ws.on("message", (raw) => {
    let msg = null;

    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      send(ws, {
        type: "error",
        message: "Invalid JSON"
      });
      return;
    }

    if (!msg.type) {
      send(ws, {
        type: "error",
        message: "Missing message type"
      });
      return;
    }

    if (msg.type === "join_room") {
      const roomId = String(msg.room_id || "test");

      leaveRoom(client);

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }

      const room = rooms.get(roomId);

      if (room.size >= 2) {
        send(ws, {
          type: "room_full",
          room_id: roomId
        });
        return;
      }

      room.add(client.id);
      client.roomId = roomId;

      send(ws, {
        type: "joined_room",
        room_id: roomId,
        client_id: client.id,
        player_count: room.size
      });

      broadcastToRoom(
        roomId,
        {
          type: "peer_joined",
          client_id: client.id,
          player_count: room.size
        },
        ws
      );

      return;
    }

    if (msg.type === "relay") {
      if (!client.roomId) {
        send(ws, {
          type: "error",
          message: "Not in room"
        });
        return;
      }

      broadcastToRoom(
        client.roomId,
        {
          type: "relay",
          from_client_id: client.id,
          payload: msg.payload || {}
        },
        ws
      );

      return;
    }

    if (msg.type === "ping") {
      send(ws, {
        type: "pong"
      });
      return;
    }

    send(ws, {
      type: "error",
      message: "Unknown message type: " + msg.type
    });
  });

  ws.on("close", () => {
    leaveRoom(client);
    clients.delete(client.id);
  });
});

// =============================
// Start
// =============================

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);

  if (DATABASE_URL) {
    console.log("DATABASE_URL is set.");
  } else {
    console.log("DATABASE_URL is NOT set.");
  }
});

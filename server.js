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
      error: "register failed"
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
      error: "login failed"
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
      error: "failed to load collection"
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
      error: "database connection failed"
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

      broadcastToRoom(roomId, {
        type: "peer_joined",
        client_id: client.id,
        player_count: room.size
      }, ws);

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

      broadcastToRoom(client.roomId, {
        type: "relay",
        from_client_id: client.id,
        payload: msg.payload || {}
      }, ws);

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

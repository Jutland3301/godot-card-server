const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      service: "godot-card-authoritative-gateway",
      clients: clients.size,
      hosts: hosts.size,
      queued: queue.length,
      matches: matches.size
    }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, message: "Not found" }));
});

const wss = new WebSocketServer({ server });

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
  console.log(`[SERVER] Authoritative gateway listening on port ${PORT}`);
});

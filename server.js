const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Godot card test server is running.\n");
});

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

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

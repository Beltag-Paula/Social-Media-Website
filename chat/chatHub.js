const { WebSocketServer } = require("ws");
const jwt = require("jsonwebtoken");
const { persistMessage } = require("../controllers/messages");
const { db } = require("../database/db");

const SECRET_KEY = process.env.JWT_SECRET;

const MAX_MESSAGES_PER_WINDOW = 15;
const WINDOW_MS = 10 * 1000;
const HEARTBEAT_MS = 30 * 1000;

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  });
  return out;
}

function getAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return null;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function attachChatServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });
  const allowedOrigins = getAllowedOrigins();

  const clients = new Map();

  function addClient(userId, ws) {
    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(ws);
  }
  function removeClient(userId, ws) {
    const set = clients.get(userId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) clients.delete(userId);
  }
  function sendTo(userId, payload) {
    const set = clients.get(userId);
    if (!set || set.size === 0) return false;
    const json = JSON.stringify(payload);
    let delivered = false;
    for (const sock of set) {
      if (sock.readyState === sock.OPEN) {
        sock.send(json);
        delivered = true;
      }
    }
    return delivered;
  }

  httpServer.on("upgrade", (request, socket, head) => {
    let pathname;
    try {
      pathname = new URL(request.url, "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== "/ws/chat") {
      socket.destroy();
      return;
    }

    const origin = request.headers.origin;
    if (allowedOrigins && (!origin || !allowedOrigins.includes(origin))) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    const cookies = parseCookies(request.headers.cookie);
    const token = cookies.token;
    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    jwt.verify(token, SECRET_KEY, { algorithms: ["HS256"] }, (err, decoded) => {
      if (err || !decoded || !Number.isInteger(decoded.id)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      db.get("SELECT status FROM users WHERE id = ?", [decoded.id], (dbErr, user) => {
        if (dbErr || !user || user.status === 2) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          ws.userId = decoded.id;
          wss.emit("connection", ws, request);
        });
      });
    });
  });

  wss.on("connection", (ws) => {
    addClient(ws.userId, ws);
    ws.isAlive = true;
    ws.sendTimestamps = [];

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.send(JSON.stringify({ type: "ready" }));

    ws.on("message", async (raw) => {
      if (raw.length > 8 * 1024) {
        ws.send(JSON.stringify({ type: "error", message: "Message too large" }));
        return;
      }

      const now = Date.now();
      ws.sendTimestamps = ws.sendTimestamps.filter((t) => now - t < WINDOW_MS);
      if (ws.sendTimestamps.length >= MAX_MESSAGES_PER_WINDOW) {
        ws.send(JSON.stringify({ type: "error", message: "You're sending messages too fast." }));
        return;
      }
      ws.sendTimestamps.push(now);

      let data;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Malformed message" }));
        return;
      }

      if (!data || typeof data !== "object") return;

      if (data.type === "typing") {
        const to = parseInt(data.to, 10);
        if (Number.isInteger(to)) {
          sendTo(to, { type: "typing", from: ws.userId });
        }
        return;
      }

      if (data.type !== "message") return;

      const to = parseInt(data.to, 10);
      if (!Number.isInteger(to)) {
        ws.send(JSON.stringify({ type: "error", message: "Invalid recipient" }));
        return;
      }

      try {
        const message = await persistMessage({
          senderID: ws.userId,
          receiverID: to,
          body: data.body,
        });
        const payload = { type: "message", message };
        ws.send(JSON.stringify(payload)); // ack to sender / sync other tabs
        sendTo(to, payload); // live delivery if the recipient is online
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", message: err.message }));
      }
    });

    ws.on("close", () => removeClient(ws.userId, ws));
    ws.on("error", () => removeClient(ws.userId, ws));
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        removeClient(ws.userId, ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_MS);

  wss.on("close", () => clearInterval(heartbeat));

  return {
    deliver: (message) => {
      sendTo(message.receiverID, { type: "message", message });
    },
  };
}

module.exports = { attachChatServer };

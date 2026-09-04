const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const chat = require("../controllers/chat.js");

const SECRET_KEY = process.env.JWT_SECRET;
const APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:8000";
const MAX_MESSAGES_PER_WINDOW = 30;
const RATE_WINDOW_MS = 10_000;

if (!SECRET_KEY) {
  throw new Error("JWT_SECRET environment variable is not defined");
}

const wss = new WebSocket.WebSocketServer({
  noServer: true,
  maxPayload: 8 * 1024,
  perMessageDeflate: false,
});

// A user may have several tabs/devices connected at once.
const connectedUsers = new Map(); // userId -> Set<WebSocket>

function parseCookies(header = "") {
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      // Ignore malformed cookie values.
    }
  }
  return cookies;
}

function authenticateRequest(request) {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies.token;
  if (!token) return null;

  try {
    return jwt.verify(token, SECRET_KEY, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
}

function addSocket(userId, socket) {
  let sockets = connectedUsers.get(userId);
  if (!sockets) {
    sockets = new Set();
    connectedUsers.set(userId, sockets);
  }
  sockets.add(socket);
}

function removeSocket(userId, socket) {
  const sockets = connectedUsers.get(userId);
  if (!sockets) return;
  sockets.delete(socket);
  if (sockets.size === 0) connectedUsers.delete(userId);
}

function sendToUser(userId, payload) {
  const sockets = connectedUsers.get(userId);
  if (!sockets) return;

  const serialized = JSON.stringify(payload);
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(serialized);
  }
}

function closePolicy(socket, message) {
  socket.close(1008, message);
}

wss.on("connection", (socket, request, user) => {
  const userId = Number(user.id);
  addSocket(userId, socket);

  let windowStarted = Date.now();
  let messagesInWindow = 0;

  socket.on("message", async (raw) => {
    try {
      const now = Date.now();
      if (now - windowStarted >= RATE_WINDOW_MS) {
        windowStarted = now;
        messagesInWindow = 0;
      }

      messagesInWindow += 1;
      if (messagesInWindow > MAX_MESSAGES_PER_WINDOW) {
        return closePolicy(socket, "Rate limit exceeded");
      }

      const data = JSON.parse(raw.toString("utf8"));

      if (!data || data.type !== "message") {
        return closePolicy(socket, "Invalid message type");
      }

      const conversationId = Number(data.conversationId);
      if (!Number.isInteger(conversationId) || conversationId <= 0) {
        return closePolicy(socket, "Invalid conversation");
      }

      // The sender ID is NEVER accepted from the browser.
      const conversation = await chat.authorizeConversation(conversationId, userId);
      if (!conversation) {
        return closePolicy(socket, "Not a member of this conversation");
      }

      const message = await chat.insertMessage(conversationId, userId, data.body);
      const recipientId = conversation.user1ID === userId
        ? conversation.user2ID
        : conversation.user1ID;

      const payload = {
        type: "message",
        message,
      };

      // Echo to all of the sender's tabs and deliver to the recipient's tabs.
      sendToUser(userId, payload);
      sendToUser(recipientId, payload);
    } catch (err) {
      if (err instanceof SyntaxError || err.code === "INVALID_MESSAGE") {
        return closePolicy(socket, "Invalid message");
      }

      console.error("WebSocket chat error:", err.message);
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "error",
          message: "Message could not be sent",
        }));
      }
    }
  });

  socket.on("close", () => removeSocket(userId, socket));
  socket.on("error", () => removeSocket(userId, socket));

  socket.send(JSON.stringify({ type: "ready" }));
});

function attachChatWebSocket(server) {
  server.on("upgrade", (request, socket, head) => {
    // Origin is checked before accepting the upgrade. APP_ORIGIN should be
    // the exact origin of the application, e.g. https://example.com.
    if (request.headers.origin !== APP_ORIGIN) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    const user = authenticateRequest(request);
    if (!user || !Number.isInteger(Number(user.id))) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request, user);
    });
  });
}

module.exports = { attachChatWebSocket };

const { db } = require("../database/db");

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY = 100;

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function getConversationForUser(conversationId, userId) {
  return get(
    `SELECT id, user1ID, user2ID
     FROM conversations
     WHERE id = ? AND (user1ID = ? OR user2ID = ?)`,
    [conversationId, userId, userId],
  );
}

exports.createConversation = async (req, res) => {
  const otherUserId = Number(req.body.userId);
  const currentUserId = Number(req.user.id);

  if (!Number.isInteger(otherUserId) || otherUserId <= 0) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  if (otherUserId === currentUserId) {
    return res.status(400).json({ message: "You cannot chat with yourself" });
  }

  try {
    const otherUser = await get(
      "SELECT id FROM users WHERE id = ? AND status = 1",
      [otherUserId],
    );

    if (!otherUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const user1ID = Math.min(currentUserId, otherUserId);
    const user2ID = Math.max(currentUserId, otherUserId);

    await run(
      `INSERT OR IGNORE INTO conversations (user1ID, user2ID)
       VALUES (?, ?)`,
      [user1ID, user2ID],
    );

    const conversation = await get(
      `SELECT id, user1ID, user2ID
       FROM conversations
       WHERE user1ID = ? AND user2ID = ?`,
      [user1ID, user2ID],
    );

    return res.status(200).json({ conversation });
  } catch (err) {
    console.error("Create conversation error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.getMessages = async (req, res) => {
  const conversationId = Number(req.params.id);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), MAX_HISTORY);

  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    return res.status(400).json({ message: "Invalid conversation ID" });
  }

  try {
    const conversation = await getConversationForUser(conversationId, req.user.id);

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const messages = await all(
      `SELECT id, conversationID, senderID, body, createdAt
       FROM messages
       WHERE conversationID = ?
       ORDER BY id DESC
       LIMIT ?`,
      [conversationId, limit],
    );

    messages.reverse();
    return res.json(messages);
  } catch (err) {
    console.error("Get messages error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.authorizeConversation = getConversationForUser;
exports.insertMessage = async (conversationId, senderId, body) => {
  const cleanBody = typeof body === "string" ? body.trim() : "";

  if (!cleanBody || cleanBody.length > MAX_MESSAGE_LENGTH) {
    const error = new Error("Message must be between 1 and 2000 characters");
    error.code = "INVALID_MESSAGE";
    throw error;
  }

  const result = await run(
    `INSERT INTO messages (conversationID, senderID, body)
     VALUES (?, ?, ?)`,
    [conversationId, senderId, cleanBody],
  );

  return get(
    `SELECT id, conversationID, senderID, body, createdAt
     FROM messages WHERE id = ?`,
    [result.lastID],
  );
};

exports.MAX_MESSAGE_LENGTH = MAX_MESSAGE_LENGTH;

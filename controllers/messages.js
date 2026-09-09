const { db } = require("../database/db");

const MAX_MESSAGE_LENGTH = 2000;

function sanitizeBody(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_MESSAGE_LENGTH ? trimmed.slice(0, MAX_MESSAGE_LENGTH) : trimmed;
}

// Persists a single DM. This is the ONE place a message ever gets written,
// shared by the REST endpoint below and the WebSocket handler in
// chat/chatHub.js, so both paths get identical validation — no route can
// accidentally skip a check the other one has.
//
// Privacy: a message only ever has exactly one sender and one receiver, and
// every read path below (getThread/getConversations) filters strictly by
// req.user.id on one side of the pair. There is no "public" or "group"
// read path, and no admin bypass — this table is never queried without a
// participant constraint, so a conversation is only ever visible to the
// two people in it.
function persistMessage({ senderID, receiverID, body }) {
  return new Promise((resolve, reject) => {
    const clean = sanitizeBody(body);
    if (!clean) return reject(new Error("Message body required"));
    if (senderID === receiverID) return reject(new Error("You can't message yourself"));

    db.get("SELECT id FROM users WHERE id = ? AND status != 2", [receiverID], (err, row) => {
      if (err) return reject(err);
      if (!row) return reject(new Error("Recipient not found"));

      db.run(
        "INSERT INTO messages (senderID, receiverID, body) VALUES (?, ?, ?)",
        [senderID, receiverID, clean],
        function (insertErr) {
          if (insertErr) return reject(insertErr);

          db.get(
            "SELECT id, senderID, receiverID, body, createdAt, readAt FROM messages WHERE id = ?",
            [this.lastID],
            (selectErr, message) => {
              if (selectErr) return reject(selectErr);
              resolve(message);
            }
          );
        }
      );
    });
  });
}

exports.persistMessage = persistMessage;

// POST /api/v1/messages  { to, body }
// REST fallback for sending — works even if the sender's WebSocket isn't
// connected. If chatHub is available (server.js wires it into
// app.locals), also push the message live to the recipient.
exports.sendMessage = async (req, res) => {
  try {
    const message = await persistMessage({
      senderID: req.user.id,
      receiverID: parseInt(req.body.to, 10),
      body: req.body.body,
    });

    const chatHub = req.app.locals.chatHub;
    if (chatHub) chatHub.deliver(message);

    res.status(201).json(message);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// GET /api/v1/messages/:userId?before=<id>&limit=30
// Returns the DM thread between me and :userId, oldest first. The WHERE
// clause hard-codes req.user.id (never a client-supplied value) on both
// sides of the OR, so there is no parameter combination that reads a
// thread you're not part of.
exports.getThread = (req, res) => {
  const me = req.user.id;
  const other = parseInt(req.params.userId, 10);
  if (!Number.isInteger(other)) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const before = parseInt(req.query.before, 10);
  const hasBefore = Number.isInteger(before);

  const sql = `
    SELECT id, senderID, receiverID, body, createdAt, readAt
    FROM messages
    WHERE ((senderID = ? AND receiverID = ?) OR (senderID = ? AND receiverID = ?))
    ${hasBefore ? "AND id < ?" : ""}
    ORDER BY id DESC
    LIMIT ?
  `;
  const params = hasBefore
    ? [me, other, other, me, before, limit]
    : [me, other, other, me, limit];

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error" });
    res.json(rows.reverse());
  });

  // Mark the other person's messages to me as read. Fire-and-forget: this
  // shouldn't block or fail the actual thread response above.
  db.run(
    "UPDATE messages SET readAt = CURRENT_TIMESTAMP WHERE senderID = ? AND receiverID = ? AND readAt IS NULL",
    [other, me]
  );
};

// GET /api/v1/messages
// Inbox: one row per person you've exchanged DMs with, most recent
// message first, with an unread count. Everything here is scoped to
// req.user.id — there's no way to request someone else's inbox.
exports.getConversations = (req, res) => {
  const me = req.user.id;

  const sql = `
    SELECT
      u.id AS userId,
      u.username,
      ma.filePath AS avatarPath,
      lm.body AS lastBody,
      lm.createdAt AS lastAt,
      lm.senderID AS lastSenderID,
      (
        SELECT COUNT(*) FROM messages
        WHERE senderID = u.id AND receiverID = ? AND readAt IS NULL
      ) AS unreadCount
    FROM (
      SELECT DISTINCT CASE WHEN senderID = ? THEN receiverID ELSE senderID END AS otherId
      FROM messages
      WHERE senderID = ? OR receiverID = ?
    ) c
    JOIN users u ON u.id = c.otherId
    LEFT JOIN profiles prof ON prof.userID = u.id
    LEFT JOIN media ma ON ma.id = prof.avatar
    LEFT JOIN messages lm ON lm.id = (
      SELECT id FROM messages
      WHERE (senderID = u.id AND receiverID = ?) OR (senderID = ? AND receiverID = u.id)
      ORDER BY id DESC LIMIT 1
    )
    ORDER BY lm.createdAt DESC
  `;

  db.all(sql, [me, me, me, me, me, me], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error" });
    res.json(rows);
  });
};

// GET /api/v1/messages/suggestions
// "People" list for the DM sidebar — people you have an actual social
// connection to (you follow them, or they follow you) but haven't
// messaged yet. Deliberately NOT every registered user: showing every
// signup (including ones still pending admin approval, or accounts you've
// never interacted with) would turn this into a directory for cold-DMing
// strangers, which is a spam/harassment vector, not a feature. Follow is
// the one signal in this app that means "I know who this is."
exports.getSuggestions = (req, res) => {
  const me = req.user.id;

  const sql = `
    SELECT DISTINCT u.id AS userId, u.username, ma.filePath AS avatarPath
    FROM users u
    LEFT JOIN profiles prof ON prof.userID = u.id
    LEFT JOIN media ma ON ma.id = prof.avatar
    WHERE u.id != ?
      AND u.status = 1
      AND (
        u.id IN (SELECT followedID FROM follow WHERE followerID = ?)
        OR u.id IN (SELECT followerID FROM follow WHERE followedID = ?)
      )
      AND u.id NOT IN (
        SELECT CASE WHEN senderID = ? THEN receiverID ELSE senderID END
        FROM messages
        WHERE senderID = ? OR receiverID = ?
      )
    ORDER BY u.username COLLATE NOCASE ASC
    LIMIT 50
  `;

  db.all(sql, [me, me, me, me, me, me], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error" });
    res.json(rows);
  });
};

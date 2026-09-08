const { db } = require("../database/db");

const MAX_MESSAGE_LENGTH = 2000;

function sanitizeBody(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_MESSAGE_LENGTH ? trimmed.slice(0, MAX_MESSAGE_LENGTH) : trimmed;
}

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

  db.run(
    "UPDATE messages SET readAt = CURRENT_TIMESTAMP WHERE senderID = ? AND receiverID = ? AND readAt IS NULL",
    [other, me]
  );
};

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

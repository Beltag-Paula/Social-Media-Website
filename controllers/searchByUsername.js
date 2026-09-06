const { db } = require("../database/db");


exports.searchUsername = (req, res) => {
  const q = typeof req.query.username === "string" ? req.query.username.trim().slice(0, 50) : "";

  // basic validation
  if (!q) {
    return res.json([]);
  }

  db.all(
    "SELECT id, username FROM users WHERE username LIKE ? ESCAPE '\\' LIMIT 10",
    [`%${q.replace(/[\\%_]/g, "\\$&")}%`],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "DB error" });
      }
      res.json(rows);
    }
  );
};
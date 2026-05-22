const { db } = require("../database/db");


exports.searchUsername = (req, res) => {
//app.get("/api/v1/search", authenticateToken, (req, res) => {
  const q = req.query.username;

  // basic validation
  if (!q) {
    return res.json([]);
  }

  db.all(
    "SELECT id, username FROM users WHERE username LIKE ? LIMIT 10",
    [`%${q}%`],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "DB error" });
      }
      res.json(rows);
    }
  );
};
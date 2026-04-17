const { db } = require("../database/db");

exports.active = (request, response) => {
  db.all("SELECT id, username FROM users WHERE status = 1", [], (err, rows) => {
    if (err) return response.status(500).json({ message: "DB error" });
    response.json({ rows });
  });
};

exports.pending = (request, response) => {
  db.all("SELECT id, username FROM users WHERE status = 0", [], (err, rows) => {
    if (err) return response.status(500).json({ message: "DB error" });
    response.json({ rows });
  });
};

exports.banned = (request, response) => {
  db.all(
    "SELECT id, username, banReason FROM users WHERE status = 2",
    [],
    (err, rows) => {
      if (err) return response.status(500).json({ message: "DB error" });
      response.json({ rows });
    },
  );
};

exports.deleteUser = (request, response) => {
  const { id } = request.body;
  db.run("DELETE FROM users WHERE id = ?", [id], (err) => {
    if (err) return response.status(500).json({ message: "DB error" });
    response.json({ message: "User deleted" });
  });
};

exports.updateStatus = (request, response) => {
  const { id, status } = request.body;
  db.run("UPDATE users SET status = ? WHERE id = ?", [status, id], (err) => {
    if (err) return response.status(500).json({ message: "Status updated" });
    response.json({ message: "Updated" });
  });
};

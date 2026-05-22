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

  // prevent Darwin to commit seppuku
  if (parseInt(id) === request.user.id) {
    return response.status(403).json({
      message: "You cannot delete your own account"
    });
  }

  // check if target user is admin
  db.get("SELECT isAdmin FROM users WHERE id = ?", [id], (err, user) => {
    if (err) return response.status(500).json({ message: "DB error" });

    if (user && user.isAdmin === 1) {
      return response.status(403).json({
        message: "You cannot delete an admin account"
      });
    }

    db.run("DELETE FROM users WHERE id = ?", [id], (err) => {
      if (err) return response.status(500).json({ message: "DB error" });
      response.json({ message: "User deleted" });
    });
  });
};

exports.updateStatus = (request, response) => {
  const { id, status, banReason } = request.body;

    // prevent Darwin ban itself
  if (parseInt(id) === request.user.id) {
    return response.status(403).json({
      message: "You cannot ban your own account"
    });
  }

  let sql;
  let params;

  if (status == 2) {
    // banning user → store reason
    sql = "UPDATE users SET status = ?, banReason = ? WHERE id = ?";
    params = [status, banReason || "No reason provided", id];
  } else {
    // not banned → clear reason
    sql = "UPDATE users SET status = ?, banReason = NULL WHERE id = ?";
    params = [status, id];
  }

  db.run(sql, params, (err) => {
    if (err) return response.status(500).json({ message: "Status updated" });
    response.json({ message: "Updated" });
  });
};
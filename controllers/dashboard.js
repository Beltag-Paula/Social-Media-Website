const { db } = require("../database/db");
const { logEvent, clientIp } = require("../utils/auditLog");

const VALID_STATUSES = [0, 1, 2]; // pending, active, banned

exports.active = (request, response) => {
  // BUG FIX: this used to select only id/username, leaving `status`
  // undefined on every row the client received. The dashboard's status
  // badge fell back to "pending" whenever status was undefined — so every
  // user in every section (active, pending, banned) rendered a "pending"
  // badge regardless of which list they were actually in. Selecting the
  // real column fixes the badge at the source instead of patching the
  // fallback client-side.
  db.all("SELECT id, username, status FROM users WHERE status = 1", [], (err, rows) => {
    if (err) return response.status(500).json({ message: "DB error" });
    response.json({ rows });
  });
};

exports.pending = (request, response) => {
  db.all("SELECT id, username, status FROM users WHERE status = 0", [], (err, rows) => {
    if (err) return response.status(500).json({ message: "DB error" });
    response.json({ rows });
  });
};

exports.banned = (request, response) => {
  db.all(
    "SELECT id, username, status, banReason FROM users WHERE status = 2",
    [],
    (err, rows) => {
      if (err) return response.status(500).json({ message: "DB error" });
      response.json({ rows });
    },
  );
};

exports.deleteUser = (request, response) => {
  const id = parseInt(request.body.id, 10);
  const ip = clientIp(request);

  if (!Number.isInteger(id)) {
    return response.status(400).json({ message: "Invalid user id" });
  }

  // prevent admin from committing seppuku
  if (id === request.user.id) {
    return response.status(403).json({
      message: "You cannot delete your own account",
    });
  }

  // check if target user is admin
  db.get("SELECT isAdmin, username FROM users WHERE id = ?", [id], (err, user) => {
    if (err) return response.status(500).json({ message: "DB error" });

    if (!user) {
      return response.status(404).json({ message: "User not found" });
    }

    if (user.isAdmin === 1) {
      return response.status(403).json({
        message: "You cannot delete an admin account",
      });
    }

    db.run("DELETE FROM users WHERE id = ?", [id], (err2) => {
      if (err2) return response.status(500).json({ message: "DB error" });

      // OWASP A09: every admin action that removes/restricts an account
      // is worth a durable record of who did it and to whom — this is
      // exactly the kind of action a "who did this?!" question gets asked
      // about later.
      logEvent("admin_delete_user", {
        actorId: request.user.id,
        targetId: id,
        ip,
        details: { username: user.username },
      });

      response.json({ message: "User deleted" });
    });
  });
};

exports.updateStatus = (request, response) => {
  const id = parseInt(request.body.id, 10);
  const status = parseInt(request.body.status, 10);
  const banReason = request.body.banReason;
  const ip = clientIp(request);

  if (!Number.isInteger(id)) {
    return response.status(400).json({ message: "Invalid user id" });
  }

  // BUG FIX / hardening: status used to be written to the DB with no
  // validation at all — any integer (or non-numeric value coerced by
  // SQLite) would be silently accepted, potentially leaving accounts in a
  // status the rest of the app doesn't know how to interpret.
  if (!VALID_STATUSES.includes(status)) {
    return response.status(400).json({ message: "Invalid status value" });
  }

  // prevent admin from banning itself
  if (id === request.user.id) {
    return response.status(403).json({
      message: "You cannot ban your own account",
    });
  }

  let sql;
  let params;

  if (status === 2) {
    // banning user → store reason
    sql = "UPDATE users SET status = ?, banReason = ? WHERE id = ?";
    params = [status, (banReason || "No reason provided").slice(0, 255), id];
  } else {
    // not banned → clear reason
    sql = "UPDATE users SET status = ?, banReason = NULL WHERE id = ?";
    params = [status, id];
  }

  db.run(sql, params, function (err) {
    // BUG FIX: this used to report success ("Status updated") even when
    // the query failed, which hid real DB errors from the admin UI.
    if (err) return response.status(500).json({ message: "DB error" });

    if (this.changes === 0) {
      return response.status(404).json({ message: "User not found" });
    }

    const eventType = status === 2 ? "admin_ban_user" : status === 1 ? "admin_approve_user" : "admin_set_pending";
    logEvent(eventType, {
      actorId: request.user.id,
      targetId: id,
      ip,
      details: status === 2 ? { banReason: params[1] } : undefined,
    });

    response.json({ message: "Updated" });
  });
};

// GET /api/v1/admin/audit-log?limit=100 — recent security events (failed
// logins, lockouts, admin actions). Admin-only, read-only, capped at 200
// rows per request so it can't be used to pull the whole table at once.
exports.getAuditLog = (request, response) => {
  const limit = Math.min(Math.max(parseInt(request.query.limit, 10) || 100, 1), 200);

  db.all(
    `
    SELECT al.id, al.eventType, al.actorId, actor.username AS actorUsername,
           al.targetId, target.username AS targetUsername,
           al.ip, al.details, al.createdAt
    FROM audit_log al
    LEFT JOIN users actor ON actor.id = al.actorId
    LEFT JOIN users target ON target.id = al.targetId
    ORDER BY al.id DESC
    LIMIT ?
    `,
    [limit],
    (err, rows) => {
      if (err) return response.status(500).json({ message: "DB error" });
      response.json(rows);
    },
  );
};

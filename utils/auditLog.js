const { db } = require("../database/db");

// OWASP A09 (Security Logging & Monitoring Failures) mitigation: a single
// place every security-relevant event goes through, so "what happened"
// questions (who tried to log in and failed, who got locked out, which
// admin banned which account) have an actual answer instead of "check
// whatever logs happened to still exist."
//
// Writes to the audit_log table (queryable via
// GET /api/v1/admin/audit-log) AND mirrors to stdout/stderr via
// console.warn, so events are still visible through `docker logs` / any
// log aggregator even if the DB write itself fails for some reason.
function logEvent(eventType, { actorId = null, targetId = null, ip = null, details = null } = {}) {
  const detailsJson = details ? JSON.stringify(details) : null;

  db.run(
    "INSERT INTO audit_log (eventType, actorId, targetId, ip, details) VALUES (?, ?, ?, ?, ?)",
    [eventType, actorId, targetId, ip, detailsJson],
    (err) => {
      if (err) console.error("[audit] failed to persist event:", eventType, err.message);
    },
  );

  console.warn(`[audit] ${eventType}`, { actorId, targetId, ip, details });
}

// Best-effort client IP, aware of a trusted reverse proxy (see
// app.set("trust proxy", ...) in server.js, gated behind TRUST_PROXY).
// Never used for anything security-load-bearing on its own (rate limiting
// keys off req.ip via express-rate-limit directly) — this is for the
// audit trail only.
function clientIp(request) {
  return request.ip || (request.socket && request.socket.remoteAddress) || null;
}

module.exports = { logEvent, clientIp };

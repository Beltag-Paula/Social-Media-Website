const { db } = require("../database/db");

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

function clientIp(request) {
  return request.ip || (request.socket && request.socket.remoteAddress) || null;
}

module.exports = { logEvent, clientIp };

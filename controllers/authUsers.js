const { db } = require("../database/db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { logEvent, clientIp } = require("../utils/auditLog");

const SECRET_KEY = process.env.JWT_SECRET;

if (!SECRET_KEY) {
  throw new Error("JWT_SECRET environment variable is not defined");
}

// OWASP A07 (Identification & Authentication Failures): per-account
// lockout, layered on top of the existing IP-based rate limiter in
// server.js. The IP limiter stops one machine hammering many accounts;
// this stops one account being hammered from many machines (or a patient
// attacker who just waits out the IP window). Five wrong passwords in a
// row locks the account for 15 minutes, independent of where the attempts
// came from.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

exports.signup = async (request, response) => {
  const { username, password } = request.body;
  const ip = clientIp(request);

  if (!username || !password) {
    return response
      .status(400)
      .json({ message: "Username & password are required" });
  }

  if (password.length < 8) {
    return response
      .status(400)
      .json({ message: "Password must be at least 8 characters long" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
      "INSERT INTO users (username, hashedPassword) VALUES (?,?)",
      [username, hashedPassword],
      function (err) {
        if (err) {
          logEvent("signup_failed_duplicate", { ip, details: { username } });
          return response
            .status(409)
            .json({ message: "Username already taken" });
        }
        logEvent("signup", { actorId: this.lastID, ip, details: { username } });
        response.status(201).json({ message: "User registered successfully" });
      },
    );
  } catch (err) {
    console.error("Signup error ", err.message);
    return response.status(500).json({ message: "Internal server error" });
  }
};

exports.login = async (request, response) => {
  const { username, password } = request.body;
  const ip = clientIp(request);
  const genericError = "Invalid username or password";

  if (!username || !password) {
    return response.status(400).json({ message: genericError });
  }

  db.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, user) => {
      if (err) {
        return response.status(500).json({ message: "Server error" });
      }

      if (!user) {
        logEvent("login_failed_unknown_user", { ip, details: { username } });
        return response.status(401).json({ message: genericError });
      }

      // Locked accounts are rejected before touching bcrypt at all — no
      // reason to spend CPU comparing a password hash for an attempt that
      // can't succeed regardless, and it keeps the lockout deterministic.
      if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
        logEvent("login_blocked_locked", { actorId: user.id, ip, details: { username } });
        return response.status(423).json({
          message: "Too many failed attempts. This account is temporarily locked — try again later.",
        });
      }

      // Verify the password BEFORE revealing anything about account status.
      // (Checking status first would let an attacker probe usernames and
      // learn whether an account exists / is pending / is banned without
      // ever needing a valid password.)
      const isMatch = await bcrypt.compare(password, user.hashedPassword);
      if (!isMatch) {
        const attempts = (user.failedLoginAttempts || 0) + 1;

        if (attempts >= MAX_FAILED_ATTEMPTS) {
          const lockedUntil = new Date(Date.now() + LOCKOUT_MS).toISOString();
          db.run(
            "UPDATE users SET failedLoginAttempts = 0, lockedUntil = ? WHERE id = ?",
            [lockedUntil, user.id],
          );
          logEvent("account_locked", { actorId: user.id, ip, details: { username, attempts } });
        } else {
          db.run("UPDATE users SET failedLoginAttempts = ? WHERE id = ?", [attempts, user.id]);
          logEvent("login_failed", { actorId: user.id, ip, details: { username, attempts } });
        }

        return response.status(401).json({ message: genericError });
      }

      if (user.status === 0) {
        return response.status(403).json({ message: "Account not approved yet" });
      }

      if (user.status === 2) {
        return response.status(403).json({
          message: "Account banned",
          reason: user.banReason || "No reason provided",
        });
      }

      // Successful login clears any accumulated failed attempts/lockout.
      db.run(
        "UPDATE users SET failedLoginAttempts = 0, lockedUntil = NULL WHERE id = ?",
        [user.id],
      );
      logEvent("login_success", { actorId: user.id, ip });

      const token = jwt.sign(
        { id: user.id, isAdmin: user.isAdmin },
        SECRET_KEY,
        { expiresIn: "1h", algorithm: "HS256" },
      );

      // SECURITY CHANGE: the token used to come back in the JSON body and
      // get stashed in localStorage by the frontend, which is readable by
      // any script on the page. An httpOnly cookie can only be read/sent
      // by the browser itself, so it isn't a valid target for XSS-based
      // token theft anymore.
      response
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production", // requires HTTPS in prod
          sameSite: "strict", // cookie is never sent on cross-site requests (covers CSRF)
          maxAge: 60 * 60 * 1000, // 1h, matches the JWT's own expiry above
        })
        .status(200)
        .json({
          message: "Login successful",
          isAdmin: !!user.isAdmin, // frontend still needs this to pick a redirect
        });
    },
  );
};

exports.logout = (request, response) => {
  response.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
  response.status(200).json({ message: "Logged out" });
};

// Lets the frontend ask "who am I" without ever touching the (httpOnly,
// intentionally unreadable) cookie directly — used to decide whether to
// show the Admin Dashboard link in the nav.
exports.me = (request, response) => {
  response.json({
    id: request.user.id,
    isAdmin: request.user.isAdmin === 1 || request.user.isAdmin === true,
  });
};

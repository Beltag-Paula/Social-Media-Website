require("dotenv").config();

const jwt = require("jsonwebtoken");
const util = require("util");
const { db } = require("../database/db");
const verifyToken = util.promisify(jwt.verify);

const SECRET_KEY = process.env.JWT_SECRET;

if (!SECRET_KEY) {
  throw new Error("JWT_SECRET environment variable is not defined");
}

exports.authenticateToken = async (request, response, next) => {
  // SECURITY CHANGE: token now lives in an httpOnly cookie instead of a
  // Bearer header the frontend read out of localStorage. 
  // localStorage is readable by any JS running on the page, so any XSS anywhere steals
  // every logged-in session. 
  // An httpOnly cookie can't be read by JS at all.
  const token = request.cookies && request.cookies.token;

  if (!token) {
    return response.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  let decoded;
  try {
    // SECURITY CHANGE: pin the algorithm. jsonwebtoken will otherwise trust
    // whatever "alg" the token itself claims, and some misconfigured
    // verifiers can be tricked into accepting alg:"none" (unsigned) or an
    // HMAC token signed with a public key that was meant for RS256. Since
    // we only ever *sign* with HS256, we only ever *verify* HS256.
    decoded = await verifyToken(token, SECRET_KEY, { algorithms: ["HS256"] });
  } catch (err) {
    return response.status(403).json({
      success: false,
      message: "Invalid or expired token",
    });
  }

  // SECURITY CHANGE: the JWT's `isAdmin`/account-status claims are a
  // snapshot from the moment the user logged in, and tokens live for up to
  // an hour. Without this check, an admin who bans a user (or demotes
  // another admin) mid-session has no effect until that user's token
  // happens to expire — they keep every permission they had a minute
  // earlier. Re-reading current status per request costs one indexed
  // lookup and closes that window.
  db.get(
    "SELECT isAdmin, status FROM users WHERE id = ?",
    [decoded.id],
    (err, user) => {
      if (err) {
        return response.status(500).json({ success: false, message: "Server error" });
      }
      if (!user || user.status === 2) {
        return response.status(403).json({
          success: false,
          message: !user ? "Account no longer exists" : "Account banned",
        });
      }

      request.user = {
        id: decoded.id,
        isAdmin: user.isAdmin === 1 || user.isAdmin === true,
      };
      next();
    },
  );
};

exports.isAdmin = (request, response, next) => {
  // Check for 1 (SQLite) or true (JS Boolean)
  if (
    request.user &&
    (request.user.isAdmin === 1 || request.user.isAdmin === true)
  ) {
    return next();
  }

  return response.status(403).json({
    success: false,
    message: "Access denied: Admin permissions required",
  });
};

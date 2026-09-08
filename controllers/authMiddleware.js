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
  const token = request.cookies && request.cookies.token;

  if (!token) {
    return response.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  let decoded;
  try {
    decoded = await verifyToken(token, SECRET_KEY, { algorithms: ["HS256"] });
  } catch (err) {
    return response.status(403).json({
      success: false,
      message: "Invalid or expired token",
    });
  }

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

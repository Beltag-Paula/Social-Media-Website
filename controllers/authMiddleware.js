require("dotenv").config();

const { response } = require("express");
const { request } = require("http");
const jwt = require("jsonwebtoken");
const util = require("util");
const verifyToken = util.promisify(jwt.verify);

const SECRET_KEY = process.env.JWT_SECRET;

if (!SECRET_KEY) {
  throw new Error("JWT_SECRET environment variable is not defined");
}

exports.authenticateToken = async (request, response, next) => {
  // SECURITY CHANGE: token now lives in an httpOnly cookie instead of a
  // Bearer header the frontend read out of localStorage. localStorage is
  // readable by any JS running on the page, so any XSS anywhere steals
  // every logged-in session. An httpOnly cookie can't be read by JS at all.
  const token = request.cookies && request.cookies.token;

  if (!token) {
    return response.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    const decoded = await verifyToken(token, SECRET_KEY);
    request.user = decoded; // Contains { id, isAdmin, ... }
    next();
  } catch (err) {
    return response.status(403).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
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
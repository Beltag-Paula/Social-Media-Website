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
  const authHeader = request.headers["authorization"];

  // Check if header exists and starts with 'Bearer '
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return response.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const token = authHeader.split(" ")[1];

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
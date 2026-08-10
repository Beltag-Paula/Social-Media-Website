const { db } = require("../database/db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const SECRET_KEY = process.env.JWT_SECRET;

if (!SECRET_KEY) {
  throw new Error("JWT_SECRET environment variable is not defined");
}

exports.signup = async (request, response) => {
  const { username, password } = request.body;

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
          return response
            .status(409)
            .json({ message: "Username already taken" });
        }
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
        return response.status(401).json({ message: genericError });
      }

      // Verify the password BEFORE revealing anything about account status.
      // (Checking status first would let an attacker probe usernames and
      // learn whether an account exists / is pending / is banned without
      // ever needing a valid password.)
      const isMatch = await bcrypt.compare(password, user.hashedPassword);
      if (!isMatch) {
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

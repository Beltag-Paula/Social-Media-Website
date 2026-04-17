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
    const createHashPasswordFrontEnd = await bcrypt.hash(password, 10);


    db.run(
      "INSERT INTO users (username, hashedPassword) VALUES (?,?)",
      [username, createHashPasswordFrontEnd],
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

      //check the status
      if(user.status === 0) {
        return response.status(403).json({message: "Account not approved yet"})
      }

      if(user.status === 2){
        return response.status(403).json({message: "Account banned", reason: user.banReason || "No reason provided"})
      }

      const isMatch = await bcrypt.compare(password, user.hashedPassword);
      if (!isMatch) {
        return response.status(401).json({ message: genericError });
      }

      const token = jwt.sign(
        { id: user.id, isAdmin: user.isAdmin },
        SECRET_KEY,
        { expiresIn: "1h", algorithm: "HS256" },
      );

      response.status(200).json({
        message: "Login successful",
        token,
        isAdmin: !!user.isAdmin, // Converts 1 to true, 0 to false for the frontend!!!
      });
    },
  );
};

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bcrypt = require("bcryptjs");

const dbPath = path.join(__dirname, "myDatabase.db");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Database error ", err.message);
  } else {
    console.log("Connected to the database");
  }
  initialize_myDatabase();
});


function initialize_myDatabase() {
  db.serialize(() => {
    // 0 Make sure foreign keys are active
    db.run("PRAGMA foreign_keys = ON");

    // 1st table is users: isAdmin 0 is false and 1 is true; status 0 is pending, 1 is active, 2 is banned
    db.run(
      `
            CREATE TABLE IF NOT EXISTS users
            (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username VARCHAR(255) UNIQUE NOT NULL,
                hashedPassword VARCHAR(255) NOT NULL,
                isAdmin BOOLEAN DEFAULT 0,
                status INTEGER DEFAULT 0,
                banReason VARCHAR(255) DEFAULT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            `,
      (err) => {
        if (err) console.log("Error initializing the users table", err.message);
      },
    );

    //make sure there is an admin!, yeah I know is not good that is hardcoded
    const adminUsername = "Darwin";
    const adminPassword = "12345678";
    const adminPasswordHash = bcrypt.hashSync(adminPassword, 10);

    db.run(
      `INSERT OR IGNORE INTO users (username, hashedPassword, isAdmin, status) VALUES (?,?,?,?)`,
      [adminUsername, adminPasswordHash, 1, 1],
      (err) => {
        if (err) {
          console.error("Error inserting admin ", err.message);
        }
      },
    );

    //2nd table is follow;
    db.run(
      `
            CREATE TABLE IF NOT EXISTS follow
            (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                followerID INTEGER,
                followedID INTEGER,
                FOREIGN KEY (followerID) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (followedID) REFERENCES users (id) ON DELETE CASCADE,
                UNIQUE(followerID, followedID)

            )
            `,
      (err) => {
        if (err) console.log("Error initializing the follow table");
      },
    );

    //3rd table is posts
    db.run(
      `
            CREATE TABLE IF NOT EXISTS posts
            (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userID INTEGER,
                title VARCHAR(255),
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userID) REFERENCES users (id) ON DELETE CASCADE
            )
            `,
      (err) => {
        if (err) console.log("Error initializing the posts table", err.message);
      },
    );

    //4th table is media, mediaType : 0 image, 1 video, 2 audio
    db.run(
      `
            CREATE TABLE IF NOT EXISTS media
            (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userID INTEGER,
                filePath VARCHAR(255),
                mediaType INTEGER,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userID) REFERENCES users (id) ON DELETE CASCADE
            )
            `,
      (err) => {
        if (err) console.log("Error initializing the posts media", err.message);
      },
    );

    //5th table is content (can have many posts + media)
    db.run(
      `
            CREATE TABLE IF NOT EXISTS content
            (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                postID INTEGER,
                body TEXT,
                mediaID INTEGER,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (postID) REFERENCES posts (id) ON DELETE CASCADE,
                FOREIGN KEY (mediaID) REFERENCES media (id) ON DELETE SET NULL

            )
            `,
      (err) => {
        if (err) console.log("Error initializing the posts media", err.message);
      },
    );

    //6th table is profiles
    db.run(
      `
            CREATE TABLE IF NOT EXISTS profiles
            (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userID INTEGER UNIQUE,
                bio TEXT,
                avatar INTEGER,
                banner INTEGER,
                video INTEGER,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userID) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (avatar) REFERENCES media (id) ON DELETE SET NULL,
                FOREIGN KEY (banner) REFERENCES media (id) ON DELETE SET NULL,
                FOREIGN KEY (video) REFERENCES media (id) ON DELETE SET NULL
            )
            `,
      (err) => {
        if (err) console.log("Error initializing the posts media", err.message);
      },
    );

    //7th table is likes
    db.run(
      `
      CREATE TABLE IF NOT EXISTS likes
      (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userID INTEGER,
        postID INTEGER,
        UNIQUE(userID, postID),
        FOREIGN KEY (userID) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (postID) REFERENCES posts (id) ON DELETE CASCADE
      )
      `,
      (err) =>{
        if(err) console.log("Error initializing the likes table", err.message);
      }
    )
    console.log("All tables initialized successfully.");
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS comments
    (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userID INTEGER,
      postID INTEGER,
      body TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userID) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (postID) REFERENCES posts (id) ON DELETE CASCADE
    )`)

  return db;
}

module.exports = { db };

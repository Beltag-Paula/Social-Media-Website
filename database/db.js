require("dotenv").config();
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
    db.run("PRAGMA foreign_keys = ON");

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

        db.run(`ALTER TABLE users ADD COLUMN failedLoginAttempts INTEGER DEFAULT 0`, (e1) => {
          if (e1 && !/duplicate column/i.test(e1.message)) console.log("Error adding failedLoginAttempts", e1.message);
        });
        db.run(`ALTER TABLE users ADD COLUMN lockedUntil DATETIME DEFAULT NULL`, (e2) => {
          if (e2 && !/duplicate column/i.test(e2.message)) console.log("Error adding lockedUntil", e2.message);
        });
      },
    );

    const adminUsername = process.env.AdminUsername;
    const adminPassword = process.env.AdminPassword;

    if (!adminUsername || !adminPassword) {
      console.warn(
        "AdminUsername/AdminPassword not set — skipping admin bootstrap.",
      );
    } else {
      console.log("Admin bootstrap: ensuring account exists for", adminUsername);
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
    }

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
        db.run(`ALTER TABLE media ADD COLUMN role TEXT DEFAULT 'post'`, (alterErr) => {
          if (!alterErr) {
            backfillMediaRoles();
          } else if (!/duplicate column/i.test(alterErr.message)) {
            console.log("Error adding media.role column", alterErr.message);
          }
        });
      },
    );


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
      (err) => {
        if (err) console.log("Error initializing the likes table", err.message);
      }
    )
    db.run(
      `
      CREATE TABLE IF NOT EXISTS messages
      (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        senderID INTEGER NOT NULL,
        receiverID INTEGER NOT NULL,
        body TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        readAt DATETIME DEFAULT NULL,
        FOREIGN KEY (senderID) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (receiverID) REFERENCES users (id) ON DELETE CASCADE
      )
      `,
      (err) => {
        if (err) console.log("Error initializing the messages table", err.message);
      }
    );

    db.run(
      `CREATE INDEX IF NOT EXISTS idx_messages_thread_a ON messages (senderID, receiverID, id)`,
      (err) => { if (err) console.log("Error creating idx_messages_thread_a", err.message); }
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_messages_thread_b ON messages (receiverID, senderID, id)`,
      (err) => { if (err) console.log("Error creating idx_messages_thread_b", err.message); }
    );
    db.run(
      `
      CREATE TABLE IF NOT EXISTS audit_log
      (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        eventType TEXT NOT NULL,
        actorId INTEGER,
        targetId INTEGER,
        ip TEXT,
        details TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
      `,
      (err) => {
        if (err) console.log("Error initializing the audit_log table", err.message);
      }
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (createdAt)`,
      (err) => { if (err) console.log("Error creating idx_audit_log_created", err.message); }
    );

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

function backfillMediaRoles() {
  db.serialize(() => {
    db.run(`UPDATE media SET role = 'avatar' WHERE id IN (SELECT avatar FROM profiles WHERE avatar IS NOT NULL)`);
    db.run(`UPDATE media SET role = 'banner' WHERE id IN (SELECT banner FROM profiles WHERE banner IS NOT NULL)`);
    db.run(`UPDATE media SET role = 'video' WHERE id IN (SELECT video FROM profiles WHERE video IS NOT NULL)`);
    db.run(`UPDATE media SET role = 'post' WHERE id IN (SELECT mediaID FROM content WHERE mediaID IS NOT NULL)`);
    db.run(
      `
      UPDATE media SET role = 'profile'
      WHERE role = 'post'
        AND mediaType = 0
        AND id NOT IN (SELECT mediaID FROM content WHERE mediaID IS NOT NULL)
      `,
      (err) => {
        if (err) console.log("Error backfilling media.role", err.message);
        else console.log("media.role backfilled for existing uploads.");
      }
    );
  });
}

module.exports = { db };

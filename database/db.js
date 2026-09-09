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
    initialize_myDatabase();
  }
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

        // OWASP A07 (Identification & Authentication Failures): the app
        // previously only rate-limited login *by source IP*. That does
        // nothing against a botnet, or an attacker who's simply patient,
        // targeting one specific account from many IPs. These two columns
        // add a PER-ACCOUNT lockout on top of the existing IP-based limit
        // (see authUsers.js) — the two defenses cover different attack
        // shapes and are meant to be layered, not to replace each other.
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
      // SECURITY CHANGE: this used to console.log the admin credentials in
      // plaintext on every boot. Anything written to stdout typically ends
      // up in log files / log aggregators / `docker logs`, which are read
      // by far more people (and tools) than should ever see a password.
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
        // GALLERY FIX: media rows used to have no record of *why* they were
        // uploaded. Once you replaced your avatar or banner, the old
        // upload's row and file were still sitting there on disk/in the DB,
        // but nothing pointed at it any more (profiles.avatar/banner only
        // ever stores the CURRENT one) — so it was permanently invisible to
        // the app even though it was never actually deleted. `role` fixes
        // that by tagging what each upload was for, so a gallery query can
        // find every avatar/banner a user has ever uploaded, not just the
        // latest.
        db.run(`ALTER TABLE media ADD COLUMN role TEXT DEFAULT 'post'`, (alterErr) => {
          if (alterErr && !/duplicate column/i.test(alterErr.message)) {
            console.log("Error adding media.role column", alterErr.message);
          }
          // Always re-run backfill, not just the first time the column is
          // added. It's built entirely out of idempotent UPDATE statements
          // (re-running it changes nothing for rows that are already
          // correctly labeled), so this costs nothing on a normal boot —
          // but it means a later fix to the backfill LOGIC itself (like
          // the video-inclusion fix below) actually takes effect on an
          // existing database, not just on a fresh install that's never
          // seen this column before.
          backfillMediaRoles();
        });
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
      (err) => {
        if (err) console.log("Error initializing the likes table", err.message);
      }
    )
    //8th table is messages (private DMs between exactly two users)
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

    // Every thread lookup filters by "the two participants" in one order or
    // the other, so both directions get an index — without this, every chat
    // open does a full table scan of every DM ever sent by anyone.
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_messages_thread_a ON messages (senderID, receiverID, id)`,
      (err) => { if (err) console.log("Error creating idx_messages_thread_a", err.message); }
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_messages_thread_b ON messages (receiverID, senderID, id)`,
      (err) => { if (err) console.log("Error creating idx_messages_thread_b", err.message); }
    );

    // OWASP A09 (Security Logging & Monitoring Failures): previously
    // nothing here recorded security-relevant events anywhere durable —
    // failed logins, account lockouts, or what an admin did to which
    // account were only ever visible (if at all) in whatever transient
    // process stdout happened to be attached at the time. This table is a
    // queryable, persistent record of exactly that.
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
      )`);
      console.log("All tables initialized successfully.");
  });


  return db;
}

// Idempotent migration helper, safe to run on every boot (see the call
// site above) — every statement here is either an UPDATE that only
// matches rows currently in the wrong state, or a no-op if nothing needs
// to change. Reconstructs role from the relationships that already exist
// in the DB:
//   - currently-set avatar/banner/video on profiles -> that role
//   - referenced from a post's content row               -> 'post'
//   - anything else left over (old, replaced avatars/banners/intro
//     videos that are still sitting on disk with no other pointer) ->
//     'profile', so they show up in the profile gallery instead of
//     vanishing. This intentionally covers BOTH images and videos —
//     it used to be images-only, which meant a replaced intro video
//     had nowhere to go and just disappeared from the app's perspective,
//     the exact same problem this whole role column was built to solve
//     for avatars/banners in the first place.
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
        AND id NOT IN (SELECT mediaID FROM content WHERE mediaID IS NOT NULL)
      `,
      (err) => {
        if (err) console.log("Error backfilling media.role", err.message);
      }
    );
  });
}

module.exports = { db };

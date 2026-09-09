const path = require("path");
const { db } = require("../database/db");

// See the matching note in controllers/profile.js — keeps stored paths as
// portable forward-slash web paths regardless of the OS that wrote them.
const toWebPath = (filePath) => filePath.split(path.sep).join("/");

/* =========================
   1. HOME FEED
========================= */
exports.getHomeFeed = (req, res) => {
  const userId = req.user.id;

  const sql = `
    SELECT 
      u.username,
      p.userID AS userId,
      p.id AS postId,
      p.title,
      p.createdAt,
      c.body,
      m.filePath AS mediaPath,
      ma.filePath AS avatarPath,
      (SELECT COUNT(*) FROM likes WHERE postID = p.id) AS likeCount,
      (SELECT COUNT(*) FROM comments WHERE postID = p.id) AS commentCount,
      EXISTS(SELECT 1 FROM likes WHERE postID = p.id AND userID = ?) AS likedByMe
    FROM posts p
    JOIN users u ON p.userID = u.id
    LEFT JOIN content c ON p.id = c.postID
    LEFT JOIN media m ON c.mediaID = m.id
    LEFT JOIN profiles prof ON u.id = prof.userID
    LEFT JOIN media ma ON prof.avatar = ma.id
    ORDER BY p.createdAt DESC
    LIMIT 30
  `;

  db.all(sql, [userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Feed error" });
    }

    res.json(rows);
  });
};


/* =========================
   POSTS BY A SINGLE USER
   Used by the profile page: pass ?limit=3 for the "recent
   posts" preview, or no limit for the full post history.
   :id accepts 'me' for the logged-in user.
========================= */
exports.getUserPosts = (req, res) => {
  const viewerId = req.user.id;
  const targetId = req.params.id === "me" ? req.user.id : parseInt(req.params.id, 10);
  if (!Number.isInteger(targetId)) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  const limitParam = parseInt(req.query.limit, 10);
  const hasLimit = Number.isInteger(limitParam) && limitParam > 0;

  const sql = `
    SELECT 
      u.username,
      p.userID AS userId,
      p.id AS postId,
      p.title,
      p.createdAt,
      c.body,
      m.filePath AS mediaPath,
      ma.filePath AS avatarPath,
      (SELECT COUNT(*) FROM likes WHERE postID = p.id) AS likeCount,
      (SELECT COUNT(*) FROM comments WHERE postID = p.id) AS commentCount,
      EXISTS(SELECT 1 FROM likes WHERE postID = p.id AND userID = ?) AS likedByMe
    FROM posts p
    JOIN users u ON p.userID = u.id
    LEFT JOIN content c ON p.id = c.postID
    LEFT JOIN media m ON c.mediaID = m.id
    LEFT JOIN profiles prof ON u.id = prof.userID
    LEFT JOIN media ma ON prof.avatar = ma.id
    WHERE p.userID = ?
    ORDER BY p.createdAt DESC
    ${hasLimit ? "LIMIT ?" : ""}
  `;

  const params = hasLimit
    ? [viewerId, targetId, limitParam]
    : [viewerId, targetId];

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Feed error" });
    }

    res.json(rows);
  });
};


/* =========================
   NEW POST
========================= */
const MAX_POST_TITLE_LENGTH = 255;
const MAX_POST_BODY_LENGTH = 5000;

exports.createPost = (req, res) => {
  const userId = req.user.id;
  let { title, body } = req.body;

  // Hardening: multipart fields aren't covered by express.json()'s size
  // limit, so without an explicit cap here a client could send an
  // arbitrarily large title/body as a form field.
  title = typeof title === "string" ? title.trim().slice(0, MAX_POST_TITLE_LENGTH) : "";
  body = typeof body === "string" ? body.trim().slice(0, MAX_POST_BODY_LENGTH) : "";

  if (!title && !body && !req.file) {
    return res.status(400).json({ message: "Post needs a title, text, or media" });
  }

  db.run(
    "INSERT INTO posts (userID, title) VALUES (?, ?)",
    [userId, title || ""],
    function (err) {
      if (err) return res.status(500).json({ message: "DB error" });
      const postId = this.lastID;

      const finish = (mediaId) => {
        db.run(
          "INSERT INTO content (postID, body, mediaID) VALUES (?, ?, ?)",
          [postId, body || "", mediaId],
          (err2) => {
            if (err2) return res.status(500).json({ message: "DB error" });
            res.status(201).json({ message: "Post created", postId });
          }
        );
      };

      if (req.file) {
        const mediaType = req.file.mimetype.startsWith("video") ? 1 : 0;
        db.run(
          "INSERT INTO media (userID, filePath, mediaType, role) VALUES (?,?,?,?)",
          [userId, toWebPath(req.file.path), mediaType, "post"],
          function (err3) {
            if (err3) return res.status(500).json({ message: "DB error" });
            finish(this.lastID);
          }
        );
      } else {
        finish(null);
      }
    }
  );
};


/* =========================
   2. LIKE / UNLIKE
========================= */
exports.toggleLike = (req, res) => {
  const userId = req.user.id;
  const postId = parseInt(req.body.postId, 10);

  if (!Number.isInteger(postId)) {
    return res.status(400).json({ message: "postId required" });
  }

  db.get(
    "SELECT id FROM likes WHERE userID = ? AND postID = ?",
    [userId, postId],
    (err, row) => {
      if (err) return res.status(500).json({ message: "DB error" });

      // already liked → unlike
      if (row) {
        db.run(
          "DELETE FROM likes WHERE userID = ? AND postID = ?",
          [userId, postId],
          (err2) => {
            if (err2) return res.status(500).json({ message: "DB error" });
            res.json({ liked: false });
          }
        );
      }
      // not liked → like
      else {
        db.run(
          "INSERT INTO likes (userID, postID) VALUES (?, ?)",
          [userId, postId],
          (err2) => {
            if (err2) return res.status(500).json({ message: "DB error" });
            res.json({ liked: true });
          }
        );
      }
    }
  );
};


/* =========================
   3. COMMENTS
========================= */
const MAX_COMMENT_LENGTH = 500;

exports.addComment = (req, res) => {
  const userId = req.user.id;
  const postId = parseInt(req.body.postId, 10);
  const body = typeof req.body.body === "string" ? req.body.body.trim().slice(0, MAX_COMMENT_LENGTH) : "";

  if (!Number.isInteger(postId) || !body) {
    return res.status(400).json({ message: "Missing data" });
  }

  db.run(
    "INSERT INTO comments (userID, postID, body) VALUES (?, ?, ?)",
    [userId, postId, body],
    (err) => {
      if (err) {
        return res.status(500).json({ message: "Comment failed" });
      }
      res.json({ success: true });
    }
  );
};

// BUG FIX / MISSING FEATURE: addComment could write comments but nothing
// ever read them back, so they went straight into a black hole. This
// endpoint lists a post's comments, newest last, with the commenter's name.
exports.getComments = (req, res) => {
  const postId = parseInt(req.params.postId, 10);
  if (!Number.isInteger(postId)) {
    return res.status(400).json({ message: "Invalid post id" });
  }

  db.all(
    `
    SELECT c.id, c.body, c.createdAt, u.id AS userId, u.username
    FROM comments c
    JOIN users u ON c.userID = u.id
    WHERE c.postID = ?
    ORDER BY c.createdAt ASC
    `,
    [postId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "DB error" });
      res.json(rows);
    }
  );
};


/* =========================
   4. FOLLOW / UNFOLLOW
========================= */
exports.toggleFollow = (req, res) => {
  const followerId = req.user.id;
  const userId = parseInt(req.body.userId, 10);

  if (!Number.isInteger(userId)) {
    return res.status(400).json({ message: "userId required" });
  }

  if (userId === followerId) {
    return res.status(403).json({ message: "You cannot follow yourself" });
  }

  db.get(
    "SELECT id FROM follow WHERE followerID = ? AND followedID = ?",
    [followerId, userId],
    (err, row) => {
      if (err) return res.status(500).json({ message: "DB error" });

      // unfollow
      if (row) {
        db.run(
          "DELETE FROM follow WHERE followerID = ? AND followedID = ?",
          [followerId, userId],
          (err2) => {
            if (err2) return res.status(500).json({ message: "DB error" });
            res.json({ following: false });
          }
        );
      }
      // follow
      else {
        db.run(
          "INSERT INTO follow (followerID, followedID) VALUES (?, ?)",
          [followerId, userId],
          (err2) => {
            if (err2) return res.status(500).json({ message: "DB error" });
            res.json({ following: true });
          }
        );
      }
    }
  );
};

/* =========================
   FOLLOWERS (people who follow me)
========================= */
exports.getFollowers = (req, res) => {
  const userId = req.params.id === 'me' ? req.user.id : parseInt(req.params.id, 10);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  db.all(
    `
    SELECT u.id, u.username
    FROM follow f
    JOIN users u ON f.followerID = u.id
    WHERE f.followedID = ?
    `,
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "DB error" });
      res.json(rows);
    }
  );
};


/* =========================
   FOLLOWING (people I follow)
========================= */
exports.getFollowing = (req, res) => {
  const userId = req.params.id === 'me' ? req.user.id : parseInt(req.params.id, 10);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  db.all(
    `
    SELECT u.id, u.username
    FROM follow f
    JOIN users u ON f.followedID = u.id
    WHERE f.followerID = ?
    `,
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "DB error" });
      res.json(rows);
    }
  );
};

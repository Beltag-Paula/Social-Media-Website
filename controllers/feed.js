const { db } = require("../database/db");

// 1. Use "exports.name" for EVERY function
exports.getHomeFeed = (req, res) => {
  const sql = `
    SELECT u.username, p.id as postId, p.title, p.createdAt, c.body, 
           m.filePath as mediaPath, ma.filePath as avatarPath,
           (SELECT COUNT(*) FROM likes WHERE postID = p.id) as likeCount
    FROM posts p
    JOIN follow f ON p.userID = f.followedID
    JOIN users u ON p.userID = u.id
    JOIN content c ON p.id = c.postID
    LEFT JOIN media m ON c.mediaID = m.id
    LEFT JOIN profiles prof ON u.id = prof.userID
    LEFT JOIN media ma ON prof.avatar = ma.id
    WHERE f.followerID = ?
    ORDER BY p.createdAt DESC LIMIT 30`;
  db.all(sql, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ message: "Feed error" });
    res.json(rows);
  });
};

exports.toggleLike = (req, res) => {
  const { postId } = req.body;
  const userId = req.user.id;
  db.get(
    "SELECT id FROM likes WHERE userID = ? AND postID = ?",
    [userId, postId],
    (err, row) => {
      if (row) {
        db.run("DELETE FROM likes WHERE id = ?", [row.id], () =>
          res.json({ liked: false }),
        );
      } else {
        db.run(
          "INSERT INTO likes (userID, postID) VALUES (?, ?)",
          [userId, postId],
          () => res.json({ liked: true }),
        );
      }
    },
  );
};

exports.addComment = (req, res) => {
  db.run(
    "INSERT INTO comments (userID, postID, body) VALUES (?, ?, ?)",
    [req.user.id, req.body.postId, req.body.body],
    (err) => {
      if (err) return res.status(500).json({ message: "Comment failed" });
      res.json({ success: true });
    },
  );
};

// 2. CRITICAL: REMOVE any line that says "module.exports = getHomeFeed"
// Do NOT put any module.exports at the bottom of this file.

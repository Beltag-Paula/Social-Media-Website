const path = require("path");
const { db } = require("../database/db");

// BUG FIX (gallery): filePath used to be saved exactly as multer/path.join
// produced it, which uses the OS's own separator. On Linux (this app's
// Docker image) that's "/", so it happened to work — but the value was
// never normalized, so anything built or tested on Windows would save
// "uploads\\user_1\\123.jpg" into the DB, and `/${filePath}` would then
// produce a broken URL. Forcing forward slashes here means the stored path
// is always a valid, portable web path no matter what OS wrote the file.
const toWebPath = (filePath) => filePath.split(path.sep).join("/");

/* =========================
   SAVE MEDIA
   role: 'avatar' | 'banner' | 'video' | 'post' | 'profile'
   Tagging the role (instead of just userID/filePath/mediaType) is what
   makes the gallery possible: profiles.avatar/banner only ever remembers
   the CURRENT image, so past uploads used to become invisible to the app
   the moment you changed your picture, even though the file was still on
   disk. With role stored on every row, "all my past avatars/banners" is a
   simple, honest query instead of data that's silently orphaned.
========================= */
const saveMedia = (userId, filePath, type, role) => {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO media (userID, filePath, mediaType, role) VALUES (?,?,?,?)",
      [userId, toWebPath(filePath), type, role],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
};


/* =========================
   PROFILE DATA
========================= */
exports.getProfileData = (req, res) => {
  const targetId = req.params.id === 'me' ? req.user.id : parseInt(req.params.id, 10);
  if (!Number.isInteger(targetId)) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  const query = `
    SELECT 
      u.id,
      u.username,
      p.bio,
      m1.filePath AS avatarPath,
      m2.filePath AS bannerPath,
      m3.filePath AS videoPath
    FROM users u
    LEFT JOIN profiles p ON u.id = p.userID
    LEFT JOIN media m1 ON p.avatar = m1.id
    LEFT JOIN media m2 ON p.banner = m2.id
    LEFT JOIN media m3 ON p.video = m3.id
    WHERE u.id = ?
  `;

  db.get(query, [targetId], (err, row) => {
    if (err) return res.status(500).json({ message: "DB Error" });

    res.json(
      row || {
        id: targetId,
        username: "User",
        bio: "",
      }
    );
  });
};


/* =========================
   BIO
========================= */
const MAX_BIO_LENGTH = 1000;

exports.updateBio = (req, res) => {
  const bio = typeof req.body.bio === "string" ? req.body.bio.trim().slice(0, MAX_BIO_LENGTH) : "";

  db.run(
    `
    INSERT INTO profiles (userID, bio)
    VALUES (?, ?)
    ON CONFLICT(userID)
    DO UPDATE SET bio = excluded.bio
    `,
    [req.user.id, bio],
    (err) => {
      // BUG FIX: this used to always report success, even if the write failed.
      if (err) return res.status(500).json({ message: "DB error" });
      res.json({ message: "Bio updated" });
    }
  );
};


/* =========================
   AVATAR / BANNER / VIDEO
========================= */
exports.uploadAvatar = async (req, res) => {
  try {
    const mediaId = await saveMedia(req.user.id, req.file.path, 0, "avatar");

    db.run(
      `
      INSERT INTO profiles (userID, avatar)
      VALUES (?, ?)
      ON CONFLICT(userID)
      DO UPDATE SET avatar = excluded.avatar
      `,
      [req.user.id, mediaId],
      (err) => {
        if (err) return res.status(500).json({ message: "DB error" });
        res.json({ path: toWebPath(req.file.path) });
      }
    );
  } catch (err) {
    res.status(500).json({ message: "Upload failed" });
  }
};

exports.uploadBanner = async (req, res) => {
  try {
    const mediaId = await saveMedia(req.user.id, req.file.path, 0, "banner");

    db.run(
      `
      INSERT INTO profiles (userID, banner)
      VALUES (?, ?)
      ON CONFLICT(userID)
      DO UPDATE SET banner = excluded.banner
      `,
      [req.user.id, mediaId],
      (err) => {
        if (err) return res.status(500).json({ message: "DB error" });
        res.json({ path: toWebPath(req.file.path) });
      }
    );
  } catch (err) {
    res.status(500).json({ message: "Upload failed" });
  }
};

exports.uploadVideo = async (req, res) => {
  try {
    const mediaId = await saveMedia(req.user.id, req.file.path, 1, "video");

    db.run(
      `
      INSERT INTO profiles (userID, video)
      VALUES (?, ?)
      ON CONFLICT(userID)
      DO UPDATE SET video = excluded.video
      `,
      [req.user.id, mediaId],
      (err) => {
        if (err) return res.status(500).json({ message: "DB error" });
        res.json({ path: toWebPath(req.file.path) });
      }
    );
  } catch (err) {
    res.status(500).json({ message: "Upload failed" });
  }
};

/* =========================
   GALLERY
   Every avatar/banner a user has ever uploaded (see the role column /
   backfill migration in database/db.js) — not just the current one.
========================= */
exports.getGallery = (req, res) => {
  const targetId = req.params.id === "me" ? req.user.id : parseInt(req.params.id, 10);
  if (!Number.isInteger(targetId)) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  db.all(
    `
    SELECT id, filePath, role, createdAt
    FROM media
    WHERE userID = ? AND role IN ('avatar', 'banner', 'profile')
    ORDER BY createdAt DESC
    LIMIT 60
    `,
    [targetId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "DB error" });
      res.json(rows);
    }
  );
};

// Lets you re-pick an old avatar/banner from the gallery instead of
// re-uploading it. Ownership is checked against the media row itself
// (not trusted from the request body), so you can only ever set your own
// past uploads as your current picture — never someone else's media id.
//
// SECURITY: `column` is only ever passed in below as one of the two
// literal strings at the bottom of this file — never anything derived
// from a request — but it's whitelisted against ALLOWED_COLUMNS anyway
// as defense-in-depth, so this function can never be reused later (by
// someone editing this file without reading this comment) in a way that
// puts request-controlled data into that identifier position.
const ALLOWED_COLUMNS = new Set(["avatar", "banner"]);

function selectFromGallery(column) {
  if (!ALLOWED_COLUMNS.has(column)) {
    throw new Error(`selectFromGallery: "${column}" is not an allowed column`);
  }

  return (req, res) => {
    const mediaId = parseInt(req.body.mediaId, 10);
    if (!Number.isInteger(mediaId)) {
      return res.status(400).json({ message: "mediaId required" });
    }

    db.get(
      "SELECT id FROM media WHERE id = ? AND userID = ?",
      [mediaId, req.user.id],
      (err, row) => {
        if (err) return res.status(500).json({ message: "DB error" });
        if (!row) return res.status(404).json({ message: "Image not found" });

        db.run(
          `
          INSERT INTO profiles (userID, ${column})
          VALUES (?, ?)
          ON CONFLICT(userID)
          DO UPDATE SET ${column} = excluded.${column}
          `,
          [req.user.id, mediaId],
          (err2) => {
            if (err2) return res.status(500).json({ message: "DB error" });
            res.json({ message: "Updated" });
          }
        );
      }
    );
  };
}

exports.selectAvatar = selectFromGallery("avatar");
exports.selectBanner = selectFromGallery("banner");



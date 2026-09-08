const path = require("path");
const { db } = require("../database/db");

const toWebPath = (filePath) => filePath.split(path.sep).join("/");

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
      if (err) return res.status(500).json({ message: "DB error" });
      res.json({ message: "Bio updated" });
    }
  );
};

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



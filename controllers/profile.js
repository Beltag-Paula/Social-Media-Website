const { db } = require("../database/db");

/* =========================
   SAVE MEDIA (unchanged logic, fine)
========================= */
const saveMedia = (userId, filePath, type) => {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO media (userID, filePath, mediaType) VALUES (?,?,?)",
      [userId, filePath, type],
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
  const targetId = req.params.id === 'me' ? req.user.id : req.params.id;
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
exports.updateBio = (req, res) => {
  const { bio } = req.body;

  db.run(
    `
    INSERT INTO profiles (userID, bio)
    VALUES (?, ?)
    ON CONFLICT(userID)
    DO UPDATE SET bio = excluded.bio
    `,
    [req.user.id, bio],
    () => res.json({ message: "Bio updated" })
  );
};


/* =========================
   AVATAR / BANNER / VIDEO
========================= */
exports.uploadAvatar = async (req, res) => {
  const mediaId = await saveMedia(req.user.id, req.file.path, 0);

  db.run(
    `
    INSERT INTO profiles (userID, avatar)
    VALUES (?, ?)
    ON CONFLICT(userID)
    DO UPDATE SET avatar = excluded.avatar
    `,
    [req.user.id, mediaId],
    () => res.json({ path: req.file.path })
  );
};

exports.uploadBanner = async (req, res) => {
  const mediaId = await saveMedia(req.user.id, req.file.path, 0);

  db.run(
    `
    INSERT INTO profiles (userID, banner)
    VALUES (?, ?)
    ON CONFLICT(userID)
    DO UPDATE SET banner = excluded.banner
    `,
    [req.user.id, mediaId],
    () => res.json({ path: req.file.path })
  );
};

exports.uploadVideo = async (req, res) => {
  const mediaId = await saveMedia(req.user.id, req.file.path, 1);

  db.run(
    `
    INSERT INTO profiles (userID, video)
    VALUES (?, ?)
    ON CONFLICT(userID)
    DO UPDATE SET video = excluded.video
    `,
    [req.user.id, mediaId],
    () => res.json({ path: req.file.path })
  );
};



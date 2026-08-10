const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
  destination: (request, file, cb) => {
    const userId = request.user.id;
    const userDir = path.join("uploads", `user_${userId}`);

    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    cb(null, userDir);
  },

  filename: (request, file, cb) => {
    // Date.now() makes it unique, path.extname(...) keeps the .mp4, .jpg, etc.
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + extension);
  },
});

// BUG FIX: the original config had no fileFilter or size limit. Since
// uploaded files are served back out directly via express.static("uploads"),
// an unrestricted upload would let anyone host arbitrary files (including
// executable HTML/SVG with scripts) from your domain. This restricts
// uploads to actual image/video mimetypes and caps size at 25MB.
const ALLOWED_MIME = /^(image\/(png|jpe?g|gif|webp)|video\/(mp4|webm|quicktime))$/;

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (request, file, cb) => {
    if (ALLOWED_MIME.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type"));
    }
  },
});

module.exports = upload;

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
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}.tmp`);
  },
});

const ALLOWED_MIME = /^(image\/(png|jpe?g|gif|webp)|video\/(mp4|webm|quicktime))$/;

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (request, file, cb) => {
    if (ALLOWED_MIME.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type"));
    }
  },
});

const SIGNATURES = [
  { ext: ".jpg", mimeType: "image/jpeg", check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: ".png", mimeType: "image/png", check: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: ".gif", mimeType: "image/gif", check: (b) => b.length >= 6 && b.toString("ascii", 0, 3) === "GIF" },
  { ext: ".webp", mimeType: "image/webp", check: (b) => b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
  // MP4 / QuickTime: bytes 4-8 spell out a box type like "ftyp"/"moov".
  { ext: ".mp4", mimeType: "video/mp4", check: (b) => b.length >= 12 && b.toString("ascii", 4, 8) === "ftyp" },
  { ext: ".mov", mimeType: "video/quicktime", check: (b) => b.length >= 12 && (b.toString("ascii", 4, 8) === "moov" || b.toString("ascii", 4, 8) === "free" || b.toString("ascii", 4, 8) === "mdat" || b.toString("ascii", 4, 8) === "wide") },
  // WebM (a Matroska container): starts with the EBML magic number.
  { ext: ".webm", mimeType: "video/webm", check: (b) => b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
];

function detectSignature(buffer) {
  return SIGNATURES.find((sig) => sig.check(buffer));
}


function verifyUploadedFile(request, response, next) {
  if (!request.file) return next();

  const tmpPath = request.file.path;

  fs.open(tmpPath, "r", (openErr, fd) => {
    if (openErr) {
      return response.status(500).json({ message: "Upload failed" });
    }

    const header = Buffer.alloc(16);
    fs.read(fd, header, 0, 16, 0, (readErr, bytesRead) => {
      fs.close(fd, () => {});
      if (readErr) {
        fs.unlink(tmpPath, () => {});
        return response.status(500).json({ message: "Upload failed" });
      }

      const signature = detectSignature(header.subarray(0, bytesRead));
      if (!signature) {
        fs.unlink(tmpPath, () => {});
        return response.status(400).json({
          message: "File content doesn't match a supported image/video type",
        });
      }

      const finalPath = tmpPath.replace(/\.tmp$/, signature.ext);
      fs.rename(tmpPath, finalPath, (renameErr) => {
        if (renameErr) {
          fs.unlink(tmpPath, () => {});
          return response.status(500).json({ message: "Upload failed" });
        }
        request.file.path = finalPath;
        request.file.filename = path.basename(finalPath);
        request.file.mimetype = signature.mimeType; // trust the verified value from here on
        next();
      });
    });
  });
}

module.exports = upload;
module.exports.verifyUploadedFile = verifyUploadedFile;

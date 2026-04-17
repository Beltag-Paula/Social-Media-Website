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
    // THIS IS WHERE YOU PUT IT
    // Date.now() makes it unique
    // path.extname(...) keeps the .mp4, .jpg, etc. extension
    const extension = path.extname(file.originalname);
    cb(null, Date.now() + extension);
  },
});

const upload = multer({ storage: storage });

module.exports = upload;

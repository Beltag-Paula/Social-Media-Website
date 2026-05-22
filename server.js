require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");

// --- CONTROLLERS ---
const authUsers = require("./controllers/authUsers.js");
const {
  authenticateToken,
  isAdmin,
} = require("./controllers/authMiddleware.js");
const dashboard = require("./controllers/dashboard.js");
const upload = require("./controllers/upload"); // Multer with subfolders
const profile = require("./controllers/profile");
const feed = require("./controllers/feed.js"); // Added Feed Controller
const searchU = require("./controllers/searchByUsername.js");

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Serve uploads for images/videos
app.use("/uploads", express.static("uploads"));

const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

// --- ROUTES ---

// 1. Auth
app.post("/api/v1/signup", authUsers.signup);
app.post("/api/v1/login", authUsers.login);

// 2. Admin Dashboard
app.get(
  "/api/v1/admin/users/active",
  authenticateToken,
  isAdmin,
  dashboard.active,
);
app.get(
  "/api/v1/admin/users/pending",
  authenticateToken,
  isAdmin,
  dashboard.pending,
);
app.get(
  "/api/v1/admin/users/banned",
  authenticateToken,
  isAdmin,
  dashboard.banned,
);
app.delete(
  "/api/v1/admin/users/delete",
  authenticateToken,
  isAdmin,
  dashboard.deleteUser,
);
app.patch(
  "/api/v1/admin/users/status",
  authenticateToken,
  isAdmin,
  dashboard.updateStatus,
);

// 3. Profile
app.get("/api/v1/profile/:id", authenticateToken, profile.getProfileData);
app.post("/api/v1/profile/bio", authenticateToken, profile.updateBio);

// 4. File Uploads (Subfolder logic)
app.post(
  "/api/v1/profile/avatar",
  authenticateToken,
  upload.single("avatar"),
  profile.uploadAvatar,
);
app.post(
  "/api/v1/profile/banner",
  authenticateToken,
  upload.single("banner"),
  profile.uploadBanner,
);
app.post(
  "/api/v1/profile/video",
  authenticateToken,
  upload.single("video"),
  profile.uploadVideo,
);

// 5. Feed & Social Logic (Integrated here)
app.get("/api/v1/feed", authenticateToken, feed.getHomeFeed);
app.post("/api/v1/like", authenticateToken, feed.toggleLike);
app.post("/api/v1/comment", authenticateToken, feed.addComment);


// 6. Followers
app.post("/api/v1/follow", authenticateToken, feed.toggleFollow);
app.get("/api/v1/followers/:id", authenticateToken, feed.getFollowers);
app.get("/api/v1/following/:id", authenticateToken, feed.getFollowing);


// 7. Search filters usernames
app.get("/api/v1/search", authenticateToken, searchU.searchUsername);

app.use((request, response) => {
  response.sendFile(path.join(publicPath, "index.html"));
});
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

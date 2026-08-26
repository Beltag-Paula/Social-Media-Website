require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const cookieParser = require("cookie-parser"); // npm install cookie-parser

// --- CONTROLLERS ---
const authUsers = require("./controllers/authUsers.js");
const {
  authenticateToken,
  isAdmin,
} = require("./controllers/authMiddleware.js");
const dashboard = require("./controllers/dashboard.js");
const upload = require("./controllers/upload"); // Multer with subfolders
const profile = require("./controllers/profile");
const feed = require("./controllers/feed.js");
const searchU = require("./controllers/searchByUsername.js");

const app = express();
const PORT = process.env.PORT || 8000;


app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "public", "views"));

// SECURITY CHANGE: with cookie-based auth, the browser only attaches
// cookies to fetch() calls that pass credentials: "include" — and CORS
// must explicitly allow credentials, since cors() with no options here
// wouldn't send Access-Control-Allow-Credentials and the cookie would be
// silently dropped on cross-origin requests. origin: true reflects the
// request's own origin, which is required (a literal "*" is rejected by
// browsers when credentials are involved).
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// Serve uploads for images/videos
app.use("/uploads", express.static("uploads"));

// Serve static assets (css, default avatar/banner images, client-side js
// if any is added later). The HTML pages themselves are no longer static
// files here — they're rendered from /views below.
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

// --- PAGE ROUTES (render EJS views) ---
app.get("/", (req, res) => {
  res.render("index", { title: "The Board" });
});

app.get("/home", (req, res) => {
  res.render("home", { title: "Home Feed :: The Board" });
});

app.get("/profile", (req, res) => {
  res.render("profile", { title: "My Profile :: The Board" });
});

app.get("/admin", (req, res) => {
  res.render("adminDashboard", { title: "Admin Control Panel :: The Board" });
});

// --- API ROUTES ---

// 1. Auth
app.post("/api/v1/signup", authUsers.signup);
app.post("/api/v1/login", authUsers.login);
app.post("/api/v1/logout", authUsers.logout);
app.get("/api/v1/me", authenticateToken, authUsers.me);

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

// 5. Feed & Social Logic
app.get("/api/v1/feed", authenticateToken, feed.getHomeFeed);
app.get("/api/v1/posts/user/:id", authenticateToken, feed.getUserPosts);
app.post("/api/v1/posts", authenticateToken, upload.single("media"), feed.createPost);
app.post("/api/v1/like", authenticateToken, feed.toggleLike);
app.post("/api/v1/comment", authenticateToken, feed.addComment);
app.get("/api/v1/comments/:postId", authenticateToken, feed.getComments);

// 6. Followers
app.post("/api/v1/follow", authenticateToken, feed.toggleFollow);
app.get("/api/v1/followers/:id", authenticateToken, feed.getFollowers);
app.get("/api/v1/following/:id", authenticateToken, feed.getFollowing);

// 7. Search filters usernames
app.get("/api/v1/search", authenticateToken, searchU.searchUsername);

// Fallback to the login/signup view for any unmatched route
app.use((request, response) => {
  response.render("index", { title: "The Board" });
});

// BUG FIX: without this, a rejected upload (wrong file type / too large)
// crashed out to Express's default HTML error page instead of JSON,
// which broke the fetch() calls in profile.html.
app.use((err, request, response, next) => {
  if (err) {
    console.error(err.message);
    return response.status(400).json({ message: err.message || "Upload failed" });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

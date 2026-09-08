require("dotenv").config();

const http = require("http");
const crypto = require("crypto");
const express = require("express");
const path = require("path");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// --- CONTROLLERS ---
const authUsers = require("./controllers/authUsers.js");
const {
  authenticateToken,
  isAdmin,
} = require("./controllers/authMiddleware.js");
const dashboard = require("./controllers/dashboard.js");
const upload = require("./controllers/upload"); // Multer with subfolders
const { verifyUploadedFile } = require("./controllers/upload");
const profile = require("./controllers/profile");
const feed = require("./controllers/feed.js");
const searchU = require("./controllers/searchByUsername.js");
const messages = require("./controllers/messages.js");
const { attachChatServer } = require("./chat/chatHub.js");

const app = express();
const PORT = process.env.PORT || 8000;

if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "public", "views"));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
  : null;

app.use(
  cors({
    origin: allowedOrigins || true,
    credentials: true,
  }),
);

app.use((request, response, next) => {
  response.locals.nonce = crypto.randomBytes(16).toString("base64");
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        mediaSrc: ["'self'"],
        connectSrc: ["'self'", "ws:", "wss:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
  }),
);

app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));

// Serve uploads for images/videos
app.use("/uploads", express.static("uploads"));

const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));


const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many searches. Please slow down." },
});


const postLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "You're posting too fast. Try again in a bit." },
});

const interactionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Slow down a little." },
});

const messageSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "You're sending messages too fast." },
});

// --- PAGE ROUTES (render EJS views) ---
app.get("/", (req, res) => {
  res.render("index", { title: "The Board", nonce: res.locals.nonce });
});

app.get("/home", (req, res) => {
  res.render("home", { title: "Home Feed :: The Board", nonce: res.locals.nonce });
});

app.get("/profile", (req, res) => {
  res.render("profile", { title: "My Profile :: The Board", nonce: res.locals.nonce });
});

app.get("/admin", (req, res) => {
  res.render("adminDashboard", { title: "Admin Control Panel :: The Board", nonce: res.locals.nonce });
});

// --- API ROUTES ---

// 1. Auth
app.post("/api/v1/signup", authLimiter, authUsers.signup);
app.post("/api/v1/login", authLimiter, authUsers.login);
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

// 3b. Gallery (past avatars/banners, not just the current one)
app.get("/api/v1/profile/:id/gallery", authenticateToken, profile.getGallery);
app.post("/api/v1/profile/avatar/select", authenticateToken, profile.selectAvatar);
app.post("/api/v1/profile/banner/select", authenticateToken, profile.selectBanner);

// 4. File Uploads (Subfolder logic). verifyUploadedFile runs AFTER multer
// writes the file, and checks the real bytes on disk match a real
// image/video signature before the DB (or anything else) ever trusts it.
app.post(
  "/api/v1/profile/avatar",
  authenticateToken,
  upload.single("avatar"),
  verifyUploadedFile,
  profile.uploadAvatar,
);
app.post(
  "/api/v1/profile/banner",
  authenticateToken,
  upload.single("banner"),
  verifyUploadedFile,
  profile.uploadBanner,
);
app.post(
  "/api/v1/profile/video",
  authenticateToken,
  upload.single("video"),
  verifyUploadedFile,
  profile.uploadVideo,
);

// 5. Feed & Social Logic
app.get("/api/v1/feed", authenticateToken, feed.getHomeFeed);
app.get("/api/v1/posts/user/:id", authenticateToken, feed.getUserPosts);
app.post(
  "/api/v1/posts",
  authenticateToken,
  postLimiter,
  upload.single("media"),
  verifyUploadedFile,
  feed.createPost,
);
app.post("/api/v1/like", authenticateToken, interactionLimiter, feed.toggleLike);
app.post("/api/v1/comment", authenticateToken, interactionLimiter, feed.addComment);
app.get("/api/v1/comments/:postId", authenticateToken, feed.getComments);

// 6. Followers
app.post("/api/v1/follow", authenticateToken, interactionLimiter, feed.toggleFollow);
app.get("/api/v1/followers/:id", authenticateToken, feed.getFollowers);
app.get("/api/v1/following/:id", authenticateToken, feed.getFollowing);

// 7. Search filters usernames
app.get("/api/v1/search", authenticateToken, searchLimiter, searchU.searchUsername);

// 8. Private messages (DMs). The WebSocket endpoint at /ws/chat (wired up
// below, once we have a raw http.Server) handles real-time delivery and
// has its own independent rate limiting (see chat/chatHub.js); these REST
// routes cover chat history and the "who have I talked to" inbox, and
// double as a working fallback if a client's WebSocket connection drops
// — messageSendLimiter keeps that fallback from becoming an unthrottled
// way to flood messages.
app.get("/api/v1/messages", authenticateToken, messages.getConversations);
// MUST come before /api/v1/messages/:userId — otherwise Express would
// match "suggestions" as a :userId value and this route would never fire.
app.get("/api/v1/messages/suggestions", authenticateToken, messages.getSuggestions);
app.get("/api/v1/messages/:userId", authenticateToken, messages.getThread);
app.post("/api/v1/messages", authenticateToken, messageSendLimiter, messages.sendMessage);

// 9. Admin: security audit log (failed logins, lockouts, admin actions)
app.get("/api/v1/admin/audit-log", authenticateToken, isAdmin, dashboard.getAuditLog);

// Fallback to the login/signup view for any unmatched route
app.use((request, response) => {
  response.render("index", { title: "The Board", nonce: response.locals.nonce });
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

// A raw http.Server, instead of app.listen(...) directly, is what lets the
// WebSocket chat endpoint live on the SAME port as the Express app: ws
// connections start as a normal HTTP GET with an "Upgrade" header, and
// attachChatServer listens for that upgrade on this server.
const httpServer = http.createServer(app);
const chatHub = attachChatServer(httpServer);
app.locals.chatHub = chatHub; // so REST /api/v1/messages can also push live

httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

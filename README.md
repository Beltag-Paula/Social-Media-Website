# Social Media Website, or a first attempt to do one 

---

## ⚙️ Features

* Signup/login (admin-approved accounts), profile with avatar/banner/intro video, home feed, likes, comments, follow/unfollow, username search
* **Private messaging** — real-time 1:1 DMs over WebSockets, with a REST fallback. Only the two participants in a conversation can ever read it.
* **Photo gallery** — every avatar/banner you've ever uploaded is browsable on your profile (not just the current one), and can be reused with one click.
* **Image lightbox** — click any post/gallery image to view it full-size with prev/next.
* Admin dashboard for approving/banning/deleting users.

---

## 🔒 Security

A pass was made over this app to close off the most common issues. Summary of what changed and why:

| Area | What's done |
|---|---|
| Auth | JWT in an **httpOnly, SameSite=Strict** cookie (not localStorage — unreadable by page JS, so an XSS bug elsewhere can't steal it). Signature algorithm pinned to HS256. Ban/admin status is re-checked live on every request, not just trusted from the token. |
| Passwords | Hashed with bcrypt; never logged (a prior version printed the bootstrap admin password to stdout on every boot — removed). |
| SQL | Every query is parameterized — no string-built SQL anywhere. |
| XSS | All user content (usernames, post bodies, chat messages, bios) is rendered with `textContent`/`createElement`, never `innerHTML`. |
| CSP | Strict `Content-Security-Policy` with a per-request nonce on every inline `<script>` — an injected `<script>` tag from some other bug still won't execute, because it won't have the right nonce. |
| CORS | Locked to an explicit origin allowlist (`ALLOWED_ORIGINS` in `.env`) instead of reflecting any origin. |
| File uploads | Verified by real file signature (magic bytes) after upload, not just the client-supplied (spoofable) `Content-Type`. Size capped, per-user subfolders, filenames never taken from user input. |
| Rate limiting | Login/signup and search are rate-limited per IP. |
| Headers | `helmet` sets HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options`/`frame-ancestors`, and disables `X-Powered-By`. |
| WebSocket chat | Same cookie-based auth as REST, **Origin allowlist check** against `ALLOWED_ORIGINS` (prevents cross-site WebSocket hijacking), per-connection rate limiting, message size cap, and every DB query scoped so a conversation is only ever readable by its two participants. |
| Secrets | `.env` is git-ignored and never committed; `JWT_SECRET` must be a long random value (a fresh one is generated for you — rotate it before real deployment). |
| Docker | Runs as a non-root user inside the container. |

**Before deploying this anywhere public:**
1. Change `AdminPassword` in `.env`, then remove/rotate it.
2. Set `ALLOWED_ORIGINS` in `.env` to your real domain(s) — without it, CORS and the WebSocket Origin check are permissive (fine for local dev, not for production).
3. Put this behind HTTPS (a reverse proxy like nginx/Caddy is the usual approach) — the app itself doesn't terminate TLS, so `wss://` for chat and `Secure` cookies both depend on that.

---

## 🧰 Tech Stack


---

## 📂 Project Structure
```text
├── public/
│   ├── views/
│   │   ├── index.ejs         # Login/signup
│   │   ├── home.ejs          # Home feed
│   │   ├── profile.ejs       # Profile, gallery, message button
│   │   ├── adminDashboard.ejs
│   │   └── partials/
│   │       ├── nav.ejs
│   │       ├── chatWidget.ejs # Floating DM panel (WebSocket + REST fallback)
│   │       ├── lightbox.ejs   # Full-screen image viewer
│   │       ├── dropzone.ejs
│   │       └── fx.ejs
├── chat/
│   └── chatHub.js    # WebSocket server: auth, Origin check, rate limiting, delivery
├── database/
│   └── db.js  # sqlite tables: users, follow, posts, media, content, profiles, likes, comments, messages
├── controllers/
│   ├── authMiddleware.js
│   ├── authUsers.js
│   ├── dashboard.js
│   ├── feed.js
│   ├── profile.js    # avatar/banner/video upload + gallery endpoints
│   ├── messages.js   # DM REST endpoints, shared with the WebSocket handler
│   ├── searchByUsername.js
│   ├── upload.js      # multer config + post-upload magic-byte verification
├── uploads/
├── server.js         # The server/backend
├── package.json
└── README.md
```
---

### 📝 Video, because no one wants to install random repositories from github, also HR people are lazy AF. Click to go to the yt page
[![Demo](https://img.youtube.com/vi/0bfQXygx9bE/maxresdefault.jpg)](https://youtu.be/0bfQXygx9bE)

---

### 🔗 Useful Links

* 📦 [sqlite3](https://www.npmjs.com/package/sqlite3) — Asynchronous, non-blocking SQLite3 bindings for Node.js. Note: This repository is currently unmaintained. 
* 📦 [bcrypt.js](https://www.npmjs.com/package/bcryptjs?activeTab=readme) — bcryptjs is a pure JavaScript implementation of the bcrypt password hashing algorithm, designed for use in both Node.js. It ensures password security by automatically generating unique salts and using a computationally intensive hashing process to resist brute-force attacks. 
* 📦 [JWT](https://www.npmjs.com/package/jsonwebtoken) — In JavaScript, a JWT (JSON Web Token) is used to securely send user information (like an ID or permissions) between a client and a server.  It's a string made of three parts (header, payload, signature) that is signed to prove it hasn't been tampered with. Is used for authentification and authorization.
Authentication: After a user logs in, the server creates a JWT and sends it to the client. The client then sends this token with future requests to prove who they are. 
Authorization: The token can contain data (claims) about what the user is allowed to do.
* 📦 [multer](https://www.npmjs.com/package/multer) — Multer is a Node.js middleware used primarily with Express to handle file uploads.  It processes multipart/form-data requests, which is the standard format for uploading files from an HTML form. 
When a user submits a form with a file, Multer intercepts the request, parses the file data, and makes it easily accessible in your JavaScript code (usually as req.file or req.files). It can save the uploaded files directly to your server's disk or keep them in memory. 

---

### 💿 Installation
Follow these steps to clone the project, install the required packages, and launch the server locally. Make sure you have Node.js installed on your computer.
#### 1 Clone the repository
```text
git clone https://github.com/Beltag-Paula/Social-Media-Website
```
#### 2 Enter project directory
```text
cd Social-Media-Website
```
#### 3 Install dependencies
```text
npm install
```
#### 4 Review `.env`
A working `.env` is already included for local dev (random `JWT_SECRET`, `ALLOWED_ORIGINS` set to `localhost:8000`). Change `AdminPassword` before this is reachable by anyone else, and see the **Security** section above before deploying anywhere public.
#### 5 Start the server (use one of the following)
```text
node server.js
```
OR (recommended if nodemon is installed)
```text
nodemon server.js
```

#### 6 Open in browser:
```text
http://localhost:8000/
```
---

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

_|_
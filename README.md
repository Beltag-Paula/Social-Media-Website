# Social Media Website, or a first attempt to do one 

---

## ⚙️ Features

---

## 🧰 Tech Stack


---

## 📂 Project Structure
```text
├── public/
│   ├── index.html    # This is the first page where the login/sign up forms are
│   ├── adminDashboard.html #After you login in and the user is an admin, they are first directed to this page
│   ├── profile.html # If the user has no admin privileges, they are first redirected to this page  
│   ├── home.html    # This was supposed to be the home feed page, but I let it empty because I am lazy (also it was before I knew about the template engines such as pug, ejs and handlebar)
├── database/
│   └── db.js  # This is for creating a databse in sqlite for the database that contains the tables (users, follow, posts, media, content, profiles, likes and comments)
├── controllers/
│   ├── authMiddleware.js # Authorization middleware that checks if the user that has logged in has admin privilegs or not
│   ├── authUsers.js # Authentification middleware that checks in the myDatabase.db created by the db.js if the user appears appears on the users table or not and if their password matches also with the one in the table in order to login. Also creates a new user if they use the signup form from the index.html
│   ├── dashboard.js # CRUD operations that can an admin can do with the users (approve their signup, ban+reason the ban and delete the user; *also the admin can NOT ban and delete themselves!)
│   ├── feed.js
│   ├── profile.js
│   ├── searchByUsername.js
│   ├── upload.js
├── upload/
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
#### 4 Start the server (use one of the following)
```text
node server.js
```
OR (recommended if nodemon is installed)
```text
nodemon server.js
```

#### 5 Open in browser:
```text
http://localhost:8000/
```
---
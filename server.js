import express from "express";
import session from "express-session";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import bcrypt from "bcrypt";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Получение текущего пути
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Настройка базы данных
let db;
try {
  db = await open({
    filename: "./database.db",
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT DEFAULT 'Новый пользователь',
      bio TEXT DEFAULT '',
      avatar_url TEXT DEFAULT ''
    );
    
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(post_id) REFERENCES posts(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    
    CREATE TABLE IF NOT EXISTS likes (
      user_id INTEGER NOT NULL,
      post_id INTEGER NOT NULL,
      PRIMARY KEY(user_id, post_id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(post_id) REFERENCES posts(id)
    );
    
    CREATE TABLE IF NOT EXISTS subscriptions (
      subscriber_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      PRIMARY KEY(subscriber_id, target_id),
      FOREIGN KEY(subscriber_id) REFERENCES users(id),
      FOREIGN KEY(target_id) REFERENCES users(id)
    );
  `);

  const userCount = await db.get("SELECT COUNT(*) as count FROM users");
  if (userCount.count === 0) {
    const hashedPassword = await bcrypt.hash("password123", 10);

    await db.run(
      `
      INSERT INTO users (login, password, name, bio, avatar_url)
      VALUES 
        ('seneka', ?, 'Луций Анней Сенека', 'Философ, поэт и государственный деятель', '/img/jpg/seneka_small.jpg'),
        ('averelius', ?, 'Марк Аврелий', 'Римский император и философ', '/img/jpg/averelius.jpg'),
        ('epictetus', ?, 'Эпиктет', 'Философ-стоик', '/img/jpg/epictetus.jpg')
    `,
      [hashedPassword, hashedPassword, hashedPassword]
    );

    const users = await db.all("SELECT id FROM users");

    await db.run(
      `
      INSERT INTO posts (user_id, content)
      VALUES 
        (?, 'Человек, которого застеклённые окна защищали от малейшего дуновения...'),
        (?, 'Говорят, что Гай Цезарь отличался помимо прочих немалочисленных своих пороков каким-то удивительным сладострастием в оскорблениях...'),
        (?, 'Наша жизнь — это то, во что её превращают наши мысли.'),
        (?, 'Не живи так, точно тебе предстоит ещё десять тысяч лет жизни. Уже близко час. Пока живёшь, пока есть возможность, старайся стать хорошим.'),
        (?, 'Свободен только тот, кто умеет владеть собой.'),
        (?, 'Людей расстраивают не события, а то, как они на них смотрят.')
    `,
      [
        users[0].id,
        users[0].id,
        users[1].id,
        users[1].id,
        users[2].id,
        users[2].id,
      ]
    );

    const posts = await db.all("SELECT id FROM posts");

    await db.run(
      `
      INSERT INTO comments (post_id, user_id, content)
      VALUES 
        (?, ?, 'Мудрое высказывание!'),
        (?, ?, 'Совершенно согласен'),
        (?, ?, 'Интересная мысль'),
        (?, ?, 'Благодарю за мудрость'),
        (?, ?, 'Это актуально и сегодня'),
        (?, ?, 'Хорошая цитата для размышлений')
    `,
      [
        posts[0].id,
        users[1].id,
        posts[0].id,
        users[2].id,
        posts[1].id,
        users[1].id,
        posts[2].id,
        users[0].id,
        posts[3].id,
        users[2].id,
        posts[4].id,
        users[0].id,
      ]
    );

    await db.run(
      `
      INSERT INTO likes (user_id, post_id)
      VALUES 
        (?, ?), (?, ?), (?, ?),
        (?, ?), (?, ?), (?, ?)
    `,
      [
        users[1].id,
        posts[0].id,
        users[2].id,
        posts[0].id,
        users[0].id,
        posts[1].id,
        users[2].id,
        posts[2].id,
        users[0].id,
        posts[3].id,
        users[1].id,
        posts[4].id,
      ]
    );

    await db.run(
      `
      INSERT INTO subscriptions (subscriber_id, target_id)
      VALUES 
        (?, ?), (?, ?),
        (?, ?), (?, ?),
        (?, ?), (?, ?)
    `,
      [
        users[0].id,
        users[1].id,
        users[0].id,
        users[2].id,
        users[1].id,
        users[0].id,
        users[1].id,
        users[2].id,
        users[2].id,
        users[0].id,
        users[2].id,
        users[1].id,
      ]
    );
  }
} catch (err) {
  console.error("Database initialization error:", err);
  process.exit(1);
}

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: "secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "public", "uploads");
    if (!fs.existsSync(uploadPath))
      fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

const requireAuth = (req, res, next) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Unauthorized" });
  next();
};

app.post("/api/login", async (req, res) => {
  const { login, password } = req.body;

  try {
    const user = await db.get("SELECT * FROM users WHERE login = ?", [login]);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    req.session.userId = user.id;
    res.json({ id: user.id, name: user.name, avatar_url: user.avatar_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/signup", async (req, res) => {
  const { login, password, repeat_password } = req.body;

  if (password !== repeat_password) {
    return res.status(400).json({ error: "Passwords do not match" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const { lastID } = await db.run(
      "INSERT INTO users (login, password) VALUES (?, ?)",
      [login, hashedPassword]
    );

    req.session.userId = lastID;
    res.json({ id: lastID });
  } catch (err) {
    if (err.message.includes("UNIQUE constraint")) {
      res.status(400).json({ error: "User already exists" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

app.get("/api/logout", (req, res) => {
  req.session.destroy();
  res.sendStatus(200);
});

app.get("/api/user/:id", async (req, res) => {
  try {
    const user = await db.get(
      "SELECT id, name, bio, avatar_url FROM users WHERE id = ?",
      [req.params.id]
    );
    res.json(user || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/profile", requireAuth, async (req, res) => {
  try {
    const user = await db.get(
      "SELECT id, name, bio, avatar_url FROM users WHERE id = ?",
      [req.session.userId]
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/profile", requireAuth, async (req, res) => {
  const { name, bio } = req.body;

  try {
    await db.run(
      `UPDATE users 
       SET name = COALESCE(?, name), 
           bio = COALESCE(?, bio) 
       WHERE id = ?`,
      [name, bio, req.session.userId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(
  "/api/profile/avatar",
  requireAuth,
  upload.single("avatar"),
  async (req, res) => {
    try {
      const avatarUrl = `/uploads/${req.file.filename}`;
      await db.run("UPDATE users SET avatar_url = ? WHERE id = ?", [
        avatarUrl,
        req.session.userId,
      ]);
      res.json({ avatarUrl });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get("/api/feed", requireAuth, async (req, res) => {
  const userId = req.session.userId;

  try {
    const posts = await db.all(
      `
      SELECT p.*, u.name as author_name, u.avatar_url as author_avatar,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count,
        EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND post_id = p.id) as liked
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id IN (
        SELECT target_id FROM subscriptions WHERE subscriber_id = ?
      ) OR p.user_id = ?
      ORDER BY p.created_at DESC
    `,
      [userId, userId, userId]
    );

    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/user/:id/posts", async (req, res) => {
  try {
    const posts = await db.all(
      `
      SELECT p.*, u.name as author_name, u.avatar_url as author_avatar,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count,
        EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND post_id = p.id) as liked
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `,
      [req.session.userId || 0, req.params.id]
    );

    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/posts", requireAuth, async (req, res) => {
  const { content } = req.body;

  try {
    const { lastID } = await db.run(
      "INSERT INTO posts (user_id, content) VALUES (?, ?)",
      [req.session.userId, content]
    );

    const newPost = await db.get(
      `
      SELECT p.*, u.name as author_name, u.avatar_url as author_avatar,
        0 as likes_count, 0 as comments_count, 0 as liked
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `,
      [lastID]
    );

    res.json(newPost);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/posts/:id", requireAuth, async (req, res) => {
  try {
    await db.run(
      `DELETE FROM posts 
       WHERE id = ? AND user_id = ?`,
      [req.params.id, req.session.userId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/comments", async (req, res) => {
  const { postId } = req.query;

  try {
    const comments = await db.all(
      `
      SELECT c.*, u.name as author_name, u.avatar_url as author_avatar
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE post_id = ?
      ORDER BY c.created_at ASC
    `,
      [postId]
    );

    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/comments", requireAuth, async (req, res) => {
  const { postId, content } = req.body;

  try {
    const { lastID } = await db.run(
      "INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)",
      [postId, req.session.userId, content]
    );

    res.json({ id: lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/comments/:id", requireAuth, async (req, res) => {
  try {
    await db.run(
      `DELETE FROM comments 
       WHERE id = ? AND user_id = ?`,
      [req.params.id, req.session.userId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/likes", requireAuth, async (req, res) => {
  const { postId } = req.body;

  try {
    await db.run(
      `INSERT OR IGNORE INTO likes (user_id, post_id) VALUES (?, ?)`,
      [req.session.userId, postId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/likes/:postId", requireAuth, async (req, res) => {
  try {
    await db.run(
      `DELETE FROM likes 
       WHERE user_id = ? AND post_id = ?`,
      [req.session.userId, req.params.postId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/subscriptions/check", requireAuth, async (req, res) => {
  const { targetId } = req.query;

  try {
    const subscription = await db.get(
      `SELECT 1 FROM subscriptions 
       WHERE subscriber_id = ? AND target_id = ?`,
      [req.session.userId, targetId]
    );
    res.json({ isSubscribed: !!subscription });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/subscriptions", requireAuth, async (req, res) => {
  const { targetId } = req.body;

  try {
    await db.run(
      `INSERT OR IGNORE INTO subscriptions (subscriber_id, target_id) VALUES (?, ?)`,
      [req.session.userId, targetId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/subscriptions/:targetId", requireAuth, async (req, res) => {
  try {
    await db.run(
      `DELETE FROM subscriptions 
       WHERE subscriber_id = ? AND target_id = ?`,
      [req.session.userId, req.params.targetId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/search", async (req, res) => {
  const { q, type } = req.query;
  const searchTerm = `%${q}%`;

  try {
    if (type === "users") {
      const users = await db.all(
        `SELECT id, name, avatar_url FROM users 
         WHERE name LIKE ? OR login LIKE ? 
         LIMIT 20`,
        [searchTerm, searchTerm]
      );
      res.json(users);
    } else {
      const posts = await db.all(
        `SELECT p.*, u.name as author_name, u.avatar_url as author_avatar 
         FROM posts p
         JOIN users u ON p.user_id = u.id
         WHERE p.content LIKE ?
         LIMIT 20`,
        [searchTerm]
      );
      res.json(posts);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/session", async (req, res) => {
  if (req.session.userId) {
    try {
      const user = await db.get(
        "SELECT id, name, avatar_url FROM users WHERE id = ?",
        [req.session.userId]
      );
      res.json(user);
    } catch (err) {
      res.json(null);
    }
  } else {
    res.json(null);
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login.html");
});

app.use((req, res) => {
  res.status(404).send("Not found");
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Server error");
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

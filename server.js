const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const Database = require("better-sqlite3");

// Minimal .env loader (no external dependency required).
try {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "development-only-change-me";
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 2048);

const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "retro_bbs.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar TEXT,
  bio TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  platform TEXT,
  region TEXT,
  year INTEGER,
  description TEXT,
  cover TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_title ON posts(title);
CREATE INDEX IF NOT EXISTS idx_files_post ON files(post_id);
`);

const categoryCount = db.prepare("SELECT COUNT(*) AS n FROM categories").get().n;
if (!categoryCount) {
  const insert = db.prepare("INSERT INTO categories (name, parent_id) VALUES (?, ?)");
  const seed = [
    ["CONSOLES", null], ["PORTÁTEIS", null], ["PC", null], ["ARCADE", null], ["OUTROS", null]
  ];
  const parents = {};
  for (const [name, parent] of seed) parents[name] = insert.run(name, parent).lastInsertRowid;

  const children = [
    ["Nintendo", "CONSOLES"], ["Sega", "CONSOLES"], ["Sony", "CONSOLES"], ["Microsoft", "CONSOLES"],
    ["NES", "Nintendo"], ["Super Nintendo", "Nintendo"], ["Nintendo 64", "Nintendo"], ["GameCube", "Nintendo"],
    ["Master System", "Sega"], ["Mega Drive", "Sega"], ["Sega CD", "Sega"], ["Saturn", "Sega"],
    ["PlayStation", "Sony"], ["PlayStation 2", "Sony"], ["PlayStation 3", "Sony"], ["PSP", "Sony"],
    ["Xbox", "Microsoft"], ["Game Boy", "PORTÁTEIS"], ["Game Boy Advance", "PORTÁTEIS"],
    ["Nintendo DS", "PORTÁTEIS"], ["Windows", "PC"], ["MS-DOS", "PC"]
  ];
  for (const [name, parentName] of children) {
    const parentId = parents[parentName] || db.prepare("SELECT id FROM categories WHERE name=?").get(parentName)?.id;
    parents[name] = insert.run(name, parentId || null).lastInsertRowid;
  }
}

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

function signUser(user) {
  return jwt.sign({ id: user.id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
}
function getUser(req) {
  const token = req.cookies.putzilaa_token;
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}
function auth(req, res, next) {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Faça login para continuar." });
  req.user = user;
  next();
}
function admin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Acesso restrito ao administrador." });
  next();
}
function clean(s, max=500) {
  return String(s ?? "").trim().slice(0, max);
}
function safeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      ".zip",".7z",".rar",".torrent",".pdf",".txt",".nes",".sfc",".smc",".gb",".gba",".gbc",
      ".md",".gen",".sms",".gg",".cue",".bin",".iso",".chd",".exe",".patch",".ips",".bps"
    ]);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.has(ext));
  }
});

app.get("/api/health", (_req,res)=>res.json({ ok:true, service:"putzilaa" }));

app.post("/api/auth/register", async (req,res) => {
  const username = clean(req.body.username, 40);
  const email = clean(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");
  if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) return res.status(400).json({error:"Nome de usuário inválido."});
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:"E-mail inválido."});
  if (password.length < 8) return res.status(400).json({error:"A senha deve ter pelo menos 8 caracteres."});
  try {
    const count = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
    const hash = await bcrypt.hash(password, 12);
    const info = db.prepare("INSERT INTO users(username,email,password_hash,role) VALUES(?,?,?,?)")
      .run(username,email,hash,count === 0 ? "admin" : "user");
    const user = db.prepare("SELECT id,username,email,role FROM users WHERE id=?").get(info.lastInsertRowid);
    res.cookie("putzilaa_token", signUser(user), { httpOnly:true, sameSite:"lax", secure:COOKIE_SECURE, maxAge:7*86400000 });
    res.status(201).json({user});
  } catch (e) {
    res.status(409).json({error:"Usuário ou e-mail já cadastrado."});
  }
});

app.post("/api/auth/login", async (req,res) => {
  const login = clean(req.body.login, 160);
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE username=? OR email=?").get(login, login.toLowerCase());
  if (!user || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({error:"Credenciais inválidas."});
  const publicUser = {id:user.id,username:user.username,email:user.email,role:user.role,avatar:user.avatar,bio:user.bio};
  res.cookie("putzilaa_token", signUser(publicUser), { httpOnly:true, sameSite:"lax", secure:COOKIE_SECURE, maxAge:7*86400000 });
  res.json({user:publicUser});
});

app.post("/api/auth/logout", (_req,res) => {
  res.clearCookie("putzilaa_token");
  res.json({ok:true});
});

app.get("/api/auth/me", (req,res) => {
  const user = getUser(req);
  if (!user) return res.json({user:null});
  const row = db.prepare("SELECT id,username,email,avatar,bio,role,created_at FROM users WHERE id=?").get(user.id);
  res.json({user:row || null});
});

app.put("/api/users/me", auth, (req,res) => {
  const avatar = clean(req.body.avatar, 500);
  const bio = clean(req.body.bio, 1000);
  db.prepare("UPDATE users SET avatar=?, bio=? WHERE id=?").run(avatar || null,bio || null,req.user.id);
  res.json({ok:true});
});

app.get("/api/categories", (_req,res) => {
  res.json(db.prepare("SELECT * FROM categories ORDER BY parent_id IS NOT NULL, parent_id, name").all());
});

app.get("/api/posts", (req,res) => {
  const q = clean(req.query.q, 120);
  const category = Number(req.query.category || 0);
  const manufacturer = clean(req.query.manufacturer, 80);
  const model = clean(req.query.model, 80);
  const params = [];
  const where = ["p.status='published'"];
  if (q) { where.push("(p.title LIKE ? OR p.description LIKE ? OR p.platform LIKE ?)"); params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  if (category) { where.push("(p.category_id=? OR p.category_id IN (SELECT id FROM categories WHERE parent_id=?))"); params.push(category,category); }
  if (manufacturer) { where.push("p.manufacturer LIKE ?"); params.push(`%${manufacturer}%`); }
  if (model) { where.push("p.model LIKE ?"); params.push(`%${model}%`); }
  const limit = Math.min(Math.max(Number(req.query.limit || 20),1),100);
  const sql = `
    SELECT p.*, c.name AS category, u.username,
      COALESCE(SUM(f.size_bytes),0) AS total_bytes,
      COUNT(f.id) AS file_count
    FROM posts p
    LEFT JOIN categories c ON c.id=p.category_id
    JOIN users u ON u.id=p.user_id
    LEFT JOIN files f ON f.post_id=p.id
    WHERE ${where.join(" AND ")}
    GROUP BY p.id ORDER BY p.created_at DESC LIMIT ${limit}`;
  res.json(db.prepare(sql).all(...params));
});

app.get("/api/posts/:id", (req,res) => {
  const post = db.prepare(`
    SELECT p.*, c.name AS category, u.username, u.avatar
    FROM posts p LEFT JOIN categories c ON c.id=p.category_id
    JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.status='published'
  `).get(Number(req.params.id));
  if (!post) return res.status(404).json({error:"Postagem não encontrada."});
  post.files = db.prepare("SELECT id,original_name,mime_type,size_bytes,sha256 FROM files WHERE post_id=?").all(post.id);
  res.json(post);
});

app.post("/api/posts", auth, upload.array("files", 5), (req,res) => {
  const title = clean(req.body.title, 180);
  if (!title) return res.status(400).json({error:"Título é obrigatório."});
  const categoryId = Number(req.body.category_id) || null;
  const year = req.body.year ? Number(req.body.year) : null;
  const info = db.prepare(`
    INSERT INTO posts(user_id,category_id,title,manufacturer,model,platform,region,year,description,cover)
    VALUES(?,?,?,?,?,?,?,?,?,?)
  `).run(
    req.user.id, categoryId, title, clean(req.body.manufacturer,80), clean(req.body.model,80),
    clean(req.body.platform,80), clean(req.body.region,40), year, clean(req.body.description,3000),
    clean(req.body.cover,500)
  );
  const postId = info.lastInsertRowid;
  const insertFile = db.prepare(`
    INSERT INTO files(post_id,original_name,stored_name,mime_type,size_bytes,sha256)
    VALUES(?,?,?,?,?,?)
  `);
  for (const f of (req.files || [])) {
    const hash = crypto.createHash("sha256").update(fs.readFileSync(f.path)).digest("hex");
    insertFile.run(postId, safeFileName(f.originalname), f.filename, f.mimetype, f.size, hash);
  }
  res.status(201).json({id:postId});
});

app.get("/api/files/:id", auth, (req,res) => {
  const f = db.prepare("SELECT * FROM files WHERE id=?").get(Number(req.params.id));
  if (!f) return res.status(404).json({error:"Arquivo não encontrado."});
  const full = path.join(UPLOAD_DIR, f.stored_name);
  if (!fs.existsSync(full)) return res.status(404).json({error:"Arquivo não está disponível."});
  res.download(full, f.original_name);
});

app.get("/api/users", auth, admin, (_req,res) => {
  res.json(db.prepare("SELECT id,username,email,role,created_at FROM users ORDER BY created_at DESC").all());
});

app.delete("/api/posts/:id", auth, (req,res) => {
  const id = Number(req.params.id);
  const post = db.prepare("SELECT user_id FROM posts WHERE id=?").get(id);
  if (!post) return res.status(404).json({error:"Postagem não encontrada."});
  if (post.user_id !== req.user.id && req.user.role !== "admin") return res.status(403).json({error:"Sem permissão."});
  const files = db.prepare("SELECT stored_name FROM files WHERE post_id=?").all(id);
  for (const f of files) {
    const p = path.join(UPLOAD_DIR,f.stored_name);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  db.prepare("DELETE FROM posts WHERE id=?").run(id);
  res.json({ok:true});
});

app.get("*", (_req,res) => res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT, () => console.log(`PUTZILAA em http://localhost:${PORT}`));

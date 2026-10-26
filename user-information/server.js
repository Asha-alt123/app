require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const crypto = require("crypto");
const mysql = require("mysql2/promise");
const rateLimit = require("express-rate-limit");

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
  console.error("Set ADMIN_PASSWORD (at least 8 characters) in .env. It protects the /admin page.");
  process.exit(1);
}

const poolConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "userinfo",
  waitForConnections: true,
  connectionLimit: 10,
};

// Optional: encrypted connection to RDS. Download the AWS CA bundle and point DB_SSL_CA at it.
if (process.env.DB_SSL_CA) {
  poolConfig.ssl = { ca: fs.readFileSync(process.env.DB_SSL_CA) };
}

const pool = mysql.createPool(poolConfig);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_email (email)
    )
  `);
  // For a table created by the older version: add the UNIQUE rule if it is missing.
  try {
    await pool.query("ALTER TABLE users ADD UNIQUE KEY uniq_email (email)");
  } catch (err) {
    if (err.code === "ER_DUP_KEYNAME") return; // already there
    if (err.code === "ER_DUP_ENTRY") {
      console.warn("Existing duplicate emails found, so the UNIQUE rule was not added. Remove the duplicates and restart.");
      return;
    }
    throw err;
  }
}

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// HTTP Basic auth for everything that shows stored data.
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString();
    const i = decoded.indexOf(":");
    const user = decoded.slice(0, i);
    const pass = decoded.slice(i + 1);
    if (i >= 0 && safeEqual(user, ADMIN_USER) && safeEqual(pass, ADMIN_PASSWORD)) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Admin"');
  res.status(401).send("Login required.");
}

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 submissions per IP per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions. Please try again in a few minutes." },
});

const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });

const app = express();
app.set("trust proxy", 1); // the app sits behind nginx, so use the real visitor IP
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Health check, useful for load balancers and a quick test from the browser.
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// Admin page (name and email table) lives outside /public and needs the password.
app.use("/admin", adminLimiter, requireAdmin, express.static(path.join(__dirname, "admin"), { index: "index.html" }));

app.get("/api/users", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, email, created_at FROM users ORDER BY id DESC LIMIT 200"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load entries." });
  }
});

app.post("/api/users", submitLimiter, async (req, res) => {
  const name = String((req.body && req.body.name) || "").trim();
  const email = String((req.body && req.body.email) || "").trim();

  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ field: "name", error: "Enter your full name (2 to 100 characters)." });
  }
  if (!EMAIL_RE.test(email) || email.length > 255) {
    return res.status(400).json({ field: "email", error: "Enter a valid email address, like name@example.com." });
  }

  try {
    // Parameterised query, so user input is never concatenated into SQL.
    await pool.query("INSERT INTO users (name, email) VALUES (?, ?)", [name, email]);
    res.status(201).json({ ok: true });
  } catch (err) {
    // Same reply for a repeated email, so nobody can use the form to check who is registered.
    if (err.code === "ER_DUP_ENTRY") return res.status(201).json({ ok: true });
    console.error(err);
    res.status(500).json({ error: "Could not save the entry." });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Database connection failed. Check the DB_* values in .env and the RDS security group.");
    console.error(err.message);
    process.exit(1);
  });

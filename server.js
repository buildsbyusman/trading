const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const JWT_SECRET = process.env.JWT_SECRET || "tradevault-dev-secret-change-me";

const DATA_DIR = path.join(__dirname, "data");
const USERS_PATH = path.join(DATA_DIR, "users.json");
const STORE_PATH = path.join(DATA_DIR, "store.json");

const TRADERS = ["Dr. Adnan", "Muhammad Usman", "Amna", "Alia", "Aisha"];
const ADMIN_TRADERS = new Set(["Dr. Adnan", "Muhammad Usman"]);

app.use(express.json({ limit: "12mb" }));

function safeJsonParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return safeJsonParse(raw, fallback);
  } catch (e) {
    if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) return fallback;
    throw e;
  }
}

async function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const users = await readJson(USERS_PATH, null);
  if (!Array.isArray(users)) {
    await writeJsonAtomic(USERS_PATH, []);
  }

  const store = await readJson(STORE_PATH, null);
  if (!store || typeof store !== "object") {
    await writeJsonAtomic(STORE_PATH, {
      trades: [],
      topics: [],
      dailyTargets: {},
      updatedAt: new Date().toISOString(),
    });
  }
}

async function ensureSeedAdmins() {
  const users = await readJson(USERS_PATH, []);
  const byTrader = new Map(users.map((u) => [u.traderName, u]));

  const seeds = [
    {
      traderName: "Dr. Adnan",
      email: "adnan@tradevault.local",
      password: "Admin@123",
      role: "admin",
    },
    {
      traderName: "Muhammad Usman",
      email: "usman@tradevault.local",
      password: "Admin@123",
      role: "admin",
    },
  ];

  let changed = false;

  for (const seed of seeds) {
    if (byTrader.has(seed.traderName)) continue;
    const passwordHash = await bcrypt.hash(seed.password, 10);
    users.push({
      id: crypto.randomUUID(),
      traderName: seed.traderName,
      email: seed.email.toLowerCase(),
      passwordHash,
      role: seed.role,
      createdAt: new Date().toISOString(),
    });
    changed = true;
  }

  if (changed) {
    await writeJsonAtomic(USERS_PATH, users);
  }
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, traderName: user.traderName, role: user.role },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function authMiddleware(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.auth = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function isAdmin(auth) {
  return auth && auth.role === "admin";
}

function sanitizeUser(u) {
  return { id: u.id, traderName: u.traderName, email: u.email, role: u.role };
}

function sanitizeTrade(t) {
  const {
    id,
    trader,
    pair,
    date,
    entry,
    sl,
    tp,
    lotSize,
    result,
    pl,
    notes,
    mistakes,
    rr,
    screenshot,
    createdAt,
    updatedAt,
    createdBy,
  } = t || {};
  return {
    id,
    trader,
    pair,
    date,
    entry,
    sl,
    tp,
    lotSize,
    result,
    pl,
    notes,
    mistakes,
    rr,
    screenshot,
    createdAt,
    updatedAt,
    createdBy,
  };
}

function sanitizeTopic(t) {
  const {
    id,
    trader,
    title,
    bullets,
    images,
    video,
    createdAt,
    updatedAt,
    createdBy,
  } = t || {};
  return {
    id,
    trader,
    title,
    bullets,
    images,
    video,
    createdAt,
    updatedAt,
    createdBy,
  };
}

app.post("/api/auth/signup", async (req, res) => {
  const traderName = String(req.body?.traderName || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!TRADERS.includes(traderName)) {
    return res.status(400).json({ error: "Invalid trader" });
  }
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Invalid email" });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "Password must be 6+ characters" });
  }

  const users = await readJson(USERS_PATH, []);
  if (users.some((u) => u.email === email)) {
    return res.status(409).json({ error: "Email already exists" });
  }
  if (users.some((u) => u.traderName === traderName)) {
    return res.status(409).json({ error: "Trader already registered" });
  }

  const role = ADMIN_TRADERS.has(traderName) ? "admin" : "user";
  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: crypto.randomUUID(),
    traderName,
    email,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeJsonAtomic(USERS_PATH, users);

  const token = signToken(user);
  res.json({ token, user: sanitizeUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  const users = await readJson(USERS_PATH, []);
  const user = users.find((u) => u.email === email);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken(user);
  res.json({ token, user: sanitizeUser(user) });
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  const users = await readJson(USERS_PATH, []);
  const user = users.find((u) => u.id === req.auth.sub);
  if (!user) return res.status(401).json({ error: "Unknown user" });
  res.json({ user: sanitizeUser(user) });
});

app.get("/api/meta", (req, res) => {
  res.json({ traders: TRADERS, admins: Array.from(ADMIN_TRADERS) });
});

app.get("/api/store", authMiddleware, async (req, res) => {
  const store = await readJson(STORE_PATH, {
    trades: [],
    topics: [],
    dailyTargets: {},
  });

  const trades = Array.isArray(store.trades) ? store.trades : [];
  const topics = Array.isArray(store.topics) ? store.topics : [];
  const dailyTargets =
    store.dailyTargets && typeof store.dailyTargets === "object"
      ? store.dailyTargets
      : {};

  const visibleTrades = isAdmin(req.auth)
    ? trades
    : trades.filter((t) => t && t.trader === req.auth.traderName);

  res.json({
    trades: visibleTrades.map(sanitizeTrade),
    topics: topics.map(sanitizeTopic),
    dailyTargets,
    updatedAt: store.updatedAt || null,
  });
});

app.post("/api/store/import", authMiddleware, async (req, res) => {
  if (!isAdmin(req.auth)) {
    return res.status(403).json({ error: "Only admins can import data" });
  }

  const incoming = req.body?.store || {};

  const trades = Array.isArray(incoming.trades) ? incoming.trades : [];
  const topics = Array.isArray(incoming.topics) ? incoming.topics : [];
  const dailyTargets =
    incoming.dailyTargets && typeof incoming.dailyTargets === "object"
      ? incoming.dailyTargets
      : {};

  const nextStore = {
    trades,
    topics,
    dailyTargets,
    updatedAt: new Date().toISOString(),
  };

  await writeJsonAtomic(STORE_PATH, nextStore);
  res.json({ ok: true });
});

app.post("/api/trades", authMiddleware, async (req, res) => {
  const incoming = req.body?.trade || {};
  const trader = String(incoming.trader || "").trim();
  if (!TRADERS.includes(trader)) {
    return res.status(400).json({ error: "Invalid trader" });
  }

  if (!isAdmin(req.auth) && trader !== req.auth.traderName) {
    return res.status(403).json({ error: "Not allowed" });
  }

  const store = await readJson(STORE_PATH, {
    trades: [],
    topics: [],
    dailyTargets: {},
  });
  const trades = Array.isArray(store.trades) ? store.trades : [];

  const trade = {
    id: "t_" + Date.now() + "_" + crypto.randomUUID().slice(0, 8),
    ...incoming,
    trader,
    createdBy: req.auth.sub,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  trades.push(trade);

  await writeJsonAtomic(STORE_PATH, {
    ...store,
    trades,
    updatedAt: new Date().toISOString(),
  });

  res.json({ trade: sanitizeTrade(trade) });
});

app.put("/api/trades/:id", authMiddleware, async (req, res) => {
  const id = String(req.params.id || "");
  const incoming = req.body?.trade || {};

  const store = await readJson(STORE_PATH, {
    trades: [],
    topics: [],
    dailyTargets: {},
  });
  const trades = Array.isArray(store.trades) ? store.trades : [];

  const existing = trades.find((t) => t && t.id === id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  if (!isAdmin(req.auth) && existing.trader !== req.auth.traderName) {
    return res.status(403).json({ error: "Not allowed" });
  }

  const nextTrader = String(incoming.trader || existing.trader || "").trim();
  if (!TRADERS.includes(nextTrader)) {
    return res.status(400).json({ error: "Invalid trader" });
  }
  if (!isAdmin(req.auth) && nextTrader !== req.auth.traderName) {
    return res.status(403).json({ error: "Not allowed" });
  }

  const updated = {
    ...existing,
    ...incoming,
    trader: nextTrader,
    updatedAt: new Date().toISOString(),
  };

  const nextTrades = trades.map((t) => (t.id === id ? updated : t));

  await writeJsonAtomic(STORE_PATH, {
    ...store,
    trades: nextTrades,
    updatedAt: new Date().toISOString(),
  });

  res.json({ trade: sanitizeTrade(updated) });
});

app.delete("/api/trades/:id", authMiddleware, async (req, res) => {
  const id = String(req.params.id || "");

  const store = await readJson(STORE_PATH, {
    trades: [],
    topics: [],
    dailyTargets: {},
  });
  const trades = Array.isArray(store.trades) ? store.trades : [];
  const existing = trades.find((t) => t && t.id === id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  if (!isAdmin(req.auth) && existing.trader !== req.auth.traderName) {
    return res.status(403).json({ error: "Not allowed" });
  }

  const nextTrades = trades.filter((t) => t && t.id !== id);

  await writeJsonAtomic(STORE_PATH, {
    ...store,
    trades: nextTrades,
    updatedAt: new Date().toISOString(),
  });

  res.json({ ok: true });
});

app.post("/api/topics", authMiddleware, async (req, res) => {
  const incoming = req.body?.topic || {};
  const trader = String(incoming.trader || "").trim();
  if (!TRADERS.includes(trader)) {
    return res.status(400).json({ error: "Invalid trader" });
  }

  const store = await readJson(STORE_PATH, {
    trades: [],
    topics: [],
    dailyTargets: {},
  });
  const topics = Array.isArray(store.topics) ? store.topics : [];

  const topic = {
    id: "topic_" + Date.now() + "_" + crypto.randomUUID().slice(0, 8),
    ...incoming,
    trader,
    createdBy: req.auth.sub,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  topics.push(topic);

  await writeJsonAtomic(STORE_PATH, {
    ...store,
    topics,
    updatedAt: new Date().toISOString(),
  });

  res.json({ topic: sanitizeTopic(topic) });
});

app.put("/api/topics/:id", authMiddleware, async (req, res) => {
  const id = String(req.params.id || "");
  const incoming = req.body?.topic || {};

  const store = await readJson(STORE_PATH, {
    trades: [],
    topics: [],
    dailyTargets: {},
  });
  const topics = Array.isArray(store.topics) ? store.topics : [];

  const existing = topics.find((t) => t && t.id === id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const canEdit = isAdmin(req.auth) || existing.createdBy === req.auth.sub;
  if (!canEdit) return res.status(403).json({ error: "Not allowed" });

  const nextTrader = String(incoming.trader || existing.trader || "").trim();
  if (!TRADERS.includes(nextTrader)) {
    return res.status(400).json({ error: "Invalid trader" });
  }

  const updated = {
    ...existing,
    ...incoming,
    trader: nextTrader,
    updatedAt: new Date().toISOString(),
  };
  const nextTopics = topics.map((t) => (t.id === id ? updated : t));

  await writeJsonAtomic(STORE_PATH, {
    ...store,
    topics: nextTopics,
    updatedAt: new Date().toISOString(),
  });

  res.json({ topic: sanitizeTopic(updated) });
});

app.delete("/api/topics/:id", authMiddleware, async (req, res) => {
  const id = String(req.params.id || "");

  const store = await readJson(STORE_PATH, {
    trades: [],
    topics: [],
    dailyTargets: {},
  });
  const topics = Array.isArray(store.topics) ? store.topics : [];
  const existing = topics.find((t) => t && t.id === id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const canDelete = isAdmin(req.auth) || existing.createdBy === req.auth.sub;
  if (!canDelete) return res.status(403).json({ error: "Not allowed" });

  const nextTopics = topics.filter((t) => t && t.id !== id);

  await writeJsonAtomic(STORE_PATH, {
    ...store,
    topics: nextTopics,
    updatedAt: new Date().toISOString(),
  });

  res.json({ ok: true });
});

app.use(express.static(__dirname));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

ensureDataFiles()
  .then(ensureSeedAdmins)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`TradeVault running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start:", err);
    process.exit(1);
  });


// ===============================
// Simple Trading OS - TradeVault
// Muhammad Usman
// Vanilla JS + File-based backend (no DB)
// ===============================

// LocalStorage keys (only for client preferences/auth)
const STORAGE_KEYS = {
  theme: "tv_theme",
  token: "tv_token",
};

// In-memory state (loaded from server)
let trades = [];
let topics = [];
let dailyTargets = {};

// For editing trade / topic
let editingTradeId = null;
let editingTopicId = null;

// Traders list used across dropdowns
const TRADERS = [
  "Dr. Adnan",
  "Muhammad Usman",
  "Mohammad Ismail",
  "Amna",
  "Alia",
  "Aisha",
];

const ADMIN_TRADERS = new Set(["Dr. Adnan", "Muhammad Usman", "Mohammad Ismail"]);

let authToken = null;
let currentUser = null;

// ===============================
// Utility Helpers
// ===============================

function loadJsonFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJsonToStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadToken() {
  return localStorage.getItem(STORAGE_KEYS.token);
}

function saveToken(token) {
  if (!token) {
    localStorage.removeItem(STORAGE_KEYS.token);
    return;
  }
  localStorage.setItem(STORAGE_KEYS.token, token);
}

// Format number as currency
function formatCurrency(value) {
  const num = Number(value) || 0;
  return (num < 0 ? "-$" : "$") + Math.abs(num).toFixed(2);
}

// Format R:R ratio
function formatRR(value) {
  const num = Number(value) || 0;
  return num.toFixed(2);
}

// Escape HTML for safe text insertion
function escapeHTML(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ===============================
// Initial Load
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  // Apply theme preference
  const savedTheme = loadJsonFromStorage(STORAGE_KEYS.theme, "dark");
  applyTheme(savedTheme);

  // Setup UI handlers
  setupAuth();
  setupMobileMenu();
  setupNavigation();
  setupTradeForm();
  setupTopicForm();
  setupRiskCalculator();
  setupBackup();
  setupTradeFilters();
  setupTopicFilters();
  setupPerformance();

  // Start auth + load server state
  bootstrap();
});

async function bootstrap() {
  authToken = loadToken();

  if (!authToken) {
    showAuthScreen();
    return;
  }

  try {
    const me = await apiRequest("/api/auth/me");
    currentUser = me.user;
    showApp();
    applyRoleUI();
    await loadStoreFromServer();
    renderAll();
  } catch {
    saveToken(null);
    authToken = null;
    currentUser = null;
    showAuthScreen();
  }
}

async function loadStoreFromServer() {
  const store = await apiRequest("/api/store");
  trades = Array.isArray(store.trades) ? store.trades : [];
  topics = Array.isArray(store.topics) ? store.topics : [];
  dailyTargets =
    store.dailyTargets && typeof store.dailyTargets === "object"
      ? store.dailyTargets
      : {};
}

async function apiRequest(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  headers["Content-Type"] = "application/json";
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    showAuthScreen("Session expired. Please login again.");
    throw new Error(data.error || "Unauthorized");
  }
  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function showAuthScreen(message) {
  const auth = document.getElementById("auth-screen");
  const app = document.getElementById("app");
  if (app) app.style.display = "none";
  if (auth) auth.style.display = "grid";
  if (message) {
    const el = document.getElementById("login-error");
    if (el) {
      el.textContent = message;
      el.style.display = "block";
    }
  }
}

function showApp() {
  const auth = document.getElementById("auth-screen");
  const app = document.getElementById("app");
  if (auth) auth.style.display = "none";
  if (app) app.style.display = "flex";

  const badge = document.getElementById("user-badge");
  const mobileLabel = document.getElementById("mobile-user-label");
  const label = currentUser
    ? `${currentUser.traderName} (${currentUser.role})`
    : "";
  if (badge) {
    badge.textContent = label;
    badge.style.display = label ? "block" : "none";
  }
  if (mobileLabel) mobileLabel.textContent = label;
}

function applyRoleUI() {
  if (!currentUser) return;

  const isAdmin = currentUser.role === "admin";

  // Dashboard filter
  const dashFilter = document.getElementById("dashboard-trader-filter");
  if (dashFilter) {
    if (isAdmin) {
      dashFilter.disabled = false;
    } else {
      dashFilter.value = currentUser.traderName;
      dashFilter.disabled = true;
    }
  }

  // Trade form trader selector
  const tradeTrader = document.getElementById("trade-trader");
  if (tradeTrader) {
    if (isAdmin) {
      tradeTrader.disabled = false;
    } else {
      tradeTrader.value = currentUser.traderName;
      tradeTrader.disabled = true;
    }
  }

  // Trade history filter
  const tradeFilter = document.getElementById("trade-filter-trader");
  if (tradeFilter) {
    if (isAdmin) {
      tradeFilter.disabled = false;
    } else {
      tradeFilter.value = currentUser.traderName;
      tradeFilter.disabled = true;
    }
  }

  // Performance select
  const perfSelect = document.getElementById("performance-trader-select");
  if (perfSelect) {
    if (isAdmin) {
      perfSelect.disabled = false;
    } else {
      perfSelect.value = currentUser.traderName;
      perfSelect.disabled = true;
    }
  }
}

function setupMobileMenu() {
  const btn = document.getElementById("mobile-menu-btn");
  const overlay = document.getElementById("sidebar-overlay");

  function close() {
    document.body.classList.remove("sidebar-open");
  }
  function toggle() {
    document.body.classList.toggle("sidebar-open");
  }

  if (btn) btn.addEventListener("click", toggle);
  if (overlay) overlay.addEventListener("click", close);

  document.querySelectorAll(".nav-link").forEach((b) => {
    b.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 1000px)").matches) close();
    });
  });
}

function setupAuth() {
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");
  const logoutBtn = document.getElementById("logout-btn");
  const mobileLogoutBtn = document.getElementById("mobile-logout-btn");
  const showSignupBtn = document.getElementById("show-signup-btn");
  const showLoginBtn = document.getElementById("show-login-btn");

  function setError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!message) {
      el.style.display = "none";
      el.textContent = "";
      return;
    }
    el.textContent = message;
    el.style.display = "block";
  }

  async function handleAuthSuccess(payload) {
    authToken = payload.token;
    currentUser = payload.user;
    saveToken(authToken);
    showApp();
    applyRoleUI();
    await loadStoreFromServer();
    renderAll();
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setError("login-error", "");
      try {
        const email = document.getElementById("login-email").value.trim();
        const password = document.getElementById("login-password").value;
        const payload = await apiRequest("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        await handleAuthSuccess(payload);
      } catch (err) {
        setError("login-error", err.message || "Login failed");
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setError("signup-error", "");
      try {
        const traderName = document.getElementById("signup-trader").value;
        const email = document.getElementById("signup-email").value.trim();
        const password = document.getElementById("signup-password").value;
        const payload = await apiRequest("/api/auth/signup", {
          method: "POST",
          body: JSON.stringify({ traderName, email, password }),
        });
        await handleAuthSuccess(payload);
      } catch (err) {
        setError("signup-error", err.message || "Signup failed");
      }
    });
  }

  function showLogin() {
    if (loginForm) loginForm.style.display = "block";
    if (signupForm) signupForm.style.display = "none";
  }

  function showSignup() {
    if (loginForm) loginForm.style.display = "none";
    if (signupForm) signupForm.style.display = "block";
  }

  if (showSignupBtn) showSignupBtn.addEventListener("click", showSignup);
  if (showLoginBtn) showLoginBtn.addEventListener("click", showLogin);

  function logout() {
    saveToken(null);
    authToken = null;
    currentUser = null;
    trades = [];
    topics = [];
    dailyTargets = {};
    showAuthScreen();
  }

  if (logoutBtn) logoutBtn.addEventListener("click", logout);
  if (mobileLogoutBtn) mobileLogoutBtn.addEventListener("click", logout);
}

// Render everything that depends on trades/topics
function renderAll() {
  renderDashboard();
  renderTradesTable();
  renderTradeDetail(null);
  renderTopicsTable();
  renderTopicDetail(null);
  renderPerformance();
}

// ===============================
// Navigation (Sidebar sections)
// ===============================

function setupNavigation() {
  const navButtons = document.querySelectorAll(".nav-link");
  const sections = document.querySelectorAll(".section");

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-section");

      navButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      sections.forEach((section) => {
        section.classList.toggle(
          "visible",
          section.id === target
        );
      });
    });
  });
}

// ===============================
// Dashboard (Totals + Recent 5)
// ===============================

function renderDashboard() {
  const filterSelect = document.getElementById("dashboard-trader-filter");
  const traderFilter = filterSelect ? filterSelect.value : "all";

  const relevantTrades =
    traderFilter === "all"
      ? trades
      : trades.filter((t) => t.trader === traderFilter);

  const totalTrades = relevantTrades.length;
  const wins = relevantTrades.filter((t) => t.result === "win").length;
  const totalPL = relevantTrades.reduce(
    (sum, t) => sum + (Number(t.pl) || 0),
    0
  );
  const avgRR =
    relevantTrades.length > 0
      ? relevantTrades.reduce(
          (sum, t) => sum + (Number(t.rr) || 0),
          0
        ) / relevantTrades.length
      : 0;

  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  document.getElementById("stat-total-trades").textContent = totalTrades;
  document.getElementById("stat-win-rate").textContent =
    winRate.toFixed(1) + "%";
  document.getElementById("stat-total-pl").textContent =
    formatCurrency(totalPL);
  document.getElementById("stat-avg-rr").textContent = formatRR(avgRR);

  // Recent 50 trades (sorted by date newest first)
  const tbody = document.getElementById("dashboard-recent-trades");
  tbody.innerHTML = "";

  const sorted = [...relevantTrades].sort((a, b) => {
    const da = new Date(a.date || 0);
    const db = new Date(b.date || 0);
    return db - da;
  });

  sorted.slice(0, 50).forEach((trade) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHTML(trade.date || "")}</td>
      <td>${escapeHTML(trade.trader || "")}</td>
      <td>${escapeHTML(trade.pair)}</td>
      <td>
        <span class="badge ${trade.result === "win" ? "win" : "loss"}">
          ${trade.result === "win" ? "Win" : "Loss"}
        </span>
      </td>
      <td>${formatCurrency(trade.pl)}</td>
      <td>${formatRR(trade.rr)}</td>
    `;
    tbody.appendChild(tr);
  });

  if (sorted.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" style="text-align:center;color:#858cb0;font-size:12px;">No trades yet.</td>`;
    tbody.appendChild(tr);
  }
}

// ===============================
// Trade Journal - Add/Edit/Delete
// ===============================

function setupTradeForm() {
  const form = document.getElementById("trade-form");
  const cancelBtn = document.getElementById("cancel-edit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!authToken || !currentUser) {
      showAuthScreen("Please login first.");
      return;
    }

    const trader = document.getElementById("trade-trader").value;
    const pair = document.getElementById("pair").value.trim();
    const date = document.getElementById("date").value;
    const entry = parseFloat(document.getElementById("entry").value);
    const sl = parseFloat(document.getElementById("sl").value);
    const tp = parseFloat(document.getElementById("tp").value);
    const lotSize = parseFloat(document.getElementById("lot-size").value);
    const result = document.getElementById("result").value;
    const pl = parseFloat(document.getElementById("pl").value);
    const notes = document.getElementById("notes").value.trim();
    const mistakes = document.getElementById("mistakes").value.trim();
    const screenshotInput = document.getElementById("screenshot");

    // Calculate R:R = |TP - Entry| / |Entry - SL|
    const riskPerUnit = Math.abs(entry - sl) || 1;
    const rewardPerUnit = Math.abs(tp - entry);
    const rr = rewardPerUnit / riskPerUnit;

    // Handle screenshot (optional)
    let screenshotDataUrl = null;
    if (screenshotInput.files && screenshotInput.files[0]) {
      screenshotDataUrl = await fileToDataUrl(screenshotInput.files[0]);
    }

    const baseTrade = {
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
      screenshot: screenshotDataUrl,
    };

    try {
      if (editingTradeId) {
        const payload = await apiRequest(`/api/trades/${editingTradeId}`, {
          method: "PUT",
          body: JSON.stringify({ trade: baseTrade }),
        });
        trades = trades.map((t) => (t.id === editingTradeId ? payload.trade : t));
      } else {
        const payload = await apiRequest("/api/trades", {
          method: "POST",
          body: JSON.stringify({ trade: baseTrade }),
        });
        trades.push(payload.trade);
      }
    } catch (err) {
      alert(err.message || "Could not save trade.");
      return;
    }

    // Reset form + editing state
    form.reset();
    editingTradeId = null;
    document.getElementById("trade-form-title").textContent = "Add Trade";
    cancelBtn.style.display = "none";

    // Re-render
    renderDashboard();
    renderTradesTable();
    renderTradeDetail(null);
  });

  cancelBtn.addEventListener("click", () => {
    form.reset();
    editingTradeId = null;
    document.getElementById("trade-form-title").textContent = "Add Trade";
    cancelBtn.style.display = "none";
  });
}

// Read file and convert to base64 data URL
function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// Render trades in the table
function renderTradesTable() {
  const tbody = document.getElementById("trades-table-body");
  tbody.innerHTML = "";

  const filterSelect = document.getElementById("trade-filter-trader");
  const traderFilter = filterSelect ? filterSelect.value : "all";

  // Sort by date (newest first)
  let filtered = [...trades];

  if (traderFilter !== "all") {
    filtered = filtered.filter((t) => t.trader === traderFilter);
  }

  const sorted = filtered.sort((a, b) => {
    const da = new Date(a.date || 0);
    const db = new Date(b.date || 0);
    return db - da;
  });

  sorted.forEach((trade) => {
    const tr = document.createElement("tr");
    tr.dataset.id = trade.id;

    tr.innerHTML = `
      <td>${escapeHTML(trade.date || "")}</td>
      <td>${escapeHTML(trade.trader || "")}</td>
      <td>${escapeHTML(trade.pair)}</td>
      <td>
        <span class="badge ${trade.result === "win" ? "win" : "loss"}">
          ${trade.result === "win" ? "Win" : "Loss"}
        </span>
      </td>
      <td>${formatCurrency(trade.pl)}</td>
      <td>${formatRR(trade.rr)}</td>
      <td>
        <button class="btn small secondary" data-action="edit">Edit</button>
        <button class="btn small danger" data-action="delete">Delete</button>
      </td>
    `;

    // Clicking row shows detail (except when clicking the buttons)
    tr.addEventListener("click", (e) => {
      if (e.target.matches("button")) return;
      renderTradeDetail(trade.id);
    });

    // Buttons for edit / delete
    tr.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === "edit") {
          startEditTrade(trade.id);
        } else if (action === "delete") {
          deleteTrade(trade.id);
        }
      });
    });

    tbody.appendChild(tr);
  });

  if (sorted.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" style="text-align:center;color:#858cb0;font-size:12px;">No trades yet. Add your first trade on the left.</td>`;
    tbody.appendChild(tr);
  }
}

// Fill form with existing trade for editing
function startEditTrade(id) {
  const trade = trades.find((t) => t.id === id);
  if (!trade) return;

  editingTradeId = id;
  document.getElementById("trade-form-title").textContent = "Edit Trade";
  document.getElementById("cancel-edit-btn").style.display = "inline-flex";

  document.getElementById("trade-trader").value = trade.trader || "";
  document.getElementById("pair").value = trade.pair;
  document.getElementById("date").value = trade.date || "";
  document.getElementById("entry").value = trade.entry;
  document.getElementById("sl").value = trade.sl;
  document.getElementById("tp").value = trade.tp;
  document.getElementById("lot-size").value = trade.lotSize;
  document.getElementById("result").value = trade.result;
  document.getElementById("pl").value = trade.pl;
  document.getElementById("notes").value = trade.notes || "";
  document.getElementById("mistakes").value = trade.mistakes || "";
  document.getElementById("screenshot").value = "";
}

// Delete trade
async function deleteTrade(id) {
  if (!confirm("Delete this trade?")) return;
  try {
    await apiRequest(`/api/trades/${id}`, { method: "DELETE" });
    trades = trades.filter((t) => t.id !== id);
    renderDashboard();
    renderTradesTable();
    renderTradeDetail(null);
  } catch (err) {
    alert(err.message || "Could not delete trade.");
  }
}

// Show detail panel for a trade
function renderTradeDetail(id) {
  const container = document.getElementById("trade-detail");
  container.innerHTML = "";

  if (!id) {
    container.innerHTML =
      "<p>Select a trade from the table to see full notes and analysis here.</p>";
    return;
  }

  const trade = trades.find((t) => t.id === id);
  if (!trade) {
    container.innerHTML = "<p>Trade not found.</p>";
    return;
  }

  const wrapper = document.createElement("div");

  wrapper.innerHTML = `
    <div class="trade-detail-item">
      <span>Date</span><br/>
      ${escapeHTML(trade.date || "")}
    </div>
    <div class="trade-detail-item">
      <span>Pair</span><br/>
      ${escapeHTML(trade.pair)}
    </div>
    <div class="trade-detail-item">
      <span>Trader</span><br/>
      ${escapeHTML(trade.trader || "")}
    </div>
    <div class="trade-detail-item">
      <span>Entry / SL / TP</span><br/>
      ${trade.entry} / ${trade.sl} / ${trade.tp}
    </div>
    <div class="trade-detail-item">
      <span>Lot Size</span><br/>
      ${trade.lotSize}
    </div>
    <div class="trade-detail-item">
      <span>Result</span><br/>
      <span class="badge ${trade.result === "win" ? "win" : "loss"}">
        ${trade.result === "win" ? "Win" : "Loss"}
      </span>
      &nbsp;&nbsp;P/L: ${formatCurrency(trade.pl)} &nbsp;&nbsp;R:R ${formatRR(
    trade.rr
  )}
    </div>
    <div class="trade-detail-notes">
      <span>Notes</span><br/>
      ${escapeHTML(trade.notes || "No notes.")}
    </div>
    <div class="trade-detail-notes">
      <span>Mistakes</span><br/>
      ${escapeHTML(trade.mistakes || "No mistakes recorded.")}
    </div>
  `;

  if (trade.screenshot) {
    const img = document.createElement("img");
    img.src = trade.screenshot;
    img.alt = "Trade screenshot";
    img.className = "trade-detail-img";
    wrapper.appendChild(img);
  }

  container.appendChild(wrapper);
}

// ===============================
// Strategy / Topic Library
// ===============================

function setupTopicForm() {
  const form = document.getElementById("topic-form");
  const cancelBtn = document.getElementById("cancel-topic-edit-btn");
  const searchInput = document.getElementById("topic-search");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!authToken || !currentUser) {
      showAuthScreen("Please login first.");
      return;
    }

    const trader = document.getElementById("topic-trader").value;
    const title = document.getElementById("topic-title").value.trim();
    const bulletsRaw = document
      .getElementById("topic-bullets")
      .value.split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const imageInput = document.getElementById("topic-image");
    const video = document.getElementById("topic-video").value.trim();

    const images = [];
    if (imageInput.files && imageInput.files.length > 0) {
      for (const file of imageInput.files) {
        const url = await fileToDataUrl(file);
        if (url) images.push(url);
      }
    }

    const baseTopic = {
      trader,
      title,
      bullets: bulletsRaw,
      images,
      video,
      createdAt: new Date().toISOString(),
    };

    try {
      if (editingTopicId) {
        const payload = await apiRequest(`/api/topics/${editingTopicId}`, {
          method: "PUT",
          body: JSON.stringify({ topic: baseTopic }),
        });
        topics = topics.map((t) =>
          t.id === editingTopicId ? payload.topic : t
        );
      } else {
        const payload = await apiRequest("/api/topics", {
          method: "POST",
          body: JSON.stringify({ topic: baseTopic }),
        });
        topics.push(payload.topic);
      }
    } catch (err) {
      alert(err.message || "Could not save topic.");
      return;
    }

    // Reset form & editing state
    form.reset();
    editingTopicId = null;
    document.getElementById("topic-form-title").textContent = "Add Topic";
    cancelBtn.style.display = "none";

    // Re-render
    renderTopicsList();
    renderTopicDetail(null);
  });

  cancelBtn.addEventListener("click", () => {
    form.reset();
    editingTopicId = null;
    document.getElementById("topic-form-title").textContent = "Add Topic";
    cancelBtn.style.display = "none";
  });

  // Simple search
  searchInput.addEventListener("input", () => {
    renderTopicsList(searchInput.value.trim().toLowerCase());
  });
}

// Normalize legacy topic object to use images array
function normalizeTopic(topic) {
  if (!topic.images && topic.image) {
    topic.images = [topic.image];
  }
  if (!Array.isArray(topic.images)) {
    topic.images = [];
  }
  return topic;
}

// Render list of topics with optional search filter
function renderTopicsList(filterText = "") {
  const list = document.getElementById("topic-list");
  list.innerHTML = "";

  const filtered = topics.filter((topic) => {
    normalizeTopic(topic);

    if (!filterText) return true;
    const text = (topic.title || "").toLowerCase();
    return text.includes(filterText);
  });

  // Sort newest first
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  filtered.forEach((topic) => {
    const li = document.createElement("li");
    li.className = "topic-item";
    li.dataset.id = topic.id;

    li.innerHTML = `
      <p class="topic-item-title">${escapeHTML(topic.title)}</p>
      <p class="topic-item-tags">${escapeHTML(topic.trader || "")}</p>
    `;

    li.addEventListener("click", () => {
      renderTopicDetail(topic.id);
    });

    list.appendChild(li);
  });

  if (filtered.length === 0) {
    const p = document.createElement("p");
    p.style.cssText = "font-size:12px;color:#858cb0;margin:4px 0 0;";
    p.textContent = "No topics yet. Add your first strategy on the right.";
    list.appendChild(p);
  }
}

// Render topic detail panel
function renderTopicDetail(id) {
  const container = document.getElementById("topic-detail");
  container.innerHTML = "";

  if (!id) {
    container.innerHTML =
      "<p>Select a topic from the list to view full rules, image and video here.</p>";
    return;
  }

  const topic = normalizeTopic(topics.find((t) => t.id === id) || {});
  if (!topic) {
    container.innerHTML = "<p>Topic not found.</p>";
    return;
  }

  const wrapper = document.createElement("div");

  wrapper.innerHTML = `
    <h3 class="topic-detail-title">${escapeHTML(topic.title)}</h3>
    <div class="topic-detail-tags">Trader: ${escapeHTML(
      topic.trader || ""
    )}</div>
  `;

  if (topic.images && topic.images.length > 0) {
    let currentIndex = 0;

    const imgWrapper = document.createElement("div");
    const img = document.createElement("img");
    img.src = topic.images[0];
    img.alt = "Topic image";
    img.className = "topic-detail-image";
    img.addEventListener("click", () =>
      openImageCarousel(topic.images, currentIndex)
    );

    const prevBtn = document.createElement("button");
    prevBtn.className = "btn small secondary";
    prevBtn.textContent = "<";
    const nextBtn = document.createElement("button");
    nextBtn.className = "btn small secondary";
    nextBtn.textContent = ">";

    prevBtn.addEventListener("click", () => {
      if (!topic.images.length) return;
      currentIndex =
        (currentIndex - 1 + topic.images.length) % topic.images.length;
      img.src = topic.images[currentIndex];
    });
    nextBtn.addEventListener("click", () => {
      if (!topic.images.length) return;
      currentIndex = (currentIndex + 1) % topic.images.length;
      img.src = topic.images[currentIndex];
    });

    imgWrapper.appendChild(prevBtn);
    imgWrapper.appendChild(img);
    imgWrapper.appendChild(nextBtn);
    wrapper.appendChild(imgWrapper);
  }

  if (topic.bullets && topic.bullets.length > 0) {
    const ul = document.createElement("ul");
    ul.className = "topic-detail-bullets";
    topic.bullets.forEach((b) => {
      const li = document.createElement("li");
      li.textContent = b;
      ul.appendChild(li);
    });
    wrapper.appendChild(ul);
  }

  if (topic.video) {
    const div = document.createElement("div");
    div.className = "topic-detail-video";
    div.innerHTML = `Video: <a href="${escapeHTML(
      topic.video
    )}" target="_blank" rel="noopener noreferrer">${escapeHTML(
      topic.video
    )}</a>`;
    wrapper.appendChild(div);
  }

  // Edit / Delete buttons
  const actions = document.createElement("div");
  actions.className = "form-actions";
  const editBtn = document.createElement("button");
  editBtn.className = "btn secondary small";
  editBtn.textContent = "Edit Topic";
  const delBtn = document.createElement("button");
  delBtn.className = "btn danger small";
  delBtn.textContent = "Delete Topic";
  const annotateBtn = document.createElement("button");
  annotateBtn.className = "btn secondary small";
  annotateBtn.textContent = "Annotate Image";

  editBtn.addEventListener("click", () => startEditTopic(topic.id));
  delBtn.addEventListener("click", () => deleteTopic(topic.id));
  annotateBtn.addEventListener("click", () =>
    startAnnotateTopicImage(topic.id)
  );

  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  if (topic.image) {
    actions.appendChild(annotateBtn);
  }
  wrapper.appendChild(actions);

  container.appendChild(wrapper);
}

// Start editing topic
function startEditTopic(id) {
  const topic = topics.find((t) => t.id === id);
  if (!topic) return;

  editingTopicId = id;
  document.getElementById("topic-form-title").textContent = "Edit Topic";
  document.getElementById("cancel-topic-edit-btn").style.display =
    "inline-flex";

  document.getElementById("topic-title").value = topic.title;
  document.getElementById("topic-bullets").value = (topic.bullets || []).join(
    "\n"
  );
  document.getElementById("topic-image").value = "";
  document.getElementById("topic-video").value = topic.video || "";
  document.getElementById("topic-trader").value = topic.trader || "";
}

// Delete topic
async function deleteTopic(id) {
  if (!confirm("Delete this topic?")) return;
  try {
    await apiRequest(`/api/topics/${id}`, { method: "DELETE" });
    topics = topics.filter((t) => t.id !== id);
    renderTopicsList();
    renderTopicDetail(null);
  } catch (err) {
    alert(err.message || "Could not delete topic.");
  }
}

// ===============================
// Risk Calculator
// ===============================

function setupRiskCalculator() {
  const form = document.getElementById("risk-form");
  const riskAmountEl = document.getElementById("calc-risk-amount");
  const rewardAmountEl = document.getElementById("calc-reward-amount");
  const pipValueEl = document.getElementById("calc-pip-value");
  const warningEl = document.getElementById("risk-warning");
  const sl1El = document.getElementById("calc-sl-1");
  const sl2El = document.getElementById("calc-sl-2");
  const slCustomEl = document.getElementById("calc-sl-custom");
  const tpPriceEl = document.getElementById("calc-tp-price");
  const liqPriceEl = document.getElementById("calc-liquidity-price");

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const balance = parseFloat(
      document.getElementById("acc-balance").value
    );
    const lotSelect = document.getElementById("lot-size-select").value;
    const lotCustomRaw =
      document.getElementById("lot-size-custom").value;
    const side = document.getElementById("position-side").value;
    const entry = parseFloat(
      document.getElementById("calc-entry").value
    );
    const customRiskPct = parseFloat(
      document.getElementById("risk-percent").value
    );

    let lotSize =
      lotSelect === "custom"
        ? parseFloat(lotCustomRaw)
        : parseFloat(lotSelect);

    if (
      !isFinite(balance) ||
      !isFinite(entry) ||
      !isFinite(lotSize) ||
      lotSize <= 0
    ) {
      warningEl.textContent =
        "Please enter a valid balance, lot size, and entry price.";
      return;
    }

    // Pip value from lot size (0.01→$0.1, 0.10→$1, 1.00→$10)
    const pipValue = lotSize * 10; // USD per pip
    if (pipValueEl) {
      pipValueEl.textContent = `$${pipValue.toFixed(2)} / pip`;
    }

    // Helper for SL/TP based on risk %
    function levelsForRisk(riskPct) {
      if (!isFinite(riskPct) || riskPct <= 0) return null;
      const riskAmount = (balance * riskPct) / 100;
      const pips = riskAmount / pipValue; // pips to risk this amount
      const priceMove = pips / 10; // 10 pips = 1 price unit
      const slPrice =
        side === "buy" ? entry - priceMove : entry + priceMove;
      const tpPrice =
        side === "buy" ? entry + 2 * priceMove : entry - 2 * priceMove;
      return { riskAmount, slPrice, tpPrice, pips, riskPct };
    }

    const lvl1 = levelsForRisk(1);
    const lvl2 = levelsForRisk(2);
    const effectiveRiskPct =
      isFinite(customRiskPct) && customRiskPct > 0
        ? customRiskPct
        : 2;
    const lvlCustom = levelsForRisk(effectiveRiskPct);

    // Liquidity = 100% loss of balance
    const lvlLiq = levelsForRisk(100);

    function fmtPrice(p) {
      return isFinite(p) ? p.toFixed(5) : "-";
    }

    if (lvl1) {
      sl1El.textContent =
        "SL @ 1%: " +
        fmtPrice(lvl1.slPrice) +
        " (risk " +
        formatCurrency(lvl1.riskAmount) +
        ")";
    } else {
      sl1El.textContent = "SL @ 1%: -";
    }

    if (lvl2) {
      sl2El.textContent =
        "SL @ 2%: " +
        fmtPrice(lvl2.slPrice) +
        " (risk " +
        formatCurrency(lvl2.riskAmount) +
        ")";
    } else {
      sl2El.textContent = "SL @ 2%: -";
    }

    if (lvlCustom) {
      slCustomEl.textContent =
        "SL @ " +
        effectiveRiskPct.toFixed(2) +
        "%: " +
        fmtPrice(lvlCustom.slPrice) +
        " (risk " +
        formatCurrency(lvlCustom.riskAmount) +
        ")";
      tpPriceEl.textContent =
        "Take Profit (2R): " + fmtPrice(lvlCustom.tpPrice);

      riskAmountEl.textContent = formatCurrency(lvlCustom.riskAmount);
      rewardAmountEl.textContent = formatCurrency(
        lvlCustom.riskAmount * 2
      );
    } else {
      slCustomEl.textContent = "SL @ custom %: -";
      tpPriceEl.textContent = "Take Profit (2R from chosen %): -";
      riskAmountEl.textContent = "$0.00";
      rewardAmountEl.textContent = "$0.00";
    }

    if (lvlLiq) {
      liqPriceEl.textContent =
        "Liquidity (100% loss): " + fmtPrice(lvlLiq.slPrice);
    } else {
      liqPriceEl.textContent = "Liquidity (100% loss): -";
    }

    // Simple guidance message
    warningEl.classList.remove("high", "safe");
    if (effectiveRiskPct > 2) {
      warningEl.textContent =
        "Warning: you are risking " +
        effectiveRiskPct.toFixed(2) +
        "% of your account. Only 1–2% is recommended.";
      warningEl.classList.add("high");
    } else {
      warningEl.textContent =
        "You are risking " +
        effectiveRiskPct.toFixed(2) +
        "% of your account. This is within the 1–2% safe zone.";
      warningEl.classList.add("safe");
    }
  });
}

// ===============================
// Backup & Settings (Export/Import)
// ===============================

function setupBackup() {
  const exportBtn = document.getElementById("export-btn");
  const importBtn = document.getElementById("import-btn");
  const importFileInput = document.getElementById("import-file");
  const themeSelect = document.getElementById("theme-select");

  // Initialize theme select
  const savedTheme = loadJsonFromStorage(STORAGE_KEYS.theme, "dark");
  if (themeSelect) {
    themeSelect.value = savedTheme;
    themeSelect.addEventListener("change", () => {
      const theme = themeSelect.value;
      applyTheme(theme);
      saveJsonToStorage(STORAGE_KEYS.theme, theme);
    });
  }

  // Export trades + topics as JSON file
  exportBtn.addEventListener("click", () => {
    const data = {
      trades,
      topics,
      dailyTargets,
      theme: loadJsonFromStorage(STORAGE_KEYS.theme, "dark"),
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tradevault-backup.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Import JSON backup
  importBtn.addEventListener("click", () => {
    const file = importFileInput.files && importFileInput.files[0];
    if (!file) {
      alert("Please choose a JSON file to import.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (!imported || typeof imported !== "object") {
          throw new Error("Invalid file");
        }

        if (!currentUser || currentUser.role !== "admin") {
          alert("Only admins can import shared data.");
          return;
        }

        const nextStore = {
          trades: Array.isArray(imported.trades) ? imported.trades : [],
          topics: Array.isArray(imported.topics) ? imported.topics : [],
          dailyTargets:
            imported.dailyTargets && typeof imported.dailyTargets === "object"
              ? imported.dailyTargets
              : {},
        };

        await apiRequest("/api/store/import", {
          method: "POST",
          body: JSON.stringify({ store: nextStore }),
        });

        await loadStoreFromServer();

        if (imported.theme) {
          saveJsonToStorage(STORAGE_KEYS.theme, imported.theme);
          applyTheme(imported.theme);
          if (themeSelect) {
            themeSelect.value = imported.theme;
          }
        }

        renderAll();
        alert("Data imported successfully.");
      } catch (err) {
        alert("Could not import data. Make sure you selected a valid backup file.");
      }
    };
    reader.readAsText(file);
  });
}

// ===============================
// Theme handling
// ===============================

function applyTheme(theme) {
  const body = document.body;
  if (!body) return;
  if (theme === "light") {
    body.classList.add("theme-light");
  } else {
    body.classList.remove("theme-light");
  }
}

// ===============================
// Performance per trader
// ===============================

function setupPerformance() {
  const select = document.getElementById("performance-trader-select");
  const exportBtn = document.getElementById("perf-export-btn");
  if (!select) return;
  select.addEventListener("change", () => {
    renderPerformance();
  });

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const traderName = select.value;
      exportPerformanceCsv(traderName);
    });
  }
}

function renderPerformance() {
  const select = document.getElementById("performance-trader-select");
  const tbody = document.getElementById("performance-body");
  const summaryPl = document.getElementById("perf-summary-pl");
  const summaryDays = document.getElementById("perf-summary-days");
  const summaryActive = document.getElementById("perf-summary-active");

  if (!select || !tbody || !summaryPl || !summaryDays || !summaryActive) {
    return;
  }

  const traderName = select.value;

  // Group trades by date for this trader
  const byDate = {};
  const userTrades = trades.filter((t) => t.trader === traderName && t.date);

  userTrades.forEach((t) => {
    const d = t.date;
    if (!byDate[d]) {
      byDate[d] = { pl: 0, count: 0, maxRiskPct: 0 };
    }
    const priceRiskPct =
      t.entry && t.sl ? (Math.abs(t.entry - t.sl) / Math.abs(t.entry)) * 100 : 0;
    byDate[d].pl += Number(t.pl) || 0;
    byDate[d].count += 1;
    byDate[d].maxRiskPct = Math.max(byDate[d].maxRiskPct, priceRiskPct);
  });

  const dateKeys = Object.keys(byDate).sort(
    (a, b) => new Date(b) - new Date(a)
  );

  tbody.innerHTML = "";

  let totalPl = 0;
  let activeDays = 0;

  dateKeys.forEach((d) => {
    const info = byDate[d];
    totalPl += info.pl;
    activeDays += 1;

    const tr = document.createElement("tr");
    const status =
      info.pl > 0
        ? "Profitable"
        : info.pl < 0
        ? "Loss"
        : "Break-even";

    const highRisk = info.maxRiskPct > 2;

    tr.innerHTML = `
      <td>${escapeHTML(d)}</td>
      <td>${formatCurrency(info.pl)}</td>
      <td>${status}</td>
      <td>${info.count}</td>
      <td class="${highRisk ? "performance-high-risk" : ""}">${
      info.maxRiskPct ? info.maxRiskPct.toFixed(2) + "%" : "-"
    }</td>
    `;

    tbody.appendChild(tr);
  });

  if (dateKeys.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "performance-inactive-row";
    tr.innerHTML =
      '<td colspan="5" style="text-align:center;font-size:12px;">No trades yet for this trader.</td>';
    tbody.appendChild(tr);
  }

  // Summary
  summaryPl.textContent =
    "Total P/L: " + formatCurrency(totalPl) + " for " + traderName;
  summaryDays.textContent = "Active days with trades: " + activeDays;
  summaryActive.textContent =
    "Trade count: " + userTrades.length + " total trades for this trader";
}

function exportPerformanceCsv(traderName) {
  if (!traderName) return;

  const byDate = {};
  const userTrades = trades.filter((t) => t.trader === traderName && t.date);

  userTrades.forEach((t) => {
    const d = t.date;
    if (!byDate[d]) {
      byDate[d] = { pl: 0, count: 0, maxRiskPct: 0 };
    }
    const priceRiskPct =
      t.entry && t.sl ? (Math.abs(t.entry - t.sl) / Math.abs(t.entry)) * 100 : 0;
    byDate[d].pl += Number(t.pl) || 0;
    byDate[d].count += 1;
    byDate[d].maxRiskPct = Math.max(byDate[d].maxRiskPct, priceRiskPct);
  });

  const dateKeys = Object.keys(byDate).sort(
    (a, b) => new Date(a) - new Date(b)
  );

  const rows = [
    ["Date", "TotalPL", "Status", "Trades", "MaxRiskPercent"],
  ];

  dateKeys.forEach((d) => {
    const info = byDate[d];
    const status =
      info.pl > 0 ? "Profitable" : info.pl < 0 ? "Loss" : "Break-even";
    rows.push([
      d,
      info.pl.toFixed(2),
      status,
      String(info.count),
      info.maxRiskPct ? info.maxRiskPct.toFixed(2) : "0.00",
    ]);
  });

  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `performance-${traderName.replace(/\s+/g, "_")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===============================
// Trade & Topic filters
// ===============================

function setupTradeFilters() {
  const filterSelect = document.getElementById("trade-filter-trader");
  if (!filterSelect) return;
  filterSelect.addEventListener("change", () => {
    renderTradesTable();
    renderTradeDetail(null);
  });
}

function setupTopicFilters() {
  const searchInput = document.getElementById("topic-search");
  if (!searchInput) return;
  searchInput.addEventListener("input", () => {
    renderTopicsList(searchInput.value.trim().toLowerCase());
  });
}

// ===============================
// Image modal & annotation
// ===============================

function ensureImageModal() {
  let modal = document.getElementById("image-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "image-modal";
    modal.className = "image-modal";
    modal.innerHTML = `
      <div class="image-modal-backdrop"></div>
      <div class="image-modal-content">
        <button id="image-modal-prev" class="btn small secondary">&lt;</button>
        <img id="image-modal-img" alt="Image enlarged" />
        <button id="image-modal-next" class="btn small secondary">&gt;</button>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (
        e.target.classList.contains("image-modal") ||
        e.target.classList.contains("image-modal-backdrop")
      ) {
        closeImageModal();
      }
    });
  }
  return modal;
}

function openImageModal(src) {
  const modal = ensureImageModal();
  const img = document.getElementById("image-modal-img");
  if (img) {
    img.src = src;
  }
  modal.classList.add("visible");
}

function closeImageModal() {
  const modal = document.getElementById("image-modal");
  if (modal) {
    modal.classList.remove("visible");
  }
}

let currentCarousel = null;

function openImageCarousel(images, startIndex) {
  if (!images || !images.length) return;
  currentCarousel = { images, index: startIndex || 0 };
  const modal = ensureImageModal();
  const img = document.getElementById("image-modal-img");
  const prevBtn = document.getElementById("image-modal-prev");
  const nextBtn = document.getElementById("image-modal-next");

  function update() {
    if (!currentCarousel) return;
    img.src = currentCarousel.images[currentCarousel.index];
  }

  if (prevBtn && nextBtn) {
    prevBtn.onclick = () => {
      currentCarousel.index =
        (currentCarousel.index - 1 + currentCarousel.images.length) %
        currentCarousel.images.length;
      update();
    };
    nextBtn.onclick = () => {
      currentCarousel.index =
        (currentCarousel.index + 1) % currentCarousel.images.length;
      update();
    };
  }

  document.onkeydown = (e) => {
    if (!currentCarousel) return;
    if (e.key === "ArrowLeft") {
      prevBtn && prevBtn.click();
    } else if (e.key === "ArrowRight") {
      nextBtn && nextBtn.click();
    } else if (e.key === "Escape") {
      closeImageModal();
    }
  };

  modal.classList.add("visible");
  update();
}

// Simple annotation: draw on top of image and save back
function startAnnotateTopicImage(topicId) {
  const topic = topics.find((t) => t.id === topicId);
  if (!topic || !topic.image) return;

  const container = document.getElementById("topic-detail");
  if (!container) return;

  // Clear and rebuild detail with canvas editor
  container.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <h3 class="topic-detail-title">${escapeHTML(topic.title)}</h3>
    <div class="topic-detail-tags">Trader: ${escapeHTML(
      topic.trader || ""
    )}</div>
  `;

  const canvas = document.createElement("canvas");
  canvas.className = "topic-annotate-canvas";
  const img = new Image();
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
  };
  img.src = topic.image;

  wrapper.appendChild(canvas);

  const actions = document.createElement("div");
  actions.className = "form-actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn primary small";
  saveBtn.textContent = "Save Annotation";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary small";
  cancelBtn.textContent = "Cancel";

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  wrapper.appendChild(actions);

  container.appendChild(wrapper);

  // Drawing logic
  const ctx = canvas.getContext("2d");
  let drawing = false;
  let lastX = 0;
  let lastY = 0;

  function getPos(evt) {
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function startDraw(evt) {
    drawing = true;
    const pos = getPos(evt);
    lastX = pos.x;
    lastY = pos.y;
  }

  function moveDraw(evt) {
    if (!drawing) return;
    evt.preventDefault();
    const pos = getPos(evt);
    ctx.strokeStyle = "#ff4e6a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastX = pos.x;
    lastY = pos.y;
  }

  function endDraw() {
    drawing = false;
  }

  canvas.addEventListener("mousedown", startDraw);
  canvas.addEventListener("mousemove", moveDraw);
  canvas.addEventListener("mouseup", endDraw);
  canvas.addEventListener("mouseleave", endDraw);

  canvas.addEventListener("touchstart", startDraw, { passive: false });
  canvas.addEventListener("touchmove", moveDraw, { passive: false });
  canvas.addEventListener("touchend", endDraw);

  saveBtn.addEventListener("click", () => {
    const dataUrl = canvas.toDataURL("image/png");
    const topic = topics.find((t) => t.id === topicId);
    if (!topic) return;

    const nextImages = Array.isArray(topic.images) ? [...topic.images] : [];
    if (nextImages.length === 0) nextImages.push(dataUrl);
    else nextImages[0] = dataUrl;

    apiRequest(`/api/topics/${topicId}`, {
      method: "PUT",
      body: JSON.stringify({ topic: { ...topic, images: nextImages } }),
    })
      .then((payload) => {
        topics = topics.map((t) => (t.id === topicId ? payload.topic : t));
        renderTopicDetail(topicId);
      })
      .catch((err) => alert(err.message || "Could not save annotation."));
  });

  cancelBtn.addEventListener("click", () => {
    renderTopicDetail(topicId);
  });
}


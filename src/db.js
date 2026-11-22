import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { APP_CATALOG } from "./catalog.js";
import { uuid, nowIso } from "./security.js";

/**
 * Lapisan database. SQLite lewat modul bawaan Node (node:sqlite) sehingga
 * aplikasi bisa dijalankan tanpa dependensi native. Skema dibuat dengan SQL
 * portabel agar mudah dipindahkan ke PostgreSQL (lihat docs/ARCHITECTURE.md).
 */

let db = null;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS apps (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  developer     TEXT,
  website       TEXT,
  methods       TEXT NOT NULL,
  permissions   TEXT NOT NULL,
  unlink_url    TEXT,
  unlink_guide  TEXT NOT NULL,
  deletion_url  TEXT,
  deletion_guide TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('google','email','phone')),
  label      TEXT NOT NULL,
  value      TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, type, value)
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

CREATE TABLE IF NOT EXISTS links (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id     TEXT NOT NULL REFERENCES apps(id),
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  method     TEXT NOT NULL CHECK (method IN ('google','email','phone')),
  scopes     TEXT NOT NULL DEFAULT '[]',
  status     TEXT NOT NULL DEFAULT 'connected',
  linked_at  TEXT,
  note       TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, app_id, account_id, method)
);
CREATE INDEX IF NOT EXISTS idx_links_user ON links(user_id);

CREATE TABLE IF NOT EXISTS activities (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,
  title      TEXT NOT NULL,
  detail     TEXT,
  status     TEXT NOT NULL DEFAULT 'info',
  meta       TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_user ON activities(user_id);

CREATE TABLE IF NOT EXISTS settings (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme       TEXT NOT NULL DEFAULT 'light',
  review_days INTEGER NOT NULL DEFAULT 180,
  demo_seeded INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS google_connections (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  google_sub        TEXT NOT NULL,
  email             TEXT NOT NULL,
  display_name      TEXT,
  scopes            TEXT NOT NULL,
  refresh_token_enc TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state         TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_verifier TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
`;

export function openDb(dbPath) {
  if (db) return db;
  const dir = path.dirname(path.resolve(dbPath));
  fs.mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(path.resolve(dbPath));
  db.exec(SCHEMA);
  seedCatalog(db);
  return db;
}

export function getDb() {
  if (!db) throw new Error("Database belum dibuka. Panggil openDb() terlebih dahulu.");
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

function seedCatalog(database) {
  const insert = database.prepare(`
    INSERT INTO apps (id, slug, name, category, developer, website, methods, permissions,
                      unlink_url, unlink_guide, deletion_url, deletion_guide)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      developer = excluded.developer,
      website = excluded.website,
      methods = excluded.methods,
      permissions = excluded.permissions,
      unlink_url = excluded.unlink_url,
      unlink_guide = excluded.unlink_guide,
      deletion_url = excluded.deletion_url,
      deletion_guide = excluded.deletion_guide
  `);
  for (const app of APP_CATALOG) {
    insert.run(
      uuid(),
      app.slug,
      app.name,
      app.category,
      app.developer ?? null,
      app.website ?? null,
      JSON.stringify(app.methods),
      JSON.stringify(app.permissions),
      app.unlinkUrl ?? null,
      app.unlinkGuide,
      app.deletionUrl ?? null,
      app.deletionGuide
    );
  }
}

/* ---------------- Helper baca/tulis ---------------- */

export function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function publicApp(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    developer: row.developer,
    website: row.website,
    methods: parseJson(row.methods, []),
    permissions: parseJson(row.permissions, []),
    unlink: { url: row.unlink_url, guide: row.unlink_guide },
    deletion: { url: row.deletion_url, guide: row.deletion_guide },
  };
}

export function publicAccount(row) {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    value: row.value,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function publicLink(row) {
  return {
    id: row.id,
    appId: row.app_id,
    appName: row.app_name,
    appSlug: row.app_slug,
    appCategory: row.app_category,
    accountId: row.account_id,
    accountLabel: row.account_label,
    accountValue: row.account_value,
    accountType: row.account_type,
    method: row.method,
    scopes: parseJson(row.scopes, []),
    status: row.status,
    linkedAt: row.linked_at,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function publicActivity(row) {
  return {
    id: row.id,
    action: row.action,
    title: row.title,
    detail: row.detail,
    status: row.status,
    meta: parseJson(row.meta, {}),
    createdAt: row.created_at,
  };
}

export function logActivity(userId, action, title, detail, status = "info", meta = {}) {
  getDb()
    .prepare(
      `INSERT INTO activities (id, user_id, action, title, detail, status, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(uuid(), userId, action, title, detail ?? null, status, JSON.stringify(meta), nowIso());
}

export function getSettings(userId) {
  const database = getDb();
  const row = database.prepare("SELECT * FROM settings WHERE user_id = ?").get(userId);
  if (row) {
    return { theme: row.theme, reviewDays: row.review_days, demoSeeded: Boolean(row.demo_seeded) };
  }
  database
    .prepare("INSERT INTO settings (user_id, theme, review_days, demo_seeded) VALUES (?, 'light', 180, 0)")
    .run(userId);
  return { theme: "light", reviewDays: 180, demoSeeded: false };
}

export function setSettings(userId, patch) {
  const current = getSettings(userId);
  const theme = patch.theme ?? current.theme;
  const reviewDays = patch.reviewDays ?? current.reviewDays;
  const demoSeeded = patch.demoSeeded ?? current.demoSeeded;
  getDb()
    .prepare("UPDATE settings SET theme = ?, review_days = ?, demo_seeded = ? WHERE user_id = ?")
    .run(theme, reviewDays, demoSeeded ? 1 : 0, userId);
  return { theme, reviewDays, demoSeeded: Boolean(demoSeeded) };
}

/**
 * Data contoh per pengguna baru. Semua entri dilabeli sebagai contoh di UI dan
 * dapat dihapus lewat "Reset data demo".
 */
export function seedDemoWorkspace(userId) {
  const database = getDb();
  const timestamp = nowIso();
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

  const accounts = [
    { type: "google", label: "Google pribadi", value: "contoh.nadia@gmail.com", note: "Data contoh", created: daysAgo(120) },
    { type: "email", label: "Email kuliah", value: "nadia.kuliah@mail.com", note: "Data contoh", created: daysAgo(90) },
    { type: "phone", label: "Nomor utama", value: "+62 812-3456-7890", note: "Data contoh", created: daysAgo(60) },
  ];
  const accountIds = {};
  for (const acc of accounts) {
    const id = uuid();
    accountIds[acc.type] = id;
    database
      .prepare(
        `INSERT INTO accounts (id, user_id, type, label, value, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, userId, acc.type, acc.label, acc.value, acc.note, acc.created, acc.created);
  }

  const picks = [
    { slug: "instagram", method: "google", days: 210, status: "review" },
    { slug: "spotify", method: "google", days: 45, status: "connected" },
    { slug: "canva", method: "google", days: 30, status: "connected" },
    { slug: "notion", method: "email", days: 90, status: "connected" },
    { slug: "figma", method: "email", days: 25, status: "connected" },
    { slug: "tokopedia", method: "phone", days: 320, status: "review" },
    { slug: "gojek", method: "phone", days: 75, status: "connected" },
  ];
  for (const pick of picks) {
    const app = database.prepare("SELECT id, permissions FROM apps WHERE slug = ?").get(pick.slug);
    if (!app) continue;
    database
      .prepare(
        `INSERT INTO links (id, user_id, app_id, account_id, method, scopes, status, linked_at, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        uuid(),
        userId,
        app.id,
        accountIds[pick.method],
        pick.method,
        app.permissions,
        pick.status,
        daysAgo(pick.days),
        "Data contoh",
        daysAgo(pick.days),
        timestamp
      );
  }

  logActivity(userId, "workspace.seeded", "Data contoh dimuat", "3 akun dan 7 keterkaitan contoh ditambahkan.", "info");
  setSettings(userId, { demoSeeded: true });
}

export function clearWorkspace(userId) {
  const database = getDb();
  database.prepare("DELETE FROM links WHERE user_id = ?").run(userId);
  database.prepare("DELETE FROM accounts WHERE user_id = ?").run(userId);
  database.prepare("DELETE FROM activities WHERE user_id = ?").run(userId);
}

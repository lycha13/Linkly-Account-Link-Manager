import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "./config.js";
import {
  openDb,
  getDb,
  publicApp,
  publicAccount,
  publicLink,
  publicActivity,
  logActivity,
  getSettings,
  setSettings,
  seedDemoWorkspace,
  clearWorkspace,
} from "./db.js";
import {
  hashPassword,
  verifyPassword,
  randomToken,
  sha256,
  uuid,
  nowIso,
  encryptSecret,
  decryptSecret,
  loginAllowed,
  recordLoginFailure,
  clearLoginFailures,
} from "./security.js";
import {
  googleAvailable,
  startAuthorization,
  consumeState,
  exchangeCode,
  fetchUserInfo,
  revokeToken,
} from "./google.js";
import { GOOGLE_PERMISSIONS_URL } from "./catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const COOKIE_NAME = "linkly_session";
const MAX_BODY = 100 * 1024;

/* ------------------------------------------------------------------ */
/* Utilitas HTTP                                                       */
/* ------------------------------------------------------------------ */

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, "payload_too_large", "Permintaan terlalu besar."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "invalid_json", "Body harus berupa JSON yang valid."));
      }
    });
    req.on("error", reject);
  });
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

function sessionCookie(token, maxAgeSeconds) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (config.isProduction) parts.push("Secure");
  return parts.join("; ");
}

/* ------------------------------------------------------------------ */
/* Validasi                                                            */
/* ------------------------------------------------------------------ */

function text(value, field, { min = 1, max = 200, required = true } = {}) {
  if (value === undefined || value === null || value === "") {
    if (!required) return null;
    throw new HttpError(400, "validation_error", `${field} wajib diisi.`);
  }
  if (typeof value !== "string") {
    throw new HttpError(400, "validation_error", `${field} harus berupa teks.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw new HttpError(400, "validation_error", `${field} minimal ${min} karakter.`);
  }
  if (trimmed.length > max) {
    throw new HttpError(400, "validation_error", `${field} maksimal ${max} karakter.`);
  }
  return trimmed;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9][0-9\s\-().]{5,18}$/;

function accountValue(type, value) {
  const raw = text(value, "Nilai akun", { min: 3, max: 120 });
  if (type === "email" || type === "google") {
    if (!EMAIL_RE.test(raw)) {
      throw new HttpError(400, "validation_error", "Format email tidak valid.");
    }
    return raw.toLowerCase();
  }
  if (!PHONE_RE.test(raw)) {
    throw new HttpError(400, "validation_error", "Format nomor HP tidak valid (contoh: +62 812-3456-7890).");
  }
  return raw;
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new HttpError(400, "validation_error", `${field} harus salah satu dari: ${allowed.join(", ")}.`);
  }
  return value;
}

function isoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, "validation_error", "Tanggal keterkaitan tidak valid.");
  }
  return date.toISOString();
}

/* ------------------------------------------------------------------ */
/* Sesi                                                                */
/* ------------------------------------------------------------------ */

function createSession(userId, userAgent) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + config.sessionDays * 86400000).toISOString();
  getDb()
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(uuid(), userId, sha256(token), nowIso(), expires, String(userAgent || "").slice(0, 240));
  return { token, expires };
}

function resolveSession(req) {
  const auth = req.headers.authorization || "";
  let token = null;
  let via = null;
  if (auth.startsWith("Bearer ")) {
    token = auth.slice(7).trim();
    via = "bearer";
  } else {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies[COOKIE_NAME]) {
      token = cookies[COOKIE_NAME];
      via = "cookie";
    }
  }
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT s.token_hash, s.expires_at, u.id, u.name, u.email, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`
    )
    .get(sha256(token));
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(row.token_hash);
    return null;
  }
  return {
    via,
    user: { id: row.id, name: row.name, email: row.email, createdAt: row.created_at },
  };
}

/* ------------------------------------------------------------------ */
/* Query bersama                                                       */
/* ------------------------------------------------------------------ */

const LINK_SELECT = `
  SELECT l.*, a.name AS app_name, a.slug AS app_slug, a.category AS app_category,
         ac.label AS account_label, ac.value AS account_value, ac.type AS account_type
  FROM links l
  JOIN apps a ON a.id = l.app_id
  JOIN accounts ac ON ac.id = l.account_id
`;

function needsReview(link, reviewDays) {
  if (["review", "revocation_pending", "deletion_pending"].includes(link.status)) return true;
  if (link.status === "connected" && link.linkedAt) {
    const age = Date.now() - new Date(link.linkedAt).getTime();
    return age > reviewDays * 86400000;
  }
  return false;
}

function listLinks(userId, { q = "", status = "", method = "", appId = "", accountId = "" } = {}) {
  const clauses = ["l.user_id = ?"];
  const params = [userId];
  if (status) {
    clauses.push("l.status = ?");
    params.push(status);
  }
  if (method) {
    clauses.push("l.method = ?");
    params.push(method);
  }
  if (appId) {
    clauses.push("l.app_id = ?");
    params.push(appId);
  }
  if (accountId) {
    clauses.push("l.account_id = ?");
    params.push(accountId);
  }
  const rows = getDb()
    .prepare(`${LINK_SELECT} WHERE ${clauses.join(" AND ")} ORDER BY l.updated_at DESC`)
    .all(...params);
  const needle = q.toLowerCase();
  return rows
    .map(publicLink)
    .filter(
      (link) =>
        !needle ||
        [link.appName, link.appCategory, link.accountValue, link.accountLabel, link.method]
          .join(" ")
          .toLowerCase()
          .includes(needle)
    );
}

function findUserLink(userId, linkId) {
  const row = getDb()
    .prepare(`${LINK_SELECT} WHERE l.user_id = ? AND l.id = ?`)
    .get(userId, linkId);
  if (!row) throw new HttpError(404, "not_found", "Keterkaitan tidak ditemukan.");
  return row;
}

function userLinkPayload(userId, linkId) {
  const reviewDays = getSettings(userId).reviewDays;
  const link = publicLink(findUserLink(userId, linkId));
  return { ...link, needsReview: needsReview(link, reviewDays) };
}

/* ------------------------------------------------------------------ */
/* Handler API                                                         */
/* ------------------------------------------------------------------ */

const api = [];

function route(method, pattern, handler, { auth = true } = {}) {
  const keys = [];
  const source = pattern.replace(/:[a-zA-Z]+/g, (match) => {
    keys.push(match.slice(1));
    return "([^/]+)";
  });
  api.push({ method, regex: new RegExp(`^${source}/?$`), keys, handler, auth });
}

route("GET", "/api/health", async () => ({ body: { status: "ok", google: googleAvailable() } }), { auth: false });

route("POST", "/api/auth/register", async (ctx) => {
  const name = text(ctx.body.name, "Nama", { min: 2, max: 80 });
  const email = text(ctx.body.email, "Email", { max: 160 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "validation_error", "Format email tidak valid.");
  const password = text(ctx.body.password, "Password", { min: 8, max: 200 });
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new HttpError(400, "validation_error", "Password harus memuat huruf dan angka.");
  }
  const exists = getDb().prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (exists) throw new HttpError(409, "email_taken", "Email sudah terdaftar.");

  const id = uuid();
  getDb()
    .prepare("INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, name, email, hashPassword(password), nowIso());
  getSettings(id);
  seedDemoWorkspace(id);

  const { token } = createSession(id, ctx.req.headers["user-agent"]);
  return {
    status: 201,
    body: { token, user: { id, name, email } },
    headers: {
      "Set-Cookie": sessionCookie(token, config.sessionDays * 86400),
    },
  };
}, { auth: false });

route("POST", "/api/auth/login", async (ctx) => {
  const email = text(ctx.body.email, "Email", { max: 160 }).toLowerCase();
  const password = text(ctx.body.password, "Password", { min: 1, max: 200 });
  const ip = ctx.ip || "unknown";
  const key = `${ip}:${email}`;
  if (!loginAllowed(key)) {
    throw new HttpError(429, "too_many_attempts", "Terlalu banyak percobaan. Coba lagi dalam 15 menit.");
  }
  const row = getDb().prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!row || !verifyPassword(password, row.password_hash)) {
    recordLoginFailure(key);
    throw new HttpError(401, "invalid_credentials", "Email atau password salah.");
  }
  clearLoginFailures(key);
  getDb().prepare("DELETE FROM sessions WHERE expires_at < ?").run(nowIso());
  const { token } = createSession(row.id, ctx.req.headers["user-agent"]);
  return {
    body: { token, user: { id: row.id, name: row.name, email: row.email } },
    headers: { "Set-Cookie": sessionCookie(token, config.sessionDays * 86400) },
  };
}, { auth: false });

route("POST", "/api/auth/logout", async (ctx) => {
  const auth = ctx.req.headers.authorization || "";
  const token = auth.startsWith("Bearer ")
    ? auth.slice(7).trim()
    : parseCookies(ctx.req.headers.cookie)[COOKIE_NAME];
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  return {
    body: { ok: true },
    headers: { "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` },
  };
});

route("GET", "/api/auth/me", async (ctx) => ({
  body: {
    user: ctx.user,
    settings: getSettings(ctx.user.id),
    google: googleStatus(ctx.user.id),
  },
}));

route("DELETE", "/api/auth/account", async (ctx) => {
  if (ctx.body?.confirmation !== "HAPUS") {
    throw new HttpError(
      400,
      "confirmation_required",
      'Ketik "HAPUS" untuk mengonfirmasi penghapusan seluruh data Linkly.'
    );
  }
  getDb().prepare("DELETE FROM users WHERE id = ?").run(ctx.user.id);
  return {
    body: { ok: true },
    headers: { "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` },
  };
});

/* ---------------- Akun ---------------- */

route("GET", "/api/accounts", async (ctx) => {
  const type = ctx.query.get("type") || "";
  const q = (ctx.query.get("q") || "").toLowerCase();
  const rows = getDb()
    .prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC")
    .all(ctx.user.id);
  const links = listLinks(ctx.user.id);
  const accounts = rows
    .map(publicAccount)
    .filter((account) => !type || account.type === type)
    .filter(
      (account) =>
        !q || [account.label, account.value, account.note || ""].join(" ").toLowerCase().includes(q)
    )
    .map((account) => {
      const related = links.filter((link) => link.accountId === account.id);
      return {
        ...account,
        appCount: new Set(related.map((link) => link.appId)).size,
        apps: related.map((link) => ({
          id: link.id,
          appId: link.appId,
          appName: link.appName,
          status: link.status,
          method: link.method,
        })),
      };
    });
  return { body: { accounts } };
});

route("POST", "/api/accounts", async (ctx) => {
  const type = oneOf(ctx.body.type, ["google", "email", "phone"], "Jenis akun");
  const label = text(ctx.body.label, "Label", { min: 2, max: 80 });
  const value = accountValue(type, ctx.body.value);
  const note = text(ctx.body.note, "Catatan", { min: 1, max: 300, required: false });
  if (type === "phone" && /(otp|kode|password|sandi)/i.test(note || "")) {
    throw new HttpError(400, "unsafe_note", "Jangan menyimpan kode OTP atau kata sandi di catatan.");
  }
  const id = uuid();
  try {
    getDb()
      .prepare(
        `INSERT INTO accounts (id, user_id, type, label, value, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, ctx.user.id, type, label, value, note, nowIso(), nowIso());
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      throw new HttpError(409, "duplicate_account", "Akun dengan jenis dan nilai ini sudah tercatat.");
    }
    throw error;
  }
  logActivity(ctx.user.id, "account.created", "Akun ditambahkan", `${label} · ${value}`, "success");
  return { status: 201, body: { account: publicAccount(getDb().prepare("SELECT * FROM accounts WHERE id = ?").get(id)) } };
});

route("GET", "/api/accounts/:id", async (ctx) => {
  const row = getDb()
    .prepare("SELECT * FROM accounts WHERE id = ? AND user_id = ?")
    .get(ctx.params.id, ctx.user.id);
  if (!row) throw new HttpError(404, "not_found", "Akun tidak ditemukan.");
  return {
    body: {
      account: publicAccount(row),
      links: listLinks(ctx.user.id, { accountId: row.id }),
    },
  };
});

route("PATCH", "/api/accounts/:id", async (ctx) => {
  const row = getDb()
    .prepare("SELECT * FROM accounts WHERE id = ? AND user_id = ?")
    .get(ctx.params.id, ctx.user.id);
  if (!row) throw new HttpError(404, "not_found", "Akun tidak ditemukan.");
  const label = ctx.body.label === undefined ? row.label : text(ctx.body.label, "Label", { min: 2, max: 80 });
  const value = ctx.body.value === undefined ? row.value : accountValue(row.type, ctx.body.value);
  const note = ctx.body.note === undefined ? row.note : text(ctx.body.note, "Catatan", { max: 300, required: false });
  getDb()
    .prepare("UPDATE accounts SET label = ?, value = ?, note = ?, updated_at = ? WHERE id = ?")
    .run(label, value, note, nowIso(), row.id);
  logActivity(ctx.user.id, "account.updated", "Akun diperbarui", `${label} · ${value}`, "success");
  return { body: { account: publicAccount(getDb().prepare("SELECT * FROM accounts WHERE id = ?").get(row.id)) } };
});

route("DELETE", "/api/accounts/:id", async (ctx) => {
  const row = getDb()
    .prepare("SELECT * FROM accounts WHERE id = ? AND user_id = ?")
    .get(ctx.params.id, ctx.user.id);
  if (!row) throw new HttpError(404, "not_found", "Akun tidak ditemukan.");
  const removed = getDb().prepare("SELECT COUNT(*) AS n FROM links WHERE account_id = ?").get(row.id).n;
  getDb().prepare("DELETE FROM accounts WHERE id = ?").run(row.id);
  logActivity(
    ctx.user.id,
    "account.deleted",
    "Catatan akun dihapus dari Linkly",
    `${row.label} · ${row.value}. ${removed} keterkaitan ikut terhapus dari inventaris Linkly. Akun asli tidak berubah.`,
    "success",
    { removedLinks: removed }
  );
  return { body: { ok: true, removedLinks: removed } };
});

/* ---------------- Katalog & keterkaitan ---------------- */

route("GET", "/api/apps", async (ctx) => {
  const rows = getDb().prepare("SELECT * FROM apps ORDER BY name").all();
  const links = listLinks(ctx.user.id);
  const apps = rows.map((row) => {
    const app = publicApp(row);
    const own = links.filter((link) => link.appId === app.id);
    return { ...app, linkCount: own.length, linkedAccounts: own.map((link) => link.accountValue) };
  });
  return { body: { apps } };
});

route("GET", "/api/apps/:slug", async (ctx) => {
  const row = getDb().prepare("SELECT * FROM apps WHERE slug = ?").get(ctx.params.slug);
  if (!row) throw new HttpError(404, "not_found", "Aplikasi tidak ditemukan pada katalog.");
  const app = publicApp(row);
  return { body: { app, links: listLinks(ctx.user.id, { appId: app.id }) } };
});

route("GET", "/api/links", async (ctx) => {
  const reviewDays = getSettings(ctx.user.id).reviewDays;
  const links = listLinks(ctx.user.id, {
    q: ctx.query.get("q") || "",
    status: ctx.query.get("status") || "",
    method: ctx.query.get("method") || "",
  }).map((link) => ({ ...link, needsReview: needsReview(link, reviewDays) }));
  return { body: { links } };
});

route("POST", "/api/links", async (ctx) => {
  const appId = text(ctx.body.appId, "Aplikasi", { max: 60 });
  const accountId = text(ctx.body.accountId, "Akun", { max: 60 });
  const app = getDb().prepare("SELECT * FROM apps WHERE id = ?").get(appId);
  if (!app) throw new HttpError(404, "not_found", "Aplikasi tidak ada pada katalog.");
  const account = getDb()
    .prepare("SELECT * FROM accounts WHERE id = ? AND user_id = ?")
    .get(accountId, ctx.user.id);
  if (!account) throw new HttpError(404, "not_found", "Akun tidak ditemukan.");
  const methods = JSON.parse(app.methods);
  if (!methods.includes(account.type)) {
    throw new HttpError(
      400,
      "method_mismatch",
      `${app.name} tidak tercatat mendukung metode ${account.type}.`
    );
  }
  const scopes = Array.isArray(ctx.body.scopes)
    ? ctx.body.scopes.slice(0, 20).map((s) => String(s).slice(0, 120))
    : [];
  const linkedAt = isoOrNull(ctx.body.linkedAt);
  const note = text(ctx.body.note, "Catatan", { max: 300, required: false });
  const id = uuid();
  try {
    getDb()
      .prepare(
        `INSERT INTO links (id, user_id, app_id, account_id, method, scopes, status, linked_at, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'connected', ?, ?, ?, ?)`
      )
      .run(id, ctx.user.id, app.id, account.id, account.type, JSON.stringify(scopes), linkedAt, note, nowIso(), nowIso());
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      throw new HttpError(409, "duplicate_link", "Keterkaitan ini sudah tercatat.");
    }
    throw error;
  }
  logActivity(
    ctx.user.id,
    "link.created",
    "Keterkaitan dicatat",
    `${app.name} menggunakan ${account.value} (${account.type}).`,
    "success",
    { app: app.slug, accountType: account.type }
  );
  return { status: 201, body: { link: userLinkPayload(ctx.user.id, id) } };
});

route("GET", "/api/links/:id", async (ctx) => ({ body: { link: userLinkPayload(ctx.user.id, ctx.params.id) } }));

route("PATCH", "/api/links/:id", async (ctx) => {
  const row = findUserLink(ctx.user.id, ctx.params.id);
  const allowed = ["connected", "review", "revocation_pending", "revoked_verified", "revoked_attested", "deletion_pending", "deleted_attested"];
  const status = ctx.body.status === undefined ? row.status : oneOf(ctx.body.status, allowed, "Status");
  const note = ctx.body.note === undefined ? row.note : text(ctx.body.note, "Catatan", { max: 300, required: false });
  const linkedAt = ctx.body.linkedAt === undefined ? row.linked_at : isoOrNull(ctx.body.linkedAt);
  getDb()
    .prepare("UPDATE links SET status = ?, note = ?, linked_at = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .run(status, note, linkedAt, nowIso(), row.id, ctx.user.id);
  return { body: { link: userLinkPayload(ctx.user.id, row.id) } };
});

/**
 * Mulai prosedur pemutusan tautan. Linkly tidak dapat memanggil API internal
 * setiap aplikasi. Yang dilakukan:
 * - menyusun langkah resmi (URL resmi bila tersedia),
 * - mengubah status menjadi `revocation_pending` (bukan "terputus"),
 * - mencatat aktivitas.
 * Status hanya menjadi terverifikasi bila penyedia memang memberi konfirmasi
 * (misalnya endpoint pencabutan token Google) atau pengguna menyatakan sendiri
 * bahwa langkah resmi sudah dijalankan (`revoked_attested`).
 */
route("POST", "/api/links/:id/unlink", async (ctx) => {
  const row = findUserLink(ctx.user.id, ctx.params.id);
  if (["revocation_pending", "revoked_attested", "revoked_verified", "deleted_attested"].includes(row.status)) {
    throw new HttpError(409, "invalid_state", "Keterkaitan ini sudah dalam proses atau sudah diputus.");
  }
  const app = publicApp(getDb().prepare("SELECT * FROM apps WHERE id = ?").get(row.app_id));
  const instructions =
    row.method === "google"
      ? {
          title: "Cabut akses melalui Google",
          url: GOOGLE_PERMISSIONS_URL,
          guide:
            "Buka halaman izin Google, pilih aplikasi, lalu pilih \"Hapus akses\". Linkly tidak dapat melakukan langkah ini untuk Anda.",
          verification: "attested",
        }
      : {
          title: `Kelola akses di ${app.name}`,
          url: app.unlink.url,
          guide: app.unlink.guide,
          verification: app.unlink.url ? "attested" : "manual",
        };

  getDb()
    .prepare("UPDATE links SET status = 'revocation_pending', updated_at = ? WHERE id = ? AND user_id = ?")
    .run(nowIso(), row.id, ctx.user.id);
  logActivity(
    ctx.user.id,
    "link.unlink_started",
    "Proses pemutusan tautan dimulai",
    `${app.name} · ${row.account_value}. Status menunggu konfirmasi penyedia/pengguna.`,
    "pending",
    { linkId: row.id, app: app.slug, verification: instructions.verification, guideUrl: instructions.url }
  );
  return { body: { link: userLinkPayload(ctx.user.id, row.id), instructions } };
});

route("POST", "/api/links/:id/unlink/confirm", async (ctx) => {
  const row = findUserLink(ctx.user.id, ctx.params.id);
  if (row.status !== "revocation_pending") {
    throw new HttpError(409, "invalid_state", "Tidak ada proses pemutusan yang menunggu konfirmasi.");
  }
  if (ctx.body.confirmation !== true) {
    throw new HttpError(400, "confirmation_required", "Konfirmasi diperlukan untuk menandai tautan terputus.");
  }
  getDb()
    .prepare("UPDATE links SET status = 'revoked_attested', updated_at = ? WHERE id = ? AND user_id = ?")
    .run(nowIso(), row.id, ctx.user.id);
  logActivity(
    ctx.user.id,
    "link.unlink_attested",
    "Pemutusan tautan ditandai selesai oleh pengguna",
    `${row.app_name} · ${row.account_value}. Status ini berdasarkan konfirmasi Anda, bukan verifikasi otomatis Linkly.`,
    "success",
    { linkId: row.id, verified: false }
  );
  return { body: { link: userLinkPayload(ctx.user.id, row.id) } };
});

route("POST", "/api/links/:id/delete-account", async (ctx) => {
  const row = findUserLink(ctx.user.id, ctx.params.id);
  const app = publicApp(getDb().prepare("SELECT * FROM apps WHERE id = ?").get(row.app_id));
  getDb()
    .prepare("UPDATE links SET status = 'deletion_pending', updated_at = ? WHERE id = ? AND user_id = ?")
    .run(nowIso(), row.id, ctx.user.id);
  logActivity(
    ctx.user.id,
    "link.deletion_started",
    "Proses penghapusan akun aplikasi dimulai",
    `${app.name} · ${row.account_value}. Ikuti prosedur resmi penyedia.`,
    "pending",
    { linkId: row.id, app: app.slug, guideUrl: app.deletion.url }
  );
  return {
    body: {
      link: userLinkPayload(ctx.user.id, row.id),
      instructions: {
        title: `Hapus akun ${app.name}`,
        url: app.deletion.url,
        guide: app.deletion.guide,
        consequences: [
          `Akun ${app.name} tidak dapat dikembalikan setelah masa tenggang penyedia berakhir.`,
          "Data dan riwayat pada layanan tersebut dapat hilang permanen.",
          "Linkly hanya mencatat tindakan; penghapusan dilakukan oleh penyedia.",
          "Akun Google, email, dan nomor HP Anda di Linkly tidak terhapus.",
        ],
      },
    },
  };
});

route("POST", "/api/links/:id/delete-account/confirm", async (ctx) => {
  const row = findUserLink(ctx.user.id, ctx.params.id);
  if (row.status !== "deletion_pending") {
    throw new HttpError(409, "invalid_state", "Tidak ada proses penghapusan yang menunggu konfirmasi.");
  }
  if (ctx.body.confirmation !== true) {
    throw new HttpError(400, "confirmation_required", "Konfirmasi diperlukan.");
  }
  getDb()
    .prepare("UPDATE links SET status = 'deleted_attested', updated_at = ? WHERE id = ? AND user_id = ?")
    .run(nowIso(), row.id, ctx.user.id);
  logActivity(
    ctx.user.id,
    "link.deletion_attested",
    "Penghapusan akun aplikasi ditandai selesai",
    `${row.app_name} · ${row.account_value}. Berdasarkan konfirmasi pengguna.`,
    "success",
    { linkId: row.id, verified: false }
  );
  return { body: { link: userLinkPayload(ctx.user.id, row.id) } };
});

route("DELETE", "/api/links/:id", async (ctx) => {
  const row = findUserLink(ctx.user.id, ctx.params.id);
  getDb().prepare("DELETE FROM links WHERE id = ? AND user_id = ?").run(row.id, ctx.user.id);
  logActivity(
    ctx.user.id,
    "link.removed",
    "Catatan keterkaitan dihapus",
    `${row.app_name} · ${row.account_value} dihapus dari inventaris Linkly. Tidak ada perubahan pada layanan aslinya.`,
    "success",
    { app: row.app_slug }
  );
  return { body: { ok: true } };
});

/* ---------------- Dashboard, aktivitas, pengaturan ---------------- */

route("GET", "/api/dashboard", async (ctx) => {
  const database = getDb();
  const settings = getSettings(ctx.user.id);
  const accounts = database.prepare("SELECT * FROM accounts WHERE user_id = ?").all(ctx.user.id);
  const links = listLinks(ctx.user.id).map((link) => ({
    ...link,
    needsReview: needsReview(link, settings.reviewDays),
  }));
  const activities = database
    .prepare("SELECT * FROM activities WHERE user_id = ? ORDER BY created_at DESC LIMIT 6")
    .all(ctx.user.id)
    .map(publicActivity);

  return {
    body: {
      numbers: {
        accounts: accounts.length,
        apps: new Set(links.map((link) => link.appId)).size,
        activeConnections: links.filter((link) => ["connected", "review"].includes(link.status)).length,
        needsReview: links.filter((link) => link.needsReview).length,
      },
      review: links.filter((link) => link.needsReview).slice(0, 5),
      accounts: accounts.slice(0, 5).map(publicAccount),
      apps: links.filter((link) => link.status === "connected").slice(0, 5),
      activity: activities,
      demo: settings.demoSeeded,
    },
  };
});

route("GET", "/api/activity", async (ctx) => {
  const limit = Math.min(200, Math.max(1, Number(ctx.query.get("limit")) || 50));
  const rows = getDb()
    .prepare("SELECT * FROM activities WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(ctx.user.id, limit);
  return { body: { activity: rows.map(publicActivity) } };
});

route("GET", "/api/settings", async (ctx) => ({ body: { settings: getSettings(ctx.user.id) } }));

route("PATCH", "/api/settings", async (ctx) => {
  const patch = {};
  if (ctx.body.theme !== undefined) patch.theme = oneOf(ctx.body.theme, ["light", "dark"], "Tema");
  if (ctx.body.reviewDays !== undefined) {
    const days = Number(ctx.body.reviewDays);
    if (!Number.isInteger(days) || days < 7 || days > 3650) {
      throw new HttpError(400, "validation_error", "Periode tinjauan harus 7–3650 hari.");
    }
    patch.reviewDays = days;
  }
  return { body: { settings: setSettings(ctx.user.id, patch) } };
});

route("GET", "/api/export", async (ctx) => {
  const database = getDb();
  logActivity(ctx.user.id, "data.exported", "Data diekspor", "Pengguna mengunduh salinan data Linkly.", "info");
  return {
    body: {
      exportedAt: nowIso(),
      user: ctx.user,
      accounts: database.prepare("SELECT * FROM accounts WHERE user_id = ?").all(ctx.user.id).map(publicAccount),
      links: listLinks(ctx.user.id),
      activity: database
        .prepare("SELECT * FROM activities WHERE user_id = ? ORDER BY created_at DESC")
        .all(ctx.user.id)
        .map(publicActivity),
    },
    headers: { "Content-Disposition": 'attachment; filename="linkly-export.json"' },
  };
});

route("POST", "/api/demo/reset", async (ctx) => {
  clearWorkspace(ctx.user.id);
  seedDemoWorkspace(ctx.user.id);
  return { body: { ok: true } };
});

route("POST", "/api/demo/clear", async (ctx) => {
  clearWorkspace(ctx.user.id);
  setSettings(ctx.user.id, { demoSeeded: false });
  logActivity(ctx.user.id, "workspace.cleared", "Workspace dikosongkan", "Semua catatan akun dan keterkaitan dihapus dari Linkly.", "success");
  return { body: { ok: true } };
});

/* ---------------- Google ---------------- */

function googleStatus(userId) {
  const row = getDb()
    .prepare("SELECT * FROM google_connections WHERE user_id = ?")
    .get(userId);
  return {
    available: googleAvailable(),
    connected: Boolean(row),
    email: row?.email ?? null,
    name: row?.display_name ?? null,
    scopes: row ? row.scopes.split(" ") : [],
    canRevokeProgrammatically: Boolean(row?.refresh_token_enc),
    permissionsUrl: GOOGLE_PERMISSIONS_URL,
    misconfigured:
      googleAvailable() && !config.encryptionKey
        ? "ENCRYPTION_KEY belum diatur sehingga refresh token tidak disimpan."
        : null,
  };
}

route("GET", "/api/google/status", async (ctx) => ({ body: { google: googleStatus(ctx.user.id) } }));

route("GET", "/api/google/start", async (ctx) => {
  if (!googleAvailable()) {
    throw new HttpError(
      501,
      "google_not_configured",
      "Integrasi Google belum dikonfigurasi. Isi GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET."
    );
  }
  return { body: startAuthorization(ctx.user.id) };
});

route("POST", "/api/google/disconnect", async (ctx) => {
  const row = getDb()
    .prepare("SELECT * FROM google_connections WHERE user_id = ?")
    .get(ctx.user.id);
  if (!row) throw new HttpError(404, "not_found", "Tidak ada koneksi Google yang tersimpan.");
  if (ctx.body.confirmation !== true) {
    throw new HttpError(400, "confirmation_required", "Konfirmasi diperlukan sebelum memutus koneksi Google.");
  }

  let verification = "attested";
  if (row.refresh_token_enc) {
    const token = decryptSecret(row.refresh_token_enc);
    if (!token) {
      throw new HttpError(500, "decrypt_failed", "Refresh token tersimpan tidak dapat dibaca. Periksa ENCRYPTION_KEY.");
    }
    const result = await revokeToken(token);
    if (!result.ok && result.status !== 400) {
      throw new HttpError(502, "google_revoke_failed", `Google menolak permintaan pencabutan (HTTP ${result.status}).`);
    }
    verification = "google_api";
  }

  getDb().prepare("DELETE FROM google_connections WHERE user_id = ?").run(ctx.user.id);
  logActivity(
    ctx.user.id,
    "google.disconnected",
    verification === "google_api" ? "Akses Google dicabut dan dikonfirmasi Google" : "Koneksi Google dihapus dari Linkly",
    verification === "google_api"
      ? "Token Linkly dicabut melalui endpoint resmi Google dan data koneksi dihapus."
      : "Linkly menghapus data koneksi. Izin aplikasi lain dikelola melalui halaman izin Google.",
    "success",
    { verification }
  );
  return { body: { ok: true, verification, permissionsUrl: GOOGLE_PERMISSIONS_URL } };
});

/* Callback OAuth tidak memakai sesi cookie: identitas diambil dari state. */
route("GET", "/api/google/callback", async (ctx) => {
  const error = ctx.query.get("error");
  const redirectBase = config.appOrigin;
  if (error) {
    return { redirect: `${redirectBase}/#/settings?google=denied` };
  }
  const state = ctx.query.get("state");
  const code = ctx.query.get("code");
  const pendingState = state ? consumeState(state) : null;
  if (!pendingState) return { redirect: `${redirectBase}/#/settings?google=invalid_state` };
  if (!code) return { redirect: `${redirectBase}/#/settings?google=missing_code` };

  try {
    const tokens = await exchangeCode(code, pendingState.verifier);
    const profile = await fetchUserInfo(tokens.access_token);
    const email = String(profile.email || "").toLowerCase();
    if (!email) throw new Error("Google tidak mengembalikan email.");
    const scopes = String(tokens.scope || "openid email profile");
    const now = nowIso();
    const existing = getDb()
      .prepare("SELECT * FROM google_connections WHERE user_id = ?")
      .get(pendingState.userId);
    let encrypted = existing?.refresh_token_enc ?? null;
    if (tokens.refresh_token) {
      encrypted = encryptSecret(tokens.refresh_token);
    }
    if (existing) {
      getDb()
        .prepare(
          `UPDATE google_connections SET google_sub = ?, email = ?, display_name = ?, scopes = ?,
           refresh_token_enc = ?, updated_at = ? WHERE user_id = ?`
        )
        .run(profile.sub, email, profile.name ?? null, scopes, encrypted, now, pendingState.userId);
    } else {
      getDb()
        .prepare(
          `INSERT INTO google_connections (id, user_id, google_sub, email, display_name, scopes, refresh_token_enc, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(uuid(), pendingState.userId, profile.sub, email, profile.name ?? null, scopes, encrypted, now, now);
    }

    // Catat akun Google hanya jika jenisnya google dan belum ada (minimisasi data:
    // email, label, dan catatan; tanpa token).
    const account = getDb()
      .prepare("SELECT * FROM accounts WHERE user_id = ? AND type = 'google' AND value = ?")
      .get(pendingState.userId, email);
    if (!account) {
      getDb()
        .prepare(
          `INSERT OR IGNORE INTO accounts (id, user_id, type, label, value, note, created_at, updated_at)
           VALUES (?, ?, 'google', ?, ?, ?, ?, ?)`
        )
        .run(uuid(), pendingState.userId, "Akun Google", email, "Dihubungkan via Google OAuth", now, now);
    }
    logActivity(
      pendingState.userId,
      "google.connected",
      "Akun Google terhubung",
      `${email}. Izin: ${scopes}. Linkly tidak menyimpan kata sandi atau OTP.`,
      "success",
      { scopes: scopes.split(" ") }
    );
    return { redirect: `${redirectBase}/#/settings?google=connected` };
  } catch (error_) {
    logActivity(
      pendingState.userId,
      "google.connect_failed",
      "Koneksi Google gagal",
      String(error_.message).slice(0, 300),
      "error"
    );
    return { redirect: `${redirectBase}/#/settings?google=failed` };
  }
});

/* ------------------------------------------------------------------ */
/* APK Android                                                        */
/* ------------------------------------------------------------------ */

const ANDROID_VERSION = "1.0.0";
const ANDROID_PACKAGE = "app.linkly.manager";
const APK_CANDIDATES = [
  { label: "public/download/linkly.apk", file: path.join(PUBLIC_DIR, "download", "linkly.apk") },
  {
    label: "android/app/build/outputs/apk/debug/app-debug.apk",
    file: path.resolve(__dirname, "..", "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk"),
  },
  {
    label: "android/app/build/outputs/apk/release/app-release.apk",
    file: path.resolve(__dirname, "..", "android", "app", "build", "outputs", "apk", "release", "app-release.apk"),
  },
];

/** Cari APK yang benar-benar ada di disk. Tidak ada berkas = tidak ada unduhan. */
function findApk() {
  for (const candidate of APK_CANDIDATES) {
    try {
      const stats = fs.statSync(candidate.file);
      if (stats.isFile() && stats.size > 0) {
        return { ...candidate, sizeBytes: stats.size, updatedAt: stats.mtime.toISOString() };
      }
    } catch {
      /* kandidat tidak ada — periksa berikutnya */
    }
  }
  return null;
}

function sendApk(res) {
  const apk = findApk();
  if (!apk) return false;
  res.writeHead(200, {
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Length": apk.sizeBytes,
    "Content-Disposition": `attachment; filename="linkly-${ANDROID_VERSION}.apk"`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  fs.createReadStream(apk.file).pipe(res);
  return true;
}

route("GET", "/api/android", async () => {
  const apk = findApk();
  return {
    body: {
      android: {
        version: ANDROID_VERSION,
        packageName: ANDROID_PACKAGE,
        minSdk: 26,
        apiBaseUrl: "http://10.0.2.2:5178/",
        apk: apk
          ? {
              available: true,
              fileName: `linkly-${ANDROID_VERSION}.apk`,
              sizeBytes: apk.sizeBytes,
              updatedAt: apk.updatedAt,
              downloadUrl: "/download/linkly.apk",
            }
          : { available: false, downloadUrl: null },
        checkedPaths: APK_CANDIDATES.map((candidate) => candidate.label),
      },
    },
  };
});

/* ------------------------------------------------------------------ */
/* Static file                                                        */
/* ------------------------------------------------------------------ */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

function serveStatic(req, res, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(PUBLIC_DIR, relative);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, "index.html")) {
    return false;
  }
  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch {
    return false;
  }
  if (!stats.isFile()) return false;
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": stats.size,
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=300",
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

/* ------------------------------------------------------------------ */
/* Server                                                             */
/* ------------------------------------------------------------------ */

export function createServer({ dbPath } = {}) {
  openDb(dbPath || config.dbPath);

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      return sendJson(res, 400, { error: { code: "bad_request", message: "URL tidak valid." } });
    }
    const pathname = decodeURIComponent(url.pathname);

    try {
      if (pathname.startsWith("/api/")) {
        const match = api.find((entry) => entry.method === req.method && entry.regex.test(pathname));
        if (!match) {
          throw new HttpError(404, "not_found", `Endpoint ${req.method} ${pathname} tidak ditemukan.`);
        }
        const params = {};
        const values = pathname.match(match.regex).slice(1);
        match.keys.forEach((key, index) => {
          params[key] = decodeURIComponent(values[index]);
        });

        const contextual = resolveSession(req);
        if (match.auth && !contextual) {
          throw new HttpError(401, "unauthenticated", "Silakan masuk terlebih dahulu.");
        }

        // Proteksi CSRF: mutasi dengan cookie wajib berasal dari origin yang sama
        // dengan host permintaan (atau APP_ORIGIN yang dikonfigurasi).
        const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
        if (mutating && contextual?.via === "cookie") {
          const origin = req.headers.origin;
          const allowed = new Set([config.appOrigin]);
          if (req.headers.host) {
            const proto = req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http");
            allowed.add(`${proto}://${req.headers.host}`);
          }
          if (!origin || !allowed.has(origin.replace(/\/$/, ""))) {
            throw new HttpError(403, "csrf_blocked", "Origin permintaan tidak diizinkan.");
          }
        }

        const body = mutating ? await readBody(req) : {};

        const ctx = {
          req,
          res,
          params,
          query: url.searchParams,
          body,
          user: contextual?.user ?? null,
          ip: req.socket.remoteAddress,
        };
        const result = await match.handler(ctx);

        if (result?.redirect) {
          res.writeHead(302, { Location: result.redirect, "Cache-Control": "no-store" });
          return res.end();
        }
        const payload = result && typeof result === "object" && "body" in result ? result.body : result;
        return sendJson(res, result?.status || 200, payload ?? {}, result?.headers || {});
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        return sendJson(res, 405, { error: { code: "method_not_allowed", message: "Metode tidak didukung." } });
      }
      if (pathname === "/download/linkly.apk" && sendApk(res)) return;
      if (!serveStatic(req, res, pathname)) {
        // SPA fallback untuk rute hash-less.
        if (!pathname.includes(".")) {
          if (serveStatic(req, res, "/index.html")) return;
        }
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 — tidak ditemukan");
      }
    } catch (error) {
      if (error instanceof HttpError) {
        return sendJson(res, error.status, {
          error: { code: error.code, message: error.message, details: error.details ?? null },
        });
      }
      console.error(`[api] ${req.method} ${pathname} gagal:`, error);
      sendJson(res, 500, {
        error: { code: "internal_error", message: "Terjadi kesalahan pada server." },
      });
    } finally {
      if (process.env.LINKLY_LOG_REQUESTS === "1") {
        console.log(`${req.method} ${pathname} ${Date.now() - started}ms`);
      }
    }
  });

  return server;
}

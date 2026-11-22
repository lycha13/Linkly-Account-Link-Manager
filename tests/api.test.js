import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/app.js";
import { closeDb } from "../src/db.js";

/**
 * Uji integrasi REST API memakai database sementara.
 * Fokus: autentikasi, isolasi data antar pengguna, alur pemutusan tautan,
 * validasi, dan penghapusan catatan.
 */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "linkly-test-"));
const server = createServer({ dbPath: path.join(dir, "test.db") });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

let tokenA = "";
let tokenB = "";
let accountId = "";
let linkId = "";
let appId = "";
let secondAccountId = "";

async function api(pathname, { method = "GET", token, body, headers = {} } = {}) {
  const response = await fetch(base + pathname, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, headers: response.headers };
}

test("health check tersedia tanpa login", async () => {
  const res = await api("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.json.status, "ok");
});

test("registrasi membuat sesi dan data contoh", async () => {
  const res = await api("/api/auth/register", {
    method: "POST",
    body: { name: "Nadia", email: "nadia@example.com", password: "rahasia123" },
  });
  assert.equal(res.status, 201);
  tokenA = res.json.token;
  assert.ok(tokenA.length > 20);

  const me = await api("/api/auth/me", { token: tokenA });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.email, "nadia@example.com");
  assert.equal(me.json.settings.demoSeeded, true);

  const dashboard = await api("/api/dashboard", { token: tokenA });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.json.numbers.accounts, 3);
  assert.equal(dashboard.json.numbers.apps, 7);
});

test("validasi registrasi", async () => {
  const weak = await api("/api/auth/register", {
    method: "POST",
    body: { name: "A", email: "salah", password: "123" },
  });
  assert.equal(weak.status, 400);

  const duplicate = await api("/api/auth/register", {
    method: "POST",
    body: { name: "Nadia Lain", email: "NADIA@example.com", password: "rahasia123" },
  });
  assert.equal(duplicate.status, 409);
});

test("login salah ditolak, login benar diterima", async () => {
  const wrong = await api("/api/auth/login", {
    method: "POST",
    body: { email: "nadia@example.com", password: "salahsekali" },
  });
  assert.equal(wrong.status, 401);

  const ok = await api("/api/auth/login", {
    method: "POST",
    body: { email: "nadia@example.com", password: "rahasia123" },
  });
  assert.equal(ok.status, 200);
  assert.ok(ok.headers.get("set-cookie").includes("HttpOnly"));
});

test("endpoint terproteksi menolak tanpa token", async () => {
  const res = await api("/api/accounts");
  assert.equal(res.status, 401);
  assert.equal(res.json.error.code, "unauthenticated");
});

test("tambah akun, duplikat ditolak, validasi nilai", async () => {
  const invalid = await api("/api/accounts", {
    method: "POST",
    token: tokenA,
    body: { type: "email", label: "Email", value: "bukan-email" },
  });
  assert.equal(invalid.status, 400);

  const created = await api("/api/accounts", {
    method: "POST",
    token: tokenA,
    body: { type: "email", label: "Email kerja", value: "kerja@example.com" },
  });
  assert.equal(created.status, 201);
  accountId = created.json.account.id;

  const second = await api("/api/accounts", {
    method: "POST",
    token: tokenA,
    body: { type: "phone", label: "Nomor cadangan", value: "+62 811-2222-333" },
  });
  assert.equal(second.status, 201);
  secondAccountId = second.json.account.id;

  const duplicate = await api("/api/accounts", {
    method: "POST",
    token: tokenA,
    body: { type: "email", label: "Email lagi", value: "kerja@example.com" },
  });
  assert.equal(duplicate.status, 409);
});

test("pencarian akun berjalan", async () => {
  const res = await api("/api/accounts?q=kerja", { token: tokenA });
  assert.equal(res.status, 200);
  assert.ok(res.json.accounts.some((a) => a.value === "kerja@example.com"));
  assert.ok(res.json.accounts.every((a) => JSON.stringify(a).toLowerCase().includes("kerja")));
});

test("katalog aplikasi tersedia dengan panduan resmi", async () => {
  const res = await api("/api/apps", { token: tokenA });
  assert.equal(res.status, 200);
  assert.ok(res.json.apps.length >= 10);
  const googleApp = res.json.apps.find((app) => app.slug === "github");
  appId = googleApp.id;
  assert.ok(googleApp.unlink.url.startsWith("https://"));
  assert.ok(googleApp.deletion.guide.length > 10);
});

test("mencatat keterkaitan aplikasi", async () => {
  const mismatch = await api("/api/links", {
    method: "POST",
    token: tokenA,
    body: { appId, accountId: secondAccountId },
  });
  assert.equal(mismatch.status, 400);

  const created = await api("/api/links", {
    method: "POST",
    token: tokenA,
    body: {
      appId,
      accountId,
      linkedAt: "2024-01-15T00:00:00.000Z",
      scopes: ["Profil publik", "Email"],
    },
  });
  assert.equal(created.status, 201);
  linkId = created.json.link.id;
  assert.equal(created.json.link.status, "connected");
  assert.equal(created.json.link.needsReview, true);

  const duplicate = await api("/api/links", {
    method: "POST",
    token: tokenA,
    body: { appId, accountId },
  });
  assert.equal(duplicate.status, 409);
});

test("pemutusan tautan memakai status menunggu, bukan klaim terputus", async () => {
  const started = await api(`/api/links/${linkId}/unlink`, { method: "POST", token: tokenA, body: {} });
  assert.equal(started.status, 200);
  assert.equal(started.json.link.status, "revocation_pending");
  assert.equal(started.json.instructions.verification, "attested");
  assert.ok(started.json.instructions.url.startsWith("https://"));

  const wrongConfirm = await api(`/api/links/${linkId}/unlink/confirm`, {
    method: "POST",
    token: tokenA,
    body: { confirmation: false },
  });
  assert.equal(wrongConfirm.status, 400);

  const confirmed = await api(`/api/links/${linkId}/unlink/confirm`, {
    method: "POST",
    token: tokenA,
    body: { confirmation: true },
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.json.link.status, "revoked_attested");

  const again = await api(`/api/links/${linkId}/unlink`, { method: "POST", token: tokenA, body: {} });
  assert.equal(again.status, 409);
});

test("penghapusan akun aplikasi mencatat konsekuensi", async () => {
  const started = await api(`/api/links/${linkId}/delete-account`, {
    method: "POST",
    token: tokenA,
    body: {},
  });
  assert.equal(started.status, 200);
  assert.equal(started.json.link.status, "deletion_pending");
  assert.ok(started.json.instructions.consequences.length >= 3);

  const confirmed = await api(`/api/links/${linkId}/delete-account/confirm`, {
    method: "POST",
    token: tokenA,
    body: { confirmation: true },
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.json.link.status, "deleted_attested");
});

test("aktivitas tercatat untuk tindakan penting", async () => {
  const res = await api("/api/activity", { token: tokenA });
  assert.equal(res.status, 200);
  const actions = res.json.activity.map((a) => a.action);
  for (const expected of ["account.created", "link.created", "link.unlink_started", "link.deletion_started"]) {
    assert.ok(actions.includes(expected), `aktivitas ${expected} harus ada`);
  }
});

test("isolasi data antar pengguna", async () => {
  const second = await api("/api/auth/register", {
    method: "POST",
    body: { name: "Budi", email: "budi@example.com", password: "rahasia456" },
  });
  assert.equal(second.status, 201);
  tokenB = second.json.token;

  const linksB = await api("/api/links", { token: tokenB });
  assert.equal(linksB.status, 200);
  assert.ok(linksB.json.links.every((link) => link.accountValue !== "kerja@example.com"));

  const crossRead = await api(`/api/links/${linkId}`, { token: tokenB });
  assert.equal(crossRead.status, 404);

  const crossDelete = await api(`/api/accounts/${accountId}`, { method: "DELETE", token: tokenB });
  assert.equal(crossDelete.status, 404);
});

test("pengaturan tema dan periode tinjauan divalidasi", async () => {
  const bad = await api("/api/settings", {
    method: "PATCH",
    token: tokenA,
    body: { theme: "neon" },
  });
  assert.equal(bad.status, 400);

  const ok = await api("/api/settings", {
    method: "PATCH",
    token: tokenA,
    body: { theme: "dark", reviewDays: 30 },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.settings.theme, "dark");
  assert.equal(ok.json.settings.reviewDays, 30);
});

test("ekspor data tidak menyertakan password atau token", async () => {
  const res = await api("/api/export", { token: tokenA });
  assert.equal(res.status, 200);
  const dump = JSON.stringify(res.json);
  assert.ok(!dump.includes("password"));
  assert.ok(!dump.includes(tokenA));
  assert.ok(res.json.accounts.length >= 3);
});

test("hapus catatan akun tidak menyentuh akun asli dan mencatat jumlah tautan", async () => {
  const res = await api(`/api/accounts/${accountId}`, { method: "DELETE", token: tokenA });
  assert.equal(res.status, 200);
  assert.equal(res.json.removedLinks, 1);

  const list = await api("/api/accounts", { token: tokenA });
  assert.ok(!list.json.accounts.some((a) => a.id === accountId));
});

test("reset data demo mengembalikan data contoh", async () => {
  const res = await api("/api/demo/reset", { method: "POST", token: tokenA, body: {} });
  assert.equal(res.status, 200);
  const dashboard = await api("/api/dashboard", { token: tokenA });
  assert.equal(dashboard.json.numbers.accounts, 3);
  assert.equal(dashboard.json.numbers.apps, 7);
});

test("mutasi dengan cookie dari origin asing ditolak (CSRF)", async () => {
  const login = await api("/api/auth/login", {
    method: "POST",
    body: { email: "nadia@example.com", password: "rahasia123" },
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];

  const blocked = await api("/api/accounts", {
    method: "POST",
    headers: { Cookie: cookie, Origin: "https://evil.example" },
    body: { type: "email", label: "Serangan", value: "evil@example.com" },
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.json.error.code, "csrf_blocked");
});

test("logout menghapus sesi", async () => {
  const res = await api("/api/auth/logout", { method: "POST", token: tokenB, body: {} });
  assert.equal(res.status, 200);
  const me = await api("/api/auth/me", { token: tokenB });
  assert.equal(me.status, 401);
});

test("hapus akun Linkly membutuhkan konfirmasi", async () => {
  const login = await api("/api/auth/login", {
    method: "POST",
    body: { email: "budi@example.com", password: "rahasia456" },
  });
  assert.equal(login.status, 200);
  const freshToken = login.json.token;

  const res = await api("/api/auth/account", { method: "DELETE", token: freshToken, body: {} });
  assert.equal(res.status, 400);
  const ok = await api("/api/auth/account", {
    method: "DELETE",
    token: freshToken,
    body: { confirmation: "HAPUS" },
  });
  assert.equal(ok.status, 200);
});

test("cleanup", async () => {
  await new Promise((resolve) => server.close(resolve));
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

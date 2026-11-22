import { config, googleConfigured } from "./config.js";
import { pkcePair, randomToken } from "./security.js";

/**
 * Integrasi Google OAuth 2.0 + OpenID Connect (authorization code + PKCE).
 * Hanya scope minimum: openid, email, profile.
 * Dokumentasi: https://developers.google.com/identity/protocols/oauth2/web-server
 */

const SCOPES = ["openid", "email", "profile"];

// State OAuth disimpan singkat di memori proses (satu instance). Untuk
// deployment multi-instance, ganti dengan tabel `oauth_states` yang sudah
// tersedia pada skema database.
const pending = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

export function googleAvailable() {
  return googleConfigured();
}

export function startAuthorization(userId) {
  const state = randomToken(24);
  const nonce = randomToken(16);
  const { verifier, challenge } = pkcePair();
  pending.set(state, { userId, verifier, nonce, createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
  });
  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    state,
  };
}

export function consumeState(state) {
  const entry = pending.get(state);
  if (!entry) return null;
  pending.delete(state);
  if (Date.now() - entry.createdAt > STATE_TTL_MS) return null;
  for (const [key, value] of pending) {
    if (Date.now() - value.createdAt > STATE_TTL_MS) pending.delete(key);
  }
  return entry;
}

export async function exchangeCode(code, codeVerifier) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Gagal menukar kode OAuth.");
  }
  return payload;
}

export async function fetchUserInfo(accessToken) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_description || "Gagal membaca profil Google.");
  return payload;
}

/** Mencabut refresh/access token milik Linkly di Google (endpoint resmi). */
export async function revokeToken(token) {
  const response = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
  return { ok: response.ok, status: response.status };
}

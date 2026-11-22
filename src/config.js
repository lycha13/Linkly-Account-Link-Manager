import path from "node:path";
import fs from "node:fs";

/**
 * Konfigurasi terpusat. Semua nilai sensitif hanya dibaca dari environment,
 * tidak pernah ditulis ke kode atau dikirim ke browser.
 */

// Muat .env sederhana tanpa dependensi tambahan (variabel yang sudah ada menang).
function loadDotEnv() {
  const file = path.join(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv();

export const config = {
  port: Number(process.env.PORT) || 5178,
  dbPath: process.env.DB_PATH || "./data/linkly.db",
  appOrigin: (process.env.APP_ORIGIN || "http://localhost:5178").replace(/\/$/, ""),
  sessionDays: Math.max(1, Number(process.env.SESSION_DAYS) || 14),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      `${(process.env.APP_ORIGIN || "http://localhost:5178").replace(/\/$/, "")}/api/google/callback`,
  },
  encryptionKey: process.env.ENCRYPTION_KEY || "",
  isProduction: process.env.NODE_ENV === "production",
};

export function googleConfigured() {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

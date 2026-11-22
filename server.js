import { createServer } from "./src/app.js";
import { config } from "./src/config.js";
import { closeDb } from "./src/db.js";

/**
 * Entry point: `npm start`.
 * Semua konfigurasi berasal dari environment / .env (lihat .env.example).
 */

const server = createServer();

server.listen(config.port, "127.0.0.1", () => {
  console.log(`Linkly berjalan di ${config.appOrigin}`);
  console.log(`Port ${config.port} · database ${config.dbPath}`);
  console.log(
    config.google.clientId
      ? "Integrasi Google: aktif"
      : "Integrasi Google: belum dikonfigurasi (GOOGLE_CLIENT_ID kosong)"
  );
  console.log("Hentikan dengan Ctrl+C.");
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${config.port} sedang dipakai. Jalankan dengan PORT lain, contoh: PORT=5179 npm start`);
    process.exit(1);
  }
  throw error;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      closeDb();
      process.exit(0);
    });
  });
}

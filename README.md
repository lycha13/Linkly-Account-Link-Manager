# Linkly — Account Link Manager

Linkly adalah aplikasi pengelola inventaris akun: mencatat akun **Google**, **email**, dan **nomor HP** Anda,
lalu mencatat aplikasi pihak ketiga yang memakai akun tersebut, status keterkaitannya, serta langkah resmi
untuk memutus akses atau menghapus akun pada layanan itu.

Proyek ini terdiri dari satu backend REST, satu web app responsif, dan satu klien Android
(Kotlin + Jetpack Compose) yang memakai API yang sama.

> **Prinsip utama:** Linkly mencatat apa yang Anda masukkan. Linkly **tidak** memindai perangkat/akun,
> tidak pernah meminta kata sandi/OTP, dan tidak mengklaim sebuah tautan sudah terputus kecuali penyedia
> memberi konfirmasi resmi atau Anda sendiri menandainya sebagai sudah dijalankan.

## Status saat ini

| Bagian | Status | Diverifikasi di mesin ini |
|---|---|---|
| REST API (Node.js, SQLite) | Berjalan | ✅ 21 uji integrasi lulus |
| Web app (HTML/CSS/JS) | Berjalan | ✅ login/daftar, dashboard, akun, aplikasi, alur pemutusan, tema |
| Android (Kotlin/Compose) | Kode lengkap | ⚠ Belum dikompilasi — JDK & Android SDK tidak terpasang di mesin ini |
| Integrasi Google OAuth | Selesai, perlu kredensial | ⚠ Belum diuji tanpa client ID/secret Google |
| Build APK | Belum dilakukan | Lihat [docs/ANDROID.md](docs/ANDROID.md) |

## Struktur proyek

```text
linkly/
├── package.json            # skrip npm (start, dev, test)
├── server.js               # entry point HTTP server
├── .env.example            # contoh konfigurasi (jangan commit .env)
├── src/
│   ├── app.js              # router REST, autentikasi, validasi, handler, static serving
│   ├── db.js               # skema SQLite, seed katalog & data contoh, helper query
│   ├── catalog.js          # metadata aplikasi + URL/prosedur resmi penyedia
│   ├── security.js         # scrypt, token sesi, AES-256-GCM, rate limit, PKCE
│   ├── google.js           # alur OAuth 2.0/OIDC Google + revoke token
│   └── config.js           # pembacaan environment / .env
├── public/                 # web app (tanpa build step)
│   ├── index.html
│   ├── styles.css          # light & dark, responsif
│   ├── app.js              # SPA: routing hash, view, modal, aksi
│   └── favicon.svg
├── tests/
│   └── api.test.js         # uji integrasi API (node:test)
├── android/                # proyek Android (Gradle + Kotlin + Compose)
│   ├── settings.gradle.kts
│   ├── build.gradle.kts
│   ├── gradle.properties   # alamat API (10.0.2.2 = host emulator)
│   └── app/src/main/...
├── docs/
│   ├── SPEC.md             # spesifikasi produk (referensi awal)
│   ├── API.md              # dokumentasi REST API
│   ├── ARCHITECTURE.md     # arsitektur, skema database, alur data
│   ├── SECURITY.md         # kontrol keamanan, batasan, threat model
│   ├── GOOGLE.md           # menyiapkan OAuth Google
│   ├── ANDROID.md          # build APK & konfigurasi klien
│   └── TESTING.md          # cara uji + hasil pengujian
└── data/                   # dibuat otomatis: linkly.db (git-ignored)
```

## Menjalankan

Prasyarat: **Node.js 22.5+** (memakai modul bawaan `node:sqlite`; tanpa dependensi npm).

```bash
cd linkly
cp .env.example .env        # opsional, ubah PORT/APP_ORIGIN bila perlu
npm start
```

Buka <http://localhost:5178>. Daftarkan akun baru — workspace otomatis berisi 3 akun dan 7 keterkaitan
contoh yang bisa dihapus dari **Pengaturan**.

Perintah lain:

```bash
npm run dev     # restart otomatis saat file server berubah
npm test        # 21 uji integrasi API (database sementara)
```

## Fitur

- **Dashboard** — jumlah akun, aplikasi, koneksi aktif, item perlu ditinjau, aktivitas terbaru.
- **Akun** — tambah/cari/filter/hapus catatan Google, email, nomor HP; detail beserta aplikasi terkait.
- **Aplikasi** — katalog aplikasi dengan kategori, metode login, izin umum, tautan pengelolaan resmi;
  status keterkaitan per akun.
- **Pemutusan tautan** — alur dua tahap: mulai (status `Menunggu konfirmasi`) lalu konfirmasi
  (`Dicabut · dikonfirmasi pengguna`), dengan panduan/URL resmi penyedia.
- **Penghapusan akun aplikasi** — instruksi resmi, konsekuensi, dan pencatatan hasil.
- **Riwayat** — log tindakan dengan status selesai/menunggu/gagal.
- **Keamanan** — sesi HttpOnly (web) / token terenkripsi (Android), scrypt, CSRF, rate limit, ekspor & hapus data.
- **Google OAuth** (opsional) — login identitas Google dan pemutusan token lewat endpoint resmi Google.

## Batasan yang disengaja

- Tidak menghapus akun Google/email utama/nomor HP.
- Tidak menyimpan kata sandi, OTP, recovery code, atau token pihak ketiga dalam bentuk terbuka.
- Tidak memindai semua aplikasi di perangkat atau semua pendaftaran email. Daftar aplikasi berasal dari
  katalog + catatan pengguna.
- Pemutusan/penghapusan nyata hanya lewat prosedur resmi penyedia; Linkly mencatat hasil dan membedakan
  status terverifikasi (`revoked_verified` dari Google) dengan konfirmasi pengguna (`revoked_attested`).

Detail lengkap: [docs/SPEC.md](docs/SPEC.md), [docs/SECURITY.md](docs/SECURITY.md).

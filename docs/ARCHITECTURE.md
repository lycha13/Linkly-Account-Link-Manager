# Arsitektur

## Gambaran

```text
┌────────────────────┐        ┌────────────────────┐
│  Web app (SPA)     │        │  Android (Compose) │
│  public/*          │        │  android/**        │
│  cookie HttpOnly   │        │  Bearer token      │
└─────────┬──────────┘        └─────────┬──────────┘
          │  fetch /api/*               │  Retrofit /api/*
          └──────────────┬──────────────┘
                         ▼
             ┌───────────────────────┐
             │  Node.js HTTP server  │
             │  src/app.js           │
             │  · router & validasi  │
             │  · sesi & CSRF        │
             │  · static public/     │
             └──────────┬────────────┘
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
  SQLite (node:sqlite) Google OAuth   Katalog apps
  data/linkly.db       (opsional)     (src/catalog.js)
```

Satu backend, satu model data, dua klien. Tidak ada logika bisnis yang diduplikasi di klien:
aturan validasi, status, dan pencatatan aktivitas semuanya di server.

## Pilihan teknologi & alasan

| Bagian | Pilihan | Alasan |
|---|---|---|
| Runtime | Node.js ≥ 22.5 | `node:sqlite` bawaan → tanpa dependensi native/kompilasi |
| Database | SQLite | Cukup untuk satu instans; SQL standar, mudah dipindah ke PostgreSQL |
| Web | HTML + CSS + JS modular | Tanpa build step, mudah diaudit, CSP ketat |
| Android | Kotlin + Jetpack Compose | Sesuai spesifikasi; UI deklaratif, satu Activity |
| HTTP klien Android | Retrofit + OkHttp | Standar, mudah menambahkan interceptor auth |
| Auth | Sesi server (cookie/Bearer) + scrypt | Tidak menyimpan token OAuth pengguna di klien web |
| Google | OAuth 2.0 + OIDC, PKCE | Resmi, scope minimum `openid email profile` |

## Struktur backend

- `src/app.js` — satu router tabel (`route(method, pattern, handler)`), ekstraksi sesi,
  proteksi CSRF untuk cookie, validasi input, dan penyajian `public/`.
- `src/db.js` — skema, seed katalog, seed data contoh, serializer (`public*`), log aktivitas.
- `src/security.js` — scrypt (N=16384), token acak 256-bit, hash sesi, AES-256-GCM, rate limit login.
- `src/google.js` — authorization URL, penukaran kode, userinfo, revoke token.
- `src/catalog.js` — metadata 12 aplikasi + URL/prosedur resmi (tanpa URL karangan).

## Skema database

```text
users(id, name, email UNIQUE, password_hash, created_at)
sessions(id, user_id→users, token_hash UNIQUE, created_at, expires_at, user_agent)
apps(id, slug UNIQUE, name, category, developer, website, methods JSON, permissions JSON,
     unlink_url, unlink_guide, deletion_url, deletion_guide)
accounts(id, user_id→users, type, label, value, note, created_at, updated_at,
         UNIQUE(user_id, type, value))
links(id, user_id→users, app_id→apps, account_id→accounts, method, scopes JSON, status,
      linked_at, note, created_at, updated_at, UNIQUE(user_id, app_id, account_id, method))
activities(id, user_id→users, action, title, detail, status, meta JSON, created_at)
settings(user_id PK→users, theme, review_days, demo_seeded)
google_connections(id, user_id UNIQUE→users, google_sub, email, display_name, scopes,
                   refresh_token_enc, created_at, updated_at)
oauth_states(state PK, user_id→users, code_verifier, created_at)
```

Semua tabel pengguna memakai `ON DELETE CASCADE` sehingga penghapusan akun Linkly benar-benar
menghapus seluruh data.

### Pindah ke PostgreSQL

Skema memakai tipe dasar dan `TEXT` untuk ID/tanggal. Langkah migrasi:

1. Buat tabel dengan `TEXT PRIMARY KEY` (atau `uuid`) dan `JSONB` untuk kolom JSON.
2. Ganti `AUTOINCREMENT` (tidak dipakai) dan `INSERT OR IGNORE` di `db.js` menjadi
   `INSERT … ON CONFLICT DO NOTHING`.
3. Ganti pemanggilan `node:sqlite` dengan driver `pg` pada satu modul (`db.js`); semua query
   sudah memakai parameter terikat.
4. Tambahkan indeks unik yang sama (`user_id, type, value` dan `user_id, app_id, account_id, method`).

## Alur data kunci

### 1. Registrasi & data contoh
`POST /api/auth/register` → buat user + settings → `seedDemoWorkspace()` (3 akun, 7 link) → sesi
(cookie dan token) → web `boot()` memuat `/api/auth/me` lalu merender dashboard.

### 2. Mencatat keterkaitan
UI memilih aplikasi → metode dibatasi oleh `app.methods` → akun difilter berdasarkan jenis →
`POST /api/links`. Server memeriksa kecocokan metode, mencegah duplikat, menulis `activities`.

### 3. Pemutusan tautan (state machine)

```text
connected/review ──POST unlink──▶ revocation_pending ──confirm──▶ revoked_attested
       │                                   │
       │                                   └─ (Google) POST /api/google/disconnect
       │                                        └─ revoke token → revoked_verified (aktivitas)
       └──POST delete-account──▶ deletion_pending ──confirm──▶ deleted_attested
```

UI selalu menampilkan label eksplisit: "dikonfirmasi pengguna" vs "terverifikasi".

### 4. Google OAuth
`/api/google/start` membuat `state` + PKCE verifier (disimpan 10 menit) → Google →
`/api/google/callback` menukar kode dengan `code_verifier` → `userinfo` → simpan koneksi
(refresh token dienkripsi bila `ENCRYPTION_KEY` ada) → redirect ke web.

## Klien Android

```text
MainActivity
 └─ LinklyViewModel (StateFlow<UiState>)
     ├─ LinklyRepository ── Retrofit ── REST API
     │    └─ SessionStore (EncryptedSharedPreferences)
     └─ Compose: AuthScreen | MainScaffold(Dashboard, Accounts, Apps, AppDetail, History, Settings)
```

- `UiState` memuat user, dashboard, akun, aplikasi, riwayat, detail aplikasi, status Google,
  dialog instruksi (`pending`), tema.
- Semua aksi async lewat `viewModelScope`; error API ditampilkan sebagai snackbar.
- Base URL diatur di `android/gradle.properties` (`linkly.apiBaseUrl`), default
  `http://10.0.2.2:5178/` untuk emulator.

## Keputusan desain yang disengaja

- **Tidak ada pemindaian otomatis.** Tidak ada API resmi yang bisa mendaftar semua akun di semua
  layanan; mengklaim sebaliknya akan menyesatkan.
- **Katalog dipisahkan dari keterkaitan.** Metadata aplikasi bersifat global (read-only),
  keterkaitan milik pengguna.
- **Status tidak "dipercaya" dari klien.** Server menentukan transisi yang sah dan mencatat aktivitas.
- **Data contoh per pengguna baru** agar alur bisa dicoba, dengan tombol hapus yang jelas.

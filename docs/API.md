# Linkly REST API

Base URL pengembangan: `http://localhost:5178`

Semua request/response memakai JSON (`Content-Type: application/json`). Respons API selalu
`Cache-Control: no-store`.

## Autentikasi

Dua cara, keduanya untuk sesi yang sama:

1. **Cookie** `linkly_session` (HttpOnly, SameSite=Lax, `Secure` saat produksi) — dipakai web app.
2. **Bearer token** — `Authorization: Bearer <token>` — dipakai klien Android.

Token dikembalikan sekali saat login/registrasi. Server menyimpan hanya hash SHA-256-nya.
Mutasi yang memakai cookie wajib menyertakan header `Origin` yang sama dengan host permintaan
(atau `APP_ORIGIN`); jika tidak, server membalas `403 csrf_blocked`.

Masa berlaku sesi: `SESSION_DAYS` (default 14 hari).

### Format error

```json
{ "error": { "code": "validation_error", "message": "Label minimal 2 karakter.", "details": null } }
```

Kode status: `400` validasi, `401` belum masuk/kredensial salah, `403` CSRF, `404` tidak ditemukan,
`409` konflik/status tidak valid, `413` body terlalu besar, `429` terlalu banyak percobaan,
`501` integrasi belum dikonfigurasi, `500/502` kegagalan server/penyedia.

---

## Health

### `GET /api/health`
Tanpa autentikasi.

```json
{ "status": "ok", "google": false }
```

---

## Autentikasi

### `POST /api/auth/register`
```json
{ "name": "Nadia", "email": "nadia@example.com", "password": "rahasia123" }
```
Aturan password: minimal 8 karakter, memuat huruf dan angka. Respons `201`:

```json
{ "token": "…", "user": { "id": "…", "name": "Nadia", "email": "nadia@example.com" } }
```
Sekaligus membuat data contoh (3 akun, 7 keterkaitan).

### `POST /api/auth/login`
```json
{ "email": "nadia@example.com", "password": "rahasia123" }
```
Maksimal 10 percobaan gagal per IP+email per 15 menit (`429`).

### `POST /api/auth/logout`
Menghapus sesi saat ini.

### `GET /api/auth/me`
```json
{
  "user": { "id": "…", "name": "Nadia", "email": "nadia@example.com", "createdAt": "…" },
  "settings": { "theme": "light", "reviewDays": 180, "demoSeeded": true },
  "google": { "available": false, "connected": false, "permissionsUrl": "https://myaccount.google.com/permissions", "scopes": [] }
}
```

### `DELETE /api/auth/account`
Body wajib `{ "confirmation": "HAPUS" }`. Menghapus pengguna dan seluruh datanya (akun, keterkaitan,
riwayat, sesi, koneksi Google).

---

## Akun

### `GET /api/accounts?type=&q=`
`type` ∈ `google|email|phone`. Setiap akun menyertakan `appCount` dan ringkasan `apps`.

```json
{ "accounts": [ { "id": "…", "type": "email", "label": "Email kerja", "value": "kerja@example.com",
  "note": null, "createdAt": "…", "updatedAt": "…", "appCount": 1,
  "apps": [ { "id": "…", "appId": "…", "appName": "Notion", "status": "connected", "method": "email" } ] } ] }
```

### `POST /api/accounts`
```json
{ "type": "email", "label": "Email kerja", "value": "kerja@example.com", "note": "opsional" }
```
Validasi: email harus valid; nomor HP `+62 812-3456-7890`-style. Duplikat (jenis+nilai) → `409`.
Catatan yang memuat kata "otp"/"password"/"sandi" untuk jenis phone ditolak.

### `GET /api/accounts/{id}`
`{ "account": {…}, "links": [ … ] }`

### `PATCH /api/accounts/{id}`
Field opsional: `label`, `value`, `note`.

### `DELETE /api/accounts/{id}`
Menghapus **catatan Linkly** dan keterkaitannya. Respons `{ "ok": true, "removedLinks": 1 }`.

---

## Katalog aplikasi

### `GET /api/apps`
```json
{ "apps": [ {
  "id": "…", "slug": "spotify", "name": "Spotify", "category": "Hiburan",
  "developer": "Spotify AB", "website": "https://www.spotify.com",
  "methods": ["google", "email", "phone"],
  "permissions": ["Nama dan foto profil", "Email", "…"],
  "unlink": { "url": "https://www.spotify.com/account/apps/", "guide": "…" },
  "deletion": { "url": "https://support.spotify.com/article/close-account/", "guide": "…" },
  "linkCount": 1, "linkedAccounts": ["contoh.nadia@gmail.com"]
} ] }
```

### `GET /api/apps/{slug}`
`{ "app": {…}, "links": [ … ] }`

> `unlink.url` dan `deletion.url` hanya diisi bila URL resmi penyedia diketahui. Jika `null`,
> gunakan `guide` (langkah manual). Linkly tidak mengarang tautan.

---

## Keterkaitan (links)

Status yang dipakai:

| Status | Arti |
|---|---|
| `connected` | Dicatat sebagai aktif |
| `review` | Ditandai perlu ditinjau |
| `revocation_pending` | Proses pemutusan dimulai, menunggu konfirmasi |
| `revoked_verified` | Dicabut & dikonfirmasi penyedia (mis. revoke token Google) |
| `revoked_attested` | Pengguna menyatakan sudah mencabut akses |
| `deletion_pending` | Proses penghapusan akun aplikasi dimulai |
| `deleted_attested` | Pengguna menyatakan penghapusan selesai |

### `GET /api/links?q=&status=&method=`
```json
{ "links": [ { "id": "…", "appId": "…", "appName": "Spotify", "appSlug": "spotify",
  "appCategory": "Hiburan", "accountId": "…", "accountValue": "…", "accountType": "google",
  "method": "google", "scopes": ["…"], "status": "connected", "linkedAt": "…",
  "needsReview": false, "createdAt": "…", "updatedAt": "…" } ] }
```

`needsReview` = status `review`/`*_pending`, atau `connected` dengan `linkedAt` lebih lama dari
`reviewDays`.

### `POST /api/links`
```json
{ "appId": "…", "accountId": "…", "linkedAt": "2024-01-15", "scopes": ["Profil publik"], "note": "opsional" }
```
Metode diambil dari jenis akun. Jenis akun harus didukung aplikasi (`method_mismatch` → `400`).
Duplikat → `409`.

### `GET /api/links/{id}` · `PATCH /api/links/{id}` · `DELETE /api/links/{id}`
`PATCH` menerima `status`, `note`, `linkedAt`. `DELETE` hanya menghapus catatan, bukan akun asli.

### `POST /api/links/{id}/unlink`
Memulai proses. Mengubah status menjadi `revocation_pending` dan mengembalikan instruksi:

```json
{
  "link": { "…": "…", "status": "revocation_pending" },
  "instructions": {
    "title": "Cabut akses melalui Google",
    "url": "https://myaccount.google.com/permissions",
    "guide": "Buka halaman izin Google, pilih aplikasi, lalu pilih \"Hapus akses\"…",
    "verification": "attested"
  }
}
```
`verification` bernilai `attested` atau `manual` — **bukan** berarti akses sudah dicabut.

### `POST /api/links/{id}/unlink/confirm`
Body `{ "confirmation": true }`. Status → `revoked_attested`, aktivitas `link.unlink_attested`
dengan `meta.verified = false`.

### `POST /api/links/{id}/delete-account`
Status → `deletion_pending`; respons memuat `instructions` + `consequences[]`.

### `POST /api/links/{id}/delete-account/confirm`
Body `{ "confirmation": true }`. Status → `deleted_attested`.

---

## Dashboard, riwayat, pengaturan

### `GET /api/dashboard`
```json
{
  "numbers": { "accounts": 3, "apps": 7, "activeConnections": 7, "needsReview": 2 },
  "review": [ LinkItem ],
  "accounts": [ Account ],
  "apps": [ LinkItem terhubung ],
  "activity": [ ActivityItem ],
  "demo": true
}
```

### `GET /api/activity?limit=50`
`{ "activity": [ { "id": "…", "action": "account.created", "title": "…", "detail": "…",
"status": "success|pending|info|error", "meta": {}, "createdAt": "…" } ] }`

### `GET /api/settings` · `PATCH /api/settings`
`PATCH`: `{ "theme": "dark", "reviewDays": 30 }` (7–3650).

### `GET /api/export`
Unduhan JSON: `user`, `accounts`, `links`, `activity`. Tanpa password/token.

### `POST /api/demo/reset` · `POST /api/demo/clear`
Memuat ulang atau mengosongkan workspace (katalog aplikasi tetap).

---

## Google OAuth

Aktif hanya bila `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (dan idealnya `ENCRYPTION_KEY`) diatur.

### `GET /api/google/status`
```json
{ "google": { "available": true, "connected": true, "email": "…", "scopes": ["openid","email","profile"],
  "canRevokeProgrammatically": true, "permissionsUrl": "https://myaccount.google.com/permissions" } }
```

### `GET /api/google/start`
`{ "url": "https://accounts.google.com/o/oauth2/v2/auth?…", "state": "…" }`
Alur memakai PKCE S256, `state`, dan `nonce`.

### `GET /api/google/callback?code=&state=`
Endpoint redirect (bukan dipanggil manual). Menukar kode, membaca `userinfo`, menyimpan koneksi,
lalu redirect ke `/#/settings?google=connected`.

### `POST /api/google/disconnect`
Body `{ "confirmation": true }`. Bila refresh token tersimpan (terenkripsi AES-256-GCM), server memanggil
`https://oauth2.googleapis.com/revoke`. Respons memuat `verification: "google_api" | "attested"`.

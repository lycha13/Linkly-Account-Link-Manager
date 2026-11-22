# Keamanan & privasi

## Prinsip

1. **Minimisasi data** — hanya label, nilai akun (email/telepon), catatan, aplikasi, status, dan waktu.
2. **Tidak ada rahasia pengguna** — kata sandi/OTP/recovery code tidak pernah diminta atau disimpan.
   Kata "otp/password/sandi" pada catatan akun nomor HP ditolak.
3. **Kejujuran status** — Linkly tidak menyatakan tautan terputus tanpa konfirmasi penyedia/pengguna.
4. **Kendali pengguna** — ekspor dan hapus seluruh data tersedia kapan saja.

## Kontrol yang diterapkan

| Area | Implementasi |
|---|---|
| Password | scrypt N=16384, r=8, p=1, salt 16 byte, perbandingan `timingSafeEqual` |
| Sesi web | Token acak 32 byte; disimpan sebagai hash SHA-256; cookie `HttpOnly`, `SameSite=Lax`, `Secure` di produksi |
| Sesi Android | Token Bearer disimpan di `EncryptedSharedPreferences` (AES-256) |
| CSRF | Mutasi dengan cookie wajib `Origin` sama dengan host/`APP_ORIGIN`; Bearer tidak memakai cookie |
| Rate limit login | 10 kegagalan / 15 menit per IP+email |
| Validasi | Tipe, panjang, format email/telepon, enum status, batas 100 KB body |
| Otorisasi | Setiap query menyertakan `user_id`; resource milik pengguna lain → `404` |
| Injeksi SQL | Semua query memakai parameter terikat; tidak ada string SQL dari input |
| XSS | Web memakai `textContent`/escape HTML; CSP `script-src 'self'` |
| Header | CSP, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy` |
| Token Google | Refresh token dienkripsi AES-256-GCM (`ENCRYPTION_KEY`), tidak pernah dikirim ke klien |
| OAuth | Authorization code + PKCE S256, `state` 10 menit, `nonce`, scope minimum |
| Android jaringan | Cleartext hanya untuk `10.0.2.2`, `127.0.0.1`, `localhost` |
| Log | Tidak mencatat body, token, atau password; logging request hanya lewat `LINKLY_LOG_REQUESTS=1` |

## Threat model singkat

| Ancaman | Mitigasi | Sisa risiko |
|---|---|---|
| Pencurian cookie sesi | HttpOnly, SameSite, Secure di produksi | XSS di origin sendiri tetap berbahaya — CSP membatasi |
| CSRF | Cek Origin untuk cookie | Klien non-browser dengan Bearer tidak terkena |
| Enumerasi akun | Login gagal generik + rate limit | Tetap ada timing kecil; scrypt menyamakan biaya |
| Akses data pengguna lain | Filter `user_id` + 404 | Bug otorisasi baru harus ditutup lewat uji |
| Brute force | Rate limit memori | Hilang saat restart; gunakan Redis/WAF untuk produksi |
| Token OAuth bocor | Enkripsi AES-256-GCM, kunci di env | Kunci bocor = token bocor; rotasi kunci perlu migrasi |
| SQL injection | Parameter terikat | — |
| Data tersimpan di disk | Izin file database | Belum ada enkripsi database; gunakan disk terenkripsi/PostgreSQL dengan TLS |

## Retensi & penghapusan

- Menghapus akun Linkly (`DELETE /api/auth/account`) menghapus user + semua relasi via `ON DELETE CASCADE`.
- Menghapus catatan akun menghapus keterkaitannya, bukan akun asli di layanan lain.
- Sesi kedaluwarsa dibersihkan saat login berikutnya.
- Ekspor JSON tidak memuat hash password, token sesi, atau token Google.

## Checklist produksi

- [ ] Jalankan di balik HTTPS (reverse proxy) dan set `NODE_ENV=production` agar cookie `Secure`.
- [ ] Set `APP_ORIGIN` ke origin publik yang tepat.
- [ ] Set `ENCRYPTION_KEY` acak 32 byte dan simpan di secret manager.
- [ ] Batasi akses file `data/linkly.db` (izin 600) dan backup terenkripsi.
- [ ] Pindahkan rate limit ke penyimpanan bersama bila multi-instans.
- [ ] Pindahkan `state` OAuth ke tabel/Redis bila multi-instans.
- [ ] Tambahkan verifikasi email dan reset password sebelum dipakai publik.
- [ ] Audit dependency (Android: Retrofit/OkHttp/Compose) secara berkala.
- [ ] Tinjau ulang URL panduan penyedia di `src/catalog.js` — URL dapat berubah.

## Yang belum ada (disengaja pada versi ini)

- Verifikasi email, reset password, 2FA akun Linkly.
- Enkripsi database saat istirahat.
- Pemindaian email/OTP (di luar cakupan dan berisiko privasi).

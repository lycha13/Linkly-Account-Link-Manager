# Integrasi Google (OAuth 2.0 + OpenID Connect)

Integrasi ini **opsional**. Tanpa kredensial, aplikasi tetap berjalan penuh dengan pencatatan manual
dan UI menampilkan status "belum dikonfigurasi".

## Yang dilakukan integrasi

- Menghubungkan identitas Google (email, nama, `sub`) ke akun Linkly.
- Menyimpan **refresh token terenkripsi AES-256-GCM** hanya jika `ENCRYPTION_KEY` diatur.
- Memanggil endpoint resmi Google `https://oauth2.googleapis.com/revoke` saat pengguna memutus koneksi,
  sehingga pencabutan dapat dilabeli **terverifikasi**.
- Scope minimum: `openid email profile`. Tidak ada Gmail, Drive, Kontak, atau Calendar.

## Yang TIDAK dapat dilakukan integrasi ini

- Tidak bisa mendaftar semua aplikasi pihak ketiga yang memakai akun Google Anda. Google tidak
  menyediakan API untuk itu bagi aplikasi umum. Daftar aplikasi lain tetap dikelola melalui halaman
  izin Google dan catatan pengguna.
- Tidak bisa menghapus akun Google, email, atau nomor HP.
- Tidak bisa memverifikasi bahwa akses aplikasi lain sudah dicabut.

## Langkah penyiapan

1. Buka [Google Cloud Console](https://console.cloud.google.com/) → buat/pilih project.
2. **APIs & Services → OAuth consent screen**: pilih *External*, isi nama aplikasi, email dukungan,
   dan scope `openid`, `email`, `profile`. Tambahkan diri Anda sebagai *test user* selama aplikasi
   masih berstatus *Testing*.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:5178/api/google/callback`
     (tambahkan juga URI produksi, mis. `https://linkly.example.com/api/google/callback`)
4. Salin Client ID dan Client Secret ke `.env`:

```env
APP_ORIGIN=http://localhost:5178
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:5178/api/google/callback
ENCRYPTION_KEY=<64 karakter hex>
```

Buat kunci enkripsi:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

5. Restart server. `GET /api/health` akan menampilkan `"google": true`.
6. Di web: **Pengaturan → Akun Google → Hubungkan Google**. Di Android: tombol yang sama membuka
   browser ke URL persetujuan.

## Alur teknis

```text
GET /api/google/start
  └─ state (32 byte) + PKCE verifier disimpan 10 menit
  └─ redirect ke accounts.google.com (scope openid email profile, prompt=consent)

Google → GET /api/google/callback?code&state
  └─ validasi state, tukar kode + code_verifier
  └─ userinfo (sub, email, name)
  └─ upsert google_connections; refresh token dienkripsi
  └─ catat aktivitas google.connected
  └─ redirect /#/settings?google=connected
```

`state` disimpan di memori proses. Untuk deployment multi-instans, pindahkan ke tabel `oauth_states`
(sudah ada di skema) atau Redis; tanpa itu, callback bisa gagal jika request mendarat di instans lain.

## Pengujian tanpa kredensial

Tidak mungkin menguji alur ini secara nyata tanpa client ID/secret Google. Yang bisa diperiksa:

```bash
curl -s http://localhost:5178/api/health          # google: false
curl -s -H "Authorization: Bearer <token>" http://localhost:5178/api/google/start
# → 501 google_not_configured
```

Status ini ditampilkan jujur di UI, bukan dianggap berhasil.

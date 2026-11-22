# Pengujian

## Uji otomatis API

```bash
cd linkly
npm test
```

Hasil terakhir di mesin ini: **21 tes, 21 lulus** (Node 26.13, SQLite sementara).

Cakupan `tests/api.test.js`:

| # | Yang diuji |
|---|---|
| 1 | Health check tanpa login |
| 2 | Registrasi, sesi, data contoh (3 akun / 7 aplikasi) |
| 3 | Validasi registrasi & email duplikat |
| 4 | Login salah/benar, atribut cookie |
| 5 | Endpoint terproteksi menolak tanpa token |
| 6 | Tambah akun, duplikat, validasi nilai |
| 7 | Pencarian akun |
| 8 | Katalog aplikasi + panduan resmi |
| 9 | Mencatat keterkaitan, kecocokan metode, duplikat |
| 10 | Alur pemutusan: status `revocation_pending`, instruksi, konfirmasi `revoked_attested` |
| 11 | Alur penghapusan akun aplikasi + konsekuensi |
| 12 | Aktivitas tercatat untuk tindakan penting |
| 13 | Isolasi data antar pengguna (baca & hapus lintas akun → 404) |
| 14 | Validasi tema & periode tinjauan |
| 15 | Ekspor tanpa password/token |
| 16 | Hapus catatan akun menghitung tautan terdampak |
| 17 | Reset data contoh |
| 18 | CSRF: mutasi cookie dari origin asing → 403 |
| 19 | Logout menghapus sesi |
| 20 | Hapus akun Linkly butuh konfirmasi |
| 21 | Cleanup database sementara |

## Pemeriksaan manual web (dilakukan)

Dijalankan di Chromium lokal pada `http://127.0.0.1:5178`:

1. Halaman masuk tampil; tab "Daftar" berfungsi.
2. Registrasi → dashboard memuat 3 akun, 7 aplikasi, 7 koneksi aktif, 2 perlu ditinjau.
3. Daftar aplikasi menampilkan 12 aplikasi katalog; pencarian/filter tersedia.
4. Detail Spotify menampilkan keterkaitan, panduan resmi, dan batasan.
5. "Kelola" → "Mulai pemutusan tautan" → instruksi Google + peringatan → konfirmasi →
   status berubah menjadi **Dicabut · dikonfirmasi pengguna** dan aktivitas tercatat.
6. Halaman Pengaturan memuat 6 kartu (Tampilan, Google, Data, Privasi, Batas, Sesi).
7. Toggle tema: `data-theme="dark"` dan warna latar berubah; preferensi tersimpan di server.
8. Selama pengujian ditemukan dan diperbaiki bug CSRF: perbandingan Origin hanya terhadap
   `APP_ORIGIN` sehingga akses via `127.0.0.1` diblokir. Kini Origin dibandingkan dengan host
   permintaan atau `APP_ORIGIN`.

## Yang BELUM diuji

- **Kompilasi & APK Android** — JDK/Android SDK tidak tersedia di mesin ini.
- **Alur OAuth Google nyata** — butuh client ID/secret; hanya perilaku "belum dikonfigurasi" (501)
  yang dapat diverifikasi.
- **Tampilan mobile web** — layout responsif dibuat dengan media query, tetapi belum diuji pada
  perangkat/emulator sungguhan.
- **Uji beban, fuzz, audit dependensi**.
- **Pemutusan tautan nyata di penyedia** — memang di luar kemampuan aplikasi; yang diuji adalah
  pencatatan status dan instruksi.

## Uji manual yang disarankan setelah build

1. APK di emulator: daftar, login, dashboard, tambah akun, catat keterkaitan, kelola, putus tautan.
2. Matikan server → aplikasi harus menampilkan pesan koneksi, bukan crash.
3. Login dua akun berbeda → pastikan data terpisah.
4. Web: akses dengan cookie dari domain lain (curl `-H "Origin: https://evil.example"`) → 403.
5. Google OAuth: hubungkan, putuskan, pastikan status `google_api` dan halaman izin Google tidak
   lagi mencantumkan aplikasi.

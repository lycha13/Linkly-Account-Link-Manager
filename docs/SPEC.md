# Linkly — Account Link Manager
**Dokumen spesifikasi produk (spec.md)**  
**Versi:** 0.1.0 · **Status:** Prototype awal · **Platform target:** Web dan Android

## 1. Ringkasan produk
Linkly adalah konsep aplikasi pengelola keterkaitan akun. Aplikasi membantu pengguna menginventarisasi akun Google, alamat email, dan nomor telepon yang digunakan untuk masuk atau terhubung dengan aplikasi pihak ketiga. Pengguna dapat melihat aplikasi yang tercatat, memeriksa informasi hubungan akun, serta mengikuti alur untuk memutuskan tautan atau menghapus akun pada layanan pihak ketiga jika layanan tersebut menyediakan mekanisme resmi.

Linkly **bukan** aplikasi untuk menghapus akun Google utama, menghapus kotak surat/email utama, atau menonaktifkan nomor telepon pengguna.

## 2. Tujuan
- Memberi gambaran terpusat tentang akun dan aplikasi pihak ketiga yang digunakan.
- Membantu pengguna menemukan akun yang sudah tidak digunakan atau perlu ditinjau.
- Menyediakan informasi tentang metode login, status hubungan, dan cara mengelola akses.
- Mengurangi kebingungan saat pengguna ingin mencabut akses atau menghapus akun di layanan lain.

## 3. Target pengguna
Pengguna Android dan web yang memiliki beberapa akun Google, email, atau nomor telepon dan ingin mencatat serta mengelola keterkaitannya dengan aplikasi pihak ketiga.

## 4. Platform dan pendekatan
- **Web:** aplikasi responsif yang dapat dibuka melalui browser desktop maupun mobile.
- **Android:** target pengembangan lanjutan sebagai aplikasi Android/APK.
- **Prototype saat ini:** satu file `index.html` dengan CSS dan JavaScript internal. Tidak memerlukan framework atau server.
- **Data prototype:** data contoh di memori halaman; perubahan akan hilang saat halaman dimuat ulang.

## 5. Fitur fungsional
### 5.1 Dashboard
- Menampilkan jumlah akun yang tercatat.
- Menampilkan jumlah aplikasi, koneksi berstatus aktif, dan item yang perlu ditinjau.
- Menampilkan ringkasan akun dan aplikasi terbaru.

### 5.2 Manajemen akun
- Mendukung jenis catatan: Google, Email, dan Nomor HP.
- Menambahkan catatan akun secara manual.
- Melihat detail akun dan daftar aplikasi yang dicatat terkait.
- Mencari dan memfilter akun.
- Menghapus catatan akun dari workspace Linkly.

### 5.3 Inventaris aplikasi
- Menampilkan nama dan kategori aplikasi.
- Menampilkan metode login dan akun yang dicatat terkait.
- Menampilkan status hubungan.
- Mencari dan memfilter daftar aplikasi.
- Membuka detail aplikasi.

### 5.4 Detail dan pengelolaan hubungan
- Menampilkan informasi aplikasi, kategori, metode login, akun, dan status.
- Menyediakan alur simulasi putus tautan.
- Menjelaskan jalur pengelolaan resmi ketika tindakan nyata harus dilakukan pada penyedia layanan.

### 5.5 Riwayat aktivitas
- Mencatat tindakan yang dilakukan dalam sesi prototype, seperti penambahan catatan, penghapusan catatan, reset, dan simulasi putus tautan.

### 5.6 Pengaturan
- Menjelaskan status mode demo.
- Memberi peringatan agar pengguna tidak memasukkan kata sandi, OTP, atau token.
- Menyediakan reset data contoh.

## 6. Aturan penghapusan dan batasan
Istilah “hapus” harus dibedakan secara jelas:
1. **Hapus catatan di Linkly:** menghapus data inventaris yang disimpan Linkly. Tidak menghapus akun pada layanan aslinya.
2. **Putuskan tautan / cabut akses:** mencabut izin login atau akses pihak ketiga melalui mekanisme resmi penyedia akun (misalnya pengaturan keamanan akun Google) atau melalui aplikasi terkait. Ketersediaan dan dampaknya bergantung pada layanan.
3. **Hapus akun aplikasi pihak ketiga:** mengajukan penghapusan akun pada layanan tersebut melalui fitur atau prosedur resmi layanan. Bisa memerlukan login ulang, verifikasi, atau menunggu masa retensi.
4. **Di luar cakupan:** menghapus akun Google utama, menghapus akun email utama, menghapus/menonaktifkan nomor HP, atau menghapus seluruh identitas digital pengguna.

Linkly tidak boleh mengklaim bahwa sebuah tautan telah benar-benar diputus jika hanya mengubah status lokal. Tindakan eksternal harus memiliki konfirmasi, hasil yang dapat diverifikasi, dan penjelasan dampak.

## 7. Prinsip privasi dan keamanan
- Terapkan prinsip minimisasi data: simpan hanya informasi yang diperlukan.
- Jangan meminta atau menyimpan kata sandi, OTP, recovery code, atau token akses dalam bentuk teks biasa.
- Gunakan OAuth resmi dan scope minimum jika integrasi penyedia tersedia.
- Jelaskan izin yang diminta sebelum pengguna menghubungkan akun.
- Lindungi token dengan penyimpanan aman sesuai platform; jangan menaruh secret di frontend.
- Sediakan persetujuan eksplisit sebelum mencabut akses atau memulai penghapusan akun.
- Sediakan mekanisme logout, penghapusan data lokal, dan kebijakan privasi.
- Enkripsi data sensitif saat transit dan saat tersimpan pada implementasi produksi.

## 8. Sumber data dan integrasi — kebutuhan pengembangan
Prototype HTML tidak dapat memindai seluruh aplikasi yang terpasang atau mengetahui semua akun yang tertaut secara universal. Implementasi produksi memerlukan integrasi yang sah dan terbatas, misalnya:
- Google OAuth / Google Account permissions untuk menampilkan koneksi atau izin yang memang tersedia melalui API resmi.
- Integrasi langsung dengan penyedia aplikasi, jika API dan izin resminya tersedia.
- Android AccountManager hanya untuk jenis akun yang diekspos sistem dan diizinkan aplikasi; bukan akses menyeluruh ke semua akun pihak ketiga.
- Input manual atau impor yang disetujui pengguna untuk layanan yang tidak menyediakan API.

Tidak ada jaminan satu API dapat menemukan seluruh pendaftaran email/nomor HP di semua aplikasi. Email inbox scanning, jika kelak dipertimbangkan, harus menjadi fitur terpisah dengan izin granular dan perlindungan privasi yang ketat.

## 9. Struktur halaman
| Halaman | Isi utama |
|---|---|
| Dashboard | Ringkasan akun, aplikasi, dan item yang perlu ditinjau |
| Akun tertaut | Daftar akun, pencarian, filter, tambah, detail, hapus catatan |
| Daftar aplikasi | Daftar aplikasi, kategori, metode login, akun, status |
| Detail aplikasi | Informasi hubungan dan opsi pengelolaan |
| Riwayat aktivitas | Log tindakan dalam aplikasi |
| Pengaturan | Privasi, mode demo, reset data |

## 10. Kebutuhan nonfungsional
- Responsif untuk layar desktop dan ponsel.
- Navigasi sederhana dan konsisten.
- Kontras teks dan kontrol yang mudah dibaca.
- Konfirmasi sebelum tindakan destruktif.
- Pesan status yang jujur dan tidak menyesatkan.
- Data pribadi tidak boleh ditampilkan pada contoh produksi tanpa persetujuan pengguna.

## 11. Kriteria penerimaan prototype
- [x] Dapat dibuka langsung dari browser sebagai satu file HTML.
- [x] Layout desktop dan mobile.
- [x] Dashboard dengan kartu ringkasan.
- [x] Tambah, cari, filter, lihat detail, dan hapus catatan akun demo.
- [x] Daftar aplikasi dengan pencarian dan filter.
- [x] Detail aplikasi dan simulasi putus tautan.
- [x] Riwayat aktivitas dan reset data demo.
- [x] Peringatan jelas bahwa data dan tindakan masih simulasi.
- [ ] Integrasi akun Google/email/nomor HP sungguhan.
- [ ] Sinkronisasi data persisten dan autentikasi pengguna.
- [ ] Proses pencabutan akses atau penghapusan akun pihak ketiga yang terverifikasi.

## 12. Rencana pengembangan berikutnya
1. Validasi kebutuhan pengguna dan alur pengelolaan akun.
2. Rancang backend, database, autentikasi, dan model izin.
3. Implementasikan integrasi Google melalui API/OAuth resmi.
4. Tambahkan konektor layanan pihak ketiga satu per satu berdasarkan dukungan API.
5. Bangun aplikasi Android dan web dengan backend bersama.
6. Tambahkan audit log, pengujian keamanan, kebijakan privasi, serta proses verifikasi tindakan.

## 13. Catatan rilis
Rilis 0.1.0 adalah prototype antarmuka dengan data contoh. Ini bukan aplikasi produksi dan belum memiliki akses ke akun eksternal atau kemampuan pemutusan tautan yang sebenarnya.

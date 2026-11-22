/**
 * Katalog aplikasi pihak ketiga.
 *
 * Penting: Linkly TIDAK memindai perangkat atau akun pengguna. Katalog ini
 * berisi metadata umum (kategori, metode login, izin yang umum diminta, dan
 * tautan/prosedur resmi penyedia). Pengguna memilih sendiri aplikasi dan akun
 * yang mereka catat.
 *
 * `unlinkUrl` hanya diisi bila URL resmi penyedia diketahui. Bila tidak,
 * `unlinkGuide` berisi langkah manual dan `unlinkUrl` bernilai null. Linkly
 * tidak boleh menampilkan tautan yang dikarang.
 */

export const APP_CATALOG = [
  {
    slug: "facebook",
    name: "Facebook",
    category: "Media sosial",
    developer: "Meta Platforms",
    website: "https://www.facebook.com",
    methods: ["google", "email", "phone"],
    permissions: ["Nama dan foto profil", "Alamat email", "Daftar teman (opsional)"],
    unlinkUrl: "https://www.facebook.com/settings?tab=applications",
    unlinkGuide:
      "Buka Pengaturan Facebook → Apps and Websites, pilih aplikasi, lalu klik Remove.",
    deletionUrl: "https://www.facebook.com/help/delete_account",
    deletionGuide:
      "Facebook menyediakan formulir penghapusan akun resmi. Akun dinonaktifkan sementara selama masa tenggang sebelum dihapus permanen.",
  },
  {
    slug: "instagram",
    name: "Instagram",
    category: "Media sosial",
    developer: "Meta Platforms",
    website: "https://www.instagram.com",
    methods: ["google", "email", "phone"],
    permissions: ["Profil publik", "Email", "Daftar akun yang diikuti"],
    unlinkUrl: "https://www.instagram.com/accounts/manage_access/",
    unlinkGuide:
      "Buka Pengaturan Instagram → Apps and websites → Active, pilih aplikasi, lalu Remove.",
    deletionUrl: "https://www.instagram.com/accounts/remove/request/permanent/",
    deletionGuide:
      "Penghapusan akun Instagram diproses melalui formulir resmi dan tidak dapat dibatalkan setelah masa tenggang.",
  },
  {
    slug: "spotify",
    name: "Spotify",
    category: "Hiburan",
    developer: "Spotify AB",
    website: "https://www.spotify.com",
    methods: ["google", "email", "phone"],
    permissions: ["Nama dan foto profil", "Email", "Data penggunaan (opsional)"],
    unlinkUrl: "https://www.spotify.com/account/apps/",
    unlinkGuide:
      "Buka halaman Apps di akun Spotify, pilih aplikasi yang terhubung, lalu klik REMOVE ACCESS.",
    deletionUrl: "https://support.spotify.com/article/close-account/",
    deletionGuide:
      "Spotify menyediakan halaman bantuan penutupan akun. Langganan berbayar perlu dibatalkan terpisah.",
  },
  {
    slug: "github",
    name: "GitHub",
    category: "Developer",
    developer: "GitHub, Inc.",
    website: "https://github.com",
    methods: ["google", "email"],
    permissions: ["Profil publik", "Email", "Repositori sesuai scope OAuth"],
    unlinkUrl: "https://github.com/settings/applications",
    unlinkGuide:
      "Buka Settings → Applications → Authorized OAuth Apps, pilih aplikasi, lalu Revoke access.",
    deletionUrl: "https://github.com/settings/account",
    deletionGuide:
      "Bagian \"Delete account\" di Settings → Account meminta konfirmasi dan menghapus repositori, gist, dan data akun.",
  },
  {
    slug: "linkedin",
    name: "LinkedIn",
    category: "Profesional",
    developer: "Microsoft",
    website: "https://www.linkedin.com",
    methods: ["google", "email", "phone"],
    permissions: ["Profil dasar", "Email", "Koneksi (opsional)"],
    unlinkUrl: "https://www.linkedin.com/psettings/permitted-services",
    unlinkGuide:
      "Buka Settings → Data privacy → Permitted services, lalu hapus layanan yang tidak digunakan.",
    deletionUrl: null,
    deletionGuide:
      "Gunakan menu Settings → Account preferences → Account management → Close account di LinkedIn.",
  },
  {
    slug: "discord",
    name: "Discord",
    category: "Komunitas",
    developer: "Discord Inc.",
    website: "https://discord.com",
    methods: ["google", "email", "phone"],
    permissions: ["Nama pengguna", "Email", "Daftar server"],
    unlinkUrl: null,
    unlinkGuide:
      "Buka User Settings → Authorized Apps di Discord, lalu klik Deauthorize pada aplikasi terkait.",
    deletionUrl: null,
    deletionGuide:
      "Buka User Settings → My Account → Delete Account. Discord akan meminta verifikasi kode sebelum menghapus.",
  },
  {
    slug: "notion",
    name: "Notion",
    category: "Produktivitas",
    developer: "Notion Labs",
    website: "https://www.notion.so",
    methods: ["google", "email"],
    permissions: ["Nama dan email", "Akses workspace yang diizinkan"],
    unlinkUrl: null,
    unlinkGuide:
      "Buka Settings → My connections / Connected apps di Notion, lalu cabut akses aplikasi terkait.",
    deletionUrl: null,
    deletionGuide:
      "Buka Settings → Account → Delete my account. Workspace yang Anda miliki perlu dipindahkan atau dihapus lebih dahulu.",
  },
  {
    slug: "figma",
    name: "Figma",
    category: "Desain",
    developer: "Figma, Inc.",
    website: "https://www.figma.com",
    methods: ["google", "email"],
    permissions: ["Nama dan email", "Akses berkas yang dibagikan"],
    unlinkUrl: null,
    unlinkGuide:
      "Buka Settings → Connected apps di Figma (atau pengaturan akun Google jika masuk dengan Google), lalu cabut akses.",
    deletionUrl: null,
    deletionGuide:
      "Buka Settings → Account → Delete account. Berkas milik tim tetap berada pada tim tersebut.",
  },
  {
    slug: "canva",
    name: "Canva",
    category: "Desain",
    developer: "Canva Pty Ltd",
    website: "https://www.canva.com",
    methods: ["google", "email"],
    permissions: ["Nama dan email", "Akses desain yang terhubung"],
    unlinkUrl: null,
    unlinkGuide:
      "Buka Account settings → Apps / Connected accounts di Canva, lalu hapus koneksi yang tidak dipakai.",
    deletionUrl: null,
    deletionGuide:
      "Buka Account settings → Delete account. Desain yang dibagikan tetap dapat diakses penerima tautan.",
  },
  {
    slug: "tokopedia",
    name: "Tokopedia",
    category: "Belanja",
    developer: "GoTo Group",
    website: "https://www.tokopedia.com",
    methods: ["google", "email", "phone"],
    permissions: ["Nama", "Nomor HP", "Alamat pengiriman"],
    unlinkUrl: null,
    unlinkGuide:
      "Buka pengaturan akun Tokopedia → Keamanan → Akun terhubung, lalu putuskan koneksi yang tidak dipakai.",
    deletionUrl: null,
    deletionGuide:
      "Gunakan menu pengaturan akun Tokopedia untuk mengajukan penutupan akun. Selesaikan transaksi dan saldo sebelum mengajukan.",
  },
  {
    slug: "gojek",
    name: "Gojek",
    category: "Transportasi",
    developer: "GoTo Group",
    website: "https://www.gojek.com",
    methods: ["email", "phone"],
    permissions: ["Nama", "Nomor HP", "Riwayat perjalanan"],
    unlinkUrl: null,
    unlinkGuide:
      "Ganti nomor atau email melalui pengaturan akun Gojek. Nomor lama tetap tercatat pada riwayat bila tidak dipindahkan.",
    deletionUrl: null,
    deletionGuide:
      "Gunakan pusat bantuan Gojek untuk mengajukan penghapusan akun. Saldo dan voucher perlu diselesaikan lebih dahulu.",
  },
  {
    slug: "x",
    name: "X",
    category: "Media sosial",
    developer: "X Corp.",
    website: "https://x.com",
    methods: ["google", "email", "phone"],
    permissions: ["Profil publik", "Email", "Daftar akun yang diikuti"],
    unlinkUrl: null,
    unlinkGuide:
      "Buka Settings → Security and account access → Apps and sessions → Connected accounts, lalu cabut akses.",
    deletionUrl: null,
    deletionGuide:
      "Gunakan Settings → Your account → Deactivate your account. Akun dinonaktifkan selama masa tenggang 30 hari.",
  },
];

export const GOOGLE_PERMISSIONS_URL = "https://myaccount.google.com/permissions";
export const GOOGLE_CONNECTIONS_URL = "https://myaccount.google.com/connections";

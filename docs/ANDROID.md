# Klien Android — build & konfigurasi

Proyek Android berada di `linkly/android/` dan memakai **Kotlin 1.9.24 + Jetpack Compose (Material 3)**,
Retrofit/OkHttp untuk API, serta `EncryptedSharedPreferences` untuk token sesi.

> **Status di mesin pengembangan ini:** kode Android **belum dikompilasi dan APK belum dibangun**
> karena JDK dan Android SDK tidak terpasang (`java` tidak ditemukan, `ANDROID_HOME` kosong).
> Langkah di bawah adalah cara menghasilkan APK di mesin yang memiliki Android Studio/SDK.

## Prasyarat

- JDK 17 (bundled di Android Studio)
- Android SDK Platform 34 + Build Tools 34
- Android Studio Ladybug atau lebih baru (atau Gradle 8.7 CLI)

## Menjalankan backend untuk Android

Android memanggil API yang sama. Jalankan server di host:

```bash
cd linkly
PORT=5178 APP_ORIGIN=http://127.0.0.1:5178 npm start
```

Alamat default klien: `http://10.0.2.2:5178/` (loopback host dari dalam emulator).
Ubah di `android/gradle.properties`:

```properties
linkly.apiBaseUrl=http://10.0.2.2:5178/
```

atau saat build: `./gradlew assembleDebug -Plinkly.apiBaseUrl=http://192.168.1.10:5178/`.

### Perangkat fisik

1. Gunakan IP LAN komputer, mis. `http://192.168.1.10:5178/`.
2. Tambahkan IP itu ke `app/src/main/res/xml/network_security_config.xml` **hanya untuk pengembangan**;
   cleartext diblokir untuk host lain.
3. Untuk produksi gunakan HTTPS (mis. reverse proxy) — jangan mengaktifkan cleartext global.

## Build APK

```bash
cd linkly/android

# Opsi A — Android Studio
# File → Open → pilih folder linkly/android → tunggu Gradle sync → Run/Build APK

# Opsi B — Gradle CLI (butuh Gradle 8.7 terpasang)
gradle wrapper --gradle-version 8.7     # sekali saja untuk membuat gradlew + wrapper jar
./gradlew assembleDebug
```

Hasil: `android/app/build/outputs/apk/debug/app-debug.apk`.

Release (perlu keystore sendiri, jangan commit):

```bash
keytool -genkeypair -v -keystore linkly-release.jks -alias linkly -keyalg RSA -keysize 2048 -validity 10000
./gradlew assembleRelease   # tambahkan signingConfigs terlebih dahulu
```

`proguard-rules.pro` sudah menjaga model data untuk Gson.

## Struktur klien

```text
android/app/src/main/java/app/linkly/manager/
├── MainActivity.kt              # setContent, tema, pilih Auth/Main
├── LinklyApplication.kt         # container SessionStore + Repository
├── data/
│   ├── Models.kt                # model = payload API
│   ├── ApiService.kt            # kontrak Retrofit
│   ├── SessionStore.kt          # token di EncryptedSharedPreferences
│   └── LinklyRepository.kt      # header Bearer, error → ApiException
└── ui/
    ├── LinklyViewModel.kt       # StateFlow<UiState>, semua aksi async
    ├── Common.kt                # StatusChip, SectionCard, format tanggal
    ├── AuthScreen.kt            # masuk / daftar
    ├── MainScaffold.kt          # top bar, bottom nav, NavHost, dialog instruksi
    ├── DashboardScreen.kt
    ├── AccountsScreen.kt
    ├── AppsScreen.kt            # daftar + detail aplikasi + kelola keterkaitan
    ├── HistoryScreen.kt
    ├── SettingsScreen.kt
    └── theme/Theme.kt           # ungu/navy, light & dark
```

## Perilaku penting

- Token disimpan terenkripsi; tidak ada di `BuildConfig` atau log (`HttpLoggingInterceptor` hanya
  level BASIC dan hanya pada build debug).
- Setiap aksi destruktif memakai `AlertDialog` konfirmasi.
- Dialog instruksi menampilkan panduan penyedia, URL resmi (dibuka di browser), konsekuensi, dan
  peringatan bahwa Linkly tidak memverifikasi tindakan tersebut.
- Bottom navigation: Dashboard, Akun, Aplikasi, Riwayat, Pengaturan; detail aplikasi menyembunyikan
  bottom bar.

## Catatan kompatibilitas

- `minSdk 26` (memakai `java.time` untuk format tanggal).
- `targetSdk 34`, `compileSdk 34`.
- Gradle wrapper **jar belum disertakan** (biner tidak dibuat di sini). Android Studio membuatnya
  otomatis saat sync, atau jalankan `gradle wrapper` seperti di atas.

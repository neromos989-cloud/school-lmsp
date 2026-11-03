# School LMS (Android WebView)

Membungkus https://man19jkt.assessment.web.id/login menjadi aplikasi Android.

## Cara build APK
1. Instal Android Studio (versi terbaru).
2. File > Open > pilih folder ini. Tunggu Gradle sync selesai (butuh internet).
3. Colokkan HP (aktifkan USB debugging) lalu tekan Run, atau
   Build > Build Bundle(s) / APK(s) > Build APK(s).
4. Hasil: app/build/outputs/apk/debug/app-debug.apk -> kirim ke HP dan instal.

Untuk rilis/Play Store: Build > Generate Signed Bundle / APK.

## Kustomisasi
- Domain induk: app/build.gradle.kts (BASE_DOMAIN). Kode sekolah menjadi subdomain: https://<kode>.assessment.web.id/login
- Ganti sekolah: tekan lama ikon aplikasi > Ganti sekolah
- Nama aplikasi: app/src/main/res/values/strings.xml
- Warna: res/values/colors.xml
- Ikon: res/drawable/ic_launcher.xml

## Build lewat GitHub (tanpa Android Studio)
1. Unggah seluruh isi folder ini ke repositori GitHub (termasuk folder .github).
2. Buka tab Actions > Build APK > Run workflow (atau otomatis setelah push).
3. Setelah selesai (hijau), buka run tersebut, lalu unduh "SchoolLMS-apk" di bagian Artifacts.
4. Ekstrak zip-nya, instal app-debug.apk di HP.

## Mode guru (jendela AI)
- Skrip: app/src/main/assets/school-lms-ai.js. Sebelum build, isi `API_URL` (alamat Cloudflare Worker) dan `QUESTION_SELECTOR` (elemen soal di halaman).
- Aktifkan: tekan lama ikon aplikasi > Mode guru > isi kode guru (sama dengan TEACHER_CODE di worker). Kosongkan lalu Simpan untuk mematikan.
- Tanpa kode guru, skrip tidak pernah dijalankan. Worker juga menolak permintaan tanpa kode yang benar.
- Di worker, ALLOWED_ORIGIN harus sama dengan alamat situs sekolah, contoh: https://man19jkt.assessment.web.id

## Pasang semuanya lewat GitHub (APK + Worker)
Isi repo ini: aplikasi Android (`app/`), Worker Cloudflare (`worker/`), dan dua workflow (`.github/workflows/`).

1. Settings > Secrets and variables > Actions > **Secrets**, tambahkan:
   - `CLOUDFLARE_API_TOKEN`  (dash.cloudflare.com > My Profile > API Tokens > template "Edit Cloudflare Workers")
   - `CLOUDFLARE_ACCOUNT_ID` (Workers & Pages > kanan halaman)
   - `ANTHROPIC_API_KEY`     (console.anthropic.com)
   - `TEACHER_CODE`          (kode rahasia guru, bebas Anda tentukan)
2. Cek `worker/wrangler.toml`: `ALLOWED_ORIGIN` harus sama dengan alamat situs sekolah.
3. Tab Actions > **Deploy Worker** > Run workflow. Alamat Worker muncul di ringkasan run (Summary).
4. Settings > Secrets and variables > Actions > **Variables** > New variable: `WORKER_URL` = alamat Worker tadi.
5. Tab Actions > **Build APK** > Run workflow. Unduh **SchoolLMS-apk** di bagian Artifacts.
6. Di HP: tekan lama ikon aplikasi > **Mode guru** > isi `TEACHER_CODE`.

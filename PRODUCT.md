# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Node.js + Express + Socket.io dengan in-memory game state; vanilla HTML, CSS, dan JavaScript frontend (disajikan langsung dari Express tanpa build step/bundler); Google Sheets API (service account) sebagai sumber data soal sekaligus persistent store; Google Drive API (service account ke folder master) untuk upload media gambar/video; QR code generation via library `qrcode`; laporan Excel via `exceljs`; target deployment zero-cost di Render atau Railway free tier.

**Dependensi aktif:**
- `express` ^5.2.1
- `socket.io` ^4.8.3
- `googleapis` ^178.0.0
- `multer` ^2.3.0
- `qrcode` ^1.5.4
- `exceljs` ^4.4.0
- `papaparse` ^5.7.0
- `dotenv` ^17.4.2
- `cors` ^2.8.6

## Users

- **Host / Facilitator (Staf Kantor / Trainer):** Mengoperasikan `/host` di laptop yang terhubung ke proyektor atau layar besar di ruang training/bimtek. Mengendalikan pilihan set kuis, PIN room, lobby peserta, dan pacing manual per soal. Bisa mengaktifkan **Mode Autoplay** agar soal berganti otomatis.
- **Participants (Peserta Bimtek / Karyawan):** Bergabung via browser smartphone di `/player` dengan scan QR code atau masukkan PIN. Menjawab menggunakan controller 4-tombol warna+bentuk yang sangat responsif. Melihat teks soal + pilihan lengkap di layar HP. Dapat mengirim emoji reaction di waiting room.
- **Quiz Content Creator / Admin:** Staf kantor yang membuat dan mengedit set soal langsung dari halaman `/admin` aplikasi (tidak perlu buka Google Sheets langsung). Upload gambar/video soal ke folder Google Drive master. Login memakai username/password internal setelah pendaftaran disetujui super admin.
- **Super Admin:** Akun internal berperan `super_admin`, dibuat melalui bootstrap satu kali; menyetujui pendaftaran dan mengelola semua quiz set.

## Product Purpose

Menyediakan platform kuis multiplayer real-time yang ringan, gratis, dan self-hosted untuk training dan bimtek internal kantor — menghadirkan pengalaman game-show kompetitif ala Kahoot tanpa biaya lisensi atau pembatasan peserta.

## Positioning

Platform kuis interaktif internal-first berbasis web dengan zero-friction entry: peserta bergabung dalam hitungan detik via QR scan, host memegang kendali penuh atas pacing sesi, dan content creator mengelola bank soal langsung dari dalam aplikasi (bukan buka Spreadsheet). Berjalan di infrastruktur cloud gratis tanpa database tambahan.

## Operating Context

- **Environment:** Ruang bimtek, training seminar, workshop, dan rapat internal kantor.
- **Physical Dynamics:** Dinamika Dual-Screen. Laptop host terhubung ke proyektor/monitor besar menampilkan pertanyaan, media embed, timer countdown, dan leaderboard live. Peserta duduk di ruangan sambil memegang smartphone dalam orientasi portrait, memantau proyektor sambil mengetuk tombol jawaban di layar mereka.
- **Network / Hardware:** Wi-Fi atau data seluler di smartphone peserta. Cloud hosting free-tier (Render/Railway) — latensi spin-up server harus ditangani dengan graceful loading dan reconnection states.

## Capabilities and Constraints

- **Capabilities:**
  - Orkestrasi room real-time via Socket.io dengan PIN game unik 4-6 digit dan QR code otomatis untuk `/player?pin=XXXX` (URL berbasis IP lokal saat dev, domain deploy saat production — environment-aware).
  - **Dual synchronized interfaces:**
    - `/host`: Tampilan proyektor — PIN/QR raksasa di waiting room, teks soal, media gambar/YouTube embed, countdown timer melingkar, statistik distribusi jawaban real-time, leaderboard animasi, podium final dengan confetti canvas. Toggle **Mode Manual / Mode Autoplay**. Tombol **Akhiri Sesi** (dengan dialog konfirmasi) untuk menghentikan kuis di tengah jalan dan loncat ke leaderboard final.
    - `/player`: Gamepad mobile — teks pertanyaan lengkap + 4 tombol jawaban 2×2 raksasa (warna + bentuk geometri CSS clip-path + teks opsi). **Emoji reaction bar** (👍😂🎉🔥😮❤️) aktif di waiting room sebelum kuis dimulai (dengan rate-limit 1 reaksi/2 detik). Feedback jawaban instan (centang/silang + poin + posisi ranking).
    - `/admin`: Dashboard content creator — dilindungi login akun internal aktif. Grid card per quiz_set (nama, jumlah soal, estimasi durasi, preview soal pertama, tanggal terakhir diedit). CRUD soal dan quiz_set langsung ke Google Sheets via API. Upload gambar/video ke Google Drive master. Manajemen ownership & kolaborator.
  - Google Sheets API (service account) sebagai sumber data persistent — append, update, delete baris soal langsung dari `/admin`. Kolom soal: `question`, `option_a-d`, `correct_answer`, `duration_seconds`, `image_url`, `video_url`, `quiz_set`, `last_updated`.
  - `/auth/`: daftar → pending → persetujuan super admin → active; status rejected/disabled dijelaskan tanpa memberikan akses dashboard/host. Password sementara wajib diganti.
  - `/accounts/`: khusus super admin untuk mencari/filter akun, menyetujui/menolak, menonaktifkan/mengaktifkan, dan reset password.
  - `AccountsV2` menyimpan akun dan hash scrypt; `QuizAccessV2` menyimpan owner/kolaborator berdasarkan ID internal; `MediaUploadsV2` melacak upload master Drive.
  - Pemilik/super admin membagikan akses lewat username aktif pada `/auth/?view=access`. Kolaborator dapat mengedit/host tetapi tidak membagikan akses atau menghapus seluruh set. Kuis lama tanpa metadata hanya untuk super admin.
  - Media tersimpan di folder master `Images/<quiz_set>` dan `Videos/<quiz_set>`. Penghapusan hanya membersihkan file terlacak yang tidak dipakai soal lain setelah penghapusan soal berhasil; link manual, media lama, dan folder kosong dipertahankan.
  - Toggle upload/link manual tetap tersedia sebagai fallback (Imgur, YouTube, dll).
  - Formula skor speed + accuracy dengan feedback visual dan audio instan.
  - Audio engine: Web Audio API synthesizer + fallback MP3 (`lobby.mp3`, `countdown.mp3`, `correct.mp3`, `wrong.mp3`, `fanfare.mp3`).
  - Ekspor laporan hasil sesi ke Excel (`exceljs`).

- **Constraints:**
  - In-memory state di server — reset jika instance restart. Soal dan data persistent tersimpan di Google Sheets.
  - Tanpa bundler/framework frontend — plain HTML/CSS/JS murni disajikan langsung oleh Express.
  - Spreadsheet melalui CSV publish-to-web punya delay beberapa menit dari CDN Google; untuk kebutuhan tulis/baca real-time digunakan Google Sheets API langsung.
  - `AUTH_SPREADSHEET_ID` wajib dan privat. Boleh sama dengan spreadsheet soal hanya jika seluruh dokumen tidak dipublikasikan/diakses publik; bank soal yang tetap publish-to-web memerlukan spreadsheet akun terpisah.
  - Sesi delapan jam di memori; restart memerlukan login ulang. Jalankan satu instance server; penulisan Sheets bukan transaksi multi-instance.
  - Upload service account memerlukan Shared Drive Workspace; untuk My Drive pribadi gunakan upload manual + tempel link sampai integrasi master satu kali tersedia. Tidak ada token Drive per pengguna.

## Brand Commitments

- **Name:** Nizhoot
- **Logo:** `public/assets/images/nizhoot-logo.png` — chat bubble gradient magenta-ke-biru dengan checkmark cyan-ke-hijau, tulisan "Nizhoot" dengan gradient serupa.
- **Voice & Tone:** Energetik, kompetitif, playful, jelas, dan profesional untuk lingkungan pembelajaran korporat.
- **Auditory Identity:** Loop musik lobby upbeat, ticking musik suspense saat countdown soal, chime selebrasi jawaban benar, dan fanfare megah untuk reveal podium final (royalty-free).

## Environment Variables

| Variable | Keterangan |
|---|---|
| `PORT` | Port server (default: 3000) |
| `BASE_URL` | Override URL publik (opsional; auto-detect RENDER_EXTERNAL_URL di production) |
| `SHEET_CSV_URL` | URL CSV publish-to-web Google Sheets (legacy fallback) |
| `SPREADSHEET_ID` | ID Google Spreadsheet utama |
| `DRIVE_ROOT_FOLDER_ID` | ID folder root di Google Drive (service account) |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | JSON credentials service account (string JSON) |
| `AUTH_SPREADSHEET_ID` | Wajib: spreadsheet akun privat, tidak dipublikasikan ke web |
| `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_NAME` | Identitas super admin pertama |
| `BOOTSTRAP_ADMIN_PASSWORD` | Password awal dengan huruf besar, huruf kecil, angka, dan simbol; hapus setelah bootstrap |
| `NODE_ENV` | `production` untuk cookie Secure; gunakan HTTPS |
| `TRUST_PROXY` | `1` hanya bila ada satu reverse proxy tepercaya |

Panduan konfigurasi dan batas operasional: [SETUP-V2.md](SETUP-V2.md). OAuth, `SUPER_ADMIN_EMAILS`, `DEFAULT_OWNER_EMAIL`, `ENCRYPTION_KEY`, dan `SESSION_SECRET` dari rencana lama bukan kebutuhan implementasi akun saat ini.

## Evidence on Hand

- File prompt fitur (di root project): `prompt-v2-login-ownership.md`, `prompt-v2-media-upload.md`, `prompt-v2-emoji-reactions.md`, `prompt-tambahan-fitur.md`, `prompt-admin-quizset-cards.md`, `prompt-fitur-akhiri-sesi.md`, dan lainnya.
- Server modules: `server/index.js`, `server/gameState.js`, `server/sheetsLoader.js`, `server/driveService.js`, `server/excelReportService.js`.
- Template CSV: `quiz_template.csv`.

## Product Principles

1. **Attention Lives in the Room:** HP peserta adalah controller ergonomis; semua pertanyaan, media, timer, dan drama sosial berlangsung di proyektor. Teks soal muncul di player sebagai dukungan, bukan pengganti proyektor.
2. **Zero-Friction Entry:** Tanpa instalasi, tanpa login peserta; scan QR code, isi nickname, masuk lobby dalam under 5 detik.
3. **Non-Technical Content Ownership:** Trainer mengelola soal dari halaman `/admin` di dalam aplikasi — tanpa harus membuka Google Sheets secara langsung.
4. **The Facilitator Controls the Pace:** Game tidak pernah autopilot tanpa izin host; toggle Mode Autoplay ada di tangan host dan bisa diubah kapan saja.
5. **Resilient Simplicity:** Node.js tunggal, tanpa database terpisah — state game in-memory yang cepat, data soal persistent di Google Sheets.
6. **Secure by Default:** Ownership terikat ID akun internal; kolaborator ditambahkan secara eksplisit; password disimpan sebagai hash scrypt dalam spreadsheet privat. Sesi dicabut saat password/status akses berubah.

## Accessibility & Inclusion

- **Shape + Color Dual Encoding:** Tombol jawaban player memadukan warna (Magenta/Biru/Cyan/Hijau) dengan bentuk geometri unik (Hexagon/Chevron/Bintang/Segitiga) sehingga peserta dengan buta warna dapat berpartisipasi penuh.
- **Touch-First Mobile Ergonomics:** Target tap raksasa dan indikator kontras tinggi untuk respons cepat dan bebas lelah selama countdown.

## Spreadsheet Schema

### Sheet Soal Utama
| Kolom | Tipe | Keterangan |
|---|---|---|
| `question` | Teks | Teks pertanyaan |
| `option_a` | Teks | Pilihan A |
| `option_b` | Teks | Pilihan B |
| `option_c` | Teks | Pilihan C |
| `option_d` | Teks | Pilihan D |
| `correct_answer` | Huruf | `a`, `b`, `c`, atau `d` |
| `duration_seconds` | Angka | Durasi countdown (15/20/30) |
| `image_url` | URL | Link gambar (opsional) |
| `video_url` | URL | Link YouTube/video (opsional) |
| `quiz_set` | Teks | Nama kelompok kuis |
| `last_updated` | ISO string | Diisi otomatis oleh server saat append/update |

### Spreadsheet Akun Privat (`AUTH_SPREADSHEET_ID`)

| Tab | Kolom |
|---|---|
| `AccountsV2` | `id`, `username`, `name`, `password_hash`, `role`, `status`, `must_change_password`, `created_at`, `reviewed_at`, `reviewed_by`, `version` |
| `QuizAccessV2` | `quiz_set`, `owner_id`, `collaborators` (ID internal dipisahkan koma) |
| `MediaUploadsV2` | `file_id`, `quiz_set`, `uploaded_by` |

`QuizSetOwners` berbasis email dan `Users` berisi refresh token adalah rencana historis yang digantikan, bukan schema aktif. Tab akun tersembunyi tidak menggantikan pembatasan akses spreadsheet.

## Implementation Status — 25 September 2026

Pembacaan akun dari Sheets digabungkan dan dicache maksimal lima detik; setiap penulisan lokal langsung membatalkan cache, dan kegagalan storage tidak memakai data cache kedaluwarsa. Pengujian tambahan mencakup upload multipart terlarang, perintah socket terautentikasi/anonim/origin asing/sesi dicabut, serta penggabungan dan invalidasi cache.

Akun internal, persetujuan, kepemilikan, kolaborator, sesi host terlindungi, dan media master sudah diimplementasikan. Finish review: **SHIP** untuk UI desktop/mobile; temuan perlindungan variasi URL telah diperbaiki. Suite aplikasi PASS dan pengujian auth terakhir PASS untuk 15 kasus; alur browser dengan data sintetis PASS. Bootstrap dan login superadmin terhadap Sheets nyata PASS, termasuk kewajiban ganti password awal dan logout. Deployment produksi belum dilakukan.

Spreadsheet pilihan pengguna, “Nizhoot v.2”, telah diverifikasi melalui API: revisi tidak dipublikasikan, izin hanya owner/writer, tidak ada izin publik. `AUTH_SPREADSHEET_ID` sudah diatur di `.env` lokal; tab `AccountsV2`, `QuizAccessV2`, dan `MediaUploadsV2` dibuat tanpa mengubah tab lama. Akun `superadmin` aktif dengan password sementara yang wajib diganti; password tidak dicatat di dokumen. Folder master Drive konfigurasi lama mengembalikan `File not found` bagi service account: upload nyata menunggu folder/izin yang valid.

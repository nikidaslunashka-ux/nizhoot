# Nizhoot v2 — Codex Handoff Document

> **Tujuan dokumen ini:** Memberikan konteks penuh kepada Codex (ChatGPT) agar dapat langsung melanjutkan pengembangan Nizhoot v2 tanpa perlu penjelasan berulang. Baca dokumen ini dari atas ke bawah sebelum menulis satu baris kode pun.

---

## 1. Ringkasan Proyek

**Nizhoot** adalah aplikasi kuis multiplayer real-time berbasis web untuk training dan bimtek internal kantor — Kahoot clone tanpa lisensi dan tanpa batas peserta. Dibangun dengan Node.js + Express + Socket.io, frontend vanilla HTML/CSS/JS, data soal di Google Sheets, dan media di Google Drive.

Pengembangan v1 dilakukan di Antigravity (Gemini). Dokumen ini menjembatani transisi ke Codex untuk pengembangan v2.

**Repo lokal:** `f:\Nizhoot`
**Stack:** Node.js 18+, Express 5, Socket.io 4, Googleapis 178, ExcelJS 4, Multer 2, QRCode 1.5
**Deployment target:** Render / Railway free tier (sudah siap, environment-aware)

---

## 2. Arsitektur Dasar (v1; dilanjutkan akun internal v2)

```
/Nizhoot
  ├── server/
  │   ├── index.js              # Express + Socket.io server (26KB — main file)
  │   ├── gameState.js          # Room management, timer, scoring formula (18KB)
  │   ├── sheetsLoader.js       # Google Sheets API read/write + CSV fallback (16KB)
  │   ├── driveService.js       # Google Drive API upload/delete service (9KB)
  │   └── excelReportService.js # Ekspor hasil sesi ke Excel (18KB)
  ├── public/
  │   ├── host/                 # Tampilan proyektor (/host)
  │   │   ├── index.html
  │   │   ├── host.css
  │   │   └── host.js
  │   ├── player/               # Tampilan HP peserta (/player)
  │   │   ├── index.html
  │   │   ├── player.css
  │   │   └── player.js
  │   ├── admin/                # Dashboard admin (/admin)
  │   │   ├── index.html
  │   │   └── admin.js
  │   ├── shared/
  │   │   └── soundFX.js        # Web Audio API + MP3 fallback engine
  │   └── assets/
  │       ├── images/nizhoot-logo.png
  │       └── sounds/           # lobby.mp3, countdown.mp3, correct.mp3, wrong.mp3, fanfare.mp3
  ├── test/
  │   └── verify.js + test_*.js # Automated verification tests
  ├── .env                      # Secrets (jangan commit)
  ├── .env.example              # Template env vars
  ├── PRODUCT.md                # Konteks produk lengkap (baca ini)
  ├── DESIGN.md                 # Design system lengkap (baca ini)
  ├── quiz_template.csv
  └── package.json
```

### Socket.io Events (Existing)

| Event | Arah | Keterangan |
|---|---|---|
| `host:join` | client→server | Host terhubung ke room |
| `player:join` | client→server | Peserta bergabung dengan PIN + nickname |
| `host:start` | client→server | Host mulai kuis |
| `host:next` | client→server | Host lanjut ke soal berikutnya (mode manual) |
| `player:answer` | client→server | Peserta kirim jawaban |
| `game:question` | server→all | Broadcast soal aktif |
| `game:result` | server→all | Broadcast hasil + distribusi jawaban |
| `game:leaderboard` | server→all | Broadcast leaderboard |
| `game:end` | server→all | Kuis selesai, trigger podium final |
| `player:reaction` | client→server | Peserta kirim emoji (v2 baru) |
| `game:reaction` | server→all | Broadcast emoji ke host (v2 baru) |

### API REST (Existing)

| Endpoint | Method | Keterangan |
|---|---|---|
| `/api/quiz-sets` | GET | Daftar semua quiz_set |
| `/api/questions/:set` | GET | Soal-soal dalam satu set |
| `/api/admin/questions` | POST | Tambah soal baru ke Sheets |
| `/api/admin/questions/:id` | PUT | Update soal |
| `/api/admin/questions/:id` | DELETE | Hapus soal |
| `/api/admin/quiz-sets` | DELETE | Hapus seluruh quiz set |
| `/api/upload/image` | POST | Upload gambar ke Drive |
| `/api/upload/video` | POST | Upload video ke Drive |
| `/api/report/excel` | GET | Download laporan Excel |
| `/qr` | GET | Generate QR code |

---

## 3. Status v2 dan keputusan implementasi

### 3.1 Akun internal — selesai

Keputusan pengguna menggantikan rencana Google OAuth: username/password internal, daftar sendiri → pending → super admin menyetujui → active. `/auth/` menangani masuk/daftar/status/password; `/accounts/` khusus super admin. `server/auth.js` mengelola hash scrypt, sesi HttpOnly delapan jam di memori, pemeriksaan status, CSRF, dan rate limit; `server/accountStore.js` menyimpan data di Sheets privat. `public/shared/account.js` menyediakan navigasi akun dan permintaan API bersama.

### 3.2 Ownership dan kolaborator — selesai

`QuizAccessV2` memakai ID akun internal. Pemilik/super admin menambah atau mencabut username aktif pada `/auth/?view=access`. Kolaborator boleh edit/host tetapi tidak membagikan akses atau menghapus seluruh set. Kuis lama tanpa metadata hanya dapat diakses super admin. Laporan hanya untuk pembuat sesi dan super admin; peserta tetap tanpa login.

### 3.3 Media master — selesai di kode, izin Google belum diuji nyata

Tidak ada token Drive per pengguna. Upload memakai service account ke `DRIVE_ROOT_FOLDER_ID`, dengan folder `Images/<quiz_set>` dan `Videos/<quiz_set>`. Shared Drive Workspace diperlukan untuk upload service account; My Drive pribadi menggunakan upload manual + tempel link sampai integrasi master satu kali ditambahkan. File tercatat di `MediaUploadsV2`; cleanup hanya untuk file terlacak yang tidak direferensikan soal lain setelah penghapusan soal berhasil. Media lama, link manual, dan folder kosong tetap dipertahankan.

`prompt-v2-login-ownership.md` dan `prompt-v2-media-upload.md` adalah **rencana historis yang digantikan**, bukan instruksi implementasi berikutnya. Panduan operasional yang berlaku adalah [SETUP-V2.md](SETUP-V2.md).

### Fitur lain: catatan rencana awal

Bagian 3.4–3.8 di bawah mempertahankan konteks perencanaan sebelumnya. Statusnya perlu dicocokkan dengan kode; jangan menganggap semuanya belum diimplementasi.

### 3.4 Emoji Reactions di Waiting Room

**File prompt:** `prompt-v2-emoji-reactions.md`

- Socket event `player:reaction` (client→server): `{ emoji, playerName }`
- Server broadcast `game:reaction` ke semua client di room.
- Rate-limit server-side: 1 reaksi per 2 detik per player.
- Di layar host: animasi `@keyframes floatUp` — muncul dari bawah, posisi horizontal acak, fade-out 2-3 detik.
- Di layar player: 5-6 tombol emoji di baris kecil, **hanya saat waiting room** — disembunyikan saat kuis mulai.
- Data bersifat **ephemeral** — tidak disimpan ke Sheets/database.

### 3.5 Mode Autoplay

**File prompt:** `prompt-tambahan-fitur.md`

- Toggle switch di layar host: "Mode Manual" (default) vs "Mode Autoplay".
- Saat autoplay aktif: setelah countdown habis → tampilkan hasil selama konstanta `AUTOPLAY_SUMMARY_SECONDS` (default: 5 detik) → lanjut otomatis ke soal berikutnya.
- Toggle terpisah: "Skip jika semua sudah jawab" (default: tunggu sampai waktu habis).
- Bisa di-switch kapan saja di tengah kuis.

### 3.6 Tampilan Teks Soal di Player

**File prompt:** `prompt-tambahan-fitur.md` (Fitur 1)

> **Status:** Kemungkinan sudah diimplementasi sebagian. Verifikasi dulu di `public/player/index.html` dan `public/player/player.js`.

- Layar player menampilkan teks pertanyaan lengkap + 4 pilihan teks (+ warna + bentuk geometri).
- Timer countdown juga muncul di player.
- Gambar/video tetap di host saja (tidak perlu di player untuk hemat bandwidth).
- Sinkronisasi via event Socket.io yang sama (`game:question`).

### 3.7 Tombol Akhiri Sesi

**File prompt:** `prompt-fitur-akhiri-sesi.md`

- Tombol "Akhiri Sesi" di layar host, warna `--danger` (`#EF4444`), posisi terpisah dari tombol "Lanjut".
- Dialog konfirmasi modal sebelum eksekusi.
- Setelah konfirmasi: hentikan timer, emit event ke semua player → loncat ke leaderboard final.
- Leaderboard dihitung dari skor yang sudah terkumpul sampai soal terakhir yang selesai.
- Room ditandai selesai — PIN tidak bisa dipakai join lagi.
- Hanya muncul selama kuis berlangsung (setelah host mulai, sebelum soal terakhir selesai normal).

### 3.8 Restrukturisasi Admin Panel — Grid Quiz Set Cards

**File prompt:** `prompt-admin-quizset-cards.md`

> **Status:** Summary cards mungkin sudah ada. Verifikasi di `public/admin/index.html`.

**Navigasi admin yang diinginkan:**
```
/admin (halaman utama)
  └── Summary cards (statistik keseluruhan)
  └── Grid Quiz Set Cards
       ├── [Card: Set A] → klik → Detail Set A (list soal + form tambah + tombol kembali)
       ├── [Card: Set B] → klik → Detail Set B
       └── [+ Buat Set Kuis Baru] → input nama → Detail Set Baru (kosong)
```

**Isi tiap card:** nama set, jumlah soal, estimasi durasi, preview soal pertama (maks 80 char), tanggal terakhir diedit (dari kolom `last_updated` di Sheets, format relatif).

**Catatan teknis delete:** Google Sheets API tidak support delete by value — harus cari row index dulu, lalu `spreadsheets.batchUpdate` dengan `deleteDimension`. Untuk delete banyak baris sekaligus (delete set), hapus dari index terbesar ke terkecil.

**Kolom `last_updated`:** diisi otomatis oleh server setiap append/update soal — staf tidak perlu isi manual.

---

## 4. Pekerjaan berikutnya

1. Konfigurasikan `AUTH_SPREADSHEET_ID` secara eksplisit ke spreadsheet privat; jangan menaruh akun dalam master soal yang dipublikasikan. ID sama hanya diperbolehkan setelah seluruh dokumen benar-benar privat dan tidak publish-to-web.
2. Bootstrap super admin satu kali sesuai SETUP-V2.md, hapus password bootstrap, lalu ganti password awal melalui aplikasi.
3. Verifikasi Google nyata: daftar/setujui akun uji, buat/edit/hapus soal, upload media ke master Drive dan cek izin.
4. Deploy satu instance dengan HTTPS. Sesi in-memory hilang saat restart; multi-instance memerlukan penyimpanan/locking bersama.
5. Periksa status fitur lama 3.4–3.8 sebelum memilih pekerjaan lanjutan.

Aktualisasi 25 September 2026: spreadsheet “Nizhoot v.2” pilihan pengguna diverifikasi tidak dipublikasikan (revisi `published=false`, izin owner/writer saja). `AUTH_SPREADSHEET_ID` sudah diatur di `.env` lokal. Tab `AccountsV2`, `QuizAccessV2`, dan `MediaUploadsV2` serta akun `superadmin` sudah dibuat. Tab lama `Users` dan `QuizSetOwners` tidak diubah. Login nyata, pembatasan sebelum ganti password, dan logout PASS. Password sementara tidak dicatat di dokumen; pengguna wajib menggantinya. Folder master Drive konfigurasi lama mengembalikan `File not found` untuk service account; minta folder master yang valid/akses yang sesuai sebelum uji upload. Deployment produksi belum dilakukan.

---

## 5. Constraint & Aturan Non-Negosiabel

Codex **wajib** mengikuti constraint ini — tidak boleh dilanggar meski terlihat "lebih mudah":

| # | Constraint | Alasan |
|---|---|---|
| 1 | **Vanilla JS/HTML/CSS only** — tanpa React, Vue, Angular, Svelte, Tailwind, Bootstrap | Ini constraint arsitektur dari awal, bukan pilihan — mengubah ini berarti rewrite total |
| 2 | **Tanpa bundler** — tidak ada Webpack, Vite, Rollup, dsb | File frontend disajikan langsung oleh Express |
| 3 | **Jangan hardcode `localhost`** di URL QR — deteksi IP lokal via `os.networkInterfaces()` saat dev; pakai `RENDER_EXTERNAL_URL` saat production | QR harus bisa di-scan dari HP peserta |
| 4 | **Password hanya hash scrypt; spreadsheet akun privat** — tidak ada password plaintext atau token Drive per pengguna | Keamanan akun internal |
| 5 | **Jangan commit credentials** (`service account JSON`, `.env`) ke Git | `.gitignore` sudah ada, jangan tambahkan file baru yang berisi secret |
| 6 | **Palet warna brand Nizhoot** — A=Magenta `#C724B1`, B=Biru `#1368CE`, C=Cyan `#22D3C5`, D=Hijau `#7ED321` | Jangan pakai palet Kahoot lama |
| 7 | **Bentuk geometri via CSS clip-path** — Hexagon/Chevron/Bintang/Segitiga (lihat DESIGN.md untuk nilai `clip-path`) | Tidak perlu file SVG/gambar terpisah |
| 8 | **Cek kode yang sudah ada sebelum menulis baru** — terutama `server/index.js`, `server/driveService.js`, `public/admin/admin.js` | Fitur mungkin sudah ada sebagian |

---

## 6. Design System Singkat untuk Codex

Warna CSS variables yang digunakan di seluruh proyek:

```css
:root {
  --bg-void: #0B0F19;       /* Background utama */
  --bg-card: #161F30;       /* Card/container */
  --border-subtle: #26354D; /* Border */
  --text-primary: #FFFFFF;  /* Teks utama */
  --text-muted: #94A3B8;    /* Teks muted */
  --brand-magenta: #C724B1; /* Opsi A + aksen primer */
  --brand-blue: #1368CE;    /* Opsi B */
  --brand-cyan: #22D3C5;    /* Opsi C */
  --brand-green: #7ED321;   /* Opsi D */
  --danger: #EF4444;        /* Aksi destruktif */
  --success: #22C55E;       /* Feedback positif */
}
```

Transisi standar: `cubic-bezier(0.16, 1, 0.3, 1)`, durasi 200ms–300ms.

Font: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif` — tanpa Google Fonts.

---

## 7. Environment Variables akun internal

Gunakan `.env.example` dan [SETUP-V2.md](SETUP-V2.md) sebagai panduan aktif:

- `AUTH_SPREADSHEET_ID` wajib, spreadsheet akun privat; tidak ada fallback otomatis ke spreadsheet soal.
- `SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `DRIVE_ROOT_FOLDER_ID`: bank soal dan media master.
- `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PASSWORD`: hanya untuk `npm run bootstrap-admin`; hapus password setelah berhasil.
- `PORT`, `BASE_URL` atau `RENDER_EXTERNAL_URL`, `NODE_ENV=production`; `TRUST_PROXY=1` hanya untuk tepat satu proxy tepercaya.
- `SHEET_CSV_URL` hanya fallback legacy soal, tidak untuk penyimpanan akun atau pemeriksaan sebelum penulisan.

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPER_ADMIN_EMAILS`, `DEFAULT_OWNER_EMAIL`, `ENCRYPTION_KEY`, dan `SESSION_SECRET` pada prompt lama bukan requirement akun internal saat ini.

---

## 8. Testing & Verifikasi

Jalankan test suite yang sudah ada setelah setiap perubahan:
```bash
npm test
```

File test: `test/verify.js`, `test/test_avatar_lucide.js`, `test/test_edit_question.js`, `test/test_production_qr.js`, `test/test_excel_export.js`.

**Checklist verifikasi manual untuk tiap fitur v2:**

- [x] `npm test` PASS, termasuk 15 kasus auth dengan storage tiruan; alur browser sintetis PASS. Tambahan mencakup kontak bantuan publik yang hanya dapat diubah super admin, multipart upload terlarang, socket terautentikasi/anonim/origin asing/sesi dicabut, serta penggabungan/invalidation cache.
- [x] Tindak lanjut critique: kontak bantuan dapat diatur di Kelola pengguna (AppSettingsV2); petunjuk dan error per kolom; draft nama/username serta fokus perpindahan form; ruang header lebih ringkas di desktop pendek. Browser memverifikasi pendaftaran, fokus, draft, kontak, approval, reset, dan ganti password wajib.
- Pembacaan AccountStore digabungkan dan dicache maksimal lima detik; penulisan lokal langsung membatalkan cache. Tidak ada fallback ke data kedaluwarsa saat storage gagal.
- [x] Finish review **SHIP** untuk UI desktop/mobile; temuan perlindungan variasi URL diperbaiki.
- [x] Screenshot QA: `.impeccable/review/desktop.png`, `mobile.png`, `desktop-accounts.png`, `mobile-accounts.png`, `mobile-pending.png`.
- [ ] Konfigurasi akun privat dan bootstrap super admin pada Google nyata.
- [ ] Daftar → setujui → login → buat/edit/hapus soal dengan akun uji pada Google nyata.
- [ ] Upload/cleanup media master dan verifikasi deployment HTTPS satu instance.

Checklist fitur lama berikut dipertahankan sebagai referensi, bukan hasil uji baru:

- [ ] Emoji: join beberapa peserta ke waiting room → klik emoji → muncul animasi di layar host
- [ ] Rate-limit emoji: klik emoji cepat berulang → tombol sesaat ter-disable, tidak spam ke host
- [ ] Autoplay: aktifkan toggle → setelah countdown habis → soal berganti otomatis tanpa klik
- [ ] Akhiri Sesi: di tengah soal ke-3 dari 7 → klik "Akhiri Sesi" → konfirmasi → semua device loncat ke leaderboard final
- [ ] Akhiri Sesi (batal): klik "Akhiri Sesi" → klik "Batal" → kuis lanjut normal

---

## 9. Dokumen Referensi di Repo

File-file ini di root repo berisi spesifikasi lengkap per fitur — baca saat butuh detail:

| File | Konten |
|---|---|
| `PRODUCT.md` | Konteks produk, users, prinsip, schema spreadsheet |
| `DESIGN.md` | Design system, surface specs, komponen, absolute bans |
| `SETUP-V2.md` | Panduan aktif akun internal, schema, bootstrap, dan media master |
| `prompt-v2-login-ownership.md` | Historis: rencana OAuth yang telah digantikan |
| `prompt-v2-media-upload.md` | Historis: rencana Drive per pengguna yang telah digantikan |
| `prompt-v2-emoji-reactions.md` | Spec detail emoji reactions |
| `prompt-tambahan-fitur.md` | Spec: teks soal di player, autoplay, admin panel, rebranding |
| `prompt-fitur-akhiri-sesi.md` | Spec tombol akhiri sesi |
| `prompt-admin-quizset-cards.md` | Spec restrukturisasi grid admin panel |

---

## 10. Cara Memulai di Codex

1. **Baca `PRODUCT.md`** — pahami produk, users, dan spreadsheet schema.
2. **Baca `DESIGN.md`** — pahami visual direction, warna, bentuk, dan absolute bans.
3. **Baca dokumen ini** sampai selesai.
4. **Baca SETUP-V2.md dan inspeksi kode** — terutama `server/auth.js`, `server/accountStore.js`, `server/index.js`, `server/driveService.js`, dan halaman akun/admin.
5. **Lanjutkan pekerjaan operasional pada bagian 4**; jangan menghidupkan kembali rencana OAuth/per-user Drive tanpa keputusan pengguna baru.
6. **Ikuti constraint** di bagian 5 — tidak ada pengecualian.
7. **Jalankan `npm test`** setelah setiap fitur selesai.

---

*Dokumen ini dibuat di Antigravity (Gemini) — 24 September 2026. Untuk pertanyaan tentang keputusan desain sebelumnya, rujuk ke file `prompt-*.md` di root repo.*

### Penyelesaian audit akun (25 September 2026)
Kelima temuan audit diselesaikan: lifecycle dialog aman selama request, retry daftar membersihkan error, target navigasi44px, logo akun WebP16.9KB, token state konsisten. `test/browser-auth.cjs` PASS mencakup error503/retry dan respons approval tertunda dengan Escape. Server menyajikan perubahan frontend langsung; cukup refresh browser. Tidak memerlukan restart backend.

- Menu akun telah dipindahkan ke header sebagai disclosure profil dengan avatar inisial. Alur browser dan pemeriksaan screenshot desktop/mobile PASS; cukup refresh frontend.

### Pengaturan akun — 25 September 2026
- Menu profil → Pengaturan akun (`/auth/?view=settings`) berisi Profil (nama/foto), Username (konfirmasi password saat ini), dan Keamanan (ganti password). Setiap bagian disimpan terpisah. Nama/foto berasal dari sesi, tidak menerima target ID dari browser.
- Foto lokal JPG/PNG/WebP maksimal2MB dipotong tengah dan diperkecil128×128 WebP sebelum disimpan, maksimal40000 karakter data URL; raster WebP diverifikasi server. Tidak ada hosting foto publik baru. Hapus foto mengembalikan avatar inisial.
- Username dinormalisasi lowercase,3–32 karakter, unik; penyimpanan serial, password dikonfirmasi, versi sesi berubah dan sesi lain dicabut. Kepemilikan tetap menggunakan ID akun.
- AccountsV2 menambah kolom L `photo`. Migrasi hanya menambahkan header jika sebelas kolom lama persis cocok; schema lain tetap ditolak. Foto kecil disimpan privat bersama akun di Sheets.
- Verifikasi16 tes auth PASS dan browser PASS (edit nama, foto persisten setelah reload, ganti username, approval/reset/password). Server lokal dimuat ulang, sesi perlu login kembali.

### Kolaborator terintegrasi pada kuis — 25 September 2026
- Buat paket menyimpan metadata QuizAccessV2 sejak awal (kuis kosong tetap muncul), dengan pilihan akun aktif melalui pencarian nama/username. Daftar hasil maksimal20 per pencarian; pilihan unik maksimal100. Pemilik tidak diduplikasi sebagai kolaborator.
- Editor menyediakan Kelola kolaborator untuk pemilik/super admin. Kolaborator boleh menambah/mengedit soal dan menjalankan sesi; tidak menghapus paket atau membagikan akses. Kartu menampilkan pemilik (Anda untuk pemilik),3 nama kolaborator dan disclosure +N lainnya.
- API baru: GET /api/access/users, POST /api/access/sets, PUT /api/access/sets. Payload pengguna hanya id/nama/username. Duplikasi nama kuis ditolak case-insensitive. Penghapusan paket juga mengosongkan metadata agar tidak muncul sebagai paket kosong.
- Kuis lama tanpa metadata tampil Pemilik: Belum ditetapkan. Saat super admin pertama kali menyimpan daftar kolaborator untuk kuis lama, metadata pemilik mengikuti mekanisme sebelumnya yaitu super admin yang menyimpan.
-17 pengujian auth PASS termasuk tambah soal oleh kolaborator, kuis kosong, identitas, penolakan modifikasi akses/hapus paket dan revocation. Browser sintetis PASS untuk create, search,4 pilihan, +N, edit akses, dan tampilan pemilik dari sisi kolaborator.

### Reaksi emoji lobby
Peserta dapat mengirim 👍 😂 🎉 🔥 😮 ❤️ hanya setelah bergabung dan selama LOBBY. Server memvalidasi anggota berdasarkan socket, allowlist emoji, dan cooldown2detik per socket. Reaksi dibroadcast ke room yang sama, tanpa nama dari client, tanpa penyimpanan Sheets. Host/peserta menampilkan animasi2.8detik, maksimal18 item visual; dibersihkan saat keluar lobby/disconnect. Reduced-motion memakai emoji statis sementara. UI48px, feedback pengiriman/cooldown/koneksi, grid3×2 pada ponsel. `test/browser-reactions.cjs` PASS: host/player, isolasi room, membership, invalid emoji, cooldown, state guard, cleanup, reduced-motion.

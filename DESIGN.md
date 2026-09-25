# Design System — Nizhoot v2

<!-- impeccable:design-schema 1 -->

## 1. Visual Direction: "The Arena"

Nizhoot menggabungkan energi game-show interaktif dengan kejelasan visual ala Swiss typography. Dirancang khusus untuk dinamika **Dual-Screen** (Proyektor Host + HP Peserta) tanpa dependensi library CSS atau framework frontend eksternal. Semua efek visual murni CSS + Vanilla JS.

- **Tone & Mood:** Kompetitif, energik, tajam, bersih, dan bersemangat.
- **Stage Contrast:** Gelap panggung (*deep navy/slate*) pada layar host proyektor agar teks dan warna opsi mencolok dari jarak jauh.
- **Controller Ergonomics:** Layar HP peserta menampilkan teks pertanyaan lengkap, 4 tombol jawaban 2×2 raksasa dengan teks + bentuk geometri CSS clip-path + warna brand.

---

## 2. Color Palette & Shape Dual-Encoding (Resmi Nizhoot)

Palet warna dan bentuk selaras penuh dengan logo resmi Nizhoot (`public/assets/images/nizhoot-logo.png`):

| Opsi | Bentuk | Hex | Nama Warna | CSS `clip-path` |
|---|:---:|---|---|---|
| **A** | ⬡ Hexagon | `#C724B1` | Magenta Vivid | `polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)` |
| **B** | ▶ Chevron | `#1368CE` | Electric Blue | `polygon(0% 0%, 70% 0%, 100% 50%, 70% 100%, 0% 100%, 30% 50%)` |
| **C** | ★ Bintang | `#22D3C5` | Cyan Turquoise | `polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)` |
| **D** | ▲ Segitiga | `#7ED321` | Spring Green | `polygon(50% 0%, 0% 100%, 100% 100%)` |

### Brand Assets & Neutrals

| Token | Value | Keterangan |
|---|---|---|
| `--bg-void` | `#0B0F19` | Background utama host & player |
| `--bg-card` | `#161F30` | Container / card |
| `--border-subtle` | `#26354D` | Border halus |
| `--text-primary` | `#FFFFFF` | Teks utama |
| `--text-muted` | `#94A3B8` | Teks sekunder / muted (Slate 400) |
| `--brand-magenta` | `#C724B1` | Aksen brand primer |
| `--brand-blue` | `#1368CE` | Aksen brand sekunder |
| `--brand-cyan` | `#22D3C5` | Aksen brand tersier |
| `--brand-green` | `#7ED321` | Aksen brand keempat |
| `--danger` | `#EF4444` | Aksi destruktif (tombol Akhiri Sesi, hapus) |
| `--success` | `#22C55E` | Feedback positif |

---

## 3. Tipografi

Menggunakan sistem font native agar cepat dimuat tanpa request font eksternal:

- **Font Stack:** `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`
- **Angka Display (PIN, Timer, Skor):** `font-weight: 800` / `900`, tabular figures (`font-variant-numeric: tabular-nums`)
- **Teks Pertanyaan (Host):** `clamp(1.75rem, 3.5vw, 3rem)`, `font-weight: 700`, `line-height: 1.25`
- **Teks Pertanyaan (Player):** `clamp(1rem, 4vw, 1.5rem)`, `font-weight: 600`, kontras tinggi di atas dark bg
- **Badge & Status:** Uppercase, `letter-spacing: 0.08em`, `font-weight: 700`
- **Body / Label:** `1rem`, `font-weight: 400`

---

## 4. Spesifikasi Surface

### A. `/host` — Layar Proyektor

#### State: Waiting Room (Lobby)
- Game PIN super besar `clamp(5rem, 12vw, 10rem)` — terbaca dari 10+ meter.
- QR code sentral kontras tinggi, otomatis redirect ke `/player?pin=XXXX`.
- Live avatar/tag peserta yang join dengan micro-bounce animation (`@keyframes bounceIn`).
- Emoji reactions dari peserta: muncul sebagai animasi melayang dari bawah ke atas (`@keyframes floatUp`) di posisi horizontal acak, fade-out dalam 2-3 detik, tidak tersimpan.
- Tombol mencolok **"Mulai Kuis"** di bawah — menggunakan `--brand-magenta` atau gradient brand.

#### State: Question Active
- Timer melingkar (`<svg>` stroke-dasharray animasi) + bar progress horizontal sebagai fallback — transisi merah berkedip di 5 detik terakhir.
- Area media fleksibel (gambar atau YouTube embed `<iframe>`) di tengah; gambar dengan `object-fit: contain` agar tidak terpotong.
- Grid 2×2 pilihan jawaban di bagian bawah: warna + clip-path bentuk + teks jawaban.
- **Toggle Mode Autoplay** — switch di pojok host, bisa diaktifkan kapan saja selama kuis berjalan.
- **Tombol "Akhiri Sesi"** — warna `--danger`, posisi terpisah dari tombol "Lanjut" untuk menghindari klik tidak sengaja. Klik memunculkan modal konfirmasi.

#### State: Round Summary & Leaderboard
- Bar chart persentase pilihan peserta per opsi (A/B/C/D) dengan warna + bentuk sesuai skema.
- Jawaban benar di-highlight.
- Leaderboard Top 5 dengan indikator pergeseran ranking (▲/▼).

#### State: Final Podium
- Podium bertingkat juara 1, 2, 3.
- Efek selebrasi: `<canvas>` confetti + fanfare audio.

---

### B. `/player` — Layar Smartphone

#### State: Join Screen
- Logo Nizhoot di tengah atas.
- Input PIN (auto-fill dari query string `?pin=XXXX` jika dari QR) + Input Nickname.
- Tombol **"Masuk"** — full-width, tall touch target.

#### State: Waiting Room (Lobby)
- Tampilan "Menunggu kuis dimulai…" dengan nama/avatar peserta.
- **Emoji Reaction Bar** — baris 5-6 tombol emoji (👍😂🎉🔥😮❤️) dengan gaya visual brand Nizhoot.
  - Rate-limit: 1 reaksi per 2 detik; tombol di-disable sesaat dengan feedback visual jika klik terlalu cepat.
  - Emoji bar **otomatis disembunyikan** saat host memulai kuis.

#### State: Question Active
- Teks pertanyaan lengkap di bagian atas (font mobile-readable, kontras tinggi, `line-height: 1.4`).
- Timer countdown (angka + progress bar horizontal).
- Grid 2×2 tombol jawaban mengisi 70–85% tinggi layar (ergonomis untuk kedua jempol).
  - Setiap tombol: warna latar + clip-path bentuk geometri + teks opsi.
  - Ukuran minimum bentuk: pastikan clip-path tidak terlalu detail di layar kecil — beri padding dalam minimum.

#### State: Feedback
- Jawaban terkirim → tampilkan "Menunggu waktu habis…"
- Setelah soal berakhir: animasi centang hijau (✓) / silang merah (✗) + poin didapat + posisi ranking saat ini.

---

### C. `/admin` — Dashboard Content Creator

#### State: Login
- Akses `/admin` dan `/host` diarahkan ke `/auth/` untuk masuk memakai username/password Nizhoot; akun harus aktif dan sudah mengganti password sementara.
- Tidak bisa akses fitur apapun sebelum login.

#### State: Dashboard Utama (Grid Quiz Set Cards)
- **Summary cards** di bagian atas: total quiz_set, total soal, dll.
- **Grid Quiz Set Cards** — satu card per quiz_set:
  - Nama quiz_set (heading).
  - Jumlah soal + estimasi durasi total.
  - Preview teks soal pertama (maks. 80 karakter, ellipsis).
  - Tanggal terakhir diedit (format relatif: "2 hari lalu").
  - Indikator soal tidak lengkap (opsional).
  - **Ikon trash** di pojok kanan atas card — klik → dialog konfirmasi sebelum delete seluruh set.
  - Card bisa diklik → masuk tampilan Detail Set.
- **Tombol "Buat Set Kuis Baru"** — prominent di pojok kanan atas grid.
- Header akun: nama pengguna internal, Akun saya, Kolaborator, Kelola pengguna (super admin), dan Keluar.
- Super admin melihat semua quiz_set; identitas pemilik menggunakan ID akun internal.

#### State: Detail Quiz Set
- Breadcrumb / tombol "← Kembali" ke grid utama.
- Form tambah soal baru (quiz_set otomatis terisi sesuai set yang sedang dibuka):
  - Teks pertanyaan, 4 pilihan jawaban, pilih jawaban benar, durasi countdown.
  - Toggle **"Upload File"** vs **"Tempel Link"** untuk gambar/video.
  - Upload: ke Google Drive master melalui service account; tampilkan kegagalan upload secara jelas dan pertahankan opsi Tempel Link.
- List semua soal dalam set ini — tiap baris punya tombol **Delete** soal tersebut.
- **Navigasi "Kolaborator"** — buka `/auth/?view=access`; pemilik/super admin menambah atau mencabut username aktif.

#### Transisi Navigasi
- Grid ↔ Detail: CSS transition `opacity + translateY`, durasi 200ms, `cubic-bezier(0.16, 1, 0.3, 1)`.
- Tidak menggunakan router/framework — navigasi dikontrol via JS state + CSS class toggle.

---

## 5. Motion & Sound Grammar

- **Transisi umum:** Snappy CSS `cubic-bezier(0.16, 1, 0.3, 1)`, durasi 200ms – 300ms.
- **Bounce-in peserta:** `@keyframes bounceIn` — `translateY(-12px) → 0`, durasi 350ms, `ease-out`.
- **Float-up emoji reaction:** `@keyframes floatUp` — `translateY(0) opacity(1) → translateY(-120px) opacity(0)`, durasi 2-3 detik, posisi horizontal acak via JS `Math.random()`.
- **Timer tension:** Detik ke-5 ke bawah — timer berkedip merah halus dengan `@keyframes pulse` (scale 1→1.05→1).
- **Jawaban benar/salah:** Scale-in + color overlay instan, durasi 200ms.
- **Confetti podium:** `<canvas>` particles — bukan library eksternal, vanilla JS requestAnimationFrame.

### Audio Hooks
| File | Trigger |
|---|---|
| `lobby.mp3` | Musik santai selama waiting room lobby |
| `countdown.mp3` | Ticking tegang selama soal berlangsung |
| `correct.mp3` | Feedback jawaban benar peserta |
| `wrong.mp3` | Feedback jawaban salah peserta |
| `fanfare.mp3` | Selebrasi podium juara final |

Audio engine: Web Audio API Synthesizer sebagai generator utama + fallback ke file `.mp3` di `/public/assets/sounds/` jika tersedia.

---

## 6. Component Patterns

### Modal / Dialog Konfirmasi (Akhiri Sesi, Delete Quiz Set)
```
┌──────────────────────────────┐
│  ⚠️  Judul Konfirmasi        │
│                              │
│  Teks penjelasan konsekuensi │
│  aksi yang akan dilakukan.   │
│                              │
│  [Batal]    [Ya, Lanjutkan]  │
└──────────────────────────────┘
```
- Backdrop: `rgba(0,0,0,0.7)` blur.
- Container: `--bg-card`, border `--border-subtle`, border-radius `12px`.
- Tombol aksi destruktif: `--danger` (`#EF4444`), label eksplisit.
- Tombol batal: ghost/outline, tidak mencolok.

### Quiz Set Card
```
┌────────────────────────────[🗑]┐
│  📋 Nama Quiz Set              │
│  12 soal · ~8 menit            │
│  "Soal pertama lorem ipsum..." │
│  Diperbarui: 2 hari lalu       │
└────────────────────────────────┘
```
- Background: `--bg-card`, hover: sedikit lebih terang (`#1E293B`).
- Border: `--border-subtle`, border-radius: `12px`.
- Ikon trash: muncul di pojok atas, warna `--text-muted` → `--danger` saat hover.
- Kursorr pointer di seluruh area card.

### Tombol Jawaban Player (2×2 Grid)
```css
.answer-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  border-radius: 12px;
  padding: 16px;
  font-size: clamp(0.85rem, 3vw, 1.1rem);
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  transition: transform 150ms ease, filter 150ms ease;
  min-height: 80px;
}
.answer-btn:active { transform: scale(0.96); filter: brightness(0.85); }
.shape-icon {
  width: 36px;
  height: 36px;
  clip-path: <sesuai opsi>;
  background: rgba(255,255,255,0.85);
}
```

---

## 7. Absolute Bans

- ❌ Jangan pakai library CSS eksternal (Bootstrap, Tailwind, dll).
- ❌ Jangan pakai framework JS (React, Vue, Angular, dll).
- ❌ Jangan tampilkan pertanyaan/jawaban TEKS di layar HOST dalam bentuk opsi teks mentah — gunakan warna + bentuk yang sudah distandardisasi.
- ❌ Jangan gunakan warna jawaban Kahoot lama (merah-biru-kuning-hijau ala Kahoot) — selalu gunakan palet brand Nizhoot.
- ❌ Jangan hardcode `localhost` di URL QR code — selalu gunakan IP lokal saat dev, domain deploy saat production.
- ❌ Jangan simpan password plaintext atau mengirim hash ke browser; spreadsheet akun wajib privat.
- ❌ Jangan commit file JSON service account credentials ke repo.


## Components

### Gerbang akun internal dan persetujuan (implemented)

Perluasan **The Arena** mempertahankan navy, biru, cyan, dan font sistem. Kontrak arah pada `public/auth/index.html`: satu gerbang akun dengan status persetujuan jelas; daftar, lihat status, lalu mulai mengelola kuis setelah disetujui. Tidak ada OAuth pengguna atau identitas visual baru.

- `/auth/`: penjelasan di kiri dan satu form berlabel di kanan; shell maksimum 1120px, padding 32px, dua kolom dengan gap 80px. Heading `clamp(2rem, 4vw, 3rem)` dan line-height 1.15. Pada maksimum 700px menjadi satu kolom, padding 24px 20px, gap 24px, langkah pengantar disembunyikan.
- Permukaan form navy `#161F30`, border `#26354D`, radius 12px; input berlatar `#0B0F19`, border `#56667e`, radius 8px, tinggi minimum 48px. Teks sekunder akun `#a9b8ce` merupakan penyesuaian lokal untuk keterbacaan, bukan penggantian muted global.
- Tombol utama biru `#1368CE`, hover `#105bb5`; tinggi minimum tombol 44px. Fokus cyan `#22D3C5` 3px dengan offset 4px. Transisi background 180ms ease dimatikan saat reduced motion.
- Status pending, rejected, dan disabled memakai judul/pesan eksplisit, identitas, Periksa status, dan Keluar. Pendaftaran menyatakan kebutuhan persetujuan sebelum submit. Password memiliki tombol ikon mata/mata dicoret di dalam sisi kanan input, dengan label aksesibel Tampilkan/Sembunyikan; reset memerlukan password baru sebelum dashboard.
- `/accounts/`: filter status (awal pending), pencarian nama/username, Muat ulang, daftar dengan identitas/status/aksi. Baris tiga kolom turun ke satu kolom pada 700px. Pesan kosong, loading, gagal, dan hasil aksi menggunakan teks; tidak mengandalkan warna saja.
- Header akun memakai tombol outline **Gabung kuis** dengan ikon masuk menuju `/player`, tinggi minimum 44px. Toggle password memakai ikon mata saat tersembunyi dan mata dicoret untuk menyembunyikan teks yang sedang terlihat; target 44px, label/tooltip mengikuti aksi. Aturan password baru: huruf besar, huruf kecil, angka, dan simbol; tanpa minimum 12 karakter, maksimum 128. Password lama tetap diverifikasi saat login.
- Dialog konfirmasi native untuk persetujuan/penolakan/nonaktif/reset menyebut pengguna dan konsekuensi; reset meminta password sementara untuk disampaikan pribadi. Dialog maksimum 480px, tinggi dibatasi viewport, overflow scroll. Akun super admin tidak memiliki aksi reset/nonaktif di daftar.
- Navigasi bersama membungkus pada layar sempit. Semua form memakai label dan feedback status yang dapat dibaca assistive technology.

## Do's and Don'ts

- **Do** pertahankan Arena dan font sistem; gunakan satu form utama dengan status akun yang jelas.
- **Do** bedakan akses peserta tanpa login dari akun pengelola yang memerlukan persetujuan.
- **Don't** tampilkan tombol Login Google, permintaan izin Drive per pengguna, atau input email untuk kolaborator.
- **Don't** tambahkan raster dekoratif: logo `public/assets/images/nizhoot-logo.png` adalah aset incumbent yang digunakan kembali tanpa perubahan; tidak ada raster baru yang dihasilkan.

Finish review akun: **SHIP** pada desktop/mobile setelah perbaikan perlindungan variasi URL. Bukti lokal: `.impeccable/review/desktop.png`, `mobile.png`, `desktop-accounts.png`, `mobile-accounts.png`, dan `mobile-pending.png`. Screenshot adalah bukti QA, bukan aset produk. Bootstrap dan login terhadap Google Sheets nyata terverifikasi pada 25 September 2026. Upload master Drive tertahan oleh folder yang tidak dapat diakses; deployment produksi belum dilakukan.

### Perbaikan alur akun — 25 September 2026
- Kontak bantuan persisten di bawah form; konfigurasi melalui disclosure pada Kelola pengguna, khusus super admin.
- Error per kolom memakai aria-describedby/aria-invalid, fokus ke error pertama; perpindahan masuk/daftar memfokuskan judul dan mempertahankan draft nonrahasia.
- Desktop tinggi <=800px mengurangi ruang header; mobile mempertahankan satu kolom. Browser desktop 1280x720 dan mobile 390px diperiksa, alur akun dan pengaturan kontak PASS.


### Tindak lanjut audit teknis — 25 September 2026
- Dialog tindakan admin mengunci dismiss/submit selama mutasi, menampilkan Memproses, dan memakai snapshot pengguna/tindakan; pesan hasil tidak mengikuti selection baru.
- Error pemuatan daftar memiliki region alert terpisah dan dibersihkan setelah retry berhasil; pesan hasil tindakan tetap tersedia.
- Tautan navigasi akun dan kembali memiliki target minimum44px. State kontrol memakai token semantik warna.
- Logo akun `/assets/images/nizhoot-logo-account.webp`: turunan mekanis dari aset proyek `/assets/images/nizhoot-logo.png`, diperkecil dengan Sharp ke300×200, WebP quality85; 16,918 byte dari1,515,957 byte. Identitas dan sumber asli dipertahankan. Dimensi HTML disediakan untuk reservasi ruang. Tidak ada aset generatif baru.
- Verifikasi: alur browser sintetis PASS termasuk slow-response/Escape/dismiss dan retry daftar; ukur320/390/768/1280px tanpa overflow login/daftar, navigasi>=44px, inspeksi visual desktop/mobile PASS. Audit ulang terarah menutup kelima temuan; bukan sertifikasi WCAG atau pengukuran Core Web Vitals lapangan.

### Menu profil bersama — 25 September 2026
Navigasi akun kini disclosure profil pada header yang ada, menggantikan bar penuh terpisah. Pemicu44px memakai avatar inisial, nama terpotong jika panjang, dan penanda buka. Panel memuat identitas, Akun saya, Kolaborator, Kelola pengguna khusus super admin, serta Keluar. Gunakan semantik disclosure (button aria-expanded/aria-controls dan tautan biasa), bukan role menu tanpa navigasi keyboard khusus. Escape memulihkan fokus; klik luar/perpindahan fokus menutup panel. Palet Navy Arena tetap digunakan; tidak ada aset baru. Verifikasi browser desktop1280 dan mobile390, keyboard Escape, navigasi peran dan logout PASS; screenshot `.impeccable/review/profile-*.png`. Batas lingkup: header/menu akun, bukan redesign dashboard.

- Navigasi kembali dashboard pada ganti password/kolaborator ditempatkan sebelum judul form, dengan panah kiri dan target44px; terpisah dari Keluar. Tautan tidak ditampilkan selama wajib ganti password. Browser alur akun PASS; screenshot mobile dan tautan unik44px diverifikasi.

- Form ganti password menampilkan identitas dari sesi aktif sebelum kolom: avatar inisial, nama, dan @username dengan label Mengubah password untuk. Identitas bukan input yang dapat diubah. Petunjuk onboarding disembunyikan saat sudah masuk; intro password membahas keamanan dan konsekuensi sesi. Browser memverifikasi identitas Rina Pratiwi/@demo.trainer sesuai sesi, langkah onboarding tersembunyi, dan ganti password berhasil.

### Halaman pengaturan akun
Menu profil menggunakan label Pengaturan akun. Form memiliki navigasi Profil / Username / Keamanan, target44px, simpan per bagian. Avatar64px di editor; nama dan username tetap teks aman. Foto dari unggahan pengguna, dipotong tengah128px WebP; tanpa aset eksternal. Form username menjelaskan perubahan login dan sesi lain serta meminta password saat ini. Link kembali pada halaman password mengarah ke Pengaturan akun. Mobile390px diperiksa; alur browser PASS.

- Keamanan kini tombol bagian yang konsisten dengan Profil/Username, membuka form password dalam Pengaturan akun. Menampilkan identitas akun, konsekuensi sesi, dan sukses tanpa redirect; kolom password dikosongkan setelah berhasil. Alur wajib ganti password tetap terpisah. Keterangan foto menjadi block, tombol Hapus foto pada baris tersendiri dengan jarak16px. Browser memverifikasi jarak, state aktif, perubahan password dan keberlanjutan sesi.

### Kolaborasi kuis
Pertahankan Navy Arena dan struktur kartu. Metadata pemilik/kolaborator berada sesudah ringkasan soal; maksimal3 nama lalu disclosure +N yang tidak membuka kartu saat ditekan. Editor punya aksi Kelola kolaborator untuk pemilik/super admin. Modal pembuatan/pengelolaan memakai pencarian nama/username, chip yang bisa dihapus, hasil tombol44px, status loading/empty/error, penjagaan fokus dan busy. Lebar modal menyisakan16px tepi mobile. Satu penyimpanan menulis metadata kosong maupun pilihan anggota; identitas disimpan sebagai ID sehingga perubahan username tidak memutus akses. Screenshot mobile/desktop di .impeccable/review/quiz-*.png, browser dan tes otorisasi PASS.

### Reaksi ruang tunggu
Gunakan emoji Unicode dalam tombol48px bergaya Navy Arena; tidak perlu aset gambar. Enam pilihan, dua baris di ponsel. Layer dekoratif pointer-events:none/aria-hidden; hanya status pengiriman lokal diumumkan. Animasi transform/opacity2.8detik, tanpa gerakan pada reduced-motion; maksimal18 elemen, dibersihkan otomatis. Berlaku sebelum kuis dimulai dan tidak memengaruhi skor.

- Tombol navigasi Bank soal pada Pengaturan akun dan header host memakai komponen CSS navigation-button bersama: ikon panah kiri20px, label Bank soal, tinggi minimal44px, outline sekunder dan focus ring. Margin penempatan terpisah dari gaya tombol. Ukuran, padding, border, font dan warna dibandingkan di browser.

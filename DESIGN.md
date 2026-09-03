# Design System — Nizhoot

<!-- impeccable:design-schema 1 -->

## 1. Visual Direction: "The Arena"
Nizhoot menggabungkan energi game-show interaktif dengan kejelasan visual ala Swiss typography. Dirancang khusus untuk dinamika **Dual-Screen** (Proyektor Host + HP Peserta) tanpa dependensi library eksternal.

- **Tone & Mood:** Kompetitif, energik, tajam, bersih, dan bersemangat.
- **Stage Contrast:** Gelap panggung (*deep navy/slate*) pada layar host proyektor agar teks dan warna opsi mencolok dari jarak jauh.
- **Controller Ergonomics:** Layar HP peserta menampilkan teks pertanyaan lengkap, media gambar/video, dan 4 tombol jawaban 2x2 raksasa dengan teks + bentuk geometri CSS clip-path.

---

## 2. Color Palette & Shape Dual-Encoding (Resmi Nizhoot)
Menggunakan palet warna dan bentuk baru yang selaras dengan logo resmi Nizhoot (`nizhoot-logo.png`):

| Opsi | Bentuk | Hex | Nama Warna | CSS `clip-path` |
|---|:---:|---|---|---|
| **A** | ⬡ Hexagon | `#C724B1` | Magenta Vivid | `polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)` |
| **B** | ▶ Chevron | `#1368CE` | Electric Blue | `polygon(0% 0%, 70% 0%, 100% 50%, 70% 100%, 0% 100%, 30% 50%)` |
| **C** | ★ Bintang | `#22D3C5` | Cyan Turquoise | `polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)` |
| **D** | ▲ Segitiga | `#7ED321` | Spring Green | `polygon(50% 0%, 0% 100%, 100% 100%)` |

### Brand Assets & Neutrals
- **Logo Resmi:** `public/assets/images/nizhoot-logo.png` (chat bubble gradient magenta-ke-biru dengan checkmark cyan-ke-hijau).
- **Background Utama (Host & Player):** `#0B0F19` (Deep Stage Void)
- **Container / Card:** `#161F30` dengan border halus `#26354D`
- **Teks Primer:** `#FFFFFF`
- **Teks Sekunder / Muted:** `#94A3B8` (Slate 400)
- **Player Background:** `#0B0F19` dengan viewport ergonomis mobile browser

---

## 3. Tipografi
Menggunakan sistem font native agar cepat dimuat tanpa request font eksternal:
- **Font Stack:** `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`
- **Angka Display (PIN, Timer, Skor):** `font-weight: 800` / `900`, tabular figures (`font-variant-numeric: tabular-nums`)
- **Teks Pertanyaan (Host):** `clamp(1.75rem, 3.5vw, 3rem)`, `font-weight: 700`, line-height `1.25`
- **Badge & Status:** Uppercase, tracking lebar (`letter-spacing: 0.08em`), font-weight 700

---

## 4. Spesifikasi Surface

### A. Layar Host (/host — Proyektor)
1. **Lobby State:**
 - Game PIN super besar (terbaca dari 10+ meter)
 - QR Code sentral kontras tinggi (otomatis redirect ke /player?pin=XXXX)
 - Live avatar/tag peserta yang join dengan micro-bounce animation
 - Tombol manual "Mulai Kuis" yang mencolok
2. **Question State:**
 - Timer melingkar / bar progres countdown horizontal dengan aksen transisi warna
 - Area media fleksibel (support gambar atau YouTube embed) di tengah
 - Grid 2x2 pilihan jawaban di bagian bawah dengan warna + bentuk + teks jawaban
3. **Round Summary & Leaderboard:**
 - Bar chart persentase pilihan peserta per opsi (A/B/C/D)
 - Leaderboard Top 5 dengan indikator pergeseran ranking (▲/▼)
4. **Final Podium:**
 - Podium juara 1, 2, 3 bertingkat dengan efek selebrasi visual

### B. Layar Player (/player — Smartphone)
1. **Join Screen:**
 - Input PIN (auto-fill jika dari QR) + Input Nickname + Tombol "Masuk"
2. **Answer Grid:**
 - Layout 2x2 mengisi 85% tinggi layar HP (ergonomis untuk kedua jempol)
 - HANYA menampilkan 4 warna + 4 bentuk geometris (tanpa teks pertanyaan)
3. **Feedback State:**
 - State "Jawaban Terkirim — Menunggu Waktu Habis"
 - Animasi hasil instan (Centang Hijau / Silang Merah + Poin didapat + Posisi saat ini)

### C. Layar Admin (/admin — Ringkas)
- Tampilan list set kuis dari Spreadsheet CSV, status sinkronisasi, dan tombol "Test Fetch Spreadsheet".

---

## 5. Motion & Sound Grammar
- **Transisi:** Snappy CSS transitions `cubic-bezier(0.16, 1, 0.3, 1)` durasi 200ms - 300ms
- **Timer Tension:** Detik ke-5 ke bawah, timer berkedip halus merah dengan scaling pulse
- **Audio Hooks:**
  - `lobby.mp3`: Musik santai saat menunggu pemain di lobby
  - `countdown.mp3`: Ticking tegang selama soal berlangsung
  - `correct.mp3` & `wrong.mp3`: Efek audio jawaban
  - `fanfare.mp3`: Efek suara selebrasi podium juara

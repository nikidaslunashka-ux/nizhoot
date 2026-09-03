# ⚡ Nizhoot — Aplikasi Kuis Interaktif Real-Time (Internal Kahoot Clone)

Aplikasi kuis interaktif multiplayer real-time berbasis web untuk pelatihan/bimtek internal kantor.
Peserta bergabung melalui browser HP masing-masing tanpa instalasi aplikasi, sementara pertanyaan, countdown timer, dan leaderboard ditampilkan di layar utama proyektor yang dikendalikan oleh Host.

---

## 🌟 Fitur Utama

1. **Dual-Screen Dynamic ("The Arena")**:
   - **`/host` (Layar Proyektor)**: PIN game raksasa, QR code instan, visual timer melingkar, dukungan gambar & embed video YouTube, statistik bar chart pilihan jawaban, dan podium juara 1-2-3 interaktif lengkap dengan confetti canvas.
   - **`/player` (Gamepad HP)**: 4 tombol responsif warna + bentuk geometris (▲ Merah, ◆ Biru, ● Kuning, ■ Hijau) yang ergonomis untuk jempol. Layar HP tidak menampilkan teks soal agar fokus peserta tetap ke layar proyektor.
   - **`/admin` (Data Inspector)**: Inspeksi set kuis, preview soal, dan sinkronisasi instan dengan Google Sheets.
2. **Integrasi Google Spreadsheet (CSV Publish-to-Web)**:
   - Manajemen bank soal langsung dari Google Sheets tanpa menyentuh kode.
   - Mendukung multi-set kuis dalam satu sheet melalui kolom `quiz_set`.
   - Durasi countdown dinamis per soal melalui kolom `duration_seconds`.
3. **Zero-Build Vanilla Architecture**:
   - Backend: Node.js + Express + Socket.io.
   - Frontend: Vanilla HTML5, CSS3, dan JavaScript murni (tanpa React/Vue, tanpa webpack/vite).
   - In-memory state: Ringan, cepat, dan cocok untuk cloud hosting gratis.
4. **Built-in Sound Engine**:
   - Dilengkapi Web Audio API Synthesizer (musik lobby riang, ticking tegang saat timer countdown, bell sukses, buzzer salah, dan fanfare juara).
   - Otomatis memutar file `.mp3` jika diletakkan di `/public/assets/sounds/`.

---

## 🚀 Cara Menjalankan Secara Lokal

### 1. Prasyarat
- Pastikan sudah terinstal [Node.js](https://nodejs.org/) (versi 18 ke atas).

### 2. Instalasi Dependensi
```bash
npm install
```

### 3. Konfigurasi Environment (`.env`)
Salin `.env.example` menjadi `.env` (sudah disediakan default):
```env
PORT=3000
SHEET_CSV_URL=https://docs.google.com/spreadsheets/d/e/2PACX-1vTroUpzMnECgKIvr4LVjNK5k-WzMZ8DSIDdD8PM61Y6tx4shCqqCVm3mTw35aUzMtGGyH8Ku_JQaS5w/pub?output=csv
```

### 4. Menjalankan Server
```bash
npm start
```
Atau untuk mode development (auto-reload):
```bash
npm run dev
```

Buka di browser:
- 📺 **Host (Proyektor):** [http://localhost:3000/host](http://localhost:3000/host)
- 📱 **Player (Peserta):** [http://localhost:3000/player](http://localhost:3000/player)
- 🛠️ **Admin / Inspeksi Data:** [http://localhost:3000/admin](http://localhost:3000/admin)

### 5. Menjalankan Test Otomatis
```bash
npm test
```

---

## 📊 Format Google Spreadsheet

Untuk membuat bank soal kuis baru:
1. Buat Google Spreadsheet baru.
2. Buat kolom header pada baris pertama persis seperti berikut (tersedia file contoh di [`quiz_template.csv`](quiz_template.csv)):

| Kolom | Tipe | Keterangan |
|---|---|---|
| `question` | Teks | Pertanyaan kuis |
| `option_a` | Teks | Pilihan jawaban A (Merah ▲) |
| `option_b` | Teks | Pilihan jawaban B (Biru ◆) |
| `option_c` | Teks | Pilihan jawaban C (Kuning ●) |
| `option_d` | Teks | Pilihan jawaban D (Hijau ■) |
| `correct_answer` | Huruf | Kunci jawaban: `a`, `b`, `c`, atau `d` |
| `duration_seconds` | Angka | Durasi countdown soal (contoh: `15`, `20`, `30`) |
| `image_url` | URL | Link gambar (opsional) |
| `video_url` | URL | Link YouTube embed / video (opsional) |
| `quiz_set` | Teks | Nama kelompok kuis (contoh: `matematika`, `KKOP`, `Umum`) |

3. Klik menu **File** -> **Bagikan (Share)** -> **Publikasikan ke web (Publish to web)**.
4. Pilih format **Comma-separated values (.csv)** dan klik **Publikasikan**.
5. Salin link CSV tersebut dan masukkan ke variabel `SHEET_CSV_URL` di `.env` atau konfigurasi cloud hosting Anda.

---

## ☁️ Panduan Deploy ke Render / Railway (Free Tier)

Aplikasi ini siap di-deploy secara gratis tanpa database tambahan.

### Deploy ke Render
1. Push repository ini ke GitHub.
2. Buka [dashboard.render.com](https://dashboard.render.com/) dan buat **New Web Service**.
3. Hubungkan repository GitHub Anda.
4. Konfigurasi:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Pada bagian **Environment Variables**, tambahkan:
   - `SHEET_CSV_URL` = (Link CSV Publish-to-web Google Sheet Anda)
6. Klik **Create Web Service**. Aplikasi Anda akan aktif dengan HTTPS dan WebSocket otomatis.

---

## 📁 Struktur Proyek

```
/Nizhoot
  ├── server/
  │   ├── index.js          # Express + Socket.io Server
  │   ├── gameState.js      # Manajemen Room, Peserta, Timer & Formula Skor
  │   └── sheetsLoader.js   # Fetch & Parser CSV Google Spreadsheet
  ├── public/
  │   ├── host/             # Tampilan Proyektor (/host)
  │   │   ├── index.html
  │   │   ├── host.css
  │   │   └── host.js
  │   ├── player/           # Tampilan HP Peserta (/player)
  │   │   ├── index.html
  │   │   ├── player.css
  │   │   └── player.js
  │   ├── admin/            # Tampilan Inspeksi Spreadsheet (/admin)
  │   │   ├── index.html
  │   │   └── admin.js
  │   ├── shared/
  │   │   └── soundFX.js    # Audio Engine Web Audio API + Fallback MP3
  │   └── assets/           # Folder gambar dan audio
  ├── test/
  │   └── verify.js         # Automated Verification Tests
  ├── .env                  # Konfigurasi Port & Sheet URL
  ├── quiz_template.csv     # Template Bank Soal CSV
  ├── PRODUCT.md            # Dokumentasi Prinsip Produk Impeccable
  ├── DESIGN.md             # Spesifikasi Sistem Desain UI
  └── package.json
```

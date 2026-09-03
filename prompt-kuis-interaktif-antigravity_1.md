# Prompt untuk Antigravity — Aplikasi Kuis Interaktif (Kahoot Clone Internal)

## Langkah Awal
Jalankan `impeccable init` terlebih dahulu sebelum mulai membangun UI, agar sistem desain frontend konsisten dari awal.

**taste-skill sudah terpasang** di environment ini (design-taste-frontend). Gunakan prinsip desainnya (kalibrasi warna, hierarki tipografi, spacing, motion) untuk seluruh UI aplikasi ini.

**PENTING — Constraint Stack**: Meskipun taste-skill secara default mengarahkan ke React/Next.js + Tailwind + Framer Motion, proyek ini **HARUS tetap menggunakan HTML/CSS/JavaScript vanilla** (tanpa React, tanpa build step, tanpa framework). Terapkan prinsip desain dari taste-skill tapi implementasikan dengan CSS murni (CSS transitions/animations, CSS Grid/Flexbox) dan vanilla JS DOM manipulation. Alasan: aplikasi ini untuk kebutuhan internal kantor yang harus cepat dibangun, mudah di-deploy (tanpa build step), dan mudah dipelihara oleh non-spesialis frontend.

**Sumber data soal (Google Spreadsheet, CSV publish-to-web):**
```
https://docs.google.com/spreadsheets/d/e/2PACX-1vTroUpzMnECgKIvr4LVjNK5k-WzMZ8DSIDdD8PM61Y6tx4shCqqCVm3mTw35aUzMtGGyH8Ku_JQaS5w/pub?output=csv
```
Gunakan opsi **CSV publish-to-web** (bukan Google Sheets API) — fetch URL di atas dengan library seperti `papaparse`, tidak perlu setup credentials/OAuth Google Cloud sama sekali.

---

## Konteks Proyek

Buatkan aplikasi web kuis interaktif real-time seperti Kahoot, untuk dipakai internal kantor saat kegiatan bimtek/training. Peserta join lewat HP masing-masing (browser, tanpa install apps), sementara soal ditampilkan di layar utama/proyektor yang dikontrol oleh host.

Target: gratis untuk dijalankan, sederhana untuk dipelihara, cukup untuk puluhan peserta dalam satu sesi.

---

## Tech Stack

- **Backend**: Node.js + Express + Socket.io (WebSocket untuk sinkronisasi real-time)
- **Frontend**: HTML + CSS + JavaScript vanilla (tanpa framework/build step), diserve langsung dari backend yang sama
- **State game**: in-memory di server (tidak perlu database eksternal untuk versi awal)
- **Soal kuis**: disimpan di **Google Spreadsheet**, diambil server via CSV publish-to-web (link sudah tersedia, lihat bagian atas)
- **Target hosting**: Render atau Railway (free tier, support persistent WebSocket connection)
- **QR Code**: generate menggunakan library `qrcode` (npm) di sisi server, atau `qrcode.js` di client

---

## Struktur Aplikasi

Tiga jenis tampilan (masing-masing halaman/route terpisah, satu server):

1. **`/host`** — Layar kontrol + tampilan utama (untuk proyektor)
2. **`/player`** — Tampilan di HP peserta
3. **`/admin`** (opsional, boleh simple) — untuk membuat/edit set soal

---

## Alur Penggunaan

1. Host membuka `/host`, pilih set kuis yang mau dijalankan
2. Server generate **kode PIN 4-6 digit** unik + **QR code** yang mengarah ke `/player?pin=XXXX`
3. Layar host menampilkan PIN besar + QR code sambil menunggu peserta join
4. Peserta scan QR (atau ketik PIN manual di `/player`) + masukkan nama, masuk ke waiting room
5. Layar host menampilkan daftar nama yang sudah join secara real-time
6. **Host klik tombol "Mulai"** — kuis tidak mulai otomatis meskipun sudah ada peserta join
7. Musik latar (seperti lobby music Kahoot) diputar selama waiting room, berhenti/berganti saat soal dimulai
8. Untuk setiap soal:
   - Layar host tampilkan: teks soal, gambar/video (jika ada), 4 pilihan jawaban berwarna, timer countdown
   - Layar player tampilkan: HANYA 4 tombol warna/bentuk (tanpa teks soal — mendorong orang lihat layar utama), berubah jadi "sudah menjawab" setelah klik
   - Musik tegang (mirip Kahoot) diputar selama countdown berjalan
   - Skor dihitung berdasarkan kecepatan + ketepatan jawab (semakin cepat & benar, semakin tinggi poin)
9. Setelah waktu habis atau semua sudah jawab: tampilkan jawaban benar + statistik (berapa % pilih tiap opsi) + leaderboard sementara (top 5)
10. Host klik "Lanjut" untuk lanjut ke soal berikutnya (bukan otomatis)
11. Setelah soal terakhir: tampilkan leaderboard final dengan animasi (podium untuk top 3)

---

## Fitur Detail yang Dibutuhkan

### Editor Soal (Google Spreadsheet)
- Soal dikelola langsung di Google Spreadsheet — staf kantor edit soal tanpa perlu masuk ke aplikasi/kode sama sekali, cukup buka Sheets
- Setiap baris = satu soal, dengan kolom:
  | Kolom | Isi |
  |---|---|
  | `question` | Teks pertanyaan |
  | `option_a` / `option_b` / `option_c` / `option_d` | 4 pilihan jawaban |
  | `correct_answer` | Huruf jawaban benar (a/b/c/d) |
  | `duration_seconds` | **Durasi countdown soal ini** (beda-beda tiap baris, misal 20, 30, 15) |
  | `image_url` | Link gambar (opsional, kosongkan jika tidak ada) |
  | `video_url` | Link video/YouTube embed (opsional, kosongkan jika tidak ada) |
  | `quiz_set` | Nama set kuis — supaya satu spreadsheet bisa menampung banyak set kuis berbeda, dipisah lewat kolom ini atau lewat sheet/tab terpisah |
- Server fetch data dari spreadsheet setiap kali host memilih/memulai sesi kuis (bukan real-time selama kuis berjalan, cukup di-fetch sekali saat sesi dibuat)
- **Metode pengambilan data: CSV publish-to-web.** Fetch URL CSV berikut dan parse dengan library seperti `papaparse`:
  ```
  https://docs.google.com/spreadsheets/d/e/2PACX-1vTroUpzMnECgKIvr4LVjNK5k-WzMZ8DSIDdD8PM61Y6tx4shCqqCVm3mTw35aUzMtGGyH8Ku_JQaS5w/pub?output=csv
  ```
  Simpan URL ini sebagai environment variable (`SHEET_CSV_URL`), jangan hardcode di kode.
- Sertakan validasi sederhana: jika baris kosong/tidak lengkap, skip baris tersebut (jangan sampai app crash karena format spreadsheet tidak rapi)

### QR Code untuk Join
- Muncul otomatis di layar host begitu sesi dibuat
- Mengarah langsung ke halaman player dengan PIN sudah terisi otomatis (`/player?pin=1234`)

### Kontrol Host
- Tombol "Mulai Kuis" — manual, kuis tidak berjalan sebelum host klik
- Tombol "Soal Berikutnya" — manual, tidak auto-advance
- Tombol untuk skip/ulangi soal (opsional, nice-to-have)
- Bisa lihat siapa saja yang sudah menjawab secara real-time sebelum waktu habis

### Musik & Efek Suara
- Musik lobby saat waiting room (loop)
- Musik tegang saat countdown soal berjalan (loop, berhenti saat waktu habis)
- Sound effect: saat peserta join, saat jawaban benar/salah muncul, saat leaderboard tampil
- Catatan: gunakan musik/sound royalty-free (bukan asset Kahoot asli) — bisa dari sumber seperti Pixabay Music atau buat placeholder dulu yang bisa diganti nanti

### Leaderboard
- Update real-time tiap habis soal
- Animasi perpindahan posisi (naik/turun ranking)
- Podium khusus di leaderboard final (posisi 1-2-3)

### Player View
- Nama + PIN saat masuk
- Tombol jawaban besar, warna-warni, mudah di-tap di HP
- Feedback visual instan setelah menjawab (benar/salah, poin didapat, posisi ranking sementara)
- Tidak menampilkan teks soal ataupun pilihan jawaban dalam bentuk teks — hanya bentuk/warna yang match dengan layar utama

---

## Struktur File yang Disarankan

```
/quiz-app
  /server
    index.js           # Express + Socket.io server
    gameState.js        # Logic room, skor, state kuis
    sheetsLoader.js      # Fetch & parse soal dari Google Spreadsheet
  .env                  # Berisi SHEET_CSV_URL (link CSV publish-to-web) — jangan hardcode di kode
  /public
    /host
      index.html
      host.js
      host.css
    /player
      index.html
      player.js
      player.css
    /admin
      index.html
      admin.js
    /assets
      /sounds
      /images (untuk gambar soal yang diupload)
  package.json
```

---

## Catatan Teknis Tambahan

- Sediakan template spreadsheet contoh (header kolom sesuai tabel di atas) yang bisa langsung diduplikat oleh staf lain untuk bikin set kuis baru
- Kalau pakai opsi CSV publish-to-web: ingatkan bahwa perubahan di spreadsheet butuh beberapa menit untuk ter-refresh di link publish, jadi sebaiknya host cek dulu data sudah update sebelum mulai sesi
- Gunakan `Socket.io` rooms — setiap sesi kuis (dengan PIN unik) = satu Socket.io room, supaya event broadcast hanya ke peserta di sesi tersebut
- Simpan state game per PIN di object/Map di memory server (contoh: `Map<pin, gameStateObject>`)
- Untuk deploy di Render/Railway free tier, siapkan bahwa server bisa "sleep" saat idle — tambahkan sedikit delay/loading indicator di awal load kalau perlu
- Video upload sebaiknya dibatasi ukurannya atau gunakan embed link (YouTube) untuk menghindari beban storage di free hosting
- Pastikan responsive — layar host didesain untuk layar lebar (proyektor), layar player didesain untuk HP (portrait)

---

## Yang Ingin Saya Lihat Pertama Kali

Mohon bangun dengan urutan prioritas berikut:
1. Setup server + struktur file dasar
2. Integrasi Google Spreadsheet (fetch & parse soal, termasuk template contoh)
3. Alur PIN + QR code + waiting room + host start manual
4. Tampilan soal (host + player) dengan timer per-soal yang bisa diatur (dari kolom `duration_seconds`)
5. Sistem skor + leaderboard
6. Support gambar/video di soal (dari kolom `image_url` / `video_url`)
7. Musik & sound effect (boleh pakai placeholder file dulu)

# Prompt Tambahan untuk Antigravity — Fitur Baru + Bug Fix + Rebranding Nizhoot

## Command yang Dipakai
Jalankan `impeccable shape` (bukan `impeccable init` — itu sudah dilakukan sekali di awal project) untuk merancang brief desain fitur admin panel yang baru, sekaligus penerapan brand baru ke seluruh komponen UI yang sudah ada.

---

## Bug Fix: QR Code Mengarah ke localhost

**Masalah**: QR code saat ini generate URL pakai `localhost:3000`, sehingga tidak bisa diakses dari HP peserta (device lain di jaringan yang sama).

**Perbaikan yang dibutuhkan**:
- Server harus deteksi otomatis alamat IP lokal mesin menggunakan modul `os` bawaan Node.js (`os.networkInterfaces()`), ambil IP yang bertipe IPv4 dan bukan internal (`127.0.0.1`)
- Gunakan IP tersebut (bukan `localhost`) saat generate URL yang di-encode ke QR code
- Tampilkan juga alamat ini secara jelas di layar host (misal: "Buka di HP: `http://10.96.16.92:3000/player` atau scan QR") sebagai fallback kalau QR tidak bisa di-scan
- **Catatan**: kalau nanti sudah deploy ke Render/Railway, base URL harus otomatis pakai domain hosting (bukan IP lokal lagi) — pastikan logic ini environment-aware (development pakai IP lokal, production pakai domain deploy)

---

## Fitur 1: Tampilkan Pertanyaan & Jawaban di Player

**Perubahan dari desain awal**: sebelumnya player HANYA menampilkan 4 tombol warna tanpa teks (mendorong orang lihat layar utama). Sekarang player juga perlu menampilkan **teks soal dan teks pilihan jawaban**, mirip Kahoot versi "player sees question" (opsional di Kahoot asli, tapi di sini dijadikan default).

**Kebutuhan teknis**:
- Layar player menampilkan: teks pertanyaan lengkap, 4 pilihan jawaban (teks + warna/bentuk seperti sebelumnya), timer countdown
- Tetap pertahankan gambar/video soal di layar host (proyektor) — pertimbangkan apakah gambar/video juga perlu muncul di player (disarankan: teks soal + pilihan cukup di player, gambar/video cukup di layar utama saja supaya tidak boros bandwidth HP)
- Sinkronisasi: teks soal yang tampil di player harus sama persis dan muncul bersamaan dengan yang di layar host (dikirim lewat event Socket.io yang sama)

---

## Fitur 2: Mode Autoplay

**Alur yang diinginkan**: Host tetap klik "Mulai Kuis" secara manual di awal. Tapi begitu kuis berjalan, ada **toggle "Mode Otomatis"** yang kalau diaktifkan, soal akan **berganti sendiri** tanpa host harus klik "Soal Berikutnya" setiap kali.

**Kebutuhan teknis**:
- Tambahkan toggle/switch di layar host: "Mode Manual" vs "Mode Otomatis" — bisa diaktifkan/dinonaktifkan kapan saja selama kuis berjalan (tidak harus dipilih di awal)
- Saat Mode Otomatis aktif:
  - Setelah countdown soal habis, tampilkan jawaban benar + statistik selama beberapa detik (misal 5 detik, buat konstanta yang bisa diatur)
  - Setelah itu otomatis lanjut ke soal berikutnya tanpa perlu klik apa pun
  - Kalau semua peserta sudah menjawab sebelum waktu habis, opsional: bisa langsung lanjut lebih cepat (skip sisa countdown) — beri host toggle terpisah untuk perilaku ini, default: tetap tunggu sampai waktu habis
- Saat Mode Manual (default): tetap seperti sebelumnya, host klik "Lanjut" tiap kali
- Host bisa switch antara mode manual/otomatis di tengah kuis (misal mulai manual dulu untuk 2 soal pertama sambil jelaskan aturan, baru aktifkan otomatis biar lebih cepat)

---

## Fitur 3: Admin Panel — Tambah Soal & Buat Sesi Kuis Baru dari Aplikasi

**Masalah saat ini**: soal harus diinput manual langsung ke Google Spreadsheet. Sekarang dibutuhkan halaman `/admin` di aplikasi supaya bisa tambah soal/buat set kuis baru tanpa buka Spreadsheet.

**Kendala penting**: CSV publish-to-web (yang dipakai untuk membaca soal saat ini) sifatnya **read-only** — tidak bisa dipakai untuk menulis data baru. Untuk fitur tambah soal dari aplikasi, gunakan **Google Sheets API** (bukan database lokal terpisah), supaya soal baru dan soal lama tetap berada di satu sumber data yang sama (Spreadsheet), dan datanya tetap persistent walau server restart/redeploy (karena tidak disimpan lokal di server).

**Setup yang dibutuhkan (dilakukan sekali di awal):**
1. Buat project baru di [Google Cloud Console](https://console.cloud.google.com/)
2. Aktifkan **Google Sheets API** untuk project tersebut
3. Buat **Service Account** (IAM & Admin > Service Accounts), lalu generate **JSON key** untuk service account tersebut — download file JSON-nya
4. Buka Spreadsheet soal yang sudah ada, klik **Share**, tambahkan **email service account** (formatnya seperti `nama-service@project-id.iam.gserviceaccount.com`, ada di file JSON) dengan akses **Editor** (bukan cuma Viewer, karena perlu bisa menulis)
5. Simpan isi file JSON credentials sebagai environment variable (misal `GOOGLE_SERVICE_ACCOUNT_KEY`, berupa string JSON) — **jangan pernah commit file JSON ini ke repo/GitHub**
6. Di server, gunakan library `googleapis` (npm) untuk autentikasi pakai service account dan melakukan operasi baca/tulis ke spreadsheet lewat Sheets API

**Kebutuhan teknis:**
- Server perlu dua mode akses ke spreadsheet:
  - **Baca** (untuk load semua soal saat sesi kuis dimulai) — bisa tetap pakai CSV publish-to-web yang sudah ada, ATAU sekalian pindah ke Sheets API read supaya konsisten satu metode saja (disarankan: pindah semua ke Sheets API, supaya tidak ada dua cara akses berbeda untuk hal yang sama)
  - **Tulis** (untuk menambah baris soal baru dari admin panel) — pakai Sheets API `spreadsheets.values.append` untuk menambah baris baru ke akhir data, sesuai `quiz_set` yang dipilih/dibuat
- Server harus tetap validasi input dari form admin sebelum menulis ke spreadsheet (jangan sampai baris kosong/tidak lengkap ikut ke-append)

**Kebutuhan halaman `/admin`**:
- Form tambah soal: teks pertanyaan, 4 pilihan jawaban, pilih mana yang benar, durasi countdown, upload/link gambar (opsional), upload/link video (opsional), pilih atau buat `quiz_set` baru
- List semua soal yang ada (dibaca langsung dari Spreadsheet via Sheets API), dikelompokkan per `quiz_set`
- Bisa buat `quiz_set` baru dari nol, langsung isi soal-soalnya di form ini — otomatis ter-append ke Spreadsheet
- Opsional (nice-to-have): fitur edit/hapus soal dari admin panel juga menulis balik ke Spreadsheet (pakai `spreadsheets.values.update` untuk edit baris tertentu, atau hapus baris via `spreadsheets.batchUpdate`) — kalau ini terasa kompleks untuk versi awal, cukup fokus dulu ke fitur tambah soal saja, edit/hapus tetap dilakukan manual di Spreadsheet
- Tidak perlu login/auth rumit untuk versi awal (asumsi hanya dipakai internal, tapi kalau mau, bisa tambahkan password sederhana untuk akses `/admin`)

---

## Fitur 4: Rebranding — Nama Aplikasi Jadi "Nizhoot"

- Ganti semua referensi nama aplikasi dari nama generik/kerja sebelumnya menjadi **"Nizhoot"** — di title halaman (tag `<title>`), header/navbar, favicon, dan teks lain yang menyebut nama aplikasi (termasuk di halaman `/admin` yang baru)
- Logo resmi ada di file terlampir (`nizhoot-logo.png`) — bentuk chat bubble gradient magenta-ke-biru dengan checkmark cyan-ke-hijau di dalamnya, tulisan "Nizhoot" dengan gradient warna serupa
- Tempatkan logo di:
  - Halaman `/host` — pojok atas atau sebagai watermark kecil, jangan mengganggu area utama (soal, timer, leaderboard)
  - Halaman `/player` — di layar awal/waiting room sebelum masuk PIN
  - Halaman `/admin` — di header
  - Favicon browser (generate versi kecil dari logo untuk `favicon.ico`)
- Palet warna brand yang diambil dari logo (untuk dipakai konsisten di elemen UI lain seperti tombol, aksen, header):
  - Magenta/ungu: `#C724B1`
  - Biru: `#1368CE`
  - Cyan/turquoise: `#22D3C5`
  - Hijau-kuning: `#7ED321`

### Skema Bentuk & Warna Jawaban (Final)

Ganti skema jawaban dari gaya Kahoot (segitiga-berlian-lingkaran-persegi) menjadi skema berikut, yang selaras dengan warna logo Nizhoot:

| Opsi | Bentuk | Warna | Hex |
|---|---|---|---|
| A | Hexagon | Magenta | `#C724B1` |
| B | Chevron (panah ke kanan) | Biru | `#1368CE` |
| C | Bintang | Cyan/turquoise | `#22D3C5` |
| D | Segitiga | Hijau-kuning | `#7ED321` |

**Kebutuhan teknis:**
- Terapkan skema ini di kedua tempat: layar host (tombol jawaban di layar utama) dan layar player (4 tombol jawaban di HP) — termasuk di fitur 1 (tampilan soal & jawaban teks di player)
- Gunakan CSS `clip-path` untuk membentuk hexagon, chevron, dan bintang (tidak perlu file gambar terpisah, cukup CSS murni sesuai constraint vanilla JS/CSS yang sudah ditetapkan sebelumnya)
- Pastikan bentuk tetap jelas terlihat meski di layar kecil (HP) — beri padding/ukuran minimum yang cukup supaya tidak terlalu detail dan sulit dibedakan dari jarak pandang normal
- Statistik jawaban (breakdown % pilihan tiap opsi setelah soal selesai) juga pakai bentuk dan warna yang sama supaya konsisten
- Skema warna baru ini **menggantikan** skema Kahoot yang disebutkan di prompt awal — pastikan Antigravity tidak mencampur kedua skema. Kalau ada bagian lain di kode yang masih hardcode warna Kahoot lama (merah/biru/kuning/hijau khas Kahoot), cari dan ganti semuanya supaya konsisten dengan brand Nizhoot

---

## Urutan Prioritas Implementasi

1. Fix bug QR code (IP lokal, bukan localhost) — prioritas tertinggi, mengganggu penggunaan
2. Rebranding: nama "Nizhoot" + logo + palet warna brand di seluruh halaman
3. Skema bentuk & warna jawaban baru (Hexagon/Chevron/Bintang/Segitiga) — diterapkan bersamaan dengan Fitur 1 supaya tidak dikerjakan dua kali
4. Fitur 1: tampilkan teks soal & jawaban di player (sekalian pakai skema jawaban baru dari poin 3)
5. Setup Google Sheets API (service account, credentials, share akses editor ke spreadsheet) — dibutuhkan sebelum Fitur 3 bisa jalan
6. Fitur 3: admin panel tulis soal baru langsung ke Spreadsheet via Sheets API
7. Fitur 2: mode autoplay dengan toggle manual/otomatis

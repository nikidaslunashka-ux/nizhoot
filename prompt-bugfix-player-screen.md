# Prompt Bug Fix — Tampilan Player Terbagi 2 & Input PIN Bermasalah

## Bug 1: Input PIN Punya Tombol Stepper (Panah Atas-Bawah)

**Masalah**: input PIN memakai `<input type="number">`, sehingga browser otomatis menampilkan tombol stepper (panah kecil naik/turun) di sisi kanan input, yang tidak relevan untuk PIN dan membingungkan pengguna.

**Perbaikan**:
- Ganti jadi `<input type="text" inputmode="numeric" pattern="[0-9]*">` — ini tetap memunculkan keyboard angka saat diklik di HP, tapi tanpa tombol stepper
- Tambahkan validasi JS supaya tetap hanya menerima input angka (tolak huruf/simbol), dan batasi panjang sesuai jumlah digit PIN (4-6 digit sesuai yang sudah ditentukan)

## Bug 2: Layar Player Terbagi 2 (Form Join & Layar Soal Tampil Bersamaan)

**Masalah**: saat ini di halaman `/player`, area input PIN + nama (bagian atas) dan area soal + pilihan jawaban (bagian bawah) **tampil bersamaan dalam satu layar** — padahal seharusnya cuma satu yang aktif tergantung state permainan.

**Perbaikan yang dibutuhkan — perjelas state/view management di player**:

Player seharusnya punya beberapa "layar" yang saling eksklusif (cuma satu yang `display: block`, sisanya `display: none` di waktu yang sama):

1. **Layar Join** — input nama + PIN (kalau PIN belum ada di URL) atau cuma input nama (kalau PIN sudah terisi otomatis dari QR/link)
2. **Layar Waiting Room** — setelah berhasil join, sebelum host klik "Mulai Kuis"
3. **Layar Soal** — saat soal sedang berjalan (teks soal + media + 4 tombol jawaban + timer)
4. **Layar Hasil Sementara** — setelah jawab, sebelum lanjut ke soal berikutnya (feedback benar/salah, ranking sementara)
5. **Layar Leaderboard Final** — di akhir kuis

**Instruksi teknis**:
- Buat satu fungsi terpusat, misal `showScreen(screenName)`, yang bertugas menyembunyikan SEMUA layar lalu menampilkan hanya satu layar yang diminta — jangan toggle visibility tiap elemen secara manual tersebar di berbagai tempat kode, supaya tidak ada celah dua layar aktif bersamaan
- Pastikan setiap event Socket.io yang mengubah state (`join success`, `quiz started`, `question started`, `question ended`, `quiz finished`) memanggil `showScreen()` yang sesuai
- Cek ulang kondisi awal saat halaman pertama kali dimuat — pastikan default state cuma menampilkan Layar Join, elemen-elemen layar lain (soal, hasil, dst) harus `display: none` dari awal sebelum ada event apapun yang diterima

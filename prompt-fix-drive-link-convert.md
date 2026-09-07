# Prompt Fix — Auto-Convert Link Google Drive Manual ke Format Direct-View

## Masalah
Saat admin tempel link Google Drive manual (format standar `https://drive.google.com/file/d/FILE_ID/view?usp=sharing`) di field "Tempel Link", link tersebut disimpan apa adanya ke spreadsheet. Link format ini tidak bisa langsung dipakai sebagai `<img src="">` atau `<iframe src="">`, sehingga gambar/video tidak tampil (muncul ikon broken image).

## Perbaikan yang Dibutuhkan

Tambahkan fungsi **deteksi & konversi otomatis** untuk link Google Drive, diterapkan di dua kemungkinan tempat (pilih salah satu, atau keduanya untuk jaga-jaga):

### Opsi A — Konversi Saat Admin Submit Form (Direkomendasikan)
- Sebelum data dikirim ke `POST /api/admin/questions`, cek apakah value `image_url`/`video_url` yang diketik admin cocok dengan pola link Drive standar: `drive.google.com/file/d/([a-zA-Z0-9_-]+)/`
- Kalau cocok, extract `FILE_ID` dari pola tersebut, lalu convert:
  - Untuk gambar: `https://drive.google.com/thumbnail?id=FILE_ID&sz=w1000`
  - Untuk video: `https://drive.google.com/file/d/FILE_ID/preview`
- Simpan hasil konversi ini (bukan link asli) ke spreadsheet
- Kalau link yang dimasukkan BUKAN dari Drive (misal Imgur, YouTube, dll), biarkan apa adanya, tidak perlu dikonversi

### Opsi B — Konversi Saat Render di Host/Player (Sebagai Fallback Tambahan)
- Terapkan fungsi konversi yang sama saat data soal ditampilkan di layar host/player, supaya soal-soal LAMA yang sudah terlanjur tersimpan dengan link mentah (seperti kasus yang baru terjadi) tetap otomatis tampil dengan benar, tanpa perlu admin edit ulang manual satu-satu

## Rekomendasi
Implementasikan **kedua opsi sekaligus** — Opsi A supaya data baru langsung tersimpan bersih di spreadsheet, Opsi B sebagai jaring pengaman untuk data lama yang sudah terlanjur salah format.

## Catatan Tambahan — Untuk Video Juga
Pastikan pola deteksi yang sama juga jalan untuk field video, karena format link Drive video biasanya sama persis (`drive.google.com/file/d/FILE_ID/view`), cuma hasil konversinya beda (dipakai di `<iframe>`, bukan `<img>`).

## Verifikasi
- Tempel link Drive mentah seperti `https://drive.google.com/file/d/1pAw-xDYxw0TjTAoRMLYglg_O_71044Px/view?usp=sharing` di form admin, submit
- Cek di spreadsheet, kolom `image_url` harus berisi versi yang sudah dikonversi (`drive.google.com/thumbnail?id=...`)
- Buka layar host/player untuk soal itu, gambar harus tampil normal, bukan lagi ikon broken image

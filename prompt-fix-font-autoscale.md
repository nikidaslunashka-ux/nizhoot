# Prompt Fix — Ukuran Font Terlalu Kecil, Terapkan Auto-Scaling

## Masalah
Setelah fix layout sebelumnya (supaya teks jawaban tidak terpotong), ukuran font teks pertanyaan dan jawaban jadi terlalu kecil secara keseluruhan — kemungkinan karena font-size di-set ke satu nilai kecil yang "aman" untuk teks terpanjang yang mungkin muncul, padahal sebagian besar soal teksnya lebih pendek dan bisa pakai font lebih besar.

## Solusi: Auto-Scaling Font Berdasarkan Panjang Teks
Bukan menaikkan ukuran font secara flat (itu bisa memunculkan lagi masalah teks terpotong untuk soal yang kebetulan panjang), tapi buat font **menyesuaikan otomatis** per soal/jawaban:
- Teks pendek → font lebih besar (memanfaatkan ruang kosong yang ada)
- Teks panjang → font mengecil secukupnya (tetap dalam batas minimum yang nyaman dibaca)

## Kebutuhan Teknis

### 1. Font Teks Pertanyaan
- Set range: minimum ~16px, maksimum ~22px (sesuaikan dengan hasil test di device asli)
- Gunakan CSS `clamp()` sebagai basis: `font-size: clamp(16px, 4vw, 22px)` — otomatis menyesuaikan lebar layar
- Untuk penyesuaian berdasarkan PANJANG TEKS (bukan cuma lebar layar), tambahkan logic JavaScript sederhana: hitung `text.length` saat render soal, kalau di bawah ambang tertentu (misal <50 karakter) pakai class/style font lebih besar, kalau di atas ambang (misal >120 karakter) pakai font lebih kecil, di antaranya pakai ukuran default

### 2. Font Teks Jawaban (di dalam kotak A/B/C/D)
- Terapkan pendekatan sama: minimum ~14px, maksimum ~18px
- Karena tiap kotak jawaban independen, hitung panjang teks TIAP jawaban secara terpisah — jawaban pendek di kotak A bisa pakai font lebih besar dari jawaban panjang di kotak C, meski dalam soal yang sama

### 3. Batas Aman
- JANGAN biarkan font mengecil di bawah 14px untuk jawaban atau 16px untuk pertanyaan — di bawah itu sulit dibaca di layar HP kecil, lebih baik biarkan teks wrap ke lebih banyak baris daripada font terlalu kecil
- Test dengan kombinasi ekstrem: soal sangat pendek ("Benar/Salah?") dan sangat panjang (seperti contoh soal "Jarak site dari ujung RWY-03...") untuk pastikan kedua kasus tetap enak dibaca

## Verifikasi
- Buka soal dengan teks pendek, font harus terlihat lebih besar/lega dibanding sebelumnya
- Buka soal dengan teks terpanjang yang ada di quiz kamu sekarang, pastikan tetap tidak terpotong DAN tidak terlalu kecil dibaca
- Cek tampilan di layar HP kecil (bukan cuma HP besar/tablet)

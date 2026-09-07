# Prompt Fix — Gambar Soal Terpotong, Kotak Jawaban Masih Terlalu Besar

## Masalah (Lanjutan dari Fix Sebelumnya)
Setelah perbaikan sebelumnya, teks jawaban sudah tidak terpotong lagi. Tapi porsi tinggi kotak jawaban (4 kotak grid 2x2) masih terlalu besar, sehingga area untuk menampilkan gambar/video soal jadi kepepet — gambar ter-crop (keliatan cuma sebagian, bukan gambar utuh), karena `object-fit` kemungkinan pakai `cover` dengan container yang tingginya dipaksa kecil oleh sisa ruang yang ada.

## Analisis Masalah Ruang Vertikal
Total tinggi layar HP harus dibagi untuk: header (logo, nama, skor), info "Soal X dari Y" + timer, teks pertanyaan, area gambar/video (kalau ada), dan grid 4 jawaban. Saat ini distribusinya tidak seimbang — grid jawaban masih ambil porsi ruang yang besar meski sudah dikecilkan sebelumnya, sehingga sisa ruang untuk gambar jadi sangat sempit.

## Perbaikan yang Dibutuhkan

1. **Gunakan CSS Flexbox/Grid dengan `flex-grow` yang proporsional** untuk keseluruhan layar soal (bukan ukuran fixed per elemen), supaya ruang terbagi otomatis dan adaptif:
   - Header: tinggi tetap (fixed), kecil
   - Info soal + timer: tinggi tetap, kecil
   - Teks pertanyaan: tinggi menyesuaikan panjang teks (auto), tapi beri `max-height` dengan scroll internal kalau soal sangat panjang
   - **Area gambar/video: beri prioritas ruang lebih besar** — gunakan `object-fit: contain` (BUKAN `cover`) supaya gambar utuh selalu terlihat penuh tanpa ter-crop, dengan container yang tingginya fleksibel menyesuaikan sisa ruang yang tersedia
   - Grid 4 jawaban: **kecilkan lagi porsi tingginya** dari yang sekarang — cukup setinggi yang dibutuhkan untuk menampilkan 1-2 baris teks jawaban dengan nyaman, tidak perlu lebih

2. **Ubah `object-fit` gambar/video dari `cover` ke `contain`** — ini kemungkinan besar penyebab utama gambar terlihat "terpotong". `cover` akan crop gambar supaya memenuhi container, `contain` akan tampilkan gambar utuh dengan menyesuaikan ukurannya ke dalam container (mungkin ada sedikit ruang kosong di sisi kiri/kanan atau atas/bawah gambar, itu wajar dan lebih baik daripada gambar terpotong)

3. **Pertimbangkan container media dengan max-height yang lebih longgar** — beri gambar/video ruang vertikal yang lebih signifikan (misal 30-35% dari total tinggi layar), dan kompensasi dengan mengecilkan lagi grid jawaban (misal 35-40% dari total tinggi layar), sisanya untuk header dan teks soal

4. **Test dengan berbagai rasio gambar** — soal aviation biasanya pakai gambar peta/diagram yang cenderung landscape (lebar > tinggi), pastikan container media mengakomodasi ini dengan baik tanpa membuat gambar terlalu kecil atau terpotong

## Verifikasi
- Buka soal dengan gambar peta KKOP (seperti contoh: "Jarak site dari ujung RWY-03..."), pastikan gambar utuh terlihat lengkap dari atas sampai bawah, tidak ada bagian yang terpotong
- Pastikan grid 4 jawaban tetap nyaman diklik (tidak jadi terlalu kecil/sempit akibat dikecilkan)
- Cek keseluruhan layar (header + soal + gambar + 4 jawaban) tetap muat tanpa perlu scroll di layar HP standar

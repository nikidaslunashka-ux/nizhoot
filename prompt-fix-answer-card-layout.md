# Prompt Fix — Layout Kotak Jawaban Terlalu Besar & Teks Terpotong

## Masalah
Kotak pilihan jawaban di layar player saat ini terlalu besar (tinggi berlebihan, hampir memenuhi setengah layar per kotak), sehingga:
- Kalau teks jawaban panjang, teks jadi terpotong / tidak muat terlihat penuh
- Layout terasa boros ruang, kadang butuh scroll padahal seharusnya semua elemen (soal + 4 jawaban + timer) muat dalam satu layar tanpa scroll, terutama di HP

## Referensi Pembanding (Kahoot)
Kahoot menggunakan grid 2x2 yang jauh lebih ringkas: tiap kotak jawaban proporsinya lebih pendek (rasio lebih landscape, bukan portrait/persegi tinggi), teks jawaban di-wrap otomatis ke beberapa baris sesuai kebutuhan, dan ukuran font otomatis menyesuaikan supaya tidak terpotong meski teksnya panjang.

## Perbaikan yang Dibutuhkan

1. **Ubah proporsi kotak jawaban** — dari yang sekarang cenderung persegi/tinggi, ubah jadi lebih pendek secara vertikal (landscape-ish), supaya 4 kotak dalam grid 2x2 muat lebih ringkas dan menyisakan ruang untuk teks soal serta timer tanpa perlu scroll
2. **Pastikan teks jawaban selalu terlihat penuh**:
   - Gunakan `word-wrap`/`overflow-wrap: break-word` supaya teks panjang otomatis pindah baris, bukan terpotong dengan `overflow: hidden`
   - Pertimbangkan font-size yang sedikit lebih kecil dari sekarang (atau responsive, mengecil otomatis kalau teks lebih dari 2 baris) supaya tetap muat rapi di kotak yang lebih ringkas
   - JANGAN gunakan `text-overflow: ellipsis` atau `white-space: nowrap` untuk teks jawaban — ini yang menyebabkan pemotongan
3. **Sesuaikan posisi bentuk (hexagon/chevron/bintang/segitiga) dan huruf opsi (A/B/C/D)** — taruh di salah satu sudut kotak (seperti referensi Kahoot: ikon bentuk di kiri atas, teks jawaban memenuhi sisa ruang kotak), bukan mendominasi seluruh kotak
4. **Test dengan teks jawaban terpanjang yang mungkin muncul** (contoh dari soal aviation: "Kawasan Keamanan Operasi Penerbangan", "Penyelenggara Bandar Udara") — pastikan semua muat rapi tanpa terpotong di berbagai ukuran layar HP (termasuk layar kecil)

## Verifikasi
- Buka `/player` di HP, cek soal dengan jawaban teks panjang — teks harus wrap rapi, terlihat penuh, tidak terpotong
- Cek keseluruhan layar (soal + 4 jawaban + timer) idealnya muat tanpa perlu scroll di layar HP standar

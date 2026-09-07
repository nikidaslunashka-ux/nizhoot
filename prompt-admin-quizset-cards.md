# Prompt Tambahan untuk Antigravity — Restrukturisasi Tampilan Admin Panel

## Konteks
Fitur tambah pertanyaan di `/admin` sudah berhasil dibuat. Sekarang perlu perbaikan struktur tampilan utama halaman admin, supaya lebih mudah dikelola saat jumlah quiz_set makin banyak.

## Perubahan yang Dibutuhkan

**Tampilan saat ini**: form tambah soal + list soal langsung tampil di halaman utama admin.

**Tampilan yang diinginkan**: halaman utama `/admin` menampilkan **kumpulan card per quiz_set** (bukan langsung form/list soal), dengan struktur berikut:

### 1. Bagian Statistik Ringkas (Summary Cards) — Tetap Dipertahankan
Bagian summary cards yang sudah ada (total quiz_set, total soal, dsb — sesuai yang sudah dibuat) tetap di posisi paling atas.

### 2. Quiz Set Cards (Baru)
Di bawah summary cards, tampilkan grid card — satu card mewakili satu `quiz_set`. Tiap card berisi:
- Nama `quiz_set`
- Jumlah soal di dalamnya
- Total estimasi durasi (jumlah `duration_seconds` semua soal di set itu, opsional tapi bagus untuk ditampilkan)
- **Preview soal pertama**: tampilkan cuplikan teks pertanyaan pertama di quiz_set itu (potong dengan ellipsis/`...` kalau teksnya panjang, misal maksimal 60-80 karakter), supaya admin bisa cepat kenali isi set itu tanpa harus klik masuk dulu
- **Tanggal terakhir diedit**: tampilkan kapan soal terakhir ditambahkan/diubah di quiz_set tersebut (format relatif seperti "2 hari lalu" atau tanggal biasa "3 Sep 2026")
  - **Catatan teknis**: Google Sheets API tidak otomatis menyediakan timestamp per baris. Perlu ditambahkan kolom baru di spreadsheet, misal `last_updated`, yang diisi otomatis oleh server (pakai `new Date().toISOString()`) setiap kali ada `append` atau `update` ke baris terkait. Untuk tampilan card, ambil nilai `last_updated` paling baru di antara semua soal dalam satu quiz_set tersebut
- Indikator kecil kalau ada soal yang datanya tidak lengkap/perlu diperbaiki (opsional, nice-to-have)

**Interaksi**: card ini **bisa diklik** — klik satu card akan membuka tampilan detail/edit untuk quiz_set tersebut, yaitu:
- List semua soal di dalam quiz_set itu (yang sebelumnya jadi tampilan utama, sekarang jadi tampilan "masuk ke dalam" satu set) — **setiap item/baris soal di list ini punya tombol delete sendiri**, untuk menghapus satu soal spesifik
- Form tambah soal baru (khusus untuk quiz_set yang sedang dibuka ini — jadi `quiz_set` di form otomatis terisi sesuai konteks yang sedang dibuka, tidak perlu pilih/ketik ulang)
- Tombol "Kembali" untuk balik ke tampilan grid card semua quiz_set

**Delete seluruh quiz_set**: tambahkan ikon trash kecil di pojok tiap quiz set card (di tampilan grid, bukan di tampilan detail) — klik ikon ini WAJIB memunculkan dialog konfirmasi (misal: "Yakin hapus set '[nama]' beserta [jumlah] soal di dalamnya? Aksi ini tidak bisa dibatalkan") sebelum benar-benar menghapus semua baris terkait di spreadsheet. Ini aksi destruktif skala besar, jadi harus ada pengaman ekstra dibanding delete satu soal.

**Catatan teknis delete**: Google Sheets API tidak punya cara langsung "delete berdasarkan value" — perlu cari dulu row index yang sesuai (baik untuk satu soal maupun semua soal dalam satu quiz_set), lalu gunakan `spreadsheets.batchUpdate` dengan `deleteDimension` request untuk menghapus baris tersebut. Kalau menghapus banyak baris sekaligus (delete quiz_set), urutkan penghapusan dari index terbesar ke terkecil supaya index baris lain tidak bergeser di tengah proses.

### 3. Tombol "Buat Set Kuis Baru"
Letakkan tombol yang jelas terlihat (misal di pojok kanan atas area quiz set cards, atau sebagai card khusus dengan ikon "+" di akhir grid). Klik tombol ini:
- Munculkan input untuk nama quiz_set baru
- Setelah nama diisi dan dikonfirmasi, langsung arahkan ke tampilan detail quiz_set tersebut (kosong, siap diisi soal pertama)

## Alur Navigasi Ringkas
```
/admin (halaman utama)
  └─ Summary cards (statistik keseluruhan)
  └─ Grid Quiz Set Cards
       ├─ [Card: Set A] → klik → Detail Set A (list soal + form tambah soal + tombol kembali)
       ├─ [Card: Set B] → klik → Detail Set B
       └─ [+ Buat Set Kuis Baru] → input nama → Detail Set Baru (kosong)
```

## Catatan Teknis
- Ini murni perubahan struktur navigasi/UI di frontend admin — tidak perlu perubahan pada logic backend (`appendQuestionToSheet`, endpoint `/api/admin/questions`) kecuali diperlukan endpoint tambahan untuk mengambil daftar quiz_set beserta jumlah soalnya (bisa dihitung dari data yang sudah di-fetch, tidak perlu query baru ke Sheets API kalau data sudah ada di memory/state frontend)
- **Kolom baru di spreadsheet**: tambahkan kolom `last_updated` di header spreadsheet (kolom terakhir, setelah `quiz_set`). Ini diisi otomatis oleh server, bukan manual oleh staf — jadi staf yang edit langsung di Sheets tidak perlu pusing isi kolom ini
- Pertahankan palet warna dan gaya visual brand Nizhoot yang sudah diterapkan sebelumnya (taste-skill, warna brand) untuk card-card baru ini
- Pastikan transisi antara tampilan grid dan tampilan detail terasa halus (bisa pakai CSS transition sederhana, tidak perlu library animasi tambahan)

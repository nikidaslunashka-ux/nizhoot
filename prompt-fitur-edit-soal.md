# Prompt Fitur — Edit Soal di Daftar Soal

## Konsep
Di tampilan detail quiz_set (list soal di dalam satu set), tambahkan tombol **Edit** di setiap item soal — di samping tombol Delete yang sudah ada. Klik Edit membuka form yang sudah terisi otomatis dengan data soal tersebut, siap diubah dan disimpan kembali ke spreadsheet.

## Kebutuhan Teknis

### 1. Tombol Edit di List Soal
- Tambahkan tombol/icon edit (pakai icon `pencil` dari Lucide, sesuai standar icon yang sudah diterapkan) di setiap baris/item soal, sejajar dengan tombol Delete
- Klik tombol ini membuka form yang SAMA dengan form "Tambah Soal" yang sudah ada, tapi:
  - Semua field (teks pertanyaan, 4 pilihan jawaban, jawaban benar, durasi, gambar/video, quiz_set) sudah **terisi otomatis** sesuai data soal yang mau diedit
  - Tombol submit berubah label jadi "Simpan Perubahan" (bukan "Tambah Soal")

### 2. Alur Simpan Perubahan
- Saat form edit di-submit, kirim request ke endpoint baru, misal `PUT /api/admin/questions/:rowIndex` (atau identifier lain yang bisa dipakai mencari baris yang tepat di spreadsheet — row index adalah opsi paling sederhana, tapi pastikan konsisten dengan cara data soal di-load ke frontend supaya row index yang dikirim balik akurat)
- Di server, gunakan Google Sheets API `spreadsheets.values.update` dengan range yang menunjuk baris spesifik tersebut, isi ulang semua kolom dengan value baru dari form
- Update juga kolom `last_updated` (kalau sudah diimplementasikan sebelumnya) dengan timestamp saat ini
- Setelah berhasil, tampilkan notifikasi sukses (toast, pakai icon `check-circle`) dan refresh list soal supaya perubahan langsung terlihat

### 3. Validasi
- Terapkan validasi yang sama seperti form tambah soal (field wajib terisi, minimal 1 jawaban benar dipilih, dst) — jangan sampai ada celah baru dari perbedaan form tambah vs edit
- Kalau field gambar/video sebelumnya sudah berisi link (baik dari Drive lama atau link manual), tampilkan sebagai value awal di tab "Tempel Link" (bukan kosong), supaya admin bisa lihat/edit link yang sudah ada, bukan mulai dari nol

### 4. Batal Edit
- Sediakan tombol "Batal" di form edit — klik ini menutup form tanpa menyimpan perubahan apapun, kembali ke list soal seperti semula

## Catatan
- Ini melengkapi fitur Delete yang sudah ada di `prompt-admin-quizset-cards.md` — sekarang tiap soal di list punya dua aksi: Edit dan Delete, ditempatkan berdampingan
- Tidak perlu `impeccable shape` untuk ini — cukup pakai ulang komponen form yang sudah ada, hanya beda state (mode tambah vs mode edit)

## Verifikasi
- Buka detail satu quiz_set, klik Edit di salah satu soal, pastikan form terisi otomatis sesuai data soal tersebut
- Ubah beberapa field (misal teks pertanyaan dan durasi), simpan, cek di spreadsheet baris tersebut benar-benar terupdate (bukan malah jadi baris baru)
- Coba klik Edit lalu Batal, pastikan tidak ada perubahan tersimpan

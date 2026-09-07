# Prompt Bug Fix — Upload Masih Tersimpan Lokal, Bukan ke Google Drive

## Masalah
Upload gambar berhasil secara fungsional (tidak error), tapi file ternyata tersimpan di server lokal (localhost), bukan di Google Drive seperti yang direncanakan. Ini terlihat dari link yang dihasilkan mengarah ke path lokal server, bukan link `drive.google.com`.

## Kemungkinan Penyebab
`multer` (atau library upload lain yang dipakai) kemungkinan masih dikonfigurasi dengan `diskStorage` (menyimpan file ke folder lokal seperti `/public/uploads`), bukan `memoryStorage` (menyimpan file sementara di memory, lalu diteruskan ke Drive API). Ini menyalahi spesifikasi awal di `prompt-upload-gdrive-media.md` — file tidak boleh pernah ditulis ke disk lokal sama sekali.

## Perbaikan yang Dibutuhkan

1. **Cek konfigurasi multer** — pastikan menggunakan:
   ```js
   const upload = multer({ storage: multer.memoryStorage() });
   ```
   BUKAN `multer.diskStorage(...)`.

2. **Cek alur setelah file diterima server** — pastikan buffer file (`req.file.buffer`) benar-benar diteruskan ke fungsi upload Google Drive API (`drive.files.create` dengan `media.body` berisi stream dari buffer tersebut), bukan disimpan dulu ke folder lokal sebelum atau sesudah proses.

3. **Cek apakah folder `/public/uploads` (atau serupa) sempat dibuat** — kalau ada, artinya memang ada logic yang menulis ke disk lokal. Hapus logic tersebut sepenuhnya, ganti dengan alur langsung ke Drive API sesuai `prompt-upload-gdrive-media.md`.

4. **Verifikasi environment variable terbaca dengan benar** — pastikan `GOOGLE_SERVICE_ACCOUNT_KEY` dan `DRIVE_ROOT_FOLDER_ID` benar-benar dipakai di kode upload (bukan cuma didefinisikan tapi tidak dipanggil), karena kalau ada error autentikasi Drive API yang di-silent/fallback ke local storage tanpa pesan error jelas, itu bisa jadi penyebab lain.

5. **Setelah diperbaiki, hapus file-file yang terlanjur tersimpan lokal** dari percobaan sebelumnya (folder upload lokal, kalau ada), supaya tidak ada sisa file yang membingungkan.

## Verifikasi Setelah Fix
- Upload 1 gambar baru, cek link yang dihasilkan HARUS berformat `https://drive.google.com/thumbnail?id=...` (bukan `localhost` atau path lokal lain)
- Buka Google Drive folder "Nizhoot Media" > Images > [nama quiz_set] — file yang baru di-upload harus muncul di sana
- Cek juga di spreadsheet, kolom `image_url` untuk baris soal yang baru — harus berisi link Drive tersebut

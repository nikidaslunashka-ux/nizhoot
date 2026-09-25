# Prompt Nizhoot v2 — Upload Gambar/Video Terintegrasi dengan Login Google

## Konteks
Menggantikan rencana upload Drive sebelumnya (yang butuh proses OAuth terpisah dengan script manual dan akun Gmail khusus). Sekarang karena user SUDAH login pakai Google untuk fitur ownership (v2), kita perluas scope login itu supaya sekalian dapat izin upload ke Drive milik user yang login — jauh lebih simpel, tidak perlu setup OAuth terpisah lagi.

## Perubahan pada Alur Login

Update scope OAuth yang diminta saat login (dari sebelumnya cuma `openid email profile`) menjadi:
```
openid email profile https://www.googleapis.com/auth/drive.file
```
Scope `drive.file` artinya aplikasi cuma bisa akses file yang DIA SENDIRI buat lewat aplikasi ini — tidak bisa lihat/akses file lain di Drive user. Ini juga menghindari proses verifikasi aplikasi Google yang rumit (beda dengan scope `drive` penuh yang butuh review Google kalau dipakai publik).

## Penyimpanan Refresh Token per User

- Tambah sheet/tab baru **"Users"** di spreadsheet, dengan kolom: `email`, `refresh_token_encrypted`, `created_at`
- Saat user login pertama kali dan approve akses Drive, simpan `refresh_token` mereka dalam bentuk **terenkripsi** (jangan simpan mentah!) — gunakan Node.js `crypto` module (`aes-256-gcm`) dengan kunci enkripsi dari environment variable baru `ENCRYPTION_KEY` (generate sekali, string acak panjang, simpan aman di `.env`)
- Setiap kali perlu upload/hapus file di Drive user tersebut, ambil refresh token dari sheet ini, decrypt, baru dipakai untuk buat OAuth2Client atas nama user itu

## Struktur Folder di Drive (Per User)

Setiap user yang upload akan otomatis punya folder sendiri di Drive mereka:
```
Nizhoot Media/  (dibuat otomatis di Drive user saat pertama kali upload)
├── Images/
│   └── <nama_quiz_set>/
└── Videos/
    └── <nama_quiz_set>/
```

## Alur Upload

1. Admin (yang sudah login) pilih file di form soal
2. Server ambil refresh token milik user yang sedang login (dari sheet "Users"), buat OAuth2Client atas nama dia
3. Cek/buat folder "Nizhoot Media/Images (atau Videos)/<quiz_set>" di Drive user tersebut kalau belum ada
4. Upload file ke folder itu
5. **Set permission file**: 
   - `anyone` dengan role `reader` (supaya bisa ditampilkan publik di layar host/player)
   - **Untuk SETIAP email di daftar `collaborators` quiz_set tersebut** (dari sheet "QuizSetOwners"), tambahkan juga permission role `writer` — supaya kolaborator lain bisa kelola/hapus file ini nantinya, bukan cuma pemilik asli
6. Convert link jadi format direct-view (`drive.google.com/thumbnail?id=...` untuk gambar, `drive.google.com/file/d/.../preview` untuk video), simpan ke kolom `image_url`/`video_url` seperti biasa

## Alur Hapus (Cascade Delete)

- Saat hapus 1 soal atau 1 quiz_set, ambil refresh token user yang SEDANG LOGIN (bukan harus pemilik asli file, karena permission `writer` sudah diberikan ke semua kolaborator saat upload)
- Pakai OAuth2Client user yang login itu untuk hapus file/folder terkait di Drive (baik itu Drive miliknya sendiri, atau Drive kolaborator lain yang filenya — karena sudah dikasih izin `writer`, Drive API tetap izinkan operasi delete meski file bukan "milik" dia)
- Bungkus dengan try-catch seperti biasa — kalau gagal (misal permission ternyata belum sempat ke-set), jangan gagalkan proses hapus baris di spreadsheet, cukup log error

## Tetap Sediakan Opsi Tempel Link Manual

Form tetap punya toggle "Upload" vs "Tempel Link" seperti sebelumnya — untuk sumber gambar/video di luar Drive (Imgur, YouTube, dll), atau kalau user belum sempat approve izin Drive saat login (edge case: user cuma approve izin dasar tanpa Drive, harus di-handle dengan baik, tampilkan pesan jelas "Upload butuh izin Drive tambahan, silakan re-login" kalau ini terjadi)

## Verifikasi
- Login, upload 1 gambar untuk quiz_set yang dimiliki sendiri, cek muncul di folder Drive pribadi user tersebut
- Tambahkan kolaborator B ke quiz_set itu, login sebagai B, coba hapus soal yang gambarnya di-upload oleh user A — pastikan berhasil terhapus (baik dari spreadsheet maupun dari Drive A)
- Test tempel link manual tetap berfungsi sebagai alternatif

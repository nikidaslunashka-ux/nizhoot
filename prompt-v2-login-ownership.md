# Prompt Nizhoot v2 — Login Google, Ownership Quiz Set, & Kolaborator

## Command
Jalankan `impeccable shape` untuk merancang UI baru: halaman login, indikator user login di header admin, dan UI tambah kolaborator.

## Konsep Besar
- Admin panel sekarang butuh login pakai akun Google (bukan lagi bebas akses tanpa identitas)
- Setiap quiz_set dimiliki oleh SATU akun (pembuatnya), dan bisa berbagi akses ke akun Google lain sebagai kolaborator
- Admin cuma bisa lihat & kelola quiz_set yang dia buat sendiri ATAU yang dia jadi kolaborator di situ — bukan semua quiz_set yang ada
- Ada beberapa akun "Super Admin" yang bisa lihat SEMUA quiz_set dari semua orang (untuk keperluan pengawasan/troubleshooting)
- Siapa saja dengan akun Google boleh login (tidak dibatasi domain tertentu) — tapi tetap tidak bisa lihat quiz_set orang lain kecuali diundang jadi kolaborator, jadi keamanan data tetap terjaga meski login terbuka

## Penting: TIDAK Perlu OAuth Drive/Sheets per User
Login Google di sini HANYA untuk **identitas** (tahu siapa yang login), BUKAN untuk akses Drive/Sheets pribadi tiap user. Semua data soal tetap disimpan di SATU spreadsheet pusat yang sudah ada (via service account seperti sekarang) — cukup ditambah kolom kepemilikan. Ini jauh lebih sederhana dibanding rencana OAuth Drive per-user yang sempat dibahas dan ditunda sebelumnya.

**Scope OAuth yang dibutuhkan cukup**: `openid email profile` — tidak perlu scope Drive/Sheets sama sekali.

## Kebutuhan Teknis

### 1. Setup Google OAuth untuk Login
- Gunakan OAuth Client ID yang sudah ada (dari setup sebelumnya) atau buat baru khusus untuk login, dengan Application type **Web application** (bukan Desktop app), redirect URI mengarah ke endpoint aplikasi (misal `https://nizhoot.onrender.com/auth/google/callback`)
- Pakai library `passport` dengan strategy `passport-google-oauth20` untuk mempermudah alur login
- Setelah login berhasil, simpan session (pakai `express-session` dengan cookie httpOnly) berisi minimal: email, nama, foto profil dari akun Google tersebut

### 2. Tambah Sheet Baru: "QuizSetOwners"
Tambahkan tab/sheet baru di spreadsheet yang sama, dengan kolom:
| Kolom | Isi |
|---|---|
| `quiz_set` | Nama quiz_set (harus match dengan kolom `quiz_set` di sheet soal utama) |
| `owner_email` | Email akun Google pemilik |
| `collaborators` | Daftar email kolaborator, dipisah koma |
| `created_at` | Timestamp dibuat |

### 3. Migrasi Data Lama
- Sediakan script sekali-jalan (misal `scripts/migrate-owners.js`) yang mengisi sheet "QuizSetOwners" untuk semua quiz_set yang SUDAH ADA sekarang, dengan `owner_email` diisi dari environment variable `DEFAULT_OWNER_EMAIL` (isi manual sesuai email akun utama Anda di `.env` sebelum jalankan script ini)
- Jalankan script ini SEKALI SAJA setelah fitur ownership selesai dibuat, sebelum staf lain mulai login

### 4. Middleware Otorisasi
- Buat middleware yang cek: kalau user belum login, redirect ke halaman login
- Untuk setiap request yang akses/edit quiz_set tertentu, cek apakah email user yang login adalah `owner_email` ATAU ada di daftar `collaborators` untuk quiz_set itu ATAU email tersebut ada di `SUPER_ADMIN_EMAILS` (environment variable, daftar email dipisah koma) — kalau tidak memenuhi salah satu syarat itu, tolak akses (403)

### 5. Update Tampilan Admin Panel
- **Halaman Login**: tombol "Login dengan Google", tampil sebelum admin panel bisa diakses
- **Header Admin**: tampilkan foto profil + nama + tombol "Logout" dari akun yang sedang login
- **Grid Quiz Set Cards**: HANYA tampilkan quiz_set milik user yang login atau yang dia jadi kolaborator (kecuali kalau dia Super Admin, tampilkan semua dengan indikator kecil "milik: email@..." di tiap card supaya jelas ini bukan quiz_set sendiri)
- **Tombol "Tambah Kolaborator"**: di tampilan detail quiz_set, tambahkan tombol ini — klik membuka input untuk masukkan email Google kolaborator baru, submit akan append ke kolom `collaborators` di sheet "QuizSetOwners" untuk quiz_set tersebut
- **Buat Quiz Set Baru**: otomatis catat `owner_email` = email user yang sedang login saat submit

### 6. Halaman Host Juga Dibatasi Sesuai Ownership
- Halaman `/host` (tempat memulai sesi kuis, dipakai di layar proyektor) JUGA mewajibkan login — bukan cuma admin panel
- Dropdown pilihan quiz_set di halaman host HANYA menampilkan set yang dimiliki atau di-kolaborasi oleh user yang login (persis aturan yang sama seperti admin panel), kecuali user tersebut Super Admin (bisa pilih dari semua set)
- Ini memastikan konsistensi: kalau seseorang tidak punya akses edit ke suatu quiz_set, dia juga tidak bisa menjalankan (host) sesi kuis pakai set tersebut — kalau memang perlu, solusinya tambahkan dia sebagai kolaborator dulu di set itu, bukan buka akses host secara terpisah

## Verifikasi
- Login pakai akun Google A, buat quiz_set baru, pastikan cuma akun A yang bisa lihat/edit set itu
- Tambahkan akun Google B sebagai kolaborator di set tersebut, login pakai akun B, pastikan B juga bisa lihat/edit set yang sama
- Login pakai akun Google C (bukan owner/kolaborator), pastikan set tersebut TIDAK muncul di daftar C
- Login pakai email yang terdaftar di `SUPER_ADMIN_EMAILS`, pastikan bisa lihat SEMUA quiz_set dari semua akun
- Cek quiz_set lama (sebelum fitur ini) otomatis muncul di akun yang diisi sebagai `DEFAULT_OWNER_EMAIL`
- Buka `/host` dengan akun C (bukan owner/kolaborator dari set A), pastikan set milik A TIDAK muncul di dropdown pilihan host

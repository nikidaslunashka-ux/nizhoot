# Prompt Pemulihan — Migrasi ke Akun Google Stabil + Nonaktifkan Upload Drive Sementara

## Konteks
Akun `nizhoot@gmail.com` (dipakai untuk Cloud project, service account, dan spreadsheet) mengalami lockout dari Google (kemungkinan ter-flag sistem anti-abuse karena aktivitas developer yang intensif di akun baru). Untuk melanjutkan development tanpa bergantung pada pemulihan akun tersebut, seluruh infrastruktur Google dipindah ke akun Google yang sudah stabil/lama dipakai.

## Perubahan yang Dibutuhkan

### 1. Update Environment Variables
Ganti value berikut di `.env` dengan yang baru (dari Cloud project & spreadsheet baru di akun stabil):
```
GOOGLE_SERVICE_ACCOUNT_KEY={JSON baru dari service account baru}
SPREADSHEET_ID={ID spreadsheet baru}
```

### 2. Nonaktifkan Sementara Upload Langsung ke Drive
- Karena fitur upload otomatis ke Google Drive (yang butuh OAuth per akun) ditunda dulu, **nonaktifkan/sembunyikan tab "Upload" di form admin**, sisakan HANYA tab "Tempel Link" untuk field gambar dan video
- Jangan hapus kode upload Drive yang sudah dibuat sebelumnya (biarkan tetap ada di codebase, cukup di-comment-out atau di-disable lewat flag), supaya bisa diaktifkan lagi nanti tanpa nulis ulang dari nol
- Pastikan `DRIVE_ROOT_FOLDER_ID` dan variable OAuth Drive (`GOOGLE_OAUTH_*`) yang lama tidak menyebabkan error kalau kosong/tidak diisi — beri fallback aman (skip logic Drive kalau variable ini tidak ada)

### 3. Verifikasi Sistem Inti Berjalan Normal
- Server berhasil baca soal dari spreadsheet baru via Sheets API (cek log tidak ada lagi error `invalid_grant`)
- Admin panel bisa tambah soal baru (append ke spreadsheet baru) dengan field gambar/video diisi via link manual
- Fallback CSV (kalau ada) tetap berfungsi sebagai cadangan

## Catatan untuk Nanti (Tidak Perlu Dikerjakan Sekarang)
Fitur "Login with Google" per-staf untuk upload otomatis ke Drive masing-masing (dibahas terpisah) akan dikerjakan di fase berikutnya, setelah sistem inti benar-benar stabil. Untuk saat ini, cukup pastikan alur baca/tulis soal via Sheets API + input link manual untuk media berjalan lancar.

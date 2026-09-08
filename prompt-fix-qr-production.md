# Prompt Fix — QR Code Masih Pakai IP Internal Container, Bukan Domain Render

## Masalah
Setelah deploy ke Render, QR code masih menghasilkan link seperti:
```
http://10.30.205.63:10000/player?pin=47643
```
IP `10.30.205.63` ini adalah IP internal container Render (bukan alamat yang bisa diakses dari luar/publik), sehingga peserta tidak akan bisa connect ke link ini sama sekali. Seharusnya di production, link mengarah ke domain publik Render (misal `https://nizhoot.onrender.com/player?pin=47643`).

## Penyebab
Logic deteksi IP lokal (`os.networkInterfaces()`) yang dipakai untuk development masih berjalan di production, padahal seharusnya di-skip dan diganti pakai domain production begitu terdeteksi environment adalah production/deployed.

## Perbaikan yang Dibutuhkan

1. **Deteksi environment dengan benar**: Render menyediakan environment variable otomatis `RENDER_EXTERNAL_URL` (berisi URL publik lengkap aplikasi, misal `https://nizhoot.onrender.com`) dan `RENDER` (bernilai `true` kalau berjalan di Render). Gunakan salah satu dari ini untuk deteksi:
   ```js
   const isProduction = !!process.env.RENDER || process.env.NODE_ENV === 'production';
   const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://${localIp}:${port}`;
   ```
2. **Prioritaskan environment variable `BASE_URL` manual sebagai override** — kalau nanti pindah hosting lain (misal dari Render ke platform lain), sediakan juga opsi set `BASE_URL` manual di environment variable, supaya tidak bergantung sepenuhnya ke variable spesifik satu platform saja:
   ```js
   const baseUrl = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://${localIp}:${port}`;
   ```
3. **Pastikan logic ini dipakai konsisten** di semua tempat yang generate URL untuk QR code maupun teks fallback ("Buka di HP: ...") — jangan sampai ada satu tempat yang sudah benar tapi tempat lain masih pakai IP lokal

## Verifikasi
- Redeploy ke Render, buat sesi baru di `/host`
- Cek QR code dan teks fallback link sekarang menunjukkan domain `https://nizhoot.onrender.com/player?pin=...` (atau domain custom kalau sudah diatur), BUKAN lagi IP seperti `10.30.205.63`
- Scan QR dari HP (jaringan seluler biasa), pastikan berhasil connect dan join sesi

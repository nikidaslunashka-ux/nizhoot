# Prompt Fitur — Standardisasi Icon dengan Lucide Icons

## Konsep
Ganti seluruh icon yang dipakai di aplikasi (host, player, admin) dengan icon dari satu library konsisten — **Lucide Icons** — supaya seluruh tampilan terasa lebih profesional dan seragam, menggantikan icon yang mungkin sekarang tercampur (custom, emoji, atau tidak konsisten gaya-nya).

## Kenapa Lucide
- Open-source, gratis, MIT license — aman dipakai tanpa masalah lisensi
- Style konsisten (outline/line icon, clean, modern) — banyak dipakai aplikasi SaaS modern sebagai "standar industri" untuk UI icon
- Ringan — bisa dipasang lewat CDN tanpa build step tambahan, cocok dengan constraint vanilla JS/CSS yang sudah ditetapkan
- Punya icon lengkap untuk kebutuhan aplikasi kuis: play, pause, users, trophy, settings, upload, link, trash, check, x, clock, dll

## Cara Pasang (Vanilla JS, Tanpa Build Step)
Tambahkan di `<head>` setiap halaman (host, player, admin):
```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
```
Lalu di HTML, pakai elemen `<i data-lucide="nama-icon"></i>` di tempat yang butuh icon, dan panggil `lucide.createIcons()` di JavaScript setelah halaman dimuat (dan setiap kali ada elemen baru dengan icon yang di-render secara dinamis, misal lewat JS setelah event Socket.io).

## Daftar Icon yang Perlu Diterapkan

| Elemen UI | Icon Lucide yang Dipakai |
|---|---|
| Tombol "Mulai Kuis" | `play` |
| Tombol "Lanjut ke Soal Berikutnya" | `arrow-right` atau `skip-forward` |
| Tombol "Akhiri Sesi" | `square` atau `stop-circle` |
| Toggle Mode Autoplay | `zap` (otomatis) / `hand` (manual) |
| Leaderboard / Peringkat | `trophy` |
| Waiting room (jumlah peserta) | `users` |
| Timer/countdown | `clock` |
| Tombol tambah soal | `plus-circle` |
| Tombol delete soal/quiz_set | `trash-2` |
| Tombol edit | `pencil` |
| Toggle Upload vs Tempel Link | `upload` / `link` |
| Tombol kembali (di admin panel) | `arrow-left` |
| Konfirmasi berhasil (toast notifikasi) | `check-circle` |
| Konfirmasi error (toast notifikasi) | `x-circle` |
| QR Code | `qr-code` |
| Volume/musik toggle (kalau ada tombol mute) | `volume-2` / `volume-x` |
| Statistik jawaban | `bar-chart-3` |

Antigravity boleh menyesuaikan/menambah pilihan icon lain dari [daftar lengkap Lucide](https://lucide.dev/icons/) untuk elemen UI yang belum tercakup di tabel ini, selama tetap konsisten satu library.

## Kebutuhan Teknis
- Ganti SEMUA icon custom/emoji/Unicode yang saat ini dipakai untuk elemen fungsional UI (tombol, indikator status, dll) dengan Lucide — KECUALI avatar peserta dan bentuk jawaban (hexagon/chevron/bintang/segitiga) yang sudah punya sistem sendiri, itu tidak perlu diubah
- Pastikan warna icon menyesuaikan konteks (misal warna putih di background gelap, warna brand untuk state aktif/highlight) — bisa diatur lewat CSS `stroke` pada elemen SVG yang di-generate Lucide
- Ukuran icon konsisten di tiap konteks yang sama (misal semua icon di tombol utama ukurannya sama, jangan campur besar-kecil tanpa alasan jelas)

## Verifikasi
- Buka setiap halaman (host, player, admin), pastikan semua icon tampil sebagai outline icon Lucide yang konsisten, bukan lagi campuran emoji/simbol lain
- Cek icon tetap muncul dengan benar setelah elemen baru di-render dinamis lewat JS (misal saat peserta baru join, quiz set card baru dibuat) — pastikan `lucide.createIcons()` dipanggil ulang setelah render dinamis, supaya icon baru tidak kosong

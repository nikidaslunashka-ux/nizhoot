# Prompt Nizhoot v2 — Emoji Reaction di Waiting Room

## Konsep
Selagi peserta menunggu di waiting room (setelah join, sebelum host klik "Mulai Kuis"), sediakan beberapa tombol emoji/sticker yang bisa diklik peserta untuk kirim reaksi — muncul sebagai animasi di layar host, menambah keseruan sebelum kuis dimulai (mirip fitur reaction Kahoot).

## Kebutuhan Teknis

### 1. Pilihan Emoji di Layar Player (Waiting Room)
Tampilkan baris kecil berisi 5-6 tombol emoji di layar waiting room peserta, misal:
```
👍 😂 🎉 🔥 😮 ❤️
```

### 2. Alur Kirim Reaksi
- Peserta klik salah satu emoji → kirim event Socket.io ke server, misal `player:reaction` berisi `{ emoji, playerName }`
- Server broadcast event ini ke SEMUA client di room yang sama (terutama ke layar host)
- **Rate limit**: batasi peserta cuma bisa kirim 1 reaksi setiap 2 detik (cegah spam), beri feedback visual kecil kalau mereka klik terlalu cepat (misal tombol sempat disable sesaat)

### 3. Tampilan di Layar Host
- Saat menerima event reaksi, tampilkan animasi emoji yang muncul dari bawah layar, melayang ke atas sambil fade out (durasi animasi sekitar 2-3 detik), lalu hilang otomatis
- Beberapa reaksi yang datang bersamaan dari peserta berbeda boleh muncul di posisi horizontal acak, supaya tidak numpuk persis di satu titik
- Reaksi ini SEMENTARA saja (tidak perlu disimpan ke database/spreadsheet), murni visual real-time

### 4. Kapan Fitur Ini Aktif
- HANYA muncul selama waiting room (setelah join, sebelum kuis dimulai)
- Setelah host klik "Mulai Kuis", sembunyikan tombol emoji ini dari layar player (supaya tidak mengganggu fokus menjawab soal)

## Catatan Desain
- Pertahankan gaya visual brand Nizhoot untuk tombol-tombol emoji (background, border, dsb) — tapi emoji sendiri pakai karakter Unicode standar, tidak perlu digambar ulang
- Animasi cukup sederhana pakai CSS (`@keyframes` untuk translate + opacity), tidak perlu library animasi tambahan

## Verifikasi
- Join beberapa peserta ke waiting room, masing-masing klik emoji berbeda, pastikan semua muncul di layar host dengan animasi melayang
- Coba klik emoji berkali-kali dengan cepat, pastikan rate limit bekerja (tidak spam ke layar host)
- Pastikan begitu kuis dimulai, tombol emoji hilang dari layar player

# Prompt Fitur — Akhiri Sesi Kuis Saat Sedang Berjalan

## Command
Jalankan `impeccable shape` untuk merancang elemen UI baru (tombol akhiri sesi + dialog konfirmasi).

## Kebutuhan Fitur
Host butuh cara untuk **menghentikan sesi kuis di tengah jalan** (sebelum soal terakhir selesai) — misalnya kalau waktu bimtek habis lebih cepat dari perkiraan, ada gangguan teknis, atau alasan lain yang mengharuskan sesi dihentikan sebelum semua soal selesai.

## Kebutuhan Teknis

1. **Tombol "Akhiri Sesi"** — tampil di layar host, terlihat jelas tapi TIDAK di tempat yang gampang ke-klik tidak sengaja (misal taruh terpisah dari tombol "Lanjut ke Soal Berikutnya", beri warna berbeda seperti merah/danger untuk menandakan ini aksi berbeda)
2. **Dialog konfirmasi wajib** sebelum benar-benar mengakhiri — contoh teks: "Yakin ingin mengakhiri sesi kuis ini sekarang? Soal yang belum dijawab tidak akan dihitung, dan peserta akan langsung melihat leaderboard final." Sediakan tombol "Batal" dan "Ya, Akhiri Sesi"
3. **Setelah dikonfirmasi**:
   - Server hentikan timer soal yang sedang berjalan (kalau ada)
   - Kirim event Socket.io ke semua peserta di room tersebut untuk langsung pindah ke **Layar Leaderboard Final** (skip sisa soal yang belum dijalankan)
   - Leaderboard final dihitung berdasarkan skor yang sudah terkumpul sampai soal terakhir yang benar-benar selesai dijalankan
   - Room/session tersebut ditandai selesai (PIN tidak bisa dipakai join lagi setelah ini)
4. Tombol ini hanya muncul/aktif **selama kuis sedang berjalan** (setelah host klik "Mulai Kuis", sebelum soal terakhir selesai) — tidak perlu muncul di waiting room (sebelum mulai) atau setelah kuis memang sudah selesai normal

## Catatan Desain
- Pertahankan gaya visual brand Nizhoot (palet warna, taste-skill) untuk tombol dan dialog konfirmasi ini
- Pastikan dialog konfirmasi tidak menghalangi/merusak tampilan soal yang sedang berjalan kalau host batal (klik "Batal") — kuis harus bisa lanjut normal seperti tidak terjadi apa-apa

## Verifikasi
- Mulai sesi kuis, di tengah soal ke-3 dari 7 misalnya, klik "Akhiri Sesi", konfirmasi
- Semua device peserta yang terhubung harus otomatis pindah ke leaderboard final
- Coba lagi sesi baru, kali ini klik "Akhiri Sesi" lalu klik "Batal" — pastikan kuis lanjut normal, tidak ada yang rusak

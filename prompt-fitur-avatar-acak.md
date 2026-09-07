# Prompt Fitur — Avatar Ilustrasi Otomatis untuk Setiap Peserta

## Konsep
Setiap peserta yang join ke sesi kuis otomatis mendapat avatar ilustrasi berwarna (bukan cuma emoji polos) — mirip karakter kartun ala Kahoot, tanpa peserta perlu pilih manual.

## Pendekatan: DiceBear API (Avatar Ilustrasi Gratis, Tanpa Perlu Storage)
[DiceBear](https://www.dicebear.com/) adalah layanan open-source gratis yang generate avatar ilustrasi SVG secara otomatis berdasarkan "seed" (teks apa saja, misal nama peserta + timestamp join). Tidak perlu API key, tidak perlu simpan file apapun — avatar di-generate on-the-fly lewat URL.

**Contoh URL avatar:**
```
https://api.dicebear.com/9.x/adventurer/svg?seed=NAMA_ATAU_ID_UNIK
```

**Style yang direkomendasikan untuk konteks aplikasi ini** (pilih salah satu, atau kasih pilihan ke Antigravity untuk uji beberapa dulu):
- `adventurer` — karakter kartun penuh warna, ekspresif, cocok untuk suasana fun training/bimtek
- `bottts` — karakter robot lucu, cocok kalau mau kesan lebih modern/tech
- `notionists` — gaya ilustrasi flat modern, lebih clean/profesional
- `fun-emoji` — gaya emoji tapi lebih detail dan berwarna dibanding emoji Unicode polos

## Kebutuhan Teknis

### 1. Alur Assignment
- Saat peserta submit nama untuk join, generate seed unik (bisa gabungan nama + socket ID peserta, supaya avatar antar peserta beda meski nama sama)
- Construct URL DiceBear dengan seed tersebut, simpan URL ini sebagai bagian data peserta di room
- Avatar ini tidak berubah selama sesi berlangsung

### 2. Cara Render
- Cukup pakai `<img src="URL_DICEBEAR">` biasa — DiceBear return SVG langsung, ringan, tidak perlu proses tambahan
- Tambahkan `loading="lazy"` untuk optimasi kalau avatar banyak ditampilkan sekaligus (misal di leaderboard dengan banyak peserta)

### 3. Tempat Avatar Ditampilkan
- **Waiting room di layar host** — di samping/depan nama tiap peserta yang sudah join
- **Leaderboard** (sementara antar-soal maupun final) — di samping nama & skor
- **Layar player sendiri** — tampilkan avatar mereka sendiri di pojok kecil (misal dekat nama/skor mereka), sebagai konfirmasi visual "ini saya"

### 4. Fallback (Jaga-Jaga)
Kalau API DiceBear gagal diakses (misal koneksi internet venue lagi bermasalah pas load avatar), sediakan fallback sederhana: tampilkan lingkaran warna solid dengan huruf pertama nama peserta, supaya tidak ada avatar kosong/broken yang mengganggu tampilan.

## Verifikasi
- Join beberapa peserta sekaligus ke satu sesi (misal 5-6 device/tab berbeda), pastikan masing-masing dapat avatar ilustrasi berbeda
- Cek avatar konsisten tampil sama di waiting room, leaderboard, dan layar player masing-masing sepanjang sesi berlangsung
- Test dengan koneksi internet dimatikan sebentar untuk cek fallback avatar bekerja


# Prompt Fitur — Upload Gambar/Video ke Google Drive + Cascade Delete

## Konteks
Menggantikan pendekatan sebelumnya (upload ke server lokal, yang bermasalah karena filesystem ephemeral). Sekarang file gambar/video di-upload ke **Google Drive**, terorganisir per quiz_set, dengan penghapusan otomatis mengikuti (cascade) saat soal atau quiz_set dihapus. Form tetap sediakan opsi **tempel link manual** untuk sumber di luar Drive.

## Setup Awal yang Dibutuhkan

1. **Aktifkan Google Drive API** di project Google Cloud yang sama dengan yang dipakai untuk Sheets API (console.cloud.google.com > APIs & Services > Library > cari "Google Drive API" > Enable)
2. Service account yang sudah ada (dipakai untuk Sheets API) **bisa dipakai ulang** — tidak perlu bikin service account baru, cukup pastikan scope OAuth yang diminta mencakup akses Drive (`https://www.googleapis.com/auth/drive`)
3. Buat folder baru di Google Drive kamu sendiri, namai misal **"Nizhoot Media"**. Klik Share, tambahkan email service account (yang sama seperti yang dipakai di Sheets) dengan akses **Editor**
4. Catat **Folder ID** folder tersebut (dari URL Drive, bagian setelah `/folders/`), simpan sebagai environment variable baru: `DRIVE_ROOT_FOLDER_ID`

**Catatan penting soal kuota**: karena folder root dibuat di Drive akun kamu sendiri (bukan akun service account), semua file yang di-upload lewat service account akan **memakai kuota storage akun Google kamu**, bukan kuota terpisah punya service account (yang sangat terbatas). Ini kenapa langkah share folder ke service account penting dilakukan dengan cara ini, bukan biarkan service account punya folder sendiri.

## Struktur Folder di Google Drive

```
Nizhoot Media/  (root, DRIVE_ROOT_FOLDER_ID)
├── Images/
│   ├── bimtek-kkop-2026/
│   │   ├── soal1-gambar.jpg
│   │   └── soal3-gambar.png
│   └── bimtek-safety-2026/
│       └── soal2-gambar.jpg
└── Videos/
    ├── bimtek-kkop-2026/
    │   └── soal5-video.mp4
    └── bimtek-safety-2026/
```

Folder `Images` dan `Videos` dibuat sekali di awal (boleh manual sekali lewat UI Drive, atau otomatis dibuat server kalau belum ada). Subfolder per `quiz_set` dibuat otomatis oleh server saat pertama kali ada soal di set tersebut yang upload media — server harus cek dulu (via Drive API `files.list` dengan query nama+parent folder) apakah subfolder itu sudah ada, kalau belum baru `files.create` dengan `mimeType: 'application/vnd.google-apps.folder'`.

## Alur Upload

1. Admin pilih file dari form (tetap pakai `<input type="file">`, tapi hasilnya dikirim ke server, BUKAN disimpan lokal)
2. Server terima file (pakai `multer` dengan `memoryStorage`, bukan `diskStorage` — supaya file tidak pernah ditulis ke disk lokal sama sekali, langsung diteruskan ke Drive API dari memory buffer)
3. Server cari/buat subfolder quiz_set yang sesuai (di dalam `Images/` atau `Videos/` tergantung jenis file)
4. Upload file ke subfolder itu via Drive API `files.create`
5. Set permission file jadi **"Anyone with the link — Viewer"** (pakai `permissions.create` dengan `type: 'anyone', role: 'reader'`) — supaya nanti bisa ditampilkan sebagai `<img>`/`<video>` di layar host/player tanpa perlu login Google
6. Ambil `file.id` dari hasil upload, konversi jadi link yang bisa langsung dipakai:
   - Untuk gambar: `https://drive.google.com/thumbnail?id=FILE_ID&sz=w1000` (lebih reliable untuk `<img src>` dibanding format `uc?export=view`, dan parameter `sz` bisa dipakai buat batasi resolusi supaya hemat bandwidth HP peserta)
   - Untuk video: `https://drive.google.com/file/d/FILE_ID/preview` (dipakai sebagai `src` di `<iframe>`, format standar Drive untuk embed video)
7. Simpan link hasil konversi ini ke kolom `image_url`/`video_url` di spreadsheet (proses append soal seperti biasa)

## Opsi Tempel Link Manual (Tetap Ada)

Form tetap punya dua cara mengisi field gambar/video:
- **Tab/Toggle "Upload File"** — alur di atas (upload ke Drive otomatis)
- **Tab/Toggle "Tempel Link"** — input teks biasa untuk paste link dari sumber lain (Imgur, YouTube, Drive milik orang lain, dst), sama seperti rencana sebelumnya

Beri toggle jelas di form supaya admin pilih salah satu cara per field, tidak perlu dua-duanya diisi sekaligus.

## Cascade Delete

**Saat hapus 1 soal**:
- Cek dulu apakah `image_url`/`video_url` soal itu mengandung pola link Drive milik sistem ini (misal cek string `drive.google.com/thumbnail?id=` atau `drive.google.com/file/d/`)
- Kalau ya: extract `FILE_ID` dari link tersebut, panggil Drive API `files.delete(fileId)` untuk hapus file itu dari Drive
- Kalau tidak (link manual dari luar): skip, tidak perlu hapus apa-apa (karena bukan file yang sistem ini kelola)
- Bungkus proses hapus file Drive ini dengan try-catch — kalau gagal (misal file sudah terhapus manual sebelumnya, atau permission berubah), jangan sampai gagal-nya proses ini menggagalkan penghapusan baris soal di spreadsheet. Cukup log error, lanjutkan proses hapus baris soal

**Saat hapus 1 quiz_set penuh**:
- Cari subfolder quiz_set tersebut di `Images/` dan `Videos/` (berdasarkan nama quiz_set)
- Kalau subfolder ditemukan, hapus subfolder itu langsung (`files.delete` pada folder ID-nya) — ini otomatis menghapus SEMUA file di dalamnya sekaligus, tidak perlu hapus satu-satu
- Baru lanjutkan proses hapus semua baris soal terkait di spreadsheet (seperti yang sudah direncanakan sebelumnya)

## Catatan Teknis Tambahan
- Batasi ukuran file yang bisa di-upload (misal max 10MB untuk gambar, 50MB untuk video) di sisi `multer` config, supaya tidak ada upload file raksasa yang bikin lambat atau menghabiskan kuota Drive secara tidak wajar
- Tampilkan progress/loading indicator saat upload sedang berjalan (karena upload ke Drive butuh waktu, bukan instan seperti simpan lokal)
- Kalau upload gagal (misal koneksi putus, kuota penuh), tampilkan pesan error yang jelas ke admin, jangan biarkan form submit dengan link kosong/rusak

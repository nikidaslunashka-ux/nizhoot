# Nizhoot v2 — akun internal dan persetujuan

Implementasi: daftar sendiri → `pending` → super admin menyetujui → `active`.
Login memakai username/password Nizhoot, tanpa OAuth pengguna Google. Peserta tetap memakai PIN/nickname.

## Konfigurasi pertama

1. Tentukan spreadsheet **privat** untuk akun. Isi `AUTH_SPREADSHEET_ID` di `.env` dan beri service account akses editor. Variabel ini wajib; aplikasi tidak otomatis menambahkan akun ke spreadsheet soal yang mungkin sudah dipublikasikan.
   - Bisa memakai ID yang sama dengan `SPREADSHEET_ID` **hanya jika spreadsheet master tidak dipublikasikan ke web dan tidak dibagikan publik**. Hentikan publikasi lama seluruh dokumen, bukan sekadar menghapus URL dari `.env`.
   - Jika soal tetap menggunakan CSV publish-to-web, gunakan spreadsheet privat terpisah untuk akun. Tab tersembunyi bukan perlindungan akses.
   - Jangan bagikan spreadsheet akun kepada pengguna biasa. Pengelolaan melalui aplikasi.
2. Tetapkan `SPREADSHEET_ID` untuk bank soal yang sudah ada; tab soal tetap tab pertama dengan kolom A–K. Penulisan dan pemeriksaan kepemilikan sebelum perubahan memakai Sheets API langsung, tanpa fallback CSV.
3. Isi `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_NAME`, dan password awal dengan huruf besar, huruf kecil, angka, dan simbol dalam `BOOTSTRAP_ADMIN_PASSWORD` pada `.env` lokal. Jalankan `npm run bootstrap-admin` satu kali saat server belum menerima pengguna.
4. Hapus `BOOTSTRAP_ADMIN_PASSWORD` setelah bootstrap. Jalankan `npm start`, buka `/auth/`, masuk, lalu ganti password awal. Bootstrap menolak jika super admin sudah ada dan tidak mengambil alih akun pendaftar.
5. Di produksi gunakan HTTPS dan `NODE_ENV=production`. Atur `BASE_URL` atau `RENDER_EXTERNAL_URL` ke origin publik yang tepat. Aktifkan `TRUST_PROXY=1` hanya jika ada tepat satu reverse proxy tepercaya (untuk alamat IP pembatasan percobaan login).

Tidak ada password default dalam kode. Bootstrap tidak dijalankan otomatis saat server mulai. Jangan commit `.env`.

## Penyimpanan

Tab dibuat otomatis saat koneksi akun pertama atau bootstrap:

| Tab | Kolom |
| --- | --- |
| `AccountsV2` | `id`, `username`, `name`, `password_hash`, `role`, `status`, `must_change_password`, `created_at`, `reviewed_at`, `reviewed_by`, `version` |
| `QuizAccessV2` | `quiz_set`, `owner_id`, `collaborators` (ID internal dipisahkan koma) |
| `MediaUploadsV2` | `file_id`, `quiz_set`, `uploaded_by` |

Password memakai scrypt (N=32768, r=8, p=3), salt acak 16 byte, output 64 byte; parameter disertakan dalam hash. Hanya dua derivasi password berjalan bersamaan. Hash dan atribut internal tidak dikirim ke browser.

Sesi berupa token acak 32 byte dalam cookie HttpOnly, SameSite=Strict, Secure di produksi, berlaku delapan jam. Sesi disimpan di memori server; restart mengharuskan login ulang. Status dan versi akun diverifikasi ulang untuk request terlindungi dan setiap perintah host. Reset password, perubahan password, penolakan, dan penonaktifan mencabut sesi lama.

Penulisan akun dan perubahan baris soal diserialkan di satu proses. **Jalankan satu instance server saja.** Google Sheets bukan basis data transaksional; jangan edit/reorder/hapus baris soal atau akun secara manual ketika aplikasi sedang menulis. Deployment multi-instance memerlukan penyimpanan sesi bersama dan mekanisme transaksi/locking lain.

## Alur pengguna

- `/auth/`: masuk, daftar, status persetujuan, keluar. Nama 2–80 karakter, username 3–32 huruf/angka/titik/underscore/hyphen (disimpan lowercase), password wajib memuat huruf besar, huruf kecil, angka, dan simbol (maksimal 128 karakter; tanpa minimum panjang terpisah).
- Status akun: `pending`, `active`, `rejected`, `disabled`. Login yang benar pada akun nonaktif hanya menampilkan status.
- `/accounts/`: khusus super admin; filter/cari akun, Setujui/Tolak pendaftaran, Nonaktifkan/Aktifkan akun, Reset password. Tidak ada perubahan peran melalui pendaftaran maupun API publik.
- Reset: super admin menetapkan password sementara dan menyampaikannya secara pribadi. Pengguna wajib mengganti sebelum membuka dashboard/host. Pengiriman email belum termasuk.
- Akun super admin tidak bisa dinonaktifkan/reset melalui daftar pengguna; super admin mengganti password sendiri melalui Akun saya. Pemulihan super admin yang lupa password memerlukan pengelola server, bukan endpoint publik.
- `/auth/?view=access`: pemilik atau super admin menambah/mencabut kolaborator berdasarkan username aktif. Kolaborator dapat mengedit soal dan menjalankan kuis, tetapi tidak membagikan akses atau menghapus seluruh set.
- Kuis lama tanpa metadata hanya dapat diakses super admin. Super admin dapat menambahkan kolaborator dari halaman Kolaborator. Kuis baru milik pembuatnya; metadata disimpan saat upload atau penyimpanan soal pertama.
- Laporan sesi hanya untuk akun pembuat sesi dan super admin. Peserta tidak memerlukan login.

## Media master

`DRIVE_ROOT_FOLDER_ID` menunjuk folder master. Struktur tetap `Images/<quiz_set>` dan `Videos/<quiz_set>`. Batas gambar 10 MB dan video 50 MB. Tidak ada token Drive per pengguna.

Upload melalui service account memerlukan **Shared Drive Google Workspace** dengan akses yang sesuai. Folder My Drive pribadi yang dibagikan ke service account tidak memberinya kuota penyimpanan. Untuk My Drive pribadi gunakan upload manual + tempel link yang tersedia, atau tambahkan integrasi akun master yang diotorisasi satu kali sebagai pekerjaan lanjutan. Lihat [ketentuan resmi Google Drive](https://developers.google.com/workspace/drive/api/guides/about-shareddrives).

Media kuis menggunakan link yang dapat dibaca peserta; pengaturan master Drive harus mengizinkan sharing yang diperlukan. File hasil upload dicatat di `MediaUploadsV2`. Saat soal dihapus, hanya file yang terlacak pada set itu dan tidak dipakai soal lain yang dibersihkan setelah penghapusan soal berhasil. Link manual, media lama yang tidak terlacak, dan folder kosong dipertahankan; pembersihan Drive yang gagal tidak membatalkan penghapusan soal.

## Verifikasi

### Kontak bantuan akun

Super admin membuka **Kelola pengguna → Kontak bantuan akun**, mengisi nama kontak dan email, nomor telepon (+62…), atau tautan HTTPS (misalnya WhatsApp), lalu menyimpan. Kontak ditampilkan publik pada halaman masuk, daftar, dan status akun. Kosongkan kedua kolom untuk menghapusnya. Pengaturan disimpan di tab `AppSettingsV2` (`key`, `label`, `url`) yang dibuat otomatis. Hanya super admin aktif yang dapat mengubahnya; jangan masukkan informasi rahasia.

Form menampilkan petunjuk username dan kesalahan di dekat kolom, memfokuskan kesalahan pertama, serta mempertahankan draft nama/username saat berpindah masuk/daftar. Password tidak disimpan sebagai draft. Status pemeriksaan akun memiliki indikator proses.

- `npm test`: pengujian lama + uji HTTP akun/kepemilikan dengan penyimpanan tiruan.
- `npm run test:auth`: uji hash, pendaftaran, persetujuan, CSRF, kepemilikan, variasi URL, kolaborator, reset, penonaktifan, kegagalan storage, dan rate limit. Tidak menulis ke Google.
- `test/browser-auth.cjs`: uji browser memakai Playwright yang tersedia pada environment pengujian (atur `NODE_PATH` bila paket berada di runtime bersama). Data sintetis di memori. Screenshot tersimpan di `.impeccable/review/` yang diabaikan Git.
- Uji Google yang masih harus dilakukan setelah konfigurasi: bootstrap pada spreadsheet privat, daftar akun uji, setujui, login, buat/edit/hapus soal dan upload ke master Drive. Pengujian otomatis dengan mock bukan bukti bahwa izin Google/deployment produksi sudah benar.

Rencana OAuth lama pada `prompt-v2-login-ownership.md` dan `prompt-v2-media-upload.md` merupakan referensi historis, bukan spesifikasi login aktif.

## Pengaturan akun
Pengguna aktif membuka menu profil → Pengaturan akun. Profil: ubah nama dan foto (JPG/PNG/WebP<=2MB; avatar128×128 WebP). Username: perlu password saat ini, unik, username lama berhenti berlaku dan sesi lain dicabut. Keamanan: ganti password seperti sebelumnya. Kolom `photo` ditambahkan otomatis sebagai kolom L AccountsV2 ketika header versi sebelumnya cocok persis. Kepemilikan kuis tidak berubah karena memakai ID akun. Backup spreadsheet tetap disarankan sebagai operasi rutin.

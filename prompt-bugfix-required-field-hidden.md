# Prompt Bug Fix — Tombol Simpan Diam Saat Mode Upload Aktif

## Error yang Ditemukan
```
An invalid form control with name='' is not focusable. 
<input type="url" id="inputImageUrl" class="form-control" placeholder="https://... (Drive/Imgur/Web)">
```

## Penyebab
Field `inputImageUrl` (dan kemungkinan `inputVideoUrl` juga) ditandai `required` di HTML. Saat mode "Upload" aktif, field ini disembunyikan lewat CSS (`display: none`), tapi atribut `required`-nya tidak ikut dilepas. Browser mencoba validasi native form sebelum submit, ingin fokus ke field wajib yang kosong tersebut, tapi gagal karena elemennya `display: none` — akibatnya event submit batal secara silent, tidak ada pesan error yang muncul ke pengguna.

## Perbaikan yang Dibutuhkan
- Setiap kali toggle antara mode "Upload" dan "Tempel Link" diklik (baik untuk field gambar maupun video), atribut `required` HARUS ditambahkan/dilepas secara dinamis lewat JavaScript sesuai field mana yang sedang terlihat:
  - Mode "Tempel Link" aktif → `inputImageUrl.required = true` (atau sesuai kebutuhan, boleh juga tidak wajib kalau gambar/video memang opsional), field upload file di-set `required = false`
  - Mode "Upload" aktif → sebaliknya, `inputImageUrl.required = false`
- Terapkan hal yang sama untuk field video (`inputVideoUrl` dan input file video)
- Cek juga field lain di form yang mungkin punya pola serupa (disembunyikan via CSS tapi masih `required`) — perbaiki semua supaya konsisten
- Setelah perbaikan, tombol submit harus berfungsi normal baik saat mode Upload maupun mode Tempel Link aktif, tanpa error console dan tanpa submit gagal diam-diam

require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sheetsLoader = require('../server/sheetsLoader');

async function runEditQuestionTests() {
  console.log('--- Pengujian Fitur Edit Soal Admin Panel ---');

  // 1. Memeriksa keberadaan fungsi updateQuestionRow
  console.log('1. Memeriksa fungsi updateQuestionRow di server/sheetsLoader.js...');
  assert.strictEqual(typeof sheetsLoader.updateQuestionRow, 'function', 'updateQuestionRow harus diekspor sebagai fungsi');
  console.log('   ✔ sheetsLoader.updateQuestionRow terdefinisi.');

  // 2. Validasi parameter row number tidak valid (< 2)
  console.log('2. Menguji validasi nomor baris tidak valid...');
  try {
    await sheetsLoader.updateQuestionRow(1, { question: 'Test?', option_a: 'A', option_b: 'B' });
    assert.fail('Seharusnya melempar error untuk baris 1 (header)');
  } catch (err) {
    assert.ok(err.message.includes('Nomor baris tidak valid'), 'Pesan error harus memvalidasi nomor baris');
    console.log('   ✔ Penolakan nomor baris < 2 berhasil:', err.message);
  }

  // 3. Validasi field wajib (pertanyaan & minimal opsi A dan B)
  console.log('3. Menguji validasi field wajib...');
  try {
    await sheetsLoader.updateQuestionRow(5, { question: '', option_a: 'A', option_b: 'B' });
    assert.fail('Seharusnya melempar error jika teks pertanyaan kosong');
  } catch (err) {
    assert.ok(err.message.includes('wajib diisi'), 'Pesan error harus menyebutkan field wajib');
    console.log('   ✔ Penolakan pertanyaan kosong berhasil:', err.message);
  }

  try {
    await sheetsLoader.updateQuestionRow(5, { question: 'Pertanyaan', option_a: '', option_b: 'B' });
    assert.fail('Seharusnya melempar error jika pilihan A kosong');
  } catch (err) {
    assert.ok(err.message.includes('wajib diisi'), 'Pesan error harus memvalidasi pilihan A');
    console.log('   ✔ Penolakan opsi A kosong berhasil:', err.message);
  }

  // 4. Memeriksa route PUT /api/admin/questions/:rowNumber di server/index.js
  console.log('4. Memeriksa route PUT /api/admin/questions/:rowNumber di server/index.js...');
  const indexJsContent = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
  assert.ok(indexJsContent.includes("app.put('/api/admin/questions/:rowNumber'"), 'server/index.js harus memiliki route PUT');
  assert.ok(indexJsContent.includes("updateQuestionRow"), 'server/index.js harus memanggil updateQuestionRow');
  assert.ok(indexJsContent.includes("questionsCache = null"), 'server/index.js harus mereset cache soal');
  console.log('   ✔ Route PUT /api/admin/questions/:rowNumber terdaftar dan mereset cache.');

  // 5. Memeriksa struktur HTML Admin Panel (index.html)
  console.log('5. Memeriksa elemen UI Edit Soal di public/admin/index.html...');
  const htmlContent = fs.readFileSync(path.join(__dirname, '../public/admin/index.html'), 'utf8');
  assert.ok(htmlContent.includes('id="btnCancelEdit"'), 'index.html harus memiliki tombol #btnCancelEdit');
  assert.ok(htmlContent.includes('id="formTitleText"'), 'index.html harus memiliki hook #formTitleText');
  assert.ok(htmlContent.includes('id="btnSubmitText"'), 'index.html harus memiliki hook #btnSubmitText');
  assert.ok(htmlContent.includes('.btn-edit'), 'index.html harus memiliki style CSS .btn-edit');
  console.log('   ✔ Elemen UI Edit Soal, tombol Batal, dan CSS .btn-edit terverifikasi.');

  // 6. Memeriksa integrasi JavaScript di public/admin/admin.js
  console.log('6. Memeriksa logika frontend di public/admin/admin.js...');
  const adminJsContent = fs.readFileSync(path.join(__dirname, '../public/admin/admin.js'), 'utf8');
  assert.ok(adminJsContent.includes('function startEditQuestion'), 'admin.js harus memiliki startEditQuestion');
  assert.ok(adminJsContent.includes('function cancelEditQuestion'), 'admin.js harus memiliki cancelEditQuestion');
  assert.ok(adminJsContent.includes('pencil'), 'admin.js harus merender tombol edit dengan icon pencil');
  assert.ok(adminJsContent.includes("method = isEdit ? 'PUT' : 'POST'"), 'admin.js harus beralih ke PUT saat isEdit');
  assert.ok(adminJsContent.includes("btnCancelEdit.addEventListener"), 'admin.js harus memiliki click listener tombol Batal');
  console.log('   ✔ Controller frontend startEditQuestion, cancelEditQuestion, dan dynamic method PUT terverifikasi.');

  console.log('\n🎉 SEMUA PENGUJIAN FITUR EDIT SOAL BERHASIL 100%!\n');
}

runEditQuestionTests().catch(err => {
  console.error('\n❌ Pengujian Gagal:', err);
  process.exit(1);
});

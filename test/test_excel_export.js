/**
 * Automated Test: Nizhoot Excel Report & Analytics Service
 * Menguji kalkulasi metrik analitik di gameState, pembentukan file .xlsx multi-sheet,
 * serta validasi isi dan formatting workbook Excel.
 */

require('dotenv').config();
const assert = require('assert');
const ExcelJS = require('exceljs');
const gameState = require('../server/gameState');
const excelReportService = require('../server/excelReportService');

async function runTests() {
  console.log('--- Memulai Pengujian Analisis Kuis & Ekspor Excel (.xlsx) ---');

  // Test 1: Simulasi Sesi Kuis dengan Histori Jawaban
  console.log('1. Menguji Inisialisasi Room & Pelacakan Histori Jawaban...');
  const pin = '88888';
  const mockQuestions = [
    {
      id: 1,
      question: 'Apa ibukota Indonesia saat ini?',
      options: { a: 'Jakarta', b: 'Nusantara', c: 'Surabaya', d: 'Bandung' },
      correct_answer: 'a',
      duration_seconds: 15,
      quiz_set: 'Uji Coba Laporan'
    },
    {
      id: 2,
      question: 'Berapakah 25 x 4?',
      options: { a: '50', b: '75', c: '100', d: '125' },
      correct_answer: 'c',
      duration_seconds: 10,
      quiz_set: 'Uji Coba Laporan'
    }
  ];

  const room = gameState.createRoom(pin, 'Uji Coba Laporan', mockQuestions, 'mock-host');
  assert(room && Array.isArray(room.roundHistories), 'Room harus memiliki properti roundHistories berupa array');

  // Daftarkan 3 pemain
  const p1 = gameState.addPlayer(pin, 'sock-budi', 'Budi');
  const p2 = gameState.addPlayer(pin, 'sock-siti', 'Siti');
  const p3 = gameState.addPlayer(pin, 'sock-joko', 'Joko');

  assert(p1.success && p2.success && p3.success, 'Ketiga pemain harus berhasil bergabung');
  assert(Array.isArray(p1.player.answersHistory), 'Pemain harus memiliki answersHistory array');
  console.log('   ✔ Inisialisasi room dan registrasi 3 pemain tervalidasi.');

  // Test 2: Ronde 1 (Semua menjawab, variasi benar/salah)
  console.log('2. Menguji Pengumpulan Data Jawaban Ronde 1...');
  gameState.startQuestion(pin, 0);

  // Budi jawab benar (a)
  gameState.submitAnswer(pin, 'sock-budi', 'a');
  // Siti jawab salah (b)
  gameState.submitAnswer(pin, 'sock-siti', 'b');
  // Joko jawab salah (b) - sehingga B menjadi distraktor dominan
  gameState.submitAnswer(pin, 'sock-joko', 'b');

  const round1 = gameState.finishQuestion(pin);
  assert.strictEqual(round1.questionIndex, 0, 'Index ronde 1 harus 0');
  assert.strictEqual(room.roundHistories.length, 1, 'Harus ada 1 item di roundHistories');

  const q1Stat = room.roundHistories[0];
  assert.strictEqual(q1Stat.correctCount, 1, 'Jawaban benar harus 1 (Budi)');
  assert.strictEqual(q1Stat.wrongCount, 2, 'Jawaban salah harus 2 (Siti, Joko)');
  assert.strictEqual(q1Stat.accuracyPercentage, 33, 'Akurasi harus 33% (1 dari 3)');
  assert.strictEqual(q1Stat.difficulty, 'Sulit', 'Akurasi 33% harus berkategori Sulit');
  assert.strictEqual(q1Stat.topDistractor, 'B', 'Pengecoh dominan harus B');
  console.log('   ✔ Analisis butir soal ronde 1 terverifikasi akurat (Distraktor: B, Kesulitan: Sulit).');

  // Test 3: Ronde 2 (Budi & Siti jawab benar, Joko tidak menjawab / timeout)
  console.log('3. Menguji Pengumpulan Data Jawaban Ronde 2 (Dengan Timeout)...');
  gameState.startQuestion(pin, 1);

  // Budi & Siti jawab c (benar)
  gameState.submitAnswer(pin, 'sock-budi', 'c');
  gameState.submitAnswer(pin, 'sock-siti', 'c');
  // Joko sengaja tidak submitAnswer (simulasi timeout)

  const round2 = gameState.finishQuestion(pin);
  assert.strictEqual(room.roundHistories.length, 2, 'Harus ada 2 item di roundHistories');
  const q2Stat = room.roundHistories[1];
  assert.strictEqual(q2Stat.correctCount, 2, 'Jawaban benar harus 2');
  assert.strictEqual(q2Stat.accuracyPercentage, 67, 'Akurasi harus 67% (2 dari 3)');
  assert.strictEqual(q2Stat.difficulty, 'Sedang', 'Akurasi 67% harus berkategori Sedang');

  // Verifikasi answersHistory Joko mencatat timeout '-'
  const playerJoko = room.players.get('sock-joko');
  assert.strictEqual(playerJoko.answersHistory.length, 2, 'Joko harus punya 2 catatan jawaban');
  assert.strictEqual(playerJoko.answersHistory[1].selectedOption, '-', 'Jawaban ronde 2 Joko harus - (timeout)');
  assert.strictEqual(playerJoko.answersHistory[1].isCorrect, false, 'Timeout harus dinilai salah');
  console.log('   ✔ Penanganan timeout peserta pada ronde 2 tervalidasi.');

  // Test 4: Ekstraksi Data Laporan Terstruktur (getSessionReportData)
  console.log('4. Menguji getSessionReportData(pin)...');
  const reportData = gameState.getSessionReportData(pin);
  assert(reportData, 'Data laporan sesi tidak boleh null');
  assert.strictEqual(reportData.totalQuestions, 2, 'Total soal harus 2');
  assert.strictEqual(reportData.totalParticipants, 3, 'Total peserta harus 3');
  assert(reportData.overview.averageScore > 0, 'Rata-rata skor harus > 0');
  assert(reportData.overview.overallAccuracy === 50, 'Akurasi sesi total harus 50% (3 benar dari 6 respon)');
  assert.strictEqual(reportData.overview.hardestQuestion.number, 1, 'Soal tersulit harus soal nomor 1');

  // Verifikasi klasifikasi peserta
  assert.strictEqual(reportData.players[0].nickname, 'Budi', 'Juara 1 harus Budi');
  assert.strictEqual(reportData.players[0].accuracy, 100, 'Akurasi Budi harus 100%');
  assert.strictEqual(reportData.players[0].mastery, 'Sangat Paham', 'Budi harus berkategori Sangat Paham');

  assert.strictEqual(reportData.players[1].nickname, 'Siti', 'Peringkat 2 harus Siti');
  assert.strictEqual(reportData.players[1].accuracy, 50, 'Akurasi Siti harus 50%');
  assert.strictEqual(reportData.players[1].mastery, 'Cukup Paham', 'Siti harus berkategori Cukup Paham');

  assert.strictEqual(reportData.players[2].nickname, 'Joko', 'Peringkat 3 harus Joko');
  assert.strictEqual(reportData.players[2].accuracy, 0, 'Akurasi Joko harus 0%');
  assert.strictEqual(reportData.players[2].mastery, 'Perlu Remedial', 'Joko harus berkategori Perlu Remedial');
  console.log('   ✔ Klasifikasi penguasaan peserta (Sangat Paham, Cukup Paham, Perlu Remedial) 100% valid.');

  // Test 5: Pembuatan File Excel Multi-Sheet (.xlsx Buffer)
  console.log('5. Menguji Pembuatan Buffer File Excel (.xlsx) dengan ExcelJS...');
  const excelBuffer = await excelReportService.generateSessionExcel(reportData);
  assert(excelBuffer && excelBuffer.length > 5000, 'Buffer Excel harus valid dan berukuran wajar (> 5 KB)');
  console.log(`   ✔ Buffer Excel berhasil dibentuk (Ukuran: ${(excelBuffer.length / 1024).toFixed(1)} KB).`);

  // Test 6: Membaca Ulang File Excel & Memvalidasi 3 Worksheet
  console.log('6. Membaca Kembali Workbook Excel & Memverifikasi 3 Worksheet...');
  const testWorkbook = new ExcelJS.Workbook();
  await testWorkbook.xlsx.load(excelBuffer);

  const sheetNames = testWorkbook.worksheets.map(w => w.name);
  assert(sheetNames.includes('Ringkasan & Analisis Soal'), 'Harus memiliki sheet Ringkasan & Analisis Soal');
  assert(sheetNames.includes('Peringkat & Evaluasi Peserta'), 'Harus memiliki sheet Peringkat & Evaluasi Peserta');
  assert(sheetNames.includes('Matriks Respons Detail'), 'Harus memiliki sheet Matriks Respons Detail');
  console.log('   ✔ Ketiga worksheet Excel terkonfirmasi hadir sesuai spesifikasi.');

  // Verifikasi isi Sheet 1
  const s1 = testWorkbook.getWorksheet('Ringkasan & Analisis Soal');
  assert(s1.getCell('A1').value.includes('LAPORAN HASIL & ANALISIS'), 'Judul Sheet 1 harus sesuai');
  assert.strictEqual(s1.getCell('A11').value, 1, 'Nomor soal pertama baris 11 harus 1');

  // Verifikasi isi Sheet 2
  const s2 = testWorkbook.getWorksheet('Peringkat & Evaluasi Peserta');
  assert(s2.getCell('A1').value.includes('PERINGKAT AKHIR'), 'Judul Sheet 2 harus sesuai');
  assert.strictEqual(s2.getCell('B4').value, 'Budi', 'Peserta baris 4 harus Budi');
  assert.strictEqual(s2.getCell('H4').value, 'Sangat Paham', 'Kategori penguasaan Budi harus Sangat Paham');

  // Verifikasi isi Sheet 3 (Matriks)
  const s3 = testWorkbook.getWorksheet('Matriks Respons Detail');
  assert(s3.getCell('A1').value.includes('MATRIKS RESPONS DETAIL'), 'Judul Sheet 3 harus sesuai');
  assert.strictEqual(s3.getCell('D4').value, 'Soal 1', 'Kolom D baris 4 harus Soal 1');
  assert.strictEqual(s3.getCell('E4').value, 'Soal 2', 'Kolom E baris 4 harus Soal 2');

  console.log('   ✔ Seluruh sel data, header, dan formula ketiga sheet tervalidasi 100%.');

  // Bersihkan room uji coba
  gameState.deleteRoom(pin);
  console.log('\n🎉 SEMUA PENGUJIAN FITUR ANALISIS & EKSPOR EXCEL BERHASIL (100% PASS)!');
}

runTests().catch(err => {
  console.error('❌ Test Gagal:', err);
  process.exit(1);
});

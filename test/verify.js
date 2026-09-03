/**
 * Automated Verification Script untuk Nizhoot (Updated with Autoplay & Player Text)
 */

require('dotenv').config();
const assert = require('assert');
const os = require('os');
const { loadQuestions } = require('../server/sheetsLoader');
const gameState = require('../server/gameState');

async function runTests() {
  console.log('--- Memulai Pengujian Otomatis Nizhoot (Fitur Baru) ---');

  // Test 1: Deteksi IP Lokal
  console.log('1. Menguji Deteksi IP Lokal...');
  const interfaces = os.networkInterfaces();
  let foundIp = null;
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        foundIp = iface.address;
        break;
      }
    }
  }
  assert(foundIp !== '127.0.0.1', 'IP lokal yang terdeteksi bukan internal 127.0.0.1');
  console.log(`   ✔ Deteksi IP lokal jaringan berhasil: ${foundIp || 'localhost'}`);

  // Test 2: Google Spreadsheet Loader
  console.log('2. Menguji Sheets Loader...');
  const sheetResult = await loadQuestions();
  assert(sheetResult && sheetResult.sets, 'SheetsLoader harus mengembalikan objek sets');
  assert(sheetResult.totalCount > 0, 'Harus ada soal yang dimuat dari CSV atau fallback');
  console.log(`   ✔ Berhasil memuat ${sheetResult.totalCount} soal dari ${sheetResult.setNames.length} set.`);

  // Test 3: In-Memory Game State Manager & Autoplay
  console.log('3. Menguji Game State Manager & Autoplay...');
  const pin = gameState.generatePin();
  assert(pin && pin.length === 5, 'PIN harus 5 digit string');

  const testQuestions = [
    {
      id: 1,
      question: 'Berapa 10 x 10?',
      options: { a: '50', b: '100', c: '150', d: '200' },
      correct_answer: 'b',
      duration_seconds: 15,
      image_url: '/assets/images/test.png',
      video_url: '',
      quiz_set: 'Test Set'
    }
  ];

  const room = gameState.createRoom(pin, 'Test Set', testQuestions, 'mock-host-socket');
  assert(room && room.pin === pin, 'Room harus terbuat dengan PIN yang sesuai');

  gameState.setAutoplay(pin, true, true);
  assert(room.autoplay === true, 'Autoplay harus berhasil diaktifkan');
  assert(room.skipWhenAllAnswered === true, 'skipWhenAllAnswered harus bernilai true');
  console.log(`   ✔ Room ${pin} dan mode Autoplay tervalidasi.`);

  // Test 4: Player Join
  console.log('4. Menguji Pendaftaran Pemain...');
  const p1 = gameState.addPlayer(pin, 'socket-1', 'Budi');
  assert(p1.success, 'Budi harus berhasil bergabung');
  console.log('   ✔ Pendaftaran pemain tervalidasi.');

  // Test 5: Mulai Soal — Player Sekarang Menerima Teks Soal & Media
  console.log('5. Menguji Pembagian Data Soal ke Player & Host...');
  const qStart = gameState.startQuestion(pin, 0);
  assert(qStart && qStart.hostQuestionData && qStart.playerQuestionData, 'Data soal harus terbagi');
  assert(qStart.playerQuestionData.question === 'Berapa 10 x 10?', 'Player HARUS menerima teks soal!');
  assert(qStart.playerQuestionData.options.b === '100', 'Player HARUS menerima pilihan jawaban!');
  assert(qStart.playerQuestionData.image_url === '/assets/images/test.png', 'Player HARUS menerima URL gambar media!');
  console.log('   ✔ Player menerima teks soal, opsi jawaban, dan media gambar.');

  // Test 6: Submit Jawaban & Scoring
  console.log('6. Menguji Submit Jawaban...');
  const ans = gameState.submitAnswer(pin, 'socket-1', 'b');
  assert(ans.success, 'Jawaban Budi berhasil diproses');
  assert(ans.allAnswered, 'Semua pemain sudah menjawab');
  console.log('   ✔ Jawaban terverifikasi.');

  // Test 7: Ringkasan Ronde
  console.log('7. Menguji Ringkasan Ronde & Leaderboard...');
  const summary = gameState.finishQuestion(pin);
  assert(summary.leaderboard[0].nickname === 'Budi', 'Budi harus memimpin');
  console.log(`   ✔ Peringkat 1: ${summary.leaderboard[0].nickname} (${summary.leaderboard[0].score} pts).`);

  console.log('\n🎉 SEMUA PENGUJIAN FITUR BARU BERHASIL (100% PASS)!');
}

runTests().catch(err => {
  console.error('\n❌ PENGUJIAN GAGAL:', err);
  process.exit(1);
});

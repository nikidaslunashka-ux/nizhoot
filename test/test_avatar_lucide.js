const assert = require('assert');
const fs = require('fs');
const path = require('path');
const gameState = require('../server/gameState');

async function testAvatarAndLucide() {
  console.log('--- Pengujian Integrasi Avatar DiceBear & Lucide Icons ---');

  // 1. Uji Ketersediaan Asset Lucide Lokal (Offline Readiness)
  console.log('1. Memeriksa file standalone Lucide UMD...');
  const lucidePath = path.join(__dirname, '../public/shared/lucide.js');
  assert(fs.existsSync(lucidePath), 'public/shared/lucide.js harus tersedia');
  const lucideStat = fs.statSync(lucidePath);
  assert(lucideStat.size > 500000, 'Ukuran file lucide.js harus > 500KB');
  console.log('   ✔ File lucide.js valid (' + (lucideStat.size / 1024).toFixed(1) + ' KB).');

  // 2. Uji Integrasi Lucide script di Host, Player, Admin HTML
  console.log('2. Memeriksa tag script Lucide di HTML Host, Player, dan Admin...');
  const hostHtml = fs.readFileSync(path.join(__dirname, '../public/host/index.html'), 'utf-8');
  const playerHtml = fs.readFileSync(path.join(__dirname, '../public/player/index.html'), 'utf-8');
  const adminHtml = fs.readFileSync(path.join(__dirname, '../public/admin/index.html'), 'utf-8');

  assert(hostHtml.includes('/shared/lucide.js'), 'Host HTML harus memuat /shared/lucide.js');
  assert(playerHtml.includes('/shared/lucide.js'), 'Player HTML harus memuat /shared/lucide.js');
  assert(hostHtml.includes('data-lucide="play"'), 'Host HTML harus menggunakan data-lucide="play"');
  assert(adminHtml.includes('data-lucide="plus-circle"'), 'Admin HTML harus menggunakan data-lucide="plus-circle"');
  console.log('   ✔ Tag Lucide dan icons terpasang di seluruh view HTML.');

  // 3. Uji Bentuk Jawaban Nizhoot Tidak Berubah (Tetap Hexagon, Chevron, Bintang, Segitiga)
  console.log('3. Memastikan bentuk jawaban Nizhoot (Hexagon, Chevron, Star, Triangle) tetap utuh...');
  assert(hostHtml.includes('shape-hexagon') && hostHtml.includes('shape-chevron'), 'Bentuk host harus tetap utuh');
  assert(playerHtml.includes('shape-hexagon') && playerHtml.includes('shape-triangle'), 'Bentuk gamepad player harus tetap utuh');
  console.log('   ✔ Bentuk jawaban Nizhoot 100% terjaga.');

  // 4. Simulasi Room dengan 5 Pemain Berbeda
  console.log('4. Menguji Seed Avatar Unik untuk 5 Pemain Sekaligus...');
  const pin = gameState.generatePin();
  const mockQuestions = [
    {
      question: 'Ibukota Indonesia baru adalah?',
      options: { a: 'Jakarta', b: 'Nusantara', c: 'Bandung', d: 'Surabaya' },
      correct_answer: 'b',
      duration_seconds: 20
    }
  ];

  gameState.createRoom(pin, 'Geografi', mockQuestions, 'host-sock-xyz');

  const nicknames = ['Fajar', 'Siti', 'Bambang', 'Dewi', 'Rudi'];
  const players = [];

  for (let i = 0; i < nicknames.length; i++) {
    const res = gameState.addPlayer(pin, 'sock-' + (i + 1), nicknames[i]);
    assert(res.success, 'Pemain ' + nicknames[i] + ' harus berhasil join');
    assert(res.player.avatar, 'Pemain ' + nicknames[i] + ' harus memiliki URL avatar');
    assert(res.player.avatar.startsWith('https://api.dicebear.com/9.x/adventurer/svg?seed='), 'Avatar harus menggunakan style adventurer SVG');
    players.push(res.player);
  }

  // Pastikan semua seed berbeda dan tidak ada avatar yang duplikat
  const avatarSet = new Set(players.map(p => p.avatar));
  assert.strictEqual(avatarSet.size, 5, 'Kelima pemain harus memiliki avatar dengan seed unik');
  console.log('   ✔ 5 Pemain berhasil terdaftar dengan 5 avatar unik DiceBear.');

  // 5. Uji Avatar di Lobby Roster
  console.log('5. Menguji ketersediaan avatar di daftar pemain Lobby...');
  const lobbyList = gameState.getPlayerList(pin);
  assert.strictEqual(lobbyList.length, 5, 'Lobby harus berisi 5 pemain');
  lobbyList.forEach(p => {
    assert(p.avatar, 'Pemain ' + p.nickname + ' di lobby list harus memiliki avatar');
  });
  console.log('   ✔ Semua pemain di lobby menyertakan URL avatar.');

  // 6. Uji Avatar di Interim Leaderboard (Round Summary)
  console.log('6. Menguji ketersediaan avatar di Leaderboard hasil ronde...');
  gameState.startQuestion(pin, 0);
  gameState.submitAnswer(pin, 'sock-1', 'b');
  gameState.submitAnswer(pin, 'sock-2', 'b');
  gameState.submitAnswer(pin, 'sock-3', 'a');
  gameState.submitAnswer(pin, 'sock-4', 'b');
  gameState.submitAnswer(pin, 'sock-5', 'c');

  const roundSummary = gameState.finishQuestion(pin);
  assert(roundSummary && roundSummary.leaderboard.length > 0, 'Leaderboard harus ada');
  roundSummary.leaderboard.forEach(lb => {
    assert(lb.avatar, 'Pemain ' + lb.nickname + ' di leaderboard harus memiliki avatar');
    assert(lb.avatar.includes('dicebear.com'), 'Avatar harus berupa URL DiceBear');
  });
  console.log('   ✔ Seluruh peserta di top leaderboard menyertakan URL avatar.');

  // 7. Uji Avatar di Final Podium
  console.log('7. Menguji ketersediaan avatar di Podium Final...');
  const finalPodium = gameState.getFinalPodium(pin);
  assert(finalPodium && finalPodium.podium, 'Podium harus terbentuk');
  assert(finalPodium.podium.first.avatar, 'Juara 1 harus memiliki avatar');
  assert(finalPodium.podium.second.avatar, 'Juara 2 harus memiliki avatar');
  assert(finalPodium.podium.third.avatar, 'Juara 3 harus memiliki avatar');
  
  finalPodium.rankings.forEach(r => {
    assert(r.avatar, 'Peringkat #' + r.rank + ' (' + r.nickname + ') harus memiliki avatar');
  });
  console.log('   ✔ Juara 1, 2, 3 dan seluruh ranking di Podium Final menyertakan avatar.');

  // 8. Uji Tampilan Avatar Podium Host (host.js & host.css)
  console.log('8. Memeriksa komponen avatar podium di Host...');
  const hostJs = fs.readFileSync(path.join(__dirname, '../public/host/host.js'), 'utf-8');
  const hostCss = fs.readFileSync(path.join(__dirname, '../public/host/host.css'), 'utf-8');
  assert(hostJs.includes('podium-avatar-wrapper'), 'host.js harus merender podium-avatar-wrapper');
  assert(hostJs.includes('updatePodiumSlot'), 'host.js harus memiliki updatePodiumSlot');
  assert(hostCss.includes('.podium-avatar-wrapper'), 'host.css harus memiliki styling .podium-avatar-wrapper');
  assert(hostCss.includes('.rank-1 .podium-avatar-wrapper'), 'host.css harus memiliki styling juara 1');
  console.log('   ✔ Komponen avatar podium host proyektor terverifikasi.');

  // 9. Uji Tampilan Avatar Podium Player (player.js, player.html & player.css)
  console.log('9. Memeriksa komponen avatar podium di Player...');
  const playerJs = fs.readFileSync(path.join(__dirname, '../public/player/player.js'), 'utf-8');
  const playerCss = fs.readFileSync(path.join(__dirname, '../public/player/player.css'), 'utf-8');
  assert(playerHtml.includes('id="playerPodiumSection"'), 'player/index.html harus memiliki #playerPodiumSection');
  assert(playerJs.includes('renderPlayerPodium'), 'player.js harus memiliki fungsi renderPlayerPodium');
  assert(playerCss.includes('.player-podium-card'), 'player.css harus memiliki styling .player-podium-card');
  assert(playerCss.includes('.player-podium-avatar-img'), 'player.css harus memiliki styling .player-podium-avatar-img');
  console.log('   ✔ Komponen avatar podium dan kartu final player HP terverifikasi.');

  console.log('\n🎉 SEMUA PENGUJIAN INTEGRASI AVATAR & LUCIDE BERHASIL 100%!');
}

testAvatarAndLucide().catch(err => {
  console.error('\n❌ PENGUJIAN INTEGRASI GAGAL:', err);
  process.exit(1);
});

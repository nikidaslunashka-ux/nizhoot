/**
 * Nizhoot — Player Client Controller
 * Mengelola interaksi gamepad peserta di HP, teks soal + media, dan skema bentuk baru.
 */

const socket = io();

// State Lokal Player
let myPin = '';
let myNickname = '';
let myScore = 0;
let myAvatar = '';
let hasAnsweredCurrentQuestion = false;

// DOM Elements - Seluruh Layar Player Saling Eksklusif
const views = {
  join: document.getElementById('viewJoin'),
  lobby: document.getElementById('viewLobby'),
  gamepad: document.getElementById('viewGamepad'),
  submitted: document.getElementById('viewSubmitted'),
  result: document.getElementById('viewResult'),
  final: document.getElementById('viewFinal')
};

const playerMeta = document.getElementById('playerMeta');
const hudNickname = document.getElementById('hudNickname');
const hudScore = document.getElementById('hudScore');
const hudAvatarImg = document.getElementById('hudAvatarImg');
const hudAvatarFallback = document.getElementById('hudAvatarFallback');

// Join View Elements
const formJoin = document.getElementById('formJoin');
const inputPin = document.getElementById('inputPin');
const inputNickname = document.getElementById('inputNickname');
const joinErrorMessage = document.getElementById('joinErrorMessage');
const btnSubmitJoin = document.getElementById('btnSubmitJoin');

// Lobby View Elements
const waitingNickname = document.getElementById('waitingNickname');
const waitingAvatarImg = document.getElementById('waitingAvatarImg');
const waitingAvatarFallback = document.getElementById('waitingAvatarFallback');

// Gamepad View Elements
const gamepadQuestionNum = document.getElementById('gamepadQuestionNum');
const gamepadTimer = document.getElementById('gamepadTimer');
const gamepadTimerSeconds = document.getElementById('gamepadTimerSeconds');
const playerQuestionText = document.getElementById('playerQuestionText');
const playerMediaContainer = document.getElementById('playerMediaContainer');
const playerMediaImage = document.getElementById('playerMediaImage');
const playerVideoWrapper = document.getElementById('playerVideoWrapper');
const playerOptA = document.getElementById('playerOptA');
const playerOptB = document.getElementById('playerOptB');
const playerOptC = document.getElementById('playerOptC');
const playerOptD = document.getElementById('playerOptD');
const gamepadBtns = document.querySelectorAll('.gamepad-btn');

// Result View Elements
const resultCard = document.getElementById('resultCard');
const resultIcon = document.getElementById('resultIcon');
const resultTitle = document.getElementById('resultTitle');
const resultPoints = document.getElementById('resultPoints');
const resultRank = document.getElementById('resultRank');
const resultStreak = document.getElementById('resultStreak');

// Final View Elements
const finalRankDisplay = document.getElementById('finalRankDisplay');
const finalScoreDisplay = document.getElementById('finalScoreDisplay');
const finalAvatarImg = document.getElementById('finalAvatarImg');
const finalAvatarFallback = document.getElementById('finalAvatarFallback');

function renderLucideIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

/**
 * Fungsi Terpusat Pengelola Layar:
 * Menjamin HANYA SATU layar yang aktif (display: flex) dan semua layar lainnya display: none
 * Opsi screenName: 'join' | 'lobby' | 'gamepad' | 'submitted' | 'result' | 'final'
 */
function showScreen(screenName) {
  for (const [key, el] of Object.entries(views)) {
    if (!el) continue;
    if (key === screenName) {
      el.classList.add('active');
      el.style.setProperty('display', 'flex', 'important');
    } else {
      el.classList.remove('active');
      el.style.setProperty('display', 'none', 'important');
    }
  }
  renderLucideIcons();
}

// ==========================================
// 1. INISIALISASI & VALIDASI INPUT PIN
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  renderLucideIcons();
  // Pastikan saat pertama kali dibuka HANYA Layar Join yang tampil
  showScreen('join');

  // Filter input PIN: Hanya izinkan digit 0-9 dan maksimal 5 karakter (tanpa stepper)
  if (inputPin) {
    inputPin.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5);
    });

    // Auto-fill jika PIN terdapat di URL query string (?pin=12345)
    const urlParams = new URLSearchParams(window.location.search);
    const pinParam = urlParams.get('pin');
    if (pinParam) {
      inputPin.value = pinParam.replace(/\D/g, '').slice(0, 5);
      inputNickname.focus();
    } else {
      inputPin.focus();
    }
  }
});

// ==========================================
// 2. JOIN HANDLER
// ==========================================

btnSubmitJoin.addEventListener('click', handleJoin);
formJoin.addEventListener('submit', (e) => {
  e.preventDefault();
  handleJoin();
});

function handleJoin() {
  window.soundFX.init();

  const pin = inputPin.value.trim();
  const nickname = inputNickname.value.trim();

  if (!pin || !nickname) {
    showError('PIN dan Nama Panggilan wajib diisi.');
    return;
  }

  if (pin.length < 4 || pin.length > 5) {
    showError('Game PIN harus terdiri dari 4-5 angka.');
    return;
  }

  hideError();
  btnSubmitJoin.disabled = true;
  btnSubmitJoin.textContent = 'Menghubungkan...';

  myPin = pin;
  myNickname = nickname;

  socket.emit('player:join', { pin, nickname });
}

function showError(msg) {
  joinErrorMessage.textContent = msg;
  joinErrorMessage.style.display = 'block';
}

function hideError() {
  joinErrorMessage.style.display = 'none';
}

// Berhasil Bergabung -> Tampilkan Layar Waiting Room
socket.on('player:joined_success', (data) => {
  myAvatar = data.avatar || `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(myNickname)}`;
  const initial = (myNickname || '?').charAt(0).toUpperCase();

  hudNickname.textContent = myNickname;
  hudScore.textContent = '0 pts';

  // HUD Avatar
  if (hudAvatarImg) {
    hudAvatarImg.src = myAvatar;
    hudAvatarImg.style.display = 'block';
  }
  if (hudAvatarFallback) {
    hudAvatarFallback.textContent = initial;
    hudAvatarFallback.style.display = 'none';
  }

  // Waiting Lobby Avatar
  if (waitingAvatarImg) {
    waitingAvatarImg.src = myAvatar;
    waitingAvatarImg.style.display = 'block';
  }
  if (waitingAvatarFallback) {
    waitingAvatarFallback.textContent = initial;
    waitingAvatarFallback.style.display = 'none';
  }

  // Final Card Avatar
  if (finalAvatarImg) {
    finalAvatarImg.src = myAvatar;
    finalAvatarImg.style.display = 'block';
  }
  if (finalAvatarFallback) {
    finalAvatarFallback.textContent = initial;
    finalAvatarFallback.style.display = 'none';
  }

  playerMeta.style.display = 'flex';
  waitingNickname.textContent = myNickname;

  showScreen('lobby');
});

// Gagal Bergabung
socket.on('player:join_error', ({ message }) => {
  btnSubmitJoin.disabled = false;
  btnSubmitJoin.innerHTML = '<i data-lucide="log-in"></i> Masuk Game';
  renderLucideIcons();
  showError(message || 'Gagal bergabung ke room.');
});

// ==========================================
// 3. GAMEPLAY & JAWABAN (GAMEPAD)
// ==========================================

// Soal Baru Dimulai -> Tampilkan Layar Soal (Gamepad)
socket.on('player:new_question', (data) => {
  hasAnsweredCurrentQuestion = false;
  gamepadQuestionNum.textContent = `Soal ${data.index + 1} dari ${data.total}`;
  if (gamepadTimerSeconds) {
    gamepadTimerSeconds.textContent = `${data.duration}s`;
  } else if (gamepadTimer) {
    gamepadTimer.textContent = `${data.duration}s`;
  }

  // Tampilkan Teks Pertanyaan di HP
  if (data.question) {
    playerQuestionText.textContent = data.question;
  }

  // Tampilkan Teks Pilihan Jawaban di Tombol HP (Auto-wrap & Dynamic Sizing)
  if (data.options) {
    const opts = [
      { el: playerOptA, val: data.options.a || '-' },
      { el: playerOptB, val: data.options.b || '-' },
      { el: playerOptC, val: data.options.c || '-' },
      { el: playerOptD, val: data.options.d || '-' }
    ];

    opts.forEach(({ el, val }) => {
      el.textContent = val;
      el.classList.remove('long-text', 'extra-long-text');
      const len = (val || '').trim().length;
      if (len > 55) {
        el.classList.add('extra-long-text');
      } else if (len > 28) {
        el.classList.add('long-text');
      }
    });
  }

  // Tampilkan Media jika ada di soal
  const viewGamepad = document.getElementById('viewGamepad');
  if (data.image_url) {
    playerMediaContainer.style.display = 'flex';
    playerMediaImage.style.display = 'block';
    playerMediaImage.src = formatDriveMediaUrl(data.image_url, 'image');
    playerVideoWrapper.style.display = 'none';
    playerVideoWrapper.innerHTML = '';
    if (viewGamepad) viewGamepad.classList.remove('no-media');
  } else if (data.video_url) {
    playerMediaContainer.style.display = 'flex';
    playerMediaImage.style.display = 'none';
    playerVideoWrapper.style.display = 'block';
    if (data.video_url.includes('drive.google.com') || data.video_url.includes('docs.google.com')) {
      const previewUrl = formatDriveMediaUrl(data.video_url, 'video');
      playerVideoWrapper.innerHTML = `<iframe src="${previewUrl}" allow="autoplay" allowfullscreen></iframe>`;
    } else {
      const embedUrl = getYouTubeEmbedUrl(data.video_url);
      if (embedUrl.includes('youtube.com/embed/')) {
        playerVideoWrapper.innerHTML = `<iframe src="${embedUrl}?autoplay=1&mute=1" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
      } else {
        playerVideoWrapper.innerHTML = `<video src="${data.video_url}" autoplay muted loop playsinline></video>`;
      }
    }
    if (viewGamepad) viewGamepad.classList.remove('no-media');
  } else {
    playerMediaContainer.style.display = 'none';
    playerMediaImage.src = '';
    playerVideoWrapper.innerHTML = '';
    if (viewGamepad) viewGamepad.classList.add('no-media');
  }

  // Aktifkan kembali 4 tombol jawaban
  gamepadBtns.forEach(btn => {
    btn.disabled = false;
    btn.style.opacity = '1';
  });

  // Tampilkan Layar Gamepad secara eksklusif
  showScreen('gamepad');
});

// Update Timer Detik
socket.on('game:timer_tick', ({ secondsRemaining }) => {
  if (gamepadTimerSeconds) {
    gamepadTimerSeconds.textContent = `${secondsRemaining}s`;
  } else if (gamepadTimer) {
    gamepadTimer.textContent = `${secondsRemaining}s`;
  }
});

// Tap Tombol Jawaban di HP -> Tampilkan Layar Submitted
gamepadBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (hasAnsweredCurrentQuestion) return;

    if (navigator.vibrate) {
      navigator.vibrate(40);
    }

    const selectedOption = btn.getAttribute('data-option');
    hasAnsweredCurrentQuestion = true;

    // Disable tombol seketika
    gamepadBtns.forEach(b => {
      b.disabled = true;
      if (b !== btn) b.style.opacity = '0.4';
    });

    socket.emit('player:submit_answer', {
      pin: myPin,
      answer: selectedOption
    });

    showScreen('submitted');
  });
});

// ==========================================
// 4. HASIL RONDE & PODIUM
// ==========================================

// Hasil Ronde -> Tampilkan Layar Result Feedback
socket.on('player:question_result', (data) => {
  myScore = data.totalScore;
  hudScore.textContent = `${myScore.toLocaleString()} pts`;

  resultCard.className = 'result-card ' + (data.isCorrect ? 'correct' : 'wrong');

  if (data.isCorrect) {
    resultIcon.innerHTML = '<i data-lucide="check-circle"></i>';
    resultTitle.textContent = 'Benar!';
    resultPoints.textContent = `+${data.pointsEarned.toLocaleString()} Poin`;
    window.soundFX.playCorrect();
  } else {
    resultIcon.innerHTML = '<i data-lucide="x-circle"></i>';
    resultTitle.textContent = 'Belum Tepat';
    resultPoints.textContent = '+0 Poin';
    window.soundFX.playWrong();
  }

  resultRank.innerHTML = `<i data-lucide="trophy"></i> #${data.rank}`;
  resultStreak.innerHTML = `<i data-lucide="flame"></i> ${data.streak}`;

  showScreen('result');
});

// Kuis Selesai -> Tampilkan Layar Final Leaderboard/Podium
socket.on('game:final_podium', (data) => {
  let myFinalRank = '-';
  if (data.rankings && Array.isArray(data.rankings)) {
    const found = data.rankings.find(r => r.nickname === myNickname);
    if (found) {
      myFinalRank = `#${found.rank}`;
      if (found.avatar) {
        myAvatar = found.avatar;
      }
      if (typeof found.score === 'number') {
        myScore = found.score;
      }
    }
  }

  // Pastikan avatar player di kartu hasil akhir selalu tampil
  const initial = (myNickname || '?').charAt(0).toUpperCase();
  if (!myAvatar && myNickname) {
    myAvatar = `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(myNickname)}`;
  }

  if (finalAvatarImg && myAvatar) {
    finalAvatarImg.src = myAvatar;
    finalAvatarImg.style.display = 'block';
    if (finalAvatarFallback) {
      finalAvatarFallback.textContent = initial;
      finalAvatarFallback.style.display = 'none';
    }
  } else if (finalAvatarFallback) {
    finalAvatarFallback.textContent = initial;
    finalAvatarFallback.style.display = 'flex';
    if (finalAvatarImg) finalAvatarImg.style.display = 'none';
  }

  finalRankDisplay.textContent = myFinalRank;
  finalScoreDisplay.textContent = `${myScore.toLocaleString()} Poin`;

  // Render Podium Pemenang di Layar Player HP
  renderPlayerPodium(data.podium);

  showScreen('final');
  renderLucideIcons();
});

function renderPlayerPodium(podium) {
  const container = document.getElementById('playerPodiumSection');
  const list = document.getElementById('playerPodiumList');
  if (!container || !list || !podium) return;

  const winners = [
    { rank: 1, medal: '🥇', data: podium.first, rankClass: 'podium-rank-1' },
    { rank: 2, medal: '🥈', data: podium.second, rankClass: 'podium-rank-2' },
    { rank: 3, medal: '🥉', data: podium.third, rankClass: 'podium-rank-3' }
  ].filter(w => w.data && w.data.nickname);

  if (winners.length === 0) {
    container.style.display = 'none';
    return;
  }

  let html = '';
  winners.forEach(w => {
    const isMe = w.data.nickname === myNickname;
    const initial = (w.data.nickname || '?').charAt(0).toUpperCase();
    const avatarUrl = w.data.avatar || `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(w.data.nickname)}`;

    html += `
      <div class="player-podium-item ${w.rankClass} ${isMe ? 'is-me' : ''}">
        <span class="player-podium-medal">${w.medal}</span>
        <div class="player-podium-avatar-box">
          <img src="${avatarUrl}" alt="${escapeHtml(w.data.nickname)}" class="player-podium-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <span class="player-podium-avatar-fallback" style="display: none;">${initial}</span>
        </div>
        <div class="player-podium-info">
          <div class="player-podium-name">${escapeHtml(w.data.nickname)}${isMe ? ' (Kamu)' : ''}</div>
          <div class="player-podium-score">${(w.data.score || 0).toLocaleString()} pts</div>
        </div>
      </div>
    `;
  });

  list.innerHTML = html;
  container.style.display = 'block';
  renderLucideIcons();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// Helper Google Drive direct view/thumbnail
function formatDriveMediaUrl(url, type = 'image') {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  const match = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
                trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);

  if (match && match[1] && (trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com'))) {
    const fileId = match[1];
    if (type === 'image') {
      return `/api/media-proxy?fileId=${fileId}`;
    } else {
      return `https://drive.google.com/file/d/${fileId}/preview`;
    }
  }
  return trimmed;
}

function getYouTubeEmbedUrl(url) {
  if (!url) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    return 'https://www.youtube.com/embed/' + match[2];
  }
  return url;
}

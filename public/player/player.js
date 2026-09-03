/**
 * Nizhoot — Player Client Controller
 * Mengelola interaksi gamepad peserta di HP, teks soal + media, dan skema bentuk baru.
 */

const socket = io();

// State Lokal Player
let myPin = '';
let myNickname = '';
let myScore = 0;
let hasAnsweredCurrentQuestion = false;

// DOM Elements
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

// Join View
const formJoin = document.getElementById('formJoin');
const inputPin = document.getElementById('inputPin');
const inputNickname = document.getElementById('inputNickname');
const joinErrorMessage = document.getElementById('joinErrorMessage');
const btnSubmitJoin = document.getElementById('btnSubmitJoin');

// Lobby View
const waitingNickname = document.getElementById('waitingNickname');

// Gamepad View
const gamepadQuestionNum = document.getElementById('gamepadQuestionNum');
const gamepadTimer = document.getElementById('gamepadTimer');
const playerQuestionText = document.getElementById('playerQuestionText');
const playerMediaContainer = document.getElementById('playerMediaContainer');
const playerMediaImage = document.getElementById('playerMediaImage');
const playerVideoWrapper = document.getElementById('playerVideoWrapper');
const playerOptA = document.getElementById('playerOptA');
const playerOptB = document.getElementById('playerOptB');
const playerOptC = document.getElementById('playerOptC');
const playerOptD = document.getElementById('playerOptD');
const gamepadBtns = document.querySelectorAll('.gamepad-btn');

// Result View
const resultCard = document.getElementById('resultCard');
const resultIcon = document.getElementById('resultIcon');
const resultTitle = document.getElementById('resultTitle');
const resultPoints = document.getElementById('resultPoints');
const resultRank = document.getElementById('resultRank');
const resultStreak = document.getElementById('resultStreak');

// Final View
const finalRankDisplay = document.getElementById('finalRankDisplay');
const finalScoreDisplay = document.getElementById('finalScoreDisplay');

// Switch View Helper
function switchView(viewName) {
  for (const [key, el] of Object.entries(views)) {
    if (key === viewName) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  }
}

// ==========================================
// 1. AUTO-FILL PIN DARI URL QUERY
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pinParam = urlParams.get('pin');
  if (pinParam) {
    inputPin.value = pinParam.trim();
    inputNickname.focus();
  } else {
    inputPin.focus();
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

// Berhasil Bergabung
socket.on('player:joined_success', (data) => {
  hudNickname.textContent = myNickname;
  hudScore.textContent = '0 pts';
  playerMeta.style.display = 'flex';
  waitingNickname.textContent = myNickname;

  switchView('lobby');
});

// Gagal Bergabung
socket.on('player:join_error', ({ message }) => {
  btnSubmitJoin.disabled = false;
  btnSubmitJoin.textContent = 'Masuk Game 🚀';
  showError(message || 'Gagal bergabung ke room.');
});

// ==========================================
// 3. GAMEPLAY & JAWABAN (GAMEPAD)
// ==========================================

// Soal Baru Dimulai (Termasuk Teks Soal & Media di HP)
socket.on('player:new_question', (data) => {
  hasAnsweredCurrentQuestion = false;
  gamepadQuestionNum.textContent = `Soal ${data.index + 1} dari ${data.total}`;
  gamepadTimer.textContent = `${data.duration}s`;

  // Tampilkan Teks Pertanyaan di HP
  if (data.question) {
    playerQuestionText.textContent = data.question;
  }

  // Tampilkan Teks Pilihan Jawaban di Tombol HP
  if (data.options) {
    playerOptA.textContent = data.options.a || '-';
    playerOptB.textContent = data.options.b || '-';
    playerOptC.textContent = data.options.c || '-';
    playerOptD.textContent = data.options.d || '-';
  }

  // Tampilkan Media jika ada di soal
  if (data.image_url) {
    playerMediaContainer.style.display = 'flex';
    playerMediaImage.style.display = 'block';
    playerMediaImage.src = data.image_url;
    playerVideoWrapper.style.display = 'none';
    playerVideoWrapper.innerHTML = '';
  } else if (data.video_url) {
    playerMediaContainer.style.display = 'flex';
    playerMediaImage.style.display = 'none';
    playerVideoWrapper.style.display = 'block';
    const embedUrl = getYouTubeEmbedUrl(data.video_url);
    if (embedUrl.includes('youtube.com/embed/')) {
      playerVideoWrapper.innerHTML = `<iframe src="${embedUrl}?autoplay=1&mute=1" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    } else {
      playerVideoWrapper.innerHTML = `<video src="${data.video_url}" autoplay muted loop playsinline></video>`;
    }
  } else {
    playerMediaContainer.style.display = 'none';
    playerMediaImage.src = '';
    playerVideoWrapper.innerHTML = '';
  }

  // Aktifkan kembali 4 tombol
  gamepadBtns.forEach(btn => {
    btn.disabled = false;
    btn.style.opacity = '1';
  });

  switchView('gamepad');
});

// Update Timer Detik
socket.on('game:timer_tick', ({ secondsRemaining }) => {
  gamepadTimer.textContent = `${secondsRemaining}s`;
});

// Tap Tombol Jawaban di HP
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

    switchView('submitted');
  });
});

// ==========================================
// 4. HASIL RONDE & PODIUM
// ==========================================

socket.on('player:question_result', (data) => {
  myScore = data.totalScore;
  hudScore.textContent = `${myScore.toLocaleString()} pts`;

  resultCard.className = 'result-card ' + (data.isCorrect ? 'correct' : 'wrong');

  if (data.isCorrect) {
    resultIcon.textContent = '🎉';
    resultTitle.textContent = 'Benar!';
    resultPoints.textContent = `+${data.pointsEarned.toLocaleString()} Poin`;
    window.soundFX.playCorrect();
  } else {
    resultIcon.textContent = '❌';
    resultTitle.textContent = 'Belum Tepat';
    resultPoints.textContent = '+0 Poin';
    window.soundFX.playWrong();
  }

  resultRank.textContent = `#${data.rank}`;
  resultStreak.textContent = `🔥 ${data.streak}`;

  switchView('result');
});

socket.on('game:final_podium', (data) => {
  switchView('final');

  let myFinalRank = '-';
  if (data.rankings && Array.isArray(data.rankings)) {
    const found = data.rankings.find(r => r.nickname === myNickname);
    if (found) {
      myFinalRank = `#${found.rank}`;
    }
  }

  finalRankDisplay.textContent = myFinalRank;
  finalScoreDisplay.textContent = `${myScore.toLocaleString()} Poin`;
});

function getYouTubeEmbedUrl(url) {
  if (!url) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    return 'https://www.youtube.com/embed/' + match[2];
  }
  return url;
}

/**
 * Nizhoot — Host Client Controller
 * Mengelola proyektor, komunikasi WebSocket, audio, Autoplay, dan skema warna/bentuk baru.
 */

const socket = io();

// State Lokal Host
let currentPin = null;
let currentQuizSet = null;
let totalQuestions = 0;
let quizSetsData = [];
let confettiAnimationId = null;
let isAutoplayActive = false;

// DOM Elements
const views = {
  setup: document.getElementById('viewSetup'),
  lobby: document.getElementById('viewLobby'),
  question: document.getElementById('viewQuestion'),
  summary: document.getElementById('viewSummary'),
  podium: document.getElementById('viewPodium')
};

const headerRoomInfo = document.getElementById('headerRoomInfo');
const headerPinText = document.getElementById('headerPinText');
const headerQuizSetText = document.getElementById('headerQuizSetText');
const toggleAutoplay = document.getElementById('toggleAutoplay');
const autoplayStatusLabel = document.getElementById('autoplayStatusLabel');
const btnSoundToggle = document.getElementById('btnSoundToggle');
const soundIcon = document.getElementById('soundIcon');
const btnFullscreen = document.getElementById('btnFullscreen');

// Setup View Elements
const selectQuizSet = document.getElementById('selectQuizSet');
const previewQuestionCount = document.getElementById('previewQuestionCount');
const previewMetaText = document.getElementById('previewMetaText');
const btnCreateRoom = document.getElementById('btnCreateRoom');

// Lobby View Elements
const lobbyJoinUrlText = document.getElementById('lobbyJoinUrlText');
const lobbyQrImage = document.getElementById('lobbyQrImage');
const lobbyPinDisplay = document.getElementById('lobbyPinDisplay');
const lobbyPlayerCount = document.getElementById('lobbyPlayerCount');
const lobbyPlayerList = document.getElementById('lobbyPlayerList');
const btnStartQuiz = document.getElementById('btnStartQuiz');

// Question View Elements
const questionCurrentNum = document.getElementById('questionCurrentNum');
const questionTotalNum = document.getElementById('questionTotalNum');
const timerSeconds = document.getElementById('timerSeconds');
const timerProgressCircle = document.getElementById('timerProgressCircle');
const answeredCount = document.getElementById('answeredCount');
const questionText = document.getElementById('questionText');
const mediaContainer = document.getElementById('mediaContainer');
const mediaImage = document.getElementById('mediaImage');
const mediaVideoWrapper = document.getElementById('mediaVideoWrapper');
const optTextA = document.getElementById('optTextA');
const optTextB = document.getElementById('optTextB');
const optTextC = document.getElementById('optTextC');
const optTextD = document.getElementById('optTextD');
const cards = {
  a: document.getElementById('cardA'),
  b: document.getElementById('cardB'),
  c: document.getElementById('cardC'),
  d: document.getElementById('cardD')
};

// Summary View Elements
const summaryCorrectAnswer = document.getElementById('summaryCorrectAnswer');
const btnNextQuestion = document.getElementById('btnNextQuestion');
const autoplayBanner = document.getElementById('autoplayBanner');
const autoplayCountdownNum = document.getElementById('autoplayCountdownNum');
const barFillA = document.getElementById('barFillA');
const barFillB = document.getElementById('barFillB');
const barFillC = document.getElementById('barFillC');
const barFillD = document.getElementById('barFillD');
const barCountA = document.getElementById('barCountA');
const barCountB = document.getElementById('barCountB');
const barCountC = document.getElementById('barCountC');
const barCountD = document.getElementById('barCountD');
const leaderboardList = document.getElementById('leaderboardList');

// Podium Elements
const podium1Name = document.getElementById('podium1Name');
const podium1Score = document.getElementById('podium1Score');
const podium2Name = document.getElementById('podium2Name');
const podium2Score = document.getElementById('podium2Score');
const podium3Name = document.getElementById('podium3Name');
const podium3Score = document.getElementById('podium3Score');
const btnRestartQuiz = document.getElementById('btnRestartQuiz');

// ==========================================
// 1. INISIALISASI & LOAD DATA QUIZ SET
// ==========================================

async function initHost() {
  try {
    const res = await fetch('/api/quiz-sets');
    const data = await res.json();

    if (data.success && data.sets && data.sets.length > 0) {
      quizSetsData = data.sets;
      selectQuizSet.innerHTML = '';

      data.sets.forEach((set) => {
        const opt = document.createElement('option');
        opt.value = set.name;
        opt.textContent = `${set.name} (${set.count} soal)`;
        selectQuizSet.appendChild(opt);
      });

      updateSetPreview(data.sets[0].name);
      btnCreateRoom.disabled = false;
    } else {
      selectQuizSet.innerHTML = '<option value="">Tidak ada set soal ditemukan</option>';
    }
  } catch (err) {
    console.error('Gagal memuat set kuis:', err);
    selectQuizSet.innerHTML = '<option value="">Gagal memuat spreadsheet</option>';
  }
}

function updateSetPreview(setName) {
  const found = quizSetsData.find(s => s.name === setName);
  if (found) {
    previewQuestionCount.textContent = found.count;
    previewMetaText.textContent = `Set "${found.name}" siap dimainkan.`;
  }
}

selectQuizSet.addEventListener('change', (e) => {
  updateSetPreview(e.target.value);
});

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
// 2. USER ACTIONS (BUTTONS & TOGGLES)
// ==========================================

// Buat Room
btnCreateRoom.addEventListener('click', () => {
  window.soundFX.init();
  const chosenSet = selectQuizSet.value;
  socket.emit('host:create_room', {
    quizSet: chosenSet
  });
});

// Toggle Autoplay
toggleAutoplay.addEventListener('change', () => {
  isAutoplayActive = toggleAutoplay.checked;
  autoplayStatusLabel.textContent = isAutoplayActive ? 'Mode Otomatis' : 'Mode Manual';
  if (currentPin) {
    socket.emit('host:toggle_autoplay', {
      pin: currentPin,
      enabled: isAutoplayActive
    });
  }
});

// Mulai Kuis
btnStartQuiz.addEventListener('click', () => {
  if (!currentPin) return;
  window.soundFX.stopLobby();
  socket.emit('host:start_quiz', { pin: currentPin });
});

// Soal Berikutnya
btnNextQuestion.addEventListener('click', () => {
  if (!currentPin) return;
  autoplayBanner.style.display = 'none';
  socket.emit('host:next_question', { pin: currentPin });
});

// Restart / Buat Sesi Baru
btnRestartQuiz.addEventListener('click', () => {
  stopConfetti();
  window.location.reload();
});

// Toggle Sound Mute
btnSoundToggle.addEventListener('click', () => {
  const isMuted = window.soundFX.toggleMute();
  soundIcon.textContent = isMuted ? '🔇' : '🔊';
});

// Fullscreen Toggle
btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

// ==========================================
// 3. SOCKET.IO EVENT HANDLERS
// ==========================================

// Room berhasil dibuat
socket.on('host:room_created', (data) => {
  currentPin = data.pin;
  currentQuizSet = data.quizSet;
  totalQuestions = data.totalQuestions;

  // Update Header
  headerPinText.textContent = currentPin;
  headerQuizSetText.textContent = currentQuizSet;
  headerRoomInfo.style.display = 'flex';

  // Update Lobby View (Tampilkan URL IP Lokal Akurat)
  lobbyPinDisplay.textContent = currentPin;
  lobbyJoinUrlText.textContent = data.playerJoinUrl;
  lobbyQrImage.src = data.qrDataUrl;

  switchView('lobby');
  window.soundFX.startLobby();
});

// Update daftar pemain bergabung di Lobby
socket.on('host:player_list_update', ({ players, total, newPlayer }) => {
  lobbyPlayerCount.textContent = total;

  if (newPlayer) {
    window.soundFX.playJoin();
  }

  if (total > 0) {
    btnStartQuiz.disabled = false;
    lobbyPlayerList.innerHTML = '';
    players.forEach(p => {
      const chip = document.createElement('div');
      chip.className = 'player-chip';
      chip.innerHTML = `<span>👤</span> ${escapeHtml(p.nickname)}`;
      lobbyPlayerList.appendChild(chip);
    });
  } else {
    btnStartQuiz.disabled = true;
    lobbyPlayerList.innerHTML = `
      <div class="roster-empty">
        <div class="empty-spinner"></div>
        <p>Menunggu peserta bergabung...</p>
        <small>Scan QR code di samping atau buka link di HP</small>
      </div>`;
  }
});

// Soal baru dimulai
socket.on('host:new_question', (data) => {
  switchView('question');
  autoplayBanner.style.display = 'none';
  window.soundFX.stopLobby();
  window.soundFX.startCountdown();

  // Reset card styles
  Object.values(cards).forEach(c => {
    c.style.opacity = '1';
    c.style.filter = 'none';
  });

  questionCurrentNum.textContent = data.index + 1;
  questionTotalNum.textContent = data.total;
  questionText.textContent = data.question;
  answeredCount.textContent = '0';

  // Pilihan opsi
  optTextA.textContent = data.options.a || '-';
  optTextB.textContent = data.options.b || '-';
  optTextC.textContent = data.options.c || '-';
  optTextD.textContent = data.options.d || '-';

  // Handle Media
  if (data.image_url) {
    mediaContainer.style.display = 'flex';
    mediaImage.style.display = 'block';
    mediaImage.src = data.image_url;
    mediaVideoWrapper.style.display = 'none';
    mediaVideoWrapper.innerHTML = '';
  } else if (data.video_url) {
    mediaContainer.style.display = 'flex';
    mediaImage.style.display = 'none';
    mediaVideoWrapper.style.display = 'block';
    const embedUrl = getYouTubeEmbedUrl(data.video_url);
    if (embedUrl.includes('youtube.com/embed/')) {
      mediaVideoWrapper.innerHTML = `<iframe src="${embedUrl}?autoplay=1&mute=1" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    } else {
      mediaVideoWrapper.innerHTML = `<video src="${data.video_url}" autoplay muted loop controls></video>`;
    }
  } else {
    mediaContainer.style.display = 'none';
    mediaImage.src = '';
    mediaVideoWrapper.innerHTML = '';
  }
});

// Tick timer dari server
socket.on('game:timer_tick', ({ secondsRemaining, duration }) => {
  timerSeconds.textContent = secondsRemaining;

  // Update Lingkaran SVG
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (secondsRemaining / duration) * circumference;
  timerProgressCircle.style.strokeDashoffset = offset;

  if (secondsRemaining <= 5) {
    timerProgressCircle.style.stroke = '#EF4444';
    timerSeconds.style.color = '#EF4444';
  } else {
    timerProgressCircle.style.stroke = 'var(--color-c)';
    timerSeconds.style.color = '#FFFFFF';
  }
});

// Update jumlah jawaban yang sudah masuk
socket.on('host:answer_count_update', ({ answeredCount: count }) => {
  answeredCount.textContent = count;
});

// Countdown Autoplay
socket.on('host:autoplay_countdown', ({ secondsLeft }) => {
  autoplayBanner.style.display = 'block';
  autoplayCountdownNum.textContent = secondsLeft;
});

// Soal selesai -> Tampilkan ringkasan dan statistik
socket.on('host:question_finished', (data) => {
  window.soundFX.stopCountdown();
  switchView('summary');

  const correctLetter = data.correctAnswer.toLowerCase();
  summaryCorrectAnswer.textContent = correctLetter.toUpperCase();

  // Update tombol Lanjut / Podium
  if (data.isLastQuestion) {
    btnNextQuestion.textContent = '🏆 Lihat Podium Final ➔';
  } else {
    btnNextQuestion.textContent = 'Lanjut ke Soal Berikutnya ➔';
  }

  // Isi Grafik Statistik
  const counts = data.answerCounts;
  const total = Math.max(1, data.totalAnswers);

  barFillA.style.transform = `scaleX(${counts.a / total})`;
  barCountA.textContent = counts.a;
  barFillB.style.transform = `scaleX(${counts.b / total})`;
  barCountB.textContent = counts.b;
  barFillC.style.transform = `scaleX(${counts.c / total})`;
  barCountC.textContent = counts.c;
  barFillD.style.transform = `scaleX(${counts.d / total})`;
  barCountD.textContent = counts.d;

  // Isi Leaderboard Top 5
  leaderboardList.innerHTML = '';
  data.leaderboard.forEach((item) => {
    const row = document.createElement('div');
    row.className = `leaderboard-item ${item.rank === 1 ? 'rank-1-item' : ''}`;

    let deltaHtml = '<span class="lb-delta delta-same">—</span>';
    if (item.rankDelta > 0) {
      deltaHtml = `<span class="lb-delta delta-up">▲ +${item.rankDelta}</span>`;
    } else if (item.rankDelta < 0) {
      deltaHtml = `<span class="lb-delta delta-down">▼ ${item.rankDelta}</span>`;
    }

    row.innerHTML = `
      <div class="lb-left">
        <span class="lb-rank">#${item.rank}</span>
        <span class="lb-name">${escapeHtml(item.nickname)}</span>
        ${deltaHtml}
      </div>
      <div class="lb-score">${item.score.toLocaleString()} pts</div>
    `;
    leaderboardList.appendChild(row);
  });
});

// Final Podium
socket.on('game:final_podium', (data) => {
  window.soundFX.stopCountdown();
  window.soundFX.playFanfare();
  switchView('podium');

  const p = data.podium;
  if (p.first) {
    podium1Name.textContent = p.first.nickname;
    podium1Score.textContent = `${p.first.score.toLocaleString()} pts`;
  }
  if (p.second) {
    podium2Name.textContent = p.second.nickname;
    podium2Score.textContent = `${p.second.score.toLocaleString()} pts`;
  }
  if (p.third) {
    podium3Name.textContent = p.third.nickname;
    podium3Score.textContent = `${p.third.score.toLocaleString()} pts`;
  }

  startConfetti();
});

// Helper youtube embed
function getYouTubeEmbedUrl(url) {
  if (!url) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    return 'https://www.youtube.com/embed/' + match[2];
  }
  return url;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// Confetti Canvas
function startConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const pieces = [];
  const numberOfPieces = 160;
  const colors = ['#C724B1', '#1368CE', '#22D3C5', '#7ED321', '#FACC15'];

  for (let i = 0; i < numberOfPieces; i++) {
    pieces.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      rotation: Math.random() * 360,
      size: Math.random() * 12 + 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      speed: Math.random() * 4 + 2,
      tilt: Math.random() * 10 - 5
    });
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    pieces.forEach(p => {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();

      p.y += p.speed;
      p.rotation += p.tilt;

      if (p.y > canvas.height) {
        p.y = -20;
        p.x = Math.random() * canvas.width;
      }
    });

    confettiAnimationId = requestAnimationFrame(render);
  }

  render();
}

function stopConfetti() {
  if (confettiAnimationId) {
    cancelAnimationFrame(confettiAnimationId);
    confettiAnimationId = null;
  }
}

document.addEventListener('DOMContentLoaded', initHost);

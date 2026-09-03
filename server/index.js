require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const cors = require('cors');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const multer = require('multer');

const { loadQuestions, appendQuestionToSheet } = require('./sheetsLoader');
const gameState = require('./gameState');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

/**
 * Deteksi alamat IPv4 lokal mesin (bukan internal/loopback)
 */
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

/**
 * Dapatkan Base URL yang valid untuk device lain (HP) di jaringan
 */
function getBaseUrl(req) {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL.replace(/\/$/, '');
  }
  const localIp = getLocalIpAddress();
  return `http://${localIp}:${PORT}`;
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Konfigurasi Multer untuk Upload Media
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, path.join(__dirname, '../public/assets/images'));
    } else if (file.mimetype.startsWith('video/')) {
      cb(null, path.join(__dirname, '../public/assets/videos'));
    } else {
      cb(new Error('Tipe file tidak didukung'), null);
    }
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}_${cleanName}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 12 * 1024 * 1024 // Buffer limit umum
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file gambar (JPG, PNG, WebP) atau video (MP4, WebM) yang diizinkan!'));
    }
  }
});

// Cache soal di memory server agar tidak spam fetch
let questionsCache = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000;

async function getCachedQuestions(forceRefresh = false) {
  const now = Date.now();
  if (!questionsCache || forceRefresh || (now - lastCacheTime > CACHE_TTL_MS)) {
    questionsCache = await loadQuestions();
    lastCacheTime = now;
  }
  return questionsCache;
}

// Routes View
app.get('/', (req, res) => {
  res.redirect('/player');
});

app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/host/index.html'));
});

app.get('/player', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/player/index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});

// API: Info Jaringan Server
app.get('/api/network-info', (req, res) => {
  res.json({
    localIp: getLocalIpAddress(),
    port: PORT,
    baseUrl: getBaseUrl(req)
  });
});

// API: Daftar set kuis yang tersedia
app.get('/api/quiz-sets', async (req, res) => {
  try {
    const refresh = req.query.refresh === 'true';
    const data = await getCachedQuestions(refresh);
    res.json({
      success: true,
      source: data.source,
      lastFetched: data.lastFetched,
      totalQuestions: data.totalCount,
      setNames: data.setNames,
      sets: Object.keys(data.sets).map(name => ({
        name,
        count: data.sets[name].length,
        questions: data.sets[name]
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Generate QR Code Data URL
app.get('/api/qr', async (req, res) => {
  const text = req.query.text;
  if (!text) {
    return res.status(400).send('Parameter text dibutuhkan.');
  }

  try {
    const dataUrl = await QRCode.toDataURL(text, {
      width: 320,
      margin: 1,
      color: {
        dark: '#0B0F19',
        light: '#FFFFFF'
      }
    });
    res.json({ success: true, dataUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Upload Media (Gambar max 300 KB, Video max 8 MB)
app.post('/api/upload', (req, res) => {
  upload.single('mediaFile')(req, res, function (err) {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Tidak ada file yang diunggah.' });
    }

    const file = req.file;
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');

    // Validasi Ukuran: Gambar max 300 KB
    if (isImage && file.size > 300 * 1024) {
      try { fs.unlinkSync(file.path); } catch (e) {}
      return res.status(400).json({
        success: false,
        error: `Ukuran gambar (${(file.size / 1024).toFixed(1)} KB) melebihi batas 300 KB. Silakan kompres gambar terlebih dahulu.`
      });
    }

    // Validasi Ukuran: Video max 8 MB
    if (isVideo && file.size > 8 * 1024 * 1024) {
      try { fs.unlinkSync(file.path); } catch (e) {}
      return res.status(400).json({
        success: false,
        error: `Ukuran video (${(file.size / (1024 * 1024)).toFixed(1)} MB) melebihi batas 8 MB. Disarankan memakai link YouTube Unlisted jika video > 8 MB.`
      });
    }

    const publicUrl = isImage
      ? `/assets/images/${file.filename}`
      : `/assets/videos/${file.filename}`;

    res.json({
      success: true,
      url: publicUrl,
      filename: file.filename,
      sizeBytes: file.size
    });
  });
});

// API: Tambah Soal Baru ke Google Spreadsheet via Sheets API
app.post('/api/admin/questions', async (req, res) => {
  try {
    const questionData = req.body;
    const result = await appendQuestionToSheet(questionData);

    // Reset cache soal agar data baru langsung terbaca
    questionsCache = null;

    res.json({
      success: true,
      message: 'Soal berhasil disimpan dan ditambahkan ke Google Spreadsheet!',
      details: result
    });
  } catch (err) {
    console.error('[AdminAPI] Gagal menyimpan soal:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// API: Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Nizhoot',
    activeRooms: gameState.rooms.size,
    localIp: getLocalIpAddress(),
    uptime: process.uptime()
  });
});

// Socket.io Game Logic
io.on('connection', (socket) => {
  console.log(`[Socket] Klien terhubung: ${socket.id}`);

  // ============================
  // HOST EVENTS
  // ============================

  // 1. Host Membuat Room Baru
  socket.on('host:create_room', async ({ quizSet }) => {
    try {
      const data = await getCachedQuestions();
      const selectedSet = quizSet || data.setNames[0] || 'Default';
      const questions = data.sets[selectedSet] || [];

      if (questions.length === 0) {
        socket.emit('host:error', { message: `Set kuis "${selectedSet}" tidak memiliki soal.` });
        return;
      }

      const pin = gameState.generatePin();
      const room = gameState.createRoom(pin, selectedSet, questions, socket.id);
      socket.join(`room_${pin}`);

      // URL join akurat menggunakan IP lokal jaringan (BUKAN localhost)
      const baseUrl = getBaseUrl();
      const playerJoinUrl = `${baseUrl}/player?pin=${pin}`;

      // Generate QR Code mengarah ke URL IP lokal
      const qrDataUrl = await QRCode.toDataURL(playerJoinUrl, {
        width: 340,
        margin: 2,
        color: {
          dark: '#0B0F19',
          light: '#FFFFFF'
        }
      });

      socket.emit('host:room_created', {
        pin,
        quizSet: selectedSet,
        totalQuestions: questions.length,
        playerJoinUrl,
        displayUrl: `${baseUrl.replace(/^https?:\/\//, '')}/player`,
        qrDataUrl
      });

      console.log(`[Host] Room dibuat PIN: ${pin} -> ${playerJoinUrl}`);
    } catch (err) {
      console.error('[Host] Gagal membuat room:', err);
      socket.emit('host:error', { message: 'Gagal membuat room: ' + err.message });
    }
  });

  // 2. Host Toggle Mode Autoplay
  socket.on('host:toggle_autoplay', ({ pin, enabled, skipWhenAllAnswered }) => {
    const room = gameState.setAutoplay(pin, enabled, skipWhenAllAnswered);
    if (room && room.hostSocketId === socket.id) {
      socket.emit('host:autoplay_status', {
        autoplay: room.autoplay,
        skipWhenAllAnswered: room.skipWhenAllAnswered
      });
      console.log(`[Host] Autoplay PIN ${pin}: ${room.autoplay} (SkipWhenAllAnswered: ${room.skipWhenAllAnswered})`);
    }
  });

  // 3. Host Memulai Kuis
  socket.on('host:start_quiz', ({ pin }) => {
    const room = gameState.getRoom(pin);
    if (!room || room.hostSocketId !== socket.id) return;

    console.log(`[Host] Memulai kuis untuk PIN: ${pin}`);
    triggerQuestion(pin, 0);
  });

  // 4. Host Lanjut ke Soal Berikutnya (Manual)
  socket.on('host:next_question', ({ pin }) => {
    const room = gameState.getRoom(pin);
    if (!room || room.hostSocketId !== socket.id) return;

    if (room.autoplayTimer) {
      clearTimeout(room.autoplayTimer);
      room.autoplayTimer = null;
    }

    const nextIndex = room.currentQuestionIndex + 1;
    if (nextIndex >= room.questions.length) {
      triggerFinalPodium(pin);
    } else {
      triggerQuestion(pin, nextIndex);
    }
  });

  // 5. Host Mengakhiri Kuis Manual
  socket.on('host:end_quiz', ({ pin }) => {
    const room = gameState.getRoom(pin);
    if (!room || room.hostSocketId !== socket.id) return;
    triggerFinalPodium(pin);
  });

  // ============================
  // PLAYER EVENTS
  // ============================

  // 1. Player Bergabung
  socket.on('player:join', ({ pin, nickname }) => {
    const result = gameState.addPlayer(pin, socket.id, nickname);

    if (!result.success) {
      socket.emit('player:join_error', { message: result.message });
      return;
    }

    socket.join(`room_${pin}`);

    socket.emit('player:joined_success', {
      pin,
      nickname: result.player.nickname,
      gameState: result.room.state
    });

    const playerList = gameState.getPlayerList(pin);
    io.to(`room_${pin}`).emit('host:player_list_update', {
      players: playerList,
      total: playerList.length,
      newPlayer: result.player.nickname
    });

    console.log(`[Player] ${result.player.nickname} (${socket.id}) bergabung ke room ${pin}`);
  });

  // 2. Player Submit Jawaban
  socket.on('player:submit_answer', ({ pin, answer }) => {
    const result = gameState.submitAnswer(pin, socket.id, answer);

    if (!result.success) {
      socket.emit('player:answer_error', { message: result.message });
      return;
    }

    socket.emit('player:answer_confirmed', {
      selectedAnswer: answer
    });

    io.to(`room_${pin}`).emit('host:answer_count_update', {
      answeredCount: result.answeredCount,
      totalPlayers: result.totalPlayers
    });

    const room = gameState.getRoom(pin);
    // Jika semua pemain sudah menjawab
    if (result.allAnswered) {
      // Jika host mengaktifkan opsi skip langsung atau autoplay skip
      if (room && (room.skipWhenAllAnswered || room.autoplay)) {
        console.log(`[Game] Seluruh pemain sudah menjawab pada PIN: ${pin}. Menyelesaikan soal lebih cepat.`);
        finishQuestionNow(pin);
      }
    }
  });

  // ============================
  // DISCONNECT HANDLER
  // ============================
  socket.on('disconnect', () => {
    const removed = gameState.removePlayer(socket.id);
    if (removed) {
      const playerList = gameState.getPlayerList(removed.pin);
      io.to(`room_${removed.pin}`).emit('host:player_list_update', {
        players: playerList,
        total: playerList.length,
        leftPlayer: removed.player.nickname
      });
    }
  });
});

/**
 * Trigger pemutaran soal
 */
function triggerQuestion(pin, questionIndex) {
  const room = gameState.getRoom(pin);
  if (!room) return;

  if (room.timerHandle) {
    clearInterval(room.timerHandle);
    room.timerHandle = null;
  }
  if (room.autoplayTimer) {
    clearTimeout(room.autoplayTimer);
    room.autoplayTimer = null;
  }

  const result = gameState.startQuestion(pin, questionIndex);
  if (!result) return;

  if (result.state === 'FINAL_PODIUM') {
    triggerFinalPodium(pin);
    return;
  }

  // Kirim data ke Host (proyektor)
  io.to(room.hostSocketId).emit('host:new_question', result.hostQuestionData);

  // Kirim data soal lengkap ke seluruh Player (termasuk teks soal & media)
  io.to(`room_${pin}`).emit('player:new_question', result.playerQuestionData);

  // Server-authoritative timer countdown
  let secondsRemaining = room.questionDuration;
  io.to(`room_${pin}`).emit('game:timer_tick', {
    secondsRemaining,
    duration: room.questionDuration
  });

  room.timerHandle = setInterval(() => {
    secondsRemaining--;

    if (secondsRemaining > 0) {
      io.to(`room_${pin}`).emit('game:timer_tick', {
        secondsRemaining,
        duration: room.questionDuration
      });
    } else {
      finishQuestionNow(pin);
    }
  }, 1000);
}

/**
 * Menyelesaikan soal dan menampilkan ringkasan ronde
 */
function finishQuestionNow(pin) {
  const room = gameState.getRoom(pin);
  if (!room) return;

  if (room.timerHandle) {
    clearInterval(room.timerHandle);
    room.timerHandle = null;
  }

  const summary = gameState.finishQuestion(pin);
  if (!summary) return;

  // Kirim data ringkasan ke Host
  io.to(room.hostSocketId).emit('host:question_finished', {
    questionIndex: summary.questionIndex,
    isLastQuestion: summary.isLastQuestion,
    correctAnswer: summary.correctAnswer,
    answerCounts: summary.answerCounts,
    totalAnswers: summary.totalAnswers,
    totalPlayers: summary.totalPlayers,
    leaderboard: summary.leaderboard,
    autoplay: room.autoplay
  });

  // Kirim hasil personal ke masing-masing player
  for (const [socketId, res] of summary.playerResults.entries()) {
    io.to(socketId).emit('player:question_result', res);
  }

  // Autoplay Logic: jika aktif, otomatis lanjut setelah 5 detik
  if (room.autoplay) {
    let countdown = 5;
    io.to(room.hostSocketId).emit('host:autoplay_countdown', { secondsLeft: countdown });

    const autoplayInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        io.to(room.hostSocketId).emit('host:autoplay_countdown', { secondsLeft: countdown });
      } else {
        clearInterval(autoplayInterval);
      }
    }, 1000);

    room.autoplayTimer = setTimeout(() => {
      if (summary.isLastQuestion) {
        triggerFinalPodium(pin);
      } else {
        triggerQuestion(pin, room.currentQuestionIndex + 1);
      }
    }, 5000);
  }
}

/**
 * Menampilkan Podium Final
 */
function triggerFinalPodium(pin) {
  const room = gameState.getRoom(pin);
  if (!room) return;

  if (room.timerHandle) {
    clearInterval(room.timerHandle);
    room.timerHandle = null;
  }
  if (room.autoplayTimer) {
    clearTimeout(room.autoplayTimer);
    room.autoplayTimer = null;
  }

  const finalData = gameState.getFinalPodium(pin);
  if (!finalData) return;

  io.to(`room_${pin}`).emit('game:final_podium', finalData);
  console.log(`[Game] Kuis berakhir untuk PIN: ${pin}.`);
}

// Start Server
server.listen(PORT, () => {
  const localIp = getLocalIpAddress();
  console.log(`====================================================`);
  console.log(`🚀 Nizhoot Server aktif!`);
  console.log(`🌐 Local Network URL:       http://${localIp}:${PORT}`);
  console.log(`📺 Layar Host (Proyektor):  http://localhost:${PORT}/host`);
  console.log(`📱 Layar Player (HP):       http://${localIp}:${PORT}/player`);
  console.log(`🛠️  Layar Admin (Sheets API): http://localhost:${PORT}/admin`);
  console.log(`====================================================`);
});

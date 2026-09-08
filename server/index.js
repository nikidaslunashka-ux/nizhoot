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

const { loadQuestions, appendQuestionToSheet, updateQuestionRow, deleteQuestionRow, deleteQuizSetRows } = require('./sheetsLoader');
const driveService = require('./driveService');
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
 * Dapatkan Base URL yang valid untuk device lain (HP / browser peserta).
 * Prioritas:
 * 1. BASE_URL (manual override di env var untuk custom domain / platform lain)
 * 2. RENDER_EXTERNAL_URL (otomatis disediakan oleh Render, misal https://nizhoot.onrender.com)
 * 3. Header Host dari request/socket jika di environment production / cloud
 * 4. Fallback ke IP lokal jaringan mesin untuk local development (http://10.x.x.x:PORT)
 */
function getBaseUrl(context) {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL.trim().replace(/\/$/, '');
  }

  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.trim().replace(/\/$/, '');
  }

  // Jika berjalan di production / cloud tapi belum set BASE_URL manual
  const isProduction = !!process.env.RENDER || process.env.NODE_ENV === 'production';
  if (isProduction && context) {
    const headers = context.headers || (context.handshake && context.handshake.headers);
    if (headers) {
      const host = headers['x-forwarded-host'] || headers['host'];
      const proto = headers['x-forwarded-proto'] || (context.protocol) || 'https';
      if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
        return `${proto}://${host}`.replace(/\/$/, '');
      }
    }
  }

  const localIp = getLocalIpAddress();
  return `http://${localIp}:${PORT}`;
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Konfigurasi Multer untuk Upload Media ke Memory (Buffer Google Drive)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 55 * 1024 * 1024 // Buffer limit 55 MB
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
      sets: Object.keys(data.sets).map(name => {
        const summary = (data.setSummaries && data.setSummaries[name]) || {};
        return {
          name,
          count: data.sets[name].length,
          totalDuration: summary.totalDuration || (data.sets[name].reduce((acc, q) => acc + (q.duration_seconds || 20), 0)),
          firstQuestion: summary.firstQuestion || (data.sets[name][0] ? data.sets[name][0].question : ''),
          lastUpdated: summary.lastUpdated || (data.sets[name][0] ? data.sets[name][0].last_updated : new Date().toISOString()),
          questions: data.sets[name]
        };
      })
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

// API: Upload Media langsung ke Google Drive
app.post('/api/upload', (req, res) => {
  upload.single('mediaFile')(req, res, async function (err) {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Tidak ada file yang diunggah.' });
    }

    const file = req.file;
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');
    const quizSet = req.body.quizSet || 'Default';

    // Batasan ukuran: Gambar max 10MB, Video max 50MB
    if (isImage && file.size > 10 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: `Ukuran gambar (${(file.size / 1024 / 1024).toFixed(1)} MB) melebihi batas 10 MB. Silakan kompres gambar terlebih dahulu.`
      });
    }

    if (isVideo && file.size > 50 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: `Ukuran video (${(file.size / 1024 / 1024).toFixed(1)} MB) melebihi batas 50 MB. Disarankan memakai link YouTube Unlisted.`
      });
    }

    try {
      const driveResult = await driveService.uploadMediaToDrive({
        buffer: file.buffer,
        filename: file.originalname,
        mimetype: file.mimetype,
        quizSet
      });

      res.json({
        success: true,
        url: driveResult.url,
        fileId: driveResult.fileId,
        filename: driveResult.filename,
        sizeBytes: driveResult.sizeBytes
      });
    } catch (uploadErr) {
      console.error('[UploadAPI] Gagal upload ke Google Drive:', uploadErr.message);
      res.status(500).json({
        success: false,
        error: `Gagal mengunggah ke Google Drive: ${uploadErr.message}`
      });
    }
  });
});

// API: Media Proxy untuk Gambar Google Drive (Anti-Blokir Browser / CORS / Referer)
app.get('/api/media-proxy', async (req, res) => {
  try {
    const fileId = req.query.fileId || driveService.extractDriveFileId(req.query.url || '');
    if (!fileId) {
      return res.status(400).send('Parameter fileId atau url tidak valid.');
    }

    const driveUrl = `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1200`;
    const response = await fetch(driveUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      console.warn(`[MediaProxy] Google Drive thumbnail HTTP ${response.status} untuk fileId: ${fileId}`);
      return res.status(response.status).send('Gagal mengunduh gambar dari Google Drive.');
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('[MediaProxy] Error:', err.message);
    res.status(500).send('Terjadi kesalahan internal proxy media.');
  }
});

// API: Tambah Soal Baru ke Google Spreadsheet via Sheets API
app.post('/api/admin/questions', async (req, res) => {
  try {
    const questionData = {
      ...req.body,
      image_url: driveService.convertDriveUrl(req.body.image_url, 'image'),
      video_url: driveService.convertDriveUrl(req.body.video_url, 'video')
    };
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

// API: Perbarui / Edit Soal di Google Spreadsheet via Sheets API
app.put('/api/admin/questions/:rowNumber', async (req, res) => {
  try {
    const rowNumber = parseInt(req.params.rowNumber, 10);
    if (!rowNumber || rowNumber < 2) {
      return res.status(400).json({ success: false, error: 'Nomor baris tidak valid.' });
    }

    const questionData = {
      ...req.body,
      image_url: driveService.convertDriveUrl(req.body.image_url, 'image'),
      video_url: driveService.convertDriveUrl(req.body.video_url, 'video')
    };

    const result = await updateQuestionRow(rowNumber, questionData);

    // Reset cache soal agar data segar langsung terbaca
    questionsCache = null;

    res.json({
      success: true,
      message: 'Soal berhasil diperbarui di Google Spreadsheet!',
      details: result
    });
  } catch (err) {
    console.error('[AdminAPI] Gagal memperbarui soal:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// API: Hapus 1 Soal (Cascade Delete file di Google Drive + Hapus Baris Spreadsheet)
app.delete('/api/admin/questions/:rowNumber', async (req, res) => {
  try {
    const rowNumber = parseInt(req.params.rowNumber, 10);
    const mediaUrl = req.query.mediaUrl || (req.body && req.body.mediaUrl);

    if (!rowNumber || rowNumber < 2) {
      return res.status(400).json({ success: false, error: 'Nomor baris tidak valid.' });
    }

    // 1. Cascade delete file media di Google Drive jika ada
    if (mediaUrl) {
      try {
        await driveService.deleteDriveFile(mediaUrl);
      } catch (driveErr) {
        console.warn('[AdminAPI] Lewati hapus file Drive:', driveErr.message);
      }
    }

    // 2. Hapus baris dari Google Spreadsheet via Sheets API
    await deleteQuestionRow(rowNumber);

    // Reset cache
    questionsCache = null;

    res.json({
      success: true,
      message: `Soal pada baris ${rowNumber} dan file media Google Drive terkait berhasil dihapus!`
    });
  } catch (err) {
    console.error('[AdminAPI] Gagal menghapus soal:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Hapus Seluruh Set Kuis (Cascade Delete folder set di Google Drive + Hapus Baris Spreadsheet)
app.delete('/api/admin/quiz-sets/:setName', async (req, res) => {
  try {
    const setName = decodeURIComponent(req.params.setName);

    if (!setName) {
      return res.status(400).json({ success: false, error: 'Nama set kuis tidak valid.' });
    }

    // 1. Cascade delete folder quiz_set di Google Drive (Images & Videos)
    try {
      await driveService.deleteQuizSetFolders(setName);
    } catch (driveErr) {
      console.warn('[AdminAPI] Lewati hapus folder Drive set:', driveErr.message);
    }

    // 2. Hapus semua baris set di Google Spreadsheet
    const deleteResult = await deleteQuizSetRows(setName);

    // Reset cache
    questionsCache = null;

    res.json({
      success: true,
      message: `Set "${setName}" (${deleteResult.deletedCount} soal) dan seluruh media terkait di Google Drive berhasil dihapus!`
    });
  } catch (err) {
    console.error('[AdminAPI] Gagal menghapus set kuis:', err.message);
    res.status(500).json({ success: false, error: err.message });
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

      // URL join akurat menggunakan Base URL production atau IP lokal jaringan
      const baseUrl = getBaseUrl(socket);
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

  // 5. Host Mengakhiri Sesi Kuis di Tengah Jalan (Force End)
  socket.on('host:force_end_game', ({ pin }) => {
    const room = gameState.getRoom(pin);
    if (!room || room.hostSocketId !== socket.id) return;

    console.log(`[Game] Host menghentikan sesi kuis di tengah jalan (PIN: ${pin}).`);
    if (room.timerHandle) {
      clearInterval(room.timerHandle);
      room.timerHandle = null;
    }
    if (room.autoplayTimer) {
      clearTimeout(room.autoplayTimer);
      room.autoplayTimer = null;
    }

    const finalData = gameState.forceEndGame(pin);
    if (finalData) {
      io.to(`room_${pin}`).emit('game:final_podium', finalData);
      console.log(`[Game] Sesi PIN ${pin} diakhiri lebih awal. Menampilkan podium final.`);
    }
  });

  // 6. Host Mengakhiri Kuis Manual (Normal)
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
      avatar: result.player.avatar,
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
if (require.main === module) {
  server.listen(PORT, () => {
    const isProduction = !!process.env.RENDER || !!process.env.RENDER_EXTERNAL_URL || process.env.NODE_ENV === 'production';
    const baseUrl = getBaseUrl();
    console.log(`====================================================`);
    console.log(`🚀 Nizhoot Server aktif! (${isProduction ? 'Cloud / Production' : 'Local / Development'})`);
    console.log(`🌐 Base URL:                 ${baseUrl}`);
    console.log(`📺 Layar Host (Proyektor):  ${baseUrl}/host`);
    console.log(`📱 Layar Player (HP):       ${baseUrl}/player`);
    console.log(`🛠️  Layar Admin (Sheets API): ${baseUrl}/admin`);
    console.log(`====================================================`);
  });
}

module.exports = {
  app,
  server,
  getBaseUrl,
  getLocalIpAddress
};

require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const multer = require('multer');

const { loadQuestions, loadQuestionsForWrite, appendQuestionToSheet, updateQuestionRow, deleteQuestionRow, deleteQuizSetRows } = require('./sheetsLoader');
const driveService = require('./driveService');
const gameState = require('./gameState');
const excelReportService = require('./excelReportService');
const auth = require('./auth').createAuth();

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
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
auth.install(app);
app.use(['/admin', '/host', '/accounts'], auth.wrap(async (req, res, next) => {
  const user = await auth.identify(req);
  if (!user || user.status !== 'active' || user.must_change_password === 'true') return res.redirect('/auth/');
  if (req.baseUrl === '/accounts' && user.role !== 'super_admin') return res.status(403).send('Halaman ini hanya untuk super admin.');
  res.set('Cache-Control', 'no-store');
  next();
}));
app.use(['/api/admin', '/api/upload', '/api/quiz-sets', '/api/session', '/api/qr'], auth.active);
// Serialize question mutations, including fresh row authorization, before rows can shift.
let mutationTail = Promise.resolve();
app.use('/api/admin', (req, res, next) => {
  if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return next();
  const previous = mutationTail;
  mutationTail = new Promise(resolve => { res.once('finish', resolve); res.once('close', resolve); });
  previous.then(() => { if (!res.destroyed) next(); });
});
const authorizeQuestion = auth.wrap(async (req, res, next) => {
  if (!/^[1-9]\d*$/.test(req.params.rowNumber) || !Number.isSafeInteger(Number(req.params.rowNumber)) || Number(req.params.rowNumber) < 2) return res.status(400).json({ success: false, error: 'Nomor baris tidak valid.' });
  req.questionData = await loadQuestionsForWrite();
  const question = Object.values(req.questionData.sets).flat().find(q => q.sheetRowIndex === Number(req.params.rowNumber));
  if (!question) return res.status(404).json({ success: false, error: 'Soal tidak ditemukan. Muat ulang daftar.' });
  if (!(await auth.canAccess(req.user, question.quiz_set))) return res.status(403).json({ success: false, error: 'Anda tidak memiliki akses ke soal ini.' });
  req.authorizedQuestion = question;
  next();
});
const authorizeDestination = auth.wrap(async (req, res, next) => {
  const data = req.questionData || await loadQuestionsForWrite();
  const name = String(req.body.quiz_set || 'Default').trim();
  await auth.ensureAccess(req.user, name, data.setNames);
  next();
});
// Use exactly the same Express routes and decoded parameters as the handlers.
app.post('/api/admin/questions', authorizeDestination);
app.put('/api/admin/questions/:rowNumber', authorizeQuestion, authorizeDestination);
app.delete('/api/admin/questions/:rowNumber', authorizeQuestion);
app.delete('/api/admin/quiz-sets/:setName', auth.wrap(async (req, res, next) => {
  if (!(await auth.canAccess(req.user, req.params.setName, true))) return res.status(403).json({ success: false, error: 'Hanya pemilik atau super admin yang dapat menghapus kuis.' });
  req.questionData = await loadQuestionsForWrite();
  next();
}));
app.use('/api/session', auth.wrap(async (req, res, next) => {
  if (req.path === '/reports') return next();
  const pin = req.path.split('/')[1];
  let owner = reportOwners.get(pin);
  if (!owner && auth.store) {
    try {
      const saved = (await auth.store.all('SessionReportsV2') || []).find(r => String(r.pin) === String(pin));
      if (saved) {
        owner = saved.owner_id;
        reportOwners.set(pin, owner);
      }
    } catch (e) {}
  }
  if (req.user.role !== 'super_admin' && owner !== req.user.id) return res.status(403).json({ success: false, error: 'Laporan ini bukan milik Anda.' });
  next();
}));
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
auth.questionNames = async () => (await getCachedQuestions()).setNames;
async function cleanupUploadedMedia(removed, remaining) {
  try {
    const uploads = await auth.store.all('MediaUploadsV2');
    const candidates = new Set();
    for (const question of removed) for (const url of [question.image_url, question.video_url]) {
      const id = driveService.extractDriveFileId(url || '');
      if (id && uploads.some(m => m.file_id === id && m.quiz_set === question.quiz_set)) candidates.add(id);
    }
    for (const id of candidates) {
      if (remaining.some(q => [q.image_url, q.video_url].some(url => driveService.extractDriveFileId(url || '') === id))) continue;
      await driveService.deleteDriveFile(id);
    }
  } catch (error) { console.warn('[Media] Pembersihan ditunda; soal sudah dihapus.'); }
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
    const loaded = await getCachedQuestions(refresh);
    const records = (await auth.store.all('QuizAccessV2')).filter(r => r.quiz_set);
    const accounts = await auth.store.all('AccountsV2');
    const original = { ...loaded, setNames: [...new Set([...loaded.setNames, ...records.map(r => r.quiz_set)])], sets: { ...loaded.sets } };
    for (const name of original.setNames) original.sets[name] ||= [];
    const allowed = await Promise.all(original.setNames.map(async name => (await auth.canAccess(req.user, name)) ? name : null));
    const setNames = allowed.filter(Boolean);
    const data = { ...original, setNames, sets: Object.fromEntries(setNames.map(name => [name, original.sets[name]])), totalCount: setNames.reduce((n, name) => n + original.sets[name].length, 0) };
    res.json({
      success: true,
      source: data.source,
      lastFetched: data.lastFetched,
      totalQuestions: data.totalCount,
      setNames: data.setNames,
      sets: Object.keys(data.sets).map(name => {
        const access = records.find(r => r.quiz_set === name);
        const identity = id => { const user = accounts.find(u => u.id === id); return user ? { id: user.id, name: user.name, username: user.username, active: user.status === 'active' } : { id, name: 'Akun tidak tersedia', username: '', active: false }; };
        const summary = (data.setSummaries && data.setSummaries[name]) || {};
        return {
          name,
          owner: access?.owner_id ? identity(access.owner_id) : null,
          isOwner: access?.owner_id === req.user.id,
          canManage: access?.owner_id === req.user.id || req.user.role === 'super_admin',
          collaborators: (access?.collaborators || '').split(',').filter(Boolean).map(identity),
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
      const data = await loadQuestionsForWrite();
      await auth.ensureAccess(req.user, quizSet, data.setNames);
      const driveResult = await driveService.uploadMediaToDrive({
        buffer: file.buffer,
        filename: file.originalname,
        mimetype: file.mimetype,
        quizSet
      });
      try {
        await auth.store.exclusive(() => auth.store.save('MediaUploadsV2', { file_id: driveResult.fileId, quiz_set: quizSet, uploaded_by: req.user.id }));
      } catch (error) {
        await driveService.deleteDriveFile(driveResult.fileId).catch(() => {});
        throw error;
      }

      res.json({
        success: true,
        url: driveResult.url,
        fileId: driveResult.fileId,
        filename: driveResult.filename,
        sizeBytes: driveResult.sizeBytes
      });
    } catch (uploadErr) {
      console.error('[UploadAPI] Gagal upload ke Google Drive:', uploadErr.message);
      res.status(uploadErr.status || 500).json({
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

// ==========================================
// API: ANALYTICS & EXPORT LAPORAN EXCEL (.xlsx)
// ==========================================
const recentSessionReports = new Map();
const reportOwners = new Map();

async function persistSessionReport(pin) {
  try {
    const reportData = gameState.getSessionReportData(pin) || recentSessionReports.get(pin);
    if (!reportData || !reportData.pin) return;
    const ownerId = reportOwners.get(pin) || '';
    recentSessionReports.set(pin, reportData);
    if (ownerId) reportOwners.set(pin, ownerId);

    if (!auth.store) return;
    await auth.store.exclusive(async () => {
      const allReports = (await auth.store.all('SessionReportsV2')) || [];
      const existing = allReports.find(r => String(r.pin) === String(pin));
      const record = {
        pin: String(pin),
        quiz_set: String(reportData.quizSet || ''),
        owner_id: String(ownerId || existing?.owner_id || ''),
        total_participants: String(reportData.totalParticipants || 0),
        created_at: String(reportData.createdAt || new Date().toISOString()),
        report_json: JSON.stringify(reportData),
        ...(existing?._row ? { _row: existing._row } : {})
      };
      await auth.store.save('SessionReportsV2', record);
      console.log(`[SessionReport] Sesi PIN ${pin} berhasil disimpan permanen ke Google Sheets.`);
    });
  } catch (err) {
    console.error(`[SessionReport] Gagal menyimpan sesi PIN ${pin} ke Google Sheets:`, err.message);
  }
}

// API: Ambil Data Ringkasan Analisis Sesi Kuis (JSON)
app.get('/api/session/:pin/analytics', auth.wrap(async (req, res) => {
  const pin = req.params.pin;
  let reportData = gameState.getSessionReportData(pin) || recentSessionReports.get(pin);
  if (!reportData && auth.store) {
    try {
      const allReports = (await auth.store.all('SessionReportsV2')) || [];
      const saved = allReports.find(r => String(r.pin) === String(pin));
      if (saved && saved.report_json) {
        reportData = JSON.parse(saved.report_json);
        recentSessionReports.set(pin, reportData);
        if (saved.owner_id) reportOwners.set(pin, saved.owner_id);
      }
    } catch (e) {
      console.error('[SessionAnalytics] Gagal membaca dari SessionReportsV2:', e.message);
    }
  }
  if (!reportData) {
    return res.status(404).json({ success: false, error: `Sesi kuis dengan PIN ${pin} tidak ditemukan.` });
  }
  recentSessionReports.set(pin, reportData);
  res.json({ success: true, report: reportData });
}));

// API: Unduh Laporan Excel (.xlsx) Kuis Komprehensif 3-Sheet
app.get('/api/session/:pin/export-excel', auth.wrap(async (req, res) => {
  try {
    const pin = req.params.pin;
    let reportData = gameState.getSessionReportData(pin) || recentSessionReports.get(pin);
    if (!reportData && auth.store) {
      try {
        const allReports = (await auth.store.all('SessionReportsV2')) || [];
        const saved = allReports.find(r => String(r.pin) === String(pin));
        if (saved && saved.report_json) {
          reportData = JSON.parse(saved.report_json);
          recentSessionReports.set(pin, reportData);
          if (saved.owner_id) reportOwners.set(pin, saved.owner_id);
        }
      } catch (e) {
        console.error('[ExportExcelAPI] Gagal membaca dari SessionReportsV2:', e.message);
      }
    }
    if (!reportData) {
      return res.status(404).send(`Sesi kuis dengan PIN ${pin} tidak ditemukan atau belum memiliki data jawaban.`);
    }

    recentSessionReports.set(pin, reportData);
    const excelBuffer = await excelReportService.generateSessionExcel(reportData);

    const safeSetName = (reportData.quizSet || 'Quiz').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `Laporan_Nizhoot_${safeSetName}_${pin}_${dateStamp}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', excelBuffer.length);
    res.send(excelBuffer);
  } catch (err) {
    console.error('[ExportExcelAPI] Gagal membuat laporan Excel:', err);
    res.status(500).send(`Gagal membuat file laporan Excel: ${err.message}`);
  }
}));

// API: Daftar Sesi Kuis yang Dapat Diunduh (Memori Aktif + Riwayat Google Sheets)
app.get('/api/session/reports', auth.wrap(async (req, res) => {
  const seenPins = new Set();
  const sessions = [];

  // 1. Sesi aktif dari memori server
  for (const pin of gameState.rooms.keys()) {
    const owner = reportOwners.get(pin);
    if (req.user.role === 'super_admin' || owner === req.user.id) {
      const data = gameState.getSessionReportData(pin);
      if (data) {
        seenPins.add(String(pin));
        sessions.push({
          pin: String(pin),
          quizSet: data.quizSet,
          totalParticipants: data.totalParticipants,
          state: data.state,
          createdAt: data.createdAt
        });
      }
    }
  }

  // 2. Sesi tersimpan permanen dari Google Sheets (SessionReportsV2)
  if (auth.store) {
    try {
      const savedReports = (await auth.store.all('SessionReportsV2')) || [];
      for (const r of savedReports) {
        const pin = String(r.pin);
        if (pin && !seenPins.has(pin)) {
          if (req.user.role === 'super_admin' || r.owner_id === req.user.id) {
            seenPins.add(pin);
            sessions.push({
              pin,
              quizSet: r.quiz_set,
              totalParticipants: Number(r.total_participants) || 0,
              state: 'FINAL_PODIUM',
              createdAt: r.created_at
            });
            if (r.report_json && !recentSessionReports.has(pin)) {
              try {
                recentSessionReports.set(pin, JSON.parse(r.report_json));
                reportOwners.set(pin, r.owner_id);
              } catch (e) {}
            }
          }
        }
      }
    } catch (e) {
      console.error('[SessionReports] Gagal memuat dari Google Sheets:', e.message);
    }
  }

  // Urutkan dari yang paling baru
  sessions.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.json({ success: true, sessions });
}));

// API: Hapus Riwayat Sesi Kuis (Memori Server & Google Sheets)
app.delete('/api/session/:pin', auth.wrap(async (req, res) => {
  const pin = req.params.pin;

  // 1. Bersihkan dari memori aktif server
  if (gameState.rooms.has(pin)) {
    const room = gameState.rooms.get(pin);
    if (room?.timerHandle) {
      clearInterval(room.timerHandle);
      room.timerHandle = null;
    }
    if (room?.autoplayTimer) {
      clearTimeout(room.autoplayTimer);
      room.autoplayTimer = null;
    }
    gameState.rooms.delete(pin);
  }
  recentSessionReports.delete(pin);
  reportOwners.delete(pin);

  // 2. Hapus baris dari Google Sheets (SessionReportsV2) jika terkonfigurasi
  if (auth.store) {
    try {
      await auth.store.exclusive(async () => {
        const allReports = (await auth.store.all('SessionReportsV2')) || [];
        const saved = allReports.find(r => String(r.pin) === String(pin));
        if (saved && saved._row) {
          await auth.store.delete('SessionReportsV2', saved._row);
          console.log(`[SessionReport] Sesi PIN ${pin} berhasil dihapus dari Google Sheets (baris ${saved._row}).`);
        }
      });
    } catch (e) {
      console.error(`[SessionReport] Gagal menghapus sesi PIN ${pin} dari Google Sheets:`, e.message);
      return res.status(500).json({ success: false, error: `Gagal menghapus riwayat dari spreadsheet: ${e.message}` });
    }
  }

  res.json({ success: true, message: `Riwayat sesi kuis PIN ${pin} berhasil dihapus.` });
}));

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

    if (!rowNumber || rowNumber < 2) {
      return res.status(400).json({ success: false, error: 'Nomor baris tidak valid.' });
    }

    // Delete the row first; never delete untracked links or media still in use.
    await deleteQuestionRow(rowNumber);
    await cleanupUploadedMedia([req.authorizedQuestion], Object.values(req.questionData.sets).flat().filter(q => q.sheetRowIndex !== rowNumber));

    // Reset cache
    questionsCache = null;

    res.json({
      success: true,
      message: `Soal pada baris ${rowNumber} berhasil dihapus.`
    });
  } catch (err) {
    console.error('[AdminAPI] Gagal menghapus soal:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Hapus Seluruh Set Kuis (Cascade Delete folder set di Google Drive + Hapus Baris Spreadsheet)
app.delete('/api/admin/quiz-sets/:setName', async (req, res) => {
  try {
    const setName = req.params.setName;

    if (!setName) {
      return res.status(400).json({ success: false, error: 'Nama set kuis tidak valid.' });
    }

    const questions = Object.values(req.questionData.sets).flat();
    const removed = questions.filter(q => q.quiz_set.toLowerCase() === setName.toLowerCase());
    const deleteResult = removed.length ? await deleteQuizSetRows(setName) : { deletedCount: 0 };
    await auth.store.exclusive(async () => {
      const record = (await auth.store.all('QuizAccessV2')).find(r => r.quiz_set === setName);
      if (record) await auth.store.save('QuizAccessV2', { ...record, quiz_set: '', owner_id: '', collaborators: '' });
    });
    await cleanupUploadedMedia(removed, questions.filter(q => !removed.includes(q)));

    // Reset cache
    questionsCache = null;

    res.json({
      success: true,
      message: `Set "${setName}" (${deleteResult.deletedCount} soal) berhasil dihapus.`
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
  socket.use(async ([event, payload], next) => {
    if (!event.startsWith('host:')) return next();
    try {
      if (!auth.originAllowed(socket.request)) throw new Error('Origin tidak valid.');
      const user = await auth.identify(socket.request);
      if (!user || user.status !== 'active' || user.must_change_password === 'true') throw new Error('Silakan masuk dengan akun aktif.');
      socket.account = user;
      if (event !== 'host:create_room') {
        const room = gameState.getRoom(payload?.pin);
        if (!room || room.hostSocketId !== socket.id || reportOwners.get(payload.pin) !== user.id) throw new Error('Anda bukan host sesi ini.');
      }
      next();
    } catch (error) { socket.emit('host:error', { message: 'Akses host ditolak. Periksa akun dan sesi Anda.' }); }
  });
  console.log(`[Socket] Klien terhubung: ${socket.id}`);

  // ============================
  // HOST EVENTS
  // ============================

  // 1. Host Membuat Room Baru
  socket.on('host:create_room', async ({ quizSet }) => {
    try {
      const data = await getCachedQuestions();
      const selectedSet = quizSet || data.setNames[0] || 'Default';
      if (!(await auth.canAccess(socket.account, selectedSet))) throw new Error('Anda tidak memiliki akses ke kuis ini.');
      const questions = data.sets[selectedSet] || [];

      if (questions.length === 0) {
        socket.emit('host:error', { message: `Set kuis "${selectedSet}" tidak memiliki soal.` });
        return;
      }

      const pin = gameState.generatePin();
      const room = gameState.createRoom(pin, selectedSet, questions, socket.id);
      reportOwners.set(pin, socket.account.id);
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
    if (gameState.getRoom(pin)?.hostSocketId !== socket.id) return;
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
      persistSessionReport(pin);
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
  const reactionEmojis = new Set(['👍', '😂', '🎉', '🔥', '😮', '❤️']);
  let lastReaction = 0;
  socket.on('player:reaction', (payload, acknowledge) => {
    const reply = data => { if (typeof acknowledge === 'function') acknowledge(data); };
    const room = gameState.getRoom(payload?.pin);
    const player = room?.players.get(socket.id);
    if (!player || room.state !== 'LOBBY' || !reactionEmojis.has(payload?.emoji)) return reply({ success: false, message: 'Reaksi hanya tersedia di ruang tunggu.' });
    const now = Date.now();
    if (now - lastReaction < 2000) return reply({ success: false, retryAfter: 2000 - (now - lastReaction), message: 'Tunggu sebentar sebelum bereaksi lagi.' });
    lastReaction = now;
    io.to(`room_${room.pin}`).emit('room:reaction', { pin: room.pin, emoji: payload.emoji });
    reply({ success: true });
  });
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
  persistSessionReport(pin);
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
  getLocalIpAddress,
  auth,
  io
};

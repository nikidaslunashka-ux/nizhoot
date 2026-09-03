const Papa = require('papaparse');
const { google } = require('googleapis');
const fs = require('fs');

// Fallback questions jika koneksi internet terputus
const FALLBACK_QUESTIONS = [
  {
    id: 1,
    question: 'Berapa hasil dari 10 x 10?',
    options: {
      a: '50',
      b: '100',
      c: '150',
      d: '200'
    },
    correct_answer: 'b',
    duration_seconds: 15,
    image_url: '',
    video_url: '',
    quiz_set: 'Sample Offline'
  },
  {
    id: 2,
    question: 'Manakah warna dan bentuk yang digunakan untuk tombol Opsi A di Nizhoot?',
    options: {
      a: 'Magenta (Hexagon)',
      b: 'Biru (Chevron)',
      c: 'Cyan (Bintang)',
      d: 'Hijau (Segitiga)'
    },
    correct_answer: 'a',
    duration_seconds: 15,
    image_url: '',
    video_url: '',
    quiz_set: 'Sample Offline'
  },
  {
    id: 3,
    question: 'Apa fungsi utama tampilan /host pada Nizhoot?',
    options: {
      a: 'Input jawaban peserta',
      b: 'Pengaturan akun Google',
      c: 'Tampilan utama proyektor & kontrol kuis',
      d: 'Database server cloud'
    },
    correct_answer: 'c',
    duration_seconds: 20,
    image_url: '',
    video_url: '',
    quiz_set: 'Sample Offline'
  }
];

/**
 * Mendapatkan authenticated Google Sheets client via Service Account
 */
function getSheetsClient() {
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) return null;

  try {
    let credentials;
    // Cek apakah rawKey adalah path ke file atau string JSON langsung
    if (rawKey.trim().startsWith('{')) {
      credentials = JSON.parse(rawKey);
    } else if (fs.existsSync(rawKey.trim())) {
      credentials = JSON.parse(fs.readFileSync(rawKey.trim(), 'utf8'));
    } else {
      credentials = JSON.parse(rawKey);
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    return google.sheets({ version: 'v4', auth });
  } catch (err) {
    console.error('[SheetsAPI] Gagal menginisialisasi Google Service Account:', err.message);
    return null;
  }
}

/**
 * Sanitasi dan normalisasi objek baris
 */
function normalizeRow(row, index) {
  if (!row || typeof row !== 'object') return null;

  const cleanRow = {};
  for (const key of Object.keys(row)) {
    cleanRow[key.trim().toLowerCase()] = row[key];
  }

  const question = (cleanRow.question || cleanRow.pertanyaan || '').toString().trim();
  const optA = (cleanRow.option_a || cleanRow.opsi_a || cleanRow.a || '').toString().trim();
  const optB = (cleanRow.option_b || cleanRow.opsi_b || cleanRow.b || '').toString().trim();
  const optC = (cleanRow.option_c || cleanRow.opsi_c || cleanRow.c || '').toString().trim();
  const optD = (cleanRow.option_d || cleanRow.opsi_d || cleanRow.d || '').toString().trim();
  let correct = (cleanRow.correct_answer || cleanRow.jawaban_benar || cleanRow.kunci || '').toString().trim().toLowerCase();

  if (!question || !optA || !optB) {
    return null;
  }

  if (correct === '1') correct = 'a';
  if (correct === '2') correct = 'b';
  if (correct === '3') correct = 'c';
  if (correct === '4') correct = 'd';
  if (!['a', 'b', 'c', 'd'].includes(correct)) {
    correct = 'a';
  }

  let duration = parseInt(cleanRow.duration_seconds || cleanRow.durasi || 20, 10);
  if (isNaN(duration) || duration < 5) duration = 20;

  const quizSet = (cleanRow.quiz_set || cleanRow.set || 'Default').toString().trim() || 'Default';
  const imageUrl = (cleanRow.image_url || cleanRow.gambar || '').toString().trim();
  const videoUrl = (cleanRow.video_url || cleanRow.video || '').toString().trim();

  return {
    id: index + 1,
    question,
    options: {
      a: optA,
      b: optB,
      c: optC || '-',
      d: optD || '-'
    },
    correct_answer: correct,
    duration_seconds: duration,
    image_url: imageUrl,
    video_url: videoUrl,
    quiz_set: quizSet
  };
}

/**
 * Baca soal menggunakan Google Sheets API (jika service account aktif)
 */
async function loadQuestionsFromSheetsApi(spreadsheetId) {
  const sheets = getSheetsClient();
  if (!sheets) throw new Error('Service Account tidak tersedia.');

  console.log(`[SheetsAPI] Membaca data via Sheets API dari Spreadsheet ID: ${spreadsheetId}`);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'A2:J'
  });

  const rows = res.data.values || [];
  const validQuestions = [];

  rows.forEach((row, idx) => {
    if (!row || row.length < 3) return;
    const mappedObj = {
      question: row[0],
      option_a: row[1],
      option_b: row[2],
      option_c: row[3],
      option_d: row[4],
      correct_answer: row[5],
      duration_seconds: row[6],
      image_url: row[7],
      video_url: row[8],
      quiz_set: row[9]
    };
    const q = normalizeRow(mappedObj, idx);
    if (q) validQuestions.push(q);
  });

  return groupQuestions(validQuestions, `Sheets API (ID: ${spreadsheetId})`);
}

/**
 * Tambah soal baru ke Google Spreadsheet via Sheets API
 */
async function appendQuestionToSheet(data) {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID belum diset di file .env.');
  }

  const sheets = getSheetsClient();
  if (!sheets) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY belum valid atau belum diset di .env.');
  }

  // Sanitasi baris
  const question = (data.question || '').toString().trim();
  const optA = (data.option_a || '').toString().trim();
  const optB = (data.option_b || '').toString().trim();
  const optC = (data.option_c || '').toString().trim();
  const optD = (data.option_d || '').toString().trim();
  let correct = (data.correct_answer || 'a').toString().trim().toLowerCase();
  if (!['a', 'b', 'c', 'd'].includes(correct)) correct = 'a';

  let duration = parseInt(data.duration_seconds || 20, 10);
  if (isNaN(duration) || duration < 5) duration = 20;

  const imageUrl = (data.image_url || '').toString().trim();
  const videoUrl = (data.video_url || '').toString().trim();
  const quizSet = (data.quiz_set || 'Default').toString().trim() || 'Default';

  if (!question || !optA || !optB) {
    throw new Error('Pertanyaan dan minimal Pilihan A serta Pilihan B wajib diisi.');
  }

  const rowValues = [
    question,
    optA,
    optB,
    optC,
    optD,
    correct,
    duration,
    imageUrl,
    videoUrl,
    quizSet
  ];

  console.log(`[SheetsAPI] Menambahkan soal baru ke Spreadsheet (${quizSet}): "${question}"`);

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'A:J',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [rowValues]
    }
  });

  return {
    success: true,
    updatedRange: response.data.updates ? response.data.updates.updatedRange : null,
    addedQuestion: {
      question,
      quiz_set: quizSet
    }
  };
}

/**
 * Fetch dan parse CSV dari Google Spreadsheet publish-to-web (Metode Utama / Fallback)
 */
async function loadQuestionsFromCsv(customUrl) {
  const url = customUrl || process.env.SHEET_CSV_URL;

  if (!url) {
    console.warn('[SheetsLoader] SHEET_CSV_URL tidak diset. Menggunakan data fallback offline.');
    return groupQuestions(FALLBACK_QUESTIONS, 'offline-fallback');
  }

  console.log(`[SheetsLoader] Mengambil data CSV dari: ${url}`);
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Nizhoot-Server/1.0' },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
  }

  const csvText = await response.text();
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: 'greedy'
  });

  const validQuestions = [];
  (parsed.data || []).forEach((row, i) => {
    const q = normalizeRow(row, i);
    if (q) validQuestions.push(q);
  });

  if (validQuestions.length === 0) {
    return groupQuestions(FALLBACK_QUESTIONS, 'empty-csv-fallback');
  }

  return groupQuestions(validQuestions, url);
}

/**
 * Main Loader: Coba Sheets API jika dikonfigurasi, jika tidak gunakan CSV publish-to-web
 */
async function loadQuestions(customUrl) {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const hasServiceKey = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (hasServiceKey && spreadsheetId) {
    try {
      return await loadQuestionsFromSheetsApi(spreadsheetId);
    } catch (err) {
      console.warn('[SheetsLoader] Gagal via Sheets API, beralih ke CSV:', err.message);
    }
  }

  try {
    return await loadQuestionsFromCsv(customUrl);
  } catch (err) {
    console.error('[SheetsLoader] Gagal mengambil CSV Google Spreadsheet:', err.message);
    return groupQuestions(FALLBACK_QUESTIONS, 'error-fallback');
  }
}

/**
 * Kelompokkan soal berdasarkan set kuis
 */
function groupQuestions(questionsList, source) {
  const sets = {};

  for (const q of questionsList) {
    const setName = q.quiz_set || 'Default';
    if (!sets[setName]) {
      sets[setName] = [];
    }
    sets[setName].push(q);
  }

  return {
    source,
    lastFetched: new Date().toISOString(),
    totalCount: questionsList.length,
    sets,
    setNames: Object.keys(sets)
  };
}

module.exports = {
  loadQuestions,
  appendQuestionToSheet,
  getSheetsClient,
  FALLBACK_QUESTIONS
};

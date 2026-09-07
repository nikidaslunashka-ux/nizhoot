const Papa = require('papaparse');
const { google } = require('googleapis');
const fs = require('fs');
const driveService = require('./driveService');

// Fallback questions jika koneksi internet terputus
const FALLBACK_QUESTIONS = [
  {
    id: 1,
    sheetRowIndex: 2,
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
    sheetRowIndex: 3,
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
    sheetRowIndex: 4,
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

function getCredentialsData() {
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (rawKey) {
    if (rawKey.trim().startsWith('{')) {
      return JSON.parse(rawKey);
    } else if (fs.existsSync(rawKey.trim())) {
      return JSON.parse(fs.readFileSync(rawKey.trim(), 'utf8'));
    }
  }

  const localFiles = ['service-account.json', 'credentials.json', 'service_account.json'];
  for (const file of localFiles) {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  }

  return null;
}

function getSheetsClient() {
  try {
    const credentials = getCredentialsData();
    if (!credentials) return null;

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ]
    });

    return google.sheets({ version: 'v4', auth });
  } catch (err) {
    console.error('[SheetsAPI] Gagal menginisialisasi Google Service Account:', err.message);
    return null;
  }
}

/**
 * Dapatkan sheet ID pertama dari spreadsheet
 */
async function getFirstSheetId(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  if (meta.data.sheets && meta.data.sheets.length > 0) {
    return meta.data.sheets[0].properties.sheetId;
  }
  return 0;
}

/**
 * Sanitasi dan normalisasi objek baris
 */
function normalizeRow(row, index, rowNumber) {
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
  const rawImageUrl = (cleanRow.image_url || cleanRow.gambar || '').toString().trim();
  const rawVideoUrl = (cleanRow.video_url || cleanRow.video || '').toString().trim();
  const imageUrl = driveService.convertDriveUrl ? driveService.convertDriveUrl(rawImageUrl, 'image') : rawImageUrl;
  const videoUrl = driveService.convertDriveUrl ? driveService.convertDriveUrl(rawVideoUrl, 'video') : rawVideoUrl;
  const lastUpdated = (cleanRow.last_updated || cleanRow.updated_at || cleanRow.tanggal || '').toString().trim() || new Date().toISOString();

  return {
    id: index + 1,
    sheetRowIndex: rowNumber || (index + 2),
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
    quiz_set: quizSet,
    last_updated: lastUpdated
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
    range: 'A2:K'
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
      quiz_set: row[9],
      last_updated: row[10] || ''
    };
    // rowNumber pada spreadsheet: A2 = row 2
    const q = normalizeRow(mappedObj, idx, idx + 2);
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

  const rawImageUrl = (data.image_url || '').toString().trim();
  const rawVideoUrl = (data.video_url || '').toString().trim();
  const imageUrl = driveService.convertDriveUrl ? driveService.convertDriveUrl(rawImageUrl, 'image') : rawImageUrl;
  const videoUrl = driveService.convertDriveUrl ? driveService.convertDriveUrl(rawVideoUrl, 'video') : rawVideoUrl;
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
    quizSet,
    new Date().toISOString()
  ];

  console.log(`[SheetsAPI] Menambahkan soal baru ke Spreadsheet (${quizSet}): "${question}"`);

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'A:K',
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
 * Update 1 baris soal di Google Spreadsheet via Sheets API (Edit Soal)
 */
async function updateQuestionRow(sheetRowIndex, data) {
  const rowIdx = parseInt(sheetRowIndex, 10);
  if (isNaN(rowIdx) || rowIdx < 2) {
    throw new Error(`Nomor baris tidak valid: ${sheetRowIndex}`);
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

  if (!question || !optA || !optB) {
    throw new Error('Pertanyaan dan minimal Pilihan A serta Pilihan B wajib diisi.');
  }

  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID belum diset di file .env.');
  }
  const sheets = getSheetsClient();
  if (!sheets) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY belum valid atau belum diset di .env.');
  }

  const lastUpdated = new Date().toISOString();
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
    quizSet,
    lastUpdated
  ];

  console.log(`[SheetsAPI] Memperbarui soal baris ke-${rowIdx} pada Spreadsheet (${quizSet}): "${question}"`);

  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `A${rowIdx}:K${rowIdx}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [rowValues]
    }
  });

  return {
    success: true,
    updatedRow: rowIdx,
    updatedRange: response.data.updatedRange || `A${rowIdx}:K${rowIdx}`,
    updatedQuestion: {
      sheetRowIndex: rowIdx,
      question,
      options: { a: optA, b: optB, c: optC, d: optD },
      correct_answer: correct,
      duration_seconds: duration,
      image_url: imageUrl,
      video_url: videoUrl,
      quiz_set: quizSet,
      last_updated: lastUpdated
    }
  };
}

/**
 * Hapus 1 baris soal di Google Spreadsheet via Sheets API (Cascade Delete 1 Soal)
 */
async function deleteQuestionRow(sheetRowIndex) {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID belum diset di file .env.');
  }
  const sheets = getSheetsClient();
  if (!sheets) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY belum valid atau belum diset di .env.');
  }

  const sheetId = await getFirstSheetId(sheets, spreadsheetId);
  const rowIdx = parseInt(sheetRowIndex, 10);
  if (isNaN(rowIdx) || rowIdx < 2) {
    throw new Error(`Nomor baris tidak valid: ${sheetRowIndex}`);
  }

  console.log(`[SheetsAPI] Menghapus baris ke-${rowIdx} pada Spreadsheet ID: ${spreadsheetId}`);

  // Sheets API zero-indexed: baris 2 di spreadsheet adalah startIndex 1, endIndex 2
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIdx - 1,
              endIndex: rowIdx
            }
          }
        }
      ]
    }
  });

  return { success: true, deletedRow: rowIdx };
}

/**
 * Hapus semua baris milik quiz_set tertentu di Google Spreadsheet (Cascade Delete Seluruh Set)
 */
async function deleteQuizSetRows(quizSetName) {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID belum diset di file .env.');
  }
  const sheets = getSheetsClient();
  if (!sheets) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY belum valid atau belum diset di .env.');
  }

  const sheetId = await getFirstSheetId(sheets, spreadsheetId);

  // Baca semua baris untuk mengetahui baris mana saja yang cocok
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'A2:J'
  });
  const rows = res.data.values || [];

  const rowsToDelete = [];
  rows.forEach((row, idx) => {
    const setName = (row[9] || 'Default').toString().trim();
    if (setName.toLowerCase() === quizSetName.toLowerCase()) {
      rowsToDelete.push(idx + 1); // 0-indexed di sheet, row 2 = index 1
    }
  });

  if (rowsToDelete.length === 0) {
    return { success: true, deletedCount: 0 };
  }

  // Hapus dari urutan terbesar (terbawah) ke atas agar posisi baris tidak bergeser
  rowsToDelete.sort((a, b) => b - a);

  const requests = rowsToDelete.map(rIndex => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: 'ROWS',
        startIndex: rIndex,
        endIndex: rIndex + 1
      }
    }
  }));

  console.log(`[SheetsAPI] Menghapus ${requests.length} baris untuk set "${quizSetName}"`);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests
    }
  });

  return { success: true, deletedCount: requests.length };
}

/**
 * Fetch dan parse CSV dari Google Spreadsheet publish-to-web (Fallback)
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
    const q = normalizeRow(row, i, i + 2);
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
  const hasServiceKey = !!(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS || fs.existsSync('service-account.json'));

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
  const setSummaries = {};

  for (const q of questionsList) {
    const setName = q.quiz_set || 'Default';
    if (!sets[setName]) {
      sets[setName] = [];
      setSummaries[setName] = {
        name: setName,
        count: 0,
        totalDuration: 0,
        firstQuestion: q.question || '',
        lastUpdated: q.last_updated || new Date().toISOString()
      };
    }
    sets[setName].push(q);
    setSummaries[setName].count++;
    setSummaries[setName].totalDuration += (q.duration_seconds || 20);

    if (q.last_updated && (!setSummaries[setName].lastUpdated || new Date(q.last_updated) > new Date(setSummaries[setName].lastUpdated))) {
      setSummaries[setName].lastUpdated = q.last_updated;
    }
  }

  return {
    source,
    lastFetched: new Date().toISOString(),
    totalCount: questionsList.length,
    sets,
    setSummaries,
    setNames: Object.keys(sets)
  };
}

module.exports = {
  loadQuestions,
  appendQuestionToSheet,
  updateQuestionRow,
  deleteQuestionRow,
  deleteQuizSetRows,
  getSheetsClient,
  FALLBACK_QUESTIONS
};

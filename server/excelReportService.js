/**
 * Nizhoot Excel Report Service
 * Menghasilkan file Excel (.xlsx) komprehensif 3-sheet untuk evaluasi kuis:
 * 1. Ringkasan Sesi & Analisis Butir Soal (Item Difficulty & Distractor Analysis)
 * 2. Peringkat & Evaluasi Peserta (Mastery Classification: Mahir, Cukup, Remedial)
 * 3. Matriks Respons Detail (Cross-Tabulation Jawaban Peserta per Nomor)
 */

const ExcelJS = require('exceljs');

/**
 * Palet Warna Laporan Nizhoot
 */
const COLORS = {
  headerBg: '161F30',        // Deep Navy Nizhoot
  headerText: 'FFFFFF',      // Putih
  cardBg: 'F1F5F9',          // Slate 100
  borderDark: 'CBD5E1',      // Slate 300
  borderSoft: 'E2E8F0',      // Slate 200
  
  // Status Kesulitan & Penguasaan
  greenBg: 'DCFCE7',         // Hijau Muda
  greenText: '166534',       // Hijau Tua
  yellowBg: 'FEF9C3',        // Kuning Muda
  yellowText: '854D0E',       // Coklat Kuning
  redBg: 'FEE2E2',           // Merah Muda
  redText: '991B1B',         // Merah Tua
  grayBg: 'F1F5F9',          // Abu-abu
  grayText: '64748B'          // Slate 500
};

/**
 * Format border standar cell
 */
const THIN_BORDER = {
  top: { style: 'thin', color: { argb: COLORS.borderDark } },
  left: { style: 'thin', color: { argb: COLORS.borderDark } },
  bottom: { style: 'thin', color: { argb: COLORS.borderDark } },
  right: { style: 'thin', color: { argb: COLORS.borderDark } }
};

/**
 * Generate multi-sheet workbook buffer dari data laporan sesi
 * @param {Object} reportData Data dari gameState.getSessionReportData(pin)
 * @returns {Promise<Buffer>} Buffer file Excel .xlsx
 */
async function generateSessionExcel(reportData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nizhoot Interactive Quiz';
  workbook.created = new Date();
  workbook.modified = new Date();

  const sessionDateStr = reportData.createdAt 
    ? new Date(reportData.createdAt).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })
    : new Date().toLocaleString('id-ID');

  // =========================================================================
  // SHEET 1: RINGKASAN SESI & ANALISIS BUTIR SOAL
  // =========================================================================
  const sheet1 = workbook.addWorksheet('Ringkasan & Analisis Soal', {
    views: [{ showGridLines: true }]
  });

  sheet1.columns = [
    { width: 10 }, // A: No Soal
    { width: 42 }, // B: Pertanyaan
    { width: 15 }, // C: Kunci Jawaban
    { width: 16 }, // D: Peserta Jawab
    { width: 15 }, // E: Jumlah Benar
    { width: 15 }, // F: Jumlah Salah
    { width: 14 }, // G: Akurasi (%)
    { width: 18 }, // H: Tingkat Kesulitan
    { width: 20 }, // I: Rata-rata Waktu (s)
    { width: 22 }, // J: Pengecoh Terbanyak
    { width: 28 }  // K: Distribusi Opsi (A/B/C/D)
  ];

  // Judul Besar Sheet 1
  sheet1.mergeCells('A1:K1');
  const titleCell = sheet1.getCell('A1');
  titleCell.value = 'LAPORAN HASIL & ANALISIS BUTIR SOAL NIZHOOT';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: COLORS.headerText } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet1.getRow(1).height = 36;

  // Metadata Sesi (Baris 3-5)
  sheet1.getCell('A3').value = 'Nama Kuis / Set:';
  sheet1.getCell('B3').value = reportData.quizSet || '-';
  sheet1.getCell('D3').value = 'Kode PIN Room:';
  sheet1.getCell('E3').value = reportData.pin || '-';

  sheet1.getCell('A4').value = 'Waktu Sesi:';
  sheet1.getCell('B4').value = sessionDateStr;
  sheet1.getCell('D4').value = 'Total Peserta:';
  sheet1.getCell('E4').value = `${reportData.totalParticipants} Orang`;

  sheet1.getCell('A5').value = 'Total Soal:';
  sheet1.getCell('B5').value = `${reportData.totalQuestions} Butir Soal`;
  sheet1.getCell('D5').value = 'Soal Selesai:';
  sheet1.getCell('E5').value = `${reportData.completedQuestions || reportData.totalQuestions} Soal`;

  ['A3', 'A4', 'A5', 'D3', 'D4', 'D5'].forEach(pos => {
    sheet1.getCell(pos).font = { name: 'Calibri', size: 11, bold: true, color: { argb: '334155' } };
  });
  ['B3', 'B4', 'B5', 'E3', 'E4', 'E5'].forEach(pos => {
    sheet1.getCell(pos).font = { name: 'Calibri', size: 11, color: { argb: '0F172A' } };
  });

  // KPI Utama Kelas (Baris 7-8)
  sheet1.mergeCells('A7:K7');
  const kpiHeader = sheet1.getCell('A7');
  kpiHeader.value = 'INDIKATOR KINERJA KELAS (OVERALL SESSION KPI)';
  kpiHeader.font = { name: 'Calibri', size: 12, bold: true, color: { argb: '0F172A' } };
  kpiHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
  kpiHeader.alignment = { horizontal: 'left', vertical: 'middle' };
  sheet1.getRow(7).height = 24;

  const kpis = [
    { label: 'Rata-rata Skor', val: `${reportData.overview.averageScore} pts` },
    { label: 'Akurasi Kelas', val: `${reportData.overview.overallAccuracy}%` },
    { label: 'Rata-rata Durasi Jawab', val: `${reportData.overview.averageResponseTime}s` },
    { label: 'Soal Tersulit', val: `Soal #${reportData.overview.hardestQuestion.number} (${reportData.overview.hardestQuestion.accuracy}% Benar)` },
    { label: 'Soal Terlama', val: `Soal #${reportData.overview.slowestQuestion.number} (${reportData.overview.slowestQuestion.duration}s)` }
  ];

  sheet1.getRow(8).height = 32;
  const kpiCols = [
    { col: 'A', span: 'B', idx: 0 },
    { col: 'C', span: 'D', idx: 1 },
    { col: 'E', span: 'F', idx: 2 },
    { col: 'G', span: 'I', idx: 3 },
    { col: 'J', span: 'K', idx: 4 }
  ];

  kpiCols.forEach(({ col, span, idx }) => {
    sheet1.mergeCells(`${col}8:${span}8`);
    const cell = sheet1.getCell(`${col}8`);
    const kpi = kpis[idx];
    cell.value = `${kpi.label}\n${kpi.val}`;
    cell.font = { name: 'Calibri', size: 10, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.cardBg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = THIN_BORDER;
  });

  // Header Tabel Analisis Butir Soal (Baris 10)
  sheet1.getRow(10).height = 28;
  const tableHeaders1 = [
    'No Soal', 'Pertanyaan', 'Kunci', 'Peserta', 'Benar', 'Salah',
    'Akurasi (%)', 'Tingkat Kesulitan', 'Rata-rata Waktu', 'Pengecoh Dominan', 'Distribusi Opsi (A/B/C/D)'
  ];

  tableHeaders1.forEach((hdr, idx) => {
    const colLetter = String.fromCharCode(65 + idx);
    const cell = sheet1.getCell(`${colLetter}10`);
    cell.value = hdr;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.headerText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BORDER;
  });

  // Isi Data Soal (Mulai Baris 11)
  let rowIdx1 = 11;
  (reportData.questionsAnalysis || []).forEach((q, idx) => {
    sheet1.getRow(rowIdx1).height = 24;

    const rowData = [
      idx + 1,
      q.questionText || `Soal ${idx + 1}`,
      q.correctAnswer,
      q.totalParticipants,
      q.correctCount,
      q.wrongCount,
      `${q.accuracyPercentage}%`,
      q.difficulty,
      `${q.averageResponseTimeSeconds}s`,
      q.topDistractor !== '-' ? `Opsi ${q.topDistractor}` : '-',
      `A:${q.answerCounts?.a || 0}  B:${q.answerCounts?.b || 0}  C:${q.answerCounts?.c || 0}  D:${q.answerCounts?.d || 0}`
    ];

    rowData.forEach((val, cIdx) => {
      const colLetter = String.fromCharCode(65 + cIdx);
      const cell = sheet1.getCell(`${colLetter}${rowIdx1}`);
      cell.value = val;
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = THIN_BORDER;
      
      // Alignment
      if (cIdx === 1) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }

      // Format warna status tingkat kesulitan (Kolom H)
      if (cIdx === 7) {
        if (q.difficulty === 'Mudah') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.greenBg } };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.greenText } };
        } else if (q.difficulty === 'Sedang') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.yellowBg } };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.yellowText } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redBg } };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.redText } };
        }
      }
    });

    rowIdx1++;
  });

  // =========================================================================
  // SHEET 2: PERINGKAT & EVALUASI PENGUASAAN PESERTA
  // =========================================================================
  const sheet2 = workbook.addWorksheet('Peringkat & Evaluasi Peserta', {
    views: [{ showGridLines: true }]
  });

  sheet2.columns = [
    { width: 12 }, // A: Peringkat
    { width: 28 }, // B: Nama Peserta
    { width: 18 }, // C: Total Skor
    { width: 15 }, // D: Benar
    { width: 15 }, // E: Salah
    { width: 16 }, // F: Akurasi (%)
    { width: 22 }, // G: Rata-rata Kecepatan (s)
    { width: 28 }  // H: Kategori Penguasaan
  ];

  // Judul Besar Sheet 2
  sheet2.mergeCells('A1:H1');
  const titleCell2 = sheet2.getCell('A1');
  titleCell2.value = 'PERINGKAT AKHIR & EVALUASI PENGUASAAN MATERI PESERTA';
  titleCell2.font = { name: 'Calibri', size: 16, bold: true, color: { argb: COLORS.headerText } };
  titleCell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
  titleCell2.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet2.getRow(1).height = 36;

  // Header Baris 3
  sheet2.getRow(3).height = 28;
  const tableHeaders2 = [
    'Peringkat', 'Nama Peserta', 'Total Skor (pts)', 'Jawaban Benar',
    'Jawaban Salah', 'Akurasi (%)', 'Rata-rata Waktu Jawab', 'Kategori Penguasaan'
  ];

  tableHeaders2.forEach((hdr, idx) => {
    const colLetter = String.fromCharCode(65 + idx);
    const cell = sheet2.getCell(`${colLetter}3`);
    cell.value = hdr;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.headerText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BORDER;
  });

  let rowIdx2 = 4;
  (reportData.players || []).forEach(player => {
    sheet2.getRow(rowIdx2).height = 24;

    const rowData = [
      player.rank === 1 ? '🥇 1' : (player.rank === 2 ? '🥈 2' : (player.rank === 3 ? '🥉 3' : player.rank)),
      player.nickname,
      player.score,
      player.totalCorrect,
      player.totalWrong,
      `${player.accuracy}%`,
      `${player.averageResponseTime}s`,
      player.mastery
    ];

    rowData.forEach((val, cIdx) => {
      const colLetter = String.fromCharCode(65 + cIdx);
      const cell = sheet2.getCell(`${colLetter}${rowIdx2}`);
      cell.value = val;
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = THIN_BORDER;

      if (cIdx === 1) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }

      // Format warna Kategori Penguasaan (Kolom H)
      if (cIdx === 7) {
        if (player.mastery === 'Sangat Paham') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.greenBg } };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.greenText } };
        } else if (player.mastery === 'Cukup Paham') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.yellowBg } };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.yellowText } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redBg } };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.redText } };
        }
      }
    });

    rowIdx2++;
  });

  // =========================================================================
  // SHEET 3: MATRIKS RESPONS DETAIL (CROSS-TABULATION PER SOAL)
  // =========================================================================
  const sheet3 = workbook.addWorksheet('Matriks Respons Detail', {
    views: [{ showGridLines: true }]
  });

  const totalQ = reportData.totalQuestions || 0;
  const colWidths3 = [
    { width: 10 }, // A: Rank
    { width: 24 }, // B: Nama
    { width: 14 }  // C: Skor
  ];
  for (let i = 0; i < totalQ; i++) {
    colWidths3.push({ width: 15 });
  }
  sheet3.columns = colWidths3;

  // Helper konversi index kolom numerik (1-based) ke huruf Excel (A, B, ..., Z, AA, AB, ...)
  function getExcelColumnName(colNum) {
    let colName = '';
    while (colNum > 0) {
      const remainder = (colNum - 1) % 26;
      colName = String.fromCharCode(65 + remainder) + colName;
      colNum = Math.floor((colNum - 1) / 26);
    }
    return colName;
  }

  const lastColLetter = getExcelColumnName(3 + totalQ);

  // Judul Besar Sheet 3
  sheet3.mergeCells(`A1:${lastColLetter}1`);
  const titleCell3 = sheet3.getCell('A1');
  titleCell3.value = 'MATRIKS RESPONS DETAIL JAWABAN PESERTA PER NOMOR SOAL';
  titleCell3.font = { name: 'Calibri', size: 16, bold: true, color: { argb: COLORS.headerText } };
  titleCell3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
  titleCell3.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet3.getRow(1).height = 36;

  // Keterangan Legend (Baris 2)
  sheet3.mergeCells(`A2:${lastColLetter}2`);
  const legendCell = sheet3.getCell('A2');
  legendCell.value = 'Keterangan: Format sel = [Pilihan] ([Durasi Jawab]s). Hijau = Jawaban Benar | Merah = Jawaban Salah | Abu-abu = Tidak Menjawab / Waktu Habis';
  legendCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: '64748B' } };
  legendCell.alignment = { horizontal: 'left', vertical: 'middle' };
  sheet3.getRow(2).height = 20;

  // Header Kolom Matriks (Baris 4)
  sheet3.getRow(4).height = 28;
  sheet3.getCell('A4').value = 'Rank';
  sheet3.getCell('B4').value = 'Nama Peserta';
  sheet3.getCell('C4').value = 'Skor';

  ['A4', 'B4', 'C4'].forEach(pos => {
    const c = sheet3.getCell(pos);
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.headerText } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = THIN_BORDER;
  });

  for (let qIdx = 0; qIdx < totalQ; qIdx++) {
    const colName = getExcelColumnName(4 + qIdx);
    const c = sheet3.getCell(`${colName}4`);
    c.value = `Soal ${qIdx + 1}`;
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.headerText } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = THIN_BORDER;
  }

  // Baris Kunci Jawaban Resmi (Baris 5)
  sheet3.getRow(5).height = 24;
  sheet3.getCell('A5').value = '-';
  sheet3.getCell('B5').value = 'KUNCI JAWABAN RESMI';
  sheet3.getCell('C5').value = '-';
  ['A5', 'B5', 'C5'].forEach(pos => {
    const c = sheet3.getCell(pos);
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: '1E293B' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
    c.alignment = { horizontal: pos === 'B5' ? 'left' : 'center', vertical: 'middle' };
    c.border = THIN_BORDER;
  });

  for (let qIdx = 0; qIdx < totalQ; qIdx++) {
    const colName = getExcelColumnName(4 + qIdx);
    const c = sheet3.getCell(`${colName}5`);
    const qStat = reportData.questionsAnalysis && reportData.questionsAnalysis[qIdx];
    c.value = qStat ? `Kunci: ${qStat.correctAnswer}` : '-';
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: '1E293B' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = THIN_BORDER;
  }

  // Data Jawaban Setiap Peserta (Mulai Baris 6)
  let rowIdx3 = 6;
  (reportData.players || []).forEach(player => {
    sheet3.getRow(rowIdx3).height = 24;

    sheet3.getCell(`A${rowIdx3}`).value = player.rank;
    sheet3.getCell(`B${rowIdx3}`).value = player.nickname;
    sheet3.getCell(`C${rowIdx3}`).value = player.score;

    ['A', 'B', 'C'].forEach(col => {
      const c = sheet3.getCell(`${col}${rowIdx3}`);
      c.font = { name: 'Calibri', size: 10 };
      c.alignment = { horizontal: col === 'B' ? 'left' : 'center', vertical: 'middle' };
      c.border = THIN_BORDER;
    });

    for (let qIdx = 0; qIdx < totalQ; qIdx++) {
      const colName = getExcelColumnName(4 + qIdx);
      const cell = sheet3.getCell(`${colName}${rowIdx3}`);
      cell.border = THIN_BORDER;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };

      const ans = player.answers && player.answers[qIdx];
      if (!ans || ans.selectedOption === '-') {
        cell.value = '- (timeout)';
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.grayBg } };
        cell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: COLORS.grayText } };
      } else {
        cell.value = `${ans.selectedOption} (${ans.responseTimeSeconds}s)`;
        if (ans.isCorrect) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.greenBg } };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.greenText } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redBg } };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.redText } };
        }
      }
    }

    rowIdx3++;
  });

  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  generateSessionExcel
};

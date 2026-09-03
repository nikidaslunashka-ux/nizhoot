/**
 * Nizhoot — Admin & Bank Soal Google Sheets Script
 */

const statSetsCount = document.getElementById('statSetsCount');
const statQuestionsCount = document.getElementById('statQuestionsCount');
const statLastFetch = document.getElementById('statLastFetch');
const setsContainer = document.getElementById('setsContainer');
const listQuizSets = document.getElementById('listQuizSets');

// Form Elements
const formAddQuestion = document.getElementById('formAddQuestion');
const inputQuestion = document.getElementById('inputQuestion');
const inputOptA = document.getElementById('inputOptA');
const inputOptB = document.getElementById('inputOptB');
const inputOptC = document.getElementById('inputOptC');
const inputOptD = document.getElementById('inputOptD');
const selectCorrect = document.getElementById('selectCorrect');
const inputDuration = document.getElementById('inputDuration');
const inputQuizSet = document.getElementById('inputQuizSet');
const fileImage = document.getElementById('fileImage');
const inputImageUrl = document.getElementById('inputImageUrl');
const fileVideo = document.getElementById('fileVideo');
const inputVideoUrl = document.getElementById('inputVideoUrl');
const btnSubmitQuestion = document.getElementById('btnSubmitQuestion');
const btnRefreshList = document.getElementById('btnRefreshList');
const formToast = document.getElementById('formToast');

// ==========================================
// 1. LOAD DATA DARI SPREADSHEET
// ==========================================

async function loadData(forceRefresh = false) {
  btnRefreshList.disabled = true;
  btnRefreshList.textContent = 'Menyinkronkan...';

  try {
    const url = `/api/quiz-sets${forceRefresh ? '?refresh=true' : ''}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.success) {
      statSetsCount.textContent = data.setNames.length;
      statQuestionsCount.textContent = data.totalQuestions;
      statLastFetch.textContent = new Date(data.lastFetched).toLocaleTimeString('id-ID', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });

      // Update Datalist Quiz Set
      listQuizSets.innerHTML = '';
      data.setNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        listQuizSets.appendChild(opt);
      });

      renderSets(data.sets);
    } else {
      setsContainer.innerHTML = `<p style="color: #EF4444;">Error: ${data.error}</p>`;
    }
  } catch (err) {
    setsContainer.innerHTML = `<p style="color: #EF4444;">Gagal menghubungi server: ${err.message}</p>`;
  } finally {
    btnRefreshList.disabled = false;
    btnRefreshList.textContent = '🔄 Sinkronisasi Data Spreadsheet';
  }
}

function renderSets(sets) {
  setsContainer.innerHTML = '';

  if (!sets || sets.length === 0) {
    setsContainer.innerHTML = '<p style="color: var(--muted);">Tidak ada set soal yang tersedia.</p>';
    return;
  }

  sets.forEach(set => {
    const section = document.createElement('div');
    section.className = 'set-section';

    let rowsHtml = '';
    set.questions.forEach((q, idx) => {
      const mediaTag = q.image_url ? '📷 Gambar' : (q.video_url ? '🎥 Video' : '—');
      rowsHtml += `
        <tr>
          <td style="width: 40px; font-weight: 700;">#${idx + 1}</td>
          <td style="font-weight: 600;">${escapeHtml(q.question)}</td>
          <td><strong style="color:var(--color-a);">A:</strong> ${escapeHtml(q.options.a)}<br><strong style="color:var(--color-b);">B:</strong> ${escapeHtml(q.options.b)}</td>
          <td><strong style="color:var(--color-c);">C:</strong> ${escapeHtml(q.options.c)}<br><strong style="color:var(--color-d);">D:</strong> ${escapeHtml(q.options.d)}</td>
          <td><span class="badge-correct">${q.correct_answer.toUpperCase()}</span></td>
          <td><span class="badge-sec">${q.duration_seconds}s</span></td>
          <td style="font-size: 0.85rem; color: var(--muted);">${mediaTag}</td>
        </tr>
      `;
    });

    section.innerHTML = `
      <div class="set-header">
        <div class="set-title">Set: <strong>${escapeHtml(set.name)}</strong> (${set.count} Soal)</div>
      </div>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Pertanyaan</th>
              <th>Pilihan A & B</th>
              <th>Pilihan C & D</th>
              <th>Kunci</th>
              <th>Durasi</th>
              <th>Media</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;

    setsContainer.appendChild(section);
  });
}

// ==========================================
// 2. UPLOAD FILE DENGAN VALIDASI UKURAN
// ==========================================

// Upload Gambar (Maks 300 KB)
fileImage.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 300 * 1024) {
    showToast(`Ukuran gambar (${(file.size / 1024).toFixed(1)} KB) melebihi batas 300 KB. Silakan kompres gambar terlebih dahulu.`, 'error');
    fileImage.value = '';
    return;
  }

  await uploadFile(file, inputImageUrl);
});

// Upload Video (Maks 8 MB, Saran YouTube Unlisted)
fileVideo.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 8 * 1024 * 1024) {
    showToast(`Ukuran video (${(file.size / (1024 * 1024)).toFixed(1)} MB) melebihi batas 8 MB. Disarankan memakai link YouTube Unlisted jika video > 8 MB.`, 'error');
    fileVideo.value = '';
    return;
  }

  await uploadFile(file, inputVideoUrl);
});

async function uploadFile(file, targetInput) {
  const formData = new FormData();
  formData.append('mediaFile', file);

  try {
    showToast('Mengunggah file media...', 'success');
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.success) {
      targetInput.value = data.url;
      showToast(`File "${file.name}" berhasil diunggah (${(data.sizeBytes / 1024).toFixed(1)} KB)!`, 'success');
    } else {
      showToast(`Gagal unggah: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`Gagal mengunggah file: ${err.message}`, 'error');
  }
}

// ==========================================
// 3. SUBMIT SOAL BARU KE GOOGLE SPREADSHEET
// ==========================================

formAddQuestion.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    question: inputQuestion.value.trim(),
    option_a: inputOptA.value.trim(),
    option_b: inputOptB.value.trim(),
    option_c: inputOptC.value.trim(),
    option_d: inputOptD.value.trim(),
    correct_answer: selectCorrect.value,
    duration_seconds: parseInt(inputDuration.value, 10) || 20,
    quiz_set: inputQuizSet.value.trim() || 'Default',
    image_url: inputImageUrl.value.trim(),
    video_url: inputVideoUrl.value.trim()
  };

  btnSubmitQuestion.disabled = true;
  btnSubmitQuestion.textContent = 'Menyimpan ke Spreadsheet...';

  try {
    const res = await fetch('/api/admin/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.success) {
      showToast('🎉 Soal berhasil ditambahkan dan disimpan ke Google Spreadsheet!', 'success');
      
      // Reset input form
      inputQuestion.value = '';
      inputOptA.value = '';
      inputOptB.value = '';
      inputOptC.value = '';
      inputOptD.value = '';
      inputImageUrl.value = '';
      inputVideoUrl.value = '';
      fileImage.value = '';
      fileVideo.value = '';
      inputQuestion.focus();

      // Refresh list soal
      loadData(true);
    } else {
      showToast(`Gagal menyimpan: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    btnSubmitQuestion.disabled = false;
    btnSubmitQuestion.textContent = '💾 Simpan Soal ke Spreadsheet';
  }
});

function showToast(msg, type) {
  formToast.textContent = msg;
  formToast.className = `toast-box toast-${type}`;
  formToast.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      formToast.style.display = 'none';
    }, 5000);
  }
}

btnRefreshList.addEventListener('click', () => loadData(true));
document.addEventListener('DOMContentLoaded', () => loadData(false));

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

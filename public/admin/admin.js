/**
 * Nizhoot — Admin & Bank Soal Google Sheets Script
 * Arsitektur: Dashboard Quiz Set Cards & Set Detail View
 */

// Global State
let quizSetsData = [];
let activeSetName = null;

// Stats Elements
const statSetsCount = document.getElementById('statSetsCount');
const statQuestionsCount = document.getElementById('statQuestionsCount');
const statLastFetch = document.getElementById('statLastFetch');
const btnRefreshList = document.getElementById('btnRefreshList');

// View Containers
const viewDashboard = document.getElementById('viewDashboard');
const viewSetDetail = document.getElementById('viewSetDetail');
const quizSetsGrid = document.getElementById('quizSetsGrid');

// Detail View Elements
const btnBackToDashboard = document.getElementById('btnBackToDashboard');
const detailSetName = document.getElementById('detailSetName');
const detailSetCount = document.getElementById('detailSetCount');
const detailSetDuration = document.getElementById('detailSetDuration');
const btnDeleteCurrentSet = document.getElementById('btnDeleteCurrentSet');
const tableQuestionsCountBadge = document.getElementById('tableQuestionsCountBadge');
const detailQuestionsTableBody = document.getElementById('detailQuestionsTableBody');

// Form Tambah / Edit Soal
const cardQuestionForm = document.getElementById('cardQuestionForm');
const formAddQuestion = document.getElementById('formAddQuestion');
const formTitleIcon = document.getElementById('formTitleIcon');
const formTitleText = document.getElementById('formTitleText');
const formSubtitleText = document.getElementById('formSubtitleText');
const btnCancelEdit = document.getElementById('btnCancelEdit');
const btnSubmitIcon = document.getElementById('btnSubmitIcon');
const btnSubmitText = document.getElementById('btnSubmitText');
const inputQuizSet = document.getElementById('inputQuizSet');
const inputQuestion = document.getElementById('inputQuestion');
const inputOptA = document.getElementById('inputOptA');
const inputOptB = document.getElementById('inputOptB');
const inputOptC = document.getElementById('inputOptC');
const inputOptD = document.getElementById('inputOptD');
const selectCorrect = document.getElementById('selectCorrect');
const inputDuration = document.getElementById('inputDuration');

let editingRowIndex = null;

// Media Inputs
const fileImage = document.getElementById('fileImage');
const inputImageUrl = document.getElementById('inputImageUrl');
const imgUploadStatus = document.getElementById('imgUploadStatus');
const imgPreviewBox = document.getElementById('imgPreviewBox');
const imgPreview = document.getElementById('imgPreview');
const fileVideo = document.getElementById('fileVideo');
const inputVideoUrl = document.getElementById('inputVideoUrl');
const vidUploadStatus = document.getElementById('vidUploadStatus');
const btnSubmitQuestion = document.getElementById('btnSubmitQuestion');
const formToast = document.getElementById('formToast');

// Modal Elements
const modalCreateSet = document.getElementById('modalCreateSet');
const btnOpenCreateSetModal = document.getElementById('btnOpenCreateSetModal');
const btnCancelCreateSet = document.getElementById('btnCancelCreateSet');
const formCreateSetModal = document.getElementById('formCreateSetModal');
const inputModalSetName = document.getElementById('inputModalSetName');

function renderLucideIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// ==========================================
// 1. NAVIGASI VIEW (DASHBOARD <-> DETAIL)
// ==========================================

function switchView(viewName, setName = null) {
  cancelEditQuestion();
  if (viewName === 'dashboard') {
    activeSetName = null;
    viewSetDetail.classList.remove('active');
    setTimeout(() => {
      viewDashboard.classList.add('active');
      renderLucideIcons();
    }, 50);
  } else if (viewName === 'detail') {
    activeSetName = setName;
    updateDetailView(setName);
    viewDashboard.classList.remove('active');
    setTimeout(() => {
      viewSetDetail.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      renderLucideIcons();
    }, 50);
  }
}

btnBackToDashboard.addEventListener('click', () => {
  switchView('dashboard');
});

// ==========================================
// 2. MODAL BUAT SET BARU
// ==========================================

function openModal() {
  modalCreateSet.classList.add('active');
  inputModalSetName.value = '';
  renderLucideIcons();
  setTimeout(() => inputModalSetName.focus(), 100);
}

function closeModal() {
  modalCreateSet.classList.remove('active');
}

btnOpenCreateSetModal.addEventListener('click', openModal);
btnCancelCreateSet.addEventListener('click', closeModal);

modalCreateSet.addEventListener('click', (e) => {
  if (e.target === modalCreateSet) closeModal();
});

// Keyboard Escape untuk menutup modal secara aksesibel
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalCreateSet.classList.contains('active')) {
    closeModal();
  }
});

formCreateSetModal.addEventListener('submit', (e) => {
  e.preventDefault();
  const setName = inputModalSetName.value.trim();
  if (!setName) return;

  closeModal();
  switchView('detail', setName);
});

// ==========================================
// 3. FETCH DATA & RENDER CARDS
// ==========================================

async function loadData(forceRefresh = false) {
  btnRefreshList.disabled = true;
  btnRefreshList.innerHTML = '<i data-lucide="loader-2" style="animation: spin 1s linear infinite;"></i> Menyinkronkan...';
  renderLucideIcons();

  try {
    const url = `/api/quiz-sets${forceRefresh ? '?refresh=true' : ''}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.success) {
      quizSetsData = data.sets || [];
      statSetsCount.textContent = data.setNames.length;
      statQuestionsCount.textContent = data.totalQuestions;
      statLastFetch.textContent = new Date(data.lastFetched).toLocaleTimeString('id-ID', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });

      renderDashboardCards(quizSetsData);

      // Jika user sedang berada di halaman detail, sinkronkan juga detailnya
      if (activeSetName) {
        updateDetailView(activeSetName);
      }
    } else {
      quizSetsGrid.innerHTML = `<p style="color: #EF4444;">Error: ${data.error}</p>`;
    }
  } catch (err) {
    quizSetsGrid.innerHTML = `<p style="color: #EF4444;">Gagal menghubungi server: ${err.message}</p>`;
  } finally {
    btnRefreshList.disabled = false;
    btnRefreshList.innerHTML = '<i data-lucide="refresh-cw"></i> Sinkronkan Data';
    renderLucideIcons();
  }
}

function renderDashboardCards(sets) {
  quizSetsGrid.innerHTML = '';

  if (sets && sets.length > 0) {
    sets.forEach(set => {
      const card = document.createElement('div');
      card.className = 'quiz-card';

      const durationStr = formatDuration(set.totalDuration);
      const previewText = set.firstQuestion
        ? `“${escapeHtml(set.firstQuestion.length > 75 ? set.firstQuestion.substring(0, 75) + '...' : set.firstQuestion)}”`
        : '<em>Belum ada soal pada paket ini.</em>';

      const timeAgo = formatTime(set.lastUpdated);

      card.innerHTML = `
        <div>
          <div class="quiz-card-header">
            <h3 class="quiz-card-title">${escapeHtml(set.name)}</h3>
            <button type="button" class="quiz-card-btn-delete" title="Hapus paket kuis ini">
              <i data-lucide="trash-2"></i>
            </button>
          </div>

          <div class="quiz-card-pills">
            <span class="pill pill-count"><i data-lucide="help-circle"></i> ${set.count} Soal</span>
            <span class="pill pill-duration"><i data-lucide="clock"></i> ~${durationStr}</span>
          </div>

          <div class="quiz-card-preview">
            ${previewText}
          </div>
        </div>

        <div class="quiz-card-footer">
          <span><i data-lucide="calendar"></i> ${timeAgo}</span>
          <span class="quiz-card-enter">Buka Paket <i data-lucide="arrow-right"></i></span>
        </div>
      `;

      // Klik card membuka detail
      card.addEventListener('click', (e) => {
        // Jangan buka jika yang diklik adalah tombol delete
        if (e.target.closest('.quiz-card-btn-delete')) return;
        switchView('detail', set.name);
      });

      // Tombol hapus set pada card
      const btnDel = card.querySelector('.quiz-card-btn-delete');
      btnDel.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDeleteQuizSet(set.name, set.count);
      });

      quizSetsGrid.appendChild(card);
    });
  }

  // Card Interaktif "+ Buat Paket Kuis Baru" di akhir grid
  const addCard = document.createElement('div');
  addCard.className = 'card-add-new';
  addCard.innerHTML = `
    <div class="card-add-icon"><i data-lucide="plus"></i></div>
    <div class="card-add-text">Buat Paket Kuis Baru</div>
    <div class="card-add-sub">Tambahkan kelompok materi baru</div>
  `;
  addCard.addEventListener('click', openModal);
  quizSetsGrid.appendChild(addCard);

  renderLucideIcons();
}

// ==========================================
// 4. DETAIL VIEW CONTROLLER
// ==========================================

function updateDetailView(setName) {
  detailSetName.textContent = setName;
  inputQuizSet.value = setName;

  const currentSet = quizSetsData.find(s => s.name.toLowerCase() === setName.toLowerCase());
  const questions = currentSet ? currentSet.questions : [];
  const count = questions.length;
  const totalDuration = questions.reduce((acc, q) => acc + (q.duration_seconds || 20), 0);

  detailSetCount.textContent = `${count} Soal`;
  detailSetDuration.textContent = `~${formatDuration(totalDuration)}`;
  tableQuestionsCountBadge.textContent = `${count} Soal`;

  if (!editingRowIndex) {
    btnSubmitIcon.innerHTML = '<i data-lucide="save"></i>';
    btnSubmitText.textContent = `Simpan Soal ke "${escapeHtml(setName)}"`;
  }

  // Render Tabel Soal
  if (questions.length === 0) {
    detailQuestionsTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--muted); padding: 2.5rem;">
          Paket kuis <strong>"${escapeHtml(setName)}"</strong> masih kosong.<br>
          Gunakan formulir di atas untuk menambahkan soal pertama Anda!
        </td>
      </tr>
    `;
    renderLucideIcons();
    return;
  }

  let html = '';
  questions.forEach((q, idx) => {
    let mediaTag = '—';
    const mediaUrl = q.image_url || q.video_url || '';
    const isDrive = mediaUrl.includes('drive.google.com');

    if (q.image_url) {
      const displayUrl = formatDriveMediaUrl(q.image_url, 'image');
      mediaTag = `<i data-lucide="image"></i> <a href="${escapeHtml(displayUrl)}" target="_blank" style="color:var(--color-c);text-decoration:none;">Gambar</a> ${isDrive ? '<span class="badge-drive">Drive</span>' : ''}`;
    } else if (q.video_url) {
      const displayUrl = formatDriveMediaUrl(q.video_url, 'video');
      mediaTag = `<i data-lucide="video"></i> <a href="${escapeHtml(displayUrl)}" target="_blank" style="color:var(--color-c);text-decoration:none;">Video</a> ${isDrive ? '<span class="badge-drive">Drive</span>' : ''}`;
    }

    html += `
      <tr>
        <td style="font-weight: 700;">#${idx + 1}</td>
        <td style="font-weight: 600;">${escapeHtml(q.question)}</td>
        <td><strong style="color:var(--color-a);">A:</strong> ${escapeHtml(q.options.a)}<br><strong style="color:var(--color-b);">B:</strong> ${escapeHtml(q.options.b)}</td>
        <td><strong style="color:var(--color-c);">C:</strong> ${escapeHtml(q.options.c)}<br><strong style="color:var(--color-d);">D:</strong> ${escapeHtml(q.options.d)}</td>
        <td><span class="badge-correct">${(q.correct_answer || 'a').toUpperCase()}</span></td>
        <td><span class="badge-sec">${q.duration_seconds || 20}s</span></td>
        <td style="font-size: 0.85rem;">${mediaTag}</td>
        <td style="text-align: right;">
          <div class="btn-action-group">
            <button type="button" class="btn-edit" data-row="${q.sheetRowIndex}" title="Edit soal ini">
              <i data-lucide="pencil"></i> Edit
            </button>
            <button type="button" class="btn-delete" data-row="${q.sheetRowIndex}" data-media="${escapeHtml(mediaUrl)}" title="Hapus soal ini">
              <i data-lucide="trash-2"></i> Hapus
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  detailQuestionsTableBody.innerHTML = html;
  renderLucideIcons();

  // Pasang listener edit & hapus soal per baris
  detailQuestionsTableBody.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = parseInt(btn.getAttribute('data-row'), 10);
      const targetQuestion = questions.find(item => item.sheetRowIndex === row);
      if (targetQuestion) {
        startEditQuestion(targetQuestion);
      }
    });
  });

  detailQuestionsTableBody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.getAttribute('data-row');
      const media = btn.getAttribute('data-media');
      await handleDeleteQuestion(row, media);
    });
  });
}

/**
 * Membuka mode edit pada form tambah soal dengan data terpilih
 */
function startEditQuestion(q) {
  editingRowIndex = q.sheetRowIndex;

  inputQuestion.value = q.question || '';
  inputOptA.value = (q.options && q.options.a) || '';
  inputOptB.value = (q.options && q.options.b) || '';
  inputOptC.value = (q.options && q.options.c === '-' ? '' : (q.options && q.options.c)) || '';
  inputOptD.value = (q.options && q.options.d === '-' ? '' : (q.options && q.options.d)) || '';
  selectCorrect.value = (q.correct_answer || 'a').toLowerCase();
  inputDuration.value = q.duration_seconds || 20;

  // Nilai awal media (link Drive atau manual web)
  inputImageUrl.value = q.image_url || '';
  inputVideoUrl.value = q.video_url || '';
  updateImagePreview();

  if (imgUploadStatus) imgUploadStatus.style.display = 'none';
  if (vidUploadStatus) vidUploadStatus.style.display = 'none';

  // Ubah header form & tombol submit ke mode edit
  formTitleIcon.innerHTML = '<i data-lucide="pencil"></i>';
  formTitleText.textContent = `Edit Soal #${q.id || ''} (Baris ${q.sheetRowIndex})`;
  formSubtitleText.textContent = 'Ubah data soal di bawah, lalu klik "Simpan Perubahan" untuk memperbarui Google Spreadsheet.';
  btnSubmitIcon.innerHTML = '<i data-lucide="save"></i>';
  btnSubmitText.textContent = 'Simpan Perubahan';
  btnCancelEdit.style.display = 'inline-flex';

  renderLucideIcons();

  if (cardQuestionForm) {
    cardQuestionForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  setTimeout(() => inputQuestion.focus(), 250);
}

/**
 * Menutup mode edit dan mengembalikan form ke mode tambah soal default
 */
function cancelEditQuestion() {
  editingRowIndex = null;

  inputQuestion.value = '';
  inputOptA.value = '';
  inputOptB.value = '';
  inputOptC.value = '';
  inputOptD.value = '';
  selectCorrect.value = 'a';
  inputDuration.value = '20';
  inputImageUrl.value = '';
  inputVideoUrl.value = '';
  updateImagePreview();
  if (fileImage) fileImage.value = '';
  if (fileVideo) fileVideo.value = '';
  if (imgUploadStatus) imgUploadStatus.style.display = 'none';
  if (vidUploadStatus) vidUploadStatus.style.display = 'none';

  formTitleIcon.innerHTML = '<i data-lucide="plus-circle"></i>';
  formTitleText.textContent = 'Tambah Soal Baru ke Paket Ini';
  formSubtitleText.textContent = 'Soal akan langsung disimpan ke Google Spreadsheet via Sheets API.';
  btnSubmitIcon.innerHTML = '<i data-lucide="save"></i>';
  btnSubmitText.textContent = `Simpan Soal ke "${escapeHtml(activeSetName || 'Paket Ini')}"`;
  btnCancelEdit.style.display = 'none';

  renderLucideIcons();
}

btnCancelEdit.addEventListener('click', cancelEditQuestion);

// Tombol Hapus Set di dalam Layar Detail
btnDeleteCurrentSet.addEventListener('click', () => {
  if (!activeSetName) return;
  const currentSet = quizSetsData.find(s => s.name.toLowerCase() === activeSetName.toLowerCase());
  const count = currentSet ? currentSet.count : 0;
  handleDeleteQuizSet(activeSetName, count, true);
});

// ==========================================
// 5. TAB SWITCHER (MEDIA) & DYNAMIC REQUIRED CLEANUP
// ==========================================

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTabId = btn.getAttribute('data-tab');
    const parentCard = btn.closest('.media-section-card');

    parentCard.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    parentCard.querySelectorAll('.tab-content').forEach(c => {
      c.classList.remove('active');
      // Pastikan semua input di tab yang tersembunyi tidak memiliki atribut required
      c.querySelectorAll('input').forEach(inp => {
        inp.required = false;
      });
    });

    const targetContent = document.getElementById(`tab-${targetTabId}`);
    if (targetContent) {
      targetContent.classList.add('active');
    }
  });
});

// Pastikan semua input media opsional tidak memiliki atribut required sejak awal
[fileImage, fileVideo, inputImageUrl, inputVideoUrl].forEach(el => {
  if (el) el.required = false;
});

/**
 * Format link Google Drive untuk media player / media preview
 * - Gambar: Menggunakan proxy lokal same-origin /api/media-proxy?fileId=... (Bebas CORS, referer, & third-party cookies)
 * - Video:  https://drive.google.com/file/d/FILE_ID/preview
 */
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

/**
 * Konversi link Google Drive mentah ke format siap render & simpan di Spreadsheet
 * - Gambar: https://drive.google.com/thumbnail?id=FILE_ID&sz=w1000
 * - Video:  https://drive.google.com/file/d/FILE_ID/preview
 */
function convertDriveUrl(url, type = 'image') {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  const match = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
                trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);

  if (match && match[1] && (trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com'))) {
    const fileId = match[1];
    if (type === 'image') {
      return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
    } else {
      return `https://drive.google.com/file/d/${fileId}/preview`;
    }
  }

  return trimmed;
}

/**
 * Perbarui pratinjau gambar di form kuis secara instan
 */
function updateImagePreview() {
  if (!imgPreview || !imgPreviewBox) return;
  const val = inputImageUrl ? inputImageUrl.value.trim() : '';
  if (!val) {
    imgPreviewBox.style.display = 'none';
    imgPreview.src = '';
    return;
  }
  const displaySrc = formatDriveMediaUrl(val, 'image');
  imgPreview.src = displaySrc;
  imgPreviewBox.style.display = 'block';
}

// Auto-convert link Google Drive saat admin selesai mengetik / menempelkan link
if (inputImageUrl) {
  ['input', 'change', 'blur', 'keyup', 'paste'].forEach(evt => {
    inputImageUrl.addEventListener(evt, () => {
      if (evt === 'change' || evt === 'blur') {
        const converted = convertDriveUrl(inputImageUrl.value, 'image');
        if (converted !== inputImageUrl.value) {
          inputImageUrl.value = converted;
          showToast('Link Google Drive berhasil dikonversi ke format gambar langsung!', 'success');
        }
      }
      updateImagePreview();
    });
  });
}

if (inputVideoUrl) {
  ['change', 'blur'].forEach(evt => {
    inputVideoUrl.addEventListener(evt, () => {
      const converted = convertDriveUrl(inputVideoUrl.value, 'video');
      if (converted !== inputVideoUrl.value) {
        inputVideoUrl.value = converted;
        showToast('Link Google Drive berhasil dikonversi ke format video player!', 'success');
      }
    });
  });
}

// ==========================================
// 6. UPLOAD MEDIA (OPTIONAL / SAFE CHECK)
// ==========================================

if (fileImage) {
  fileImage.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast(`Ukuran gambar (${(file.size / 1024 / 1024).toFixed(1)} MB) melebihi batas 10 MB.`, 'error');
      fileImage.value = '';
      return;
    }
    await uploadFile(file, inputImageUrl, imgUploadStatus);
  });
}

if (fileVideo) {
  fileVideo.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      showToast(`Ukuran video (${(file.size / 1024 / 1024).toFixed(1)} MB) melebihi batas 50 MB. Disarankan memakai link YouTube Unlisted.`, 'error');
      fileVideo.value = '';
      return;
    }
    await uploadFile(file, inputVideoUrl, vidUploadStatus);
  });
}

async function uploadFile(file, targetInput, statusElement) {
  const formData = new FormData();
  formData.append('mediaFile', file);
  formData.append('quizSet', activeSetName || 'Default');

  statusElement.style.display = 'block';
  statusElement.textContent = '⏳ Mengunggah media... Mohon tunggu.';
  btnSubmitQuestion.disabled = true;

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.success) {
      targetInput.value = data.url;
      updateImagePreview();
      statusElement.textContent = `Berhasil diunggah! (${(data.sizeBytes / 1024).toFixed(1)} KB)`;
      showToast(`File "${file.name}" berhasil diunggah!`, 'success');
    } else {
      statusElement.textContent = 'Gagal upload ke Google Drive.';
      targetInput.value = '';
      showToast(`Gagal unggah: ${data.error}`, 'error');
    }
  } catch (err) {
    statusElement.textContent = 'Terjadi kesalahan jaringan.';
    showToast(`Gagal mengunggah file: ${err.message}`, 'error');
  } finally {
    btnSubmitQuestion.disabled = false;
  }
}

// ==========================================
// 7. SUBMIT SOAL BARU / SIMPAN PERUBAHAN EDIT
// ==========================================

formAddQuestion.addEventListener('submit', async (e) => {
  e.preventDefault();

  const question = inputQuestion.value.trim();
  const optA = inputOptA.value.trim();
  const optB = inputOptB.value.trim();
  const optC = inputOptC.value.trim();
  const optD = inputOptD.value.trim();
  const duration = parseInt(inputDuration.value, 10);

  if (!question) {
    showToast('Teks pertanyaan kuis wajib diisi!', 'error');
    inputQuestion.focus();
    return;
  }
  if (!optA) {
    showToast('Pilihan A wajib diisi!', 'error');
    inputOptA.focus();
    return;
  }
  if (!optB) {
    showToast('Pilihan B wajib diisi!', 'error');
    inputOptB.focus();
    return;
  }
  if (isNaN(duration) || duration < 5) {
    showToast('Durasi waktu minimal 5 detik!', 'error');
    inputDuration.focus();
    return;
  }

  const payload = {
    question,
    option_a: optA,
    option_b: optB,
    option_c: optC,
    option_d: optD,
    correct_answer: selectCorrect.value,
    duration_seconds: duration || 20,
    quiz_set: activeSetName || 'Default',
    image_url: convertDriveUrl(inputImageUrl.value.trim(), 'image'),
    video_url: convertDriveUrl(inputVideoUrl.value.trim(), 'video')
  };

  const isEdit = Boolean(editingRowIndex);
  const endpoint = isEdit ? `/api/admin/questions/${editingRowIndex}` : '/api/admin/questions';
  const method = isEdit ? 'PUT' : 'POST';

  btnSubmitQuestion.disabled = true;
  btnSubmitText.textContent = isEdit ? 'Menyimpan Perubahan...' : 'Menyimpan ke Spreadsheet...';

  try {
    const res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.success) {
      showToast(isEdit ? 'Perubahan soal berhasil disimpan ke Google Spreadsheet!' : `Soal berhasil ditambahkan ke paket "${activeSetName}"!`, 'success');

      cancelEditQuestion();
      // Refresh data
      await loadData(true);
    } else {
      showToast(`Gagal menyimpan: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    btnSubmitQuestion.disabled = false;
    if (!editingRowIndex) {
      btnSubmitIcon.innerHTML = '<i data-lucide="save"></i>';
      btnSubmitText.textContent = `Simpan Soal ke "${escapeHtml(activeSetName || 'Paket Ini')}"`;
      renderLucideIcons();
    }
  }
});

// ==========================================
// 8. CASCADE DELETE HANDLERS
// ==========================================

async function handleDeleteQuestion(sheetRowIndex, mediaUrl) {
  if (!confirm('Yakin ingin menghapus soal ini?\nBaris pada Google Spreadsheet dan file media terkait akan dihapus.')) {
    return;
  }

  if (parseInt(sheetRowIndex, 10) === editingRowIndex) {
    cancelEditQuestion();
  }

  showToast('Menghapus soal...', 'success');

  try {
    const url = `/api/admin/questions/${sheetRowIndex}?mediaUrl=${encodeURIComponent(mediaUrl || '')}`;
    const res = await fetch(url, { method: 'DELETE' });
    const result = await res.json();

    if (result.success) {
      showToast(result.message, 'success');
      await loadData(true);
    } else {
      showToast(`Gagal menghapus: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function handleDeleteQuizSet(setName, count, fromDetailView = false) {
  const confirmMsg = `PERINGATAN: Yakin ingin menghapus seluruh paket kuis "${setName}" beserta ${count} soal di dalamnya?\n\nSemua baris terkait di Google Spreadsheet dan folder media di Google Drive akan dihapus permanen.`;

  if (!confirm(confirmMsg)) {
    return;
  }

  showToast(`Menghapus paket kuis "${setName}"...`, 'success');

  try {
    const url = `/api/admin/quiz-sets/${encodeURIComponent(setName)}`;
    const res = await fetch(url, { method: 'DELETE' });
    const result = await res.json();

    if (result.success) {
      showToast(result.message, 'success');
      if (fromDetailView) {
        switchView('dashboard');
      }
      await loadData(true);
    } else {
      showToast(`Gagal menghapus: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// ==========================================
// 9. HELPER FUNCTIONS
// ==========================================

function formatDuration(totalSeconds) {
  const sec = parseInt(totalSeconds, 10) || 0;
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function formatTime(isoString) {
  if (!isoString) return 'Baru saja';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Baru saja';

    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

    if (diffMins < 2) return 'Baru saja';
    if (diffMins < 60) return `${diffMins} menit lalu`;
    if (diffHours < 24) return `${diffHours} jam lalu`;
    if (diffDays === 1) return 'Kemarin';
    if (diffDays < 7) return `${diffDays} hari lalu`;

    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) {
    return 'Baru saja';
  }
}

function showToast(msg, type) {
  const iconName = type === 'success' ? 'check-circle' : 'alert-circle';
  formToast.innerHTML = `<i data-lucide="${iconName}"></i> <span>${escapeHtml(msg)}</span>`;
  formToast.className = `toast-box toast-${type}`;
  formToast.style.display = 'flex';
  formToast.style.alignItems = 'center';
  formToast.style.gap = '0.6rem';
  renderLucideIcons();

  if (type === 'success') {
    setTimeout(() => {
      formToast.style.display = 'none';
    }, 5000);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

btnRefreshList.addEventListener('click', () => loadData(true));

// Inisialisasi pemanggilan data kuis
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    renderLucideIcons();
    loadData(false);
  });
} else {
  renderLucideIcons();
  loadData(false);
}

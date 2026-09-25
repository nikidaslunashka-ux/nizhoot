const content = document.getElementById('content');
const heading = document.getElementById('form-title');
const copy = document.getElementById('form-copy');
const message = document.getElementById('message');
let account;
let registerMode = false;
const drafts = { login: {}, register: {} }; // Non-secret drafts only, kept in this tab's memory.
const usernameRule = value => /^[a-z0-9_.-]{3,32}$/i.test(value.trim()) ? '' : 'Gunakan 3–32 karakter: huruf, angka, titik (.), garis bawah (_), atau tanda hubung (-).';
const passwordRule = value => NizhootPasswordPolicy.isValid(value) ? '' : NizhootPasswordPolicy.message;
function setTitle(title) { heading.textContent = title; document.title = `${title} — Nizhoot`; }
function focusHeading() { heading.tabIndex = -1; heading.focus(); }
function dashboardNavigation(show) {
  document.getElementById('back-dashboard')?.remove();
  if (!show) return;
  const link = document.createElement('a'); link.id = 'back-dashboard'; link.className = 'back-navigation navigation-button'; link.href = '/admin';
  link.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7M5 12h14"/></svg><span>Bank soal</span>';
  const params = new URLSearchParams(location.search);
  if (params.get('view') === 'password') { link.href = '/auth/?view=settings'; link.querySelector('span').textContent = 'Pengaturan akun'; }
  else if (params.get('view') === 'settings' || params.get('view') === 'access') { link.href = '/admin'; link.querySelector('span').textContent = 'Bank soal'; }
  heading.before(link);
}

let toastTimeout;
function showToast(text, type = 'success', duration = 3000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  container.innerHTML = '';
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'success'
    ? `<span class="toast-icon" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`
    : `<span class="toast-icon" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>`;
  toast.innerHTML = `${icon}<span>${text}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-show'));
  clearTimeout(toastTimeout);
  if (duration > 0) {
    toastTimeout = setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 260);
    }, duration);
  }
}

function showApiError(error, form) {
  let input = error.field && form.querySelector(`#${error.field}`);
  if (!input && error.message && /password saat ini/i.test(error.message)) {
    input = form.querySelector('#currentPassword');
  }
  if (input) { fieldError(input, error.message); input.focus(); }
  else notice(error.message || 'Koneksi terputus. Coba lagi.', true);
}
function notice(text, error = false) { message.textContent = text; message.hidden = !text; message.classList.toggle('error', error); }
function passwordField(id, label, autocomplete = 'new-password') {
  const descIds = [];
  if (id === 'confirm') descIds.push('confirm-help');
  else if (autocomplete === 'new-password') descIds.push('password-help');
  const describedBy = descIds.length ? ` aria-describedby="${descIds.join(' ')}"` : '';
  const eyeBtn = `<button class="password-toggle" type="button" data-password-toggle="${id}" data-password-label="${label.toLowerCase()}" aria-controls="${id}" aria-label="Tampilkan ${label.toLowerCase()}" title="Tampilkan ${label.toLowerCase()}">${passwordEyeIcon(false)}</button>`;
  let after = '';
  if (id === 'confirm') {
    after = `<small id="confirm-help" class="field-hint">Ketik kembali password yang sama.</small>` +
      `<div class="pw-match-indicator" id="pw-match" hidden aria-live="polite">` +
        `<span class="pw-match-icon" aria-hidden="true"></span>` +
        `<span class="pw-match-text"></span>` +
      `</div>`;
  }
  if (id === 'password' && autocomplete === 'new-password') {
    after = `<ul class="pw-strength" id="pw-strength" aria-label="Syarat password" aria-live="polite" role="list">` +
      `<li data-rule="upper">Huruf besar</li>` +
      `<li data-rule="lower">Huruf kecil</li>` +
      `<li data-rule="digit">Angka</li>` +
      `<li data-rule="symbol">Simbol</li>` +
    `</ul>` +
    `<small class="field-hint pw-symbol-hint">Contoh simbol: ! @ # $ % & * _ - ?</small>`;
  }
  return `<label for="${id}">${label}</label><div class="password-wrap"><input id="${id}" name="${id}" type="password" required maxlength="128" autocomplete="${autocomplete}"${describedBy}>${eyeBtn}</div>${after}`;
}


// ── Password strength checklist + match indicator ─────────────────────────
const STRENGTH_RULES = {
  upper:  pw => /[A-Z]/.test(pw),
  lower:  pw => /[a-z]/.test(pw),
  digit:  pw => /[0-9]/.test(pw),
  symbol: pw => /[\p{P}\p{S}]/u.test(pw),
};
const CHECK_SVG  = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M1.5 6l3 3 6-6" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CROSS_SVG  = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>`;

function wireStrengthAndMatch() {
  const pwInput     = document.getElementById('password');
  const cfInput     = document.getElementById('confirm');
  const matchEl     = document.getElementById('pw-match');
  const strengthEl  = document.getElementById('pw-strength');
  if (!pwInput) return;

  // Live strength checklist
  if (strengthEl) {
    pwInput.addEventListener('input', () => {
      const val = pwInput.value;
      strengthEl.querySelectorAll('li[data-rule]').forEach(li => {
        li.classList.toggle('met', STRENGTH_RULES[li.dataset.rule]?.(val) ?? false);
      });
      // Re-evaluate match whenever the primary password changes
      if (cfInput && matchEl && cfInput.value) updateMatch();
    });
  }

  // Live match indicator on confirm field
  if (cfInput && matchEl) {
    cfInput.addEventListener('input', updateMatch);
    pwInput.addEventListener('input', () => { if (cfInput.value) updateMatch(); });
  }

  function updateMatch() {
    const pw = pwInput.value, cf = cfInput.value;
    if (!cf) { matchEl.hidden = true; return; }
    const ok = pw === cf;
    matchEl.hidden = false;
    matchEl.className = `pw-match-indicator ${ok ? 'match-ok' : 'match-fail'}`;
    matchEl.querySelector('.pw-match-icon').innerHTML = ok ? CHECK_SVG : CROSS_SVG;
    matchEl.querySelector('.pw-match-text').textContent = ok ? 'Password cocok' : 'Password belum cocok';
  }
}

function resetStrengthAndMatch() {
  const strengthEl = document.getElementById('pw-strength');
  const matchEl    = document.getElementById('pw-match');
  if (strengthEl) strengthEl.querySelectorAll('li').forEach(li => li.classList.remove('met'));
  if (matchEl) { matchEl.hidden = true; matchEl.className = 'pw-match-indicator'; }
}

function wireForm(work, rules = {}) {
  const form = content.querySelector('form');
  const validate = bindFormValidation(form, rules);
  let busy = false;
  form.onsubmit = async event => {
    event.preventDefault(); notice('');
    if (busy || !validate()) return;
    busy = true;
    const button = event.target.querySelector('[type=submit]'), label = button.textContent;
    const switchButton = document.getElementById('switch'); if (switchButton) switchButton.disabled = true;
    form.setAttribute('aria-busy', 'true');
    button.disabled = true; button.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span><span>Memproses…</span>';
    try { await work(new FormData(event.target)); } catch (error) { showApiError(error, form); }
    finally { busy = false; form.removeAttribute('aria-busy'); button.disabled = false; button.textContent = label; if (switchButton) switchButton.disabled = false; }
  };
}
function login(register = false, focus = false) {
  dashboardNavigation(false);
  document.querySelector('.steps').hidden = false;
  registerMode = register;
  setTitle(register ? 'Daftar akun' : 'Masuk ke akun');
  document.getElementById('intro-title').textContent = register ? 'Siapkan akun untuk kuis Anda.' : 'Kuis seru dimulai dari Anda.';
  document.getElementById('intro-copy').textContent = register ? 'Daftar sebagai pengelola kuis. Setelah disetujui, Anda bisa menyiapkan soal dan memandu sesi.' : 'Masuk untuk menyiapkan soal dan memandu sesi kuis bersama peserta.';
  copy.textContent = register ? 'Akun dapat digunakan setelah disetujui super admin.' : 'Gunakan akun Nizhoot Anda.';
  content.innerHTML = `<form>${register ? '<label for="name">Nama lengkap</label><input id="name" name="name" autocomplete="name" minlength="2" maxlength="80" required>' : ''}<label for="username">Username</label><input id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="32" required${register ? ' aria-describedby="username-help"' : ''}>${register ? '<small id="username-help" class="field-hint">3–32 karakter: huruf, angka, titik (.), garis bawah (_), atau tanda hubung (-).</small>' : ''}${passwordField('password', 'Password', register ? 'new-password' : 'current-password')}${register ? '<small id="password-help" class="field-hint">Huruf besar, huruf kecil, angka, dan simbol.</small>' + passwordField('confirm', 'Ulangi password') : ''}<button class="primary submit" type="submit">${register ? 'Kirim pendaftaran' : 'Masuk'}</button></form><button type="button" id="switch">${register ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar'}</button>`;
  const draft = drafts[register ? 'register' : 'login'];
  for (const key of ['name', 'username']) { const input = document.getElementById(key); if (input) input.value = draft[key] || ''; }
  if (register) wireStrengthAndMatch();
  document.getElementById('switch').onclick = () => {
    for (const key of ['name', 'username']) { const input = document.getElementById(key); if (input) draft[key] = input.value; }
    notice(''); login(!register, true);
  };
  wireForm(async form => {
    const result = await accountApi(`/api/auth/${register ? 'register' : 'login'}`, Object.fromEntries(form));
    drafts.login = {}; drafts.register = {};
    account = result.user; renderAccount(true);
  }, register ? {
    name: value => value.trim().length >= 2 ? '' : 'Isi nama lengkap minimal 2 karakter.',
    username: usernameRule, password: passwordRule,
    confirm: value => value && value === document.getElementById('password').value ? '' : 'Ulangan password belum sama. Ketik kembali password Anda.'
  } : { username: value => value.trim() ? '' : 'Isi username Anda.', password: value => value ? '' : 'Isi password Anda.' });
  renderSupport();
  if (focus) focusHeading();
}

async function logout() { try { await accountApi('/api/auth/logout', {}); account = null; notice(''); login(false, true); } catch (error) { notice(error.message, true); } }
function renderAccount(focus = false) {
  notice('');
  document.querySelector('.steps').hidden = Boolean(account);
  dashboardNavigation(account?.status === 'active' && !account.mustChangePassword);
  if (!account) return login();
  if (account.status !== 'active') {
    const text = { pending: ['Pendaftaran sedang ditinjau', 'Akun Anda sudah tercatat. Super admin perlu menyetujui pendaftaran sebelum Anda dapat mengelola kuis.'], rejected: ['Pendaftaran belum disetujui', 'Hubungi super admin untuk informasi lebih lanjut.'], disabled: ['Akun dinonaktifkan', 'Hubungi super admin jika Anda perlu mengaktifkan akun kembali.'] }[account.status];
    setTitle(text[0]); copy.textContent = text[1];
    document.getElementById('intro-title').textContent = 'Informasi akun Anda.';
    document.getElementById('intro-copy').textContent = 'Periksa status akun atau hubungi pengelola jika membutuhkan bantuan.';
    content.innerHTML = '<p id="identity"></p><button class="primary submit" id="refresh">Periksa status</button><button id="logout">Keluar</button>';
    document.getElementById('identity').textContent = `${account.name} · @${account.username}`;
    document.getElementById('refresh').onclick = async event => {
      const button = event.currentTarget; button.disabled = true; button.textContent = 'Memeriksa…';
      try {
        const result = await accountApi('/api/auth/me');
        if (result.user?.status === account.status) notice(account.status === 'pending' ? 'Masih menunggu persetujuan super admin.' : 'Status akun belum berubah. Hubungi pengelola untuk bantuan.');
        else { account = result.user; renderAccount(true); }
      } catch (error) { notice('Status belum dapat diperiksa. Coba lagi sebentar.', true); }
      finally { button.disabled = false; button.textContent = 'Periksa status'; }
    };
    document.getElementById('logout').onclick = logout; renderSupport(); if (focus) focusHeading(); return;
  }
  const view = new URLSearchParams(location.search).get('view');
  if (view === 'password' && !account.mustChangePassword) { settingsForm('security'); return; }
  if (account.mustChangePassword) {
    setTitle(account.mustChangePassword ? 'Buat password baru' : 'Ganti password');
    document.getElementById('intro-title').textContent = account.mustChangePassword ? 'Amankan akun Anda.' : 'Keamanan akun Anda.';
    document.getElementById('intro-copy').textContent = account.mustChangePassword ? 'Ganti password sementara dengan password pribadi sebelum mulai mengelola kuis.' : 'Perbarui password untuk akun yang sedang Anda gunakan. Setelah disimpan, sesi login Anda di perangkat lain akan keluar.';
    copy.textContent = account.mustChangePassword ? 'Ganti password sementara sebelum melanjutkan ke bank soal.' : 'Password baru akan mengeluarkan sesi lain dari akun Anda.';
    content.innerHTML = `<form>${passwordField('currentPassword', 'Password saat ini', 'current-password')}${passwordField('password', 'Password baru')}<small id="password-help" class="field-hint">Huruf besar, huruf kecil, angka, dan simbol.</small>${passwordField('confirm', 'Ulangi password baru')}<div class="pw-actions"><button type="button" class="pw-cancel" id="pw-cancel-btn">Batal</button><button class="primary submit" type="submit">Simpan password</button></div></form>`;
    document.getElementById('pw-cancel-btn').onclick = logout;
    const identity = document.createElement('section'); identity.className = 'password-identity'; identity.setAttribute('aria-label', 'Akun yang akan diubah');
    const avatar = document.createElement('span'); avatar.className = 'password-avatar'; avatar.setAttribute('aria-hidden', 'true'); avatar.textContent = account.name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase();
    const details = document.createElement('div');
    const label = document.createElement('small'); label.textContent = 'Mengubah password untuk';
    const name = document.createElement('strong'); name.textContent = account.name;
    const username = document.createElement('span'); username.textContent = `@${account.username}`;
    details.append(label, name, username); identity.append(avatar, details); content.prepend(identity);
    wireStrengthAndMatch();
    wireForm(async form => {
      await accountApi('/api/auth/password', Object.fromEntries(form));
      showToast('Password baru berhasil disimpan! Mengalihkan ke bank soal…', 'success', 2000);
      await new Promise(resolve => setTimeout(resolve, 1200));
      location.assign('/admin');
    }, {
      currentPassword: value => value ? '' : 'Isi password saat ini.', password: passwordRule,
      confirm: value => value && value === document.getElementById('password').value ? '' : 'Ulangan password belum sama. Ketik kembali password baru Anda.'
    });
    renderSupport(); if (focus) focusHeading();
    return;

  }
  if (view === 'access') { accessForm(); return; }
  if (view === 'settings') { settingsForm(); return; }
  location.assign('/admin');
}
function settingsForm(section = 'profile') {
  setTitle('Pengaturan akun'); copy.textContent = 'Kelola profil dan informasi login Anda.';
  document.getElementById('intro-title').textContent = 'Akun Anda.';
  document.getElementById('intro-copy').textContent = 'Perubahan profil tidak mengubah akses atau kepemilikan kuis Anda.';
  content.innerHTML = '<nav class="settings-tabs" aria-label="Bagian pengaturan"><button type="button" id="profile-tab">Profil</button><button type="button" id="username-tab">Username</button><button type="button" id="security-tab">Keamanan</button></nav><div id="settings-fields"></div>';
  for (const key of ['profile', 'username', 'security']) { const button = document.getElementById(`${key}-tab`); button.setAttribute('aria-current', key === section ? 'page' : 'false'); button.onclick = () => { if (content.querySelector('[aria-busy="true"]')) return; notice(''); settingsForm(key); document.getElementById(`${key}-tab`).focus(); }; }
  const fields = document.getElementById('settings-fields');
  if (section === 'profile') {
    fields.innerHTML = '<form><h3>Profil</h3><div class="profile-editor"><div id="photo-preview" class="settings-avatar"></div><div><label for="photo">Foto profil</label><input id="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="photo-help"><small id="photo-help">JPG, PNG, atau WebP. Maksimal 2 MB.</small><button type="button" id="remove-photo">Hapus foto</button></div></div><label for="name">Nama lengkap</label><input id="name" name="name" autocomplete="name" maxlength="80" required><button type="submit" class="primary submit">Simpan profil</button></form>';
    let photo = account.photo || '', processing = false;
    const preview = () => { const node = document.getElementById('photo-preview'); node.replaceChildren(); if (photo) { const img = document.createElement('img'); img.src = photo; img.alt = 'Foto profil Anda'; node.append(img); } else node.textContent = account.name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase(); document.getElementById('remove-photo').disabled = !photo; };
    preview(); document.getElementById('name').value = account.name;
    document.getElementById('remove-photo').onclick = () => { photo = ''; document.getElementById('photo').value = ''; preview(); };
    document.getElementById('photo').onchange = async event => {
      const file = event.target.files[0]; if (!file) return;
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { notice('Pilih foto JPG, PNG, atau WebP maksimal 2 MB.', true); event.target.value = ''; return; }
      processing = true; const save = fields.querySelector('[type=submit]'); save.disabled = true;
      try { const bitmap = await createImageBitmap(file); const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128; const size = Math.min(bitmap.width, bitmap.height); canvas.getContext('2d').drawImage(bitmap, (bitmap.width-size)/2, (bitmap.height-size)/2, size, size, 0, 0, 128, 128); bitmap.close(); photo = canvas.toDataURL('image/webp', .8); if (photo.length > 40000) throw Error(); preview(); notice('Foto siap. Pilih Simpan profil untuk menyimpan perubahan.'); }
      catch { notice('Foto tidak dapat dibaca. Pilih foto lain.', true); }
      finally { processing = false; save.disabled = false; }
    };
    wireForm(async form => {
      if (processing) return;
      const result = await accountApi('/api/auth/profile', { name: form.get('name'), photo });
      account = result.user;
      preview();
      showToast('Profil berhasil disimpan.', 'success', 2500);
    }, { name: value => value.trim().length >= 2 ? '' : 'Isi nama lengkap minimal 2 karakter.' });
  } else if (section === 'security') {
    fields.innerHTML = `<form><h3>Ganti password</h3><p id="security-account" class="muted"></p><div class="security-banner"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span>Setelah disimpan, sesi di perangkat lain akan keluar. Anda tetap masuk di perangkat ini.</span></div>${passwordField('currentPassword', 'Password saat ini', 'current-password')}${passwordField('password', 'Password baru')}<small id="password-help" class="field-hint">Huruf besar, huruf kecil, angka, dan simbol.</small>${passwordField('confirm', 'Ulangi password baru')}<div class="pw-actions"><button type="button" class="pw-cancel" id="pw-cancel-btn">Batal</button><button type="submit" class="primary submit">Simpan password</button></div></form>`;
    document.getElementById('security-account').textContent = `Untuk ${account.name} · @${account.username}`;
    document.getElementById('pw-cancel-btn').onclick = () => { notice(''); settingsForm('profile'); document.getElementById('profile-tab')?.focus(); };
    wireStrengthAndMatch();
    wireForm(async form => {
      const result = await accountApi('/api/auth/password', Object.fromEntries(form));
      account = result.user;
      fields.querySelector('form').reset();
      resetStrengthAndMatch();
      showToast('Password berhasil diperbarui! Sesi di perangkat lain telah keluar.', 'success', 3500);
    }, {
      currentPassword: value => value ? '' : 'Isi password saat ini.', password: passwordRule,
      confirm: value => value && value === document.getElementById('password').value ? '' : 'Ulangan password belum sama. Ketik kembali password baru Anda.'
    });

  } else {
    fields.innerHTML = `<form><h3>Username</h3><p class="muted">Gunakan username baru saat login berikutnya. Sesi di perangkat lain akan keluar setelah perubahan disimpan.</p><label for="username">Username</label><input id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="32" aria-describedby="username-help" required><small id="username-help">3–32 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.</small>${passwordField('currentPassword', 'Password saat ini', 'current-password')}<button type="submit" class="primary submit">Simpan username</button></form>`;
    document.getElementById('username').value = account.username;
    wireForm(async form => {
      const result = await accountApi('/api/auth/username', Object.fromEntries(form));
      account = result.user;
      document.getElementById('currentPassword').value = '';
      document.getElementById('username').value = account.username;
      showToast(`Username berhasil diubah menjadi @${account.username}.`, 'success', 3000);
    }, { username: usernameRule, currentPassword: value => value ? '' : 'Isi password saat ini untuk mengonfirmasi perubahan.' });
  }
  renderSupport();
}
async function accessForm() {
  setTitle('Kelola kolaborator'); copy.textContent = 'Bagikan akses mengedit dan menjalankan kuis kepada akun aktif.';
  content.innerHTML = '<form><label for="quizSet">Kuis milik Anda</label><select id="quizSet" name="quizSet" required></select><p id="collaborators" class="muted"></p><label for="collaborator">Username kolaborator</label><input id="collaborator" name="username" required maxlength="32" autocomplete="off"><label for="action">Tindakan</label><select id="action" name="action"><option value="add">Tambah akses</option><option value="remove">Cabut akses</option></select><button class="primary submit" type="submit">Simpan akses</button></form>';

  try {
    const { sets } = await accountApi('/api/access');
    const select = document.getElementById('quizSet');
    for (const set of sets) { const option = document.createElement('option'); option.value = set.name; option.textContent = set.name; select.append(option); }
    const update = () => { document.getElementById('collaborators').textContent = `Kolaborator: ${sets.find(s => s.name === select.value)?.collaborators.join(', ') || 'belum ada'}`; };
    select.onchange = update; update();
    if (!sets.length) { notice('Simpan soal pertama pada kuis baru untuk mulai menambahkan kolaborator.'); content.querySelector('[type=submit]').disabled = true; }
    wireForm(async form => { await accountApi('/api/access', { quizSet: form.get('quizSet'), username: form.get('username'), remove: form.get('action') === 'remove' }); await accessForm(); showToast('Akses kolaborator berhasil diperbarui.', 'success', 2500); document.getElementById('collaborator').focus(); }, { collaborator: usernameRule });
  } catch (error) { notice(error.message, true); }
}
let supportContact = null, supportState = 'loading';
function renderSupport() {
  const region = document.getElementById('support-help');
  region.replaceChildren();

  const text = document.createElement('p');
  text.className = 'muted';
  text.textContent = !account && !registerMode
    ? 'Lupa password? Minta password sementara kepada pengelola.'
    : 'Butuh bantuan pendaftaran atau akses akun?';
  region.append(text);

  if (supportState === 'loading') {
    const status = document.createElement('small');
    status.className = 'support-loading';
    status.textContent = 'Memuat kontak bantuan…';
    region.append(status);
  } else if (supportContact) {
    const link = document.createElement('a');
    link.className = 'support-contact-link';
    link.href = supportContact.url;
    // Icon: envelope for email/chat-type URLs, phone for tel:
    const isPhone = supportContact.url.startsWith('tel:') || supportContact.url.includes('wa.me') || supportContact.url.includes('whatsapp');
    const icon = isPhone
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.49 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.4 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21 16z"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;
    link.innerHTML = `<span class="si" aria-hidden="true">${icon}</span><span>Hubungi ${supportContact.label}</span>`;
    if (supportContact.url.startsWith('https:')) {
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `Hubungi ${supportContact.label} (buka tab baru)`);
    }
    region.append(link);
  } else {
    const hint = document.createElement('small');
    hint.className = 'support-hint';
    hint.textContent = supportState === 'error'
      ? 'Kontak bantuan belum dapat dimuat.'
      : 'Kontak belum diatur. Hubungi fasilitator atau pengelola Nizhoot di kantor Anda.';
    region.append(hint);
    if (supportState === 'error') {
      const retry = document.createElement('button');
      retry.className = 'support-retry';
      retry.type = 'button';
      retry.textContent = 'Coba muat ulang';
      retry.onclick = loadSupport;
      region.append(retry);
    }
  }
}

async function loadSupport() {
  supportState = 'loading'; renderSupport();
  try { const result = await accountApi('/api/support-contact'); supportContact = result.contact; supportState = 'ready'; }
  catch { supportState = 'error'; }
  renderSupport();
}
async function load() { try { const result = await accountApi('/api/auth/me'); account = result.user; renderAccount(); } catch (error) { login(); notice(error.message, true); } }
loadSupport();
load();


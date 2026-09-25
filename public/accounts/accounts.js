let users = [], selected, actionBusy = false;
const list = document.getElementById('users'), message = document.getElementById('message'), dialog = document.getElementById('confirm-dialog');
const labels = { pending: 'Menunggu persetujuan', active: 'Aktif', rejected: 'Ditolak', disabled: 'Dinonaktifkan' };
const actions = { approve: 'Setujui', reject: 'Tolak', disable: 'Nonaktifkan', enable: 'Aktifkan kembali', reset: 'Reset password' };
function render() {
  list.replaceChildren();
  const filter = document.getElementById('filter').value, search = document.getElementById('search').value.toLowerCase().trim();
  const matches = users.filter(u => (filter === 'all' || u.status === filter) && `${u.name} ${u.username}`.toLowerCase().includes(search));
  if (!matches.length) { list.textContent = search ? 'Tidak ada pengguna yang cocok. Coba nama atau username lain.' : filter === 'pending' ? 'Tidak ada pendaftaran yang menunggu persetujuan.' : 'Belum ada akun dengan status ini.'; return; }
  for (const user of matches) {
    const row = document.createElement('article'); row.className = 'user-row';
    const identity = document.createElement('div'), name = document.createElement('h2'), detail = document.createElement('p');
    name.textContent = user.name; detail.className = 'muted'; detail.textContent = `@${user.username} · ${new Date(user.createdAt).toLocaleDateString('id-ID')}`;
    identity.append(name, detail);
    const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = user.role === 'super_admin' ? 'Super admin' : labels[user.status];
    const buttons = document.createElement('div'); buttons.className = 'actions';
    const available = user.role === 'super_admin' ? [] : { pending: ['approve', 'reject'], active: ['reset', 'disable'], disabled: ['enable'], rejected: [] }[user.status];
    for (const action of available) {
      const button = document.createElement('button'); button.textContent = actions[action];
      button.className = ['reject', 'disable'].includes(action) ? 'danger' : action === 'approve' ? 'primary' : '';
      button.setAttribute('aria-label', `${actions[action]} ${user.name}`);
      button.onclick = () => openAction(user, action); buttons.append(button);
    }
    row.append(identity, badge, buttons); list.append(row);
  }
}
async function load() {
  const button = document.getElementById('refresh'); button.disabled = true;
  const loadError = document.getElementById('load-error');
  try { const data = await accountApi('/api/accounts'); users = data.users; render(); loadError.hidden = true; loadError.textContent = ''; }
  catch (error) { loadError.hidden = false; loadError.textContent = error.message; list.textContent = 'Daftar belum dapat dimuat. Gunakan Muat ulang untuk mencoba lagi.'; }
  finally { button.disabled = false; }
}
function openAction(user, action) {
  if (actionBusy) return;
  selected = { user, action };
  document.getElementById('dialog-title').textContent = `${actions[action]} ${user.name}?`;
  document.getElementById('dialog-copy').textContent = { approve: 'Pengguna dapat mengelola kuis sendiri dan menjadi host setelah disetujui.', reject: 'Pengguna tidak akan mendapatkan akses mengelola kuis.', disable: 'Akses akun dan sesi login pengguna akan dicabut.', enable: 'Pengguna dapat masuk dan mengelola kuis kembali.', reset: 'Sesi login pengguna akan dicabut. Tentukan password sementara yang baru.' }[action];
  document.getElementById('reset-fields').hidden = action !== 'reset';
  const input = document.getElementById('temporary'); input.value = ''; input.required = action === 'reset'; input.disabled = action !== 'reset'; input.type = 'password';
  syncPasswordToggle(document.getElementById('show-temporary'));
  document.getElementById('dialog-error').textContent = ''; document.getElementById('confirm').textContent = actions[action]; dialog.showModal();
}
document.getElementById('cancel').onclick = () => { if (!actionBusy) dialog.close(); };
dialog.addEventListener('cancel', event => { if (actionBusy) event.preventDefault(); });
dialog.addEventListener('close', () => { document.getElementById('temporary').value = ''; });
document.getElementById('action-form').onsubmit = async event => {
  event.preventDefault();
  if (actionBusy || !selected) return;
  if (selected.action === 'reset' && !NizhootPasswordPolicy.isValid(document.getElementById('temporary').value)) { document.getElementById('dialog-error').textContent = NizhootPasswordPolicy.message; document.getElementById('temporary').focus(); return; }
  const { user, action } = selected;
  const button = document.getElementById('confirm'), cancel = document.getElementById('cancel'), input = document.getElementById('temporary');
  const password = input.value;
  actionBusy = true; button.disabled = true; cancel.disabled = true; input.disabled = true;
  button.textContent = 'Memproses…'; dialog.setAttribute('aria-busy', 'true');
  document.getElementById('dialog-error').textContent = '';
  try { await accountApi(`/api/accounts/${user.id}/${action}`, { password }); dialog.close(); message.hidden = false; message.textContent = `${actions[action]} berhasil untuk ${user.name}.`; await load(); }
  catch (error) { document.getElementById('dialog-error').textContent = error.message; }
  finally { actionBusy = false; button.disabled = false; cancel.disabled = false; input.disabled = action !== 'reset'; button.textContent = actions[action]; dialog.removeAttribute('aria-busy'); }
};
document.getElementById('filter').onchange = render;
document.getElementById('search').oninput = render;
document.getElementById('refresh').onclick = load;
load();

const supportForm = document.getElementById('support-form');
const supportMessage = document.getElementById('support-message');
const supportSave = document.getElementById('save-support');
const supportReload = document.getElementById('reload-support');
function supportNotice(text, error = false) { supportMessage.textContent = text; supportMessage.hidden = !text; supportMessage.classList.toggle('error', error); }
function validContact(value) {
  if (/^(?:mailto:)?[^\s@:?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/i.test(value)) return true;
  if (/^(?:tel:)?\+[0-9][0-9 ()-]{5,25}$/i.test(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
const validateSupport = bindFormValidation(supportForm, {
  'support-label': value => !value.trim() && document.getElementById('support-url').value.trim() ? 'Isi nama kontak yang akan ditampilkan.' : '',
  'support-url': value => !value.trim() && !document.getElementById('support-label').value.trim() ? '' : validContact(value.trim()) ? '' : 'Isi email, nomor telepon dengan kode negara (+62…), atau tautan https:// yang valid.'
});
async function loadSupportSettings() {
  supportSave.disabled = true; supportReload.disabled = true; supportNotice('Memuat kontak bantuan…');
  try {
    const { contact } = await accountApi('/api/support-contact');
    document.getElementById('support-label').value = contact?.label || '';
    document.getElementById('support-url').value = (contact?.url || '').replace(/^(mailto:|tel:)/, '');
    for (const id of ['support-label', 'support-url']) fieldError(document.getElementById(id), '');
    supportNotice(contact ? '' : 'Kontak belum diatur. Tambahkan kontak agar pengguna bisa meminta bantuan.');
    supportSave.disabled = false;
  } catch { supportNotice('Kontak belum dapat dimuat. Pilih Muat ulang kontak untuk mencoba lagi.', true); }
  finally { supportReload.disabled = false; }
}
supportReload.onclick = loadSupportSettings;
supportForm.onsubmit = async event => {
  event.preventDefault();
  if (supportSave.disabled || !validateSupport()) return;
  supportSave.disabled = true; supportReload.disabled = true; supportSave.textContent = 'Menyimpan…'; supportNotice('');
  const fields = [...supportForm.querySelectorAll('input')];
  const values = Object.fromEntries(new FormData(supportForm));
  fields.forEach(input => { input.disabled = true; });
  try {
    const { contact } = await accountApi('/api/accounts/support-contact', values, 'PUT');
    supportNotice(contact ? 'Kontak bantuan disimpan dan tampil di halaman akun.' : 'Kontak bantuan dihapus.');
  } catch (error) {
    const input = error.field && document.getElementById(error.field);
    if (input) { fieldError(input, error.message); fields.forEach(field => { field.disabled = false; }); input.focus(); }
    else supportNotice('Kontak belum tersimpan. Periksa koneksi lalu coba lagi.', true);
  } finally { fields.forEach(input => { input.disabled = false; }); supportSave.disabled = false; supportReload.disabled = false; supportSave.textContent = 'Simpan kontak'; }
};
loadSupportSettings();

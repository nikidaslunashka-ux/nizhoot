require('dotenv').config();
const crypto = require('crypto');
const { AccountStore } = require('../server/accountStore');
const { hashPassword } = require('../server/auth');
(async () => {
  const username = String(process.env.BOOTSTRAP_ADMIN_USERNAME || '').trim().toLowerCase();
  const name = String(process.env.BOOTSTRAP_ADMIN_NAME || 'Super Admin').trim();
  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) throw new Error('Isi BOOTSTRAP_ADMIN_USERNAME (3–32 karakter).');
  const password_hash = await hashPassword(process.env.BOOTSTRAP_ADMIN_PASSWORD);
  const store = new AccountStore();
  await store.exclusive(async () => {
    const users = await store.all('AccountsV2');
    if (users.some(u => u.role === 'super_admin')) throw new Error('Super admin sudah ada. Bootstrap tidak mengubah akun yang ada.');
    if (users.some(u => u.username === username)) throw new Error('Username sudah dipakai. Pilih username berbeda.');
    await store.save('AccountsV2', { id: crypto.randomUUID(), username, name, password_hash, role: 'super_admin', status: 'active', must_change_password: 'true', created_at: new Date().toISOString(), version: '1' });
  });
  console.log('Super admin berhasil dibuat. Masuk dan ganti password awal. Hapus variabel BOOTSTRAP_ADMIN_PASSWORD setelah selesai.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });

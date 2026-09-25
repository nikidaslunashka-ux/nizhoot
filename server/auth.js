const crypto = require('crypto');
const { promisify } = require('util');
const { AccountStore } = require('./accountStore');
const passwordPolicy = require('../public/shared/password-policy');
const scrypt = promisify(crypto.scrypt);
let hashing = 0;
const hashQueue = [];
async function derive(password, salt) {
  if (hashing >= 2) {
    if (hashQueue.length >= 30) throw fail('Layanan login sedang sibuk. Coba lagi sebentar.', 429);
    await new Promise(resolve => hashQueue.push(resolve));
  } else hashing++;
  try { return await scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }); }
  finally { if (hashQueue.length) hashQueue.shift()(); else hashing--; }
}
const COOKIE = 'nizhoot_session';
const MAX_AGE = 8 * 60 * 60 * 1000;
const fail = (message, status = 400, field) => Object.assign(new Error(message), { status, field });
const normalized = value => String(value || '').trim().toLowerCase();
const publicUser = user => ({ id: user.id, username: user.username, name: user.name, photo: user.photo || '', role: user.role, status: user.status, mustChangePassword: user.must_change_password === 'true', createdAt: user.created_at });
function validateSupportContact(data) {
  const label = String(data.label || '').trim();
  let url = String(data.url || '').trim();
  if (!label && !url) return { label: '', url: '' };
  if (!label || label.length > 80) throw fail('Isi nama kontak maksimal 80 karakter.', 400, 'support-label');
  if (!url || url.length > 2048) throw fail('Isi alamat kontak maksimal 2048 karakter.', 400, 'support-url');
  if (/^[^\s@:?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(url)) url = `mailto:${url}`;
  else if (/^\+[0-9][0-9 ()-]{5,25}$/.test(url)) url = `tel:${url}`;
  let valid = false;
  if (/^mailto:[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/i.test(url)) valid = true;
  else if (/^tel:\+?[0-9][0-9 ()-]{5,25}$/i.test(url)) valid = true;
  else {
    try { const parsed = new URL(url); valid = parsed.protocol === 'https:' && !parsed.username && !parsed.password; } catch {}
  }
  if (!valid) throw fail('Isi email yang valid, nomor telepon dengan kode negara (+62…), atau tautan yang diawali https://.', 400, 'support-url');
  return { label, url };
}
function validatePassword(password) {
  if (!passwordPolicy.isValid(password)) throw fail(passwordPolicy.message, 400, 'password');
}
async function hashPassword(password) {
  validatePassword(password);
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await derive(password, salt);
  return `scrypt$32768$8$3$${salt}$${hash.toString('hex')}`;
}
async function verifyPassword(password, encoded) {
  const [kind, n, r, p, salt, hex] = String(encoded).split('$');
  if (kind !== 'scrypt' || n !== '32768' || r !== '8' || p !== '3' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hex) || typeof password !== 'string' || password.length > 128) return false;
  const hash = await derive(password, salt);
  return crypto.timingSafeEqual(hash, Buffer.from(hex, 'hex'));
}
function createAuth(store = new AccountStore()) {
  const sessions = new Map();
  const attempts = new Map();
  const secure = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
  const cookieOptions = { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: MAX_AGE };
  const cookieToken = req => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const revoke = id => { for (const [key, value] of sessions) if (value.id === id) sessions.delete(key); };
  function issue(req, res, user) {
    sessions.delete(cookieToken(req));
    for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { id: user.id, version: user.version, expires: Date.now() + MAX_AGE });
    res.cookie(COOKIE, token, cookieOptions);
  }
  async function identify(req) {
    const token = cookieToken(req), session = sessions.get(token);
    if (!session || session.expires < Date.now()) { sessions.delete(token); return null; }
    const user = (await store.all('AccountsV2')).find(u => u.id === session.id);
    if (!user || user.version !== session.version) { sessions.delete(token); return null; }
    return user;
  }
  const wrap = work => async (req, res, next) => { try { await work(req, res, next); } catch (error) { res.status(error.status || 503).json({ success: false, error: error.status ? error.message : 'Layanan penyimpanan tidak tersedia. Coba lagi sebentar.', ...(error.status && error.field ? { field: error.field } : {}) }); } };
  const active = wrap(async (req, res, next) => {
    req.user = await identify(req);
    if (!req.user) return res.status(401).json({ success: false, error: 'Silakan masuk kembali.' });
    if (req.user.status !== 'active' || req.user.must_change_password === 'true') return res.status(403).json({ success: false, error: 'Akun belum dapat mengakses fitur ini. Periksa status akun.', accountStatus: true });
    next();
  });
  const superOnly = (req, res, next) => req.user.role === 'super_admin' ? next() : res.status(403).json({ success: false, error: 'Hanya super admin yang dapat melakukan tindakan ini.' });
  function originAllowed(req) {
    const origin = req.headers.origin;
    const expected = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol || (secure ? 'https' : 'http')}://${req.headers.host}`;
    return !origin || origin === expected.replace(/\/$/, '');
  }
  function sameOrigin(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.headers['x-nizhoot-request'] !== '1' || !originAllowed(req)) return res.status(403).json({ success: false, error: 'Permintaan tidak valid. Muat ulang halaman.' });
    next();
  }
  function rateLimit(req, res, next) {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
    const key = req.ip;
    const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    entry.count++; attempts.set(key, entry);
    if (entry.count > 30) { res.set('Retry-After', '900'); return res.status(429).json({ success: false, error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' }); }
    next();
  }
  async function canAccess(user, name, ownerOnly = false) {
    if (user.role === 'super_admin') return true;
    const record = (await store.all('QuizAccessV2')).find(r => normalized(r.quiz_set) === normalized(name));
    return !!record && (record.owner_id === user.id || (!ownerOnly && record.collaborators.split(',').includes(user.id)));
  }
  async function ensureAccess(user, name, existingNames = []) {
    if (typeof name !== 'string' || !name.trim() || name.length > 100 || ['__proto__', 'constructor', 'prototype'].includes(normalized(name))) throw fail('Nama kuis tidak valid (maksimal 100 karakter).');
    await store.exclusive(async () => {
      const existing = (await store.all('QuizAccessV2')).find(r => normalized(r.quiz_set) === normalized(name));
      if (existing) {
        if (!(await canAccess(user, name))) throw fail('Anda tidak memiliki akses ke kuis ini.', 403);
        if (existing.quiz_set !== name) throw fail('Gunakan ejaan nama kuis yang sama seperti di daftar.');
        return;
      }
      if (user.role !== 'super_admin' && existingNames.some(n => normalized(n) === normalized(name))) throw fail('Anda tidak memiliki akses ke kuis ini.', 403);
      await store.save('QuizAccessV2', { quiz_set: name, owner_id: user.id, collaborators: '' });
    });
  }
  function install(app) {
    app.use('/api', sameOrigin);
    app.use('/api/auth', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    app.post('/api/auth/register', rateLimit, wrap(async (req, res) => {
      const username = normalized(req.body.username), name = String(req.body.name || '').trim();
      if (name.length < 2 || name.length > 80) throw fail('Isi nama lengkap sepanjang 2–80 karakter.', 400, 'name');
      if (!/^[a-z0-9_.-]{3,32}$/.test(username)) throw fail('Gunakan username 3–32 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.', 400, 'username');
      const password_hash = await hashPassword(req.body.password);
      await store.exclusive(async () => {
        if ((await store.all('AccountsV2')).some(u => u.username === username)) throw fail('Username sudah digunakan. Pilih username lain.', 409, 'username');
        const user = { id: crypto.randomUUID(), username, name, password_hash, role: 'creator', status: 'pending', must_change_password: 'false', created_at: new Date().toISOString(), version: '1' };
        await store.save('AccountsV2', user);
        issue(req, res, user);
        res.status(201).json({ success: true, user: publicUser(user) });
      });
    }));
    let dummyHash;
    app.post('/api/auth/login', rateLimit, wrap(async (req, res) => {
      const user = (await store.all('AccountsV2')).find(u => u.username === normalized(req.body.username));
      dummyHash ||= await hashPassword('Aa1!' + crypto.randomBytes(24).toString('hex'));
      if (!(await verifyPassword(req.body.password, user?.password_hash || dummyHash)) || !user) throw fail('Username atau password salah.', 401);
      issue(req, res, user); res.json({ success: true, user: publicUser(user) });
    }));
    app.get('/api/auth/me', wrap(async (req, res) => { const user = await identify(req); res.json({ success: true, user: user ? publicUser(user) : null }); }));
    app.post('/api/auth/profile', rateLimit, active, wrap(async (req, res) => {
      const name = String(req.body.name || '').trim(), photo = String(req.body.photo || '');
      if (name.length < 2 || name.length > 80) throw fail('Isi nama lengkap sepanjang 2–80 karakter.', 400, 'name');
      if (photo && (photo.length > 40000 || !/^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/.test(photo))) throw fail('Foto tidak valid. Pilih ulang foto.', 400);
      if (photo) { const bytes = Buffer.from(photo.split(',')[1], 'base64'); if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') throw fail('Format foto tidak valid.'); }
      await store.exclusive(async () => {
        const user = await identify(req); if (!user || user.status !== 'active' || user.must_change_password === 'true') throw fail('Silakan masuk kembali.', 403);
        user.name = name; user.photo = photo; await store.save('AccountsV2', user);
        res.json({ success: true, user: publicUser(user) });
      });
    }));
    app.post('/api/auth/username', rateLimit, active, wrap(async (req, res) => {
      const username = normalized(req.body.username);
      if (!/^[a-z0-9_.-]{3,32}$/.test(username)) throw fail('Gunakan username 3–32 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.', 400, 'username');
      await store.exclusive(async () => {
        const user = await identify(req); if (!user || user.status !== 'active' || user.must_change_password === 'true') throw fail('Silakan masuk kembali.', 403);
        if (!(await verifyPassword(req.body.currentPassword, user.password_hash))) throw fail('Password saat ini salah.', 400, 'currentPassword');
        if ((await store.all('AccountsV2')).some(other => other.id !== user.id && other.username === username)) throw fail('Username sudah digunakan. Pilih username lain.', 409, 'username');
        user.username = username; user.version = String(Number(user.version) + 1);
        await store.save('AccountsV2', user); revoke(user.id); issue(req, res, user);
        res.json({ success: true, user: publicUser(user) });
      });
    }));
    app.post('/api/auth/logout', (req, res) => { sessions.delete(cookieToken(req)); res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined }); res.json({ success: true }); });
    app.post('/api/auth/password', rateLimit, wrap(async (req, res) => {
      const current = await identify(req);
      if (!current || current.status !== 'active') throw fail('Akun aktif diperlukan.', 403);
      await store.exclusive(async () => {
        const user = (await store.all('AccountsV2')).find(u => u.id === current.id);
        if (!(await verifyPassword(req.body.currentPassword, user.password_hash))) throw fail('Password saat ini salah.', 400, 'currentPassword');
        if (req.body.password === req.body.currentPassword) throw fail('Pilih password baru yang berbeda.', 400, 'password');
        user.password_hash = await hashPassword(req.body.password);
        user.must_change_password = 'false'; user.version = String(Number(user.version) + 1);
        await store.save('AccountsV2', user); revoke(user.id); issue(req, res, user);
        res.json({ success: true, user: publicUser(user) });
      });
    }));
    app.use('/api/accounts', active, superOnly, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    app.get('/api/support-contact', wrap(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const record = (await store.all('AppSettingsV2')).find(row => row.key === 'support');
      let contact = null;
      if (record?.label && record?.url) {
        try { contact = validateSupportContact(record); } catch { /* Invalid manual edits must never become links. */ }
      }
      res.json({ success: true, contact });
    }));
    app.put('/api/accounts/support-contact', wrap(async (req, res) => {
      const contact = validateSupportContact(req.body);
      await store.exclusive(async () => {
        const previous = (await store.all('AppSettingsV2')).find(row => row.key === 'support');
        await store.save('AppSettingsV2', { ...previous, key: 'support', ...contact });
      });
      res.json({ success: true, contact: contact.url ? contact : null });
    }));
    app.get('/api/accounts', wrap(async (req, res) => res.json({ success: true, users: (await store.all('AccountsV2')).map(publicUser) })));
    app.post('/api/accounts/:id/:action', wrap(async (req, res) => {
      await store.exclusive(async () => {
        const users = await store.all('AccountsV2'), user = users.find(u => u.id === req.params.id);
        if (!user) throw fail('Akun tidak ditemukan.', 404);
        if (user.role === 'super_admin' || user.id === req.user.id) throw fail('Akun super admin tidak dapat diubah melalui tindakan ini.', 403);
        const transitions = { approve: ['pending', 'active'], reject: ['pending', 'rejected'], disable: ['active', 'disabled'], enable: ['disabled', 'active'] };
        if (req.params.action === 'reset') {
          if (user.status !== 'active') throw fail('Reset hanya tersedia untuk akun aktif.');
          user.password_hash = await hashPassword(req.body.password); user.must_change_password = 'true';
        } else {
          const change = transitions[req.params.action];
          if (!change || user.status !== change[0]) throw fail('Status akun sudah berubah. Muat ulang daftar.', 409);
          user.status = change[1];
        }
        user.reviewed_at = new Date().toISOString(); user.reviewed_by = req.user.id;
        // Approval keeps the pending session usable for the status refresh action.
        if (req.params.action !== 'approve') { user.version = String(Number(user.version) + 1); revoke(user.id); }
        await store.save('AccountsV2', user);
        res.json({ success: true, user: publicUser(user) });
      });
    }));
    app.get('/api/access/users', active, wrap(async (req, res) => {
      const query = normalized(req.query.q);
      const users = (await store.all('AccountsV2')).filter(u => u.status === 'active' && u.id !== req.user.id && (!query || `${u.name} ${u.username}`.toLowerCase().includes(query)));
      res.json({ success: true, users: users.slice(0, 20).map(u => ({ id: u.id, name: u.name, username: u.username })) });
    }));
    app.post('/api/access/sets', active, wrap(async (req, res) => {
      const name = String(req.body.name || '').trim();
      if (!name || name.length > 100 || ['__proto__', 'constructor', 'prototype'].includes(normalized(name))) throw fail('Nama kuis tidak valid (maksimal 100 karakter).');
      await store.exclusive(async () => {
        const records = await store.all('QuizAccessV2');
        const names = authApi.questionNames ? await authApi.questionNames() : [];
        if (records.some(r => normalized(r.quiz_set) === normalized(name)) || names.some(n => normalized(n) === normalized(name))) throw fail('Nama kuis sudah digunakan.', 409);
        const ids = await validateCollaborators(req.body.collaborators, req.user.id);
        await store.save('QuizAccessV2', { quiz_set: name, owner_id: req.user.id, collaborators: ids.join(',') });
        res.status(201).json({ success: true });
      });
    }));
    app.put('/api/access/sets', active, wrap(async (req, res) => {
      const name = String(req.body.name || '').trim();
      await store.exclusive(async () => {
        if (!(await canAccess(req.user, name, true))) throw fail('Hanya pemilik atau super admin yang dapat mengelola kolaborator.', 403);
        let record = (await store.all('QuizAccessV2')).find(r => r.quiz_set === name);
        if (!record) {
          if (!authApi.questionNames || !(await authApi.questionNames()).includes(name)) throw fail('Kuis tidak ditemukan.', 404);
          record = { quiz_set: name, owner_id: req.user.id, collaborators: '' };
        }
        const ids = await validateCollaborators(req.body.collaborators, record.owner_id, record.collaborators.split(','));
        record.collaborators = ids.join(','); await store.save('QuizAccessV2', record);
        res.json({ success: true });
      });
    }));
    app.get('/api/access', active, wrap(async (req, res) => {
      const records = (await store.all('QuizAccessV2')).filter(r => r.quiz_set);
      if (req.user.role === 'super_admin' && authApi.questionNames) {
        for (const name of await authApi.questionNames()) if (!records.some(r => normalized(r.quiz_set) === normalized(name))) records.push({ quiz_set: name, owner_id: req.user.id, collaborators: '' });
      }
      const users = await store.all('AccountsV2');
      res.json({ success: true, sets: records.filter(r => r.owner_id === req.user.id || req.user.role === 'super_admin').map(r => ({ name: r.quiz_set, collaborators: r.collaborators.split(',').filter(Boolean).map(id => users.find(u => u.id === id)?.username).filter(Boolean) })) });
    }));
    app.post('/api/access', active, wrap(async (req, res) => {
      const name = String(req.body.quizSet || '').trim();
      await store.exclusive(async () => {
        if (!(await canAccess(req.user, name, true))) throw fail('Hanya pemilik atau super admin yang dapat mengelola kolaborator.', 403);
        const target = (await store.all('AccountsV2')).find(u => u.username === normalized(req.body.username) && u.status === 'active');
        if (!target) throw fail('Username akun aktif tidak ditemukan.');
        let record = (await store.all('QuizAccessV2')).find(r => normalized(r.quiz_set) === normalized(name));
        if (!record && (!authApi.questionNames || !(await authApi.questionNames()).includes(name))) throw fail('Kuis tidak ditemukan.', 404);
        record ||= { quiz_set: name, owner_id: req.user.id, collaborators: '' };
        const ids = new Set(record.collaborators.split(',').filter(Boolean));
        if (req.body.remove === true) ids.delete(target.id); else ids.add(target.id);
        record.collaborators = [...ids].join(','); await store.save('QuizAccessV2', record);
        res.json({ success: true });
      });
    }));
  }
  async function validateCollaborators(value, ownerId, existing = []) {
    if (!Array.isArray(value) || value.length > 100 || value.some(id => typeof id !== 'string')) throw fail('Pilih maksimal 100 kolaborator.');
    const ids = [...new Set(value)].filter(id => id !== ownerId);
    const users = await store.all('AccountsV2');
    if (ids.some(id => !users.some(u => u.id === id && (u.status === 'active' || existing.includes(id))))) throw fail('Ada akun yang tidak aktif atau tidak ditemukan. Periksa pilihan kolaborator.');
    return ids;
  }
  const authApi = { store, install, active, identify, canAccess, ensureAccess, wrap, sessions, originAllowed };
  return authApi;
}
module.exports = { createAuth, hashPassword, verifyPassword, publicUser };

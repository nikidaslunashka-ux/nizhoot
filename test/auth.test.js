const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../server/auth');
const WebSocket = require('ws');
const loader = require('../server/sheetsLoader');
let questions = [
  { sheetRowIndex: 2, question: 'Kuis lama', quiz_set: 'Legacy', options: { a: 'A', b: 'B' }, correct_answer: 'a', duration_seconds: 20 },
  { sheetRowIndex: 3, question: 'Kuis B', quiz_set: 'Private B', options: { a: 'A', b: 'B' }, correct_answer: 'a', duration_seconds: 20 }
];
let deletes = 0;
loader.loadQuestions = async () => {
  const sets = Object.fromEntries([...new Set(questions.map(q => q.quiz_set))].map(name => [name, questions.filter(q => q.quiz_set === name)]));
  return { sets, setNames: Object.keys(sets), totalCount: questions.length, source: 'test' };
};
loader.loadQuestionsForWrite = loader.loadQuestions;
loader.appendQuestionToSheet = async data => { questions.push({ ...data, sheetRowIndex: questions.length + 2, options: { a: data.option_a, b: data.option_b } }); return {}; };
loader.updateQuestionRow = async (row, data) => { Object.assign(questions.find(q => q.sheetRowIndex === row), data); return {}; };
loader.deleteQuestionRow = async () => { deletes++; };
const { app, server, auth, io } = require('../server/index');
const tables = { AccountsV2: [], QuizAccessV2: [], MediaUploadsV2: [], AppSettingsV2: [] };
auth.store.all = async table => structuredClone(tables[table]);
auth.store.save = async (table, record) => {
  if (record._row) tables[table][record._row - 2] = structuredClone(record);
  else tables[table].push({ ...record, _row: tables[table].length + 2 });
};
let base, adminCookie, aliceCookie, bobCookie, aliceId;
const password = 'Aa1!';
async function request(route, body, cookie, method) {
  const response = await fetch(base + route, { method: method || (body === undefined ? 'GET' : 'POST'), redirect: 'manual', headers: { 'Content-Type': 'application/json', 'X-Nizhoot-Request': '1', ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { response, status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], data: await response.json().catch(() => null) };
}
before(async () => {
  await auth.store.save('AccountsV2', { id: 'admin', username: 'admin', name: 'Administrator', password_hash: await hashPassword(password), role: 'super_admin', status: 'active', must_change_password: 'false', version: '1', created_at: new Date().toISOString() });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { io.close(); await new Promise(resolve => server.close(resolve)); });
test('password hashes are salted and verified', async () => {
  const a = await hashPassword(password), b = await hashPassword(password);
  assert.notEqual(a, b); assert(!a.includes(password)); assert(await verifyPassword(password, a)); assert(!(await verifyPassword('incorrect', a)));
  await assert.rejects(hashPassword('short'));
  for (const invalid of ['aa1!', 'AA1!', 'Aaa!', 'Aa12', 'Aa1 ', 'Aa1!' + 'x'.repeat(125)]) await assert.rejects(hashPassword(invalid));
  const legacyHash = `scrypt$32768$8$3$${'ab'.repeat(16)}$${require('crypto').scryptSync('Legacy password', 'ab'.repeat(16), 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }).toString('hex')}`;
  assert(await verifyPassword('Legacy password', legacyHash), 'Existing passwords remain usable for login');
});
test('Sheets account cache coalesces reads, isolates objects, and invalidates after writes', async () => {
  const { AccountStore } = require('../server/accountStore');
  const store = new AccountStore(); store.ready = Promise.resolve(); store.spreadsheetId = 'fake';
  let reads = 0, rows = [['id', 'demo', 'Demo', 'hash', 'creator', 'pending']];
  store.client = { spreadsheets: { values: {
    get: async () => { reads++; return { data: { values: rows } }; },
    update: async args => { assert.equal(args.valueInputOption, 'RAW'); rows = args.requestBody.values; }
  } } };
  const [a, b] = await Promise.all([store.all('AccountsV2'), store.all('AccountsV2')]);
  assert.equal(reads, 1); a[0].name = 'changed'; assert.equal(b[0].name, 'Demo');
  await store.save('AccountsV2', { ...b[0], status: 'active' });
  assert.equal((await store.all('AccountsV2'))[0].status, 'active'); assert.equal(reads, 2);
});
test('anonymous users cannot read quiz answers or protected pages', async () => {
  assert.equal((await request('/api/quiz-sets')).status, 401);
  assert.equal((await request('/api/upload', {})).status, 401);
  assert.equal((await request('/api/session/reports')).status, 401);
  for (const route of ['/admin', '/admin/index.html', '/host/index.html', '/accounts/']) assert.equal((await request(route)).status, 302);
  assert.equal((await fetch(base + '/player')).status, 200);
});
test('registration always creates pending creator; duplicate usernames and CSRF blocked', async () => {
  const result = await request('/api/auth/register', { username: 'Alice', name: 'Alice Trainer', password, role: 'super_admin', status: 'active' });
  assert.equal(result.status, 201); aliceCookie = result.cookie; aliceId = result.data.user.id;
  assert.equal(result.data.user.status, 'pending'); assert.equal(result.data.user.role, 'creator'); assert(!JSON.stringify(result.data).includes('password_hash'));
  assert.equal((await request('/api/quiz-sets', undefined, aliceCookie)).status, 403);
  assert.equal((await request('/api/auth/register', { username: 'ALICE', name: 'Another', password })).status, 409);
  const csrf = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Origin: 'https://evil.invalid', 'X-Nizhoot-Request': '1' } }); assert.equal(csrf.status, 403);
  assert.equal((await fetch(base + '/api/auth/logout', { method: 'POST' })).status, 403);
});
test('super admin approves; pending session gains active access; regular account cannot approve', async () => {
  const login = await request('/api/auth/login', { username: 'admin', password }); adminCookie = login.cookie;
  assert(login.response.headers.get('set-cookie').includes('HttpOnly')); assert(login.response.headers.get('set-cookie').includes('SameSite=Strict'));
  assert.equal((await request(`/api/accounts/${aliceId}/approve`, {}, adminCookie)).status, 200);
  assert.equal((await request('/api/auth/me', undefined, aliceCookie)).data.user.status, 'active');
  assert.equal((await request('/api/accounts', undefined, aliceCookie)).status, 403);
  assert.equal((await request(`/api/accounts/${aliceId}/approve`, {}, adminCookie)).status, 409);
});
test('support contact is public, persistent, validated, and writable only by super admin', async () => {
  assert.equal((await request('/api/support-contact')).data.contact, null);
  assert.equal((await request('/api/accounts/support-contact', { label: 'Support', url: 'help@example.test' }, undefined, 'PUT')).status, 401);
  assert.equal((await request('/api/accounts/support-contact', { label: 'Support', url: 'help@example.test' }, aliceCookie, 'PUT')).status, 403);
  const saved = await request('/api/accounts/support-contact', { label: 'Tim bantuan', url: 'help@example.test' }, adminCookie, 'PUT');
  assert.equal(saved.status, 200);
  assert.deepEqual((await request('/api/support-contact')).data.contact, { label: 'Tim bantuan', url: 'mailto:help@example.test' });
  for (const url of ['javascript:alert(1)', 'data:text/html,evil', 'https://user:pass@example.test', 'mailto:a@b.test?body=bad']) {
    const invalid = await request('/api/accounts/support-contact', { label: 'Support', url }, adminCookie, 'PUT');
    assert.equal(invalid.status, 400); assert.equal(invalid.data.field, 'support-url');
  }
  assert.equal((await request('/api/support-contact')).data.contact.label, 'Tim bantuan');
  assert.equal((await request('/api/accounts/support-contact', { label: 'Telepon', url: '+628123456789' }, adminCookie, 'PUT')).data.contact.url, 'tel:+628123456789');
  assert.equal((await request('/api/accounts/support-contact', { label: 'Kanal bantuan', url: 'https://example.test/support' }, adminCookie, 'PUT')).status, 200);
  await request('/api/accounts/support-contact', { label: '', url: '' }, adminCookie, 'PUT');
  assert.equal((await request('/api/support-contact')).data.contact, null);
});
test('ownership filters answers and guards row edits/deletes, uploads and reports', async () => {
  assert.deepEqual((await request('/api/quiz-sets', undefined, aliceCookie)).data.setNames, []);
  assert.equal((await request('/api/admin/questions/3', { question: 'hacked', quiz_set: 'Mine' }, aliceCookie, 'PUT')).status, 403);
  assert.equal((await request('/api/admin/questions/3', {}, aliceCookie, 'DELETE')).status, 403); assert.equal(deletes, 0);
  assert.equal((await request('/api/admin/questions', { quiz_set: 'Legacy', question: 'claim' }, aliceCookie)).status, 403);
  assert.equal((await request('/api/admin/questions', { quiz_set: 'Mine', question: 'Q', option_a: 'a', option_b: 'b' }, aliceCookie)).status, 200);
  assert.deepEqual((await request('/api/quiz-sets', undefined, aliceCookie)).data.setNames, ['Mine']);
  assert.equal((await request('/api/session/12345/analytics', undefined, aliceCookie)).status, 403);
});
test('collaborators can edit but cannot share or delete the set; revocation removes access', async () => {
  const bob = await request('/api/auth/register', { username: 'bob', name: 'Bob Trainer', password }); bobCookie = bob.cookie;
  await request(`/api/accounts/${bob.data.user.id}/approve`, {}, adminCookie);
  assert.equal((await request('/api/access', { quizSet: 'Mine', username: 'bob' }, aliceCookie)).status, 200);
  assert.deepEqual((await request('/api/quiz-sets', undefined, bobCookie)).data.setNames, ['Mine']);
  assert.equal((await request('/api/admin/questions/4', { quiz_set: 'Mine', question: 'Edited' }, bobCookie, 'PUT')).status, 200);
  assert.equal((await request('/api/admin/quiz-sets/Mine', {}, bobCookie, 'DELETE')).status, 403);
  assert.equal((await request('/api/access', { quizSet: 'Mine', username: 'admin' }, bobCookie)).status, 403);
  await request('/api/access', { quizSet: 'Mine', username: 'bob', remove: true }, aliceCookie);
  assert.deepEqual((await request('/api/quiz-sets', undefined, bobCookie)).data.setNames, []);
});
test('empty quizzes persist collaborators, expose identities, allow adding questions and revoke access', async () => {
  const bob = tables.AccountsV2.find(u => u.username === 'bob');
  assert.equal((await request('/api/access/users')).status, 401);
  const found = await request('/api/access/users?q=bob', undefined, aliceCookie);
  assert.equal(found.data.users[0].id, bob.id); assert.equal(found.data.users[0].password_hash, undefined);
  assert.equal((await request('/api/access/sets', { name: 'Shared New', collaborators: [bob.id, bob.id] }, aliceCookie)).status, 201);
  assert.equal((await request('/api/access/sets', { name: 'shared new', collaborators: [] }, bobCookie)).status, 409);
  assert.equal((await request('/api/access/sets', { name: 'Invalid', collaborators: ['missing'] }, aliceCookie)).status, 400);
  let set = (await request('/api/quiz-sets', undefined, bobCookie)).data.sets.find(s => s.name === 'Shared New');
  assert.equal(set.count, 0); assert.equal(set.owner.id, aliceId); assert.equal(set.canManage, false); assert.equal(set.collaborators.length, 1);
  assert.equal((await request('/api/access/sets', { name: 'Shared New', collaborators: [] }, bobCookie, 'PUT')).status, 403);
  assert.equal((await request('/api/admin/questions', { quiz_set: 'Shared New', question: 'Added by collaborator', option_a: 'a', option_b: 'b' }, bobCookie)).status, 200);
  set = (await request('/api/quiz-sets', undefined, bobCookie)).data.sets.find(s => s.name === 'Shared New'); assert.equal(set.count, 1);
  assert.equal((await request('/api/access/sets', { name: 'Shared New', collaborators: [] }, aliceCookie, 'PUT')).status, 200);
  assert(!(await request('/api/quiz-sets', undefined, bobCookie)).data.setNames.includes('Shared New'));
  await request('/api/access/sets', { name: 'Empty Delete', collaborators: [] }, aliceCookie);
  assert.equal((await request('/api/admin/quiz-sets/Empty%20Delete', {}, aliceCookie, 'DELETE')).status, 200);
  assert(!(await request('/api/quiz-sets', undefined, aliceCookie)).data.setNames.includes('Empty Delete'));
});

test('route variants cannot bypass row or quiz ownership checks', async () => {
  for (const route of ['/api/admin/questions/2abc', '/api/admin/questions/2.0', '/api/admin/questions/-2']) {
    assert.equal((await request(route, { quiz_set: 'Mine', question: 'attack' }, aliceCookie, 'PUT')).status, 400, route);
  }
  for (const route of ['/api/admin/questions/2/', '/api/admin/Questions/2', '/api/admin/questions/%32', '/API/ADMIN/QUESTIONS/2']) {
    assert.equal((await request(route, { quiz_set: 'Mine', question: 'attack' }, aliceCookie, 'PUT')).status, 403, route);
    assert.equal((await request(route, {}, aliceCookie, 'DELETE')).status, 403, route);
  }
  for (const route of ['/api/admin/Quiz-sets/Legacy', '/api/admin/quiz-sets/Legacy/', '/api/admin/quiz-sets/%4Cegacy']) {
    assert.equal((await request(route, {}, aliceCookie, 'DELETE')).status, 403, route);
  }
  assert.equal(questions[0].question, 'Kuis lama'); assert.equal(deletes, 0);
});
test('multipart upload cannot use another account’s quiz set', async () => {
  const form = new FormData(); form.append('quizSet', 'Legacy'); form.append('mediaFile', new Blob(['fake image'], { type: 'image/png' }), 'test.png');
  const response = await fetch(base + '/api/upload', { method: 'POST', headers: { Cookie: aliceCookie, 'X-Nizhoot-Request': '1' }, body: form });
  assert.equal(response.status, 403);
});
test('host socket checks session, quiz ownership, room ownership, origin and revocation', async () => {
  const clients = [];
  async function connect(cookie, origin) {
    const socket = new WebSocket(base.replace('http:', 'ws:') + '/socket.io/?EIO=4&transport=websocket', { headers: { ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) } });
    clients.push(socket);
    await new Promise((resolve, reject) => {
      socket.once('error', reject);
      socket.on('message', data => {
        const text = data.toString();
        if (text.startsWith('0')) socket.send('40');
        if (text === '2') socket.send('3');
        if (text.startsWith('40')) resolve();
      });
    });
    return socket;
  }
  function event(socket, name, payload, expected) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.off('message', listener); reject(new Error(`Missing ${expected}`)); }, 4000);
      const listener = data => { const text = data.toString(); if (!text.startsWith('42')) return; const [type, result] = JSON.parse(text.slice(2)); if (type === expected) { clearTimeout(timer); socket.off('message', listener); resolve(result); } };
      socket.on('message', listener); socket.send('42' + JSON.stringify([name, payload]));
    });
  }
  try {
    const anonymous = await connect();
    assert.match((await event(anonymous, 'host:create_room', { quizSet: 'Mine' }, 'host:error')).message, /ditolak/);
    const alice = await connect(aliceCookie);
    assert.match((await event(alice, 'host:create_room', { quizSet: 'Legacy' }, 'host:error')).message, /akses/);
    const room = await event(alice, 'host:create_room', { quizSet: 'Mine' }, 'host:room_created');
    assert(room.pin);
    const status = await event(alice, 'host:toggle_autoplay', { pin: room.pin, enabled: true }, 'host:autoplay_status'); assert.equal(status.autoplay, true);
    const bob = await connect(bobCookie);
    await event(bob, 'host:toggle_autoplay', { pin: room.pin, enabled: false }, 'host:error');
    assert.equal(require('../server/gameState').getRoom(room.pin).autoplay, true);
    assert.equal((await request(`/api/session/${room.pin}/analytics`, undefined, bobCookie)).status, 403);
    assert.equal((await request(`/api/session/${room.pin}/analytics`, undefined, aliceCookie)).status, 200);
    const foreign = await connect(aliceCookie, 'https://other.invalid');
    await event(foreign, 'host:create_room', { quizSet: 'Mine' }, 'host:error');
    const login = await request('/api/auth/login', { username: 'alice', password });
    const loggedOut = await connect(login.cookie); await request('/api/auth/logout', {}, login.cookie);
    await event(loggedOut, 'host:create_room', { quizSet: 'Mine' }, 'host:error');
    require('../server/gameState').deleteRoom(room.pin);
  } finally { for (const client of clients) client.close(); }
});
test('reset revokes sessions and forces password change before quiz access', async () => {
  const temporary = 'Bb2@';
  assert.equal((await request(`/api/accounts/${aliceId}/reset`, { password: temporary }, adminCookie)).status, 200);
  assert.equal((await request('/api/quiz-sets', undefined, aliceCookie)).status, 401);
  assert.equal((await request('/api/auth/login', { username: 'alice', password })).status, 401);
  const login = await request('/api/auth/login', { username: 'alice', password: temporary }); aliceCookie = login.cookie;
  assert.equal(login.data.user.mustChangePassword, true);
  assert.equal((await request('/api/quiz-sets', undefined, aliceCookie)).status, 403);
  assert.equal((await request('/api/auth/password', { currentPassword: 'wrong', password }, aliceCookie)).status, 400);
  const changed = await request('/api/auth/password', { currentPassword: temporary, password }, aliceCookie); assert.equal(changed.status, 200); aliceCookie = changed.cookie;
  assert.equal((await request('/api/quiz-sets', undefined, aliceCookie)).status, 200);
});
test('disable revokes access; last super admin cannot be disabled; logout invalidates cookie', async () => {
  assert.equal((await request('/api/accounts/admin/disable', {}, adminCookie)).status, 403);
  await request(`/api/accounts/${aliceId}/disable`, {}, adminCookie);
  assert.equal((await request('/api/quiz-sets', undefined, aliceCookie)).status, 401);
  const disabled = await request('/api/auth/login', { username: 'alice', password });
  assert.equal(disabled.data.user.status, 'disabled'); assert.equal((await request('/api/quiz-sets', undefined, disabled.cookie)).status, 403);
  await request('/api/auth/logout', {}, bobCookie);
  assert.equal((await request('/api/quiz-sets', undefined, bobCookie)).status, 401);
});
test('storage outage fails closed and never sends internal error or credentials', async () => {
  const original = auth.store.all;
  auth.store.all = async () => { throw new Error('sensitive credential detail'); };
  const result = await request('/api/quiz-sets', undefined, adminCookie);
  assert.equal(result.status, 503); assert(!JSON.stringify(result.data).includes('sensitive'));
  auth.store.all = original;
});
test('account settings protect identity, unique usernames, sessions and ownership', async () => {
  await auth.store.save('AccountsV2', { id: 'settings', username: 'settings.old', name: 'Settings User', password_hash: await hashPassword(password), role: 'creator', status: 'active', version: '1', must_change_password: 'false' });
  const first = await request('/api/auth/login', { username: 'settings.old', password });
  const second = await request('/api/auth/login', { username: 'settings.old', password });
  assert.equal((await request('/api/auth/profile', { name: 'Changed' })).status, 401);
  assert.equal((await request('/api/auth/profile', { name: 'Changed', photo: 'data:image/svg+xml;base64,abc' }, first.cookie)).status, 400);
  const profile = await request('/api/auth/profile', { name: 'Changed', photo: '', role: 'super_admin', id: 'admin' }, first.cookie);
  assert.equal(profile.data.user.name, 'Changed'); assert.equal(profile.data.user.role, 'creator'); assert.equal(profile.data.user.id, 'settings');
  assert.equal((await request('/api/auth/username', { username: 'settings.new', currentPassword: 'wrong' }, first.cookie)).status, 400);
  assert.equal((await request('/api/auth/username', { username: 'admin', currentPassword: password }, first.cookie)).status, 409);
  const changed = await request('/api/auth/username', { username: 'Settings.New', currentPassword: password }, first.cookie);
  assert.equal(changed.status, 200); assert.equal(changed.data.user.username, 'settings.new'); assert.equal(changed.data.user.id, 'settings');
  assert.equal((await request('/api/auth/me', undefined, second.cookie)).data.user, null);
  assert.equal((await request('/api/auth/login', { username: 'settings.old', password })).status, 401);
  assert.equal((await request('/api/auth/login', { username: 'settings.new', password })).status, 200);
});

test('repeated login attempts are rate-limited', async () => {
  let result;
  for (let i = 0; i < 32; i++) { result = await request('/api/auth/login', { username: 'nobody', password: 'incorrect' }); if (result.status === 429) break; }
  assert.equal(result.status, 429);
});

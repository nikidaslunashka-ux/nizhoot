const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { server, io } = require('../server/index');
const game = require('../server/gameState');
(async () => {
  const room = game.createRoom('77777', 'Reaction test', [], 'test-host');
  game.createRoom('88888', 'Other room', [], 'other-host');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const pages = [];
    for (const [name, pin] of [['Satu', '77777'], ['Dua', '77777'], ['Lain', '88888']]) {
      const p = await browser.newPage({ viewport: { width: 390, height: 844 } }); pages.push(p);
      await p.goto(base + '/player'); await p.locator('#inputPin').fill(pin); await p.locator('#inputNickname').fill(name); await p.locator('#btnSubmitJoin').click();
      await p.getByRole('button', { name: 'Kirim reaksi Jempol', exact: true }).waitFor();
    }
    const [a,b,c] = pages;
    const host = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await host.route('**/host/**', route => {
      const name = new URL(route.request().url()).pathname.split('/').pop() || 'index.html';
      if (!['index.html','host.js','host.css'].includes(name)) return route.continue();
      route.fulfill({ contentType: name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html', body: require('fs').readFileSync(`public/host/${name}`) });
    });
    await host.route('**/api/quiz-sets', r => r.fulfill({ json: { success:true, sets:[], setNames:[] } }));
    await host.goto(base + '/host/');
    const hostId = await host.evaluate(() => new Promise(resolve => { currentPin = '77777'; switchView('lobby'); if (socket.connected) resolve(socket.id); else socket.once('connect', () => resolve(socket.id)); }));
    io.sockets.sockets.get(hostId).join('room_77777');
    await a.getByRole('button', { name: 'Kirim reaksi Jempol', exact: true }).click();
    await host.locator('.lobby-reaction-float').waitFor();
    await b.locator('.lobby-reaction-float').waitFor();
    assert.equal(await c.locator('.lobby-reaction-float').count(), 0);
    assert.equal(await a.getByRole('button', { name: 'Kirim reaksi Jempol', exact: true }).isDisabled(), true);
    const send = (p, pin, emoji) => p.evaluate(({pin,emoji}) => new Promise(resolve => socket.emit('player:reaction', {pin,emoji}, resolve)), {pin,emoji});
    assert.equal((await send(a,'77777','🔥')).success, false);
    assert.equal((await send(c,'77777','🔥')).success, false);
    assert.equal((await send(b,'77777','<script>')).success, false);
    await a.screenshot({ path: '.impeccable/review/lobby-reactions-mobile.png', fullPage: true });
    await b.emulateMedia({ reducedMotion: 'reduce' });
    await b.getByRole('button', { name: 'Kirim reaksi Rayakan', exact: true }).click();
    assert.equal(await b.locator('.lobby-reaction-float').last().evaluate(e => getComputedStyle(e).animationName), 'none');
    room.state = 'QUESTION';
    assert.equal((await send(b,'77777','❤️')).success, false);
    await a.evaluate(() => showScreen('gamepad'));
    await a.locator('.lobby-reaction-float').waitFor({ state: 'detached' });
    assert.equal(await a.getByRole('button', { name: 'Kirim reaksi Jempol', exact: true }).isVisible(), false);
    console.log('PASS: room delivery/isolation, membership, allowlist, cooldown, lobby-only, cleanup and reduced motion.');
  } finally { await browser.close(); game.deleteRoom('77777'); game.deleteRoom('88888'); io.close(); server.close(); }
})().catch(e => { console.error(e); io.close(); server.close(); process.exitCode = 1; });

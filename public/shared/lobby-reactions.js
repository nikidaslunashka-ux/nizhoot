window.setupLobbyReactions = (socket, lobby, getPin, isPlayer) => {
  const emojis = [['👍', 'Jempol'], ['😂', 'Tertawa'], ['🎉', 'Rayakan'], ['🔥', 'Semangat'], ['😮', 'Takjub'], ['❤️', 'Suka']];
  const layer = document.createElement('div'); layer.className = 'lobby-reaction-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.append(layer);
  let buttons = [], status, cooldown = 0, timer;
  const active = () => lobby.classList.contains('active');
  const update = () => { buttons.forEach(button => button.disabled = !socket.connected || Date.now() < cooldown || !active()); };
  if (isPlayer) {
    const panel = document.createElement('section'); panel.className = 'lobby-reactions'; panel.setAttribute('aria-label', 'Reaksi ruang tunggu');
    const title = document.createElement('p'); title.textContent = 'Sambil menunggu, kirim reaksi!'; panel.append(title);
    const row = document.createElement('div'); row.className = 'lobby-reaction-buttons'; panel.append(row);
    status = document.createElement('p'); status.className = 'lobby-reaction-status'; status.setAttribute('role', 'status'); status.textContent = 'Reaksi terlihat oleh peserta dan host.';
    for (const [emoji, label] of emojis) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = emoji; button.setAttribute('aria-label', `Kirim reaksi ${label}`); row.append(button); buttons.push(button);
      button.onclick = () => {
        if (!active() || !socket.connected || Date.now() < cooldown) return;
        cooldown = Date.now() + 2000; update(); status.textContent = 'Mengirim reaksi…';
        clearTimeout(timer); timer = setTimeout(update, 2050);
        socket.timeout(3500).emit('player:reaction', { pin: getPin(), emoji }, (error, result) => {
          if (!active()) return;
          status.textContent = error ? 'Reaksi belum terkirim. Coba lagi.' : result?.success ? 'Terkirim! Tunggu 2 detik untuk reaksi berikutnya.' : result?.message || 'Reaksi belum terkirim.';
          if (result?.retryAfter) { cooldown = Date.now() + result.retryAfter; clearTimeout(timer); timer = setTimeout(update, result.retryAfter + 50); }
          update();
        });
      };
    }
    panel.append(status); (lobby.querySelector('.lobby-waiting-card') || lobby).append(panel);
  }
  socket.on('room:reaction', data => {
    if (!active() || data?.pin !== getPin() || !emojis.some(([emoji]) => emoji === data.emoji)) return;
    if (layer.childElementCount >= 18) layer.firstElementChild.remove();
    const item = document.createElement('span'); item.className = 'lobby-reaction-float'; item.textContent = data.emoji; item.style.left = `${10 + Math.random() * 80}%`; layer.append(item);
    setTimeout(() => item.remove(), 2800);
  });
  new MutationObserver(() => { if (!active()) { layer.replaceChildren(); clearTimeout(timer); } update(); }).observe(lobby, { attributes: true, attributeFilter: ['class'] });
  socket.on('disconnect', () => { layer.replaceChildren(); update(); if (status) status.textContent = 'Menunggu koneksi tersambung kembali…'; });
  socket.on('connect', update); update();
};

// Same-origin API requests carry an explicit CSRF header; cookies remain HttpOnly.
(() => {
  // Lucide eye / eye-off geometry, matching the existing icon family.
  window.passwordEyeIcon = visible => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${visible ? '<path d="m2 2 20 20M6.71 6.71C3.58 8.84 2 12 2 12s3.64 7 10 7a11.8 11.8 0 0 0 5.29-1.29M9.88 5.09A11.8 11.8 0 0 1 12 5c6.36 0 10 7 10 7a18 18 0 0 1-3.29 4.29M10 10a3 3 0 0 0 4 4"/>' : '<path d="M2 12s3.64-7 10-7 10 7 10 7-3.64 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'}</svg>`;
  window.syncPasswordToggle = button => {
    const input = document.getElementById(button.dataset.passwordToggle);
    const visible = input.type === 'text';
    const label = `${visible ? 'Sembunyikan' : 'Tampilkan'} ${button.dataset.passwordLabel || 'password'}`;
    button.innerHTML = passwordEyeIcon(visible);
    button.setAttribute('aria-label', label); button.title = label;
    button.setAttribute('aria-controls', input.id);
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-password-toggle]');
    if (!button) return;
    const input = document.getElementById(button.dataset.passwordToggle);
    const start = input.selectionStart, end = input.selectionEnd;
    input.type = input.type === 'password' ? 'text' : 'password';
    syncPasswordToggle(button);
    if (start !== null) input.setSelectionRange(start, end);
  });
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
      const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
      headers.set('X-Nizhoot-Request', '1');
      options = { ...options, headers };
    }
    const response = await originalFetch(input, options);
    if (url.origin === location.origin && !url.pathname.startsWith('/api/auth') && !location.pathname.startsWith('/auth')) {
      if (response.status === 401) location.assign('/auth/');
      else if (response.status === 403) {
        const data = await response.clone().json().catch(() => ({}));
        if (data.accountStatus) location.assign('/auth/');
      }
    }
    return response;
  };
  window.accountApi = async (url, data, method) => {
    const response = await fetch(url, data === undefined ? {} : { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'Permintaan gagal. Coba lagi.'), { field: result.field, status: response.status });
    return result;
  };
  window.fieldError = (input, text) => {
    const id = `${input.id}-error`;
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement('small'); node.id = id; node.className = 'field-error'; node.setAttribute('aria-live', 'polite');
      (input.closest('.password-wrap') || input).insertAdjacentElement('afterend', node);
      input.setAttribute('aria-describedby', [...new Set(`${input.getAttribute('aria-describedby') || ''} ${id}`.trim().split(/\s+/))].join(' '));
    }
    node.textContent = text; node.hidden = !text;
    if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  };
  window.bindFormValidation = (form, rules) => {
    form.noValidate = true;
    const validate = input => { const error = rules[input.id]?.(input.value, form) || ''; fieldError(input, error); return !error; };
    for (const id of Object.keys(rules)) {
      const input = form.querySelector(`#${id}`); if (!input) continue;
      // Do not move a button under the pointer between pointerdown and click.
      // Submission validates all fields; mode switches discard this form.
      input.addEventListener('blur', event => { if (!event.relatedTarget?.closest('button')) validate(input); });
      input.addEventListener('input', () => {
        if (input.hasAttribute('aria-invalid')) validate(input);
        if (id === 'password') { const confirm = form.querySelector('#confirm'); if (confirm?.hasAttribute('aria-invalid')) validate(confirm); }
      });
    }
    return () => {
      let first;
      for (const id of Object.keys(rules)) { const input = form.querySelector(`#${id}`); if (input && !validate(input)) first ||= input; }
      first?.focus(); return !first;
    };
  };
  document.addEventListener('DOMContentLoaded', async () => {
    const nav = document.querySelector('[data-account-nav]');
    if (!nav) return;
    try {
      const { user } = await accountApi('/api/auth/me');
      if (!user) return location.assign('/auth/');
      const header = document.querySelector('header.header, header.brandline');
      if (header) header.append(nav);
      const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'profile-trigger';
      trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', 'profile-panel'); trigger.setAttribute('aria-label', `Menu akun ${user.name}`);
      const avatar = document.createElement('span'); avatar.className = 'profile-avatar'; avatar.setAttribute('aria-hidden', 'true'); avatar.textContent = user.name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase();
      const name = document.createElement('span'); name.className = 'profile-name'; name.textContent = user.name;
      const chevron = document.createElement('span'); chevron.className = 'profile-chevron'; chevron.setAttribute('aria-hidden', 'true'); chevron.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="m6 9 6 6 6-6"/></svg>';
      if (user.photo) { avatar.textContent = ''; const img = document.createElement('img'); img.src = user.photo; img.alt = ''; avatar.append(img); }
      trigger.append(avatar, name, chevron);
      const panel = document.createElement('div'); panel.id = 'profile-panel'; panel.className = 'profile-panel'; panel.hidden = true;
      const identity = document.createElement('div'); identity.className = 'profile-identity';
      const fullName = document.createElement('strong'); fullName.textContent = user.name;
      const username = document.createElement('span'); username.textContent = `@${user.username}`; identity.append(fullName, username); panel.append(identity);
      const close = (restore = false) => { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); if (restore) trigger.focus(); };
      trigger.onclick = () => { const open = panel.hidden; panel.hidden = !open; trigger.setAttribute('aria-expanded', String(open)); };
      nav.addEventListener('keydown', event => { if (event.key === 'Escape') { close(true); event.stopPropagation(); } });
      document.addEventListener('click', event => { if (!nav.contains(event.target)) close(); });
      nav.addEventListener('focusout', event => { if (!nav.contains(event.relatedTarget)) close(); });
      for (const [label, href] of [['Pengaturan akun', '/auth/?view=settings'], ['Kolaborator', '/auth/?view=access'], ...(user.role === 'super_admin' ? [['Kelola pengguna', '/accounts/']] : [])]) {
        const link = document.createElement('a'); link.textContent = label; link.href = href; panel.append(link);
      }
      const logout = document.createElement('button'); logout.textContent = 'Keluar'; logout.type = 'button';
      logout.onclick = async () => { logout.disabled = true; try { await accountApi('/api/auth/logout', {}); location.assign('/auth/'); } catch (error) { logout.textContent = 'Gagal keluar. Coba lagi'; logout.disabled = false; } };
      logout.className = 'profile-logout'; panel.append(logout); nav.append(trigger, panel);
    } catch { nav.textContent = 'Informasi akun tidak tersedia. Muat ulang halaman.'; }
  });
})();


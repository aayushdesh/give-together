let googleLibrary;
function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleLibrary) return googleLibrary;
  googleLibrary = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    const timer = setTimeout(() => { script.remove(); googleLibrary = null; reject(Error('Google took too long to load. Close this box and try again.')); }, 12000);
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); script.remove(); googleLibrary = null; reject(Error('Google could not load. Check your internet and try in Chrome or Edge.')); };
    document.head.append(script);
  });
  return googleLibrary;
}
async function auth(_register = false, after) {
  modal(`<div class="welcome-icon" aria-hidden="true">🌈</div><span class="eyebrow">YOU BELONG HERE</span><h2>Let’s do some good!</h2><p class="help">Use Google to join. No extra password to remember.</p><div id="google-signin" aria-live="polite"><p class="help">Getting sign-in ready…</p></div><div id="auth-error" class="error" role="alert"></div><div class="privacy-note"><b>Your nickname. Your kindness.</b><p>After signing in, pick a fun nickname. We don’t save your Google name, email, or picture.</p></div><p class="help">Ask a parent or teacher if your account needs permission. If this browser can’t open Google, try Chrome or Edge.</p>`);
  const target = $('#google-signin');
  try {
    const config = await api('/auth/config');
    if (!target.isConnected) return;
    if (!config.clientId) {
      target.innerHTML = '<div class="setup-note"><b>Almost ready!</b><p>The organizer needs to connect Google sign-in first. You can still explore the drives.</p><a href="/google-setup.html" target="_blank" rel="noopener">Setup guide for a grown-up ↗</a></div>';
      return;
    }
    const { nonce } = await api('/auth/challenge', {});
    await loadGoogle();
    if (!target.isConnected) return;
    window.google.accounts.id.initialize({
      client_id: config.clientId, nonce, auto_select: false,
      use_fedcm_for_button: false, ux_mode: 'popup',
      callback: async response => {
        if (!target.isConnected) return;
        try {
          await api('/auth/google', { credential: response.credential });
          await refresh(); closeModal();
          if (!state.user.nickname_set) nickname(after);
          else if (after) after();
          else toast('You’re in! Let’s spread some kindness.');
        } catch (e) { if ($('#auth-error')) $('#auth-error').textContent = e.message; }
      }
    });
    target.replaceChildren();
    window.google.accounts.id.renderButton(target, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 280 });
  } catch (e) {
    if (target.isConnected) { target.replaceChildren(); $('#auth-error').textContent = e.message; }
  }
}

function nickname(after) {
  modal(`<div class="welcome-icon" aria-hidden="true">👋</div><h2>What should we call you?</h2><p class="help">Pick a nickname like Kind Koala or Happy Helper. Skip your full name or contact details.</p><form id="form"><label>Your nickname<input name="name" required minlength="2" maxlength="24" pattern="[a-zA-Z][a-zA-Z0-9 -]{1,23}" autocomplete="off" placeholder="Kind Koala" value="${state.user.nickname_set ? esc(state.user.name) : ''}"></label>${errorBox}<button type="submit" class="primary">${state.user.nickname_set ? 'Save my nickname' : 'Let’s go!'} 🌟</button></form>`);
  bindForm(async data => { await api('/profile', data); await refresh(); closeModal(); if (after) after(); else toast('Hi, ' + state.user.name + '!'); });
}

function ready(after) {
  if (!state.user) { auth(true, after); return false; }
  if (!state.user.nickname_set) { nickname(after); return false; }
  return true;
}

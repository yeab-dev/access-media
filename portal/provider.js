// Shared by the provider dashboard pages (/provider/…): the key, the sign-in form, the dashboard menu,
// calls to the API, and small helpers. Each page calls start(render); render(me) runs once a key works.
//
// The key is kept in this tab (sessionStorage), and also on this device (localStorage) only if the provider
// ticks "Remember on this device". The studio pages and the documentation read the same place ("studio-code").

const STORE = 'studio-code';

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function getKey() {
  try { return sessionStorage.getItem(STORE) || localStorage.getItem(STORE) || ''; } catch { return ''; }
}
export function remembered() {
  try { return !!localStorage.getItem(STORE); } catch { return false; }
}
export function setKey(key, remember) {
  try {
    sessionStorage.setItem(STORE, key);
    if (remember) localStorage.setItem(STORE, key); else localStorage.removeItem(STORE);
  } catch { /* storage blocked: the key works until the page is closed */ }
  memoryKey = key;
}
export function signOut() {
  try { sessionStorage.removeItem(STORE); localStorage.removeItem(STORE); } catch {}
  memoryKey = '';
}
let memoryKey = '';
const key = () => memoryKey || getKey();

/** Calls /api/v1 with the key. Throws an Error whose message is the server's message in words. */
export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (key()) headers.Authorization = `Bearer ${key()}`;
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try {
    res = await fetch(`/api/v1${path}`, { method, headers, body: payload, cache: 'no-store' });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `The server answered ${res.status}.`);
    err.status = res.status;
    err.problems = data.problems;
    throw err;
  }
  return data;
}

/** The page's status line (role=status): says what happened, in words. */
export function say(text, kind = '') {
  const el = $('status');
  if (!el) return;
  el.textContent = '';
  el.className = `status ${kind}`;
  // A fresh text node each time, so the same message said twice is announced twice.
  requestAnimationFrame(() => { el.textContent = text; });
}

export async function copyText(text, done = 'Copied.') {
  try { await navigator.clipboard.writeText(text); say(done, 'ok'); } catch { say('Select the text and copy it with your keyboard or menu.', 'bad'); }
}

export const embedCode = (id) => `<script type="module" src="${location.origin}/module/db-player.js"></` + `script>\n<db-player lesson="${id}"></db-player>`;
export const langName = (code) => { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code); } catch { return code; } };
export const minutes = (s) => (s ? `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s` : '');
export const date = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const g = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  let e = '';
  try { e = new Intl.DateTimeFormat('en-GB-u-ca-ethiopic', { day: 'numeric', month: 'long', year: 'numeric' }).format(d); } catch {}
  return e ? `${g} (Ethiopian calendar: ${e})` : g;
};

const MENU = [
  ['/provider/', 'Overview'],
  ['/provider/lessons', 'Lessons'],
  ['/studio/lessons.html', 'Add a lesson'],
  ['/provider/jobs', 'Jobs'],
  ['/provider/certificates', 'Certificates'],
  ['/provider/webhooks', 'Webhooks'],
  ['/provider/key', 'Your key'],
];

function menu(current) {
  const nav = document.createElement('nav');
  nav.className = 'subnav';
  nav.setAttribute('aria-label', 'Dashboard');
  nav.innerHTML = `<ul>${MENU.map(([href, text]) =>
    `<li><a href="${href}"${href === current ? ' aria-current="page"' : ''}>${text}</a></li>`).join('')}</ul>`;
  return nav;
}

function signInForm(message) {
  const box = document.createElement('section');
  box.id = 'signin';
  box.setAttribute('aria-labelledby', 'h-signin');
  box.innerHTML = `
    <h2 id="h-signin">Sign in with your API key</h2>
    ${message ? `<p class="status bad" role="alert">${esc(message)}</p>` : ''}
    <form novalidate>
      <label for="signin-key">Your API key</label>
      <input id="signin-key" type="password" autocomplete="current-password" spellcheck="false" aria-describedby="signin-hint">
      <p class="hint" id="signin-hint">It starts with “dbk_”. No key yet? <a href="/get-key">Get your key</a>: type your organisation's name and you have one at once.</p>
      <label class="check"><input type="checkbox" id="signin-remember"> Remember on this device</label>
      <p class="hint">Leave this off on a shared computer: the key is then forgotten when you close the tab.</p>
      <div class="actions"><button class="btn" type="submit">Sign in</button></div>
    </form>`;
  return box;
}

/**
 * Sets up a dashboard page. `current` is the menu entry to mark; `render(me)` fills #content once the key works.
 * The page has: <main id="main"><h1>…</h1><p id="status" role="status"></p><div id="content" hidden>…</div></main>
 */
export async function start(current, render) {
  const main = $('main');
  const h1 = main.querySelector('h1');
  h1.before(menu(current));
  const who = document.createElement('p');
  who.className = 'who';
  who.hidden = true;
  h1.before(who);
  const content = $('content');

  const showSignIn = (message) => {
    content.hidden = true;
    who.hidden = true;
    $('signin')?.remove();
    const form = signInForm(message);
    content.before(form);
    const input = form.querySelector('input[type=password]');
    form.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const k = input.value.trim();
      if (!k) { input.setAttribute('aria-invalid', 'true'); say('Paste your API key first.', 'bad'); input.focus(); return; }
      setKey(k, form.querySelector('#signin-remember').checked);
      await open(true);
    });
    if (message) input.focus();
  };

  const open = async (justSignedIn = false) => {
    if (!key()) return showSignIn();
    let me;
    try {
      me = await api('/me');
    } catch (err) {
      if (err.status === 401) { signOut(); return showSignIn('That key does not work on this server. Check it, or get a new key.'); }
      say(err.message, 'bad');
      return;
    }
    $('signin')?.remove();
    who.innerHTML = `<span>Signed in as <strong>${esc(me.admin ? 'the host (master key)' : me.provider.name)}</strong></span>
      <button type="button" class="linkbtn" id="signout">Sign out</button>`;
    who.hidden = false;
    $('signout').addEventListener('click', () => {
      signOut();
      say('Signed out. This browser no longer has your key.', 'ok');
      showSignIn();
      $('signin-key').focus();
    });
    content.hidden = false;
    try {
      await render(me);
    } catch (err) {
      say(err.message, 'bad');
    }
    if (justSignedIn) {
      say(`Signed in as ${me.admin ? 'the host' : me.provider.name}.`, 'ok');
      h1.tabIndex = -1;
      h1.focus();
    }
  };
  await open();
}

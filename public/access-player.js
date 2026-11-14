/**
 * <access-player> — accessible, embeddable lesson video player.
 *
 *   <script type="module" src="https://HOST/player/access-player.js"></script>
 *   <access-player media="demo" lang="am"></access-player>
 *
 * Attributes:
 *   media          lesson id, loaded from {api}/api/media/{id}
 *   manifest       alternative: direct URL of a manifest JSON
 *   api            API origin (default: the origin this script was loaded from)
 *   lang           interface language: "en" (default) or "am"
 *   heading-level  heading level for the transcript heading (default 2)
 *
 * No framework, no build step. Native controls only, so screen readers
 * (NVDA, TalkBack, VoiceOver) announce them without extra work.
 */

const STRINGS = {
  en: {
    player: 'Video player',
    play: 'Play', pause: 'Pause',
    back: 'Back 10 s', forward: 'Forward 10 s',
    mute: 'Mute', unmute: 'Unmute',
    volume: 'Volume', seek: 'Position in video',
    captions: 'Captions', off: 'Off',
    captionStyle: 'Caption style',
    size: 'Text size', textColour: 'Text colour', background: 'Background',
    speed: 'Speed', quality: 'Quality', audioOnly: 'Audio only',
    transcript: 'Transcript', showTranscript: 'Transcript',
    followAlong: 'Follow along with the video',
    fullscreen: 'Full screen', exitFullscreen: 'Exit full screen',
    shortcuts: 'Keyboard shortcuts',
    loading: 'Loading video…',
    loadError: 'The video could not be loaded. Check your connection and reload the page.',
    noTranscript: 'No transcript is available for this video.',
    playing: 'Playing', paused: 'Paused', muted: 'Muted', unmuted: 'Sound on',
    captionsOff: 'Captions off',
    of: 'of', minutes: (n) => `${n} ${n === 1 ? 'minute' : 'minutes'}`, seconds: (n) => `${n} ${n === 1 ? 'second' : 'seconds'}`,
    sample: 'Captions look like this',
    sizes: { s: 'Small', m: 'Medium', l: 'Large', xl: 'Extra large', xxl: 'Huge' },
    colours: { white: 'White', yellow: 'Yellow', cyan: 'Cyan', green: 'Green', black: 'Black' },
    backgrounds: { black: 'Black', translucent: 'Black, see-through', white: 'White', none: 'None' },
    keys: [
      ['K', 'Play or pause'], ['J', 'Back 10 seconds'], ['L', 'Forward 10 seconds'],
      ['M', 'Mute or unmute'], ['C', 'Captions on or off'], ['T', 'Show or hide transcript'], ['F', 'Full screen'],
    ],
  },
  // Draft Amharic. Must be reviewed by a native speaker before the demo.
  am: {
    player: 'የቪዲዮ ማጫወቻ',
    play: 'አጫውት', pause: 'ለአፍታ አቁም',
    back: '10 ሰ ወደ ኋላ', forward: '10 ሰ ወደ ፊት',
    mute: 'ድምፅ አጥፋ', unmute: 'ድምፅ መልስ',
    volume: 'የድምፅ መጠን', seek: 'በቪዲዮው ውስጥ ያለ ቦታ',
    captions: 'የጽሑፍ ትርጉም', off: 'ጠፍቷል',
    captionStyle: 'የጽሑፍ ቅርጽ',
    size: 'የጽሑፍ መጠን', textColour: 'የጽሑፍ ቀለም', background: 'ዳራ',
    speed: 'ፍጥነት', quality: 'ጥራት', audioOnly: 'ድምፅ ብቻ',
    transcript: 'ግልባጭ', showTranscript: 'ግልባጭ',
    followAlong: 'ከቪዲዮው ጋር ተከተል',
    fullscreen: 'ሙሉ ማያ', exitFullscreen: 'ከሙሉ ማያ ውጣ',
    shortcuts: 'የቁልፍ ሰሌዳ አቋራጮች',
    loading: 'ቪዲዮው በመጫን ላይ…',
    loadError: 'ቪዲዮው ሊጫን አልቻለም። ግንኙነትዎን ያረጋግጡና ገጹን እንደገና ይጫኑ።',
    noTranscript: 'ለዚህ ቪዲዮ ግልባጭ የለም።',
    playing: 'እየተጫወተ ነው', paused: 'ቆሟል', muted: 'ድምፅ ጠፍቷል', unmuted: 'ድምፅ በርቷል',
    captionsOff: 'የጽሑፍ ትርጉም ጠፍቷል',
    of: 'ከ', minutes: (n) => `${n} ደቂቃ`, seconds: (n) => `${n} ሰከንድ`,
    sample: 'የጽሑፍ ትርጉም እንዲህ ይታያል',
    sizes: { s: 'ትንሽ', m: 'መካከለኛ', l: 'ትልቅ', xl: 'በጣም ትልቅ', xxl: 'እጅግ ትልቅ' },
    colours: { white: 'ነጭ', yellow: 'ቢጫ', cyan: 'ሰማያዊ', green: 'አረንጓዴ', black: 'ጥቁር' },
    backgrounds: { black: 'ጥቁር', translucent: 'ግልጽ ጥቁር', white: 'ነጭ', none: 'የለም' },
    keys: [
      ['K', 'አጫውት ወይም አቁም'], ['J', '10 ሰከንድ ወደ ኋላ'], ['L', '10 ሰከንድ ወደ ፊት'],
      ['M', 'ድምፅ አጥፋ ወይም መልስ'], ['C', 'የጽሑፍ ትርጉም አብራ ወይም አጥፋ'], ['T', 'ግልባጩን አሳይ ወይም ደብቅ'], ['F', 'ሙሉ ማያ'],
    ],
  },
};

const SIZES = { s: 0.75, m: 1, l: 1.5, xl: 2, xxl: 3 };
const COLOURS = { white: '#ffffff', yellow: '#ffeb3b', cyan: '#4dd0e1', green: '#69f0ae', black: '#000000' };
const BACKGROUNDS = { black: 'rgb(0 0 0)', translucent: 'rgb(0 0 0 / 0.75)', white: 'rgb(255 255 255)', none: 'transparent' };
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const STORE_KEY = 'access-player:prefs';

const ICONS = {
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>',
  back: '<path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/>',
  forward: '<path d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/>',
  volume: '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z"/>',
  muted: '<path d="M3 9v6h4l5 5V4L7 9H3zm18.3-1.7-1.4-1.4L17 8.6l-2.9-2.7-1.4 1.4L15.6 10l-2.9 2.9 1.4 1.4L17 11.4l2.9 2.9 1.4-1.4-2.9-2.9z"/>',
  transcript: '<path d="M4 5h16v2H4zm0 4h16v2H4zm0 4h10v2H4zm0 4h10v2H4z"/>',
  style: '<path d="M5 4v3h5.5v12h3V7H19V4z"/>',
  fullscreen: '<path d="M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z"/>',
  exitFullscreen: '<path d="M5 16h3v3h2v-5H5zm3-8H5v2h5V5H8zm6 11h2v-3h3v-2h-5zm2-11V5h-2v5h5V8z"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

const scriptOrigin = new URL(import.meta.url).origin;

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function savePrefs(prefs) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(prefs)); } catch { /* private mode: ignore */ }
}

function clock(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function spoken(sec, t) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (!m) return t.seconds(r);
  return r ? `${t.minutes(m)} ${t.seconds(r)}` : t.minutes(m);
}

function slowConnection() {
  const c = navigator.connection;
  return !!c && (c.saveData || ['slow-2g', '2g', '3g'].includes(c.effectiveType));
}

const STYLE = `
:host { display: block; font-family: system-ui, "Noto Sans", "Noto Sans Ethiopic", "Nyala", "Abyssinica SIL", sans-serif;
  --ap-accent: #0b5cad; --ap-bg: #ffffff; --ap-fg: #16181d; --ap-muted: #4a5060; --ap-line: #8a90a0; --ap-focus: #0b5cad;
  --ap-panel: #f3f5f8; --ap-current: #fff1b8; color: var(--ap-fg); }
@media (prefers-color-scheme: dark) {
  :host { --ap-accent: #8cc4ff; --ap-bg: #15181e; --ap-fg: #eef0f4; --ap-muted: #b8bfcc; --ap-line: #7c8496; --ap-focus: #8cc4ff;
    --ap-panel: #1f232b; --ap-current: #4a3f00; }
}
@media (prefers-contrast: more) { :host { --ap-line: currentColor; --ap-muted: var(--ap-fg); } }
:host([hidden]) { display: none; }
* { box-sizing: border-box; }
.player { background: var(--ap-bg); border: 1px solid var(--ap-line); border-radius: 8px; overflow: hidden; }
.player:fullscreen { display: flex; flex-direction: column; border: 0; border-radius: 0; overflow: auto; }
.player:fullscreen .stage { flex: 1; aspect-ratio: auto; min-height: 0; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.stage { position: relative; background: #000; aspect-ratio: 16 / 9; container-type: inline-size; }
video { display: block; width: 100%; height: 100%; object-fit: contain; }
.stage.audio-only video { opacity: 0; }
.stage.audio-only { background: #000 var(--ap-poster, none) center / contain no-repeat; }
.cc { position: absolute; left: 0; right: 0; bottom: 4%; display: flex; justify-content: center; padding: 0 4%; pointer-events: none; }
.cc-text { display: inline-block; max-width: 100%; text-align: center; white-space: pre-line; line-height: 1.35;
  font-size: calc(var(--cc-scale, 1) * clamp(14px, 4.2cqi, 30px)); color: var(--cc-fg, #fff); background: var(--cc-bg, #000);
  padding: 0.15em 0.5em; border-radius: 4px; }
.cc-text:empty { display: none; }
.cc-text.no-bg { text-shadow: 0 0 3px #000, 0 0 3px #000, 1px 1px 2px #000; }
.message { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 1rem; color: #fff; text-align: center; font-size: 1.1rem; }
.message:empty { display: none; }
.seek-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem 0; }
.time { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--ap-muted); font-size: 0.95rem; }
input[type=range] { accent-color: var(--ap-accent); min-height: 44px; margin: 0; }
.seek { flex: 1; min-width: 0; }
.controls { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.25rem 0.5rem; padding: 0.25rem 0.5rem 0.5rem; }
.group { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.25rem; }
.spacer { flex: 1 1 0; }
button, select { font: inherit; color: inherit; }
button.ctl { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  min-width: 48px; min-height: 48px; padding: 4px 6px; border: 1px solid transparent; border-radius: 6px;
  background: transparent; cursor: pointer; font-size: 0.75rem; line-height: 1.1; }
button.ctl svg { fill: currentColor; }
button.ctl:hover { background: var(--ap-panel); border-color: var(--ap-line); }
button.ctl[aria-pressed=true], button.ctl[aria-expanded=true] { background: var(--ap-panel); border-color: var(--ap-accent); }
.field { display: flex; flex-direction: column; gap: 2px; font-size: 0.75rem; }
.field select { min-height: 44px; min-width: 6rem; padding: 0 0.5rem; border: 1px solid var(--ap-line); border-radius: 6px; background: var(--ap-bg); font-size: 0.95rem; }
.volume { width: 6rem; }
:focus-visible { outline: 3px solid var(--ap-focus); outline-offset: 2px; }
.panel { border-top: 1px solid var(--ap-line); padding: 0.75rem; background: var(--ap-panel); }
.panel[hidden] { display: none; }
.style-grid { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; }
.preview { flex-basis: 100%; background: #333; padding: 0.75rem; border-radius: 6px; text-align: center; container-type: inline-size; }
.transcript h2, .transcript h3, .transcript h4, .transcript h5, .transcript h6 { font-size: 1.1rem; margin: 0 0 0.5rem; }
.transcript label { display: inline-flex; align-items: center; gap: 0.5rem; min-height: 44px; }
.transcript input[type=checkbox] { width: 1.25rem; height: 1.25rem; accent-color: var(--ap-accent); }
.transcript ol { list-style: none; margin: 0.25rem 0 0; padding: 0; max-height: 18rem; overflow-y: auto; border: 1px solid var(--ap-line); border-radius: 6px; background: var(--ap-bg); }
.player:fullscreen .transcript ol { max-height: 30vh; }
.cue { display: flex; gap: 0.75rem; width: 100%; text-align: start; padding: 0.5rem 0.75rem; min-height: 44px; border: 0; border-bottom: 1px solid var(--ap-panel); background: transparent; cursor: pointer; line-height: 1.45; }
.cue:hover { background: var(--ap-panel); }
.cue[aria-current=true] { background: var(--ap-current); font-weight: 600; }
.cue time { color: var(--ap-muted); font-variant-numeric: tabular-nums; flex: none; }
.cue[aria-current=true] time { color: inherit; }
details.keys { padding: 0 0.75rem 0.5rem; font-size: 0.9rem; }
details.keys summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; }
details.keys dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 0.75rem; margin: 0 0 0.5rem; }
details.keys dt kbd { font-family: inherit; font-weight: 700; border: 1px solid var(--ap-line); border-radius: 4px; padding: 0 0.4em; }
details.keys dd { margin: 0; }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; transition: none !important; } }
@media (max-width: 30rem) { .volume { display: none; } }
`;

class AccessPlayer extends HTMLElement {
  static observedAttributes = ['media', 'manifest', 'lang'];

  #root;
  #els = {};
  #manifest = null;
  #prefs = loadPrefs();
  #lastCaption = null;
  #cueButtons = [];
  #connected = false;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
  }

  get t() {
    const lang = (this.getAttribute('lang') || 'en').toLowerCase().startsWith('am') ? 'am' : 'en';
    return STRINGS[lang];
  }

  get uiLang() { return this.t === STRINGS.am ? 'am' : 'en'; }

  #onFullscreen = () => this.#updateFullscreen();

  connectedCallback() {
    this.#connected = true;
    document.addEventListener('fullscreenchange', this.#onFullscreen);
    this.#load();
  }

  disconnectedCallback() {
    this.#connected = false;
    document.removeEventListener('fullscreenchange', this.#onFullscreen);
    this.#els.video?.pause();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.#connected || oldValue === newValue) return;
    if (name === 'lang' && this.#manifest) this.#render(this.#manifest, true);
    else this.#load();
  }

  /** Public API for host pages. */
  play() { return this.#els.video?.play(); }
  pause() { this.#els.video?.pause(); }
  get currentTime() { return this.#els.video?.currentTime ?? 0; }
  set currentTime(v) { if (this.#els.video) this.#els.video.currentTime = v; }

  async #load() {
    const t = this.t;
    this.#root.innerHTML = `<style>${STYLE}</style><div class="player" lang="${this.uiLang}"><div class="stage"><div class="message" role="status">${t.loading}</div></div></div>`;
    try {
      const url = this.getAttribute('manifest')
        || `${(this.getAttribute('api') || scriptOrigin).replace(/\/$/, '')}/api/media/${encodeURIComponent(this.getAttribute('media') || '')}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const manifest = await res.json();
      // Resolve relative file references against the manifest URL.
      const base = new URL(url, location.href);
      const abs = (p) => (p ? new URL(p, base).href : p);
      manifest.poster = abs(manifest.poster);
      manifest.sources = (manifest.sources || []).map((s) => ({ ...s, src: abs(s.src) }));
      manifest.tracks = (manifest.tracks || []).map((tr) => ({ ...tr, src: abs(tr.src) }));
      this.#manifest = manifest;
      this.#render(manifest);
    } catch (err) {
      console.error('access-player: could not load manifest', err);
      const msg = this.#root.querySelector('.message');
      if (msg) { msg.setAttribute('role', 'alert'); msg.textContent = t.loadError; }
    }
  }

  #render(m, keepTime = false) {
    const t = this.t;
    const prev = this.#els.video;
    const resumeAt = keepTime && prev ? prev.currentTime : 0;
    const wasPlaying = keepTime && prev && !prev.paused;
    prev?.pause();

    const level = Math.min(6, Math.max(2, Number(this.getAttribute('heading-level')) || 2));
    const captionTracks = m.tracks.filter((tr) => tr.kind === 'captions' || tr.kind === 'subtitles');
    const qualities = m.sources.map((s) => s.quality);
    const titleId = 'ap-title';

    this.#root.innerHTML = `
<style>${STYLE}</style>
<div class="player" role="region" aria-labelledby="${titleId}" lang="${this.uiLang}">
  <span id="${titleId}" class="sr-only">${t.player}: ${escapeHtml(m.title || '')}</span>
  <div class="stage">
    <video playsinline preload="metadata" crossorigin="anonymous" ${m.poster ? `poster="${escapeAttr(m.poster)}"` : ''} lang="${escapeAttr(m.lang || 'en')}">
      ${captionTracks.map((tr, i) => `<track kind="${tr.kind}" srclang="${escapeAttr(tr.srclang)}" label="${escapeAttr(tr.label)}" src="${escapeAttr(tr.src)}" data-i="${i}">`).join('')}
    </video>
    <div class="cc" aria-hidden="true"><span class="cc-text"></span></div>
    <div class="message"></div>
  </div>
  <div class="seek-row">
    <input class="seek" type="range" min="0" max="${Number(m.duration) || 0}" step="1" value="0" aria-label="${t.seek}">
    <span class="time" aria-hidden="true"><span class="cur">0:00</span> / <span class="dur">${clock(m.duration)}</span></span>
  </div>
  <div class="controls">
    <div class="group">
      <button type="button" class="ctl play">${icon('play')}<span class="lbl">${t.play}</span></button>
      <button type="button" class="ctl back">${icon('back')}<span class="lbl">${t.back}</span></button>
      <button type="button" class="ctl forward">${icon('forward')}<span class="lbl">${t.forward}</span></button>
      <button type="button" class="ctl mute">${icon('volume')}<span class="lbl">${t.mute}</span></button>
      <input class="volume" type="range" min="0" max="100" step="5" value="100" aria-label="${t.volume}">
    </div>
    <div class="spacer"></div>
    <div class="group">
      <div class="field"><label for="ap-cc-select">${t.captions}</label>
        <select id="ap-cc-select" class="cc-select">
          <option value="">${t.off}</option>
          ${captionTracks.map((tr, i) => `<option value="${i}" lang="${escapeAttr(tr.srclang)}">${escapeHtml(tr.label)}</option>`).join('')}
        </select>
      </div>
      <button type="button" class="ctl style-btn" aria-expanded="false" aria-controls="ap-style">${icon('style')}<span class="lbl">${t.captionStyle}</span></button>
      <div class="field"><label for="ap-speed">${t.speed}</label>
        <select id="ap-speed" class="speed">${SPEEDS.map((s) => `<option value="${s}"${s === 1 ? ' selected' : ''}>${s}×</option>`).join('')}</select>
      </div>
      ${qualities.length > 1 ? `<div class="field"><label for="ap-quality">${t.quality}</label>
        <select id="ap-quality" class="quality">${qualities.map((q) => `<option value="${escapeAttr(q)}">${q === 'audio' ? t.audioOnly : escapeHtml(q)}</option>`).join('')}</select>
      </div>` : ''}
      <button type="button" class="ctl transcript-btn" aria-expanded="false" aria-controls="ap-transcript">${icon('transcript')}<span class="lbl">${t.showTranscript}</span></button>
      ${document.fullscreenEnabled ? `<button type="button" class="ctl fs">${icon('fullscreen')}<span class="lbl">${t.fullscreen}</span></button>` : ''}
    </div>
  </div>
  <div id="ap-style" class="panel style-panel" hidden>
    <div class="style-grid" role="group" aria-label="${t.captionStyle}">
      <div class="field"><label for="ap-cc-size">${t.size}</label><select id="ap-cc-size" class="cc-size">${Object.keys(SIZES).map((k) => `<option value="${k}">${t.sizes[k]}</option>`).join('')}</select></div>
      <div class="field"><label for="ap-cc-colour">${t.textColour}</label><select id="ap-cc-colour" class="cc-colour">${Object.keys(COLOURS).map((k) => `<option value="${k}">${t.colours[k]}</option>`).join('')}</select></div>
      <div class="field"><label for="ap-cc-bg">${t.background}</label><select id="ap-cc-bg" class="cc-bg">${Object.keys(BACKGROUNDS).map((k) => `<option value="${k}">${t.backgrounds[k]}</option>`).join('')}</select></div>
      <div class="preview" aria-hidden="true"><span class="cc-text sample">${t.sample}</span></div>
    </div>
  </div>
  <section id="ap-transcript" class="panel transcript" hidden aria-labelledby="ap-transcript-h">
    <h${level} id="ap-transcript-h">${t.transcript}</h${level}>
    <label><input type="checkbox" class="follow" checked> ${t.followAlong}</label>
    <ol class="cues"></ol>
  </section>
  <details class="keys">
    <summary>${t.shortcuts}</summary>
    <dl>${t.keys.map(([k, d]) => `<dt><kbd>${k}</kbd></dt><dd>${d}</dd>`).join('')}</dl>
  </details>
  <div class="status sr-only" role="status" aria-live="polite"></div>
</div>`;

    const $ = (sel) => this.#root.querySelector(sel);
    const els = this.#els = {
      player: $('.player'), stage: $('.stage'), video: $('video'), cc: $('.cc-text:not(.sample)'), sample: $('.sample'),
      message: $('.message'), seek: $('.seek'), cur: $('.cur'), dur: $('.dur'),
      play: $('.play'), back: $('.back'), forward: $('.forward'), mute: $('.mute'), volume: $('.volume'),
      ccSelect: $('.cc-select'), styleBtn: $('.style-btn'), stylePanel: $('.style-panel'),
      ccSize: $('.cc-size'), ccColour: $('.cc-colour'), ccBg: $('.cc-bg'),
      speed: $('.speed'), quality: $('.quality'), transcriptBtn: $('.transcript-btn'), transcript: $('.transcript'),
      follow: $('.follow'), cues: $('.cues'), fs: $('.fs'), status: $('.status'),
    };
    if (m.poster) els.stage.style.setProperty('--ap-poster', `url("${m.poster.replace(/["\\\n]/g, encodeURIComponent)}")`);

    this.#bind(m, captionTracks);

    // Initial source: remembered choice, else 240p on slow connections, else first.
    const wanted = this.#prefs.quality && qualities.includes(this.#prefs.quality)
      ? this.#prefs.quality
      : (slowConnection() && qualities.includes('240p') ? '240p' : qualities[0]);
    this.#setSource(wanted, resumeAt, wasPlaying);

    // Captions: remembered language if available.
    const ccIndex = captionTracks.findIndex((tr) => tr.srclang === this.#prefs.captions);
    els.ccSelect.value = ccIndex >= 0 ? String(ccIndex) : '';
    const uiIndex = captionTracks.findIndex((tr) => tr.srclang === this.uiLang);
    this.#lastCaption = ccIndex >= 0 ? ccIndex : Math.max(0, uiIndex);
    els.ccSize.value = this.#prefs.ccSize in SIZES ? this.#prefs.ccSize : 'm';
    els.ccColour.value = this.#prefs.ccColour in COLOURS ? this.#prefs.ccColour : 'white';
    els.ccBg.value = this.#prefs.ccBg in BACKGROUNDS ? this.#prefs.ccBg : 'black';
    if (this.#prefs.speed) { els.speed.value = String(this.#prefs.speed); }
    this.#applyCaptionStyle();
    this.#selectCaptions();

    this.dispatchEvent(new CustomEvent('access-player:ready', { bubbles: true, detail: { id: m.id } }));
  }

  #bind(m, captionTracks) {
    const els = this.#els;
    const v = els.video;
    const t = this.t;

    // All tracks "hidden": cues load and fire events, but the browser draws nothing; we draw captions ourselves.
    for (const tr of v.textTracks) tr.mode = 'hidden';
    for (const trackEl of v.querySelectorAll('track')) {
      trackEl.addEventListener('load', () => { if (this.#transcriptTrackIndex() === Number(trackEl.dataset.i)) this.#buildTranscript(); });
      trackEl.track.addEventListener('cuechange', () => this.#onCueChange(Number(trackEl.dataset.i)));
    }

    els.play.addEventListener('click', () => this.#togglePlay());
    v.addEventListener('click', () => this.#togglePlay());
    v.addEventListener('dblclick', () => this.#toggleFullscreen());
    els.back.addEventListener('click', () => this.#skip(-10));
    els.forward.addEventListener('click', () => this.#skip(10));
    els.mute.addEventListener('click', () => this.#toggleMute());

    els.volume.addEventListener('input', () => {
      v.volume = Number(els.volume.value) / 100;
      v.muted = v.volume === 0;
    });

    let seeking = false;
    els.seek.addEventListener('input', () => { seeking = true; v.currentTime = Number(els.seek.value); this.#updateTime(); });
    els.seek.addEventListener('change', () => { seeking = false; });

    v.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(v.duration)) {
        els.seek.max = String(Math.floor(v.duration));
        els.dur.textContent = clock(v.duration);
      }
      v.playbackRate = Number(els.speed.value);
      this.#updateTime();
    });
    v.addEventListener('timeupdate', () => { if (!seeking) els.seek.value = String(Math.floor(v.currentTime)); this.#updateTime(); this.#highlightCue(); });
    v.addEventListener('play', () => this.#updatePlay());
    v.addEventListener('pause', () => this.#updatePlay());
    v.addEventListener('ended', () => this.#updatePlay());
    v.addEventListener('volumechange', () => this.#updateMute());
    v.addEventListener('waiting', () => { els.message.textContent = t.loading; });
    v.addEventListener('playing', () => { els.message.textContent = ''; });
    v.addEventListener('canplay', () => { els.message.textContent = ''; });
    v.addEventListener('error', () => {
      els.message.textContent = t.loadError;
      this.#announce(t.loadError);
    });

    els.ccSelect.addEventListener('change', () => this.#selectCaptions());
    els.styleBtn.addEventListener('click', () => this.#togglePanel(els.styleBtn, els.stylePanel));
    for (const sel of [els.ccSize, els.ccColour, els.ccBg]) sel.addEventListener('change', () => this.#applyCaptionStyle(true));

    els.speed.addEventListener('change', () => {
      v.playbackRate = Number(els.speed.value);
      this.#prefs.speed = v.playbackRate; savePrefs(this.#prefs);
    });
    els.quality?.addEventListener('change', () => {
      this.#prefs.quality = els.quality.value; savePrefs(this.#prefs);
      this.#setSource(els.quality.value, v.currentTime, !v.paused);
    });
    els.transcriptBtn.addEventListener('click', () => {
      const open = this.#togglePanel(els.transcriptBtn, els.transcript);
      if (open) { this.#buildTranscript(); this.#highlightCue(true); }
    });
    els.fs?.addEventListener('click', () => this.#toggleFullscreen());

    els.cues.addEventListener('click', (e) => {
      const btn = e.target.closest('button.cue');
      if (!btn) return;
      v.currentTime = Number(btn.dataset.start);
      this.#highlightCue(true);
    });

    els.player.addEventListener('keydown', (e) => this.#onKey(e));
  }

  #onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const t = this.t;
    const v = this.#els.video;
    switch (e.key.toLowerCase()) {
      case 'k': this.#togglePlay(); this.#announce(v.paused ? t.paused : t.playing); break;
      case 'j': this.#skip(-10, true); break;
      case 'l': this.#skip(10, true); break;
      case 'm': this.#toggleMute(); this.#announce(v.muted ? t.muted : t.unmuted); break;
      case 'c': this.#toggleCaptions(); break;
      case 't': this.#els.transcriptBtn.click(); break;
      case 'f': this.#toggleFullscreen(); break;
      default: return;
    }
    e.preventDefault();
  }

  #togglePlay() {
    const v = this.#els.video;
    if (v.paused || v.ended) v.play().catch(() => {}); else v.pause();
  }

  #skip(delta, announce = false) {
    const v = this.#els.video;
    const max = Number.isFinite(v.duration) ? v.duration : Infinity;
    v.currentTime = Math.min(max, Math.max(0, v.currentTime + delta));
    if (announce) this.#announce(this.#positionText());
  }

  #toggleMute() {
    const v = this.#els.video;
    v.muted = !v.muted;
    if (!v.muted && v.volume === 0) { v.volume = 1; this.#els.volume.value = '100'; }
  }

  #toggleCaptions() {
    const sel = this.#els.ccSelect;
    if (sel.value === '') sel.value = String(this.#lastCaption ?? 0);
    else sel.value = '';
    this.#selectCaptions(true);
  }

  #selectCaptions(announce = false) {
    const els = this.#els;
    const t = this.t;
    const value = els.ccSelect.value;
    els.cc.textContent = '';
    if (value === '') {
      this.#prefs.captions = null;
      if (announce) this.#announce(t.captionsOff);
    } else {
      const i = Number(value);
      this.#lastCaption = i;
      const opt = els.ccSelect.selectedOptions[0];
      this.#prefs.captions = opt.lang;
      els.cc.lang = opt.lang;
      this.#onCueChange(i);
      if (announce) this.#announce(`${t.captions}: ${opt.textContent}`);
    }
    savePrefs(this.#prefs);
    if (!els.transcript.hidden) this.#buildTranscript();
  }

  #onCueChange(i) {
    const els = this.#els;
    if (els.ccSelect.value !== String(i)) return;
    const track = els.video.textTracks[i];
    const active = track?.activeCues ? Array.from(track.activeCues) : [];
    els.cc.textContent = active.map((c) => stripTags(c.text)).join('\n');
  }

  #applyCaptionStyle(save = false) {
    const els = this.#els;
    for (const target of [els.cc, els.sample]) {
      target.style.setProperty('--cc-scale', SIZES[els.ccSize.value]);
      target.style.setProperty('--cc-fg', COLOURS[els.ccColour.value]);
      target.style.setProperty('--cc-bg', BACKGROUNDS[els.ccBg.value]);
      target.classList.toggle('no-bg', els.ccBg.value === 'none' || els.ccBg.value === 'translucent');
    }
    if (save) {
      Object.assign(this.#prefs, { ccSize: els.ccSize.value, ccColour: els.ccColour.value, ccBg: els.ccBg.value });
      savePrefs(this.#prefs);
    }
  }

  #setSource(quality, at = 0, play = false) {
    const els = this.#els;
    const src = this.#manifest.sources.find((s) => s.quality === quality) || this.#manifest.sources[0];
    if (!src) return;
    if (els.quality) els.quality.value = src.quality;
    els.stage.classList.toggle('audio-only', src.quality === 'audio');
    const v = els.video;
    const rate = Number(els.speed.value) || 1;
    v.src = src.src;
    v.load();
    // Re-apply after load(): it resets text track modes in some browsers.
    for (const tr of v.textTracks) tr.mode = 'hidden';
    if (at > 0 || play) {
      v.addEventListener('loadedmetadata', () => {
        v.currentTime = at;
        v.playbackRate = rate;
        if (play) v.play().catch(() => {});
      }, { once: true });
    }
  }

  #togglePanel(btn, panel) {
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    return open;
  }

  #transcriptTrackIndex() {
    const value = this.#els.ccSelect.value;
    if (value !== '') return Number(value);
    return this.#lastCaption ?? 0;
  }

  #buildTranscript() {
    const els = this.#els;
    const i = this.#transcriptTrackIndex();
    const track = els.video.textTracks[i];
    const list = els.cues;
    list.textContent = '';
    this.#cueButtons = [];
    const cues = track?.cues ? Array.from(track.cues) : [];
    if (!cues.length) {
      // Cues may still be loading; the track "load" event rebuilds the list.
      const li = document.createElement('li');
      li.textContent = this.t.noTranscript;
      li.style.padding = '0.5rem 0.75rem';
      list.append(li);
      return;
    }
    list.lang = track.language || '';
    for (const cue of cues) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cue';
      btn.dataset.start = String(cue.startTime);
      btn.dataset.end = String(cue.endTime);
      const time = document.createElement('time');
      time.dateTime = `PT${Math.floor(cue.startTime)}S`;
      time.textContent = clock(cue.startTime);
      const text = document.createElement('span');
      text.textContent = stripTags(cue.text).replace(/\n/g, ' ');
      btn.append(time, text);
      li.append(btn);
      list.append(li);
      this.#cueButtons.push(btn);
    }
  }

  #highlightCue(force = false) {
    const els = this.#els;
    if (els.transcript.hidden || !this.#cueButtons.length) return;
    const now = els.video.currentTime;
    let current = null;
    for (const btn of this.#cueButtons) {
      const on = now >= Number(btn.dataset.start) && now < Number(btn.dataset.end);
      if (on) current = btn;
      if (on !== (btn.getAttribute('aria-current') === 'true')) {
        if (on) btn.setAttribute('aria-current', 'true'); else btn.removeAttribute('aria-current');
      }
    }
    // Scroll only the transcript list (never the page), and never while the user is in the list.
    if (current && els.follow.checked && (force || !els.cues.contains(this.#root.activeElement))) {
      const list = els.cues;
      const top = current.offsetTop - list.offsetTop;
      if (top < list.scrollTop || top + current.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = Math.max(0, top - list.clientHeight / 3);
      }
    }
  }

  #updatePlay() {
    const { video: v, play } = this.#els;
    const playing = !v.paused && !v.ended;
    play.innerHTML = `${icon(playing ? 'pause' : 'play')}<span class="lbl">${playing ? this.t.pause : this.t.play}</span>`;
  }

  #updateMute() {
    const { video: v, mute, volume } = this.#els;
    const muted = v.muted || v.volume === 0;
    mute.innerHTML = `${icon(muted ? 'muted' : 'volume')}<span class="lbl">${muted ? this.t.unmute : this.t.mute}</span>`;
    if (!v.muted) volume.value = String(Math.round(v.volume * 100));
  }

  #updateTime() {
    const els = this.#els;
    els.cur.textContent = clock(els.video.currentTime);
    els.seek.setAttribute('aria-valuetext', this.#positionText());
  }

  #positionText() {
    const v = this.#els.video;
    const t = this.t;
    const dur = Number.isFinite(v.duration) ? v.duration : this.#manifest?.duration;
    return dur ? `${spoken(v.currentTime, t)} ${t.of} ${spoken(dur, t)}` : spoken(v.currentTime, t);
  }

  #toggleFullscreen() {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else this.#els.player.requestFullscreen().catch(() => {});
  }

  #updateFullscreen() {
    const fs = this.#els.fs;
    if (!fs) return;
    const on = !!document.fullscreenElement;
    fs.innerHTML = `${icon(on ? 'exitFullscreen' : 'fullscreen')}<span class="lbl">${on ? this.t.exitFullscreen : this.t.fullscreen}</span>`;
  }

  #announce(text) {
    const s = this.#els.status;
    if (!s) return;
    // Clear first so repeating the same message is still announced.
    s.textContent = '';
    setTimeout(() => { s.textContent = text; }, 50);
  }
}

function stripTags(s) { return String(s).replace(/<[^>]+>/g, ''); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
const escapeAttr = escapeHtml;

if (!customElements.get('access-player')) customElements.define('access-player', AccessPlayer);
export { AccessPlayer };

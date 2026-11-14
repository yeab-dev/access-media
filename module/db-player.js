/**
 * <db-player> — accessible, embeddable lesson video player (Digital Bridge Accessibility Hackathon, Track 2).
 *
 * Level 1, attributes only (no server needed):
 *   <script type="module" src="https://HOST/module/db-player.js"></script>
 *   <db-player src="lesson.mp4" captions="lesson.en.vtt,lesson.am.vtt" sign="lesson.ethsl.mp4"
 *              describe="lesson.ad.en.vtt" lang="am"></db-player>
 *
 * Or a lesson from the API (Level 2):
 *   <db-player lesson="demo" api="https://HOST" lang="am"></db-player>
 *
 * Attributes: src, captions, sign, describe (.vtt text descriptions and/or an .mp3 described-audio track),
 *   poster, label, lesson, api, lang ("en", "am", or any i18n/<lang>.json), theme ("auto" | "light" | "dark"),
 *   heading-level.
 * Events (bubble, composed): db-player:ready, db-player:progress {seconds, percent}, db-player:complete,
 *   db-player:prefs {captionSize, captionColor, signPosition, ...}, db-player:sign-requested {lesson}.
 * Interface text lives in i18n/<lang>.json: adding a language is one new file. No framework, no build step.
 */

import { loadPrefs, storePrefs, loadStrings, fill, languageName, preferredLanguage, setPreferredLanguage } from './i18n.js';

const SIZES = { s: 0.75, m: 1, l: 1.5, xl: 2, xxl: 3 };
const COLOURS = { white: '#ffffff', yellow: '#ffeb3b', cyan: '#4dd0e1', green: '#69f0ae', black: '#000000' };
const BACKGROUNDS = { black: 'rgb(0 0 0)', translucent: 'rgb(0 0 0 / 0.75)', white: 'rgb(255 255 255)', none: 'transparent' };
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SIGN_SIZES = { s: 0.2, m: 0.28, l: 0.38, xl: 0.5 }; // fraction of the video width
const SIGN_MIN = 0.12;
const SIGN_MAX = 0.7;
const SIGN_MARGIN = 8; // px from the video edge for corner positions

const ICONS = {
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>',
  back: '<path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/>',
  forward: '<path d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/>',
  volume: '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z"/>',
  muted: '<path d="M3 9v6h4l5 5V4L7 9H3zm18.3-1.7-1.4-1.4L17 8.6l-2.9-2.7-1.4 1.4L15.6 10l-2.9 2.9 1.4 1.4L17 11.4l2.9 2.9 1.4-1.4-2.9-2.9z"/>',
  transcript: '<path d="M4 5h16v2H4zm0 4h16v2H4zm0 4h10v2H4zm0 4h10v2H4z"/>',
  download: '<path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/>',
  cc: '<path d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1z"/>',
  keyboard: '<path d="M20 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-9 3h2v2h-2zm0 3h2v2h-2zM8 8h2v2H8zm0 3h2v2H8zm-1 2H5v-2h2zm0-3H5V8h2zm9 7H8v-2h8zm0-4h-2v-2h2zm0-3h-2V8h2zm3 3h-2v-2h2zm0-3h-2V8h2z"/>',
  settings: '<path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/>',
  sign: '<path d="M12.5 23c-3 0-5.7-1.8-6.8-4.6L3 11.6a.9.9 0 0 1 1.2-1.2l.7.2c.5.2.9.6 1.1 1.1L7.3 15H8V3.4a1.2 1.2 0 0 1 2.3 0V11h1V2.2a1.2 1.2 0 0 1 2.3 0V11h1V3.6a1.2 1.2 0 0 1 2.3 0V11h1V6.4a1.2 1.2 0 0 1 2.3 0v9.2c0 4.1-3.4 7.4-7.5 7.4z"/>',
  ad: '<rect x="1.5" y="5" width="21" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><text x="12" y="15.6" text-anchor="middle" font-size="9" font-weight="700" font-family="system-ui,sans-serif">AD</text>',
  fullscreen: '<path d="M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z"/>',
  exitFullscreen: '<path d="M5 16h3v3h2v-5H5zm3-8H5v2h5V5H8zm6 11h2v-3h3v-2h-5zm2-11V5h-2v5h5V8z"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

const scriptOrigin = new URL(import.meta.url).origin;

// Some browsers load the voice list lazily; ask early so it is ready when needed.
if ('speechSynthesis' in window) speechSynthesis.getVoices();

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
  const secs = fill(r === 1 ? t.second : t.seconds, { n: r });
  const mins = fill(m === 1 ? t.minute : t.minutes, { n: m });
  if (!m) return secs;
  return r ? `${mins} ${secs}` : mins;
}

function slowConnection() {
  const c = navigator.connection;
  return !!c && (c.saveData || ['slow-2g', '2g', '3g'].includes(c.effectiveType));
}

const STYLE = `
/* Take the host's look where it offers one (Bootstrap variables on Savanna), with our own fallbacks. */
:host { display: block; font-family: var(--bs-body-font-family, system-ui, "Noto Sans"), "Noto Sans Ethiopic", "Nyala", "Abyssinica SIL", sans-serif;
  --ap-accent: var(--bs-primary, #0b5cad); --ap-bg: #ffffff; --ap-fg: #16181d; --ap-muted: #4a5060; --ap-line: #8a90a0; --ap-focus: #0b5cad;
  --ap-panel: #f3f5f8; --ap-current: #fff1b8; color: var(--ap-fg);
  --ap-action: color-mix(in srgb, var(--bs-primary, #0b5cad) 78%, black); }
:host([theme=dark]) { --ap-accent: #8cc4ff; --ap-bg: #15181e; --ap-fg: #eef0f4; --ap-muted: #b8bfcc; --ap-line: #7c8496; --ap-focus: #8cc4ff;
  --ap-panel: #1f232b; --ap-current: #4a3f00; --ap-action: #1d5fa8; }
@media (prefers-color-scheme: dark) {
  :host(:not([theme=light])) { --ap-accent: #8cc4ff; --ap-bg: #15181e; --ap-fg: #eef0f4; --ap-muted: #b8bfcc; --ap-line: #7c8496; --ap-focus: #8cc4ff;
    --ap-panel: #1f232b; --ap-current: #4a3f00; --ap-action: #1d5fa8; }
}
/* Ethiopic needs more line height; never capitals or letter spacing. */
.player:lang(am) { line-height: 1.7; }
.cc-text:lang(am) { line-height: 1.6; }
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
.cc { position: absolute; inset-inline: 0; bottom: 4%; display: flex; justify-content: center; padding: 0 4%; padding-left: max(4%, var(--cc-avoid-left, 0px)); padding-right: max(4%, var(--cc-avoid-right, 0px)); pointer-events: none; }
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
.controls { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.25rem 0.5rem 0.5rem; container-type: inline-size; }
/* Three rows: watch, follow the lesson with, more. Equal-width buttons that wrap evenly on any screen. */
.row { display: grid; grid-template-columns: repeat(auto-fit, minmax(4.75rem, 1fr)); gap: 0.35rem; align-items: stretch; }
.row.access { padding-top: 0.5rem; border-top: 1px solid var(--ap-line); grid-template-columns: repeat(var(--n, 4), 1fr); }
/* Narrow players (phones): the ways to follow the lesson as an even 2 × 2. */
@container (max-width: 28rem) { .row.access { grid-template-columns: repeat(2, 1fr); } }
.row.more { padding-top: 0.5rem; border-top: 1px solid var(--ap-line); grid-template-columns: minmax(9rem, 2fr) repeat(auto-fit, minmax(6rem, 1fr)); align-items: end; }
@media (max-width: 26rem) { .row.more { grid-template-columns: 1fr 1fr; } .row.more .lang-field { grid-column: 1 / -1; } }
.row-label { grid-column: 1 / -1; font-size: 0.9rem; font-weight: 600; color: var(--ap-muted); }
.row .ctl { width: 100%; min-height: 56px; border-color: var(--ap-line); background: var(--ap-bg); font-size: 0.85rem; }
.lang-field select { width: 100%; }
/* Play is the main action. Darkened host colour keeps white text readable. */
.ctl.primary { background: var(--ap-action); border-color: var(--ap-action); color: #fff; font-weight: 600; }
.ctl.primary:hover { background: var(--ap-action); filter: brightness(1.1); }
/* On/off shown by more than colour: thicker border, bold, and a tick. */
.ctl[aria-pressed=true] { border: 2px solid var(--ap-accent); background: var(--ap-panel); font-weight: 700; }
/* Shown, not spoken: screen readers already say "pressed". */
.ctl[aria-pressed=true] .lbl::before { content: "✓ " / ""; }
.group { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.25rem; }
.spacer { flex: 1 1 0; }
button, select { font: inherit; color: inherit; }
.ctl { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  min-width: 48px; min-height: 48px; padding: 4px 6px; border: 1px solid transparent; border-radius: 6px;
  background: transparent; cursor: pointer; font-size: 0.75rem; line-height: 1.1; color: inherit; text-decoration: none; text-align: center; }
.ctl svg { fill: currentColor; }
.ctl:hover { background: var(--ap-panel); border-color: var(--ap-line); }
.ctl[aria-pressed=true], .ctl[aria-expanded=true] { background: var(--ap-panel); border-color: var(--ap-accent); }
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
dialog.help { max-width: min(32rem, calc(100vw - 2rem)); border: 1px solid var(--ap-line); border-radius: 8px; padding: 1rem; background: var(--ap-bg); color: var(--ap-fg); }
dialog.help::backdrop { background: rgb(0 0 0 / 0.5); }
dialog.help h2 { font-size: 1.15rem; margin: 0 0 0.75rem; }
dialog.help dl { display: grid; grid-template-columns: auto 1fr; gap: 0.4rem 0.75rem; margin: 0 0 1rem; }
dialog.help dt kbd { font-family: inherit; font-weight: 700; border: 1px solid var(--ap-line); border-radius: 4px; padding: 0 0.4em; white-space: nowrap; }
dialog.help dd { margin: 0; }
.text-btn { min-height: 44px; padding: 0 1rem; border: 1px solid var(--ap-line); border-radius: 6px; background: var(--ap-bg); cursor: pointer; }
.stage:focus-visible { outline: 3px solid #ffeb3b; outline-offset: -3px; }
.sign-tools { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.sign-tools:not([hidden]) + .sign-off-hint, .sign-tools:not([hidden]) ~ .sign-off-hint { display: none; }
.sign-tools[hidden] { display: none; }
.sign-tools button { min-height: 44px; min-width: 44px; padding: 0 0.6rem; border: 1px solid var(--ap-line); border-radius: 6px; background: var(--ap-bg); cursor: pointer; font-size: 0.85rem; }
.sign-tools button[aria-pressed=true] { border-color: var(--ap-accent); background: var(--ap-panel); font-weight: 600; }
.note { margin: 0; padding: 0.5rem 0.75rem; background: var(--ap-panel); border-top: 1px solid var(--ap-line); }
.note:empty { display: none; }
.ctl .size { font-size: 0.7rem; color: var(--ap-muted); }
.media { position: relative; background: #000; }
.sign { position: absolute; z-index: 2; left: 0; top: 0; width: 28%; aspect-ratio: var(--sign-ratio, 3 / 4);
  background: #000; border: 2px solid #fff; border-radius: 6px; overflow: hidden; touch-action: none; cursor: move;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.6); }
.sign[hidden] { display: none; }
.sign video { display: block; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
.sign:focus-visible { outline: 4px solid #ffeb3b; outline-offset: 0; }
.sign-resize { position: absolute; right: 0; bottom: 0; width: 32px; height: 32px; cursor: nwse-resize; touch-action: none;
  background: linear-gradient(135deg, transparent 0 55%, #fff 55% 62%, transparent 62% 70%, #fff 70% 77%, transparent 77%); }
.media.beside { display: flex; align-items: center; gap: 4px; }
.media.beside .stage { flex: 1 1 auto; min-width: 0; }
.media.beside .sign { position: static; flex: 0 0 auto; border: 0; border-radius: 0; box-shadow: none; cursor: default; }
.media.beside .sign-resize { display: none; }
@media (max-width: 30rem) { .media.beside { flex-direction: column; } .media.beside .stage { width: 100%; align-self: stretch; } .media.beside .sign { width: 60% !important; } }
.ad-text { margin: 0; padding: 0.5rem 0.75rem; background: var(--ap-panel); border-top: 1px solid var(--ap-line); font-style: italic; }
.ad-text[hidden] { display: none; }
.ad-text strong { font-style: normal; }
fieldset { border: 1px solid var(--ap-line); border-radius: 6px; margin: 0 0 0.75rem; padding: 0.5rem 0.75rem 0.75rem; }
legend { font-weight: 600; padding: 0 0.25rem; }
.check { display: flex; align-items: center; gap: 0.5rem; min-height: 44px; flex-basis: 100%; }
.check input { width: 1.25rem; height: 1.25rem; accent-color: var(--ap-accent); }
.hint { flex-basis: 100%; margin: 0; font-size: 0.85rem; color: var(--ap-muted); }
.cue.desc span { font-style: italic; }
.docs { margin: 0.25rem 0 0; padding-inline-start: 1.25rem; }
.docs a { color: var(--ap-focus); display: inline-block; padding: 0.6rem 0; }
/* Ethiopic has no true italic; slanted script is harder to read. */
.cue.desc:lang(am) span, .ad-text:lang(am), .ad-text span:lang(am) { font-style: normal; }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; transition: none !important; } }
@media (max-width: 30rem) { .volume { display: none; } }
`;

class DbPlayer extends HTMLElement {
  static observedAttributes = ['lesson', 'api', 'src', 'captions', 'sign', 'describe', 'lang'];

  #root;
  #els = {};
  #manifest = null;
  #prefs = loadPrefs();
  #lastCaption = null;
  #cueButtons = [];
  #connected = false;
  #lastDescription = null;
  #spokenCues = new WeakSet();
  #adResumeTimer = 0;
  #adPausedVideo = false;
  #resizeObserver = null;
  #t = null;
  #uiLang = 'en';
  #lastProgress = -1;
  #settingUp = false;
  #signAsked = false;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
  }

  get t() { return this.#t; }
  get uiLang() { return this.#uiLang; }

  #emit(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(`db-player:${name}`, { bubbles: true, composed: true, detail }));
  }

  /** Save preferences on this device and tell the host what changed. */
  #savePrefs() {
    this.#prefs = { ...loadPrefs(), ...this.#prefs, lang: loadPrefs().lang ?? this.#prefs.lang };
    storePrefs(this.#prefs);
    if (this.#settingUp) return;
    const p = this.#prefs;
    this.#emit('prefs', {
      language: this.uiLang, captionLanguage: p.captions || null, captionSize: p.ccSize || 'm', captionColor: p.ccColour || 'white',
      captionBackground: p.ccBg || 'black', signOn: !!p.signOn, signPosition: p.signPlace || null,
      signWidth: p.signWidth || null, audioDescription: p.ad || null, speed: p.speed || 1,
    });
  }

  #onFullscreen = () => this.#updateFullscreen();

  #announcingLanguage = false;
  #onLanguage = (e) => {
    if (this.#announcingLanguage || !this.#manifest || e.detail.lang === this.uiLang) return;
    this.#setLanguage(e.detail.lang, false);
  };

  connectedCallback() {
    this.#connected = true;
    document.addEventListener('db:language', this.#onLanguage);
    document.addEventListener('fullscreenchange', this.#onFullscreen);
    this.#load();
  }

  disconnectedCallback() {
    this.#connected = false;
    document.removeEventListener('fullscreenchange', this.#onFullscreen);
    document.removeEventListener('db:language', this.#onLanguage);
    this.#resizeObserver?.disconnect();
    this.#stopDescription();
    this.#els.video?.pause();
  }

  /** The learner's own language choice wins over the host's default (the lang attribute). */
  #wantedLang() { return preferredLanguage(this.getAttribute('lang')); }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.#connected || oldValue === newValue) return;
    if (name === 'lang' && this.#manifest) {
      if (loadPrefs().lang) return; // the learner already chose a language
      loadStrings(newValue).then(({ lang, t }) => { this.#t = t; this.#uiLang = lang; this.#render(this.#manifest, true); });
    } else {
      this.#load();
    }
  }

  /** Public API for host pages. */
  play() { return this.#els.video?.play(); }
  pause() { this.#els.video?.pause(); }
  get currentTime() { return this.#els.video?.currentTime ?? 0; }
  set currentTime(v) { if (this.#els.video) this.#els.video.currentTime = v; }

  async #load() {
    try {
      const { lang, t } = await loadStrings(this.#wantedLang());
      this.#t = t; this.#uiLang = lang;
    } catch (err) {
      console.error(err);
      this.#root.textContent = 'The video player could not load its text files.';
      return;
    }
    const t = this.t;
    this.#root.innerHTML = `<style>${STYLE}</style><div class="player" lang="${this.uiLang}"><div class="stage"><div class="message" role="status">${t.loading}</div></div></div>`;
    try {
      const manifest = this.getAttribute('lesson') ? await this.#fetchLesson() : this.#lessonFromAttributes();
      if (!manifest.sources.length) throw new Error('no video source: set src="..." or lesson="..."');
      this.#manifest = manifest;
      this.#render(manifest);
    } catch (err) {
      console.error('db-player: could not load the lesson', err);
      const msg = this.#root.querySelector('.message');
      if (msg) { msg.setAttribute('role', 'alert'); msg.textContent = t.loadError; }
    }
  }

  /** Level 2: lesson metadata from the API. */
  async #fetchLesson() {
    const api = (this.getAttribute('api') || scriptOrigin).replace(/\/$/, '');
    const url = `${api}/api/v1/lessons/${encodeURIComponent(this.getAttribute('lesson'))}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const m = await res.json();
    const abs = (p) => (p ? new URL(p, url).href : p);
    return {
      ...m,
      poster: abs(m.poster),
      sources: (m.sources || []).map((x) => ({ ...x, src: abs(x.src) })),
      tracks: (m.tracks || []).map((x) => ({ ...x, src: abs(x.src) })),
      sign: m.sign?.src ? { ...m.sign, src: abs(m.sign.src) } : null,
      describeAudio: abs(m.describeAudio),
      offline: abs(m.links?.offlinePack),
      document: abs(m.links?.document),
    };
  }

  /** Level 1: everything from attributes, no server. Caption language comes from the file name: lesson.am.vtt. */
  #lessonFromAttributes() {
    const abs = (p) => (p ? new URL(p, document.baseURI).href : p);
    const list = (name) => (this.getAttribute(name) || '').split(',').map((x) => x.trim()).filter(Boolean).map(abs);
    const langOf = (u) => (/\.([a-z]{2,3}(?:-[a-z0-9]{2,8})?)\.vtt(?:[?#]|$)/i.exec(u) || [])[1] || 'en';
    const label = (code) => { try { return new Intl.DisplayNames([code], { type: 'language' }).of(code) || code; } catch { return code; } };
    const track = (kind) => (u) => ({ kind, srclang: langOf(u), label: label(langOf(u)), src: u });
    const describe = list('describe');
    const src = abs(this.getAttribute('src'));
    return {
      id: this.getAttribute('id') || null,
      title: this.getAttribute('label') || '',
      lang: this.getAttribute('lang') || 'en',
      poster: abs(this.getAttribute('poster')),
      sources: src ? [{ quality: 'video', src }] : [],
      tracks: [...list('captions').map(track('captions')), ...describe.filter((u) => /\.vtt(?:[?#]|$)/i.test(u)).map(track('descriptions'))],
      describeAudio: describe.find((u) => !/\.vtt(?:[?#]|$)/i.test(u)) || null,
      sign: this.getAttribute('sign') ? { src: abs(this.getAttribute('sign')) } : null,
      offline: null,
    };
  }

  #render(m, keepTime = false) {
    const t = this.t;
    const prev = this.#els.video;
    const resumeAt = keepTime && prev ? prev.currentTime : 0;
    const wasPlaying = keepTime && prev && !prev.paused;
    prev?.pause();
    this.#stopDescription();
    this.#resizeObserver?.disconnect();

    const level = Math.min(6, Math.max(2, Number(this.getAttribute('heading-level')) || 2));
    const captionTracks = m.tracks.filter((tr) => tr.kind === 'captions' || tr.kind === 'subtitles');
    const descTracks = m.tracks.filter((tr) => tr.kind === 'descriptions');
    const hasSign = !!m.sign?.src;
    const hasAd = descTracks.length > 0 || !!m.describeAudio;
    const places = ['tl', 'tr', 'bl', 'br', 'beside'];
    // Languages offered by the one switch: the interface languages plus any caption or description language.
    const langs = [...new Set(['en', 'am', ...m.tracks.map((tr) => tr.srclang).filter(Boolean)])];
    const qualities = m.sources.map((s) => s.quality);
    const titleId = 'ap-title';

    this.#root.innerHTML = `
<style>${STYLE}</style>
<div class="player" role="region" aria-labelledby="${titleId}" lang="${this.uiLang}">
  <span id="${titleId}" class="sr-only">${t.player}: ${escapeHtml(m.title || '')}</span>
  <div class="media">
    <div class="stage" tabindex="0" role="group" aria-label="${t.video}: ${escapeAttr(m.title || '')}" aria-describedby="ap-stage-hint">
      <video class="main" playsinline preload="metadata" crossorigin="anonymous" ${m.poster ? `poster="${escapeAttr(m.poster)}"` : ''} lang="${escapeAttr(m.lang || 'en')}">
        ${captionTracks.map((tr, i) => `<track kind="${tr.kind}" srclang="${escapeAttr(tr.srclang)}" label="${escapeAttr(tr.label)}" src="${escapeAttr(tr.src)}" data-kind="captions" data-i="${i}">`).join('')}
        ${descTracks.map((tr, i) => `<track kind="descriptions" srclang="${escapeAttr(tr.srclang)}" label="${escapeAttr(tr.label)}" src="${escapeAttr(tr.src)}" data-kind="descriptions" data-i="${i}">`).join('')}
      </video>
      <div class="cc" aria-hidden="true"><span class="cc-text"></span></div>
      <div class="message"></div>
    </div>
    ${hasSign ? `<div class="sign" hidden tabindex="0" role="group" aria-label="${t.signWindow}" aria-describedby="ap-sign-help">
      <video class="sign-video" muted playsinline preload="none" crossorigin="anonymous" aria-hidden="true"></video>
      <div class="sign-resize" aria-hidden="true"></div>
    </div>
    <span id="ap-sign-help" class="sr-only">${t.signHelp}</span>` : ''}
  </div>
  <span id="ap-stage-hint" class="sr-only">${t.stageHint}</span>
  ${m.describeAudio ? `<audio class="ad-audio" preload="none" crossorigin="anonymous" src="${escapeAttr(m.describeAudio)}"></audio>` : ''}
  <p class="note" role="status"></p>
  <p class="ad-text" aria-hidden="true" hidden></p>
  <div class="seek-row">
    <input class="seek" type="range" min="0" max="${Number(m.duration) || 0}" step="1" value="0" aria-label="${t.seek}">
    <span class="time" aria-hidden="true"><span class="cur">0:00</span> / <span class="dur">${clock(m.duration)}</span></span>
  </div>
  <div class="controls">
    <div class="row main">
      <button type="button" class="ctl play primary">${icon('play')}<span class="lbl">${t.play}</span></button>
      <button type="button" class="ctl back">${icon('back')}<span class="lbl">${t.back}</span></button>
      <button type="button" class="ctl forward">${icon('forward')}<span class="lbl">${t.forward}</span></button>
      ${document.fullscreenEnabled ? `<button type="button" class="ctl fs">${icon('fullscreen')}<span class="lbl">${t.fullscreen}</span></button>` : ''}
    </div>
    <div class="row access" role="group" aria-labelledby="ap-follow" style="--n: ${hasAd ? 4 : 3}">
      <span class="row-label" id="ap-follow">${t.followWith}</span>
      <button type="button" class="ctl cc-btn" aria-pressed="false">${icon('cc')}<span class="lbl">${t.captions}</span></button>
      <button type="button" class="ctl sign-btn" aria-pressed="false">${icon('sign')}<span class="lbl">${t.sign}</span></button>
      ${hasAd ? `<button type="button" class="ctl ad-btn" aria-pressed="false">${icon('ad')}<span class="lbl">${t.ad}</span></button>` : ''}
      <button type="button" class="ctl transcript-btn" aria-expanded="false" aria-controls="ap-transcript">${icon('transcript')}<span class="lbl">${t.showTranscript}</span></button>
    </div>
    <div class="row more">
      <div class="field lang-field"><label for="ap-lang">${t.languageLabel}</label>
        <select id="ap-lang" class="lang-select">
          ${langs.map((code) => `<option value="${escapeAttr(code)}" lang="${escapeAttr(code)}"${code === this.uiLang ? ' selected' : ''}>${escapeHtml(languageName(code))}</option>`).join('')}
        </select>
      </div>
      ${m.offline ? `<a class="ctl offline" href="${escapeAttr(m.offline)}" download>${icon('download')}<span class="lbl">${t.download}</span><span class="size"></span></a>` : ''}
      <button type="button" class="ctl settings-btn" aria-expanded="false" aria-controls="ap-settings">${icon('settings')}<span class="lbl">${t.settings}</span></button>
    </div>
  </div>
  <div id="ap-settings" class="panel settings-panel" hidden>
    <fieldset>
      <legend>${t.captions}</legend>
      <div class="style-grid">
        <div class="field"><label for="ap-cc-select">${t.captionLanguage}</label>
          <select id="ap-cc-select" class="cc-select">
            <option value="">${t.off}</option>
            ${captionTracks.map((tr, i) => `<option value="${i}" lang="${escapeAttr(tr.srclang)}">${escapeHtml(tr.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label for="ap-cc-size">${t.size}</label><select id="ap-cc-size" class="cc-size">${Object.keys(SIZES).map((k) => `<option value="${k}">${t.sizes[k]}</option>`).join('')}</select></div>
        <div class="field"><label for="ap-cc-colour">${t.textColour}</label><select id="ap-cc-colour" class="cc-colour">${Object.keys(COLOURS).map((k) => `<option value="${k}">${t.colours[k]}</option>`).join('')}</select></div>
        <div class="field"><label for="ap-cc-bg">${t.background}</label><select id="ap-cc-bg" class="cc-bg">${Object.keys(BACKGROUNDS).map((k) => `<option value="${k}">${t.backgrounds[k]}</option>`).join('')}</select></div>
        <div class="preview" aria-hidden="true"><span class="cc-text sample">${t.sample}</span></div>
      </div>
    </fieldset>
    ${hasSign ? `<fieldset>
      <legend>${t.signTools}</legend>
      <p class="hint sign-off-hint">${t.signTurnOnFirst}</p>
      <div class="sign-tools" hidden>
        ${places.map((k) => `<button type="button" data-place="${k}" aria-pressed="false">${t.places[k]}</button>`).join('')}
        <button type="button" data-grow="1">${t.larger}</button>
        <button type="button" data-grow="-1">${t.smaller}</button>
      </div>
    </fieldset>` : ''}
    ${hasAd ? `<fieldset>
      <legend>${t.ad}</legend>
      <div class="style-grid">
        <div class="field"><label for="ap-ad-select">${t.adLanguage}</label>
          <select id="ap-ad-select" class="ad-select">
            <option value="">${t.off}</option>
            ${descTracks.map((tr, i) => `<option value="${i}" lang="${escapeAttr(tr.srclang)}">${escapeHtml(tr.label)}</option>`).join('')}
            ${m.describeAudio ? `<option value="audio">${t.adAudio}</option>` : ''}
          </select>
        </div>
        ${descTracks.length ? `<div class="field"><label for="ap-ad-mode">${t.adReadBy}</label><select id="ap-ad-mode" class="ad-mode">${Object.keys(t.adModes).map((k) => `<option value="${k}">${t.adModes[k]}</option>`).join('')}</select></div>
        <label class="check"><input type="checkbox" class="ad-pause"> ${t.adPause}</label>` : ''}
      </div>
    </fieldset>` : ''}
    <fieldset>
      <legend>${t.playback}</legend>
      <div class="style-grid">
        <div class="field"><label for="ap-speed">${t.speed}</label>
          <select id="ap-speed" class="speed">${SPEEDS.map((x) => `<option value="${x}"${x === 1 ? ' selected' : ''}>${x}×</option>`).join('')}</select>
        </div>
        ${qualities.length > 1 ? `<div class="field"><label for="ap-quality">${t.quality}</label>
          <select id="ap-quality" class="quality">${qualities.map((q) => `<option value="${escapeAttr(q)}">${q === 'audio' ? t.audioOnly : escapeHtml(q)}</option>`).join('')}</select>
        </div>` : ''}
        <button type="button" class="ctl mute">${icon('volume')}<span class="lbl">${t.mute}</span></button>
        <div class="field"><label for="ap-volume">${t.volume}</label><input id="ap-volume" class="volume" type="range" min="0" max="100" step="5" value="100"></div>
        <button type="button" class="ctl help-btn" aria-haspopup="dialog">${icon('keyboard')}<span class="lbl">${t.keyboardHelp}</span></button>
      </div>
    </fieldset>
  </div>
  <section id="ap-transcript" class="panel transcript" hidden aria-labelledby="ap-transcript-h">
    <h${level} id="ap-transcript-h">${t.transcript}</h${level}>
    <label><input type="checkbox" class="follow" checked> ${t.followAlong}</label>
    <ol class="cues"></ol>
    <p><button type="button" class="text-btn transcript-dl">${t.downloadTranscript}</button></p>
    ${m.document ? `<ul class="docs">
      <li><a class="doc-html" href="${escapeAttr(m.document)}?lang=${this.uiLang}&amp;format=html">${t.docHtml}</a></li>
      <li><a class="doc-pdf" href="${escapeAttr(m.document)}?lang=${this.uiLang}&amp;format=pdf">${t.docPdf}</a></li>
    </ul>` : ''}
  </section>
  <dialog class="help" aria-labelledby="ap-help-h">
    <h2 id="ap-help-h">${t.keyboardHelp}</h2>
    <dl>${t.keys.map(([k, d]) => `<dt><kbd>${escapeHtml(k)}</kbd></dt><dd>${escapeHtml(d)}</dd>`).join('')}</dl>
    <button type="button" class="text-btn help-close">${t.close}</button>
  </dialog>
  <div class="status sr-only" role="status" aria-live="polite"></div>
  <div class="ad-live sr-only" aria-live="assertive" aria-atomic="true"></div>
</div>`;

    const $ = (sel) => this.#root.querySelector(sel);
    const els = this.#els = {
      player: $('.player'), media: $('.media'), stage: $('.stage'), video: $('video.main'), cc: $('.cc-text:not(.sample)'), sample: $('.sample'),
      message: $('.message'), seek: $('.seek'), cur: $('.cur'), dur: $('.dur'),
      play: $('.play'), back: $('.back'), forward: $('.forward'), mute: $('.mute'), volume: $('.volume'),
      ccSelect: $('.cc-select'), settingsBtn: $('.settings-btn'), settingsPanel: $('.settings-panel'),
      ccSize: $('.cc-size'), ccColour: $('.cc-colour'), ccBg: $('.cc-bg'),
      speed: $('.speed'), quality: $('.quality'), transcriptBtn: $('.transcript-btn'), transcript: $('.transcript'),
      follow: $('.follow'), cues: $('.cues'), fs: $('.fs'), status: $('.status'),
      sign: $('.sign'), signVideo: $('.sign-video'), signResize: $('.sign-resize'), signBtn: $('.sign-btn'),
      signTools: $('.sign-tools'), note: $('.note'), adAudio: $('.ad-audio'),
      help: $('dialog.help'), helpBtn: $('.help-btn'), offline: $('.offline'), transcriptDl: $('.transcript-dl'),
      langSelect: $('.lang-select'), adSelect: $('.ad-select'), ccBtn: $('.cc-btn'), adBtn: $('.ad-btn'), signOffHint: $('.sign-off-hint'), adMode: $('.ad-mode'), adPause: $('.ad-pause'), adText: $('.ad-text'), adLive: $('.ad-live'),
    };
    if (m.poster) els.stage.style.setProperty('--ap-poster', `url("${m.poster.replace(/["\\\n]/g, encodeURIComponent)}")`);

    this.#settingUp = true;
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

    // Audio description: remembered language; read by the screen reader and pause the video by default.
    if (els.adSelect) {
      const adIndex = descTracks.findIndex((tr) => tr.srclang === this.#prefs.ad);
      els.adSelect.value = adIndex >= 0 ? String(adIndex) : '';
      this.#lastDescription = adIndex >= 0 ? adIndex : Math.max(0, descTracks.findIndex((tr) => tr.srclang === this.uiLang));
      if (els.adMode) els.adMode.value = this.#prefs.adMode in t.adModes ? this.#prefs.adMode : 'sr';
      if (els.adPause) els.adPause.checked = this.#prefs.adPause !== false;
      els.adBtn?.setAttribute('aria-pressed', String(els.adSelect.value !== ''));
    }

    // Sign language window: remembered size, position and on/off.
    if (els.sign) {
      this.#resizeObserver = new ResizeObserver(() => this.#layoutSign());
      this.#resizeObserver.observe(els.media);
      this.#setSign(!!this.#prefs.signOn);
    }

    this.#settingUp = false;
    if (els.offline) this.#showOfflineSize(m.offline);
    this.#emit('ready', { lesson: m.id });
  }

  #bind(m, captionTracks) {
    const els = this.#els;
    const v = els.video;
    const t = this.t;

    // All tracks "hidden": cues load and fire events, but the browser draws nothing; we draw captions ourselves.
    for (const tr of v.textTracks) tr.mode = 'hidden';
    for (const trackEl of v.querySelectorAll('track')) {
      const i = Number(trackEl.dataset.i);
      if (trackEl.dataset.kind === 'descriptions') {
        trackEl.addEventListener('load', () => { if (!els.transcript.hidden) this.#buildTranscript(); });
        trackEl.track.addEventListener('cuechange', () => this.#onDescriptionCue(i, trackEl.track));
      } else {
        trackEl.addEventListener('load', () => { if (this.#transcriptTrackIndex() === i) this.#buildTranscript(); });
        trackEl.track.addEventListener('cuechange', () => this.#onCueChange(i));
      }
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
    v.addEventListener('timeupdate', () => {
      if (!seeking) els.seek.value = String(Math.floor(v.currentTime));
      this.#updateTime(); this.#highlightCue(); this.#syncFollowers();
      this.#progress();
    });
    v.addEventListener('play', () => {
      // The learner pressed play while a description had paused the video: stop the description and carry on.
      if (this.#adPausedVideo) this.#stopDescription();
      this.#updatePlay(); this.#syncFollowers(true);
    });
    v.addEventListener('pause', () => { this.#updatePlay(); this.#syncFollowers(); this.#progress(true); });
    v.addEventListener('ended', () => { this.#updatePlay(); this.#syncFollowers(); this.#progress(true); this.#emit('complete', { lesson: this.#manifest.id }); });
    v.addEventListener('seeking', () => { this.#stopDescription(); this.#spokenCues = new WeakSet(); });
    v.addEventListener('seeked', () => this.#syncFollowers(true));
    v.addEventListener('ratechange', () => this.#syncFollowers());
    v.addEventListener('volumechange', () => this.#updateMute());
    v.addEventListener('waiting', () => { els.message.textContent = t.loading; els.signVideo?.pause(); });
    v.addEventListener('playing', () => { els.message.textContent = ''; });
    v.addEventListener('canplay', () => { els.message.textContent = ''; });
    v.addEventListener('error', () => {
      els.message.textContent = t.loadError;
      this.#announce(t.loadError);
    });

    els.ccSelect.addEventListener('change', () => this.#selectCaptions());
    // One tap: captions and audio description come on in the learner's language.
    els.ccBtn.addEventListener('click', () => this.#toggleCaptions());
    els.adBtn?.addEventListener('click', () => this.#toggleDescriptions());
    els.langSelect.addEventListener('change', () => this.#setLanguage(els.langSelect.value));
    els.settingsBtn.addEventListener('click', () => this.#togglePanel(els.settingsBtn, els.settingsPanel));
    for (const sel of [els.ccSize, els.ccColour, els.ccBg]) sel.addEventListener('change', () => this.#applyCaptionStyle(true));

    if (els.adSelect) {
      els.adSelect.addEventListener('change', () => this.#selectDescriptions());
      els.adMode?.addEventListener('change', () => { this.#prefs.adMode = els.adMode.value; this.#savePrefs(); });
      els.adPause?.addEventListener('change', () => { this.#prefs.adPause = els.adPause.checked; this.#savePrefs(); });
    }

    if (els.sign) this.#bindSign();
    els.signBtn.addEventListener('click', () => {
      if (els.sign) { this.#setSign(els.sign.hidden, true); return; }
      // No interpreter video for this lesson yet: say so in words, and let the host know it was wanted.
      els.note.textContent = t.signNone;
      this.#emit('sign-requested', { lesson: this.#manifest.id });
      // Lessons from our API: count the request (anonymous) so interpreters know what to record next.
      if (this.getAttribute('lesson') && !this.#signAsked) {
        this.#signAsked = true;
        const api = (this.getAttribute('api') || scriptOrigin).replace(/\/$/, '');
        fetch(`${api}/api/v1/lessons/${encodeURIComponent(this.getAttribute('lesson'))}/sign-requests`, { method: 'POST' })
          .then((r) => { if (r.ok) els.note.textContent = `${t.signNone} ${t.signRequested}`; })
          .catch(() => {});
      }
    });
    els.helpBtn.addEventListener('click', () => els.help.showModal());
    this.#root.querySelector('.help-close').addEventListener('click', () => els.help.close());
    els.help.addEventListener('close', () => els.helpBtn.focus());
    els.transcriptDl.addEventListener('click', () => this.#downloadTranscript());

    els.speed.addEventListener('change', () => {
      v.playbackRate = Number(els.speed.value);
      this.#prefs.speed = v.playbackRate; this.#savePrefs();
    });
    els.quality?.addEventListener('change', () => {
      this.#prefs.quality = els.quality.value; this.#savePrefs();
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
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'DIALOG' || e.target?.closest?.('dialog')) return;
    const t = this.t;
    const v = this.#els.video;
    // Space keeps its normal job on buttons and links (it presses them); elsewhere it plays and pauses.
    if (e.key === ' ' && (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY')) return;
    switch (e.key.toLowerCase()) {
      case ' ':
      case 'k': this.#togglePlay(); this.#announce(v.paused ? t.paused : t.playing); break;
      case 'arrowleft': this.#skip(-5, true); break;
      case 'arrowright': this.#skip(5, true); break;
      case '?': this.#els.help.showModal(); break;
      case 'j': this.#skip(-10, true); break;
      case 'l': this.#skip(10, true); break;
      case 'm': this.#toggleMute(); this.#announce(v.muted ? t.muted : t.unmuted); break;
      case 'c': this.#toggleCaptions(); break;
      case 'd': if (this.#els.adSelect) this.#toggleDescriptions(); else return; break;
      case 's': this.#els.signBtn.click(); break;
      case 't': this.#els.transcriptBtn.click(); break;
      case 'f': this.#toggleFullscreen(); break;
      default: return;
    }
    e.preventDefault();
  }

  // ---------- Sign language window ----------

  #bindSign() {
    const els = this.#els;
    const sign = els.sign;
    const sv = els.signVideo;

    els.signTools.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.place) this.#prefs.signPlace = btn.dataset.place;
      if (btn.dataset.grow) this.#prefs.signWidth = clamp(this.#signWidth() + Number(btn.dataset.grow) * 0.06, SIGN_MIN, SIGN_MAX);
      this.#layoutSign();
      this.#savePrefs();
    });
    sv.addEventListener('loadedmetadata', () => {
      if (sv.videoWidth && sv.videoHeight) sign.style.setProperty('--sign-ratio', `${sv.videoWidth} / ${sv.videoHeight}`);
      this.#layoutSign();
      this.#syncFollowers(true);
    });

    // Pointer: drag the window to move it; drag the corner handle to resize it.
    let drag = null;
    sign.addEventListener('pointerdown', (e) => {
      if (els.media.classList.contains('beside') || e.button > 0) return;
      const mediaBox = els.media.getBoundingClientRect();
      const box = sign.getBoundingClientRect();
      drag = {
        mode: e.target === els.signResize ? 'resize' : 'move',
        x: e.clientX, y: e.clientY,
        left: box.left - mediaBox.left, top: box.top - mediaBox.top, width: box.width,
        mediaW: mediaBox.width, mediaH: mediaBox.height,
      };
      sign.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    sign.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (drag.mode === 'resize') {
        this.#prefs.signWidth = clamp((drag.width + dx) / drag.mediaW, SIGN_MIN, SIGN_MAX);
      } else {
        this.#prefs.signPlace = 'custom';
        this.#prefs.signX = (drag.left + dx) / drag.mediaW;
        this.#prefs.signY = (drag.top + dy) / drag.mediaH;
      }
      this.#layoutSign();
    });
    const endDrag = () => { if (drag) { drag = null; this.#savePrefs(); } };
    sign.addEventListener('pointerup', endDrag);
    sign.addEventListener('pointercancel', endDrag);

    // Keyboard: arrows move (Shift = bigger steps), + and - resize. Only while the window has focus.
    sign.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const step = e.shiftKey ? 0.1 : 0.03;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[e.key] && !els.media.classList.contains('beside')) {
        const pos = this.#signPosition();
        this.#prefs.signPlace = 'custom';
        this.#prefs.signX = pos.x + moves[e.key][0];
        this.#prefs.signY = pos.y + moves[e.key][1];
      } else if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') {
        const grow = e.key === '+' || e.key === '=' ? 0.06 : -0.06;
        this.#prefs.signWidth = clamp(this.#signWidth() + grow, SIGN_MIN, SIGN_MAX);
      } else {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this.#layoutSign();
      this.#savePrefs();
    });
  }

  #setSign(on, announce = false) {
    const els = this.#els;
    if (!els.sign) return;
    els.sign.hidden = !on;
    els.signTools.hidden = !on;
    if (!on) this.#clearCaptionAvoid();
    els.signBtn.setAttribute('aria-pressed', String(on));
    this.#prefs.signOn = on;
    this.#savePrefs();
    if (on) {
      // Load the interpreter video only when it is wanted, to save data.
      if (!els.signVideo.src) { els.signVideo.src = this.#manifest.sign.src; els.signVideo.preload = 'auto'; }
      this.#layoutSign();
      this.#syncFollowers(true);
    } else {
      els.signVideo.pause();
    }
    // Turning on: one visible hint, which is also announced (it says the window is on). Off: a short announcement.
    if (els.note.textContent === this.t.signMoveHint) els.note.textContent = '';
    if (on && announce) els.note.textContent = this.t.signMoveHint;
    else if (announce) this.#announce(this.t.signOff);
  }

  #clearCaptionAvoid() {
    this.#els.stage.style.setProperty('--cc-avoid-right', '0px');
    this.#els.stage.style.setProperty('--cc-avoid-left', '0px');
  }

  #signWidth() {
    // Default large: hands and face must be readable.
    return clamp(Number(this.#prefs.signWidth) || SIGN_SIZES.l, SIGN_MIN, SIGN_MAX);
  }

  /** Current top-left corner as fractions of the video area. */
  #signPosition() {
    const els = this.#els;
    const mediaBox = els.media.getBoundingClientRect();
    const box = els.sign.getBoundingClientRect();
    return { x: (box.left - mediaBox.left) / mediaBox.width, y: (box.top - mediaBox.top) / mediaBox.height };
  }

  #layoutSign() {
    const els = this.#els;
    const sign = els.sign;
    if (!sign || sign.hidden) return;
    // Default: beside the video on narrow screens (an overlay would cover too much), top right otherwise.
    const place = this.#prefs.signPlace || (els.player.clientWidth < 480 ? 'beside' : 'tr');
    for (const b of els.signTools.querySelectorAll('[data-place]')) b.setAttribute('aria-pressed', String(b.dataset.place === place));
    const beside = place === 'beside';
    els.media.classList.toggle('beside', beside);
    sign.style.cursor = beside ? '' : 'move';

    const W = els.media.clientWidth;
    const width = this.#signWidth() * W;
    sign.style.width = `${width}px`;
    if (beside) { sign.style.left = ''; sign.style.top = ''; this.#clearCaptionAvoid(); return; }

    const H = els.media.clientHeight;
    const height = sign.offsetHeight || width * (4 / 3);
    const m = SIGN_MARGIN;
    let x;
    let y;
    switch (place) {
      case 'tl': x = m; y = m; break;
      case 'bl': x = m; y = H - height - m; break;
      case 'br': x = W - width - m; y = H - height - m; break;
      case 'custom': x = (Number(this.#prefs.signX) || 0) * W; y = (Number(this.#prefs.signY) || 0) * H; break;
      default: x = W - width - m; y = m; // top right
    }
    // Keep the whole window inside the video area.
    x = clamp(x, 0, Math.max(0, W - width));
    y = clamp(y, 0, Math.max(0, H - height));
    sign.style.left = `${x}px`;
    sign.style.top = `${y}px`;
    // Keep captions readable: if the window reaches the caption area, move captions to the other side.
    const reachesCaptions = y + height > H * 0.6;
    const onRight = x + width / 2 > W / 2;
    els.stage.style.setProperty('--cc-avoid-right', reachesCaptions && onRight ? `${W - x + m}px` : '0px');
    els.stage.style.setProperty('--cc-avoid-left', reachesCaptions && !onRight ? `${x + width + m}px` : '0px');
    if (place === 'custom') { this.#prefs.signX = x / W; this.#prefs.signY = y / H; }
  }

  /** Keep the interpreter video and the described-audio track in step with the lesson. */
  #syncFollowers(force = false) {
    const { video: v, signVideo, sign, adAudio, adSelect } = this.#els;
    if (signVideo && !sign.hidden && signVideo.src) follow(v, signVideo, force);
    if (adAudio) {
      if (adSelect?.value === 'audio') follow(v, adAudio, force);
      else if (!adAudio.paused) adAudio.pause();
    }
  }

  /** db-player:progress about every 5 seconds of playback, and on pause and end. */
  #progress(now = false) {
    const v = this.#els.video;
    const seconds = Math.floor(v.currentTime);
    if (!now && Math.abs(seconds - this.#lastProgress) < 5) return;
    this.#lastProgress = seconds;
    const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : this.#manifest.duration;
    this.#emit('progress', { lesson: this.#manifest.id, seconds, percent: d ? Math.min(100, Math.round((v.currentTime / d) * 100)) : 0 });
  }

  /** Show the download size before the learner taps. */
  async #showOfflineSize(url) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      const bytes = Number(res.headers.get('content-length'));
      if (!res.ok || !bytes) return;
      const mb = bytes / 1048576;
      this.#els.offline.querySelector('.size').textContent = `(${fill(this.t.sizeMB, { size: mb < 10 ? mb.toFixed(1) : Math.round(mb) })})`;
    } catch { /* size is a nice-to-have */ }
  }

  #downloadTranscript() {
    const lines = this.#cueButtons.map((b) => `[${b.querySelector('time').textContent}] ${b.querySelector('span').textContent}`);
    if (!lines.length) return;
    const text = `${this.#manifest.title || ''}\r\n\r\n${lines.join('\r\n')}\r\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    a.download = `${this.#manifest.id || 'lesson'}.${this.#els.cues.lang || 'en'}.txt`;
    this.#root.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  // ---------- Audio description ----------

  /**
   * One switch for language: the interface, and captions and audio description if they are on,
   * all move to the chosen language. Remembered on this device.
   */
  async #setLanguage(code, fromThisPlayer = true) {
    const m = this.#manifest;
    const has = (kind) => m.tracks.some((tr) => tr.kind === kind && tr.srclang === code);
    this.#prefs = { ...this.#prefs, lang: code };
    if (fromThisPlayer) {
      // Tell the other components, without reacting to our own announcement.
      this.#announcingLanguage = true;
      setPreferredLanguage(code);
      this.#announcingLanguage = false;
    }
    if (this.#prefs.captions && has('captions')) this.#prefs.captions = code;
    if (this.#prefs.ad && has('descriptions')) this.#prefs.ad = code;
    const { lang, t } = await loadStrings(code);
    this.#t = t; this.#uiLang = lang;
    this.#render(m, true);
    this.#savePrefs();
    // The controls were redrawn in the new language: keep the learner's place and say what changed.
    if (!fromThisPlayer) return;
    this.#els.langSelect.focus();
    this.#announce(`${t.languageLabel}: ${languageName(code)}`);
  }

  #toggleDescriptions() {
    const sel = this.#els.adSelect;
    if (sel.value === '') {
      const own = [...sel.options].findIndex((o) => o.lang === this.uiLang);
      const last = sel.querySelector(`option[value="${this.#lastDescription ?? 0}"]`);
      sel.value = own > 0 ? sel.options[own].value : (last ? last.value : sel.options[1].value);
    } else {
      sel.value = '';
    }
    this.#selectDescriptions(true);
  }

  #selectDescriptions(announce = false) {
    const els = this.#els;
    this.#stopDescription();
    const value = els.adSelect.value;
    els.adBtn?.setAttribute('aria-pressed', String(value !== ''));
    if (value === '') {
      this.#prefs.ad = null;
      if (announce) this.#announce(this.t.adOff);
    } else {
      this.#lastDescription = Number(value);
      const opt = els.adSelect.selectedOptions[0];
      this.#prefs.ad = opt.lang;
      if (announce) this.#announce(`${this.t.ad}: ${opt.textContent}`);
      if (value !== 'audio' && els.adMode?.value === 'voice' && !hasVoice(opt.lang)) this.#announce(this.t.noVoice);
    }
    this.#syncFollowers(true);
    this.#savePrefs();
  }

  #onDescriptionCue(i, track) {
    const els = this.#els;
    if (!els.adSelect || els.adSelect.value === 'audio' || els.adSelect.value !== String(i)) return;
    // Describe only during playback, and each cue once per pass (seeking resets this).
    if (els.video.paused) return;
    const cue = Array.from(track.activeCues || []).find((c) => !this.#spokenCues.has(c));
    if (!cue) return;
    this.#spokenCues.add(cue);
    this.#describe(stripTags(cue.text), track.language || 'en');
  }

  #describe(text, lang) {
    const els = this.#els;
    const v = els.video;
    this.#stopDescription();
    els.adText.innerHTML = '';
    const label = document.createElement('strong');
    label.textContent = `${this.t.description}: `;
    const body = document.createElement('span');
    body.lang = lang;
    body.textContent = text;
    els.adText.append(label, body);
    els.adText.hidden = false;

    const pause = els.adPause?.checked ?? true;
    const resume = () => {
      this.#adResumeTimer = 0;
      if (this.#adPausedVideo && v.paused) { this.#adPausedVideo = false; v.play().catch(() => {}); }
      this.#adPausedVideo = false;
    };
    if (pause && !v.paused) { this.#adPausedVideo = true; v.pause(); }

    if (els.adMode?.value === 'voice' && hasVoice(lang)) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.voice = speechSynthesis.getVoices().find((vo) => vo.lang.toLowerCase().startsWith(lang.toLowerCase())) || null;
      u.rate = Math.min(2, Math.max(0.5, v.playbackRate));
      u.onend = resume;
      u.onerror = resume;
      speechSynthesis.speak(u);
    } else {
      // Screen reader route. We cannot know when it finishes speaking, so estimate reading time.
      els.adLive.lang = lang;
      els.adLive.textContent = '';
      setTimeout(() => { els.adLive.textContent = `${this.t.description}: ${text}`; }, 50);
      if (this.#adPausedVideo) {
        const words = text.split(/\s+/).length;
        this.#adResumeTimer = setTimeout(resume, clamp(1200 + words * 450, 2000, 15000));
      }
    }
  }

  #stopDescription() {
    clearTimeout(this.#adResumeTimer);
    this.#adResumeTimer = 0;
    this.#adPausedVideo = false;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (this.#els.adText) { this.#els.adText.hidden = true; this.#els.adText.textContent = ''; }
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
    if (sel.value === '') {
      // On in the learner's language when the lesson has it; otherwise the last one used.
      const own = [...sel.options].findIndex((o) => o.lang === this.uiLang);
      sel.value = own > 0 ? sel.options[own].value : String(this.#lastCaption ?? 0);
    }
    else sel.value = '';
    this.#selectCaptions(true);
  }

  #selectCaptions(announce = false) {
    const els = this.#els;
    const t = this.t;
    const value = els.ccSelect.value;
    els.ccBtn?.setAttribute('aria-pressed', String(value !== ''));
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
    this.#savePrefs();
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
      this.#savePrefs();
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
    const lang = track.language || '';
    list.lang = lang;
    // Merge in audio descriptions in the same language, so blind learners get them in the transcript too.
    const descTrack = Array.from(els.video.textTracks).find((tr) => tr.kind === 'descriptions' && tr.language === lang);
    const items = [
      ...cues.map((c) => ({ cue: c, desc: false })),
      ...(descTrack?.cues ? Array.from(descTrack.cues) : []).map((c) => ({ cue: c, desc: true })),
    ].sort((a, b) => a.cue.startTime - b.cue.startTime || (a.desc ? -1 : 1));
    for (const { cue, desc } of items) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = desc ? 'cue desc' : 'cue';
      btn.dataset.start = String(cue.startTime);
      btn.dataset.end = String(cue.endTime);
      const time = document.createElement('time');
      time.dateTime = `PT${Math.floor(cue.startTime)}S`;
      time.textContent = clock(cue.startTime);
      const text = document.createElement('span');
      text.textContent = (desc ? `${this.t.description}: ` : '') + stripTags(cue.text).replace(/\n/g, ' ');
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

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
/** Keep a second media element (sign video, described audio) in step with the lesson video. */
function follow(main, el, force) {
  if (el.playbackRate !== main.playbackRate) el.playbackRate = main.playbackRate;
  if (force || Math.abs(el.currentTime - main.currentTime) > 0.3) {
    try { el.currentTime = main.currentTime; } catch { /* not seekable yet */ }
  }
  const shouldPlay = !main.paused && !main.ended;
  if (shouldPlay && el.paused) el.play().catch(() => {});
  else if (!shouldPlay && !el.paused) el.pause();
}
function hasVoice(lang) {
  if (!('speechSynthesis' in window)) return false;
  const l = String(lang || '').toLowerCase();
  return speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith(l));
}
function stripTags(s) { return String(s).replace(/<[^>]+>/g, ''); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
const escapeAttr = escapeHtml;

if (!customElements.get('db-player')) customElements.define('db-player', DbPlayer);
export { DbPlayer };

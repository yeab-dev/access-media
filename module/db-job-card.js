/**
 * <db-job-card> — an accessible job card with "Listen to summary" (Digital Bridge career gateway).
 *
 *   <script type="module" src="https://HOST/module/db-job-card.js"></script>
 *   <db-job-card job="junior-frontend" api="https://HOST"></db-job-card>        (Level 2: from the API)
 *   <db-job-card job="junior-frontend" src="/data/jobs.json"></db-job-card>    (Level 1: any JSON file)
 *
 * Attributes: job, api | src, lang, heading-level (default 3).
 * Events (bubble, composed): db-job-card:listen {job, lang}, db-job-card:apply {job}.
 * Follows the learner's one remembered language choice (shared with <db-player>).
 *
 * Also defines <db-language>: the same language switch for pages without a player.
 */

import { loadStrings, preferredLanguage, setPreferredLanguage, languageName, bothCalendars } from './i18n.js';

const scriptOrigin = new URL(import.meta.url).origin;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Chrome fills the voice list a moment after the page loads: wait for it (briefly) before saying there is none.
function voicesReady(ms = 1500) {
  if (!('speechSynthesis' in window) || speechSynthesis.getVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); speechSynthesis.removeEventListener?.('voiceschanged', done); resolve(); };
    const timer = setTimeout(done, ms);
    speechSynthesis.addEventListener?.('voiceschanged', done);
  });
}

function hasVoice(lang) {
  if (!('speechSynthesis' in window)) return false;
  return speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith(lang));
}
if ('speechSynthesis' in window) speechSynthesis.getVoices();

const STYLE = `
:host { display: block; font-family: var(--bs-body-font-family, system-ui, "Noto Sans"), "Noto Sans Ethiopic", "Nyala", "Abyssinica SIL", sans-serif;
  --jc-bg: #fff; --jc-fg: #16181d; --jc-muted: #4a5060; --jc-line: #8a90a0; --jc-accent: var(--bs-primary, #0b5cad); --jc-focus: #0b5cad; --jc-panel: #f3f5f8;
  /* Host colours are not always dark enough for text (Savanna's red is 4.4:1 on white). Darken them for text and filled buttons. */
  --jc-action: color-mix(in srgb, var(--bs-primary, #0b5cad) 78%, black);
  color: var(--jc-fg); }
:host([theme=dark]) { --jc-action: #8cc4ff; --jc-bg: #15181e; --jc-fg: #eef0f4; --jc-muted: #b8bfcc; --jc-line: #7c8496; --jc-accent: #8cc4ff; --jc-focus: #8cc4ff; --jc-panel: #1f232b; }
@media (prefers-color-scheme: dark) { :host(:not([theme=light])) { --jc-action: #8cc4ff; --jc-bg: #15181e; --jc-fg: #eef0f4; --jc-muted: #b8bfcc; --jc-line: #7c8496; --jc-accent: #8cc4ff; --jc-focus: #8cc4ff; --jc-panel: #1f232b; } }
* { box-sizing: border-box; }
article { background: var(--jc-bg); border: 1px solid var(--jc-line); border-radius: 8px; padding: 1rem 1.25rem; line-height: 1.5; }
article:lang(am) { line-height: 1.7; }
.title { font-size: 1.3rem; margin: 0 0 0.25rem; overflow-wrap: anywhere; }
.employer { margin: 0 0 0.75rem; font-weight: 600; color: var(--jc-muted); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; margin: 0 0 0.75rem; }
dt { font-weight: 600; } dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 30rem) { dl { grid-template-columns: 1fr; } dd { margin-bottom: 0.4rem; } }
.summary { margin: 0 0 0.75rem; font-size: 1.05rem; }
.support-h { font-size: 1rem; margin: 0 0 0.25rem; }
ul { margin: 0 0 1rem; padding-inline-start: 1.25rem; }
li::marker { content: "✓  "; color: var(--jc-accent); }
.actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
button, a.apply { font: inherit; min-height: 44px; padding: 0.4rem 1rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.4rem; cursor: pointer; }
button { border: 1px solid var(--jc-line); background: var(--jc-panel); color: inherit; }
button[aria-pressed=true] { border-color: var(--jc-accent); font-weight: 600; }
a.apply { background: var(--jc-action); color: #fff; border: 1px solid var(--jc-action); text-decoration: none; font-weight: 600; }
:host([theme=dark]) a.apply { color: #0f1115; }
@media (prefers-color-scheme: dark) { :host(:not([theme=light])) a.apply { color: #0f1115; } }
svg { width: 1.25em; height: 1.25em; fill: currentColor; flex: none; }
:focus-visible { outline: 3px solid var(--jc-focus); outline-offset: 2px; }
.note { margin: 0.75rem 0 0; padding: 0.5rem 0.75rem; background: var(--jc-panel); border-inline-start: 4px solid var(--jc-accent); }
.note:empty { display: none; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;
const SPEAKER = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
const STOP = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6h12v12H6z"/></svg>';

class DbJobCard extends HTMLElement {
  static observedAttributes = ['job', 'api', 'src', 'lang'];
  #root = this.attachShadow({ mode: 'open' });
  #job = null;
  #t = null;
  #lang = 'en';
  #audio = null;
  #onLanguage = () => this.#render();
  #onOtherSpeaking = (e) => { if (e.detail.card !== this) this.#stopListening(); };

  connectedCallback() {
    document.addEventListener('db:language', this.#onLanguage);
    document.addEventListener('db-job-card:speaking', this.#onOtherSpeaking);
    this.#load();
  }
  disconnectedCallback() {
    document.removeEventListener('db:language', this.#onLanguage);
    document.removeEventListener('db-job-card:speaking', this.#onOtherSpeaking);
    this.#stopListening();
  }
  attributeChangedCallback(name, oldV, newV) {
    if (!this.isConnected || oldV === newV) return;
    if (name === 'lang') this.#render(); else this.#load();
  }

  #emit(name, detail) { this.dispatchEvent(new CustomEvent(`db-job-card:${name}`, { bubbles: true, composed: true, detail })); }

  async #load() {
    const id = this.getAttribute('job');
    try {
      if (this.getAttribute('src')) {
        const data = await (await fetch(new URL(this.getAttribute('src'), document.baseURI))).json();
        this.#job = (data.jobs || [data]).find((j) => !id || j.id === id);
      } else {
        const api = (this.getAttribute('api') || scriptOrigin).replace(/\/$/, '');
        const res = await fetch(`${api}/api/v1/jobs/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.#job = await res.json();
      }
      if (!this.#job) throw new Error('job not found');
    } catch (err) {
      console.error('db-job-card:', err);
      this.#job = null;
    }
    this.#render();
  }

  async #render() {
    const { lang, t } = await loadStrings(preferredLanguage(this.getAttribute('lang')));
    this.#t = t; this.#lang = lang;
    this.#stopListening();
    const j = this.#job;
    if (!j) {
      this.#root.innerHTML = `<style>${STYLE}</style><article lang="${lang}"><p role="alert">${esc(t.jobLoadError)}</p></article>`;
      return;
    }
    // Job text in the learner's language when the employer gave it, otherwise English (marked as English).
    const textLang = j[lang] ? lang : 'en';
    const text = j[textLang];
    const h = Math.min(6, Math.max(2, Number(this.getAttribute('heading-level')) || 3));
    const where = [j.city, j.remote ? t.jobRemote : ''].filter(Boolean).join(' · ');
    this.#root.innerHTML = `<style>${STYLE}</style>
<article lang="${lang}" aria-labelledby="t">
  <h${h} class="title" id="t" lang="${textLang}">${esc(text.title)}</h${h}>
  <p class="employer">${esc(j.employer)}</p>
  <dl>
    <dt>${esc(t.jobWhere)}</dt><dd>${esc(where)}</dd>
    <dt>${esc(t.jobType)}</dt><dd>${esc(t.employmentTypes?.[j.employmentType] || j.employmentType)}</dd>
    <dt>${esc(t.jobPosted)}</dt><dd>${esc(bothCalendars(j.datePosted, lang))}</dd>
    <dt>${esc(t.jobCloses)}</dt><dd>${esc(bothCalendars(j.validThrough, lang))}</dd>
  </dl>
  <p class="summary" lang="${textLang}">${esc(text.summary)}</p>
  ${j.support?.length ? `<h${Math.min(6, h + 1)} class="support-h">${esc(t.jobSupport)}</h${Math.min(6, h + 1)}>
  <ul>${j.support.map((s) => `<li>${esc(t.supportTypes?.[s] || s)}</li>`).join('')}</ul>` : ''}
  <div class="actions">
    <button type="button" class="listen" aria-pressed="false">${SPEAKER}<span>${esc(t.jobListen)}</span></button>
    <a class="apply" href="${esc(j.apply)}" aria-label="${esc(t.jobApply)}: ${esc(text.title)}">${esc(t.jobApply)}</a>
  </div>
  <p class="note" role="status"></p>
</article>`;
    this.#root.querySelector('.listen').addEventListener('click', () => this.#toggleListening());
    this.#root.querySelector('.apply').addEventListener('click', () => this.#emit('apply', { job: j.id }));
  }

  /** The words read aloud: everything on the card, in order. */
  #spokenSummary(textLang) {
    const j = this.#job; const t = this.#t; const text = j[textLang];
    const support = (j.support || []).map((s) => t.supportTypes?.[s] || s).join(', ');
    return [
      `${text.title}. ${j.employer}.`,
      `${t.jobWhere}: ${[j.city, j.remote ? t.jobRemote : ''].filter(Boolean).join(', ')}.`,
      `${t.jobType}: ${t.employmentTypes?.[j.employmentType] || j.employmentType}.`,
      text.summary,
      support ? `${t.jobSupport}: ${support}.` : '',
      `${t.jobCloses}: ${bothCalendars(j.validThrough, this.#lang)}.`,
    ].filter(Boolean).join(' ');
  }

  async #toggleListening() {
    const btn = this.#root.querySelector('.listen');
    if (btn.getAttribute('aria-pressed') === 'true') { this.#stopListening(); return; }
    const j = this.#job;
    const textLang = j[this.#lang] ? this.#lang : 'en';
    const note = this.#root.querySelector('.note');
    note.textContent = '';
    this.#emit('listen', { job: j.id, lang: textLang });
    document.dispatchEvent(new CustomEvent('db-job-card:speaking', { detail: { card: this } }));

    // A recorded summary (e.g. an Amharic voice recording) is best; otherwise the phone's own voice.
    const recorded = j[textLang]?.audio;
    if (!recorded) await voicesReady();
    if (recorded) {
      this.#audio = new Audio(new URL(recorded, this.getAttribute('src') ? new URL(this.getAttribute('src'), document.baseURI) : document.baseURI));
      this.#audio.addEventListener('ended', () => this.#stopListening());
      this.#audio.play().catch(() => this.#stopListening());
    } else if (hasVoice(textLang)) {
      const u = new SpeechSynthesisUtterance(this.#spokenSummary(textLang));
      u.lang = textLang === 'am' ? 'am-ET' : textLang;
      u.voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(textLang)) || null;
      u.onend = () => this.#stopListening();
      u.onerror = () => this.#stopListening();
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } else {
      note.textContent = this.#t.jobNoVoice;
      return;
    }
    btn.setAttribute('aria-pressed', 'true');
    btn.innerHTML = `${STOP}<span>${esc(this.#t.jobStop)}</span>`;
  }

  #stopListening() {
    const btn = this.#root.querySelector('.listen');
    if (!btn || btn.getAttribute('aria-pressed') !== 'true') return;
    if (this.#audio) { this.#audio.pause(); this.#audio = null; } else if ('speechSynthesis' in window) speechSynthesis.cancel();
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = `${SPEAKER}<span>${esc(this.#t.jobListen)}</span>`;
  }
}

/** <db-language>: the learner's one language switch, for pages that have no player. */
class DbLanguage extends HTMLElement {
  #root = this.attachShadow({ mode: 'open' });
  #refocus = false;
  #onLanguage = () => this.#render();
  connectedCallback() { document.addEventListener('db:language', this.#onLanguage); this.#render(); }
  disconnectedCallback() { document.removeEventListener('db:language', this.#onLanguage); }
  async #render() {
    const { lang, t } = await loadStrings(preferredLanguage(this.getAttribute('lang')));
    const langs = (this.getAttribute('languages') || 'en,am').split(',').map((s) => s.trim());
    this.#root.innerHTML = `<style>
      :host { display: inline-block; font-family: var(--bs-body-font-family, system-ui, sans-serif), "Noto Sans Ethiopic", sans-serif; }
      label { display: block; font-size: 0.85rem; font-weight: 600; }
      select { font: inherit; min-height: 44px; padding: 0 0.5rem; border: 1px solid #8a90a0; border-radius: 6px; background: Canvas; color: CanvasText; }
      select:focus-visible { outline: 3px solid #0b5cad; outline-offset: 2px; }
    </style>
    <label for="l">${esc(t.languageLabel)}</label>
    <select id="l">${langs.map((c) => `<option value="${esc(c)}" lang="${esc(c)}"${c === lang ? ' selected' : ''}>${esc(languageName(c))}</option>`).join('')}</select>`;
    const sel = this.#root.querySelector('select');
    sel.addEventListener('change', () => { this.#refocus = true; setPreferredLanguage(sel.value); });
    // Redrawn in the new language: keep the learner's place.
    if (this.#refocus) { this.#refocus = false; sel.focus(); }
  }
}

if (!customElements.get('db-job-card')) customElements.define('db-job-card', DbJobCard);
if (!customElements.get('db-language')) customElements.define('db-language', DbLanguage);
export { DbJobCard, DbLanguage };

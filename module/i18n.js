// Shared by every Digital Bridge component: interface text, and the learner's remembered choices.
// One language switch for everything: a choice made in any component applies to all of them.

const STORE_KEY = 'db-player:prefs';
const STRINGS = new Map();

export function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
export function storePrefs(prefs) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(prefs)); } catch { /* private mode: ignore */ }
}

function fetchStrings(code) {
  if (!STRINGS.has(code)) {
    STRINGS.set(code, fetch(new URL(`./i18n/${code}.json`, import.meta.url))
      .then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return STRINGS.get(code);
}

/** Strings for a language, with English filling any gaps. Falls back to English if the file is missing. */
export async function loadStrings(lang) {
  const code = String(lang || 'en').toLowerCase().split('-')[0];
  const [en, own] = await Promise.all([fetchStrings('en'), code === 'en' ? null : fetchStrings(code)]);
  if (!en && !own) throw new Error('Digital Bridge: could not load interface text (i18n/*.json)');
  return own ? { lang: code, t: { ...en, ...own } } : { lang: 'en', t: en };
}

export const fill = (template, values) => String(template ?? '').replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');

/** A language's name in that language: "English", "አማርኛ". */
export function languageName(code) {
  try { return new Intl.DisplayNames([code], { type: 'language' }).of(code) || code; } catch { return code; }
}

/** The learner's own choice wins over the host's default. */
export function preferredLanguage(hostDefault) {
  return loadPrefs().lang || hostDefault || 'en';
}

/** Remember the learner's language and tell every component on the page. */
export function setPreferredLanguage(code) {
  const prefs = loadPrefs();
  prefs.lang = code;
  storePrefs(prefs);
  document.dispatchEvent(new CustomEvent('db:language', { detail: { lang: code } }));
}

/** Dates in both calendars: Ethiopian first for Amharic, Gregorian first otherwise. */
export function bothCalendars(isoDate, lang) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  const opts = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' };
  const eth = new Intl.DateTimeFormat(`${lang === 'am' ? 'am' : 'en'}-ET-u-ca-ethiopic`, opts).format(d);
  const greg = new Intl.DateTimeFormat(lang === 'am' ? 'am-ET' : 'en-GB', opts).format(d);
  return lang === 'am' ? `${eth} (${greg})` : `${greg} (${eth})`;
}

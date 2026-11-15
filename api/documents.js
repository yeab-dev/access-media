// The lesson as a document: clean HTML with headings in order and a real description for each image,
// and the same document as a tagged PDF (printed by headless Chromium, which keeps the structure).
// Sources: the lesson's caption file and images.json (slide times, titles, descriptions). Cached per language.

import express from 'express';
import { spawn } from 'node:child_process';
import { readFile, writeFile, stat, mkdir, rename, rm, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseVtt, formatClock, escapeHtml } from './vtt.js';
import { publicOrigin } from './origin.js';

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SELF = fileURLToPath(import.meta.url);
const building = new Map();

const UI = {
  en: { lesson: 'Lesson', length: 'Length', languages: 'Available in', contents: 'Contents', part: 'Part', said: 'What is said', made: 'Made from the lesson captions and slide descriptions.' },
  am: { lesson: 'ትምህርት', length: 'ርዝመት', languages: 'የሚገኝባቸው ቋንቋዎች', contents: 'ማውጫ', part: 'ክፍል', said: 'የሚነገረው', made: 'ከትምህርቱ የጽሑፍ ትርጉም እና የስላይድ መግለጫዎች የተዘጋጀ።' },
};

export function chromiumPath() {
  return process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(existsSync) || null;
}

function run(cmd, args, timeoutMs = 60_000, env = process.env) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'], env });
    let err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd} took too long`)); }, timeoutMs);
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`${cmd} failed: ${err.trim().slice(-300)}`)); });
  });
}

/** Sections: one per slide (from images.json), or one per audio-description line, or the whole transcript. */
export function lessonSections({ captions, images = [], descriptions = [], lang }) {
  let marks = images.map((im) => ({ time: im.time, title: im[lang]?.title || im.en?.title, alt: im[lang]?.alt || im.en?.alt }));
  if (!marks.length) marks = descriptions.map((d, i) => ({ time: d.start, title: null, alt: d.text, n: i + 1 }));
  if (!marks.length) marks = [{ time: 0, title: null, alt: null }];
  marks.sort((a, b) => a.time - b.time);
  return marks.map((m, i) => {
    const next = marks[i + 1]?.time ?? Infinity;
    const from = i === 0 ? -Infinity : m.time;
    return { ...m, index: i + 1, lines: captions.filter((c) => c.start >= from && c.start < next) };
  });
}

export function renderLessonDocument({ title, lang, duration, languages, sections, imageSrc }) {
  const T = UI[lang] || UI.en;
  const heading = (s) => s.title || `${T.part} ${s.index} (${formatClock(s.time)})`;
  const toc = sections.map((s) => `<li><a href="#part-${s.index}">${escapeHtml(heading(s))}</a></li>`).join('');
  const body = sections.map((s) => `
  <section aria-labelledby="part-${s.index}">
    <h2 id="part-${s.index}">${escapeHtml(heading(s))}</h2>
    ${s.alt ? `<figure><img src="${escapeHtml(imageSrc(s))}" alt="${escapeHtml(s.alt)}" width="640" height="360"></figure>` : ''}
    ${s.lines.length ? `<h3 class="sr-heading">${T.said}</h3>
    ${s.lines.map((c) => `<p><time datetime="PT${Math.floor(c.start)}S">${formatClock(c.start)}</time> ${escapeHtml(c.text).replace(/\n/g, ' ')}</p>`).join('\n    ')}` : ''}
  </section>`).join('\n');

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(T.lesson)}: ${escapeHtml(title)}">
<style>
  @page { size: A4; margin: 18mm 16mm; }
  :root { color-scheme: light dark; }
  body { font-family: "Noto Sans", "Noto Sans Ethiopic", "Nyala", "Abyssinica SIL", system-ui, sans-serif; line-height: 1.6; max-width: 44rem; margin: 0 auto; padding: 1rem; color: #16181d; background: #fff; }
  html[lang=am] body { line-height: 1.75; }
  @media screen and (prefers-color-scheme: dark) { body { color: #eef0f4; background: #0f1115; } a { color: #8cc4ff; } time { color: #b8bfcc !important; } }
  h1 { font-size: 1.8rem; line-height: 1.25; margin: 0 0 0.5rem; }
  h2 { font-size: 1.3rem; margin: 2rem 0 0.5rem; break-after: avoid; }
  h3.sr-heading { font-size: 1rem; margin: 0.75rem 0 0.25rem; }
  .meta { color: #4a5060; margin: 0 0 1rem; }
  figure { margin: 0.5rem 0 1rem; break-inside: avoid; }
  img { max-width: 100%; height: auto; border-radius: 4px; }
  p { margin: 0.35rem 0; }
  time { color: #4a5060; font-variant-numeric: tabular-nums; margin-inline-end: 0.5rem; }
  a { color: #0b5cad; } a:focus-visible { outline: 3px solid #0b5cad; outline-offset: 2px; }
  nav ol { padding-inline-start: 1.25rem; }
  nav a { display: inline-block; padding: 0.25rem 0; }
  footer { margin-top: 2rem; color: #4a5060; font-size: 0.9rem; }
  @media print { nav { break-after: avoid; } a { color: inherit; text-decoration: none; } }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">${T.length}: ${formatClock(duration || 0)} · ${T.languages}: ${escapeHtml(languages.join(', '))}</p>
  <nav aria-labelledby="toc-h"><h2 id="toc-h">${T.contents}</h2><ol>${toc}</ol></nav>
  ${body}
  <footer><p>${T.made}</p></footer>
</main>
</body>
</html>`;
}

const mtime = (f) => stat(f).then((s) => s.mtimeMs, () => 0);

/** Build (or reuse) the HTML and PDF for one language. Returns their paths. */
export async function ensureDocument(dir, lang, { pdf = false } = {}) {
  dir = path.resolve(dir);
  const key = `${dir}:${lang}:${pdf}`;
  if (!building.has(key)) building.set(key, build(dir, lang, pdf).finally(() => building.delete(key)));
  return building.get(key);
}

async function build(dir, lang, wantPdf) {
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
  const captionTrack = (manifest.tracks || []).find((t) => t.kind === 'captions' && t.srclang === lang);
  if (!captionTrack) { const e = new Error(`no captions in ${lang}`); e.code = 'NO_LANG'; throw e; }
  const descTrack = (manifest.tracks || []).find((t) => t.kind === 'descriptions' && t.srclang === lang);
  const imagesFile = manifest.images ? path.join(dir, manifest.images) : null;
  const video = (manifest.sources || []).find((s) => s.quality !== 'audio');
  const inputs = [path.join(dir, 'manifest.json'), path.join(dir, captionTrack.src), descTrack && path.join(dir, descTrack.src), imagesFile, SELF].filter(Boolean);

  const outDir = path.join(dir, 'document');
  const html = path.join(outDir, `lesson.${lang}.html`);
  const pdf = path.join(outDir, `lesson.${lang}.pdf`);
  const newest = Math.max(...(await Promise.all(inputs.map(mtime))));
  const fresh = (f) => mtime(f).then((t) => t >= newest);

  if (!(await fresh(html))) {
    const captions = parseVtt(await readFile(path.join(dir, captionTrack.src), 'utf8'));
    const descriptions = descTrack ? parseVtt(await readFile(path.join(dir, descTrack.src), 'utf8')) : [];
    const images = imagesFile ? JSON.parse(await readFile(imagesFile, 'utf8')).images || [] : [];
    const sections = lessonSections({ captions, images, descriptions, lang });
    await mkdir(outDir, { recursive: true });
    // A still from the video for each section, a moment after the slide appears.
    if (video) {
      for (const s of sections.filter((x) => x.alt)) {
        const still = path.join(outDir, `slide-${s.index}.jpg`);
        if (!(await fresh(still))) {
          await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, s.time + 0.5)), '-i', path.join(dir, video.src), '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '5', still]);
        }
      }
    }
    const languages = (manifest.tracks || []).filter((t) => t.kind === 'captions').map((t) => t.label || t.srclang);
    const doc = renderLessonDocument({
      title: manifest.titles?.[lang] || manifest.title, lang, duration: manifest.duration, languages, sections,
      imageSrc: (s) => `slide-${s.index}.jpg`,
    });
    await writeFile(`${html}.tmp`, doc);
    await rename(`${html}.tmp`, html);
  }

  if (wantPdf && !(await fresh(pdf))) {
    const chrome = chromiumPath();
    if (!chrome) { const e = new Error('no chromium'); e.code = 'NO_CHROMIUM'; throw e; }
    const profile = await mkdtemp(path.join(tmpdir(), 'db-pdf-'));
    try {
      // Chromium writes a tagged PDF (headings, figures with alt text, reading order) and a bookmark outline.
      // In containers: --disable-dev-shm-usage (Docker's /dev/shm is tiny and Chromium crashes when it fills),
      // no crash reporter, and everything Chromium writes stays in the throwaway profile.
      await run(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-crash-reporter',
        '--no-first-run', `--crash-dumps-dir=${profile}`, `--user-data-dir=${profile}`, '--no-pdf-header-footer',
        '--generate-pdf-document-outline', `--print-to-pdf=${pdf}.tmp`, pathToFileURL(html).href],
        // Chromium crashes if its home folder is not writable (as in some containers): give it the throwaway profile.
        60_000, { ...process.env, HOME: profile, XDG_CONFIG_HOME: profile, XDG_CACHE_HOME: profile });
      await rename(`${pdf}.tmp`, pdf);
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
  return { html, pdf };
}

export function documentsRouter({ lessonsDir }) {
  const router = express.Router();
  // GET /lessons/{id}/document?lang=am&format=html|pdf
  router.get('/lessons/:id/document', async (req, res, next) => {
    const { id } = req.params;
    if (!ID.test(id)) return res.status(400).json({ error: 'invalid_id', message: 'Lesson ids use lowercase letters, numbers and hyphens.' });
    const lang = String(req.query.lang || 'en');
    const format = String(req.query.format || 'html');
    if (!['html', 'pdf'].includes(format)) return res.status(400).json({ error: 'invalid_format', message: 'Use format=html or format=pdf.' });
    try {
      const { html, pdf } = await ensureDocument(path.join(lessonsDir, id), lang, { pdf: format === 'pdf' });
      if (format === 'pdf') {
        return res.sendFile(pdf, { dotfiles: 'allow', headers: { 'Content-Disposition': `inline; filename="${id}.${lang}.pdf"`, 'Cache-Control': 'no-cache' } });
      }
      // Served from /media so the slide images load next to it.
      res.redirect(302, `/media/${id}/document/${path.basename(html)}`);
    } catch (err) {
      if (err.code === 'ENOENT') return res.status(404).json({ error: 'not_found', message: 'There is no lesson with this id.' });
      if (err.code === 'NO_LANG') return res.status(404).json({ error: 'no_document', message: `This lesson has no captions in "${lang}", so there is no document in that language.` });
      if (err.code === 'NO_CHROMIUM') return res.status(503).json({ error: 'no_pdf', message: 'PDF is not available on this server (Chromium is not installed). The HTML version is.' });
      if (format === 'pdf') {
        console.error(`document: PDF for ${id} (${lang}) failed:`, err.message); // the full Chromium error, for the server log
        return res.status(503).json({ error: 'pdf_failed', message: `The PDF could not be made just now. The web page version works: ${publicOrigin(req)}/api/v1/lessons/${id}/document?lang=${lang}` });
      }
      next(err);
    }
  });
  return router;
}

// New lessons from a lesson provider: upload one video, get a lesson that plays on 3G and, when a speech model
// is set up (ASR_URL), captions in the spoken language straight away. Those captions are marked automatic
// (the player says so) until a person checks them in studio/captions.html and saves.

import express from 'express';
import multer from 'multer';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, rename, rm, mkdir, readdir, cp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { requireKey, mayChange, notYours, ownerOf, limits } from './auth.js';
import { publicOrigin, embedCode } from './origin.js';
import { transcribe, speechMode } from './speech.js';
import { parseVtt } from './vtt.js';
import { events } from './events.js';

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LANG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
const MAX_UPLOAD = 1024 * 1024 * 1024; // 1 GB: a long lesson recorded on a phone

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = ''; let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} failed: ${err.trim().slice(-300)}`))));
  });
}
const ffmpeg = (args) => run('ffmpeg', ['-y', '-loglevel', 'error', ...args]);

/** Length in seconds and whether there is a picture and sound. Throws if ffprobe cannot read the file. */
export async function probe(file) {
  const info = JSON.parse(await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]));
  const streams = info.streams || [];
  return {
    duration: Number(info.format?.duration) || 0,
    hasVideo: streams.some((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1),
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
  };
}

/** "How to write a CV" → "how-to-write-a-cv". Titles with no Latin letters (Amharic) get "lesson". */
export function slugify(title) {
  const slug = String(title).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');
  return slug || 'lesson';
}

function languageName(code) {
  try { return new Intl.DisplayNames([code], { type: 'language' }).of(code) || code; } catch { return code; }
}

export function lessonsRouter({ lessonsDir }) {
  const router = express.Router();
  const upload = multer({ dest: path.join(os.tmpdir(), 'db-lesson-uploads'), limits: { fileSize: MAX_UPLOAD, files: 1 } });
  const dirOf = (id) => path.join(lessonsDir, id);
  const bad = (res, error, message, status = 400) => res.status(status).json({ error, message });

  async function readManifest(id) {
    return JSON.parse(await readFile(path.join(dirOf(id), 'manifest.json'), 'utf8'));
  }
  async function writeManifest(id, m) {
    const file = path.join(dirOf(id), 'manifest.json');
    await writeFile(`${file}.tmp`, JSON.stringify(m, null, 2));
    await rename(`${file}.tmp`, file);
  }
  /** Change a few fields; re-read first so a caption saved meanwhile is kept. */
  async function update(id, fields) {
    const m = await readManifest(id);
    Object.assign(m, fields);
    await writeManifest(id, m);
    return m;
  }

  // A lesson that was being prepared when the server stopped will never finish: say so.
  (async () => {
    for (const d of await readdir(lessonsDir, { withFileTypes: true }).catch(() => [])) {
      if (!d.isDirectory() || !ID.test(d.name)) continue;
      const m = await readManifest(d.name).catch(() => null);
      if (m && (m.status === 'processing' || m.status === 'captioning')) {
        await update(d.name, { status: 'failed', statusMessage: 'The server stopped while this lesson was being prepared. Upload the video again.' });
      }
    }
  })().catch((err) => console.error('lessons: could not check unfinished uploads', err));

  /** Convert for slow connections, then caption. Runs after the upload has been answered. */
  async function prepare(id, original, lang) {
    const dir = dirOf(id);
    try {
      let info;
      try { info = await probe(original); } catch { info = null; }
      if (!info?.hasVideo || !info.duration) {
        await update(id, { status: 'failed', statusMessage: 'This file is not a video we can read. Upload an MP4, WebM or MOV file.' });
        return;
      }
      const audio = info.hasAudio ? [] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-shortest'];
      const map = info.hasAudio ? [] : ['-map', '0:v:0', '-map', '1:a:0'];
      // Same files as the demo lesson (scripts/make-demo.sh): 360p, 240p ~200 kbps for 3G, 32 kbps mono MP3, poster.
      await ffmpeg(['-i', original, ...audio, ...map, '-vf', 'scale=-2:360', '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'veryfast', '-crf', '28', '-g', '50',
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', path.join(dir, 'lesson.mp4')]);
      await ffmpeg(['-i', path.join(dir, 'lesson.mp4'), '-vf', 'scale=-2:240', '-c:v', 'libx264', '-profile:v', 'baseline', '-preset', 'veryfast', '-g', '50',
        '-b:v', '180k', '-maxrate', '200k', '-bufsize', '400k', '-c:a', 'aac', '-b:a', '32k', '-ac', '1', '-movflags', '+faststart', path.join(dir, 'lesson.240p.mp4')]);
      await ffmpeg(['-i', path.join(dir, 'lesson.mp4'), '-vn', '-c:a', 'libmp3lame', '-b:a', '32k', '-ac', '1', path.join(dir, 'lesson.mp3')]);
      await ffmpeg(['-ss', String(Math.min(1, info.duration / 2)), '-i', path.join(dir, 'lesson.mp4'), '-frames:v', '1', '-q:v', '5', path.join(dir, 'poster.jpg')]);
      await rm(original, { force: true });

      const asr = !!speechMode(); // 'loading' too: the transcription then says so in the lesson's status
      await update(id, {
        duration: Math.round(info.duration),
        poster: 'poster.jpg',
        sources: [
          { quality: '360p', src: 'lesson.mp4', type: 'video/mp4' },
          { quality: '240p', src: 'lesson.240p.mp4', type: 'video/mp4' },
          { quality: 'audio', src: 'lesson.mp3', type: 'audio/mpeg' },
        ],
        // Learners can watch already; captions follow.
        status: asr ? 'captioning' : 'ready',
        statusMessage: asr ? 'Making captions with the speech model.' : 'No speech model is set up, so there are no automatic captions. Add captions in the caption editor.',
      });
      if (!asr) { events.emit('lesson.ready', { lesson: id, captions: [] }); return; }

      try {
        const { vtt, model } = await transcribe(path.join(dir, 'lesson.mp3'), lang);
        const lines = parseVtt(vtt).length;
        if (!lines) throw new Error('The speech model heard no words.');
        const file = `lesson.${lang}.vtt`;
        const m = await readManifest(id);
        // A person may have saved captions in this language meanwhile: theirs win.
        if ((m.tracks || []).some((t) => t.kind === 'captions' && t.srclang === lang && t.reviewed)) {
          await writeManifest(id, { ...m, status: 'ready', statusMessage: 'Captions were added by a person, so the automatic ones were not used.' });
          events.emit('lesson.ready', { lesson: id, captions: [lang] });
          return;
        }
        await writeFile(path.join(dir, file), vtt);
        const tracks = (m.tracks || []).filter((t) => !(t.kind === 'captions' && t.srclang === lang));
        tracks.push({ kind: 'captions', srclang: lang, label: languageName(lang), src: file, auto: true, reviewed: false, model, updatedAt: new Date().toISOString() });
        await writeManifest(id, { ...m, tracks, status: 'ready', statusMessage: `Automatic captions added (${lines} lines). A person should check them in the caption editor.` });
        events.emit('captions.updated', { lesson: id, kind: 'captions', lang, lines, reviewed: false });
        events.emit('lesson.ready', { lesson: id, captions: [lang] });
      } catch (err) {
        console.error(`lessons: automatic captions failed for ${id}`, err.cause?.code || err.message);
        const unreachable = err.name === 'TimeoutError' || /fetch failed/i.test(err.message);
        const why = unreachable ? 'the speech model on this server could not be reached.' : err.message;
        await update(id, { status: 'ready', statusMessage: `The lesson is ready, but there are no automatic captions: ${why} Add captions in the caption editor.` });
        events.emit('lesson.ready', { lesson: id, captions: [] });
      }
    } catch (err) {
      console.error(`lessons: could not prepare ${id}`, err);
      await update(id, { status: 'failed', statusMessage: 'The video could not be converted. Try another file, or check the server log.' }).catch(() => {});
    } finally {
      await rm(original, { force: true }).catch(() => {});
    }
  }

  // Upload a lesson video. Answers at once (202); follow GET /lessons/{id} until status is "ready".
  router.post('/lessons', requireKey, checkQuota, upload.single('video'), async (req, res, next) => {
    const tmp = req.file?.path;
    let kept = false;
    try {
      const max = req.who.admin ? Infinity : limits().uploadMB * 1024 * 1024;
      if (req.file && req.file.size > max) return bad(res, 'too_large', `The video is too large: ${limits().uploadMB} MB at most for each lesson.`, 413);
      const title = String(req.body?.title || '').trim();
      const lang = String(req.body?.lang || 'en');
      if (!req.file) return bad(res, 'no_video', 'Send the lesson video as a file field named "video".');
      if (!title || title.length > 200) return bad(res, 'invalid_title', 'Give the lesson a title (up to 200 characters).');
      if (!LANG.test(lang)) return bad(res, 'invalid_lang', 'Give the spoken language as a code, for example "am" or "en".');
      let id = req.body?.id ? String(req.body.id) : '';
      if (id && !ID.test(id)) return bad(res, 'invalid_id', 'Lesson ids use lowercase letters, numbers and hyphens.');
      await mkdir(lessonsDir, { recursive: true });
      if (id) {
        try { await mkdir(dirOf(id)); } catch (err) {
          if (err.code === 'EEXIST') return bad(res, 'id_taken', `There is already a lesson called "${id}". Choose another id.`, 409);
          throw err;
        }
      } else {
        const base = slugify(title);
        for (let n = 1; ; n++) {
          id = n === 1 && base !== 'lesson' ? base : `${base}-${n === 1 ? randomBytes(2).toString('hex') : n}`;
          try { await mkdir(dirOf(id)); break; } catch (err) { if (err.code !== 'EEXIST' || n > 50) throw err; }
        }
      }
      const original = path.join(dirOf(id), `upload${path.extname(req.file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6)}`);
      await rename(tmp, original).catch(async () => { // a different disk: copy instead
        await writeFile(original, await readFile(tmp));
      });
      kept = true;
      const manifest = {
        id, title, lang, duration: 0, status: 'processing', statusMessage: 'Converting the video for slow connections.',
        createdAt: new Date().toISOString(), owner: ownerOf(req), sources: [], tracks: [],
      };
      await writeManifest(id, manifest);
      prepare(id, original, lang); // in the background; errors end up in the lesson's status
      const href = `${publicOrigin(req)}/api/v1/lessons/${id}`;
      res.status(202).location(href).json({ id, status: manifest.status, statusMessage: manifest.statusMessage, href, embed: embedCode(req, id) });
    } catch (err) {
      next(err);
    } finally {
      if (tmp && !kept) await rm(tmp, { force: true }).catch(() => {});
    }
  });

  /** Lessons this caller owns (the master key: all lessons). */
  async function ownLessons(req) {
    const out = [];
    for (const d of await readdir(lessonsDir, { withFileTypes: true }).catch(() => [])) {
      if (!d.isDirectory() || !ID.test(d.name)) continue;
      const m = await readManifest(d.name).catch(() => null);
      if (m && (req.who.admin || (m.owner && m.owner === req.who.provider?.id))) out.push(m);
    }
    return out;
  }

  // Before taking a large upload: is there room for one more lesson, and is the file small enough?
  async function checkQuota(req, res, next) {
    if (req.who.admin) return next();
    const { lessons, uploadMB } = limits();
    if (Number(req.get('content-length') || 0) > (uploadMB + 1) * 1024 * 1024) {
      return bad(res, 'too_large', `The video is too large: ${uploadMB} MB at most for each lesson.`, 413);
    }
    if ((await ownLessons(req)).length >= lessons) {
      return bad(res, 'limit_reached', `You have ${lessons} lessons, the most a key can have on this server. Delete one first (DELETE /api/v1/lessons/{id}).`, 403);
    }
    next();
  }

  // My lessons, with the code to put each one on a page.
  router.get('/me/lessons', requireKey, async (req, res) => {
    const list = (await ownLessons(req)).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    for (const m of list) m.pages = (await readPages(m.id)).sort(byLastSeen);
    res.json({
      lessons: list.map((m) => ({
        id: m.id, title: m.title, lang: m.lang, duration: m.duration, status: m.status || 'ready', statusMessage: m.statusMessage,
        captions: (m.tracks || []).filter((t) => t.kind === 'captions').map((t) => ({ lang: t.srclang, automatic: !!t.auto })),
        audioDescription: (m.tracks || []).filter((t) => t.kind === 'descriptions').map((t) => t.srclang),
        signLanguage: !!m.sign?.src && !m.sign.placeholder,
        pages: m.pages,
        href: `${publicOrigin(req)}/api/v1/lessons/${m.id}`,
        embed: embedCode(req, m.id),
      })),
      limits: req.who.admin ? null : limits(),
    });
  });

  // Change a lesson's title, its title in other languages, or its spoken language.
  router.patch('/lessons/:id', requireKey, express.json({ limit: '20kb' }), async (req, res) => {
    const { id } = req.params;
    if (!ID.test(id)) return bad(res, 'invalid_id', 'Lesson ids use lowercase letters, numbers and hyphens.');
    let m;
    try { m = await readManifest(id); } catch { return bad(res, 'not_found', 'There is no lesson with this id.', 404); }
    if (!mayChange(req, m.owner)) return notYours(res);
    const { title, titles, lang } = req.body || {};
    const fields = {};
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim() || title.length > 200) return bad(res, 'invalid_title', 'The title must be 1 to 200 characters.');
      fields.title = title.trim();
    }
    if (titles !== undefined) {
      if (!titles || typeof titles !== 'object' || Array.isArray(titles)) return bad(res, 'invalid_titles', 'Give titles as {"am": "…"}: a language code and the title in that language.');
      for (const [k, v] of Object.entries(titles)) {
        if (!LANG.test(k)) return bad(res, 'invalid_titles', `"${k}" is not a language code. Use codes like "am" or "om".`);
        if (v !== null && (typeof v !== 'string' || v.length > 200)) return bad(res, 'invalid_titles', `The ${k} title must be up to 200 characters (or null to remove it).`);
      }
      const merged = { ...(m.titles || {}), ...titles };
      for (const k of Object.keys(merged)) if (merged[k] === null || merged[k] === '') delete merged[k];
      fields.titles = merged;
    }
    if (lang !== undefined) {
      if (!LANG.test(String(lang))) return bad(res, 'invalid_lang', 'Give the spoken language as a code, for example "am" or "en".');
      fields.lang = lang;
    }
    if (!Object.keys(fields).length) return bad(res, 'nothing_to_change', 'Send at least one of: title, titles, lang.');
    const updated = await update(id, fields);
    res.json({ id, title: updated.title, titles: updated.titles || {}, lang: updated.lang });
  });

  // Slides: when each picture appears, a short title and a real description of it, in each language.
  // Used for the lesson document (HTML and tagged PDF): one section per slide, the description as the image's alt text.
  router.get('/lessons/:id/slides', async (req, res) => {
    const { id } = req.params;
    if (!ID.test(id)) return bad(res, 'invalid_id', 'Lesson ids use lowercase letters, numbers and hyphens.');
    try { await readManifest(id); } catch { return bad(res, 'not_found', 'There is no lesson with this id.', 404); }
    const data = await readFile(path.join(dirOf(id), 'images.json'), 'utf8').then(JSON.parse).catch(() => ({ images: [] }));
    res.json({ slides: data.images || [] });
  });

  router.put('/lessons/:id/slides', requireKey, express.json({ limit: '200kb' }), async (req, res) => {
    const { id } = req.params;
    if (!ID.test(id)) return bad(res, 'invalid_id', 'Lesson ids use lowercase letters, numbers and hyphens.');
    let m;
    try { m = await readManifest(id); } catch { return bad(res, 'not_found', 'There is no lesson with this id.', 404); }
    if (!mayChange(req, m.owner)) return notYours(res);
    const slides = req.body?.slides;
    if (!Array.isArray(slides) || slides.length > 500) return bad(res, 'invalid_slides', 'Send {"slides": [...]}: a list of up to 500 slides.');
    const clean = [];
    for (const [i, s] of slides.entries()) {
      const n = i + 1;
      const time = Number(s?.time);
      if (!Number.isFinite(time) || time < 0) return bad(res, 'invalid_slides', `Slide ${n}: "time" must be the second the slide appears, for example 12.5.`);
      const entry = { time };
      for (const [k, v] of Object.entries(s)) {
        if (k === 'time') continue;
        if (!LANG.test(k) || !v || typeof v !== 'object') return bad(res, 'invalid_slides', `Slide ${n}: "${k}" is not a language. Give text per language: {"time": 5, "en": {"title": "…", "alt": "…"}}.`);
        const title = typeof v.title === 'string' ? v.title.trim().slice(0, 200) : undefined;
        const alt = typeof v.alt === 'string' ? v.alt.trim().slice(0, 1000) : undefined;
        if (!title && !alt) return bad(res, 'invalid_slides', `Slide ${n} (${k}): give a "title", an "alt" (what the picture shows), or both.`);
        entry[k] = { ...(title ? { title } : {}), ...(alt ? { alt } : {}) };
      }
      if (Object.keys(entry).length === 1) return bad(res, 'invalid_slides', `Slide ${n}: give its text in at least one language, for example "en": {"title": "…", "alt": "…"}.`);
      clean.push(entry);
    }
    clean.sort((a, b) => a.time - b.time);
    const file = path.join(dirOf(id), 'images.json');
    await writeFile(`${file}.tmp`, JSON.stringify({ images: clean }, null, 2));
    await rename(`${file}.tmp`, file);
    res.json({ slides: clean, document: `${publicOrigin(req)}/api/v1/lessons/${id}/document` });
  });

  // ---------- Where each lesson is shown ----------
  // The player, in API mode, reports the page it is on (origin + path only: never the query string, which can hold
  // learner details). Only the lesson's owner can read the list. A host can turn this off with report-page="off".
  const OWN_PAGES = /^\/(provider|studio|portal|docs)(\/|$)/; // our own previews do not count
  const MAX_PAGES = 50;
  const pagesFile = (id) => path.join(dirOf(id), 'pages.json');
  const readPages = (id) => readFile(pagesFile(id), 'utf8').then((t) => JSON.parse(t).pages || []).catch(() => []);
  const lastWrite = new Map(); // "id page" -> time, so a busy page is written at most once an hour
  let pagesWriting = Promise.resolve();
  const changePages = (id, fn) => (pagesWriting = pagesWriting.then(async () => {
    const pages = fn(await readPages(id));
    await writeFile(`${pagesFile(id)}.tmp`, JSON.stringify({ pages }, null, 2));
    await rename(`${pagesFile(id)}.tmp`, pagesFile(id));
  }).catch((err) => console.error(`lessons: could not save pages for ${id}`, err)));
  const byLastSeen = (a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen));

  router.post('/lessons/:id/pages', express.text({ limit: '2kb', type: () => true }), async (req, res) => {
    const { id } = req.params;
    if (!ID.test(id)) return bad(res, 'invalid_id', 'Lesson ids use lowercase letters, numbers and hyphens.');
    try { await readManifest(id); } catch { return bad(res, 'not_found', 'There is no lesson with this id.', 404); }
    let u;
    try { u = new URL(String(req.body || '').trim()); } catch { /* handled below */ }
    if (!u || !['http:', 'https:'].includes(u.protocol) || u.href.length > 500) {
      return bad(res, 'invalid_page', 'Send the address of the page the player is on (https://…) as the request body.');
    }
    // Browsers always send Origin with a POST: the page must be on the site that sends it.
    const origin = req.get('origin');
    if (!origin) return bad(res, 'no_origin', 'Only the player on a web page reports where it is shown.');
    if (origin !== u.origin) return bad(res, 'wrong_origin', 'The page address must be on the site that sends it.');
    const page = `${u.origin}${u.pathname}`;
    if (u.origin === publicOrigin(req) && OWN_PAGES.test(u.pathname)) return res.status(204).end();
    const key = `${id} ${page}`;
    const now = Date.now();
    if (now - (lastWrite.get(key) || 0) < 3_600_000) return res.status(204).end();
    lastWrite.set(key, now);
    const time = new Date(now).toISOString();
    await changePages(id, (pages) => {
      const found = pages.find((p) => p.url === page);
      if (found) found.lastSeen = time; else pages.push({ url: page, firstSeen: time, lastSeen: time });
      return pages.sort(byLastSeen).slice(0, MAX_PAGES);
    });
    res.status(204).end();
  });

  router.get('/lessons/:id/pages', requireKey, async (req, res) => {
    const { id } = req.params;
    if (!ID.test(id)) return bad(res, 'invalid_id', 'Lesson ids use lowercase letters, numbers and hyphens.');
    let m;
    try { m = await readManifest(id); } catch { return bad(res, 'not_found', 'There is no lesson with this id.', 404); }
    if (!mayChange(req, m.owner)) return notYours(res);
    res.json({ pages: (await readPages(id)).sort(byLastSeen) });
  });

  // Take a page off the list (it comes back if the player is still on it).
  router.delete('/lessons/:id/pages', requireKey, async (req, res) => {
    const { id } = req.params;
    if (!ID.test(id)) return bad(res, 'invalid_id', 'Lesson ids use lowercase letters, numbers and hyphens.');
    let m;
    try { m = await readManifest(id); } catch { return bad(res, 'not_found', 'There is no lesson with this id.', 404); }
    if (!mayChange(req, m.owner)) return notYours(res);
    const page = String(req.query.page || '');
    if (!(await readPages(id)).some((p) => p.url === page)) return bad(res, 'not_found', 'This lesson is not listed on that page. Give the address exactly as listed, as ?page=…', 404);
    await changePages(id, (pages) => pages.filter((p) => p.url !== page));
    for (const k of lastWrite.keys()) if (k === `${id} ${page}`) lastWrite.delete(k);
    res.status(204).end();
  });

  // Delete a lesson and all its files (video, captions, sign language, documents, offline pack).
  router.delete('/lessons/:id', requireKey, async (req, res) => {
    const { id } = req.params;
    if (!ID.test(id)) return bad(res, 'invalid_id', 'Lesson ids use lowercase letters, numbers and hyphens.');
    let m;
    try { m = await readManifest(id); } catch { return bad(res, 'not_found', 'There is no lesson with this id.', 404); }
    if (!mayChange(req, m.owner)) return notYours(res);
    if (m.status === 'processing' || m.status === 'captioning') return bad(res, 'busy', 'This lesson is still being prepared. Delete it when it is ready.', 409);
    await rm(dirOf(id), { recursive: true, force: true });
    res.status(204).end();
  });

  router.use((err, _req, res, next) => {
    if (err instanceof multer.MulterError) {
      return bad(res, 'upload_error', err.code === 'LIMIT_FILE_SIZE' ? 'The video is too large (1 GB at most).' : err.message);
    }
    next(err);
  });

  return router;
}

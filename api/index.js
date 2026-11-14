import express from 'express';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureOfflinePack } from './offline.js';
import { parseVtt, renderTranscriptHtml, formatClock } from './vtt.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const LESSONS_DIR = path.join(DATA_DIR, 'lessons');
const PORT = Number(process.env.PORT || 8080);
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback'); // correct https URLs behind a local tunnel (cloudflared, ngrok)

app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  next();
});

// The module and the lessons are public and embeddable on any site.
const cors = (req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); };
// no-cache = browsers revalidate (cheap 304 via ETag), so hosts always get the current module.
const revalidate = { cacheControl: false, setHeaders: (res) => res.set('Cache-Control', 'no-cache') };

app.use('/module', cors, express.static(path.join(ROOT, 'module'), revalidate));
app.use('/media', cors, express.static(LESSONS_DIR, { maxAge: '1d', fallthrough: false }));
app.use('/demo', express.static(path.join(ROOT, 'demo'), revalidate));
app.use('/savanna', express.static(path.join(ROOT, 'savanna'), revalidate));
app.get('/', (_req, res) => res.redirect('/demo/'));

// ---------- API v1 ----------
const api = express.Router();
api.use(cors);

const origin = (req) => `${req.protocol}://${req.get('host')}`;

function badId(res) {
  return res.status(400).json({ error: 'invalid_id', message: 'Lesson ids use lowercase letters, numbers and hyphens.' });
}
function notFound(res) {
  return res.status(404).json({ error: 'not_found', message: 'There is no lesson with this id.' });
}

async function readManifest(id) {
  return JSON.parse(await readFile(path.join(LESSONS_DIR, id, 'manifest.json'), 'utf8'));
}

/** Lesson metadata with absolute URLs, so any host page can use it. */
function publicLesson(req, m) {
  const base = `${origin(req)}/media/${m.id}/`;
  const abs = (p) => (p ? new URL(p, base).href : p);
  return {
    ...m,
    poster: abs(m.poster),
    sources: (m.sources || []).map((s) => ({ ...s, src: abs(s.src) })),
    tracks: (m.tracks || []).map((t) => ({ ...t, src: abs(t.src) })),
    sign: m.sign ? { ...m.sign, src: abs(m.sign.src) } : null,
    links: {
      transcript: `${origin(req)}/api/v1/lessons/${m.id}/transcript`,
      offlinePack: `${origin(req)}/api/v1/lessons/${m.id}/offline-pack`,
    },
  };
}

api.get('/health', (_req, res) => res.json({ ok: true }));

api.get('/lessons', async (req, res) => {
  const ids = (await readdir(LESSONS_DIR, { withFileTypes: true }).catch(() => []))
    .filter((d) => d.isDirectory() && ID.test(d.name)).map((d) => d.name);
  const lessons = [];
  for (const id of ids) {
    try {
      const m = await readManifest(id);
      lessons.push({ id: m.id, title: m.title, lang: m.lang, duration: m.duration, href: `${origin(req)}/api/v1/lessons/${id}` });
    } catch { /* not a lesson folder */ }
  }
  res.json({ lessons });
});

api.get('/lessons/:id', async (req, res) => {
  const { id } = req.params;
  if (!ID.test(id)) return badId(res);
  try {
    res.json(publicLesson(req, await readManifest(id)));
  } catch (err) {
    if (err.code === 'ENOENT') return notFound(res);
    throw err;
  }
});

// Transcript: captions + audio descriptions in one document. ?lang=en|am &format=html|txt
api.get('/lessons/:id/transcript', async (req, res) => {
  const { id } = req.params;
  if (!ID.test(id)) return badId(res);
  let m;
  try { m = await readManifest(id); } catch (err) { if (err.code === 'ENOENT') return notFound(res); throw err; }
  const lang = String(req.query.lang || m.lang || 'en');
  const format = String(req.query.format || 'html');
  const captions = (m.tracks || []).find((t) => t.kind === 'captions' && t.srclang === lang);
  if (!captions) return res.status(404).json({ error: 'no_transcript', message: `This lesson has no transcript in "${lang}".` });
  const desc = (m.tracks || []).find((t) => t.kind === 'descriptions' && t.srclang === lang);
  const read = (t) => readFile(path.join(LESSONS_DIR, id, t.src), 'utf8').then(parseVtt);
  const cues = await read(captions);
  const descriptions = desc ? await read(desc) : [];

  if (format === 'txt') {
    const label = lang === 'am' ? 'መግለጫ' : 'Description';
    const lines = [...cues.map((c) => ({ ...c, d: false })), ...descriptions.map((c) => ({ ...c, d: true }))]
      .sort((a, b) => a.start - b.start || (a.d ? -1 : 1))
      .map((c) => `[${formatClock(c.start)}] ${c.d ? `${label}: ` : ''}${c.text.replace(/\n/g, ' ')}`);
    res.type('text/plain; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="${id}.${lang}.txt"`)
      .send(`${m.title}\r\n\r\n${lines.join('\r\n')}\r\n`);
    return;
  }
  if (format !== 'html') return res.status(400).json({ error: 'invalid_format', message: 'Use format=html or format=txt.' });
  res.type('html').send(renderTranscriptHtml({ title: m.title, lang, captions: cues, descriptions }));
});

// Offline pack: one file to download. Built on first request, cached, served with Range so 3G downloads resume.
api.get('/lessons/:id/offline-pack', async (req, res, next) => {
  const { id } = req.params;
  if (!ID.test(id)) return badId(res);
  try {
    const file = await ensureOfflinePack(path.join(LESSONS_DIR, id));
    res.sendFile(file, {
      headers: { 'Content-Disposition': `attachment; filename="${id}-offline.zip"`, 'Cache-Control': 'no-cache' },
    });
  } catch (err) {
    if (err.code === 'ENOENT') return notFound(res);
    next(err);
  }
});

app.use('/api/v1', api);

app.use((err, req, res, _next) => {
  if (err.status === 404 || err.statusCode === 404) return res.status(404).end();
  console.error(err);
  res.status(500).json({ error: 'server_error', message: 'Something went wrong on the server.' });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
}

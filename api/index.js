import express from 'express';
import compression from 'compression';
import { readFile, readdir, cp, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureOfflinePack } from './offline.js';
import { parseVtt, renderTranscriptHtml, formatClock } from './vtt.js';
import { signRouter, adminToken } from './sign.js';
import { jobsRouter } from './jobs.js';
import { certificatesRouter } from './certificates.js';
import { captionsRouter, warmUpSpeechModel } from './captions.js';
import { documentsRouter } from './documents.js';
import { webhooksRouter } from './webhooks.js';
import { lessonsRouter } from './lessons.js';
import { configureAuth, keysRouter } from './auth.js';
import { publicOrigin, embedCode } from './origin.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const LESSONS_DIR = path.join(DATA_DIR, 'lessons');
const PORT = Number(process.env.PORT || 8080);
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const app = express();
app.disable('x-powered-by');
// Correct https URLs and client addresses behind a proxy: a local tunnel (loopback) or a host's load balancer
// (TRUST_PROXY=1 on Render: one proxy in front of us).
app.set('trust proxy', process.env.TRUST_PROXY ? (Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY) : 'loopback');
// Compress text (JS, JSON, HTML, VTT): the player is ~62 KB raw, ~18 KB compressed. Media is already compressed.
app.use(compression());

app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  next();
});

// The module and the lessons are public and embeddable on any site.
const cors = (req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); };
// no-cache = browsers revalidate (cheap 304 via ETag), so hosts always get the current module.
const revalidate = { cacheControl: false, setHeaders: (res) => res.set('Cache-Control', 'no-cache') };

app.use('/module', cors, express.static(path.join(ROOT, 'module'), revalidate));
// Lesson files can be corrected (captions) or replaced (sign video) under the same name: always revalidate.
app.use('/media', cors, express.static(LESSONS_DIR, { ...revalidate, fallthrough: false }));
app.use('/demo', express.static(path.join(ROOT, 'demo'), revalidate));
app.use('/savanna', express.static(path.join(ROOT, 'savanna'), revalidate));
app.use('/studio', express.static(path.join(ROOT, 'studio'), revalidate));
// Pages for lesson providers: what this is, get a key, the documentation.
const portal = (file) => (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(ROOT, 'portal', file));
app.get('/', portal('index.html'));
app.get('/get-key', portal('get-key.html'));
app.use('/portal', express.static(path.join(ROOT, 'portal'), revalidate));
// The provider dashboard: /provider/, /provider/lessons, /provider/lesson?id=… (one sign-in with the key for all pages).
app.use('/provider', express.static(path.join(ROOT, 'portal', 'provider'), { ...revalidate, extensions: ['html'] }));
app.get('/dashboard', (_req, res) => res.redirect(301, '/provider/'));
// The example site is the Savanna page; old links to the removed Debo example site go there.
app.use('/debo', (_req, res) => res.redirect(301, '/savanna/pages/concept-with-navigation.html'));

// Level 2 documentation: the OpenAPI file, and Swagger UI at /docs so a judge can try calls in the browser.
// The examples say https://THIS-SERVER: fill in this server's real address, so copied code works as it is.
app.get('/openapi.yaml', async (req, res, next) => {
  try {
    const text = await readFile(path.join(ROOT, 'openapi.yaml'), 'utf8');
    res.type('application/yaml').set('Cache-Control', 'no-cache').send(text.replaceAll('https://THIS-SERVER', publicOrigin(req)));
  } catch (err) { next(err); }
});
app.use('/docs/assets', express.static(path.dirname(fileURLToPath(import.meta.resolve('swagger-ui-dist/package.json')))));
app.get('/docs', portal('docs.html'));

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
      document: `${origin(req)}/api/v1/lessons/${m.id}/document`,
    },
  };
}

// version: the deployed commit (Render sets RENDER_GIT_COMMIT), so anyone can see which code is live.
api.get('/health', (_req, res) => res.json({ ok: true, ...(process.env.RENDER_GIT_COMMIT ? { version: process.env.RENDER_GIT_COMMIT.slice(0, 7) } : {}) }));

api.get('/lessons', async (req, res) => {
  const ids = (await readdir(LESSONS_DIR, { withFileTypes: true }).catch(() => []))
    .filter((d) => d.isDirectory() && ID.test(d.name)).map((d) => d.name);
  const lessons = [];
  for (const id of ids) {
    try {
      const m = await readManifest(id);
      lessons.push({ id: m.id, title: m.title, lang: m.lang, duration: m.duration, status: m.status || 'ready', href: `${origin(req)}/api/v1/lessons/${id}` });
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
      dotfiles: 'allow', // the data folder may itself be hidden (e.g. .test-data); the file name is ours
      headers: { 'Content-Disposition': `attachment; filename="${id}-offline.zip"`, 'Cache-Control': 'no-cache' },
    });
  } catch (err) {
    if (err.code === 'ENOENT') return notFound(res);
    next(err);
  }
});

configureAuth({ dataDir: DATA_DIR });
api.use(keysRouter({ onNewProvider: practiceLesson }));
api.use(lessonsRouter({ lessonsDir: LESSONS_DIR }));
api.use(signRouter({ lessonsDir: LESSONS_DIR, dataDir: DATA_DIR }));
api.use(captionsRouter({ lessonsDir: LESSONS_DIR }));
api.use(documentsRouter({ lessonsDir: LESSONS_DIR }));
api.use(webhooksRouter({ dataDir: DATA_DIR, lessonsDir: LESSONS_DIR }));
api.use(jobsRouter({ jobsFile: path.resolve(process.env.JOBS_FILE || path.join(ROOT, 'demo', 'data', 'jobs.json')), dataDir: DATA_DIR }));
const certificates = certificatesRouter({ dataDir: DATA_DIR, publicUrl: process.env.PUBLIC_URL });
api.use(certificates.api);
app.use('/api/v1', api);
app.use(certificates.pages);

/**
 * Every new key comes with a practice lesson of its own: a copy of the demo lesson that the provider owns,
 * so they can try captions, audio description, sign language and slides at once, before uploading anything.
 */
async function practiceLesson(provider, req) {
  const id = `practice-${randomBytes(3).toString('hex')}`;
  const from = path.join(LESSONS_DIR, 'demo');
  const to = path.join(LESSONS_DIR, id);
  // Generated files (documents, offline pack) and old versions are rebuilt or not needed.
  await cp(from, to, { recursive: true, filter: (src) => !/(^|\/)(document|offline\.zip|pages\.json)$|\.previous/.test(path.relative(from, src)) });
  const m = JSON.parse(await readFile(path.join(to, 'manifest.json'), 'utf8'));
  Object.assign(m, { id, title: `Practice lesson: ${m.title}`, owner: provider.id, practice: true, createdAt: new Date().toISOString() });
  if (m.titles?.am) m.titles = { ...m.titles, am: `የልምምድ ትምህርት፦ ${m.titles.am}` };
  await writeFile(path.join(to, 'manifest.json'), JSON.stringify(m, null, 2));
  return {
    practiceLesson: { id, title: m.title, href: `${publicOrigin(req)}/api/v1/lessons/${id}`, embed: embedCode(req, id) },
    next: {
      docs: `${publicOrigin(req)}/docs`,
      addLesson: `${publicOrigin(req)}/studio/lessons.html`,
      captions: `${publicOrigin(req)}/studio/captions.html?lesson=${id}`,
    },
  };
}

/**
 * Ready-made example lessons that ship with the app (demo/data/lessons/<id> with its media and captions).
 * Copied into the data folder when missing, so they are there after every restart, even on a host with no disk.
 * ("demo" itself is built by scripts/make-demo.sh.)
 */
export async function seedLessons() {
  const from = path.join(ROOT, 'demo', 'data', 'lessons');
  for (const d of await readdir(from, { withFileTypes: true }).catch(() => [])) {
    if (!d.isDirectory() || d.name === 'demo' || !ID.test(d.name)) continue;
    const m = await readFile(path.join(from, d.name, 'manifest.json'), 'utf8').then(JSON.parse).catch(() => null);
    if (!m?.sources?.length) continue;
    const to = path.join(LESSONS_DIR, d.name);
    if (await readFile(path.join(to, 'manifest.json')).then(() => true, () => false)) continue;
    await cp(path.join(from, d.name), to, { recursive: true });
    console.log(`example lesson added: ${d.name}`);
  }
}

/** A test certificate so the jobs page has something to share. Fixed id: demo-learner. */
export async function ensureDemoCertificate(port = PORT) {
  const file = path.join(DATA_DIR, 'certificates', 'demo-learner.json');
  if (await readFile(file).then(() => true, () => false)) return;
  const req = { protocol: 'http', get: () => `localhost:${port}` };
  await certificates.issue(req, {
    id: 'demo-learner',
    learnerName: 'Test Learner',
    achievement: { id: 'demo', name: 'How to write a CV', description: 'Amedia lesson: writing a CV for your first job.' },
  });
}

app.use((err, req, res, _next) => {
  if (err.status === 404 || err.statusCode === 404) return res.status(404).end();
  console.error(err);
  res.status(500).json({ error: 'server_error', message: 'Something went wrong on the server.' });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  adminToken();
  await seedLessons().catch((err) => console.error('example lessons:', err.message));
  await ensureDemoCertificate();
  warmUpSpeechModel(); // in the background: download the speech model if the speech server does not have it yet
  app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
}

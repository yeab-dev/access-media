import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureOfflinePack } from './offline.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const PORT = Number(process.env.PORT || 8080);
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  next();
});

// Lessons and the player are public and embeddable on other sites.
const cors = (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  next();
};

// no-cache = browsers revalidate (cheap 304 via ETag), so host sites always get the current player.
app.use('/player', cors, express.static(path.join(ROOT, 'public'), { cacheControl: false, setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));
app.use('/media', cors, express.static(MEDIA_DIR, { maxAge: '1d', fallthrough: false }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/media/:id', cors, async (req, res) => {
  const { id } = req.params;
  if (!ID.test(id)) return res.status(400).json({ error: 'invalid_id' });
  try {
    const manifest = JSON.parse(await readFile(path.join(MEDIA_DIR, id, 'manifest.json'), 'utf8'));
    // Make file references absolute so any host page can use them.
    const base = `${req.protocol}://${req.get('host')}/media/${id}/`;
    const abs = (p) => (p ? new URL(p, base).href : p);
    manifest.poster = abs(manifest.poster);
    manifest.sources = (manifest.sources || []).map((s) => ({ ...s, src: abs(s.src) }));
    manifest.tracks = (manifest.tracks || []).map((t) => ({ ...t, src: abs(t.src) }));
    if (manifest.sign) manifest.sign = { ...manifest.sign, src: abs(manifest.sign.src) };
    manifest.offline = `${req.protocol}://${req.get('host')}/api/media/${id}/offline.zip`;
    res.json(manifest);
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'not_found' });
    throw err;
  }
});

// Offline pack: built on first request, cached, served with Range support so 3G downloads can resume.
app.get('/api/media/:id/offline.zip', cors, async (req, res, next) => {
  const { id } = req.params;
  if (!ID.test(id)) return res.status(400).json({ error: 'invalid_id' });
  try {
    const file = await ensureOfflinePack(path.join(MEDIA_DIR, id));
    res.sendFile(file, {
      headers: { 'Content-Disposition': `attachment; filename="${id}-offline.zip"`, 'Cache-Control': 'no-cache' },
    });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'not_found' });
    next(err);
  }
});

// Savanna integration preview. Point SAVANNA_DIR at a checkout of alx-africa/Savanna-static-pages.
// The concept page gets the player inserted where Savanna would render a `::video <id> ::` directive.
// (We serve the local checkout rather than copying Savanna's files into this repo: it has no licence.)
const SAVANNA_DIR = process.env.SAVANNA_DIR ? path.resolve(process.env.SAVANNA_DIR) : null;
if (SAVANNA_DIR) {
  app.get('/savanna/pages/concept-with-navigation.html', async (req, res) => {
    const media = ID.test(String(req.query.media || '')) ? req.query.media : 'demo';
    let html = await readFile(path.join(SAVANNA_DIR, 'pages', 'concept-with-navigation.html'), 'utf8');
    const content = /(<div class="gap formatted-content[^"]*">)/;
    if (!content.test(html)) console.warn('Savanna page changed: could not find the concept content area');
    html = html
      .replace('</head>', '  <script type="module" src="/player/access-player.js"></script>\n</head>')
      .replace(content, `$1\n<access-player media="${media}" heading-level="2"></access-player>`);
    res.type('html').send(html);
  });
  app.get(['/savanna', '/savanna/'], (_req, res) => res.redirect('/savanna/pages/concept-with-navigation.html'));
  app.use('/savanna', express.static(SAVANNA_DIR));
}

app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

app.use((err, req, res, next) => {
  if (err.status === 404 || err.statusCode === 404) return res.status(404).end();
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
}

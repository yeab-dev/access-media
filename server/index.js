import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

app.use('/player', cors, express.static(path.join(ROOT, 'public'), { maxAge: '1h' }));
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
    res.json(manifest);
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'not_found' });
    throw err;
  }
});

app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

app.use((err, req, res, next) => {
  if (err.status === 404 || err.statusCode === 404) return res.status(404).end();
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
}

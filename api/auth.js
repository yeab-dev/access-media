// Who is calling. Two kinds of key, both sent as "Authorization: Bearer <key>":
//  - the host's master key (ADMIN_TOKEN in .env): can do everything;
//  - a lesson provider's own key (from POST /api/v1/keys or the /get-key page): can add lessons and change
//    only the lessons, jobs, certificates and webhooks that belong to that provider, within limits.
// Keys are stored only as SHA-256 hashes. The only thing we keep about a provider is the name they typed.

import express from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

const hash = (key) => createHash('sha256').update(key).digest('hex');

export const limits = () => ({
  lessons: Number(process.env.PROVIDER_MAX_LESSONS || 10),
  uploadMB: Number(process.env.PROVIDER_MAX_UPLOAD_MB || 200),
  jobs: Number(process.env.PROVIDER_MAX_JOBS || 50),
  webhooks: 5,
});

let store = null; // set by configureAuth

/** The host's master key. If it is missing we make one up at start and print it, so nothing is ever left open. */
export function adminToken() {
  if (!process.env.ADMIN_TOKEN) {
    process.env.ADMIN_TOKEN = randomBytes(18).toString('base64url');
    console.log(`ADMIN_TOKEN was not set. Master key for this run: ${process.env.ADMIN_TOKEN}`);
  }
  return process.env.ADMIN_TOKEN;
}

function sameText(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function configureAuth({ dataDir }) {
  const file = path.join(dataDir, 'providers.json');
  let writing = Promise.resolve();
  const load = () => readFile(file, 'utf8').then(JSON.parse).catch(() => ({ providers: [] }));
  const save = async (data) => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(data, null, 2), { mode: 0o600 });
    await rename(`${file}.tmp`, file);
  };
  /** Serialise read-modify-write so two sign-ups at once do not lose one. */
  const change = (fn) => (writing = writing.then(async () => { const d = await load(); const r = await fn(d); await save(d); return r; }));
  store = { load, change };
  return store;
}

/** { admin: true } | { provider: { id, name } } | null */
export async function whoIs(req) {
  const key = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!key) return null;
  if (sameText(key, adminToken())) return { admin: true };
  if (!store) return null;
  const h = hash(key);
  const p = (await store.load()).providers.find((x) => x.keyHash === h);
  return p ? { provider: { id: p.id, name: p.name } } : null;
}

const UNAUTHORISED = {
  error: 'unauthorised',
  message: 'This needs your API key. Send it as "Authorization: Bearer <your key>". Get a key at /get-key.',
};

/** Any valid key: the master key or a provider key. Sets req.who. */
export async function requireKey(req, res, next) {
  try {
    const who = await whoIs(req);
    if (!who) return res.status(401).json(UNAUTHORISED);
    req.who = who;
    next();
  } catch (err) { next(err); }
}

/** The master key only (host administration). */
export async function requireAdmin(req, res, next) {
  const who = await whoIs(req).catch(() => null);
  if (!who) return res.status(401).json(UNAUTHORISED);
  if (!who.admin) return res.status(403).json({ error: 'forbidden', message: 'Only the host\'s master key can do this.' });
  req.who = who;
  next();
}

/** The owner id to record on something new: the provider's id, or null for the host. */
export const ownerOf = (req) => req.who?.provider?.id ?? null;

/** May this caller change a thing with this owner? The master key may change anything. */
export const mayChange = (req, owner) => !!req.who?.admin || (!!owner && owner === req.who?.provider?.id);

export const notYours = (res, what = 'lesson') => res.status(403).json({
  error: 'not_yours', message: `This ${what} belongs to another provider. Your key can only change your own.`,
});

/** POST /api/v1/keys (public), GET /api/v1/me, POST /api/v1/me/key. */
export function keysRouter({ onNewProvider } = {}) {
  const router = express.Router();
  const recent = new Map(); // ip -> [times]; at most 5 new keys per address per hour

  router.post('/keys', express.json({ limit: '2kb' }), async (req, res, next) => {
    try {
      if ((process.env.SIGNUP || 'open') !== 'open') {
        return res.status(403).json({ error: 'signup_closed', message: 'This server does not give out keys. Ask the people who run it for one.' });
      }
      const name = String(req.body?.organisation ?? req.body?.name ?? '').trim().replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 80) {
        return res.status(400).json({ error: 'invalid_organisation', message: 'Give the name of your organisation (2 to 80 characters).' });
      }
      const now = Date.now();
      const times = (recent.get(req.ip) || []).filter((t) => now - t < 3_600_000);
      if (times.length >= 5) {
        return res.status(429).json({ error: 'too_many', message: 'Too many keys from this address in the last hour. Try again later.' });
      }
      recent.set(req.ip, [...times, now]);

      const key = `dbk_${randomBytes(24).toString('base64url')}`;
      const provider = await store.change((d) => {
        const p = { id: `p_${randomBytes(6).toString('hex')}`, name, keyHash: hash(key), keyEnd: key.slice(-4), createdAt: new Date().toISOString() };
        d.providers.push(p);
        return { id: p.id, name: p.name };
      });
      const extra = onNewProvider ? await onNewProvider(provider, req).catch((err) => { console.error('new provider setup failed', err); return {}; }) : {};
      res.status(201).json({
        key,
        note: 'Keep this key safe: it is shown only once. Anyone with it can change your lessons.',
        provider,
        limits: limits(),
        ...extra,
      });
    } catch (err) { next(err); }
  });

  router.get('/me', requireKey, async (req, res) => {
    if (req.who.admin) return res.json({ admin: true, name: 'Host (master key)', limits: null });
    const p = (await store.load()).providers.find((x) => x.id === req.who.provider.id);
    res.json({ admin: false, provider: req.who.provider, keyEndsWith: p?.keyEnd, createdAt: p?.createdAt, limits: limits() });
  });

  // A new key; the old one stops working at once.
  router.post('/me/key', requireKey, async (req, res) => {
    if (req.who.admin) return res.status(400).json({ error: 'master_key', message: 'The master key is set in the server\'s .env file (ADMIN_TOKEN).' });
    const key = `dbk_${randomBytes(24).toString('base64url')}`;
    await store.change((d) => {
      const p = d.providers.find((x) => x.id === req.who.provider.id);
      p.keyHash = hash(key); p.keyEnd = key.slice(-4);
    });
    res.status(201).json({ key, note: 'Your old key no longer works. Keep this one safe: it is shown only once.' });
  });

  return router;
}

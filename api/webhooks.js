// Webhooks: a host registers an address; we POST to it when something happens.
// Body: { event, time, data }. Header X-DB-Signature: sha256=<HMAC of the body with the webhook's secret>,
// so the host can check the message came from us. One attempt, 5-second timeout (no retries).
// A provider's webhook hears only about that provider's lessons and certificates; the master key's hear everything.

import express from 'express';
import { createHmac, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { requireKey, ownerOf, mayChange, limits } from './auth.js';
import { events } from './events.js';

export const EVENTS = ['lesson.ready', 'sign.recorded', 'sign.requested', 'captions.updated', 'certificate.issued'];

export function sign(secret, body) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export function webhooksRouter({ dataDir, lessonsDir }) {
  const router = express.Router();
  const file = path.join(dataDir, 'webhooks.json');
  const load = () => readFile(file, 'utf8').then(JSON.parse).catch(() => []);
  const save = async (list) => { await mkdir(dataDir, { recursive: true }); await writeFile(file, JSON.stringify(list, null, 2), { mode: 0o600 }); };
  const visible = ({ secret, owner, ...rest }) => rest;
  const mine = (req, list) => list.filter((h) => req.who.admin || h.owner === ownerOf(req));

  router.post('/webhooks', requireKey, express.json({ limit: '10kb' }), async (req, res) => {
    const { url, events: wanted = EVENTS } = req.body || {};
    let parsed;
    try { parsed = new URL(url); } catch { /* handled below */ }
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'invalid_url', message: 'Give the address to call, starting with https:// (or http:// for testing).' });
    }
    const unknown = [].concat(wanted).filter((e) => !EVENTS.includes(e));
    if (unknown.length) return res.status(400).json({ error: 'invalid_event', message: `Unknown event: ${unknown[0]}. Choose from ${EVENTS.join(', ')}.` });
    if (!req.who.admin && mine(req, await load()).length >= limits().webhooks) {
      return res.status(403).json({ error: 'limit_reached', message: `You have ${limits().webhooks} webhooks, the most a key can have. Delete one first.` });
    }
    const hook = { id: randomBytes(6).toString('base64url'), url: parsed.href, events: [].concat(wanted), secret: randomBytes(24).toString('base64url'), createdAt: new Date().toISOString(), owner: ownerOf(req) };
    await save([...(await load()), hook]);
    // The secret is shown once, now. Keep it to check X-DB-Signature.
    const { owner, ...shown } = hook;
    res.status(201).json({ ...shown, note: 'Keep the secret: it is shown only once. Use it to check the X-DB-Signature header on each call.' });
  });

  router.get('/webhooks', requireKey, async (req, res) => res.json({ webhooks: mine(req, await load()).map(visible), events: EVENTS }));

  router.delete('/webhooks/:id', requireKey, async (req, res) => {
    const list = await load();
    const hook = list.find((h) => h.id === req.params.id && mayChange(req, h.owner));
    if (!hook) return res.status(404).json({ error: 'not_found', message: 'You have no webhook with this id.' });
    const kept = list.filter((h) => h !== hook);
    await save(kept);
    res.status(204).end();
  });

  for (const event of EVENTS) {
    events.on(event, async ({ owner: given, ...data }) => {
      // Whose is it? Certificates say so; lesson events: the lesson's owner.
      let owner = given ?? null;
      if (owner === null && data.lesson && lessonsDir) {
        owner = await readFile(path.join(lessonsDir, path.basename(String(data.lesson)), 'manifest.json'), 'utf8')
          .then((t) => JSON.parse(t).owner ?? null).catch(() => null);
      }
      const body = JSON.stringify({ event, time: new Date().toISOString(), data });
      for (const hook of (await load()).filter((h) => h.events.includes(event) && (!h.owner || h.owner === owner))) {
        fetch(hook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-DB-Event': event, 'X-DB-Signature': sign(hook.secret, body) },
          body,
          signal: AbortSignal.timeout(5000),
        }).catch((err) => console.warn(`webhook ${hook.id} (${event}) failed: ${err.message}`));
      }
    });
  }
  return router;
}

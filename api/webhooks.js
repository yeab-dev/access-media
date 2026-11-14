// Webhooks: a host registers an address; we POST to it when something happens.
// Body: { event, time, data }. Header X-DB-Signature: sha256=<HMAC of the body with the webhook's secret>,
// so the host can check the message came from us. One attempt, 5-second timeout (no retries).

import express from 'express';
import { createHmac, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { requireStaff } from './sign.js';
import { events } from './events.js';

export const EVENTS = ['sign.recorded', 'sign.requested', 'captions.updated', 'certificate.issued'];

export function sign(secret, body) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export function webhooksRouter({ dataDir }) {
  const router = express.Router();
  const file = path.join(dataDir, 'webhooks.json');
  const load = () => readFile(file, 'utf8').then(JSON.parse).catch(() => []);
  const save = async (list) => { await mkdir(dataDir, { recursive: true }); await writeFile(file, JSON.stringify(list, null, 2), { mode: 0o600 }); };
  const visible = ({ secret, ...rest }) => rest;

  router.post('/webhooks', express.json({ limit: '10kb' }), requireStaff, async (req, res) => {
    const { url, events: wanted = EVENTS } = req.body || {};
    let parsed;
    try { parsed = new URL(url); } catch { /* handled below */ }
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'invalid_url', message: 'Give the address to call, starting with https:// (or http:// for testing).' });
    }
    const unknown = [].concat(wanted).filter((e) => !EVENTS.includes(e));
    if (unknown.length) return res.status(400).json({ error: 'invalid_event', message: `Unknown event: ${unknown[0]}. Choose from ${EVENTS.join(', ')}.` });
    const hook = { id: randomBytes(6).toString('base64url'), url: parsed.href, events: [].concat(wanted), secret: randomBytes(24).toString('base64url'), createdAt: new Date().toISOString() };
    await save([...(await load()), hook]);
    // The secret is shown once, now. Keep it to check X-DB-Signature.
    res.status(201).json(hook);
  });

  router.get('/webhooks', requireStaff, async (_req, res) => res.json({ webhooks: (await load()).map(visible), events: EVENTS }));

  router.delete('/webhooks/:id', requireStaff, async (req, res) => {
    const list = await load();
    const kept = list.filter((h) => h.id !== req.params.id);
    if (kept.length === list.length) return res.status(404).json({ error: 'not_found', message: 'There is no webhook with this id.' });
    await save(kept);
    res.status(204).end();
  });

  for (const event of EVENTS) {
    events.on(event, async (data) => {
      const body = JSON.stringify({ event, time: new Date().toISOString(), data });
      for (const hook of (await load()).filter((h) => h.events.includes(event))) {
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

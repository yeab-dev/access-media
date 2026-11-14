import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import express from 'express';

const dir = await mkdtemp(path.join(tmpdir(), 'hook-test-'));
await cp(new URL('../../data/lessons/demo', import.meta.url).pathname, path.join(dir, 'lessons/demo'), { recursive: true });
process.env.DATA_DIR = dir;
process.env.ADMIN_TOKEN = 'unit-test-code';
const { app } = await import('../../api/index.js');

let server; let base; let receiver; const received = [];
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api/v1`;
  const host = express();
  host.post('/hook', express.text({ type: '*/*' }), (req, res) => { received.push({ body: req.body, sig: req.get('x-db-signature'), event: req.get('x-db-event') }); res.end(); });
  receiver = host.listen(0);
  await new Promise((r) => receiver.once('listening', r));
});
after(async () => { server.close(); receiver.close(); await rm(dir, { recursive: true, force: true }); });

const staff = { 'Content-Type': 'application/json', Authorization: 'Bearer unit-test-code' };
const waitFor = async (n) => { for (let i = 0; i < 50 && received.length < n; i++) await new Promise((r) => setTimeout(r, 50)); };

test('register a webhook (staff only), checked input', async () => {
  assert.equal((await fetch(`${base}/webhooks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"url":"http://x"}' })).status, 401);
  const bad = await fetch(`${base}/webhooks`, { method: 'POST', headers: staff, body: '{"url":"ftp://x"}' });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).message, /https:\/\//);
  assert.equal((await fetch(`${base}/webhooks`, { method: 'POST', headers: staff, body: '{"url":"http://x","events":["nope"]}' })).status, 400);
});

test('events are POSTed, signed with the secret, and carry no learner names', async () => {
  const reg = await fetch(`${base}/webhooks`, { method: 'POST', headers: staff, body: JSON.stringify({ url: `http://localhost:${receiver.address().port}/hook` }) });
  assert.equal(reg.status, 201);
  const { id, secret } = await reg.json();
  assert.ok(secret.length > 20);

  await fetch(`${base}/lessons/demo/sign-requests`, { method: 'POST' });
  await fetch(`${base}/certificates`, { method: 'POST', headers: staff, body: JSON.stringify({ learnerName: 'Private Person', achievement: { name: 'How to write a CV' } }) });
  await waitFor(2);
  assert.deepEqual(received.map((r) => r.event).sort(), ['certificate.issued', 'sign.requested']);
  for (const r of received) {
    assert.equal(r.sig, `sha256=${createHmac('sha256', secret).update(r.body).digest('hex')}`);
    assert.doesNotMatch(r.body, /Private Person/);
  }
  const listed = await (await fetch(`${base}/webhooks`, { headers: staff })).json();
  assert.equal(listed.webhooks[0].secret, undefined, 'secrets are never listed');
  assert.equal((await fetch(`${base}/webhooks/${id}`, { method: 'DELETE', headers: staff })).status, 204);
});

test('compression is on for text, off for media', async () => {
  const js = await fetch(`${base.replace('/api/v1', '')}/module/db-player.js`, { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(js.headers.get('content-encoding'), 'gzip');
  const zip = await fetch(`${base}/lessons/demo/offline-pack`, { headers: { 'Accept-Encoding': 'gzip', Range: 'bytes=0-9' } });
  assert.equal(zip.status, 206);
});

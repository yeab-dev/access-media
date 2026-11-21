import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../../api/index.js';

let server;
let base;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api/v1`;
});
after(() => server.close());

test('GET /lessons lists the demo lesson', async () => {
  const body = await (await fetch(`${base}/lessons`)).json();
  assert.ok(body.lessons.some((l) => l.id === 'demo'));
});

test('GET /lessons/{id} returns absolute media URLs and links', async () => {
  const res = await fetch(`${base}/lessons/demo`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const m = await res.json();
  assert.match(m.sources[0].src, /^http:\/\/localhost:\d+\/media\/demo\/lesson\.mp4$/);
  assert.match(m.sign.src, /lesson\.ethsl\.mp4$/);
  assert.match(m.links.offlinePack, /\/api\/v1\/lessons\/demo\/offline-pack$/);
});

test('errors are 400 / 404 with a message in words', async () => {
  const bad = await fetch(`${base}/lessons/BAD_ID`);
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).message, /lowercase/);
  const missing = await fetch(`${base}/lessons/nope`);
  assert.equal(missing.status, 404);
  assert.match((await missing.json()).message, /no lesson/);
});

test('transcript as HTML (Amharic) and as text, with descriptions', async () => {
  const html = await (await fetch(`${base}/lessons/demo/transcript?lang=am`)).text();
  assert.match(html, /<html lang="am">/);
  assert.match(html, /መግለጫ/);
  const txt = await fetch(`${base}/lessons/demo/transcript?lang=en&format=txt`);
  assert.match(txt.headers.get('content-type'), /text\/plain/);
  const body = await txt.text();
  assert.match(body, /\[0:14\] Description: Birtukan Yesfu/);
  assert.match(body, /\[0:05\] It was discovered when I started having/);
  assert.equal((await fetch(`${base}/lessons/demo/transcript?lang=fr`)).status, 404);
});

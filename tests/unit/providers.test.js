import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';

const dir = await mkdtemp(path.join(tmpdir(), 'providers-test-'));
await cp(new URL('../../data/lessons/demo', import.meta.url).pathname, path.join(dir, 'lessons/demo'), { recursive: true });
process.env.DATA_DIR = dir;
process.env.ADMIN_TOKEN = 'unit-test-master';
delete process.env.ASR_URL;
process.env.WHISPER_MODEL = 'off'; // these tests are about the remote speech server or none; whisper.cpp has its own tests
const { app } = await import('../../api/index.js');

let server; let base; let hookServer; const received = [];
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api/v1`;
  const hooks = express();
  hooks.post('/hook/:who', express.json(), (req, res) => { received.push({ who: req.params.who, ...req.body }); res.end(); });
  hookServer = hooks.listen(0);
  await new Promise((r) => hookServer.once('listening', r));
});
after(async () => { server.close(); hookServer.close(); await rm(dir, { recursive: true, force: true }); });

const call = (method, url, { key, json } = {}) => fetch(`${base}${url}`, {
  method,
  headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}) },
  body: json ? JSON.stringify(json) : undefined,
});
const newKey = async (organisation) => {
  const res = await call('POST', '/keys', { json: { organisation } });
  assert.equal(res.status, 201);
  return res.json();
};
const VTT = 'WEBVTT\n\n00:00:00.500 --> 00:00:05.000\nHello.\n';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let a; let b;
test('get a key: a name is enough; the key works at once and comes with a practice lesson', async () => {
  const short = await call('POST', '/keys', { json: { organisation: 'x' } });
  assert.equal(short.status, 400);
  assert.match((await short.json()).message, /name of your organisation/);

  a = await newKey('Debo Learning');
  assert.match(a.key, /^dbk_[A-Za-z0-9_-]{32}$/);
  assert.match(a.note, /shown only once/);
  assert.equal(a.provider.name, 'Debo Learning');
  assert.deepEqual(a.limits, { lessons: 10, uploadMB: 200, jobs: 50, webhooks: 5 });
  assert.match(a.practiceLesson.id, /^practice-[0-9a-f]{6}$/);
  assert.match(a.practiceLesson.embed, new RegExp(`<db-player lesson="${a.practiceLesson.id}"></db-player>$`));

  const me = await (await call('GET', '/me', { key: a.key })).json();
  assert.deepEqual(me.provider, a.provider);
  assert.equal(me.admin, false);
  assert.equal((await call('GET', '/me', { key: 'dbk_wrong' })).status, 401);
  assert.equal((await (await call('GET', '/me', { key: 'unit-test-master' })).json()).admin, true);

  // The practice lesson is a full lesson, and it is theirs.
  const lesson = await (await call('GET', `/lessons/${a.practiceLesson.id}`)).json();
  assert.match(lesson.title, /^Practice lesson: /);
  assert.ok(lesson.tracks.some((t) => t.kind === 'captions' && t.srclang === 'am'));
  const mine = await (await call('GET', '/me/lessons', { key: a.key })).json();
  assert.deepEqual(mine.lessons.map((l) => l.id), [a.practiceLesson.id]);
  assert.match(mine.lessons[0].embed, /db-player\.js/);

  // Nothing about the provider but the name is kept; the key is stored only as a hash.
  const stored = await import('node:fs/promises').then((fs) => fs.readFile(path.join(dir, 'providers.json'), 'utf8'));
  assert.ok(!stored.includes(a.key));
});

test('a key changes only its own things', async () => {
  b = await newKey('Another Provider');
  const own = a.practiceLesson.id;
  // Own lesson: yes. The host's demo lesson and another provider's lesson: no, said in words.
  assert.equal((await call('POST', `/lessons/${own}/captions`, { key: a.key, json: { lang: 'en', vtt: VTT } })).status, 201);
  const demo = await call('POST', '/lessons/demo/captions', { key: a.key, json: { lang: 'en', vtt: VTT } });
  assert.equal(demo.status, 403);
  assert.match((await demo.json()).message, /belongs to another provider/);
  assert.equal((await call('POST', `/lessons/${own}/captions`, { key: b.key, json: { lang: 'en', vtt: VTT } })).status, 403);
  assert.equal((await call('PATCH', `/lessons/${own}`, { key: b.key, json: { title: 'Taken over' } })).status, 403);
  assert.equal((await call('DELETE', `/lessons/${own}`, { key: b.key })).status, 403);
  assert.equal((await call('PUT', `/lessons/${own}/slides`, { key: b.key, json: { slides: [] } })).status, 403);
  // The master key may change anything.
  assert.equal((await call('POST', '/lessons/demo/captions', { key: 'unit-test-master', json: { lang: 'om', vtt: VTT } })).status, 201);
});

test('lesson details: Amharic title, slides with picture descriptions, delete', async () => {
  const id = a.practiceLesson.id;
  const changed = await call('PATCH', `/lessons/${id}`, { key: a.key, json: { titles: { am: 'የልምምድ ትምህርት' } } });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).titles.am, 'የልምምድ ትምህርት');
  assert.equal((await call('PATCH', `/lessons/${id}`, { key: a.key, json: {} })).status, 400);

  const badSlides = await call('PUT', `/lessons/${id}/slides`, { key: a.key, json: { slides: [{ time: 'soon', en: { title: 'x' } }] } });
  assert.equal(badSlides.status, 400);
  assert.match((await badSlides.json()).message, /Slide 1: "time"/);
  const slides = { slides: [{ time: 5, en: { title: 'Second', alt: 'A list.' } }, { time: 0.5, en: { title: 'First', alt: 'A title slide.' }, am: { title: 'መጀመሪያ' } }] };
  const put = await call('PUT', `/lessons/${id}/slides`, { key: a.key, json: slides });
  assert.equal(put.status, 200);
  const got = await (await call('GET', `/lessons/${id}/slides`)).json();
  assert.deepEqual(got.slides.map((s) => s.en.title), ['First', 'Second'], 'sorted by time');
  assert.equal(got.slides[0].am.title, 'መጀመሪያ');

  assert.equal((await call('DELETE', `/lessons/${id}`, { key: a.key })).status, 204);
  assert.equal((await call('GET', `/lessons/${id}`)).status, 404);
  await assert.rejects(access(path.join(dir, 'lessons', id)));
  assert.equal((await (await call('GET', '/me/lessons', { key: a.key })).json()).lessons.length, 0);
});

test('limits: lessons per key, said in words', async () => {
  process.env.PROVIDER_MAX_LESSONS = '1';
  try {
    const c = await newKey('Limited Provider'); // the practice lesson is its one lesson
    const form = new FormData();
    form.append('title', 'One too many');
    form.append('video', new Blob([Buffer.alloc(1000)]), 'x.mp4');
    const res = await fetch(`${base}/lessons`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${c.key}` } });
    assert.equal(res.status, 403);
    assert.match((await res.json()).message, /1 lessons, the most a key can have/);
  } finally {
    delete process.env.PROVIDER_MAX_LESSONS;
  }
});

test('jobs: add with checks in words, list by provider, only the owner changes them', async () => {
  const bad = await call('POST', '/jobs', { key: a.key, json: { employer: 'Debo' } });
  assert.equal(bad.status, 400);
  const problems = (await bad.json()).problems;
  assert.ok(problems.some((p) => p.startsWith('"city"')) && problems.some((p) => p.startsWith('"apply"')));

  const job = {
    employer: 'Debo Learning', city: 'Addis Ababa', remote: true, employmentType: 'PART_TIME', validThrough: '2026-12-31',
    apply: 'mailto:jobs@example.com', support: ['interpreter'],
    en: { title: 'Customer Service Assistant', summary: 'Answer questions by chat.' }, am: { title: 'የደንበኞች አገልግሎት ረዳት', summary: 'ጥያቄዎችን በቻት ይመልሳሉ።' },
  };
  const res = await call('POST', '/jobs', { key: a.key, json: job });
  assert.equal(res.status, 201);
  const made = await res.json();
  assert.equal(made.id, 'customer-service-assistant');
  assert.match(made.card, /<db-job-card job="customer-service-assistant">/);
  assert.equal(made.jsonLd['@type'], 'JobPosting');
  assert.equal(made.owner, undefined, 'owner ids are not shown');

  const list = await (await call('GET', `/jobs?provider=${a.provider.id}`)).json();
  assert.deepEqual(list.jobs.map((j) => j.id), ['customer-service-assistant']);
  assert.ok((await (await call('GET', '/jobs')).json()).jobs.length >= 4, 'test jobs are still listed');
  const host = (await (await call('GET', '/jobs?provider=host')).json()).jobs.map((j) => j.id);
  assert.ok(host.includes('junior-frontend') && !host.includes('customer-service-assistant'), '?provider=host: only the host\'s own jobs');

  assert.equal((await call('PATCH', '/jobs/customer-service-assistant', { key: b.key, json: { city: 'Adama' } })).status, 403);
  assert.equal((await call('PATCH', '/jobs/junior-frontend', { key: a.key, json: { city: 'Adama' } })).status, 403, 'test jobs are read only');
  const patched = await call('PATCH', '/jobs/customer-service-assistant', { key: a.key, json: { city: 'Adama' } });
  assert.equal((await patched.json()).city, 'Adama');
  assert.equal((await call('DELETE', '/jobs/customer-service-assistant', { key: b.key })).status, 403);
  assert.equal((await call('DELETE', '/jobs/customer-service-assistant', { key: a.key })).status, 204);
});

test('webhooks: a provider hears only about its own lessons', async () => {
  const hookBase = `http://localhost:${hookServer.address().port}/hook`;
  const lessonB = b.practiceLesson.id;
  const reg = await call('POST', '/webhooks', { key: b.key, json: { url: `${hookBase}/b`, events: ['captions.updated'] } });
  assert.equal(reg.status, 201);
  const hook = await reg.json();
  assert.ok(hook.secret);
  assert.equal(hook.owner, undefined);
  await call('POST', '/webhooks', { key: a.key, json: { url: `${hookBase}/a`, events: ['captions.updated'] } });

  // B's lesson changes: only B's hook hears it.
  received.length = 0;
  await call('POST', `/lessons/${lessonB}/captions`, { key: b.key, json: { lang: 'en', vtt: VTT } });
  await wait(300);
  assert.deepEqual(received.map((r) => r.who), ['b']);
  assert.equal(received[0].data.lesson, lessonB);

  // Each sees and removes only their own.
  assert.equal((await (await call('GET', '/webhooks', { key: a.key })).json()).webhooks.length, 1);
  assert.equal((await call('DELETE', `/webhooks/${hook.id}`, { key: a.key })).status, 404);
  assert.equal((await call('DELETE', `/webhooks/${hook.id}`, { key: b.key })).status, 204);
});

test('certificates name the provider; a new key replaces the old one', async () => {
  const res = await call('POST', '/certificates', { key: a.key, json: { learnerName: 'Test Learner', achievement: { name: 'Getting your first job' } } });
  const given = await res.clone().json();
  const mine = (await (await call('GET', '/me/certificates', { key: a.key })).json()).certificates;
  assert.deepEqual(mine.map((c) => [c.id, c.learnerName, c.achievement]), [[given.id, 'Test Learner', 'Getting your first job']]);
  assert.equal((await (await call('GET', '/me/certificates', { key: b.key })).json()).certificates.length, 0, 'another provider does not see them');
  assert.equal((await call('GET', '/me/certificates')).status, 401);
  assert.equal(res.status, 201);
  const cert = await res.json();
  assert.equal(cert.credential.issuer.name, 'Debo Learning (via Amedia)');
  const page = await (await fetch(cert.page)).text();
  assert.match(page, /✓ Verified/);
  assert.match(page, /Debo Learning \(via Amedia\)/);

  const rotated = await call('POST', '/me/key', { key: a.key });
  assert.equal(rotated.status, 201);
  const { key } = await rotated.json();
  assert.equal((await call('GET', '/me', { key: a.key })).status, 401, 'old key stops working');
  assert.equal((await (await call('GET', '/me', { key })).json()).provider.id, a.provider.id, 'same provider, new key');
});

test('where a lesson is shown: reported by the player, address only, seen only by the owner', async () => {
  const lesson = b.practiceLesson.id;
  const report = (page, origin) => fetch(`${base}/lessons/${lesson}/pages`, {
    method: 'POST', body: page, headers: { 'Content-Type': 'text/plain', ...(origin ? { Origin: origin } : {}) },
  });
  const own = new URL(base).origin;
  const pagesOf = async (key = b.key) => (await (await call('GET', `/lessons/${lesson}/pages`, { key })).json()).pages;
  assert.deepEqual(await pagesOf(), [], 'a practice lesson starts with no pages');

  assert.equal((await report('https://debo.example/courses/cv?learner=abebe#t=10', 'https://debo.example')).status, 204);
  assert.equal((await report('https://debo.example/courses/cv?other=1', 'https://debo.example')).status, 204, 'the same page again');
  assert.equal((await report('https://debo.example/x', 'https://evil.example')).status, 400, 'the page must be on the site that sends it');
  assert.equal((await report('https://debo.example/x')).status, 400, 'only a browser on a page reports it');
  assert.equal((await report('javascript:alert(1)', 'null')).status, 400);
  assert.equal((await report(`${own}/provider/lesson`, own)).status, 204);
  assert.equal((await report(`${own}/studio/captions.html`, own)).status, 204);
  await wait(50);
  const pages = await pagesOf();
  assert.deepEqual(pages.map((p) => p.url), ['https://debo.example/courses/cv'], 'no query or hash kept; the dashboard and studio previews do not count');
  assert.ok(pages[0].firstSeen && pages[0].lastSeen);

  const other = await newKey('Pages Other Provider');
  assert.equal((await call('GET', `/lessons/${lesson}/pages`, { key: other.key })).status, 403, 'only the owner sees them');
  assert.equal((await call('GET', `/lessons/${lesson}/pages`)).status, 401);
  const mine = (await (await call('GET', '/me/lessons', { key: b.key })).json()).lessons.find((l) => l.id === lesson);
  assert.equal(mine.pages.length, 1, '/me/lessons includes them');

  assert.equal((await call('DELETE', `/lessons/${lesson}/pages?page=${encodeURIComponent('https://debo.example/courses/cv')}`, { key: other.key })).status, 403);
  assert.equal((await call('DELETE', `/lessons/${lesson}/pages?page=${encodeURIComponent('https://debo.example/courses/cv')}`, { key: b.key })).status, 204);
  await wait(50);
  assert.deepEqual(await pagesOf(), []);

  // Your website (optional)
  assert.equal((await call('PATCH', '/me', { key: b.key, json: { website: 'debo.example' } })).status, 400);
  assert.equal((await (await call('PATCH', '/me', { key: b.key, json: { website: 'https://debo.example' } })).json()).website, 'https://debo.example/');
  assert.equal((await (await call('GET', '/me', { key: b.key })).json()).website, 'https://debo.example/');
  await call('PATCH', '/me', { key: b.key, json: { website: null } });
  assert.equal((await (await call('GET', '/me', { key: b.key })).json()).website, null);
});

test('sign-up can be switched off', async () => {
  process.env.SIGNUP = 'closed';
  try {
    const res = await call('POST', '/keys', { json: { organisation: 'Late Comer' } });
    assert.equal(res.status, 403);
    assert.match((await res.json()).message, /does not give out keys/);
  } finally {
    delete process.env.SIGNUP;
  }
});

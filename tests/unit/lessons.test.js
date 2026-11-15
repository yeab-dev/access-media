import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';

const dir = await mkdtemp(path.join(tmpdir(), 'lessons-test-'));
await cp(new URL('../../data/lessons/demo', import.meta.url).pathname, path.join(dir, 'lessons/demo'), { recursive: true });
process.env.DATA_DIR = dir;
process.env.ADMIN_TOKEN = 'unit-test-code';
delete process.env.ASR_URL;
const { app } = await import('../../api/index.js');
const { slugify } = await import('../../api/lessons.js');
const { events } = await import('../../api/events.js');

const VIDEO = path.join(dir, 'lessons/demo/lesson.mp4');
let server; let base; let fakeAsr; let asrCalls = 0;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api/v1`;
  const asr = express();
  asr.post('/v1/audio/transcriptions', express.raw({ type: '*/*', limit: '20mb' }), (_req, res) => {
    asrCalls++;
    res.type('text/vtt').send('WEBVTT\n\n00:00:00.500 --> 00:00:05.000\nwelcome in this lesson you will learn how to write a cv\n');
  });
  fakeAsr = asr.listen(0);
  await new Promise((r) => fakeAsr.once('listening', r));
});
after(async () => { server.close(); fakeAsr.close(); await rm(dir, { recursive: true, force: true }); });

async function uploadLesson({ title = 'How to write a CV', lang = 'en', id, file = VIDEO, name = 'cv.mp4', token = 'unit-test-code' } = {}) {
  const form = new FormData();
  form.append('title', title);
  form.append('lang', lang);
  if (id) form.append('id', id);
  if (file) form.append('video', new Blob([await readFile(file)]), name);
  return fetch(`${base}/lessons`, { method: 'POST', body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} });
}
async function untilDone(id) {
  for (let i = 0; i < 150; i++) {
    const lesson = await (await fetch(`${base}/lessons/${id}`)).json();
    if (lesson.status === 'ready' || lesson.status === 'failed') return lesson;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`lesson ${id} did not finish`);
}

test('lesson ids come from the title', () => {
  assert.equal(slugify('How to write a CV'), 'how-to-write-a-cv');
  assert.equal(slugify('  Café: 1st lesson!  '), 'cafe-1st-lesson');
  assert.equal(slugify('ሲቪ እንዴት እንደሚጻፍ'), 'lesson', 'Amharic-only titles get a plain id');
});

test('upload needs the access code, a video and a title, explained in words', async () => {
  assert.equal((await uploadLesson({ token: null })).status, 401);
  const noVideo = await uploadLesson({ file: null });
  assert.equal(noVideo.status, 400);
  assert.match((await noVideo.json()).message, /video/);
  const noTitle = await uploadLesson({ title: '' });
  assert.equal(noTitle.status, 400);
  assert.match((await noTitle.json()).message, /title/);
  assert.equal((await uploadLesson({ lang: 'english!' })).status, 400);
});

test('without a speech model: the lesson is converted for 3G and says captions must be added by hand', async () => {
  const res = await uploadLesson({ id: 'no-asr' });
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.id, 'no-asr');
  assert.equal(body.embed, '<db-player lesson="no-asr"></db-player>');
  assert.equal((await (await fetch(body.href)).json()).status, 'processing');
  const lesson = await untilDone('no-asr');
  assert.equal(lesson.status, 'ready');
  assert.deepEqual(lesson.sources.map((s) => s.quality), ['360p', '240p', 'audio']);
  assert.ok(lesson.duration >= 29 && lesson.duration <= 31, `duration ${lesson.duration}`);
  assert.deepEqual(lesson.tracks, []);
  assert.match(lesson.statusMessage, /No speech model/);
  for (const f of ['lesson.mp4', 'lesson.240p.mp4', 'lesson.mp3', 'poster.jpg']) await access(path.join(dir, 'lessons/no-asr', f));
  // The uploaded original is not kept.
  await assert.rejects(access(path.join(dir, 'lessons/no-asr/upload.mp4')));
  // It plays offline too.
  assert.equal((await fetch(`${base}/lessons/no-asr/offline-pack`)).status, 200);
});

test('with a speech model: captions are added automatically, marked automatic until a person saves them', async () => {
  const seen = [];
  const listen = (e) => seen.push(e);
  events.on('lesson.ready', listen);
  process.env.ASR_URL = `http://localhost:${fakeAsr.address().port}`;
  try {
    const res = await uploadLesson({ title: 'Interview tips', lang: 'en' });
    assert.equal(res.status, 202);
    const { id } = await res.json();
    assert.equal(id, 'interview-tips');
    const lesson = await untilDone(id);
    assert.equal(lesson.status, 'ready');
    assert.equal(asrCalls, 1);
    const track = lesson.tracks.find((t) => t.kind === 'captions' && t.srclang === 'en');
    assert.ok(track, 'English captions added');
    assert.equal(track.auto, true);
    assert.equal(track.reviewed, false);
    assert.match(await (await fetch(track.src)).text(), /how to write a cv/);
    assert.match(lesson.statusMessage, /Automatic captions added \(1 lines\)/);
    assert.deepEqual(seen, [{ lesson: id, captions: ['en'] }]);

    // A person checks them in the editor and saves: no longer automatic.
    const saved = await fetch(`${base}/lessons/${id}/captions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer unit-test-code' },
      body: JSON.stringify({ lang: 'en', vtt: 'WEBVTT\n\n00:00:00.500 --> 00:00:05.000\nWelcome. In this lesson you will learn how to write a CV.\n' }),
    });
    assert.equal(saved.status, 201);
    const after = (await (await fetch(`${base}/lessons/${id}`)).json()).tracks.find((t) => t.srclang === 'en');
    assert.equal(after.auto, false);
    assert.equal(after.reviewed, true);
  } finally {
    delete process.env.ASR_URL;
    events.off('lesson.ready', listen);
  }
});

test('a file that is not a video fails with a message in words; ids cannot be taken twice', async () => {
  const notVideo = path.join(dir, 'notes.txt');
  await import('node:fs/promises').then((fs) => fs.writeFile(notVideo, 'just some text'));
  const res = await uploadLesson({ id: 'bad-file', file: notVideo, name: 'notes.txt' });
  assert.equal(res.status, 202);
  const lesson = await untilDone('bad-file');
  assert.equal(lesson.status, 'failed');
  assert.match(lesson.statusMessage, /not a video we can read/);

  const again = await uploadLesson({ id: 'bad-file' });
  assert.equal(again.status, 409);
  assert.match((await again.json()).message, /already a lesson/);
});

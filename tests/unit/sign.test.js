import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Own data folder and access code, so the real demo lesson is never touched.
const dir = await mkdtemp(path.join(tmpdir(), 'sign-test-'));
await cp(new URL('../../data/lessons/demo', import.meta.url).pathname, path.join(dir, 'lessons/demo'), { recursive: true });
process.env.DATA_DIR = dir;
process.env.ADMIN_TOKEN = 'unit-test-code';
process.env.KEEP_SIGN_RECORDINGS = '1';
const { app } = await import('../../api/index.js');

const clip = path.join(dir, 'clip.webm');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=s=320x240:r=25:d=3', '-f', 'lavfi', '-i', 'sine=d=3',
  '-c:v', 'libvpx', '-b:v', '200k', '-c:a', 'libopus', clip]);
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', f]));

let server;
let base;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api/v1`;
});
after(async () => { server.close(); await rm(dir, { recursive: true, force: true }); });

const upload = async (offset, token = 'unit-test-code') => {
  const form = new FormData();
  form.append('video', new Blob([await readFile(clip)], { type: 'video/webm' }), 'sign.webm');
  form.append('offset', String(offset));
  return fetch(`${base}/lessons/demo/sign`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
};

test('uploading needs the staff access code', async () => {
  assert.equal((await upload(0, null)).status, 401);
  assert.equal((await upload(0, 'wrong-code-xxxxxx')).status, 401);
});

test('learner requests are counted (anonymous) and listed most-wanted first', async () => {
  assert.equal((await fetch(`${base}/lessons/demo/sign-requests`, { method: 'POST' })).status, 201);
  assert.equal((await fetch(`${base}/lessons/demo/sign-requests`, { method: 'POST' })).status, 201);
  assert.equal((await fetch(`${base}/lessons/nope/sign-requests`, { method: 'POST' })).status, 404);
  const { requests } = await (await fetch(`${base}/sign-requests`)).json();
  assert.deepEqual(requests.map((r) => [r.id, r.count]), [['demo', 2]]);
  assert.deepEqual(Object.keys(requests[0]).sort(), ['count', 'hasSign', 'id', 'lastRequested', 'title']);
});

test('a recording is trimmed to the lesson, made small, sound removed, and attached', async () => {
  const res = await upload(1);
  assert.equal(res.status, 201);
  const lesson = await (await fetch(`${base}/lessons/demo`)).json();
  assert.match(lesson.sign.src, /lesson\.ethsl\.mp4$/);
  assert.equal(lesson.sign.offset, 1);
  assert.ok(lesson.sign.recordedAt);
  const info = probe(path.join(dir, 'lessons/demo/lesson.ethsl.mp4'));
  assert.ok(Math.abs(Number(info.format.duration) - 2) < 0.3, `duration ${info.format.duration}`);
  assert.deepEqual(info.streams.map((s) => s.codec_type), ['video']);
  // The request was answered.
  assert.deepEqual((await (await fetch(`${base}/sign-requests`)).json()).requests, []);
});

test('KEEP_SIGN_RECORDINGS keeps the original recording, with sound, outside the public media folder', async () => {
  const keep = path.join(dir, 'sign-recordings/demo');
  const files = (await readdir(keep)).sort();
  const video = files.find((f) => f.endsWith('.webm'));
  assert.ok(video, `no original kept: ${files}`);
  assert.deepEqual(probe(path.join(keep, video)).streams.map((s) => s.codec_type).sort(), ['audio', 'video']);
  const meta = JSON.parse(await readFile(path.join(keep, video.replace(/\.webm$/, '.json')), 'utf8'));
  assert.equal(meta.lesson, 'demo');
  assert.equal(meta.file, video);
  assert.equal((await fetch(`${base.replace('/api/v1', '')}/media/../sign-recordings/demo/${video}`)).status, 404);
});

test('a negative timing adjustment holds the first frame', async () => {
  assert.equal((await upload(-0.5)).status, 201);
  const info = probe(path.join(dir, 'lessons/demo/lesson.ethsl.mp4'));
  assert.ok(Math.abs(Number(info.format.duration) - 3.5) < 0.3, `duration ${info.format.duration}`);
});

test('bad uploads get a message in words', async () => {
  const noFile = await fetch(`${base}/lessons/demo/sign`, { method: 'POST', headers: { Authorization: 'Bearer unit-test-code' }, body: new FormData() });
  assert.equal(noFile.status, 400);
  assert.match((await noFile.json()).message, /file field named "video"/);
  assert.equal((await upload(99)).status, 400);
});

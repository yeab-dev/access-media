import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';

const dir = await mkdtemp(path.join(tmpdir(), 'captions-test-'));
await cp(new URL('../../data/lessons/demo', import.meta.url).pathname, path.join(dir, 'lessons/demo'), { recursive: true });
process.env.DATA_DIR = dir;
process.env.ADMIN_TOKEN = 'unit-test-code';
delete process.env.ASR_URL;
const { app } = await import('../../api/index.js');
const { wordErrorRate, toVtt, parseVtt } = await import('../../api/vtt.js');

let server; let base; let fakeAsr; let asrSeen = null;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api/v1`;
  // A stand-in speech model with the OpenAI-style endpoint.
  const asr = express();
  asr.post('/v1/audio/transcriptions', express.raw({ type: '*/*', limit: '20mb' }), (req, res) => {
    asrSeen = { bytes: req.body.length, type: req.get('content-type') };
    res.type('text/vtt').send('WEBVTT\n\n00:00:00.500 --> 00:00:05.000\nwelcome in this lesson you will learn how to right a cv\n');
  });
  fakeAsr = asr.listen(0);
  await new Promise((r) => fakeAsr.once('listening', r));
});
after(async () => { server.close(); fakeAsr.close(); await rm(dir, { recursive: true, force: true }); });

const save = (body, token = 'unit-test-code') => fetch(`${base}/lessons/demo/captions`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
});

test('word error rate', () => {
  assert.equal(wordErrorRate('a b c d', 'a b c d'), 0);
  assert.equal(wordErrorRate('a b c d', 'a x c d'), 0.25);
  assert.equal(wordErrorRate('a b c d', 'a b c'), 0.25);
  assert.equal(wordErrorRate('[music] Hello, world', 'hello world'), 0, 'sound labels and punctuation are ignored');
});

test('toVtt and parseVtt round-trip', () => {
  const cues = [{ start: 0.5, end: 2, text: 'ሰላም' }, { start: 2, end: 3725.25, text: 'two\nlines' }];
  assert.deepEqual(parseVtt(toVtt(cues)), cues);
});

test('saving corrected captions needs the access code and valid WebVTT, explained in words', async () => {
  assert.equal((await save({ lang: 'en', vtt: 'WEBVTT\n\n00:00.000 --> 00:01.000\nHi' }, null)).status, 401);
  const notVtt = await save({ lang: 'en', vtt: 'hello' });
  assert.equal(notVtt.status, 400);
  assert.match((await notVtt.json()).message, /WEBVTT/);
  const backwards = await save({ lang: 'en', vtt: 'WEBVTT\n\n00:00:05.000 --> 00:00:01.000\nOops' });
  assert.match((await backwards.json()).message, /Line 1: the end time must be after the start time/);
  assert.equal((await save({ lang: 'english!', vtt: 'WEBVTT' })).status, 400);
});

test('saving updates the lesson, keeps the previous version, and can add a new language', async () => {
  const res = await save({ lang: 'en', vtt: 'WEBVTT\n\n00:00:00.500 --> 00:00:05.000\n[music] Welcome. Corrected line.\n' });
  assert.equal(res.status, 201);
  assert.match(await readFile(path.join(dir, 'lessons/demo/lesson.en.vtt'), 'utf8'), /Corrected line/);
  assert.match(await readFile(path.join(dir, 'lessons/demo/lesson.en.vtt.previous'), 'utf8'), /Welcome. In this lesson/);
  const om = await save({ lang: 'om', vtt: 'WEBVTT\n\n00:00:00.500 --> 00:00:05.000\nBaga nagaan dhuftan.\n' });
  assert.equal(om.status, 201);
  const lesson = await (await fetch(`${base}/lessons/demo`)).json();
  const track = lesson.tracks.find((t) => t.kind === 'captions' && t.srclang === 'om');
  assert.ok(track, 'Afaan Oromo track added');
  assert.equal(track.reviewed, true);
  // Audio description text uses the same editor.
  assert.equal((await save({ kind: 'descriptions', lang: 'en', vtt: 'WEBVTT\n\n00:00:00.200 --> 00:00:02.000\nTitle slide.\n' })).status, 201);
});

test('draft: says in words when no speech model is set up', async () => {
  const res = await fetch(`${base}/lessons/demo/captions/draft`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer unit-test-code' }, body: '{"lang":"en"}' });
  assert.equal(res.status, 503);
  assert.match((await res.json()).message, /No speech model is set up/);
});

test('draft: sends 16 kHz audio to the configured speech model and returns its VTT', async () => {
  process.env.ASR_URL = `http://localhost:${fakeAsr.address().port}`;
  const res = await fetch(`${base}/lessons/demo/captions/draft`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer unit-test-code' }, body: '{"lang":"en"}' });
  delete process.env.ASR_URL;
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.lines, 1);
  assert.match(body.vtt, /right a cv/);
  assert.match(asrSeen.type, /multipart\/form-data/);
  assert.ok(asrSeen.bytes > 1000);
  // How good was that draft against what a person corrected?
  const wer = wordErrorRate('Welcome. In this lesson you will learn how to write a CV.', 'welcome in this lesson you will learn how to right a cv');
  assert.ok(wer > 0 && wer < 0.2);
});

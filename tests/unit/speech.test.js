import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, chmod, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';

const dir = await mkdtemp(path.join(tmpdir(), 'speech-test-'));
process.env.DATA_DIR = dir;
delete process.env.ASR_URL;
const { speechMode, transcribe, warmUpSpeechModel, modelFile } = await import('../../api/speech.js');
const MEDIA = new URL('../../data/lessons/demo/lesson.mp3', import.meta.url).pathname;

// A stand-in for whisper.cpp: records its arguments and writes "<-of>.vtt", like the real whisper-cli.
const fakeCli = path.join(dir, 'whisper-cli');
await writeFile(fakeCli, `#!/bin/sh
echo "$@" > "${dir}/args.txt"
while [ $# -gt 0 ]; do [ "$1" = "-of" ] && out="$2"; shift; done
printf 'WEBVTT\\n\\n00:00:00.500 --> 00:00:03.000\\nWelcome to the lesson.\\n' > "$out.vtt"
`);
await chmod(fakeCli, 0o755);

let modelServer;
before(async () => {
  const app = express();
  app.get('/ggml-tiny.bin', (_req, res) => res.send(Buffer.alloc(2_000_000, 1)));
  modelServer = app.listen(0);
  await new Promise((r) => modelServer.once('listening', r));
});
after(async () => { modelServer.close(); await rm(dir, { recursive: true, force: true }); });

test('no whisper.cpp and no ASR_URL: no speech model, said as such', async () => {
  process.env.WHISPER_CLI = path.join(dir, 'not-there');
  assert.equal(speechMode(), null);
  await assert.rejects(transcribe(MEDIA, 'en'), { code: 'no_speech_model' });
});

test('whisper.cpp in this server: the model is downloaded at start, "loading" until then', async () => {
  process.env.WHISPER_CLI = fakeCli;
  process.env.WHISPER_MODEL = 'tiny';
  process.env.WHISPER_MODEL_URL = `http://localhost:${modelServer.address().port}/ggml-tiny.bin`;
  try {
    assert.equal(modelFile(), path.join(dir, 'models', 'ggml-tiny.bin'));
    assert.equal(speechMode(), 'loading');
    await assert.rejects(transcribe(MEDIA, 'en'), { code: 'speech_model_loading' });
    await warmUpSpeechModel();
    assert.equal((await stat(modelFile())).size, 2_000_000);
    assert.equal(speechMode(), 'local');
  } finally {
    delete process.env.WHISPER_MODEL_URL;
  }
});

test('whisper.cpp in this server: 16 kHz audio in, WebVTT out, in the lesson\'s language', async () => {
  process.env.WHISPER_CLI = fakeCli;
  process.env.WHISPER_MODEL = 'tiny';
  const { vtt, model } = await transcribe(MEDIA, 'am');
  assert.match(vtt, /^WEBVTT\n\n00:00:00\.500 --> 00:00:03\.000\nWelcome to the lesson\./);
  assert.equal(model, 'whisper.cpp tiny');
  const args = (await readFile(path.join(dir, 'args.txt'), 'utf8')).trim().split(' ');
  assert.equal(args[args.indexOf('-m') + 1], modelFile());
  assert.equal(args[args.indexOf('-l') + 1], 'am');
  assert.ok(args.includes('-ovtt'));
  assert.match(args[args.indexOf('-f') + 1], /audio\.wav$/);
});

test('English-only models are not told a language; WHISPER_MODEL=off turns it off; ASR_URL wins', async () => {
  process.env.WHISPER_CLI = fakeCli;
  process.env.WHISPER_MODEL = 'tiny.en';
  process.env.WHISPER_MODEL_PATH = path.join(dir, 'models', 'ggml-tiny.bin');
  try {
    await transcribe(MEDIA, 'en');
    assert.ok(!(await readFile(path.join(dir, 'args.txt'), 'utf8')).includes(' -l '));
  } finally {
    delete process.env.WHISPER_MODEL_PATH;
  }
  process.env.WHISPER_MODEL = 'off';
  assert.equal(speechMode(), null);
  process.env.ASR_URL = 'speech-server:8000';
  assert.equal(speechMode(), 'remote');
  delete process.env.ASR_URL;
  delete process.env.WHISPER_MODEL;
  delete process.env.WHISPER_CLI;
});

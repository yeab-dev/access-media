import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import yauzl from 'yauzl';
import { app } from '../../api/index.js';
import { renderOfflinePage, packContents } from '../../api/offline.js';

let server;
let base;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

function entries(buf) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      const names = [];
      zip.on('entry', (e) => { names.push(e.fileName); zip.readEntry(); });
      zip.on('end', () => resolve(names));
      zip.readEntry();
    });
  });
}

test('packContents picks 240p video, audio, captions and descriptions', () => {
  const c = packContents({
    sources: [{ quality: '360p', src: 'a.mp4' }, { quality: '240p', src: 'b.mp4' }, { quality: 'audio', src: 'c.mp3' }],
    tracks: [{ kind: 'captions', srclang: 'en', src: 'x.vtt' }, { kind: 'descriptions', srclang: 'en', src: 'd.vtt' }],
  });
  assert.equal(c.video, 'b.mp4');
  assert.equal(c.audio, 'c.mp3');
  assert.equal(c.captions.length, 1);
  assert.equal(c.descriptions.length, 1);
});

test('offline page embeds captions as data URLs and marks each transcript language', () => {
  const html = renderOfflinePage({
    title: 'T', video: 'lesson.mp4', audio: 'lesson.mp3',
    languages: [
      { lang: 'en', label: 'English', vtt: 'WEBVTT\n\n00:00.000 --> 00:01.000\nHi', captions: [{ start: 0, end: 1, text: 'Hi' }], descriptions: [{ start: 0, end: 1, text: 'A slide' }] },
      { lang: 'am', label: 'አማርኛ', vtt: 'WEBVTT', captions: [{ start: 0, end: 1, text: 'ሰላም' }] },
    ],
  });
  assert.match(html, /<track kind="captions" srclang="en" label="English" src="data:text\/vtt;charset=utf-8;base64,/);
  assert.match(html, /<section id="transcript-am" lang="am"/);
  assert.match(html, /<strong>Description:<\/strong> <em>A slide<\/em>/);
  assert.doesNotMatch(html, /https?:\/\//, 'no network requests from the offline page');
});

test('GET offline-pack returns the pack with media, captions, page and readme', async () => {
  const res = await fetch(`${base}/api/v1/lessons/demo/offline-pack`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /demo-offline\.zip/);
  assert.equal(res.headers.get('accept-ranges'), 'bytes');
  const names = await entries(Buffer.from(await res.arrayBuffer()));
  for (const n of ['lesson.mp4', 'lesson.mp3', 'lesson.en.vtt', 'lesson.am.vtt', 'index.html', 'README.txt',
    'descriptions/descriptions.en.vtt', 'descriptions/descriptions.am.vtt']) {
    assert.ok(names.includes(n), `missing ${n}`);
  }
});

test('offline-pack supports resuming (Range) and is not rebuilt when nothing changed', async () => {
  const full = await fetch(`${base}/api/v1/lessons/demo/offline-pack`);
  const modified = full.headers.get('last-modified');
  await full.arrayBuffer();
  const part = await fetch(`${base}/api/v1/lessons/demo/offline-pack`, { headers: { Range: 'bytes=100-199' } });
  assert.equal(part.status, 206);
  assert.equal((await part.arrayBuffer()).byteLength, 100);
  const again = await fetch(`${base}/api/v1/lessons/demo/offline-pack`);
  assert.equal(again.headers.get('last-modified'), modified);
  await again.arrayBuffer();
});

test('offline-pack rejects bad ids and unknown lessons', async () => {
  assert.equal((await fetch(`${base}/api/v1/lessons/..%2Fetc/offline-pack`)).status, 400);
  assert.equal((await fetch(`${base}/api/v1/lessons/nope/offline-pack`)).status, 404);
});

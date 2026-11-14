import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = await mkdtemp(path.join(tmpdir(), 'doc-test-'));
await cp(new URL('../../data/lessons/demo', import.meta.url).pathname, path.join(dir, 'lessons/demo'), { recursive: true });
await rm(path.join(dir, 'lessons/demo/document'), { recursive: true, force: true });
process.env.DATA_DIR = dir;
const { app } = await import('../../api/index.js');
const { lessonSections, chromiumPath } = await import('../../api/documents.js');

let server; let origin;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  origin = `http://localhost:${server.address().port}`;
});
after(async () => { server.close(); await rm(dir, { recursive: true, force: true }); });

const has = (cmd) => { try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; } };

test('sections follow the slides, and each caption line lands in exactly one section', () => {
  const captions = [0.5, 5, 10, 15].map((s) => ({ start: s, end: s + 4, text: `line at ${s}` }));
  const images = [{ time: 0.5, en: { title: 'Intro', alt: 'A' } }, { time: 10, en: { title: 'Step', alt: 'B' } }];
  const s = lessonSections({ captions, images, lang: 'en' });
  assert.deepEqual(s.map((x) => [x.title, x.lines.length]), [['Intro', 2], ['Step', 2]]);
  // No slides file: fall back to audio-description lines, then to one section.
  assert.equal(lessonSections({ captions, descriptions: [{ start: 0, text: 'd1' }, { start: 9, text: 'd2' }], lang: 'en' }).length, 2);
  assert.equal(lessonSections({ captions, lang: 'en' })[0].lines.length, 4);
});

test('HTML document: language, headings in order, a real description for every image', async () => {
  const res = await fetch(`${origin}/api/v1/lessons/demo/document?lang=am`);
  assert.ok(res.url.endsWith('/media/demo/document/lesson.am.html'));
  const html = await res.text();
  assert.match(html, /<html lang="am">/);
  assert.match(html, /<h1>ሲቪ እንዴት እንደሚጻፍ<\/h1>/);
  const levels = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
  assert.equal(levels[0], 1);
  levels.forEach((l, i) => { if (i) assert.ok(l <= levels[i - 1] + 1, `heading jumps from h${levels[i - 1]} to h${l}`); });
  const alts = [...html.matchAll(/<img [^>]*alt="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(alts.length, 6);
  for (const alt of alts) {
    assert.ok(alt.length > 15, `alt too short: ${alt}`);
    assert.doesNotMatch(alt, /\.(jpe?g|png)$|slide-\d/i, 'alt must not be a file name');
  }
  // Slide stills exist.
  assert.equal((await fetch(`${origin}/media/demo/document/slide-3.jpg`)).status, 200);
});

test('PDF document is tagged, titled, and carries the image descriptions', { skip: !chromiumPath() && 'no Chromium' }, async () => {
  const res = await fetch(`${origin}/api/v1/lessons/demo/document?lang=en&format=pdf`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  const file = path.join(dir, 'check.pdf');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  if (!has('pdfinfo')) return;
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  assert.match(info, /Tagged:\s+yes/);
  assert.match(info, /Title:\s+How to write a CV/);
  const struct = execFileSync('pdfinfo', ['-struct', file], { encoding: 'utf8' });
  assert.match(struct, /H1/);
  assert.match(struct, /Figure \["Slide with the question "What is a CV\?"/);
});

test('documents: unknown language and bad format answered in words', async () => {
  const fr = await fetch(`${origin}/api/v1/lessons/demo/document?lang=fr`);
  assert.equal(fr.status, 404);
  assert.match((await fr.json()).message, /no captions in "fr"/);
  assert.equal((await fetch(`${origin}/api/v1/lessons/demo/document?format=docx`)).status, 400);
});

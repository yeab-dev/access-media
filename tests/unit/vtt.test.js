import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVtt, isValidVtt, renderTranscriptHtml } from '../../api/vtt.js';

const en = readFileSync(new URL('../../demo/data/lessons/demo/lesson.en.vtt', import.meta.url), 'utf8');
const am = readFileSync(new URL('../../demo/data/lessons/demo/lesson.am.vtt', import.meta.url), 'utf8');

test('demo caption files are valid WebVTT with matching cue counts', () => {
  assert.ok(isValidVtt(en));
  assert.ok(isValidVtt(am));
  assert.equal(parseVtt(en).length, 9);
  assert.equal(parseVtt(am).length, 9);
});

test('parses timings and ignores NOTE blocks', () => {
  const cues = parseVtt(am);
  assert.equal(cues[0].start, 1.1);
  assert.equal(cues[8].end, 30);
  assert.ok(!cues.some((c) => c.text.startsWith('Draft')));
});

test('transcript HTML escapes text and sets the language', () => {
  const html = renderTranscriptHtml({ title: 'A <b>test</b>', lang: 'am', captions: parseVtt(am) });
  assert.match(html, /<html lang="am">/);
  assert.match(html, /A &lt;b&gt;test&lt;\/b&gt;/);
  assert.match(html, /<time datetime="PT5S">0:05<\/time>/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVtt, isValidVtt, renderTranscriptHtml } from '../../server/vtt.js';

const en = readFileSync(new URL('../../data/seed/demo/captions.en.vtt', import.meta.url), 'utf8');
const am = readFileSync(new URL('../../data/seed/demo/captions.am.vtt', import.meta.url), 'utf8');

test('demo caption files are valid WebVTT with matching cue counts', () => {
  assert.ok(isValidVtt(en));
  assert.ok(isValidVtt(am));
  assert.equal(parseVtt(en).length, 6);
  assert.equal(parseVtt(am).length, 6);
});

test('parses timings and ignores NOTE blocks', () => {
  const cues = parseVtt(am);
  assert.equal(cues[0].start, 0.5);
  assert.equal(cues[5].end, 30);
  assert.ok(!cues.some((c) => c.text.startsWith('Draft')));
});

test('transcript HTML escapes text and sets the language', () => {
  const html = renderTranscriptHtml({ title: 'A <b>test</b>', lang: 'am', captions: parseVtt(am) });
  assert.match(html, /<html lang="am">/);
  assert.match(html, /A &lt;b&gt;test&lt;\/b&gt;/);
  assert.match(html, /<time datetime="PT10S">0:10<\/time>/);
});

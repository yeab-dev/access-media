#!/usr/bin/env node
// How good was the speech model's draft? Compare it with the captions a person corrected.
//   node scripts/caption-quality.mjs draft.vtt corrected.vtt
import { readFileSync } from 'node:fs';
import { parseVtt, wordErrorRate } from '../api/vtt.js';

const [draftFile, finalFile] = process.argv.slice(2);
if (!draftFile || !finalFile) {
  console.error('Usage: node scripts/caption-quality.mjs draft.vtt corrected.vtt');
  process.exit(1);
}
const draft = parseVtt(readFileSync(draftFile, 'utf8'));
const final = parseVtt(readFileSync(finalFile, 'utf8'));
const text = (cues) => cues.map((c) => c.text).join(' ');
const wer = wordErrorRate(text(final), text(draft));
const n = Math.min(draft.length, final.length);
const timing = n ? draft.slice(0, n).reduce((sum, c, i) => sum + Math.abs(c.start - final[i].start), 0) / n : 0;
console.log(`Lines: draft ${draft.length}, corrected ${final.length}`);
console.log(`Word error rate: ${(wer * 100).toFixed(1)}% (0% = the draft needed no word changes)`);
console.log(`Average start-time difference: ${timing.toFixed(2)} s (first ${n} lines)`);

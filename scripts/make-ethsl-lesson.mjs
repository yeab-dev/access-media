#!/usr/bin/env node
// Builds the example lesson "Greetings in Ethiopian Sign Language" in demo/data/lessons/ethsl-greetings.
//
// Source: "Learn Ethiopian Sign Language: Important Phrases" by Visions Global Empowerment
// (https://www.youtube.com/watch?v=PaaxDviEMx8), signed by a student of Yekatit 23 School, Bahir Dar.
// Used with the permission of Visions Global Empowerment.
//
// The main video shows each phrase in English and Amharic; the sign language window shows the signer,
// cropped from the source so its burned-in English text is left out. Captions, audio description,
// slide descriptions and the manifest all come from the PHRASES table below (times = when the source shows the phrase).
//
// Usage: node scripts/make-ethsl-lesson.mjs path/to/source.mp4   (needs ffmpeg, Playwright's Chromium and the Noto Sans Ethiopic font)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PHRASES = [
  [0.0, 2.5, 'Hello', 'ሰላም'],
  [2.5, 11.5, 'My name is Fentanesh.', 'ስሜ ፈንታነሽ ነው።'],
  [11.5, 16.5, 'I will be teaching you important phrases in Ethiopian Sign Language.', 'በኢትዮጵያ የምልክት ቋንቋ ጠቃሚ ሐረጎችን አስተምራችኋለሁ።'],
  [17.5, 20.5, 'Hello', 'ሰላም'],
  [22.5, 25.5, 'Thanks to God', 'እግዚአብሔር ይመስገን'],
  [27.0, 29.5, 'Good morning', 'እንደምን አደሩ'],
  [31.5, 34.5, 'Good afternoon', 'እንደምን ዋሉ'],
  [37.5, 40.5, 'Good night', 'ደህና እደሩ'],
  [41.0, 44.0, 'Bye', 'ቻው'],
  [45.0, 48.0, 'See you later', 'በኋላ እንገናኛለን'],
  [51.5, 56.5, 'How are you?', 'እንዴት ነዎት?'],
  [56.5, 59.5, 'Long time, no see', 'ከተያየን ቆየን'],
  [61.5, 64.5, 'Have a good day', 'መልካም ቀን'],
  [65.5, 69.5, 'Fine', 'ደህና ነኝ'],
  [69.5, 72.5, 'Where do you live?', 'የት ነው የሚኖሩት?'],
  [73.0, 76.5, 'What do you do? (your job)', 'ሥራዎ ምንድን ነው?'],
  [77.0, 80.5, 'Where do you go to school?', 'የት ነው የሚማሩት?'],
  [81.5, 85.5, 'Nice to meet you', 'በመተዋወቃችን ደስ ብሎኛል'],
  [86.0, 89.0, 'Welcome', 'እንኳን ደህና መጡ'],
  [89.5, 92.0, 'Have a good time', 'መልካም ጊዜ'],
  [92.5, 94.0, 'Do you sign?', 'የምልክት ቋንቋ ይችላሉ?'],
  [94.5, 97.0, 'No problem / You’re welcome', 'ችግር የለም / ምንም አይደል'],
  [98.0, 99.8, 'Thank you!', 'አመሰግናለሁ!'],
];
const DURATION = 99.8;
const CROP = 'crop=530:680:115:10'; // the signer only, without the burned-in text on the right

const ID = 'ethsl-greetings';
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'demo', 'data', 'lessons', ID);
const source = process.argv[2];
if (!source) { console.error('Usage: node scripts/make-ethsl-lesson.mjs source.mp4'); process.exit(1); }

const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });

const stamp = (s) => {
  const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};
const vtt = (cues) => 'WEBVTT\n\n' + cues.map(([a, b, text], i) => `${i + 1}\n${stamp(a)} --> ${stamp(b)}\n${text}\n`).join('\n');

mkdirSync(OUT, { recursive: true });
const n = PHRASES.length;
writeFileSync(path.join(OUT, 'lesson.en.vtt'), vtt(PHRASES.map(([a, b, en]) => [a, b, en])));
writeFileSync(path.join(OUT, 'lesson.am.vtt'), vtt(PHRASES.map(([a, b, , am]) => [a, b, am])));
// Audio description: the video has no sound, so say which phrase is on screen and being signed.
writeFileSync(path.join(OUT, 'lesson.ad.en.vtt'), vtt(PHRASES.map(([a, b, en], i) => [a, Math.min(b, a + 2), `Phrase ${i + 1} of ${n}: ${en}`])));
writeFileSync(path.join(OUT, 'lesson.ad.am.vtt'), vtt(PHRASES.map(([a, b, , am], i) => [a, Math.min(b, a + 2), `ሐረግ ${i + 1} ከ${n}፦ ${am}`])));

writeFileSync(path.join(OUT, 'images.json'), JSON.stringify({
  note: 'One entry per phrase: when it appears, a short title (used as a heading) and a description of the slide.',
  images: PHRASES.map(([a, , en, am], i) => ({
    time: a,
    en: { title: `${i + 1}. ${en}`, alt: `Slide ${i + 1} of ${n}: the phrase "${en}" in large white letters, with the Amharic "${am}" below it, on a dark blue background. The signer shows the sign in the sign language window.` },
    am: { title: `${i + 1}. ${am}`, alt: `ስላይድ ${i + 1} ከ${n}፦ "${am}" የሚለው ሐረግ በትልቅ ነጭ ፊደል፣ ከሥሩ በእንግሊዝኛ "${en}"፣ በጥቁር ሰማያዊ ዳራ ላይ። ምልክት አድራጊዋ ምልክቱን በምልክት ቋንቋ መስኮቱ ውስጥ ታሳያለች።` },
  })),
}, null, 2) + '\n');

writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
  id: ID,
  title: 'Greetings in Ethiopian Sign Language',
  titles: { am: 'ሰላምታ በኢትዮጵያ የምልክት ቋንቋ' },
  lang: 'en',
  duration: DURATION,
  poster: 'poster.jpg',
  credit: 'Sign language: “Learn Ethiopian Sign Language: Important Phrases” by Visions Global Empowerment (USA) and Visions Global Empowerment Ethiopia, signed by a student of Yekatit 23 School, Bahir Dar (Bahir Dar signs; other regions may differ). Used with permission. Slides, captions and descriptions: Accessible Learning Media.',
  sources: [
    { quality: '360p', src: 'lesson.mp4', type: 'video/mp4' },
    { quality: '240p', src: 'lesson.240p.mp4', type: 'video/mp4' },
    { quality: 'audio', src: 'lesson.mp3', type: 'audio/mpeg' },
  ],
  status: 'ready',
  tracks: [
    { kind: 'captions', srclang: 'en', label: 'English', src: 'lesson.en.vtt' },
    { kind: 'captions', srclang: 'am', label: 'አማርኛ', src: 'lesson.am.vtt' },
    { kind: 'descriptions', srclang: 'en', label: 'English', src: 'lesson.ad.en.vtt' },
    { kind: 'descriptions', srclang: 'am', label: 'አማርኛ', src: 'lesson.ad.am.vtt' },
  ],
  sign: { src: 'lesson.ethsl.mp4', lang: 'sgn-et', label: 'Ethiopian Sign Language' },
  images: 'images.json',
}, null, 2) + '\n');

// Slides: drawn as HTML by Chromium (it mixes the Latin and Ethiopic fonts and wraps long lines), one picture per phrase.
// Each phrase stays on screen until the next one starts.
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const tmp = mkdtempSync(path.join(tmpdir(), 'ethsl-'));
try {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const list = [];
  for (const [i, [a, , en, am]] of PHRASES.entries()) {
    await page.setContent(`<!doctype html><html><body style="margin:0;width:640px;height:360px;background:#0b3d6b;color:#fff;
      font-family:'Noto Sans','Noto Sans Ethiopic',sans-serif;font-weight:700;display:flex;flex-direction:column;justify-content:center;
      align-items:center;gap:22px;text-align:center;padding:0 40px;box-sizing:border-box;position:relative">
      <p lang="en" style="margin:0;font-size:${en.length > 24 ? 32 : 44}px;line-height:1.25">${esc(en)}</p>
      <p lang="am" style="margin:0;font-size:${am.length > 24 ? 26 : 34}px;line-height:1.7;color:#ffe08a;font-family:'Noto Sans Ethiopic','Noto Sans',sans-serif">${esc(am)}</p>
      <p style="margin:0;position:absolute;inset-inline-end:16px;bottom:10px;font-size:18px;opacity:.75">${i + 1} / ${n}</p></body></html>`);
    const file = path.join(tmp, `${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: file });
    const next = i + 1 < n ? PHRASES[i + 1][0] : DURATION;
    list.push(`file '${file}'`, `duration ${(next - a).toFixed(3)}`);
  }
  await browser.close();
  list.push(list.at(-2)); // the concat format needs the last picture twice
  writeFileSync(path.join(tmp, 'slides.txt'), list.join('\n') + '\n');
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'slides.txt'), '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono',
    '-t', String(DURATION), '-vf', 'fps=25,format=yuv420p', '-c:v', 'libx264', '-profile:v', 'main', '-crf', '28', '-g', '50',
    '-c:a', 'aac', '-b:a', '32k', '-movflags', '+faststart', '-shortest', path.join(OUT, 'lesson.mp4')]);
} finally { rmSync(tmp, { recursive: true, force: true }); }

ffmpeg(['-i', path.join(OUT, 'lesson.mp4'), '-vf', 'scale=-2:240', '-c:v', 'libx264', '-profile:v', 'baseline', '-g', '50',
  '-crf', '32', '-c:a', 'aac', '-b:a', '32k', '-ac', '1', '-movflags', '+faststart', path.join(OUT, 'lesson.240p.mp4')]);
ffmpeg(['-i', path.join(OUT, 'lesson.mp4'), '-vn', '-c:a', 'libmp3lame', '-b:a', '16k', '-ar', '16000', '-ac', '1', path.join(OUT, 'lesson.mp3')]);
ffmpeg(['-ss', '3', '-i', path.join(OUT, 'lesson.mp4'), '-frames:v', '1', '-q:v', '5', path.join(OUT, 'poster.jpg')]);
// Sign language video: same settings as an interpreter upload (360p H.264 ~220 kbps, no sound).
ffmpeg(['-i', source, '-t', String(DURATION), '-vf', `${CROP},scale=-2:360,fps=25`, '-c:v', 'libx264', '-profile:v', 'baseline',
  '-b:v', '220k', '-maxrate', '260k', '-bufsize', '520k', '-g', '50', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', path.join(OUT, 'lesson.ethsl.mp4')]);
console.log(`Lesson ready in ${OUT}`);

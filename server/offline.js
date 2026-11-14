// Offline pack for a 3G phone: audio, light video, captions, and a light HTML page.
// Built once per lesson and cached next to the media, so it can be served with Range support
// (a dropped download on a slow connection resumes instead of starting again).

import yazl from 'yazl';
import { createWriteStream } from 'node:fs';
import { readFile, stat, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVtt, formatClock, escapeHtml } from './vtt.js';

const PACK = 'offline.zip';
// Rebuild cached packs when this file (the page template, pack layout) changes too.
const SELF = fileURLToPath(import.meta.url);
const building = new Map();

const UI = {
  en: {
    offline: 'Offline lesson', intro: 'This lesson works without internet. Keep this folder on your phone.',
    video: 'Video', audio: 'Audio only', audioHint: 'Uses the least battery and storage.',
    transcript: 'Transcript', description: 'Description', files: 'Files in this pack',
    vlc: 'Open lesson.mp4 in VLC or your video player. Captions load automatically.',
  },
  am: {
    offline: 'ከመስመር ውጭ ትምህርት', intro: 'ይህ ትምህርት ያለ ኢንተርኔት ይሠራል። ይህን አቃፊ በስልክዎ ላይ ያስቀምጡ።',
    video: 'ቪዲዮ', audio: 'ድምፅ ብቻ', audioHint: 'አነስተኛ ባትሪ እና ማከማቻ ይጠቀማል።',
    transcript: 'ግልባጭ', description: 'መግለጫ', files: 'በዚህ ጥቅል ውስጥ ያሉ ፋይሎች',
    vlc: 'lesson.mp4ን በVLC ወይም በቪዲዮ ማጫወቻዎ ይክፈቱ። የጽሑፍ ትርጉሞች በራሳቸው ይጫናሉ።',
  },
};
const ui = (lang) => UI[lang] || UI.en;

/** Pick the files that go in the pack from a lesson manifest (paths relative to the lesson folder). */
export function packContents(manifest) {
  const sources = manifest.sources || [];
  const audio = sources.find((s) => s.quality === 'audio');
  const video = sources.find((s) => s.quality === '240p') || sources.find((s) => s.quality !== 'audio');
  const tracks = manifest.tracks || [];
  return {
    audio: audio?.src,
    video: video?.src,
    captions: tracks.filter((t) => t.kind === 'captions' || t.kind === 'subtitles'),
    descriptions: tracks.filter((t) => t.kind === 'descriptions'),
  };
}

/** Self-contained HTML page. Captions are embedded as data: URLs so they load from file:// on a phone. */
export function renderOfflinePage({ title, lang = 'en', video, audio, languages }) {
  const L = ui(lang);
  const dataUri = (text) => `data:text/vtt;charset=utf-8;base64,${Buffer.from(text, 'utf8').toString('base64')}`;

  const tracks = languages.map((l, i) => `<track kind="captions" srclang="${escapeHtml(l.lang)}" label="${escapeHtml(l.label)}" src="${dataUri(l.vtt)}"${i === 0 ? ' default' : ''}>`).join('\n      ');

  const transcripts = languages.map((l) => {
    const T = ui(l.lang);
    const items = [
      ...l.captions.map((c) => ({ ...c, desc: false })),
      ...(l.descriptions || []).map((c) => ({ ...c, desc: true })),
    ].sort((a, b) => a.start - b.start || (a.desc ? -1 : 1));
    const rows = items.map((c) => {
      const t = `<time datetime="PT${Math.floor(c.start)}S">${formatClock(c.start)}</time>`;
      const text = escapeHtml(c.text).replace(/\n/g, ' ');
      return c.desc ? `<li class="desc">${t} <strong>${T.description}:</strong> <em>${text}</em></li>` : `<li>${t} ${text}</li>`;
    }).join('\n        ');
    return `<section id="transcript-${escapeHtml(l.lang)}" lang="${escapeHtml(l.lang)}" aria-labelledby="h-${escapeHtml(l.lang)}">
      <h2 id="h-${escapeHtml(l.lang)}">${T.transcript} (${escapeHtml(l.label)})</h2>
      <ol>
        ${rows}
      </ol>
    </section>`;
  }).join('\n    ');

  const nav = languages.map((l) => `<li><a href="#transcript-${escapeHtml(l.lang)}" lang="${escapeHtml(l.lang)}">${ui(l.lang).transcript} (${escapeHtml(l.label)})</a></li>`).join('');

  return `<!doctype html>
<html lang="${lang === 'am' ? 'am' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — ${L.offline}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, "Noto Sans", "Noto Sans Ethiopic", "Nyala", "Abyssinica SIL", sans-serif; line-height: 1.6;
    max-width: 46rem; margin: 0 auto; padding: 1rem; background: #fff; color: #16181d; }
  @media (prefers-color-scheme: dark) { body { background: #0f1115; color: #eef0f4; } a { color: #8cc4ff; } time { color: #b8bfcc !important; } }
  video, audio { width: 100%; }
  video { background: #000; aspect-ratio: 16 / 9; }
  a { color: #0b5cad; }
  ol { list-style: none; padding: 0; }
  li { margin: 0.4rem 0; }
  time { color: #4a5060; font-variant-numeric: tabular-nums; margin-right: 0.5rem; }
  .desc { border-left: 4px solid currentColor; padding-left: 0.5rem; }
  /* Ethiopic has no true italic; slanted script is harder to read. */
  :lang(am) em, em:lang(am) { font-style: normal; }
  .skip { position: absolute; left: -999px; }
  .skip:focus { position: static; }
  :focus-visible { outline: 3px solid #0b5cad; outline-offset: 2px; }
  nav ul { padding-left: 1.2rem; }
  nav li { margin: 0; }
  nav a { display: inline-block; padding: 0.6rem 0; }
</style>
</head>
<body>
<a class="skip" href="#transcripts">${L.transcript}</a>
<main>
  <h1>${escapeHtml(title)}</h1>
  <p>${L.intro}</p>
  ${video ? `<section aria-labelledby="h-video">
    <h2 id="h-video">${L.video}</h2>
    <video controls preload="metadata" src="${escapeHtml(video)}">
      ${tracks}
    </video>
  </section>` : ''}
  ${audio ? `<section aria-labelledby="h-audio">
    <h2 id="h-audio">${L.audio}</h2>
    <p>${L.audioHint}</p>
    <audio controls preload="none" src="${escapeHtml(audio)}"></audio>
  </section>` : ''}
  <nav aria-label="${L.transcript}"><ul>${nav}</ul></nav>
  <div id="transcripts">
    ${transcripts}
  </div>
  <section aria-labelledby="h-files">
    <h2 id="h-files">${L.files}</h2>
    <p>${L.vlc}</p>
  </section>
</main>
</body>
</html>`;
}

function readme(title) {
  return [
    `${title}`,
    '',
    'ENGLISH',
    '1. Unzip this file.',
    '2. Open index.html in your browser: video, audio, captions and transcripts, no internet needed.',
    '3. Or open lesson.mp4 in VLC: captions (lesson.en.vtt, lesson.am.vtt) load automatically.',
    '4. lesson.mp3 is the audio only. It uses the least battery and storage.',
    '',
    'አማርኛ',
    '1. ይህን ፋይል ይክፈቱ (unzip)።',
    '2. index.html ን በብሮውዘርዎ ይክፈቱ፦ ቪዲዮ፣ ድምፅ፣ የጽሑፍ ትርጉም እና ግልባጭ ያለ ኢንተርኔት።',
    '3. ወይም lesson.mp4 ን በVLC ይክፈቱ፦ የጽሑፍ ትርጉሞች በራሳቸው ይጫናሉ።',
    '4. lesson.mp3 ድምፅ ብቻ ነው፤ አነስተኛ ባትሪ እና ማከማቻ ይጠቀማል።',
    '',
  ].join('\r\n');
}

async function newestMtime(files) {
  const times = await Promise.all(files.map(async (f) => (await stat(f)).mtimeMs));
  return Math.max(...times);
}

/**
 * Returns the path of an up-to-date offline pack for the lesson in `dir`, building it if needed.
 * Throws ENOENT if the lesson does not exist.
 */
export async function ensureOfflinePack(dir) {
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const c = packContents(manifest);
  const inputs = [manifestPath, c.audio, c.video, ...c.captions.map((t) => t.src), ...c.descriptions.map((t) => t.src)]
    .filter(Boolean)
    .map((f) => path.resolve(dir, f));
  for (const f of inputs) {
    if (!f.startsWith(path.resolve(dir) + path.sep)) throw new Error(`manifest points outside the lesson folder: ${f}`);
  }

  const out = path.join(dir, PACK);
  const builtAt = await stat(out).then((s) => s.mtimeMs).catch(() => 0);
  if (builtAt && builtAt >= await newestMtime([...inputs, SELF])) return out;

  // One build at a time per lesson; concurrent requests wait for it.
  if (!building.has(out)) {
    building.set(out, build(dir, manifest, c, out).finally(() => building.delete(out)));
  }
  await building.get(out);
  return out;
}

async function build(dir, manifest, c, out) {
  const read = (f) => readFile(path.resolve(dir, f), 'utf8');
  const languages = await Promise.all(c.captions.map(async (t) => {
    const vtt = await read(t.src);
    const desc = c.descriptions.find((d) => d.srclang === t.srclang);
    return {
      lang: t.srclang,
      label: t.label,
      vtt,
      captions: parseVtt(vtt),
      descriptions: desc ? parseVtt(await read(desc.src)) : [],
    };
  }));

  const zip = new yazl.ZipFile();
  const title = manifest.title || manifest.id;
  // Media is already compressed: store it (faster to build, no size gain from deflate).
  if (c.video) zip.addFile(path.resolve(dir, c.video), 'lesson.mp4', { compress: false });
  if (c.audio) zip.addFile(path.resolve(dir, c.audio), 'lesson.mp3', { compress: false });
  for (const l of languages) zip.addBuffer(Buffer.from(l.vtt, 'utf8'), `lesson.${l.lang}.vtt`);
  for (const d of c.descriptions) zip.addBuffer(Buffer.from(await read(d.src), 'utf8'), `descriptions/descriptions.${d.srclang}.vtt`);
  zip.addBuffer(Buffer.from(renderOfflinePage({
    title, lang: manifest.lang || 'en', video: c.video ? 'lesson.mp4' : null, audio: c.audio ? 'lesson.mp3' : null, languages,
  }), 'utf8'), 'index.html');
  zip.addBuffer(Buffer.from(readme(title), 'utf8'), 'README.txt');
  zip.end();

  const tmp = `${out}.${process.pid}.tmp`;
  try {
    await new Promise((resolve, reject) => {
      const ws = createWriteStream(tmp);
      zip.outputStream.pipe(ws).on('close', resolve).on('error', reject);
      zip.outputStream.on('error', reject);
    });
    await rename(tmp, out);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

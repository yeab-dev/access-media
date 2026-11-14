// Minimal WebVTT parsing + accessible transcript rendering.
// We only need cue timing and text; styling/positioning is left to the player.

const TIME = /(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/;

export function parseTime(str) {
  const m = TIME.exec(str);
  if (!m) return NaN;
  return (Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

export function isValidVtt(text) {
  return /^﻿?WEBVTT(?:[ \t].*)?(?:\r?\n|$)/.test(text);
}

export function parseVtt(text) {
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i === -1) continue;
    const [start, end] = lines[i].split('-->').map((s) => parseTime(s.trim()));
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    const text = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (text) cues.push({ start, end, text });
  }
  return cues;
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const LABELS = {
  en: { transcript: 'Transcript', description: 'Description', video: 'Video', skip: 'Skip to transcript' },
  am: { transcript: 'ግልባጭ', description: 'መግለጫ', video: 'ቪዲዮ', skip: 'ወደ ግልባጩ ዝለል' },
};

/**
 * Merge caption cues and audio-description cues into one ordered transcript.
 * Returns a complete, self-contained HTML document (works offline, prints to a tagged PDF from Chrome).
 */
export function renderTranscriptHtml({ title, lang, captions, descriptions = [], video }) {
  const L = LABELS[lang] || LABELS.en;
  const items = [
    ...captions.map((c) => ({ ...c, kind: 'caption' })),
    ...descriptions.map((c) => ({ ...c, kind: 'description' })),
  ].sort((a, b) => a.start - b.start || (a.kind === 'description' ? -1 : 1));

  const rows = items.map((c) => {
    const t = `<time datetime="PT${Math.floor(c.start)}S">${formatClock(c.start)}</time>`;
    const body = escapeHtml(c.text).replace(/\n/g, '<br>');
    return c.kind === 'description'
      ? `<li class="desc">${t} <strong>${L.description}:</strong> <em>${body}</em></li>`
      : `<li>${t} ${body}</li>`;
  }).join('\n');

  const videoBlock = video
    ? `<section aria-labelledby="v"><h2 id="v">${L.video}</h2>
<video controls preload="metadata" src="${escapeHtml(video.src)}">
${(video.tracks || []).map((t) => `<track kind="${t.kind}" srclang="${t.srclang}" label="${escapeHtml(t.label)}" src="${escapeHtml(t.src)}"${t.default ? ' default' : ''}>`).join('\n')}
</video></section>`
    : '';

  return `<!doctype html>
<html lang="${lang === 'am' ? 'am' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — ${L.transcript}</title>
<style>
  body{font-family:system-ui,"Noto Sans Ethiopic","Nyala","Abyssinica SIL",sans-serif;line-height:1.6;max-width:46rem;margin:0 auto;padding:1rem;color:#111;background:#fff}
  video{width:100%;height:auto;background:#000}
  ol{list-style:none;padding:0} li{margin:.5rem 0} time{font-variant-numeric:tabular-nums;color:#444;margin-right:.5rem}
  .desc{border-left:4px solid #555;padding-left:.5rem}
  a:focus,video:focus{outline:3px solid #1a5fb4;outline-offset:2px}
  @media (prefers-color-scheme:dark){body{background:#111;color:#eee}time{color:#bbb}.desc{border-color:#aaa}}
</style>
</head>
<body>
<a href="#transcript">${L.skip}</a>
<main>
<h1>${escapeHtml(title)}</h1>
${videoBlock}
<section aria-labelledby="transcript"><h2 id="transcript" tabindex="-1">${L.transcript}</h2>
<ol>
${rows}
</ol></section>
</main>
</body>
</html>`;
}

/** Cues back to a WebVTT file. */
export function toVtt(cues) {
  const t = (s) => {
    const ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
  };
  return `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${t(c.start)} --> ${t(c.end)}\n${c.text}`).join('\n\n')}\n`;
}

/**
 * Word error rate: how far a draft is from the corrected captions.
 * (substitutions + deletions + insertions) / words in the corrected version. 0 = perfect.
 */
export function wordErrorRate(reference, hypothesis) {
  const words = (s) => String(s).toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean);
  const r = words(reference);
  const h = words(hypothesis);
  if (!r.length) return h.length ? 1 : 0;
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const cur = [i];
    for (let j = 1; j <= h.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[h.length] / r.length;
}

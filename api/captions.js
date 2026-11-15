// Caption pipeline: a speech model drafts, a person corrects lines and times (studio/captions.html), we save VTT.
// The speech model runs in this server (whisper.cpp) or on a separate speech server (ASR_URL): see speech.js.
// Nothing leaves the host's machines.

import express from 'express';
import { readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { isValidVtt, parseVtt } from './vtt.js';
import { asrUrl, transcribe, speechMode } from './speech.js';
import { requireStaff } from './sign.js';
import { mayChange, notYours } from './auth.js';
import { events } from './events.js';

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LANG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
const KINDS = { captions: (l) => `lesson.${l}.vtt`, descriptions: (l) => `lesson.ad.${l}.vtt` };

function languageName(code) {
  try { return new Intl.DisplayNames([code], { type: 'language' }).of(code) || code; } catch { return code; }
}

/** Problems a person must fix before saving, in words. Empty list = fine. */
export function checkVtt(text) {
  if (!isValidVtt(text)) return ['The file must start with the line WEBVTT.'];
  const cues = parseVtt(text);
  if (!cues.length) return ['There are no caption lines yet.'];
  const problems = [];
  cues.forEach((c, i) => {
    if (!(c.end > c.start)) problems.push(`Line ${i + 1}: the end time must be after the start time.`);
    if (i && c.start < cues[i - 1].start) problems.push(`Line ${i + 1}: lines must be in time order.`);
  });
  return problems;
}

// Speech to text lives in speech.js (whisper.cpp in this server, or a separate speech server).
export { asrUrl, warmUpSpeechModel, transcribe, speechMode } from './speech.js';

export function captionsRouter({ lessonsDir }) {
  const router = express.Router();
  const dirOf = (id) => path.join(lessonsDir, id);
  const readManifest = async (id) => JSON.parse(await readFile(path.join(dirOf(id), 'manifest.json'), 'utf8'));
  const bad = (res, error, message, status = 400) => res.status(status).json({ error, message });

  // Save corrected captions (or audio description text) for one language.
  router.post('/lessons/:id/captions', express.json({ limit: '1mb' }), requireStaff, async (req, res) => {
    const { id } = req.params;
    if (!ID.test(id)) return bad(res, 'invalid_id', 'Lesson ids use lowercase letters, numbers and hyphens.');
    const { lang, vtt, kind = 'captions', source = 'person' } = req.body || {};
    if (!KINDS[kind]) return bad(res, 'invalid_kind', 'kind must be "captions" or "descriptions".');
    if (!LANG.test(String(lang || ''))) return bad(res, 'invalid_lang', 'Give the language as a code, for example "am" or "en".');
    if (typeof vtt !== 'string') return bad(res, 'no_vtt', 'Send the captions as WebVTT text in the "vtt" field.');
    const problems = checkVtt(vtt);
    if (problems.length) return res.status(400).json({ error: 'invalid_vtt', message: problems[0], problems });

    let manifest;
    try { manifest = await readManifest(id); } catch { return bad(res, 'not_found', 'There is no lesson with this id.', 404); }
    if (!mayChange(req, manifest.owner)) return notYours(res);
    const file = KINDS[kind](lang);
    const full = path.join(dirOf(id), file);
    await copyFile(full, `${full}.previous`).catch(() => {}); // keep the last version, in case
    await writeFile(`${full}.tmp`, vtt.replace(/\r\n?/g, '\n'));
    await rename(`${full}.tmp`, full);

    const tracks = manifest.tracks || [];
    const existing = tracks.find((t) => t.kind === kind && t.srclang === lang);
    const meta = { reviewed: source === 'person', auto: source !== 'person', updatedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, { src: file, ...meta });
    else tracks.push({ kind, srclang: lang, label: languageName(lang), src: file, ...meta });
    manifest.tracks = tracks;
    const mpath = path.join(dirOf(id), 'manifest.json');
    await writeFile(`${mpath}.tmp`, JSON.stringify(manifest, null, 2));
    await rename(`${mpath}.tmp`, mpath);
    events.emit('captions.updated', { lesson: id, kind, lang, lines: parseVtt(vtt).length, reviewed: meta.reviewed });
    res.status(201).json({ ok: true, kind, lang, src: file, lines: parseVtt(vtt).length });
  });

  // First draft from the speech model. Not saved: the person corrects it in the editor first.
  router.post('/lessons/:id/captions/draft', express.json(), requireStaff, async (req, res, next) => {
    const { id } = req.params;
    if (!ID.test(id)) return bad(res, 'invalid_id', 'Lesson ids use lowercase letters, numbers and hyphens.');
    const lang = String(req.body?.lang || 'en');
    if (!LANG.test(lang)) return bad(res, 'invalid_lang', 'Give the language as a code, for example "am" or "en".');
    const mode = speechMode();
    if (!mode) {
      return bad(res, 'no_speech_model',
        'No speech model is set up on this server, so there is no automatic draft. Start from the existing captions or an empty file. (Hosts: install whisper.cpp, as the Docker image does, or set ASR_URL.)', 503);
    }
    if (mode === 'loading') return bad(res, 'speech_model_loading', 'The speech model is still downloading on this server. Try again in a few minutes.', 503);
    let manifest;
    try { manifest = await readManifest(id); } catch { return bad(res, 'not_found', 'There is no lesson with this id.', 404); }
    if (!mayChange(req, manifest.owner)) return notYours(res);
    const src = (manifest.sources || []).find((s) => s.quality === 'audio') || manifest.sources?.[0];
    try {
      const { vtt, model } = await transcribe(path.join(dirOf(id), src.src), lang);
      res.json({ lang, vtt, model, lines: parseVtt(vtt).length, note: 'Draft: a person must check every line and time before saving.' });
    } catch (err) {
      // Any failure to reach it: refused, unknown host name (no such service), timeout.
      if (err.name === 'TimeoutError' || (err.name === 'TypeError' && /fetch failed/i.test(err.message)) || ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT'].includes(err.cause?.code)) {
        console.error(`captions: speech model at ${asrUrl()} unreachable:`, err.cause?.code || err.message);
        return bad(res, 'speech_model_unreachable', 'The speech model could not be reached. Check that it is running.', 502);
      }
      if (err.code === 'speech_model_error') return bad(res, 'speech_model_error', err.message, 502);
      next(err);
    }
  });

  return router;
}

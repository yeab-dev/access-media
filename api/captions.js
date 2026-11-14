// Caption pipeline: a speech model drafts, a person corrects lines and times (studio/captions.html), we save VTT.
// The speech model is pluggable: any server with the OpenAI-style /v1/audio/transcriptions endpoint
// (for example a local faster-whisper server). Set ASR_URL; nothing leaves the host unless the host sets it.

import express from 'express';
import { spawn } from 'node:child_process';
import { readFile, writeFile, rename, copyFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isValidVtt, parseVtt } from './vtt.js';
import { requireStaff } from './sign.js';
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

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim().slice(-300)))));
  });
}

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
    const file = KINDS[kind](lang);
    const full = path.join(dirOf(id), file);
    await copyFile(full, `${full}.previous`).catch(() => {}); // keep the last version, in case
    await writeFile(`${full}.tmp`, vtt.replace(/\r\n?/g, '\n'));
    await rename(`${full}.tmp`, full);

    const tracks = manifest.tracks || [];
    const existing = tracks.find((t) => t.kind === kind && t.srclang === lang);
    const meta = { reviewed: source === 'person', updatedAt: new Date().toISOString() };
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
    const asr = process.env.ASR_URL;
    if (!asr) {
      return bad(res, 'no_speech_model',
        'No speech model is set up on this server, so there is no automatic draft. Start from the existing captions or an empty file. (Hosts: set ASR_URL to a local faster-whisper server.)', 503);
    }
    let manifest;
    try { manifest = await readManifest(id); } catch { return bad(res, 'not_found', 'There is no lesson with this id.', 404); }
    const src = (manifest.sources || []).find((s) => s.quality === 'audio') || manifest.sources?.[0];
    const work = await mkdtemp(path.join(tmpdir(), 'db-asr-'));
    try {
      const audio = path.join(work, 'audio.mp3');
      // 16 kHz mono is what speech models expect, and keeps the upload small.
      await ffmpeg(['-i', path.join(dirOf(id), src.src), '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', audio]);
      const form = new FormData();
      form.append('file', new Blob([await readFile(audio)], { type: 'audio/mpeg' }), 'audio.mp3');
      form.append('model', process.env.ASR_MODEL || 'Systran/faster-whisper-small');
      form.append('language', lang);
      form.append('response_format', 'vtt');
      const r = await fetch(`${asr.replace(/\/$/, '')}/v1/audio/transcriptions`, { method: 'POST', body: form, signal: AbortSignal.timeout(10 * 60_000) });
      if (!r.ok) return bad(res, 'speech_model_error', `The speech model answered with an error (${r.status}).`, 502);
      let vtt = await r.text();
      if (!isValidVtt(vtt)) vtt = `WEBVTT\n\n${vtt}`;
      res.json({ lang, vtt, model: process.env.ASR_MODEL || 'Systran/faster-whisper-small', lines: parseVtt(vtt).length, note: 'Draft: a person must check every line and time before saving.' });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.cause?.code === 'ECONNREFUSED') {
        return bad(res, 'speech_model_unreachable', 'The speech model could not be reached. Check that it is running.', 502);
      }
      next(err);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  return router;
}

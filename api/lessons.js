// New lessons from a lesson provider: upload one video, get a lesson that plays on 3G and, when a speech model
// is set up (ASR_URL), captions in the spoken language straight away. Those captions are marked automatic
// (the player says so) until a person checks them in studio/captions.html and saves.

import express from 'express';
import multer from 'multer';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, rename, rm, mkdir, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { requireStaff } from './sign.js';
import { transcribe } from './captions.js';
import { parseVtt } from './vtt.js';
import { events } from './events.js';

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LANG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
const MAX_UPLOAD = 1024 * 1024 * 1024; // 1 GB: a long lesson recorded on a phone

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = ''; let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} failed: ${err.trim().slice(-300)}`))));
  });
}
const ffmpeg = (args) => run('ffmpeg', ['-y', '-loglevel', 'error', ...args]);

/** Length in seconds and whether there is a picture and sound. Throws if ffprobe cannot read the file. */
export async function probe(file) {
  const info = JSON.parse(await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]));
  const streams = info.streams || [];
  return {
    duration: Number(info.format?.duration) || 0,
    hasVideo: streams.some((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1),
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
  };
}

/** "How to write a CV" → "how-to-write-a-cv". Titles with no Latin letters (Amharic) get "lesson". */
export function slugify(title) {
  const slug = String(title).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');
  return slug || 'lesson';
}

function languageName(code) {
  try { return new Intl.DisplayNames([code], { type: 'language' }).of(code) || code; } catch { return code; }
}

export function lessonsRouter({ lessonsDir }) {
  const router = express.Router();
  const upload = multer({ dest: path.join(os.tmpdir(), 'db-lesson-uploads'), limits: { fileSize: MAX_UPLOAD, files: 1 } });
  const dirOf = (id) => path.join(lessonsDir, id);
  const bad = (res, error, message, status = 400) => res.status(status).json({ error, message });

  async function readManifest(id) {
    return JSON.parse(await readFile(path.join(dirOf(id), 'manifest.json'), 'utf8'));
  }
  async function writeManifest(id, m) {
    const file = path.join(dirOf(id), 'manifest.json');
    await writeFile(`${file}.tmp`, JSON.stringify(m, null, 2));
    await rename(`${file}.tmp`, file);
  }
  /** Change a few fields; re-read first so a caption saved meanwhile is kept. */
  async function update(id, fields) {
    const m = await readManifest(id);
    Object.assign(m, fields);
    await writeManifest(id, m);
    return m;
  }

  // A lesson that was being prepared when the server stopped will never finish: say so.
  (async () => {
    for (const d of await readdir(lessonsDir, { withFileTypes: true }).catch(() => [])) {
      if (!d.isDirectory() || !ID.test(d.name)) continue;
      const m = await readManifest(d.name).catch(() => null);
      if (m && (m.status === 'processing' || m.status === 'captioning')) {
        await update(d.name, { status: 'failed', statusMessage: 'The server stopped while this lesson was being prepared. Upload the video again.' });
      }
    }
  })().catch((err) => console.error('lessons: could not check unfinished uploads', err));

  /** Convert for slow connections, then caption. Runs after the upload has been answered. */
  async function prepare(id, original, lang) {
    const dir = dirOf(id);
    try {
      let info;
      try { info = await probe(original); } catch { info = null; }
      if (!info?.hasVideo || !info.duration) {
        await update(id, { status: 'failed', statusMessage: 'This file is not a video we can read. Upload an MP4, WebM or MOV file.' });
        return;
      }
      const audio = info.hasAudio ? [] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-shortest'];
      const map = info.hasAudio ? [] : ['-map', '0:v:0', '-map', '1:a:0'];
      // Same files as the demo lesson (scripts/make-demo.sh): 360p, 240p ~200 kbps for 3G, 32 kbps mono MP3, poster.
      await ffmpeg(['-i', original, ...audio, ...map, '-vf', 'scale=-2:360', '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'veryfast', '-crf', '28', '-g', '50',
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', path.join(dir, 'lesson.mp4')]);
      await ffmpeg(['-i', path.join(dir, 'lesson.mp4'), '-vf', 'scale=-2:240', '-c:v', 'libx264', '-profile:v', 'baseline', '-preset', 'veryfast', '-g', '50',
        '-b:v', '180k', '-maxrate', '200k', '-bufsize', '400k', '-c:a', 'aac', '-b:a', '32k', '-ac', '1', '-movflags', '+faststart', path.join(dir, 'lesson.240p.mp4')]);
      await ffmpeg(['-i', path.join(dir, 'lesson.mp4'), '-vn', '-c:a', 'libmp3lame', '-b:a', '32k', '-ac', '1', path.join(dir, 'lesson.mp3')]);
      await ffmpeg(['-ss', String(Math.min(1, info.duration / 2)), '-i', path.join(dir, 'lesson.mp4'), '-frames:v', '1', '-q:v', '5', path.join(dir, 'poster.jpg')]);
      await rm(original, { force: true });

      const asr = !!process.env.ASR_URL;
      await update(id, {
        duration: Math.round(info.duration),
        poster: 'poster.jpg',
        sources: [
          { quality: '360p', src: 'lesson.mp4', type: 'video/mp4' },
          { quality: '240p', src: 'lesson.240p.mp4', type: 'video/mp4' },
          { quality: 'audio', src: 'lesson.mp3', type: 'audio/mpeg' },
        ],
        // Learners can watch already; captions follow.
        status: asr ? 'captioning' : 'ready',
        statusMessage: asr ? 'Making captions with the speech model.' : 'No speech model is set up, so there are no automatic captions. Add captions in the caption editor.',
      });
      if (!asr) { events.emit('lesson.ready', { lesson: id, captions: [] }); return; }

      try {
        const { vtt, model } = await transcribe(path.join(dir, 'lesson.mp3'), lang);
        const lines = parseVtt(vtt).length;
        if (!lines) throw new Error('The speech model heard no words.');
        const file = `lesson.${lang}.vtt`;
        const m = await readManifest(id);
        // A person may have saved captions in this language meanwhile: theirs win.
        if ((m.tracks || []).some((t) => t.kind === 'captions' && t.srclang === lang && t.reviewed)) {
          await writeManifest(id, { ...m, status: 'ready', statusMessage: 'Captions were added by a person, so the automatic ones were not used.' });
          events.emit('lesson.ready', { lesson: id, captions: [lang] });
          return;
        }
        await writeFile(path.join(dir, file), vtt);
        const tracks = (m.tracks || []).filter((t) => !(t.kind === 'captions' && t.srclang === lang));
        tracks.push({ kind: 'captions', srclang: lang, label: languageName(lang), src: file, auto: true, reviewed: false, model, updatedAt: new Date().toISOString() });
        await writeManifest(id, { ...m, tracks, status: 'ready', statusMessage: `Automatic captions added (${lines} lines). A person should check them in the caption editor.` });
        events.emit('captions.updated', { lesson: id, kind: 'captions', lang, lines, reviewed: false });
        events.emit('lesson.ready', { lesson: id, captions: [lang] });
      } catch (err) {
        console.error(`lessons: automatic captions failed for ${id}`, err);
        await update(id, { status: 'ready', statusMessage: `The lesson is ready, but automatic captions failed: ${err.message} Add captions in the caption editor.` });
        events.emit('lesson.ready', { lesson: id, captions: [] });
      }
    } catch (err) {
      console.error(`lessons: could not prepare ${id}`, err);
      await update(id, { status: 'failed', statusMessage: 'The video could not be converted. Try another file, or check the server log.' }).catch(() => {});
    } finally {
      await rm(original, { force: true }).catch(() => {});
    }
  }

  // Upload a lesson video. Answers at once (202); follow GET /lessons/{id} until status is "ready".
  router.post('/lessons', requireStaff, upload.single('video'), async (req, res, next) => {
    const tmp = req.file?.path;
    let kept = false;
    try {
      const title = String(req.body?.title || '').trim();
      const lang = String(req.body?.lang || 'en');
      if (!req.file) return bad(res, 'no_video', 'Send the lesson video as a file field named "video".');
      if (!title || title.length > 200) return bad(res, 'invalid_title', 'Give the lesson a title (up to 200 characters).');
      if (!LANG.test(lang)) return bad(res, 'invalid_lang', 'Give the spoken language as a code, for example "am" or "en".');
      let id = req.body?.id ? String(req.body.id) : '';
      if (id && !ID.test(id)) return bad(res, 'invalid_id', 'Lesson ids use lowercase letters, numbers and hyphens.');
      await mkdir(lessonsDir, { recursive: true });
      if (id) {
        try { await mkdir(dirOf(id)); } catch (err) {
          if (err.code === 'EEXIST') return bad(res, 'id_taken', `There is already a lesson called "${id}". Choose another id.`, 409);
          throw err;
        }
      } else {
        const base = slugify(title);
        for (let n = 1; ; n++) {
          id = n === 1 && base !== 'lesson' ? base : `${base}-${n === 1 ? randomBytes(2).toString('hex') : n}`;
          try { await mkdir(dirOf(id)); break; } catch (err) { if (err.code !== 'EEXIST' || n > 50) throw err; }
        }
      }
      const original = path.join(dirOf(id), `upload${path.extname(req.file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6)}`);
      await rename(tmp, original).catch(async () => { // a different disk: copy instead
        await writeFile(original, await readFile(tmp));
      });
      kept = true;
      const manifest = {
        id, title, lang, duration: 0, status: 'processing', statusMessage: 'Converting the video for slow connections.',
        createdAt: new Date().toISOString(), sources: [], tracks: [],
      };
      await writeManifest(id, manifest);
      prepare(id, original, lang); // in the background; errors end up in the lesson's status
      const href = `${req.protocol}://${req.get('host')}/api/v1/lessons/${id}`;
      res.status(202).location(href).json({ id, status: manifest.status, statusMessage: manifest.statusMessage, href, embed: `<db-player lesson="${id}"></db-player>` });
    } catch (err) {
      next(err);
    } finally {
      if (tmp && !kept) await rm(tmp, { force: true }).catch(() => {});
    }
  });

  router.use((err, _req, res, next) => {
    if (err instanceof multer.MulterError) {
      return bad(res, 'upload_error', err.code === 'LIMIT_FILE_SIZE' ? 'The video is too large (1 GB at most).' : err.message);
    }
    next(err);
  });

  return router;
}

// Sign language pipeline: interpreters record in the browser (studio/sign.html), the recording is
// cleaned up for 3G and attached to the lesson; learners' requests tell interpreters what to record next.

import express from 'express';
import multer from 'multer';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, rm, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { events } from './events.js';
import os from 'node:os';

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_UPLOAD = 300 * 1024 * 1024; // a 10-minute webcam recording fits comfortably

/**
 * Staff access code for uploads. Set ADMIN_TOKEN in .env; if it is missing we make one up at start
 * and print it, so a server is never left open by accident.
 */
export function adminToken() {
  if (!process.env.ADMIN_TOKEN) {
    process.env.ADMIN_TOKEN = randomBytes(12).toString('base64url');
    console.log(`ADMIN_TOKEN was not set. Access code for this run: ${process.env.ADMIN_TOKEN}`);
  }
  return process.env.ADMIN_TOKEN;
}

export function requireStaff(req, res, next) {
  const expected = Buffer.from(adminToken());
  const given = Buffer.from(String(req.get('authorization') || '').replace(/^Bearer\s+/i, ''));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return res.status(401).json({ error: 'unauthorised', message: 'This needs the staff access code.' });
  }
  next();
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${err.trim().slice(-500)}`))));
  });
}

/**
 * Make the interpreter recording small and in step with the lesson.
 * offset > 0: the signing started late → cut that much from the start.
 * offset < 0: the signing started early → hold the first frame for that long.
 * Audio is dropped: only the signing matters, and it keeps the interpreter's voice private.
 */
export async function processSignVideo(input, output, offset = 0) {
  const pre = offset > 0 ? ['-ss', offset.toFixed(2)] : [];
  const pad = offset < 0 ? `,tpad=start_duration=${(-offset).toFixed(2)}:start_mode=clone` : '';
  await ffmpeg([...pre, '-i', input, '-an',
    '-vf', `scale=-2:360,fps=25${pad}`,
    '-c:v', 'libx264', '-profile:v', 'baseline', '-preset', 'veryfast', '-b:v', '220k', '-maxrate', '260k', '-bufsize', '520k',
    '-g', '50', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output]);
}

export function signRouter({ lessonsDir, dataDir }) {
  const router = express.Router();
  const upload = multer({ dest: path.join(os.tmpdir(), 'db-sign-uploads'), limits: { fileSize: MAX_UPLOAD, files: 1 } });
  const requestsFile = path.join(dataDir, 'sign-requests.json');
  const readRequests = () => readFile(requestsFile, 'utf8').then(JSON.parse).catch(() => ({}));
  let writing = Promise.resolve();

  const lessonDir = (id) => path.join(lessonsDir, id);
  const readManifest = async (id) => JSON.parse(await readFile(path.join(lessonDir(id), 'manifest.json'), 'utf8'));

  // A learner asked for sign language on a lesson that has none. Anonymous: only a count and a date.
  router.post('/lessons/:id/sign-requests', async (req, res) => {
    const { id } = req.params;
    if (!ID.test(id)) return res.status(400).json({ error: 'invalid_id', message: 'Lesson ids use lowercase letters, numbers and hyphens.' });
    try { await readManifest(id); } catch { return res.status(404).json({ error: 'not_found', message: 'There is no lesson with this id.' }); }
    writing = writing.then(async () => {
      const all = await readRequests();
      all[id] = { count: (all[id]?.count || 0) + 1, lastRequested: new Date().toISOString() };
      await mkdir(dataDir, { recursive: true });
      await writeFile(requestsFile, JSON.stringify(all, null, 2));
    });
    await writing;
    events.emit('sign.requested', { lesson: id });
    res.status(201).json({ ok: true });
  });

  // For interpreters: which lessons learners are asking for, most wanted first.
  router.get('/sign-requests', async (_req, res) => {
    const all = await readRequests();
    const list = await Promise.all(Object.entries(all).map(async ([id, r]) => {
      const m = await readManifest(id).catch(() => null);
      return m ? { id, title: m.title, count: r.count, lastRequested: r.lastRequested, hasSign: !!m.sign?.src && !m.sign.placeholder } : null;
    }));
    res.json({ requests: list.filter(Boolean).sort((a, b) => b.count - a.count) });
  });

  // Attach an interpreter recording to a lesson.
  router.post('/lessons/:id/sign', requireStaff, upload.single('video'), async (req, res, next) => {
    const { id } = req.params;
    const tmp = req.file?.path;
    try {
      if (!ID.test(id)) return res.status(400).json({ error: 'invalid_id', message: 'Lesson ids use lowercase letters, numbers and hyphens.' });
      if (!req.file) return res.status(400).json({ error: 'no_video', message: 'Send the recording as a file field named "video".' });
      const offset = Number(req.body.offset || 0);
      if (!Number.isFinite(offset) || Math.abs(offset) > 10) return res.status(400).json({ error: 'invalid_offset', message: 'The timing adjustment must be between -10 and 10 seconds.' });
      let manifest;
      try { manifest = await readManifest(id); } catch { return res.status(404).json({ error: 'not_found', message: 'There is no lesson with this id.' }); }

      const dir = lessonDir(id);
      const out = path.join(dir, 'lesson.ethsl.mp4');
      const next = `${out}.new.mp4`;
      await processSignVideo(tmp, next, offset);
      // Keep the previous version, in case the new one needs to be undone.
      if (manifest.sign?.src && !manifest.sign.placeholder) {
        await copyFile(path.join(dir, manifest.sign.src), path.join(dir, `lesson.ethsl.previous.mp4`)).catch(() => {});
      }
      await rename(next, out);
      manifest.sign = { src: 'lesson.ethsl.mp4', lang: 'sgn-et', label: 'Ethiopian Sign Language', recordedAt: new Date().toISOString(), offset };
      const mpath = path.join(dir, 'manifest.json');
      await writeFile(`${mpath}.tmp`, JSON.stringify(manifest, null, 2));
      await rename(`${mpath}.tmp`, mpath);

      // The request is answered.
      writing = writing.then(async () => {
        const all = await readRequests();
        if (all[id]) { delete all[id]; await writeFile(requestsFile, JSON.stringify(all, null, 2)); }
      });
      await writing;
      events.emit('sign.recorded', { lesson: id, recordedAt: manifest.sign.recordedAt });
      res.status(201).json({ ok: true, sign: manifest.sign });
    } catch (err) {
      next(err);
    } finally {
      if (tmp) await rm(tmp, { force: true });
    }
  });

  router.use((err, _req, res, next) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'upload_error', message: err.code === 'LIMIT_FILE_SIZE' ? 'The recording is too large (300 MB at most).' : err.message });
    }
    next(err);
  });

  return router;
}

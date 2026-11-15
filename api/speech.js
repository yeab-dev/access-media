// Speech to text for captions. Two ways, both open source, both on machines the host controls:
//  1. In this server (default): whisper.cpp ("whisper-cli") with a Whisper model file in DATA_DIR/models.
//     No extra service and no extra cost; lesson audio never leaves the server.
//     WHISPER_MODEL: tiny | base (default) | small | … (multilingual; "*.en" models are English only); "off" to disable.
//  2. A separate speech server with the OpenAI-style /v1/audio/transcriptions endpoint (e.g. faster-whisper):
//     set ASR_URL (a URL, or host:port as Render gives for private services) and ASR_MODEL.
// Drafts are always marked automatic until a person checks them.

import { spawn } from 'node:child_process';
import { existsSync, createWriteStream } from 'node:fs';
import { readFile, rm, mkdtemp, mkdir, rename, stat } from 'node:fs/promises';
import { tmpdir, cpus } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { isValidVtt } from './vtt.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = () => path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));

function run(cmd, args, timeoutMs = 30 * 60_000) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${path.basename(cmd)} took too long`)); }, timeoutMs);
    p.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} failed: ${err.trim().slice(-300)}`)); });
  });
}
const ffmpeg = (args) => run('ffmpeg', ['-y', '-loglevel', 'error', ...args]);

/** The speech server's address. Accepts "host:port" (as Render gives for private services) or a full URL. */
export function asrUrl() {
  const raw = (process.env.ASR_URL || '').trim().replace(/\/$/, '');
  if (!raw) return '';
  return /^https?:\/\//.test(raw) ? raw : `http://${raw}`;
}

// ---------- 1. whisper.cpp in this server ----------
const modelName = () => (process.env.WHISPER_MODEL || 'base').trim();
export const modelFile = () => process.env.WHISPER_MODEL_PATH || path.join(dataDir(), 'models', `ggml-${modelName()}.bin`);

/** The whisper.cpp program, if this server has it (WHISPER_CLI, or whisper-cli on the PATH). */
export function whisperCli() {
  if (process.env.WHISPER_CLI) return existsSync(process.env.WHISPER_CLI) ? process.env.WHISPER_CLI : null;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const f = path.join(dir, 'whisper-cli');
    if (dir && existsSync(f)) return f;
  }
  return null;
}

/**
 * What this server can do: 'remote' (ASR_URL), 'local' (whisper.cpp + model), 'loading' (whisper.cpp, model still
 * downloading), or null (no speech model: captions by hand).
 */
export function speechMode() {
  if (asrUrl()) return 'remote';
  if (modelName() === 'off' || !whisperCli()) return null;
  return existsSync(modelFile()) ? 'local' : 'loading';
}

let downloading = null;
/** Download the Whisper model once (in the background at start), so the first lesson does not wait for it. */
async function downloadModel() {
  const file = modelFile();
  const url = process.env.WHISPER_MODEL_URL || `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${modelName()}.bin`;
  await mkdir(path.dirname(file), { recursive: true });
  const part = `${file}.part`;
  console.log(`speech model: downloading ${path.basename(file)} from ${new URL(url).host}…`);
  const res = await fetch(url, { signal: AbortSignal.timeout(60 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`model download answered ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
  if ((await stat(part)).size < 1_000_000) throw new Error('model download too small');
  await rename(part, file);
  console.log(`speech model: ${path.basename(file)} ready`);
}

/** At start: make sure the speech model is there (local), or ask the speech server to load it (remote). */
export async function warmUpSpeechModel() {
  const mode = speechMode();
  if (mode === 'loading') {
    downloading ??= downloadModel().catch((err) => {
      console.warn(`speech model: download failed (${err.message}). Automatic captions are off until the next start.`);
    }).finally(() => { downloading = null; });
    return downloading;
  }
  if (mode === 'local') { console.log(`speech model: ${path.basename(modelFile())} (whisper.cpp in this server)`); return; }
  if (mode !== 'remote') { console.log('speech model: none. Captions are written by hand in the caption editor.'); return; }
  const model = process.env.ASR_MODEL || 'Systran/faster-whisper-small';
  try {
    const r = await fetch(`${asrUrl()}/v1/models/${model}`, { method: 'POST', signal: AbortSignal.timeout(30 * 60_000) });
    console.log(`speech model ${model}: ${r.ok ? 'ready' : `not ready (${r.status})`}`);
  } catch (err) {
    console.warn(`speech model ${model}: could not reach ${asrUrl()} (${err.message}). Automatic captions will fail until it is up.`);
  }
}

async function transcribeLocal(mediaFile, lang, work) {
  const wav = path.join(work, 'audio.wav');
  // whisper.cpp reads 16 kHz mono 16-bit WAV.
  await ffmpeg(['-i', mediaFile, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);
  const out = path.join(work, 'captions');
  const threads = String(Math.max(1, Math.min(8, cpus().length)));
  // English-only models ("base.en") cannot be told another language.
  const langArgs = modelName().endsWith('.en') ? [] : ['-l', lang];
  await run(whisperCli(), ['-m', modelFile(), '-f', wav, ...langArgs, '-t', threads, '-np', '-ovtt', '-of', out]);
  return { vtt: await readFile(`${out}.vtt`, 'utf8'), model: `whisper.cpp ${modelName()}` };
}

async function transcribeRemote(mediaFile, lang, work) {
  const model = process.env.ASR_MODEL || 'Systran/faster-whisper-small';
  const audio = path.join(work, 'audio.mp3');
  // 16 kHz mono is what speech models expect, and keeps the upload small.
  await ffmpeg(['-i', mediaFile, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', audio]);
  const form = new FormData();
  form.append('file', new Blob([await readFile(audio)], { type: 'audio/mpeg' }), 'audio.mp3');
  form.append('model', model);
  form.append('language', lang);
  form.append('response_format', 'vtt');
  const r = await fetch(`${asrUrl()}/v1/audio/transcriptions`, { method: 'POST', body: form, signal: AbortSignal.timeout(10 * 60_000) });
  if (!r.ok) throw Object.assign(new Error(`The speech model answered with an error (${r.status}).`), { code: 'speech_model_error' });
  return { vtt: await r.text(), model };
}

/**
 * Captions (WebVTT) from the speech in a media file. Throws with code 'no_speech_model' or 'speech_model_loading'
 * when there is none yet, 'speech_model_error' when it fails. Used for editor drafts and for new uploads.
 */
export async function transcribe(mediaFile, lang) {
  const mode = speechMode();
  if (mode === 'loading') throw Object.assign(new Error('The speech model is still downloading. Try again in a few minutes.'), { code: 'speech_model_loading' });
  if (!mode) throw Object.assign(new Error('No speech model is set up.'), { code: 'no_speech_model' });
  const work = await mkdtemp(path.join(tmpdir(), 'db-asr-'));
  try {
    let { vtt, model } = mode === 'local' ? await transcribeLocal(mediaFile, lang, work) : await transcribeRemote(mediaFile, lang, work);
    if (!isValidVtt(vtt)) vtt = `WEBVTT\n\n${vtt}`;
    return { vtt: vtt.replace(/\r\n?/g, '\n'), model };
  } catch (err) {
    if (mode === 'local' && !err.code) err.code = 'speech_model_error';
    throw err;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

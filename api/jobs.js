// Jobs for the career gateway. Two sources, listed together:
//  - the host's test jobs (demo/data/jobs.json, or JOBS_FILE), read only;
//  - jobs that providers add through the API (DATA_DIR/jobs.json), each one changeable only by its owner.
// Each job is also given as schema.org JobPosting (Level 3), so any job board or search engine can read it.

import express from 'express';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { requireKey, mayChange, notYours, ownerOf, limits } from './auth.js';
import { publicOrigin } from './origin.js';

const SUPPORT_TEXT = {
  interpreter: 'Sign language interpreter for interviews',
  remote: 'Work from home',
  'flexible-hours': 'Flexible hours',
  'screen-reader': 'Screen reader friendly tools',
  'step-free': 'Step-free office',
};
export const SUPPORT = Object.keys(SUPPORT_TEXT);
export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'TEMPORARY', 'INTERN', 'VOLUNTEER'];
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LANG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;

export function jobPosting(job, applyBase) {
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    identifier: job.id,
    title: job.en?.title || Object.values(job).find((v) => v?.title)?.title,
    description: job.en?.summary || Object.values(job).find((v) => v?.summary)?.summary,
    datePosted: job.datePosted,
    validThrough: job.validThrough,
    employmentType: job.employmentType,
    ...(job.remote ? { jobLocationType: 'TELECOMMUTE', applicantLocationRequirements: { '@type': 'Country', name: 'Ethiopia' } } : {}),
    hiringOrganization: { '@type': 'Organization', name: job.employer },
    jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.city, addressCountry: 'ET' } },
    jobBenefits: (job.support || []).map((s) => SUPPORT_TEXT[s] || s).join(', '),
    url: `${applyBase}/api/v1/jobs/${job.id}`,
  };
}

/** Problems with a job, in words. `partial` = a change (PATCH): only the fields sent are checked. */
export function checkJob(job, { partial = false } = {}) {
  const has = (k) => job[k] !== undefined;
  const need = (k) => !partial || has(k);
  const problems = [];
  if (need('employer') && (typeof job.employer !== 'string' || !job.employer.trim() || job.employer.length > 120)) problems.push('"employer": the employer\'s name (up to 120 characters).');
  if (need('city') && (typeof job.city !== 'string' || !job.city.trim() || job.city.length > 80)) problems.push('"city": the town or city, for example "Addis Ababa".');
  if (need('apply') && !/^(https?:\/\/|mailto:)\S+$/.test(String(job.apply || ''))) problems.push('"apply": where to apply, a link starting with https:// or mailto:.');
  if (need('validThrough') && !DATE.test(String(job.validThrough || ''))) problems.push('"validThrough": the closing date as YYYY-MM-DD.');
  if (has('datePosted') && !DATE.test(String(job.datePosted))) problems.push('"datePosted": the date as YYYY-MM-DD.');
  if (need('employmentType') && !EMPLOYMENT_TYPES.includes(job.employmentType)) problems.push(`"employmentType": one of ${EMPLOYMENT_TYPES.join(', ')}.`);
  if (has('remote') && typeof job.remote !== 'boolean') problems.push('"remote": true or false.');
  if (has('support') && (!Array.isArray(job.support) || job.support.some((s) => !SUPPORT.includes(s)))) problems.push(`"support": a list from ${SUPPORT.join(', ')}.`);
  const texts = Object.entries(job).filter(([k]) => LANG.test(k));
  if (!partial && !texts.length) problems.push('Give the job\'s text in at least one language: "en": {"title": "…", "summary": "…"} (and "am" for Amharic).');
  for (const [k, v] of texts) {
    if (!v || typeof v.title !== 'string' || !v.title.trim() || v.title.length > 120) problems.push(`"${k}.title": the job title in that language (up to 120 characters).`);
    if (!v || typeof v.summary !== 'string' || !v.summary.trim() || v.summary.length > 1000) problems.push(`"${k}.summary": a plain-language summary (up to 1000 characters). It is read aloud by "Listen to summary".`);
  }
  return problems;
}

const FIELDS = ['employer', 'city', 'apply', 'validThrough', 'datePosted', 'employmentType', 'remote', 'support'];
function pick(body) {
  const out = {};
  for (const k of FIELDS) if (body[k] !== undefined) out[k] = typeof body[k] === 'string' ? body[k].trim() : body[k];
  for (const [k, v] of Object.entries(body)) if (LANG.test(k) && v && typeof v === 'object') out[k] = { title: String(v.title ?? '').trim(), summary: String(v.summary ?? '').trim() };
  return out;
}

export function jobsRouter({ jobsFile, dataDir }) {
  const router = express.Router();
  const ownFile = path.join(dataDir, 'jobs.json');
  let writing = Promise.resolve();
  const testJobs = async () => JSON.parse(await readFile(jobsFile, 'utf8').catch(() => '{"jobs":[]}')).jobs;
  const added = async () => JSON.parse(await readFile(ownFile, 'utf8').catch(() => '{"jobs":[]}')).jobs;
  const all = async () => [...(await added()), ...(await testJobs())];
  const change = (fn) => (writing = writing.then(async () => {
    const jobs = await added();
    const result = await fn(jobs);
    await mkdir(dataDir, { recursive: true });
    await writeFile(`${ownFile}.tmp`, JSON.stringify({ jobs }, null, 2));
    await rename(`${ownFile}.tmp`, ownFile);
    return result;
  }));
  const shape = (req, job) => {
    const { owner, ...rest } = job;
    // Recorded summaries ("audio" per language) become full addresses, so cards on other sites can play them.
    for (const lang of Object.keys(rest)) {
      if (rest[lang]?.audio) rest[lang] = { ...rest[lang], audio: new URL(rest[lang].audio, publicOrigin(req) + '/').href };
    }
    return { ...rest, jsonLd: jobPosting(job, publicOrigin(req)) };
  };
  const bad = (res, error, message, status = 400, extra = {}) => res.status(status).json({ error, message, ...extra });

  // ?provider=<id> lists one provider's jobs (their id is in GET /api/v1/me).
  router.get('/jobs', async (req, res) => {
    let jobs = await all();
    if (req.query.provider) jobs = jobs.filter((j) => j.owner === String(req.query.provider));
    res.json({ jobs: jobs.map((j) => shape(req, j)) });
  });

  router.get('/jobs/:id', async (req, res) => {
    const job = (await all()).find((j) => j.id === req.params.id);
    if (!job) return bad(res, 'not_found', 'There is no job with this id.', 404);
    res.json(shape(req, job));
  });

  router.post('/jobs', requireKey, express.json({ limit: '20kb' }), async (req, res) => {
    const job = pick(req.body || {});
    const problems = checkJob(job);
    if (problems.length) return bad(res, 'invalid_job', problems[0], 400, { problems });
    if (!req.who.admin && (await added()).filter((j) => j.owner === ownerOf(req)).length >= limits().jobs) {
      return bad(res, 'limit_reached', `You have ${limits().jobs} jobs, the most a key can have. Delete one first.`, 403);
    }
    const taken = new Set((await all()).map((j) => j.id));
    const title = (job.en || Object.values(job).find((v) => v?.title)).title;
    const base = title.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'job';
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    const saved = await change((jobs) => {
      const j = { id, datePosted: new Date().toISOString().slice(0, 10), remote: false, support: [], ...job, owner: ownerOf(req) };
      jobs.push(j);
      return j;
    });
    res.status(201).location(`${publicOrigin(req)}/api/v1/jobs/${id}`).json({
      ...shape(req, saved),
      card: `<script type="module" src="${publicOrigin(req)}/module/db-job-card.js"></script>\n<db-job-card job="${id}"></db-job-card>`,
    });
  });

  router.patch('/jobs/:id', requireKey, express.json({ limit: '20kb' }), async (req, res) => {
    if (!ID.test(req.params.id)) return bad(res, 'not_found', 'There is no job with this id.', 404);
    const changes = pick(req.body || {});
    if (!Object.keys(changes).length) return bad(res, 'nothing_to_change', `Send at least one field to change: ${FIELDS.join(', ')}, or a language like "en".`);
    const problems = checkJob(changes, { partial: true });
    if (problems.length) return bad(res, 'invalid_job', problems[0], 400, { problems });
    if ((await testJobs()).some((j) => j.id === req.params.id)) return notYours(res, 'test job');
    const result = await change((jobs) => {
      const j = jobs.find((x) => x.id === req.params.id);
      if (!j) return { status: 404 };
      if (!mayChange(req, j.owner)) return { status: 403 };
      Object.assign(j, changes);
      return { job: j };
    });
    if (result.status === 404) return bad(res, 'not_found', 'There is no job with this id.', 404);
    if (result.status === 403) return notYours(res, 'job');
    res.json(shape(req, result.job));
  });

  router.delete('/jobs/:id', requireKey, async (req, res) => {
    if ((await testJobs()).some((j) => j.id === req.params.id)) return notYours(res, 'test job');
    const result = await change((jobs) => {
      const i = jobs.findIndex((x) => x.id === req.params.id);
      if (i < 0) return 404;
      if (!mayChange(req, jobs[i].owner)) return 403;
      jobs.splice(i, 1);
      return 204;
    });
    if (result === 404) return bad(res, 'not_found', 'There is no job with this id.', 404);
    if (result === 403) return notYours(res, 'job');
    res.status(204).end();
  });

  return router;
}

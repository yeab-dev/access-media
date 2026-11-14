// Jobs for the career gateway. Test data from demo/data/jobs.json (or JOBS_FILE).
// Each job is also given as schema.org JobPosting (Level 3), so any job board or search engine can read it.

import express from 'express';
import { readFile } from 'node:fs/promises';

const SUPPORT_TEXT = {
  interpreter: 'Sign language interpreter for interviews',
  remote: 'Work from home',
  'flexible-hours': 'Flexible hours',
  'screen-reader': 'Screen reader friendly tools',
  'step-free': 'Step-free office',
};

export function jobPosting(job, applyBase) {
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    identifier: job.id,
    title: job.en.title,
    description: job.en.summary,
    datePosted: job.datePosted,
    validThrough: job.validThrough,
    employmentType: job.employmentType,
    ...(job.remote ? { jobLocationType: 'TELECOMMUTE', applicantLocationRequirements: { '@type': 'Country', name: 'Ethiopia' } } : {}),
    hiringOrganization: { '@type': 'Organization', name: job.employer },
    jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.city, addressCountry: 'ET' } },
    jobBenefits: job.support.map((s) => SUPPORT_TEXT[s] || s).join(', '),
    url: `${applyBase}/api/v1/jobs/${job.id}`,
  };
}

export function jobsRouter({ jobsFile }) {
  const router = express.Router();
  const load = async () => JSON.parse(await readFile(jobsFile, 'utf8')).jobs;
  const origin = (req) => `${req.protocol}://${req.get('host')}`;
  const shape = (req, job) => ({ ...job, jsonLd: jobPosting(job, origin(req)) });

  router.get('/jobs', async (req, res) => {
    const jobs = await load();
    res.json({ jobs: jobs.map((j) => shape(req, j)) });
  });

  router.get('/jobs/:id', async (req, res) => {
    const job = (await load()).find((j) => j.id === req.params.id);
    if (!job) return res.status(404).json({ error: 'not_found', message: 'There is no job with this id.' });
    res.json(shape(req, job));
  });

  return router;
}

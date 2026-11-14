import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Own data folder (keys and certificates are written there) and access code.
const dir = await mkdtemp(path.join(tmpdir(), 'career-test-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_TOKEN = 'unit-test-code';
const { app } = await import('../../api/index.js');
const { verifyJwt } = await import('../../api/certificates.js');

let server;
let origin;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  origin = `http://localhost:${server.address().port}`;
});
after(async () => { server.close(); await rm(dir, { recursive: true, force: true }); });

const issue = (body, token = 'unit-test-code') => fetch(`${origin}/api/v1/certificates`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

test('jobs list and one job, each with schema.org JobPosting', async () => {
  const { jobs } = await (await fetch(`${origin}/api/v1/jobs`)).json();
  assert.equal(jobs.length, 3);
  const job = await (await fetch(`${origin}/api/v1/jobs/junior-frontend`)).json();
  assert.equal(job.am.title, 'ጀማሪ የድር ገጽ ገንቢ');
  assert.equal(job.jsonLd['@type'], 'JobPosting');
  assert.equal(job.jsonLd.jobLocationType, 'TELECOMMUTE');
  assert.equal(job.jsonLd.jobLocation.address.addressCountry, 'ET');
  assert.match(job.jsonLd.jobBenefits, /interpreter/);
  assert.equal((await fetch(`${origin}/api/v1/jobs/nope`)).status, 404);
});

test('issuing a certificate needs the access code and checks its input', async () => {
  assert.equal((await issue({ learnerName: 'A', achievement: { name: 'B' } }, null)).status, 401);
  const bad = await issue({ achievement: { name: 'B' } });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).message, /learner's name/);
});

test('a certificate is an Open Badges 3.0 credential, signed, and its page says Verified', async () => {
  const res = await issue({ learnerName: 'Test Learner Two', achievement: { id: 'demo', name: 'How to write a CV' } });
  assert.equal(res.status, 201);
  const { id, page, credential, jwt } = await res.json();
  assert.ok(credential.type.includes('OpenBadgeCredential'));
  assert.ok(credential['@context'].some((c) => c.includes('ob/v3p0')));
  assert.equal(credential.credentialSubject.name, 'Test Learner Two');

  // Anyone can check the signature with the published public key.
  const { keys } = await (await fetch(`${origin}/.well-known/jwks.json`)).json();
  const { createPublicKey } = await import('node:crypto');
  const payload = verifyJwt(jwt, createPublicKey({ key: keys[0], format: 'jwk' }));
  assert.equal(payload.vc.credentialSubject.name, 'Test Learner Two');

  assert.equal((await (await fetch(`${origin}/api/v1/certificates/${id}`)).json()).valid, true);
  const html = await (await fetch(page)).text();
  assert.match(html, /✓ Verified/);
  assert.match(html, /Test Learner Two/);
  const am = await (await fetch(`${page}?lang=am`)).text();
  assert.match(am, /<html lang="am">/);
  assert.match(am, /ተረጋግጧል/);
});

test('a changed certificate is shown as Not valid', async () => {
  const { id } = await (await issue({ learnerName: 'Honest Learner', achievement: { name: 'How to write a CV' } })).json();
  const file = path.join(dir, 'certificates', `${id}.json`);
  const stored = JSON.parse(await readFile(file, 'utf8'));
  // Someone edits the name inside the signed token.
  const [h, body, sig] = stored.jwt.split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url'));
  payload.vc.credentialSubject.name = 'Someone Else';
  stored.jwt = [h, Buffer.from(JSON.stringify(payload)).toString('base64url'), sig].join('.');
  await writeFile(file, JSON.stringify(stored));
  assert.equal((await (await fetch(`${origin}/api/v1/certificates/${id}`)).json()).valid, false);
  assert.match(await (await fetch(`${origin}/certificates/${id}`)).text(), /✗ Not valid/);
});

test('unknown certificates are a 404 in words', async () => {
  const res = await fetch(`${origin}/certificates/does-not-exist`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /was not found/);
});

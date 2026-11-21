// Certificates an employer can check: Open Badges 3.0 credentials, signed as VC-JWT with Ed25519.
// The learner shares one link. The page behind it checks the signature and says "Verified" or "Not valid".
// Minimum data: the learner's name (they choose to share it), what they achieved, who issued it, when.

import express from 'express';
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { requireStaff } from './sign.js';
import { requireKey, ownerOf } from './auth.js';
import { events } from './events.js';

const ID = /^[A-Za-z0-9_-]{6,64}$/;
const b64 = (buf) => Buffer.from(buf).toString('base64url');
const json64 = (obj) => b64(JSON.stringify(obj));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The issuer's signing key, made once and kept in the data folder (never committed). */
async function issuerKeys(dataDir) {
  const file = path.join(dataDir, 'keys', 'issuer-ed25519.json');
  try {
    const { privateJwk } = JSON.parse(await readFile(file, 'utf8'));
    const privateKey = createPrivateKey({ key: privateJwk, format: 'jwk' });
    return { privateKey, publicKey: createPublicKey(privateKey) };
  } catch {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ privateJwk: privateKey.export({ format: 'jwk' }) }), { mode: 0o600 });
    return { privateKey, publicKey };
  }
}

export function signJwt(payload, privateKey, kid) {
  const head = json64({ alg: 'EdDSA', typ: 'JWT', kid });
  const body = json64(payload);
  return `${head}.${body}.${b64(sign(null, Buffer.from(`${head}.${body}`), privateKey))}`;
}

/** Returns the payload if the signature is good, otherwise null. */
export function verifyJwt(jwt, publicKey) {
  const parts = String(jwt).split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  try {
    if (JSON.parse(Buffer.from(head, 'base64url')).alg !== 'EdDSA') return null;
    if (!verify(null, Buffer.from(`${head}.${body}`), publicKey, Buffer.from(sig, 'base64url'))) return null;
    return JSON.parse(Buffer.from(body, 'base64url'));
  } catch {
    return null;
  }
}

export function certificatesRouter({ dataDir, publicUrl }) {
  const api = express.Router();
  const pages = express.Router();
  const dir = path.join(dataDir, 'certificates');
  const keys = issuerKeys(dataDir);
  const base = (req) => publicUrl || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
  const kid = (req) => `${base(req)}/.well-known/jwks.json#issuer`;

  const read = async (id) => JSON.parse(await readFile(path.join(dir, `${id}.json`), 'utf8'));

  async function check(id) {
    const stored = await read(id);
    const payload = verifyJwt(stored.jwt, (await keys).publicKey);
    return { stored, payload, valid: !!payload && payload.jti === stored.credential.id };
  }

  async function issue(req, { learnerName, achievement, issuedBy = null, owner = null, id = b64(randomBytes(9)) }) {
    const now = new Date();
    const url = `${base(req)}/api/v1/certificates/${id}`;
    // The organisation that awards it, signed with this server's key.
    const issuer = { id: `${base(req)}/api/v1/issuer`, type: ['Profile'], name: issuedBy ? `${issuedBy} (via Amedia)` : 'Amedia (test issuer)' };
    const credential = {
      '@context': ['https://www.w3.org/ns/credentials/v2', 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'],
      id: url,
      type: ['VerifiableCredential', 'OpenBadgeCredential'],
      issuer,
      validFrom: now.toISOString(),
      name: achievement.name,
      credentialSubject: {
        type: ['AchievementSubject'],
        name: learnerName,
        achievement: {
          id: `${base(req)}/api/v1/achievements/${encodeURIComponent(achievement.id || 'lesson')}`,
          type: ['Achievement'],
          name: achievement.name,
          description: achievement.description || achievement.name,
          criteria: { narrative: achievement.criteria || 'Completed the lesson on Amedia.' },
        },
      },
    };
    // VC-JWT: the credential is the "vc" claim of a JWT signed by the issuer.
    const jwt = signJwt({ iss: issuer.id, jti: url, nbf: Math.floor(now / 1000), vc: credential }, (await keys).privateKey, kid(req));
    await mkdir(dir, { recursive: true });
    // owner: which provider issued it (null = the host), so each provider can list their own.
    await writeFile(path.join(dir, `${id}.json`), JSON.stringify({ credential, jwt, owner }, null, 2));
    return { id, credential, jwt };
  }

  api.post('/certificates', express.json({ limit: '20kb' }), requireStaff, async (req, res) => {
    const { learnerName, achievement } = req.body || {};
    if (!learnerName || typeof learnerName !== 'string' || learnerName.length > 120) {
      return res.status(400).json({ error: 'invalid_name', message: 'Give the learner\'s name (up to 120 characters).' });
    }
    if (!achievement?.name || typeof achievement.name !== 'string') {
      return res.status(400).json({ error: 'invalid_achievement', message: 'Give the achievement a name, for example the course or lesson title.' });
    }
    const { id, credential, jwt } = await issue(req, { learnerName: learnerName.trim(), achievement, issuedBy: req.who.provider?.name, owner: ownerOf(req) });
    // No learner name in the webhook: the host already has it.
    events.emit('certificate.issued', { id, page: `${base(req)}/certificates/${id}`, achievement: achievement.name, owner: req.who.provider?.id ?? null });
    res.status(201).json({ id, page: `${base(req)}/certificates/${id}`, credential, jwt });
  });

  // Certificates this key has given (the master key: all). Newest first.
  api.get('/me/certificates', requireKey, async (req, res) => {
    const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json'));
    const list = [];
    for (const f of files) {
      const c = await readFile(path.join(dir, f), 'utf8').then(JSON.parse).catch(() => null);
      if (!c || !(req.who.admin || (c.owner && c.owner === req.who.provider?.id))) continue;
      const id = f.slice(0, -5);
      list.push({
        id, page: `${base(req)}/certificates/${id}`, learnerName: c.credential.credentialSubject?.name,
        achievement: c.credential.name, issued: c.credential.validFrom,
      });
    }
    list.sort((a, b) => String(b.issued).localeCompare(String(a.issued)));
    res.json({ certificates: list });
  });

  api.get('/certificates/:id', async (req, res) => {
    if (!ID.test(req.params.id)) return res.status(404).json({ error: 'not_found', message: 'There is no certificate with this id.' });
    try {
      const { stored, valid } = await check(req.params.id);
      res.json({ valid, credential: stored.credential, jwt: stored.jwt });
    } catch {
      res.status(404).json({ error: 'not_found', message: 'There is no certificate with this id.' });
    }
  });

  api.get('/issuer', (req, res) => res.json({
    '@context': ['https://www.w3.org/ns/credentials/v2', 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'],
    id: `${base(req)}/api/v1/issuer`, type: ['Profile'], name: 'Amedia (test issuer)',
  }));

  // Public key, so anyone can check a certificate without asking us.
  pages.get('/.well-known/jwks.json', async (req, res) => {
    const jwk = (await keys).publicKey.export({ format: 'jwk' });
    res.set('Access-Control-Allow-Origin', '*').json({ keys: [{ ...jwk, kid: kid(req), use: 'sig', alg: 'EdDSA' }] });
  });

  // The page an employer opens. English and Amharic; ?lang=am.
  pages.get('/certificates/:id', async (req, res) => {
    const am = req.query.lang === 'am';
    const T = am
      ? { title: 'የምስክር ወረቀት ማረጋገጫ', ok: '✓ ተረጋግጧል', okText: 'ይህ የምስክር ወረቀት ከታች በተጠቀሰው ድርጅት ተሰጥቷል እና አልተለወጠም።', bad: '✗ ትክክል አይደለም', badText: 'ይህ የምስክር ወረቀት ሊረጋገጥ አልቻለም። ተቀይሮ ሊሆን ይችላል።', missing: 'ይህ የምስክር ወረቀት አልተገኘም።', who: 'ለማን', what: 'ምን', issuer: 'የሰጠው', when: 'መቼ', how: 'እንዴት ተረጋገጠ', howText: 'የምስክር ወረቀቱ በሰጪው ቁልፍ በዲጂታል ፊርማ ተፈርሟል። ይህ ገጽ ፊርማውን አሁን አረጋግጧል። ሶፍትዌር ለማረጋገጥ፦', other: 'English' }
      : { title: 'Certificate check', ok: '✓ Verified', okText: 'This certificate was issued by the organisation named below and has not been changed.', bad: '✗ Not valid', badText: 'This certificate could not be verified. It may have been changed.', missing: 'This certificate was not found.', who: 'Awarded to', what: 'For', issuer: 'Issued by', when: 'Date', how: 'How this was checked', howText: 'The certificate is digitally signed with the issuer\'s key. This page checked the signature just now. For software checks:', other: 'አማርኛ' };
    const lang = am ? 'am' : 'en';
    let body;
    let status = 200;
    try {
      if (!ID.test(req.params.id)) throw new Error('bad id');
      const { stored, valid } = await check(req.params.id);
      const c = stored.credential;
      const date = new Date(c.validFrom);
      const opts = { day: 'numeric', month: 'long', year: 'numeric' };
      const greg = new Intl.DateTimeFormat(am ? 'am-ET' : 'en-GB', opts).format(date);
      const eth = new Intl.DateTimeFormat(`${lang}-ET-u-ca-ethiopic`, opts).format(date);
      body = `
  <p class="verdict ${valid ? 'ok' : 'bad'}" role="status"><strong>${valid ? T.ok : T.bad}</strong><br>${valid ? T.okText : T.badText}</p>
  <dl>
    <dt>${T.who}</dt><dd>${esc(c.credentialSubject.name)}</dd>
    <dt>${T.what}</dt><dd>${esc(c.credentialSubject.achievement.name)}<br><span class="muted">${esc(c.credentialSubject.achievement.description)}</span></dd>
    <dt>${T.issuer}</dt><dd>${esc(c.issuer.name)}</dd>
    <dt>${T.when}</dt><dd>${am ? `${eth} (${greg})` : `${greg} (${eth})`}</dd>
  </dl>
  <h2>${T.how}</h2>
  <p>${T.howText} <a href="/api/v1/certificates/${esc(req.params.id)}">Open Badges 3.0 (JSON)</a> · <a href="/.well-known/jwks.json">public key</a></p>`;
    } catch {
      status = 404;
      body = `<p class="verdict bad" role="status"><strong>${T.missing}</strong></p>`;
    }
    res.status(status).type('html').send(`<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${T.title}</title>
<style>
  :root { color-scheme: light dark; --bg: #fff; --fg: #16181d; --muted: #4a5060; --ok: #146c2e; --okbg: #e6f4ea; --bad: #b00020; --badbg: #fdecee; --accent: #0b5cad; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0f1115; --fg: #eef0f4; --muted: #b8bfcc; --ok: #8fe0a0; --okbg: #12301b; --bad: #ff9a8f; --badbg: #3a1418; --accent: #8cc4ff; } }
  body { margin: 0; background: var(--bg); color: var(--fg); font-family: system-ui, "Noto Sans", "Noto Sans Ethiopic", sans-serif; line-height: 1.6; }
  html[lang=am] body { line-height: 1.7; }
  main { max-width: 40rem; margin: 0 auto; padding: 1rem; }
  h1 { font-size: 1.6rem; } h2 { font-size: 1.15rem; margin-top: 2rem; }
  .verdict { padding: 1rem; border-radius: 8px; border-left: 6px solid; font-size: 1.1rem; }
  .verdict.ok { color: var(--ok); background: var(--okbg); }
  .verdict.bad { color: var(--bad); background: var(--badbg); }
  .verdict strong { font-size: 1.4rem; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.5rem 1rem; }
  dt { font-weight: 600; } dd { margin: 0; } .muted { color: var(--muted); }
  a { color: var(--accent); } a:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  nav a { display: inline-block; padding: 0.6rem 0; }
  @media (max-width: 30rem) { dl { grid-template-columns: 1fr; } dd { margin-bottom: 0.5rem; } }
</style>
</head>
<body>
<main>
  <nav><a href="?lang=${am ? 'en' : 'am'}" lang="${am ? 'en' : 'am'}">${T.other}</a></nav>
  <h1>${T.title}</h1>${body}
</main>
</body>
</html>`);
  });

  return { api, pages, issue };
}

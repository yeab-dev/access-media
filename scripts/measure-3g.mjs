#!/usr/bin/env node
// Load the blank demo page on an emulated Slow 3G connection and report what a learner waits for.
//   node scripts/measure-3g.mjs [http://localhost:8080]
// Profile: Chrome DevTools' classic "Slow 3G": 400 kbit/s down and up, 2000 ms round-trip latency.
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:8080';
const executablePath = process.env.CHROME_PATH || ['/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext();
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 2000, downloadThroughput: (400 * 1000) / 8, uploadThroughput: (400 * 1000) / 8 });

const bytes = {};
const urls = {};
cdp.on('Network.responseReceived', (e) => { urls[e.requestId] = e.response.url; });
cdp.on('Network.loadingFinished', (e) => { bytes[e.requestId] = e.encodedDataLength; });

const t0 = Date.now();
await page.goto(`${base}/demo/blank.html`, { waitUntil: 'domcontentloaded' });
const html = Date.now() - t0;
await page.locator('db-player').getByRole('button', { name: 'Play' }).waitFor({ timeout: 120_000 });
const ready = Date.now() - t0;
await page.waitForTimeout(500);

const kb = (n) => (n / 1024).toFixed(1);
const total = Object.values(bytes).reduce((a, b) => a + b, 0);
const module = Object.entries(bytes).filter(([id]) => /\/module\//.test(urls[id] || '')).reduce((a, [, b]) => a + b, 0);
console.log('Slow 3G (400 kbit/s, 2000 ms latency), cache disabled, blank demo page');
console.log(`  Page HTML loaded:            ${(html / 1000).toFixed(1)} s`);
console.log(`  Player usable (Play button): ${(ready / 1000).toFixed(1)} s`);
console.log(`  Downloaded before playing:   ${kb(total)} KB in ${Object.keys(bytes).length} requests (module + text files: ${kb(module)} KB)`);
for (const [id, n] of Object.entries(bytes).sort((a, b) => b[1] - a[1])) console.log(`    ${kb(n).padStart(7)} KB  ${(urls[id] || '').replace(base, '')}`);
await browser.close();

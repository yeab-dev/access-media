import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

// A predictable "phone voice", so Listen to summary can be tested in a headless browser.
async function fakeVoice(page) {
  await page.addInitScript(() => {
    window.__spoken = [];
    const voices = [{ lang: 'en-US', name: 'Test English' }, { lang: 'am-ET', name: 'Test Amharic' }];
    Object.defineProperty(window, 'speechSynthesis', { value: {
      getVoices: () => voices,
      cancel() { this._u?.onend?.(); this._u = null; },
      speak(u) { this._u = u; window.__spoken.push({ text: u.text, lang: u.lang }); setTimeout(() => { if (this._u === u) { this._u = null; u.onend?.(); } }, 1500); },
    } });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  });
}

test('jobs page: job cards in Savanna, axe clean, JobPosting JSON-LD for search engines', async ({ page }) => {
  await page.goto('/savanna/pages/jobs.html');
  const cards = page.locator('db-job-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.first().getByRole('heading', { name: 'Junior Front-End Developer' })).toBeVisible();
  // Both calendars on the dates.
  await expect(cards.first()).toContainText('14 November 2026');
  await expect(cards.first()).toContainText('2019');
  // Apply links say which job.
  await expect(cards.first().getByRole('link', { name: 'Apply: Junior Front-End Developer' })).toBeVisible();
  expect(await page.locator('script[type="application/ld+json"]').count()).toBe(3);
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => v.id)).toEqual([]);
});

test('Listen to summary reads the whole card, and Stop stops it', async ({ page }) => {
  await fakeVoice(page);
  await withoutRecordings(page);
  await page.goto('/savanna/pages/jobs.html');
  const card = page.locator('db-job-card').first();
  const listen = card.getByRole('button', { name: 'Listen to summary' });
  await listen.click();
  const stop = card.getByRole('button', { name: 'Stop listening' });
  await expect(stop).toHaveAttribute('aria-pressed', 'true');
  const spoken = await page.evaluate(() => window.__spoken[0]);
  expect(spoken.text).toContain('Junior Front-End Developer');
  expect(spoken.text).toContain('Sign language interpreter for interviews');
  await stop.click();
  await expect(card.getByRole('button', { name: 'Listen to summary' })).toHaveAttribute('aria-pressed', 'false');
});

test('no voice for the language: the card says so in words', async ({ page }) => {
  await withoutRecordings(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => [], cancel() {}, speak() {} } });
  });
  await page.goto('/savanna/pages/jobs.html');
  const card = page.locator('db-job-card').first();
  await card.getByRole('button', { name: 'Listen to summary' }).click();
  await expect(card.getByRole('status')).toContainText('no voice for this language');
});

// Leave out recorded summaries, so the phone's own voice is what gets tested.
async function withoutRecordings(page) {
  await page.route(/\/api\/v1\/jobs(\/|$|\?)/, async (route) => {
    const res = await route.fetch();
    const strip = (j) => { for (const k of ['en', 'am']) if (j[k]) delete j[k].audio; return j; };
    const body = await res.json();
    await route.fulfill({ response: res, json: body.jobs ? { ...body, jobs: body.jobs.map(strip) } : strip(body) });
  });
}

test('one language switch: the page switch turns every card Amharic, keeps focus, and reads in Amharic', async ({ page }) => {
  await fakeVoice(page);
  await withoutRecordings(page);
  await page.goto('/savanna/pages/jobs.html');
  const sw = page.locator('db-language').getByLabel('Language / ቋንቋ');
  await sw.selectOption('am');
  const card = page.locator('db-job-card').first();
  await expect(card.getByRole('heading', { name: 'ጀማሪ የድር ገጽ ገንቢ' })).toBeVisible();
  await expect(page.locator('db-job-card').nth(2)).toContainText('ደረጃ የሌለው ቢሮ');
  await expect(page.locator('db-language').getByLabel('ቋንቋ / Language')).toBeFocused();
  await card.getByRole('button', { name: 'ማጠቃለያውን አዳምጥ' }).click();
  const spoken = await page.evaluate(() => window.__spoken[0]);
  expect(spoken.lang).toBe('am-ET');
  expect(spoken.text).toContain('ጀማሪ የድር ገጽ ገንቢ');
});

test('a recorded summary plays even on a phone with no voice (most have no Amharic voice)', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => [], cancel() {}, speak() {}, addEventListener() {}, removeEventListener() {} } });
    window.__played = [];
    HTMLMediaElement.prototype.play = function () { window.__played.push(this.src); return Promise.resolve(); };
  });
  // A job with an Amharic recording, as scripts/add-job-audio.sh makes.
  await page.route(/\/api\/v1\/jobs\/junior-frontend$/, async (route) => {
    const res = await route.fetch();
    const job = await res.json();
    job.am.audio = new URL('/demo/data/jobs-audio/junior-frontend.am.mp3', page.url()).href;
    await route.fulfill({ response: res, json: job });
  });
  await page.goto('/savanna/pages/jobs.html');
  await page.locator('db-language').getByLabel('Language / ቋንቋ').selectOption('am');
  const card = page.locator('db-job-card').first();
  await card.getByRole('button', { name: 'ማጠቃለያውን አዳምጥ' }).click();
  await expect(card.locator('.listen')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__played)).toEqual([expect.stringMatching(/\/demo\/data\/jobs-audio\/junior-frontend\.am\.mp3$/)]);
  await expect(card.locator('.note')).toHaveText('');
});

test('voices that load a moment late are still used (no false "no voice" message)', async ({ page }) => {
  await withoutRecordings(page);
  await page.addInitScript(() => {
    window.__spoken = [];
    let voices = [];
    const listeners = new Set();
    Object.defineProperty(window, 'speechSynthesis', { value: {
      getVoices: () => voices,
      addEventListener: (_t, f) => listeners.add(f), removeEventListener: (_t, f) => listeners.delete(f),
      cancel() {}, speak(u) { window.__spoken.push(u.text); },
    } });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    // Voices arrive after the tap, as in Chrome.
    window.__loadVoices = () => { voices = [{ lang: 'en-US', name: 'Late English' }]; listeners.forEach((f) => f()); };
  });
  await page.goto('/savanna/pages/jobs.html');
  const card = page.locator('db-job-card').first();
  await card.getByRole('button', { name: 'Listen to summary' }).click();
  await page.evaluate(() => setTimeout(window.__loadVoices, 300));
  await expect(card.locator('.listen')).toHaveAttribute('aria-pressed', 'true');
  expect((await page.evaluate(() => window.__spoken))[0]).toContain('Junior Front-End Developer');
  await expect(card.locator('.note')).toHaveText('');
});

test('job card at 200% zoom: no sideways scrolling, buttons still usable', async ({ page }) => {
  // 200% zoom on a 640 px wide window = 320 CSS pixels.
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/savanna/pages/jobs.html');
  await expect(page.locator('db-job-card')).toHaveCount(3);
  await expect(page.locator('db-job-card').first().getByRole('button', { name: 'Listen to summary' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('Level 1: a job card from a plain JSON file, no API', async ({ page }) => {
  await page.goto('/demo/blank.html');
  await page.evaluate(async () => {
    await import('/module/db-job-card.js');
    const card = document.createElement('db-job-card');
    card.setAttribute('src', '/demo/data/jobs.json');
    card.setAttribute('job', 'customer-support');
    document.querySelector('main').append(card);
  });
  await expect(page.locator('db-job-card').getByRole('heading', { name: 'Customer Support Agent' })).toBeVisible();
});

test('certificate check page: Verified, in both languages, axe clean', async ({ page }) => {
  await page.goto('/certificates/demo-learner');
  await expect(page.getByRole('status')).toContainText('✓ Verified');
  await expect(page.getByText('Test Learner')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => v.id)).toEqual([]);
  await page.getByRole('link', { name: 'አማርኛ' }).click();
  await expect(page.getByRole('status')).toContainText('ተረጋግጧል');
});

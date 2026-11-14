// Checks for the behaviour the Team Technical Guide v2 asks of Track 2.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const ready = (page) => expect(page.locator('db-player').getByRole('slider', { name: /Position in video|በቪዲዮው/ })).toBeVisible();

test('blank page (no Bootstrap, attributes only) works and axe is clean', async ({ page }) => {
  await page.goto('/demo/blank.html');
  await ready(page);
  const player = page.locator('db-player');
  // Caption languages come from the file names, labelled in their own language.
  await expect(player.getByLabel('Captions', { exact: true }).locator('option')).toHaveText(['Off', 'English', 'አማርኛ']);
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => v.id)).toEqual([]);
});

test('Space and arrow keys on the video; keyboard help is a real dialog', async ({ page }) => {
  test.skip(test.info().project.name === 'android', 'keyboard test runs on desktop');
  await page.goto('/demo/blank.html');
  await ready(page);
  const player = page.locator('db-player');
  const video = player.locator('video.main');
  const stage = player.getByRole('group', { name: /^Video:/ });
  await stage.focus();
  await page.keyboard.press('Space');
  await expect.poll(() => video.evaluate((v) => !v.paused)).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(() => video.evaluate((v) => v.paused)).toBe(true);
  const t0 = await video.evaluate((v) => v.currentTime);
  await page.keyboard.press('ArrowRight');
  expect(await video.evaluate((v) => v.currentTime)).toBeGreaterThanOrEqual(t0 + 4.9);

  const helpBtn = player.getByRole('button', { name: 'Keyboard help' });
  await helpBtn.click();
  const dialog = player.getByRole('dialog', { name: 'Keyboard help' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Space or K');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(helpBtn).toBeFocused();
});

test('sign window: corner and size buttons (no dragging needed)', async ({ page }) => {
  await page.goto('/demo/blank.html');
  await ready(page);
  const player = page.locator('db-player');
  await player.getByRole('button', { name: 'Sign language', exact: true }).click();
  const win = player.getByRole('group', { name: 'Sign language window' }).first();
  await player.getByRole('button', { name: 'Bottom left' }).click();
  const media = await player.locator('.media').boundingBox();
  const box = await player.locator('.sign').boundingBox();
  expect(box.x - media.x).toBeLessThan(20);
  expect(media.y + media.height - (box.y + box.height)).toBeLessThan(20);
  await player.getByRole('button', { name: 'Larger' }).click();
  expect((await player.locator('.sign').boundingBox()).width).toBeGreaterThan(box.width);
  await expect(win).toBeVisible();
});

test('no sign language video for this lesson: says so in words and tells the host', async ({ page }) => {
  await page.goto('/demo/blank.html');
  await ready(page);
  const requested = page.evaluate(() => new Promise((r) => document.addEventListener('db-player:sign-requested', () => r(true), { once: true })));
  await page.locator('db-player').evaluate((el) => el.removeAttribute('sign'));
  await ready(page);
  const player = page.locator('db-player');
  await player.getByRole('button', { name: 'Sign language', exact: true }).click();
  await expect(player.getByRole('status').filter({ hasText: 'no sign language video' })).toBeVisible();
  expect(await requested).toBe(true);
});

test('events: progress, complete and prefs reach the host page', async ({ page }) => {
  await page.goto('/demo/blank.html');
  await ready(page);
  const events = page.evaluate(() => new Promise((resolve) => {
    const seen = {};
    for (const n of ['progress', 'complete', 'prefs']) {
      document.addEventListener(`db-player:${n}`, (e) => { seen[n] = e.detail; if (seen.progress && seen.complete && seen.prefs) resolve(seen); });
    }
  }));
  const player = page.locator('db-player');
  await player.getByRole('button', { name: 'Settings' }).click();
  await player.getByLabel('Text size').selectOption('l');
  await player.locator('video.main').evaluate((v) => { v.currentTime = 29; return v.play(); });
  const seen = await events;
  expect(seen.prefs.captionSize).toBe('l');
  expect(seen.progress.percent).toBeGreaterThan(90);
  expect(seen.complete).toBeTruthy();
});

test('transcript downloads as text', async ({ page }) => {
  test.skip(test.info().project.name === 'android', 'download flow runs on desktop');
  await page.goto('/demo/blank.html');
  await ready(page);
  const player = page.locator('db-player');
  await player.getByRole('button', { name: 'Transcript', exact: true }).click();
  await expect(player.getByRole('button', { name: /Start with your name/ })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), player.getByRole('button', { name: 'Download transcript (text)' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.txt$/);
  const text = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
  expect(text).toContain('[0:10] Start with your name');
  expect(text).toContain('Description: Slide: Step 1');
});

test('Amharic interface comes from i18n/am.json', async ({ page }) => {
  await page.goto('/demo/blank.html');
  await page.locator('db-player').evaluate((el) => el.setAttribute('lang', 'am'));
  const player = page.locator('db-player');
  await expect(player.getByRole('button', { name: 'የቁልፍ ሰሌዳ እገዛ' })).toBeVisible();
  await expect(player.locator('.player')).toHaveAttribute('lang', 'am');
});

test('one language switch: interface, captions and audio description move together, and it is remembered', async ({ page }) => {
  await page.goto('/demo/blank.html');
  await ready(page);
  const player = page.locator('db-player');
  await player.getByLabel('Captions', { exact: true }).selectOption({ label: 'English' });
  await player.getByLabel('Audio description').selectOption({ label: 'English' });

  await player.getByLabel('Language / ቋንቋ').selectOption('am');
  // Interface is Amharic; captions and descriptions followed; focus stayed on the switch.
  await expect(player.getByRole('button', { name: 'የቁልፍ ሰሌዳ እገዛ' })).toBeVisible();
  const lang = player.getByLabel('ቋንቋ / Language');
  await expect(lang).toBeFocused();
  await expect(player.getByLabel('የጽሑፍ ትርጉም', { exact: true })).toHaveValue('1');
  await expect(player.locator('.ad-select option:checked')).toHaveText('አማርኛ');
  await expect(player.getByRole('status').first()).toContainText('አማርኛ');

  // The choice is remembered on this device, even though the host page says lang="en".
  await page.reload();
  await expect(player.getByRole('button', { name: 'የቁልፍ ሰሌዳ እገዛ' })).toBeVisible();
});

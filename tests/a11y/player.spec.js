import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openSettings, chooseCaptions, chooseDescriptions } from './helpers.js';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function openDemo(page, lang = 'en') {
  await page.goto('/demo/');
  if (lang === 'am') await page.locator('db-player').getByLabel('Language / ቋንቋ').selectOption('am');
  await expect(page.locator('db-player').getByRole('slider', { name: lang === 'am' ? 'በቪዲዮው ውስጥ ያለ ቦታ' : 'Position in video' })).toBeVisible();
}

async function axe(page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

test('axe: no critical or serious issues (English)', async ({ page }) => {
  await openDemo(page);
  await axe(page);
});

test('axe: no critical or serious issues with every panel open (Amharic)', async ({ page }) => {
  await openDemo(page, 'am');
  const player = page.locator('db-player');
  await player.getByRole('button', { name: 'ቅንብሮች' }).click();
  await player.getByRole('button', { name: 'ግልባጭ' }).click();
  await player.getByRole('button', { name: 'የምልክት ቋንቋ' }).click();
  await axe(page);
});

test('keyboard only: Tab to play, start and pause the video', async ({ page, browserName }) => {
  test.skip(test.info().project.name === 'android', 'keyboard test runs on desktop');
  await openDemo(page);
  const player = page.locator('db-player');
  // Tab from the top of the page until the Play button has focus.
  const play = player.getByRole('button', { name: 'Play' });
  for (let i = 0; i < 15 && !(await play.evaluate((el) => el.matches(':focus'))); i++) await page.keyboard.press('Tab');
  await expect(play).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.keyboard.press('k');
  await expect(player.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(player.getByRole('status').last()).toHaveText('Paused');
});

test('captions: choose Amharic, resize and recolour', async ({ page }) => {
  await openDemo(page);
  const player = page.locator('db-player');
  await chooseCaptions(player, { label: 'አማርኛ' });
  await player.locator('video.main').evaluate((v) => { v.currentTime = 2; });
  const cc = player.locator('.cc-text:not(.sample)');
  await expect(cc).toContainText('ስሜ ኪሩቤል');
  await expect(cc).toHaveAttribute('lang', 'am');

  await openSettings(player);
  await player.getByLabel('Text size').selectOption('xl');
  await player.getByLabel('Text colour').selectOption('yellow');
  await expect(cc).toHaveCSS('color', 'rgb(255, 235, 59)');
  const size = await cc.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThan(20);
});

test('transcript: lines are buttons that jump to that moment', async ({ page }) => {
  await openDemo(page);
  const player = page.locator('db-player');
  const toggle = player.getByRole('button', { name: 'Transcript', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(player.getByRole('heading', { name: 'Transcript' })).toBeVisible();
  const line = player.getByRole('button', { name: /after I entered first grade/ });
  await line.click();
  const t = await player.locator('video.main').evaluate((v) => v.currentTime);
  expect(t).toBeGreaterThanOrEqual(9.5);
  await expect(line).toHaveAttribute('aria-current', 'true');
});

test('reflows at 320 px wide (400% zoom equivalent) without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openDemo(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('sign language window: on, move by keyboard, resize, stays in sync', async ({ page }) => {
  await openDemo(page);
  const player = page.locator('db-player');
  const toggle = player.getByRole('button', { name: 'Sign language', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const win = player.getByRole('group', { name: 'Sign language window' });
  await expect(win).toBeVisible();

  // Put it over the video (phones default to beside it), then arrow keys move it left and plus makes it bigger.
  await openSettings(player);
  await player.getByRole('button', { name: 'Top right' }).click();
  await expect(player.getByRole('button', { name: 'Top right' })).toHaveAttribute('aria-pressed', 'true');
  const before = await win.boundingBox();
  await win.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('+');
  const after = await win.boundingBox();
  expect(after.x).toBeLessThan(before.x);
  expect(after.width).toBeGreaterThan(before.width);
  await expect(player.getByRole('button', { name: 'Top right' })).toHaveAttribute('aria-pressed', 'false');

  // Play for a moment: the interpreter video follows the lesson.
  await player.locator('video.main').evaluate((v) => v.play());
  await page.waitForTimeout(2000);
  const [main, sign] = await Promise.all([
    player.locator('video.main').evaluate((v) => v.currentTime),
    player.locator('video.sign-video').evaluate((v) => v.currentTime),
  ]);
  expect(main).toBeGreaterThan(1);
  expect(Math.abs(main - sign)).toBeLessThan(0.5);

  // "Beside the video" takes it out of the picture; axe is still clean.
  await openSettings(player);
  await player.getByRole('button', { name: 'Beside the video' }).click();
  await expect(player.locator('.media')).toHaveClass(/beside/);
  await axe(page);
});

test('sign window: S shortcut toggles it and is announced', async ({ page }) => {
  await openDemo(page);
  const player = page.locator('db-player');
  await player.getByRole('button', { name: 'Play' }).focus();
  await page.keyboard.press('s');
  await expect(player.getByRole('group', { name: 'Sign language window' })).toBeVisible();
  await expect(player.getByRole('status').first()).toContainText('Sign language is on');
  await page.keyboard.press('s');
  await expect(player.getByRole('group', { name: 'Sign language window' })).toBeHidden();
});

test('audio description: read out, video pauses, then resumes', async ({ page }) => {
  await openDemo(page);
  const player = page.locator('db-player');
  await chooseDescriptions(player, { label: 'English' });
  const video = player.locator('video.main');
  await video.evaluate((v) => { v.currentTime = 13.6; return v.play(); });

  const live = player.locator('.ad-live');
  await expect(live).toHaveText(/^Description: Birtukan Yesfu, a woman/, { timeout: 5000 });
  await expect(live).toHaveAttribute('aria-live', 'assertive');
  await expect(player.locator('.ad-text')).toBeVisible();
  expect(await video.evaluate((v) => v.paused)).toBe(true);
  // Resumes on its own after the estimated reading time.
  await expect.poll(() => video.evaluate((v) => !v.paused), { timeout: 16000 }).toBe(true);
});

test('audio description: Amharic text is marked as Amharic for the screen reader', async ({ page }) => {
  await openDemo(page);
  const player = page.locator('db-player');
  await chooseDescriptions(player, { label: 'አማርኛ' });
  await player.locator('video.main').evaluate((v) => { v.currentTime = 13.6; return v.play(); });
  const live = player.locator('.ad-live');
  await expect(live).toContainText('ብርቱካን የሱፉ', { timeout: 5000 });
  await expect(live).toHaveAttribute('lang', 'am');
});

test('transcript includes audio descriptions', async ({ page }) => {
  await openDemo(page);
  const player = page.locator('db-player');
  await player.getByRole('button', { name: 'Transcript', exact: true }).click();
  await expect(player.getByRole('button', { name: /Description: Birtukan Yesfu/ })).toBeVisible();
});

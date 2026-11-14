import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function openDemo(page, lang = 'en') {
  await page.goto('/');
  if (lang === 'am') await page.getByRole('button', { name: 'አማርኛ' }).click();
  await expect(page.locator('access-player').getByRole('slider', { name: lang === 'am' ? 'በቪዲዮው ውስጥ ያለ ቦታ' : 'Position in video' })).toBeVisible();
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
  const player = page.locator('access-player');
  await player.getByRole('button', { name: 'የጽሑፍ ቅርጽ' }).click();
  await player.getByRole('button', { name: 'ግልባጭ' }).click();
  await player.getByText('የቁልፍ ሰሌዳ አቋራጮች').click();
  await axe(page);
});

test('keyboard only: Tab to play, start and pause the video', async ({ page, browserName }) => {
  test.skip(test.info().project.name === 'android', 'keyboard test runs on desktop');
  await openDemo(page);
  const player = page.locator('access-player');
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
  const player = page.locator('access-player');
  await player.getByLabel('Captions', { exact: true }).selectOption({ label: 'አማርኛ' });
  await player.locator('video').evaluate((v) => { v.currentTime = 6; });
  const cc = player.locator('.cc-text:not(.sample)');
  await expect(cc).toContainText('ሲቪ ችሎታዎን');
  await expect(cc).toHaveAttribute('lang', 'am');

  await player.getByRole('button', { name: 'Caption style' }).click();
  await player.getByLabel('Text size').selectOption('xl');
  await player.getByLabel('Text colour').selectOption('yellow');
  await expect(cc).toHaveCSS('color', 'rgb(255, 235, 59)');
  const size = await cc.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThan(20);
});

test('transcript: lines are buttons that jump to that moment', async ({ page }) => {
  await openDemo(page);
  const player = page.locator('access-player');
  const toggle = player.getByRole('button', { name: 'Transcript' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(player.getByRole('heading', { name: 'Transcript' })).toBeVisible();
  const line = player.getByRole('button', { name: /Start with your name/ });
  await line.click();
  const t = await player.locator('video').evaluate((v) => v.currentTime);
  expect(t).toBeGreaterThanOrEqual(10);
  await expect(line).toHaveAttribute('aria-current', 'true');
});

test('reflows at 320 px wide (400% zoom equivalent) without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openDemo(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

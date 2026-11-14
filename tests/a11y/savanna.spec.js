import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Needs a checkout of alx-africa/Savanna-static-pages (see playwright.config.js).
test.skip(!process.env.SAVANNA_DIR, 'Savanna checkout not found');

test('player works inside the Savanna concept page (Level 1 script tag)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/savanna');
  await expect(page.getByRole('heading', { level: 1, name: 'The Future of the VA Industry' })).toBeVisible();
  const player = page.locator('access-player');
  await expect(player.getByRole('slider', { name: 'Position in video' })).toBeVisible();

  await player.getByLabel('Captions', { exact: true }).selectOption({ label: 'English' });
  await player.locator('video.main').evaluate((v) => { v.currentTime = 6; });
  await expect(player.locator('.cc-text:not(.sample)')).toContainText('A CV is a short document');

  // Savanna's own page has issues we don't own; check our component only.
  const results = await new AxeBuilder({ page }).include('access-player')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(blocking.map((v) => v.id)).toEqual([]);
  expect(errors).toEqual([]);
});

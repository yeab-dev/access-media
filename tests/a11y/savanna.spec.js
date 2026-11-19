import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openSettings, chooseCaptions, chooseDescriptions } from './helpers.js';


test('player works inside the Savanna concept page (Level 1 script tag)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/savanna/pages/concept-with-navigation.html');
  await expect(page.getByRole('heading', { level: 1, name: 'The Future of the VA Industry' })).toBeVisible();
  const player = page.locator('db-player');
  await expect(player.getByRole('slider', { name: 'Position in video' })).toBeVisible();
  // Mounted where the guide says: inside .savanna-styles, right under the banner image.
  expect(await player.evaluate((el) => el.parentElement.matches('#curriculum_navigation_content .savanna-styles')
    && el.previousElementSibling.querySelector('img').getAttribute('src').endsWith('VA-Content-Banner.png'))).toBe(true);

  await chooseCaptions(player, { label: 'English' });
  await player.locator('video.main').evaluate((v) => { v.currentTime = 6; });
  await expect(player.locator('.cc-text:not(.sample)')).toContainText('My name is Fentanesh');

  // A real Ethiopian Sign Language video (not the placeholder), and the source is credited.
  await player.getByRole('button', { name: 'Sign language', exact: true }).click();
  await expect(player.getByRole('group', { name: 'Sign language window' })).toBeVisible();
  expect(await player.locator('video.sign-video').evaluate((v) => v.currentSrc || v.src)).toMatch(/ethsl-greetings\/lesson\.ethsl\.mp4$/);
  await expect(player.locator('.credit')).toContainText('Visions Global Empowerment');

  // Savanna's own page has issues we don't own; check our component only.
  const results = await new AxeBuilder({ page }).include('db-player')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(blocking.map((v) => v.id)).toEqual([]);
  expect(errors).toEqual([]);
});

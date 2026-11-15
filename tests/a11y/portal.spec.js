import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const axe = async (page, exclude) => {
  let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']);
  if (exclude) b = b.exclude(exclude);
  const results = await b.analyze();
  expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => v.id)).toEqual([]);
};

test('home page explains what a provider can do, axe clean', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make your lessons work for every learner');
  await expect(page.getByRole('heading', { name: 'Everything you can do' })).toBeVisible();
  await expect(page.locator('code').first()).toContainText(`${new URL(page.url()).origin}/module/db-player.js`);
  await axe(page);
});

test('get a key, then the docs and the studio already use it', async ({ page }) => {
  test.skip(test.info().project.name === 'android', 'provider tools tested on desktop');
  await page.goto('/get-key');
  await axe(page);
  // A missing name is said in words, focus on the field.
  await page.getByRole('button', { name: 'Get my key' }).click();
  await expect(page.getByRole('status')).toContainText('Type your organisation');
  await expect(page.getByLabel("Your organisation's name")).toBeFocused();

  await page.getByLabel("Your organisation's name").fill('Portal Test Provider');
  await page.getByRole('button', { name: 'Get my key' }).click();
  const done = page.getByRole('region', { name: 'Your key' });
  await expect(done).toBeFocused();
  await expect(page.getByLabel('API key')).toHaveValue(/^dbk_/);
  const practice = (await page.locator('#practice-embed').textContent()).match(/lesson="(practice-[0-9a-f]+)"/)[1];
  await axe(page);

  // Documentation: the key is used for "Try it out".
  await page.goto('/docs');
  await expect(page.locator('#keystatus')).toHaveText(/Using the key for Portal Test Provider/);
  await expect(page.locator('.opblock-tag')).toHaveCount(6);
  const me = page.locator('[id="operations-1\\\\._Get_started-get_api_v1_me"]');
  await me.locator('.opblock-summary').click();
  await me.getByRole('button', { name: 'Execute' }).click();
  await expect(me.locator('.live-responses-table .microlight').first()).toContainText('"name": "Portal Test Provider"');
  // Examples show this server's real address, not a placeholder.
  expect(await (await page.request.get('/openapi.yaml')).text()).not.toContain('THIS-SERVER');
  await axe(page, '#api'); // Swagger UI's own markup is checked by its makers; our header and page are checked here

  // Caption editor: lists only this provider's lessons.
  await page.goto('/studio/captions.html');
  const options = await page.getByRole('combobox', { name: 'Lesson' }).locator('option').evaluateAll((os) => os.map((o) => o.value));
  expect(options).toEqual([practice]);
});

test('Debo lesson 2 (an example lesson that ships with the app) plays, with its automatic captions labelled', async ({ page }) => {
  await page.goto('/debo/lessons/creativity-at-work.html');
  await page.evaluate(() => localStorage.clear());
  const player = page.locator('db-player');
  await expect(player.getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 20000 });
  await player.getByRole('button', { name: 'Captions' }).click();
  await expect(player.getByText('Automatic captions: they may have mistakes.')).toBeVisible();
  await player.locator('video.main').evaluate((v) => { v.currentTime = 6; });
  await expect(player.locator('.cc-text:not(.sample)')).toContainText('Sean');
  await axe(page);
});

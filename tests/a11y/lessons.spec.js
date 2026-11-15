import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { chooseCaptions } from './helpers.js';

const axe = async (page) => {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => v.id)).toEqual([]);
};

test('add a lesson: upload a video, follow progress, get the code for the page', async ({ page }) => {
  test.skip(test.info().project.name === 'android', 'staff tool tested on desktop');
  test.setTimeout(60_000);
  await page.goto('/studio/lessons.html');
  await axe(page);

  // Missing fields are said in words, focus goes to the field.
  await page.getByRole('button', { name: 'Upload and prepare' }).click();
  await expect(page.getByRole('status')).toHaveText('Enter the staff access code.');
  await expect(page.getByLabel('Staff access code')).toBeFocused();

  await page.getByLabel('Staff access code').fill('test-code');
  await page.getByLabel('Lesson title').fill(`Upload test ${test.info().project.name} ${Date.now()}`);
  await page.getByLabel('Language spoken in the video').selectOption('en');
  await page.getByLabel('Video file').setInputFiles('.test-data/lessons/demo/lesson.mp4');
  await page.getByRole('button', { name: 'Upload and prepare' }).click();

  const done = page.getByRole('region', { name: 'Your lesson is ready' });
  await expect(done).toBeVisible({ timeout: 45_000 });
  await expect(done).toBeFocused();
  // This test server has no speech model: said plainly, and the editor is one link away.
  await expect(done).toContainText('No speech model is set up');
  await expect(done.locator('code')).toContainText('<db-player lesson="upload-test-');
  await expect(done.getByRole('link', { name: 'Check and correct the captions' })).toHaveAttribute('href', /captions\.html\?lesson=upload-test-/);
  await axe(page);

  // The new lesson plays in the player.
  await done.getByRole('link', { name: 'Watch the lesson' }).click();
  await expect(page.locator('db-player').getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('automatic captions are labelled and a visible note says they may have mistakes', async ({ page }) => {
  // Make the demo's English captions look like a speech model wrote them (no speech model on the test server).
  await page.route('**/api/v1/lessons/demo', async (route) => {
    const lesson = await (await route.fetch()).json();
    for (const t of lesson.tracks) if (t.kind === 'captions' && t.srclang === 'en') Object.assign(t, { auto: true, reviewed: false });
    await route.fulfill({ json: lesson });
  });
  await page.goto('/demo/blank.html');
  await page.evaluate(() => { localStorage.clear(); document.querySelector('db-player').remove(); });
  await page.evaluate(() => document.querySelector('main').insertAdjacentHTML('afterbegin', '<db-player lesson="demo" lang="en"></db-player>'));
  const player = page.locator('db-player');
  const note = player.getByText('Automatic captions: they may have mistakes.');

  await chooseCaptions(player, { label: 'English (automatic)' });
  await expect(note).toBeVisible();
  await chooseCaptions(player, { label: 'አማርኛ' });
  await expect(note).toBeHidden();
  await chooseCaptions(player, { label: 'English (automatic)' });
  await axe(page);
});

test('a lesson still being prepared says so instead of an error', async ({ page }) => {
  await page.route('**/api/v1/lessons/demo', (route) => route.fulfill({ json: { id: 'demo', title: 'New', status: 'processing', sources: [], tracks: [] } }));
  await page.goto('/demo/');
  await expect(page.locator('db-player').getByText('This lesson is still being prepared. Try again in a few minutes.')).toBeVisible();
});

test('a new lesson with no captions yet says so, instead of a button that only says "Captions off"', async ({ page }) => {
  await page.route('**/api/v1/lessons/demo', async (route) => {
    const lesson = await (await route.fetch()).json();
    await route.fulfill({ json: { ...lesson, tracks: [], sign: null } });
  });
  await page.route('**/api/v1/lessons/demo/sign-requests', (route) => route.fulfill({ status: 201, json: { ok: true } }));
  await page.goto('/demo/');
  await page.evaluate(() => localStorage.clear());
  const player = page.locator('db-player');
  await player.getByRole('button', { name: 'Captions' }).click();
  await expect(player.getByRole('status').filter({ hasText: 'There are no captions for this lesson yet.' })).toBeVisible();
  await expect(player.getByRole('button', { name: 'Captions' })).toHaveAttribute('aria-pressed', 'false');
  // The sign language message no longer promises captions that are not there.
  await player.getByRole('button', { name: 'Sign language' }).click();
  const note = player.getByRole('status').filter({ hasText: 'no sign language video' });
  await expect(note).toBeVisible();
  await expect(note).not.toContainText('Captions and the transcript are available');
  await axe(page);
});

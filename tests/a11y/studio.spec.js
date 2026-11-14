import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync } from 'node:fs';

// Chromium's built-in fake camera, so recording can be tested without a webcam.
const executablePath = process.env.CHROME_PATH || ['/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
test.use({ launchOptions: { ...(executablePath ? { executablePath } : {}), args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] } });

test('interpreter records a lesson in the browser and it appears in the player', async ({ page }) => {
  test.skip(test.info().project.name === 'android', 'studio runs on desktop');
  test.setTimeout(60_000);
  await page.goto('/studio/sign.html');
  await page.getByRole('combobox', { name: 'Lesson' }).selectOption('studio-test');
  await page.getByLabel('Staff access code').fill('test-code');

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => v.id)).toEqual([]);

  await page.getByRole('button', { name: 'Turn on camera' }).click();
  await expect(page.getByRole('status')).toContainText('Camera is on');
  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByText('● Recording')).toBeVisible({ timeout: 6000 });
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Stop' }).click();

  await expect(page.getByRole('heading', { name: '4. Check and save' })).toBeFocused();
  await page.getByRole('button', { name: 'Save to lesson' }).click();
  await expect(page.getByRole('status')).toContainText('Saved', { timeout: 20000 });

  const lesson = await (await page.request.get('/api/v1/lessons/studio-test')).json();
  expect(lesson.sign.recordedAt).toBeTruthy();
  expect(lesson.sign.placeholder).toBeFalsy();

  // The new signing plays in the player's sign window.
  await page.getByRole('link', { name: 'Open the lesson with your signing' }).click();
  const player = page.locator('db-player');
  await player.getByRole('button', { name: 'Sign language', exact: true }).click();
  await expect.poll(() => player.locator('video.sign-video').evaluate((v) => v.src)).toContain('/media/studio-test/lesson.ethsl.mp4');
});

test('saving without the access code is refused in words', async ({ page }) => {
  test.skip(test.info().project.name === 'android', 'studio runs on desktop');
  const res = await page.request.post('/api/v1/lessons/studio-test/sign', { multipart: { offset: '0' } });
  expect(res.status()).toBe(401);
  expect((await res.json()).message).toContain('staff access code');
});

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('caption editor: correct a line, problems explained and linked, save, learners see it', async ({ page }) => {
  test.skip(test.info().project.name === 'android', 'staff tool tested on desktop');
  await page.goto('/studio/captions.html');
  await page.getByLabel('Staff access code').fill('test-code');
  await page.getByRole('combobox', { name: 'Lesson' }).selectOption('studio-test');
  await page.getByRole('combobox', { name: 'Track' }).selectOption('captions:en');
  await expect(page.getByRole('status')).toContainText('Loaded 6 lines');

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => v.id)).toEqual([]);

  // No speech model on this server: said in words. (It first asks before replacing existing lines.)
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Get a draft from the speech model' }).click();
  await expect(page.getByRole('status')).toContainText('No speech model is set up');

  const line1 = page.getByRole('group', { name: 'Line 1' });
  await line1.getByLabel('Words').fill('[music] Welcome! This line was corrected by a person.');
  const line2 = page.getByRole('group', { name: 'Line 2' });
  await line2.getByLabel('End').fill('0:04.000'); // before its start: a problem
  await expect(line2.getByText('The end time must be after the start time.')).toBeVisible();
  await expect(line2.getByLabel('End')).toHaveAttribute('aria-invalid', 'true');

  // Saving shows a summary, focused, with a link to the line.
  await page.getByRole('button', { name: 'Save to the lesson' }).click();
  const summary = page.locator('#errors');
  await expect(summary).toBeFocused();
  await summary.getByRole('link', { name: /Line 2: The end time must be after the start time/ }).click();
  await expect(line2.getByLabel('End')).toBeFocused();
  await line2.getByLabel('End').fill('0:10.000');

  await page.getByRole('button', { name: 'Save to the lesson' }).click();
  await expect(page.getByRole('status')).toContainText('Saved 6 lines');

  // Download works too.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download the WebVTT file' }).click()]);
  expect(download.suggestedFilename()).toBe('lesson.en.vtt');

  // The player shows the corrected line.
  await page.goto('/demo/?lesson=studio-test');
  const player = page.locator('db-player');
  await player.getByLabel('Captions', { exact: true }).selectOption({ label: 'English' });
  await player.locator('video.main').evaluate((v) => { v.currentTime = 1; });
  await expect(player.locator('.cc-text:not(.sample)')).toContainText('corrected by a person');
});

test('caption editor: add and delete lines by keyboard, focus goes to the right place', async ({ page }) => {
  test.skip(test.info().project.name === 'android', 'staff tool tested on desktop');
  await page.goto('/studio/captions.html');
  await page.getByRole('combobox', { name: 'Lesson' }).selectOption('studio-test');
  await page.getByRole('combobox', { name: 'Track' }).selectOption('captions:am');
  await expect(page.getByRole('status')).toContainText('Loaded 6 lines');
  await page.getByRole('group', { name: 'Line 3' }).getByRole('button', { name: 'Add line after' }).click();
  await expect(page.getByRole('group', { name: 'Line 4' }).getByLabel('Words')).toBeFocused();
  await expect(page.getByRole('group', { name: 'Line 4' }).getByLabel('Words')).toHaveAttribute('lang', 'am');
  await page.getByRole('group', { name: 'Line 4' }).getByRole('button', { name: 'Delete line' }).click();
  await expect(page.getByRole('group', { name: 'Line 7' })).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Line 4 deleted');
});

test('caption editor: a focused field is never hidden under the video (WCAG 2.4.11)', async ({ page }) => {
  test.skip(test.info().project.name === 'android', 'staff tool tested on desktop');
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/studio/captions.html');
  await expect(page.getByRole('status')).toContainText('Loaded');
  for (const n of [4, 6]) {
    const field = page.getByRole('group', { name: `Line ${n}` }).getByLabel('Words');
    await field.focus();
    const stickyBottom = await page.locator('.sticky').evaluate((el) => el.getBoundingClientRect().bottom);
    const box = await field.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(stickyBottom - 1);
  }
});

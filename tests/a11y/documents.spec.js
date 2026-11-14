import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const lang of ['en', 'am']) {
  test(`lesson document (${lang}): axe clean, every image described, reachable from the player`, async ({ page }) => {
    await page.goto(`/api/v1/lessons/demo/document?lang=${lang}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const img of await page.getByRole('img').all()) {
      expect((await img.getAttribute('alt')).length).toBeGreaterThan(15);
    }
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => v.id)).toEqual([]);
  });
}

test('player transcript panel links to the lesson document in the learner language', async ({ page }) => {
  await page.goto('/demo/');
  const player = page.locator('db-player');
  await player.getByRole('button', { name: 'Transcript', exact: true }).click();
  await expect(player.getByRole('link', { name: /The lesson as a PDF/ })).toHaveAttribute('href', /document\?lang=en&format=pdf/);
  await player.getByLabel('Language / ቋንቋ').selectOption('am');
  await player.getByRole('button', { name: 'ግልባጭ', exact: true }).click();
  await expect(player.getByRole('link', { name: /ትምህርቱ እንደ ድረ-ገጽ/ })).toHaveAttribute('href', /lang=am&format=html/);
});

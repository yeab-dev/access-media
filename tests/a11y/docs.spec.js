import { test, expect } from '@playwright/test';

test('API documentation at /docs loads openapi.yaml without errors and lists the calls', async ({ page }) => {
  test.skip(test.info().project.name === 'android', 'developer page tested on desktop');
  await page.goto('/docs');
  await expect(page.getByRole('heading', { name: /Amedia API/ })).toBeVisible();
  await expect(page.locator('.opblock').first()).toBeVisible();
  expect(await page.locator('.opblock').count()).toBeGreaterThan(18);
  await expect(page.locator('.errors-wrapper')).toHaveCount(0);
});

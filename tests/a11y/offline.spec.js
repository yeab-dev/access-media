import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import yauzl from 'yauzl';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function unzip(file, dir) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      zip.on('entry', (e) => {
        zip.openReadStream(e, async (err2, stream) => {
          if (err2) return reject(err2);
          const chunks = [];
          for await (const c of stream) chunks.push(c);
          const out = path.join(dir, e.fileName);
          await mkdir(path.dirname(out), { recursive: true });
          await writeFile(out, Buffer.concat(chunks));
          zip.readEntry();
        });
      });
      zip.on('end', resolve);
      zip.readEntry();
    });
  });
}

test('download the offline pack from the player and use it from disk', async ({ page }) => {
  test.skip(test.info().project.name === 'android', 'download flow runs on desktop');
  await page.goto('/demo/');
  const player = page.locator('db-player');
  const link = player.getByRole('link', { name: /Download for offline/ });
  await expect(link).toBeVisible();
  // The size is shown before the learner taps.
  await expect(link).toContainText(/\(0\.\d MB\)/);

  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  expect(download.suggestedFilename()).toBe('demo-offline.zip');
  const dir = await mkdtemp(path.join(tmpdir(), 'offline-'));
  const zipPath = path.join(dir, 'pack.zip');
  await download.saveAs(zipPath);
  await unzip(zipPath, dir);

  // Open index.html straight from the file system, as on a phone with no data.
  await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
  await expect(page.getByRole('heading', { level: 1, name: 'How to write a CV' })).toBeVisible();
  await expect(page.locator('#transcript-am')).toHaveAttribute('lang', 'am');
  await expect(page.getByText('Description:').first()).toBeVisible();

  // Captions load from the embedded data: URLs even on file://.
  const cues = await page.locator('video').evaluate(async (v) => {
    const t = v.textTracks[0];
    t.mode = 'hidden';
    for (let i = 0; i < 40 && !(t.cues && t.cues.length); i++) await new Promise((r) => setTimeout(r, 50));
    return t.cues ? t.cues.length : 0;
  });
  expect(cues).toBe(6);
  expect(await page.locator('video').evaluate((v) => new Promise((r) => {
    if (v.readyState >= 1) return r(v.duration);
    v.addEventListener('loadedmetadata', () => r(v.duration), { once: true });
    v.load();
  }))).toBeGreaterThan(29);

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => v.id)).toEqual([]);
});

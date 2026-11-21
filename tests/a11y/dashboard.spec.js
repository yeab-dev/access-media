import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const axe = async (page, exclude) => {
  let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']);
  if (exclude) b = b.exclude(exclude);
  const results = await b.analyze();
  expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
};

test('provider dashboard: sign in, manage a lesson, jobs, certificates, webhooks and the key', async ({ page }) => {
  test.skip(test.info().project.name === 'android', 'provider tools tested on desktop');
  test.setTimeout(90_000);
  const made = await (await page.request.post('/api/v1/keys', { data: { organisation: 'Dashboard Test Provider' } })).json();
  const practice = made.practiceLesson.id;
  page.on('dialog', (d) => d.accept());

  // Signed out: a sign-in form. A wrong key is said in words.
  await page.goto('/provider/');
  await expect(page.getByRole('heading', { name: 'Sign in with your API key' })).toBeVisible();
  await axe(page);
  await page.getByRole('textbox', { name: 'Your API key' }).fill('dbk_wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('That key does not work');
  await page.getByRole('textbox', { name: 'Your API key' }).fill(made.key);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.who')).toContainText('Signed in as Dashboard Test Provider');
  await expect(page.getByRole('heading', { name: 'What needs your attention' })).toBeVisible();
  await expect(page.locator('#embed')).toContainText(`lesson="${practice}"`);
  await axe(page);

  // Lessons list → one lesson.
  await page.getByRole('navigation', { name: 'Dashboard' }).getByRole('link', { name: 'Lessons' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your lessons');
  await expect(page.locator('#list > li')).toHaveCount(1);
  await axe(page);
  await page.locator('#list').getByRole('link', { name: /^Manage/ }).click();
  await expect(page.locator('db-player')).toHaveAttribute('lesson', practice);
  await axe(page, 'db-player'); // the player has its own axe tests

  // Amharic title saved.
  await page.getByLabel('Title in Amharic').fill('ሙከራ ትምህርት');
  await page.getByRole('button', { name: 'Save name and language' }).click();
  await expect(page.locator('#status')).toContainText('Name and language saved');
  expect((await (await page.request.get(`/api/v1/lessons/${practice}`)).json()).titles.am).toBe('ሙከራ ትምህርት');

  // A slide with a picture description; a bad time is said in words.
  const before = await page.locator('fieldset.slide').count();
  await page.getByRole('button', { name: 'Add a slide' }).click();
  const n = before + 1;
  await page.getByLabel('Appears at').last().fill('soon');
  await page.getByRole('button', { name: 'Save slides' }).click();
  await expect(page.locator('#status')).toContainText(`Slide ${n}: write when it appears`);
  await page.getByLabel('Appears at').last().fill('1:05');
  await page.locator(`#s${n}-en-title`).fill('Test slide');
  await page.locator(`#s${n}-en-alt`).fill('A chart rising from left to right.');
  await page.getByRole('button', { name: 'Save slides' }).click();
  await expect(page.locator('#status')).toContainText('saved, in time order');
  const { slides } = await (await page.request.get(`/api/v1/lessons/${practice}/slides`)).json();
  expect(slides.find((s) => s.time === 65)?.en.alt).toBe('A chart rising from left to right.');
  await axe(page, 'db-player');

  // Tool links open the right lesson and track.
  await expect(page.getByRole('link', { name: 'Open the sign language studio' })).toHaveAttribute('href', `/studio/sign.html?lesson=${practice}`);
  await page.locator('#tracks').getByRole('link', { name: /audio description in Amharic/ }).click();
  await expect(page.getByRole('combobox', { name: 'Track' })).toHaveValue('descriptions:am');
  await expect(page.getByRole('combobox', { name: 'Lesson' })).toHaveValue(practice);

  // Jobs: add, see the card, remove.
  await page.goto('/provider/jobs');
  await axe(page);
  await page.getByRole('button', { name: 'Add the job' }).click();
  await expect(page.locator('#status')).toContainText('Give the job title in English');
  await expect(page.getByLabel('Job title', { exact: true })).toBeFocused();
  await page.getByLabel('Job title', { exact: true }).fill('Dashboard Test Job');
  await page.getByLabel('Summary in plain words').fill('Answer questions from learners by chat.');
  await page.getByLabel('Town or city').fill('Adama');
  await page.getByLabel('Closing date').fill('2027-01-31');
  await page.getByLabel('Where to apply').fill('mailto:jobs@example.com');
  await page.getByLabel('Flexible hours').check();
  await page.getByRole('button', { name: 'Add the job' }).click();
  await expect(page.locator('#status')).toContainText('“Dashboard Test Job” added');
  await page.getByText('How it looks to learners').click();
  await expect(page.locator('db-job-card').getByRole('button', { name: 'Listen to summary' })).toBeVisible();
  await axe(page);
  await page.getByRole('button', { name: 'Remove: Dashboard Test Job' }).click();
  await expect(page.locator('#status')).toContainText('Job removed');

  // Certificates: give one, it is listed, its page says Verified.
  await page.goto('/provider/certificates');
  await page.getByLabel("Learner's name").fill('Test Learner');
  await page.getByLabel('What they achieved').fill('Dashboard course');
  await page.getByRole('button', { name: 'Give the certificate' }).click();
  await expect(page.locator('#given')).toBeFocused();
  await expect(page.locator('#list')).toContainText('Test Learner');
  await axe(page);
  const link = await page.locator('#given-link').getAttribute('href');
  await page.goto(link);
  await expect(page.getByText('✓ Verified')).toBeVisible();

  // Webhooks: add (secret shown once), remove.
  await page.goto('/provider/webhooks');
  await page.getByLabel('Address to call').fill('https://example.com/hook');
  await page.getByRole('button', { name: 'Add the webhook' }).click();
  await expect(page.getByLabel('Secret')).toHaveValue(/.{20,}/);
  await axe(page);
  await page.getByRole('button', { name: /Remove the webhook/ }).click();
  await expect(page.locator('#status')).toContainText('Webhook removed');

  // Key: a new one replaces the old; the dashboard keeps working with it.
  await page.goto('/provider/key');
  await axe(page);
  await page.getByRole('button', { name: 'Make a new key' }).click();
  const fresh = await page.getByLabel('New API key').inputValue();
  expect(fresh).not.toBe(made.key);
  expect((await page.request.get('/api/v1/me', { headers: { Authorization: `Bearer ${made.key}` } })).status()).toBe(401);
  await page.goto('/provider/lessons');
  await expect(page.locator('.who')).toContainText('Signed in as Dashboard Test Provider');

  // Sign out forgets the key.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('textbox', { name: 'Your API key' })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in with your API key' })).toBeVisible();
});

test('where it is shown: the Savanna page appears on the lesson by itself; the dashboard preview does not count', async ({ page }) => {
  test.skip(test.info().project.name === 'android', 'provider tools tested on desktop');
  const made = await (await page.request.post('/api/v1/keys', { data: { organisation: 'Pages Test Provider' } })).json();
  const practice = made.practiceLesson.id;
  await page.addInitScript((k) => sessionStorage.setItem('studio-code', k), made.key);

  // Signed in: the practice lesson is on no page yet, and opening the dashboard (with its preview) does not change that.
  await page.goto(`/provider/lesson?id=${practice}`);
  await expect(page.locator('db-player').getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 20000 });
  await page.reload();
  await expect(page.locator('#pages')).toContainText('Not on any page yet');
  await page.goto('/provider/');
  await expect(page.locator('#todo')).toContainText('is ready but not on any page of your website yet');

  // The provider puts it on a page (here the demo page); a learner opens it.
  await page.goto(`/demo/?lesson=${practice}`);
  await expect(page.locator('db-player').getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 20000 });
  await expect.poll(async () => (await (await page.request.get(`/api/v1/lessons/${practice}/pages`, { headers: { Authorization: `Bearer ${made.key}` } })).json()).pages.length).toBe(1);
  await page.goto(`/provider/lesson?id=${practice}`);
  const shown = page.getByRole('region', { name: "Where it's shown" });
  await expect(shown.getByRole('link', { name: /\/demo\/$/ })).toBeVisible();
  await axe(page, 'db-player');
  await page.goto('/provider/lessons');
  await expect(page.locator('#list')).toContainText('Shown on');

  // The host's demo lesson, opened in Savanna, shows Savanna on the host's dashboard.
  await page.goto('/savanna/pages/concept-with-navigation.html');
  await expect(page.locator('db-player').getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 20000 });
  await expect.poll(async () => (await (await page.request.get('/api/v1/lessons/demo/pages', { headers: { Authorization: 'Bearer test-code' } })).json()).pages.map((p) => p.url))
    .toContain(new URL('/savanna/pages/concept-with-navigation.html', page.url()).href);
  const host = await page.context().newPage(); // a new tab, signed in with the host's master key
  await host.addInitScript(() => sessionStorage.setItem('studio-code', 'test-code'));
  await host.goto('/provider/lesson?id=demo');
  await expect(host.getByRole('region', { name: "Where it's shown" }).getByRole('link', { name: /savanna\/pages\/concept-with-navigation\.html/ })).toBeVisible();
});

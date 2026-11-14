import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Playwright's bundled Chromium cannot play H.264 MP4. Use a full Chrome/Chromium when available.
const executablePath = process.env.CHROME_PATH || ['/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
const launchOptions = executablePath ? { executablePath } : {};


export default defineConfig({
  testDir: 'tests/a11y',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:8090', launchOptions },
  webServer: {
    command: [
      'rm -rf .test-data && mkdir -p .test-data && cp -r data/lessons .test-data/',
      // A second copy of the demo for the sign studio test, so recordings never touch the lesson other tests use.
      'cp -r .test-data/lessons/demo .test-data/lessons/studio-test',
      `sed -i 's/"id": "demo"/"id": "studio-test"/; s/How to write a CV/Studio test lesson/' .test-data/lessons/studio-test/manifest.json`,
      'DATA_DIR=.test-data ADMIN_TOKEN=test-code PORT=8090 node api/index.js',
    ].join(' && '),
    url: 'http://localhost:8090/api/v1/health',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
  ],
});

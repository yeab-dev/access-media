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
    command: 'PORT=8090 node server/index.js',
    url: 'http://localhost:8090/api/health',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
  ],
});

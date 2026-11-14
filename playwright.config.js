import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Playwright's bundled Chromium cannot play H.264 MP4. Use a full Chrome/Chromium when available.
const executablePath = process.env.CHROME_PATH || ['/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
const launchOptions = executablePath ? { executablePath } : {};

// Savanna integration test runs when a checkout of alx-africa/Savanna-static-pages sits next to this repo.
const savannaDir = process.env.SAVANNA_DIR || (existsSync('../Savanna-static-pages/pages') ? '../Savanna-static-pages' : '');
if (savannaDir) process.env.SAVANNA_DIR = savannaDir;

export default defineConfig({
  testDir: 'tests/a11y',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:8090', launchOptions },
  webServer: {
    command: `PORT=8090 ${savannaDir ? `SAVANNA_DIR=${savannaDir} ` : ''}node server/index.js`,
    url: 'http://localhost:8090/api/health',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
  ],
});

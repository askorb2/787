// @ts-check
const { defineConfig } = require('@playwright/test');

// Galaxy S24+-like phone profile: Playwright's device catalog doesn't ship a
// "Galaxy S24+" preset, so this pins the viewport/DPR the task asked for
// directly instead of relying on a close-enough built-in device.
const PHONE = {
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 3.5,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
};

module.exports = defineConfig({
  testDir: 'tests/ui',
  timeout: 30000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    ...PHONE,
  },
  webServer: {
    command: 'node tests/ui/static-server.js',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: true,
    timeout: 20000,
  },
  projects: [
    { name: 'light', use: { colorScheme: 'light' } },
    { name: 'dark', use: { colorScheme: 'dark' } },
  ],
});

// The root suite discovers task specs together. Use PW_CHROME_PATH when
// Playwright's bundled browser is unavailable (see CLAUDE.md).
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.js/,
  timeout: 25000,
  expect: { timeout: 5000 },
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/report.json' }]],
  use: {
    browserName: 'chromium', headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 5000,
    launchOptions: process.env.PW_CHROME_PATH ? { executablePath: process.env.PW_CHROME_PATH } : {},
  },
});

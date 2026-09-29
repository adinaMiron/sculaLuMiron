// Tester suite for the task pipeline. Set PW_CHROME_PATH to a system Chrome/Chromium
// when Playwright's bundled browser is not installed (see CLAUDE.md).
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: ['**/01-for-index-html-page-please-add/*.spec.js', '**/02-adapt-the-menu-for-small-screens/*.spec.js'],
  timeout: 25000,
  expect: { timeout: 4000 },
  workers: 1,
  // `list` for people; the JSON file feeds tests/01-*/summarize.js (short failure digest —
  // failures that involve data: URLs make the list output enormous)
  reporter: [['list'], ['json', { outputFile: 'test-results/report.json' }]],
  use: {
    viewport: { width: 1280, height: 800 },
    actionTimeout: 5000,
    launchOptions: process.env.PW_CHROME_PATH ? { executablePath: process.env.PW_CHROME_PATH } : {},
  },
});

const path = require('node:path');
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: '*.spec.js',
  timeout: 20000,
  expect: { timeout: 3000 },
  workers: 1,
  retries: 0,
  outputDir: path.resolve(__dirname, '../../test-results/index-review'),
  reporter: [['list'], ['json', { outputFile: path.resolve(__dirname, '../../test-results/index-review.json') }]],
  use: {
    viewport: { width: 1440, height: 900 },
    timezoneId: 'Europe/Bucharest',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PW_CHROME_PATH ? { executablePath: process.env.PW_CHROME_PATH } : {},
  },
});

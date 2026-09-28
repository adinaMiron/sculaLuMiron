const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/04-for-index-html-page-in-idee',
  timeout: 20000,
  expect: { timeout: 5000 },
  workers: 1,
  use: { browserName: 'chromium', headless: true },
  reporter: 'list'
});

const path = require('path');
const { test, expect } = require('@playwright/test');

const URL = 'file://' + path.join(__dirname, '..', '..', 'index.html');
const ACTIONS = [
  ['#btn-workbooks', 'toggleWorkbooks'],
  ['[data-i="newFileBtn"]', 'newFile'],
  ['#btn-help', 'openHelpModal'],
  ['#btn-idea', 'openIdeaModal'],
  ['#btn-cal-sync', 'calSyncAll'],
  ['#btn-map', 'openMap'],
  ['[data-i="openFileBtn"]', 'openFile'],
  ['[data-i="importDocxBtn"]', 'importDocx'],
  ['[data-i="exportHtmlBtn"]', 'exportHtml'],
];

for (const [width, lang] of [[1025, 'ro'], [1600, 'en'], [1601, 'ro'], [1920, 'en']]) {
  test(`all header actions activate by pointer and keyboard at ${width}px ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(URL);
    await page.waitForFunction(() => typeof paintCloud === 'function' && document.documentElement.lang === 'ro');
    await page.evaluate(() => document.fonts.ready);
    if (lang === 'en') {
      await page.locator('#navLangBtn').click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    }
    await page.waitForFunction(() => !document.querySelector('#welcome-modal.open'));
    await page.evaluate((names) => {
      document.getElementById('btn-map').hidden = false;
      document.getElementById('wb-crumb').hidden = false;
      document.getElementById('wb-crumb').textContent = 'Capitolul ăâîșț '.repeat(12);
      document.getElementById('current-file').textContent = 'fișier-foarte-lung-'.repeat(10) + '.md';
      window.__headerCalls = [];
      for (const name of names) window[name] = () => window.__headerCalls.push(name);
    }, ACTIONS.map(([, name]) => name));

    for (const [selector, name] of ACTIONS) {
      const button = page.locator(`header .header-actions ${selector}`);
      const before = await button.evaluate((e) => {
        const r = e.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          inViewport: r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= innerWidth + 1,
          hit: hit === e || e.contains(hit),
          label: e.textContent.trim(),
          expectedLabel: t(e.getAttribute('data-i')),
          title: e.title,
          expectedTitle: e.hasAttribute('data-i-title') ? t(e.getAttribute('data-i-title')) : null,
        };
      });
      expect(before.inViewport, `${selector} escaped the viewport before interaction`).toBe(true);
      expect(before.hit, `${selector} was covered before interaction`).toBe(true);
      expect(before.label, `${selector} lost its full localized label`).toBe(before.expectedLabel);
      if (before.expectedTitle !== null) expect(before.title).toBe(before.expectedTitle);

      await button.click();
      await button.focus();
      await page.keyboard.press('Enter');
      const calls = await page.evaluate(() => window.__headerCalls);
      expect(calls.slice(-2), `${selector} should invoke ${name} once per activation`).toEqual([name, name]);
    }
    expect(await page.evaluate(() => window.__headerCalls.length)).toBe(ACTIONS.length * 2);
  });
}

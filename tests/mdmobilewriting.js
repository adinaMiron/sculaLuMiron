// Run: node tests/mdmobilewriting.js (bundled headless Chromium, offline).
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const VIEWPORTS = [[320, 640], [390, 844], [844, 390], [700, 900], [1024, 768],
  [390, 500], [390, 400], [320, 360], [844, 300]];

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250); // toolbar's 200ms height transition
}

async function writingSpace(page, label, minimum) {
  const geometry = await page.evaluate(() => {
    const box = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    };
    return { editor: box('#editor'), workspace: box('.workspace'),
      save: box('#wb-save-sync-row'), toolbar: box('.toolbar'), height: innerHeight };
  });
  assert(geometry.editor.height >= minimum, label + ': editor ' + JSON.stringify(geometry));
  assert(geometry.workspace.height >= minimum, label + ': workspace height');
  assert(geometry.editor.bottom <= geometry.height + 1, label + ': editor stays on screen');
  assert(geometry.editor.top >= geometry.toolbar.bottom - 1, label + ': no toolbar overlap');
  assert(geometry.save.height > 0 && geometry.save.bottom <= geometry.toolbar.top + 1,
    label + ': save strip remains above formatting tools');
  return Math.round(geometry.editor.height);
}

async function reachableControls(page, selector) {
  // Include all controls, even disabled undo/redo; only the two intentionally
  // conditional controls (Garden and assignees) are absent in this fixture.
  const controls = page.locator(selector);
  for (let i = 0; i < await controls.count(); i++) {
    const control = controls.nth(i);
    await control.scrollIntoViewIfNeeded();
    const reachable = await control.evaluate(e => {
      const r = e.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight + 1 &&
        (hit === e || e.contains(hit));
    });
    assert(reachable, 'Control cannot be reached: ' + await control.evaluate(e => e.outerHTML));
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const lang of ['ro', 'en']) {
      for (const [width, height] of VIEWPORTS) {
        const context = await browser.newContext({ viewport: { width, height },
          isMobile: true, hasTouch: true });
        try {
          await context.route(/^https?:/, route => route.abort());
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          await page.goto(URL);
          await page.waitForFunction(() => wbDraftReady && typeof initToolbarCollapse === 'function');
          await page.evaluate(lang => window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: lang })), lang);
          await settle(page);
          const label = `${lang} ${width}x${height}`;
          assert.equal(await page.locator('html').getAttribute('lang'), lang, label + ': interface language');
          assert.equal(await page.locator('.toolbar').evaluate(e => e.classList.contains('collapsed')), false,
            label + ': first load has no saved toolbar preference');
          const minimum = height <= 360 ? 80 : height <= 500 ? 100 : 160;
          const first = await writingSpace(page, label + ' first load', minimum);

          await page.locator('#editor').fill('Writing space');
          await page.locator('#editor').evaluate(e => e.setSelectionRange(0, e.value.length));
          await page.locator('[data-i-title="boldTip"]').click();
          assert.equal(await page.locator('#editor').inputValue(), '**Writing space**');
          await reachableControls(page, '#toolbar-groups button:not(#btn-garden), ' +
            '#toolbar-groups select:not(#responsible-select), #toolbar-groups input[type=color]');
          await reachableControls(page, 'header button:not([hidden]), #wb-save-sync-row button');
          await writingSpace(page, label + ' after scrolling controls', minimum);

          await page.locator('#btn-toolbar-toggle').click();
          await settle(page);
          const collapsed = await writingSpace(page, label + ' collapsed', minimum);
          assert(collapsed >= first, label + ': collapse recovers writing space');
          await page.locator('#btn-toolbar-toggle').click();
          await settle(page);
          await writingSpace(page, label + ' reopened', minimum);

          // Emulate keyboard appearance and an orientation change without reloading.
          await page.setViewportSize({ width: 390, height: 400 });
          await settle(page);
          await writingSpace(page, label + ' keyboard resize', 100);
          await page.setViewportSize({ width: 844, height: 390 });
          await settle(page);
          await writingSpace(page, label + ' landscape resize', 100);
          assert.deepEqual(errors, [], label + ': page errors');
          console.log(`PASS ${label}: first-load editor ${first}px; all controls reachable; collapse/reopen and resize`);
        } finally { await context.close(); }
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

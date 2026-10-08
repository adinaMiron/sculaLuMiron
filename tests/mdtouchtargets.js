// Actual mobile hitboxes, including their edges, with offline bundled Chromium.
// Run: node tests/mdtouchtargets.js
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

async function target(page, control, label, tap = true) {
  await control.scrollIntoViewIfNeeded();
  const box = await control.evaluate(e => {
    const r = e.getBoundingClientRect();
    // Stay inside the controls' rounded corners while testing near each edge.
    const points = [[r.left + 4, r.top + 4], [r.right - 4, r.top + 4],
      [r.left + 4, r.bottom - 4], [r.right - 4, r.bottom - 4]];
    return { width: r.width, height: r.height, points, disabled: e.disabled,
      hits: points.map(([x, y]) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 150)),
      edgesReachable: points.every(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return hit === e || e.contains(hit);
      }) };
  });
  assert(box.width >= 44 && box.height >= 44, label + ': undersized ' + JSON.stringify(box));
  assert(box.edgesReachable, label + ': clipped or overlapping hitbox ' + JSON.stringify(box));
  if (tap && !box.disabled) {
    // Observe real touch activation without invoking file pickers, microphone,
    // sync or native select/color popups during the geometry inventory.
    await control.evaluate(e => {
      window.__touchTarget = false;
      e.addEventListener('click', event => {
        window.__touchTarget = true;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, { capture: true, once: true });
    });
    await page.touchscreen.tap(...box.points[3]);
    assert(await page.evaluate(() => window.__touchTarget), label + ': edge tap missed');
  }
  return box;
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const lang of ['ro', 'en']) {
      for (const [width, height] of [[320, 640], [390, 844], [844, 390],
        [390, 400], [320, 360], [1024, 768]]) {
        const context = await browser.newContext({ viewport: { width, height },
          isMobile: true, hasTouch: true });
        try {
          await context.route(/^https?:/, route => route.abort());
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
          await page.waitForFunction(() => wbDraftReady);
          await page.evaluate(lang => window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: lang })), lang);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(250);
          const label = `${lang} ${width}x${height}`;
          assert.equal(await page.locator('html').getAttribute('lang'), lang);
          await page.evaluate(() => {
            // Exercise conditional controls too, without external services.
            document.getElementById('btn-map').hidden = false;
            document.getElementById('btn-garden').hidden = false;
            document.getElementById('responsible-select').hidden = false;
          });
          const controls = page.locator('header button, #wb-save-sync-row button, ' +
            '.toolbar button, .toolbar select, .toolbar input[type=color]');
          assert(await controls.count() >= 40, label + ': control inventory');
          for (let i = 0; i < await controls.count(); i++) {
            const control = controls.nth(i);
            const name = await control.evaluate(e => e.id || e.getAttribute('data-i') || e.title);
            await target(page, control, label + ' ' + name);
          }
          assert(await page.locator('header .btn').first().evaluate(e =>
            parseFloat(getComputedStyle(e).fontSize) >= 11), label + ': readable button text');

          for (const id of ['wb-panel', 'img-panel', 'nav-panel', 'find-panel']) {
            await page.evaluate(id => {
              if (document.getElementById(id).classList.contains('collapsed')) togglePanelById(id);
            }, id);
            await page.waitForTimeout(250);
            const close = page.locator(`#${id} .panel-close`);
            const box = await target(page, close, label + ' ' + id + ' close', false);
            await page.touchscreen.tap(...box.points[3]);
            assert(await page.locator('#' + id).evaluate(e => e.classList.contains('collapsed')),
              label + ': edge tap closes ' + id);
          }
          await page.evaluate(() => openLinkModal());
          const cancel = page.locator('#link-modal [data-i="cancelBtn"]');
          const box = await target(page, cancel, label + ' modal cancel', false);
          await page.touchscreen.tap(...box.points[3]);
          assert.equal(await page.locator('#link-modal').evaluate(e => e.classList.contains('open')), false);
          assert.deepEqual(errors, [], label + ': page errors');
          console.log('PASS ' + label + ': 44px targets, unobstructed edges, touch activation and close actions');
        } finally { await context.close(); }
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

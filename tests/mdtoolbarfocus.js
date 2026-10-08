// Run: node tests/mdtoolbarfocus.js (bundled headless Chromium, offline).
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

async function accessibilityNode(cdp, selector) {
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId });
  return nodes[0];
}

async function collapsedNavigation(page, cdp, label) {
  const toggle = page.locator('#btn-toolbar-toggle');
  await toggle.focus();
  await page.keyboard.press('Tab');
  assert(await page.evaluate(() => document.activeElement !== document.body &&
    document.activeElement.id !== 'btn-toolbar-toggle' &&
    !document.getElementById('toolbar-groups').contains(document.activeElement)),
    label + ': forward Tab skips all collapsed controls');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-toolbar-toggle',
    label + ': reverse Tab skips all collapsed controls');
  const controls = page.locator('#toolbar-groups button:not(:disabled), #toolbar-groups select, #toolbar-groups input');
  assert(await controls.count() >= 29, label + ': hidden control inventory');
  for (let i = 0; i < await controls.count(); i++) {
    await controls.nth(i).evaluate(e => e.focus());
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-toolbar-toggle',
      label + ': collapsed descendant cannot take focus');
  }
  assert((await accessibilityNode(cdp, '#heading-select')).ignored,
    label + ': collapsed control is absent from accessibility navigation');
  const axToggle = await accessibilityNode(cdp, '#btn-toolbar-toggle');
  assert.equal(axToggle.properties.find(p => p.name === 'expanded')?.value.value, false,
    label + ': toggle announces collapsed state');
  assert.equal(await toggle.getAttribute('aria-controls'), 'toolbar-groups');
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const lang of ['ro', 'en']) {
      for (const [width, height] of [[320, 640], [390, 844], [844, 390], [1024, 768]]) {
        const context = await browser.newContext({ viewport: { width, height } });
        try {
          await context.route(/^https?:/, route => route.abort());
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
          await page.waitForFunction(() => wbDraftReady);
          await page.evaluate(lang => window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: lang })), lang);
          const cdp = await context.newCDPSession(page);
          const toggle = page.locator('#btn-toolbar-toggle');
          const label = `${lang} ${width}x${height}`;

          await toggle.focus();
          await page.keyboard.press('Enter');
          // Check immediately, while the collapse animation is still running.
          await collapsedNavigation(page, cdp, label);
          await page.waitForTimeout(250);
          await collapsedNavigation(page, cdp, label + ' after animation');

          await page.keyboard.press('Space');
          assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
          assert.equal((await accessibilityNode(cdp, '#heading-select')).ignored, false);
          await page.keyboard.press('Tab');
          assert.equal(await page.evaluate(() => document.activeElement.id), 'heading-select',
            label + ': expanded controls return to forward Tab navigation');
          await page.keyboard.press('Shift+Tab');
          assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-toolbar-toggle',
            label + ': expanded controls return to reverse Tab navigation');

          await page.locator('#heading-select').focus();
          await page.evaluate(() => toggleToolbarCollapse());
          assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-toolbar-toggle',
            label + ': collapse recovers focus from a descendant');
          await page.waitForFunction(async () => await store.get(TB_COLLAPSED_KEY) === '1');
          await page.reload();
          await page.waitForFunction(() => wbDraftReady && document.querySelector('.toolbar').classList.contains('collapsed'));
          await collapsedNavigation(page, cdp, label + ' saved preference');

          // Desktop displays the groups regardless of the mobile preference.
          await page.setViewportSize({ width: 1366, height: 900 });
          await page.waitForFunction(() => !document.getElementById('toolbar-groups').inert);
          await page.locator('#heading-select').focus();
          assert.equal(await page.evaluate(() => document.activeElement.id), 'heading-select',
            label + ': desktop controls remain focusable');
          assert.equal((await accessibilityNode(cdp, '#heading-select')).ignored, false);
          await page.setViewportSize({ width, height });
          await page.waitForFunction(() => document.getElementById('toolbar-groups').inert);
          assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-toolbar-toggle',
            label + ': resize recovers focus before hiding controls');
          await collapsedNavigation(page, cdp, label + ' resized back');
          await toggle.press('Enter');
          await page.waitForFunction(async () => await store.get(TB_COLLAPSED_KEY) === '0');
          await page.reload();
          await page.waitForFunction(() => wbDraftReady && document.getElementById('btn-toolbar-toggle').getAttribute('aria-expanded') === 'true');
          await page.locator('#heading-select').focus();
          assert.equal(await page.evaluate(() => document.activeElement.id), 'heading-select',
            label + ': saved expanded preference restores controls');
          assert.deepEqual(errors, [], label + ': page errors');
          console.log('PASS ' + label + ': collapsed navigation, accessibility, focus recovery, reload and resize');
        } finally { await context.close(); }
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

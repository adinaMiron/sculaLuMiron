// Run: node tests/mddialogfocus.js (bundled headless Chromium, offline).
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const dialogs = [
  ['image', 'openImageModal', 'closeImageModal', 'img-url'],
  ['workbook', 'saveToWorkbook', 'closeWorkbookModal', 'wb-new-name'],
  ['idea', 'openIdeaModal', 'closeIdeaModal', 'idea-text'],
  ['link', 'openLinkModal', 'closeLinkModal', 'link-url'],
  ['table', 'openTableModal', 'closeTableModal', 'tbl-rows'],
  ['help', 'openHelpModal', 'closeHelpModal', null],
  ['wiki', 'openWikiModal', 'closeWikiModal', 'wiki-filter']
];

async function contained(page, id) {
  assert(await page.locator('#' + id).evaluate(el => el.contains(document.activeElement)),
    'focus stays inside ' + id);
}

async function cycle(page, id) {
  const stops = await page.evaluate(id => dialogTabStops(document.getElementById(id)).length, id);
  assert(stops > 0);
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < stops + 2; i++) {
      await page.keyboard.press(key);
      await contained(page, id);
    }
  }
  await page.evaluate(id => dialogTabStops(document.getElementById(id))[0].focus(), id);
  await page.keyboard.press('Shift+Tab');
  assert(await page.evaluate(id => document.activeElement === dialogTabStops(document.getElementById(id)).at(-1), id));
  await page.keyboard.press('Tab');
  assert(await page.evaluate(id => document.activeElement === dialogTabStops(document.getElementById(id))[0], id));
}

(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    const ax = await context.newCDPSession(page);
    const accessibleDialogs = async () => {
      const { nodes } = await ax.send('Accessibility.getFullAXTree');
      assert(!nodes.some(node => !node.ignored && node.role?.value === 'textbox' && node.value?.value === '# Keep this draft'),
        'the background editor is absent from the browser accessibility tree');
      return nodes.filter(node => !node.ignored && node.role?.value === 'dialog').map(node => node.name?.value);
    };
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    await page.waitForFunction(() => wbDraftReady && wbBooted);
    await page.evaluate(() => {
      editor.value = '# Keep this draft';
      editor.setSelectionRange(2, 6);
      // Existing inert state must survive every open/close cycle.
      document.getElementById('file-input').inert = true;
    });

    for (const lang of ['ro', 'en']) {
      await page.evaluate(lang => window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: lang })), lang);
      for (const [name, open, close, initial] of dialogs) {
        const id = name + '-modal';
        const modal = page.locator('#' + id);
        const invoker = page.locator(`button[onclick="${open}()"]`);
        await invoker.click();
        await contained(page, id);
        if (initial) assert.equal(await page.evaluate(() => document.activeElement.id), initial);
        assert.equal(await modal.getAttribute('role'), 'dialog');
        assert.equal(await modal.getAttribute('aria-modal'), 'true');
        const title = await page.locator('#' + await modal.getAttribute('aria-labelledby')).textContent();
        assert(title.trim());
        assert.equal(await page.getByRole('dialog', { name: title, exact: true }).count(), 1);
        assert.deepEqual(await accessibleDialogs(), [title], 'only the active dialog is exposed to screen readers');
        assert.equal(await page.locator('#editor').evaluate(el => !!el.closest('[inert]')), true);
        await page.locator('#editor').focus();
        await contained(page, id);
        await cycle(page, id);
        // Escape and the Cancel/Close button both restore the real invoker.
        await page.keyboard.press('Escape');
        assert.equal(await modal.isVisible(), false);
        assert(await invoker.evaluate(el => document.activeElement === el));
        await invoker.click();
        await modal.locator(`button[onclick="${close}()"]`).click();
        assert(await invoker.evaluate(el => document.activeElement === el));
        assert.equal(await page.locator('#editor').evaluate(el => !!el.closest('[inert]')), false);
        assert.equal(await page.locator('#file-input').evaluate(el => el.inert), true);
        console.log(`PASS ${lang} ${id}: accessible name, focus cycle, background isolation and return focus`);
      }
    }

    // Reverse DOM order: image must visibly cover link when opened second.
    await page.locator('button[onclick="openLinkModal()"] ').click();
    await page.locator('#link-title').focus();
    await page.evaluate(() => openImageModal());
    assert.equal(await page.locator('#link-modal').evaluate(el => el.inert), true);
    assert.equal(await page.evaluate(() => {
      const box = document.querySelector('#image-modal .modal-box').getBoundingClientRect();
      return document.elementFromPoint(box.x + 5, box.y + 5).closest('[role="dialog"]').id;
    }), 'image-modal');
    await cycle(page, 'image-modal');
    await page.keyboard.press('Escape');
    assert(await page.locator('#link-modal').isVisible(), 'Escape dismisses only the top dialog');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'link-title');
    assert.deepEqual(await accessibleDialogs(), [await page.locator('#link-dialog-title').textContent()]);
    await page.keyboard.press('Escape');
    assert(await page.locator('button[onclick="openLinkModal()"] ').evaluate(el => document.activeElement === el));
    console.log('PASS stacked ordinary dialogs: visual order, accessibility, one-layer Escape and focus restoration');

    // Existing higher overlays retain their Escape handler and can be used.
    for (const [open, id] of [
      ['openGraph', 'graph-view'], ['openGarden', 'garden-view'], ['openMedia', 'media-view'],
      ['openDiagram', 'diagram-modal'], ['openSketch', 'sketch-modal']
    ]) {
      await page.locator('#btn-help').click();
      await page.evaluate(name => window[name](), open);
      await page.waitForFunction(id => !document.getElementById(id).inert, id);
      await contained(page, id);
      const layer = page.locator('#' + id);
      const labelId = await layer.getAttribute('aria-labelledby');
      const title = labelId ? await page.locator('#' + labelId).textContent() : await layer.getAttribute('aria-label');
      assert.deepEqual(await accessibleDialogs(), [title]);
      await page.keyboard.press('Escape');
      await contained(page, 'help-modal');
      await page.keyboard.press('Escape');
      assert(await page.locator('#btn-help').evaluate(el => document.activeElement === el));
    }
    console.log('PASS higher fullscreen overlays: focus ownership, Escape and underlying dialog recovery');

    await page.locator('button[onclick="openImageModal()"] ').click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('#image-modal .btn-pick').click()
    ]);
    await chooser.setFiles([]);
    await page.keyboard.press('Escape');
    console.log('PASS image dialog can still open its local file chooser');

    await page.locator('#btn-help').click();
    await page.locator('#help-modal button').evaluate(el => { el.disabled = true; });
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'help-modal');
    await page.keyboard.press('Shift+Tab');
    await contained(page, 'help-modal');
    await page.locator('#help-modal button').evaluate(el => { el.disabled = false; });
    await page.keyboard.press('Escape');
    console.log('PASS focus falls back to the dialog when no controls can receive Tab');

    await page.setViewportSize({ width: 390, height: 844 });
    for (const [name, open] of dialogs) {
      await page.locator('#editor').focus();
      await page.evaluate(name => window[name](), open);
      await cycle(page, name + '-modal');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'editor');
    }
    console.log('PASS mobile Tab/Shift+Tab containment and keyboard invocation return focus');

    // Immediate close must not schedule a late focus steal (idea/wiki/workbook).
    for (const [, open, close] of dialogs) {
      await page.locator('#editor').focus();
      await page.evaluate(([open, close]) => {
        window[open](); window[close]();
      }, [open, close]);
      await page.waitForTimeout(80);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'editor');
    }
    assert.equal(await page.inputValue('#editor'), '# Keep this draft');
    assert.deepEqual(await page.locator('#editor').evaluate(el => [el.selectionStart, el.selectionEnd]), [2, 6]);
    assert.deepEqual(errors, []);
    console.log('PASS immediate cancellation preserves focus, draft and selection; no page errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

// Run: node tests/mdmodalshortcuts.js (bundled headless Chromium, offline).
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const original = 'first\nORIGINAL a\nthird';
const chords = [
  'b', 'i', 'k', 'Shift+K', 's', 'Alt+KeyS',
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => 'Shift+Digit' + n),
  ...[0, 1, 2, 3].map(n => 'Alt+Digit' + n),
  'Enter', 'Shift+Enter', 'z', 'Shift+Z', 'y',
  'Shift+Period', 'Shift+Comma', 'Shift+Slash', 'Shift+KeyH'
];

async function reset(page) {
  await page.evaluate(md => {
    Object.values(ordinaryDialogClosers).forEach(name => window[name]());
    editor.value = md;
    editor.focus();
    editor.setSelectionRange(6, 16);
    undoReset(); updatePreview(); updateStatus();
  }, original);
}

async function isolated(page, target, label, localEnter = false) {
  await target.focus();
  const before = await page.evaluate(() => {
    window.shortcutTestField = document.activeElement;
    return {
      source: editor.value,
      selection: [editor.selectionStart, editor.selectionEnd],
      modals: [...document.querySelectorAll('.image-modal.open')].map(el => el.id),
      chapters: JSON.stringify(wbChapters),
      pending: [...wbPendingIds]
    };
  });
  for (const chord of [
    ...['Control', 'Meta'].flatMap(modifier => chords
      .filter(key => !localEnter || (key !== 'Enter' && key !== 'Shift+Enter'))
      .map(key => modifier + '+' + key)),
    'Alt+ArrowUp', 'Alt+ArrowDown'
  ]) {
    await page.keyboard.press(chord);
    const after = await page.evaluate(() => ({
      source: editor.value,
      selection: [editor.selectionStart, editor.selectionEnd],
      modals: [...document.querySelectorAll('.image-modal.open')].map(el => el.id),
      chapters: JSON.stringify(wbChapters),
      pending: [...wbPendingIds],
      sameFocus: document.activeElement === window.shortcutTestField
    }));
    assert(after.sameFocus, `${label}: ${chord} keeps dialog/field focus`);
    delete after.sameFocus;
    assert.deepEqual(after, before, `${label}: ${chord} leaves the document and workbook alone`);
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    await page.waitForFunction(() => wbDraftReady && wbBooted);

    for (const [id, open] of [
      ['link-modal', 'openLinkModal'], ['image-modal', 'openImageModal'],
      ['table-modal', 'openTableModal'], ['workbook-modal', 'openWorkbookModal'],
      ['wiki-modal', 'openWikiModal'], ['help-modal', 'openHelpModal'],
      ['idea-modal', 'openIdeaModal']
    ]) {
      await reset(page);
      await page.evaluate(name => window[name](), open);
      const fields = page.locator(`#${id} input:visible, #${id} textarea:visible, #${id} select:visible`);
      for (let i = 0; i < await fields.count(); i++) {
        // Idea Ctrl+Enter intentionally files an idea; its local handler is
        // covered by tests/idea.js. Keep this matrix focused on isolation.
        await isolated(page, fields.nth(i), `${id} field ${i}`, id === 'idea-modal');
      }
      await isolated(page, page.locator(`#${id} button:visible`).first(), `${id} button`);
      // Attempted background focus stays in the dialog and protects the source.
      await isolated(page, page.locator('#editor'), `${id} background editor`);
      assert(await page.locator('#' + id).evaluate(el => el.contains(document.activeElement)));
      console.log(`PASS ${id}: all fields, buttons and attempted background focus isolated`);
    }

    await reset(page);
    await page.evaluate(() => openLinkModal());
    await page.locator('#link-url').fill('');
    await page.keyboard.type('draft');
    await page.keyboard.press('Control+z');
    assert.equal(await page.inputValue('#link-url'), '', 'dialog input retains native undo');
    assert.equal(await page.inputValue('#editor'), original);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#link-modal').evaluate(el => el.classList.contains('open')), false);
    await page.evaluate(() => openLinkModal());
    await page.locator('#link-modal button').first().focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#link-modal').evaluate(el => el.classList.contains('open')), false,
      'native Enter still activates the dialog Cancel button');
    console.log('PASS dialog native undo, Escape and button activation');

    // A separate editable field also owns its keys when no modal is open.
    await reset(page);
    await page.evaluate(() => toggleFind());
    await isolated(page, page.locator('#find-q'), 'search field', true);

    for (const modifier of ['Control', 'Meta']) {
      for (const [chord, expected] of [
        ['b', 'first\n**ORIGINAL a**\nthird'],
        ['i', 'first\n*ORIGINAL a*\nthird'],
        ['Shift+Digit2', 'first\n## ORIGINAL a\nthird'],
        ['Alt+Digit3', 'first\n!vital ORIGINAL a\nthird']
      ]) {
        await reset(page);
        await page.keyboard.press(modifier + '+' + chord);
        assert.equal(await page.inputValue('#editor'), expected, `${modifier}+${chord} works in editor`);
      }
      await reset(page);
      await page.keyboard.press(modifier + '+k');
      assert(await page.locator('#link-modal').evaluate(el => el.classList.contains('open')));
      await reset(page);
      await page.keyboard.press(modifier + '+s');
      assert(await page.locator('#workbook-modal').evaluate(el => el.classList.contains('open')));
    }
    await reset(page);
    await page.keyboard.press('Alt+ArrowDown');
    assert.equal(await page.inputValue('#editor'), 'first\nthird\nORIGINAL a');
    await page.keyboard.press('Alt+ArrowUp');
    assert.equal(await page.inputValue('#editor'), original);
    assert.deepEqual(errors, [], 'no page errors');
    console.log('PASS editor formatting, heading, importance, link, save and line movement');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

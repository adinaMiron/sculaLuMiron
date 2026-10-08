// Run: node tests/wbmodalescape.js (bundled headless Chromium, offline).
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

async function draftState(page) {
  return page.evaluate(async () => ({
    text: editor.value,
    selection: [editor.selectionStart, editor.selectionEnd],
    current: wbCurrentId,
    dirty: wbDirty,
    draft: wbDraftRead(),
    books: await wbAll(WB_BOOKS),
    chapters: await wbAll(WB_CHAPTERS),
    pending: await wbAll(WB_PENDING)
  }));
}

(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    const errors = [];
    const alerts = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => {
      alerts.push(dialog.message());
      await dialog.accept();
    });
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    await page.waitForFunction(() => wbDraftReady && wbBooted);
    await page.waitForTimeout(1500); // let startup's restoration check settle
    await page.evaluate(async () => {
      const book = { id: 'escape-book', name: 'Existing', folder: 'Existing', order: 0 };
      const chapter = { id: 'escape-chapter', workbookId: book.id, title: 'Existing chapter',
        file: 'existing.md', content: 'SAVED', created: 1, updated: 1, order: 0 };
      wbBooks = [book];
      wbChapters = [chapter];
      await wbPut(WB_BOOKS, book);
      await wbPut(WB_CHAPTERS, chapter);
      editor.value = '# Loose draft\nKeep this text';
      editor.setSelectionRange(2, 13);
      wbFileLabel('loose.md');
      wbDraftWrite();
    });
    const before = await draftState(page);
    const save = page.locator('button[onclick="saveToWorkbook()"]');
    const modal = page.locator('#workbook-modal');
    const isOpen = () => modal.evaluate(el => el.classList.contains('open'));
    const open = async () => {
      await save.click();
      await page.waitForFunction(() => document.activeElement.id === 'wb-chapter-title');
    };
    const dismiss = async (invoker = save) => {
      await page.keyboard.press('Escape');
      assert.equal(await isOpen(), false, 'Escape dismisses the workbook dialog');
      assert(await invoker.evaluate(el => document.activeElement === el), 'focus returns to the invoker');
      // Opening schedules initial focus; cancellation must prevent a late focus steal.
      await page.waitForTimeout(80);
      assert(await invoker.evaluate(el => document.activeElement === el), 'focus stays with the invoker');
      assert.deepEqual(await draftState(page), before, 'cancellation preserves the loose draft and storage');
    };

    for (const field of ['wb-select', 'wb-new-name', 'wb-chapter-select', 'wb-chapter-title']) {
      await open();
      if (field === 'wb-new-name') await page.selectOption('#wb-select', '__new__');
      await page.locator('#' + field).focus();
      await dismiss();
      console.log('PASS Escape from ' + field);
    }

    for (const validation of ['needWorkbookName', 'needChapterTitle']) {
      await open();
      if (validation === 'needWorkbookName') await page.selectOption('#wb-select', '__new__');
      else await page.locator('#wb-chapter-title').fill('');
      await modal.locator('button').last().click();
      assert.equal(alerts.at(-1), await page.evaluate(key => t(key), validation));
      assert.equal(await isOpen(), true, 'validation leaves the dialog open');
      await page.locator(validation === 'needWorkbookName' ? '#wb-new-name' : '#wb-chapter-title').focus();
      await dismiss();
      console.log('PASS Escape after ' + validation);
    }

    // Keyboard invocation returns to the editor without losing its selection.
    await page.locator('#editor').focus();
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => document.activeElement.id === 'wb-chapter-title');
    await dismiss(page.locator('#editor'));
    console.log('PASS keyboard invocation restores editor focus and selection');

    // Escape can arrive before the delayed initial focus has run.
    await save.focus();
    await page.evaluate(() => {
      openWorkbookModal();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    assert.equal(await isOpen(), false);
    await page.waitForTimeout(80);
    assert(await save.evaluate(el => document.activeElement === el));
    assert.deepEqual(await draftState(page), before);
    console.log('PASS immediate Escape cancels delayed dialog focus');
    assert.deepEqual(errors, [], 'no page errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

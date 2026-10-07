// Programmatic Markdown edits must autosave without a later typed character.
// Run: PW_CHROME_PATH=/usr/bin/google-chrome-stable node tests/mdautosave.js
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROME_PATH
    ? { executablePath: process.env.PW_CHROME_PATH } : {});
  try {
    const context = await browser.newContext();
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    await page.waitForFunction(() => wbBooted);
    await page.evaluate(async () => {
      const book = { id: 'autosave-book', name: 'Autosave', folder: 'Autosave', order: 0 };
      wbBooks = [book];
      wbChapters = ['a', 'b'].map((id, order) => ({
        id, workbookId: book.id, title: id, file: id + '.md',
        content: 'ORIGINAL ' + id, created: 1, updated: 1, order
      }));
      await wbPut(WB_BOOKS, book);
      for (const chapter of wbChapters) await wbPut(WB_CHAPTERS, chapter);
      loadChapterIntoEditor(wbChapter('a'));
    });

    for (const action of ['bold', 'color', 'heading', 'link', 'image', 'table', 'code', 'tab']) {
      // Each preceding reload starts a new one-time restoration check.
      // Let it settle before every action so it cannot save our edits for us.
      await page.waitForTimeout(1500);
      await page.evaluate(async () => {
        await wbPendingClear('a');
        const chapter = wbChapter('a');
        chapter.content = 'ORIGINAL a';
        await wbPut(WB_CHAPTERS, chapter);
        loadChapterIntoEditor(chapter);
        editor.focus();
        editor.setSelectionRange(0, editor.value.length);
      });
      if (action === 'bold') {
        await page.click('.tb-btn[data-i-title="boldTip"]');
      } else if (action === 'tab') {
        await page.keyboard.press('Tab');
      } else {
        await page.evaluate(action => {
          if (action === 'color') applyTextColor('#123456');
          if (action === 'heading') insertHeading('2');
          if (action === 'code') insertCodeBlock();
          if (action === 'link') {
            openLinkModal();
            document.getElementById('link-url').value = '#target';
            insertLink();
          }
          if (action === 'image') {
            openImageModal();
            document.getElementById('img-url').value = 'image.png';
            insertImage();
          }
          if (action === 'table') { openTableModal(); insertTable(); }
        }, action);
      }
      const edited = await page.evaluate(() => ({
        text: editor.value, dirty: wbDirty
      }));
      assert.notEqual(edited.text, 'ORIGINAL a', action + ' changed text');
      assert.equal(edited.dirty, true, action + ' schedules autosave');
      // updateStatus schedules the recovery journal with a 700 ms debounce.
      await page.waitForFunction(expected => {
        const draft = wbDraftRead();
        return draft && draft.id === 'a' && draft.text === expected;
      }, edited.text);
      await page.waitForFunction(async expected => {
        const stored = (await wbAll(WB_CHAPTERS)).find(c => c.id === 'a');
        return stored.content === expected && wbPendingIds.has('a') && !wbDirty;
      }, edited.text);
      await page.evaluate(async () => { await openChapter('b'); await openChapter('a'); });
      assert.equal(await page.locator('#editor').inputValue(), edited.text,
        action + ' survives chapter switching');
      await page.reload();
      await page.waitForFunction(() => wbBooted && wbCurrentId === 'a');
      assert.equal(await page.locator('#editor').inputValue(), edited.text,
        action + ' survives reload');
      console.log('PASS ' + action + ' journals, autosaves, survives switching and reload');
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

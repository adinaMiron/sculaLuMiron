// Chapter-row export must include visible edits even before a successful save.
// Run: node tests/wbexport.js (bundled headless Chromium, no network).
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    await page.waitForFunction(() => wbDraftReady);
    await page.waitForTimeout(1500); // settle the one-time restoration check
    await page.evaluate(async () => {
      const book = { id: 'export-book', name: 'Export', folder: 'Export', order: 0 };
      wbBooks = [book];
      wbChapters = ['a', 'b'].map((id, order) => ({
        id, workbookId: book.id, title: id, file: id + '.md',
        content: 'ORIGINAL ' + id, created: 1, updated: 1, order
      }));
      await wbPut(WB_BOOKS, book);
      for (const chapter of wbChapters) await wbPut(WB_CHAPTERS, chapter);
      wbOpenBooks.add(book.id);
      loadChapterIntoEditor(wbChapter('a'));
      window.exportOriginalTx = wbTx;
      window.chapterExports = [];
      ScuLaFolder.save = (name, blob) => {
        chapterExports.push({ name, blob });
        return Promise.resolve();
      };
      window.exportTestClick = id => {
        const row = document.querySelector('.wb-ch-name[data-wb-id="' + id + '"]').closest('.wb-ch-row');
        [...row.querySelectorAll('button')].find(button => button.textContent === '⇪').click();
      };
    });

    for (const edit of ['typing', 'formatting', 'empty']) {
      const result = await page.evaluate(async edit => {
        editor.value = 'LATEST EDIT';
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        if (edit === 'formatting') {
          editor.setSelectionRange(0, editor.value.length);
          document.querySelector('.tb-btn[data-i-title="boldTip"]').click();
        } else if (edit === 'empty') {
          editor.value = '';
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
        exportTestClick('a'); // same turn: no chance for the autosave debounce
        clearTimeout(wbSaveTimer);
        const output = chapterExports.at(-1);
        return { name: output.name, text: await output.blob.text(), visible: editor.value,
          stored: wbChapter('a').content, dirty: wbDirty, type: output.blob.type };
      }, edit);
      assert.equal(result.visible, edit === 'formatting' ? '**LATEST EDIT**' : edit === 'empty' ? '' : 'LATEST EDIT');
      assert.equal(result.text, result.visible);
      assert.equal(result.name, 'Export-a.md');
      assert.equal(result.type, 'text/markdown');
      assert.equal(result.stored, 'ORIGINAL a');
      assert.equal(result.dirty, true, 'export leaves unsaved edits dirty');
      console.log('PASS immediate ' + edit + ' export uses the visible editor snapshot');
    }

    await page.evaluate(() => {
      wbTx = async (store, mode, run) => {
        if (store === WB_CHAPTERS && mode === 'readwrite') {
          window.exportWriteStarted = true;
          await new Promise(resolve => { window.releaseExportWrite = resolve; });
        }
        return exportOriginalTx(store, mode, run);
      };
      editor.value = 'EARLIER SNAPSHOT';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      window.exportHeldFlush = flushChapter();
    });
    await page.waitForFunction(() => window.exportWriteStarted);
    const delayed = await page.evaluate(async () => {
      editor.value = 'LATEST DURING SAVE';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      exportTestClick('a');
      exportTestClick('b');
      clearTimeout(wbSaveTimer);
      const outputs = chapterExports.slice(-2);
      return { texts: await Promise.all(outputs.map(output => output.blob.text())),
        names: outputs.map(output => output.name), dirty: wbDirty, current: wbCurrentId };
    });
    assert.deepEqual(delayed, { texts: ['LATEST DURING SAVE', 'ORIGINAL b'],
      names: ['Export-a.md', 'Export-b.md'], dirty: true, current: 'a' });
    await page.evaluate(async () => {
      wbTx = exportOriginalTx;
      releaseExportWrite();
      await exportHeldFlush;
    });
    console.log('PASS delayed persistence exports current edits and keeps inactive content separate');

    const failed = await page.evaluate(async () => {
      wbTx = (store, mode, run) => store === WB_CHAPTERS && mode === 'readwrite'
        ? Promise.reject(new DOMException('Injected quota failure', 'QuotaExceededError'))
        : exportOriginalTx(store, mode, run);
      editor.value = 'LATEST AFTER FAILED SAVE';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      const saved = await flushChapter();
      exportTestClick('a');
      return { saved, text: await chapterExports.at(-1).blob.text(), dirty: wbDirty,
        stored: wbChapter('a').content, errorShown: document.getElementById('stat-wb').textContent === t('wbStoreFailed') };
    });
    assert.deepEqual(failed, { saved: false, text: 'LATEST AFTER FAILED SAVE', dirty: true,
      stored: 'EARLIER SNAPSHOT', errorShown: true });
    console.log('PASS failed persistence still exports the visible edits and preserves the save warning');

    const loose = await page.evaluate(async () => {
      wbTx = exportOriginalTx;
      detachChapter();
      editor.value = 'UNATTACHED TEXT';
      exportTestClick('a');
      return await chapterExports.at(-1).blob.text();
    });
    assert.equal(loose, 'EARLIER SNAPSHOT', 'loose editor text must not replace chapter content');
    assert.deepEqual(errors, []);
    console.log('PASS chapter export ignores unrelated loose editor text');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

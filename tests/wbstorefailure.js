// Failed chapter writes must retain edits, block switching and recover on reload.
// Run: PW_CHROME_PATH=/usr/bin/google-chrome-stable node tests/wbstorefailure.js
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
    page.on('dialog', dialog => dialog.accept());
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    await page.waitForFunction(() => wbDraftReady);
    await page.waitForTimeout(1500); // let the one-time restoration check settle
    await page.evaluate(async () => {
      const book = { id: 'failure-book', name: 'Failure', folder: 'Failure', order: 0 };
      wbBooks = [book];
      wbChapters = ['a', 'b'].map((id, order) => ({
        id, workbookId: book.id, title: id, file: id + '.md',
        content: 'ORIGINAL ' + id, created: 1, updated: 1, order
      }));
      await wbPut(WB_BOOKS, book);
      for (const chapter of wbChapters) await wbPut(WB_CHAPTERS, chapter);
      loadChapterIntoEditor(wbChapter('a'));
    });

    for (const failure of ['quota', 'abort']) {
      for (const save of ['autosave', 'explicit']) {
        const text = failure + ' ' + save + ' UNSAVED';
        const result = await page.evaluate(async ({ failure, save, text }) => {
          await openChapter('a');
          const before = (await wbAll(WB_CHAPTERS)).find(ch => ch.id === 'a');
          const originalTx = wbTx;
          wbTx = async (store, mode, run) => {
            if (store !== WB_CHAPTERS || mode !== 'readwrite') return originalTx(store, mode, run);
            if (failure === 'quota') throw new DOMException('Injected quota failure', 'QuotaExceededError');
            // Exercise a real aborted IndexedDB write, not a failed request alone.
            const db = await wbDb();
            try {
              return await new Promise((resolve, reject) => {
                const tx = db.transaction(store, 'readwrite');
                tx.onabort = () => reject(tx.error || new DOMException('Injected abort', 'AbortError'));
                run(tx.objectStore(store));
                tx.abort();
              });
            } finally { db.close(); }
          };
          editor.value = text;
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          if (save === 'explicit') await saveToWorkbook();
          else await new Promise(resolve => setTimeout(resolve, 1100));
          await openChapter('b');
          const after = (await wbAll(WB_CHAPTERS)).find(ch => ch.id === 'a');
          return {
            current: wbCurrentId, dirty: wbDirty, text: editor.value,
            draft: wbDraftRead(), stored: after.content, previous: before.content,
            memory: wbChapter('a').content,
            errorShown: document.getElementById('stat-wb').textContent === t('wbStoreFailed')
          };
        }, { failure, save, text });
        assert.equal(result.current, 'a', 'failed write blocks switching');
        assert.equal(result.dirty, true, 'failed write remains retryable');
        assert.equal(result.text, text);
        assert.equal(result.draft.id, 'a');
        assert.equal(result.draft.text, text);
        assert.equal(result.stored, result.previous);
        assert.equal(result.memory, result.previous, 'memory reflects confirmed persistence');
        assert.equal(result.errorShown, true);
        // Reload removes the injected failure; the unchanged journal must restore A.
        await page.reload();
        await page.waitForFunction(expected =>
          wbDraftReady && wbCurrentId === 'a' && editor.value === expected && !wbDirty, text);
        assert.equal(await page.evaluate(async () =>
          (await wbAll(WB_CHAPTERS)).find(ch => ch.id === 'a').content), text);
        await page.evaluate(async () => { await openChapter('b'); await openChapter('a'); });
        assert.equal(await page.locator('#editor').inputValue(), text);
        console.log('PASS ' + failure + ' during ' + save + ' blocks switch and recovers on reload');
      }
    }

    // Retry without another keystroke. Saving all must not clear failed edits.
    await page.evaluate(async () => {
      window.failureOriginalTx = wbTx;
      wbTx = (store, mode, run) => store === WB_CHAPTERS && mode === 'readwrite'
        ? Promise.reject(new DOMException('Injected quota failure', 'QuotaExceededError'))
        : window.failureOriginalTx(store, mode, run);
      editor.value = 'RETRY WITHOUT TYPING';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      await saveAllModifiedChapters();
    });
    assert.equal(await page.evaluate(() => wbDirty), true);
    const retry = await page.evaluate(async () => {
      wbTx = window.failureOriginalTx;
      await saveToWorkbook();
      return { dirty: wbDirty, pending: wbPendingIds.has('a'),
        text: (await wbAll(WB_CHAPTERS)).find(ch => ch.id === 'a').content };
    });
    assert.deepEqual(retry, { dirty: false, pending: false, text: 'RETRY WITHOUT TYPING' });
    console.log('PASS successful retry saves unchanged failed text and clears dirty state');

    // Hold a write, then type again: the earlier snapshot cannot clear new edits.
    await page.evaluate(() => {
      const originalTx = wbTx;
      window.writeStarted = false;
      wbTx = async (store, mode, run) => {
        if (store === WB_CHAPTERS && mode === 'readwrite' && !window.writeStarted) {
          window.writeStarted = true;
          await new Promise(resolve => { window.releaseWrite = resolve; });
        }
        return originalTx(store, mode, run);
      };
      editor.value = 'FIRST SNAPSHOT';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      window.heldFlush = flushChapter();
    });
    await page.waitForFunction(() => window.writeStarted);
    assert.equal(await page.evaluate(() => wbDirty), true);
    const delayed = await page.evaluate(async () => {
      editor.value = 'SECOND SNAPSHOT';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      window.releaseWrite();
      const saved = await window.heldFlush;
      return { saved, dirty: wbDirty, text: editor.value };
    });
    assert.deepEqual(delayed, { saved: false, dirty: true, text: 'SECOND SNAPSHOT' });
    await page.evaluate(async () => { await openChapter('b'); await openChapter('a'); });
    assert.equal(await page.locator('#editor').inputValue(), 'SECOND SNAPSHOT');
    console.log('PASS typing during a write remains dirty and is saved before switching');

    // A switch arriving during autosave must await that write, then retry failure.
    await page.evaluate(() => {
      const originalTx = wbTx;
      window.writeStarted = false;
      wbTx = async (store, mode, run) => {
        if (store === WB_CHAPTERS && mode === 'readwrite') {
          window.writeStarted = true;
          await new Promise(resolve => { window.releaseWrite = resolve; });
          wbTx = originalTx;
          throw new DOMException('Injected abort', 'AbortError');
        }
        return originalTx(store, mode, run);
      };
      editor.value = 'SWITCH DURING AUTOSAVE';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      window.heldFlush = flushChapter();
      window.heldSwitch = openChapter('b');
    });
    await page.waitForFunction(() => window.writeStarted);
    assert.equal(await page.evaluate(() => wbCurrentId), 'a');
    await page.evaluate(async () => {
      window.releaseWrite();
      await window.heldFlush;
      await window.heldSwitch;
    });
    assert.equal(await page.evaluate(() => wbCurrentId), 'b');
    assert.equal(await page.evaluate(async () =>
      (await wbAll(WB_CHAPTERS)).find(ch => ch.id === 'a').content), 'SWITCH DURING AUTOSAVE');
    console.log('PASS concurrent switch waits for autosave and retries before leaving');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

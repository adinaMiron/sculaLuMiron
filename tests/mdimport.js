// Markdown/DOCX replacement must preserve pending chapters and guard loose work.
// Run: node tests/mdimport.js (Playwright's bundled headless Chromium).
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
    const dialogs = [];
    let accept = true;
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => {
      dialogs.push(dialog.message());
      if (accept) await dialog.accept();
      else await dialog.dismiss();
    });
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    await page.waitForFunction(() => wbDraftReady);
    await page.waitForTimeout(1500); // settle the one-time restoration check
    await page.evaluate(async () => {
      const book = { id: 'import-book', name: 'Import', folder: 'Import', order: 0 };
      wbBooks = [book];
      wbChapters = [{ id: 'a', workbookId: book.id, title: 'A', file: 'a.md',
        content: 'ORIGINAL a', created: 1, updated: 1, order: 0 }];
      await wbPut(WB_BOOKS, book);
      await wbPut(WB_CHAPTERS, wbChapters[0]);

      // Use real FileReader results, with controlled completion for read races.
      for (const method of ['readAsText', 'readAsArrayBuffer']) {
        const original = FileReader.prototype[method];
        FileReader.prototype[method] = function(file) {
          const onload = this.onload;
          this.onload = async event => {
            window.readFinished = true;
            if (window.holdRead) await new Promise(resolve => { window.releaseRead = resolve; });
            await onload.call(this, event);
            window.importFinished = true;
          };
          return original.call(this, file);
        };
      }
      // Conversion is isolated from preservation; no remote Mammoth dependency.
      window.mammoth = { convertToHtml: async () => {
        window.conversionStarted = true;
        if (window.holdConversion) await new Promise(resolve => { window.releaseConversion = resolve; });
        return { value: '<p>INCOMING DOCX</p>', messages: [] };
      } };
      window.originalTx = wbTx;
    });

    const reset = async attached => {
      dialogs.length = 0;
      accept = true;
      await page.evaluate(async attached => {
        wbTx = window.originalTx;
        clearTimeout(wbSaveTimer);
        if (wbFlushPromise) await wbFlushPromise;
        await wbPendingClear('a');
        wbChapter('a').content = 'ORIGINAL a';
        await wbPut(WB_CHAPTERS, wbChapter('a'));
        loadChapterIntoEditor(wbChapter('a'));
        if (!attached) {
          editor.value = '';
          detachChapter();
          document.getElementById('current-file').textContent = 'scratch.md';
          updatePreview(); updateStatus();
        }
        window.holdRead = window.holdConversion = false;
      }, attached);
    };
    const edit = async text => page.evaluate(text => {
      editor.value = text;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }, text);
    const start = async (kind, text) => page.evaluate(({ kind, text }) => {
      // Edit and select the file in one turn, before the 800ms autosave.
      if (text !== undefined) {
        editor.value = text;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }
      window.importFinished = window.readFinished = window.conversionStarted = false;
      const input = document.getElementById(kind === 'md' ? 'file-input' : 'docx-input');
      const transfer = new DataTransfer();
      transfer.items.add(new File(['INCOMING MARKDOWN'], 'incoming.' + kind));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, { kind, text });
    const done = async () => page.waitForFunction(() => window.importFinished);
    const state = async () => page.evaluate(async () => ({
      text: editor.value, current: wbCurrentId, dirty: wbDirty,
      stored: (await wbAll(WB_CHAPTERS)).find(ch => ch.id === 'a').content,
      pending: wbPendingIds.has('a'), draft: wbDraftRead(),
      file: document.getElementById('current-file').textContent,
      undo: undoStack.length + redoStack.length
    }));
    const imported = kind => kind === 'md' ? 'INCOMING MARKDOWN' : 'INCOMING DOCX';

    for (const kind of ['md', 'docx']) {
      await reset(true);
      await start(kind, 'PENDING ' + kind);
      await done();
      let result = await state();
      assert.equal(result.stored, 'PENDING ' + kind);
      assert.equal(result.pending, true, 'preserved chapter remains pending for folder save');
      assert.equal(result.text, imported(kind));
      assert.equal(result.current, null);
      assert.equal(result.file, 'incoming.md');
      assert.equal(result.draft.id, '');
      assert.equal(result.draft.text, imported(kind));
      assert.equal(result.undo, 0);
      console.log('PASS ' + kind + ' saves pending chapter before replacing');

      for (const confirmed of [false, true]) {
        await reset(false);
        await edit('LOOSE WORK');
        await page.evaluate(() => wbDraftWrite());
        const before = await state();
        accept = confirmed;
        await start(kind);
        await done();
        result = await state();
        assert.equal(dialogs.length, 1, 'loose work requires confirmation');
        if (!confirmed) assert.deepEqual(result, before, 'cancel keeps document and recovery journal');
        else assert.equal(result.text, imported(kind));
        assert.equal(await page.locator(kind === 'md' ? '#file-input' : '#docx-input').inputValue(), '');
        console.log('PASS ' + kind + ' loose replacement ' + (confirmed ? 'confirmed' : 'canceled'));
      }

      await reset(false);
      await start(kind);
      await done();
      assert.equal(dialogs.length, 0, 'empty editor needs no confirmation');
      assert.equal((await state()).text, imported(kind));

      // Start the read on a clean chapter, then edit before its completion.
      await reset(true);
      await page.evaluate(() => { window.holdRead = true; });
      await start(kind);
      await page.waitForFunction(() => window.releaseRead && window.readFinished);
      await page.evaluate(() => {
        editor.value = 'EDIT DURING READ';
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        window.releaseRead();
        window.releaseRead = null;
      });
      await done();
      assert.equal((await state()).stored, 'EDIT DURING READ');
      assert.equal((await state()).text, imported(kind));
      console.log('PASS ' + kind + ' preserves edits arriving during delayed file read');

      // Loose work created during the read must be guarded at completion too.
      await reset(false);
      await page.evaluate(() => { window.holdRead = true; });
      await start(kind);
      await page.waitForFunction(() => window.releaseRead && window.readFinished);
      accept = false;
      await page.evaluate(() => {
        editor.value = 'LOOSE DURING READ';
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        wbDraftWrite();
        window.releaseRead();
        window.releaseRead = null;
      });
      await done();
      result = await state();
      assert.equal(dialogs.length, 1);
      assert.equal(result.text, 'LOOSE DURING READ');
      assert.equal(result.draft.text, 'LOOSE DURING READ');

      for (const failure of ['quota', 'abort']) {
        await reset(true);
        await page.evaluate(failure => {
          wbTx = async (store, mode, run) => {
            if (store !== WB_CHAPTERS || mode !== 'readwrite') return window.originalTx(store, mode, run);
            if (failure === 'quota') throw new DOMException('Injected quota failure', 'QuotaExceededError');
            const db = await wbDb();
            try {
              return await new Promise((resolve, reject) => {
                const tx = db.transaction(store, mode);
                tx.onabort = () => reject(new DOMException('Injected abort', 'AbortError'));
                run(tx.objectStore(store));
                tx.abort();
              });
            } finally { db.close(); }
          };
        }, failure);
        await start(kind, 'UNSAVED ' + failure);
        await done();
        result = await state();
        assert.equal(result.text, 'UNSAVED ' + failure);
        assert.equal(result.current, 'a');
        assert.equal(result.dirty, true);
        assert.equal(result.stored, 'ORIGINAL a');
        assert.equal(result.file, 'a.md');
        assert.equal(result.draft.id, 'a');
        assert.equal(result.draft.text, 'UNSAVED ' + failure);
        assert.equal(await page.locator(kind === 'md' ? '#file-input' : '#docx-input').inputValue(), '');
        await page.evaluate(() => { wbTx = window.originalTx; });
        await start(kind);
        await done();
        assert.equal((await state()).stored, 'UNSAVED ' + failure);
        assert.equal((await state()).text, imported(kind));
        console.log('PASS ' + kind + ' blocks replacement on ' + failure + ' and retries safely');
      }

      // A flush's earlier snapshot must not authorize discarding a newer edit.
      await reset(true);
      await page.evaluate(() => {
        window.releaseWrite = null;
        wbTx = async (store, mode, run) => {
          if (store === WB_CHAPTERS && mode === 'readwrite') {
            await new Promise(resolve => { window.releaseWrite = resolve; });
            wbTx = window.originalTx;
          }
          return window.originalTx(store, mode, run);
        };
      });
      await start(kind, 'FIRST SNAPSHOT');
      await page.waitForFunction(() => window.releaseWrite);
      assert.equal((await state()).current, 'a', 'replacement waits for storage');
      await page.evaluate(() => {
        editor.value = 'EDIT DURING FLUSH';
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        window.releaseWrite();
      });
      await done();
      result = await state();
      assert.equal(result.current, 'a');
      assert.equal(result.dirty, true);
      assert.equal(result.text, 'EDIT DURING FLUSH');
      // The journal debounces normal input by 700ms; pagehide also writes it.
      await page.waitForFunction(() => wbDraftRead()?.text === 'EDIT DURING FLUSH');
      await start(kind);
      await done();
      assert.equal((await state()).stored, 'EDIT DURING FLUSH');
      assert.equal((await state()).text, imported(kind));
      console.log('PASS ' + kind + ' retains newer edits typed during the preservation flush');
    }

    await reset(true);
    accept = false;
    await start('docx', 'CANCELED CHAPTER EDIT');
    await done();
    assert.equal((await state()).current, 'a');
    assert.equal((await state()).text, 'CANCELED CHAPTER EDIT');
    assert.equal((await state()).dirty, true);
    assert.equal(dialogs.length, 1);
    console.log('PASS canceled DOCX replacement keeps attached pending edit');

    await reset(true);
    await page.evaluate(() => { window.holdConversion = true; });
    await start('docx');
    await page.waitForFunction(() => window.releaseConversion && window.conversionStarted);
    await page.evaluate(() => {
      editor.value = 'EDIT DURING CONVERSION';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      window.releaseConversion();
    });
    await done();
    assert.equal((await state()).stored, 'EDIT DURING CONVERSION');
    assert.equal((await state()).text, 'INCOMING DOCX');
    console.log('PASS DOCX preserves edits arriving during delayed conversion');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

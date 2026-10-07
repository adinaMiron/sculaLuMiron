// Delayed Drive pulls preserve edits, their journal and their undo history.
// Run: node tests/gdsyncpullrace.js (bundled Chromium, local server only).
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fakeDrive, stub, serve, DIR } = require('./gdsync.js');

(async () => {
  const { srv, port } = await serve();
  let browser;
  try {
    browser = await chromium.launch();
    for (const scenario of ['typing-dirty', 'typing-autosaved', 'equal-stamp', 'formatting',
      'switch-edited', 'switch-only', 'commit-edit', 'unchanged']) {
      const book = { id: 'book', name: 'Pull race', folder: 'pull-race', created: 1000, updated: 1000, order: 0 };
      const remote = { id: 'a', workbookId: book.id, title: 'A', file: 'a.md', created: 1000,
        updated: 9000, order: 0, driveId: 'remote-a' };
      const original = JSON.stringify({ v: 1, books: [{ ...book, driveId: 'dir' }], chapters: [remote], deleted: {} });
      const drive = fakeDrive([
        { id: 'root', name: 'Scula Markdown', mimeType: DIR, parents: [] },
        { id: 'dir', name: book.folder, mimeType: DIR, parents: ['root'] },
        { id: 'manifest', name: 'index.json', parents: ['root'], body: original },
        { id: remote.driveId, name: remote.file, parents: ['dir'], body: 'REMOTE BODY' }
      ]);
      const requests = [];
      const handle = drive.handle.bind(drive);
      drive.handle = request => { requests.push(request.method()); return handle(request); };
      const context = await browser.newContext();
      try {
        await context.route(/^https?:/, route => new URL(route.request().url()).hostname === '127.0.0.1'
          ? route.continue() : route.abort());
        await stub(context, drive);
        let releasePull, reachedPull;
        const pullReached = new Promise(resolve => { reachedPull = resolve; });
        const heldPull = new Promise(resolve => { releasePull = resolve; });
        await context.route(/\/remote-a\?alt=media$/, async route => {
          reachedPull();
          await heldPull;
          const response = drive.handle(route.request());
          await route.fulfill({ status: response.status, contentType: 'text/plain', body: response.body });
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${port}/index.html`);
        await page.waitForFunction(() => wbDraftReady);
        await page.waitForTimeout(1500);
        await page.evaluate(async ({ book, scenario }) => {
          wbBooks = [book];
          wbChapters = ['a', 'b'].map((id, order) => ({ id, workbookId: book.id, title: id.toUpperCase(),
            file: id + '.md', content: 'ORIGINAL ' + id, created: 1000, updated: 2000, order }));
          await wbPut(WB_BOOKS, book);
          for (const chapter of wbChapters) await wbPut(WB_CHAPTERS, chapter);
          loadChapterIntoEditor(wbChapter('a'));
          gsToken = 'stub-token'; gsTokenExp = Date.now() + 3600e3;
          if (scenario === 'commit-edit') {
            const tx = wbTx;
            wbTx = async (store, mode, run) => {
              const result = await tx(store, mode, run);
              if (store === WB_CHAPTERS && mode === 'readwrite' && gsBusy) {
                wbTx = tx;
                window.commitHeld = true;
                await new Promise(resolve => { window.releaseCommit = resolve; });
              }
              return result;
            };
          }
          window.pullResult = cloudSync(true).then(result => ({ result }), error => ({ error: error.message }));
        }, { book, scenario });
        await pullReached;
        if (scenario === 'commit-edit') {
          releasePull();
          await page.waitForFunction(() => window.commitHeld);
        }

        let local = 'NEW LOCAL WHILE SYNCING';
        const conflict = !['switch-only', 'unchanged'].includes(scenario);
        if (scenario === 'formatting') {
          await page.evaluate(() => { editor.focus(); editor.setSelectionRange(0, 8); });
          await page.click('.tb-btn[data-i-title="boldTip"]');
          local = '**ORIGINAL** a';
        } else if (conflict) {
          await page.locator('#editor').focus();
          await page.keyboard.press('Control+a');
          await page.keyboard.type(local);
        }
        await page.evaluate(async scenario => {
          if (scenario === 'equal-stamp') Date.now = () => 2000;
          if (['typing-autosaved', 'equal-stamp'].includes(scenario)) await flushChapter();
          else clearTimeout(wbSaveTimer); // also cover an edit inside the debounce window
          if (scenario.startsWith('switch-')) {
            await openChapter('b');
            editor.focus();
            editor.setSelectionRange(editor.value.length, editor.value.length);
          }
          wbDraftWrite();
        }, scenario);
        if (scenario.startsWith('switch-')) await page.keyboard.type(' NEW B');
        await page.evaluate(() => { clearTimeout(wbSaveTimer); wbDraftWrite(); });
        const before = await page.evaluate(() => ({ id: wbCurrentId, text: editor.value,
          journal: wbDraftRead().text, undo: document.getElementById('btn-undo').disabled }));
        if (scenario !== 'commit-edit') releasePull();
        const result = await page.evaluate(async scenario => {
          if (scenario === 'commit-edit') window.releaseCommit();
          return window.pullResult;
        }, scenario);

        if (conflict) {
          assert.equal(result.error, await page.evaluate(() => t('cloudPullConflict')));
          assert.equal(drive.files.get('manifest').body, original, 'conflict aborts publication');
          assert.ok(requests.every(method => method === 'GET'), 'no stale remote writes');
          assert.equal(await page.evaluate(() => wbCurrentId), before.id);
          assert.equal(await page.locator('#editor').inputValue(), before.text, 'visible edits survive');
          assert.equal(await page.evaluate(() => wbDraftRead().text), before.journal, 'recovery text survives');
          assert.equal(await page.locator('#btn-undo').isDisabled(), before.undo, 'undo remains available');
          const stored = await page.evaluate(() => wbAll(WB_CHAPTERS));
          const copy = stored.find(ch => ch.id !== 'a' && ch.id !== 'b');
          assert.ok(copy, 'download is preserved as a durable conflict chapter');
          assert.equal(copy.content, 'REMOTE BODY');
          assert.notEqual(copy.file, 'a.md');
          assert.ok(await page.evaluate(id => wbPendingIds.has(id), copy.id));
          await page.evaluate(() => flushChapter());
          assert.equal((await page.evaluate(() => wbAll(WB_CHAPTERS))).find(ch => ch.id === 'a').content, local);
          if (!scenario.startsWith('switch-')) {
            await page.click('#btn-undo');
            assert.notEqual(await page.locator('#editor').inputValue(), local, 'undo still operates on local edits');
            await page.click('#btn-redo');
            assert.equal(await page.locator('#editor').inputValue(), local);
            await page.evaluate(() => flushChapter());
          }
          await page.reload();
          await page.waitForFunction(() => wbDraftReady);
          const recovered = await page.evaluate(() => wbAll(WB_CHAPTERS));
          assert.equal(recovered.find(ch => ch.id === 'a').content, local, 'local text survives reload');
          assert.equal(recovered.find(ch => ch.id === copy.id).content, 'REMOTE BODY');
          assert.equal(await page.locator('#editor').inputValue(), before.text);
        } else {
          assert.ok(result.result, 'unchanged chapter is pulled normally');
          assert.equal((await page.evaluate(() => wbAll(WB_CHAPTERS))).find(ch => ch.id === 'a').content, 'REMOTE BODY');
          assert.equal(await page.locator('#editor').inputValue(), scenario === 'unchanged' ? 'REMOTE BODY' : before.text);
          assert.equal(await page.evaluate(() => wbCurrentId), before.id);
        }
        assert.deepEqual(errors, []);
        console.log('PASS delayed Drive pull: ' + scenario);
      } finally { await context.close(); }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => srv.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

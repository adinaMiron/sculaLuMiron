// Two real same-origin tabs must preserve competing chapter revisions.
// Run: node tests/wbmultitab.js (bundled headless Chromium, local server only).
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { serve } = require('./gdsync.js');

const edit = (page, text) => page.evaluate(text => {
  editor.value = text;
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}, text);
const chapters = page => page.evaluate(() => wbAll(WB_CHAPTERS));
const reload = async page => {
  await page.reload();
  await page.waitForFunction(() => wbDraftReady);
  await page.waitForTimeout(1400);
};

(async () => {
  const { srv, port } = await serve();
  const browser = await chromium.launch();
  try {
    for (const scenario of ['autosave', 'explicit', 'simultaneous', 'reload-before-save', 'conflict-store-failure', 'idea']) {
      const context = await browser.newContext();
      try {
        const origin = 'http://127.0.0.1:' + port;
        await context.route('**/*', route => new URL(route.request().url()).origin === origin
          ? route.continue() : route.abort());
        const errors = [];
        const a = await context.newPage();
        a.on('pageerror', error => errors.push(error.message));
        await a.goto(origin + '/index.html');
        await a.waitForFunction(() => wbDraftReady);
        await a.evaluate(async () => {
          const book = { id: 'book', name: 'Tabs', folder: 'Tabs', order: 0 };
          wbBooks = [book];
          wbChapters = ['a', 'b'].map((id, order) => ({ id, workbookId: book.id,
            title: id, file: id + '.md', content: 'ORIGINAL ' + id,
            updated: 1, created: 1, order }));
          await wbPut(WB_BOOKS, book);
          for (const ch of wbChapters) await wbPut(WB_CHAPTERS, ch);
          loadChapterIntoEditor(wbChapter('a'));
        });
        const b = await context.newPage();
        b.on('pageerror', error => errors.push(error.message));
        await b.goto(origin + '/index.html');
        await b.waitForFunction(() => wbDraftReady && wbCurrentId === 'a');
        await a.waitForTimeout(1500);
        await b.bringToFront();
        assert.equal(await b.locator('#editor').inputValue(), 'ORIGINAL a');

        if (scenario === 'simultaneous') {
          // Identical timestamps do not make distinct text the same revision.
          for (const page of [a, b]) await page.evaluate(() => { Date.now = () => 2000; });
          await edit(a, 'TAB A NEWER');
          await edit(b, 'TAB B STALE EDIT');
          await Promise.all([a.evaluate(() => flushChapter()), b.evaluate(() => flushChapter())]);
        } else {
          await edit(a, 'TAB A NEWER');
          await a.evaluate(() => saveToWorkbook());
          assert.equal(await b.locator('#editor').inputValue(), 'ORIGINAL a', 'B still has a stale document');
          if (scenario === 'autosave') {
            await b.evaluate(() => wbMoveChapterTo('a', 'book', 'b', false));
            assert.equal((await chapters(a)).find(ch => ch.id === 'a').content, 'TAB A NEWER',
              'stale chapter moves cannot overwrite newer text');
            assert.equal((await chapters(a)).find(ch => ch.id === 'a').order, 0, 'move aborts atomically');
            assert.equal(await b.evaluate(() => document.getElementById('stat-wb').textContent),
              await b.evaluate(() => t('wbStaleMove')));
          }
          if (scenario === 'idea') {
            await b.evaluate(async () => {
              openIdeaModal();
              document.getElementById('idea-text').value = 'IDEA FROM B';
              await saveIdea();
            });
            assert.equal(await b.locator('#idea-text').inputValue(), 'IDEA FROM B', 'failed idea stays in its input');
          } else {
            if (scenario === 'conflict-store-failure') {
              await b.evaluate(() => {
                const originalTx = wbTx;
                wbTx = (store, mode, run) => store === WB_CHAPTERS && mode === 'readwrite'
                  ? Promise.reject(new DOMException('Injected quota failure', 'QuotaExceededError'))
                  : originalTx(store, mode, run);
              });
            }
            await edit(b, 'TAB B STALE EDIT');
            if (scenario === 'reload-before-save') {
              // Discard before an IndexedDB flush; another tab overwrites the
              // shared journal. Only B's isolated journal can recover its text.
              await b.evaluate(() => {
                clearTimeout(wbSaveTimer);
                wbDraftWrite();
                window.removeEventListener('pagehide', wbPark);
                window.removeEventListener('beforeunload', wbPark);
                flushChapter = async () => false;
              });
              await a.evaluate(() => wbDraftWrite());
              await reload(b);
            } else if (scenario === 'conflict-store-failure') {
              await b.evaluate(() => saveToWorkbook());
              assert.equal((await chapters(a)).length, 2, 'failed preservation creates no partial copy');
              assert.equal(await b.evaluate(() => wbDirty), true);
              assert.equal(await b.evaluate(() => document.getElementById('stat-wb').textContent),
                await b.evaluate(() => t('wbStoreFailed')));
              await a.evaluate(() => wbDraftWrite());
              await reload(b); // the isolated draft retries preservation without the injected failure
            } else if (scenario === 'explicit') await b.evaluate(() => saveToWorkbook());
            else await b.waitForTimeout(1100);
          }
        }

        const records = await chapters(a);
        const original = records.find(ch => ch.id === 'a');
        const copies = records.filter(ch => ch.title.endsWith(' (conflict)'));
        assert.equal(copies.length, 1, 'one durable competing chapter');
        assert.notEqual(copies[0].file, original.file, 'separate folder mirror path');
        const competing = scenario === 'idea' ? 'ORIGINAL a\nIDEA FROM B\n' : 'TAB B STALE EDIT';
        if (scenario === 'simultaneous') {
          assert.deepEqual([original.content, copies[0].content].sort(), ['TAB A NEWER', competing].sort());
        } else {
          assert.equal(original.content, 'TAB A NEWER');
          assert.equal(copies[0].content, competing);
          if (!['reload-before-save', 'conflict-store-failure'].includes(scenario)) {
            assert.equal(await b.evaluate(() => document.getElementById('stat-wb').textContent),
              await b.evaluate(() => t('wbConflict')), 'conflict reported');
          }
        }
        const loser = original.content === 'TAB A NEWER' ? b : a;
        if (scenario !== 'idea') {
          if (!['reload-before-save', 'conflict-store-failure'].includes(scenario)) {
            await loser.evaluate(() => openChapter('b'));
            assert.equal(await loser.evaluate(() => wbCurrentId), 'a', 'conflict blocks destructive switching');
            assert.equal((await chapters(a)).length, 3, 'retry does not duplicate the conflict');
            // A foreground/background transition must keep both records intact.
            await a.bringToFront();
            await b.bringToFront();
            await loser.evaluate(() => document.dispatchEvent(new Event('freeze')));
            await reload(loser);
          }
          assert.equal(await loser.evaluate(() => wbCurrentId), copies[0].id);
          assert.equal(await loser.locator('#editor').inputValue(), copies[0].content);
          await loser.evaluate(() => openChapter('b'));
          await a.evaluate(() => wbDraftWrite());
          await reload(loser);
          assert.equal(await loser.evaluate(() => wbCurrentId), 'b', 'resume uses this tab, not shared last/draft');
        }
        await b.close();
        const fresh = await context.newPage();
        await fresh.goto(origin + '/index.html');
        await fresh.waitForFunction(() => wbDraftReady);
        assert.equal((await chapters(fresh)).find(ch => ch.id === copies[0].id).content, copies[0].content,
          'conflicting text survives closing its tab');
        assert.equal((await chapters(fresh)).find(ch => ch.id === 'a').content, original.content);
        assert.deepEqual(errors, []);
        console.log('PASS ' + scenario + ': both revisions survive tabs, reload and close');
      } finally { await context.close(); }
    }
  } finally {
    await browser.close();
    await new Promise(resolve => srv.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

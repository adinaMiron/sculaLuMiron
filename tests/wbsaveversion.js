// Delayed folder saves must acknowledge only the version actually mirrored.
// Run: node tests/wbsaveversion.js (bundled headless Chromium, no network).
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

async function setup(page, stage, action) {
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => wbDraftReady);
  await page.waitForTimeout(1500); // let startup's restoration check settle
  await page.evaluate(async ({ stage, action }) => {
    const book = { id: 'version-book', name: 'Versions', folder: 'Versions', order: 0 };
    const ch = { id: 'a', workbookId: book.id, title: 'a', file: 'a.md',
      content: 'FIRST VERSION', created: 1, updated: 1, order: 0 };
    wbBooks = [book];
    wbChapters = [ch];
    await wbPut(WB_BOOKS, book);
    await wbPut(WB_CHAPTERS, ch);
    await wbPendingMark(ch);
    wbOpenBooks.add(book.id);
    loadChapterIntoEditor(ch);
    window.versionDisk = {};
    let held = false;
    let directories = 0;
    const hold = async at => {
      if (at !== stage || held) return;
      held = true;
      window.versionHeld = true;
      await new Promise(resolve => { window.releaseVersion = resolve; });
    };
    ScuLaFolder.mode = () => 'folder';
    ScuLaFolder.name = () => 'Test';
    ScuLaFolder.subdir = () => 'markdown';
    ScuLaFolder.dir = async () => {
      directories++;
      if (action !== 'sync' || directories > 2) await hold('dir');
      return {
        values: async function* () {},
        getDirectoryHandle: async () => ({
          getFileHandle: async file => ({
            createWritable: async () => {
              let body;
              return {
                write: async blob => { body = await blob.text(); },
                close: async () => { await hold('close'); window.versionDisk[file] = body; }
              };
            }
          })
        })
      };
    };
    const originalTx = wbTx;
    wbTx = async (store, mode, run) => {
      const clearing = store === WB_PENDING && mode === 'readwrite'
        && window.versionDisk['a.md'] === 'FIRST VERSION';
      if (clearing) await hold('clear');
      const result = await originalTx(store, mode, run);
      if (clearing) await hold('committed');
      return result;
    };
  }, { stage, action });
}

async function state(page) {
  return page.evaluate(async () => ({
    pending: [...wbPendingIds], records: await wbAll(WB_PENDING),
    stored: (await wbAll(WB_CHAPTERS)).find(ch => ch.id === 'a').content,
    disk: window.versionDisk, dirty: wbDirty,
    marked: !!document.querySelector('.wb-ch-row.modified'),
    status: document.getElementById('stat-wb').textContent
  }));
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const action of ['single', 'all', 'sync', 'overlap']) {
      for (const stage of action === 'single' ? ['dir', 'close', 'clear', 'committed'] : ['dir', 'close']) {
        for (const autosaved of action === 'overlap' ? [true] : [false, true]) {
          const context = await browser.newContext();
          try {
            await context.route(/^https?:/, route => route.abort());
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            // Sync also requests a directory before its write pass; hold the
            // mirror helper's directory request rather than that read pass.
            await setup(page, stage, action);
            await page.evaluate(action => {
              window.oldSave = action === 'single' || action === 'overlap' ? saveToWorkbook()
                : action === 'all' ? saveAllModifiedChapters() : syncAllToFolder({ cloud: false });
            }, action);
            await page.waitForFunction(() => window.versionHeld);
            await page.evaluate(async ({ autosaved, action }) => {
              editor.value = 'SECOND VERSION';
              editor.dispatchEvent(new Event('input', { bubbles: true }));
              if (autosaved) await flushChapter();
              else clearTimeout(wbSaveTimer); // keep the newer edit inside the debounce window
              if (action === 'overlap') {
                await saveToWorkbook();
                if (wbPendingIds.has('a')) throw new Error('newer completed save should clear its own marker');
              }
              window.releaseVersion();
              await window.oldSave;
            }, { autosaved, action });
            const delayed = await state(page);
            assert.deepEqual(delayed.disk, { 'a.md': 'FIRST VERSION' }, 'mirror writes the captured version');
            assert.deepEqual(delayed.pending, ['a'], 'older completion retains newer pending edits');
            assert.equal(delayed.records.length, 1, 'pending marker remains durable');
            assert.equal(delayed.marked, true, 'panel retains its pending dot');
            assert.equal(delayed.dirty, !autosaved);
            assert.equal(delayed.stored, autosaved ? 'SECOND VERSION' : 'FIRST VERSION');
            if (autosaved) assert.equal(delayed.records[0].content, 'SECOND VERSION');
            if (action === 'single' || action === 'overlap') {
              assert.equal(delayed.status, await page.evaluate(autosaved =>
                t(autosaved ? 'wbAutosaved' : 'wbEditing'), autosaved));
            }
            await page.evaluate(() => flushChapter());
            await page.reload();
            await page.waitForFunction(() => wbDraftReady);
            assert.deepEqual((await state(page)).pending, ['a'], 'pending version survives reload');
            // The stubbed disk is page-local, so remount it without changing records.
            await page.evaluate(() => {
              window.versionDisk = {};
              ScuLaFolder.mode = () => 'folder';
              ScuLaFolder.dir = async () => ({ getDirectoryHandle: async () => ({
                getFileHandle: async file => ({ createWritable: async () => ({
                  write: async blob => { window.versionDisk[file] = await blob.text(); }, close: async () => {}
                }) })
              }) });
            });
            await page.evaluate(() => saveAllModifiedChapters());
            const retry = await state(page);
            assert.deepEqual(retry.disk, { 'a.md': 'SECOND VERSION' });
            assert.deepEqual(retry.pending, []);
            assert.deepEqual(retry.records, []);
            assert.equal(retry.marked, false);
            assert.deepEqual(errors, []);
            console.log(`PASS delayed ${action} at ${stage}, newer edit ${autosaved ? 'autosaved' : 'dirty'}, reload and retry`);
          } finally { await context.close(); }
        }
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

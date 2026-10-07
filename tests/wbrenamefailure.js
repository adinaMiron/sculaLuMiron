// Renames must not delete a folder copy until its replacement is committed.
// Run: node tests/wbrenamefailure.js (bundled headless Chromium, no network).
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

async function mount(page, { failure = '', failedFile = '', disk = {
  Original: { 'a.md': 'OLD a', 'b.md': 'OLD b' }
} } = {}) {
  await page.evaluate(({ failure, failedFile, disk }) => {
    window.renameDisk = disk;
    window.renameEvents = [];
    const fail = (stage, file) => {
      if (failure === stage && (!failedFile || failedFile === file)) {
        throw new DOMException('Injected ' + stage, stage === 'denied' ? 'NotAllowedError' : 'QuotaExceededError');
      }
    };
    ScuLaFolder.mode = () => 'folder';
    ScuLaFolder.name = () => 'Test';
    ScuLaFolder.subdir = () => 'markdown';
    ScuLaFolder.toast = () => {};
    ScuLaFolder.dir = async () => {
      fail('denied');
      if (failure === 'unavailable') return null;
      return {
        getDirectoryHandle: async (folder, options) => {
          if (!disk[folder]) {
            if (!options?.create) throw new DOMException('Missing folder', 'NotFoundError');
            disk[folder] = {};
          }
          return {
            getFileHandle: async file => ({
              createWritable: async () => {
                fail('create', file);
                let body;
                return {
                  write: async blob => { fail('write', file); body = await blob.text(); },
                  close: async () => {
                    fail('close', file);
                    disk[folder][file] = body;
                    renameEvents.push(['close', folder, file]);
                  }
                };
              }
            }),
            removeEntry: async file => {
              renameEvents.push(['remove', folder, file]);
              delete disk[folder][file];
            }
          };
        },
        removeEntry: async folder => {
          renameEvents.push(['removeFolder', folder]);
          if (Object.keys(disk[folder] || {}).length) throw new DOMException('Not empty', 'InvalidModificationError');
          delete disk[folder];
        }
      };
    };
  }, { failure, failedFile, disk });
}

async function seed(page) {
  await page.evaluate(async () => {
    const book = { id: 'rename-book', name: 'Original', folder: 'Original', order: 0 };
    wbBooks = [book];
    wbChapters = ['a', 'b'].map((id, order) => ({
      id, workbookId: book.id, title: id, file: id + '.md',
      content: 'NEW ' + id, created: 1, updated: 1, order
    }));
    await wbPut(WB_BOOKS, book);
    for (const ch of wbChapters) await wbPut(WB_CHAPTERS, ch);
    // A pre-existing pending edit must also remain pending if its rename fails.
    await wbPendingMark(wbChapter('a'));
    wbOpenBooks.add(book.id);
    renderWorkbooks();
  });
}

async function state(page) {
  return page.evaluate(async () => ({
    books: await wbAll(WB_BOOKS),
    chapters: await wbAll(WB_CHAPTERS),
    pending: [...wbPendingIds].sort(),
    records: (await wbAll(WB_PENDING)).sort((a, b) => a.chapterId.localeCompare(b.chapterId)),
    marked: [...document.querySelectorAll('.wb-ch-row.modified .wb-ch-name')].map(el => el.dataset.wbId).sort(),
    disk: window.renameDisk,
    events: window.renameEvents
  }));
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const action of ['chapter', 'workbook']) {
      for (const failure of ['unavailable', 'denied', 'create', 'write', 'close', '']) {
        const context = await browser.newContext();
        try {
          await context.route(/^https?:/, route => route.abort());
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
          await page.waitForFunction(() => wbDraftReady);
          await page.waitForTimeout(1500);
          await seed(page);
          await mount(page, { failure });
          await page.evaluate(async action => {
            if (action === 'chapter') await renameChapter('a', 'Renamed');
            else await renameWorkbook('rename-book', 'Renamed');
          }, action);
          const result = await state(page);
          const folder = action === 'chapter' ? 'Original' : 'Renamed';
          const file = action === 'chapter' ? 'Renamed.md' : 'a.md';
          assert.equal(result.books[0].folder, folder, 'destination folder remains stored for retry');
          assert.equal(result.chapters.find(ch => ch.id === 'a').file, file, 'destination file remains stored for retry');
          const expected = failure ? (action === 'chapter' ? ['a'] : ['a', 'b']) : [];
          assert.deepEqual(result.pending, expected);
          assert.deepEqual(result.records.map(r => r.chapterId), expected);
          assert.deepEqual(result.marked, expected);
          for (const record of result.records) {
            assert.equal(record.content, 'NEW ' + record.chapterId);
            assert.equal(record.workbookId, 'rename-book');
          }
          if (failure) {
            assert.deepEqual(result.disk.Original, { 'a.md': 'OLD a', 'b.md': 'OLD b' });
            assert.deepEqual(result.events, [], 'failed writes never remove source files or folder');
            await page.reload();
            await page.waitForFunction(() => wbDraftReady);
            assert.deepEqual((await state(page)).pending, expected, 'failed rename survives reload');
            await mount(page, { disk: result.disk });
            await page.evaluate(() => saveAllModifiedChapters());
            const retried = await state(page);
            assert.deepEqual(retried.pending, []);
            assert.deepEqual(retried.records, []);
            assert.equal(retried.disk[folder][file], 'NEW a', 'retry uses the stored destination');
            if (action === 'workbook') assert.equal(retried.disk.Renamed['b.md'], 'NEW b');
            assert.equal(retried.disk.Original['a.md'], 'OLD a', 'recovery copy is retained');
          } else {
            assert.equal(result.disk[folder][file], 'NEW a');
            assert.deepEqual(result.events, action === 'chapter'
              ? [['close', 'Original', 'Renamed.md'], ['remove', 'Original', 'a.md']]
              : [['close', 'Renamed', 'a.md'], ['remove', 'Original', 'a.md'],
                ['close', 'Renamed', 'b.md'], ['remove', 'Original', 'b.md'], ['removeFolder', 'Original']]);
          }
          assert.deepEqual(errors, []);
          console.log('PASS ' + (failure || 'successful') + ' ' + action + ' rename preserves copies and pending state');
        } finally { await context.close(); }
      }
    }

    const context = await browser.newContext();
    try {
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
      await page.waitForFunction(() => wbDraftReady);
      await page.waitForTimeout(1500);
      await seed(page);
      await mount(page, { failure: 'close', failedFile: 'b.md' });
      await page.evaluate(() => renameWorkbook('rename-book', 'Renamed'));
      const partial = await state(page);
      assert.deepEqual(partial.disk, { Original: { 'b.md': 'OLD b' }, Renamed: { 'a.md': 'NEW a' } });
      assert.deepEqual(partial.pending, ['b']);
      assert.deepEqual(partial.records.map(r => r.chapterId), ['b']);
      assert.deepEqual(partial.marked, ['b']);
      assert.deepEqual(partial.events, [['close', 'Renamed', 'a.md'], ['remove', 'Original', 'a.md']]);
      await page.reload();
      await page.waitForFunction(() => wbDraftReady);
      assert.deepEqual((await state(page)).pending, ['b']);
      await mount(page, { disk: partial.disk });
      await page.evaluate(() => saveAllModifiedChapters());
      const retried = await state(page);
      assert.deepEqual(retried.pending, []);
      assert.deepEqual(retried.records, []);
      assert.deepEqual(retried.disk.Renamed, { 'a.md': 'NEW a', 'b.md': 'NEW b' });
      assert.deepEqual(retried.disk.Original, { 'b.md': 'OLD b' });
      console.log('PASS partial workbook rename deletes only confirmed copies and retries after reload');
    } finally { await context.close(); }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

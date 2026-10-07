// Folder-save failures must stay pending, survive reload and retry without typing.
// Run: node tests/wbmirrorfailure.js (bundled headless Chromium, no network).
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

async function mount(page, { failure = '', failedFile = '', mode = 'folder' } = {}) {
  await page.evaluate(({ failure, failedFile, mode }) => {
    window.mirrorDisk = {};
    const fail = (stage, file) => {
      if (failure === stage && (!failedFile || failedFile === file)) {
        throw new DOMException('Injected ' + stage, stage === 'denied' ? 'NotAllowedError' : 'QuotaExceededError');
      }
    };
    ScuLaFolder.mode = () => mode;
    ScuLaFolder.name = () => 'Test';
    ScuLaFolder.subdir = () => 'markdown';
    ScuLaFolder.toast = () => {};
    ScuLaFolder.dir = async () => {
      fail('denied');
      if (failure === 'unavailable') return null;
      return {
        values: async function* () {},
        getDirectoryHandle: async () => ({
          getFileHandle: async file => ({
            createWritable: async () => {
              fail('create', file);
              let body;
              return {
                write: async blob => { fail('write', file); body = await blob.text(); },
                close: async () => { fail('close', file); window.mirrorDisk[file] = body; }
              };
            }
          })
        })
      };
    };
  }, { failure, failedFile, mode });
}

async function state(page) {
  return page.evaluate(async () => ({
    pending: [...wbPendingIds].sort(),
    records: (await wbAll(WB_PENDING)).sort((a, b) => a.chapterId.localeCompare(b.chapterId)),
    chapters: await wbAll(WB_CHAPTERS),
    status: document.getElementById('stat-wb').textContent,
    disk: window.mirrorDisk,
    marked: [...document.querySelectorAll('.wb-ch-row.modified .wb-ch-name')].map(el => el.dataset.wbId).sort()
  }));
}

async function seed(page) {
  await page.evaluate(async () => {
    const book = { id: 'mirror-book', name: 'Mirror', folder: 'Mirror', order: 0 };
    wbBooks = [book];
    wbChapters = ['a', 'b'].map((id, order) => ({
      id, workbookId: book.id, title: id, file: id + '.md',
      content: 'NEW ' + id, created: 1, updated: 1, order
    }));
    await wbPut(WB_BOOKS, book);
    for (const ch of wbChapters) await wbPut(WB_CHAPTERS, ch);
    wbOpenBooks.add(book.id);
    renderWorkbooks();
  });
}

async function save(page, action) {
  return page.evaluate(async action => {
    if (action === 'single') {
      loadChapterIntoEditor(wbChapter('a'));
      editor.value = 'EDITED a';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      await saveToWorkbook();
      return 'a';
    }
    if (action === 'all' || action === 'sync') {
      for (const ch of wbChapters) await wbPendingMark(ch);
      if (action === 'all') await saveAllModifiedChapters();
      else await syncAllToFolder({ cloud: false });
      return 'a';
    }
    if (action === 'modal') {
      editor.value = 'LOOSE NEW CHAPTER';
      openWorkbookModal();
      document.getElementById('wb-chapter-title').value = 'New chapter';
      await confirmSaveToWorkbook();
      return wbCurrentId;
    }
    openIdeaModal();
    document.getElementById('idea-text').value = 'a: IDEA APPENDED';
    await saveIdea();
    return 'a';
  }, action);
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const failure of ['unavailable', 'denied', 'create', 'write', 'close']) {
      for (const action of ['single', 'all', 'sync', 'modal', 'idea']) {
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
          const id = await save(page, action);
          const failed = await state(page);
          const expected = action === 'all' || action === 'sync' ? ['a', 'b'] : [id];
          assert.deepEqual(failed.pending, expected, failure + ' during ' + action + ' retains pending set');
          assert.deepEqual(failed.records.map(r => r.chapterId).sort(), expected, 'pending persists in IndexedDB');
          assert.deepEqual(failed.marked, expected, 'panel keeps pending dots');
          for (const record of failed.records) {
            assert.equal(record.content, failed.chapters.find(ch => ch.id === record.chapterId).content);
          }
          assert.deepEqual(failed.disk, {}, 'failed writes never commit a file');
          assert.equal(failed.status, await page.evaluate(action =>
            action === 'all' ? t('wbSavedSomeModified', 0)
              : action === 'sync' ? t('wbSyncedSome', 0) : t('wbMirrorFailed'), action));
          if (action === 'idea') {
            assert.equal(failed.chapters.find(ch => ch.id === id).content, 'NEW a\nIDEA APPENDED\n');
            assert.equal(await page.locator('#idea-text').inputValue(), '', 'locally stored idea is not appended twice on retry');
          }

          await page.reload();
          await page.waitForFunction(() => wbDraftReady);
          assert.deepEqual((await state(page)).pending, expected, 'failed markers survive reload');
          await mount(page);
          await page.evaluate(() => saveAllModifiedChapters());
          const retried = await state(page);
          assert.deepEqual(retried.pending, []);
          assert.deepEqual(retried.records, []);
          assert.deepEqual(retried.marked, []);
          for (const id of expected) {
            const ch = retried.chapters.find(ch => ch.id === id);
            assert.equal(retried.disk[ch.file], ch.content, 'retry writes preserved chapter without another edit');
          }
          assert.deepEqual(errors, []);
          console.log('PASS ' + failure + ' during ' + action + ' retains markers and retries after reload');
        } finally { await context.close(); }
      }
    }

    for (const action of ['all', 'sync']) {
      const context = await browser.newContext();
      try {
        await context.route(/^https?:/, route => route.abort());
        const page = await context.newPage();
        await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
        await page.waitForFunction(() => wbDraftReady);
        await seed(page);
        await mount(page, { failure: 'close', failedFile: 'b.md' });
        await save(page, action);
        const partial = await state(page);
        assert.deepEqual(partial.pending, ['b']);
        assert.deepEqual(partial.records.map(r => r.chapterId), ['b']);
        assert.deepEqual(partial.disk, { 'a.md': 'NEW a' });
        assert.equal(partial.status, await page.evaluate(action =>
          t(action === 'all' ? 'wbSavedSomeModified' : 'wbSyncedSome', 1), action));
        console.log('PASS partial ' + action + ' clears only successful chapters and reports one written');
      } finally { await context.close(); }
    }

    for (const mode of ['share', 'download']) {
      const context = await browser.newContext();
      try {
        await context.route(/^https?:/, route => route.abort());
        const page = await context.newPage();
        await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
        await page.waitForFunction(() => wbDraftReady);
        await seed(page);
        await mount(page, { mode });
        for (const action of ['single', 'all', 'modal', 'idea']) {
          await save(page, action);
          const local = await state(page);
          assert.deepEqual(local.pending, []);
          assert.deepEqual(local.records, []);
          assert.deepEqual(local.disk, {});
          assert.notEqual(local.status, await page.evaluate(() => t('wbMirrorFailed')));
        }
        console.log('PASS intentional ' + mode + ' saves remain local and clear markers');
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

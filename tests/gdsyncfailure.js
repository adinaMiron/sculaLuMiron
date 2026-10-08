// Failed chapter pulls must leave the Drive manifest intact and retryable.
// Run: node tests/gdsyncfailure.js
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fakeDrive, stub, serve, DIR } = require('./gdsync.js');

(async () => {
  const browser = await chromium.launch();
  const { srv, port } = await serve();
  try {
    for (const olderLocal of [false, true]) {
      const book = { id: 'book', name: 'Remote book', folder: 'remote-book', created: 1000, updated: 2000, order: 0 };
      const remote = { id: 'a', workbookId: book.id, title: 'Remote A', file: 'remote-a.md',
        created: 1000, updated: 9000, order: 2, driveId: 'remote-a' };
      const first = { ...remote, id: 'first', title: 'First', file: 'first.md', order: 1, driveId: 'remote-first' };
      const manifest = { v: 1, updated: 9000, books: [{ ...book, driveId: 'dir' }], chapters: [first, remote], deleted: {} };
      const original = JSON.stringify(manifest);
      const drive = fakeDrive([
        { id: 'root', name: 'Scula Markdown', mimeType: DIR, parents: [] },
        { id: 'dir', name: book.folder, mimeType: DIR, parents: ['root'] },
        { id: 'manifest', name: 'index.json', parents: ['root'], body: original },
        { id: first.driveId, name: first.file, parents: ['dir'], body: 'FIRST REMOTE BODY' },
        { id: remote.driveId, name: remote.file, parents: ['dir'], body: 'NEW REMOTE BODY' }
      ]);
      const requests = [];
      const handle = drive.handle.bind(drive);
      let failDownload = true;
      drive.handle = request => {
        requests.push({ url: request.url(), method: request.method() });
        if (failDownload && request.url().endsWith('/remote-a?alt=media')) {
          return { status: 503, json: { error: { message: 'Transient chapter download failure' } } };
        }
        return handle(request);
      };

      const context = await browser.newContext();
      try {
        // All external requests stay in this process, including Google stubs.
        await context.route(/^https?:/, route => new URL(route.request().url()).hostname === '127.0.0.1'
          ? route.continue() : route.abort());
        await stub(context, drive);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${port}/index.html`);
        await page.waitForFunction(() => wbDraftReady);
        await page.evaluate(async ({ book, olderLocal }) => {
          wbBooks = [book];
          wbChapters = [{ id: 'b', workbookId: book.id, title: 'Local B', file: 'b.md',
            content: 'LOCAL B BODY', created: 1000, updated: 3000, order: 3 }];
          if (olderLocal) wbChapters.push({ id: 'a', workbookId: book.id, title: 'Old A', file: 'old-a.md',
            content: 'OLD LOCAL BODY', created: 1000, updated: 2000, order: 0 });
          await wbPut(WB_BOOKS, book);
          for (const chapter of wbChapters) await wbPut(WB_CHAPTERS, chapter);
          wbCurrentId = null;
          gsToken = 'stub-token'; gsTokenExp = Date.now() + 3600e3;
        }, { book, olderLocal });

        const result = await page.evaluate(async () => {
          let error = null;
          try { await cloudSync(true); } catch (e) { error = { message: e.message, status: e.status }; }
          return { error, busy: gsBusy, interactive: gsInteractive, lastAt: gsLastAt,
            stored: await wbAll(WB_CHAPTERS), pending: [...wbPendingIds] };
        });
        assert.deepEqual(result.error, { message: 'Transient chapter download failure', status: 503 });
        assert.equal(drive.files.get('manifest').body, original, 'failed pull must not rewrite remote metadata');
        assert.equal(requests.some(request => request.url.includes('/upload/')), false, 'failed pull must abort before chapter or manifest uploads');
        assert.equal(result.busy, false);
        assert.equal(result.interactive, false);
        assert.equal(result.lastAt, 0, 'failed sync must not advance the success timestamp');
        assert.equal(result.stored.find(chapter => chapter.id === 'a')?.content, olderLocal ? 'OLD LOCAL BODY' : undefined);
        assert.equal(result.stored.find(chapter => chapter.id === 'first').content, 'FIRST REMOTE BODY');
        assert.equal(result.pending.includes('first'), true, 'successful earlier pulls remain saved and pending');

        failDownload = false;
        assert.deepEqual(await page.evaluate(() => cloudSync(true)), { up: 1, down: 1 });
        const published = JSON.parse(drive.files.get('manifest').body);
        assert.deepEqual(published.chapters.find(chapter => chapter.id === 'a'), remote, 'retry keeps remote metadata and Drive id');
        assert.deepEqual(published.chapters.map(chapter => chapter.id).sort(), ['a', 'b', 'first']);
        const stored = await page.evaluate(() => wbAll(WB_CHAPTERS));
        assert.deepEqual(stored.map(chapter => chapter.id).sort(), ['a', 'b', 'first']);
        assert.equal(stored.find(chapter => chapter.id === 'a').content, 'NEW REMOTE BODY');
        assert.equal(drive.files.get(remote.driveId).body, 'NEW REMOTE BODY');
        assert.equal(drive.file('b.md').body, 'LOCAL B BODY');
        const count = drive.files.size;
        assert.deepEqual(await page.evaluate(() => cloudSync(true)), { up: 0, down: 0 });
        assert.equal(drive.files.size, count, 'repeated sync creates no duplicate files');
        assert.deepEqual(JSON.parse(drive.files.get('manifest').body).chapters.find(chapter => chapter.id === 'a'), remote);
        assert.deepEqual(errors, []);
        console.log('PASS failed pull preserves manifest and retries without duplicates: ' + (olderLocal ? 'older local chapter' : 'remote-only chapter'));
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise(resolve => srv.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

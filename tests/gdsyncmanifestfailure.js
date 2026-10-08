// An existing index must be readable and valid before sync changes either mirror.
// Run: node tests/gdsyncmanifestfailure.js (bundled headless Chromium, no network).
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fakeDrive, stub, serve, DIR } = require('./gdsync.js');

(async () => {
  const browser = await chromium.launch();
  const { srv, port } = await serve();
  try {
    const remoteBook = { id: 'remote-book', name: 'Remote', folder: 'remote',
      created: 1000, updated: 2000, order: 0, driveId: 'dir' };
    const remoteChapter = { id: 'remote-a', workbookId: remoteBook.id, title: 'Remote A',
      file: 'a.md', created: 1000, updated: 9000, order: 0, driveId: 'remote-file' };
    const valid = { v: 1, updated: 9000, books: [remoteBook], chapters: [remoteChapter],
      deleted: { gone: Date.now() } };
    const changed = mutate => {
      const manifest = structuredClone(valid);
      mutate(manifest);
      return JSON.stringify(manifest);
    };
    const cases = [
      { name: 'transient download failure', status: 503 },
      { name: 'manifest removed after lookup', status: 404 },
      { name: 'invalid JSON', body: '{invalid' },
      { name: 'null JSON', body: 'null' },
      { name: 'array JSON', body: '[]' },
      { name: 'empty object', body: '{}' },
      { name: 'unsupported version', body: changed(man => { man.v = 2; }) },
      { name: 'missing books', body: changed(man => { delete man.books; }) },
      { name: 'missing chapters', body: changed(man => { delete man.chapters; }) },
      { name: 'wrong collection type', body: changed(man => { man.chapters = {}; }) },
      { name: 'missing tombstones', body: changed(man => { delete man.deleted; }) },
      { name: 'invalid tombstones', body: changed(man => { man.deleted = []; }) },
      { name: 'invalid deletion stamp', body: changed(man => { man.deleted.gone = 'yesterday'; }) },
      { name: 'invalid record', body: changed(man => { man.books[0] = null; }) },
      { name: 'missing chapter id', body: changed(man => { delete man.chapters[0].id; }) },
      { name: 'missing download id', body: changed(man => { delete man.chapters[0].driveId; }) },
      { name: 'invalid revision stamp', body: changed(man => { man.chapters[0].updated = 'newer'; }) },
      { name: 'duplicate chapter id', body: changed(man => { man.chapters.push({ ...remoteChapter }); }) },
      { name: 'orphan chapter', body: changed(man => { man.chapters[0].workbookId = 'missing'; }) },
      { name: 'absent manifest', absent: true },
      { name: 'valid empty manifest', body: JSON.stringify({ v: 1, books: [], chapters: [], deleted: {} }), empty: true }
    ];
    for (const test of cases) {
      const original = test.body ?? JSON.stringify(valid);
      const drive = fakeDrive([
        { id: 'root', name: 'Scula Markdown', mimeType: DIR, parents: [] },
        { id: 'dir', name: 'remote', mimeType: DIR, parents: ['root'] },
        { id: remoteChapter.driveId, name: 'a.md', parents: ['dir'], body: 'REMOTE BODY' },
        ...(!test.absent ? [{ id: 'manifest', name: 'index.json', parents: ['root'], body: original }] : [])
      ]);
      const requests = [];
      const handle = drive.handle.bind(drive);
      let failing = true;
      drive.handle = request => {
        requests.push({ url: request.url(), method: request.method() });
        if (failing && test.status && request.url().endsWith('/manifest?alt=media')) {
          return { status: test.status, json: { error: { message: 'Manifest download failure' } } };
        }
        return handle(request);
      };
      const context = await browser.newContext();
      try {
        await context.route(/^https?:/, route => new URL(route.request().url()).hostname === '127.0.0.1'
          ? route.continue() : route.abort());
        await stub(context, drive);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${port}/index.html`);
        await page.waitForFunction(() => wbDraftReady);
        await page.evaluate(async () => {
          const book = { id: 'local-book', name: 'Local', folder: 'local', created: 1000, updated: 1000, order: 0 };
          wbBooks = [book];
          wbChapters = [
            { id: 'local-b', workbookId: book.id, title: 'Local B', file: 'b.md', content: 'LOCAL BODY',
              created: 1000, updated: 3000, order: 0 },
            { id: 'gone', workbookId: book.id, title: 'Deleted elsewhere', file: 'gone.md', content: 'OLD BODY',
              created: 1000, updated: 1000, order: 1 }
          ];
          await wbPut(WB_BOOKS, book);
          for (const chapter of wbChapters) await wbPut(WB_CHAPTERS, chapter);
          gsGraves = { 'local-grave': Date.now() };
          await wbMetaSet('deleted', gsGraves);
          wbCurrentId = null;
          gsToken = 'stub-token'; gsTokenExp = Date.now() + 3600e3;
        });
        const snapshot = () => page.evaluate(async () => ({
          books: wbBooks, chapters: wbChapters, storedBooks: await wbAll(WB_BOOKS),
          storedChapters: await wbAll(WB_CHAPTERS), graves: gsGraves,
          storedGraves: await wbMetaGet('deleted'), pending: [...wbPendingIds], lastAt: gsLastAt
        }));
        if (!test.absent && !test.empty) {
          const before = await snapshot();
          const result = await page.evaluate(async () => {
            let error = null;
            try { await cloudSync(true); } catch (e) { error = { message: e.message, status: e.status }; }
            return { error, busy: gsBusy, interactive: gsInteractive };
          });
          assert.ok(result.error, test.name + ' must abort sync');
          if (test.status) assert.equal(result.error.status, test.status);
          assert.equal(result.busy, false);
          assert.equal(result.interactive, false);
          assert.deepEqual(await snapshot(), before, 'invalid index must not merge records, deletions or success state');
          assert.equal(drive.files.get('manifest').body, original, 'existing index bytes must survive');
          assert.ok(requests.every(request => request.method === 'GET'), 'failure must precede all remote mutations');
          // Retry after the transient error resolves or a valid index is restored.
          failing = false;
          drive.files.get('manifest').body = JSON.stringify(valid);
          assert.deepEqual(await page.evaluate(() => cloudSync(true)), { up: 1, down: 2 });
          const published = JSON.parse(drive.files.get('manifest').body);
          assert.deepEqual(published.chapters.find(chapter => chapter.id === remoteChapter.id), remoteChapter);
          assert.deepEqual(published.chapters.map(chapter => chapter.id).sort(), ['local-b', 'remote-a']);
          assert.equal(published.deleted.gone, valid.deleted.gone, 'remote deletion history survives retry');
          assert.ok(published.deleted['local-grave'], 'local deletion history survives retry');
          const stored = await page.evaluate(() => wbAll(WB_CHAPTERS));
          assert.deepEqual(stored.map(chapter => chapter.id).sort(), ['local-b', 'remote-a']);
          assert.equal(stored.find(chapter => chapter.id === 'remote-a').content, 'REMOTE BODY');
        } else {
          assert.deepEqual(await page.evaluate(() => cloudSync(true)), { up: 2, down: 0 });
          assert.equal(JSON.parse(drive.file('index.json').body).chapters.length, 2);
        }
        const count = drive.files.size;
        assert.deepEqual(await page.evaluate(() => cloudSync(true)), { up: 0, down: 0 });
        assert.equal(drive.files.size, count, 'repeated sync must not duplicate files');
        assert.deepEqual(errors, []);
        console.log('PASS manifest validation and retry: ' + test.name);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise(resolve => srv.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

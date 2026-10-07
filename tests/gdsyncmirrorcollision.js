// Cloud adoption/rename must keep each note's durable local mirror path distinct.
// Run: node tests/gdsyncmirrorcollision.js (bundled Chromium, local server only).
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fakeDrive, stub, serve, DIR } = require('./gdsync.js');

async function mount(page, disk) {
  await page.evaluate(disk => {
    window.mirrorDisk = disk;
    ScuLaFolder.mode = () => 'folder';
    ScuLaFolder.name = () => 'Test';
    ScuLaFolder.subdir = () => 'markdown';
    ScuLaFolder.toast = () => {};
    ScuLaFolder.dir = async () => ({
      values: async function* () {},
      getDirectoryHandle: async folder => ({
        getFileHandle: async file => ({
          createWritable: async () => {
            let body;
            return {
              write: async blob => { body = await blob.text(); },
              close: async () => { window.mirrorDisk[(folder + '/' + file).toLowerCase()] = body; }
            };
          }
        })
      })
    });
    gsToken = 'stub-token'; gsTokenExp = Date.now() + 3600e3;
  }, disk);
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const books = await wbAll(WB_BOOKS), chapters = await wbAll(WB_CHAPTERS);
    return {
      books, chapters, disk: window.mirrorDisk,
      paths: Object.fromEntries(chapters.map(ch => [ch.id,
        books.find(book => book.id === ch.workbookId).folder + '/' + ch.file]))
    };
  });
}

(async () => {
  const { srv, port } = await serve();
  let browser;
  try {
    browser = await chromium.launch();
    for (const scenario of ['adopt', 'adopt-case', 'rename', 'move']) {
      const localBook = { id: 'device-a-book', name: 'Review', folder: 'Review',
        created: 1000, updated: 1000, order: 0 };
      const remoteBook = { id: 'device-b-book', name: 'Review', folder: scenario === 'adopt-case' ? 'review' : 'Review',
        created: 1000, updated: 9000, order: 1, driveId: 'dir-b' };
      const remoteChapters = [
        { id: 'device-b-note', workbookId: remoteBook.id, title: 'Different title', file: scenario === 'adopt-case' ? 'A.md' : 'a.md',
          created: 1000, updated: 9000, order: 0, driveId: 'remote-b' },
        { id: 'device-c-note', workbookId: localBook.id, title: 'Another title', file: 'a.md',
          created: 1000, updated: 9000, order: 1, driveId: 'remote-c' },
        { id: 'device-d-note', workbookId: localBook.id, title: 'Imported', file: 'Original name.txt',
          created: 1000, updated: 9000, order: 2, driveId: 'remote-d' }
      ];
      const drive = fakeDrive([
        { id: 'root', name: 'Scula Markdown', mimeType: DIR, parents: [] },
        { id: 'dir-a', name: 'Review', mimeType: DIR, parents: ['root'] },
        { id: 'dir-b', name: 'review', mimeType: DIR, parents: ['root'] },
        { id: 'manifest', name: 'index.json', parents: ['root'], body: JSON.stringify({
          v: 1, books: [{ ...localBook, driveId: 'dir-a' }, remoteBook], chapters: remoteChapters, deleted: {}
        }) },
        ...remoteChapters.map(ch => ({ id: ch.driveId, name: ch.file,
          parents: [ch.workbookId === localBook.id ? 'dir-a' : 'dir-b'], body: 'BODY ' + ch.id }))
      ]);
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
        await page.evaluate(async ({ localBook, remoteBook, remoteChapters, scenario }) => {
          wbBooks = [localBook];
          wbChapters = [{ id: 'device-a-note', workbookId: localBook.id, title: 'A', file: 'a.md',
            content: 'BODY device-a-note', created: 1000, updated: 1000, order: 0 }];
          if (!scenario.startsWith('adopt')) {
            wbBooks.push({ ...remoteBook, name: 'Before', folder: 'Before', updated: 1000 });
            wbChapters.push({ ...remoteChapters[1], file: 'before.md', content: 'BEFORE', updated: 1000,
              workbookId: scenario === 'move' ? remoteBook.id : localBook.id });
          }
          for (const book of wbBooks) await wbPut(WB_BOOKS, book);
          for (const ch of wbChapters) await wbPut(WB_CHAPTERS, ch);
        }, { localBook, remoteBook, remoteChapters, scenario });
        await mount(page, {});
        await page.evaluate(() => syncAllToFolder());
        const first = await snapshot(page);
        assert.equal(first.chapters.length, 4, 'all independent chapter IDs survive');
        assert.equal(new Set(Object.values(first.paths).map(path => path.toLowerCase())).size, 4,
          'case-insensitive mirror ownership must be unique');
        assert.equal(first.paths['device-a-note'], 'Review/a.md', 'existing owner keeps its path');
        assert.equal(first.paths['device-b-note'], remoteBook.folder + '-2/' + remoteChapters[0].file);
        assert.equal(first.paths['device-c-note'], 'Review/a-2.md', 'suffix follows the filename, not the title');
        assert.equal(first.paths['device-d-note'], 'Review/Original name.txt', 'unused imported names stay intact');
        for (const ch of first.chapters) assert.equal(first.disk[first.paths[ch.id].toLowerCase()], ch.content);
        const fileCount = drive.files.size;

        for (let pass = 0; pass < 2; pass++) {
          if (pass === 1) {
            await page.reload();
            await page.waitForFunction(() => wbDraftReady);
            await mount(page, first.disk);
          }
          await page.evaluate(() => syncAllToFolder());
          const next = await snapshot(page);
          assert.deepEqual(next.paths, first.paths, 'mirror ownership is stable across sync/reload');
          assert.deepEqual(next.disk, first.disk, 'each file retains its own body');
          assert.deepEqual(next.books, first.books, 'workbook records remain stable');
          assert.deepEqual(next.chapters, first.chapters, 'records remain stable');
          assert.equal(drive.files.size, fileCount, 'repeated sync does not duplicate cloud files');
        }
        assert.deepEqual(errors, []);
        console.log('PASS distinct and stable cloud mirror ownership: ' + scenario);
      } finally { await context.close(); }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => srv.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

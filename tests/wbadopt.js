// "Sincronizează în dosar" reading the folder back — the workbooks and
// chapters a person made on disk rather than in the page, and their trip up
// to the Gmail account (docs/FEATURES.md § E, § O).
//
// The mirror used to run one way. Now the button looks before it writes: a
// directory in <root>/markdown that matches no book.folder becomes a
// workbook, a .md/.txt inside one that matches no chapter.file becomes a
// chapter, and whatever was adopted is pushed to Drive in the same press.
//
// Two stubs, both of them real enough to assert on:
//   - the folder, an in-memory FileSystemDirectoryHandle behind
//     ScuLaFolder.dir() — values(), getDirectoryHandle, getFileHandle and a
//     writable that really keeps the bytes, so the write half of the sync is
//     checked against the same tree the read half walked;
//   - Drive, the in-memory fake from gdsync.js (shared, not copied), so the
//     manifest and the file bodies are the real ones the page uploads.
//
// Served over http, because gsLive() needs localStorage and Chrome gives a
// file:// page none.
//
//   node wbadopt.js        # from tests/, or /apptest wbadopt
const { chromium } = require('playwright');
const { fakeDrive, stub, serve, withToken } = require('./gdsync.js');

const CHROME = process.env.PW_CHROME_PATH || undefined;

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

// <root>/markdown as the person left it: one folder the page already knows
// (with a file it does not), one folder it has never seen, one empty folder,
// and one hidden directory that is not a workbook however it looks.
const TREE = {
  fizica: {
    'mecanica.md': '# Mecanica\nviteza',
    'optica.md': '# Optica\nlentile'
  },
  'chimie-organica': {
    'alcani.md': '# Alcani\nCH4',
    'note.txt': 'fără titlu, doar text',
    'schema.png': 'nu-i text'
  },
  'caiet-gol': {},
  '.git': { 'HEAD.md': 'nu' }
};

// The fake folder, installed over ScuLaFolder's three folder-route methods.
const mountFolder = (page, tree) => page.evaluate(t => {
  const stamp = Date.UTC(2024, 2, 3, 4, 5);
  function mkFile(name, text) {
    let body = text;
    return {
      kind: 'file', name: name,
      get body() { return body; },
      getFile: async () => new File([body], name, { type: 'text/markdown', lastModified: stamp }),
      createWritable: async () => ({
        write: async b => { body = typeof b === 'string' ? b : await b.text(); },
        close: async () => {}
      })
    };
  }
  function mkDir(name, node) {
    const kids = new Map();
    Object.keys(node).forEach(k => {
      kids.set(k, typeof node[k] === 'string' ? mkFile(k, node[k]) : mkDir(k, node[k]));
    });
    return {
      kind: 'directory', name: name, kids: kids,
      values: async function* () { for (const v of kids.values()) yield v; },
      async getDirectoryHandle(n, o) {
        if (kids.has(n)) return kids.get(n);
        if (!o || !o.create) throw new Error('NotFoundError ' + n);
        const d = mkDir(n, {}); kids.set(n, d); return d;
      },
      async getFileHandle(n, o) {
        if (kids.has(n)) return kids.get(n);
        if (!o || !o.create) throw new Error('NotFoundError ' + n);
        const f = mkFile(n, ''); kids.set(n, f); return f;
      },
      async removeEntry(n) { kids.delete(n); }
    };
  }
  const md = mkDir('markdown', t);
  window.__md = md;
  window.__disk = () => {
    const walk = d => {
      const o = {};
      for (const v of d.kids.values()) o[v.name] = v.kind === 'file' ? v.body : walk(v);
      return o;
    };
    return walk(md);
  };
  ScuLaFolder.mode = () => 'folder';
  ScuLaFolder.dir = async () => md;
  ScuLaFolder.name = () => 'Scula';
  ScuLaFolder.subdir = () => 'markdown';
}, tree);

// Empty IndexedDB, then one workbook that matches a folder on disk and owns
// exactly one of the two files in it.
const seed = page => page.evaluate(async () => {
  for (const c of wbChapters.slice()) { try { await wbDrop(WB_CHAPTERS, c.id); } catch (e) {} }
  for (const b of wbBooks.slice()) { try { await wbDrop(WB_BOOKS, b.id); } catch (e) {} }
  for (const r of (await wbAll(WB_PENDING)) || []) { try { await wbDrop(WB_PENDING, r.chapterId); } catch (e) {} }
  try { await wbMetaSet('deleted', {}); } catch (e) {}
  wbBooks.length = 0; wbChapters.length = 0; wbPendingIds.clear(); wbCurrentId = null;
  gsGraves = {};

  const book = { id: 'wb_fiz', name: 'Fizică', folder: 'fizica', created: 1000, updated: 1000, order: 0 };
  const ch = { id: 'ch_mec', workbookId: 'wb_fiz', title: 'Mecanica', file: 'mecanica.md',
               content: '# Mecanica\nviteza', created: 1000, updated: 2000, order: 0 };
  wbBooks.push(book); wbChapters.push(ch);
  await wbPut(WB_BOOKS, book);
  await wbPut(WB_CHAPTERS, ch);
  wbBooted = true; wbOpenBooks.add('wb_fiz');
  renderWorkbooks();
});

// What IndexedDB holds, read back out of the store rather than the arrays,
// so a record that never got persisted cannot pass.
const stored = page => page.evaluate(async () => {
  const books = (await wbAll(WB_BOOKS)) || [];
  const chaps = (await wbAll(WB_CHAPTERS)) || [];
  const byId = new Map(books.map(b => [b.id, b]));
  return {
    books: books.map(b => b.folder).sort(),
    names: books.map(b => b.name).sort(),
    chapters: chaps.map(c => ({
      folder: (byId.get(c.workbookId) || {}).folder,
      file: c.file, title: c.title, content: c.content
    })).sort((a, b) => (a.folder + '/' + a.file).localeCompare(b.folder + '/' + b.file))
  };
});

const statusLine = page => page.evaluate(() => document.getElementById('stat-wb').textContent);
const manifestOf = drive => {
  const f = [...drive.files.values()].find(x => x.name === 'index.json');
  if (!f) return null;
  try { return JSON.parse(f.body); } catch (e) { return null; }
};

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const { srv, port } = await serve();
  const BASE = `http://127.0.0.1:${port}/index.html`;

  // ---- 1. the read pass: what the folder had and the page did not --------
  {
    const drive = fakeDrive();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await stub(ctx, drive);            // connected, so the cloud half runs too
    await withToken(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
    await page.goto(BASE);
    await page.waitForTimeout(400);

    await seed(page);
    await mountFolder(page, TREE);

    const before = await stored(page);
    check('before the sync the page knows one workbook and one chapter',
      before.books.join() === 'fizica' && before.chapters.length === 1, before);

    // The real button, not the function behind it. The press is not over at
    // the first status line it writes — the cloud half follows — so wait for
    // the settled one, or the next press races this one's tail.
    await page.click('#btn-wb-sync');
    await page.waitForFunction(() => /Sincronizat/.test(document.getElementById('stat-wb').textContent),
                               null, { timeout: 15000 });

    const after = await stored(page);
    check('the folder nobody had opened became a workbook',
      after.books.includes('chimie-organica'), after.books);
    check('an empty folder is a workbook too',
      after.books.includes('caiet-gol'), after.books);
    check('a hidden directory is not',
      !after.books.includes('.git'), after.books);
    check('and the workbook it already had was not made a second time',
      after.books.filter(b => b === 'fizica').length === 1, after.books);
    check('the workbook is named after the folder',
      after.names.includes('chimie-organica'), after.names);

    const chap = f => after.chapters.find(c => c.file === f) || {};
    check('the .md beside a known chapter became a chapter',
      chap('optica.md').folder === 'fizica' && chap('optica.md').content === '# Optica\nlentile', chap('optica.md'));
    check('its title came out of its first heading',
      chap('optica.md').title === 'Optica', chap('optica.md').title);
    check('the .md in the new folder came in with it',
      chap('alcani.md').folder === 'chimie-organica' && chap('alcani.md').content === '# Alcani\nCH4', chap('alcani.md'));
    check('a .txt counts as a chapter as well',
      chap('note.txt').folder === 'chimie-organica' && chap('note.txt').content === 'fără titlu, doar text', chap('note.txt'));
    check('and with no heading it is named after its file',
      chap('note.txt').title === 'note', chap('note.txt').title);
    check('a file that is not text is left where it is',
      !after.chapters.some(c => c.file === 'schema.png'), after.chapters.map(c => c.file));
    check('the file inside the hidden directory never arrived',
      !after.chapters.some(c => c.file === 'HEAD.md'), after.chapters.map(c => c.file));
    check('four chapters in total',
      after.chapters.length === 4, after.chapters.map(c => c.folder + '/' + c.file));

    check('the status line counts what it found',
      /2 caiete, 3 capitole/.test(await statusLine(page)), await statusLine(page));
    check('and still counts what it wrote',
      /4 capitole scrise în dosar/.test(await statusLine(page)), await statusLine(page));

    check('the new chapters show up in the panel',
      await page.evaluate(() => [...document.querySelectorAll('.wb-book')].length) >= 3);

    // ---- 2. pressing it again finds nothing new -------------------------
    await page.evaluate(() => syncAllToFolder());
    await page.waitForTimeout(300);
    const twice = await stored(page);
    check('a second press adopts nothing twice',
      twice.chapters.length === 4 && twice.books.length === after.books.length, twice.books);
    check('and says so by not mentioning the folder at all',
      !/Găsite în dosar/.test(await statusLine(page)), await statusLine(page));

    check('no page errors', errors.length === 0, errors);
    await ctx.close();
  }

  // ---- 3. an edit made here is never overwritten by the file on disk ----
  {
    const drive = fakeDrive();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await stub(ctx, drive);
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForTimeout(400);
    await seed(page);
    await mountFolder(page, { fizica: { 'mecanica.md': 'ce era pe disc' } });

    await page.evaluate(async () => {
      const ch = wbChapter('ch_mec');
      ch.content = '# Mecanica\nviteza și accelerația';
      ch.updated = Date.now();
      await wbPut(WB_CHAPTERS, ch);
      await syncAllToFolder();
    });
    const s = await stored(page);
    check('the chapter kept the text it had here',
      s.chapters[0].content === '# Mecanica\nviteza și accelerația', s.chapters[0]);
    const disk = await page.evaluate(() => window.__disk());
    check('and the file on disk caught up with it',
      disk.fizica['mecanica.md'] === '# Mecanica\nviteza și accelerația', disk);
    await ctx.close();
  }

  // ---- 4. the same press carries the new records up to Drive ------------
  {
    const drive = fakeDrive();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await stub(ctx, drive);
    await withToken(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForTimeout(400);
    await seed(page);
    await mountFolder(page, TREE);
    await page.evaluate(() => syncAllToFolder());
    await page.waitForTimeout(600);

    const man = manifestOf(drive);
    check('a manifest reached Drive', !!man, man);
    const files = (man && man.chapters || []).map(c => c.file).sort();
    check('every adopted chapter is listed in it',
      files.join() === 'alcani.md,mecanica.md,note.txt,optica.md', files);
    const folders = (man && man.books || []).map(b => b.folder).sort();
    check('and so is every adopted workbook',
      folders.join() === 'caiet-gol,chimie-organica,fizica', folders);

    const alcani = (man.chapters || []).find(c => c.file === 'alcani.md');
    const body = alcani && drive.files.get(alcani.driveId);
    check('the chapter body went up, not just its name',
      !!body && body.body === '# Alcani\nCH4', body && body.body);

    check('the status line says what the cloud did',
      /trimise/.test(await statusLine(page)), await statusLine(page));
    await ctx.close();
  }

  // ---- 5. with no account linked nothing is asked of Google -------------
  {
    const drive = fakeDrive();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const hits = [];
    await stub(ctx, drive, hits);
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForTimeout(400);
    await seed(page);
    await mountFolder(page, TREE);
    await page.evaluate(() => syncAllToFolder());
    await page.waitForTimeout(500);

    const s = await stored(page);
    check('the folder is still read back without an account',
      s.chapters.length === 4, s.chapters.map(c => c.file));
    check('and Google was not contacted', hits.length === 0 && drive.files.size === 0, hits);
    await ctx.close();
  }

  await browser.close();
  srv.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();

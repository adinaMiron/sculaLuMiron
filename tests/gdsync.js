// Google Drive sync in index.html — the chapters following the Google account
// (docs/FEATURES.md § O).
//
// Nothing here talks to Google. accounts.google.com is answered with a stub
// script (which is also how the test proves it is fetched lazily), and
// www.googleapis.com is answered by a small in-memory fake Drive below: a
// files map, the four REST verbs the page uses, and multipart uploads parsed
// for real. So the whole path — connect, push, pull, newest-wins, tombstone,
// disconnect — is checked without a Google account.
//
// Served over http on a throwaway port, because every interesting state needs
// localStorage and Chrome gives a file:// page none. The file:// branch is
// checked too — that is the case the button has to explain rather than fail in.
//
//   node gdsync.js        # from tests/, or /apptest gdsync
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const ROOT = path.join(__dirname, '..');
const FILE_URL = 'file://' + path.join(ROOT, 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

function serve() {
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(ROOT, rel === '/' ? 'index.html' : rel);
    fs.readFile(f, (e, b) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      res.end(b);
    });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, port: srv.address().port })));
}

// ---- a fake Drive ---------------------------------------------------------
// Enough of drive/v3 for this page: list by name/parent/mimeType, read with
// alt=media, create a folder, rename, delete, and multipart create/update.
const DIR = 'application/vnd.google-apps.folder';

function parseMultipart(body, contentType) {
  const m = /boundary=(.+)$/.exec(contentType || '');
  if (!m) return null;
  const parts = body.split('--' + m[1].trim()).slice(1, -1).map(p => {
    const i = p.indexOf('\r\n\r\n');
    return i < 0 ? '' : p.slice(i + 4).replace(/\r\n$/, '');
  });
  // FormData appends metadata first, then the file — both are JSON-typed for
  // the manifest, so order is the only thing that tells them apart.
  let meta = {};
  try { meta = JSON.parse(parts[0] || '{}'); } catch (e) {}
  return { meta, body: parts[1] === undefined ? '' : parts[1] };
}

function fakeDrive(seed) {
  const files = new Map();          // id -> { id, name, mimeType, parents, body }
  let n = 0;
  const add = f => { files.set(f.id, f); return f; };
  (seed || []).forEach(add);
  const newId = () => 'f' + (++n);

  return {
    files,
    file: (name, parent) => [...files.values()].find(f => f.name === name && (!parent || (f.parents || []).includes(parent))),
    handle(req) {
      const url = new URL(req.url());
      const method = req.method();
      const p = url.pathname;

      // read a body
      let m = /^\/drive\/v3\/files\/([^/]+)$/.exec(p);
      if (m && method === 'GET' && url.searchParams.get('alt') === 'media') {
        const f = files.get(m[1]);
        return f ? { status: 200, type: 'text/plain', body: f.body || '' } : { status: 404, json: { error: { message: 'gone' } } };
      }
      if (m && method === 'PATCH') {                       // rename
        const f = files.get(m[1]);
        if (!f) return { status: 404, json: { error: { message: 'gone' } } };
        try { Object.assign(f, JSON.parse(req.postData() || '{}')); } catch (e) {}
        return { status: 200, json: { id: f.id, name: f.name } };
      }
      if (m && method === 'DELETE') { files.delete(m[1]); return { status: 204, body: '' }; }

      // list
      if (p === '/drive/v3/files' && method === 'GET') {
        let q = url.searchParams.get('q') || '';
        const nm = /name='((?:[^'\\]|\\.)*)'/.exec(q);
        const name = nm ? nm[1].replace(/\\'/g, "'") : null;
        q = q.replace(/name='(?:[^'\\]|\\.)*'/, '');
        const pa = /'([^']+)' in parents/.exec(q);
        const wantDir = q.includes(DIR);
        const hit = [...files.values()].filter(f =>
          (!name || f.name === name) &&
          (!pa || (f.parents || []).includes(pa[1])) &&
          (!wantDir || f.mimeType === DIR));
        return { status: 200, json: { files: hit.slice(0, 1).map(f => ({ id: f.id, name: f.name })) } };
      }

      // create a folder
      if (p === '/drive/v3/files' && method === 'POST') {
        let b = {};
        try { b = JSON.parse(req.postData() || '{}'); } catch (e) {}
        const f = { id: newId(), name: b.name, mimeType: b.mimeType, parents: b.parents || [], body: '' };
        files.set(f.id, f);
        return { status: 200, json: { id: f.id, name: f.name } };
      }

      // multipart create / update
      m = /^\/upload\/drive\/v3\/files(?:\/([^/]+))?$/.exec(p);
      if (m) {
        const parsed = parseMultipart(req.postData() || '', req.headers()['content-type']);
        if (!parsed) return { status: 400, json: { error: { message: 'bad multipart' } } };
        if (m[1]) {
          const f = files.get(m[1]);
          if (!f) return { status: 404, json: { error: { message: 'gone' } } };
          f.name = parsed.meta.name || f.name;
          f.body = parsed.body;
          return { status: 200, json: { id: f.id, name: f.name } };
        }
        const f = { id: newId(), name: parsed.meta.name, mimeType: 'text/plain',
                    parents: parsed.meta.parents || [], body: parsed.body };
        files.set(f.id, f);
        return { status: 200, json: { id: f.id, name: f.name } };
      }
      return { status: 404, json: { error: { message: 'no route: ' + method + ' ' + p } } };
    }
  };
}

async function stub(ctx, drive, hits) {
  await ctx.route('**://accounts.google.com/**', route => {
    if (hits) hits.push('gsi');
    route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.__gsi=1;' });
  });
  await ctx.route('**://apis.google.com/**', route => {
    if (hits) hits.push('gapi');
    route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.__gapi=1;' });
  });
  await ctx.route('**://www.googleapis.com/**', route => {
    const r = drive.handle(route.request());
    route.fulfill({
      status: r.status,
      contentType: r.json ? 'application/json' : (r.type || 'text/plain'),
      body: r.json ? JSON.stringify(r.json) : (r.body || '')
    });
  });
}

const withToken = ctx => ctx.addInitScript(() => {
  localStorage.setItem('gdrive_token', 'stub-token');
  localStorage.setItem('gdrive_token_exp', String(Date.now() + 3600e3));
});

const btnState = page => page.evaluate(() => {
  const b = document.getElementById('btn-wb-cloud');
  const w = document.getElementById('wb-cloud-where');
  return b && { label: b.textContent, title: b.title, connected: b.classList.contains('connected'), where: w && w.textContent };
});
const toastText = page => page.evaluate(() => {
  const t = document.getElementById('scula-toast');
  return t && t.classList.contains('show') ? t.textContent : null;
});

// Clear IndexedDB, then put one workbook with two chapters in it.
const seed = page => page.evaluate(async () => {
  for (const c of wbChapters.slice()) { try { await wbDrop(WB_CHAPTERS, c.id); } catch (e) {} }
  for (const b of wbBooks.slice()) { try { await wbDrop(WB_BOOKS, b.id); } catch (e) {} }
  for (const r of (await wbAll(WB_PENDING)) || []) { try { await wbDrop(WB_PENDING, r.chapterId); } catch (e) {} }
  try { await wbMetaSet('deleted', {}); } catch (e) {}
  wbBooks.length = 0; wbChapters.length = 0; wbPendingIds.clear(); wbCurrentId = null;
  gsGraves = {};

  const book = { id: 'wb_fiz', name: 'Fizică', folder: 'fizica', created: 1000, updated: 1000, order: 0 };
  const chs = [
    { id: 'ch_mec', workbookId: 'wb_fiz', title: 'Mecanica', file: 'mecanica.md', content: '# Mecanica\nviteza', created: 1000, updated: 2000, order: 0 },
    { id: 'ch_opt', workbookId: 'wb_fiz', title: 'Optica',   file: 'optica.md',   content: '# Optica\nlentile',  created: 1000, updated: 2000, order: 1 },
  ];
  wbBooks.push(book); wbChapters.push(...chs);
  await wbPut(WB_BOOKS, book);
  for (const c of chs) await wbPut(WB_CHAPTERS, c);
  wbBooted = true; wbOpenBooks.add('wb_fiz');
  renderWorkbooks();
});

const wipe = page => page.evaluate(async () => {
  for (const c of wbChapters.slice()) { try { await wbDrop(WB_CHAPTERS, c.id); } catch (e) {} }
  for (const b of wbBooks.slice()) { try { await wbDrop(WB_BOOKS, b.id); } catch (e) {} }
  try { await wbMetaSet('deleted', {}); } catch (e) {}
  wbBooks.length = 0; wbChapters.length = 0; wbPendingIds.clear(); wbCurrentId = null;
  gsGraves = {};
  renderWorkbooks();
});

const manifestOf = drive => {
  const f = [...drive.files.values()].find(x => x.name === 'index.json');
  if (!f) return null;
  try { return JSON.parse(f.body); } catch (e) { return null; }
};

async function fresh(browser, drive, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const hits = [];
  await stub(ctx, drive, hits);
  if (opts.token !== false) await withToken(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text())) return;
    errors.push('CONSOLE ' + m.text());
  });
  return { ctx, page, errors, hits };
}

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const { srv, port } = await serve();
  const BASE = `http://127.0.0.1:${port}/index.html`;

  // ---- 1. disconnected: the button says so, and asks Google for nothing ----
  {
    const drive = fakeDrive();
    const { ctx, page, errors, hits } = await fresh(browser, drive, { token: false });
    await page.goto(BASE);
    await page.waitForTimeout(500);
    await page.evaluate(() => { if (document.getElementById('wb-panel').classList.contains('collapsed')) toggleWorkbooks(); });

    check('no page errors on load', errors.length === 0, errors);
    check('the button lives in the workbooks panel',
      await page.evaluate(() => !!document.querySelector('#wb-panel #btn-wb-cloud')));
    const st = await btnState(page);
    check('starts disconnected, Romanian label', st.label === '☁ Cont Google' && st.connected === false, st);
    check('and says the chapters are local only', st.where === '☁ doar pe acest dispozitiv', st.where);
    check('no Google script, and no Drive call, on page load', hits.length === 0 && drive.files.size === 0, hits);

    // the language toggle repaints it, even though applyUILang() runs first
    await page.click('#navLangBtn');
    await page.waitForTimeout(200);
    const en = await btnState(page);
    check('English after the toggle', en.label === '☁ Google account' && en.where === '☁ this device only', en);
    await page.click('#navLangBtn');
    await page.waitForTimeout(200);

    // the click is what fetches Google Identity Services
    await page.click('#btn-wb-cloud');
    await page.waitForTimeout(500);
    check('clicking loads gsi/client, lazily', hits.includes('gsi'), hits);
    await ctx.close();
  }

  // ---- 2. off disk, it explains rather than opening a doomed popup ----
  {
    const drive = fakeDrive();
    const { ctx, page, hits } = await fresh(browser, drive, { token: false });
    await page.goto(FILE_URL);
    await page.waitForTimeout(400);
    await page.evaluate(() => { if (document.getElementById('wb-panel').classList.contains('collapsed')) toggleWorkbooks(); });
    await page.click('#btn-wb-cloud');
    await page.waitForTimeout(300);
    check('file:// is refused with a reason', (await toastText(page) || '').includes('file://'), await toastText(page));
    check('and nothing is fetched from Google there', hits.length === 0, hits);
    await ctx.close();
  }

  // ---- 3. the push: a workbook and its chapters land in Drive as .md ----
  let pushed = null;
  {
    const drive = fakeDrive();
    const { ctx, page, errors } = await fresh(browser, drive);
    await page.goto(BASE);
    await page.waitForTimeout(600);          // the boot sync runs first, on an empty tree
    await seed(page);
    await page.evaluate(() => { if (document.getElementById('wb-panel').classList.contains('collapsed')) toggleWorkbooks(); });
    await page.click('#btn-wb-cloud');
    await page.waitForTimeout(900);

    check('no page errors through a sync', errors.length === 0, errors);
    const root = drive.file('Scula Markdown');
    const bookDir = drive.file('fizica');
    const mec = drive.file('mecanica.md');
    const opt = drive.file('optica.md');
    check('it creates its own root folder', !!root && root.mimeType === DIR, root && root.name);
    check('one folder per workbook, under it', !!bookDir && bookDir.parents.includes(root.id), bookDir);
    check('one .md per chapter, under the workbook', !!mec && !!opt && mec.parents.includes(bookDir.id), [mec && mec.name, opt && opt.name]);
    check('with the chapter text in it, verbatim', mec && mec.body === '# Mecanica\nviteza', mec && mec.body);
    check('diacritics survive the round trip', !!drive.file('index.json') && JSON.stringify(manifestOf(drive)).includes('Fizică'));

    const man = manifestOf(drive);
    pushed = man;
    check('the manifest carries both chapters, by their real ids',
      !!man && man.chapters.map(c => c.id).sort().join(',') === 'ch_mec,ch_opt', man && man.chapters);
    check('and the Drive file id to overwrite next time',
      !!man && man.chapters.every(c => !!c.driveId), man && man.chapters);
    check('and the workbook, with its folder id',
      !!man && man.books.length === 1 && man.books[0].driveId === bookDir.id, man && man.books);
    check('the status line reports the time', /^☁ sincronizat la /.test((await btnState(page)).where), (await btnState(page)).where);
    check('and the button is lit', (await btnState(page)).connected === true);

    // a second sync with nothing changed moves nothing
    const before = mec.body;
    await page.click('#btn-wb-cloud');
    await page.waitForTimeout(700);
    check('a second sync says there is nothing to do',
      (await toastText(page) || '').includes('nimic de schimbat'), await toastText(page));
    check('and does not rewrite the files', drive.file('mecanica.md').body === before);
    await ctx.close();
  }

  // ---- 4. the pull: another browser, empty database, same account ----
  {
    const drive = fakeDrive();
    // rebuild the Drive contents of test 3 by re-running the push
    {
      const { ctx, page } = await fresh(browser, drive);
      await page.goto(BASE);
      await page.waitForTimeout(600);
      await seed(page);
      await page.evaluate(() => cloudSync(true));
      await page.waitForTimeout(700);
      await ctx.close();
    }
    check('the fixture Drive has both chapters', !!drive.file('mecanica.md') && !!drive.file('optica.md'));

    const { ctx, page, errors } = await fresh(browser, drive);
    await page.goto(BASE);
    await page.waitForTimeout(400);
    await wipe(page);                      // this browser has never seen them
    await page.evaluate(() => cloudSync(true));
    await page.waitForTimeout(900);

    check('no page errors through a pull', errors.length === 0, errors);
    const got = await page.evaluate(() => ({
      books: wbBooks.map(b => b.name),
      chapters: wbChapters.map(c => ({ id: c.id, title: c.title, file: c.file, content: c.content })).sort((a, b) => a.id < b.id ? -1 : 1),
      pending: [...wbPendingIds].sort(),
      stored: null
    }));
    check('the workbook arrives, with its name', got.books.join() === 'Fizică', got.books);
    check('both chapters arrive, with their ids', got.chapters.map(c => c.id).join() === 'ch_mec,ch_opt', got.chapters.map(c => c.id));
    check('and their text', got.chapters[0].content === '# Mecanica\nviteza', got.chapters[0]);
    check('a pulled chapter is marked pending, so the folder mirror catches up',
      got.pending.join() === 'ch_mec,ch_opt', got.pending);
    check('and it is in IndexedDB, not only in memory',
      (await page.evaluate(async () => ((await wbAll(WB_CHAPTERS)) || []).length)) === 2);
    check('the panel shows the workbook',
      (await page.evaluate(() => document.getElementById('wb-tree').textContent)).includes('Fizică'));
    await ctx.close();
  }

  // ---- 5. newest `updated` wins, in both directions ----
  {
    const drive = fakeDrive();
    {
      const { ctx, page } = await fresh(browser, drive);
      await page.goto(BASE);
      await page.waitForTimeout(600);
      await seed(page);
      await page.evaluate(() => cloudSync(true));
      await page.waitForTimeout(700);
      await ctx.close();
    }

    // (a) the other browser edited it later — ours is replaced
    const { ctx, page } = await fresh(browser, drive);
    await page.goto(BASE);
    await page.waitForTimeout(400);
    await seed(page);
    {
      // make the remote copy the newer one, the way the other browser would
      const man = manifestOf(drive);
      const mec = man.chapters.find(c => c.id === 'ch_mec');
      mec.updated = 9000;
      drive.files.get(mec.driveId).body = '# Mecanica\nrescris de pe alt calculator';
      [...drive.files.values()].find(f => f.name === 'index.json').body = JSON.stringify(man);
    }
    await page.evaluate(() => cloudSync(true));
    await page.waitForTimeout(800);
    check('a newer remote chapter replaces the local one',
      (await page.evaluate(() => wbChapter('ch_mec').content)) === '# Mecanica\nrescris de pe alt calculator',
      await page.evaluate(() => wbChapter('ch_mec').content));
    check('and the untouched one is left alone',
      (await page.evaluate(() => wbChapter('ch_opt').content)) === '# Optica\nlentile');

    // (b) we edit it later still — ours goes up
    await page.evaluate(() => {
      const ch = wbChapter('ch_mec');
      ch.content = '# Mecanica\nscris aici, mai tarziu';
      ch.updated = 99000;
      return wbPut(WB_CHAPTERS, ch);
    });
    await page.evaluate(() => cloudSync(true));
    await page.waitForTimeout(800);
    check('a newer local chapter overwrites the remote file',
      drive.file('mecanica.md').body === '# Mecanica\nscris aici, mai tarziu', drive.file('mecanica.md').body);
    check('and the manifest follows its stamp',
      manifestOf(drive).chapters.find(c => c.id === 'ch_mec').updated === 99000);

    // (c) a rename moves the Drive file rather than duplicating it
    const idBefore = manifestOf(drive).chapters.find(c => c.id === 'ch_mec').driveId;
    await page.evaluate(() => renameChapter('ch_mec', 'Cinematica'));
    await page.waitForTimeout(200);
    await page.evaluate(() => cloudSync(true));
    await page.waitForTimeout(800);
    check('a renamed chapter keeps its Drive file',
      manifestOf(drive).chapters.find(c => c.id === 'ch_mec').driveId === idBefore);
    // wbSlug() keeps the case it was given, so the file is Cinematica.md.
    check('under the new name, with no duplicate left behind',
      !!drive.file('Cinematica.md') && !drive.file('mecanica.md'),
      [...drive.files.values()].map(f => f.name));
    await ctx.close();
  }

  // ---- 6. a delete travels, and does not come back ----
  {
    const drive = fakeDrive();
    {
      const { ctx, page } = await fresh(browser, drive);
      await page.goto(BASE);
      await page.waitForTimeout(600);
      await seed(page);
      await page.evaluate(() => cloudSync(true));
      await page.waitForTimeout(700);
      await ctx.close();
    }
    const gone = manifestOf(drive).chapters.find(c => c.id === 'ch_opt').driveId;

    const { ctx, page } = await fresh(browser, drive);
    page.on('dialog', d => d.accept());
    await page.goto(BASE);
    await page.waitForTimeout(400);
    await seed(page);
    await page.evaluate(() => deleteChapter('ch_opt'));
    await page.waitForTimeout(300);
    check('deleting records a tombstone', await page.evaluate(() => !!gsGraves['ch_opt']));
    await page.evaluate(() => cloudSync(true));
    await page.waitForTimeout(800);
    check('the sync trashes the remote file', !drive.files.has(gone), [...drive.files.values()].map(f => f.name));
    check('and drops it from the manifest',
      manifestOf(drive).chapters.map(c => c.id).join() === 'ch_mec', manifestOf(drive).chapters.map(c => c.id));
    check('the grave rides along in the manifest', !!manifestOf(drive).deleted['ch_opt']);
    await ctx.close();

    // the other browser, which still has it, drops it too instead of pushing it back
    const other = await fresh(browser, drive);
    await other.page.goto(BASE);
    await other.page.waitForTimeout(400);
    await seed(other.page);
    await other.page.evaluate(() => cloudSync(true));
    await other.page.waitForTimeout(800);
    check('the other browser deletes its copy rather than resurrecting it',
      (await other.page.evaluate(() => wbChapters.map(c => c.id).join())) === 'ch_mec',
      await other.page.evaluate(() => wbChapters.map(c => c.id)));
    check('and it stays out of the manifest',
      manifestOf(drive).chapters.map(c => c.id).join() === 'ch_mec');
    await other.ctx.close();
  }

  // ---- 7. disconnecting ----
  {
    const drive = fakeDrive();
    const { ctx, page } = await fresh(browser, drive);
    page.on('dialog', d => d.accept());
    await page.goto(BASE);
    await page.waitForTimeout(600);
    await page.evaluate(() => { if (document.getElementById('wb-panel').classList.contains('collapsed')) toggleWorkbooks(); });
    await page.evaluate(() => cloudSync(true));
    await page.waitForTimeout(600);
    check('connected before', (await btnState(page)).connected === true);
    await page.click('#btn-wb-cloud', { button: 'right' });
    await page.waitForTimeout(300);
    const after = await btnState(page);
    check('right-click disconnects', after.connected === false && after.label === '☁ Cont Google', after);
    check('and it says the chapters are local again', after.where === '☁ doar pe acest dispozitiv', after.where);
    check('token and folder cleared from storage',
      await page.evaluate(() => !localStorage.getItem('gdrive_token') && !localStorage.getItem('gdrive_md_folder')));
    check('and it says so', (await toastText(page) || '').includes('deconectat'), await toastText(page));
    await ctx.close();
  }

  await browser.close();
  srv.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();

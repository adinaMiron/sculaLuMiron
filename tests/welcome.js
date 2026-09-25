// The first run on a new device (docs/FEATURES.md § E "A new device"): the
// modal that asks for a folder, then whether to bring the chapters down
// from the Google account — and, when the answer is yes, the chapters in
// Drive arriving in IndexedDB and in the folder in that one click.
//
// The folder is an in-memory directory handle handed back by a stubbed
// ScuLaFolder.pick(); Drive is the in-memory fake from gdsync.js. Served
// over http, because the cloud half refuses file://.
//
//   node welcome.js        # from tests/, or /apptest welcome
const { chromium } = require('playwright');
const { fakeDrive, stub, serve, DIR } = require('./gdsync.js');

const CHROME = process.env.PW_CHROME_PATH || undefined;

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

// Drive as another device left it.
const cloudFixture = () => {
  const drive = fakeDrive([
    { id: 'root', name: 'Scula Markdown', mimeType: DIR, parents: [], body: '' },
    { id: 'dirA', name: 'fizica', mimeType: DIR, parents: ['root'], body: '' },
    { id: 'fm', name: 'mecanica.md', mimeType: 'text/plain', parents: ['dirA'], body: '# Mecanica\nviteza' },
  ]);
  drive.files.set('man', { id: 'man', name: 'index.json', mimeType: 'text/plain', parents: ['root'], mtime: 5000,
    body: JSON.stringify({ v: 1, deleted: {},
      books: [{ id: 'wb_fiz', name: 'Fizică', folder: 'fizica', updated: 1000, driveId: 'dirA' }],
      chapters: [{ id: 'ch_mec', workbookId: 'wb_fiz', title: 'Mecanica', file: 'mecanica.md', updated: 2000, driveId: 'fm' }] }) });
  return drive;
};

// A picker that "chooses" an empty in-memory folder; until it is used the
// device has no folder at all, as a new phone would not.
const stubPicker = page => page.evaluate(() => {
  function mkFile(name) {
    let body = '';
    return { kind: 'file', name, get body() { return body; },
      getFile: async () => new File([body], name),
      createWritable: async () => ({ write: async b => { body = typeof b === 'string' ? b : await b.text(); }, close: async () => {} }) };
  }
  function mkDir(name) {
    const kids = new Map();
    return { kind: 'directory', name, kids,
      values: async function* () { for (const v of kids.values()) yield v; },
      async getDirectoryHandle(n, o) { if (!kids.has(n)) { if (!o || !o.create) throw new Error('NotFound'); kids.set(n, mkDir(n)); } return kids.get(n); },
      async getFileHandle(n, o) { if (!kids.has(n)) { if (!o || !o.create) throw new Error('NotFound'); kids.set(n, mkFile(n)); } return kids.get(n); } };
  }
  const md = mkDir('markdown');
  let chosen = false;
  window.__disk = () => {
    const walk = d => { const o = {}; for (const v of d.kids.values()) o[v.name] = v.kind === 'file' ? v.body : walk(v); return o; };
    return walk(md);
  };
  ScuLaFolder.supported = () => true;
  ScuLaFolder.pick = async () => { chosen = true; return { name: 'Scula' }; };
  ScuLaFolder.isSet = () => chosen;
  ScuLaFolder.mode = () => chosen ? 'folder' : 'download';
  ScuLaFolder.name = () => chosen ? 'Scula' : null;
  ScuLaFolder.dir = async () => chosen ? md : null;
  ScuLaFolder.subdir = () => 'markdown';
});

const isOpen = page => page.evaluate(() => document.getElementById('welcome-modal').classList.contains('open'));

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const { srv, port } = await serve();
  const BASE = `http://127.0.0.1:${port}/index.html`;

  // ---- 1. a new device: folder, then yes ----------------------------------
  {
    const drive = cloudFixture();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await stub(ctx, drive);
    await ctx.addInitScript(() => { window.__gsiAnswer = 'grant'; window.__sculaWelcome = true; });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
    await page.goto(BASE);
    await page.waitForFunction(() => document.getElementById('welcome-modal').classList.contains('open'), null, { timeout: 5000 })
      .catch(() => {});
    check('an empty device opens the welcome modal', await isOpen(page));
    check('it asks for the folder first',
      await page.isVisible('#btn-welcome-folder') && !(await page.isVisible('#btn-welcome-yes')));
    await stubPicker(page);
    await page.click('#btn-welcome-folder');
    check('a chosen folder moves on to the cloud question', await page.isVisible('#btn-welcome-yes'));
    check('which names the folder',
      /Scula/.test(await page.textContent('#welcome-cloud-text')), await page.textContent('#welcome-cloud-text'));
    await page.click('#btn-welcome-yes');
    check('the modal closes on the answer', !(await isOpen(page)));
    await page.waitForFunction(() => /Sincronizat/.test(document.getElementById('stat-wb').textContent), null, { timeout: 15000 })
      .catch(() => {});
    const disk = await page.evaluate(() => window.__disk());
    check('the chapter in Drive reached the folder',
      !!disk.fizica && disk.fizica['mecanica.md'] === '# Mecanica\nviteza', disk);
    check('and IndexedDB', await page.evaluate(() => wbChapters.length === 1 && wbChapters[0].file === 'mecanica.md'));
    check('the Google account is connected', await page.evaluate(() => gsConnected()));

    await page.reload();
    await page.waitForTimeout(800);
    check('a second load does not ask again', !(await isOpen(page)));
    check('no page errors', errors.length === 0, errors);
    await ctx.close();
  }

  // ---- 2. later, then no: nothing is signed in to -------------------------
  {
    const drive = cloudFixture();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const hits = [];
    await stub(ctx, drive, hits);
    await ctx.addInitScript(() => { window.__sculaWelcome = true; });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForFunction(() => document.getElementById('welcome-modal').classList.contains('open'), null, { timeout: 5000 })
      .catch(() => {});
    await page.click('#btn-welcome-later');
    await page.click('#btn-welcome-no');
    await page.waitForTimeout(400);
    check('no closes the modal', !(await isOpen(page)));
    check('and nothing came from Drive', await page.evaluate(() => wbChapters.length === 0 && !gsConnected()));
    await ctx.close();
  }

  // ---- 3. automated browsers are not asked unless they say so ------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForTimeout(800);
    check('without __sculaWelcome the modal stays shut', !(await isOpen(page)));
    check('the sync button sits in the header beside ☁',
      await page.evaluate(() => {
        const s = document.getElementById('btn-wb-sync');
        return !!s && !s.closest('#wb-panel') && s.nextElementSibling && s.nextElementSibling.id === 'btn-wb-cloud';
      }));
    await ctx.close();
  }

  await browser.close();
  srv.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();

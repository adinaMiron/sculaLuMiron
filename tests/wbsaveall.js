// "Save all modified" + the pending-edit tracking in index.html.
//
// Every chapter you edit is autosaved to IndexedDB and also recorded in
// wbPendingIds / the `pending` object store until its .md file is written.
// "Save to workbook" (Ctrl+S) clears the marker for the open chapter;
// "Save all modified" (📚 button / Ctrl+Alt+S) writes every pending chapter
// and clears them all. The list survives a reload.
//
// Drives the real page off disk like wbrename.js, and asserts on the real
// wbPendingIds set, the real `pending` store, and the real panel DOM. No
// folder is set, so the mirror is a no-op — this is the store-side contract.
//
//   node wbsaveall.js        # from tests/
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

const seed = async page => page.evaluate(async () => {
  // wipe any leftovers from a previous run
  for (const c of wbChapters.slice()) { try { await wbDrop(WB_CHAPTERS, c.id); } catch (e) {} }
  for (const b of wbBooks.slice()) { try { await wbDrop(WB_BOOKS, b.id); } catch (e) {} }
  for (const r of (await wbAll(WB_PENDING)) || []) { try { await wbDrop(WB_PENDING, r.chapterId); } catch (e) {} }
  wbBooks.length = 0; wbChapters.length = 0; wbPendingIds.clear();
  wbCurrentId = null;

  const book = { id: 'wb_fiz', name: 'Fizica', folder: 'fizica', created: 1, updated: 1, order: 0 };
  const chs = [
    { id: 'ch_mec', workbookId: 'wb_fiz', title: 'Mecanica', file: 'mecanica.md', content: 'a', created: 1, updated: 1, order: 0 },
    { id: 'ch_opt', workbookId: 'wb_fiz', title: 'Optica',   file: 'optica.md',   content: 'b', created: 1, updated: 1, order: 1 },
  ];
  wbBooks.push(book); wbChapters.push(...chs);
  await wbPut(WB_BOOKS, book);
  for (const c of chs) await wbPut(WB_CHAPTERS, c);
  wbBooted = true;
  wbOpenBooks.add('wb_fiz');
  invalidateWikiIndex();
  renderWorkbooks();
  if (document.getElementById('wb-panel').classList.contains('collapsed')) toggleWorkbooks();
});

const pending = page => page.evaluate(async () => ({
  set: [...wbPendingIds].sort(),
  store: ((await wbAll(WB_PENDING)) || []).map(r => r.chapterId).sort(),
}));

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text())) return;
    errors.push('CONSOLE ' + m.text());
  });
  await page.goto(URL);
  await page.waitForTimeout(300);
  await seed(page);
  await page.waitForTimeout(150);

  const openChapterEval = id => page.evaluate(i => openChapter(i), id);
  const type = async txt => {
    await page.locator('#editor').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type(txt);
  };

  // ── edit a chapter → it goes pending (set + store), and the panel shows a dot ──
  await openChapterEval('ch_mec');
  await type('Mecanica newtoniana');
  await page.waitForTimeout(1100);                       // clear the 800 ms autosave debounce
  let p = await pending(page);
  check('edited chapter is in wbPendingIds', p.set.includes('ch_mec'), p);
  check('edited chapter is written to the pending store', p.store.includes('ch_mec'), p);
  check('panel marks the chapter row modified',
    await page.locator('.wb-ch-row.modified .wb-ch-name[data-wb-id="ch_mec"]').count() === 1);
  check('panel marks the workbook row has-modified',
    await page.locator('.wb-book-row.has-modified').count() === 1);

  // ── Ctrl+S (save to workbook) clears only the open chapter ──
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(200);
  p = await pending(page);
  check('Ctrl+S clears the open chapter from the set', !p.set.includes('ch_mec'), p);
  check('Ctrl+S clears it from the pending store', !p.store.includes('ch_mec'), p);
  check('dot is gone from the panel',
    await page.locator('.wb-ch-row.modified').count() === 0);

  // ── edit both chapters, then "Save all modified" ──
  await openChapterEval('ch_mec');
  await type('Mecanica v2');
  await page.waitForTimeout(1100);
  await openChapterEval('ch_opt');                       // switching flushes ch_mec
  await type('Optica v2');
  await page.waitForTimeout(1100);
  p = await pending(page);
  check('both edited chapters are pending before saving', p.set.join(',') === 'ch_mec,ch_opt', p);

  await page.keyboard.press('Control+Alt+s');
  await page.waitForTimeout(300);
  p = await pending(page);
  check('Save all modified empties the set', p.set.length === 0, p);
  check('Save all modified empties the pending store', p.store.length === 0, p);
  check('content of both chapters is persisted', await page.evaluate(() =>
    wbChapter('ch_mec').content === 'Mecanica v2' && wbChapter('ch_opt').content === 'Optica v2'));

  // ── the list survives a reload ──
  await openChapterEval('ch_opt');
  await type('Optica v3');
  await page.waitForTimeout(1100);
  await page.reload();
  await page.waitForTimeout(500);
  p = await pending(page);
  check('a pending marker survives a page reload', p.set.includes('ch_opt'), p);

  check('no page errors', errors.length === 0, errors);

  await browser.close();
  console.log(failed ? '\n' + failed + ' FAILED' : '\nall good');
  process.exit(failed ? 1 : 0);
})();

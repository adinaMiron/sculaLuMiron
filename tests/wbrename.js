// Inline rename of workbook / chapter names in index.html.
//
// A name span (.wb-book-name / .wb-ch-name) renames on a double-click, or on
// one click followed by F2. Enter / blur commits, Escape restores. A plain
// single click still toggles the workbook open / opens the chapter, just a
// beat later so the double-click can pre-empt it.
//
// Drives the real panel off disk like find.js / graph.js / nav.js, and asserts
// on the real wbBooks / wbChapters records and the real DOM.
//
//   node wbrename.js        # from tests/
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

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

  // One workbook, two chapters, straight into module state; open the panel.
  await page.evaluate(() => {
    wbBooks.length = 0;
    wbChapters.length = 0;
    wbBooks.push({ id: 'wb_fiz', name: 'Fizica', folder: 'fizica', created: 1, updated: 1, order: 0 });
    wbChapters.push(
      { id: 'ch_mec', workbookId: 'wb_fiz', title: 'Mecanica', file: 'mecanica.md', content: '', created: 1, updated: 1, order: 0 },
      { id: 'ch_opt', workbookId: 'wb_fiz', title: 'Optica', file: 'optica.md', content: '', created: 1, updated: 1, order: 1 });
    wbBooted = true;
    wbOpenBooks.add('wb_fiz');
    invalidateWikiIndex();
    renderWorkbooks();
    if (document.getElementById('wb-panel').classList.contains('collapsed')) toggleWorkbooks();
  });
  await page.waitForTimeout(150);

  const bookName = () => page.locator('.wb-book-name[data-wb-id="wb_fiz"]');
  const chName = id => page.locator('.wb-ch-name[data-wb-id="' + id + '"]');
  const editing = loc => loc.evaluate(el => el.getAttribute('contenteditable') === 'true');
  const rec = () => page.evaluate(() => ({
    book: wbBook('wb_fiz').name,
    mec: wbChapter('ch_mec').title,
    opt: wbChapter('ch_opt') && wbChapter('ch_opt').title,
    optFile: wbChapter('ch_opt') && wbChapter('ch_opt').file
  }));

  // ── double-click a chapter name → edit, type, Enter → committed ──
  await chName('ch_opt').dblclick();
  check('double-click opens the chapter name for editing', await editing(chName('ch_opt')));
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Unde si lentile');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  let r = await rec();
  check('Enter commits the new chapter title', r.opt === 'Unde si lentile', r);
  check('the file name follows the title', r.optFile === 'Unde-si-lentile.md', r);
  check('the span is no longer editable', !(await editing(chName('ch_opt'))));

  // ── Escape restores ──
  await chName('ch_mec').dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Complet gresit');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  r = await rec();
  check('Escape leaves the chapter title untouched', r.mec === 'Mecanica', r);

  // ── one click then F2 → edit; blur commits ──
  await bookName().click();
  await page.waitForTimeout(300);            // let the delayed single-click toggle settle
  await page.keyboard.press('F2');
  check('one click then F2 opens the workbook name for editing', await editing(bookName()));
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Fizica avansata');
  await bookName().evaluate(el => el.blur());
  await page.waitForTimeout(150);
  r = await rec();
  check('blur commits the new workbook name', r.book === 'Fizica avansata', r);

  // ── a plain single click still toggles the workbook ──
  await page.evaluate(() => wbOpenBooks.delete('wb_fiz'));
  await page.evaluate(() => renderWorkbooks());
  await bookName().click();
  await page.waitForTimeout(350);
  check('a lone click still toggles the workbook open',
    await page.evaluate(() => wbOpenBooks.has('wb_fiz')));

  // ── a single click still opens a chapter ──
  await chName('ch_mec').click();
  await page.waitForTimeout(350);
  check('a lone click still opens the chapter',
    await page.evaluate(() => wbCurrentId === 'ch_mec'));

  // ── empty edit is rejected ──
  await chName('ch_mec').dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  r = await rec();
  check('an emptied name is not committed', r.mec === 'Mecanica', r);

  check('no page errors', errors.length === 0, errors);

  await browser.close();
  console.log(failed ? '\n' + failed + ' FAILED' : '\nall good');
  process.exit(failed ? 1 : 0);
})();

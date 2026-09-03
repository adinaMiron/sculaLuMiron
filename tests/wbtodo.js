// The TODO filter in index.html's workbook panel.
//
// A workbook whose name contains "TODO" (case-insensitive) gets an extra
// act button (☑) in its row. Toggling it hides every chapter that has no
// unchecked Markdown box ("- [ ]") until it is toggled off again. Workbooks
// without "TODO" in the name never get the button.
//
// Drives the real panel off disk like wbrename.js / find.js, and asserts on
// the real DOM and module state.
//
//   node wbtodo.js        # from tests/
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

  // Two workbooks: one with "TODO" in the name, one without. The TODO book
  // has three chapters — one with an open box, one all-checked, one with none.
  await page.evaluate(() => {
    wbBooks.length = 0;
    wbChapters.length = 0;
    wbBooks.push(
      { id: 'wb_todo', name: 'Sarcini TODO', folder: 'sarcini-todo', created: 1, updated: 1, order: 0 },
      { id: 'wb_plain', name: 'Fizica', folder: 'fizica', created: 1, updated: 1, order: 1 });
    wbChapters.push(
      { id: 'ch_open',   workbookId: 'wb_todo', title: 'Deschis', file: 'deschis.md',
        content: '# Deschis\n\n- [x] gata\n- [ ] de facut\n', created: 1, updated: 1, order: 0 },
      { id: 'ch_done',   workbookId: 'wb_todo', title: 'Terminat', file: 'terminat.md',
        content: '# Terminat\n\n- [x] una\n- [x] doua\n', created: 1, updated: 1, order: 1 },
      { id: 'ch_prose',  workbookId: 'wb_todo', title: 'Fara bife', file: 'fara-bife.md',
        content: '# Fara bife\n\ndoar text aici\n', created: 1, updated: 1, order: 2 },
      { id: 'ch_phys',   workbookId: 'wb_plain', title: 'Mecanica', file: 'mecanica.md',
        content: '- [ ] tema', created: 1, updated: 1, order: 0 });
    wbBooted = true;
    wbOpenBooks.add('wb_todo');
    wbOpenBooks.add('wb_plain');
    invalidateWikiIndex();
    renderWorkbooks();
    if (document.getElementById('wb-panel').classList.contains('collapsed')) toggleWorkbooks();
  });
  await page.waitForTimeout(150);

  const filterBtn = () => page.locator('.wb-book:has(.wb-book-name[data-wb-id="wb_todo"]) .wb-act', { hasText: '☑' });
  const plainFilterBtn = () => page.locator('.wb-book:has(.wb-book-name[data-wb-id="wb_plain"]) .wb-act', { hasText: '☑' });
  const shownChapters = wbId => page.$$eval('.wb-book', (els, id) => {
    const book = els.find(el => el.querySelector('.wb-book-name[data-wb-id="' + id + '"]'));
    return Array.from(book.querySelectorAll('.wb-ch-name')).map(n => n.textContent.replace(/^\S+\s/, ''));
  }, wbId);
  const countText = wbId => page.$$eval('.wb-book', (els, id) => {
    const book = els.find(el => el.querySelector('.wb-book-name[data-wb-id="' + id + '"]'));
    return book.querySelector('.wb-count').textContent;
  }, wbId);
  const hasEmptyLine = wbId => page.$$eval('.wb-book', (els, id) => {
    const book = els.find(el => el.querySelector('.wb-book-name[data-wb-id="' + id + '"]'));
    return !!book.querySelector('.wb-ch-empty');
  }, wbId);

  // ── the button only exists on the TODO-titled workbook ──
  check('the TODO workbook has a filter button', await filterBtn().count() === 1);
  check('a plain workbook has no filter button', await plainFilterBtn().count() === 0);

  // ── unfiltered: all three chapters show ──
  check('all chapters show before filtering', (await shownChapters('wb_todo')).length === 3);

  // ── click it: only the chapter with an open box survives ──
  await filterBtn().click();
  await page.waitForTimeout(150);
  let shown = await shownChapters('wb_todo');
  check('filtered to the chapter with an open box', JSON.stringify(shown) === JSON.stringify(['Deschis']), shown);
  check('the button carries the .on style', await filterBtn().evaluate(el => el.classList.contains('on')));
  check('the count shows shown/total', (await countText('wb_todo')) === '1/3');

  // ── toggle off: back to all three ──
  await filterBtn().click();
  await page.waitForTimeout(150);
  check('toggling off shows all chapters again', (await shownChapters('wb_todo')).length === 3);
  check('the button drops the .on style', await filterBtn().evaluate(el => !el.classList.contains('on')));

  // ── a book whose every chapter is done shows the empty line ──
  await page.evaluate(() => {
    wbChapter('ch_open').content = '- [x] acum gata';
    renderWorkbooks();
    wbTodoOnly.add('wb_todo');
    renderWorkbooks();
  });
  await page.waitForTimeout(150);
  check('no open tasks → the empty line, no rows',
    (await shownChapters('wb_todo')).length === 0 && (await hasEmptyLine('wb_todo')));

  // ── the toolbar "▣ Tasks only" button: one global switch over every workbook ──
  await page.evaluate(() => {
    wbTodoOnly.clear();
    wbChapter('ch_open').content = '# Deschis\n\n- [x] gata\n- [ ] de facut\n';   // open box back
    renderWorkbooks();
  });
  await page.waitForTimeout(100);
  check('a global filter button sits in the toolbar', await page.locator('#btn-filter-todo').count() === 1);
  check('both workbooks show unfiltered', (await shownChapters('wb_todo')).length === 3 && (await shownChapters('wb_plain')).length === 1);

  await page.locator('#btn-filter-todo').click();
  await page.waitForTimeout(150);
  check('global filter trims the TODO book to its open chapter',
    JSON.stringify(await shownChapters('wb_todo')) === JSON.stringify(['Deschis']));
  check('global filter also trims the plain book',
    JSON.stringify(await shownChapters('wb_plain')) === JSON.stringify(['Mecanica']));
  check('the toolbar button carries the .active style',
    await page.locator('#btn-filter-todo').evaluate(el => el.classList.contains('active')));
  check('the per-book ☑ act button is hidden while the global filter is on', await filterBtn().count() === 0);

  // a book with nothing open disappears entirely
  await page.evaluate(() => { wbChapter('ch_phys').content = '- [x] tema gata'; renderWorkbooks(); });
  await page.waitForTimeout(120);
  check('a book with no open task drops out of the list',
    await page.locator('.wb-book:has(.wb-book-name[data-wb-id="wb_plain"])').count() === 0);

  await page.locator('#btn-filter-todo').click();
  await page.waitForTimeout(150);
  check('toggling the toolbar button off restores every book',
    (await shownChapters('wb_todo')).length === 3
    && await page.locator('.wb-book:has(.wb-book-name[data-wb-id="wb_plain"])').count() === 1);
  check('the toolbar button drops the .active style',
    await page.locator('#btn-filter-todo').evaluate(el => !el.classList.contains('active')));
  check('the per-book ☑ act button is back', await filterBtn().count() === 1);

  check('no page errors', errors.length === 0, errors);

  await browser.close();
  console.log(failed ? '\n' + failed + ' FAILED' : '\nall good');
  process.exit(failed ? 1 : 0);
})();

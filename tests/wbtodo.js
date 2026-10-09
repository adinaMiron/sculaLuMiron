// The TODO filter in index.html's workbook panel.
//
// A workbook whose name contains "TODO" (case-insensitive) gets an extra
// act button (☑) in its row. Toggling it hides every chapter that has no
// unchecked Markdown box ("- [ ]") until it is toggled off again. Workbooks
// without "TODO" in the name never get the button.
// The toolbar state select filters every workbook and combines with the
// per-book open-task filter, importance and responsible filters.
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
  console.log((ok ? 'PASS ' : 'FAIL ') + '@idx-todo-test-contract ' + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
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
  const bookRows = wbId => page.locator('.wb-book:has(.wb-book-name[data-wb-id="' + wbId + '"])');
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

  // ── the toolbar state select filters every workbook; fences are examples ──
  await page.evaluate(() => {
    wbTodoOnly.clear();
    wbChapter('ch_open').content = '# Deschis\n\n- [x] Ana>> !vital gata\n- [ ] Bob>> !vital de facut\n- [ ] Ana>> !nice mai tarziu\n';
    wbChapter('ch_phys').content = '- [ ] Ana>> !vital tema';
    wbChapter('ch_prose').content = '```md\n- [ ] exemplu\n- [ ] ~inwork exemplu\n- [ ] ~onhold exemplu\n- [ ] ~blocked exemplu\n- [x] exemplu\n```';
    for (const state of ['inwork', 'onhold', 'blocked', 'done']) {
      wbChapters.push({ id: 'ch_' + state, workbookId: 'wb_plain', title: state, file: state + '.md',
        content: state === 'done' ? '- [x] gata' : '- [ ] ~' + state + ' tema',
        created: 1, updated: 1, order: wbChapters.length });
    }
    renderWorkbooks();
  });
  await page.waitForTimeout(100);
  const stateSelect = page.locator('select#btn-filter-todo');
  check('a global task-state select sits in the toolbar', await stateSelect.count() === 1);
  check('both workbooks show unfiltered', (await shownChapters('wb_todo')).length === 3 && (await shownChapters('wb_plain')).length === 5);

  for (const state of ['todo', 'inwork', 'onhold', 'blocked', 'done']) {
    await stateSelect.selectOption(state);
    check(state + ' is selected in the toolbar and module state',
      await stateSelect.inputValue() === state && await page.evaluate(() => wbTaskStatusFilter) === state);
    shown = await shownChapters('wb_plain');
    check(state + ' keeps only the matching state in the plain book',
      JSON.stringify(shown) === JSON.stringify([state === 'todo' ? 'Mecanica' : state]), shown);
    if (state === 'todo' || state === 'done') {
      shown = await shownChapters('wb_todo');
      check(state + ' excludes fenced examples and keeps matching TODO chapters',
        JSON.stringify(shown) === JSON.stringify(state === 'todo' ? ['Deschis'] : ['Deschis', 'Terminat']), shown);
    } else {
      check(state + ' removes a book whose only matching tasks are fenced', await bookRows('wb_todo').count() === 0);
    }
  }

  await stateSelect.selectOption('todo');
  check('global filter trims the TODO book to its open chapter',
    JSON.stringify(await shownChapters('wb_todo')) === JSON.stringify(['Deschis']));
  check('global filter also trims the plain book',
    JSON.stringify(await shownChapters('wb_plain')) === JSON.stringify(['Mecanica']));
  check('the per-book filter remains available with a global state selected', await filterBtn().count() === 1);
  await filterBtn().click();
  await stateSelect.selectOption('done');
  check('the per-book open-task filter intersects the global done-state filter',
    JSON.stringify(await shownChapters('wb_todo')) === JSON.stringify(['Deschis']) &&
    await filterBtn().evaluate(el => el.classList.contains('on')));
  await filterBtn().click();
  check('clearing the per-book filter preserves the selected global state',
    await stateSelect.inputValue() === 'done' &&
    JSON.stringify(await shownChapters('wb_todo')) === JSON.stringify(['Deschis', 'Terminat']));

  await stateSelect.selectOption('todo');
  await page.selectOption('#importance-select', 'vital');
  await page.selectOption('#responsible-select', 'ana');
  check('state, importance and responsible must match the same task',
    await bookRows('wb_todo').count() === 0 &&
    JSON.stringify(await shownChapters('wb_plain')) === JSON.stringify(['Mecanica']));
  await page.selectOption('#responsible-select', '');
  await page.selectOption('#importance-select', '');

  // A book with no tasks in the selected to-do state disappears entirely.
  await page.evaluate(() => { wbChapter('ch_phys').content = '- [x] tema gata'; renderWorkbooks(); });
  await page.waitForTimeout(120);
  check('a book with no task in the selected state drops out of the list',
    await page.locator('.wb-book:has(.wb-book-name[data-wb-id="wb_plain"])').count() === 0);

  await stateSelect.selectOption('');
  check('selecting all task states restores every book and chapter',
    (await shownChapters('wb_todo')).length === 3
    && (await shownChapters('wb_plain')).length === 5);
  check('all task states clears the toolbar and module selection',
    await stateSelect.inputValue() === '' && await page.evaluate(() => wbTaskStatusFilter) === '');
  check('the per-book filter remains available with all states selected', await filterBtn().count() === 1);

  check('no page errors', errors.length === 0, errors);

  await browser.close();
  console.log(failed ? '\n' + failed + ' FAILED' : '\nall good');
  process.exit(failed ? 1 : 0);
})();

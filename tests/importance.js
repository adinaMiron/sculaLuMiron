// Importance markers in index.html — "!nice" / "!important" / "!vital".
//
// Three levels written straight into the markdown by the keyboard shortcuts
// (or typed directly), rendered as coloured pills, and filtered across the
// workbook tree and preview by the toolbar select. Drives the real page off
// disk and asserts on the real textarea, preview DOM and export string.
//
//   node importance.js        # from tests/
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

// Put `md` in the editor and leave the caret inside the line holding `needle`
// (or select from the first to the last line when two needles are given).
async function place(page, md, needle, needle2) {
  await page.evaluate(([md, a, b]) => {
    editor.value = md;
    const start = md.indexOf(a) + 1;
    const end = b === null ? start : md.indexOf(b) + 1;
    editor.setSelectionRange(start, end);
    updatePreview(); updateStatus();
  }, [md, needle, needle2 === undefined ? null : needle2]);
}
const src = page => page.evaluate(() => editor.value);
const pick = (page, v) => page.evaluate(level => setImportance(level), v);

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

  // ---- 1. one pick marks the caret's line -------------------------------
  await place(page, 'buy the tickets\nsomething else\n', 'buy');
  await pick(page, 'vital');
  check('the marker lands at the start of the caret line',
    (await src(page)).split('\n')[0] === '!vital buy the tickets', (await src(page)).split('\n')[0]);
  check('the other line is untouched', (await src(page)).split('\n')[1] === 'something else');

  let pill = await page.evaluate(() => {
    const a = preview.querySelector('.md-imp');
    const p = a && a.closest('p');
    return a && {
      cls: a.className, level: a.dataset.imp, text: a.textContent,
      ico: a.querySelector('.md-imp-ico').textContent,
      colour: getComputedStyle(a).color,
      edge: p && getComputedStyle(p).borderLeftColor,
      edgeWidth: p && getComputedStyle(p).borderLeftWidth
    };
  });
  check('the preview renders a vital pill', !!pill && pill.level === 'vital' && /md-imp-vital/.test(pill.cls), pill);
  check('with its icon and its label', !!pill && pill.ico === '\u{1F525}' && /Vital/.test(pill.text), pill && pill.text);
  check('coloured terracotta (--imp-vital #C4643C)', !!pill && pill.colour === 'rgb(196, 100, 60)', pill && pill.colour);
  check('and the paragraph gets the matching edge',
    !!pill && pill.edge === 'rgb(196, 100, 60)' && pill.edgeWidth === '3px', pill && { e: pill.edge, w: pill.edgeWidth });

  // Editing markers does not change the separate importance filter.
  check('editing leaves the importance filter at All',
    (await page.inputValue('#importance-select')) === '');

  // ---- 2. picking again replaces, "Remove" clears ------------------------
  await pick(page, 'nice');
  check('a second pick replaces the marker rather than stacking',
    (await src(page)).split('\n')[0] === '!nice buy the tickets', (await src(page)).split('\n')[0]);
  const niceCol = await page.evaluate(() => getComputedStyle(preview.querySelector('.md-imp')).color);
  check('and repaints in the "nice to have" green (#6E9E8A)', niceCol === 'rgb(110, 158, 138)', niceCol);
  await pick(page, 'none');
  check('"Remove" clears it',
    (await src(page)).split('\n')[0] === 'buy the tickets', (await src(page)).split('\n')[0]);
  check('and the pill goes with it',
    (await page.evaluate(() => preview.querySelectorAll('.md-imp').length)) === 0);

  // ---- 3. the marker goes after the bullet / checkbox / hashes -----------
  await place(page, '- [ ] buy milk\n', 'buy milk');
  await pick(page, 'important');
  check('a task keeps its checkbox syntax', (await src(page)).trim() === '- [ ] !important buy milk',
    (await src(page)).trim());
  const task = await page.evaluate(() => {
    const li = preview.querySelector('li.task-list-item');
    return li && { box: !!li.querySelector('input.task-checkbox'), pill: !!li.querySelector('.md-imp-important'),
                   edge: getComputedStyle(li).borderLeftColor };
  });
  check('and still renders as a task, with the pill inside it',
    !!task && task.box && task.pill, task);
  check('the list item takes the amber edge (#D9A441)',
    !!task && task.edge === 'rgb(217, 164, 65)', task && task.edge);

  await place(page, '1. first\n', 'first');
  await pick(page, 'vital');
  check('an ordered item keeps its number', (await src(page)).trim() === '1. !vital first', (await src(page)).trim());

  // ---- 4. a heading keeps its name, its slug and its nav label -----------
  await place(page, '## Plan for Monday\n\nbody\n', 'Plan');
  await pick(page, 'vital');
  check('a heading keeps its hashes', (await src(page)).split('\n')[0] === '## !vital Plan for Monday',
    (await src(page)).split('\n')[0]);
  const head = await page.evaluate(() => {
    const h = preview.querySelector('h2');
    const nav = document.querySelector('#nav-tree .nav-item, #nav-tree [data-slug], #nav-tree li, #nav-tree div');
    return { id: h.id, pill: !!h.querySelector('.md-imp-vital'), plain: mdPlain('!vital Plan for Monday'),
             slug: headingSlug('!vital Plan for Monday', {}), nav: nav && nav.textContent.trim() };
  });
  check('the marker does not leak into the slug', head.slug === 'plan-for-monday' && head.id === 'plan-for-monday', head);
  check('nor into the heading name the nav/graph use', head.plain === 'Plan for Monday', head.plain);
  check('the pill is still drawn on the heading', head.pill, head);

  // ---- 5. an assignee line keeps its assignee ---------------------------
  await place(page, 'Ana>> call the plumber\n', 'Ana');
  await pick(page, 'vital');
  check('the marker goes after "Name>> ", not before it',
    (await src(page)).trim() === 'Ana>> !vital call the plumber', (await src(page)).trim());
  const both = await page.evaluate(() => ({
    who: !!preview.querySelector('.md-assignee'),
    imp: !!preview.querySelector('.md-imp-vital'),
    name: preview.querySelector('.md-assignee') && preview.querySelector('.md-assignee').textContent
  }));
  check('so both markers still render', both.who && both.imp && both.name === 'Ana', both);

  // ---- 6. a selection marks every line it touches, blanks excepted ------
  await place(page, 'alpha\n\nbeta\ngamma\n', 'alpha', 'gamma');
  await pick(page, 'nice');
  check('every selected line is marked, and the blank line is left alone',
    (await src(page)) === '!nice alpha\n\n!nice beta\n!nice gamma\n', await src(page));

  // ---- 7. what must NOT become a marker ---------------------------------
  const noise = await page.evaluate(() => {
    editor.value = 'that went !nicely\nwow! vital indeed\nemail me at a!vital\n![alt](x.png)\n';
    updatePreview();
    return preview.querySelectorAll('.md-imp').length;
  });
  check('"!nicely", a bare "!", a marker glued to a word and "![" are not markers', noise === 0, noise);

  // ---- 8. Ctrl+Alt+1/2/3 and Ctrl+Alt+0 ---------------------------------
  await place(page, 'ship it\n', 'ship');
  await page.keyboard.press('Control+Alt+Digit3');
  check('Ctrl+Alt+3 marks vital', (await src(page)).trim() === '!vital ship it', (await src(page)).trim());
  await page.keyboard.press('Control+Alt+Digit1');
  check('Ctrl+Alt+1 switches it to nice to have', (await src(page)).trim() === '!nice ship it', (await src(page)).trim());
  await page.keyboard.press('Control+Alt+Digit0');
  check('Ctrl+Alt+0 clears it', (await src(page)).trim() === 'ship it', (await src(page)).trim());

  // ---- 9. the label follows the UI language, in place -------------------
  await place(page, 'plan the trip\n', 'plan');
  await pick(page, 'nice');
  const beforeLang = await page.evaluate(() => preview.querySelector('.md-imp').textContent);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'ro' })));
  const roLabel = await page.evaluate(() => preview.querySelector('.md-imp').textContent);
  check('the Romanian label replaces the English one without losing the icon',
    /Bine de avut/.test(roLabel) && roLabel.indexOf('\u{1F331}') === 0, { beforeLang, roLabel });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'en' })));
  check('and switches back', /Nice to have/.test(await page.evaluate(() => preview.querySelector('.md-imp').textContent)));

  // ---- 10. the export ships the label baked in --------------------------
  const exported = await page.evaluate(() => parseMarkdown('- [ ] !vital call the bank', { forExport: true }));
  check('the export renders the pill as a plain span',
    /<span class="md-imp md-imp-vital">/.test(exported), exported);
  check('with the label baked in and no data-i to translate later',
    /Vital<\/span>/.test(exported) && !/data-i=/.test(exported), exported);
  check('and it is not a link — the exported page has no search panel',
    !/<a[^>]*md-imp/.test(exported), exported);

  // ---- 11. clicking a pill searches for that level ----------------------
  await place(page, '!vital one\n!vital two\n!nice three\n', 'one');
  await page.click('#preview .md-imp-vital');
  await page.waitForTimeout(250);
  const found = await page.evaluate(() => ({
    open: !document.getElementById('find-panel').classList.contains('collapsed'),
    q: document.getElementById('find-q').value,
    state: fdState.q
  }));
  check('clicking a pill opens the search panel with its own token as the query',
    found.open && found.q === '!vital' && found.state === '!vital', found);

  // ---- 12. toolbar importance filters tasks across every workbook -------
  await page.evaluate(() => {
    wbBooks.length = 0;
    wbChapters.length = 0;
    wbBooks.push(
      { id: 'imp_a', name: 'First', folder: 'first', order: 0 },
      { id: 'imp_b', name: 'Second', folder: 'second', order: 1 },
      { id: 'imp_c', name: 'No matching tasks', folder: 'empty', order: 2 });
    wbChapters.push(
      { id: 'imp_a1', workbookId: 'imp_a', title: 'Mixed', file: 'mixed.md', order: 0,
        content: '- [ ] !vital urgent\n- [x] !important done\n- [ ] !nice later\n!vital prose\n- [ ] !vitally false\n' },
      { id: 'imp_a2', workbookId: 'imp_a', title: 'No match', file: 'no-match.md', order: 1,
        content: '```\n- [ ] !vital example\n```\n- [ ] plain task\n' },
      { id: 'imp_b1', workbookId: 'imp_b', title: 'Other book', file: 'other.md', order: 0,
        content: '- [ ] !vital another\n- [ ] !important routine\n' },
      { id: 'imp_c1', workbookId: 'imp_c', title: 'Prose only', file: 'prose.md', order: 0,
        content: '!vital prose\n- [ ] !nice task\n' });
    wbCurrentId = 'imp_a1';
    editor.value = wbChapters[0].content;
    wbBooted = true;
    wbOpenBooks.add('imp_a'); wbOpenBooks.add('imp_b');
    renderWorkbooks(); updatePreview();
  });
  await page.selectOption('#importance-select', 'vital');
  let filtered = await page.evaluate(() => ({
    books: [...document.querySelectorAll('.wb-book-name')].map(el => el.textContent.trim()),
    chapters: [...document.querySelectorAll('.wb-ch-name')].map(el => el.textContent.trim()),
    tasks: [...preview.querySelectorAll('li.task-list-item')].map(el => el.textContent.trim()),
    source: editor.value,
    selection: document.getElementById('importance-select').value
  }));
  check('vital shows matching chapters in both workbooks, excluding fenced examples',
    filtered.books.length === 2 && filtered.chapters.length === 2 &&
    filtered.chapters.some(s => s.includes('Mixed')) && filtered.chapters.some(s => s.includes('Other book')), filtered);
  check('the preview shows only exactly matching task lines without editing source',
    filtered.tasks.length === 1 && filtered.tasks[0].includes('urgent') &&
    filtered.source.includes('!nice later') && filtered.selection === 'vital', filtered);
  await page.locator('#preview .task-checkbox').click();
  check('filtered checkbox updates the original task line',
    (await src(page)).startsWith('- [x] !vital urgent\n- [x] !important done'), await src(page));
  await page.selectOption('#importance-select', 'important');
  check('changing the level includes completed matching tasks',
    await page.locator('#preview li.task-list-item').count() === 1 &&
    (await page.locator('#preview li.task-list-item').first().textContent()).includes('done'));
  await page.selectOption('#importance-select', 'vital');
  await page.evaluate(() => {
    editor.value = editor.value.replace('!vital urgent', '!nice urgent');
    updatePreview();
  });
  check('editing the open chapter updates the workbook list immediately',
    (await page.locator('.wb-ch-name').allTextContents()).every(s => !s.includes('Mixed')));
  await page.evaluate(() => {
    editor.value = editor.value.replace('!nice urgent', '!vital urgent');
    updatePreview();
  });
  check('adding the marker brings the chapter back without reselecting',
    (await page.locator('.wb-ch-name').allTextContents()).some(s => s.includes('Mixed')));
  await page.locator('#btn-filter-todo').click();
  check('tasks-only combines with importance to keep only open vital tasks',
    (await page.locator('.wb-ch-name').allTextContents()).length === 1 &&
    (await page.locator('.wb-ch-name').first().textContent()).includes('Other book') &&
    await page.locator('#preview li.task-list-item').count() === 0);
  await page.locator('#btn-filter-todo').click();
  await page.selectOption('#importance-select', '');
  check('All restores every workbook chapter and the full preview',
    await page.locator('.wb-ch-name').count() === 4 && await page.locator('#preview li.task-list-item').count() === 4);

  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall good');
  process.exit(failed ? 1 : 0);
})();

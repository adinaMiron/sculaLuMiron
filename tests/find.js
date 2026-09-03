// Search & filter panel in index.html (docs/FEATURES.md § H).
//
// Drives the real app off disk, like graph.js, and asserts on the real
// result set (`fdLast`), the real DOM the panel renders, and the real
// textarea selection a hit leaves behind - see tests/README.md.
//
//   node find.js             # from tests/
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

const MECANICA = [
  '# Mecanică',
  '',
  'Forța este o măsură a interacțiunii. #fizica',
  '',
  '## Inerție',
  '',
  '- forța de frecare',
  '- un piston greu',
  '',
  '> Forța nu dispare, se transformă.',
  '',
  '| mărime | unitate |',
  '| --- | --- |',
  '| forța | 12 N |',
  '',
  '```',
  'forța = m * a',
  '```',
  '',
  'O linie cu <script> în ea, ca să nu devină HTML.',
  ''
].join('\n');

const OPTICA = [
  '# Optică',
  '',
  'Lumina nu are forța unui corp. #optica #fizica',
  '',
  '## Lentile',
  '',
  'O măsură a curburii, 35 g de sticlă.',
  ''
].join('\n');

const SUPA = [
  '# Supă de legume',
  '',
  'O măsură de sare, 250 g de morcovi. #retete',
  ''
].join('\n');

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  // The mammoth.js CDN tag (docx import) cannot load in an offline sandbox;
  // that is the environment, not the app.
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text())) return;
    errors.push('CONSOLE ' + m.text());
  });
  await page.goto(URL);
  await page.waitForTimeout(300);

  // Two workbooks, three chapters. Built straight into the module state:
  // what is under test is the search, and IndexedDB has no origin to live in
  // under file:// - persistence is the workbooks' own business.
  await page.evaluate(([mecanica, optica, supa]) => {
    const book = (id, name) => ({ id, name, folder: name.toLowerCase(), created: 1, updated: 1, order: 0 });
    const chap = (id, wb, title, content, order) =>
      ({ id, workbookId: wb, title, file: title.toLowerCase().replace(/\s+/g, '-') + '.md',
         content, created: 1, updated: 1, order });
    wbBooks.length = 0;
    wbChapters.length = 0;
    wbBooks.push(book('wb_fiz', 'Fizica'), book('wb_buc', 'Bucatarie'));
    wbChapters.push(
      chap('ch_mec', 'wb_fiz', 'Mecanica', mecanica, 0),
      chap('ch_opt', 'wb_fiz', 'Optica', optica, 1),
      chap('ch_sup', 'wb_buc', 'Supa', supa, 0));
    wbBooted = true;
    invalidateWikiIndex();
    renderWorkbooks();
    loadChapterIntoEditor(wbChapter('ch_mec'));
  }, [MECANICA, OPTICA, SUPA]);
  await page.waitForTimeout(200);

  // A known starting point: the panel open, every toggle at its default.
  const reset = () => page.evaluate(() => {
    fdState.matchCase = false; fdState.wholeWord = false;
    fdState.regex = false; fdState.fold = true;
    fdState.context = false; fdState.collapse = false;
    fdState.kinds.clear(); fdState.tags.clear(); fdShut.clear();
  });
  // Typing goes through the real input handler, then past its debounce.
  const search = async (q, scope) => {
    await page.evaluate(([q, scope]) => {
      if (scope) fdState.scope = scope;
      document.getElementById('find-q').value = q;
      fdQueryChanged();
    }, [q, scope || null]);
    await page.waitForTimeout(220);
    return page.evaluate(() => ({
      matches: fdLast.matches,
      notes: fdLast.notes,
      titles: fdLast.groups.map(g => g.note.title),
      kinds: Array.from(fdLast.kinds.entries()),
      tags: Array.from(fdLast.tags.entries()),
      rows: document.querySelectorAll('#find-results .find-hit').length,
      marks: document.querySelectorAll('#find-results mark').length,
      ctx: document.querySelectorAll('#find-results .find-line.ctx').length,
      foot: document.getElementById('find-foot').textContent
    }));
  };

  // ---- 1. the panel opens ------------------------------------------------
  const opened = await page.evaluate(() => {
    toggleFind();
    return {
      open: !document.getElementById('find-panel').classList.contains('collapsed'),
      btn: document.getElementById('btn-find').classList.contains('active'),
      focused: document.activeElement === document.getElementById('find-q'),
      idle: (document.querySelector('#find-results .find-empty') || {}).textContent || ''
    };
  });
  check('the panel opens', opened.open && opened.btn, opened);
  check('and takes the caret', opened.focused, opened);
  check('an empty query says so', /Scrie|Type/.test(opened.idle), opened.idle);

  await reset();

  // ---- 2. the three scopes -----------------------------------------------
  const inChapter = await search('forța', 'note');
  check('chapter scope stays in the open chapter',
    inChapter.notes === 1 && inChapter.titles[0] === 'Mecanica', inChapter);
  check('and finds every line it is on', inChapter.matches === 5, inChapter);
  check('every hit keeps its own mark', inChapter.marks === 5, inChapter);
  // Obsidian's shape: hits close enough for their context to overlap are one
  // block, so the same lines are never printed twice.
  check('and hits sharing context become one block',
    inChapter.rows === 2 && inChapter.ctx > 0, inChapter);

  const inBook = await search('forța', 'workbook');
  check('workbook scope reaches the other chapter',
    inBook.notes === 2 && inBook.titles.join(',') === 'Mecanica,Optica', inBook);

  const inAll = await search('măsură', 'vault');
  check('all-workbooks scope reaches the other workbook',
    inAll.notes === 3 && inAll.titles.indexOf('Supa') !== -1, inAll);
  check('the count reads back', /3/.test(inAll.foot), inAll.foot);

  // ---- 3. the toggles ----------------------------------------------------
  // Diacritics: "masura" has to find "măsură", and stop when told to.
  const folded = await search('masura', 'vault');
  check('diacritics fold by default', folded.matches === 3, folded);
  await page.evaluate(() => { fdState.fold = false; fdRefresh(); });
  const unfolded = await page.evaluate(() => fdLast.matches);
  check('and the ăâ toggle turns that off', unfolded === 0, unfolded);
  await reset();

  const loose = await search('ton', 'note');
  check('a substring matches inside a word', loose.matches === 1, loose);
  await page.evaluate(() => { fdState.wholeWord = true; fdRefresh(); });
  const whole = await page.evaluate(() => fdLast.matches);
  check('whole-word drops "piston"', whole === 0, whole);
  await reset();

  const anyCase = await search('forța', 'note');
  await page.evaluate(() => { fdState.matchCase = true; fdRefresh(); });
  const cased = await page.evaluate(() => fdLast.matches);
  check('match-case narrows', cased > 0 && cased < anyCase.matches, { anyCase: anyCase.matches, cased });
  await reset();

  await page.evaluate(() => { fdState.regex = true; fdRefresh(); });
  const rx = await search('\\d+ (N|g)', 'vault');
  check('a regex matches across chapters', rx.matches === 3, rx);
  const bad = await search('([unclosed', 'vault');
  const badMark = await page.evaluate(() => ({
    flagged: document.getElementById('find-q').classList.contains('bad'),
    msg: (document.querySelector('#find-results .find-empty') || {}).textContent || ''
  }));
  check('a broken regex says so, without throwing',
    bad.rows === 0 && badMark.flagged && /regulat|regular/.test(badMark.msg), { bad, badMark });
  await reset();

  // ---- 4. filtering by the kind of line ----------------------------------
  const kinds = await search('forța', 'note');
  const byKind = Object.fromEntries(kinds.kinds);
  check('every kind of line is counted',
    byKind.text === 1 && byKind.list === 1 && byKind.quote === 1 && byKind.table === 1, byKind);
  check('the fenced line is code, not text', byKind.code === 1, byKind);
  const chips = await page.evaluate(() => ({
    shown: !document.getElementById('find-kinds').hidden,
    labels: Array.from(document.querySelectorAll('#find-kinds [data-fd-kind]')).map(b => b.dataset.fdKind)
  }));
  check('and each becomes a chip', chips.shown && chips.labels.length === 5, chips);

  const onlyLists = await page.evaluate(async () => {
    document.querySelector('#find-kinds [data-fd-kind="list"]').click();
    await new Promise(r => setTimeout(r, 40));
    return { matches: fdLast.matches, kind: (fdLast.groups[0] || { hits: [{}] }).hits[0].kind };
  });
  check('a chip narrows to that kind', onlyLists.matches === 1 && onlyLists.kind === 'list', onlyLists);
  await reset();

  // ---- 5. filtering by tag -----------------------------------------------
  const tagged = await search('forța', 'workbook');
  const tagNames = tagged.tags.map(t => t[0]).sort();
  check('the tags of the chapters found become chips',
    tagNames.join(',') === 'fizica,optica', tagNames);

  const onlyOptics = await page.evaluate(async () => {
    document.querySelector('#find-tags [data-fd-tag="optica"]').click();
    await new Promise(r => setTimeout(r, 40));
    return { notes: fdLast.notes, titles: fdLast.groups.map(g => g.note.title) };
  });
  check('a tag chip narrows to the chapters carrying it',
    onlyOptics.notes === 1 && onlyOptics.titles[0] === 'Optica', onlyOptics);
  await reset();

  // ---- 6. the context around a hit ---------------------------------------
  await reset();
  const ctx1 = await search('piston', 'note');
  const block = await page.evaluate(() => {
    const hit = document.querySelector('#find-results .find-hit');
    return {
      lines: Array.from(hit.querySelectorAll('.find-line')).map(l => l.textContent),
      ctx: hit.querySelectorAll('.find-line.ctx').length,
      marked: hit.querySelector('mark').textContent
    };
  });
  check('a hit is shown inside the lines around it',
    ctx1.matches === 1 && block.ctx === 2 && block.marked === 'piston', block);
  check('and the blank lines between them are skipped',
    block.lines.length === 3 && block.lines.every(l => l.trim()), block.lines);
  check('the line above and the line below are the neighbours',
    /frecare/.test(block.lines[0]) && /dispare/.test(block.lines[2]), block.lines);

  const wider = await page.evaluate(async () => {
    document.querySelector('[data-fd-view="context"]').click();
    await new Promise(r => setTimeout(r, 40));
    const hit = document.querySelector('#find-results .find-hit');
    return {
      on: document.querySelector('[data-fd-view="context"]').classList.contains('on'),
      lines: hit.querySelectorAll('.find-line').length,
      heading: /Mecanică/.test(hit.textContent)
    };
  });
  check('the ≡ toggle widens the block', wider.on && wider.lines > 3 && wider.heading, wider);
  await reset();

  // A block holding three matches is still three places to go: the marks
  // carry their own hit index, the block carries its first.
  await search('forța', 'note');
  const picked = await page.evaluate(async () => {
    const marks = document.querySelectorAll('#find-results .find-hit mark');
    const third = marks[2];
    third.click();
    await new Promise(r => setTimeout(r, 200));
    const ed = document.getElementById('editor');
    return { n: marks.length, start: ed.selectionStart,
             want: ed.value.indexOf('Forța nu dispare'),
             picked: ed.value.slice(ed.selectionStart, ed.selectionEnd) };
  });
  check('clicking one mark of a block goes to that match',
    picked.start === picked.want && picked.picked === 'Forța', picked);

  // ---- 7. folding the results --------------------------------------------
  await reset();
  await search('forța', 'workbook');
  const folded2 = await page.evaluate(async () => {
    document.querySelector('[data-fd-view="collapse"]').click();
    await new Promise(r => setTimeout(r, 40));
    const shut = { rows: document.querySelectorAll('#find-results .find-hit').length,
                   notes: document.querySelectorAll('#find-results .find-note-row').length,
                   icon: document.querySelector('[data-fd-view="collapse"]').textContent };
    document.querySelector('#find-results .find-caret').click();   // one chapter back
    await new Promise(r => setTimeout(r, 40));
    return { shut, reopened: document.querySelectorAll('#find-results .find-hit').length };
  });
  check('the ⊟ button folds every chapter away',
    folded2.shut.rows === 0 && folded2.shut.notes === 2 && folded2.shut.icon === '⊞', folded2.shut);
  check('and a chevron brings one of them back', folded2.reopened > 0, folded2);
  // The chapter row still opens the chapter, chevron or no chevron.
  const openedNote = await page.evaluate(async () => {
    document.querySelector('#find-results .find-note-title').click();
    await new Promise(r => setTimeout(r, 200));
    return wbCurrentId;
  });
  check('the chapter row still opens the chapter', openedNote === 'ch_mec', openedNote);
  await reset();
  await page.evaluate(() => fdRefresh());

  // ---- 8. going to a hit -------------------------------------------------
  await search('curburii', 'workbook');
  const jumped = await page.evaluate(async () => {
    document.querySelector('#find-results .find-hit').click();
    await new Promise(r => setTimeout(r, 200));
    const ed = document.getElementById('editor');
    return {
      chapter: wbCurrentId,
      picked: ed.value.slice(ed.selectionStart, ed.selectionEnd),
      focused: document.activeElement === ed
    };
  });
  check('a hit in another chapter opens it', jumped.chapter === 'ch_opt', jumped);
  check('and selects the match in the editor',
    jumped.picked === 'curburii' && jumped.focused, jumped);

  // A chapter taller than the editor, with the only hit at the bottom of it.
  // #editor is a flex item, so its height cannot be faked - the text has to
  // be genuinely long, and long lines have to wrap, which is the whole
  // reason the position is measured rather than counted in newlines.
  await page.evaluate(() => {
    const filler = [];
    for (let i = 0; i < 120; i++) filler.push('Rând ' + i + ' — ' + 'text lung care se rupe pe mai multe rânduri. '.repeat(3));
    filler.push('Aici stă cuvântul ancoră.');
    wbChapters.push({ id: 'ch_lung', workbookId: 'wb_fiz', title: 'Lung', file: 'lung.md',
                      content: filler.join('\n'), created: 1, updated: 1, order: 2 });
    invalidateWikiIndex();
    loadChapterIntoEditor(wbChapter('ch_lung'));
  });
  await page.waitForTimeout(150);
  await search('ancoră', 'note');
  const scrolled = await page.evaluate(async () => {
    const ed = document.getElementById('editor');
    document.querySelector('#find-results .find-hit').click();
    await new Promise(r => setTimeout(r, 200));
    return { top: ed.scrollTop, max: ed.scrollHeight - ed.clientHeight,
             start: ed.selectionStart, at: ed.value.indexOf('ancoră') };
  });
  check('a hit below the fold scrolls the editor to it',
    scrolled.start === scrolled.at && scrolled.top > scrolled.max * 0.8, scrolled);

  // ---- 9. the text stays text --------------------------------------------
  await page.evaluate(() => loadChapterIntoEditor(wbChapter('ch_mec')));
  await page.waitForTimeout(150);
  const injected = await search('<script>', 'note');
  const safe = await page.evaluate(() => {
    const row = document.querySelector('#find-results .find-hit .find-snip');
    return { html: row ? row.innerHTML : '', text: row ? row.textContent : '', scripts: document.querySelectorAll('#find-results script').length };
  });
  check('a line of HTML is shown, not run',
    injected.matches === 1 && safe.scripts === 0 && /&lt;script&gt;/.test(safe.html), safe);

  // ---- 10. the other language ---------------------------------------------
  await reset();
  await search('forța', 'note');
  const swapped = await page.evaluate(async () => {
    const before = document.querySelector('#find-kinds [data-fd-kind="list"]').textContent;
    window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'en' }));
    await new Promise(r => setTimeout(r, 60));
    const after = document.querySelector('#find-kinds [data-fd-kind="list"]').textContent;
    const title = document.querySelector('#find-panel .panel-title').textContent;
    window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'ro' }));
    return { before, after, title };
  });
  check('the generated chips repaint in the other language',
    /liste/.test(swapped.before) && /lists/.test(swapped.after), swapped);
  check('and so does the panel itself', /Search/.test(swapped.title), swapped);

  // ---- 11. the keyboard ---------------------------------------------------
  const shortcut = await page.evaluate(async () => {
    const q = document.getElementById('find-q');
    const collapsed = () => document.getElementById('find-panel').classList.contains('collapsed');
    document.getElementById('editor').focus();
    toggleFind();                                    // open but unfocused: focuses
    const kept = !collapsed() && document.activeElement === q;
    toggleFind();                                    // focused: closes
    const closed = collapsed();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '4', ctrlKey: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 60));
    return { kept, closed, open: !collapsed() };
  });
  check('asking for an open but unfocused panel focuses it', shortcut.kept, shortcut);
  check('Ctrl+4 closes and reopens the panel', shortcut.closed && shortcut.open, shortcut);

  // A click on the toolbar button toggles the panel shut even though the click
  // pulled focus off the query box — the "focus, don't close" path is keyboard-only.
  const clickToggle = await page.evaluate(() => {
    const btn = document.getElementById('btn-find');
    const collapsed = () => document.getElementById('find-panel').classList.contains('collapsed');
    if (collapsed()) btn.click();
    const opened = !collapsed();
    btn.click();                                     // click moves focus to the button
    return { opened, closed: collapsed() };
  });
  check('the Find button toggles the panel back off when clicked', clickToggle.opened && clickToggle.closed, clickToggle);

  check('no page errors', errors.length === 0, errors);

  await browser.close();
  console.log(failed ? '\n' + failed + ' FAILED' : '\nall good');
  process.exit(failed ? 1 : 0);
})();

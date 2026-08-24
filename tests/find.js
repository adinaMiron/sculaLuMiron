// Search & filter panel in markdown-editor.html (docs/FEATURES.md § H).
//
// Drives the real app off disk, like graph.js, and asserts on the real
// result set (`fdLast`), the real DOM the panel renders, and the real
// textarea selection a hit leaves behind - see tests/README.md.
//
//   node find.js             # from tests/
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'markdown-editor.html');

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
    fdState.kinds.clear(); fdState.tags.clear();
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
  check('each hit is a row with its marks',
    inChapter.rows === 5 && inChapter.marks === 5, inChapter);

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

  // ---- 6. going to a hit -------------------------------------------------
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

  // ---- 7. the text stays text --------------------------------------------
  await page.evaluate(() => loadChapterIntoEditor(wbChapter('ch_mec')));
  await page.waitForTimeout(150);
  const injected = await search('<script>', 'note');
  const safe = await page.evaluate(() => {
    const row = document.querySelector('#find-results .find-hit .find-snip');
    return { html: row ? row.innerHTML : '', text: row ? row.textContent : '', scripts: document.querySelectorAll('#find-results script').length };
  });
  check('a line of HTML is shown, not run',
    injected.matches === 1 && safe.scripts === 0 && /&lt;script&gt;/.test(safe.html), safe);

  // ---- 8. the other language ---------------------------------------------
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

  // ---- 9. the keyboard ---------------------------------------------------
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

  check('no page errors', errors.length === 0, errors);

  await browser.close();
  console.log(failed ? '\n' + failed + ' FAILED' : '\nall good');
  process.exit(failed ? 1 : 0);
})();

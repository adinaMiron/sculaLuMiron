// task-03 — chapter picker in the 💡 Quick idea box (index.html).
// Adversarial suite written from docs/tasks/03-for-index-html-page-in-idee/spec.md
// (§ 4 routing, § 4.6 hints, § 5 keyboard, § 6 i18n, § 9 manual steps).
//
//   node tests/03-for-index-html-page-in-idee/picker.js
//   PW_CHROME_PATH=/usr/bin/google-chrome-stable node tests/03-for-index-html-page-in-idee/picker.js
//
// Uses the `playwright` package already installed under tests/node_modules
// (same style as tests/idea.js). Exit code 1 when any check fails.
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright'));

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

const seed = () => {
  wbBooks.length = 0; wbChapters.length = 0;
  wbBooks.push(
    { id: 'wb_p', name: 'Proiecte', folder: 'proiecte', created: 1, updated: 1, order: 0 },
    { id: 'wb_s', name: 'Școală', folder: 'scoala', created: 1, updated: 1, order: 1 });
  const ch = (id, wb, title, file, content, order) =>
    wbChapters.push({ id, workbookId: wb, title, file, content, created: 1, updated: 1, order });
  ch('c_ed', 'wb_p', 'Editor', 'editor.md', '# Editor\n\ntext\n', 0);
  ch('c_edv', 'wb_p', 'Editor vechi', 'editor-vechi.md', '# Editor vechi\n', 1);
  ch('c_ret', 'wb_p', 'Rețete', 'retete.md', '# Rețete\n', 2);
  ch('c_np', 'wb_p', 'Notes', 'notes.md', '# Notes P\n', 3);
  ch('c_fiz', 'wb_s', 'Fizică', 'fizica.md', '# Fizică\n\ntext\n\n\n  ', 0);
  ch('c_ns', 'wb_s', 'Notes', 'notes.md', '# Notes S\n', 1);
  ch('c_evil', 'wb_s', '<img src=x onerror=window.__xss=1>', 'evil.md', '', 2);
  wbCurrentId = null; wbBooted = true;
  invalidateWikiIndex(); renderWorkbooks();
};

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('dialog', d => d.dismiss());
  await page.goto(URL);
  await page.waitForTimeout(400);

  const setLang = l => page.evaluate(x => { window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: x })); }, l);
  await setLang('en');
  const reset = async openId => {
    await page.evaluate(seed);
    if (openId) await page.evaluate(id => loadChapterIntoEditor(wbChapter(id)), openId);
    await page.evaluate(() => { document.getElementById('idea-text').value = ''; });
    await page.waitForTimeout(80);
  };
  const open = async () => {
    await page.evaluate(() => openIdeaModal());
    await page.waitForTimeout(120);
  };
  const content = id => page.evaluate(i => wbChapter(i).content, id);
  const hint = () => page.$eval('#idea-hint', e => e.textContent);
  const chapVal = () => page.$eval('#idea-chapter', e => e.value);
  const rows = () => page.$$eval('#idea-chapter-list .ws-item', els => els.map(e => e.querySelector('.ws-name').textContent + '|' + e.querySelector('.ws-where').textContent));
  const listOpen = () => page.$eval('#idea-chapter-list', e => e.classList.contains('open'));
  const modalOpen = () => page.$eval('#idea-modal', e => e.classList.contains('open'));
  const search = async q => { await page.fill('#idea-chapter', q); await page.waitForTimeout(60); };
  const text = async t => { await page.fill('#idea-text', t); await page.waitForTimeout(60); };
  const save = async () => { await page.keyboard.press('Control+Enter'); await page.waitForTimeout(350); };
  const clear = async () => { await page.click('#idea-chapter-clear'); await page.waitForTimeout(60); };
  const today = () => page.evaluate(() => ideaToday());

  // ── § 8: pre-fill ──
  await reset('c_fiz'); await open();
  check('opens pre-filled with open chapter title', await chapVal() === 'Fizică', await chapVal());
  check('pre-fill has .picked class', await page.$eval('#idea-chapter', e => e.classList.contains('picked')));
  check('caret is in #idea-text', await page.evaluate(() => document.activeElement.id) === 'idea-text');
  check('list closed on open', !(await listOpen()));
  check('hint names Școală / Fizică', /Școală/.test(await hint()) && /Fizică/.test(await hint()), await hint());

  // § 9.1 + append format (§ 8): trailing blank lines and spaces trimmed to one \n
  await text('ceva nou'); await save();
  check('modal closed after save', !(await modalOpen()));
  check('append: "# Fizică\\n\\ntext\\n\\n\\n  " + idea → single newline', await content('c_fiz') === '# Fizică\n\ntext\nceva nou\n', await content('c_fiz'));
  check('open chapter: editor shows new text', await page.$eval('#editor', e => e.value) === '# Fizică\n\ntext\nceva nou\n');
  check('open chapter: wbDirty false', await page.evaluate(() => wbDirty) === false);
  check('picker reset after save (input empty)', await chapVal() === '');

  // empty chapter → line + \n
  await reset(null); await page.evaluate(() => { wbChapter('c_fiz').content = ''; });
  await open(); await clear(); await search('fizica'); await text('x'); await save();
  check('empty chapter becomes "x\\n"', await content('c_fiz') === 'x\n', await content('c_fiz'));

  // ── no chapter open → empty picker ──
  await reset(null); await open();
  check('no open chapter → picker empty', await chapVal() === '');
  check('no open chapter → no .picked', !(await page.$eval('#idea-chapter', e => e.classList.contains('picked'))));
  check('no open chapter → idle hint', await hint() === await page.evaluate(() => t('ideaHintIdle')), await hint());

  // ── § 9.2 prefix beats soft default, stripped ──
  await reset('c_fiz'); await open();
  await text('Rețete: sare');
  check('prefix over open: hint names Proiecte / Rețete', /Proiecte/.test(await hint()) && /Rețete/.test(await hint()), await hint());
  await save();
  check('prefix stripped, goes to Rețete', await content('c_ret') === '# Rețete\nsare\n', await content('c_ret'));
  check('Fizică untouched', await content('c_fiz') === '# Fizică\n\ntext\n\n\n  ');

  // ── § 9.3 unmatched prefix stays whole in open chapter ──
  await reset('c_fiz'); await open();
  await text('Grădinărit: busuioc');
  check('unmatched prefix: hint names Fizică', /Fizică/.test(await hint()), await hint());
  await save();
  check('unmatched prefix kept whole in open chapter', (await content('c_fiz')).endsWith('text\nGrădinărit: busuioc\n'), await content('c_fiz'));

  // ── § 9.4 × clears + focuses; click pick; verbatim Name: ──
  await reset('c_fiz'); await open(); await clear();
  check('× empties input', await chapVal() === '');
  check('× focuses #idea-chapter', await page.evaluate(() => document.activeElement.id) === 'idea-chapter');
  check('× removes .picked', !(await page.$eval('#idea-chapter', e => e.classList.contains('picked'))));
  await search('retete');
  check('diacritic-insensitive search → 1 row "Rețete|Proiecte"', JSON.stringify(await rows()) === '["Rețete|Proiecte"]', await rows());
  await page.click('#idea-chapter-list .ws-item');
  await page.waitForTimeout(60);
  check('click picks: input = title', await chapVal() === 'Rețete');
  check('click picks: .picked on', await page.$eval('#idea-chapter', e => e.classList.contains('picked')));
  check('click picks: list closed', !(await listOpen()));
  check('click picks: focus moves to textarea', await page.evaluate(() => document.activeElement.id) === 'idea-text');
  await text('Editor: x');
  check('picked + Name: hint names Rețete', /Rețete/.test(await hint()) && !/Editor/.test(await hint()), await hint());
  await save();
  check('picked chapter gets "Editor: x" verbatim', await content('c_ret') === '# Rețete\nEditor: x\n', await content('c_ret'));
  check('Editor chapter untouched by picked+prefix', await content('c_ed') === '# Editor\n\ntext\n');

  // ── § 9.5 several matches ignored → Idei/today ──
  await reset('c_fiz'); await open(); await clear();
  await search('edit');
  check('"edit" lists 2 rows', (await rows()).length === 2, await rows());
  await text('hello');
  const h5 = await hint(); const td = await today();
  check('several: hint mentions query, 2, Idei and today', /edit/.test(h5) && /2/.test(h5) && h5.includes('Idei') && h5.includes(td), h5);
  await save();
  const idei = await page.evaluate(() => { const b = wbBooks.find(b => b.name === 'Idei'); return b && wbChapters.filter(c => c.workbookId === b.id).map(c => [c.title, c.content]); });
  check('several: Idei/today created holding "hello\\n"', JSON.stringify(idei) === JSON.stringify([[td, 'hello\n']]), idei);
  check('several: Editor & Editor vechi untouched', await content('c_ed') === '# Editor\n\ntext\n' && await content('c_edv') === '# Editor vechi\n');

  // ── § 9.6 unique fragment, no click ──
  await reset('c_fiz'); await open(); await clear(); await search('vechi'); await text('y');
  check('unique search: hint names Editor vechi', /Editor vechi/.test(await hint()), await hint());
  await save();
  check('unique search → Editor vechi gets y', await content('c_edv') === '# Editor vechi\ny\n', await content('c_edv'));

  // search wins verbatim over Name: prefix (B)
  await reset('c_fiz'); await open(); await clear(); await search('vechi'); await text('Rețete: z'); await save();
  check('search (B) is verbatim, prefix not applied', await content('c_edv') === '# Editor vechi\nRețete: z\n' && await content('c_ret') === '# Rețete\n', [await content('c_edv'), await content('c_ret')]);

  // exact match beats multiple substring matches
  await reset('c_fiz'); await open(); await clear(); await search('editor'); await text('e'); await save();
  check('"editor" is an exact title → Editor, not ambiguous', await content('c_ed') === '# Editor\n\ntext\ne\n', await content('c_ed'));

  // ── § 9.7 none ──
  await reset('c_fiz'); await open(); await clear(); await search('zzz');
  const nf = await page.$$eval('#idea-chapter-list > *', els => els.map(e => e.className + ':' + e.textContent));
  check('no match → single ws-empty "No chapter found"', nf.length === 1 && /ws-empty/.test(nf[0]) && /No chapter found/.test(nf[0]), nf);
  check('no match → list open', await listOpen());
  check('no match hint, no body', /zzz/.test(await hint()), await hint());
  await text('q');
  check('no match + body hint mentions zzz and Idei', /zzz/.test(await hint()) && (await hint()).includes('Idei'), await hint());
  // Enter with "no chapter" row: nothing picked, nothing saved, box open
  await page.focus('#idea-chapter'); await page.keyboard.press('Enter'); await page.waitForTimeout(80);
  check('Enter on "No chapter found" does not pick or save', (await modalOpen()) && await chapVal() === 'zzz');
  // no "create" affordance anywhere in the list
  check('no create option', !/creat|new|nou/i.test(nf.join()));
  await page.evaluate(() => { document.getElementById('idea-text').value = ''; });

  // ── § 9.8 notes: two rows, ArrowDown+Enter picks 2nd ──
  await reset('c_ed'); await open(); await clear(); await search('notes');
  check('"notes" → two rows across workbooks', JSON.stringify(await rows()) === '["Notes|Proiecte","Notes|Școală"]', await rows());
  check('first row highlighted', await page.$$eval('#idea-chapter-list .ws-item', e => e.map(x => x.classList.contains('sel'))).then(a => a[0] && !a[1]));
  await text('n?'); // ambiguous exact → ignored
  check('two exact "Notes" is ambiguous (ignored hint)', /notes/.test(await hint()) && /2/.test(await hint()), await hint());
  await page.fill('#idea-text', '');
  await page.focus('#idea-chapter');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); // second is clamped
  check('ArrowDown clamps at last row', await page.$$eval('#idea-chapter-list .ws-item', e => e.map(x => x.classList.contains('sel'))).then(a => !a[0] && a[1]));
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  check('ArrowUp clamps at first row', await page.$$eval('#idea-chapter-list .ws-item', e => e.map(x => x.classList.contains('sel'))).then(a => a[0] && !a[1]));
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(60);
  check('Enter picks second Notes (Școală)', await chapVal() === 'Notes' && await page.evaluate(() => ideaPick && ideaPick.id) === 'c_ns');
  await text('to scoala'); await save();
  check('idea in Școală/Notes only', await content('c_ns') === '# Notes S\nto scoala\n' && await content('c_np') === '# Notes P\n');
  // Highlight resets to 0 on new input
  await reset('c_ed'); await open(); await clear(); await search('notes');
  await page.focus('#idea-chapter'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Backspace');
  check('highlight resets to first row after typing', await page.$$eval('#idea-chapter-list .ws-item', e => e.map(x => x.classList.contains('sel'))).then(a => a[0] && !a[1]));

  // ── any edit of the pre-fill drops it (becomes a search) ──
  await reset('c_fiz'); await open();
  await page.focus('#idea-chapter'); await page.keyboard.press('End'); await page.keyboard.type('x');
  check('editing pre-fill drops pick (search "Fizicăx" → none, list open)', (await page.evaluate(() => ideaPick)) === null && await listOpen());
  await text('abc');
  check('edited pre-fill with no match: words ignored → Idei', /Fizicăx/.test(await hint()) && (await hint()).includes('Idei'), await hint());
  await save();
  check('nothing written to Fizică', await content('c_fiz') === '# Fizică\n\ntext\n\n\n  ');

  // ── prefix + ignored search: hint names prefixed chapter with search hint ──
  await reset('c_fiz'); await open(); await clear(); await search('zzz'); await text('Rețete: r');
  check('B-ignored + prefix: hint names Rețete and zzz', /zzz/.test(await hint()) && /Rețete/.test(await hint()), await hint());
  await save();
  check('B-ignored + prefix routes to Rețete stripped', await content('c_ret') === '# Rețete\nr\n', await content('c_ret'));

  // ── empty idea ──
  await reset('c_fiz'); await open(); await text('   \n  '); await save();
  check('whitespace-only idea: box stays open, nothing written', (await modalOpen()) && await content('c_fiz') === '# Fizică\n\ntext\n\n\n  ');
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);

  // ── does not remember the last pick ──
  await reset('c_fiz'); await open(); await clear(); await search('retete');
  await page.click('#idea-chapter-list .ws-item'); await text('mem'); await save();
  await reset(null); await open();
  check('does not remember last picked chapter', await chapVal() === '');

  // ── open chapter switched: pre-fill follows wbCurrentId ──
  await reset('c_ed'); await open(); await page.keyboard.press('Escape');
  await page.evaluate(() => loadChapterIntoEditor(wbChapter('c_ret'))); await open();
  check('pre-fill follows newly open chapter', await chapVal() === 'Rețete', await chapVal());

  // ── deleted pick falls through ──
  await reset('c_fiz'); await open(); await clear(); await search('retete');
  await page.click('#idea-chapter-list .ws-item');
  await page.evaluate(() => { wbChapters.splice(wbChapters.findIndex(c => c.id === 'c_ret'), 1); invalidateWikiIndex(); });
  await text('orphan'); await save();
  const idei2 = await page.evaluate(() => { const b = wbBooks.find(b => b.name === 'Idei'); return !!b; });
  check('picked chapter deleted meanwhile → falls back to Idei, no throw', idei2 && !errors.length, errors);

  // ── XSS: titles rendered as text ──
  await reset(null); await open(); await search('onerror');
  check('title with markup rendered as text, no injection', await page.evaluate(() => !window.__xss && !document.querySelector('#idea-chapter-list img')));
  check('markup title visible literally', /<img/.test((await rows())[0] || ''), await rows());

  // ── case, whitespace-only query, render cap ──
  await reset(null); await open(); await search('   ');
  check('whitespace-only query → list closed', !(await listOpen()));
  await search('FIZICA');
  check('case/diacritic-insensitive uppercase', (await rows()).length === 1, await rows());
  await search('scoala'); // no title has it; must not match workbook name "Școală"
  check('workbook names are not searched', (await rows()).length === 0, await rows());
  await search('fizica.md');
  check('file names are not searched', (await rows()).length === 0, await rows());
  await search('text');
  check('chapter contents are not searched', (await rows()).length === 0, await rows());
  await page.evaluate(() => { for (let i = 0; i < 80; i++) wbChapters.push({ id: 'bulk' + i, workbookId: 'wb_p', title: 'Bulk ' + i, file: 'b' + i + '.md', content: '', created: 1, updated: 1, order: 100 + i }); });
  await search('bulk');
  check('rendering capped at 50 rows', (await rows()).length === 50, (await rows()).length);

  // ── ordering: exact, then starts-with, then rest ──
  await reset(null);
  await page.evaluate(() => { wbChapters.push({ id: 'z1', workbookId: 'wb_p', title: 'Big Plan', file: 'z1.md', content: '', created: 1, updated: 1, order: 9 }, { id: 'z2', workbookId: 'wb_p', title: 'Plan', file: 'z2.md', content: '', created: 1, updated: 1, order: 10 }, { id: 'z3', workbookId: 'wb_p', title: 'Planet', file: 'z3.md', content: '', created: 1, updated: 1, order: 11 }); });
  await open(); await search('plan');
  check('order: exact, starts-with, rest', JSON.stringify((await rows()).map(r => r.split('|')[0])) === '["Plan","Planet","Big Plan"]', await rows());

  // ── keyboard: Ctrl+S / Ctrl+I inside #idea-chapter do nothing behind; Escape closes ──
  await reset('c_fiz'); await open(); await page.focus('#idea-chapter');
  await page.evaluate(() => { window.__saved = 0; const o = window.saveCurrent; });
  const before = await page.$eval('#editor', e => e.value);
  await page.keyboard.press('Control+KeyS'); await page.keyboard.press('Control+KeyI'); await page.waitForTimeout(100);
  check('Ctrl+S / Ctrl+I in picker leave the editor alone', await page.$eval('#editor', e => e.value) === before && (await modalOpen()));
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  check('Escape in picker closes box', !(await modalOpen()));
  check('Escape did not also do something to the page (no error)', !errors.length, errors);

  // Ctrl+Enter in picker saves
  await reset('c_fiz'); await open(); await text('kbd'); await page.focus('#idea-chapter'); await save();
  check('Ctrl+Enter inside picker saves', (await content('c_fiz')).endsWith('kbd\n') && !(await modalOpen()), await content('c_fiz'));

  // plain Enter with list closed: no save, no pick
  await reset('c_fiz'); await open(); await text('keep'); await page.focus('#idea-chapter'); await page.keyboard.press('Enter'); await page.waitForTimeout(80);
  check('Enter with list closed does not save', (await modalOpen()) && !(await content('c_fiz')).includes('keep'));
  await page.keyboard.press('Escape');

  // rapid repeated save: Ctrl+Enter twice must not double-append
  await reset('c_fiz'); await open(); await text('dup');
  await page.keyboard.press('Control+Enter'); await page.keyboard.press('Control+Enter'); await page.waitForTimeout(400);
  const occ = ((await content('c_fiz')).match(/dup/g) || []).length;
  check('double Ctrl+Enter appends once', occ === 1, occ);

  // CRLF text is normalised
  await reset('c_fiz'); await open(); await page.evaluate(() => { document.getElementById('idea-text').value = 'a\r\nb'; }); await save();
  check('CRLF idea → LF in chapter', (await content('c_fiz')).endsWith('a\nb\n') && !(await content('c_fiz')).includes('\r'));

  // ── i18n ──
  await reset('c_fiz');
  await page.evaluate(() => { const b = document.querySelector('[data-lang="ro"], #lang-ro'); });
  const langKeys = await page.evaluate(() => {
    const out = {};
    for (const lang of ['en', 'ro']) {
      window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: lang }));
      out[lang] =['lblIdeaChapter', 'ideaChapterPlaceholder', 'ideaChapterClearTip', 'ideaNoChapter'].map(k => t(k))
        .concat([t('ideaHintSearchNone', { q: 'q', book: 'B', chapter: 'C' }), t('ideaHintSearchMany', { q: 'q', n: 3, book: 'B', chapter: 'C' })]);
    }
    return out;
  });
  check('en strings', langKeys.en && langKeys.en[0] === 'Chapter' && langKeys.en[1] === 'Search chapters…' && langKeys.en[3] === 'No chapter found', langKeys);
  check('ro strings with diacritics', langKeys.ro && langKeys.ro[0] === 'Capitol' && langKeys.ro[1] === 'Caută un capitol…' && langKeys.ro[3] === 'Niciun capitol găsit', langKeys);
  check('ro search hints', langKeys.ro && /Niciun capitol nu se potrivește cu „q”/.test(langKeys.ro[4]) && /se potrivește cu 3 capitole/.test(langKeys.ro[5]), langKeys.ro);
  // rendered DOM in Romanian
  await setLang('ro');
  await open(); await clear(); await search('zzz');
  check('ro DOM: label, placeholder, empty row', await page.evaluate(() => document.querySelector('label[for=idea-chapter]').textContent) === 'Capitol'
    && await page.$eval('#idea-chapter', e => e.placeholder) === 'Caută un capitol…'
    && /Niciun capitol găsit/.test(await page.$eval('#idea-chapter-list', e => e.textContent)));
  await setLang('en');

  // ── layout: × next to input, list within viewport ──
  await reset('c_fiz'); await open(); await clear(); await search('e');
  const geo = await page.evaluate(() => { const i = document.getElementById('idea-chapter').getBoundingClientRect(), b = document.getElementById('idea-chapter-clear').getBoundingClientRect(), l = document.getElementById('idea-chapter-list').getBoundingClientRect(); return { iR: i.right, bL: b.left, lH: l.height }; });
  check('× sits right of input; list ≤ 180px', geo.bL >= geo.iR - 1 && geo.lH <= 182, geo);

  check('no page errors during run', errors.length === 0, errors);
  await browser.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

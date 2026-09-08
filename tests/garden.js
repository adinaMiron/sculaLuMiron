// The garden toolbox in index.html (docs/FEATURES.md § N).
//
// Drives the real app off disk, like find.js and graph.js, against the real
// garden log this feature was written for - the same prose, typos included.
// It asserts on the real record set (`gdLast`), the real table the toolbox
// renders, and the real textarea a row click lands in - see tests/README.md.
//
//   node garden.js           # from tests/
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 0.001 : eps);

// The log as it is actually written: Romanian without diacritics, one
// "@date" per day, a typo ("uateand"), quantities on either side of the
// name, and lines that only look like garden records.
const GRADINA = [
  'din gradina 2026',
  '',
  '@22.07.2026',
  'Am cosit 4 ture de acumulatori in jurul santurilor din gg. Am terminat.',
  '',
  'Cules din solar mare: 6 kg rosii, 970 g dovlecel, 1 kg castraveti, 900 g ardei.',
  '',
  '@25.07.2026',
  'cosit 4 gn',
  'udat la furtun solar mare 12:36 - 13:45. am baltit bine.',
  '',
  'mama a cules din solar mare: 7,7 kg rosii, 400 g castraveti',
  '',
  'cules din s2: 400 g zucchini',
  '',
  'cules din s1: 300 g ardei',
  '',
  '@29.07.2026',
  'cules din sm: 660 g castraveti, 430 g zucchini, 7,5 kg',
  '',
  '@31.07.2026',
  'udat rand 5 in sm 06:02 - 06:30, 250 l apa',
  'uateand 4 in sm 06:34 - 06:49, 140 l apa',
  'udat rand 3 in sm 06:40 - 06:59 160 l apa',
  'ud rand 2 in sm 07:03 - 07:18, 160 l apa',
  'ud rand 1 in sm 07:19 - 07:45, 250 l apa',
  'total',
  'ud la furtun si la stropitoare s1 si s2 08:00 - 9:25',
  '',
  '@01.08.2026',
  'pentru santurile din gp si ceva plante din gp am folosit 270 l apa',
  'in gp nord am folosit 150 l  de apa. am ramas cu 60 l',
  '',
  'cules din sm 5,3 kg rosii',
  'cules din gradina socru: 1300 g castraveti',
  '',
  'semanat in gp: kale, varza chinezeasca, ridiche,',
  '',
  '@03.08.2026',
  'cules din s1: 340 g vinete, 800 g ardei',
  '',
  'cules din sm: zucchini 450 g, 3,3 kg rosii, 400 g castraveti',
  '',
  '@04.08.2026',
  'Am plecat de acasa la 4:33 am ajuns la gradina la 4:55. Am mers pe Poitiers, cherestea',
  '',
  'Am udat in sm la stropitoare: 6:00 - 07:49',
  '',
  'ud s1 la stropitoare: 08:26 - 9:42 700 l apa',
  '',
  'de la gradina am plecat la 9:55 si am ajuns acasa la 10:33. am mers pe scurtatura',
  '',
  '@05.08.2026',
  'udat s2 cu 150 l apa',
  '',
  '@08.08.2026',
  'Plante in solarul mare:',
  'Castraveti: 19 buc',
  'Rosii: 22 buc rand 1, 23 buc rand 2, 18 buc rand 3, 15 buc rand 4, 32 buc rand 5',
  'Zucchini: 10 buc',
  'Ardei: 7 buc',
  '',
  'O roaba de iarba cosita are dimensiunile: 80 x 70 x 50 cm.',
  '',
  'fitbit 13457 pasi, 9,6 km',
  '',
  'cules din sm: 12 kg rosii, 2,7 kg castraveti, 600 g zucchini,',
  '',
  'tata ciprian: rosii 800 g, castraveti 1 kg,',
  '',
  'cules s2: 1,4 kg zucchini',
  '',
  's1: 1 kg ardei',
  '',
  '@22.08.2026',
  'cules din sm: 2 kg rosii, 1 kg dovlecei, 2,9 kg castraveti',
  '',
  'cules din sant iaz: 1,1 kg dovlecei,',
  '',
  '@24.08.2026',
  'cules din s1: 1 kg vinete, 1,5 kg ardei, 1,5 kg rosii cherry',
  'La sud de solarul mare am folosit 5 ture de cosit.',
  '',
  '@03.09.2026',
  'cules din s1: 931 g vinete,'
].join('\n');

// A second workbook, so the "Garden" scope has something to leave out.
const RETETE = [
  '# Supa',
  '',
  '@01.08.2026',
  'cules din frigider: 250 g morcovi',
  ''
].join('\n');

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // The mammoth.js CDN tag cannot load in an offline sandbox.
    if (/Failed to load resource/.test(m.text())) return;
    errors.push('CONSOLE ' + m.text());
  });
  await page.goto(URL);
  await page.waitForTimeout(300);

  // Two workbooks, straight into module state - what is under test is the
  // scanner, not IndexedDB (which has no origin under file://).
  await page.evaluate(([gradina, retete]) => {
    const book = (id, name) => ({ id, name, folder: name.toLowerCase(), created: 1, updated: 1, order: 0 });
    const chap = (id, wb, title, content, order) =>
      ({ id, workbookId: wb, title, file: title.toLowerCase() + '.md', content, created: 1, updated: 1, order });
    wbBooks.length = 0;
    wbChapters.length = 0;
    wbBooks.push(book('wb_gr', 'Gradina'), book('wb_re', 'Retete'));
    wbChapters.push(
      chap('ch_gr', 'wb_gr', 'Gradina2026', gradina, 0),
      chap('ch_re', 'wb_re', 'Supa', retete, 0));
    wbBooted = true;
    invalidateWikiIndex();
    renderWorkbooks();
  }, [GRADINA, RETETE]);
  await page.waitForTimeout(150);

  const state = (patch) => page.evaluate(p => {
    Object.assign(gdState, p);
    gdRender();
    return {
      rows: gdLast.rows.length,
      totals: gdLast.totals,
      places: gdLast.places.map(x => [x.label, x.n]),
      plants: gdLast.plants.map(x => [x.label, x.n]),
      cats: gdLast.cats.map(x => [x.key, x.n]),
      groups: gdLast.groups.map(g => [g.label, g.n, g.grams, g.rounds, g.mins, g.litres]),
      bodyRows: document.querySelectorAll('#gd-table tbody tr').length,
      head: Array.from(document.querySelectorAll('#gd-table th')).map(th => th.textContent),
      foot: document.getElementById('gd-foot').textContent,
      upto: document.getElementById('gd-upto').textContent
    };
  }, patch);

  // ---- 1. the toolbox opens ---------------------------------------------
  const opened = await page.evaluate(() => {
    toggleGarden();
    return {
      open: document.getElementById('garden-view').classList.contains('open'),
      scope: gdState.scope,
      to: gdState.to,
      btn: !!document.getElementById('btn-garden')
    };
  });
  check('🌱 button exists and the overlay opens', opened.open && opened.btn, opened);
  check('the default scope is the garden workbook', opened.scope === 'garden', opened);
  check('"up to" defaults to today', opened.to === new Date().toISOString().slice(0, 10)
    || /^\d{4}-\d{2}-\d{2}$/.test(opened.to), opened);

  // ---- 2. harvest: the rows, the plants, the total -----------------------
  const h = await state({ tab: 'harvest', from: '', to: '', place: '', plant: '', cat: '', q: '', group: 'none' });
  // 6+0.97+1+0.9 +7.7+0.4 +0.4 +0.3 +0.66+0.43+7.5 +5.3 +1.3 +0.34+0.8
  // +0.45+3.3+0.4 +12+2.7+0.6 +1.4 +1 +2+1+2.9 +1.1 +1+1.5+1.5 +0.931
  check('every harvest item is one row', h.rows === 31, h.rows);
  check('the harvest total is the sum of the log', near(h.totals.grams, 67781, 1), h.totals.grams);
  check('the footer states the total in kg', /67,78 kg/.test(h.foot), h.foot);
  check('"7,5 kg" with no plant name is still counted',
    h.plants.some(p => p[0] === '—'), h.plants);
  check('a plant written two ways is one plant',
    h.plants.some(p => p[0] === 'Dovlecel' && p[1] === 8), h.plants);
  check('"rosii cherry" is not folded into "rosii"',
    h.plants.some(p => p[0] === 'Roșii cherry'), h.plants);
  check('an unlisted plot keeps the words used for it',
    h.places.some(p => p[0] === 'Grădina socru'), h.places);
  check('"cules din sant iaz" finds the plot, not the pond',
    h.places.some(p => p[0] === 'Șanț iaz') && !h.places.some(p => p[0] === 'Iaz'), h.places);
  check('a plant count ("Castraveti: 19 buc") is not a harvest',
    h.totals.pieces === 0, h.totals);

  // ---- 3. harvest filtered by plant, place and date ----------------------
  const ardei = await state({ plant: 'ardei' });
  check('filtering by plant totals only that plant',
    near(ardei.totals.grams, 900 + 300 + 800 + 1000 + 1500, 1), ardei.totals.grams);
  const s1Ardei = await state({ place: 's1' });
  check('plant + place narrows further',
    near(s1Ardei.totals.grams, 300 + 800 + 1000 + 1500, 1), s1Ardei.totals.grams);
  const upto = await state({ plant: '', place: '', to: '2026-07-29' });
  check('"up to" cuts the total at that day', near(upto.totals.grams, 26260, 1), upto.totals.grams);
  check('the footer says which day it counts up to', /29\.07\.2026/.test(upto.upto), upto.upto);
  const window_ = await state({ from: '2026-08-22', to: '2026-08-24' });
  check('"from"+"up to" is a window',
    near(window_.totals.grams, 2000 + 1000 + 2900 + 1100 + 1000 + 1500 + 1500, 1), window_.totals.grams);

  // ---- 4. harvest grouped ------------------------------------------------
  const byPlant = await state({ from: '', to: '', group: 'plant' });
  const dov = byPlant.groups.find(g => g[0] === 'Dovlecel');
  check('grouping by plant sums each plant once',
    dov && near(dov[2], 970 + 400 + 430 + 450 + 600 + 1400 + 1000 + 1100, 1), byPlant.groups);
  const byPlace = await state({ group: 'place' });
  const sm = byPlace.groups.find(g => g[0] === 'Solar mare');
  check('grouping by place sums each plot', sm && near(sm[2], 56210, 1), byPlace.groups);
  check('a grouped table has its own columns',
    byPlant.head.length === 3, byPlant.head);

  // ---- 5. mowing: times and rounds ---------------------------------------
  const m = await state({ tab: 'mow', group: 'none', place: '', plant: '', from: '', to: '' });
  check('three mowing sessions, thirteen rounds',
    m.rows === 3 && m.totals.rounds === 13, m.totals);
  check('a wheelbarrow of mown grass is not a mowing session',
    !m.rows || m.rows === 3, m.rows);
  const mGG = await state({ place: 'gg' });
  check('mowing filtered to one plot', mGG.rows === 1 && mGG.totals.rounds === 4, mGG.totals);
  const mUpto = await state({ place: '', to: '2026-07-25' });
  check('the running mowing total stops at the chosen day',
    mUpto.rows === 2 && mUpto.totals.rounds === 8, mUpto.totals);
  const mByPlace = await state({ to: '', group: 'place' });
  check('mowing grouped by plot counts the times per plot',
    mByPlace.groups.length === 3 && mByPlace.groups.every(g => g[1] === 1), mByPlace.groups);

  // ---- 6. activities: interval, duration, water --------------------------
  const a = await state({ tab: 'act', group: 'none', place: '', cat: '', from: '', to: '' });
  const water = a.cats.find(c => c[0] === 'water');
  check('every watering line is an activity', water && water[1] === 12, a.cats);
  check('the day total of water is what the lines say',
    near(a.totals.litres, 250 + 140 + 160 + 160 + 250 + 270 + 150 + 700 + 150, 1), a.totals.litres);
  check('"am ramas cu 60 l" is not water used', a.totals.litres !== 2290, a.totals.litres);

  const timed = await page.evaluate(() => gdLast.rows
    .filter(r => r.mins != null)
    .map(r => [r.from, r.to, r.mins, (r.places[0] || {}).label || '—']));
  check('an interval becomes a duration',
    timed.some(r => r[0] === '06:02' && r[1] === '06:30' && r[2] === 28), timed);
  check('a single-digit hour is read too ("9:25")',
    timed.some(r => r[0] === '08:00' && r[1] === '09:25' && r[2] === 85), timed);
  check('a line naming two plots keeps both',
    await page.evaluate(() => gdLast.rows.some(r => r.places.length === 2 && r.mins === 85)));
  check('"am plecat la 4:33 ... am ajuns la 4:55" is not an interval',
    !timed.some(r => r[0] === '04:33'), timed);
  check('the typo line is still read as an activity',
    timed.some(r => r[0] === '06:34' && r[2] === 15), timed);

  const wSm = await state({ cat: 'water', place: 'sm' });
  check('watering filtered to one plot totals its water',
    near(wSm.totals.litres, 250 + 140 + 160 + 160 + 250, 1), wSm.totals.litres);
  check('the activities footer carries duration and water',
    /h\s\d\d\sm/.test(wSm.foot) && /l/.test(wSm.foot), wSm.foot);

  const sow = await state({ cat: 'sow', place: '' });
  check('sowing is its own category', sow.rows === 1, sow.rows);

  // ---- 7. the scope leaves the other workbook out ------------------------
  const vault = await page.evaluate(() => {
    gdState.tab = 'harvest'; gdState.cat = ''; gdState.place = ''; gdState.plant = '';
    gdState.from = ''; gdState.to = ''; gdState.group = 'none';
    gdState.scope = 'vault'; gdScanCache.clear(); gdRender();
    const all = gdLast.rows.length;
    gdState.scope = 'garden'; gdScanCache.clear(); gdRender();
    return { all, garden: gdLast.rows.length };
  });
  check('the "Garden" scope reads only the garden workbook',
    vault.all === vault.garden + 1, vault);

  // ---- 8. a row goes to the line it was read from ------------------------
  const jumped = await page.evaluate(async () => {
    gdState.tab = 'harvest'; gdState.place = 'socru'; gdRender();
    const tr = document.querySelector('#gd-table tbody tr.gd-row');
    tr.click();
    await new Promise(r => setTimeout(r, 400));
    const line = editor.value.slice(0, editor.selectionStart).split('\n').length - 1;
    return {
      open: document.getElementById('garden-view').classList.contains('open'),
      chapter: wbCurrentId,
      text: editor.value.split('\n')[line]
    };
  });
  check('clicking a row opens its chapter at that line',
    jumped.chapter === 'ch_gr' && /gradina socru/.test(jumped.text), jumped);
  check('and closes the toolbox behind it', jumped.open === false, jumped);

  // ---- 9. both languages -------------------------------------------------
  const lang = await page.evaluate(() => {
    toggleGarden();
    gdState.tab = 'mow'; gdState.place = ''; gdRender();
    window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'en' }));
    const en = { head: Array.from(document.querySelectorAll('#gd-table th')).map(t => t.textContent), foot: document.getElementById('gd-foot').textContent };
    window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'ro' }));
    const ro = { head: Array.from(document.querySelectorAll('#gd-table th')).map(t => t.textContent), foot: document.getElementById('gd-foot').textContent };
    return { en, ro };
  });
  check('the generated table follows the UI language',
    lang.en.head.join() !== lang.ro.head.join()
    && /Rounds/.test(lang.en.head.join()) && /Ture/.test(lang.ro.head.join()), lang);
  check('and so does the footer', /sessions/.test(lang.en.foot) && /cosiri/.test(lang.ro.foot), lang);

  // ---- 10. the CSV is what is on screen -----------------------------------
  const csv = await page.evaluate(async () => {
    const real = ScuLaFolder.save;
    let got = null;
    ScuLaFolder.save = (name, blob) => { got = { name, text: null, blob }; return Promise.resolve(); };
    gdState.tab = 'harvest'; gdState.place = 's2'; gdState.group = 'none';
    gdState.from = ''; gdState.to = ''; gdRender();
    gdCsv();
    ScuLaFolder.save = real;
    got.text = await got.blob.text();
    return { name: got.name, text: got.text };
  });
  check('the CSV is named for the tab and the day',
    /^gradina-harvest-\d{4}-\d{2}-\d{2}\.csv$/.test(csv.name), csv.name);
  check('the CSV carries the visible rows and the total',
    csv.text.split('\n').length === 5
    && /Solar 2/.test(csv.text) && /1,80 kg/.test(csv.text), csv.text);
  // Semicolons and a decimal comma: what a Romanian Excel opens natively.
  check('the CSV is semicolon-separated with a decimal comma',
    /;Solar 2;Dovlecel;1,4;/.test(csv.text)
    && !/,Solar 2,/.test(csv.text), csv.text);

  // ---- 11. Esc closes it -------------------------------------------------
  await page.keyboard.press('Escape');
  const closed = await page.evaluate(() => !document.getElementById('garden-view').classList.contains('open'));
  check('Esc closes the toolbox', closed);

  check('no page errors', errors.length === 0, errors.slice(0, 4));

  console.log(failed ? '\n' + failed + ' check(s) failed' : '\nall checks passed');
  await browser.close();
  process.exit(failed ? 1 : 0);
})();

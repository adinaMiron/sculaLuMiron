// Checks for recipes.html's day composer: the brunch flag, the shareable
// HTML page read back into the model it was built from, and the recipe
// library the picker adds a meal to a day out of.
//
// Same style as the rest of this folder: a plain Node script, PASS/FAIL per
// check, non-zero exit if anything failed. Served over http://127.0.0.1
// rather than file:// for the same reason tests/recipes.js is — the page
// reaches for IndexedDB and a file:// origin is opaque.
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const ROOT = path.join(__dirname, '..');

let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || extra === undefined ? '' : '\n      ' + extra));
  if (!ok) failures++;
}

/* A day with all four flags on it, a component heading, and quantities the
   USDA table can actually price — the round trip is only worth anything if
   there are numbers in it to lose. */
const PLAN = [
  'ZIUA 1',
  'Mic dejun: Terci de ovăz',
  '• 60g fulgi de ovăz fini',
  '• 200ml lapte',
  '• Fierbe laptele și toarnă-l peste ovăz.',
  'Brunch: Omletă cu spanac',
  '• 2 ouă',
  '• 50g spanac',
  '• Bate ouăle și prăjește-le cu spanacul.',
  'Prânz: Piept de pui cu orez',
  '• 200g piept de pui',
  '• 80g orez',
  'Sos:',
  '• 1 lingură ulei de măsline',
  '• Gătește puiul la tigaie și fierbe orezul.',
  'Cina: Somon cu broccoli',
  '• 150g somon',
  '• 200g broccoli',
  '• Coace somonul la cuptor.'
].join('\n');

function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.md': 'text/markdown' };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('no'); return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

// The model, stripped to what a round trip has to preserve. The USDA id is
// read as the food the row was *resolved* to rather than as the raw `fdc`
// field, because that is what both files this page writes carry: the
// markdown's fourth column and the page's data-fdc both hold the match, so
// a plan read back has its foods written down where the freshly-parsed one
// had them worked out.
const SHAPE = `d => ({
  title: d.title,
  meals: d.meals.map(m => ({
    kind: m.kind, label: m.label, name: m.name,
    ing: m.ingredients.map(i => [i.qty, i.unit, i.item, i.group,
      i.fdc || window.ScuLaRecipes.Nutrition.forIngredient(i).id].join('|')),
    steps: m.steps.slice()
  }))
})`;

(async () => {
  const { server, port } = await serve();
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errors.push('CONSOLE ' + m.text());
  });
  await page.goto(`http://127.0.0.1:${port}/recipes.html`);
  await page.waitForFunction(() => !!window.ScuLaRecipes);

  /* ---- 1. brunch is a meal word of its own ---- */
  const kinds = await page.evaluate(s =>
    window.ScuLaRecipes.Recipes.parse(s)[0].meals.map(m => m.kind), PLAN);
  check('brunch parses as its own kind, in the order it was written',
        kinds.join(',') === 'breakfast,brunch,lunch,dinner', kinds.join(','));

  const chipKinds = await page.evaluate(() => {
    window.ScuLaRecipes.openPicker(null);
    const on = Array.from(document.querySelectorAll('#pickKinds .chip')).map(b => b.textContent);
    window.ScuLaRecipes.closePicker();
    return on;
  });
  check('the picker offers the four flags plus "as saved"',
        ['Mic dejun', 'Brunch', 'Prânz', 'Cina'].every(k => chipKinds.includes(k)) &&
        chipKinds[0] === 'Cum e salvată', chipKinds.join(' · '));

  /* ---- 2. the shareable page, read back ---- */
  await page.evaluate(s => {
    const R = window.ScuLaRecipes;
    R.model.days = R.Recipes.parse(s);
    R.model.source = 'plan-de-test.pdf';
    R.renderDays(); R.renderMarkdown();
  }, PLAN);

  const before = await page.evaluate(sh => window.ScuLaRecipes.model.days.map(eval('(' + sh + ')')), SHAPE);
  const doc = await page.evaluate(() => window.ScuLaRecipes.buildHtmlDoc('Planul meu'));
  check('the exported page carries the USDA id on the ingredient',
        /<li data-fdc="[0-9L]/.test(doc), doc.split('\n').filter(l => /<li/.test(l))[0]);

  const after = await page.evaluate(([html, sh]) =>
    window.ScuLaRecipes.Recipes.fromHtml(html).days.map(eval('(' + sh + ')')), [doc, SHAPE]);
  check('an HTML page written here reads back as the model it was built from',
        JSON.stringify(after) === JSON.stringify(before),
        JSON.stringify(before) + '\n      ---\n      ' + JSON.stringify(after));

  const grp = after[0] && after[0].meals[2] && after[0].meals[2].ing.map(x => x.split('|')[3]);
  check('the ingredient group — the one thing markdown cannot carry — survives HTML',
        !!grp && grp.includes('Sos'), JSON.stringify(grp));

  const src = await page.evaluate(html => window.ScuLaRecipes.Recipes.fromHtml(html).source, doc);
  check('the page names its own source', src === 'Planul meu', src);

  check('a page with no recipes in it is not read as one',
        await page.evaluate(() =>
          window.ScuLaRecipes.Recipes.looksLikeRecipeHtml('<html><body><h1>hi</h1></body></html>') === false));

  /* ---- 3. analyse() sends an HTML page to the right reader ---- */
  const routed = await page.evaluate(html => {
    const R = window.ScuLaRecipes;
    R.model.days = [];
    document.getElementById('rawText').value = html;
    R.analyse(false);
    return { days: R.model.days.length, kinds: R.model.days[0].meals.map(m => m.kind).join(',') };
  }, doc);
  check('analyse() routes an HTML page to fromHtml, not to the parser',
        routed.days === 1 && routed.kinds === 'breakfast,brunch,lunch,dinner',
        JSON.stringify(routed));

  /* ---- 4. the library ---- */
  const lib = await page.evaluate(async () => {
    const R = window.ScuLaRecipes;
    R.model.library = [];
    const meal = R.model.days[0].meals[1];              // the brunch omelette
    const first = R.libAdd(meal, 'plan-de-test');
    const again = R.libAdd(meal, 'plan-de-test');       // the same recipe twice
    await R.saveLibrary();
    return { first, again, n: R.model.library.length };
  });
  check('a meal goes into the library once, not twice',
        lib.first === true && lib.again === false && lib.n === 1, JSON.stringify(lib));

  const kept = await page.evaluate(() => {
    const R = window.ScuLaRecipes;
    // Editing the copy on the plan must not reach back into the library.
    R.model.days[0].meals[1].ingredients[0].item = 'ALTCEVA';
    return R.model.library[0].meal.ingredients[0].item;
  });
  check('the library keeps a copy, not a reference', kept === 'ouă', kept);

  /* ---- 5. the picker puts a recipe on a day, under the flag chosen ---- */
  await page.evaluate(() => {
    const R = window.ScuLaRecipes;
    R.model.days = [];                                  // an empty plan to compose
    R.renderDays(); R.renderMarkdown();
  });
  await page.click('#btnPickMeal');
  await page.waitForSelector('#pickModal.open');
  // "Cina" — deliberately not the flag the recipe was saved under.
  await page.click('#pickKinds .chip:nth-child(6)');
  const flag = await page.textContent('#pickKinds .chip:nth-child(6)');
  await page.click('#pickList .libmeal .go');

  const placed = await page.evaluate(() => {
    const R = window.ScuLaRecipes;
    const d = R.model.days[0];
    return { days: R.model.days.length, meals: d.meals.length, kind: d.meals[0].kind,
             name: d.meals[0].name, libItem: R.model.library[0].meal.ingredients[0].item };
  });
  check('choosing a flag and a recipe puts it on a new day under that flag',
        flag === 'Cina' && placed.days === 1 && placed.meals === 1 &&
        placed.kind === 'dinner' && placed.name === 'Omletă cu spanac',
        JSON.stringify(placed) + ' flag=' + flag);
  check('and what it copied in is still the library\'s own',
        placed.libItem === 'ouă', placed.libItem);

  /* ---- 6. the day sums what has been put on it ---- */
  await page.click('#pickKinds .chip:nth-child(2)');    // "Mic dejun"
  await page.click('#pickList .libmeal .go');
  const sums = await page.evaluate(() => {
    const R = window.ScuLaRecipes, N = R.Nutrition;
    const day = R.model.days[0];
    const one = N.forMeal(day.meals[0]).sum.kcal;
    const both = N.forDay(day).sum.kcal;
    // totalsBlock() wraps its line so the detail panel has somewhere to go,
    // so the day's own total is one level down from the day body.
    const line = document.querySelector('#days .daybody > div > .tot');
    return { meals: day.meals.length, kinds: day.meals.map(m => m.kind).join(','),
             one: one, both: both, kcal: N.num(both, 0),
             shown: line ? line.textContent : '' };
  });
  check('a second meal lands on the same day, under its own flag',
        sums.meals === 2 && sums.kinds === 'dinner,breakfast', JSON.stringify(sums));
  check('the day total is the meals on it added up',
        sums.both > 0 && Math.abs(sums.both - 2 * sums.one) < 1e-9, JSON.stringify(sums));
  check('and the day total is on screen',
        sums.shown.indexOf(sums.kcal + ' kcal') >= 0, sums.shown);

  /* ---- 7. the library survives a reload ---- */
  await page.reload();
  await page.waitForFunction(() => !!window.ScuLaRecipes);
  await page.waitForFunction(() => window.ScuLaRecipes.model.library.length > 0, null, { timeout: 5000 })
    .catch(() => {});
  const back = await page.evaluate(() => {
    const R = window.ScuLaRecipes;
    return { n: R.model.library.length, name: (R.model.library[0] || {}).meal &&
             R.model.library[0].meal.name };
  });
  check('the library is still there after a reload',
        back.n === 1 && back.name === 'Omletă cu spanac', JSON.stringify(back));

  check('no page errors', errors.length === 0, errors.join('\n      '));

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})();

// Checks for recipes.html's daily targets: the four fields, the comparison
// under a day, the chip on a collapsed one, the two extra rows in the
// markdown's day total, and the difference row in the shareable page that
// follows an edited quantity.
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

/* Two days the USDA table can price, so there are real numbers to measure
   against a target rather than a page full of empty cells. */
const PLAN = [
  'ZIUA 1',
  'Mic dejun: Terci de ovăz',
  '• 60g fulgi de ovăz fini',
  '• 200ml lapte',
  '• Fierbe laptele și toarnă-l peste ovăz.',
  'Prânz: Piept de pui cu orez',
  '• 200g piept de pui',
  '• 80g orez',
  '• Gătește puiul la tigaie și fierbe orezul.',
  'ZIUA 2',
  'Mic dejun: Omletă',
  '• 2 ouă',
  '• Bate ouăle și prăjește-le.'
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

// The four fields, typed into the way a person types into them, so the
// input listener and savePrefs() are on the path rather than bypassed.
async function typeTargets(page, v) {
  for (const [id, val] of Object.entries(v)) {
    await page.fill('#' + id, '');
    if (val !== '') await page.fill('#' + id, String(val));
  }
  await page.waitForTimeout(60);
}

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

  await page.evaluate(s => {
    const R = window.ScuLaRecipes;
    R.model.days = R.Recipes.parse(s);
    R.model.source = 'plan-de-test.pdf';
    R.renderDays(); R.renderMarkdown();
  }, PLAN);

  /* ---- 1. nothing at all until somebody asks ---- */
  check('with no targets set, a day shows no comparison',
        await page.evaluate(() => document.querySelectorAll('#days .goals').length === 0));
  check('and the markdown has no target rows either',
        await page.evaluate(() => window.ScuLaRecipes.allMarkdown().indexOf('Obiectiv') < 0));

  /* ---- 2. an empty field is "no opinion", not a target of nought ---- */
  await page.evaluate(() => document.getElementById('targetBox').open = true);
  await typeTargets(page, { tgKcal: 2000, tgProt: '', tgCarb: '', tgFat: '' });
  const one = await page.evaluate(() => {
    const box = document.querySelector('#days .goals');
    return { rows: box ? box.querySelectorAll('.g').length : -1,
             text: box ? box.textContent : '' };
  });
  check('one target set compares one macro and leaves the other three alone',
        one.rows === 1 && /kcal/.test(one.text), JSON.stringify(one));

  /* ---- 3. all four, and the three verdicts ---- */
  const day1 = await page.evaluate(() => {
    const R = window.ScuLaRecipes;
    return R.Nutrition.forDay(R.model.days[0]).sum;
  });
  // A target 40% under the day's own kcal is unambiguously "over"; one
  // 40% above it is "under"; the day's own number is "met".
  await typeTargets(page, {
    tgKcal: Math.round(day1.kcal),
    tgProt: Math.round(day1.prot * 1.6),
    tgCarb: Math.round(day1.carb * 0.6),
    tgFat: ''
  });
  const states = await page.evaluate(() => {
    const box = document.querySelector('#days .goals');
    return Array.from(box.querySelectorAll('.g')).map(g => ({
      cls: g.className, name: g.querySelector('.gn').textContent,
      val: g.querySelector('.gv').textContent, delta: g.querySelector('.gd').textContent,
      bar: g.querySelector('.bar > i').style.width
    }));
  });
  check('the day hitting its energy target reads as met',
        states[0] && /\bmet\b/.test(states[0].cls) && states[0].delta === 'la țintă',
        JSON.stringify(states[0]));
  check('a target it falls short of reads as under, with what is left to go',
        states[1] && /\bunder\b/.test(states[1].cls) && /încă /.test(states[1].delta),
        JSON.stringify(states[1]));
  check('a target it goes past reads as over, with the excess',
        states[2] && /\bover\b/.test(states[2].cls) && / peste$/.test(states[2].delta),
        JSON.stringify(states[2]));
  check('the empty fourth field is left out of the comparison entirely',
        states.length === 3, JSON.stringify(states.map(s => s.name)));
  check('the bar of a met target is full',
        states[0] && parseFloat(states[0].bar) > 95, states[0] && states[0].bar);

  /* ---- 4. the note that catches a set of targets disagreeing with itself ---- */
  await typeTargets(page, { tgKcal: 2000, tgProt: 150, tgCarb: 200, tgFat: 60 });
  const note = await page.evaluate(() => document.getElementById('tgNote').textContent);
  // 150*4 + 200*4 + 60*9 = 1940, which is 60 short of the 2000 typed.
  check('the note prices the three macros and says how far off the energy target is',
        /1940/.test(note) && /−60/.test(note), note);

  /* ---- 5. the markdown ---- */
  const md = await page.evaluate(() => window.ScuLaRecipes.allMarkdown());
  const tgRow = md.split('\n').find(l => l.indexOf('| Obiectiv |') === 0);
  const dfRow = md.split('\n').find(l => l.indexOf('| Diferență |') === 0);
  check('the day-total table gains an Obiectiv row in the same five columns',
        !!tgRow && tgRow.split('|').length === 7 && /\| 2000 \|/.test(tgRow), tgRow);
  check('and a Diferență row with a signed number in it',
        !!dfRow && /[+−-]?\d/.test(dfRow), dfRow);
  check('a plan read back out of that markdown still parses as its days',
        await page.evaluate(m => {
          const d = window.ScuLaRecipes.Recipes.fromMarkdown(m).days;
          return d.length === 2 && d[0].meals.length === 2;
        }, md));

  /* ---- 6. the chip on a day nobody has opened ---- */
  const chip = await page.evaluate(() => {
    const R = window.ScuLaRecipes;
    // Nine days is past the eight the list opens by itself.
    const one = R.model.days[0];
    while (R.model.days.length < 9) R.model.days.push(JSON.parse(JSON.stringify(one)));
    R.renderDays();
    const c = document.querySelector('#days .daysum .dgoal');
    return c ? { text: c.textContent, cls: c.className, title: c.title } : null;
  });
  check('a collapsed day carries its energy verdict as a chip',
        !!chip && / \/ 2000 kcal$/.test(chip.text), JSON.stringify(chip));
  check('and the chip is coloured by the same three states',
        !!chip && /\b(met|under|over)\b/.test(chip.cls), chip && chip.cls);

  /* ---- 7. the shareable page ---- */
  const doc = await page.evaluate(() => window.ScuLaRecipes.buildHtmlDoc('Planul meu'));
  check('the exported page puts the targets on the day table as data attributes',
        /<table class="nutri dtot" data-tk="2000" data-tp="150" data-tc="200" data-tf="60">/.test(doc),
        (doc.split('\n').find(l => /class="nutri dtot"/.test(l)) || '').slice(0, 160));
  check('and writes both foot rows out, so a page opened with scripting off is right',
        /<tr class="goal">/.test(doc) && /<tr class="gdiff">/.test(doc),
        (doc.split('\n').find(l => /class="gdiff"/.test(l)) || '').slice(0, 200));

  // The difference has to follow an edited quantity like every other number
  // on that page — that is the whole reason the file carries a script.
  const frame = await ctx.newPage();
  await frame.setContent(doc);
  const live = await frame.evaluate(() => {
    const cell = () => {
      const td = document.querySelector('article.day table.dtot tfoot tr.gdiff td.kc');
      return { text: td.textContent, cls: td.className };
    };
    const was = cell();
    const q = document.querySelector('article.day input.qty');
    q.value = String((parseFloat(q.value) || 0) * 10);
    q.dispatchEvent(new Event('input', { bubbles: true }));
    return { was, now: cell() };
  });
  check('the difference row follows a quantity edited in the exported page',
        live.was.text !== live.now.text, JSON.stringify(live));
  check('and it turns red once the day has gone past the target',
        /\bover\b/.test(live.now.cls) && live.now.text.charAt(0) === '+', JSON.stringify(live.now));
  await frame.close();

  /* ---- 8. the targets survive a reload ---- */
  await page.reload();
  await page.waitForFunction(() => !!window.ScuLaRecipes);
  await page.waitForFunction(() => window.ScuLaRecipes.targets.kcal > 0, null, { timeout: 5000 })
    .catch(() => {});
  const back = await page.evaluate(() => ({
    t: window.ScuLaRecipes.targets,
    fields: ['tgKcal', 'tgProt', 'tgCarb', 'tgFat'].map(id => document.getElementById(id).value),
    open: document.getElementById('targetBox').open
  }));
  check('the four targets are still there after a reload, in the fields too',
        back.t.kcal === 2000 && back.t.fat === 60 && back.fields.join(',') === '2000,150,200,60',
        JSON.stringify(back));
  check('and the fold opens by itself for somebody who has set them',
        back.open === true);

  /* ---- 9. clearing them puts the page back where it started ---- */
  await page.click('#btnTgClear');
  await page.waitForTimeout(60);
  const cleared = await page.evaluate(() => ({
    t: window.ScuLaRecipes.targets,
    fields: ['tgKcal', 'tgProt', 'tgCarb', 'tgFat'].map(id => document.getElementById(id).value).join(''),
    goals: document.querySelectorAll('#days .goals').length,
    note: document.getElementById('tgNote').textContent
  }));
  check('"clear the targets" empties the fields and every comparison with them',
        cleared.fields === '' && cleared.goals === 0 &&
        Object.values(cleared.t).every(v => v === null) &&
        /Niciun obiectiv/.test(cleared.note), JSON.stringify(cleared));

  check('no page errors', errors.length === 0, errors.join('\n      '));

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})();

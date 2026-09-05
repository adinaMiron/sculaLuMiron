// The causality diagram in index.html — the second mode of the graph view.
//
// Same rules as graph.js: the real app off disk, real pixels on the canvas
// (getImageData, never a screenshot), no stubs. See tests/README.md.
//
//   node cause.js            # from tests/
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

// Two vicious circles, one thermostat, one delayed effect, and three lines
// that look like relations but are not.
const NOTE = [
  '# Bucle',
  '',
  'stres -> insomnie -> stres',
  'insomnie -| odihnă',
  'odihnă -| stres',
  '',
  'foame -> mâncat -| foame',
  '',
  'investiție ~> profit',
  '',
  'Stres -> tensiune',
  '',
  '- somn bun -> dispoziție',
  '',
  'Această propoziție lungă despre absolut orice altceva conține o săgeată -> și tocmai de aceea nu are ce căuta în diagramă.',
  '',
  '```',
  'cod -> nu contează',
  '```',
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

  await page.evaluate(md => {
    document.getElementById('editor').value = md;
    updatePreview(); updateStatus();
  }, NOTE);
  await page.waitForTimeout(120);

  // ---- 1. the preview draws the chain ------------------------------------
  const pv = await page.evaluate(() => ({
    chains: document.querySelectorAll('#preview .md-causal').length,
    inList: document.querySelectorAll('#preview li > .md-causal').length,
    terms: document.querySelectorAll('#preview .md-cause-term').length,
    arrows: document.querySelectorAll('#preview .md-cause-arrow').length,
    negatives: document.querySelectorAll('#preview .md-cause-neg').length,
    delays: document.querySelectorAll('#preview .md-cause-delay').length,
    diacritics: Array.from(document.querySelectorAll('#preview .md-cause-term'))
      .some(e => e.textContent === 'odihnă'),
    prose: /săgeată -&gt;|săgeată ->/.test(document.getElementById('preview').innerHTML),
    code: /cod -&gt; nu contează/.test(document.getElementById('preview').innerHTML)
  }));
  check('every causal line became a chain', pv.chains === 7, pv);
  check('a bullet keeps its list and gets the chain inside', pv.inList === 1, pv);
  check('key words became chips', pv.terms === 16, pv);
  check('arrows became glyphs', pv.arrows === 9, pv);
  check('“-|” is drawn as the negative sign', pv.negatives === 3, pv);
  check('“~>” is drawn as delayed', pv.delays === 1, pv);
  check('diacritics survive the chip', pv.diacritics, pv);
  check('an arrow inside a sentence is left alone', pv.prose, pv);
  check('an arrow inside a code block is left alone', pv.code, pv);

  // ---- 2. the diagram ----------------------------------------------------
  await page.evaluate(() => { setGraphMode('links'); openGraph('note'); });
  await page.waitForTimeout(400);
  await page.evaluate(() => setGraphMode('cause'));
  await page.waitForTimeout(900);

  const g = await page.evaluate(() => ({
    mode: gvSettings.mode,
    marked: document.getElementById('graph-view').classList.contains('cause'),
    kinds: gv.nodes.reduce((a, n) => (a[n.kind] = (a[n.kind] || 0) + 1, a), {}),
    links: gv.links.length,
    signs: gv.links.reduce((a, l) => (a[l.sign > 0 ? 'pos' : 'neg']++, a), { pos: 0, neg: 0 }),
    delayed: gv.links.filter(l => l.delay).length,
    labels: gv.nodes.map(n => n.label).sort(),
    bowed: gv.links.filter(l => l.bow).length,
    loops: gv.loops.map(l => ({ sign: l.sign, len: l.links.length, names: l.nodes.map(n => n.label) })),
    stats: document.getElementById('gv-stats').textContent,
    legend: document.querySelectorAll('#gv-legend span.gv-dot').length
  }));
  check('the mode switch draws the causality diagram', g.mode === 'cause' && g.marked, g);
  check('key words are the nodes', g.kinds.keyword === 10 && !g.kinds.note, g.kinds);
  check('“Stres” and “stres” are the same key word', g.labels.filter(l => /^stres$/i.test(l)).length === 1, g.labels);
  check('every arrow is a relation', g.links === 9, g);
  check('signs are read off the arrows', g.signs.pos === 6 && g.signs.neg === 3, g.signs);
  check('“~>” carries the delay into the diagram', g.delayed === 1, g);
  check('two arrows between one pair are bowed apart', g.bowed === 4, g);
  check('the stats line counts the loops', /3/.test(g.stats), g.stats);
  check('the legend switched to the causal roles', g.legend === 5, g.legend);

  // ---- 3. circular causality ---------------------------------------------
  check('three closed loops found', g.loops.length === 3, g.loops);
  check('shortest loops come first', g.loops[0].len === 2 && g.loops[2].len === 3, g.loops);
  check('stres ⇄ insomnie is reinforcing (R)', g.loops[0].sign > 0, g.loops[0]);
  check('foame ⇄ mâncat is balancing (B)', g.loops[1].sign < 0 && g.loops[1].len === 2, g.loops[1]);
  check('the three-word circle is reinforcing too', g.loops[2].sign > 0, g.loops[2]);
  check('a loop knows its own words',
    g.loops[2].names.slice().sort().join(',') === ['stres', 'insomnie', 'odihnă'].sort().join(','), g.loops[2]);

  const rows = await page.evaluate(() => ({
    count: document.querySelectorAll('#gv-loops .gv-loop').length,
    badges: Array.from(document.querySelectorAll('#gv-loops .gv-badge')).map(b => b.textContent),
    text: (document.querySelector('#gv-loops .gv-loop span:last-child') || {}).textContent
  }));
  check('every loop got a row', rows.count === 3, rows);
  check('rows are badged R / B', rows.badges.join(',') === 'R1,B2,R3', rows.badges);
  check('a row spells the circle out and closes it',
    /→/.test(rows.text) && rows.text.split(' ')[0] === rows.text.split(' ').slice(-1)[0], rows.text);

  // Real pixels: the diagram must actually be on the canvas.
  const painted = await page.evaluate(() => {
    const c = document.getElementById('graph-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let on = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) on++;
    return on;
  });
  check('canvas is painted', painted > 500, painted);

  // Pinning a loop lights it and dims the rest — the pixels have to change.
  const pinned = await page.evaluate(() => {
    const c = document.getElementById('graph-canvas');
    const g2 = c.getContext('2d');
    const before = g2.getImageData(0, 0, c.width, c.height).data;
    document.querySelectorAll('#gv-loops .gv-loop')[0].click();
    const after = g2.getImageData(0, 0, c.width, c.height).data;
    let diff = 0;
    for (let i = 3; i < before.length; i += 4) if (before[i] !== after[i]) diff++;
    return {
      pin: gv.loopPin,
      on: document.querySelectorAll('#gv-loops .gv-loop.on').length,
      diff
    };
  });
  check('clicking a loop pins it', pinned.pin === 0 && pinned.on === 1, pinned);
  check('and the canvas redraws around it', pinned.diff > 200, pinned);
  await page.evaluate(() => document.querySelectorAll('#gv-loops .gv-loop')[0].click());

  // ---- 4. "only what is in a loop" ---------------------------------------
  const only = await page.evaluate(() => {
    document.getElementById('gv-loopsOnly').click();
    const kept = { nodes: gv.nodes.map(n => n.label).sort(), links: gv.links.length };
    document.getElementById('gv-loopsOnly').click();
    return { kept, back: gv.nodes.length };
  });
  check('“only what is in a loop” keeps the circles',
    only.kept.nodes.join(',') === ['foame', 'insomnie', 'mâncat', 'odihnă', 'stres'].sort().join(','), only.kept);
  check('and drops the arrows that go nowhere', only.kept.links === 6, only.kept);
  check('and is reversible', only.back === 10, only);

  // ---- 5. the palette knows which half applies ---------------------------
  const palette = await page.evaluate(() => {
    const shown = sel => {
      const el = document.querySelector(sel);
      return !!(el && el.offsetParent !== null);
    };
    return {
      causeHidden: shown('[data-gv-only="links"]'),
      loopsShown: shown('[data-gv-only="cause"]'),
      searchShown: shown('[data-gv="search"]')
    };
  });
  check('link-only filters are hidden in causality mode', palette.causeHidden === false, palette);
  check('the loops section is shown instead', palette.loopsShown, palette);
  check('search applies to both modes', palette.searchShown, palette);

  // ---- 6. both languages -------------------------------------------------
  const lang = await page.evaluate(async () => {
    const btn = document.querySelector('#gv-mode button[data-mode="cause"]');
    const ro = btn.textContent;
    window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'en' }));
    await new Promise(r => setTimeout(r, 60));
    const en = btn.textContent;
    const enRow = (document.querySelector('#gv-loops .gv-loop') || {}).title;
    window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'ro' }));
    await new Promise(r => setTimeout(r, 60));
    return { ro, en, enRow, back: btn.textContent };
  });
  check('the mode switch is translated', /Cauzalitate/.test(lang.ro) && /Causality/.test(lang.en), lang);
  check('and so are the loop rows', /reinforcing/.test(lang.enRow || ''), lang);
  check('and it switches back', /Cauzalitate/.test(lang.back), lang);

  // ---- 7. back to links --------------------------------------------------
  const back = await page.evaluate(() => {
    setGraphMode('links');
    return {
      mode: gvSettings.mode,
      marked: document.getElementById('graph-view').classList.contains('cause'),
      kinds: gv.nodes.reduce((a, n) => (a[n.kind] = (a[n.kind] || 0) + 1, a), {}),
      loops: gv.loops.length
    };
  });
  check('the links graph comes back', back.mode === 'links' && !back.marked && back.kinds.note === 1, back);
  check('and no loop is left over', back.loops === 0, back);

  check('no console or page errors', errors.length === 0, errors);

  await browser.close();
  console.log(failed ? '\n' + failed + ' FAILED' : '\nall good');
  process.exit(failed ? 1 : 0);
})();

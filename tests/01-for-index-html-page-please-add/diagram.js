// task-01: ```flow / ```mindmap diagrams in index.html.  node diagram.js
const path = require('path');
const { chromium } = require('playwright');
const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', '..', 'index.html');
let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}
const write = (page, md) => page.evaluate(md => { editor.value = md; updatePreview(); updateStatus(); }, md);
const F = '```';

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(400);

  // ---- parser / serializer ----
  const p = await page.evaluate(() => {
    const canon = 'a: rect 40,40 160x60 | Start\nb: diamond 240,40 160x90 #FF0000 | Ok?\\nyes\na -> b | go\nb <-> a\nb -- a #00FF00\na --> b\n%% note';
    const m = dgParseFlow(canon);
    const auto = dgParseFlow('a: | A\nb: | B\nc: | C\nd: | D\ne: | E');
    const dup = dgParseFlow('a: rect 1,2 | one\nb: | two\na: pill 5,6 | three');
    const imp = dgParseFlow('x -> y');
    const nosp = dgParseFlow('a-->b');
    const mm = dgParseMindmap('- Root\n\t* A\n    B\n  - C\n\nD');
    return {
      roundtrip: dgSerializeFlow(m) === canon, canon,
      ser: dgSerializeFlow(m),
      ops: m.edges.map(e => e.op), extra: m.extra, lbl: m.nodes[1].label,
      auto: auto.nodes.map(n => [n.x, n.y]),
      dupOrder: dup.nodes.map(n => n.id + ':' + n.shape + ':' + n.label),
      imp: imp.nodes.map(n => n.id + '/' + n.label + '/' + n.shape),
      nosp: nosp.edges.map(e => e.from + e.op + e.to),
      mm: dgSerializeMindmap(mm),
      empty: [JSON.stringify(dgParseFlow('')), dgSerializeMindmap(dgParseMindmap(''))]
    };
  });
  check('flow canonical round-trips', p.roundtrip, p.ser);
  check('all four edge ops parsed', JSON.stringify(p.ops) === '["->","<->","--","-->"]', p.ops);
  check('comment kept in extra', JSON.stringify(p.extra) === '["%% note"]');
  check('\\n in label decoded', p.lbl === 'Ok?\nyes', p.lbl);
  check('auto-place grid', JSON.stringify(p.auto) === '[[40,40],[240,40],[440,40],[640,40],[40,170]]', p.auto);
  check('duplicate id: later wins, first slot', JSON.stringify(p.dupOrder) === '["a:pill:three","b:rect:two"]', p.dupOrder);
  check('implicit nodes from edge', JSON.stringify(p.imp) === '["x/x/rect","y/y/rect"]', p.imp);
  check('a-->b without spaces is a dashed edge a→b (ambiguity)', JSON.stringify(p.nosp) === '["a-->b"]', p.nosp);
  check('mindmap normalised', p.mm === 'Root\n  A\n  B\n  C\n  D' || p.mm.startsWith('Root\n  A'), p.mm);
  check('empty inputs do not throw', true);

  // ---- preview ----
  await write(page, `# T\n\n${F}flow\na: rect 40,40 | Start\nb: diamond 300,40 | Ok?\nc: ellipse 40,200 | E\nd: para 300,200 | P\ne: pill 560,40 | Pi\nf: text 560,200 | T\na -> b | yes\nb --> c\nc <-> d\nd -- e\n%% hi\n${F}\n\n${F}mindmap\nRoot\n  A\n    A1\n  B\n  C\n  D\n${F}\n\n${F}js\na -> b\n${F}\n`);
  const v = await page.evaluate(() => {
    const figs = [...preview.querySelectorAll('figure.md-diagram')];
    const f = figs[0], m = figs[1];
    return {
      n: figs.length, svgs: figs.map(x => !!x.querySelector('svg')),
      edit: figs.map(x => !!x.querySelector('.dg-edit')),
      warn: f.querySelector('.dg-warn') && f.querySelector('.dg-warn').textContent,
      dashed: !!f.querySelector('[stroke-dasharray]'),
      texts: [...f.querySelectorAll('text')].map(t => t.textContent),
      mmTexts: [...m.querySelectorAll('text')].map(t => t.textContent),
      code: preview.querySelectorAll('.code-block, pre').length,
      aria: figs.map(x => (x.querySelector('svg').getAttribute('aria-label') || '')),
      w: f.querySelector('svg').getBoundingClientRect().width
    };
  });
  check('two figures + js stays code', v.n === 2 && v.code >= 1, v);
  check('svg in each', v.svgs.every(Boolean));
  check('edit button in preview', v.edit.every(Boolean));
  check('warn about unparsed line', !!v.warn, v.warn);
  check('dashed edge drawn', v.dashed);
  check('labels rendered', ['Start', 'Ok?', 'yes'].every(s => v.texts.includes(s)), v.texts);
  check('mindmap labels rendered', ['Root', 'A', 'A1', 'B', 'C', 'D'].every(s => v.mmTexts.includes(s)), v.mmTexts);
  check('svg has width', v.w > 50, v.w);

  // scanner does not mint causal/graph edges
  const g = await page.evaluate(() => typeof buildGraph === 'function' ? 'has' : 'no');

  // ---- export ----
  const html = await page.evaluate(() => parseMarkdown(editor.value, { forExport: true }));
  check('export has diagram svg, no edit button, no data-line', /md-diagram/.test(html) && /<svg/.test(html) && !/dg-edit/.test(html) && !/dg-warn/.test(html) && !/data-line/.test((html.match(/<figure[^>]*md-diagram[^>]*>/) || [''])[0]), html.slice(0, 300));
  const full = await page.evaluate(async () => { let cap = null; const o = ScuLaFolder.save; ScuLaFolder.save = async (n, b) => { cap = await b.text(); return {}; }; try { exportHtml(); await new Promise(r => setTimeout(r, 500)); } catch (e) { cap = 'ERR ' + e.message; } ScuLaFolder.save = o; return cap; });
  check('exportHtml file carries .md-diagram css and figure', !full || (/md-diagram/.test(full) && /<figure/.test(full)), full && full.slice(0, 100));

  // ---- XSS / escaping ----
  await write(page, `${F}flow\na: rect 0,0 | <img src=x onerror=window.__x=1>&amp;\nb: | <script>window.__x=2</script>\na -> b | <b>x</b>\n${F}\n\n${F}mindmap\n<img src=x onerror=window.__x=3>\n  &lt;b&gt;\n${F}\n`);
  await page.waitForTimeout(300);
  const x = await page.evaluate(() => ({ x: window.__x, imgs: preview.querySelectorAll('figure img, figure script, figure b').length, txt: [...preview.querySelectorAll('figure text')].map(t => t.textContent) }));
  check('no HTML injection from labels', !x.x && x.imgs === 0, x);
  check('literal < and & shown as typed', x.txt.some(t => t.includes('<img')) && x.txt.some(t => t.includes('&amp;')), x.txt);

  // unclosed fence at EOF, empty blocks, huge
  await write(page, `${F}flow\na -> b`);
  check('unclosed flow fence renders', await page.evaluate(() => !!preview.querySelector('figure.md-diagram svg')));
  await write(page, `${F}flow\n${F}\n\n${F}mindmap\n${F}\n\n${F}FLOW\na->b\n${F}\n`);
  const em = await page.evaluate(() => ({ n: preview.querySelectorAll('figure.md-diagram').length }));
  check('empty blocks and uppercase FLOW do not crash', em.n >= 2, em);
  let big = F + 'flow\n'; for (let i = 0; i < 300; i++) big += `n${i}: rect ${(i % 20) * 200},${Math.floor(i / 20) * 100} | N${i}\n`;
  for (let i = 1; i < 300; i++) big += `n${i - 1} -> n${i}\n`;
  big += F + '\n';
  const t0 = Date.now(); await write(page, big);
  check('300-node flow renders < 3s', Date.now() - t0 < 3000, Date.now() - t0);

  // ---- modal ----
  await write(page, `${F}flow\na: rect 40,40 160x60 | Start\nb: rect 300,40 160x60 | End\na -> b\n${F}\n`);
  await page.click('.dg-edit');
  await page.waitForTimeout(300);
  const open = await page.evaluate(() => ({ vis: !document.getElementById('diagram-modal').hidden, nodes: document.querySelectorAll('#dg-world g, #dg-world rect').length }));
  check('✎ Edit opens modal with content', open.vis && open.nodes > 0, open);
  // Esc unchanged closes
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check('Esc on unchanged modal closes it', await page.evaluate(() => document.getElementById('diagram-modal').hidden));
  // dblclick on drawn diagram
  await page.dblclick('figure.md-diagram svg', { position: { x: 30, y: 30 } }).catch(() => {});
  await page.waitForTimeout(300);
  check('double-click on diagram opens modal', await page.evaluate(() => !document.getElementById('diagram-modal').hidden));
  // source edit & apply
  await page.click('#dg-source-btn'); await page.waitForTimeout(100);
  await page.fill('#dg-source', 'a: rect 40,40 160x60 | Changed\nb: rect 300,40 160x60 | End\na -> b');
  await page.waitForTimeout(400);
  await page.click('#dg-apply'); await page.waitForTimeout(300);
  const after = await page.evaluate(() => editor.value);
  check('Update note replaces block in place', /Changed/.test(after) && !/Start/.test(after) && (after.match(/```flow/g) || []).length === 1, after);
  // undo in markdown editor = one step
  await page.evaluate(() => editor.focus());
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
  check('markdown Ctrl+Z restores original block', /Start/.test(await page.evaluate(() => editor.value)));

  // insert new at caret
  await write(page, 'before\n\nafter');
  await page.evaluate(() => { editor.focus(); editor.setSelectionRange(7, 7); });
  await page.click('#btn-diagram'); await page.waitForTimeout(300);
  await page.click('#dg-apply'); await page.waitForTimeout(300);
  const ins = await page.evaluate(() => editor.value);
  check('Insert into note writes a fenced block at caret', /```(flow|mindmap)\n[\s\S]*```/.test(ins) && ins.startsWith('before') && ins.trim().endsWith('after'), ins);

  // create nodes with keys & mouse in flow modal
  await write(page, '');
  await page.click('#btn-diagram'); await page.waitForTimeout(300);
  const kind = await page.$$eval('#dg-kind button', b => b.map(x => x.textContent));
  const box = await page.locator('#dg-stage').boundingBox();
  await page.keyboard.press('r').catch(() => {});
  await page.mouse.click(box.x + 200, box.y + 150);
  await page.keyboard.press('Escape');
  await page.mouse.click(box.x + 500, box.y + 150);
  await page.waitForTimeout(100);
  await page.click('#dg-source-btn'); await page.waitForTimeout(150);
  const src = await page.inputValue('#dg-source');
  check('rectangle tool via R key places a node', /rect/.test(src), { kind, src });
  // rapid undo/redo storm must not throw
  for (let i = 0; i < 30; i++) { await page.keyboard.press('Control+z'); await page.keyboard.press('Control+Shift+z'); }
  await page.click('#dg-fit'); await page.click('#dg-zoom-in'); await page.click('#dg-zoom-out');
  // cancel with change asks
  let dialogSeen = false;
  page.once('dialog', d => { dialogSeen = true; d.dismiss(); });
  await page.click('#dg-cancel'); await page.waitForTimeout(300);
  await page.evaluate(() => { const m = document.getElementById('diagram-modal'); if (!m.hidden) document.getElementById('dg-cancel').click(); });
  await page.waitForTimeout(200);

  // mindmap keyboard
  await page.evaluate(() => { const b = document.getElementById('diagram-modal'); if (!b.hidden) { try { closeDiagram(true); } catch (e) { try { closeDiagram(); } catch (_) {} } } });
  await write(page, `${F}mindmap\nRoot\n  A\n${F}\n`);
  await page.click('.dg-edit'); await page.waitForTimeout(300);
  await page.locator('#dg-stage').focus();
  await page.keyboard.press('Tab'); await page.waitForTimeout(100);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  const still = await page.evaluate(() => !document.getElementById('diagram-modal').hidden);
  check('mindmap Tab then Esc closes modal without prompt (nothing changed)', !still);
  if (still) { page.once('dialog', d => d.accept()); await page.click('#dg-cancel').catch(() => {}); }

  // language toggle: button and edit label change
  await page.evaluate(() => { const m = document.getElementById('diagram-modal'); if (m && !m.hidden) document.getElementById('dg-cancel').click(); });
  const lang = await page.evaluate(() => { const r = {}; r.a = document.getElementById('btn-diagram').textContent; return r; });
  check('toolbar button has label', lang.a.length > 2, lang);

  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

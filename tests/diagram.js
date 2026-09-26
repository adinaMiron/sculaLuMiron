// ```flow / ```mindmap diagrams in index.html — docs/FEATURES.md § U.
//
// Drives the real page off disk: the parsers and serializers through the dg*
// functions, the preview SVG on real geometry (an edge ending on its target's
// outline, the mind map's left/right split), the export string, and the
// full-screen modal with real pointer drags, real keys and both languages.
//
//   node diagram.js        # from tests/, or /apptest diagram
const path = require('path');
const { chromium } = require('playwright');
const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');
let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}
const write = (page, md) => page.evaluate(md => { editor.value = md; updatePreview(); updateStatus(); }, md);
const F = '```';
const canon = page => page.evaluate(() => dgCanon());
const isOpen = page => page.evaluate(() => dgIsOpen());
const labelShown = page => page.evaluate(() => !document.getElementById('dg-label-input').hidden);
// Screen centre of a modal node's shape, or of an edge's midpoint (its hit path's box).
const nodeCentre = (page, id) => page.evaluate(id => {
  const r = document.querySelector(`#dg-world g.dg-node[data-id="${id}"] > :first-child`).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, id);
const edgeMid = (page, i) => page.evaluate(i => {
  const r = document.querySelector(`#dg-world g.dg-edge[data-i="${i}"] .dg-edge-hit`).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, i);
async function drag(page, a, b, steps = 8) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
  await page.waitForTimeout(100);
}
async function openBlock(page, md) {
  await write(page, md);
  await page.click('.dg-edit');
  await page.waitForTimeout(300);
  await page.locator('#dg-stage').focus();
}

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
    const mmCanon = 'Root\n  A\n    A1\n      A11\n  B';
    return {
      roundtrip: dgSerializeFlow(m) === canon, canon,
      ser: dgSerializeFlow(m),
      ops: m.edges.map(e => e.op), extra: m.extra, lbl: m.nodes[1].label,
      auto: auto.nodes.map(n => [n.x, n.y]),
      dupOrder: dup.nodes.map(n => n.id + ':' + n.shape + ':' + n.label),
      imp: imp.nodes.map(n => n.id + '/' + n.label + '/' + n.shape),
      nosp: nosp.edges.map(e => e.from + e.op + e.to),
      mm: dgSerializeMindmap(mm),
      mmRound: dgSerializeMindmap(dgParseMindmap(mmCanon)) === mmCanon,
      empty: [JSON.stringify(dgParseFlow('')), dgSerializeMindmap(dgParseMindmap(''))]
    };
  });
  check('flow canonical round-trips', p.roundtrip, p.ser);
  check('mindmap canonical round-trips', p.mmRound);
  check('all four edge ops parsed', JSON.stringify(p.ops) === '["->","<->","--","-->"]', p.ops);
  check('comment kept in extra', JSON.stringify(p.extra) === '["%% note"]', p.extra);
  check('\\n in label decoded', p.lbl === 'Ok?\nyes', p.lbl);
  check('auto-place grid', JSON.stringify(p.auto) === '[[40,40],[240,40],[440,40],[640,40],[40,170]]', p.auto);
  check('duplicate id: later wins, first slot', JSON.stringify(p.dupOrder) === '["a:pill:three","b:rect:two"]', p.dupOrder);
  check('implicit nodes from edge', JSON.stringify(p.imp) === '["x/x/rect","y/y/rect"]', p.imp);
  check('a-->b without spaces is a dashed edge a→b (ambiguity)', JSON.stringify(p.nosp) === '["a-->b"]', p.nosp);
  check('mindmap normalised (tabs, bullets, stray indent)', p.mm === 'Root\n  A\n  B\n  C\n  D', p.mm);
  check('empty flow parses to an empty model', p.empty[0] === '{"nodes":[],"edges":[],"extra":[]}', p.empty[0]);
  check('empty mindmap serializes to ""', p.empty[1] === '', p.empty[1]);

  // ---- preview ----
  await write(page, `# T\n\n${F}flow\na: rect 40,40 | Start\nb: diamond 300,40 | Ok?\nc: ellipse 40,200 | E\nd: para 300,200 | P\ne: pill 560,40 | Pi\nf: text 560,200 | T\na -> b | yes\nb --> c\nc <-> d\nd -- e\n%% hi\n${F}\n\n${F}mindmap\nRoot\n  A\n    A1\n  B\n  C\n  D\n${F}\n\n${F}js\na -> b\n${F}\n`);
  const v = await page.evaluate(() => {
    const figs = [...preview.querySelectorAll('figure.md-diagram')];
    const f = figs[0], m = figs[1];
    return {
      n: figs.length, svgs: figs.map(x => !!x.querySelector('svg')),
      nodes: f.querySelectorAll('g.dg-node').length, edges: f.querySelectorAll('g.dg-edge').length,
      edit: figs.map(x => !!x.querySelector('.dg-edit')),
      warn: f.querySelector('.dg-warn') && f.querySelector('.dg-warn').textContent,
      warnWant: t('dgIgnored', 1),
      dashed: !!f.querySelector('[stroke-dasharray]'),
      texts: [...f.querySelectorAll('text')].map(t => t.textContent),
      mmTexts: [...m.querySelectorAll('text')].map(t => t.textContent),
      code: [...preview.querySelectorAll('pre code')].map(c => c.textContent),
      w: f.querySelector('svg').getBoundingClientRect().width
    };
  });
  check('two figures', v.n === 2, v.n);
  check('a non-diagram fence is still <pre><code>', v.code.some(c => c.includes('a -> b')), v.code);
  check('svg in each', v.svgs.every(Boolean));
  check('six nodes and four edges drawn', v.nodes === 6 && v.edges === 4, { nodes: v.nodes, edges: v.edges });
  check('edit button in preview', v.edit.every(Boolean));
  check('warn about the one unparsed line', v.warn === v.warnWant, v.warn);
  check('dashed edge drawn', v.dashed);
  check('labels rendered', ['Start', 'Ok?', 'yes'].every(s => v.texts.includes(s)), v.texts);
  check('mindmap labels rendered', ['Root', 'A', 'A1', 'B', 'C', 'D'].every(s => v.mmTexts.includes(s)), v.mmTexts);
  check('svg has width', v.w > 50, v.w);

  // ---- an edge ends on its target's outline (rect, ellipse, diamond), ±1 px ----
  await write(page, `${F}flow\na: rect 0,0 160x60 | A\nb: rect 400,250 160x60 | B\nc: ellipse 400,-250 140x70 | C\nd: diamond -400,250 160x90 | D\na -> b\na -> c\na -> d\n${F}\n`);
  const ends = await page.evaluate(() => {
    const fig = preview.querySelector('figure.md-diagram');
    // centre, half sizes and kind read off the drawn shape, not the model
    const outline = id => {
      const el = fig.querySelector(`g.dg-node[data-id="${id}"] > :first-child`), a = n => +el.getAttribute(n);
      if (el.tagName === 'ellipse') return { k: 'ellipse', cx: a('cx'), cy: a('cy'), hw: a('rx'), hh: a('ry') };
      if (el.tagName === 'polygon') {
        const pts = el.getAttribute('points').trim().split(/\s+/).map(s => s.split(',').map(Number));
        const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        return { k: 'diamond', cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hw: (x1 - x0) / 2, hh: (y1 - y0) / 2 };
      }
      return { k: 'rect', cx: a('x') + a('width') / 2, cy: a('y') + a('height') / 2, hw: a('width') / 2, hh: a('height') / 2 };
    };
    // how far (px, along the ray from the centre) the point is from the outline
    const off = (o, x, y) => {
      const dx = x - o.cx, dy = y - o.cy, ax = Math.abs(dx) / o.hw, ay = Math.abs(dy) / o.hh;
      const k = o.k === 'ellipse' ? Math.hypot(ax, ay) : o.k === 'diamond' ? ax + ay : Math.max(ax, ay);
      return Math.hypot(dx, dy) * Math.abs(1 - 1 / k);
    };
    return ['b', 'c', 'd'].map((to, i) => {
      const d = fig.querySelector(`g.dg-edge[data-i="${i}"] .dg-edge-hit`).getAttribute('d');
      const [x1, y1, x2, y2] = d.match(/-?[\d.]+/g).map(Number);
      const T = outline(to);
      return { to, kind: T.k, target: off(T, x2, y2), source: off(outline('a'), x1, y1) };
    });
  });
  check('edge endpoints drawn on rect, ellipse and diamond targets', ends.map(e => e.kind).join() === 'rect,ellipse,diamond', ends);
  ends.forEach(e => check(`edge a -> ${e.to} ends on the ${e.kind} outline (±1 px)`, e.target <= 1, e));
  check('every edge starts on the source rect outline (±1 px)', ends.every(e => e.source <= 1), ends);

  // ---- mind map: ceil(n/2) children right, the rest left, 56 px gap ----
  await write(page, `${F}mindmap\nRoot\n  R1\n    R1a\n  R2\n  R3\n  L1\n  L2\n${F}\n`);
  const mmv = await page.evaluate(() => {
    const fig = preview.querySelector('figure.md-diagram-mindmap');
    const box = p => { const r = fig.querySelector(`g.dg-mm-node[data-path="${p}"] rect`); return { x: +r.getAttribute('x'), w: +r.getAttribute('width') }; };
    const root = box(''), kids = ['0', '1', '2', '3', '4'];
    return {
      right: kids.filter(k => box(k).x > root.x + root.w + 55),
      left: kids.filter(k => box(k).x + box(k).w < root.x - 55),
      grand: box('0.0').x - (box('0').x + box('0').w)
    };
  });
  check('mind map: first ceil(5/2)=3 children on the right', JSON.stringify(mmv.right) === '["0","1","2"]', mmv);
  check('mind map: the other 2 on the left', JSON.stringify(mmv.left) === '["3","4"]', mmv);
  check('mind map: a right grandchild stays right, 56 px past its parent', Math.abs(mmv.grand - 56) < 0.5, mmv.grand);

  // ---- spec § 10 step 14: `a -> b` inside a flow block is no causal edge ----
  await write(page, `ploaie -> noroi\n\n${F}flow\nalfa -> beta\n${F}\n`);
  await page.evaluate(() => { setGraphMode('links'); openGraph('note'); });
  await page.waitForTimeout(400);
  await page.evaluate(() => setGraphMode('cause'));
  await page.waitForTimeout(900);
  const cg = await page.evaluate(() => gv.nodes.map(n => n.label));
  check('causality view has the prose edge (control)', cg.includes('ploaie') && cg.includes('noroi'), cg);
  check('causality view has nothing from the flow block', !cg.includes('alfa') && !cg.includes('beta'), cg);
  await page.evaluate(() => { setGraphMode('links'); closeGraph(); });

  // ---- export ----
  await write(page, `# T\n\n${F}flow\na: rect 40,40 | Start\nb: rect 300,40 | End\na -> b\n%% hi\n${F}\n`);
  const html = await page.evaluate(() => parseMarkdown(editor.value, { forExport: true }));
  check('export has diagram svg, no edit button, no data-line', /md-diagram/.test(html) && /<svg/.test(html) && !/dg-edit/.test(html) && !/dg-warn/.test(html) && !/data-line/.test((html.match(/<figure[^>]*md-diagram[^>]*>/) || [''])[0]), html.slice(0, 300));
  const full = await page.evaluate(async () => { let cap = null; const o = ScuLaFolder.save; ScuLaFolder.save = async (n, b) => { cap = await b.text(); return {}; }; try { exportHtml(); await new Promise(r => setTimeout(r, 500)); } catch (e) { cap = 'ERR ' + e.message; } ScuLaFolder.save = o; return cap; });
  check('exportHtml file carries .md-diagram css and the figure', typeof full === 'string' && full.length > 0 && /\.md-diagram\s*\{/.test(full) && /<figure[^>]*md-diagram/.test(full) && !/dg-edit/.test(full), full && full.slice(0, 100));

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
  const em = await page.evaluate(() => ({ n: preview.querySelectorAll('figure.md-diagram').length, empty: preview.querySelectorAll('figure.md-diagram .dg-empty').length }));
  check('empty blocks and uppercase FLOW render as diagrams', em.n === 3 && em.empty === 2, em);
  let big = F + 'flow\n'; for (let i = 0; i < 300; i++) big += `n${i}: rect ${(i % 20) * 200},${Math.floor(i / 20) * 100} | N${i}\n`;
  for (let i = 1; i < 300; i++) big += `n${i - 1} -> n${i}\n`;
  big += F + '\n';
  const t0 = Date.now(); await write(page, big);
  check('300-node flow renders < 3s', Date.now() - t0 < 3000, Date.now() - t0);

  // ---- modal: open, Esc, double-click, Update in place ----
  await write(page, `${F}flow\na: rect 40,40 160x60 | Start\nb: rect 300,40 160x60 | End\na -> b\n${F}\n`);
  await page.click('.dg-edit');
  await page.waitForTimeout(300);
  const open = await page.evaluate(() => ({ vis: !document.getElementById('diagram-modal').hidden, nodes: document.querySelectorAll('#dg-world g.dg-node').length }));
  check('✎ Edit opens modal with both nodes', open.vis && open.nodes === 2, open);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check('Esc on unchanged modal closes it', !(await isOpen(page)));
  await page.dblclick('figure.md-diagram svg', { position: { x: 30, y: 30 } });
  await page.waitForTimeout(300);
  check('double-click on diagram opens modal', await isOpen(page));
  await page.click('#dg-source-btn'); await page.waitForTimeout(100);
  await page.fill('#dg-source', 'a: rect 40,40 160x60 | Changed\nb: rect 300,40 160x60 | End\na -> b');
  await page.waitForTimeout(400);
  await page.click('#dg-apply'); await page.waitForTimeout(300);
  const after = await page.evaluate(() => editor.value);
  check('Update note replaces block in place', /Changed/.test(after) && !/Start/.test(after) && (after.match(/```flow/g) || []).length === 1, after);
  await page.evaluate(() => editor.focus());
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
  check('markdown Ctrl+Z restores original block', /Start/.test(await page.evaluate(() => editor.value)));

  // ---- Source text typed and applied before its 150 ms parse ----
  const FLOW_AB = `${F}flow\na: rect 40,40 160x60 | A\nb: rect 300,40 160x60 | B\na -> b\n${F}\n`;
  await openBlock(page, FLOW_AB);
  await page.click('#dg-source-btn'); await page.waitForTimeout(100);
  const quick = await page.evaluate(() => {
    const src = document.getElementById('dg-source');
    src.focus(); src.value += '\nq -> a'; src.dispatchEvent(new Event('input', { bubbles: true }));
    dgApply();
    return { open: dgIsOpen(), val: editor.value };
  });
  check('Apply right after typing in Source text keeps the typed line', !quick.open && /\nq -> a\n/.test(quick.val) && /\nq: rect /.test(quick.val), quick);
  await openBlock(page, FLOW_AB);
  await page.click('#dg-source-btn'); await page.waitForTimeout(100);
  const quickUndo = await page.evaluate(() => {
    const src = document.getElementById('dg-source'), before = dgCanon();
    src.focus(); src.value += '\nz -> a'; src.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('dg-undo').click();
    const undone = dgCanon();
    document.getElementById('dg-redo').click();
    return { before, undone, redone: dgCanon() };
  });
  check('undo button right after typing undoes the typed burst', quickUndo.undone === quickUndo.before, quickUndo);
  check('…and redo brings the typed line back', /\nz -> a$/.test(quickUndo.redone), quickUndo);
  const quickHide = await page.evaluate(() => {
    const src = document.getElementById('dg-source');
    src.focus(); src.value += '\nw -> a'; src.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('dg-source-btn').click();
    return dgCanon();
  });
  check('hiding Source text right after typing keeps the typed line', /\nw -> a$/.test(quickHide), quickHide);
  await page.evaluate(() => closeDiagram(true));

  // ---- flow modal: labels, a real drag, the connector, step-5 undo ----
  await openBlock(page, `${F}flow\na: rect 40,40 160x60 | A\nb: rect 400,40 160x60 | B\nc: ellipse 40,260 140x70 | C\na -> b\n${F}\n`);
  // (the bug: an edge re-rendered on every pointerdown, so its dblclick never reached the stage)
  const m0 = await edgeMid(page, 0);
  await page.mouse.dblclick(m0.x, m0.y); await page.waitForTimeout(150);
  check('double-click an edge at its midpoint opens its label', await labelShown(page));
  await page.keyboard.type('go'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  check('…and Enter writes the edge label', (await canon(page)).split('\n').includes('a -> b | go'), await canon(page));

  // Esc in the label cancels the label only
  const cA = await nodeCentre(page, 'a');
  const beforeLbl = await canon(page);
  await page.mouse.dblclick(cA.x, cA.y); await page.waitForTimeout(150);
  const lblOpen = await labelShown(page);
  await page.keyboard.type('zzz'); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check('Esc in the label input cancels the label and keeps the modal open',
    lblOpen && !(await labelShown(page)) && (await isOpen(page)) && (await canon(page)) === beforeLbl, { lblOpen, canon: await canon(page) });

  // a real mouse drag moves the node, its edge follows, one undo step
  const dragBefore = await page.evaluate(() => ({
    canon: dgCanon(), undo: dgUndo.length,
    d: document.querySelector('#dg-world g.dg-edge[data-i="0"] .dg-edge-line').getAttribute('d')
  }));
  const cA2 = await nodeCentre(page, 'a');
  await drag(page, cA2, { x: cA2.x + 60, y: cA2.y + 80 });
  const dragAfter = await page.evaluate(() => ({
    a: dgParseFlow(dgCanon()).nodes.find(n => n.id === 'a'), undo: dgUndo.length,
    d: document.querySelector('#dg-world g.dg-edge[data-i="0"] .dg-edge-line').getAttribute('d')
  }));
  check('drag moves the node (x and y)', dragAfter.a.x !== 40 && dragAfter.a.y !== 40, dragAfter.a);
  check('drag moves the connected edge', dragAfter.d !== dragBefore.d, { before: dragBefore.d, after: dragAfter.d });
  check('drag is one modal undo step', dragAfter.undo === dragBefore.undo + 1, { before: dragBefore.undo, after: dragAfter.undo });
  await page.locator('#dg-stage').focus();
  await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
  check('one Ctrl+Z puts the dragged node back', (await canon(page)) === dragBefore.canon, await canon(page));

  // the connector tool: drag from c to b
  await page.locator('#dg-stage').focus();
  await page.keyboard.press('a');
  await drag(page, await nodeCentre(page, 'c'), await nodeCentre(page, 'b'), 12);
  const con = await page.evaluate(() => ({ edges: dg.flow.edges.map(e => e.from + e.op + e.to), sel: dg.sel }));
  const ci = con.edges.indexOf('c->b');
  check('connector drag creates c -> b', ci >= 0 && con.edges.length === 2, con);
  check('…and selects it', con.sel && con.sel.type === 'edge' && con.sel.i === ci, con.sel);

  // spec § 10 step 5: kind, colour, label; three undos in reverse, three redos
  await page.locator('#dg-stage').focus();
  await page.keyboard.press('v');
  const s0 = await canon(page);
  await page.selectOption('#dg-edge-kind', '-->'); await page.waitForTimeout(50);
  const s1 = await canon(page);
  await page.click('#dg-colors [data-color="#C4643C"]'); await page.waitForTimeout(50);
  const s2 = await canon(page);
  const mc = await edgeMid(page, ci);
  await page.mouse.dblclick(mc.x, mc.y); await page.waitForTimeout(150);
  await page.keyboard.type('ok'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  const s3 = await canon(page);
  check('kind, colour and label each changed the edge', s0.includes('\nc -> b') && s1.includes('\nc --> b') && s2.includes('\nc --> b #C4643C') && s3.split('\n').includes('c --> b #C4643C | ok'), { s0, s1, s2, s3 });
  await page.locator('#dg-stage').focus();
  const undos = [], redos = [];
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(50); undos.push(await canon(page)); }
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(50); redos.push(await canon(page)); }
  check('three Ctrl+Z remove label, colour, kind in that order', undos[0] === s2 && undos[1] === s1 && undos[2] === s0, undos);
  check('three Ctrl+Shift+Z bring them back in order', redos[0] === s1 && redos[1] === s2 && redos[2] === s3, redos);
  await page.evaluate(() => closeDiagram(true));

  // ---- Insert (new mode) at the caret: one markdown undo step ----
  await write(page, 'before\n\nafter');
  await page.evaluate(() => { editor.focus(); editor.setSelectionRange(7, 7); });
  await page.click('#btn-diagram'); await page.waitForTimeout(300);
  await page.click('#dg-apply'); await page.waitForTimeout(300);
  const ins = await page.evaluate(() => editor.value);
  check('Insert into note writes a fenced block at caret', ins.startsWith('before\n```flow\n') && ins.endsWith('\n```\nafter'), ins);
  await page.evaluate(() => editor.focus());
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
  const insUndo = await page.evaluate(() => editor.value);
  check('one markdown Ctrl+Z removes the inserted block', insUndo === 'before\n\nafter', insUndo);
  await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(200);
  check('Ctrl+Shift+Z restores it', (await page.evaluate(() => editor.value)) === ins);

  // ---- the rectangle tool (R) places a node at the grid-snapped pointer ----
  await write(page, '');
  await page.click('#btn-diagram'); await page.waitForTimeout(300);
  const pt = await page.evaluate(() => {
    const r = document.getElementById('dg-stage').getBoundingClientRect(), x = r.right - 100, y = r.top + 80;
    const el = document.elementFromPoint(x, y);
    return { x, y, empty: !!el && !el.closest('.dg-node, .dg-edge'), wx: (x - r.left - dg.panX) / dg.zoom, wy: (y - r.top - dg.panY) / dg.zoom };
  });
  check('(precondition) the click spot is empty stage', pt.empty, pt);
  await page.keyboard.press('r');
  await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(100);
  const placedLabel = await labelShown(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.click('#dg-source-btn'); await page.waitForTimeout(150);
  const src = await page.inputValue('#dg-source');
  const snap = v => Math.round(v / 10) * 10;
  // the terracotta swatch picked in the step-5 section is still this session's colour (§ 6.4)
  const want = `n1: rect ${snap(pt.wx - 80)},${snap(pt.wy - 30)} 160x60 #C4643C | Text`;
  check('rectangle tool via R key places n1 at the snapped click', src.split('\n').includes(want), { want, src });
  check('…and opens its label', placedLabel);
  // rapid undo/redo storm must not throw
  await page.locator('#dg-stage').focus();
  for (let i = 0; i < 30; i++) { await page.keyboard.press('Control+z'); await page.keyboard.press('Control+Shift+z'); }
  await page.click('#dg-fit'); await page.click('#dg-zoom-in'); await page.click('#dg-zoom-out');
  // Esc on a dirty modal: first deselects, then asks, and "no" keeps it open
  await page.locator('#dg-stage').focus();
  if (await page.evaluate(() => !!dg.sel)) {
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    check('Esc with a selection only deselects', (await isOpen(page)) && (await page.evaluate(() => dg.sel === null)));
  }
  const ask = await page.evaluate(() => t('dgDiscardAsk'));
  let dialogMsg = null;
  page.once('dialog', d => { dialogMsg = d.message(); d.dismiss(); });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('Esc on a dirty modal asks before discarding', dialogMsg === ask, dialogMsg);
  check('…and "no" keeps it open', await isOpen(page));
  page.once('dialog', d => d.accept());
  await page.click('#dg-cancel'); await page.waitForTimeout(200);
  check('Cancel + "yes" closes it', !(await isOpen(page)));

  // ---- mind map keys ----
  await openBlock(page, `${F}mindmap\nRoot\n  A\n${F}\n`);
  await page.keyboard.press('Tab'); await page.waitForTimeout(100);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  const still = await isOpen(page);
  check('mindmap Tab then Esc closes modal without prompt (nothing changed)', !still);
  if (still) await page.evaluate(() => closeDiagram(true));

  await openBlock(page, `${F}mindmap\nRoot\n  A\n${F}\n`);
  const mmSteps = [];
  await page.keyboard.press('Tab'); await page.waitForTimeout(100);
  const tabLabel = await page.evaluate(() => ({ shown: !document.getElementById('dg-label-input').hidden, v: document.getElementById('dg-label-input').value, want: t('dgNewNode') }));
  check('Tab adds a child and opens its label with the default text', tabLabel.shown && tabLabel.v === tabLabel.want, tabLabel);
  await page.keyboard.type('Buget'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  mmSteps.push(await canon(page));
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  await page.keyboard.type('Echipa'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  mmSteps.push(await canon(page));
  await page.keyboard.press('Tab'); await page.waitForTimeout(100);
  await page.keyboard.type('Costuri'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  mmSteps.push(await canon(page));
  await page.keyboard.press('Delete'); await page.waitForTimeout(100);
  await page.keyboard.press('Delete'); await page.waitForTimeout(100);
  mmSteps.push(await canon(page));
  const mmSel = await page.evaluate(() => dg.sel && dg.sel.path);
  check('Tab on the root adds a child', mmSteps[0] === 'Root\n  A\n  Buget', mmSteps);
  check('Enter adds a sibling after it', mmSteps[1] === 'Root\n  A\n  Buget\n  Echipa', mmSteps);
  check('Tab on a branch adds its child', mmSteps[2] === 'Root\n  A\n  Buget\n  Echipa\n    Costuri', mmSteps);
  check('Delete twice removes the subtree, selection walks up to the root', mmSteps[3] === 'Root\n  A\n  Buget' && mmSel === '', { steps: mmSteps, mmSel });
  await page.evaluate(() => closeDiagram(true));

  // ---- both UI languages, repainted while the modal is open ----
  const lang0 = await page.evaluate(() => UI);
  await write(page, 'x');
  await page.click('#btn-diagram'); await page.waitForTimeout(300);
  const paint = lang => page.evaluate(lang => {
    window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: lang }));
    return {
      title: document.getElementById('dg-title').textContent,
      apply: document.getElementById('dg-apply').textContent,
      tool: document.querySelector('#dg-tools [data-tool="rect"]').title
    };
  }, lang);
  const ro = await paint('ro'), en = await paint('en');
  check('Romanian modal strings', ro.title === 'Diagramă nouă' && ro.apply === 'Inserează în notă' && ro.tool === 'Dreptunghi (R)', ro);
  check('English modal strings', en.title === 'New diagram' && en.apply === 'Insert into note' && en.tool === 'Rectangle (R)', en);
  await page.evaluate(() => closeDiagram(true));
  await page.evaluate(l => window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: l })), lang0);

  const btn = await page.evaluate(() => ({ text: document.getElementById('btn-diagram').textContent.trim(), want: t('diagramBtn') }));
  check('toolbar button shows t(diagramBtn)', btn.text === btn.want, btn);

  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

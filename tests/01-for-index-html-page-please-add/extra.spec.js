// Cross-cutting checks: colour rendering (spec § 2), the exported HTML page, hover
// visibility of the preview buttons, robustness against hostile / huge input.
const { test, expect } = require('@playwright/test');
const { load, setText, fence, captureSaves } = require('./helpers');

let errors;
test.beforeEach(async ({ page }) => { errors = await load(page); });
test.afterEach(() => { expect(errors, 'page errors').toEqual([]); });

test.describe('coloured edges are drawn in their colour (§ 2 fix)', () => {
  test('preview: a coloured edge and its head are not grey; an uncoloured one follows the theme token', async ({ page }) => {
    await setText(page, fence('flow', 'a: rect 0,0 100x50 | A\nb: rect 300,0 100x50 | B\nc: rect 600,0 100x50 | C\na -> b #C4643C\nb -> c'));
    const r = await page.evaluate(() => {
      const lines = [...document.querySelectorAll('#preview .dg-edge-line')].map(l => getComputedStyle(l).stroke);
      const heads = [...document.querySelectorAll('#preview .dg-edge-head')].map(h => getComputedStyle(h).fill);
      return { lines, heads };
    });
    expect(r.lines[0]).toBe('rgb(196, 100, 60)');
    expect(r.heads[0]).toBe('rgb(196, 100, 60)');
    expect(r.lines[1]).not.toBe('rgb(196, 100, 60)');
    expect(r.lines[1]).not.toBe('none');
  });

  test('the exported page: colour kept, plain edges dark grey, sequence lifelines and numbers styled', async ({ page }) => {
    await setText(page, '# T\n\n' + fence('flow', 'a: rect 0,0 100x50 | A\nb: rect 300,0 100x50 | B\na -> b #C4643C\nb -> a') + '\n\n' + fence('sequence', 'A -> B | x\nB --> A'));
    await captureSaves(page);
    await page.evaluate(() => {
      ScuLaFolder.save = async (name, blob) => { window.__html = await blob.text(); window.__name = name; };
      exportHtml();
    });
    await expect.poll(() => page.evaluate(() => window.__html && window.__html.length)).toBeGreaterThan(1000);
    const html = await page.evaluate(() => window.__html);
    expect(html).not.toContain('dg-edit');
    expect(html).not.toContain('class="dg-dl"');
    expect(html).not.toContain('data-line');
    // load the exported page for real and read computed styles
    const p2 = await page.context().newPage();
    await p2.setContent(html);
    const r = await p2.evaluate(() => {
      const cs = (sel, prop) => [...document.querySelectorAll(sel)].map(e => getComputedStyle(e)[prop]);
      return {
        edge: cs('.md-diagram-flow .dg-edge-line', 'stroke'), head: cs('.md-diagram-flow .dg-edge-head', 'fill'),
        life: cs('.dg-seq-life', 'stroke'), num: cs('.dg-seq-num text', 'fill'), seqLine: cs('.md-diagram-sequence .dg-edge-line', 'stroke'),
        figs: document.querySelectorAll('figure.md-diagram').length, btn: document.querySelectorAll('.dg-actions, button').length,
      };
    });
    expect(r.figs).toBe(2);
    expect(r.edge[0]).toBe('rgb(196, 100, 60)');
    expect(r.head[0]).toBe('rgb(196, 100, 60)');
    expect(r.edge[1]).toBe('rgb(102, 102, 102)');
    expect(r.life.every(v => v !== 'none' && v !== 'rgb(0, 0, 0)')).toBe(true);
    expect(r.num.every(v => v === 'rgb(34, 34, 34)')).toBe(true);
    expect(r.seqLine.every(v => v === 'rgb(102, 102, 102)')).toBe(true);
    expect(r.btn).toBe(0);
    await p2.close();
  });
});

test.describe('preview buttons', () => {
  test('✎ Edit, ⤓ SVG and ⤓ PNG are hidden until hover / focus, then all three show and do not overlap', async ({ page }) => {
    await setText(page, fence('mindmap', 'R\n  A'));
    const fig = page.locator('#preview figure');
    await page.mouse.move(2, 2);
    const hiddenOpacity = await page.evaluate(() => [...document.querySelectorAll('#preview .dg-actions button')].map(b => getComputedStyle(b).opacity + '/' + getComputedStyle(b.parentElement).opacity));
    await fig.hover();
    await page.waitForTimeout(500);   // the reveal is a CSS transition
    const boxes = await page.locator('#preview .dg-actions button').evaluateAll(bs => bs.map(b => { const r = b.getBoundingClientRect(); return { l: r.left, r: r.right, o: getComputedStyle(b).opacity, d: getComputedStyle(b).display }; }));
    expect(boxes.length).toBe(3);
    boxes.forEach(b => expect(Number(b.o)).toBeGreaterThan(0.9));
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].l).toBeGreaterThanOrEqual(boxes[i - 1].r - 0.5);
    // at rest they are not fully visible
    expect(hiddenOpacity.some(s => s.split('/').some(v => Number(v) < 0.5))).toBe(true);
  });

  test('titles and labels follow the UI language on re-render', async ({ page }) => {
    const r = await page.evaluate(() => {
      const out = {};
      for (const l of ['en', 'ro']) { const o = UI; UI = l; out[l] = renderDiagramBlock(['a -> b'], 'flow', 0, {}); UI = o; }
      return out;
    });
    expect(r.en).toContain('Download the diagram as SVG');
    expect(r.ro).toContain('Descarcă diagrama ca SVG');
  });

  test('Enter on a focused ⤓ button downloads (keyboard only)', async ({ page }) => {
    await setText(page, fence('flow', 'a -> b'));
    await captureSaves(page);
    await page.locator('#preview .dg-dl[data-fmt=svg]').focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__saves.length)).toBe(1);
  });

  test('double-clicking a sequence figure opens it in the modal in edit mode', async ({ page }) => {
    await setText(page, fence('sequence', 'A -> B | hi'));
    await page.locator('#preview figure svg').dblclick();
    await expect(page.locator('#diagram-modal')).toBeVisible();
    expect(await page.evaluate(() => [dg.mode, dg.kind])).toEqual(['edit', 'sequence']);
  });

  test('a rapid triple click on ⤓ PNG neither throws nor corrupts the text', async ({ page }) => {
    const md = fence('flow', 'a -> b');
    await setText(page, md);
    await captureSaves(page);
    const b = page.locator('#preview .dg-dl[data-fmt=png]');
    await page.locator('#preview figure').hover();
    await b.click({ clickCount: 3, delay: 10 });
    await expect.poll(() => page.evaluate(() => window.__saves.length)).toBeGreaterThanOrEqual(1);
    expect(await page.evaluate(() => editor.value)).toBe(md);
  });
});

test.describe('robustness', () => {
  test('pathological long ids do not hang the parsers (regex backtracking)', async ({ page }) => {
    const ms = await page.evaluate(() => {
      const t0 = performance.now();
      const id = 'a-'.repeat(4000);
      dgParseFlow(id + ' -> ' + id + '.q');
      dgParseFlow(id + '.e ' + '-'.repeat(3000));
      dgParseSequence(id + ' -> ' + id + 'x y');
      dgParseSequence('participant ' + id + ' ' + id);
      dgParseMindmap('R\n  ' + 'x '.repeat(3000) + '{' + '1,2 '.repeat(2000));
      return performance.now() - t0;
    });
    expect(ms).toBeLessThan(3000);
  });

  test('a 400-message sequence renders quickly with numbered steps 1..400', async ({ page }) => {
    const t0 = Date.now();
    const src = Array.from({ length: 400 }, (_, i) => `P${i % 7} ${i % 3 ? '->' : '-->'} P${(i * 3 + 1) % 7} | message ${i}`).join('\n');
    const n = await page.evaluate(src => { const d = document.createElement('div'); d.innerHTML = renderDiagramBlock(src.split('\n'), 'sequence', 0, {}); const nums = [...d.querySelectorAll('.dg-seq-num text')].map(t => +t.textContent); return nums[nums.length - 1] + ':' + nums.length; }, src);
    expect(n).toBe('400:400');
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  test('60 participants: lifelines strictly increase, no NaN in the drawing', async ({ page }) => {
    const src = Array.from({ length: 60 }, (_, i) => `participant P${i}`).join('\n') + '\nP0 -> P59 | far\nP30 -> P30 | self';
    const r = await page.evaluate(src => {
      const d = document.createElement('div'); d.innerHTML = renderDiagramBlock(src.split('\n'), 'sequence', 0, {});
      const xs = [...d.querySelectorAll('.dg-seq-life')].map(l => +l.getAttribute('x1'));
      return { nan: d.innerHTML.includes('NaN'), inc: xs.every((x, i) => i === 0 || x > xs[i - 1]), n: xs.length };
    }, src);
    expect(r).toEqual({ nan: false, inc: true, n: 60 });
  });

  test('a message to an undeclared participant creates it at the right end; notes on unknown ids too', async ({ page }) => {
    const r = await page.evaluate(() => dgParseSequence('participant A\nA -> Z\nnote Q | hi').parts.map(p => p.id));
    expect(r).toEqual(['A', 'Z', 'Q']);
  });

  test('hostile ids and labels in mind map / flow / sequence never inject markup into the preview or the export', async ({ page }) => {
    const r = await page.evaluate(() => {
      const bad = '"><img src=x onerror="window.__pwned=1">';
      const out = [];
      out.push(renderDiagramBlock(['a"><img src=x onerror=window.__pwned=1>: rect 0,0 10x10 | ' + bad], 'flow', 0, {}));
      out.push(renderDiagramBlock(['R ' + bad, '  ' + bad + ' {1,2 #112233}'], 'mindmap', 0, {}));
      out.push(renderDiagramBlock(['participant P | ' + bad, 'P -> P | ' + bad, 'note P | ' + bad], 'sequence', 0, {}));
      const d = document.createElement('div'); d.innerHTML = out.join('');
      document.body.appendChild(d);
      return { imgs: d.querySelectorAll('img').length, attr: [...d.querySelectorAll('[onerror]')].length, pwned: window.__pwned };
    });
    expect(r.imgs).toBe(0); expect(r.attr).toBe(0); expect(r.pwned).toBeUndefined();
  });

  test('every editing key pressed in the sequence modal (stage focused) throws nothing and changes nothing', async ({ page }) => {
    const src = 'participant A\nparticipant B\nA -> B | x';
    await setText(page, fence('sequence', src));
    await page.evaluate(() => openDiagram({ line: 0 }));
    await page.locator('#dg-stage').focus();
    for (const k of ['Delete', 'Backspace', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'r', 'c', 'v', 'F2', 'Control+z', 'Control+y', 'Control+Shift+z', '+', '-', '0']) await page.keyboard.press(k);
    expect(await page.evaluate(() => dgCanon())).toBe('participant A\nparticipant B\nA -> B | x');
    expect(await page.locator('#diagram-modal').isVisible()).toBe(true);
  });

  test('every editing key in a flow modal with nothing selected throws nothing', async ({ page }) => {
    await setText(page, fence('flow', 'a -> b'));
    await page.evaluate(() => openDiagram({ line: 0 }));
    await page.locator('#dg-stage').focus();
    for (const k of ['Delete', 'Backspace', 'Tab', 'Enter', 'ArrowLeft', 'F2', 'Control+z', 'Control+y', 'Escape']) await page.keyboard.press(k);
  });

  test('flow node ids that look like ports still work (n.e -> e.w)', async ({ page }) => {
    const m = await page.evaluate(() => dgParseFlow('n: rect 0,0 50x50 | N\ne: rect 200,0 50x50 | E\nn.e -> e.w').edges[0]);
    expect(m).toMatchObject({ from: 'n', fromPort: 'e', to: 'e', toPort: 'w' });
  });

  test('flow round trip keeps a backslash and a pipe in a label', async ({ page }) => {
    const r = await page.evaluate(() => { const m = dgParseFlow('a: rect 0,0 10x10 | x \\\\ y\na -> b | p \\n q'); return dgSerializeFlow(dgParseFlow(dgSerializeFlow(m))) === dgSerializeFlow(m); });
    expect(r).toBe(true);
  });

  test('mind-map attributes on the root: from/to are ignored when drawing (no exception, no NaN)', async ({ page }) => {
    const svg = await page.evaluate(() => dgMindmapSvg(dgParseMindmap('R {0,0 from=e to=w}\n  A')).svg);
    expect(svg).not.toContain('NaN');
  });

  test('a mind map whose node has an unknown port token keeps it in the label', async ({ page }) => {
    const l = await page.evaluate(() => dgParseMindmap('R\n  A {to=x}').root.children[0].label);
    expect(l).toBe('A {to=x}');
  });

  test('the sketch and diagram modals cannot both be opened at once from the toolbar', async ({ page }) => {
    // Focus is not trapped in the modal: Tab walks out onto the toolbar behind it, and Enter
    // on ✏ Sketch then opens a second full-screen modal over the first (and vice versa).
    await setText(page, '');
    await page.click('#btn-diagram');
    let reached = false;
    for (let i = 0; i < 80 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement && document.activeElement.id === 'btn-sketch');
    }
    if (reached) await page.keyboard.press('Enter');
    const both = await page.evaluate(() => [dg.open, sk.open]);
    expect(both[0] && both[1], 'diagram and sketch modals open at the same time').toBe(false);
  });

  test('and the other way round: ◇ Diagram from the keyboard while the sketch is open', async ({ page }) => {
    await setText(page, '');
    await page.click('#btn-sketch');
    let reached = false;
    for (let i = 0; i < 80 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement && document.activeElement.id === 'btn-diagram');
    }
    if (reached) await page.keyboard.press('Enter');
    const both = await page.evaluate(() => [dg.open, sk.open]);
    expect(both[0] && both[1], 'diagram and sketch modals open at the same time').toBe(false);
  });
});

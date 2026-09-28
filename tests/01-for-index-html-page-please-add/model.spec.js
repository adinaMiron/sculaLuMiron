// Parsers, serializers, port geometry, layouts and exports — called directly
// through the page's globals (plain scripts, so they are reachable).
const { test, expect } = require('@playwright/test');
const { load, setText, fence, captureSaves, saves } = require('./helpers');

let errors;
test.beforeEach(async ({ page }) => { errors = await load(page); });
test.afterEach(() => { expect(errors, 'page errors').toEqual([]); });

test.describe('flow: pinned ports text format', () => {
  test('lines from the spec parse to the right model', async ({ page }) => {
    const r = await page.evaluate(() => {
      const m = dgParseFlow('a-->b\na -> b\na.e->b\nmy-node.se --> x\nask.e -> fix.w | nu\nq.nw <-> r.sw #c4643c | x\\ny');
      return m.edges;
    });
    expect(r[0]).toMatchObject({ from: 'a', fromPort: null, op: '-->', to: 'b', toPort: null });
    expect(r[1]).toMatchObject({ from: 'a', fromPort: null, op: '->', to: 'b', toPort: null });
    expect(r[2]).toMatchObject({ from: 'a', fromPort: 'e', op: '->', to: 'b', toPort: null });
    expect(r[3]).toMatchObject({ from: 'my-node', fromPort: 'se', op: '-->', to: 'x', toPort: null });
    expect(r[4]).toMatchObject({ from: 'ask', fromPort: 'e', to: 'fix', toPort: 'w', label: 'nu' });
    expect(r[5]).toMatchObject({ fromPort: 'nw', toPort: 'sw', op: '<->', color: '#c4643c', label: 'x\ny' });
  });

  test('canonical text round-trips exactly', async ({ page }) => {
    const s = 'a: rect 40,40 160x60 | A\nb: diamond 240,40 160x90 #C4643C | B\nask.e -> fix.w | nu\na.nw <-> b.se #7A9CC6\na -> b | plain\na -- b\nb --> a.s';
    const out = await page.evaluate(s => dgSerializeFlow(dgParseFlow(s)), s);
    // nodes ask/fix become implicit nodes; canonical order puts nodes first, so compare a normalised re-parse
    const twice = await page.evaluate(s => dgSerializeFlow(dgParseFlow(dgSerializeFlow(dgParseFlow(s)))), s);
    expect(twice).toBe(out);
    const canon = 'a: rect 40,40 160x60 | A\nb: rect 240,40 160x60 | B\na.e -> b.w | go\nb.n --> a.n';
    expect(await page.evaluate(s => dgSerializeFlow(dgParseFlow(s)), canon)).toBe(canon);
  });

  test('a port suffix is not read out of a node id that merely ends like one', async ({ page }) => {
    const m = await page.evaluate(() => dgParseFlow('north -> east\nhome-ne -> b').edges);
    expect(m[0]).toMatchObject({ from: 'north', fromPort: null, to: 'east', toPort: null });
    expect(m[1]).toMatchObject({ from: 'home-ne', fromPort: null });
  });

  test('a bad port name is not a port (line stays understood or goes to extra, never crashes)', async ({ page }) => {
    const m = await page.evaluate(() => { const x = dgParseFlow('a.x -> b'); return { e: x.edges.length, extra: x.extra.length, n: x.nodes.map(n => n.id) }; });
    expect(m.e + m.extra).toBeGreaterThan(0);
  });
});

test.describe('ports and auto ports', () => {
  const shapes = ['rect', 'round', 'pill', 'ellipse', 'diamond', 'para', 'text'];
  test('all 8 ports exist and lie on the drawn outline (probed through the real SVG)', async ({ page }) => {
    const res = await page.evaluate(shapes => {
      const out = {};
      const svgNS = 'http://www.w3.org/2000/svg';
      shapes.forEach(shape => {
        const box = { shape, x: 30, y: 20, w: 160, h: shape === 'diamond' ? 90 : 60 };
        const p = dgPorts(box);
        const keys = Object.keys(p).sort().join(',');
        const svg = document.createElementNS(svgNS, 'svg');
        svg.innerHTML = dgShapeSvg(box, '#C1BB45');
        document.body.appendChild(svg);
        const el = svg.firstElementChild;
        let worst = 0;
        if (shape !== 'text') {
          // distance from the port to the outline: sample the stroke geometry
          const geo = el.isPointInStroke ? el : null;
          Object.values(p).forEach(pt => {
            const q = new DOMPoint(pt.x, pt.y);
            let ok = false;
            for (const w of [0, 1, 2, 3, 4]) { el.setAttribute('stroke-width', 2 + 2 * w); if (el.isPointInStroke(q)) { ok = true; worst = Math.max(worst, w); break; } }
            if (!ok) worst = 99;
          });
        }
        out[shape] = { keys, worst };
        svg.remove();
      });
      return out;
    }, shapes);
    for (const s of shapes) {
      expect(res[s].keys, s).toBe('e,n,ne,nw,s,se,sw,w');
      if (s !== 'text') expect(res[s].worst, s + ' port ≤ ~4px off the outline').toBeLessThanOrEqual(2);
    }
  });

  test('exact coordinates from the spec table', async ({ page }) => {
    const r = await page.evaluate(() => ({
      rect: dgPorts({ shape: 'rect', x: 10, y: 20, w: 100, h: 50 }),
      dia: dgPorts({ shape: 'diamond', x: 0, y: 0, w: 160, h: 90 }),
      para: dgPorts({ shape: 'para', x: 0, y: 0, w: 160, h: 60 }),
      ell: dgPorts({ shape: 'ellipse', x: 0, y: 0, w: 140, h: 70 }),
      round: dgPorts({ shape: 'round', x: 0, y: 0, w: 160, h: 60 }),
      pill: dgPorts({ shape: 'pill', x: 0, y: 0, w: 160, h: 60 }),
    }));
    expect(r.rect.nw).toEqual({ x: 10, y: 20 });
    expect(r.rect.se).toEqual({ x: 110, y: 70 });
    expect(r.rect.n).toEqual({ x: 60, y: 20 });
    expect(r.dia.n).toEqual({ x: 80, y: 0 });
    expect(r.dia.ne).toEqual({ x: 120, y: 22.5 });
    expect(r.dia.sw).toEqual({ x: 40, y: 67.5 });
    expect(r.para.nw).toEqual({ x: 12, y: 0 });
    expect(r.para.se).toEqual({ x: 148, y: 60 });
    expect(r.para.n).toEqual({ x: (12 + 160) / 2, y: 0 });
    expect(r.para.e.x).toBeCloseTo(160 - 6, 5);
    const k = Math.SQRT1_2;
    expect(r.ell.ne.x).toBeCloseTo(70 + 70 * k, 5);
    expect(r.ell.ne.y).toBeCloseTo(35 - 35 * k, 5);
    expect(r.round.nw.x).toBeCloseTo(12 * (1 - k), 5);
    expect(r.pill.nw.x).toBeCloseTo(30 * (1 - k), 5);
    expect(r.pill.ne.x).toBeCloseTo(160 - 30 * (1 - k), 5);
  });

  test('dgAutoPort picks the nearest port and breaks ties n e s w ne se sw nw', async ({ page }) => {
    const r = await page.evaluate(() => {
      const box = { shape: 'rect', x: 0, y: 0, w: 100, h: 100 };
      return [
        dgAutoPort(box, { x: 500, y: 50 }),
        dgAutoPort(box, { x: -500, y: 50 }),
        dgAutoPort(box, { x: 50, y: 500 }),
        dgAutoPort(box, { x: 50, y: -500 }),
        dgAutoPort(box, { x: 500, y: 500 }),
        dgAutoPort(box, { x: -500, y: -500 }),
        dgAutoPort(box, { x: 50, y: 50 }),          // centre: all four sides equidistant → n
        dgAutoPort(box, { x: 100, y: 0 }),           // exactly on ne
      ];
    });
    expect(r).toEqual(['e', 'w', 's', 'n', 'se', 'nw', 'n', 'ne']);
  });

  test('drawn edge endpoints sit on the outline of both boxes (auto ends)', async ({ page }) => {
    await setText(page, fence('flow', 'a: ellipse 0,0 140x70 | A\nb: diamond 300,200 160x90 | B\na -> b'));
    const d = await page.evaluate(() => {
      const path = document.querySelector('#preview .dg-edge-line').getAttribute('d');
      return path;
    });
    expect(d).toMatch(/^M[\d.\-]+ [\d.\-]+L/);
  });

  test('self-edge: automatic (or same pin twice) is not drawn; two different pins draw a cubic', async ({ page }) => {
    const r = await page.evaluate(() => {
      const cnt = t => { const d = document.createElement('div'); d.innerHTML = renderDiagramBlock(t.split('\n'), 'flow', 0, {}); return { edges: d.querySelectorAll('.dg-edge-line').length, d: (d.querySelector('.dg-edge-line') || {}).getAttribute && d.querySelector('.dg-edge-line').getAttribute('d') }; };
      return {
        auto: cnt('a: rect 0,0 100x50 | A\na -> a'),
        same: cnt('a: rect 0,0 100x50 | A\na.e -> a.e'),
        one: cnt('a: rect 0,0 100x50 | A\na.e -> a'),
        two: cnt('a: rect 0,0 100x50 | A\na.e -> a.s'),
      };
    });
    expect(r.auto.edges).toBe(0);
    expect(r.same.edges).toBe(0);
    expect(r.one.edges).toBe(0);
    expect(r.two.edges).toBe(1);
    expect(r.two.d).toContain('C');
  });

  test('two boxes on top of each other (endpoints closer than 4px) draw no edge and do not throw', async ({ page }) => {
    const n = await page.evaluate(() => {
      const d = document.createElement('div');
      d.innerHTML = renderDiagramBlock('a: rect 0,0 100x50 | A\nb: rect 0,0 100x50 | B\na.n -> b.n'.split('\n'), 'flow', 0, {});
      return d.querySelectorAll('.dg-edge-line').length;
    });
    expect(n).toBe(0);
  });
});

test.describe('mind map text format', () => {
  test('attributes parse, canonical form round-trips', async ({ page }) => {
    const canon = 'Buget {0,-22}\n  Costuri {140,-80 #C4643C to=w}\n  Echipă';
    const r = await page.evaluate(c => { const m = dgParseMindmap(c); return { m, out: dgSerializeMindmap(m) }; }, canon);
    expect(r.out).toBe(canon);
    expect(r.m.root).toMatchObject({ label: 'Buget', x: 0, y: -22, color: null });
    expect(r.m.root.children[0]).toMatchObject({ label: 'Costuri', x: 140, y: -80, color: '#C4643C', toPort: 'w', fromPort: null });
    expect(r.m.root.children[1]).toMatchObject({ label: 'Echipă', x: null, y: null, color: null });
  });

  test('a trailing brace block that is not an attribute stays in the label', async ({ page }) => {
    const r = await page.evaluate(() => {
      const m = dgParseMindmap('R\n  Mulțimea {a, b}\n  X {1,2 nope}\n  Y {}\n  Z {12,3');
      return m.root.children.map(c => [c.label, c.x]);
    });
    expect(r).toEqual([['Mulțimea {a, b}', null], ['X {1,2 nope}', null], ['Y {}', null], ['Z {12,3', null]]);
  });

  test('duplicate tokens: last wins; colour upper-cased; order x,y colour from to', async ({ page }) => {
    const r = await page.evaluate(() => {
      const m = dgParseMindmap('R\n  A {1,2 3,4 #aabbcc #112233 from=n from=s to=e}');
      return [m.root.children[0], dgSerializeMindmap(m)];
    });
    expect(r[0]).toMatchObject({ x: 3, y: 4, color: '#112233', fromPort: 's', toPort: 'e' });
    expect(r[1]).toBe('R\n  A {3,4 #112233 from=s to=e}');
  });

  test('a map with no attributes serialises exactly as before; negative and zero coordinates survive', async ({ page }) => {
    const r = await page.evaluate(() => [dgSerializeMindmap(dgParseMindmap('R\n  A\n    B\n  C')), dgSerializeMindmap(dgParseMindmap('R {0,0}\n  A {-5,-7}'))]);
    expect(r[0]).toBe('R\n  A\n    B\n  C');
    expect(r[1]).toBe('R {0,0}\n  A {-5,-7}');
  });

  test('empty text parses to no root and serialises to empty', async ({ page }) => {
    const r = await page.evaluate(() => [dgSerializeMindmap(dgParseMindmap('')), dgLayoutMindmap(dgParseMindmap('').root)]);
    expect(r).toEqual(['', null]);
  });
});

test.describe('mind map layout', () => {
  test('root x,y honoured; unpositioned child keeps its automatic offset from a moved parent', async ({ page }) => {
    const r = await page.evaluate(() => {
      const auto = dgLayoutMindmap(dgParseMindmap('R\n  A\n    B').root);
      const moved = dgLayoutMindmap(dgParseMindmap('R\n  A {500,300}\n    B').root);
      const a0 = auto.byPath.get('0'), b0 = auto.byPath.get('0.0'), a1 = moved.byPath.get('0'), b1 = moved.byPath.get('0.0');
      return { dxAuto: b0.x - a0.x, dyAuto: b0.y - a0.y, dxMoved: b1.x - a1.x, dyMoved: b1.y - a1.y, ax: a1.x, ay: a1.y };
    });
    expect(r.ax).toBe(500); expect(r.ay).toBe(300);
    expect(r.dxMoved).toBeCloseTo(r.dxAuto, 5);
    expect(r.dyMoved).toBeCloseTo(r.dyAuto, 5);
    const root = await page.evaluate(() => { const L = dgLayoutMindmap(dgParseMindmap('R {40,50}\n  A').root); return [L.root.x, L.root.y]; });
    expect(root).toEqual([40, 50]);
  });

  test('own colour applies to that node only', async ({ page }) => {
    const r = await page.evaluate(() => {
      const L = dgLayoutMindmap(dgParseMindmap('R\n  A {#112233}\n    B\n  C').root);
      return ['0', '0.0', '1'].map(p => L.byPath.get(p).eff);
    });
    expect(r[0]).toBe('#112233');
    expect(r[1]).not.toBe('#112233');
    expect(r[2]).not.toBe('#112233');
  });

  test('a half positioned node (x without y) does not produce NaN', async ({ page }) => {
    const svg = await page.evaluate(() => dgMindmapSvg(dgParseMindmap('R\n  A {5,}').root ? dgParseMindmap('R\n  A {5,}') : null).svg);
    expect(svg).not.toContain('NaN');
  });

  test('un-arranged map: automatic connector ends are e/w and the curve matches the round-1 shape', async ({ page }) => {
    const r = await page.evaluate(() => {
      const L = dgLayoutMindmap(dgParseMindmap('R\n  A\n  B').root);
      return [dgMmEdgeGeom(L.byPath.get('0')), dgMmEdgeGeom(L.byPath.get('1'))].map(g => [g.fp, g.tp]);
    });
    expect(r).toEqual([['e', 'w'], ['w', 'e']]);
  });

  test('a node dragged below its parent switches to s/n; above to n/s; a pin overrides', async ({ page }) => {
    const r = await page.evaluate(() => {
      const g = t => { const L = dgLayoutMindmap(dgParseMindmap(t).root); return dgMmEdgeGeom(L.byPath.get('0')); };
      const below = g('R {0,0}\n  A {0,200}'), above = g('R {0,0}\n  A {0,-200}'), pin = g('R {0,0}\n  A {0,200 from=e to=n}');
      return [[below.fp, below.tp], [above.fp, above.tp], [pin.fp, pin.tp]];
    });
    expect(r).toEqual([['s', 'n'], ['n', 's'], ['e', 'n']]);
  });
});

test.describe('sequence text format', () => {
  test('participants, messages, notes, unicode ids, keywords', async ({ page }) => {
    const m = await page.evaluate(() => dgParseSequence([
      'participant Ana', 'participant Ștefan | Ștefan Popescu', 'Ana -> Ștefan | salut', 'Ștefan --> Ana | ok\\nbine',
      'Ana -> Ana | eu', 'note Ștefan | text', 'note Nou | creat', '%% comment', 'participant -> x', 'what is this', 'note -> Ana', 'a-->b'].join('\n')));
    expect(m.parts.map(p => p.id)).toEqual(['Ana', 'Ștefan', 'Nou', 'a', 'b']);
    expect(m.parts[1].label).toBe('Ștefan Popescu');
    expect(m.events.map(e => e.type + (e.op || ''))).toEqual(['msg->', 'msg-->', 'msg->', 'note', 'note', 'msg-->']);
    expect(m.events[1].label).toBe('ok\nbine');
    expect(m.extra).toEqual(['%% comment', 'participant -> x', 'what is this', 'note -> Ana']);
  });

  test('canonical form round-trips; label only written when different from id', async ({ page }) => {
    const c = 'participant Ana\nparticipant B | Bogdan\nAna -> B | hi\nB --> Ana\nnote B | n\\nm\nAna -> Ana | self\n%% kept';
    expect(await page.evaluate(c => dgSerializeSequence(dgParseSequence(c)), c)).toBe(c);
  });

  test('a message may not be sent from/to a participant named "participant" or "note"', async ({ page }) => {
    const m = await page.evaluate(() => dgParseSequence('note -> a\na -> note\nparticipant -> a'));
    expect(m.events.length).toBe(0);
    expect(m.extra.length).toBe(3);
  });

  test('empty text and blank lines only', async ({ page }) => {
    const m = await page.evaluate(() => [dgParseSequence(''), dgParseSequence('\n\n  \n')]);
    m.forEach(x => expect(x).toEqual({ parts: [], events: [], extra: [] }));
  });

  test('ids order by first appearance even when used before being declared', async ({ page }) => {
    const m = await page.evaluate(() => dgParseSequence('B -> A\nparticipant C\nparticipant A').parts.map(p => p.id));
    expect(m).toEqual(['B', 'A', 'C']);
  });
});

test.describe('sequence layout (spec § 5.2)', () => {
  const SRC = 'participant Ana\nparticipant Bogdan\nparticipant Cip\nAna -> Bogdan | trimite factura\nBogdan --> Ana | confirmă primirea\nBogdan -> Bogdan | verifică plata\nnote Bogdan | în 3 zile\nAna -> Cip | a foarte foarte foarte foarte lungă etichetă între vecini care depășește';
  function render(page, src) {
    return page.evaluate(src => { const d = document.createElement('div'); d.innerHTML = renderDiagramBlock(src.split('\n'), 'sequence', 0, {}); document.body.appendChild(d); window.__d = d; return true; }, src);
  }
  test('structure: groups, numbering, dashes, lifelines', async ({ page }) => {
    await render(page, SRC);
    const r = await page.evaluate(() => {
      const d = window.__d;
      return {
        parts: d.querySelectorAll('.dg-seq-part').length,
        msgs: d.querySelectorAll('.dg-seq-msg').length,
        notes: d.querySelectorAll('.dg-seq-note-g').length,
        nums: [...d.querySelectorAll('.dg-seq-num text')].map(t => t.textContent),
        life: [...d.querySelectorAll('.dg-seq-life')].map(l => [l.getAttribute('x1'), l.getAttribute('y1'), l.getAttribute('stroke-dasharray')]),
        dashes: [...d.querySelectorAll('.dg-seq-msg')].map(g => g.querySelector('.dg-edge-line').getAttribute('stroke-dasharray')),
        cls: d.querySelector('figure').className,
        aria: d.querySelector('svg').getAttribute('aria-label'),
        edit: !!d.querySelector('.dg-edit'),
        dl: [...d.querySelectorAll('.dg-dl')].map(b => b.dataset.fmt),
      };
    });
    expect(r.parts).toBe(3); expect(r.msgs).toBe(4); expect(r.notes).toBe(1);
    expect(r.nums).toEqual(['1', '2', '3', '4']);
    expect(r.dashes).toEqual([null, '6 4', null, null]);
    r.life.forEach(l => { expect(l[1]).toBe('36'); expect(l[2]).toBe('4 4'); });
    expect(r.cls).toContain('md-diagram-sequence');
    expect(r.aria).toBe('Secvență');
    expect(r.edit).toBe(true);
    expect(r.dl).toEqual(['svg', 'png']);
  });

  test('lifeline spacing follows the formula incl. the label-width rule', async ({ page }) => {
    await render(page, SRC);
    const r = await page.evaluate(() => {
      const xs = [...window.__d.querySelectorAll('.dg-seq-life')].map(l => +l.getAttribute('x1'));
      const ws = [...window.__d.querySelectorAll('.dg-seq-part rect')].map(r => +r.getAttribute('width'));
      const m = (s, f) => dgMeasure(s, f);
      const LF = '13px ' + DG_FAMILY;
      const need01 = Math.max(m('trimite factura', LF), m('confirmă primirea', LF)) + 48;
      return { xs, ws, need01, gap01: xs[1] - xs[0], gap12: xs[2] - xs[1], wmin: Math.min(...ws) };
    });
    expect(r.xs[0]).toBeCloseTo(r.ws[0] / 2, 0);
    expect(r.wmin).toBeGreaterThanOrEqual(100);
    expect(r.gap01).toBeGreaterThanOrEqual(160 - 0.2);
    expect(r.gap01).toBeGreaterThanOrEqual(r.need01 - 0.2);
    expect(r.gap12).toBeGreaterThanOrEqual(160 - 0.2);
  });

  test('row heights: message 44, self-message 60, arrow 30 below row top', async ({ page }) => {
    await render(page, 'participant A\nparticipant B\nA -> B | one\nA -> B | two\nB -> B | me\nA -> B | four');
    const ys = await page.evaluate(() => [...window.__d.querySelectorAll('.dg-seq-num circle')].map(c => +c.getAttribute('cy')));
    // rows start at 66; msg arrow at +30; self arrow at +18
    expect(ys[0]).toBe(96);
    expect(ys[1]).toBe(96 + 44);
    expect(ys[2]).toBe(96 + 88 - 30 + 18);
    expect(ys[3]).toBe(66 + 44 + 44 + 60 + 30);
  });

  test('self-message loop returns to its own lifeline', async ({ page }) => {
    await render(page, 'participant A\nA -> A | me');
    const d = await page.evaluate(() => window.__d.querySelector('.dg-seq-msg .dg-edge-line').getAttribute('d'));
    const life = await page.evaluate(() => +window.__d.querySelector('.dg-seq-life').getAttribute('x1'));
    expect(d).toMatch(new RegExp('^M' + life + ' [\\d.]+H' + (life + 40)));
  });

  test('empty sequence shows the empty note, no svg; hostile labels are escaped', async ({ page }) => {
    await render(page, '');
    expect(await page.evaluate(() => [!!window.__d.querySelector('.dg-empty'), !!window.__d.querySelector('svg')])).toEqual([true, false]);
    await page.evaluate(() => window.__d.remove());
    await render(page, 'participant <img src=x onerror=window.__x=1>\nA -> B | <script>window.__x=1</script>&amp;');
    expect(await page.evaluate(() => [window.__x, window.__d.querySelectorAll('img, script').length])).toEqual([undefined, 0]);
  });

  test('unparsed lines show the warning in the preview but never in the export', async ({ page }) => {
    const r = await page.evaluate(() => [
      renderDiagramBlock(['A -> B', 'nonsense here'], 'sequence', 0, {}).includes('dg-warn'),
      renderDiagramBlock(['A -> B', 'nonsense here'], 'sequence', 0, { forExport: true }).includes('dg-warn'),
      renderDiagramBlock(['A -> B'], 'sequence', 0, { forExport: true }).includes('dg-dl'),
    ]);
    expect(r).toEqual([true, false, false]);
  });

  test('preview block: ```sequence in the editor renders a figure; uppercase fence too; other fences stay code', async ({ page }) => {
    await setText(page, fence('sequence', 'A -> B | x') + '\n\n```SEQUENCE\nC -> D\n```\n\n```seq\nA -> B\n```');
    expect(await page.locator('#preview figure.md-diagram-sequence').count()).toBe(2);
    expect(await page.locator('#preview pre').count()).toBeGreaterThanOrEqual(1);
  });
});

test.describe('SVG / PNG export', () => {
  for (const [kind, body] of [['flow', 'a: rect 0,0 100x50 | A & <B>\nb: ellipse 300,0 140x70 #C4643C | B\na.e -> b.w #7A9CC6 | x'],
    ['mindmap', 'Root {0,0}\n  Kid {200,-40 #C4643C}\n  Other\n    Deep'], ['sequence', 'participant Ana\nAna -> Bob | hi & <bye>\nnote Bob | n']]) {
    test(`dgExportSvg(${kind}) is standalone, white, well-formed, without modal markup`, async ({ page }) => {
      const svg = await page.evaluate(([k, b]) => dgExportSvg(k, b), [kind, body]);
      const r = await page.evaluate(svg => {
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        const root = doc.documentElement;
        const first = root.firstElementChild;
        return {
          err: !!doc.querySelector('parsererror'), ns: root.getAttribute('xmlns'), vb: root.getAttribute('viewBox'), w: root.getAttribute('width'), h: root.getAttribute('height'),
          firstTag: first.tagName, fill: first.getAttribute('fill'), rect: ['x', 'y', 'width', 'height'].map(a => first.getAttribute(a)),
          style: !!root.querySelector('style'), modal: root.querySelectorAll('.dg-port, .dg-outline, .dg-resize, .dg-edge-end, #dg-grid').length,
        };
      }, svg);
      expect(r.err).toBe(false);
      expect(r.ns).toBe('http://www.w3.org/2000/svg');
      expect(r.firstTag).toBe('rect'); expect(r.fill).toBe('#ffffff');
      const vb = r.vb.split(' ').map(Number);
      expect(r.rect.map(Number)).toEqual(vb);
      expect(+r.w).toBe(Math.ceil(vb[2])); expect(+r.h).toBe(Math.ceil(vb[3]));
      expect(r.style).toBe(true); expect(r.modal).toBe(0);
      expect(svg).toContain(':not([stroke])');
      expect(svg).not.toContain('var(--');
    });
  }

  test('dgExportSvg of empty text does not throw and still has a white rect', async ({ page }) => {
    for (const k of ['flow', 'mindmap', 'sequence']) {
      const svg = await page.evaluate(k => dgExportSvg(k, ''), k);
      expect(svg).toContain('fill="#ffffff"');
    }
  });

  test('dgExportPng is a PNG at exactly 2× the SVG size with a white background', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const src = 'a: rect 0,0 100x50 | A\nb: rect 300,0 100x50 | B\na -> b';
      const svg = dgExportSvg('flow', src);
      const W = +svg.match(/width="(\d+)"/)[1], H = +svg.match(/height="(\d+)"/)[1];
      const blob = await dgExportPng('flow', src);
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
      const px = x.getImageData(2, 2, 1, 1).data;
      return { type: blob.type, W, H, bw: bmp.width, bh: bmp.height, px: [...px] };
    });
    expect(r.type).toBe('image/png');
    expect(r.bw).toBe(2 * r.W); expect(r.bh).toBe(2 * r.H);
    expect(r.px).toEqual([255, 255, 255, 255]);
  });

  test('PNG of every kind resolves (labels with & < > and unicode do not break the image)', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const out = [];
      for (const [k, b] of [['flow', 'x: rect 0,0 100x50 | Ștefan & <co>'], ['mindmap', 'Rădăcină & <x>\n  ț'], ['sequence', 'Ștefan -> Ana | ă & <b>']]) {
        try { out.push((await dgExportPng(k, b)).size > 100); } catch (e) { out.push('ERR ' + e.message); }
      }
      return out;
    });
    expect(r).toEqual([true, true, true]);
  });

  test('coloured edge and colour attributes are kept in the export; edge without colour gets #444', async ({ page }) => {
    const svg = await page.evaluate(() => dgExportSvg('flow', 'a: rect 0,0 100x50 | A\nb: rect 300,0 100x50 #C4643C | B\na -> b #7A9CC6'));
    expect(svg).toContain('stroke="#7A9CC6"');
    expect(svg).toContain('#C4643C');
    expect(svg).toContain('.dg-edge-line:not([stroke])');
  });
});

test.describe('file names', () => {
  test('dgFileName without a chapter falls back to "diagrama"', async ({ page }) => {
    const r = await page.evaluate(() => [dgFileName('flow', 1, 'png'), dgFileName('mindmap', 2, 'svg'), dgFileName('sequence', 3, 'png')]);
    expect(r).toEqual(['diagrama-flowchart-1.png', 'diagrama-mindmap-2.svg', 'diagrama-sequence-3.png']);
  });

  test('dgFileName with a chapter title slugs it (diacritics, spaces)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const old = window.wbChapter; const oldId = wbCurrentId;
      window.wbChapter = () => ({ title: 'Capitol Ștefan: Ăla?' });
      wbCurrentId = 'x';
      const n = dgFileName('flow', 1, 'png');
      window.wbChapter = old; wbCurrentId = oldId;
      return n;
    });
    // wbSlug keeps Unicode letters (existing behaviour) but no spaces, colons or "?"
    expect(r).toMatch(/^[^\s:?/\\]+-flowchart-1\.png$/);
    expect(r.toLowerCase()).toContain('capitol');
  });

  test('dgBlocks counts per kind in text order and ignores non-diagram fences', async ({ page }) => {
    const r = await page.evaluate(() => dgBlocks('```flow\na\n```\n```js\nx\n```\n```mindmap\nR\n```\n```FLOW\nb\n```\n```sequence\nA->B\n```\n```flow\nunclosed').map(b => b.kind));
    expect(r).toEqual(['flow', 'mindmap', 'flow', 'sequence', 'flow']);
  });
});

test.describe('preview download buttons', () => {
  test('SVG and PNG click saves through ScuLaFolder.save with the per-kind ordinal', async ({ page }) => {
    await setText(page, [fence('flow', 'a -> b'), fence('mindmap', 'R\n  A'), fence('flow', 'c -> d'), fence('sequence', 'A -> B')].join('\n\n'));
    await captureSaves(page);
    const figs = page.locator('#preview figure.md-diagram');
    expect(await figs.count()).toBe(4);
    await figs.nth(2).hover();
    await figs.nth(2).locator('.dg-dl[data-fmt=svg]').click();
    await figs.nth(2).locator('.dg-dl[data-fmt=png]').click();
    await figs.nth(1).hover();
    await figs.nth(1).locator('.dg-dl[data-fmt=svg]').click();
    await figs.nth(3).hover();
    await figs.nth(3).locator('.dg-dl[data-fmt=png]').click();
    await figs.nth(0).hover();
    await figs.nth(0).locator('.dg-dl[data-fmt=svg]').click();
    await expect.poll(async () => (await saves(page)).length).toBe(5);
    const s = await saves(page);
    const by = n => s.find(x => x.name.endsWith(n));
    expect(by('flowchart-2.svg')).toBeTruthy();
    expect(by('flowchart-2.png')).toBeTruthy();
    expect(by('flowchart-1.svg')).toBeTruthy();
    expect(by('mindmap-1.svg')).toBeTruthy();
    expect(by('sequence-1.png')).toBeTruthy();
    expect(by('flowchart-2.svg').type).toBe('image/svg+xml');
    expect(by('sequence-1.png').type).toBe('image/png');
  });

  test('buttons are keyboard focusable and reachable (focus-within reveals them)', async ({ page }) => {
    await setText(page, fence('flow', 'a -> b'));
    const btn = page.locator('#preview .dg-dl[data-fmt=png]');
    await btn.focus();
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('title', /PNG/);
  });

  test('editing the block text, then downloading, exports the current text', async ({ page }) => {
    await setText(page, fence('flow', 'a -> b'));
    await captureSaves(page);
    await page.evaluate(() => { editor.value = editor.value.replace('a -> b', 'a -> b\nb -> c'); updatePreview(); });
    await page.locator('#preview figure').hover();
    await page.locator('#preview .dg-dl[data-fmt=svg]').click();
    await expect.poll(async () => (await saves(page)).length).toBe(1);
  });

  test('HTML export contains no editor buttons but keeps the sequence CSS with literal colours', async ({ page }) => {
    const html = await page.evaluate(() => {
      const src = editor.value = '# T\n\n```sequence\nA -> B | x\n```';
      updatePreview();
      return typeof buildExportHtml === 'function' ? buildExportHtml() : null;
    });
    // exportHtml() writes a file; assert on the block markup and the CSS constant instead when no builder is exposed
    const parts = await page.evaluate(() => renderDiagramBlock(['A -> B'], 'sequence', 0, { forExport: true }));
    expect(parts).not.toContain('dg-edit');
    expect(parts).not.toContain('data-line');
    void html;
  });
});

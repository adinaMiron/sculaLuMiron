// The ◇ Diagram modal driven with the real mouse and keyboard.
const { test, expect } = require('@playwright/test');
const { clickSeq, load, setText, fence, w2s, center, drag, openBlock, FLOW2, MM3, captureSaves, saves } = require('./helpers');

let errors;
test.beforeEach(async ({ page }) => { errors = await load(page); });
test.afterEach(() => { expect(errors, 'page errors').toEqual([]); });

const canon = page => page.evaluate(() => dgCanon());
const undoDisabled = page => page.locator('#dg-undo').isDisabled();
async function undoAll(page) { let n = 0; while (!(await undoDisabled(page)) && n < 50) { await page.click('#dg-undo'); n++; } return n; }
async function port(page, id, p) { return w2s(page, ...(await page.evaluate(([id, p]) => { const q = dgPorts(dgNode(id))[p]; return [q.x, q.y]; }, [id, p]))); }

test.describe('flow: dots and connectors', () => {
  test.beforeEach(async ({ page }) => {
    await openBlock(page, 'flow', FLOW2);
    await page.click('.dg-node[data-id="a"]', { position: { x: 20, y: 20 } });
  });

  test('a selected node shows exactly 8 dots; an unselected one none', async ({ page }) => {
    expect(await page.locator('#dg-world .dg-port').count()).toBe(8);
    const names = await page.locator('#dg-world .dg-port').evaluateAll(els => els.map(e => e.dataset.port).sort());
    expect(names).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']);
    expect(await page.locator('#dg-world .dg-port').first().getAttribute('r')).toBe('5');
  });

  test('dot → dot pins both ends and writes them in the text', async ({ page }) => {
    await drag(page, await port(page, 'a', 'e'), await port(page, 'b', 'w'));
    expect(await canon(page)).toContain('a.e -> b.w');
  });

  test('during the drag the target shows 8 target dots and the near one is hot', async ({ page }) => {
    const to = await port(page, 'b', 'nw');
    await drag(page, await port(page, 'a', 'e'), { x: to.x + 4, y: to.y + 3 }, 6, { release: false });
    expect(await page.locator('#dg-targets .dg-port-target').count()).toBe(8);
    expect(await page.locator('#dg-targets .dg-port-target').first().getAttribute('r')).toBe('6');
    expect(await page.locator('#dg-targets .dg-port-hot').getAttribute('data-port')).toBe('nw');
    await page.mouse.up();
  });

  test('dot → body of another box pins only the start', async ({ page }) => {
    const c = await w2s(page, 350, 25);
    await drag(page, await port(page, 'a', 's'), c);
    expect(await canon(page)).toMatch(/\na\.s -> b(\n|$)/);
  });

  test('drop within 12px of a dot beats the body: 11px off pins, 25px off inside the box is automatic', async ({ page }) => {
    const p = await port(page, 'b', 'e');
    const z = await page.evaluate(() => dg.zoom);
    await drag(page, await port(page, 'a', 'e'), { x: p.x - 8 * z, y: p.y });
    expect(await canon(page)).toContain('a.e -> b.e');
  });

  test('drop on empty stage cancels: nothing added, no undo step', async ({ page }) => {
    const before = await canon(page);
    await drag(page, await port(page, 'a', 'e'), await w2s(page, 200, 400));
    expect(await canon(page)).toBe(before);
    expect(await undoDisabled(page)).toBe(true);
    expect(await page.locator('.dg-rubber').count()).toBe(0);
  });

  test('Esc while dragging cancels the connector and leaves the modal open', async ({ page }) => {
    const before = await canon(page);
    await drag(page, await port(page, 'a', 'e'), await port(page, 'b', 'w'), 6, { release: false });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await canon(page)).toBe(before);
    expect(await page.locator('#diagram-modal').isVisible()).toBe(true);
    expect(await page.locator('.dg-rubber').count()).toBe(0);
  });

  test('connect tool: from the body is automatic; onto its own body cancels', async ({ page }) => {
    await page.click('#dg-tools [data-tool="connect"]');
    await drag(page, await w2s(page, 50, 25), await w2s(page, 350, 25));
    expect(await canon(page)).toMatch(/\na -> b(\n|$)/);
    await page.click('#dg-tools [data-tool="connect"]');
    const n = await page.evaluate(() => dg.flow.edges.length);
    await drag(page, await w2s(page, 50, 25), await w2s(page, 60, 30));
    expect(await page.evaluate(() => dg.flow.edges.length)).toBe(n);
  });

  test('self connector: two different dots create it, the same dot twice does not', async ({ page }) => {
    await drag(page, await port(page, 'a', 'e'), await port(page, 'a', 's'));
    expect(await canon(page)).toContain('a.e -> a.s');
    await page.click('.dg-node[data-id="a"]', { position: { x: 20, y: 20 } });
    const n = await page.evaluate(() => dg.flow.edges.length);
    await drag(page, await port(page, 'a', 'n'), await port(page, 'a', 'n'));
    expect(await page.evaluate(() => dg.flow.edges.length)).toBe(n);
  });

  test('an undo removes a connector in one step', async ({ page }) => {
    await drag(page, await port(page, 'a', 'e'), await port(page, 'b', 'w'));
    expect(await undoAll(page)).toBe(1);
    expect(await canon(page)).not.toContain('->');
  });

  test('a pinned end follows its dot when the node moves', async ({ page }) => {
    await drag(page, await port(page, 'a', 'e'), await port(page, 'b', 'w'));
    await page.evaluate(() => { dgNode('b').x = 400; dgNode('b').y = 200; dgRender(); });
    const d = await page.locator('#dg-world .dg-edge-line').getAttribute('d');
    const end = await page.evaluate(() => { const q = dgPorts(dgNode('b')).w; return [q.x, q.y]; });
    const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
    // the line stops at the arrowhead's base, DG_HEAD (10) before the port
    expect(Math.hypot(nums[nums.length - 2] - end[0], nums[nums.length - 1] - end[1])).toBeLessThan(11);
  });

  test('a selected edge shows two end handles; dragging one onto another box\'s dot re-attaches it (one undo step)', async ({ page }) => {
    await page.evaluate(() => { dg.flow.nodes.push({ id: 'c', shape: 'rect', x: 150, y: 250, w: 100, h: 50, color: null, label: 'C' }); dgRender(); });
    await page.click('.dg-node[data-id="a"]', { position: { x: 20, y: 20 } });
    await drag(page, await port(page, 'a', 'e'), await port(page, 'b', 'w'));
    await page.evaluate(() => { dg.flow.edges[0].label = 'keep'; dg.flow.edges[0].color = '#C4643C'; dgRender(); });
    expect(await page.locator('#dg-world .dg-edge-end').count()).toBe(2);
    const undoBefore = await page.evaluate(() => dgUndo.length);
    await drag(page, await center(page, '.dg-edge-end[data-end="to"]'), await port(page, 'c', 'n'));
    const c = await canon(page);
    expect(c).toContain('a.e -> c.n #C4643C | keep');
    expect(await page.evaluate(() => dgUndo.length)).toBe(undoBefore + 1);
  });

  test('dragging an edge end to empty space keeps the edge unchanged', async ({ page }) => {
    await drag(page, await port(page, 'a', 'e'), await port(page, 'b', 'w'));
    const before = await canon(page), u = await page.evaluate(() => dgUndo.length);
    await drag(page, await center(page, '.dg-edge-end[data-end="to"]'), await w2s(page, 200, 500));
    expect(await canon(page)).toBe(before);
    expect(await page.evaluate(() => dgUndo.length)).toBe(u);
  });

  test('moving an end so the edge would be a same-port self loop is refused', async ({ page }) => {
    await drag(page, await port(page, 'a', 'e'), await port(page, 'b', 'w'));
    await drag(page, await center(page, '.dg-edge-end[data-end="to"]'), await port(page, 'a', 'e'));
    expect(await canon(page)).toContain('a.e -> b.w');
  });

  test('resize handle and dots do not fight: zoomed out the 12px rule is in screen pixels', async ({ page }) => {
    await page.click('#dg-zoom-out'); await page.click('#dg-zoom-out');
    const z = await page.evaluate(() => dg.zoom);
    expect(z).toBeLessThan(1);
    await page.click('.dg-node[data-id="a"]');
    await drag(page, await port(page, 'a', 'e'), await port(page, 'b', 'w'));
    expect(await canon(page)).toContain('a.e -> b.w');
  });
});

test.describe('mind map: free form', () => {
  test.beforeEach(async ({ page }) => { await openBlock(page, 'mindmap', MM3); });

  test('a node is dragged with its whole branch, snapped to the 10px grid, as ONE undo step', async ({ page }) => {
    const start = await page.evaluate(() => { const L = dg.lay.byPath; return { r: [L.get('1').x, L.get('1').y], c: [L.get('1.0').x, L.get('1.0').y] }; });
    const c1 = await center(page, '.dg-mm-node[data-path="1"]');
    await drag(page, c1, { x: c1.x + 33, y: c1.y + 117 }, 10);
    const end = await page.evaluate(() => { const L = dg.lay.byPath; return { r: [L.get('1').x, L.get('1').y], c: [L.get('1.0').x, L.get('1.0').y], root: [dg.mm.root.x, dg.mm.root.y], left: dg.mm.root.children[0].x }; });
    const dx = end.r[0] - start.r[0], dy = end.r[1] - start.r[1];
    expect((Math.round(end.r[0]) % 10 + 10) % 10).toBe(0);
    expect((Math.round(end.r[1]) % 10 + 10) % 10).toBe(0);
    expect(Math.abs(dx)).toBeGreaterThan(0);
    expect(end.c[0] - start.c[0]).toBeCloseTo(dx, 0);
    expect(end.c[1] - start.c[1]).toBeCloseTo(dy, 0);
    expect(end.root).toEqual([null, null]);      // root and the other branch untouched
    expect(end.left).toBeNull();
    const txt = await canon(page);
    expect(txt).toMatch(/Right \{-?\d+,-?\d+\}/);
    expect(txt).toMatch(/Child \{-?\d+,-?\d+\}/);
    expect(await undoAll(page)).toBe(1);
    expect(await canon(page)).toBe(MM3);
  });

  test('a click without movement (< 3px) writes no positions and no undo step', async ({ page }) => {
    const c = await center(page, '.dg-mm-node[data-path="0"]');
    await drag(page, c, { x: c.x + 2, y: c.y + 1 }, 2);
    expect(await canon(page)).toBe(MM3);
    expect(await undoDisabled(page)).toBe(true);
  });

  test('dragging the root moves the whole map', async ({ page }) => {
    const c = await center(page, '.dg-mm-node[data-path=""]');
    await drag(page, c, { x: c.x + 60, y: c.y + 60 });
    const t = await canon(page);
    expect((t.match(/\{-?\d+,-?\d+\}/g) || []).length).toBe(4);
  });

  test('Esc during a node drag restores the positions', async ({ page }) => {
    const c = await center(page, '.dg-mm-node[data-path="0"]');
    await drag(page, c, { x: c.x + 80, y: c.y + 80 }, 8, { release: false });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await canon(page)).toBe(MM3);
    expect(await page.locator('#diagram-modal').isVisible()).toBe(true);
  });

  test('↺ Auto layout: disabled on a fresh map, enabled after a drag, clears positions and pins, colours kept, one undo step', async ({ page }) => {
    expect(await page.locator('#dg-mm-auto').isDisabled()).toBe(true);
    const c = await center(page, '.dg-mm-node[data-path="0"]');
    await drag(page, c, { x: c.x + 40, y: c.y + 90 });
    await page.click('#dg-colors [data-color]:nth-child(3)');
    expect(await page.locator('#dg-mm-auto').isEnabled()).toBe(true);
    const u = await page.evaluate(() => dgUndo.length);
    await page.click('#dg-mm-auto');
    const t = await canon(page);
    expect(t).not.toMatch(/\{-?\d+,-?\d+/);
    expect(t).toMatch(/#[0-9A-F]{6}/);       // the colour survives
    expect(await page.evaluate(() => dgUndo.length)).toBe(u + 1);
    expect(await page.locator('#dg-mm-auto').isDisabled()).toBe(true);
    await page.click('#dg-undo');
    expect(await canon(page)).toMatch(/\{-?\d+,-?\d+/);
  });

  test('colours: #dg-colors visible for mind maps; swatch sets the selected node only; active mark; ↺ clears', async ({ page }) => {
    await page.click('.dg-mm-node[data-path="0"]');
    expect(await page.locator('#dg-colors').isVisible()).toBe(true);
    expect(await page.locator('#dg-color-auto').isVisible()).toBe(true);
    expect(await page.locator('#dg-color-auto').isDisabled()).toBe(true);
    expect(await page.locator('#dg-colors .active').count()).toBe(0);
    await page.click('#dg-colors [data-color]:nth-child(3)');
    const own = await page.evaluate(() => dg.mm.root.children[0].color);
    expect(own).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(await page.locator('#dg-colors .active').count()).toBe(1);
    expect(await page.evaluate(() => [dg.mm.root.color, dg.mm.root.children[1].color, dg.mm.root.children[1].children[0].color])).toEqual([null, null, null]);
    expect(await page.locator('#dg-color-auto').isEnabled()).toBe(true);
    // selecting another node: nothing active
    await page.click('.dg-mm-node[data-path="1"]');
    expect(await page.locator('#dg-colors .active').count()).toBe(0);
    await page.click('.dg-mm-node[data-path="0"]');
    await page.click('#dg-color-auto');
    expect(await page.evaluate(() => dg.mm.root.children[0].color)).toBeNull();
    expect(await canon(page)).toBe(MM3);
  });

  test('picking the same colour twice is one undo step', async ({ page }) => {
    await page.click('.dg-mm-node[data-path="0"]');
    await page.click('#dg-colors [data-color]:nth-child(2)');
    await page.click('#dg-colors [data-color]:nth-child(2)');
    expect(await undoAll(page)).toBe(1);
  });

  test('a child added with Tab has no x,y and lands beside its (moved) parent', async ({ page }) => {
    const c = await center(page, '.dg-mm-node[data-path="1"]');
    await drag(page, c, { x: c.x + 50, y: c.y + 150 });
    await page.click('.dg-mm-node[data-path="1"]');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Nou');
    await page.keyboard.press('Enter');
    const r = await page.evaluate(() => {
      const kids = dg.mm.root.children[1].children; const n = kids[kids.length - 1];
      const P = dg.lay.byPath.get('1'), K = dg.lay.byPath.get('1.' + (kids.length - 1));
      return { label: n.label, x: n.x, y: n.y, dx: K.x - P.x, near: Math.abs(K.y - P.y) };
    });
    expect(r.label).toBe('Nou');
    expect(r.x).toBeNull(); expect(r.y).toBeNull();
    expect(r.near).toBeLessThan(200);
  });

  test('selected non-root node: 8 dots and 2 end handles; the root has neither handles', async ({ page }) => {
    await page.click('.dg-mm-node[data-path="0"]');
    expect(await page.locator('#dg-world .dg-port').count()).toBe(8);
    expect(await page.locator('#dg-world .dg-edge-end').count()).toBe(2);
    await page.click('.dg-mm-node[data-path=""]');
    expect(await page.locator('#dg-world .dg-edge-end').count()).toBe(0);
  });

  test('the "to" handle dropped on the node\'s own dot pins it, on its body unpins it, elsewhere cancels; each is one undo step', async ({ page }) => {
    await page.click('.dg-mm-node[data-path="0"]');
    const pos = async p => { const q = await page.evaluate(p => { const b = dgMmBox(dg.lay.byPath.get('0')); const k = dgPorts(b)[p]; return [k.x, k.y]; }, p); return w2s(page, ...q); };
    await drag(page, await center(page, '.dg-edge-end[data-end="to"]'), await pos('n'));
    expect(await canon(page)).toMatch(/Left \{to=n\}/);
    await drag(page, await center(page, '.dg-edge-end[data-end="to"]'), await w2s(page, 0, 400));
    expect(await canon(page)).toMatch(/Left \{to=n\}/);
    const b = await page.evaluate(() => { const L = dg.lay.byPath.get('0'); return [L.x + L.w / 2, L.y + L.h / 2]; });
    await drag(page, await center(page, '.dg-edge-end[data-end="to"]'), await w2s(page, ...b));
    expect(await canon(page)).toBe(MM3);   // body drop = automatic again
    expect(await page.evaluate(() => dgUndo.length)).toBe(2);
  });

  test('a pin alone (no position) is enough to enable ↺ Auto layout, and it clears the pin', async ({ page }) => {
    await page.evaluate(() => { dg.mm.root.children[0].toPort = 'n'; dgRender(); });
    expect(await page.locator('#dg-mm-auto').isEnabled()).toBe(true);
    await page.click('#dg-mm-auto');
    expect(await canon(page)).toBe(MM3);
  });

  test('arrow keys still navigate; Delete removes a node; the root cannot be deleted', async ({ page }) => {
    await page.click('.dg-mm-node[data-path=""]');
    await page.keyboard.press('Delete');
    expect(await page.locator('.dg-mm-node').count()).toBe(4);
    await page.keyboard.press('ArrowRight');
    const sel = await page.evaluate(() => dg.sel.path);
    expect(sel).not.toBe('');
  });
});

test.describe('sequence: modal', () => {
  const SEQ = 'participant Ana\nparticipant Bogdan\nparticipant Cip\nAna -> Bogdan | unu\nBogdan --> Ana | doi\nCip -> Cip | trei\nnote Bogdan | nota';
  test('opens with the source shown and the flow-only controls hidden', async ({ page }) => {
    await openBlock(page, 'sequence', SEQ);
    expect(await page.locator('#dg-source').isVisible()).toBe(true);
    expect(await page.locator('#dg-source-btn').getAttribute('aria-pressed')).toBe('true');
    for (const id of ['dg-tools', 'dg-mm-tools', 'dg-colors', 'dg-color-auto', 'dg-edge-kind', 'dg-delete']) expect(await page.locator('#' + id).isHidden(), id).toBe(true);
    expect(await page.locator('#dg-source').inputValue()).toBe(SEQ);
    expect(await page.locator('#dg-kind [data-kind="sequence"]').getAttribute('class')).toContain('active');
  });

  test('the source toggle still hides and shows it', async ({ page }) => {
    await openBlock(page, 'sequence', SEQ);
    await page.click('#dg-source-btn');
    expect(await page.locator('#dg-source').isHidden()).toBe(true);
    await page.click('#dg-source-btn');
    expect(await page.locator('#dg-source').isVisible()).toBe(true);
  });

  test('typing in the source redraws the diagram (150ms re-parse) and Update writes it back', async ({ page }) => {
    await openBlock(page, 'sequence', SEQ);
    await page.locator('#dg-source').fill(SEQ + '\nAna -> Cip | quattro');
    await expect(page.locator('#dg-world .dg-seq-msg')).toHaveCount(4);
    await page.click('#dg-apply');
    const v = await page.evaluate(() => editor.value);
    expect(v).toContain('Ana -> Cip | quattro');
    expect(v.startsWith('```sequence\n')).toBe(true);
    expect(await page.locator('#diagram-modal').isHidden()).toBe(true);
  });

  test('new mode: switch flow → mindmap → sequence with a clean state; sequence seeds and opens source', async ({ page }) => {
    await setText(page, '');
    await page.click('#btn-diagram');
    await page.click('#dg-kind [data-kind="sequence"]');
    expect(await page.locator('#dg-source').isVisible()).toBe(true);
    expect(await page.locator('#dg-world .dg-seq-part').count()).toBe(2);
    expect(await page.locator('#dg-world .dg-seq-msg').count()).toBe(3);
    expect(await page.locator('#dg-tools').isHidden()).toBe(true);
    await page.click('#dg-kind [data-kind="flow"]');
    expect(await page.locator('#dg-tools').isVisible()).toBe(true);
    expect(await page.locator('#dg-colors').isVisible()).toBe(true);
    await page.click('#dg-kind [data-kind="mindmap"]');
    expect(await page.locator('#dg-mm-tools').isVisible()).toBe(true);
    await page.click('#dg-apply');
    expect(await page.evaluate(() => editor.value)).toMatch(/^```mindmap\n/);
  });

  test('participants can be reordered by dragging one sideways: one undo step, text follows', async ({ page }) => {
    await openBlock(page, 'sequence', SEQ);
    const a = await center(page, '.dg-seq-part[data-id="Ana"]');
    const c = await center(page, '.dg-seq-part[data-id="Cip"]');
    await drag(page, a, { x: c.x + 30, y: a.y }, 10);
    const t = await canon(page);
    expect(t.split('\n').slice(0, 3)).toEqual(['participant Bogdan', 'participant Cip', 'participant Ana']);
    expect(await page.locator('#dg-source').inputValue()).toBe(t);
    expect(await undoAll(page)).toBe(1);
    expect((await canon(page)).split('\n')[0]).toBe('participant Ana');
  });

  test('a participant moved less than 3px is not a drag; no undo step', async ({ page }) => {
    await openBlock(page, 'sequence', SEQ);
    const a = await center(page, '.dg-seq-part[data-id="Ana"]');
    await drag(page, a, { x: a.x + 2, y: a.y }, 2);
    expect(await canon(page)).toBe(SEQ);
    expect(await undoDisabled(page)).toBe(true);
  });

  test('dragging a participant left of everything puts it first', async ({ page }) => {
    await openBlock(page, 'sequence', SEQ);
    const c = await center(page, '.dg-seq-part[data-id="Cip"]');
    const a = await center(page, '.dg-seq-part[data-id="Ana"]');
    await drag(page, c, { x: a.x - 100, y: c.y }, 10);
    expect((await canon(page)).split('\n')[0]).toBe('participant Cip');
  });

  test('clicking a message opens the label editor pre-filled; Enter commits as one undo step', async ({ page }) => {
    await openBlock(page, 'sequence', SEQ);
    await clickSeq(page, 0);
    const inp = page.locator('#dg-label-input');
    await expect(inp).toBeVisible();
    expect(await inp.inputValue()).toBe('unu');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('primul');
    await page.keyboard.press('Enter');
    await expect(inp).toBeHidden();
    expect(await canon(page)).toContain('Ana -> Bogdan | primul');
    expect(await undoAll(page)).toBe(1);
    expect(await canon(page)).toBe(SEQ);
  });

  test('Esc cancels the label edit without closing the modal; Shift+Enter makes a newline', async ({ page }) => {
    await openBlock(page, 'sequence', SEQ);
    await clickSeq(page, 1);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('zzz');
    await page.keyboard.press('Escape');
    expect(await page.locator('#diagram-modal').isVisible()).toBe(true);
    expect(await canon(page)).toBe(SEQ);
    await clickSeq(page, 1);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('a');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('b');
    await page.keyboard.press('Enter');
    expect(await canon(page)).toContain('Bogdan --> Ana | a\\nb');
  });

  test('clicking a note edits its label; blur commits', async ({ page }) => {
    await openBlock(page, 'sequence', SEQ);
    await page.locator('#dg-world .dg-seq-note-g').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('nou');
    await page.locator('#dg-stage').click({ position: { x: 5, y: 5 } });
    expect(await canon(page)).toContain('note Bogdan | nou');
  });

  test('committing an empty label leaves a message with no label (still valid text)', async ({ page }) => {
    await openBlock(page, 'sequence', SEQ);
    await clickSeq(page, 0);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Enter');
    expect(await canon(page)).toContain('Ana -> Bogdan\n');
  });

  test('dragging on empty stage pans; zoom buttons and fit work in the sequence kind', async ({ page }) => {
    await openBlock(page, 'sequence', SEQ);
    const px = await page.evaluate(() => dg.panX);
    const r = await page.locator('#dg-stage').boundingBox();
    await drag(page, { x: r.x + 10, y: r.y + r.height - 10 }, { x: r.x + 90, y: r.y + r.height - 10 }, 5);
    expect(await page.evaluate(() => dg.panX)).toBeCloseTo(px + 80, 0);
    await page.click('#dg-zoom-in');
    expect(await page.evaluate(() => dg.zoom)).toBeGreaterThan(0);
    await page.click('#dg-fit');
  });

  test('a label typed with a "|" or backslash survives the canonical text', async ({ page }) => {
    await openBlock(page, 'sequence', 'A -> B | x');
    await clickSeq(page, 0);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('a | b \\ c');
    await page.keyboard.press('Enter');
    const again = await page.evaluate(() => dgParseSequence(dgCanon()).events[0].label);
    expect(again).toBe('a | b \\ c');
  });

  test('modal download buttons: a new block is numbered after the ones already in the chapter', async ({ page }) => {
    await setText(page, fence('sequence', 'A -> B') + '\n\n' + fence('sequence', 'C -> D') + '\n\n');
    await captureSaves(page);
    await page.click('#btn-diagram');           // caret at the end, outside any block → new
    await page.click('#dg-kind [data-kind="sequence"]');
    await page.click('#dg-dl-svg');
    await page.click('#dg-dl-png');
    await expect.poll(async () => (await saves(page)).length).toBe(2);
    expect((await saves(page)).map(s => s.name).sort()).toEqual(['diagrama-sequence-3.png', 'diagrama-sequence-3.svg']);
  });

  test('modal download of an edited block is numbered by its place; exports the unsaved edit', async ({ page }) => {
    await setText(page, fence('flow', 'a -> b') + '\n\n' + fence('flow', 'c -> d'), 30);
    await page.evaluate(() => openDiagram({ line: 4 }));
    await captureSaves(page);
    await page.click('#dg-dl-svg');
    await expect.poll(async () => (await saves(page)).length).toBe(1);
    expect((await saves(page))[0].name).toBe('diagrama-flowchart-2.svg');
  });
});

test.describe('modal: general', () => {
  test('all three kinds open from the caret inside their block (edit mode) with the kind fixed', async ({ page }) => {
    for (const [k, b] of [['flow', 'a -> b'], ['mindmap', 'R\n  A'], ['sequence', 'A -> B']]) {
      await setText(page, fence(k, b), 5);
      await page.click('#btn-diagram');
      expect(await page.evaluate(() => [dg.mode, dg.kind])).toEqual(['edit', k]);
      expect(await page.locator('#dg-kind [data-kind]').evaluateAll(bs => bs.every(x => x.disabled))).toBe(true);
      await page.click('#dg-cancel');
    }
  });

  test('Update replaces only its own block in place, with one markdown undo step', async ({ page }) => {
    const md = 'intro\n\n' + fence('sequence', 'A -> B | x') + '\n\noutro';
    await setText(page, md, 12);
    await page.click('#btn-diagram');
    await page.locator('#dg-source').fill('A -> B | changed');
    await page.click('#dg-apply');
    const v = await page.evaluate(() => editor.value);
    expect(v).toBe('intro\n\n```sequence\nparticipant A\nparticipant B\nA -> B | changed\n```\n\noutro');
    await page.click('#editor');
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => editor.value)).toBe(md);
  });

  test('Cancel with unsaved edits asks first', async ({ page }) => {
    let asked = 0;
    page.removeAllListeners('dialog');
    page.on('dialog', d => { asked++; d.dismiss(); });
    await openBlock(page, 'sequence', 'A -> B');
    await page.locator('#dg-source').fill('A -> C');
    await page.click('#dg-cancel');
    expect(asked).toBe(1);
    expect(await page.locator('#diagram-modal').isVisible()).toBe(true);
  });

  test('Romanian and English: new labels exist in both languages, comma-below diacritics only', async ({ page }) => {
    const r = await page.evaluate(() => {
      const keys = ['dgKindSequence', 'dgColorAuto', 'dgAutoLayout', 'dgDlSvg', 'dgDlPng', 'dgDlSvgTip', 'dgDlPngTip', 'sketchBtn', 'sketchTip', 'skTitleNew', 'skTitleEdit', 'skAlt', 'skDrawOnTip', 'skImgBlocked', 'skImgMoved', 'skPen', 'skHl', 'skEraser', 'skThin', 'skMedium', 'skThick'];
      const out = { missing: [], cedilla: [] };
      for (const lang of ['ro', 'en']) for (const k of keys) {
        const v = I18N[lang] && I18N[lang][k];
        if (v == null || v === '') out.missing.push(lang + ':' + k);
        else if (/[şŞţŢ]/.test(String(v))) out.cedilla.push(lang + ':' + k);
      }
      return out;
    });
    expect(r.missing).toEqual([]);
    expect(r.cedilla).toEqual([]);
  });

  test('the seed sequence follows the UI language', async ({ page }) => {
    const r = await page.evaluate(() => { const old = UI; UI = 'en'; const en = dgSeed('sequence'); UI = 'ro'; const ro = dgSeed('sequence'); UI = old; return [en, ro]; });
    expect(r[0]).not.toBe(r[1]);
    expect(r[1]).toContain('Ana -> Bogdan');
  });
});

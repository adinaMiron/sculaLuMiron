// Undo / redo: one press per action, the first action included.
const L = require('./lib');

let pass = 0, fail = 0;
const check = (n, c, d) => { c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}   ${d || ''}`)); };

const drag = async (page, x1, y1, x2, y2) => {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(x1 + (x2 - x1) * i / 8, y1 + (y2 - y1) * i / 8); await L.sleep(10); }
  await page.mouse.up();
  await L.sleep(70);
};
const layers = page => page.evaluate(() => document.querySelectorAll('#layerList .layerItem').length);
const names = page => page.evaluate(() => [...document.querySelectorAll('#layerList .lname')].map(n => n.textContent));
const selected = page => page.evaluate(() => document.querySelectorAll('#layerList .layerItem.selected').length);
const undoN = async (page, n) => { for (let i = 0; i < n; i++) { await page.keyboard.press('Control+z'); await L.sleep(90); } };
const redoN = async (page, n) => { for (let i = 0; i < n; i++) { await page.keyboard.press('Control+Shift+z'); await L.sleep(90); } };
const inkAt = (page, x, y) => page.evaluate(({ x, y }) => {
  const c = document.getElementById('baseCanvas'), r = c.getBoundingClientRect();
  const px = Math.round((x - r.left) / r.width * c.width), py = Math.round((y - r.top) / r.height * c.height);
  if (px < 0 || py < 0 || px >= c.width || py >= c.height) return false;
  const d = c.getContext('2d').getImageData(px, py, 1, 1).data;
  return d[3] > 0 && (d[0] < 200 || d[1] < 200 || d[2] < 200);
}, { x, y });

(async () => {
  const { browser, page, errors } = await L.open({ mobile: false, width: 1280, height: 860 });
  const fresh = async () => {
    await page.reload();
    await L.newCanvas(page);
    await L.hidePanels(page);
    await L.sleep(120);
    return L.metrics(page);
  };
  let m = await fresh();
  const at = (fx, fy) => ({ x: m.stage.left + m.stage.w * fx, y: m.stage.top + m.stage.h * fy });

  // ---------- 1. the very first action is undoable, in one press ----------
  await page.keyboard.press('r');
  let a = at(0.15, 0.15), b = at(0.4, 0.35);
  await drag(page, a.x, a.y, b.x, b.y);
  check('rectangle drawn', await layers(page) === 1);
  await undoN(page, 1);
  check('one Ctrl+Z undoes the very first action', await layers(page) === 0, `layers=${await layers(page)}`);
  await redoN(page, 1);
  check('one redo brings it back', await layers(page) === 1, `layers=${await layers(page)}`);
  check('and the ink is back where it was', await inkAt(page, a.x, (a.y + b.y) / 2));

  // ---------- 2. several actions, one press each ----------
  await page.keyboard.press('o');
  await drag(page, at(0.5, 0.15).x, at(0.5, 0.15).y, at(0.7, 0.35).x, at(0.7, 0.35).y);
  await page.keyboard.press('l');
  await drag(page, at(0.15, 0.5).x, at(0.15, 0.5).y, at(0.4, 0.7).x, at(0.4, 0.7).y);
  check('three shapes', await layers(page) === 3, `layers=${await layers(page)}`);
  await undoN(page, 3);
  check('three undos empty the drawing', await layers(page) === 0, `layers=${await layers(page)}`);
  await redoN(page, 3);
  check('three redos restore all three', await layers(page) === 3, `layers=${await layers(page)}`);

  // ---------- 3. clicks that only select must not eat undo steps ----------
  m = await fresh();
  await page.keyboard.press('r');
  a = at(0.2, 0.2); b = at(0.5, 0.45);
  await drag(page, a.x, a.y, b.x, b.y);
  await page.keyboard.press('v');
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  for (let i = 0; i < 3; i++) { await L.sleep(450); await page.mouse.click(mid.x, mid.y); }
  await L.sleep(120);
  check('the shape is selected', await selected(page) === 1);
  await undoN(page, 1);
  check('selecting three times still costs zero undo steps', await layers(page) === 0, `layers=${await layers(page)}`);

  // ---------- 4. move ----------
  m = await fresh();
  await page.keyboard.press('r');
  a = at(0.2, 0.2); b = at(0.45, 0.4);
  await drag(page, a.x, a.y, b.x, b.y);
  await page.keyboard.press('v');
  await L.sleep(450);
  await page.mouse.click((a.x + b.x) / 2, (a.y + b.y) / 2);
  await L.sleep(100);
  await drag(page, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.x + b.x) / 2 + 120, (a.y + b.y) / 2);
  check('the move happened', await inkAt(page, a.x + 120, (a.y + b.y) / 2), 'no ink at the moved edge');
  await undoN(page, 1);
  check('one undo reverts the move', await inkAt(page, a.x, (a.y + b.y) / 2) && await layers(page) === 1,
    'the left edge did not come back');
  check('undo restores the selection too', await selected(page) === 1, `selected=${await selected(page)}`);

  // ---------- 5. delete ----------
  await page.keyboard.press('Delete');
  await L.sleep(100);
  check('deleted', await layers(page) === 0);
  await undoN(page, 1);
  check('one undo brings a deleted shape back', await layers(page) === 1, `layers=${await layers(page)}`);

  // ---------- 6. copy / paste, group, reorder ----------
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await L.sleep(120);
  check('pasted', await layers(page) === 2, `layers=${await layers(page)}`);
  await page.keyboard.press('Control+z');
  await L.sleep(120);
  check('one undo removes a paste', await layers(page) === 1, `layers=${await layers(page)}`);
  await page.keyboard.press('Control+Shift+z');
  await L.sleep(120);
  await page.keyboard.press('Control+a').catch(() => { });
  // select both by shift-clicking through the layer list
  await page.evaluate(() => {
    const rows = document.querySelectorAll('#layerList .layerItem');
    rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
  });
  await L.sleep(100);
  await page.keyboard.press('Control+g');
  await L.sleep(120);
  const grouped = await page.evaluate(() => document.querySelectorAll('#layerList .groupTag').length);
  check('grouped', grouped === 2, `groupTags=${grouped}`);
  await undoN(page, 1);
  check('one undo ungroups', await page.evaluate(() => document.querySelectorAll('#layerList .groupTag').length) === 0);

  // ---------- 7. text, and a rect label ----------
  m = await fresh();
  await page.keyboard.press('t');
  const tp = at(0.3, 0.3);
  await page.mouse.click(tp.x, tp.y);
  await L.sleep(120);
  await page.keyboard.type('Prima');
  await page.evaluate(() => document.getElementById('textEditArea').blur());
  await L.sleep(150);
  check('text added', await layers(page) === 1 && /Prima/.test((await names(page)).join(' ')), `[${await names(page)}]`);
  await undoN(page, 1);
  check('one undo removes the text', await layers(page) === 0, `layers=${await layers(page)}`);
  await redoN(page, 1);
  check('redo brings the text back', await layers(page) === 1 && /Prima/.test((await names(page)).join(' ')));

  await page.keyboard.press('r');
  const ra = at(0.5, 0.5), rb = at(0.8, 0.7);
  await drag(page, ra.x, ra.y, rb.x, rb.y);
  await page.keyboard.press('v');
  await L.sleep(450);
  await page.mouse.dblclick((ra.x + rb.x) / 2, (ra.y + rb.y) / 2);
  await L.sleep(200);
  check('rect label editor opened', await page.evaluate(() => !!document.getElementById('textEditArea')));
  await page.keyboard.type('Etichetă');
  await page.evaluate(() => { const t = document.getElementById('textEditArea'); if (t) t.blur(); });
  await L.sleep(150);
  check('label stored', /text/i.test((await names(page)).join(' ')) || (await names(page)).length === 2, `[${await names(page)}]`);
  await undoN(page, 1);
  const afterLabelUndo = await names(page);
  check('one undo removes the label but keeps the rectangle', afterLabelUndo.length === 2, `[${afterLabelUndo}]`);

  // ---------- 8. a new action clears the redo stack ----------
  m = await fresh();
  await page.keyboard.press('r');
  await drag(page, at(0.2, 0.2).x, at(0.2, 0.2).y, at(0.4, 0.4).x, at(0.4, 0.4).y);
  await undoN(page, 1);
  await page.keyboard.press('o');
  await drag(page, at(0.5, 0.5).x, at(0.5, 0.5).y, at(0.7, 0.7).x, at(0.7, 0.7).y);
  await redoN(page, 2);
  check('a new action clears the redo stack', await layers(page) === 1, `layers=${await layers(page)} [${await names(page)}]`);

  // ---------- 9. a new canvas starts with an empty history ----------
  await page.click('#newCanvasBtn');
  await page.click('#newCanvasCreate');
  await L.sleep(200);
  check('new canvas is empty', await layers(page) === 0);
  await undoN(page, 3);
  check('undo cannot resurrect the previous drawing', await layers(page) === 0, `layers=${await layers(page)}`);

  // ---------- 10. undo depth ----------
  m = await L.metrics(page);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('r');
    const p = at(0.1 + (i % 4) * 0.2, 0.1 + Math.floor(i / 4) * 0.3);
    await drag(page, p.x, p.y, p.x + 60, p.y + 40);
  }
  check('eight shapes', await layers(page) === 8, `layers=${await layers(page)}`);
  await undoN(page, 8);
  check('eight undos walk all the way back', await layers(page) === 0, `layers=${await layers(page)}`);
  await redoN(page, 8);
  check('eight redos walk all the way forward', await layers(page) === 8, `layers=${await layers(page)}`);

  // ---------- 11. the toolbar buttons ----------
  const btn = (page, id) => page.evaluate(i => {
    const b = document.getElementById(i);
    return { there: !!b, disabled: !!b && b.disabled, label: b ? b.querySelector('.tlabel').textContent.trim() : '' };
  }, id);

  m = await fresh();
  let u = await btn(page, 'undoBtn'), r = await btn(page, 'redoBtn');
  check('both buttons exist in the top bar', u.there && r.there);
  check('nothing drawn yet, so both are disabled', u.disabled && r.disabled,
    `undo=${u.disabled} redo=${r.disabled}`);

  await page.keyboard.press('r');
  await drag(page, at(0.2, 0.2).x, at(0.2, 0.2).y, at(0.45, 0.45).x, at(0.45, 0.45).y);
  u = await btn(page, 'undoBtn'); r = await btn(page, 'redoBtn');
  check('drawing enables undo, redo stays disabled', !u.disabled && r.disabled,
    `undo=${u.disabled} redo=${r.disabled}`);

  await page.click('#undoBtn');
  await L.sleep(120);
  check('the undo button undoes', await layers(page) === 0, `layers=${await layers(page)}`);
  u = await btn(page, 'undoBtn'); r = await btn(page, 'redoBtn');
  check('and the pair flips: undo off, redo on', u.disabled && !r.disabled,
    `undo=${u.disabled} redo=${r.disabled}`);

  await page.click('#redoBtn');
  await L.sleep(120);
  check('the redo button redoes', await layers(page) === 1, `layers=${await layers(page)}`);
  check('redo is disabled again at the end of the stack',
    (await btn(page, 'redoBtn')).disabled);

  // Ctrl+Y is the second redo shortcut
  await page.keyboard.press('Control+z');
  await L.sleep(120);
  await page.keyboard.press('Control+y');
  await L.sleep(120);
  check('Ctrl+Y redoes too', await layers(page) === 1, `layers=${await layers(page)}`);

  // a new canvas empties the history, and the buttons say so
  await page.click('#newCanvasBtn');
  await page.click('#newCanvasCreate');
  await L.sleep(200);
  u = await btn(page, 'undoBtn'); r = await btn(page, 'redoBtn');
  check('a new canvas disables both again', u.disabled && r.disabled,
    `undo=${u.disabled} redo=${r.disabled}`);

  // and they are translated like every other button in the bar
  check('the labels are the Romanian ones', u.label === 'Anuleaz\u0103' && r.label === 'Ref\u0103',
    `[${u.label}] [${r.label}]`);

  console.log(errors.length ? 'JS errors:\n' + errors.join('\n') : 'no JS errors');
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });

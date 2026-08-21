// Everything else that goes through the pointer pipeline: all ten tools,
// select / move / resize, undo-redo, delete, rect labels, panel dragging.
const L = require('./lib');

let pass = 0, fail = 0;
const check = (n, c, d) => { c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}   ${d || ''}`)); };
// something that is broken on main too - reported, not counted as a regression
let known = 0;
const knownBug = (n, c, why) => { c ? (pass++, console.log(`  PASS  ${n}  (known bug appears fixed!)`)) : (known++, console.log(`  KNOWN ${n}   ${why}`)); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const drag = async (page, x1, y1, x2, y2, opts = {}) => {
  if (opts.alt) await page.keyboard.down('Alt');
  await page.mouse.move(x1, y1);
  await page.mouse.down(opts.button ? { button: opts.button } : {});
  for (let i = 1; i <= 8; i++) { await page.mouse.move(x1 + (x2 - x1) * i / 8, y1 + (y2 - y1) * i / 8); await L.sleep(10); }
  await page.mouse.up(opts.button ? { button: opts.button } : {});
  if (opts.alt) await page.keyboard.up('Alt');
  await L.sleep(60);
};

(async () => {
  const { browser, page, errors } = await L.open({ mobile: false, width: 1280, height: 860 });
  await L.newCanvas(page);
  await L.hidePanels(page);
  await L.sleep(120);
  let m = await L.metrics(page);
  const at = (fx, fy) => ({ x: m.stage.left + m.stage.w * fx, y: m.stage.top + m.stage.h * fy });

  // ---------- every tool still draws ----------
  const tools = [
    ['r', 'rect'], ['o', 'ellipse'], ['d', 'rhombus'], ['l', 'line'],
    ['a', 'arrow'], ['s', 'splineArrow'], ['p', 'pencil'], ['h', 'highlight']
  ];
  let n = 0;
  for (const [key, name] of tools) {
    await page.keyboard.press(key);
    const y = 0.06 + n * 0.105;   // one band per tool, no overlaps to hit-test through
    const a = at(0.12, y), b = at(0.42, y + 0.08);
    await drag(page, a.x, a.y, b.x, b.y);
    n++;
    const after = await L.metrics(page);
    check(`${name} draws`, after.layers === n, `layers=${after.layers} expected ${n}`);
  }

  // ---------- text ----------
  await page.keyboard.press('t');
  const tp = at(0.6, 0.2);
  await page.mouse.click(tp.x, tp.y);
  await L.sleep(120);
  check('text tool opens an editor on click', (await L.metrics(page)).hasEditor);
  await page.keyboard.type('Țiglă');
  await page.evaluate(() => document.getElementById('textEditArea').blur());
  await L.sleep(120);
  n++;
  m = await L.metrics(page);
  check('text layer created with diacritics', m.layers === n && /Țiglă/.test(m.layerNames.join(' ')), `[${m.layerNames}]`);

  // ---------- select + move ----------
  await page.keyboard.press('v');
  const rectA = at(0.12, 0.06), rectB = at(0.42, 0.14);
  const inside = { x: (rectA.x + rectB.x) / 2, y: (rectA.y + rectB.y) / 2 };
  await page.mouse.click(inside.x, inside.y);
  await L.sleep(80);
  let selected = await page.evaluate(() => document.querySelectorAll('#layerList .layerItem.selected').length);
  check('clicking a shape selects it', selected === 1, `selected=${selected}`);

  // move it 60px right and check the ink moved with it
  const inkAt = (x, y) => page.evaluate(({ x, y }) => {
    const c = document.getElementById('baseCanvas'), r = c.getBoundingClientRect();
    const px = Math.round((x - r.left) / r.width * c.width), py = Math.round((y - r.top) / r.height * c.height);
    const d = c.getContext('2d').getImageData(px, py, 1, 1).data;
    return d[3] > 0 && (d[0] < 200 || d[1] < 200 || d[2] < 200);
  }, { x, y });
  const edgeBefore = await inkAt(rectA.x, (rectA.y + rectB.y) / 2);
  await drag(page, inside.x, inside.y, inside.x + 70, inside.y);
  const edgeAfter = await inkAt(rectA.x + 70, (rectA.y + rectB.y) / 2);
  check('dragging a selected shape moves it', edgeBefore && edgeAfter, `edge before=${edgeBefore} after=${edgeAfter}`);

  // ---------- undo / redo ----------
  await page.keyboard.press('Control+z');
  await L.sleep(120);
  check('one Ctrl+Z reverts the move', await inkAt(rectA.x, (rectA.y + rectB.y) / 2), 'the left edge did not come back');
  check('undo did not change the layer count', (await L.metrics(page)).layers === n, 'layer count changed');
  await page.keyboard.press('Control+Shift+z');
  await L.sleep(120);
  check('redo moves it again', await inkAt(rectA.x + 70, (rectA.y + rectB.y) / 2), 'the left edge did not move back');

  // ---------- resize by a corner handle ----------
  m = await L.metrics(page);
  const before = m.layers;
  // far enough after the previous click at this spot that it is not a double-click
  await L.sleep(500);
  await page.mouse.click(inside.x + 70, inside.y);
  await L.sleep(80);
  await drag(page, rectB.x + 70, rectB.y, rectB.x + 130, rectB.y + 40);
  check('resizing keeps the layer count', (await L.metrics(page)).layers === before, 'layer count changed');
  check('resize grew the shape', await inkAt(rectB.x + 125, rectB.y + 38), 'no ink at the new corner');

  // ---------- delete ----------
  await page.keyboard.press('Delete');
  await L.sleep(100);
  check('Delete removes the selection', (await L.metrics(page)).layers === before - 1, `layers=${(await L.metrics(page)).layers}`);
  await page.keyboard.press('Control+z');
  await L.sleep(100);

  // ---------- rect label by double-click (on a fresh rect, so this does not
  //            depend on the undo above) ----------
  await page.keyboard.press('r');
  const fa = at(0.55, 0.55), fb = at(0.85, 0.72);
  await drag(page, fa.x, fa.y, fb.x, fb.y);
  await page.keyboard.press('v');
  await L.sleep(500);
  await page.mouse.dblclick((fa.x + fb.x) / 2, (fa.y + fb.y) / 2);
  await L.sleep(180);
  check('double-click on a rect opens its label editor', (await L.metrics(page)).hasEditor);
  await page.keyboard.type('Etichetă');
  await page.evaluate(() => { const t = document.getElementById('textEditArea'); if (t) t.blur(); });
  await L.sleep(120);

  // ---------- panels are still draggable ----------
  await page.click('#toggleToolsBtn');   // show it again
  await L.sleep(120);
  const box0 = await page.evaluate(() => { const r = document.getElementById('toolsPanel').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  const head = await page.evaluate(() => { const r = document.querySelector('#toolsPanel .panelHead').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await drag(page, head.x, head.y, head.x + 120, head.y + 90);
  const box1 = await page.evaluate(() => { const r = document.getElementById('toolsPanel').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  check('the tools panel still drags', near(box1.x - box0.x, 120, 8) && near(box1.y - box0.y, 90, 8),
    `moved ${(box1.x - box0.x).toFixed(0)},${(box1.y - box0.y).toFixed(0)}`);

  // ---------- a drag that starts on a panel must not draw on the canvas ----------
  m = await L.metrics(page);
  const layers0 = m.layers;
  await page.keyboard.press('r');
  await drag(page, box1.x + 40, box1.y + 60, box1.x + 160, box1.y + 160);
  check('dragging inside a panel does not draw', (await L.metrics(page)).layers === layers0, 'a layer appeared');

  console.log(errors.length ? 'JS errors:\n' + errors.join('\n') : 'no JS errors');
  console.log(`\n${pass} passed, ${fail} failed${known ? `, ${known} known pre-existing` : ''}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });

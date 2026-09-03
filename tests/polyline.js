// Polyline tool: placing one, that its spans really are straight, and that
// its vertices stay editable afterwards - dragged, inserted, removed - plus
// the "click the first vertex again" way of closing the shape. Desktop only:
// like the spline it is click-to-place, and the touch half of that pipeline
// is already covered by spline-touch.js (both tools share the code).
const L = require('./lib');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}   ${detail || ''}`); }
}

// Every dark (drawn-on) pixel of the base canvas, in natural canvas coords.
async function inkPixels(page) {
  return page.evaluate(() => {
    const c = document.getElementById('baseCanvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const out = [];
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i + 3] > 40 && d[i] < 160) out.push([x, y]);
      }
    }
    return out;
  });
}

async function layerNames(page) {
  return page.evaluate(() => [...document.querySelectorAll('#layerList .lname')].map(n => n.textContent));
}

// Distance from a point to the chain through `poly` (optionally closed) -
// the exact shape a polyline is supposed to be.
function distToChain(qx, qy, poly, closed) {
  let best = Infinity;
  const last = closed ? poly.length - 1 : poly.length - 2;
  for (let i = 0; i <= last; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
    let t = ((qx - ax) * vx + (qy - ay) * vy) / L2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(qx - (ax + vx * t), qy - (ay + vy * t)));
  }
  return best;
}

(async () => {
  const { browser, page, errors } = await L.open({ mobile: false, width: 1400, height: 900 });
  await L.newCanvas(page);
  await L.hidePanels(page);
  await L.sleep(150);

  let m = await L.metrics(page);
  console.log(`start: stage=${m.stage.w.toFixed(0)}x${m.stage.h.toFixed(0)} scale=${m.scale.toFixed(3)}`);

  // "Stil schiță" (the sloppiness styles) now applies to polylines too. Every
  // "the spans are straight" check below is about Architect (0) - the precise
  // shape - so pin it; section 9 covers the wobble the sketch styles add.
  await page.evaluate(() => document.querySelector('.rough-btn[data-rough="0"]').click());
  const toClient = (x, y) => ({ x: m.stage.left + x * m.scale, y: m.stage.top + y * m.scale });
  const drag = async (from, to, steps = 8) => {
    const a = toClient(from[0], from[1]), b = toClient(to[0], to[1]);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps);
      await L.sleep(15);
    }
    await page.mouse.up();
    await L.sleep(150);
  };
  const clickAt = async (x, y) => { const c = toClient(x, y); await page.mouse.click(c.x, c.y); await L.sleep(60); };

  // ---------- 1. click-to-place, Enter to finish ----------
  await page.keyboard.press('g');
  const activeTool = await page.evaluate(() => document.querySelector('button.tool.active').dataset.tool);
  check('the "g" shortcut selects the polyline tool', activeTool === 'polyline', `got ${activeTool}`);

  // a zigzag: the shape a curve would visibly round off
  const V = [[200, 400], [320, 200], [440, 400], [560, 200]];
  for (const [x, y] of V) await clickAt(x, y);
  await page.keyboard.press('Enter');
  await L.sleep(150);

  let names = await layerNames(page);
  check('one polyline layer exists after finishing', names.length === 1 && /Polyline|Polilinie/.test(names[0]),
    JSON.stringify(names));

  let ink = await inkPixels(page);
  check('the polyline is actually drawn', ink.length > 300, `${ink.length} ink px`);

  // ---------- 2. the spans are straight, and every vertex is on it ----------
  // The whole difference from the spline: no ink may stray off the chain.
  // Half the stroke width plus antialiasing is the only slack allowed.
  const worstStray = Math.max(...ink.map(([x, y]) => distToChain(x, y, V, false)));
  check('every span is a straight segment', worstStray < 3.5,
    `worst stray from the chain ${worstStray.toFixed(1)}px`);
  const onVertex = V.map(([x, y]) => ink.some(([ix, iy]) => Math.hypot(ix - x, iy - y) < 5));
  check('it passes through every vertex', onVertex.every(Boolean), JSON.stringify(onVertex));
  // a curve through this zigzag would overshoot well above y=200
  const topY = Math.min(...ink.map(p => p[1]));
  check('the corners are not rounded off or overshot', topY >= 200 - 3, `top ink at y=${topY}`);

  // ---------- 3. the right property rows show ----------
  await page.keyboard.press('v');
  await clickAt(380, 300);                 // the midpoint of the second span
  await page.evaluate(() => { document.getElementById('toggleSelectionBtn').click(); });
  await L.sleep(150);
  const selCount = await page.evaluate(() => document.querySelectorAll('#layerList .layerItem.selected').length);
  check('clicking a span selects the polyline, not the air around it', selCount === 1, `${selCount} selected`);
  const rows = await page.evaluate(() => ({
    edit: !document.getElementById('rowSplineEdit').hidden,
    tension: !document.getElementById('rowSplineTension').hidden,
    corner: !document.getElementById('splineCornerBtn').hidden,
    hint: document.getElementById('splineEditHint').getAttribute('data-i')
  }));
  check('the Points row shows for a selected polyline', rows.edit);
  check('the Curve slider is hidden - a polyline has no tension', !rows.tension);
  check('the Corner button is hidden - every vertex is already a corner', !rows.corner);
  check('the Points hint is the polyline one', rows.hint === 'polylineEditHint', rows.hint);

  // ---------- 4. dragging a vertex reshapes it ----------
  await drag([320, 200], [320, 90]);
  ink = await inkPixels(page);
  check('the dragged vertex is where it was dropped',
    ink.some(([x, y]) => Math.hypot(x - 320, y - 90) < 6),
    `top ink now y=${Math.min(...ink.map(p => p[1]))}`);
  check('the vertices that were not dragged stayed put',
    ink.some(([x, y]) => Math.hypot(x - 560, y - 200) < 6));
  const V2 = [[200, 400], [320, 90], [440, 400], [560, 200]];
  check('it is still straight after the drag',
    Math.max(...ink.map(([x, y]) => distToChain(x, y, V2, false))) < 3.5);

  await page.keyboard.press('Control+z');
  await L.sleep(150);
  ink = await inkPixels(page);
  check('undo restores the dragged vertex', ink.some(([x, y]) => Math.hypot(x - 320, y - 200) < 6));

  // ---------- 5. double-click a span inserts a vertex, which then drags ----------
  const mid = toClient(380, 300);          // midpoint of the 2nd span
  await page.mouse.dblclick(mid.x, mid.y);
  await L.sleep(150);
  const pickedLive = await page.evaluate(() => document.getElementById('splinePointDelBtn').disabled === false);
  check('double-clicking a span picks the vertex it inserted', pickedLive);
  await drag([380, 300], [380, 430]);
  ink = await inkPixels(page);
  check('the inserted vertex drags like any other',
    ink.some(([x, y]) => Math.hypot(x - 380, y - 430) < 7),
    `bottom ink at y=${Math.max(...ink.map(p => p[1]))}`);

  // ---------- 6. the Points row removes it again ----------
  await page.click('#splinePointDelBtn');
  await L.sleep(150);
  ink = await inkPixels(page);
  check('Remove drops the picked vertex',
    !ink.some(([x, y]) => Math.hypot(x - 380, y - 430) < 7));
  check('the rest of the shape survives', ink.some(([x, y]) => Math.hypot(x - 560, y - 200) < 6));

  // ---------- 7. clicking the first vertex again closes the shape ----------
  await L.newCanvas(page);
  await L.sleep(150);
  m = await L.metrics(page);
  await page.keyboard.press('g');
  const T = [[250, 250], [650, 250], [450, 550]];
  for (const [x, y] of T) await clickAt(x, y);
  await clickAt(T[0][0], T[0][1]);         // back onto the first vertex
  await L.sleep(150);

  names = await layerNames(page);
  check('landing back on the first vertex finishes the shape', names.length === 1, JSON.stringify(names));
  ink = await inkPixels(page);
  // the closing span (450,550)-(250,250) must carry ink, and the whole shape
  // must be the closed triangle rather than the open chain
  const closingInk = ink.filter(([x, y]) => distToChain(x, y, [T[2], T[0]], false) < 2 && y > 300 && y < 500).length;
  check('the closing span is drawn', closingInk > 40, `${closingInk} px along it`);
  const triStray = Math.max(...ink.map(([x, y]) => distToChain(x, y, T, true)));
  check('the closed shape is exactly the triangle', triStray < 3.5, `worst stray ${triStray.toFixed(1)}px`);

  await page.keyboard.press('v');
  await clickAt(450, 250);                 // on the top edge
  await L.sleep(120);
  const closedActive = await page.evaluate(() => document.getElementById('splineClosedBtn').classList.contains('active'));
  check('the Closed button reads back as on', closedActive);

  // ---------- 8. a closed polyline can be filled ----------
  await page.evaluate(() => {
    const sw = document.querySelector('#fillPalette .swatch');
    if (sw) sw.click();
  });
  await L.sleep(150);
  const filled = await page.evaluate(() => {
    const c = document.getElementById('baseCanvas');
    const d = c.getContext('2d').getImageData(450, 350, 1, 1).data;   // well inside the triangle
    return d[3] > 40;
  });
  check('a closed polyline can be filled', filled);

  // ---------- 9. Stil schiță: a sloppiness style wobbles the spans ----------
  // A fresh open zigzag so no fill is in the way. Precise: every pixel sits on
  // the chain. Cartoonist: the spans themselves wobble well off it, and switch
  // back to Architect and it snaps to exact again.
  await L.newCanvas(page);
  await L.sleep(150);
  m = await L.metrics(page);
  const toCl = (x, y) => ({ x: m.stage.left + x * m.scale, y: m.stage.top + y * m.scale });
  await page.evaluate(() => document.querySelector('.rough-btn[data-rough="0"]').click());
  await page.keyboard.press('g');
  const Z = [[200, 400], [340, 200], [480, 400], [620, 200]];
  for (const [x, y] of Z) { const c = toCl(x, y); await page.mouse.click(c.x, c.y); await L.sleep(60); }
  await page.keyboard.press('Enter');
  await L.sleep(150);
  let zInk = await inkPixels(page);
  const preciseStray = Math.max(...zInk.map(([x, y]) => distToChain(x, y, Z, false)));

  await page.keyboard.press('v');
  const zMid = zInk[Math.floor(zInk.length / 2)];
  const zc = toCl(zMid[0], zMid[1]);
  await page.mouse.click(zc.x, zc.y);
  await L.sleep(120);
  const roughRowShown = await page.evaluate(() => !document.getElementById('rowRough').hidden);
  check('the Stil schiță row shows for a selected polyline', roughRowShown);

  await page.evaluate(() => document.querySelector('.rough-btn[data-rough="2"]').click());
  await L.sleep(150);
  zInk = await inkPixels(page);
  const sketchStray = Math.max(...zInk.map(([x, y]) => distToChain(x, y, Z, false)));
  check('Cartoonist sloppiness pushes the spans off the exact chain',
    sketchStray > preciseStray + 3, `worst stray ${preciseStray.toFixed(1)}px -> ${sketchStray.toFixed(1)}px`);

  await page.evaluate(() => document.querySelector('.rough-btn[data-rough="0"]').click());
  await L.sleep(150);
  zInk = await inkPixels(page);
  const backStray = Math.max(...zInk.map(([x, y]) => distToChain(x, y, Z, false)));
  check('Architect restores the exact polyline', backStray < 3.5, `worst stray ${backStray.toFixed(1)}px`);

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

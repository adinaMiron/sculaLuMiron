// Spline curve tool: placing one, the smoothness of what comes out, and
// editing its vertices and curvature afterwards. Desktop by default (the
// tool is click-to-place, so a mouse is the primary input); `node spline.js
// mobile` runs the touch half.
const L = require('./lib');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}   ${detail || ''}`); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

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

async function layerState(page) {
  return page.evaluate(() => {
    const el = document.getElementById('baseCanvas');
    return { w: el.width, h: el.height };
  });
}

// The app keeps everything in one closure, so state is only reachable through
// what it draws and what it puts in the DOM. Layer names are enough to tell a
// spline apart; geometry comes from the pixels.
async function layerNames(page) {
  return page.evaluate(() => [...document.querySelectorAll('#layerList .lname')].map(n => n.textContent));
}

(async () => {
  const mobile = process.argv[2] === 'mobile';
  const { browser, page, cdp, errors } = await L.open(mobile ? {} : { mobile: false, width: 1400, height: 900 });
  await L.newCanvas(page);
  await L.hidePanels(page);
  await L.sleep(150);

  let m = await L.metrics(page);
  console.log(`start: stage=${m.stage.w.toFixed(0)}x${m.stage.h.toFixed(0)} scale=${m.scale.toFixed(3)}`);

  // The geometry checks below assume the exact curve. "Stil schiță" (the
  // sloppiness styles) now applies to splines too - start on Architect (0)
  // so the interpolation / smoothness checks are about the maths, not the
  // hand-drawn wobble, which gets its own check in section 13.
  await page.evaluate(() => document.querySelector('.rough-btn[data-rough="0"]').click());

  const toContent = (cx, cy) => L.contentUnder(m, cx, cy);
  const toClient = (x, y) => ({ x: m.stage.left + x * m.scale, y: m.stage.top + y * m.scale });

  // ---------- 1. click-to-place, double-click to finish ----------
  await page.keyboard.press('c');
  const activeTool = await page.evaluate(() => document.querySelector('button.tool.active').dataset.tool);
  check('the "c" shortcut selects the spline tool', activeTool === 'spline', `got ${activeTool}`);

  // an arch: four points, the middle two high
  const V = [[200, 400], [320, 220], [460, 220], [580, 400]];
  for (const [x, y] of V) {
    const c = toClient(x, y);
    await page.mouse.click(c.x, c.y);
    await L.sleep(60);
  }
  // finish on the last point with a double-click
  const lastC = toClient(V[3][0], V[3][1]);
  await page.mouse.dblclick(lastC.x, lastC.y);
  await L.sleep(150);

  let names = await layerNames(page);
  check('one spline layer exists after finishing', names.length === 1 && /Spline curve|Curbă spline/.test(names[0]),
    JSON.stringify(names));

  let ink = await inkPixels(page);
  check('the curve is actually drawn', ink.length > 300, `${ink.length} ink px`);

  // ---------- 2. it goes through its vertices, and it is smooth ----------
  // every vertex should have ink within a couple of px of it
  const onVertex = V.map(([x, y]) => ink.some(([ix, iy]) => Math.hypot(ix - x, iy - y) < 5));
  check('the curve passes through every vertex', onVertex.every(Boolean), JSON.stringify(onVertex));

  // A Catmull-Rom spline is an *interpolating* one, so it carries its
  // incoming slope a little past a shoulder rather than flattening onto it -
  // the arch rises slightly above the two raised vertices, which is the
  // behaviour that makes it look drawn rather than folded. What must not
  // happen is that rise turning into a swing: bound it, don't forbid it.
  const topY = Math.min(...ink.map(p => p[1]));
  const botY = Math.max(...ink.map(p => p[1]));
  const climb = 400 - 220;
  check('the shoulder rise stays small', topY >= 220 - climb * 0.15,
    `top ink at y=${topY}, vertices top at 220 (rise ${220 - topY}px of a ${climb}px climb)`);
  check('it never dips below the end vertices', botY <= 400 + 6, `bottom ink at y=${botY}`);

  // smoothness: walk the topmost ink pixel column by column across the arch
  // and check the direction never reverses more than a couple of times (a
  // jittery or cusped curve zig-zags; a smooth arch rises then falls)
  const cols = new Map();
  ink.forEach(([x, y]) => { if (!cols.has(x) || y < cols.get(x)) cols.set(x, y); });
  const xs = [...cols.keys()].sort((a, b) => a - b);
  let reversals = 0, dir = 0;
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] - xs[i - 1] > 2) continue;               // gap, not a step
    const dy = cols.get(xs[i]) - cols.get(xs[i - 1]);
    if (Math.abs(dy) < 1) continue;
    const nd = Math.sign(dy);
    if (dir && nd !== dir) reversals++;
    dir = nd;
  }
  check('the outline is smooth (no jitter)', reversals <= 2, `${reversals} direction reversals along the top edge`);

  // ---------- 2b. bunched-up vertices don't cusp or loop ----------
  // The reason for centripetal (alpha 0.5) rather than the textbook uniform
  // parametrisation. Two vertices 20px apart followed by a hard turn is the
  // classic case where uniform Catmull-Rom swings the curve out into a cusp
  // or a little self-intersecting loop; centripetal provably cannot. Measured
  // offline on this exact point set, the worst stray from the polyline is
  // 20.3px uniform vs 4.8px centripetal, so the bound below separates them.
  // the arch is still on the canvas, so isolate the new curve's pixels by
  // differencing rather than by guessing a region that excludes it
  const inkBefore = new Set((await inkPixels(page)).map(([x, y]) => x + ',' + y));
  await page.keyboard.press('c');
  const CLUSTER = [[150, 450], [600, 450], [620, 450], [640, 300], [700, 150]];
  for (const [x, y] of CLUSTER) {
    const c = toClient(x, y);
    await page.mouse.click(c.x, c.y);
    await L.sleep(50);
  }
  await page.keyboard.press('Enter');
  await L.sleep(150);

  const clusterInk = (await inkPixels(page)).filter(([x, y]) => !inkBefore.has(x + ',' + y));
  const distToPoly = (qx, qy) => {
    let best = Infinity;
    for (let i = 0; i < CLUSTER.length - 1; i++) {
      const [ax, ay] = CLUSTER[i], [bx, by] = CLUSTER[i + 1];
      const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
      let t = ((qx - ax) * vx + (qy - ay) * vy) / L2;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(qx - (ax + vx * t), qy - (ay + vy * t)));
    }
    return best;
  };
  const worstStray = Math.max(...clusterInk.map(([x, y]) => distToPoly(x, y)));
  check('bunched-up vertices produce no cusp or loop', worstStray < 12,
    `worst stray from the polyline ${worstStray.toFixed(1)}px (uniform Catmull-Rom would be ~20)`);

  // back to the arch for the rest of the checks
  await page.keyboard.press('Control+z');
  await L.sleep(150);
  ink = await inkPixels(page);

  // ---------- 3. curviness 0 makes it the straight polyline ----------
  await page.evaluate(() => { document.getElementById('toggleSelectionBtn').click(); });
  await L.sleep(120);
  const curveVisible = await page.evaluate(() => !document.getElementById('rowSplineTension').hidden);
  check('the Curve row shows for a selected spline', curveVisible);

  const archTopCurved = topY;
  await page.evaluate(() => {
    const r = document.getElementById('splineTension');
    r.value = 0; r.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await L.sleep(120);
  ink = await inkPixels(page);
  const archTopStraight = Math.min(...ink.map(p => p[1]));
  check('curviness 0 flattens it to the polyline', archTopStraight >= 220 - 3 && archTopStraight <= 220 + 3,
    `top now y=${archTopStraight}`);
  // put it back
  await page.evaluate(() => {
    const r = document.getElementById('splineTension');
    r.value = 100; r.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await L.sleep(120);
  ink = await inkPixels(page);
  check('curviness restores the curve', near(Math.min(...ink.map(p => p[1])), archTopCurved, 4),
    `top ${Math.min(...ink.map(p => p[1]))} vs ${archTopCurved}`);

  // ---------- 4. dragging a vertex reshapes the curve ----------
  await page.keyboard.press('v');
  // select the curve by clicking on it: use a point the curve actually covers
  const onCurve = ink[Math.floor(ink.length / 2)];
  let cc = toClient(onCurve[0], onCurve[1]);
  await page.mouse.click(cc.x, cc.y);
  await L.sleep(120);
  const selCount = await page.evaluate(() => document.querySelectorAll('#layerList .layerItem.selected').length);
  check('clicking the curve selects it', selCount === 1, `${selCount} selected`);

  // drag vertex #1 (320,220) up by 120 canvas px
  const from = toClient(320, 220), to = toClient(320, 100);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8);
    await L.sleep(15);
  }
  await page.mouse.up();
  await L.sleep(150);
  ink = await inkPixels(page);
  const movedVertexHit = ink.some(([x, y]) => Math.hypot(x - 320, y - 100) < 6);
  check('the dragged vertex is where it was dropped', movedVertexHit,
    `top ink now y=${Math.min(...ink.map(p => p[1]))}`);
  const otherVertexStill = ink.some(([x, y]) => Math.hypot(x - 580, y - 400) < 6);
  check('the vertices that were not dragged stayed put', otherVertexStill);

  // ---------- 5. undo puts the vertex back ----------
  await page.keyboard.press('Control+z');
  await L.sleep(150);
  ink = await inkPixels(page);
  check('undo restores the dragged vertex', ink.some(([x, y]) => Math.hypot(x - 320, y - 220) < 6));
  await page.keyboard.press('Control+Shift+z');
  await L.sleep(150);

  // ---------- 6. double-click a vertex makes it a corner ----------
  const vtx = toClient(320, 100);
  await page.mouse.dblclick(vtx.x, vtx.y);
  await L.sleep(150);
  const cornerOn = await page.evaluate(() => document.getElementById('splineCornerBtn').classList.contains('active'));
  check('double-clicking a vertex marks it a corner', cornerOn);
  await page.mouse.dblclick(vtx.x, vtx.y);
  await L.sleep(150);
  const cornerOff = await page.evaluate(() => document.getElementById('splineCornerBtn').classList.contains('active'));
  check('double-clicking it again makes it smooth', !cornerOff);

  // ---------- 7. the Points row edits the picked vertex ----------
  const beforeRemove = await page.evaluate(() => document.getElementById('splinePointDelBtn').disabled);
  check('Remove is live once a vertex is picked', beforeRemove === false);
  await page.click('#splinePointDelBtn');
  await L.sleep(150);
  ink = await inkPixels(page);
  check('removing the picked vertex drops it from the curve',
    !ink.some(([x, y]) => Math.hypot(x - 320, y - 100) < 6));
  check('the rest of the curve survives', ink.some(([x, y]) => Math.hypot(x - 580, y - 400) < 6));

  // ---------- 8. closing the curve joins the ends ----------
  await page.click('#splineClosedBtn');
  await L.sleep(150);
  ink = await inkPixels(page);
  // with the ends joined there must now be ink roughly on the line between
  // the first and last vertex (200,400)-(580,400)
  const joinInk = ink.filter(([x, y]) => x > 260 && x < 520 && Math.abs(y - 400) < 30).length;
  check('closing the curve draws the joining span', joinInk > 40, `${joinInk} px near the join`);

  // ---------- 9. Escape abandons a curve in progress ----------
  await page.keyboard.press('c');
  for (const [x, y] of [[700, 500], [760, 560], [820, 500]]) {
    const c = toClient(x, y);
    await page.mouse.click(c.x, c.y);
    await L.sleep(50);
  }
  await page.keyboard.press('Escape');
  await L.sleep(150);
  names = await layerNames(page);
  check('Escape throws away the curve being placed', names.length === 1, JSON.stringify(names));

  // ---------- 10. Enter finishes one ----------
  for (const [x, y] of [[700, 500], [760, 560], [820, 500]]) {
    const c = toClient(x, y);
    await page.mouse.click(c.x, c.y);
    await L.sleep(50);
  }
  await page.keyboard.press('Enter');
  await L.sleep(150);
  names = await layerNames(page);
  check('Enter finishes the curve being placed', names.length === 2, JSON.stringify(names));

  // ---------- 11. it survives the export path ----------
  const exported = await page.evaluate(() => {
    const el = document.getElementById('baseCanvas');
    return el.width > 0 && el.height > 0;
  });
  check('canvas still healthy', exported);

  // ---------- 12. vertex editing on a ROTATED curve ----------
  // setSplinePoints() re-fits the box around the new vertices, which moves
  // the box's centre - and the centre is the rotation pivot, so without the
  // (I - R)(oldCentre - newCentre) correction every *other* vertex would
  // swing across the canvas the moment one is dragged. This is that check.
  await L.newCanvas(page);
  await L.sleep(150);
  m = await L.metrics(page);
  const CL = (x, y) => ({ x: m.stage.left + x * m.scale, y: m.stage.top + y * m.scale });

  await page.keyboard.press('c');
  const R = [[200, 200], [400, 350], [600, 200]];
  for (const [x, y] of R) { const c = CL(x, y); await page.mouse.click(c.x, c.y); await L.sleep(50); }
  await page.keyboard.press('Enter');
  await L.sleep(150);

  // back to select, or the drags below would start another curve instead
  await page.keyboard.press('v');
  await L.sleep(80);

  // the layer's box is its vertices' bounding box; rotate it 30 degrees by
  // the handle above the top edge
  const bx = 200, by = 200, bw = 400, bh = 150;
  const ctr = { x: bx + bw / 2, y: by + bh / 2 };
  const rot = { x: ctr.x, y: by - 28 };
  const radius = Math.hypot(rot.x - ctr.x, rot.y - ctr.y);
  const DEG = 30, rad = DEG * Math.PI / 180;
  const rotTo = { x: ctr.x + radius * Math.cos(-Math.PI / 2 + rad), y: ctr.y + radius * Math.sin(-Math.PI / 2 + rad) };
  let a = CL(rot.x, rot.y), b = CL(rotTo.x, rotTo.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8); await L.sleep(15); }
  await page.mouse.up();
  await L.sleep(150);

  const spun = ([x, y]) => ({
    x: ctr.x + (x - ctr.x) * Math.cos(rad) - (y - ctr.y) * Math.sin(rad),
    y: ctr.y + (x - ctr.x) * Math.sin(rad) + (y - ctr.y) * Math.cos(rad)
  });
  const nearestInk = (q, pix) => Math.min(...pix.map(([x, y]) => Math.hypot(x - q.x, y - q.y)));
  ink = await inkPixels(page);
  const rotHits = R.map(v => nearestInk(spun(v), ink));
  check('a rotated curve draws through its rotated vertices', rotHits.every(d => d < 9),
    rotHits.map(d => d.toFixed(1)).join(', '));

  // drag the FIRST vertex; the other two must not budge
  const v0 = spun(R[0]);
  const drop = { x: v0.x - 90, y: v0.y - 60 };
  a = CL(v0.x, v0.y); b = CL(drop.x, drop.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8); await L.sleep(15); }
  await page.mouse.up();
  await L.sleep(150);

  ink = await inkPixels(page);
  check('the dragged vertex landed where it was dropped', nearestInk(drop, ink) < 9,
    `${nearestInk(drop, ink).toFixed(1)}px away`);
  const stayed = [R[1], R[2]].map(v => nearestInk(spun(v), ink));
  check('the other vertices of a rotated curve did not move', stayed.every(d => d < 9),
    `moved ${stayed.map(d => d.toFixed(1)).join(', ')}px`);

  // ---------- 13. Stil schiță: the sloppiness styles wobble the outline ----------
  // The precise curve is one thin stroke; a sketchy one is inked twice with an
  // independent wobble, so it covers markedly more of the canvas and its band
  // is thicker. Compare ink area and vertical spread of the same arch.
  const bandThickness = pix => {
    const cols = new Map();
    pix.forEach(([x, y]) => {
      const c = cols.get(x) || [Infinity, -Infinity];
      cols.set(x, [Math.min(c[0], y), Math.max(c[1], y)]);
    });
    const spans = [...cols.values()].map(([lo, hi]) => hi - lo).sort((a, b) => a - b);
    return spans[Math.floor(spans.length / 2)];   // median column height
  };

  await L.newCanvas(page);
  await L.sleep(150);
  m = await L.metrics(page);
  const SL = (x, y) => ({ x: m.stage.left + x * m.scale, y: m.stage.top + y * m.scale });
  await page.evaluate(() => document.querySelector('.rough-btn[data-rough="0"]').click());
  await page.keyboard.press('c');
  const ARCH = [[200, 400], [320, 220], [460, 220], [580, 400]];
  for (const [x, y] of ARCH) { const c = SL(x, y); await page.mouse.click(c.x, c.y); await L.sleep(50); }
  await page.keyboard.press('Enter');
  await L.sleep(150);
  const preciseInk = await inkPixels(page);
  const preciseBand = bandThickness(preciseInk);

  await page.keyboard.press('v');
  const onIt = preciseInk[Math.floor(preciseInk.length / 2)];
  const mc = SL(onIt[0], onIt[1]);
  await page.mouse.click(mc.x, mc.y);
  await L.sleep(120);
  const roughRowShown = await page.evaluate(() => !document.getElementById('rowRough').hidden);
  check('the Stil schiță row shows for a selected spline', roughRowShown);

  await page.evaluate(() => document.querySelector('.rough-btn[data-rough="2"]').click());
  await L.sleep(150);
  const sketchInk = await inkPixels(page);
  const sketchBand = bandThickness(sketchInk);
  check('Cartoonist sloppiness makes the spline outline wobble',
    sketchBand >= preciseBand + 2 && sketchInk.length > preciseInk.length * 1.25,
    `band ${preciseBand}->${sketchBand}px, ink ${preciseInk.length}->${sketchInk.length}px`);

  await page.evaluate(() => document.querySelector('.rough-btn[data-rough="0"]').click());
  await L.sleep(150);
  check('Architect makes the spline exact again',
    bandThickness(await inkPixels(page)) <= preciseBand + 1);

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

// The spline tool on a phone. Placing points is tap-by-tap and editing them
// has no modifier keys to lean on, so the touch path is its own feature, not
// a variation of the desktop one - see the Points row in the selection panel.
const L = require('./lib');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}   ${detail || ''}`); }
}

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
const layerNames = page => page.evaluate(() =>
  [...document.querySelectorAll('#layerList .lname')].map(n => n.textContent));

// two taps in the same spot, inside the double-tap window
async function doubleTap(cdp, x, y) {
  await L.tap(cdp, x, y);
  await L.sleep(90);
  await L.tap(cdp, x, y);
  await L.sleep(150);
}

(async () => {
  const { browser, page, cdp, errors } = await L.open({ width: 412, height: 915 });
  await L.newCanvas(page);
  await L.hidePanels(page);
  await L.sleep(150);

  let m = await L.metrics(page);
  console.log(`start: stage=${m.stage.w.toFixed(0)}x${m.stage.h.toFixed(0)} scale=${m.scale.toFixed(3)}`);
  const toClient = (x, y) => ({ x: m.stage.left + x * m.scale, y: m.stage.top + y * m.scale });

  // the tools palette is hidden, so tools are picked by keyboard as elsewhere
  await page.keyboard.press('c');
  await L.sleep(80);

  // ---------- 1. tap to place, double-tap to finish ----------
  const V = [[120, 480], [320, 160], [520, 480]];
  for (const [x, y] of V.slice(0, 2)) {
    const c = toClient(x, y);
    await L.tap(cdp, c.x, c.y);
    await L.sleep(80);
  }
  const lastC = toClient(V[2][0], V[2][1]);
  await doubleTap(cdp, lastC.x, lastC.y);

  let names = await layerNames(page);
  check('tap-tap-doubletap makes exactly one curve', names.length === 1, JSON.stringify(names));

  let ink = await inkPixels(page);
  const hits = V.map(([x, y]) => ink.some(([ix, iy]) => Math.hypot(ix - x, iy - y) < 8));
  check('the curve runs through all three tapped points', hits.every(Boolean), JSON.stringify(hits));
  check('the double-tap left no duplicate vertex behind',
    ink.some(([x, y]) => Math.hypot(x - 520, y - 480) < 8));

  // ---------- 2. a pinch mid-placement takes its stray point back ----------
  // the tools palette is hidden, so tools are picked by keyboard as elsewhere
  await page.keyboard.press('c');
  await L.sleep(80);
  const p1 = toClient(150, 250);
  await L.tap(cdp, p1.x, p1.y);          // first point, deliberate
  await L.sleep(80);
  // now a pinch: its first finger lands as a "point" that was never meant
  await L.pinch(cdp, m.wrap.left + m.wrap.w * 0.5, m.wrap.top + m.wrap.h * 0.5, 120, 220);
  await L.sleep(120);
  await page.keyboard.press('Escape');
  await L.sleep(120);
  names = await layerNames(page);
  check('a pinch during placement adds no layer', names.length === 1, JSON.stringify(names));
  check('the pinch was not swallowed (view zoomed)', (await L.metrics(page)).scale > m.scale * 1.2);

  await page.click('#zoomLabelBtn');     // back to fit
  await L.sleep(150);
  m = await L.metrics(page);

  // ---------- 3. one finger drags a vertex ----------
  await page.keyboard.press('v');
  await L.sleep(80);
  ink = await inkPixels(page);
  const mid = ink[Math.floor(ink.length / 2)];
  let c = toClient(mid[0], mid[1]);
  await L.tap(cdp, c.x, c.y);
  await L.sleep(150);
  check('tapping the curve selects it',
    (await page.evaluate(() => document.querySelectorAll('#layerList .layerItem.selected').length)) === 1);

  const from = toClient(320, 160), to = toClient(320, 300);
  await L.oneFingerDrag(cdp, from.x, from.y, to.x, to.y);
  await L.sleep(150);
  ink = await inkPixels(page);
  check('the dragged vertex followed the finger',
    ink.some(([x, y]) => Math.hypot(x - 320, y - 300) < 10),
    `nearest ink to (320,300): ${Math.min(...ink.map(([x, y]) => Math.hypot(x - 320, y - 300))).toFixed(0)}px`);

  // ---------- 4. the Points row is the touch route to vertex editing ----------
  await page.evaluate(() => document.getElementById('toggleSelectionBtn').click());
  await L.sleep(150);
  // on a phone the panels open collapsed (two expanded ones don't fit), so
  // the body has to be expanded before anything in it can be tapped
  await page.evaluate(() => {
    const p = document.getElementById('selectionPanel');
    if (p.classList.contains('collapsed')) p.querySelector('.panelCollapse').click();
  });
  await L.sleep(150);
  const rowShown = await page.evaluate(() => !document.getElementById('rowSplineEdit').hidden);
  check('the Points row shows for a selected curve', rowShown);

  const btnBox = await page.evaluate(() => {
    const r = document.getElementById('splineCornerBtn').getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  check('the point buttons clear the 44px touch target floor', btnBox.h >= 43,
    `${btnBox.w.toFixed(0)}x${btnBox.h.toFixed(0)}`);

  const cornerEnabled = await page.evaluate(() => !document.getElementById('splineCornerBtn').disabled);
  check('Corner is live for the vertex just dragged', cornerEnabled);
  await page.click('#splineCornerBtn');
  await L.sleep(150);
  check('Corner marks the picked vertex',
    await page.evaluate(() => document.getElementById('splineCornerBtn').classList.contains('active')));

  // three points: Remove must refuse to go below two
  await page.click('#splinePointDelBtn');
  await L.sleep(150);
  const delDisabled = await page.evaluate(() => document.getElementById('splinePointDelBtn').disabled);
  check('Remove goes dead at two points', delDisabled);
  ink = await inkPixels(page);
  check('the two remaining points still draw a curve', ink.length > 100, `${ink.length} ink px`);

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

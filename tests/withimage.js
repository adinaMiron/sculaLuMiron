// The same gestures on a real loaded image, landscape and portrait, so the
// fit scale and the pan clamp are exercised on both aspect ratios.
const L = require('./lib');
const path = require('path');

let pass = 0, fail = 0;
const check = (n, c, d) => { c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}   ${d || ''}`)); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function run(page, cdp, file, label) {
  console.log(`-- ${label} --`);
  await page.setInputFiles('#fileInput', path.join(__dirname, 'fixtures', file));
  await L.sleep(400);
  await L.hidePanels(page);
  let m = await L.metrics(page);
  console.log(`   loaded ${m.natural.w}x${m.natural.h}, shown at ${m.zoomLabel} (${m.stage.w.toFixed(0)}x${m.stage.h.toFixed(0)})`);
  check(`${label}: fits inside the viewport on load`,
    m.stage.w <= m.wrap.w + 1 && m.stage.h <= m.wrap.h + 1, `${m.stage.w.toFixed(0)}x${m.stage.h.toFixed(0)} in ${m.wrap.w.toFixed(0)}x${m.wrap.h.toFixed(0)}`);
  check(`${label}: centred on load`, near(m.stage.left + m.stage.w / 2, m.wrap.left + m.wrap.w / 2, 2), 'not centred');

  const FIT = m.scale;
  const cx = m.wrap.left + m.wrap.w * 0.4, cy = m.wrap.top + m.wrap.h * 0.45;
  const a0 = L.contentUnder(m, cx, cy);
  await L.pinch(cdp, cx, cy, 100, 250, 14);
  m = await L.metrics(page);
  const a1 = L.contentUnder(m, cx, cy);
  check(`${label}: pinch zooms 2.5x`, near(m.scale / FIT, 2.5, 0.35), `${(m.scale / FIT).toFixed(2)}x`);
  // tolerance scales with the image: the anchor is measured in image pixels
  const tol = Math.max(15, m.natural.w / 60);
  check(`${label}: pinched spot stays put`, Math.hypot(a1.x - a0.x, a1.y - a0.y) < tol,
    `drifted ${Math.hypot(a1.x - a0.x, a1.y - a0.y).toFixed(0)} of ${m.natural.w} px`);

  const m0 = await L.metrics(page);
  await L.twoFingerPan(cdp, m0.wrap.left + m0.wrap.w / 2, m0.wrap.top + m0.wrap.h / 2, -80, 60);
  m = await L.metrics(page);
  check(`${label}: two-finger pan follows exactly`,
    near(m.stage.left - m0.stage.left, -80, 10) && near(m.stage.top - m0.stage.top, 60, 10),
    `moved ${(m.stage.left - m0.stage.left).toFixed(0)},${(m.stage.top - m0.stage.top).toFixed(0)}`);

  await page.keyboard.press('r');
  m = await L.metrics(page);
  const p0 = L.visiblePoint(m, 0.3, 0.3);
  await L.oneFingerDrag(cdp, p0.x, p0.y, p0.x + 80, p0.y + 60);
  m = await L.metrics(page);
  check(`${label}: shape drawn after zoom + pan`, m.layers === 1, `layers=${m.layers}`);
  const px = await page.evaluate(({ x, y }) => {
    const c = document.getElementById('baseCanvas'), r = c.getBoundingClientRect();
    const ix = Math.round((x - r.left) / r.width * c.width), iy = Math.round((y - r.top) / r.height * c.height);
    const d = c.getContext('2d').getImageData(ix, iy, 1, 1).data;
    return [...d];
  }, { x: p0.x, y: p0.y });
  check(`${label}: it landed under the finger`, px[3] > 0 && px[0] < 150 && px[1] < 150, `pixel ${px}`);

  await page.keyboard.press('t');
  const tp = L.visiblePoint(m, 0.5, 0.5);
  await L.tap(cdp, tp.x, tp.y);
  check(`${label}: text editor opens after zoom + pan`, (await L.metrics(page)).hasEditor);
  await page.keyboard.type('Ăsta-i textul');
  await page.evaluate(() => { const t = document.getElementById('textEditArea'); if (t) t.blur(); });
  await L.sleep(150);
  m = await L.metrics(page);
  check(`${label}: text layer added`, m.layers === 2 && /Ăsta/.test(m.layerNames.join(' ')), `[${m.layerNames}]`);
}

(async () => {
  const { browser, page, cdp, errors } = await L.open({ mobile: true });
  await run(page, cdp, 'land.png', 'landscape 1600x1000');
  await page.reload();
  await L.sleep(200);
  await run(page, cdp, 'port.png', 'portrait 900x1600');
  console.log(errors.length ? 'JS errors:\n' + errors.join('\n') : 'no JS errors');
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });

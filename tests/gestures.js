// The awkward gestures: pinch while sliding, pinch at an angle, pinch on the
// padding, a third finger, lifting one finger of two, the zoom limits, and
// whether what gets drawn lands under the finger that drew it.
const L = require('./lib');

let pass = 0, fail = 0;
const check = (n, c, d) => { c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}   ${d || ''}`)); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// colour of the base canvas at a screen point
const pixelAt = (page, x, y) => page.evaluate(({ x, y }) => {
  const c = document.getElementById('baseCanvas');
  const r = c.getBoundingClientRect();
  const px = Math.round((x - r.left) / r.width * c.width);
  const py = Math.round((y - r.top) / r.height * c.height);
  if (px < 0 || py < 0 || px >= c.width || py >= c.height) return null;
  return [...c.getContext('2d').getImageData(px, py, 1, 1).data];
}, { x, y });
const isInk = p => p && p[3] > 0 && (p[0] < 200 || p[1] < 200 || p[2] < 200);

(async () => {
  const { browser, page, cdp, errors } = await L.open({ mobile: true });
  const reset = async () => {
    await page.reload();
    await L.newCanvas(page);
    await L.hidePanels(page);
    await L.sleep(120);
  };
  await reset();
  let m = await L.metrics(page);
  const FIT = m.scale;   // fit-to-window scale for this viewport; zoom multiplies it

  // ---------- 1. pinch that zooms and slides at the same time ----------
  const cx = m.wrap.left + m.wrap.w * 0.5, cy = m.wrap.top + m.wrap.h * 0.45;
  const anchor0 = L.contentUnder(m, cx, cy);
  await page.evaluate(() => { }); // flush
  {
    const pts = (x, y, g) => ([{ id: 1, x: x - g / 2, y }, { id: 2, x: x + g / 2, y }]);
    await L.touch(cdp, 'touchStart', pts(cx, cy, 90));
    await L.sleep(20);
    for (let i = 1; i <= 12; i++) {
      await L.touch(cdp, 'touchMove', pts(cx + 60 * i / 12, cy - 45 * i / 12, 90 + 110 * i / 12));
      await L.sleep(14);
    }
    await L.touch(cdp, 'touchEnd', []);
    await L.sleep(60);
  }
  m = await L.metrics(page);
  const anchor1 = L.contentUnder(m, cx + 60, cy - 45);
  check('zoom+slide in one gesture keeps the anchor under the fingers',
    Math.hypot(anchor1.x - anchor0.x, anchor1.y - anchor0.y) < 12,
    `drifted ${Math.hypot(anchor1.x - anchor0.x, anchor1.y - anchor0.y).toFixed(1)}`);
  check('...and it zoomed', near(m.scale / FIT, 200 / 90, 0.3), `scale ${m.scale.toFixed(2)}`);

  // ---------- 2. pinch at an angle ----------
  await reset();
  m = await L.metrics(page);
  const dx = m.wrap.left + m.wrap.w * 0.45, dy = m.wrap.top + m.wrap.h * 0.5;
  const a0 = L.contentUnder(m, dx, dy);
  await L.pinch(cdp, dx, dy, 100, 200, 12, Math.PI / 4);
  m = await L.metrics(page);
  const a1 = L.contentUnder(m, dx, dy);
  check('diagonal pinch zooms 2x', near(m.scale / FIT, 2, 0.25), `${(m.scale / FIT).toFixed(2)}x`);
  check('diagonal pinch keeps its anchor', Math.hypot(a1.x - a0.x, a1.y - a0.y) < 12,
    `drifted ${Math.hypot(a1.x - a0.x, a1.y - a0.y).toFixed(1)}`);

  // ---------- 3. pinch on the checkered padding beside the image ----------
  await reset();
  m = await L.metrics(page);
  const padY = m.stage.top - 40 > m.wrap.top ? m.stage.top - 40 : m.stage.top + m.stage.h + 40;
  const onPadding = padY > m.wrap.top && padY < m.wrap.top + m.wrap.h;
  if (onPadding) {
    const s0 = m.scale;
    await L.pinch(cdp, m.wrap.left + m.wrap.w / 2, padY, 100, 200, 12);
    m = await L.metrics(page);
    check('pinch on the padding zooms the canvas', near(m.scale / s0, 2, 0.25), `${(m.scale / s0).toFixed(2)}x`);
  } else {
    console.log('  SKIP  padding pinch (no padding visible)');
  }

  // ---------- 4. one finger on the padding pans ----------
  m = await L.metrics(page);
  const px = m.wrap.left + 20, py = m.wrap.top + 20;
  const overImage = px > m.stage.left && py > m.stage.top && px < m.stage.left + m.stage.w && py < m.stage.top + m.stage.h;
  const m0 = m;
  await L.oneFingerDrag(cdp, px, py, px + 60, py + 45);
  m = await L.metrics(page);
  if (!overImage) {
    check('one finger on the padding pans', near(m.stage.left - m0.stage.left, 60, 8) && near(m.stage.top - m0.stage.top, 45, 8),
      `moved ${(m.stage.left - m0.stage.left).toFixed(0)},${(m.stage.top - m0.stage.top).toFixed(0)}`);
    check('...and it did not draw anything', m.layers === 0, `layers=${m.layers}`);
  } else {
    console.log('  SKIP  padding drag (that corner is over the image)');
  }

  // ---------- 5. a third finger, then back to two ----------
  await reset();
  m = await L.metrics(page);
  {
    const c = { x: m.wrap.left + m.wrap.w / 2, y: m.wrap.top + m.wrap.h / 2 };
    const s0 = m.scale;
    await L.touch(cdp, 'touchStart', [{ id: 1, x: c.x - 50, y: c.y }, { id: 2, x: c.x + 50, y: c.y }]);
    await L.sleep(20);
    await L.touch(cdp, 'touchMove', [{ id: 1, x: c.x - 70, y: c.y }, { id: 2, x: c.x + 70, y: c.y }]);
    await L.sleep(20);
    // a palm lands as a third point
    await L.touch(cdp, 'touchStart', [{ id: 1, x: c.x - 70, y: c.y }, { id: 2, x: c.x + 70, y: c.y }, { id: 3, x: c.x, y: c.y + 90 }]);
    await L.sleep(20);
    for (let i = 1; i <= 6; i++) {
      const g = 140 + i * 15;
      await L.touch(cdp, 'touchMove', [{ id: 1, x: c.x - g / 2, y: c.y }, { id: 2, x: c.x + g / 2, y: c.y }, { id: 3, x: c.x, y: c.y + 90 }]);
      await L.sleep(14);
    }
    await L.touch(cdp, 'touchEnd', []);
    await L.sleep(60);
    m = await L.metrics(page);
    check('a third finger does not break the pinch', m.scale > s0 * 1.2 && m.layers === 0,
      `scale ${s0.toFixed(2)} -> ${m.scale.toFixed(2)}, layers=${m.layers}`);
  }

  // ---------- 6. lifting one finger of a pinch pans, it does not draw ----------
  await reset();
  await page.keyboard.press('r');
  m = await L.metrics(page);
  {
    const c = { x: m.wrap.left + m.wrap.w / 2, y: m.wrap.top + m.wrap.h / 2 };
    await L.touch(cdp, 'touchStart', [{ id: 1, x: c.x - 60, y: c.y }, { id: 2, x: c.x + 60, y: c.y }]);
    await L.sleep(20);
    await L.touch(cdp, 'touchMove', [{ id: 1, x: c.x - 90, y: c.y }, { id: 2, x: c.x + 90, y: c.y }]);
    await L.sleep(20);
    // CDP can only end all points at once, so model the lift as a cancel of
    // one pointer straight from the page
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, pointerType: 'touch', clientX: 0, clientY: 0, bubbles: true }));
    });
    await L.touch(cdp, 'touchEnd', []);
    await L.sleep(60);
  }
  m = await L.metrics(page);
  check('a pinch never leaves a stray shape behind', m.layers === 0, `layers=${m.layers}`);

  // ---------- 7. what is drawn lands under the finger ----------
  await reset();
  await L.pinch(cdp, (await L.metrics(page)).wrap.left + 150, (await L.metrics(page)).wrap.top + 250, 90, 230);
  await L.twoFingerPan(cdp, 200, 400, -60, 70);
  await page.keyboard.press('r');
  m = await L.metrics(page);
  const start = L.visiblePoint(m, 0.25, 0.25);
  const ax = start.x, ay = start.y;
  await L.oneFingerDrag(cdp, ax, ay, ax + 70, ay + 60);
  m = await L.metrics(page);
  check('shape added after zoom + pan', m.layers === 1, `layers=${m.layers}`);
  const corner = await pixelAt(page, ax, ay);
  const middle = await pixelAt(page, ax + 35, ay + 30);
  check('its outline is under the finger that started the drag', isInk(corner), `pixel ${corner}`);
  check('its inside is not filled', middle && !isInk(middle), `pixel ${middle}`);

  // ---------- 8. text lands under the tap, and can be reopened by double-tap ----------
  await page.keyboard.press('t');
  const tp = L.visiblePoint(m, 0.55, 0.6);
  const tx = tp.x, ty = tp.y;
  await L.tap(cdp, tx, ty);
  check('tap with the text tool opens an editor', (await L.metrics(page)).hasEditor);
  await page.keyboard.type('Șerpi');
  await page.evaluate(() => document.getElementById('textEditArea').blur());
  await L.sleep(120);
  m = await L.metrics(page);
  check('text layer added after zoom + pan', m.layers === 2, `layers=${m.layers} [${m.layerNames}]`);
  // double-tap the same spot: it must hit the text that was just typed
  await page.keyboard.press('v');
  await L.tap(cdp, tx + 12, ty + 10);
  await L.tap(cdp, tx + 12, ty + 10);
  await L.sleep(150);
  check('double-tap reopens the text where it was placed', (await L.metrics(page)).hasEditor, 'no editor opened');
  await page.evaluate(() => { const t = document.getElementById('textEditArea'); if (t) t.blur(); });
  await L.sleep(100);

  // ---------- 9. zoom limits ----------
  await reset();
  for (let i = 0; i < 6; i++) await L.pinch(cdp, 200, 400, 60, 260, 10);
  m = await L.metrics(page);
  // the label is fitScale x zoom; the zoom multiplier itself caps at 8
  check('zoom stops at the 8x ceiling', near(m.scale, FIT * 8, 0.02), `label=${m.zoomLabel} scale=${m.scale.toFixed(3)}`);
  for (let i = 0; i < 8; i++) await L.pinch(cdp, 200, 400, 260, 60, 10);
  m = await L.metrics(page);
  check('zoom stops at the 10% floor', parseInt(m.zoomLabel, 10) <= 10 && parseInt(m.zoomLabel, 10) > 0, `label=${m.zoomLabel}`);
  check('the drawing is still on screen at the floor',
    m.stage.left + m.stage.w > m.wrap.left && m.stage.left < m.wrap.left + m.wrap.w &&
    m.stage.top + m.stage.h > m.wrap.top && m.stage.top < m.wrap.top + m.wrap.h,
    `canvas at ${m.stage.left.toFixed(0)},${m.stage.top.toFixed(0)}`);

  // ---------- 10. reset always comes back ----------
  await page.click('#zoomLabelBtn');
  await L.sleep(80);
  m = await L.metrics(page);
  check('reset recentres the drawing', near(m.stage.left + m.stage.w / 2, m.wrap.left + m.wrap.w / 2, 2) &&
    near(m.stage.top + m.stage.h / 2, m.wrap.top + m.wrap.h / 2, 2),
    `centre ${(m.stage.left + m.stage.w / 2).toFixed(0)},${(m.stage.top + m.stage.h / 2).toFixed(0)} vs ${(m.wrap.left + m.wrap.w / 2).toFixed(0)},${(m.wrap.top + m.wrap.h / 2).toFixed(0)}`);

  console.log(errors.length ? 'JS errors:\n' + errors.join('\n') : 'no JS errors');
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });

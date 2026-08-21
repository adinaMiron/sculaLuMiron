const L = require('./lib');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}   ${detail || ''}`); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

(async () => {
  const mobile = process.argv[2] !== 'desktop';
  const { browser, page, cdp, errors } = await L.open({ mobile });
  await L.newCanvas(page);
  // panels float over the canvas; get them out of the way and use the
  // keyboard shortcuts to switch tools instead
  await L.hidePanels(page);
  await L.sleep(150);

  let m = await L.metrics(page);
  console.log(`start: zoom=${m.zoomLabel} stage=${m.stage.w.toFixed(0)}x${m.stage.h.toFixed(0)} wrap=${m.wrap.w.toFixed(0)}x${m.wrap.h.toFixed(0)}`);

  // ---------- 1. pinch zoom keeps the pinched spot under the fingers ----------
  const cx = m.wrap.left + m.wrap.w * 0.35, cy = m.wrap.top + m.wrap.h * 0.40;
  const before = L.contentUnder(m, cx, cy);
  const scale0 = m.scale;
  await L.pinch(cdp, cx, cy, 100, 240);
  m = await L.metrics(page);
  const after = L.contentUnder(m, cx, cy);
  console.log(`  pinch: scale ${scale0.toFixed(3)} -> ${m.scale.toFixed(3)} (x2.4 expected), anchor ${before.x.toFixed(0)},${before.y.toFixed(0)} -> ${after.x.toFixed(0)},${after.y.toFixed(0)}`);
  check('pinch zooms ~2.4x', near(m.scale / scale0, 2.4, 0.35), `got ${(m.scale / scale0).toFixed(2)}x`);
  check('pinched spot stays under the fingers', Math.hypot(after.x - before.x, after.y - before.y) < 25,
    `drifted ${Math.hypot(after.x - before.x, after.y - before.y).toFixed(0)} canvas px`);
  check('page itself did not zoom', near(m.pageScale, 1, 0.01), `pageScale=${m.pageScale}`);

  // ---------- 2. two-finger pan follows the fingers ----------
  let m2 = await L.metrics(page);
  const px = m2.wrap.left + m2.wrap.w * 0.5, py = m2.wrap.top + m2.wrap.h * 0.5;
  const anchorBefore = L.contentUnder(m2, px, py);
  const DX = 70, DY = -60;
  await L.twoFingerPan(cdp, px, py, DX, DY);
  m = await L.metrics(page);
  const anchorAfter = L.contentUnder(m, px + DX, py + DY);
  console.log(`  pan: stage moved ${(m.stage.left - m2.stage.left).toFixed(0)},${(m.stage.top - m2.stage.top).toFixed(0)} (asked ${DX},${DY})`);
  check('pan follows the finger horizontally', near(m.stage.left - m2.stage.left, DX, 12),
    `moved ${(m.stage.left - m2.stage.left).toFixed(0)} not ${DX}`);
  check('pan follows the finger vertically', near(m.stage.top - m2.stage.top, DY, 12),
    `moved ${(m.stage.top - m2.stage.top).toFixed(0)} not ${DY}`);
  check('content under the fingers is unchanged', Math.hypot(anchorAfter.x - anchorBefore.x, anchorAfter.y - anchorBefore.y) < 12,
    `drifted ${Math.hypot(anchorAfter.x - anchorBefore.x, anchorAfter.y - anchorBefore.y).toFixed(0)}`);

  // ---------- 3. draw a rectangle after zoom+pan ----------
  await page.keyboard.press('r');
  m = await L.metrics(page);
  const inside = (fx, fy) => ({
    x: Math.max(m.wrap.left + 20, Math.min(m.wrap.left + m.wrap.w - 20, m.stage.left + m.stage.w * fx)),
    y: Math.max(m.wrap.top + 20, Math.min(m.wrap.top + m.wrap.h - 20, m.stage.top + m.stage.h * fy))
  });
  let a = inside(0.30, 0.35), b = inside(0.55, 0.60);
  await L.oneFingerDrag(cdp, a.x, a.y, b.x, b.y);
  m = await L.metrics(page);
  check('rectangle added after zoom + pan', m.layers === 1, `layers=${m.layers} [${m.layerNames}]`);

  // ---------- 4. zoom + pan again, then a text layer ----------
  await L.pinch(cdp, m.wrap.left + m.wrap.w * 0.6, m.wrap.top + m.wrap.h * 0.5, 220, 120);
  await L.twoFingerPan(cdp, m.wrap.left + m.wrap.w * 0.5, m.wrap.top + m.wrap.h * 0.5, -40, 50);
  m = await L.metrics(page);
  check('layer survived the second gesture round', m.layers === 1, `layers=${m.layers}`);

  await page.keyboard.press('t');
  const tp = inside(0.4, 0.45);
  await L.tap(cdp, tp.x, tp.y);
  m = await L.metrics(page);
  check('text tool opened an editor after zoom + pan', m.hasEditor, 'no #textEditArea');
  if (m.hasEditor) {
    await page.keyboard.type('Salut');
    await page.evaluate(() => document.getElementById('textEditArea').blur());
    await L.sleep(120);
  }
  m = await L.metrics(page);
  check('text layer added', m.layers === 2, `layers=${m.layers} [${m.layerNames}]`);

  // ---------- 5. one more zoom + pan, then an ellipse ----------
  await L.pinch(cdp, m.wrap.left + m.wrap.w * 0.4, m.wrap.top + m.wrap.h * 0.55, 110, 210);
  await L.twoFingerPan(cdp, m.wrap.left + m.wrap.w * 0.5, m.wrap.top + m.wrap.h * 0.5, 55, 35);
  await page.keyboard.press('o');
  m = await L.metrics(page);
  a = inside(0.45, 0.35); b = inside(0.70, 0.62);
  await L.oneFingerDrag(cdp, a.x, a.y, b.x, b.y);
  m = await L.metrics(page);
  check('ellipse added after the third zoom + pan', m.layers === 3, `layers=${m.layers} [${m.layerNames}]`);

  // ---------- 6. single-finger draw still works right after a pinch ----------
  await page.keyboard.press('r');
  await L.pinch(cdp, m.wrap.left + m.wrap.w * 0.5, m.wrap.top + m.wrap.h * 0.5, 200, 130);
  m = await L.metrics(page);
  a = inside(0.35, 0.30); b = inside(0.5, 0.5);
  await L.oneFingerDrag(cdp, a.x, a.y, b.x, b.y);
  m = await L.metrics(page);
  check('draw works immediately after a pinch', m.layers === 4, `layers=${m.layers}`);

  console.log(errors.length ? 'JS errors:\n' + errors.join('\n') : 'no JS errors');
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });

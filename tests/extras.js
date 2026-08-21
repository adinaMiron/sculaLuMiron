// Things around the edges of the gesture layer: the sidebar must still scroll
// with a finger, an open text editor must stay glued to its layer while the
// view moves, and a rotation / resize must not strand the drawing off-screen.
const L = require('./lib');

let pass = 0, fail = 0;
const check = (n, c, d) => { c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}   ${d || ''}`)); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

(async () => {
  const { browser, page, cdp, errors } = await L.open({ mobile: true, width: 412, height: 760 });
  await L.newCanvas(page);
  await L.hidePanels(page);
  await L.sleep(120);
  let m = await L.metrics(page);

  // ---------- draw enough layers to make the sidebar scrollable ----------
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('r');
    const p = L.visiblePoint(m, 0.2 + (i % 3) * 0.2, 0.2 + (i % 4) * 0.15);
    await L.oneFingerDrag(cdp, p.x, p.y, p.x + 40, p.y + 30, 6);
  }
  m = await L.metrics(page);
  check('twelve rectangles drawn', m.layers === 12, `layers=${m.layers}`);

  const sb = await page.evaluate(() => {
    const s = document.getElementById('layerList');   // this is the scroller, not #sidebar
    const r = s.getBoundingClientRect();
    return { top: r.top, left: r.left, w: r.width, h: r.height, scrollH: s.scrollHeight, clientH: s.clientHeight };
  });
  if (sb.scrollH > sb.clientH + 10 && sb.h > 40) {
    await L.oneFingerDrag(cdp, sb.left + sb.w / 2, sb.top + sb.h - 20, sb.left + sb.w / 2, sb.top + 20, 10);
    const scrolled = await page.evaluate(() => document.getElementById('layerList').scrollTop);
    check('the layers sidebar still scrolls with a finger', scrolled > 5, `scrollTop=${scrolled}`);
  } else {
    console.log(`  SKIP  sidebar scroll (nothing to scroll: ${sb.scrollH} vs ${sb.clientH})`);
  }

  // ---------- an open text editor follows the view ----------
  await page.keyboard.press('t');
  m = await L.metrics(page);
  const tp = L.visiblePoint(m, 0.5, 0.4);
  await L.tap(cdp, tp.x, tp.y);
  await page.keyboard.type('Ține-te');
  await page.evaluate(() => document.getElementById('textEditArea').blur());
  await L.sleep(150);
  m = await L.metrics(page);
  check('the text committed', m.layers === 13 && /Ține/.test(m.layerNames.join(' ')), `[${m.layerNames.slice(0, 2)}]`);

  // reopen it by double-tapping, then zoom with a pinch somewhere else on the
  // canvas: the textarea has to stay open and stay over its own layer
  await page.keyboard.press('v');
  await L.sleep(450);
  await L.tap(cdp, tp.x + 6, tp.y + 6);
  await L.tap(cdp, tp.x + 6, tp.y + 6);
  await L.sleep(200);
  check('double-tap reopens the text', (await L.metrics(page)).hasEditor);
  const editorBox = () => page.evaluate(() => {
    const t = document.getElementById('textEditArea');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    const c = document.getElementById('overlayCanvas'), cr = c.getBoundingClientRect();
    const s = cr.width / c.width;
    return { x: r.left, y: r.top, w: r.width, layerX: (r.left - cr.left) / s, layerY: (r.top - cr.top) / s };
  });
  const boxBefore = await editorBox();
  const pinchAt = L.visiblePoint(await L.metrics(page), 0.15, 0.8);
  await L.pinch(cdp, pinchAt.x, pinchAt.y, 100, 190, 12);
  await L.sleep(120);
  const boxAfter = await editorBox();
  check('the open text editor survives a pinch', !!boxAfter, 'the editor vanished');
  if (boxBefore && boxAfter) {
    check('the editor grows with the zoom', boxAfter.w > boxBefore.w * 1.2, `width ${boxBefore.w.toFixed(0)} -> ${boxAfter.w.toFixed(0)}`);
    check('the editor stays over its own layer',
      Math.abs(boxAfter.layerX - boxBefore.layerX) < 4 && Math.abs(boxAfter.layerY - boxBefore.layerY) < 4,
      `layer coords ${boxBefore.layerX.toFixed(0)},${boxBefore.layerY.toFixed(0)} -> ${boxAfter.layerX.toFixed(0)},${boxAfter.layerY.toFixed(0)}`);
  }
  await page.evaluate(() => { const t = document.getElementById('textEditArea'); if (t) t.blur(); });
  await L.sleep(120);
  m = await L.metrics(page);
  check('the text is still one layer after all that', m.layers === 13, `layers=${m.layers}`);

  // ---------- rotate the device while zoomed in and panned ----------
  await L.pinch(cdp, m.wrap.left + m.wrap.w * 0.4, m.wrap.top + m.wrap.h * 0.4, 90, 240);
  await L.twoFingerPan(cdp, m.wrap.left + m.wrap.w / 2, m.wrap.top + m.wrap.h / 2, 120, 100);
  await page.setViewportSize({ width: 760, height: 412 });
  await L.sleep(250);
  m = await L.metrics(page);
  check('after rotating, the drawing is still on screen',
    m.stage.left + m.stage.w > m.wrap.left + 20 && m.stage.left < m.wrap.left + m.wrap.w - 20 &&
    m.stage.top + m.stage.h > m.wrap.top + 20 && m.stage.top < m.wrap.top + m.wrap.h - 20,
    `canvas ${m.stage.left.toFixed(0)},${m.stage.top.toFixed(0)} ${m.stage.w.toFixed(0)}x${m.stage.h.toFixed(0)} in wrap ${m.wrap.w.toFixed(0)}x${m.wrap.h.toFixed(0)}`);

  // ---------- and it still draws after the rotation ----------
  await page.keyboard.press('r');
  m = await L.metrics(page);
  const q = L.visiblePoint(m, 0.35, 0.35);
  await L.oneFingerDrag(cdp, q.x, q.y, q.x + 50, q.y + 40);
  check('still draws after rotating', (await L.metrics(page)).layers === 14, `layers=${(await L.metrics(page)).layers}`);

  // ---------- reset brings it home ----------
  await page.click('#zoomLabelBtn');
  await L.sleep(120);
  m = await L.metrics(page);
  check('reset fits and centres after rotation',
    near(m.stage.left + m.stage.w / 2, m.wrap.left + m.wrap.w / 2, 2) && m.stage.w <= m.wrap.w + 1,
    `${m.stage.w.toFixed(0)}x${m.stage.h.toFixed(0)} at ${m.stage.left.toFixed(0)}`);

  console.log(errors.length ? 'JS errors:\n' + errors.join('\n') : 'no JS errors');
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });

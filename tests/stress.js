// Long mixed session: after every round of random gestures the app must still
// draw. This is the "something gets stuck" report, turned into a loop.
const L = require('./lib');

let pass = 0, fail = 0;
const check = (n, c, d) => { c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}   ${d || ''}`)); };

let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

(async () => {
  const { browser, page, cdp, errors } = await L.open({ mobile: true });
  await L.newCanvas(page);
  await L.hidePanels(page);
  await L.sleep(120);

  let expected = 0;
  for (let round = 1; round <= 12; round++) {
    let m = await L.metrics(page);
    const rx = () => m.wrap.left + 40 + rnd() * (m.wrap.w - 80);
    const ry = () => m.wrap.top + 40 + rnd() * (m.wrap.h - 80);
    const kind = Math.floor(rnd() * 5);
    if (kind === 0) await L.pinch(cdp, rx(), ry(), 80 + rnd() * 60, 120 + rnd() * 160, 8 + Math.floor(rnd() * 8), rnd() * Math.PI);
    else if (kind === 1) await L.pinch(cdp, rx(), ry(), 200 + rnd() * 60, 70 + rnd() * 60, 10);
    else if (kind === 2) await L.twoFingerPan(cdp, rx(), ry(), (rnd() - 0.5) * 260, (rnd() - 0.5) * 260, 100, 10);
    else if (kind === 3) {
      // a pinch that ends with the fingers off the visible drawing entirely
      await L.pinch(cdp, m.wrap.left + m.wrap.w * 0.5, m.wrap.top + m.wrap.h * 0.9, 60, 260, 12);
    } else {
      await L.oneFingerDrag(cdp, rx(), ry(), rx(), ry());  // may draw or pan
      expected = (await L.metrics(page)).layers;           // whatever it did, take it as the new baseline
    }

    // now draw a rectangle on purpose - this must always work
    await page.keyboard.press('r');
    m = await L.metrics(page);
    expected = m.layers;
    const p0 = L.visiblePoint(m, 0.3, 0.3), p1 = L.visiblePoint(m, 0.6, 0.6);
    if (Math.min(p0.w, p0.h) < 30) { await page.click('#zoomLabelBtn'); await L.sleep(80); m = await L.metrics(page); }
    const a = L.visiblePoint(m, 0.3, 0.3), b = L.visiblePoint(m, 0.6, 0.6);
    await L.oneFingerDrag(cdp, a.x, a.y, b.x, b.y);
    m = await L.metrics(page);
    check(`round ${round} (gesture kind ${kind}): can still draw`, m.layers === expected + 1, `layers ${expected} -> ${m.layers}`);
    expected = m.layers;
  }

  // and the view is still sane at the end
  await page.click('#zoomLabelBtn');
  await L.sleep(100);
  const m = await L.metrics(page);
  check('reset still recentres after a long session',
    Math.abs(m.stage.left + m.stage.w / 2 - (m.wrap.left + m.wrap.w / 2)) < 2 &&
    Math.abs(m.stage.top + m.stage.h / 2 - (m.wrap.top + m.wrap.h / 2)) < 2,
    `centre ${(m.stage.left + m.stage.w / 2).toFixed(0)},${(m.stage.top + m.stage.h / 2).toFixed(0)}`);

  console.log(errors.length ? 'JS errors:\n' + errors.join('\n') : 'no JS errors');
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });

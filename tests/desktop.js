// Mouse / keyboard side of zoom + pan + drawing, on a desktop-sized window.
const L = require('./lib');

let pass = 0, fail = 0;
const check = (n, c, d) => { c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}   ${d || ''}`)); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

(async () => {
  const { browser, page, errors } = await L.open({ mobile: false, width: 1280, height: 860 });
  await L.newCanvas(page);
  await L.hidePanels(page);
  await L.sleep(150);

  let m = await L.metrics(page);
  console.log(`start: zoom=${m.zoomLabel} canvas=${m.stage.w.toFixed(0)}x${m.stage.h.toFixed(0)} wrap=${m.wrap.w.toFixed(0)}x${m.wrap.h.toFixed(0)}`);

  // ---------- ctrl+wheel zooms at the pointer (also how a trackpad pinch arrives) ----------
  const zx = m.wrap.left + m.wrap.w * 0.30, zy = m.wrap.top + m.wrap.h * 0.65;
  const before = L.contentUnder(m, zx, zy), scale0 = m.scale;
  await page.mouse.move(zx, zy);
  await page.keyboard.down('Control');
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -120); await L.sleep(30); }
  await page.keyboard.up('Control');
  await L.sleep(80);
  m = await L.metrics(page);
  const after = L.contentUnder(m, zx, zy);
  console.log(`  ctrl+wheel: scale ${scale0.toFixed(3)} -> ${m.scale.toFixed(3)}`);
  check('ctrl+wheel zooms in', m.scale > scale0 * 1.5, `${scale0.toFixed(2)} -> ${m.scale.toFixed(2)}`);
  check('zoom is anchored at the mouse', Math.hypot(after.x - before.x, after.y - before.y) < 8,
    `drifted ${Math.hypot(after.x - before.x, after.y - before.y).toFixed(1)} canvas px`);

  // ---------- plain wheel pans ----------
  let m0 = await L.metrics(page);
  await page.mouse.wheel(0, 100);
  await L.sleep(80);
  m = await L.metrics(page);
  check('plain wheel pans vertically', near(m.stage.top - m0.stage.top, -100, 6), `moved ${(m.stage.top - m0.stage.top).toFixed(0)}`);
  m0 = m;
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('Shift');
  await L.sleep(80);
  m = await L.metrics(page);
  check('shift+wheel pans horizontally', near(m.stage.left - m0.stage.left, -100, 6), `moved ${(m.stage.left - m0.stage.left).toFixed(0)}`);

  // ---------- alt+drag pans, exactly following the mouse ----------
  m0 = await L.metrics(page);
  const sx = m0.wrap.left + m0.wrap.w / 2, sy = m0.wrap.top + m0.wrap.h / 2;
  await page.keyboard.down('Alt');
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(sx + 90 * i / 8, sy + 60 * i / 8); await L.sleep(12); }
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await L.sleep(80);
  m = await L.metrics(page);
  check('alt+drag pans with the mouse', near(m.stage.left - m0.stage.left, 90, 6) && near(m.stage.top - m0.stage.top, 60, 6),
    `moved ${(m.stage.left - m0.stage.left).toFixed(0)},${(m.stage.top - m0.stage.top).toFixed(0)}`);

  // ---------- middle-drag pans ----------
  m0 = await L.metrics(page);
  await page.mouse.move(sx, sy);
  await page.mouse.down({ button: 'middle' });
  for (let i = 1; i <= 8; i++) { await page.mouse.move(sx - 60 * i / 8, sy - 40 * i / 8); await L.sleep(12); }
  await page.mouse.up({ button: 'middle' });
  await L.sleep(80);
  m = await L.metrics(page);
  check('middle-drag pans', near(m.stage.left - m0.stage.left, -60, 6) && near(m.stage.top - m0.stage.top, -40, 6),
    `moved ${(m.stage.left - m0.stage.left).toFixed(0)},${(m.stage.top - m0.stage.top).toFixed(0)}`);

  // ---------- drag on the checkered padding pans too ----------
  m0 = await L.metrics(page);
  const padX = Math.max(m0.wrap.left + 8, m0.stage.left - 40);
  const padY = m0.wrap.top + 30;
  const onPadding = padX < m0.stage.left || padY < m0.stage.top;
  if (onPadding) {
    await page.mouse.move(padX, padY);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) { await page.mouse.move(padX + 40 * i / 6, padY + 30 * i / 6); await L.sleep(12); }
    await page.mouse.up();
    await L.sleep(80);
    m = await L.metrics(page);
    check('dragging the padding pans', near(m.stage.left - m0.stage.left, 40, 8), `moved ${(m.stage.left - m0.stage.left).toFixed(0)}`);
  } else {
    console.log('  SKIP  padding drag (canvas fills the wrapper)');
  }

  // ---------- space+drag pans ----------
  m0 = await L.metrics(page);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.down('Space');
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(sx + 50 * i / 6, sy); await L.sleep(12); }
  await page.mouse.up();
  await page.keyboard.up('Space');
  await L.sleep(80);
  m = await L.metrics(page);
  check('space+drag pans', near(m.stage.left - m0.stage.left, 50, 8), `moved ${(m.stage.left - m0.stage.left).toFixed(0)}`);

  // ---------- arrow keys pan ----------
  m0 = await L.metrics(page);
  await page.keyboard.press('ArrowRight');
  await L.sleep(60);
  m = await L.metrics(page);
  check('arrow key pans the view', near(m.stage.left - m0.stage.left, -40, 4), `moved ${(m.stage.left - m0.stage.left).toFixed(0)}`);

  // ---------- draw with the mouse after all that ----------
  await page.keyboard.press('r');
  m = await L.metrics(page);
  const inside = (fx, fy) => ({
    x: Math.max(m.wrap.left + 15, Math.min(m.wrap.left + m.wrap.w - 15, m.stage.left + m.stage.w * fx)),
    y: Math.max(m.wrap.top + 15, Math.min(m.wrap.top + m.wrap.h - 15, m.stage.top + m.stage.h * fy))
  });
  let a = inside(0.35, 0.35), b = inside(0.6, 0.6);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8); await L.sleep(10); }
  await page.mouse.up();
  await L.sleep(80);
  m = await L.metrics(page);
  check('rectangle drawn with the mouse after zoom + pan', m.layers === 1, `layers=${m.layers}`);

  // the shape must land where the mouse was, not where an un-panned view would put it
  const drawn = await page.evaluate(() => {
    const c = document.getElementById('baseCanvas');
    return { w: c.width, h: c.height };
  });
  const hit = await page.evaluate(({ x, y }) => {
    const c = document.getElementById('baseCanvas');
    const r = c.getBoundingClientRect();
    const px = Math.round((x - r.left) / r.width * c.width), py = Math.round((y - r.top) / r.height * c.height);
    const d = c.getContext('2d').getImageData(px, py, 1, 1).data;
    return [...d];
  }, { x: a.x, y: a.y });
  check('the rectangle is drawn where the mouse was', hit[3] > 0 && !(hit[0] > 240 && hit[1] > 240 && hit[2] > 240),
    `pixel at the drag start = rgba(${hit}) on a ${drawn.w}x${drawn.h} canvas`);

  // ---------- zoom buttons keep the middle of the view ----------
  m0 = await L.metrics(page);
  const c0 = L.contentUnder(m0, m0.wrap.left + m0.wrap.w / 2, m0.wrap.top + m0.wrap.h / 2);
  await page.click('#zoomInBtn');
  await L.sleep(60);
  m = await L.metrics(page);
  const c1 = L.contentUnder(m, m.wrap.left + m.wrap.w / 2, m.wrap.top + m.wrap.h / 2);
  check('zoom button keeps the centre of the view', Math.hypot(c1.x - c0.x, c1.y - c0.y) < 6,
    `drifted ${Math.hypot(c1.x - c0.x, c1.y - c0.y).toFixed(1)}`);
  check('zoom button zooms 1.25x', near(m.scale / m0.scale, 1.25, 0.02), `${(m.scale / m0.scale).toFixed(3)}`);

  // ---------- reset ----------
  await page.click('#zoomLabelBtn');
  await L.sleep(80);
  m = await L.metrics(page);
  check('reset returns to fit', near(m.stage.w, Math.min(m.wrap.w - 40, m.natural.w), 2), `w=${m.stage.w.toFixed(0)}`);
  check('reset recentres', near(m.stage.left + m.stage.w / 2, m.wrap.left + m.wrap.w / 2, 2),
    `centre off by ${(m.stage.left + m.stage.w / 2 - m.wrap.left - m.wrap.w / 2).toFixed(1)}`);

  console.log(errors.length ? 'JS errors:\n' + errors.join('\n') : 'no JS errors');
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });

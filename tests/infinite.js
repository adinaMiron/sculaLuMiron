// Infinite canvas: the sheet is a window that follows the view, so a drawing
// can go anywhere, and an export frames the ink instead of the sheet.
// Plain Node + Playwright, like every other script here - see README.md.
const L = require('./lib');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}   ${detail || ''}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function newInfinite(page, { transparent = false } = {}) {
  await page.click('#newCanvasBtn');
  await page.click('.sizePreset[data-infinite="1"]');
  await page.click(`.bgBtn[data-bg="${transparent ? 'transparent' : 'color'}"]`);
  await page.click('#newCanvasCreate');
  await page.waitForTimeout(150);
}

// mouse drag with real intermediate moves, so a draw is a draw
async function drag(page, x1, y1, x2, y2, mods = []) {
  for (const k of mods) await page.keyboard.down(k);
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 14 });
  await page.mouse.up();
  for (const k of mods) await page.keyboard.up(k);
  await page.waitForTimeout(80);
}

// How much ink the base canvas is carrying inside a client-space box - the
// only way to ask "is that shape actually painted right now".
function inkIn(page, box) {
  return page.evaluate(([bx, by, bw, bh]) => {
    const c = document.getElementById('baseCanvas');
    const r = c.getBoundingClientRect();
    const sx = c.width / r.width, sy = c.height / r.height;
    const x = Math.max(0, Math.round((bx - r.left) * sx));
    const y = Math.max(0, Math.round((by - r.top) * sy));
    const w = Math.min(c.width - x, Math.round(bw * sx));
    const h = Math.min(c.height - y, Math.round(bh * sy));
    if (w <= 0 || h <= 0) return 0;
    const d = c.getContext('2d').getImageData(x, y, w, h).data;
    let n = 0;
    // the sheet's background is a flat fill; ink is anything darker
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8 && d[i] < 200) n++;
    return n;
  }, [box.x, box.y, box.w, box.h]);
}

// Where the painted ink sits, in client coordinates - what a gesture visibly
// did to the drawing, which is the only thing a re-cut must never change.
async function inkBoxClient(page) {
  return page.evaluate(() => {
    const c = document.getElementById('baseCanvas');
    const r = c.getBoundingClientRect();
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    const sx = r.width / c.width, sy = r.height / c.height;
    return { x: r.left + minX * sx, y: r.top + minY * sy, w: (maxX - minX) * sx, h: (maxY - minY) * sy };
  });
}

// Save once, with ScuLaFolder standing in for the folder/share/download, and
// report the exported PNG's real size and where its ink sits inside it.
async function exportAndMeasure(page) {
  await page.evaluate(() => {
    window.__saved = null;
    window.ScuLaFolder.save = async (name, blob) => {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      const cx = c.getContext('2d');
      cx.drawImage(bmp, 0, 0);
      const d = cx.getImageData(0, 0, bmp.width, bmp.height).data;
      let minX = bmp.width, minY = bmp.height, maxX = -1, maxY = -1;
      for (let y = 0; y < bmp.height; y++) {
        for (let x = 0; x < bmp.width; x++) {
          if (d[(y * bmp.width + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      window.__saved = { name, w: bmp.width, h: bmp.height, minX, minY, maxX, maxY };
      return { ok: true };
    };
  });
  await page.click('#saveBtn');
  await page.waitForFunction(() => window.__saved, null, { timeout: 15000 });
  return page.evaluate(() => window.__saved);
}

(async () => {
  const { browser, page, errors } = await L.open({ mobile: false, width: 1000, height: 700 });
  await L.hidePanels(page);

  // ---------- 1. an infinite sheet is a window larger than the viewport ----------
  await newInfinite(page);
  let m = await L.metrics(page);
  console.log(`start: zoom=${m.zoomLabel} stage=${m.stage.w.toFixed(0)}x${m.stage.h.toFixed(0)} wrap=${m.wrap.w.toFixed(0)}x${m.wrap.h.toFixed(0)}`);
  check('zoom starts at 100% (nothing to fit)', m.zoomLabel === '100%', `got ${m.zoomLabel}`);
  check('sheet reaches past the viewport on both axes',
    m.stage.w > m.wrap.w + 200 && m.stage.h > m.wrap.h + 200,
    `stage ${m.stage.w.toFixed(0)}x${m.stage.h.toFixed(0)} vs wrap ${m.wrap.w.toFixed(0)}x${m.wrap.h.toFixed(0)}`);
  check('sheet is not huge - it tracks the viewport, not the world',
    m.natural.w < m.wrap.w * 3 && m.natural.h < m.wrap.h * 3,
    `buffer ${m.natural.w}x${m.natural.h}`);

  // ---------- 2. draw here, pan two screens away, draw there ----------
  await page.keyboard.press('r');
  await drag(page, 300, 300, 500, 420);
  m = await L.metrics(page);
  check('first rectangle drawn', m.layers === 1, `${m.layers} layers`);
  const homeBox = { x: 290, y: 290, w: 220, h: 140 };
  check('first rectangle is painted', await inkIn(page, homeBox) > 50);

  // Alt+drag pans; three pulls take the view well past where the sheet
  // started, which is exactly the ground a fixed canvas would not have.
  const w = m.wrap;
  for (let i = 0; i < 3; i++) {
    await drag(page, w.left + w.w - 40, w.top + w.h - 40, w.left + 40, w.top + 40, ['Alt']);
  }
  m = await L.metrics(page);
  check('the view really left the old sheet', await inkIn(page, homeBox) === 0,
    'the first rectangle is somehow still on screen');
  check('buffer still viewport-sized after roaming',
    m.natural.w < m.wrap.w * 3 && m.natural.h < m.wrap.h * 3, `buffer ${m.natural.w}x${m.natural.h}`);

  await page.keyboard.press('r');
  await drag(page, 350, 350, 520, 470);
  m = await L.metrics(page);
  check('second rectangle drawn two screens away', m.layers === 2, `${m.layers} layers`);
  const farBox = { x: 340, y: 340, w: 190, h: 140 };
  check('second rectangle is painted where it was drawn', await inkIn(page, farBox) > 50);

  // ---------- 3. the zoom label brings the whole drawing back ----------
  await page.click('#zoomLabelBtn');
  await page.waitForTimeout(150);
  m = await L.metrics(page);
  const inkEverywhere = await page.evaluate(() => {
    const c = document.getElementById('baseCanvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8 && d[i] < 200) n++;
    return n;
  });
  console.log(`  after fit: zoom=${m.zoomLabel} buffer=${m.natural.w}x${m.natural.h}`);
  check('fit brings both rectangles back on screen', inkEverywhere > 100, `${inkEverywhere} ink px`);
  check('fit zoomed out to hold two screens of drawing',
    parseInt(m.zoomLabel, 10) < 100, `zoom ${m.zoomLabel}`);

  // ---------- 4. the export frames the ink, not the sheet ----------
  const far = await exportAndMeasure(page);
  console.log(`  far export: ${far.w}x${far.h}, ink at ${far.minX},${far.minY}..${far.maxX},${far.maxY}`);
  check('export spans the gap between the two rectangles', far.w > 1200 && far.w < 4000, `${far.w}px wide`);
  check('export is not the whole roamed sheet', far.h < 2000, `${far.h}px tall`);

  // ---------- 5. exactly 10 px of margin, on every side ----------
  await newInfinite(page, { transparent: true });
  await page.keyboard.press('r');
  await drag(page, 300, 260, 500, 380);
  const one = await exportAndMeasure(page);
  console.log(`  one rectangle: export ${one.w}x${one.h}, ink at ${one.minX},${one.minY}..${one.maxX},${one.maxY}`);
  check('10 px of empty margin on the left', near(one.minX, 10, 1), `ink starts at x=${one.minX}`);
  check('10 px of empty margin on top', near(one.minY, 10, 1), `ink starts at y=${one.minY}`);
  check('10 px of empty margin on the right', near(one.w - 1 - one.maxX, 10, 1), `${one.w - 1 - one.maxX} px`);
  check('10 px of empty margin at the bottom', near(one.h - 1 - one.maxY, 10, 1), `${one.h - 1 - one.maxY} px`);
  check('export is the drawing plus its margins, not the sheet',
    one.w > 200 && one.w < 200 + 60 && one.h > 120 && one.h < 120 + 60, `${one.w}x${one.h}`);

  // a second rectangle at a known offset must grow the frame by exactly that
  await page.keyboard.press('r');
  await drag(page, 700, 610, 760, 650);
  const two = await exportAndMeasure(page);
  console.log(`  two rectangles: export ${two.w}x${two.h} (was ${one.w}x${one.h})`);
  check('frame grew by the horizontal offset', near(two.w - one.w, 760 - 500, 3), `grew ${two.w - one.w}, expected ${760 - 500}`);
  check('frame grew by the vertical offset', near(two.h - one.h, 650 - 380, 3), `grew ${two.h - one.h}, expected ${650 - 380}`);
  check('still 10 px of margin with two shapes',
    near(two.minX, 10, 1) && near(two.minY, 10, 1) && near(two.w - 1 - two.maxX, 10, 1) && near(two.h - 1 - two.maxY, 10, 1),
    `ink at ${two.minX},${two.minY}..${two.maxX},${two.maxY} in ${two.w}x${two.h}`);

  // ---------- 6. a fixed canvas still exports itself, to the pixel ----------
  await page.click('#newCanvasBtn');
  await page.click('.sizePreset[data-w="800"]');
  await page.click('.bgBtn[data-bg="color"]');
  await page.click('#newCanvasCreate');
  await page.waitForTimeout(150);
  await page.keyboard.press('r');
  await drag(page, 320, 300, 460, 400);
  const fixed = await exportAndMeasure(page);
  console.log(`  fixed canvas export: ${fixed.w}x${fixed.h}`);
  check('a fixed 800x600 canvas is untouched by any of this',
    fixed.w === 800 && fixed.h === 600, `${fixed.w}x${fixed.h}`);

  // ---------- 7. the viewport changing size is not a crisis ----------
  // transparent, so "where is the ink" stays a question about the drawing
  await newInfinite(page, { transparent: true });
  await page.keyboard.press('r');
  await drag(page, 300, 300, 460, 400);
  await page.setViewportSize({ width: 1240, height: 900 });
  await page.waitForTimeout(200);
  m = await L.metrics(page);
  check('a bigger window re-cuts the sheet around it',
    m.stage.w > m.wrap.w && m.natural.w < m.wrap.w * 3, `stage ${m.stage.w.toFixed(0)}, buffer ${m.natural.w}`);
  check('the drawing survived the resize', await inkIn(page, { x: 280, y: 280, w: 200, h: 140 }) > 50);
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.waitForTimeout(200);

  // ---------- 8. an open text editor stays glued to the drawing ----------
  // The textarea is placed from world coordinates, so a window re-cut under
  // it must leave it exactly where its layer is. The wheel pans without
  // taking focus off the textarea, which a click or a finger would.
  await page.keyboard.press('t');
  await page.mouse.click(360, 480);
  await page.waitForTimeout(200);
  await page.keyboard.type('Ana');
  await page.waitForTimeout(150);
  const editorBox = () => page.evaluate(() => {
    const ta = document.getElementById('textEditArea');
    if (!ta) return null;
    const r = ta.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width };
  });
  const ed0 = await editorBox(), ink0 = await inkBoxClient(page);
  check('a text editor open over an infinite sheet', !!ed0 && !!ink0);
  await page.mouse.move(500, 400);
  // far enough past the sheet's margin to force a re-cut, close enough that
  // the rectangle is still painted afterwards
  for (let i = 0; i < 2; i++) { await page.mouse.wheel(-260, -220); await page.waitForTimeout(60); }
  await page.waitForTimeout(150);
  const ed1 = await editorBox(), ink1 = await inkBoxClient(page);
  check('the editor is still open after the re-cuts', !!ed1 && !!ink1);
  if (ed0 && ed1 && ink0 && ink1) {
    console.log(`  wheel pan: drawing moved ${(ink1.x - ink0.x).toFixed(0)},${(ink1.y - ink0.y).toFixed(0)}, editor moved ${(ed1.x - ed0.x).toFixed(0)},${(ed1.y - ed0.y).toFixed(0)}`);
    check('the pan actually moved the view', near(ink1.x - ink0.x, 520, 4) && near(ink1.y - ink0.y, 440, 4),
      `moved ${(ink1.x - ink0.x).toFixed(0)},${(ink1.y - ink0.y).toFixed(0)}, expected 520,440`);
    check('the editor travelled with the drawing, not with the window',
      near(ed1.x - ed0.x, ink1.x - ink0.x, 2) && near(ed1.y - ed0.y, ink1.y - ink0.y, 2),
      `drawing ${(ink1.x - ink0.x).toFixed(0)},${(ink1.y - ink0.y).toFixed(0)} vs editor ${(ed1.x - ed0.x).toFixed(0)},${(ed1.y - ed0.y).toFixed(0)}`);
  }
  await page.evaluate(() => { const ta = document.getElementById('textEditArea'); if (ta) ta.blur(); });
  await page.waitForTimeout(200);
  check('the text committed as a layer', (await L.metrics(page)).layers === 2, `${(await L.metrics(page)).layers} layers`);

  if (errors.length) { console.log('\nJS errors:'); errors.forEach(e => console.log('  ' + e)); fail += errors.length; }
  else console.log('no JS errors');
  await browser.close();

  // ---------- 9. touch: a pinch and a two-finger pan cross a re-cut ----------
  // Both remember where they started - a pinch in sheet coordinates, a pan in
  // pan values - and a re-cut moves both frames underneath them.
  const t = await L.open({ mobile: true });
  await L.hidePanels(t.page);
  await newInfinite(t.page, { transparent: true });
  await t.page.keyboard.press('r');
  let tm = await L.metrics(t.page);
  const cx = tm.wrap.left + tm.wrap.w * 0.5, cy = tm.wrap.top + tm.wrap.h * 0.45;
  await L.oneFingerDrag(t.cdp, cx - 70, cy - 50, cx + 70, cy + 50);
  const drawn = await inkBoxClient(t.page);
  check('a rectangle to aim at', drawn && drawn.w > 100, JSON.stringify(drawn));

  const mid = { x: drawn.x + drawn.w / 2, y: drawn.y + drawn.h / 2 };
  await L.pinch(t.cdp, mid.x, mid.y, 100, 240);
  const zoomed = await inkBoxClient(t.page);
  console.log(`  pinch: box ${drawn.w.toFixed(0)}px -> ${zoomed.w.toFixed(0)}px wide, centre drifted ` +
    `${Math.hypot(zoomed.x + zoomed.w / 2 - mid.x, zoomed.y + zoomed.h / 2 - mid.y).toFixed(0)}px`);
  check('pinch zooms the drawing ~2.4x', near(zoomed.w / drawn.w, 2.4, 0.4), `got ${(zoomed.w / drawn.w).toFixed(2)}x`);
  check('the pinched spot stays under the fingers across the re-cut',
    Math.hypot(zoomed.x + zoomed.w / 2 - mid.x, zoomed.y + zoomed.h / 2 - mid.y) < 25);

  const before = await inkBoxClient(t.page);
  await L.twoFingerPan(t.cdp, mid.x, mid.y, -140, -90);
  const after = await inkBoxClient(t.page);
  console.log(`  two-finger pan: drawing moved ${(after.x - before.x).toFixed(0)},${(after.y - before.y).toFixed(0)} (asked -140,-90)`);
  check('the drawing travels exactly as far as the fingers do horizontally', near(after.x - before.x, -140, 14),
    `moved ${(after.x - before.x).toFixed(0)}`);
  check('...and vertically', near(after.y - before.y, -90, 14), `moved ${(after.y - before.y).toFixed(0)}`);

  if (t.errors.length) { console.log('\nJS errors (touch):'); t.errors.forEach(e => console.log('  ' + e)); fail += t.errors.length; }
  await t.browser.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

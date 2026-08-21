// Reproduces the "nothing works after a gesture" family of bugs by driving
// raw PointerEvents, so a finger can be lifted somewhere other than where it
// landed - which is what a real device does all the time and what CDP's
// all-or-nothing touchEnd cannot express.
const L = require('./lib');

let pass = 0, fail = 0;
const check = (n, c, d) => { c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}   ${d || ''}`)); };

const INJECT = () => {
  window.__ev = (target, type, id, x, y, opts = {}) => {
    const el = document.getElementById(target);
    el.dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: opts.pointerType || 'touch',
      clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true,
      isPrimary: opts.isPrimary !== undefined ? opts.isPrimary : id === 1,
      buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
      button: type === 'pointermove' ? -1 : 0
    }));
  };
  window.__layers = () => document.querySelectorAll('#layerList .layerItem').length;
  window.__geom = () => {
    const s = document.getElementById('stage').getBoundingClientRect();
    const o = document.getElementById('overlayCanvas');
    return { left: s.left, top: s.top, w: s.width, h: s.height, scale: s.width / o.width };
  };
};

async function drawRect(page, tag) {
  const before = await page.evaluate(() => window.__layers());
  await page.keyboard.press('r');
  await page.evaluate(() => {
    const g = window.__geom();
    const x1 = g.left + g.w * 0.3, y1 = g.top + g.h * 0.3;
    const x2 = g.left + g.w * 0.6, y2 = g.top + g.h * 0.6;
    window.__ev('overlayCanvas', 'pointerdown', 9, x1, y1);
    for (let i = 1; i <= 6; i++) window.__ev('overlayCanvas', 'pointermove', 9, x1 + (x2 - x1) * i / 6, y1 + (y2 - y1) * i / 6);
    window.__ev('overlayCanvas', 'pointerup', 9, x2, y2);
  });
  await L.sleep(80);
  const after = await page.evaluate(() => window.__layers());
  check(`can draw after ${tag}`, after === before + 1, `layers ${before} -> ${after}`);
}

(async () => {
  const { browser, page, errors } = await L.open({ mobile: true });
  // every case starts from a clean page, so one stuck case cannot mask the next
  const reset = async () => {
    await page.reload();
    await L.newCanvas(page);
    await L.hidePanels(page);
    await page.evaluate(INJECT);
    await L.sleep(100);
  };
  await reset();

  // A) both fingers land on the image, one lifts over the padding around it
  await page.evaluate(() => {
    const g = window.__geom();
    const cx = g.left + g.w / 2, cy = g.top + g.h / 2;
    window.__ev('overlayCanvas', 'pointerdown', 1, cx - 40, cy);
    window.__ev('overlayCanvas', 'pointerdown', 2, cx + 40, cy);
    for (let i = 1; i <= 5; i++) {
      window.__ev('overlayCanvas', 'pointermove', 1, cx - 40 - i * 12, cy);
      window.__ev('overlayCanvas', 'pointermove', 2, cx + 40 + i * 12, cy);
    }
    // finger 2 is now past the edge of the image: its pointerup is delivered
    // to the wrapper, never to the canvas
    window.__ev('canvasWrap', 'pointerup', 2, cx + 120, cy);
    window.__ev('overlayCanvas', 'pointerup', 1, cx - 100, cy);
  });
  await L.sleep(80);
  await drawRect(page, 'a pinch whose second finger lifted off-canvas');

  await reset();
  // B) pinch aborted by a pointercancel (browser takes the gesture over)
  await page.evaluate(() => {
    const g = window.__geom();
    const cx = g.left + g.w / 2, cy = g.top + g.h / 2;
    window.__ev('overlayCanvas', 'pointerdown', 3, cx - 30, cy, { isPrimary: true });
    window.__ev('overlayCanvas', 'pointerdown', 4, cx + 30, cy, { isPrimary: false });
    window.__ev('overlayCanvas', 'pointermove', 3, cx - 60, cy);
    window.__ev('canvasWrap', 'pointercancel', 4, cx + 90, cy);
    window.__ev('overlayCanvas', 'pointerup', 3, cx - 60, cy);
  });
  await L.sleep(80);
  await drawRect(page, 'a pinch cancelled off-canvas');

  await reset();
  // C) one finger on the image, the second on the checkered padding
  await page.evaluate(() => {
    const g = window.__geom();
    const cx = g.left + g.w / 2, cy = g.top + g.h / 2;
    window.__ev('overlayCanvas', 'pointerdown', 5, cx, cy, { isPrimary: true });
    window.__ev('canvasWrap', 'pointerdown', 6, g.left - 30, cy, { isPrimary: false });
    for (let i = 1; i <= 5; i++) window.__ev('canvasWrap', 'pointermove', 6, g.left - 30 - i * 10, cy);
    window.__ev('canvasWrap', 'pointerup', 6, g.left - 80, cy);
    window.__ev('overlayCanvas', 'pointerup', 5, cx, cy);
  });
  await L.sleep(80);
  await drawRect(page, 'a pinch spanning image + padding');

  await reset();
  // D) a stroke the browser cancels mid-way (scroll steal)
  await page.evaluate(() => {
    const g = window.__geom();
    window.__ev('overlayCanvas', 'pointerdown', 7, g.left + 20, g.top + 20, { isPrimary: true });
    window.__ev('overlayCanvas', 'pointermove', 7, g.left + 60, g.top + 60);
    window.__ev('overlayCanvas', 'pointercancel', 7, g.left + 60, g.top + 60);
  });
  await L.sleep(80);
  await drawRect(page, 'a cancelled stroke');

  console.log(errors.length ? 'JS errors:\n' + errors.join('\n') : 'no JS errors');
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });

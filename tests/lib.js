// Shared helpers for the ad-hoc Playwright checks in this folder. There is no
// test framework in this repo (see CLAUDE.md "no build step, no framework") -
// these are plain Node scripts, run one at a time: `node tests/flow.js`.
//
// Each script drives editor.html straight off disk via a file:// URL and
// asserts on real pixels (getImageData) and real geometry
// (getBoundingClientRect), not screenshots - see HANDOFF.md § "Testing
// approach" for why.
const path = require('path');
const { chromium } = require('playwright');

// This sandbox pre-installs Chromium outside Playwright's usual cache and
// sets PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD, so `chromium.launch()` needs an
// explicit executablePath here. Elsewhere - a normal dev machine or CI that
// ran `npx playwright install` - leave PW_CHROME_PATH unset and Playwright's
// own managed browser is used instead.
const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.EDITOR_URL || 'file://' + path.join(__dirname, '..', 'editor.html');

async function open({ mobile = true, width = 412, height = 915 } = {}) {
  if (process.env.VP) {
    const [w, h] = process.env.VP.split('x').map(Number);
    width = w; height = h;
    if (process.env.VP_MOBILE) mobile = process.env.VP_MOBILE === '1';
  }
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto(URL);
  const cdp = await ctx.newCDPSession(page);
  return { browser, ctx, page, cdp, errors };
}

async function newCanvas(page) {
  await page.click('#newCanvasBtn');
  await page.click('#newCanvasCreate');
  await page.waitForTimeout(120);
}

// --- CDP touch synthesis -------------------------------------------------
async function touch(cdp, type, points) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), id: p.id, radiusX: 6, radiusY: 6, force: 1 }))
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Pinch: two fingers start at centre±start/2 and move to centre±end/2, along `axis`
async function pinch(cdp, cx, cy, startGap, endGap, steps = 14, angle = 0) {
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const pts = g => ([
    { id: 1, x: cx - ux * g / 2, y: cy - uy * g / 2 },
    { id: 2, x: cx + ux * g / 2, y: cy + uy * g / 2 }
  ]);
  await touch(cdp, 'touchStart', pts(startGap));
  await sleep(20);
  for (let i = 1; i <= steps; i++) {
    const g = startGap + (endGap - startGap) * (i / steps);
    await touch(cdp, 'touchMove', pts(g));
    await sleep(12);
  }
  await touch(cdp, 'touchEnd', []);
  await sleep(60);
}

// Two-finger pan from (cx,cy) by (dx,dy), gap constant
async function twoFingerPan(cdp, cx, cy, dx, dy, gap = 120, steps = 12) {
  const pts = (x, y) => ([
    { id: 1, x: x - gap / 2, y },
    { id: 2, x: x + gap / 2, y }
  ]);
  await touch(cdp, 'touchStart', pts(cx, cy));
  await sleep(20);
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, 'touchMove', pts(cx + dx * i / steps, cy + dy * i / steps));
    await sleep(12);
  }
  await touch(cdp, 'touchEnd', []);
  await sleep(60);
}

async function oneFingerDrag(cdp, x1, y1, x2, y2, steps = 12) {
  await touch(cdp, 'touchStart', [{ id: 1, x: x1, y: y1 }]);
  await sleep(20);
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, 'touchMove', [{ id: 1, x: x1 + (x2 - x1) * i / steps, y: y1 + (y2 - y1) * i / steps }]);
    await sleep(12);
  }
  await touch(cdp, 'touchEnd', []);
  await sleep(60);
}

async function tap(cdp, x, y) {
  await touch(cdp, 'touchStart', [{ id: 1, x, y }]);
  await sleep(40);
  await touch(cdp, 'touchEnd', []);
  await sleep(60);
}

// --- observation ---------------------------------------------------------
async function metrics(page) {
  return page.evaluate(() => {
    // measure the drawing itself, not its wrapper box
    const st = document.getElementById('overlayCanvas').getBoundingClientRect();
    const wr = document.getElementById('canvasWrap').getBoundingClientRect();
    const oc = document.getElementById('overlayCanvas');
    return {
      stage: { left: st.left, top: st.top, w: st.width, h: st.height },
      wrap: { left: wr.left, top: wr.top, w: wr.width, h: wr.height },
      natural: { w: oc.width, h: oc.height },
      scale: st.width / oc.width,
      zoomLabel: document.getElementById('zoomLabelBtn').textContent.trim(),
      layers: document.querySelectorAll('#layerList .layerItem').length,
      layerNames: [...document.querySelectorAll('#layerList .lname')].map(n => n.textContent),
      hasEditor: !!document.getElementById('textEditArea'),
      pageScale: window.visualViewport ? window.visualViewport.scale : 1
    };
  });
}

// content-space point (natural canvas px) currently under a client point
function contentUnder(m, cx, cy) {
  return { x: (cx - m.stage.left) / m.scale, y: (cy - m.stage.top) / m.scale };
}

function selectTool(page, tool) { return page.click(`button.tool[data-tool="${tool}"]`); }

// The floating panels float over the canvas and their visibility is
// remembered across reloads, so "click the toggle" is not idempotent - check
// first. Tools are picked with the keyboard shortcuts instead.
async function hidePanels(page) {
  for (const id of ['toolsPanel', 'selectionPanel']) {
    const btn = id === 'toolsPanel' ? '#toggleToolsBtn' : '#toggleSelectionBtn';
    const visible = await page.evaluate(i => !document.getElementById(i).hidden, id);
    if (visible) await page.click(btn);
  }
  await sleep(80);
  const left = await page.evaluate(() => ['toolsPanel', 'selectionPanel'].filter(i => !document.getElementById(i).hidden));
  if (left.length) throw new Error('panels still visible: ' + left);
}

// A point inside the part of the drawing that is actually on screen, given as
// a fraction of that visible area - so a test never aims at a spot the view
// has panned out of sight (which would be a pan, not a draw).
function visiblePoint(m, fx, fy) {
  const l = Math.max(m.stage.left, m.wrap.left), r = Math.min(m.stage.left + m.stage.w, m.wrap.left + m.wrap.w);
  const t = Math.max(m.stage.top, m.wrap.top), b = Math.min(m.stage.top + m.stage.h, m.wrap.top + m.wrap.h);
  return { x: l + (r - l) * fx, y: t + (b - t) * fy, w: r - l, h: b - t };
}

module.exports = { open, newCanvas, hidePanels, visiblePoint, touch, pinch, twoFingerPan, oneFingerDrag, tap, metrics, contentUnder, selectTool, sleep };

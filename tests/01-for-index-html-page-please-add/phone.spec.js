// Round-1 tester additions: gaps the first suite did not cover — the 390×844 touch
// viewport (spec § 10 "no console errors from file://, desktop and touch"), the shared
// nav block staying byte-identical, the help text, and the sketch on real touch input.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { load, setText, fence, openBlock, MM3 } = require('./helpers');

const ROOT = path.join(__dirname, '..', '..');
const navBlock = f => {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const a = s.indexOf('<nav id="site-nav"');
  const b = s.indexOf('<!-- ===== end toolbar nav ===== -->');
  return a < 0 || b < 0 ? null : s.slice(a, b);
};

test.describe('shared nav block untouched', () => {
  test('nav block is byte-identical in every page that has it', () => {
    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
    const ref = navBlock('voice.html');
    expect(ref).toBeTruthy();
    for (const f of pages) {
      const b = navBlock(f);
      if (b === null) continue;
      expect(b === ref, f + ' nav drifted').toBe(true);
    }
  });
});

test.describe('phone viewport, touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('page loads with no errors; diagram + sketch modals open and close', async ({ page }) => {
    const errors = await load(page);
    const consoleErrs = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
    await setText(page, fence('flow', 'a: rect 0,0 100x50 | A\nb: rect 200,0 100x50 | B\na -> b'));
    await page.evaluate(() => openDiagram({ line: 0 }));
    await expect(page.locator('#diagram-modal')).toBeVisible();
    const bar = await page.evaluate(() => {
      const r = document.querySelector('#diagram-modal').getBoundingClientRect();
      return { w: r.width, sw: document.documentElement.scrollWidth };
    });
    expect(bar.w).toBeLessThanOrEqual(390 + 1);
    await page.evaluate(() => closeDiagram(true));
    await page.evaluate(() => openSketch());
    await expect(page.locator('#sketch-modal')).toBeVisible();
    await page.evaluate(() => closeSketch(true));
    await expect(page.locator('#sketch-modal')).toBeHidden();
    expect(errors).toEqual([]);
    expect(consoleErrs).toEqual([]);
  });

  test('sketch: a finger stroke (touch events) marks the ink layer', async ({ page }) => {
    await load(page);
    await page.evaluate(() => openSketch());
    const box = await page.locator('#sk-ink').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.evaluate(([x, y]) => {
      const el = document.getElementById('sk-ink');
      const mk = (type, dx) => new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x + dx, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
      el.dispatchEvent(mk('pointerdown', 0));
      for (let i = 1; i <= 10; i++) el.dispatchEvent(mk('pointermove', i * 6));
      el.dispatchEvent(mk('pointerup', 60));
    }, [cx, cy]);
    const ink = await page.evaluate(() => {
      const c = document.getElementById('sk-ink');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
      return n;
    });
    expect(ink).toBeGreaterThan(50);
  });

  test('mind map: a touch drag on a node moves it', async ({ page }) => {
    await load(page);
    await openBlock(page, 'mindmap', MM3);
    const before = await page.evaluate(() => document.querySelector('#dg-world .dg-mm-node')?.outerHTML.length);
    expect(before).toBeGreaterThan(0);
    const r = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('#dg-world .dg-mm-node')];
      const el = nodes[1] || nodes[0];
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });
    await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      const stage = document.getElementById('dg-stage');
      const ev = (t, dy) => (t === 'pointerdown' ? el : stage).dispatchEvent(new PointerEvent(t, { pointerId: 3, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y + dy, button: 0, buttons: t === 'pointerup' ? 0 : 1 }));
      ev('pointerdown', 0);
      for (let i = 1; i <= 8; i++) ev('pointermove', i * 8);
      ev('pointerup', 64);
    }, [r.x, r.y]);
    const txt = await page.evaluate(() => dgCanon());
    expect(txt).toMatch(/\{-?\d+,-?\d+/);
  });
});

test.describe('help text', () => {
  test('help body mentions sequence and the sketch in both languages', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const out = {};
      for (const l of ['ro', 'en']) {
        const h = I18N[l].helpBody;
        out[l] = /sequence/i.test(h) && /(sketch|schi)/i.test(h);
      }
      return out;
    });
    expect(r).toEqual({ ro: true, en: true });
  });
});

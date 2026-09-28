// bug-1 regression: the ◇ Diagram and ✏ Sketch modals are mutually exclusive and Tab stays inside
// whichever is open. Unlike the older toolbar-Tab tests in extra.spec.js these cannot pass vacuously:
// they assert where focus is after every Tab, and call the openers directly too.
const { test, expect } = require('@playwright/test');
const { load, setText } = require('./helpers');

const state = page => page.evaluate(() => ({ dg: dg.open, sk: sk.open }));
const inside = (page, id) => page.evaluate(id => !!document.activeElement && document.getElementById(id).contains(document.activeElement), id);

test.describe('bug-1: one full-screen modal at a time', () => {
  test.beforeEach(async ({ page }) => { await load(page); await setText(page, ''); });

  test('openSketch() is refused while the diagram is open', async ({ page }) => {
    await page.click('#btn-diagram');
    await page.evaluate(() => openSketch());
    expect(await state(page)).toEqual({ dg: true, sk: false });
    expect(await page.evaluate(() => document.getElementById('sketch-modal').hidden)).toBe(true);
  });

  test('openDiagram() is refused while the sketch is open', async ({ page }) => {
    await page.click('#btn-sketch');
    await page.evaluate(() => openDiagram());
    expect(await state(page)).toEqual({ dg: false, sk: true });
    expect(await page.evaluate(() => document.getElementById('diagram-modal').hidden)).toBe(true);
  });

  test('clicking the other toolbar button (via dispatched click) does nothing while a modal is open', async ({ page }) => {
    await page.click('#btn-diagram');
    await page.evaluate(() => document.getElementById('btn-sketch').click());
    expect(await state(page)).toEqual({ dg: true, sk: false });
    await page.keyboard.press('Escape');
    await page.click('#btn-sketch');
    await page.evaluate(() => document.getElementById('btn-diagram').click());
    expect(await state(page)).toEqual({ dg: false, sk: true });
  });

  test('Tab and Shift+Tab never leave the diagram modal', async ({ page }) => {
    await page.click('#btn-diagram');
    for (let i = 0; i < 60; i++) { await page.keyboard.press('Tab'); expect(await inside(page, 'diagram-modal'), 'Tab #' + i).toBe(true); }
    for (let i = 0; i < 60; i++) { await page.keyboard.press('Shift+Tab'); expect(await inside(page, 'diagram-modal'), 'Shift+Tab #' + i).toBe(true); }
  });

  test('Tab and Shift+Tab never leave the sketch modal', async ({ page }) => {
    await page.click('#btn-sketch');
    for (let i = 0; i < 60; i++) { await page.keyboard.press('Tab'); expect(await inside(page, 'sketch-modal'), 'Tab #' + i).toBe(true); }
    for (let i = 0; i < 60; i++) { await page.keyboard.press('Shift+Tab'); expect(await inside(page, 'sketch-modal'), 'Shift+Tab #' + i).toBe(true); }
  });

  test('focus pushed onto the page behind is pulled back in by Tab, and Enter then opens nothing', async ({ page }) => {
    await page.click('#btn-diagram');
    await page.evaluate(() => document.getElementById('btn-sketch').focus());
    await page.keyboard.press('Tab');
    expect(await inside(page, 'diagram-modal')).toBe(true);
    await page.evaluate(() => document.getElementById('btn-sketch').focus());
    await page.keyboard.press('Enter');
    expect(await state(page)).toEqual({ dg: true, sk: false });
    await page.keyboard.press('Escape');
    await page.click('#btn-sketch');
    await page.evaluate(() => document.getElementById('btn-diagram').focus());
    await page.keyboard.press('Enter');
    expect(await state(page)).toEqual({ dg: false, sk: true });
  });

  test('a click on the empty toolbar area leaves focus on the page, and Escape still closes the modal', async ({ page }) => {
    for (const [btn, modal] of [['#btn-diagram', 'diagram-modal'], ['#btn-sketch', 'sketch-modal']]) {
      await page.click(btn);
      await page.click(`#${modal} .dg-spacer`);
      expect(await inside(page, modal), modal + ': the click left focus outside the modal').toBe(false);
      await page.keyboard.press('Escape');
      expect(await state(page), modal).toEqual({ dg: false, sk: false });
    }
  });

  test('after closing one modal the other opens normally, both ways', async ({ page }) => {
    await page.click('#btn-diagram');
    await page.keyboard.press('Escape');
    expect(await state(page)).toEqual({ dg: false, sk: false });
    await page.click('#btn-sketch');
    expect(await state(page)).toEqual({ dg: false, sk: true });
    await page.keyboard.press('Escape');
    await page.click('#btn-diagram');
    expect(await state(page)).toEqual({ dg: true, sk: false });
  });

  test('an image sketch that was loading when the diagram opened does not open on top', async ({ page }) => {
    await page.evaluate(() => { const i = new Image(); i.id = 'px'; i.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA='; document.getElementById('preview').appendChild(i); });
    await page.evaluate(() => { window.__p = openSketch({ img: document.getElementById('px') }); openDiagram(); });
    await page.evaluate(() => window.__p);
    expect(await state(page)).toEqual({ dg: true, sk: false });
  });
});

// ✏ Sketch modal and the ✎-on-picture flow.
const { test, expect } = require('@playwright/test');
const { load, setText, drag } = require('./helpers');

let errors;
test.beforeEach(async ({ page }) => { errors = await load(page); });
test.afterEach(() => { expect(errors, 'page errors').toEqual([]); });

// a solid PNG data URL of the given size, made in the page
const pngUrl = (page, w, h, color = '#3366cc') => page.evaluate(([w, h, c]) => {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, w, h);
  return cv.toDataURL('image/png');
}, [w, h, color]);

const inkBox = page => page.locator('#sk-ink').boundingBox();
async function strokeAcross(page, fy = 0.5, fx0 = 0.2, fx1 = 0.8) {
  const b = await inkBox(page);
  await drag(page, { x: b.x + b.width * fx0, y: b.y + b.height * fy }, { x: b.x + b.width * fx1, y: b.y + b.height * fy }, 12);
  return b;
}
// alpha and rgb of the ink layer at a fraction of the bitmap
const inkPx = (page, fx, fy) => page.evaluate(([fx, fy]) => {
  const c = document.getElementById('sk-ink');
  return [...c.getContext('2d').getImageData(Math.round(c.width * fx), Math.round(c.height * fy), 1, 1).data];
}, [fx, fy]);
const basePx = (page, fx, fy) => page.evaluate(([fx, fy]) => {
  const c = document.getElementById('sk-base');
  return [...c.getContext('2d').getImageData(Math.round(c.width * fx), Math.round(c.height * fy), 1, 1).data];
}, [fx, fy]);
const openNew = async page => { await page.click('#btn-sketch'); await page.waitForSelector('#sketch-modal:not([hidden])'); };

test.describe('new sketch', () => {
  test('toolbar button sits right after ◇ Diagram and opens a 1600×1000 white page', async ({ page }) => {
    const order = await page.evaluate(() => { const b = document.getElementById('btn-diagram'); return b.nextElementSibling && b.nextElementSibling.id; });
    expect(order).toBe('btn-sketch');
    await openNew(page);
    expect(await page.evaluate(() => [sk.w, sk.h, document.getElementById('sk-base').width, document.getElementById('sk-ink').height])).toEqual([1600, 1000, 1600, 1000]);
    expect(await basePx(page, 0.5, 0.5)).toEqual([255, 255, 255, 255]);
    expect(await page.locator('#sk-title').textContent()).toBe(await page.evaluate(() => t('skTitleNew')));
    expect(await page.locator('#sk-apply').textContent()).toBe(await page.evaluate(() => t('dgInsert')));
    expect(await page.locator('#sk-colors [data-color]').count()).toBe(6);
    expect(await page.locator('#sk-undo').isDisabled()).toBe(true);
    expect(await page.locator('#sk-redo').isDisabled()).toBe(true);
    // both canvases have the same CSS box
    const [a, b] = await page.evaluate(() => ['sk-base', 'sk-ink'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); }));
    expect(a).toEqual(b);
  });

  test('a mouse stroke lands on the ink layer in the chosen colour; base stays white', async ({ page }) => {
    await openNew(page);
    await strokeAcross(page);
    const p = await inkPx(page, 0.5, 0.5);
    expect(p.slice(0, 3)).toEqual([0x1e, 0x1d, 0x1c]);
    expect(p[3]).toBe(255);
    expect(await basePx(page, 0.5, 0.5)).toEqual([255, 255, 255, 255]);
    expect(await inkPx(page, 0.5, 0.05)).toEqual([0, 0, 0, 0]);
  });

  test('each of the 6 colours draws in that colour', async ({ page }) => {
    await openNew(page);
    const cols = await page.locator('#sk-colors [data-color]').evaluateAll(bs => bs.map(b => b.dataset.color));
    expect(cols).toEqual(['#1e1d1c', '#3f6b52', '#b5493a', '#c79a3d', '#2f5d8a', '#7a4fae']);
    for (let i = 0; i < 6; i++) {
      await page.click(`#sk-colors [data-color]:nth-child(${i + 1})`);
      await strokeAcross(page, 0.1 + i * 0.12);
      const p = await inkPx(page, 0.5, 0.1 + i * 0.12);
      const hex = '#' + p.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
      expect(hex).toBe(cols[i]);
    }
    expect(await page.locator('#sk-colors .active').count()).toBe(1);
  });

  test('3 thicknesses: 3 / 6 / 12 bitmap px (default medium)', async ({ page }) => {
    await openNew(page);
    expect(await page.evaluate(() => sk.size)).toBe(2);
    const widths = [];
    for (const s of [1, 2, 3]) {
      await page.click(`#sk-sizes [data-sksize="${s}"]`);
      await strokeAcross(page, 0.2 + s * 0.2);
      widths.push(await page.evaluate(([s]) => {
        const c = document.getElementById('sk-ink'), x = c.getContext('2d');
        const cx = Math.round(c.width / 2), cy = Math.round(c.height * (0.2 + s * 0.2));
        const col = x.getImageData(cx, cy - 30, 1, 60).data;
        let n = 0; for (let i = 3; i < col.length; i += 4) if (col[i] > 128) n++;
        return [n, sk.strokes[sk.strokes.length - 1].size, skWidth(sk.strokes[sk.strokes.length - 1])];
      }, [s]));
    }
    expect(widths.map(w => w[2])).toEqual([3, 6, 12]);
    expect(widths[0][0]).toBeGreaterThanOrEqual(2); expect(widths[0][0]).toBeLessThanOrEqual(5);
    expect(widths[1][0]).toBeGreaterThanOrEqual(5); expect(widths[1][0]).toBeLessThanOrEqual(8);
    expect(widths[2][0]).toBeGreaterThanOrEqual(11); expect(widths[2][0]).toBeLessThanOrEqual(14);
  });

  test('undo / redo by buttons and by Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y; buttons enable and disable', async ({ page }) => {
    await openNew(page);
    await strokeAcross(page, 0.3); await strokeAcross(page, 0.6);
    expect(await page.evaluate(() => sk.strokes.length)).toBe(2);
    expect(await page.locator('#sk-undo').isEnabled()).toBe(true);
    await page.click('#sk-undo');
    expect(await page.evaluate(() => sk.strokes.length)).toBe(1);
    expect(await inkPx(page, 0.5, 0.6)).toEqual([0, 0, 0, 0]);
    expect(await page.locator('#sk-redo').isEnabled()).toBe(true);
    await page.click('#sk-redo');
    expect((await inkPx(page, 0.5, 0.6))[3]).toBe(255);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => sk.strokes.length)).toBe(0);
    expect(await page.locator('#sk-undo').isDisabled()).toBe(true);
    await page.keyboard.press('Control+Shift+z');
    expect(await page.evaluate(() => sk.strokes.length)).toBe(1);
    await page.keyboard.press('Control+y');
    expect(await page.evaluate(() => sk.strokes.length)).toBe(2);
    await page.keyboard.press('Control+y');            // nothing to redo: no crash
    expect(await page.evaluate(() => sk.strokes.length)).toBe(2);
    await strokeAcross(page, 0.8);                      // a new stroke clears redo
    await page.click('#sk-undo'); await strokeAcross(page, 0.9);
    expect(await page.locator('#sk-redo').isDisabled()).toBe(true);
  });

  test('undo shortcuts inside the sketch never touch the markdown editor', async ({ page }) => {
    await setText(page, 'hello');
    await page.click('#editor'); await page.keyboard.press('End'); await page.keyboard.type(' world');
    await openNew(page);
    await strokeAcross(page);
    await page.keyboard.press('Control+z');
    await page.keyboard.type('pheh');       // tool keys must not type into the note
    expect(await page.evaluate(() => editor.value)).toBe('hello world');
  });

  test('P / H / E switch tools', async ({ page }) => {
    await openNew(page);
    await page.keyboard.press('h'); expect(await page.evaluate(() => sk.tool)).toBe('hl');
    await page.keyboard.press('e'); expect(await page.evaluate(() => sk.tool)).toBe('eraser');
    await page.keyboard.press('p'); expect(await page.evaluate(() => sk.tool)).toBe('pen');
    await page.keyboard.press('E'); expect(await page.evaluate(() => sk.tool)).toBe('eraser');
    expect(await page.locator('#sk-tools .active').getAttribute('data-sktool')).toBe('eraser');
  });

  test('highlighter: translucent (0.4) and it does not darken where the same stroke crosses itself', async ({ page }) => {
    await openNew(page);
    await page.click('#sk-tools [data-sktool="hl"]');
    const b = await inkBox(page);
    const y = b.y + b.height * 0.5;
    await page.mouse.move(b.x + b.width * 0.2, y); await page.mouse.down();
    for (let i = 0; i <= 10; i++) await page.mouse.move(b.x + b.width * (0.2 + 0.06 * i), y);
    for (let i = 10; i >= 0; i--) await page.mouse.move(b.x + b.width * (0.2 + 0.06 * i), y + 1);
    await page.mouse.up();
    const a = (await inkPx(page, 0.5, 0.5))[3];
    expect(a).toBeGreaterThan(80); expect(a).toBeLessThan(125);   // 0.4 × 255 ≈ 102, not ~150 (two passes)
    const w = await page.evaluate(() => skWidth(sk.strokes[0]));
    expect(w).toBe(6 * 3);
  });

  test('eraser removes ink only, never the base', async ({ page }) => {
    await openNew(page);
    await page.click('#sk-sizes [data-sksize="3"]');
    await strokeAcross(page, 0.5);
    expect((await inkPx(page, 0.5, 0.5))[3]).toBe(255);
    await page.keyboard.press('e');
    await strokeAcross(page, 0.5, 0.3, 0.7);
    expect(await inkPx(page, 0.5, 0.5)).toEqual([0, 0, 0, 0]);
    expect(await basePx(page, 0.5, 0.5)).toEqual([255, 255, 255, 255]);
    expect(await page.evaluate(() => skWidth(sk.strokes[1]))).toBe(36);
  });

  test('a single click (no move) leaves a dot; a right-button press draws nothing', async ({ page }) => {
    await openNew(page);
    const b = await inkBox(page);
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    expect(await page.evaluate(() => sk.strokes.length)).toBe(1);
    expect((await inkPx(page, 0.5, 0.5))[3]).toBeGreaterThan(200);
    await page.mouse.click(b.x + b.width / 4, b.y + b.height / 4, { button: 'right' });
    expect(await page.evaluate(() => sk.strokes.length)).toBe(1);
  });

  test('a second simultaneous pointer cancels the stroke in progress (no stroke stored)', async ({ page }) => {
    await openNew(page);
    const r = await page.evaluate(() => {
      const st = document.getElementById('sk-stage'), b = document.getElementById('sk-ink').getBoundingClientRect();
      const ev = (type, id, dx) => st.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: b.left + 50 + dx, clientY: b.top + 50, bubbles: true, isPrimary: id === 1, button: 0 }));
      ev('pointerdown', 1, 0); ev('pointermove', 1, 20); ev('pointerdown', 2, 100); ev('pointermove', 1, 40); ev('pointerup', 1, 40); ev('pointerup', 2, 100);
      const n = sk.strokes.length;
      ev('pointerdown', 3, 0); ev('pointermove', 3, 30); ev('pointerup', 3, 30);   // a fresh single touch draws again
      return [n, sk.strokes.length];
    });
    expect(r).toEqual([0, 1]);
  });

  test('pen and touch pointer types draw', async ({ page }) => {
    await openNew(page);
    const n = await page.evaluate(() => {
      const st = document.getElementById('sk-stage'), b = document.getElementById('sk-ink').getBoundingClientRect();
      for (const [i, type] of ['pen', 'touch'].entries()) {
        const ev = (t, x) => st.dispatchEvent(new PointerEvent(t, { pointerId: 10 + i, pointerType: type, clientX: b.left + 40 + x, clientY: b.top + 60 + i * 30, bubbles: true, button: 0, pressure: 0.9 }));
        ev('pointerdown', 0); ev('pointermove', 30); ev('pointermove', 60); ev('pointerup', 60);
      }
      return sk.strokes.length;
    });
    expect(n).toBe(2);
  });

  test('Cancel / Esc with no strokes closes silently; with strokes it asks and honours "no"', async ({ page }) => {
    let asked = 0, answer = false;
    page.removeAllListeners('dialog');
    page.on('dialog', d => { asked++; answer ? d.accept() : d.dismiss(); });
    await openNew(page);
    await page.click('#sk-cancel');
    expect(asked).toBe(0);
    expect(await page.locator('#sketch-modal').isHidden()).toBe(true);
    await openNew(page); await strokeAcross(page);
    await page.keyboard.press('Escape');
    expect(asked).toBe(1);
    expect(await page.locator('#sketch-modal').isVisible()).toBe(true);
    await page.click('#sk-cancel');
    expect(asked).toBe(2);
    expect(await page.locator('#sketch-modal').isVisible()).toBe(true);
    answer = true;
    await page.keyboard.press('Escape');
    expect(await page.locator('#sketch-modal').isHidden()).toBe(true);
    expect(await page.evaluate(() => editor.value)).toBe('');
  });

  test('Insert writes ![Schiță n](data:…) at the caret with newline padding; n counts existing sketches; one markdown undo step', async ({ page }) => {
    await setText(page, 'before after', 7);
    await openNew(page);
    await strokeAcross(page);
    await page.click('#sk-apply'); await expect(page.locator('#sketch-modal')).toBeHidden();
    await expect(page.locator('#sketch-modal')).toBeHidden();
    let v = await page.evaluate(() => editor.value);
    // the caret was after "before " (with its space): a newline is added before and after the picture
    expect(v).toMatch(/^before \n!\[Schiță 1\]\(data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+\)\nafter$/);
    await openNew(page);
    await page.click('#sk-apply'); await expect(page.locator('#sketch-modal')).toBeHidden();
    v = await page.evaluate(() => editor.value);
    expect(v).toContain('![Schiță 2](data:');
    expect(await page.locator('#preview img').count()).toBe(2);
    // one setRangeText → one undo step
    await page.click('#editor');
    await page.keyboard.press('Control+z');
    v = await page.evaluate(() => editor.value);
    expect(v).toContain('![Schiță 1](data:');
    expect(v).not.toContain('Schiță 2');
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => editor.value)).toBe('before after');
  });

  test('the inserted picture is the sketch (1.6 aspect, ink visible, white paper)', async ({ page }) => {
    await openNew(page);
    await page.click('#sk-colors [data-color]:nth-child(3)');
    await strokeAcross(page);
    await page.click('#sk-apply'); await expect(page.locator('#sketch-modal')).toBeHidden();
    await expect(page.locator('#sketch-modal')).toBeHidden();
    const r = await page.evaluate(async () => {
      const m = editor.value.match(/\((data:[^)]+)\)/)[1];
      const img = new Image(); img.src = m; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const px = (fx, fy) => [...x.getImageData(Math.round(c.width * fx), Math.round(c.height * fy), 1, 1).data];
      return { w: img.naturalWidth, h: img.naturalHeight, ink: px(0.5, 0.5), paper: px(0.5, 0.05) };
    });
    expect(r.w / r.h).toBeCloseTo(1.6, 1);
    expect(r.paper.slice(0, 3).every(v => v > 245)).toBe(true);
    expect(r.ink[0]).toBeGreaterThan(150); expect(r.ink[1]).toBeLessThan(120);   // #b5493a, allowing JPEG
  });

  test('sketch modal in both languages: no missing labels', async ({ page }) => {
    for (const lang of ['ro', 'en']) {
      await page.evaluate(l => { const old = UI; window.__old = old; UI = l; }, lang);
      await openNew(page);
      const txt = await page.evaluate(() => [...document.querySelectorAll('#sketch-modal [data-i], #sketch-modal [data-i-title]')].map(e => (e.textContent || '') + '|' + (e.title || '')).join(' '));
      expect(txt).not.toContain('undefined');
      await page.click('#sk-cancel');
    }
  });
});

test.describe('skImageTokens', () => {
  test('finds inline pictures and embeds in order, skips fenced code, keeps offsets exact', async ({ page }) => {
    const md = '![a](x.png "t")\ntext ![[pic.jpg|300]] and ![b b](y.png)\n```\n![no](z.png)\n```\n![[note]] ![[dir/deep.webp]]\n![c](data:image/png;base64,AAA)';
    const r = await page.evaluate(md => skImageTokens(md).map(k => [md.slice(k.start, k.end), k.src, k.alt, k.embed]), md);
    expect(r).toEqual([
      ['![a](x.png "t")', 'x.png', 'a', false],
      ['![[pic.jpg|300]]', 'pic.jpg', 'pic', true],
      ['![b b](y.png)', 'y.png', 'b b', false],
      ['![[dir/deep.webp]]', 'dir/deep.webp', 'deep', true],
      ['![c](data:image/png;base64,AAA)', 'data:image/png;base64,AAA', 'c', false],
    ]);
  });

  test('empty text, unclosed fence, adjacent tokens', async ({ page }) => {
    const r = await page.evaluate(() => [skImageTokens('').length, skImageTokens('```\n![a](b.png)').length, skImageTokens('![a](b.png)![c](d.png)').length]);
    expect(r).toEqual([0, 0, 2]);
  });
});

test.describe('✎ on a picture already in the chapter', () => {
  async function withPicture(page, extra = '') {
    const url = await pngUrl(page, 300, 200);
    await setText(page, `intro\n\n![photo](${url})\n\noutro${extra}`);
    await page.waitForSelector('#preview img'); await page.waitForTimeout(700);
    return url;
  }

  test('hovering a picture shows ✎ at its top-right corner; leaving hides it; diagrams never get it', async ({ page }) => {
    await withPicture(page);
    const btn = page.locator('#img-draw-btn');
    await expect(btn).toBeHidden();
    await page.locator('#preview img').first().hover();
    await expect(btn).toBeVisible();
    const [ib, bb] = await page.evaluate(() => [document.querySelector('#preview img').getBoundingClientRect(), document.getElementById('img-draw-btn').getBoundingClientRect()].map(r => ({ l: r.left, t: r.top, r: r.right, b: r.bottom })));
    expect(Math.abs(bb.r - (ib.r - 6))).toBeLessThan(3);
    expect(Math.abs(bb.t - (ib.t + 6))).toBeLessThan(3);
    await page.mouse.move(5, 5);
    await expect(btn).toBeHidden();
    // typing rebuilds the preview: the button goes away
    await page.locator('#preview img').first().hover();
    await expect(btn).toBeVisible();
    await page.evaluate(() => { updatePreview(); });
    await expect(btn).toBeHidden();
  });

  test('the ✎ button can be reached with the mouse without the button vanishing', async ({ page }) => {
    await withPicture(page);
    await page.locator('#preview img').first().hover();
    const b = await page.locator('#img-draw-btn').boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
    await expect(page.locator('#img-draw-btn')).toBeVisible();
  });

  test('a diagram in the chapter has no ✎ (its SVG is not a picture)', async ({ page }) => {
    await setText(page, '```flow\na -> b\n```');
    await page.locator('#preview figure svg').hover();
    await expect(page.locator('#img-draw-btn')).toBeHidden();
  });

  test('scrolling hides it', async ({ page }) => {
    const url = await pngUrl(page, 300, 200);
    await setText(page, `![p](${url})\n\n` + 'line\n\n'.repeat(120));
    await page.waitForTimeout(700);
    await page.locator('#preview img').first().hover();
    await expect(page.locator('#img-draw-btn')).toBeVisible();
    await page.evaluate(() => { const p = document.getElementById('preview'); (p.scrollHeight > p.clientHeight ? p : document.scrollingElement).dispatchEvent(new Event('scroll')); window.dispatchEvent(new Event('scroll')); });
    await page.evaluate(() => document.getElementById('preview').scrollTop = 200);
    await expect(page.locator('#img-draw-btn')).toBeHidden();
  });

  test('click ✎ → modal titled "edit", the bitmap is the picture, Update replaces that picture only (one undo step)', async ({ page }) => {
    const url = await withPicture(page);
    const before = await page.evaluate(() => editor.value);
    await page.locator('#preview img').first().hover();
    await page.click('#img-draw-btn');
    await page.waitForSelector('#sketch-modal:not([hidden])');
    expect(await page.evaluate(() => [sk.w, sk.h])).toEqual([300, 200]);
    expect(await page.locator('#sk-title').textContent()).toBe(await page.evaluate(() => t('skTitleEdit')));
    expect(await page.locator('#sk-apply').textContent()).toBe(await page.evaluate(() => t('dgUpdate')));
    expect(await basePx(page, 0.5, 0.5)).toEqual([0x33, 0x66, 0xcc, 255]);
    await strokeAcross(page);
    await page.click('#sk-apply'); await expect(page.locator('#sketch-modal')).toBeHidden();
    await expect(page.locator('#sketch-modal')).toBeHidden();
    const after = await page.evaluate(() => editor.value);
    expect(after.startsWith('intro\n\n![photo](data:image/')).toBe(true);
    expect(after.endsWith(')\n\noutro')).toBe(true);
    expect(after).not.toContain(url);
    expect((after.match(/!\[/g) || []).length).toBe(1);
    await page.click('#editor');
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => editor.value)).toBe(before);
  });

  test('with the same picture twice, drawing on the second replaces the second token', async ({ page }) => {
    const url = await pngUrl(page, 120, 80);
    await setText(page, `![one](${url})\n\n![two](${url})`);
    await page.waitForSelector('#preview img'); await page.waitForTimeout(700);
    expect(await page.locator('#preview img').count()).toBe(2);
    await page.locator('#preview img').nth(1).hover();
    await page.click('#img-draw-btn');
    await page.waitForSelector('#sketch-modal:not([hidden])');
    await strokeAcross(page);
    await page.click('#sk-apply'); await expect(page.locator('#sketch-modal')).toBeHidden();
    const v = await page.evaluate(() => editor.value);
    expect(v.startsWith(`![one](${url})`)).toBe(true);
    expect(v).toContain('![two](data:');
    expect(v).not.toContain(`![two](${url})`);
  });

  test('a big picture is scaled so its long side is ≤ 2400 and the pen width scales with it', async ({ page }) => {
    const url = await pngUrl(page, 4800, 2400);
    await setText(page, `![big](${url})`);
    await page.waitForSelector('#preview img'); await page.waitForTimeout(700);
    await page.locator('#preview img').first().hover();
    await page.click('#img-draw-btn');
    await page.waitForSelector('#sketch-modal:not([hidden])');
    expect(await page.evaluate(() => [sk.w, sk.h])).toEqual([2400, 1200]);
    await strokeAcross(page);
    expect(await page.evaluate(() => skWidth(sk.strokes[0]))).toBeCloseTo(6 * 1.5, 5);
  });

  test('a small picture keeps its natural size and never gets a factor below 1', async ({ page }) => {
    const url = await pngUrl(page, 40, 30);
    await setText(page, `![s](${url})`);
    await page.waitForSelector('#preview img'); await page.waitForTimeout(700);
    // (the ✎ button is as big as such a picture, so open it the way the button does)
    await page.evaluate(() => openSketch({ img: document.querySelector('#preview img') }));
    await page.waitForSelector('#sketch-modal:not([hidden])');
    expect(await page.evaluate(() => [sk.w, sk.h, sk.f])).toEqual([40, 30, 1]);
  });

  test('an unreadable picture does not open the modal and toasts skImgBlocked', async ({ page }) => {
    await page.route('https://example.invalid/**', r => r.abort());
    await setText(page, '![x](https://example.invalid/a.png)');
    await page.evaluate(() => { window.__toasts = []; ScuLaFolder.toast = m => window.__toasts.push(m); });
    await page.waitForSelector('#preview img'); await page.waitForTimeout(700);
    await page.locator('#preview img').first().hover({ force: true });
    await page.evaluate(() => document.getElementById('img-draw-btn').click());
    await expect.poll(() => page.evaluate(() => window.__toasts.length)).toBe(1);
    expect(await page.evaluate(() => window.__toasts[0] === t('skImgBlocked'))).toBe(true);
    expect(await page.locator('#sketch-modal').isHidden()).toBe(true);
  });

  // (Playwright's route.fulfill bypasses the browser's CORS check, so the "no CORS header
  // → tainted → refused" half of the rule cannot be reproduced here; the abort test above
  // covers the "cannot be loaded → toast, no modal" half.)
  test('a remote picture served with CORS headers opens and can be saved back into the chapter', async ({ page }) => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await page.route('https://pics.example/**', r => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: png }));
    await setText(page, '![x](https://pics.example/a.png)');
    await page.waitForSelector('#preview img'); await page.waitForTimeout(700);
    await page.locator('#preview img').first().hover({ force: true });
    await page.evaluate(() => document.getElementById('img-draw-btn').click());
    await expect.poll(() => page.evaluate(() => sk.open)).toBe(true);
    await page.click('#sk-apply'); await expect(page.locator('#sketch-modal')).toBeHidden();
    await expect(page.locator('#sketch-modal')).toBeHidden();
    expect(await page.evaluate(() => editor.value)).toMatch(/^!\[x\]\(data:image\//);
  });

  test('picture edited while the modal is open elsewhere in the text: the token is re-found, not clobbered', async ({ page }) => {
    const url = await withPicture(page);
    await page.locator('#preview img').first().hover();
    await page.click('#img-draw-btn');
    await page.waitForSelector('#sketch-modal:not([hidden])');
    await strokeAcross(page);   // (an untouched picture re-encodes to the very same PNG)
    await page.evaluate(() => { editor.value = 'NEW LINE ABOVE\n' + editor.value; });
    await page.click('#sk-apply'); await expect(page.locator('#sketch-modal')).toBeHidden();
    const v = await page.evaluate(() => editor.value);
    expect(v.startsWith('NEW LINE ABOVE\nintro')).toBe(true);
    expect(v).toContain('![photo](data:image/');
    expect(v).not.toContain(url);
  });

  test('if the picture token was deleted meanwhile, the sketch is inserted at the caret and the user is told', async ({ page }) => {
    await withPicture(page);
    await page.evaluate(() => { window.__toasts = []; ScuLaFolder.toast = m => window.__toasts.push(m); });
    await page.locator('#preview img').first().hover();
    await page.click('#img-draw-btn');
    await page.waitForSelector('#sketch-modal:not([hidden])');
    await page.evaluate(() => { editor.value = 'gone'; editor.setSelectionRange(4, 4); });
    await page.click('#sk-apply'); await expect(page.locator('#sketch-modal')).toBeHidden();
    const v = await page.evaluate(() => editor.value);
    expect(v).toMatch(/^gone\n!\[/);
    expect(await page.evaluate(() => window.__toasts.length)).toBeGreaterThan(0);
  });
});

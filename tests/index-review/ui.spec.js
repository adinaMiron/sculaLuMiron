const { test, expect, edit, seed, capture } = require('./helpers');

for (const [width, height, lang] of [[1440, 900, 'en'], [390, 844, 'ro'], [320, 640, 'ro'], [844, 390, 'en']]) {
  test(`writing layout ${width}x${height} ${lang}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.evaluate(lang => window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: lang })), lang);
    await seed(page);
    await edit(page, '# Weekly plan\n\nWrite, save, and review.\n\n- [ ] Ana>> !important Write a note\n- [x] Finished task\n\n## Details\nReadable content with **emphasis**.');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    await capture(page, info, `writing-${width}-${lang}`);
    const rect = await page.locator('#editor').boundingBox();
    expect(rect.height).toBeGreaterThan(100);
    expect(rect.y + rect.height).toBeLessThanOrEqual(height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test('Gantt at 320px leaves a visible, usable timeline beside the labels', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await edit(page, '- [ ] First start@2026-10-01 end@2026-10-03\n- [x] Second start@2026-10-04 end@2026-10-05');
  await page.evaluate(() => openGantt());
  await capture(page, info, 'gantt-320');
  const geometry = await page.evaluate(() => {
    const body = document.querySelector('.gantt-body').getBoundingClientRect();
    const labels = document.querySelector('.gantt-labels').getBoundingClientRect();
    return { bodyWidth: body.width, labelWidth: labels.width, availableChart: body.width - labels.width };
  });
  expect(geometry.availableChart, JSON.stringify(geometry)).toBeGreaterThanOrEqual(80);
});

test('Gantt Tab stays within the dialog and Escape restores the opener', async ({ page }) => {
  await edit(page, '- [ ] A task start@2026-10-01 end@2026-10-03');
  await page.locator('#btn-gantt').click();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.getElementById('gantt-modal').contains(document.activeElement)), `Tab ${i + 1}`).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#btn-gantt')).toBeFocused();
});

test('Romanian table controls are localized', async ({ page }) => {
  await page.evaluate(() => { UI = 'ro'; applyUILang(); openTableModal(); });
  const labels = await page.locator('#table-preview-grid input, #table-preview-grid option').evaluateAll(elements =>
    elements.map(e => e.placeholder || e.textContent));
  expect(labels.filter(x => /Header|Cell|Left|Center|Right/.test(x))).toEqual([]);
});

test('table dialog remains usable at its supported maximum dimensions on a phone', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => openTableModal());
  await page.locator('#tbl-rows').fill('20');
  await page.locator('#tbl-cols').fill('10');
  await capture(page, info, 'table-390');
  const dimensions = await page.locator('#table-modal .table-modal-box').boundingBox();
  expect(dimensions.x).toBeGreaterThanOrEqual(0);
  expect(dimensions.x + dimensions.width).toBeLessThanOrEqual(391);
  const button = page.locator('[onclick="insertTable()"]');
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeInViewport();
});

test('Find keyboard shortcut can close and reopen search while its query has focus', async ({ page }) => {
  await page.locator('#editor').focus();
  await page.keyboard.press('Control+4');
  await expect(page.locator('#find-q')).toBeFocused();
  await page.keyboard.press('Control+4');
  await expect(page.locator('#find-panel')).toHaveClass(/collapsed/);
  await page.keyboard.press('Control+4');
  await expect(page.locator('#find-panel')).not.toHaveClass(/collapsed/);
});

test('Gantt Escape alone restores focus to its opener', async ({ page }) => {
  await edit(page, '- [ ] Task');
  await page.locator('#btn-gantt').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#btn-gantt')).toBeFocused();
});

test('table placeholders meet the documented small-text contrast floor', async ({ page }, info) => {
  await page.evaluate(() => openTableModal());
  const result = await page.locator('#table-preview-grid input[data-row="0"]').first().evaluate(el => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const color = value => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
    const fg = color(getComputedStyle(el, '::placeholder').color);
    const bg = color(getComputedStyle(el.closest('.table-modal-box')).backgroundColor);
    const luminance = c => c.slice(0, 3).map(x => x / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
      .reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
    const a = luminance(fg), b = luminance(bg);
    return { fg, bg, opacity: getComputedStyle(el, '::placeholder').opacity,
      ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
  });
  await info.attach('placeholder-contrast', { body: JSON.stringify(result), contentType: 'application/json' });
  expect(result.ratio, JSON.stringify(result)).toBeGreaterThanOrEqual(4.5);
});

test.describe('touch table builder', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('dynamic table cells and alignment selects meet the 44px touch floor', async ({ page }) => {
    await page.evaluate(() => openTableModal());
    const sizes = await page.locator('#table-preview-grid input, #table-preview-grid select').evaluateAll(elements =>
      elements.map(e => ({ tag: e.tagName, width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height })));
    expect(sizes.filter(r => r.width < 44 || r.height < 44)).toEqual([]);
  });
});

test('desktop navigation reaches the first preview heading after visiting the last', async ({ page }) => {
  await edit(page, '# First\n\n' + Array.from({ length: 80 }, (_, i) => 'Line ' + i + ' text '.repeat(30)).join('\n') + '\n\n# Last\nEnd');
  await page.locator('#nav-tree .nav-item').last().click();
  await expect.poll(() => page.locator('#preview').evaluate(e => e.scrollTop)).toBeGreaterThan(1000);
  await page.locator('#nav-tree .nav-item').first().click();
  await expect.poll(() => page.locator('#preview').evaluate(e => e.scrollTop)).toBeLessThan(200);
});

test('selected search counts have readable contrast after their color transition settles', async ({ page }, info) => {
  await edit(page, '- [ ] Searchable task #review\nSearchable text #review');
  await page.locator('#btn-find').click();
  await page.locator('#find-q').fill('Searchable');
  const chip = page.locator('.find-chip').first();
  await chip.evaluate(e => e.classList.add('on'));
  await page.waitForTimeout(250); // actual CSS transition, not arbitrary render waiting
  const result = await chip.evaluate(el => {
    const text = el.querySelector('.find-n') || el;
    const c = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luminance = rgb => rgb.map(x => x / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
      .reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
    const fg = getComputedStyle(text).color, bg = getComputedStyle(el).backgroundColor;
    const a = luminance(c(fg)), b = luminance(c(bg));
    return { fg, bg, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
  });
  await info.attach('settled-search-contrast', { body: JSON.stringify(result), contentType: 'application/json' });
  expect(result.ratio, JSON.stringify(result)).toBeGreaterThanOrEqual(4.5);
});

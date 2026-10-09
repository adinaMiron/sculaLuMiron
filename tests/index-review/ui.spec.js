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

test('Gantt at 320px leaves a visible, usable timeline beside the labels', { tag: '@idx-gantt-phone-chart' }, async ({ page }, info) => {
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
  expect(geometry.availableChart, JSON.stringify(geometry)).toBeGreaterThanOrEqual(geometry.bodyWidth * 0.6 - 1);
});

for (const width of [320, 390, 700, 701, 1440]) {
  test(`Gantt labels preserve chart space and row navigation with long text at ${width}px`, { tag: '@idx-gantt-phone-chart' }, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    const title = 'LongTaskTitle'.repeat(20);
    const owner = Array(4).fill('ResponsiblePerson').join(' ');
    const source = Array.from({ length: 16 }, (_, i) =>
      `- [ ] ${owner}>> ${title}${i} start@2026-10-01 end@2026-11-30`).join('\n');
    await edit(page, source);
    await page.evaluate(() => openGantt());
    const geometry = () => page.evaluate(() => {
      const body = document.getElementById('gantt-body');
      const labels = document.getElementById('gantt-labels').getBoundingClientRect();
      const rect = body.getBoundingClientRect();
      return { bodyWidth: body.clientWidth, labelWidth: labels.width, labelLeft: labels.left, bodyLeft: rect.left,
        availableChart: body.clientWidth - labels.width, scrollLeft: body.scrollLeft,
        aligned: [...document.querySelectorAll('.gantt-label')].every((label, i) =>
          Math.abs(label.getBoundingClientRect().top - document.querySelectorAll('.gantt-row')[i].getBoundingClientRect().top) < 1),
        pageWidth: document.documentElement.scrollWidth };
    });
    const before = await geometry();
    expect(before.availableChart, JSON.stringify(before)).toBeGreaterThanOrEqual(80);
    if (width <= 700) {
      expect(before.availableChart).toBeGreaterThanOrEqual(before.bodyWidth * 0.6 - 1);
      expect(before.labelWidth).toBeLessThanOrEqual(170);
    } else {
      expect(before.labelWidth).toBe(280);
    }
    expect(before.pageWidth).toBeLessThanOrEqual(width);
    expect(before.aligned).toBe(true);
    await expect(page.locator('.gantt-label a').nth(1)).toHaveAttribute('title', title + '1');
    await expect(page.locator('.gantt-label').nth(1)).toHaveAttribute('title', new RegExp(owner));
    await page.locator('#gantt-body').evaluate(async body => {
      body.scrollLeft = 114;
      body.scrollTop = 68;
      await new Promise(requestAnimationFrame);
    });
    const after = await geometry();
    expect(after.scrollLeft).toBe(114);
    expect(after.labelLeft).toBeCloseTo(after.bodyLeft, 0);
    expect(after.labelWidth).toBe(before.labelWidth);
    expect(after.availableChart).toBe(before.availableChart);
    expect(after.aligned).toBe(true);
    const chartExposed = await page.locator('#gantt-body').evaluate(body => {
      const rect = body.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.right - 10, rect.top + 60);
      return document.getElementById('gantt-chart').contains(hit);
    });
    expect(chartExposed).toBe(true);
    await page.locator('.gantt-label a').nth(1).click();
    await expect(page.locator('#gantt-modal')).not.toHaveClass(/open/);
    expect(await page.locator('#editor').evaluate(el => el.selectionStart)).toBe(source.indexOf(source.split('\n')[1]));
  });
}

test('Gantt Tab stays within the dialog and Escape restores the opener', { tag: '@idx-gantt-dialog-focus' }, async ({ page }) => {
  await edit(page, '- [ ] A task start@2026-10-01 end@2026-10-03');
  await page.locator('#file-input').evaluate(el => { el.inert = true; });
  await page.locator('#btn-gantt').click();
  await expect(page.locator('#gantt-close')).toBeFocused();
  expect(await page.locator('#editor').evaluate(el => !!el.closest('[inert]'))).toBe(true);
  await page.locator('#editor').focus();
  await expect(page.locator('#gantt-close')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.gantt-label a').last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#gantt-close')).toBeFocused();
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press(key);
      expect(await page.evaluate(() => document.getElementById('gantt-modal').contains(document.activeElement)), `${key} ${i + 1}`).toBe(true);
    }
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#gantt-modal')).not.toHaveClass(/open/);
  await expect(page.locator('#btn-gantt')).toBeFocused();
  expect(await page.locator('#editor').evaluate(el => !!el.closest('[inert]'))).toBe(false);
  expect(await page.locator('#file-input').evaluate(el => el.inert)).toBe(true);
});

for (const close of ['button', 'backdrop', 'Escape']) {
  test(`Empty Gantt contains keyboard focus and restores its opener via ${close}`, { tag: '@idx-gantt-dialog-focus' }, async ({ page }) => {
    await edit(page, 'No tasks');
    await page.locator('#btn-gantt').click();
    for (const key of ['Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      expect(await page.locator('#gantt-modal').evaluate(el => el.contains(document.activeElement))).toBe(true);
    }
    if (close === 'button') await page.locator('#gantt-close').click();
    else if (close === 'backdrop') await page.locator('#gantt-modal').click({ position: { x: 2, y: 2 } });
    else await page.keyboard.press('Escape');
    await expect(page.locator('#gantt-modal')).not.toHaveClass(/open/);
    await expect(page.locator('#btn-gantt')).toBeFocused();
    expect(await page.locator('#editor').evaluate(el => !!el.closest('[inert]'))).toBe(false);
  });
}

test('Gantt recovers focus after covered dialogs close one layer at a time', { tag: '@idx-gantt-dialog-focus' }, async ({ page }) => {
  await edit(page, '- [ ] Task');
  await page.locator('#btn-gantt').click();
  for (const open of ['openHelpModal', 'openGraph']) {
    await page.evaluate(name => window[name](), open);
    await expect(page.locator('#gantt-modal')).toHaveJSProperty('inert', true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#gantt-modal')).toHaveClass(/open/);
    await expect(page.locator('#gantt-close')).toBeFocused();
    await expect(page.locator('#gantt-modal')).toHaveJSProperty('inert', false);
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

test('Find keyboard shortcut can close and reopen search while its query has focus', { tag: '@idx-find-keyboard-toggle' }, async ({ page }) => {
  await page.locator('#editor').focus();
  await page.keyboard.press('Control+4');
  await expect(page.locator('#find-q')).toBeFocused();
  await page.keyboard.press('Control+4');
  await expect(page.locator('#find-panel')).toHaveClass(/collapsed/);
  await page.keyboard.press('Control+4');
  await expect(page.locator('#find-panel')).not.toHaveClass(/collapsed/);
  await expect(page.locator('#find-q')).toBeFocused();
});

for (const shortcut of ['Meta+4', 'Control+Shift+F', 'Meta+Shift+F']) {
  test(`Find ${shortcut} focuses an open query, closes it and reopens search`, { tag: '@idx-find-keyboard-toggle' }, async ({ page }) => {
    await page.locator('#editor').focus();
    await page.keyboard.press(shortcut);
    await expect(page.locator('#find-q')).toBeFocused();
    await page.locator('#editor').focus();
    await page.keyboard.press(shortcut);
    await expect(page.locator('#find-panel')).not.toHaveClass(/collapsed/);
    await expect(page.locator('#find-q')).toBeFocused();
    await page.keyboard.press(shortcut);
    await expect(page.locator('#find-panel')).toHaveClass(/collapsed/);
    await page.keyboard.press(shortcut);
    await expect(page.locator('#find-panel')).not.toHaveClass(/collapsed/);
    await expect(page.locator('#find-q')).toBeFocused();
  });
}

test('Find shortcuts leave other editable fields and dialogs alone', { tag: '@idx-find-keyboard-toggle' }, async ({ page }) => {
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'review-other-input';
    document.body.append(input);
  });
  for (const target of ['#review-other-input', '#link-url', '#link-modal button']) {
    if (target === '#link-url') await page.evaluate(() => openLinkModal());
    await page.locator(target).first().focus();
    for (const shortcut of ['Control+4', 'Meta+4', 'Control+Shift+F', 'Meta+Shift+F']) {
      await page.keyboard.press(shortcut);
      await expect(page.locator('#find-panel')).toHaveClass(/collapsed/);
      await expect(page.locator(target).first()).toBeFocused();
    }
  }
  await expect(page.locator('#link-modal')).toHaveClass(/open/);
});

test('Gantt Escape alone restores focus to its opener', { tag: '@idx-gantt-dialog-focus' }, async ({ page }) => {
  await edit(page, '- [ ] Task');
  await page.locator('#btn-gantt').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#btn-gantt')).toBeFocused();
});

for (const palette of ['default', 'light tokens']) {
test(`table placeholders meet the documented small-text contrast floor${palette === 'default' ? '' : ' with light tokens'}`, { tag: '@idx-table-placeholder-contrast' }, async ({ page }, info) => {
  if (palette === 'light tokens') {
    // The page currently has only a dark theme. Override its semantic tokens
    // to verify placeholder colors follow the palette without adding a theme.
    await page.evaluate(() => {
      for (const [name, value] of Object.entries({
        '--bg': '#F3EEE1', '--surface': '#F3EEE1', '--surface-2': '#E8E5D6', '--text-2': '#526357',
      })) document.documentElement.style.setProperty(name, value);
    });
  }
  await page.evaluate(() => openTableModal());
  const results = [];
  for (const row of ['h', '0']) {
    const input = page.locator(`#table-preview-grid input[data-row="${row}"]`).first();
    await expect(input).toHaveValue('');
    await expect(input).toHaveAttribute('placeholder', /.+/);
    for (const focused of [false, true]) {
      if (focused) await input.focus();
      else await input.evaluate(el => el.blur());
      const result = await input.evaluate(el => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        const paint = value => { ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); };
        // Composite all real backgrounds, including the header surface and
        // translucent input focus tint, before measuring placeholder ink.
        paint('#fff');
        const ancestors = [];
        for (let node = el; node; node = node.parentElement) ancestors.unshift(node);
        for (const node of ancestors) paint(getComputedStyle(node).backgroundColor);
        const bg = [...ctx.getImageData(0, 0, 1, 1).data];
        const placeholder = getComputedStyle(el, '::placeholder');
        ctx.globalAlpha = Number(placeholder.opacity);
        paint(placeholder.color);
        const fg = [...ctx.getImageData(0, 0, 1, 1).data];
        const luminance = c => c.slice(0, 3).map(x => x / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
          .reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
        const a = luminance(fg), b = luminance(bg);
        return { fg, bg, opacity: placeholder.opacity, focused: document.activeElement === el,
          ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
      });
      results.push({ row, ...result });
      expect(result.focused).toBe(focused);
    }
  }
  await info.attach('placeholder-contrast', { body: JSON.stringify(results), contentType: 'application/json' });
  for (const result of results) expect(result.ratio, JSON.stringify(result)).toBeGreaterThanOrEqual(4.5);
});
}

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

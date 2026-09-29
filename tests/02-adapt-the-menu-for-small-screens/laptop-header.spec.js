const path = require('path');
const { test, expect } = require('@playwright/test');

const URL = 'file://' + path.join(__dirname, '..', '..', 'index.html');
const WIDTHS = [1025, 1280, 1366, 1440, 1536, 1600, 1601, 1920];
const CRUMB = 'Caietul ăâîșț despre capitole și idei foarte lungi '.repeat(3);
const FILE = 'capitol-ăâîșț-cu-un-nume-extrem-de-lung-'.repeat(4) + '.md';
const STATUS = 'Stare de sincronizare foarte lungă '.repeat(5);
const ROW_BUTTONS = [
  '[data-i="saveToWorkbookBtn"]', '#btn-wb-sync', '#btn-wb-cloud', '#btn-save-all-modified',
];

// Apply state after the language switch and its asynchronous Drive repaint.
async function fixture(page, lang, stress = false) {
  await page.goto(URL);
  await page.waitForFunction(() => typeof paintCloud === 'function' &&
    typeof t === 'function' && document.documentElement.lang === 'ro');
  await page.evaluate(() => document.fonts.ready);
  if (lang === 'en') {
    await page.locator('#navLangBtn').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  }
  await page.waitForFunction(() => !document.querySelector('#welcome-modal.open'));
  await page.evaluate(({ crumbText, fileText, statusText }) => {
    gsFolder = { id: 'test-folder', name: 'ScuLa' };
    gsLastAt = Date.now() - 86400000;
    paintCloud();
    document.getElementById('btn-map').hidden = false;
    const crumb = document.getElementById('wb-crumb');
    crumb.hidden = false;
    crumb.textContent = crumbText;
    document.getElementById('current-file').textContent = fileText;
    if (statusText) document.querySelector('#wb-cloud-where a').textContent = statusText;
  }, { crumbText: CRUMB, fileText: FILE, statusText: stress ? STATUS : null });
  await page.waitForTimeout(30); // paintCloud runs on a queued language event
  if (stress) await page.locator('#wb-cloud-where a').evaluate((a, value) => { a.textContent = value; }, STATUS);
}

function inspectDesktop(stress) {
  const problems = [];
  const box = e => e.getBoundingClientRect();
  const visible = (e, id) => {
    if (!e) { problems.push(`${id}: missing`); return false; }
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility !== 'visible' || e.hidden)
      problems.push(`${id}: hidden (${cs.display}/${cs.visibility})`);
    if (box(e).width <= 0 || box(e).height <= 0)
      problems.push(`${id}: zero-size ${box(e).width}x${box(e).height}`);
    return true;
  };
  const expected = (parent, selectors, name) => selectors.flatMap(selector => {
    const matches = Array.from(parent.querySelectorAll(selector));
    if (matches.length !== 1) problems.push(`${name}/${selector}: expected one, found ${matches.length}`);
    for (const e of matches) visible(e, `${name}/${selector}`);
    return matches;
  });
  const inside = (r, parent, id) => {
    if (r.width <= 0 || r.height <= 0) problems.push(`${id}: zero-size ${r.width}x${r.height}`);
    if (r.left < parent.left - 1 || r.right > parent.right + 1 ||
        r.top < parent.top - 1 || r.bottom > parent.bottom + 1) {
      problems.push(`${id}: outside row (${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)})`);
    }
    if (r.left < -1 || r.right > innerWidth + 1) problems.push(`${id}: outside viewport ${innerWidth}`);
  };
  const header = document.querySelector('header');
  const actions = header.querySelector('.header-actions');
  const row = document.getElementById('wb-save-sync-row');
  const toolbar = document.querySelector('.toolbar');
  const hdr = expected(actions, [
    '#btn-workbooks', '[data-i="newFileBtn"]', '#btn-help', '#btn-idea', '#btn-cal-sync',
    '#btn-map', '[data-i="openFileBtn"]', '[data-i="importDocxBtn"]', '[data-i="exportHtmlBtn"]',
  ], 'header');
  const save = expected(row, [
    '[data-i="saveToWorkbookBtn"]', '#btn-wb-sync', '#btn-wb-cloud', '#btn-save-all-modified',
  ], 'save');
  const toolSelectors = [
    '#btn-undo', '#btn-redo', '#heading-select', '#size-select',
    '.tb-color-control[data-i-title="textColorTip"]', '.tb-color-control[data-i-title="highlightColorTip"]',
    'input[type="color"][aria-label="Text color"]', 'input[type="color"][aria-label="Highlight color"]',
    'button[onclick="wrapSelection(\'**\',\'**\')"]', 'button[onclick="wrapSelection(\'*\',\'*\')"]',
    'button[data-i="listBtn"]', 'button[data-i="orderedListBtn"]',
    '#task-status-select', '#importance-insert-select',
    'button[data-i="linkBtn"]', 'button[data-i="imageBtn"]',
    'button[data-i="tableBtn"]', 'button[data-i="codeBtn"]', 'button[data-i="timelineBtn"]',
    '#btn-diagram', '#btn-sketch', '#btn-dictate',
    'button[data-i="wikilinkBtn"]', 'button[data-i="graphBtn"]', '#btn-media',
    '#btn-find', '#btn-explorer', '#btn-nav',
    '#btn-filter-todo', '#importance-select', '#btn-kanban', '#btn-gantt',
  ];
  const tools = expected(toolbar, toolSelectors, 'toolbar');
  const colorInputs = tools.filter(e => e.matches('input[type=color]'));
  const toolbarControls = Array.from(toolbar.querySelectorAll('button, select, input[type=color], .tb-color-control'))
    .filter(e => !['btn-garden', 'btn-toolbar-toggle', 'responsible-select'].includes(e.id));
  if (hdr.length !== actions.querySelectorAll('button').length) problems.push('unexpected header button inventory');
  if (save.length !== row.querySelectorAll('button').length) problems.push('unexpected save button inventory');
  if (tools.length !== toolbarControls.length) problems.push(`toolbar inventory: expected ${tools.length}, found ${toolbarControls.length}`);
  if (document.getElementById('btn-garden').getBoundingClientRect().width !== 0) problems.push('hidden Garden became visible');
  if (document.getElementById('btn-toolbar-toggle').getBoundingClientRect().width !== 0) problems.push('desktop toolbar toggle became visible');
  if (header.nextElementSibling !== row || row.nextElementSibling !== toolbar || row.parentElement !== document.body)
    problems.push('header/save/toolbar DOM order changed');
  if (box(row).top < box(header).bottom - 1 || box(row).bottom > box(toolbar).top + 1)
    problems.push('save strip vertically overlaps header or toolbar');
  for (const [name, e] of [['header', header], ['actions', actions], ['save row', row], ['toolbar', toolbar]]) {
    if (e.scrollWidth > e.clientWidth + 1) problems.push(`${name}: horizontal overflow ${e.scrollWidth}/${e.clientWidth}`);
  }
  for (const [name, e] of [['document', document.documentElement], ['body', document.body]]) {
    if (e.scrollWidth > e.clientWidth + 1) problems.push(`${name}: horizontal scroll ${e.scrollWidth}/${e.clientWidth}`);
  }
  const sets = [
    ['header', [...hdr, document.getElementById('wb-crumb'), document.getElementById('current-file')], header],
    ['save', [...save, document.getElementById('wb-cloud-where')], row],
    ['toolbar', tools.filter(e => !e.matches('input[type=color]')), toolbar],
  ];
  for (const [name, elements, parent] of sets) {
    for (const e of elements) {
      const id = e.id || e.getAttribute('data-i') || e.getAttribute('title') || e.textContent.trim();
      inside(box(e), box(parent), `${name}/${id}`);
      if (name === 'header' && e.matches('button')) {
        const r = box(e), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit !== e && !e.contains(hit)) problems.push(`${id}: header button is covered`);
      }
      if (e.matches('button')) {
        if (e.scrollWidth > e.clientWidth + 1) problems.push(`${id}: label clipped ${e.scrollWidth}/${e.clientWidth}`);
        if (getComputedStyle(e).textOverflow === 'ellipsis') problems.push(`${id}: button label ellipsized`);
        if (!e.getAttribute('onclick')) problems.push(`${id}: onclick missing`);
        if (e.hasAttribute('data-i') && e.textContent.trim() !== t(e.getAttribute('data-i')))
          problems.push(`${id}: translation differs from app text`);
      }
    }
    // Cross-line siblings may wrap, but their painted rectangles must not cover one another.
    const peers = elements.filter(e => box(e).width > 0 && box(e).height > 0);
    for (let i = 0; i < peers.length; i++) for (let j = i + 1; j < peers.length; j++) {
      const a = box(peers[i]), b = box(peers[j]);
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1)
        problems.push(`${name}: ${peers[i].id || peers[i].textContent.trim()} overlaps ${peers[j].id || peers[j].textContent.trim()}`);
    }
  }
  for (const input of colorInputs) inside(box(input), box(toolbar), `color/${input.getAttribute('aria-label')}`);
  for (const id of ['current-file', 'wb-crumb', 'wb-cloud-where']) {
    const e = document.getElementById(id), cs = getComputedStyle(e);
    if (cs.textOverflow !== 'ellipsis' || cs.whiteSpace !== 'nowrap' || cs.overflowX !== 'hidden')
      problems.push(`${id}: missing ellipsis/nowrap/hidden`);
    if (e.clientWidth <= 0 || (id !== 'wb-cloud-where' || stress) && e.scrollWidth <= e.clientWidth + 1)
      problems.push(`${id}: metadata not visibly truncated ${e.scrollWidth}/${e.clientWidth}`);
  }
  const link = row.querySelector('#wb-cloud-where a');
  if (!link || link.getAttribute('href') !== 'https://drive.google.com/drive/folders/test-folder' ||
      link.target !== '_blank' || !link.textContent.trim() || !link.title)
    problems.push('cloud status anchor lost href/target/text/title');
  else {
    const r = box(link.parentElement), hit = document.elementFromPoint(r.left + Math.min(10, r.width / 2), r.top + r.height / 2);
    if (hit !== link && !link.contains(hit)) problems.push('cloud status link is covered');
  }
  const lang = document.documentElement.lang;
  if (document.getElementById('btn-wb-cloud').textContent !== (lang === 'ro' ? '☁ Sincronizează acum' : '☁ Sync now'))
    problems.push('connected cloud label wrong');
  if (document.getElementById('btn-save-all-modified').textContent !== (lang === 'ro' ? '📚 Salvează tot ce s-a modificat' : '📚 Save all modified'))
    problems.push('save-all full label wrong');
  const compact = innerWidth <= 1600;
  for (const e of [...hdr, ...save]) {
    const cs = getComputedStyle(e);
    if (cs.paddingLeft !== (compact ? '10px' : '14px') || cs.paddingRight !== (compact ? '10px' : '14px'))
      problems.push(`${e.id || e.textContent}: wrong desktop padding ${cs.paddingLeft}/${cs.paddingRight}`);
  }
  const lines = elements => {
    const tops = elements.filter(e => box(e).height > 0).map(e => box(e).top).sort((a, b) => a - b);
    return tops.reduce((count, top, index) => count + (index === 0 || top - tops[index - 1] > 10 ? 1 : 0), 0);
  };
  return { problems, headerHeight: box(header).height, saveHeight: box(row).height,
    headerActionLines: lines(hdr), saveLines: lines(save), toolbarHeight: box(toolbar).height };
}

for (const width of WIDTHS) for (const lang of ['ro', 'en']) for (const stress of [false, true]) {
  test(`desktop ${width}px ${lang} ${stress ? 'stress' : 'natural'} status`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page, lang, stress);
    const result = await page.evaluate(inspectDesktop, stress);
    expect(result.problems, JSON.stringify({ width, lang, stress, heights: result }, null, 2)).toEqual([]);
    if (stress && [1025, 1280, 1536, 1601, 1920].includes(width)) {
      const measurement = { width, lang, status: 'stress', headerHeight: result.headerHeight,
        saveHeight: result.saveHeight, headerActionLines: result.headerActionLines, saveLines: result.saveLines };
      console.log('TASK-02 MEASUREMENT ' + JSON.stringify(measurement));
      await test.info().attach('desktop-geometry', { body: JSON.stringify(measurement, null, 2), contentType: 'application/json' });
    }
    if (stress && lang === 'ro' && [1025, 1536, 1601].includes(width))
      await page.screenshot({ path: `test-results/task-02-${width}-ro.png`, fullPage: true });
  });
}

test('ordinary 1920px header remains a single 52px row', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto(URL);
  await page.waitForFunction(() => document.documentElement.lang === 'ro');
  const height = await page.locator('header').evaluate(e => e.getBoundingClientRect().height);
  expect(height).toBe(52);
});

for (const lang of ['ro', 'en']) test(`save actions work with mouse and keyboard at 1280px ${lang}`, async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page, lang, true);
  const beforeClick = await page.evaluate(inspectDesktop, true);
  expect(beforeClick.problems, JSON.stringify(beforeClick, null, 2)).toEqual([]);
  await page.evaluate(() => {
    window.__calls = [];
    for (const name of ['saveToWorkbook', 'syncAllToFolder', 'cloudButton', 'saveAllModifiedChapters'])
      window[name] = () => window.__calls.push(name);
  });
  const names = ['saveToWorkbook', 'syncAllToFolder', 'cloudButton', 'saveAllModifiedChapters'];
  for (const [index, selector] of ROW_BUTTONS.entries()) {
    await page.locator(selector).click();
    expect(await page.evaluate(() => window.__calls)).toEqual(names.slice(0, index).flatMap(n => [n, n, n]).concat(names[index]));
    await page.locator(selector).click();
    expect(await page.evaluate(() => window.__calls)).toEqual(names.slice(0, index).flatMap(n => [n, n, n]).concat([names[index], names[index]]));
    await page.locator(selector).focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.__calls)).toEqual(names.slice(0, index + 1).flatMap(n => [n, n, n]));
  }
});

for (const [width, height] of [[1024, 900], [700, 900], [420, 900], [360, 900], [844, 390]]) {
  test(`mobile save strip and toolbar at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(URL);
    await page.waitForFunction(() => typeof paintCloud === 'function');
    const before = await page.evaluate(() => {
      const row = document.getElementById('wb-save-sync-row'), cs = getComputedStyle(row);
      const save = row.querySelector('.btn');
      return { wrap: cs.flexWrap, overflow: cs.overflowX, padding: getComputedStyle(save).paddingLeft,
        font: getComputedStyle(save).fontSize, rowHeight: row.getBoundingClientRect().height,
        toggle: getComputedStyle(document.getElementById('btn-toolbar-toggle')).display,
        scroll: row.scrollWidth > row.clientWidth + 1 };
    });
    expect(before.wrap).toBe('nowrap');
    expect(before.overflow).toBe('auto');
    expect(before.padding).toBe(width <= 420 ? '4px' : width <= 700 ? '6px' : '10px');
    expect(before.font).toBe(width <= 420 ? '10px' : '11px');
    expect(before.toggle).not.toBe('none');
    if (width <= 420) expect(before.scroll).toBe(true);
    await page.locator('#btn-toolbar-toggle').click();
    await page.waitForFunction(() => document.getElementById('toolbar-groups').getBoundingClientRect().height < 5);
    for (const selector of ROW_BUTTONS) {
      const dimensions = await page.locator(selector).evaluate(e => ({ width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height }));
      expect(dimensions.width).toBeGreaterThan(0);
      expect(dimensions.height).toBeGreaterThan(0);
    }
    expect(await page.locator('#wb-save-sync-row').evaluate(e => e.getBoundingClientRect().height)).toBe(before.rowHeight);
    if (before.scroll) {
      const last = await page.evaluate(() => {
        const row = document.getElementById('wb-save-sync-row');
        row.scrollLeft = row.scrollWidth;
        const r = row.getBoundingClientRect(), b = document.getElementById('btn-save-all-modified').getBoundingClientRect();
        return b.left >= r.left - 1 && b.right <= r.right + 1;
      });
      expect(last).toBe(true);
    }
  });
}

// Rectangles alone can pass when a transparent or misplaced element covers a
// control. Exercise the actual browser hit target before Playwright scrolls it.
for (const width of [1025, 1280, 1600, 1601, 1920]) for (const lang of ['ro', 'en']) {
  test(`desktop ${width}px ${lang} save and formatting controls accept pointer hits`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page, lang, true);
    const misses = await page.evaluate(() => {
      const row = document.getElementById('wb-save-sync-row');
      const toolbar = document.querySelector('.toolbar');
      const controls = [
        ...row.querySelectorAll('button, a'),
        ...toolbar.querySelectorAll('button:not(#btn-toolbar-toggle):not(#btn-garden), select, input[type="color"]'),
      ];
      return controls.flatMap(element => {
        // The link is inline: its full text rectangle extends through the
        // ellipsis clip. Use a point in its visible parent instead.
        const r = element.matches('a') ? element.parentElement.getBoundingClientRect() : element.getBoundingClientRect();
        const x = element.matches('a') ? r.left + Math.min(10, r.width / 2) : r.left + r.width / 2;
        const hit = document.elementFromPoint(x, r.top + r.height / 2);
        if (r.width <= 0 || r.height <= 0 || hit === element || element.contains(hit)) return [];
        return [`${element.id || element.getAttribute('data-i') || element.tagName}: hit ${hit?.id || hit?.tagName || 'nothing'}`];
      });
    });
    expect(misses).toEqual([]);
  });
}

test('a scrolled tablet strip recovers when resized across both desktop breakpoints', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await fixture(page, 'ro', true);
  await page.locator('#wb-save-sync-row').evaluate(row => { row.scrollLeft = row.scrollWidth; });
  for (const width of [1025, 1600, 1601, 1024, 1025]) {
    await page.setViewportSize({ width, height: 900 });
    const state = await page.evaluate(() => {
      const row = document.getElementById('wb-save-sync-row');
      const all = [...row.querySelectorAll('button')];
      const bounds = row.getBoundingClientRect();
      return {
        wrap: getComputedStyle(row).flexWrap,
        overflow: getComputedStyle(row).overflowX,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
        escaped: all.filter(e => {
          const r = e.getBoundingClientRect();
          return r.left < bounds.left - 1 || r.right > bounds.right + 1;
        }).map(e => e.id || e.getAttribute('data-i')),
      };
    });
    if (width > 1024) {
      expect(state, `after resize to ${width}px`).toMatchObject({ wrap: 'wrap', overflow: 'visible', escaped: [] });
      expect(state.documentOverflow).toBeLessThanOrEqual(1);
      expect(state.bodyOverflow).toBeLessThanOrEqual(1);
    } else {
      expect(state.wrap).toBe('nowrap');
      expect(state.overflow).toBe('auto');
    }
  }
});

test('language changes repaint a connected strip without dropping controls or the status link', async ({ page }) => {
  await page.setViewportSize({ width: 1025, height: 900 });
  await fixture(page, 'ro', false);
  for (const lang of ['en', 'ro', 'en']) {
    await page.locator('#navLangBtn').click();
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    // There is no real open workbook in this isolated layout fixture.
    await page.locator('#wb-crumb').evaluate((e, crumb) => { e.hidden = false; e.textContent = crumb; }, CRUMB);
    await expect(page.locator('#btn-wb-cloud')).toHaveText(lang === 'ro' ? '☁ Sincronizează acum' : '☁ Sync now');
    await expect(page.locator('#btn-save-all-modified')).toHaveText(
      lang === 'ro' ? '📚 Salvează tot ce s-a modificat' : '📚 Save all modified');
    await expect(page.locator('#wb-cloud-where a')).toHaveAttribute('href', 'https://drive.google.com/drive/folders/test-folder');
    const result = await page.evaluate(inspectDesktop, false);
    expect(result.problems, `${lang}: ${JSON.stringify(result)}`).toEqual([]);
  }
  await page.locator('#wb-cloud-where a').focus();
  await expect(page.locator('#wb-cloud-where a')).toBeFocused();
});

test('rapid mouse and keyboard toolbar toggles leave the mobile save strip reachable', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await fixture(page, 'ro', true);
  const toggle = page.locator('#btn-toolbar-toggle');
  for (let i = 0; i < 3; i++) await toggle.click();
  await expect(page.locator('.toolbar')).toHaveClass(/collapsed/);
  await page.waitForFunction(() => document.getElementById('toolbar-groups').getBoundingClientRect().height < 5);
  for (const selector of ROW_BUTTONS) {
    const button = page.locator(selector);
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
  }
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toolbar')).not.toHaveClass(/collapsed/);
  await page.waitForFunction(() => document.getElementById('toolbar-groups').getBoundingClientRect().height > 20);
  await expect(page.locator('#btn-gantt')).toBeVisible();
  await expect(page.locator('#wb-save-sync-row')).toBeVisible();
});

// A single unbroken token has a different intrinsic width from prose with
// spaces. It must be clipped as metadata without making any action scroll away.
for (const width of [1025, 1601, 1920]) for (const lang of ['ro', 'en']) {
  test(`unbroken metadata cannot displace desktop controls at ${width}px ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page, lang, true);
    await page.evaluate(() => {
      document.getElementById('wb-crumb').textContent = 'C'.repeat(320);
      document.getElementById('current-file').textContent = 'F'.repeat(320) + '.md';
      document.querySelector('#wb-cloud-where a').textContent = 'S'.repeat(320);
    });
    const result = await page.evaluate(inspectDesktop, true);
    expect(result.problems, JSON.stringify({ width, lang, result }, null, 2)).toEqual([]);
  });
}

// The default, disconnected page has no status link or workbook crumb. Check
// that the layout works before a user connects Drive or opens a workbook.
for (const width of [1025, 1600, 1601]) {
  test(`empty workbook and disconnected cloud at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(URL);
    await page.waitForFunction(() => typeof paintCloud === 'function' && document.documentElement.lang === 'ro');
    await page.evaluate(() => document.fonts.ready);
    const state = await page.evaluate(() => {
      const row = document.getElementById('wb-save-sync-row');
      const header = document.querySelector('header');
      const toolbar = document.querySelector('.toolbar');
      const bounds = e => e.getBoundingClientRect();
      const controls = [...header.querySelectorAll('button'), ...row.querySelectorAll('button')]
        .filter(e => !e.hidden);
      return {
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        rowOverflow: row.scrollWidth - row.clientWidth,
        headerOverflow: header.scrollWidth - header.clientWidth,
        crumbHidden: document.getElementById('wb-crumb').hidden,
        mapHidden: document.getElementById('btn-map').hidden,
        order: bounds(header).bottom <= bounds(row).top + 1 && bounds(row).bottom <= bounds(toolbar).top + 1,
        escaped: controls.filter(e => {
          const r = bounds(e), p = bounds(e.closest('header, #wb-save-sync-row'));
          return r.width <= 0 || r.height <= 0 || r.left < p.left - 1 || r.right > p.right + 1 ||
            r.top < p.top - 1 || r.bottom > p.bottom + 1;
        }).map(e => e.id || e.getAttribute('data-i')),
      };
    });
    expect(state).toMatchObject({ pageOverflow: 0, rowOverflow: 0, headerOverflow: 0,
      crumbHidden: true, mapHidden: true, order: true, escaped: [] });
  });
}

for (const lang of ['ro', 'en']) {
  test(`keyboard Tab reaches every desktop header and save action in DOM order ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width: 1025, height: 900 });
    await fixture(page, lang, true);
    const focusOrder = [
      '#btn-workbooks', '[data-i="newFileBtn"]', '#btn-help', '#btn-idea', '#btn-cal-sync',
      '#btn-map', '[data-i="openFileBtn"]', '[data-i="importDocxBtn"]', '[data-i="exportHtmlBtn"]',
      '[data-i="saveToWorkbookBtn"]', '#btn-wb-sync', '#btn-wb-cloud', '#wb-cloud-where a',
      '#btn-save-all-modified',
    ];
    await page.locator(focusOrder[0]).focus();
    for (const selector of focusOrder) {
      await expect(page.locator(selector), `focus should reach ${selector}`).toBeFocused();
      const reachable = await page.locator(selector).evaluate(e => {
        const r = e.matches('a') ? e.parentElement.getBoundingClientRect() : e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= innerWidth + 1;
      });
      expect(reachable, `${selector} has no visible keyboard target`).toBe(true);
      await page.keyboard.press('Tab');
    }
  });
}

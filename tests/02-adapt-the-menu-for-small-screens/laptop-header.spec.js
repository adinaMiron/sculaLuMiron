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
  const hdr = Array.from(actions.querySelectorAll('.btn'));
  const save = Array.from(row.querySelectorAll('.btn'));
  const tools = Array.from(toolbar.querySelectorAll('button, select, input[type=color]'))
    .filter(e => !['btn-garden', 'btn-toolbar-toggle', 'responsible-select'].includes(e.id));
  const labels = Array.from(toolbar.querySelectorAll('.tb-color-control'));
  if (hdr.length !== 9) problems.push(`header button inventory: ${hdr.length}, expected 9`);
  if (save.length !== 4) problems.push(`save button inventory: ${save.length}, expected 4`);
  for (const id of ['btn-workbooks', 'btn-help', 'btn-idea', 'btn-cal-sync', 'btn-map']) {
    if (!hdr.some(e => e.id === id)) problems.push(`${id}: absent from header`);
  }
  for (const id of ['btn-kanban', 'btn-gantt', 'heading-select', 'size-select', 'btn-filter-todo', 'importance-select']) {
    if (!tools.some(e => e.id === id)) problems.push(`${id}: absent from toolbar`);
  }
  if (tools.filter(e => e.matches('input[type=color]')).length !== 2) problems.push('color input inventory changed');
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
    ['toolbar', [...tools.filter(e => !e.matches('input[type=color]')), ...labels], toolbar],
  ];
  for (const [name, elements, parent] of sets) {
    for (const e of elements) {
      const id = e.id || e.getAttribute('data-i') || e.getAttribute('title') || e.textContent.trim();
      inside(box(e), box(parent), `${name}/${id}`);
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
  for (const input of tools.filter(e => e.matches('input[type=color]'))) inside(box(input), box(toolbar), `color/${input.getAttribute('aria-label')}`);
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
  return { problems, headerHeight: box(header).height, saveHeight: box(row).height, toolbarHeight: box(toolbar).height };
}

for (const width of WIDTHS) for (const lang of ['ro', 'en']) for (const stress of [false, true]) {
  test(`desktop ${width}px ${lang} ${stress ? 'stress' : 'natural'} status`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page, lang, stress);
    const result = await page.evaluate(inspectDesktop, stress);
    expect(result.problems, JSON.stringify({ width, lang, stress, heights: result }, null, 2)).toEqual([]);
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

test('save actions work with mouse and keyboard, including repeated clicks', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page, 'ro', true);
  await page.evaluate(() => {
    window.__calls = [];
    for (const name of ['saveToWorkbook', 'syncAllToFolder', 'cloudButton', 'saveAllModifiedChapters'])
      window[name] = () => window.__calls.push(name);
  });
  for (const selector of ROW_BUTTONS) {
    await page.locator(selector).click();
    await page.locator(selector).click();
    await page.locator(selector).focus();
    await page.keyboard.press('Enter');
  }
  expect(await page.evaluate(() => window.__calls)).toEqual(
    ['saveToWorkbook', 'syncAllToFolder', 'cloudButton', 'saveAllModifiedChapters'].flatMap(n => [n, n, n]));
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

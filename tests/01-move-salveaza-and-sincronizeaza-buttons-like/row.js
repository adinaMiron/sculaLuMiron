// task-01: the save/sync buttons (Salvează capitolul, Sincronizează în
// dosar, Cont Google / Sincronizează acum + its status text, Salvează tot
// ce s-a modificat) moved out of <header> onto their own row
// (#wb-save-sync-row) directly between </header> and <div class="toolbar">.
// Spec: docs/tasks/01-move-salveaza-and-sincronizeaza-buttons-like/spec.md
//
// Structural + CSS-geometry + viewport + i18n + click-behaviour checks,
// following the project's plain-node-script convention (see
// tests/03-move-kanban-and-gantt-buttons-from/buttons.js).
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || '/usr/bin/google-chrome-stable';
const URL = 'file://' + path.join(__dirname, '..', '..', 'index.html');

function assert(cond, label, extra) {
  if (!cond) throw new Error('FAIL: ' + label + (extra !== undefined ? ' — ' + JSON.stringify(extra) : ''));
}

async function freshPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(200); // let initUILang()/applyUILang() settle
  return { ctx, page, errors };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  let passCount = 0;

  // ---- 1. the row exists once, sits between header and .toolbar, header no longer has the buttons ----
  {
    const { ctx, page, errors } = await freshPage(browser);
    const result = await page.evaluate(() => {
      const header = document.querySelector('header');
      const row = document.getElementById('wb-save-sync-row');
      return {
        rowCount: document.querySelectorAll('#wb-save-sync-row').length,
        headerNextIsRow: header.nextElementSibling === row,
        rowNextIsToolbar: row && row.nextElementSibling && row.nextElementSibling.classList.contains('toolbar'),
        rowParentIsBody: row && row.parentElement === document.body,
        rowInsideHeader: !!(row && row.closest('header')),
        headerHasSaveBtn: document.querySelectorAll('header [data-i="saveToWorkbookBtn"]').length,
        headerHasSyncBtn: document.querySelectorAll('header #btn-wb-sync').length,
        headerHasCloudBtn: document.querySelectorAll('header #btn-wb-cloud').length,
        headerHasWhere: document.querySelectorAll('header #wb-cloud-where').length,
        headerHasSaveAll: document.querySelectorAll('header #btn-save-all-modified').length,
      };
    });
    assert(result.rowCount === 1, '#wb-save-sync-row exists exactly once', result);
    assert(result.headerNextIsRow, 'header.nextElementSibling === #wb-save-sync-row', result);
    assert(result.rowNextIsToolbar, '#wb-save-sync-row.nextElementSibling is .toolbar', result);
    assert(result.rowParentIsBody, '#wb-save-sync-row is a direct child of <body>', result);
    assert(!result.rowInsideHeader, '.wb-save-sync-row appears nowhere inside <header>', result);
    assert(result.headerHasSaveBtn === 0, 'header no longer has the save-to-workbook button', result);
    assert(result.headerHasSyncBtn === 0, 'header no longer has #btn-wb-sync', result);
    assert(result.headerHasCloudBtn === 0, 'header no longer has #btn-wb-cloud', result);
    assert(result.headerHasWhere === 0, 'header no longer has #wb-cloud-where', result);
    assert(result.headerHasSaveAll === 0, 'header no longer has #btn-save-all-modified', result);
    assert(!errors.length, 'no page errors on load', errors);
    await ctx.close();
    passCount++;
  }

  // ---- 2. element children of the row, in exact order ----
  {
    const { ctx, page } = await freshPage(browser);
    const result = await page.evaluate(() => {
      const row = document.getElementById('wb-save-sync-row');
      const kids = Array.from(row.children);
      return {
        count: kids.length,
        ids: kids.map(k => k.id || k.getAttribute('data-i') || k.tagName),
      };
    });
    assert(result.count === 5, 'row has exactly 5 element children', result);
    assert(JSON.stringify(result.ids) === JSON.stringify(['saveToWorkbookBtn', 'btn-wb-sync', 'btn-wb-cloud', 'wb-cloud-where', 'btn-save-all-modified']),
      'children in order: save-to-workbook, #btn-wb-sync, #btn-wb-cloud, #wb-cloud-where, #btn-save-all-modified', result);
    await ctx.close();
    passCount++;
  }

  // ---- 3. attributes preserved byte-for-byte vs the spec's decision 4 ----
  {
    const { ctx, page } = await freshPage(browser);
    const result = await page.evaluate(() => {
      const save = document.querySelector('[data-i="saveToWorkbookBtn"]');
      const sync = document.getElementById('btn-wb-sync');
      const cloud = document.getElementById('btn-wb-cloud');
      const all = document.getElementById('btn-save-all-modified');
      return {
        save: { cls: save.className, onclick: save.getAttribute('onclick'), dataI: save.getAttribute('data-i'), dataIT: save.getAttribute('data-i-title'), title: save.getAttribute('title') },
        sync: { cls: sync.className, onclick: sync.getAttribute('onclick'), dataI: sync.getAttribute('data-i'), dataIT: sync.getAttribute('data-i-title'), title: sync.getAttribute('title') },
        cloud: { cls: cloud.className, onclick: cloud.getAttribute('onclick'), oncontext: cloud.getAttribute('oncontextmenu'), dataI: cloud.getAttribute('data-i') },
        all: { cls: all.className, onclick: all.getAttribute('onclick'), dataI: all.getAttribute('data-i'), dataIT: all.getAttribute('data-i-title'), title: all.getAttribute('title') },
      };
    });
    assert(result.save.cls === 'btn btn-primary', 'save button keeps .btn.btn-primary', result.save);
    assert(result.save.onclick === 'saveToWorkbook()', 'save button keeps onclick="saveToWorkbook()"', result.save);
    assert(result.save.dataI === 'saveToWorkbookBtn' && result.save.dataIT === 'saveToWorkbookTip', 'save button keeps its data-i/data-i-title', result.save);
    assert(result.sync.cls === 'btn', '#btn-wb-sync keeps plain .btn', result.sync);
    assert(result.sync.onclick === 'syncAllToFolder()', '#btn-wb-sync keeps onclick="syncAllToFolder()"', result.sync);
    assert(result.cloud.cls === 'btn', '#btn-wb-cloud keeps plain .btn', result.cloud);
    assert(result.cloud.onclick === 'cloudButton()', '#btn-wb-cloud keeps onclick="cloudButton()"', result.cloud);
    assert(result.cloud.oncontext === 'cloudForgetAsk(event)', '#btn-wb-cloud keeps oncontextmenu="cloudForgetAsk(event)"', result.cloud);
    assert(result.cloud.dataI === null, '#btn-wb-cloud still has no data-i', result.cloud);
    assert(result.all.cls === 'btn', '#btn-save-all-modified keeps plain .btn', result.all);
    assert(result.all.onclick === 'saveAllModifiedChapters()', '#btn-save-all-modified keeps onclick="saveAllModifiedChapters()"', result.all);
    await ctx.close();
    passCount++;
  }

  // ---- 4. geometry across every named viewport: one line, left-aligned, ordered, not squashed ----
  const viewports = [
    { width: 1920, height: 1000 },
    { width: 1440, height: 900 },
    { width: 1024, height: 900 },
    { width: 800, height: 900 },
    { width: 700, height: 900 },
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ];
  for (const vp of viewports) {
    const { ctx, page } = await freshPage(browser, vp);
    const result = await page.evaluate(() => {
      const row = document.getElementById('wb-save-sync-row');
      const save = document.querySelector('[data-i="saveToWorkbookBtn"]');
      const sync = document.getElementById('btn-wb-sync');
      const cloud = document.getElementById('btn-wb-cloud');
      const where = document.getElementById('wb-cloud-where');
      const all = document.getElementById('btn-save-all-modified');
      const rects = [save, sync, cloud, where, all].map(el => el.getBoundingClientRect());
      const rowRect = row.getBoundingClientRect();
      const whiteSpaces = [save, sync, cloud, all].map(el => getComputedStyle(el).whiteSpace);
      const notSquashed = [save, sync, cloud, all].map(el => el.scrollWidth <= el.clientWidth + 1);
      return {
        visible: rowRect.width > 0 && rowRect.height > 0,
        centersY: rects.map(r => r.top + r.height / 2),
        lefts: rects.map(r => r.left),
        rowLeft: rowRect.left,
        flexWrap: getComputedStyle(row).flexWrap,
        whiteSpaces,
        notSquashed,
      };
    });
    assert(result.visible, `row visible at ${vp.width}px`, result);
    const spread = Math.max(...result.centersY) - Math.min(...result.centersY);
    assert(spread <= 2, `vertical centres within 2px at ${vp.width}px`, result.centersY);
    for (let i = 1; i < result.lefts.length; i++) {
      assert(result.lefts[i] > result.lefts[i - 1] || (i === 3 /* wb-cloud-where may be zero-width, allow equal */ && result.lefts[i] >= result.lefts[i - 1]),
        `left edges strictly increase at index ${i} at ${vp.width}px`, result.lefts);
    }
    assert(result.lefts[0] - result.rowLeft <= 24, `first button within 24px of row's left edge at ${vp.width}px`, { first: result.lefts[0], rowLeft: result.rowLeft });
    assert(result.flexWrap === 'nowrap', `flex-wrap computes to nowrap at ${vp.width}px`, result.flexWrap);
    for (const ws of result.whiteSpaces) assert(ws === 'nowrap', `button has white-space: nowrap at ${vp.width}px`, result.whiteSpaces);
    for (const ns of result.notSquashed) assert(ns, `no button is squashed (scrollWidth<=clientWidth+1) at ${vp.width}px`, result.notSquashed);
    await ctx.close();
    passCount++;
  }

  // ---- 5. at 360px the row scrolls, and scrolling reaches the last button ----
  {
    const { ctx, page } = await freshPage(browser, { width: 360, height: 800 });
    const before = await page.evaluate(() => {
      const row = document.getElementById('wb-save-sync-row');
      return { scrollWidth: row.scrollWidth, clientWidth: row.clientWidth };
    });
    assert(before.scrollWidth > before.clientWidth, 'row.scrollWidth > row.clientWidth at 360px (it scrolls)', before);
    const after = await page.evaluate(() => {
      const row = document.getElementById('wb-save-sync-row');
      row.scrollLeft = 9999;
      const rowRect = row.getBoundingClientRect();
      const allRect = document.getElementById('btn-save-all-modified').getBoundingClientRect();
      return {
        allLeftInside: allRect.left >= rowRect.left - 1,
        allRightInside: allRect.right <= rowRect.right + 1,
      };
    });
    assert(after.allLeftInside && after.allRightInside, "after scrollLeft=9999, #btn-save-all-modified's rect lies inside the row's rect", after);
    await ctx.close();
    passCount++;
  }

  // ---- 6. desktop width does NOT scroll (sanity: only small widths need overflow) ----
  {
    const { ctx, page } = await freshPage(browser, { width: 1920, height: 1000 });
    const result = await page.evaluate(() => {
      const row = document.getElementById('wb-save-sync-row');
      return { scrollWidth: row.scrollWidth, clientWidth: row.clientWidth };
    });
    assert(result.scrollWidth <= result.clientWidth + 1, 'row does not need to scroll at 1920px', result);
    await ctx.close();
    passCount++;
  }

  // ---- 7. landscape phone (740x360): row visible, one line ----
  {
    const { ctx, page } = await freshPage(browser, { width: 740, height: 360 });
    const result = await page.evaluate(() => {
      const row = document.getElementById('wb-save-sync-row');
      const rects = ['saveToWorkbookBtn', null, null, null, null];
      const save = document.querySelector('[data-i="saveToWorkbookBtn"]');
      const all = document.getElementById('btn-save-all-modified');
      const rowRect = row.getBoundingClientRect();
      return {
        visible: rowRect.width > 0 && rowRect.height > 0,
        centersDiff: Math.abs((save.getBoundingClientRect().top + save.getBoundingClientRect().height / 2) -
          (all.getBoundingClientRect().top + all.getBoundingClientRect().height / 2)),
      };
    });
    assert(result.visible, 'row visible on landscape phone 740x360', result);
    assert(result.centersDiff <= 2, 'save and save-all vertical centres within 2px on landscape phone', result);
    await ctx.close();
    passCount++;
  }

  // ---- 8. ☰ collapse (≤1024px) hides #toolbar-groups but leaves the row + buttons visible/clickable ----
  {
    const { ctx, page } = await freshPage(browser, { width: 800, height: 900 });
    const toggle = await page.$('#btn-toolbar-toggle');
    assert(toggle, '#btn-toolbar-toggle exists', null);
    await toggle.click();
    await page.waitForTimeout(400);
    const result = await page.evaluate(() => {
      const groups = document.getElementById('toolbar-groups');
      const row = document.getElementById('wb-save-sync-row');
      const rowRect = row.getBoundingClientRect();
      const groupsRect = groups.getBoundingClientRect();
      return {
        toolbarCollapsed: document.querySelector('.toolbar').classList.contains('collapsed'),
        groupsHeight: groupsRect.height,
        rowVisible: rowRect.width > 0 && rowRect.height > 0,
        saveVisible: document.querySelector('[data-i="saveToWorkbookBtn"]').getBoundingClientRect().height > 0,
      };
    });
    assert(result.toolbarCollapsed, '.toolbar gets .collapsed after clicking ☰', result);
    assert(result.groupsHeight < 5, '#toolbar-groups collapses to ~0 height', result);
    assert(result.rowVisible, '#wb-save-sync-row stays visible after collapsing the toolbar', result);
    assert(result.saveVisible, 'save-to-workbook button stays visible after collapsing the toolbar', result);
    // clickable: no error thrown, and its onclick handler still runs (saveToWorkbook opens a modal / does something detectable)
    let clickErr = null;
    try { await page.click('[data-i="saveToWorkbookBtn"]'); } catch (e) { clickErr = e.message; }
    assert(!clickErr, 'save-to-workbook button is clickable after collapsing the toolbar', clickErr);
    await ctx.close();
    passCount++;
  }

  // ---- 9. computed background/border match the header ----
  {
    const { ctx, page } = await freshPage(browser);
    const result = await page.evaluate(() => {
      const header = document.querySelector('header');
      const row = document.getElementById('wb-save-sync-row');
      const hs = getComputedStyle(header);
      const rs = getComputedStyle(row);
      return {
        headerBg: hs.backgroundColor,
        rowBg: rs.backgroundColor,
        rowBorderBottomWidth: rs.borderBottomWidth,
        rowBorderBottomStyle: rs.borderBottomStyle,
      };
    });
    assert(result.headerBg === result.rowBg, "row's background-color equals the header's", result);
    assert(result.rowBorderBottomWidth === '1px', 'row has a 1px bottom border', result);
    assert(result.rowBorderBottomStyle === 'solid', 'row bottom border is solid', result);
    await ctx.close();
    passCount++;
  }

  // ---- 10. Romanian (default) labels ----
  {
    const { ctx, page } = await freshPage(browser);
    const result = await page.evaluate(() => {
      const save = document.querySelector('[data-i="saveToWorkbookBtn"]');
      const sync = document.getElementById('btn-wb-sync');
      const cloud = document.getElementById('btn-wb-cloud');
      const where = document.getElementById('wb-cloud-where');
      const all = document.getElementById('btn-save-all-modified');
      return {
        save: save.textContent.trim(),
        sync: sync.textContent.trim(),
        cloud: cloud.textContent.trim(),
        where: where.textContent.trim(),
        all: all.textContent.trim(),
      };
    });
    assert(result.save === '📓 Salvează capitolul în caiet', 'RO save label', result);
    assert(result.sync === '⇩ Sincronizează în dosar', 'RO sync label', result);
    assert(result.cloud === '☁ Cont Google', 'RO cloud label (disconnected)', result);
    assert(result.where === '☁ doar pe acest dispozitiv', 'RO wb-cloud-where text (disconnected)', result);
    assert(result.all === '📚 Salvează tot ce s-a modificat', 'RO save-all label', result);
    await ctx.close();
    passCount++;
  }

  // ---- 11. English labels after toggling #navLangBtn ----
  {
    const { ctx, page } = await freshPage(browser);
    const langBtn = await page.$('#navLangBtn');
    assert(langBtn, '#navLangBtn exists', null);
    await langBtn.click();
    await page.waitForTimeout(200);
    const result = await page.evaluate(() => {
      const save = document.querySelector('[data-i="saveToWorkbookBtn"]');
      const sync = document.getElementById('btn-wb-sync');
      const all = document.getElementById('btn-save-all-modified');
      return {
        save: save.textContent.trim(),
        sync: sync.textContent.trim(),
        all: all.textContent.trim(),
      };
    });
    assert(result.save === '📓 Save to workbook', 'EN save label after language toggle', result);
    assert(result.sync === '⇩ Sync to folder', 'EN sync label after language toggle', result);
    assert(result.all === '📚 Save all modified', 'EN save-all label after language toggle', result);
    await ctx.close();
    passCount++;
  }

  // ---- 12. Ctrl+S reaches saveToWorkbook(); Ctrl+Alt+S reaches saveAllModifiedChapters() ----
  {
    const { ctx, page } = await freshPage(browser);
    await page.evaluate(() => {
      window.__task01_calls = [];
      window.saveToWorkbook = function () { window.__task01_calls.push('saveToWorkbook'); };
      window.saveAllModifiedChapters = function () { window.__task01_calls.push('saveAllModifiedChapters'); };
    });
    await page.click('#editor, textarea, .cm-content, body').catch(() => {});
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyS');
    await page.keyboard.up('Control');
    await page.waitForTimeout(100);
    await page.keyboard.down('Control');
    await page.keyboard.down('Alt');
    await page.keyboard.press('KeyS');
    await page.keyboard.up('Alt');
    await page.keyboard.up('Control');
    await page.waitForTimeout(100);
    const calls = await page.evaluate(() => window.__task01_calls);
    assert(calls.includes('saveToWorkbook'), 'Ctrl+S calls saveToWorkbook()', calls);
    assert(calls.includes('saveAllModifiedChapters'), 'Ctrl+Alt+S calls saveAllModifiedChapters()', calls);
    await ctx.close();
    passCount++;
  }

  // ---- 13. clicking the buttons directly calls the right functions (onclick wiring intact post-move) ----
  {
    const { ctx, page } = await freshPage(browser);
    await page.evaluate(() => {
      window.__task01_clicks = [];
      window.saveToWorkbook = function () { window.__task01_clicks.push('saveToWorkbook'); };
      window.syncAllToFolder = function () { window.__task01_clicks.push('syncAllToFolder'); };
      window.saveAllModifiedChapters = function () { window.__task01_clicks.push('saveAllModifiedChapters'); };
      window.cloudButton = function () { window.__task01_clicks.push('cloudButton'); };
    });
    await page.click('[data-i="saveToWorkbookBtn"]');
    await page.click('#btn-wb-sync');
    await page.click('#btn-wb-cloud');
    await page.click('#btn-save-all-modified');
    const clicks = await page.evaluate(() => window.__task01_clicks);
    assert(clicks.join(',') === 'saveToWorkbook,syncAllToFolder,cloudButton,saveAllModifiedChapters',
      'clicking each moved button calls its onclick handler, in the order clicked', clicks);
    await ctx.close();
    passCount++;
  }

  // ---- 14. #btn-wb-cloud right-click still reaches cloudForgetAsk (oncontextmenu wiring intact) ----
  {
    const { ctx, page } = await freshPage(browser);
    await page.evaluate(() => {
      window.__task01_ctx = null;
      window.cloudForgetAsk = function (e) { window.__task01_ctx = 'called'; if (e && e.preventDefault) e.preventDefault(); };
    });
    const btn = await page.$('#btn-wb-cloud');
    await btn.click({ button: 'right' });
    await page.waitForTimeout(50);
    const called = await page.evaluate(() => window.__task01_ctx);
    assert(called === 'called', 'right-click on #btn-wb-cloud calls cloudForgetAsk(event)', called);
    await ctx.close();
    passCount++;
  }

  // ---- 15. resizing the window (no reload) keeps the row structurally correct at each breakpoint ----
  {
    const { ctx, page } = await freshPage(browser, { width: 1920, height: 1000 });
    for (const vp of [1024, 700, 360, 1920]) {
      await page.setViewportSize({ width: vp, height: 900 });
      await page.waitForTimeout(50);
      const result = await page.evaluate(() => {
        const row = document.getElementById('wb-save-sync-row');
        return { count: row.children.length, visible: row.getBoundingClientRect().height > 0 };
      });
      assert(result.count === 5, `row still has 5 children after resizing to ${vp}px without reload`, result);
      assert(result.visible, `row still visible after resizing to ${vp}px without reload`, result);
    }
    await ctx.close();
    passCount++;
  }

  // ---- 16. #wb-cloud-where may be zero-width but is still present and positioned right after ☁ ----
  {
    const { ctx, page } = await freshPage(browser);
    const result = await page.evaluate(() => {
      const cloud = document.getElementById('btn-wb-cloud');
      return { nextId: cloud.nextElementSibling && cloud.nextElementSibling.id };
    });
    assert(result.nextId === 'wb-cloud-where', '#wb-cloud-where sits directly after #btn-wb-cloud', result);
    await ctx.close();
    passCount++;
  }

  // ---- 17. no hex colours were introduced in the row's own CSS (theme tokens only) ----
  {
    const { ctx, page } = await freshPage(browser);
    const cssText = await page.evaluate(() => {
      let text = '';
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText && rule.selectorText.includes('wb-save-sync-row')) text += rule.cssText + '\n';
          }
        } catch (e) { /* cross-origin sheet, not expected here */ }
      }
      return text;
    });
    assert(cssText.length > 0, 'found CSS rules for .wb-save-sync-row to inspect', cssText);
    assert(!/#[0-9a-fA-F]{3,8}\b/.test(cssText), '.wb-save-sync-row rules contain no hardcoded hex colours', cssText);
    await ctx.close();
    passCount++;
  }

  console.log(`OK: ${passCount} checks passed`);
  await browser.close();
})().catch(e => {
  console.error(e.message || e);
  process.exit(1);
});

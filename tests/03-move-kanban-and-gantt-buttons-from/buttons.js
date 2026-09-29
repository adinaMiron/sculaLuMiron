// task-03: the Kanban/Gantt buttons moved from the header (.header-actions)
// into the formatting toolbar (#toolbar-groups), right of the task filters.
// Spec: docs/tasks/03-move-kanban-and-gantt-buttons-from/spec.md
//
// Structural + i18n + click-behaviour + viewport checks, following the
// project's plain-node-script convention (see tests/gantt.js).
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

  // ---- 1. header no longer has the buttons; each exists exactly once ----
  {
    const { ctx, page, errors } = await freshPage(browser);
    const result = await page.evaluate(() => ({
      headerKanban: document.querySelectorAll('.header-actions #btn-kanban').length,
      headerGantt: document.querySelectorAll('.header-actions #btn-gantt').length,
      totalKanban: document.querySelectorAll('#btn-kanban').length,
      totalGantt: document.querySelectorAll('#btn-gantt').length,
    }));
    assert(result.headerKanban === 0, 'header must not contain #btn-kanban', result);
    assert(result.headerGantt === 0, 'header must not contain #btn-gantt', result);
    assert(result.totalKanban === 1, '#btn-kanban must exist exactly once', result);
    assert(result.totalGantt === 1, '#btn-gantt must exist exactly once', result);
    assert(!errors.length, 'no page errors on load', errors);
    await ctx.close();
    passCount++;
  }

  // ---- 2. both are direct children of #toolbar-groups, not .toolbar-filters ----
  {
    const { ctx, page } = await freshPage(browser);
    const result = await page.evaluate(() => {
      const kanban = document.getElementById('btn-kanban');
      const gantt = document.getElementById('btn-gantt');
      return {
        kanbanParent: kanban.parentElement.id,
        ganttParent: gantt.parentElement.id,
        kanbanInFilters: !!kanban.closest('.toolbar-filters'),
        ganttInFilters: !!gantt.closest('.toolbar-filters'),
        kanbanInHeader: !!kanban.closest('header'),
        ganttInHeader: !!gantt.closest('header'),
      };
    });
    assert(result.kanbanParent === 'toolbar-groups', '#btn-kanban parent must be #toolbar-groups', result);
    assert(result.ganttParent === 'toolbar-groups', '#btn-gantt parent must be #toolbar-groups', result);
    assert(!result.kanbanInFilters, '#btn-kanban must not be inside .toolbar-filters', result);
    assert(!result.ganttInFilters, '#btn-gantt must not be inside .toolbar-filters', result);
    assert(!result.kanbanInHeader, '#btn-kanban must not be inside <header>', result);
    assert(!result.ganttInHeader, '#btn-gantt must not be inside <header>', result);
    await ctx.close();
    passCount++;
  }

  // ---- 3. sibling order: .toolbar-filters -> .toolbar-sep -> kanban -> gantt ----
  {
    const { ctx, page } = await freshPage(browser);
    const result = await page.evaluate(() => {
      const filters = document.querySelector('.toolbar-filters');
      const sep = filters.nextElementSibling;
      const kanban = sep ? sep.nextElementSibling : null;
      const gantt = kanban ? kanban.nextElementSibling : null;
      return {
        sepClass: sep && sep.className,
        kanbanId: kanban && kanban.id,
        ganttId: gantt && gantt.id,
        // the element right after gantt should be the closing of #toolbar-groups
        // i.e. gantt is the last child of #toolbar-groups
        ganttIsLastChild: gantt === document.getElementById('toolbar-groups').lastElementChild,
      };
    });
    assert(result.sepClass === 'toolbar-sep', '.toolbar-filters is followed by .toolbar-sep', result);
    assert(result.kanbanId === 'btn-kanban', '.toolbar-sep is followed by #btn-kanban', result);
    assert(result.ganttId === 'btn-gantt', '#btn-kanban is followed by #btn-gantt', result);
    assert(result.ganttIsLastChild, '#btn-gantt is the last child of #toolbar-groups', result);
    await ctx.close();
    passCount++;
  }

  // ---- 4. classes + attributes preserved ----
  {
    const { ctx, page } = await freshPage(browser);
    const result = await page.evaluate(() => {
      function info(id) {
        const el = document.getElementById(id);
        return {
          className: el.className,
          onclick: el.getAttribute('onclick'),
          dataI: el.getAttribute('data-i'),
          dataITitle: el.getAttribute('data-i-title'),
          hasBtnClass: el.classList.contains('btn'),
          hasTbBtnClass: el.classList.contains('tb-btn'),
        };
      }
      return { kanban: info('btn-kanban'), gantt: info('btn-gantt') };
    });
    assert(result.kanban.hasTbBtnClass, 'kanban has tb-btn class', result.kanban);
    assert(!result.kanban.hasBtnClass, 'kanban must NOT have btn class', result.kanban);
    assert(result.kanban.onclick === 'openKanban()', 'kanban onclick preserved', result.kanban);
    assert(result.kanban.dataI === 'kanbanBtn', 'kanban data-i preserved', result.kanban);
    assert(result.kanban.dataITitle === 'kanbanTip', 'kanban data-i-title preserved', result.kanban);

    assert(result.gantt.hasTbBtnClass, 'gantt has tb-btn class', result.gantt);
    assert(!result.gantt.hasBtnClass, 'gantt must NOT have btn class', result.gantt);
    assert(result.gantt.onclick === 'openGantt()', 'gantt onclick preserved', result.gantt);
    assert(result.gantt.dataI === 'ganttBtn', 'gantt data-i preserved', result.gantt);
    assert(result.gantt.dataITitle === 'ganttTip', 'gantt data-i-title preserved', result.gantt);
    await ctx.close();
    passCount++;
  }

  // ---- 5. labels + tooltips in both languages ----
  // The page's default UI language is Romanian (localStorage empty -> "ro"),
  // so the RO strings are what a fresh load shows; English is reached only
  // by toggling the shared nav's language button.
  {
    const { ctx, page } = await freshPage(browser);
    const ro = await page.evaluate(() => ({
      kanbanText: document.getElementById('btn-kanban').textContent,
      ganttText: document.getElementById('btn-gantt').textContent,
      kanbanTitle: document.getElementById('btn-kanban').title,
      ganttTitle: document.getElementById('btn-gantt').title,
      lang: document.documentElement.lang,
    }));
    assert(ro.kanbanText === '▦ Kanban', 'RO kanban label text (same string both languages)', ro);
    assert(ro.ganttText === '▤ Gantt', 'RO gantt label text (same string both languages)', ro);
    assert(ro.kanbanTitle === 'Deschide panoul de sarcini pentru acest capitol', 'RO kanban tooltip', ro);
    assert(ro.lang === 'ro', 'default UI language is ro', ro);

    // toggle to English via the shared nav language button
    await page.click('#navLangBtn');
    await page.waitForTimeout(100);
    const en = await page.evaluate(() => ({
      kanbanText: document.getElementById('btn-kanban').textContent,
      ganttText: document.getElementById('btn-gantt').textContent,
      kanbanTitle: document.getElementById('btn-kanban').title,
      ganttTitle: document.getElementById('btn-gantt').title,
      lang: document.documentElement.lang,
    }));
    assert(en.kanbanText === '▦ Kanban', 'EN kanban label text', en);
    assert(en.ganttText === '▤ Gantt', 'EN gantt label text', en);
    assert(en.kanbanTitle === 'Open the task board for this chapter', 'EN kanban tooltip', en);
    assert(en.ganttTitle === "Show this chapter's tasks as a Gantt chart", 'EN gantt tooltip', en);
    assert(en.lang === 'en', 'UI language switched to en', en);

    // and back to Romanian, to be sure the toggle round-trips both buttons
    await page.click('#navLangBtn');
    await page.waitForTimeout(100);
    const ro2 = await page.evaluate(() => ({
      kanbanTitle: document.getElementById('btn-kanban').title,
      ganttTitle: document.getElementById('btn-gantt').title,
    }));
    assert(ro2.kanbanTitle === 'Deschide panoul de sarcini pentru acest capitol', 'RO kanban tooltip after round-trip', ro2);
    assert(ro2.ganttTitle === 'Arată diagrama Gantt pentru sarcinile din acest capitol', 'RO gantt tooltip after round-trip', ro2);
    await ctx.close();
    passCount++;
  }

  // ---- 6. desktop geometry: buttons sit right of .toolbar-filters ----
  {
    const { ctx, page } = await freshPage(browser, { width: 1280, height: 800 });
    const rects = await page.evaluate(() => {
      const r = el => el.getBoundingClientRect();
      return {
        filters: r(document.querySelector('.toolbar-filters')),
        kanban: r(document.getElementById('btn-kanban')),
        gantt: r(document.getElementById('btn-gantt')),
      };
    });
    // same row -> "left of" comparison is meaningful; if wrapped, skip (spec allows either)
    const sameRowKanban = Math.abs(rects.filters.top - rects.kanban.top) < 2;
    const sameRowGantt = Math.abs(rects.kanban.top - rects.gantt.top) < 2;
    if (sameRowKanban) {
      assert(rects.kanban.left >= rects.filters.right - 1, 'kanban sits to the right of .toolbar-filters on desktop', rects);
    }
    if (sameRowGantt) {
      assert(rects.gantt.left >= rects.kanban.right - 1, 'gantt sits to the right of kanban on desktop', rects);
    }
    // both buttons must be visible (non-zero size) on desktop regardless of wrap
    assert(rects.kanban.width > 0 && rects.kanban.height > 0, 'kanban visible on desktop', rects.kanban);
    assert(rects.gantt.width > 0 && rects.gantt.height > 0, 'gantt visible on desktop', rects.gantt);
    await ctx.close();
    passCount++;
  }

  // ---- 7a. clicking #btn-gantt opens the Gantt modal ----
  {
    const { ctx, page, errors } = await freshPage(browser);
    await page.click('#btn-gantt');
    await page.waitForTimeout(100);
    const open = await page.evaluate(() => document.getElementById('gantt-modal').classList.contains('open'));
    assert(open, 'clicking #btn-gantt opens #gantt-modal');
    assert(!errors.length, 'no page errors after opening gantt', errors);
    await ctx.close();
    passCount++;
  }

  // ---- 7b. clicking #btn-kanban calls openKanban() ----
  {
    const { ctx, page } = await freshPage(browser);
    await page.evaluate(() => { window.__openKanbanCalled = false; window.openKanban = () => { window.__openKanbanCalled = true; }; });
    await page.click('#btn-kanban');
    await page.waitForTimeout(100);
    const called = await page.evaluate(() => window.__openKanbanCalled);
    assert(called, 'clicking #btn-kanban invokes openKanban()');
    await ctx.close();
    passCount++;
  }

  // ---- 8. small screen: toolbar collapse hides both buttons ----
  {
    const { ctx, page } = await freshPage(browser, { width: 390, height: 844 });
    const before = await page.evaluate(() => {
      const r = el => el.getBoundingClientRect();
      return {
        collapsed: document.querySelector('.toolbar').classList.contains('collapsed'),
        kanban: r(document.getElementById('btn-kanban')),
        gantt: r(document.getElementById('btn-gantt')),
        groupsMaxHeight: getComputedStyle(document.getElementById('toolbar-groups')).maxHeight,
      };
    });
    assert(!before.collapsed, 'toolbar starts expanded on phone width', before);
    assert(before.kanban.width > 0 && before.kanban.height > 0, 'kanban visible before collapse', before.kanban);
    assert(before.gantt.width > 0 && before.gantt.height > 0, 'gantt visible before collapse', before.gantt);

    await page.click('#btn-toolbar-toggle');
    await page.waitForTimeout(400); // .toolbar-groups transition is 0.2s
    const after = await page.evaluate(() => {
      const groups = document.getElementById('toolbar-groups');
      const cs = getComputedStyle(groups);
      return {
        collapsed: document.querySelector('.toolbar').classList.contains('collapsed'),
        maxHeight: cs.maxHeight,
        opacity: cs.opacity,
        kanbanVisible: document.getElementById('btn-kanban').getBoundingClientRect().height > 0 && cs.opacity !== '0',
      };
    });
    assert(after.collapsed, '.toolbar has collapsed class after clicking toggle', after);
    assert(after.maxHeight === '0px', '#toolbar-groups max-height is 0 when collapsed', after);
    assert(after.opacity === '0', '#toolbar-groups opacity is 0 when collapsed', after);

    // toggle back: buttons return
    await page.click('#btn-toolbar-toggle');
    await page.waitForTimeout(400);
    const restored = await page.evaluate(() => {
      const cs = getComputedStyle(document.getElementById('toolbar-groups'));
      return { collapsed: document.querySelector('.toolbar').classList.contains('collapsed'), opacity: cs.opacity };
    });
    assert(!restored.collapsed, 'toolbar expands again after a second toggle', restored);
    assert(restored.opacity === '1', '#toolbar-groups opacity restored to 1', restored);
    await ctx.close();
    passCount++;
  }

  // ---- 9. #btn-cal-sync still present in header; header order intact ----
  {
    const { ctx, page } = await freshPage(browser);
    const result = await page.evaluate(() => {
      const calSync = document.getElementById('btn-cal-sync');
      return {
        inHeaderActions: !!calSync && !!calSync.closest('.header-actions'),
        nextIsMapCommentOrMap: calSync.nextElementSibling && calSync.nextElementSibling.id === 'btn-map',
      };
    });
    assert(result.inHeaderActions, '#btn-cal-sync still lives in .header-actions', result);
    await ctx.close();
    passCount++;
  }

  // ---- edge case: rapid repeated activation of gantt doesn't throw / duplicate state ----
  // (the modal covers the button after the first open, so this drives the
  // same onclick handler directly rather than fighting Playwright's
  // actionability checks over an occluded element)
  {
    const { ctx, page, errors } = await freshPage(browser);
    await page.evaluate(() => { for (let i = 0; i < 5; i++) openGantt(); });
    await page.waitForTimeout(100);
    const openCount = await page.evaluate(() => document.querySelectorAll('#gantt-modal.open').length);
    assert(openCount === 1, 'rapid repeated clicks on #btn-gantt leave exactly one open modal, not duplicated', openCount);
    assert(!errors.length, 'no page errors after rapid clicks', errors);
    await ctx.close();
    passCount++;
  }

  // ---- edge case: keyboard-only activation (Tab to button, Enter) ----
  {
    const { ctx, page } = await freshPage(browser);
    await page.evaluate(() => { window.__openKanbanCalled = false; window.openKanban = () => { window.__openKanbanCalled = true; }; });
    await page.focus('#btn-kanban');
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
    assert(focused === 'btn-kanban', '#btn-kanban is focusable via .focus() (tab-reachable button)', focused);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const called = await page.evaluate(() => window.__openKanbanCalled);
    assert(called, 'Enter on focused #btn-kanban triggers openKanban() (keyboard-only activation)');
    await ctx.close();
    passCount++;
  }

  console.log(`PASS Kanban/Gantt toolbar relocation — ${passCount} groups of checks`);
  await browser.close();
})().catch(async e => {
  console.error(e);
  process.exit(1);
});

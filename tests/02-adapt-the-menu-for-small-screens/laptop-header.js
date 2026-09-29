// task-02 — the markdown-page header wraps instead of spilling at laptop
// widths (1025-1600px) instead of pushing the save/sync group off-screen.
// Adversarial suite written from
// docs/tasks/02-adapt-the-menu-for-small-screens/spec.md (§ 4).
//
//   node tests/02-adapt-the-menu-for-small-screens/laptop-header.js
//   PW_CHROME_PATH=/usr/bin/google-chrome-stable node tests/02-adapt-the-menu-for-small-screens/laptop-header.js
//
// Uses the `playwright` package already installed under tests/node_modules
// (same style as tests/03-for-index-html-page-in-idee/picker.js). Exit code
// 1 when any check fails.
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright'));

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

const LONG_CRUMB = 'Caietul meu foarte lung cu diacritice ăâîșț și mai multe cuvinte încă'; // ~68 chars
const LONG_FILE = 'un-nume-de-capitol-extrem-de-lung-care-trece-cu-mult-de-nouazeci-de-caractere-ca-sa-forteze-trunchierea.md'; // ~106 chars
const LONG_STATUS = 'x'.repeat(120);

const EXPECT = {
  ro: { cloudOn: '☁ Sincronizează acum', saveAll: '📚 Salvează tot ce s-a modificat' },
  en: { cloudOn: '☁ Sync now', saveAll: '📚 Save all modified' }
};

const WIDTHS = [1025, 1280, 1366, 1440, 1536, 1601, 1920];
const HEIGHT = 900;

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const errors = [];

  const setLang = page => l => page.evaluate(x => { window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: x })); }, l);

  // Applies the spec §4.1 worst case: connected Google, long status, map
  // button visible, long crumb, long file name. Must be re-run after any
  // language switch since applyUILang() re-labels buttons.
  const worstCase = page => page.evaluate(({ crumb, file, status }) => {
    gsFolder = { id: 'test-folder', name: 'ScuLa' };
    gsLastAt = Date.now() - 86400000;
    paintCloud();
    const a = document.querySelector('#wb-cloud-where a');
    if (a) a.textContent = status;
    document.getElementById('btn-map').hidden = false;
    const c = document.getElementById('wb-crumb');
    c.hidden = false;
    c.textContent = crumb;
    document.getElementById('current-file').textContent = file;
  }, { crumb: LONG_CRUMB, file: LONG_FILE, status: LONG_STATUS });

  const geometry = page => page.evaluate(() => {
    const sel = 'header .btn, header .file-name, header .wb-crumb, #wb-cloud-where, .toolbar .tb-btn, .toolbar .tb-select, .toolbar label';
    const vw = window.innerWidth;
    const out = [];
    document.querySelectorAll(sel).forEach(el => {
      const visible = el.offsetParent !== null || (el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
      if (!visible) return;
      const r = el.getBoundingClientRect();
      out.push({
        id: el.id || el.className,
        left: r.left, right: r.right, width: r.width,
        insideViewport: r.left >= -0.5 && r.right <= vw + 0.5
      });
    });
    return out;
  });

  const scrollOk = page => page.evaluate(() => ({
    docOk: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 0.5,
    bodyOk: document.body.scrollWidth <= document.body.clientWidth + 0.5,
    docScroll: document.documentElement.scrollWidth, docClient: document.documentElement.clientWidth,
    bodyScroll: document.body.scrollWidth, bodyClient: document.body.clientWidth
  }));

  const headerContainment = page => page.evaluate(() => {
    const hRect = document.querySelector('header').getBoundingClientRect();
    const bad = [];
    document.querySelectorAll('header .btn').forEach(btn => {
      const r = btn.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return; // hidden (e.g. #btn-map when off)
      const inside = r.left >= hRect.left - 0.5 && r.right <= hRect.right + 0.5 &&
                     r.top >= hRect.top - 0.5 && r.bottom <= hRect.bottom + 0.5;
      if (!inside) bad.push({ id: btn.id, btn: r, header: hRect });
    });
    return bad;
  });

  const labelsFull = (page, lang) => page.evaluate(lang => {
    const bad = [];
    document.querySelectorAll('header .btn').forEach(btn => {
      const r = btn.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (btn.scrollWidth > btn.clientWidth + 1) bad.push({ id: btn.id, scrollWidth: btn.scrollWidth, clientWidth: btn.clientWidth, text: btn.textContent });
    });
    return bad;
  }, lang);

  const truncationInfo = page => page.evaluate(() => {
    const ids = ['current-file', 'wb-crumb', 'wb-cloud-where'];
    return ids.map(id => {
      const el = document.getElementById(id);
      const cs = getComputedStyle(el);
      return { id, textOverflow: cs.textOverflow, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
  });

  const saveSyncRowInfo = page => page.evaluate(() => {
    const row = document.querySelector('.wb-save-sync-row');
    const rowRect = row.getBoundingClientRect();
    const wbBtn = document.getElementById('btn-workbooks').getBoundingClientRect();
    const actions = document.querySelector('.header-actions').getBoundingClientRect();
    const firstBtn = row.querySelector('.btn').getBoundingClientRect();
    // rightmost visible element inside the row
    let rightmost = -Infinity;
    row.querySelectorAll('.btn, #wb-cloud-where').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0) rightmost = Math.max(rightmost, r.right);
    });
    return {
      firstBtnTop: firstBtn.top,
      workbooksBottom: wbBtn.bottom,
      rightmost, actionsRight: actions.right,
      display: getComputedStyle(row).display
    };
  });

  const desktopUnchanged = page => page.evaluate(() => {
    const row = document.querySelector('.wb-save-sync-row');
    const header = document.querySelector('header');
    return {
      rowDisplay: getComputedStyle(row).display,
      headerHeight: getComputedStyle(header).height
    };
  });

  const tabletUnchanged = page => page.evaluate(() => {
    const row = document.querySelector('.wb-save-sync-row');
    const cs = getComputedStyle(row);
    return { order: cs.order, overflowX: cs.overflowX, flexWrap: cs.flexWrap };
  });

  async function withPage(viewport, fn) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
    await page.goto(URL);
    await page.waitForTimeout(300);
    try {
      await fn(page);
    } finally {
      await ctx.close();
    }
  }

  // ── § 4.2 assertions across all acceptance widths, both languages, worst case ──
  for (const width of WIDTHS) {
    for (const lang of ['ro', 'en']) {
      await withPage({ width, height: HEIGHT }, async page => {
        await setLang(page)(lang);
        await worstCase(page);
        await page.waitForTimeout(150);
        const tag = `w=${width} lang=${lang}`;

        // 1. every visible relevant element inside viewport
        const geo = await geometry(page);
        const offenders = geo.filter(g => !g.insideViewport);
        check(`[${tag}] all header/toolbar controls within viewport`, offenders.length === 0, offenders);

        // 2. no horizontal scroll
        const sc = await scrollOk(page);
        check(`[${tag}] no horizontal scroll (documentElement)`, sc.docOk, sc);
        check(`[${tag}] no horizontal scroll (body)`, sc.bodyOk, sc);

        // 3. header buttons not clipped by header ancestor
        const clipped = await headerContainment(page);
        check(`[${tag}] no header .btn clipped by header`, clipped.length === 0, clipped);

        // 4. full labels retained, correct text
        const truncatedBtns = await labelsFull(page, lang);
        check(`[${tag}] every header button shows full label (not clipped)`, truncatedBtns.length === 0, truncatedBtns);
        const cloudTxt = await page.$eval('#btn-wb-cloud', e => e.textContent);
        const saveAllTxt = await page.$eval('#btn-save-all-modified', e => e.textContent);
        check(`[${tag}] cloud button reads "${EXPECT[lang].cloudOn}"`, cloudTxt === EXPECT[lang].cloudOn, cloudTxt);
        check(`[${tag}] save-all button reads "${EXPECT[lang].saveAll}"`, saveAllTxt === EXPECT[lang].saveAll, saveAllTxt);

        // 5. truncation with ellipsis for long content, only at 1025-1600
        if (width >= 1025 && width <= 1600) {
          const trunc = await truncationInfo(page);
          for (const t of trunc) {
            check(`[${tag}] #${t.id} has text-overflow:ellipsis`, t.textOverflow === 'ellipsis', t);
            check(`[${tag}] #${t.id} is actually truncated (scrollWidth > clientWidth)`, t.scrollWidth > t.clientWidth, t);
          }
        }

        // 6. save/sync row own row, right-aligned, at 1025-1600
        if (width >= 1025 && width <= 1600) {
          const info = await saveSyncRowInfo(page);
          check(`[${tag}] save/sync row is its own row (below Workbooks button)`, info.firstBtnTop >= info.workbooksBottom - 1, info);
          check(`[${tag}] save/sync row right-aligned to .header-actions`, Math.abs(info.rightmost - info.actionsRight) <= 1, info);
        }

        // 7. desktop unchanged above breakpoint
        if (width >= 1601) {
          const d = await desktopUnchanged(page);
          check(`[${tag}] .wb-save-sync-row is display:contents above 1600px`, d.rowDisplay === 'contents', d);
          check(`[${tag}] header height 52px above 1600px`, d.headerHeight === '52px', d);
          if (width === 1920) {
            const offenders1920 = geo.filter(g => !g.insideViewport);
            check(`[${tag}] 1920 must pass viewport-containment fully`, offenders1920.length === 0, offenders1920);
          }
          // 1601 with worst case may legitimately overflow (pre-existing
          // desktop layout, out of scope) - already reported via check() above
          // as a finding rather than silently skipped.
        }
      });
    }
  }

  // ── § 4.2.8: tablet (1024px) untouched ──
  await withPage({ width: 1024, height: HEIGHT }, async page => {
    await setLang(page)('ro');
    await worstCase(page);
    const t = await tabletUnchanged(page);
    check('[tablet 1024] .wb-save-sync-row order: -1', t.order === '-1', t);
    check('[tablet 1024] .wb-save-sync-row overflow-x: auto', t.overflowX === 'auto', t);
    check('[tablet 1024] .wb-save-sync-row flex-wrap: nowrap', t.flexWrap === 'nowrap', t);
  });

  // ── § 4.2.9: buttons remain functional after reflow (not covered by another element) ──
  await withPage({ width: 1280, height: HEIGHT }, async page => {
    await setLang(page)('ro');
    await worstCase(page);
    await page.evaluate(() => { window.saveAllModifiedChapters = () => { window.__saveAllCalled = true; }; window.syncAllToFolder = () => { window.__syncCalled = true; }; });
    await page.click('#btn-save-all-modified');
    await page.click('#btn-wb-sync');
    await page.waitForTimeout(60);
    const calls = await page.evaluate(() => ({ save: !!window.__saveAllCalled, sync: !!window.__syncCalled }));
    check('[1280 ro] #btn-save-all-modified click reaches handler (not covered)', calls.save, calls);
    check('[1280 ro] #btn-wb-sync click reaches handler (not covered)', calls.sync, calls);
  });

  // ── #wb-cloud-where's <a> child stays clickable after the reflow ──
  await withPage({ width: 1280, height: HEIGHT }, async page => {
    await setLang(page)('ro');
    await worstCase(page);
    await page.waitForTimeout(100);
    const clickable = await page.evaluate(() => {
      const a = document.querySelector('#wb-cloud-where a');
      if (!a) return { found: false };
      // #wb-cloud-where clips (overflow:hidden) its long, ellipsized <a> child,
      // so the anchor's own bounding rect can extend past the visible,
      // clickable area - click inside the *parent's* rect (the part actually
      // rendered/clickable), not the raw anchor rect.
      const parentRect = document.getElementById('wb-cloud-where').getBoundingClientRect();
      const cx = parentRect.left + Math.min(10, parentRect.width / 2), cy = parentRect.top + parentRect.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      return { found: true, hitIsAnchorOrChild: hit === a || (a.contains && a.contains(hit)), pointerEvents: getComputedStyle(a).pointerEvents };
    });
    check('[1280 ro] #wb-cloud-where <a> exists and is not covered by another element', clickable.found && clickable.hitIsAnchorOrChild, clickable);
    check('[1280 ro] #wb-cloud-where <a> pointer-events not disabled', clickable.pointerEvents !== 'none', clickable);
  });

  // ── boundary: exactly 1024 vs 1025 (breakpoint edges) ──
  await withPage({ width: 1024, height: HEIGHT }, async page => {
    const t = await page.evaluate(() => getComputedStyle(document.querySelector('.wb-save-sync-row')).display);
    check('[boundary 1024] tablet rule applies (flex, order -1), new laptop block does not', t === 'flex', t);
  });
  await withPage({ width: 1025, height: HEIGHT }, async page => {
    const t = await page.evaluate(() => getComputedStyle(document.querySelector('.wb-save-sync-row')).display);
    check('[boundary 1025] laptop rule applies (flex, own row)', t === 'flex', t);
  });
  await withPage({ width: 1600, height: HEIGHT }, async page => {
    const t = await page.evaluate(() => getComputedStyle(document.querySelector('.wb-save-sync-row')).display);
    check('[boundary 1600] still laptop rule (display:flex, not contents)', t === 'flex', t);
  });
  await withPage({ width: 1601, height: HEIGHT }, async page => {
    const t = await page.evaluate(() => getComputedStyle(document.querySelector('.wb-save-sync-row')).display);
    check('[boundary 1601] desktop rule resumes (display:contents)', t === 'contents', t);
  });

  // ── minimal (non-worst-case) content still lays out fine at every width ──
  for (const width of [1025, 1280, 1536, 1920]) {
    await withPage({ width, height: HEIGHT }, async page => {
      const geo = await geometry(page);
      const offenders = geo.filter(g => !g.insideViewport);
      check(`[minimal content w=${width}] no overflow with default (short) content`, offenders.length === 0, offenders);
    });
  }

  // ── no product JS/console errors were triggered by any of the above ──
  check('no page errors were raised across the whole run', errors.length === 0, errors);

  await browser.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

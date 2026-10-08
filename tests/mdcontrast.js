// WCAG contrast for functional Markdown chrome, including translucent states.
// Run offline with bundled headless Chromium: node tests/mdcontrast.js
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

async function contrast(locator, label) {
  const result = await locator.evaluate(element => {
    // Let Chromium resolve CSS colors (including color-mix) to sRGB bytes.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const rgba = value => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const c = [...ctx.getImageData(0, 0, 1, 1).data];
      c[3] /= 255;
      return c;
    };
    const over = (a, b) => {
      const alpha = a[3] + b[3] * (1 - a[3]);
      return alpha ? [0, 1, 2].map(i =>
        (a[i] * a[3] + b[i] * b[3] * (1 - a[3])) / alpha).concat(alpha) : [0, 0, 0, 0];
    };
    let text = rgba(getComputedStyle(element).color), background = [0, 0, 0, 0];
    for (let e = element; e; e = e.parentElement) {
      const style = getComputedStyle(e), layer = rgba(style.backgroundColor);
      text = over(text, layer);
      background = over(background, layer);
      text[3] *= Number(style.opacity);
      background[3] *= Number(style.opacity);
    }
    text = over(text, [255, 255, 255, 1]);
    background = over(background, [255, 255, 255, 1]);
    const luminance = c => c.slice(0, 3).map(v => v / 255)
      .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const a = luminance(text), b = luminance(background);
    return { ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), text, background };
  });
  assert(result.ratio >= 4.5, label + ': ' + JSON.stringify(result));
  return result.ratio;
}

(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    await page.waitForFunction(() => wbDraftReady);
    for (const lang of ['ro', 'en']) {
      await page.evaluate(lang => {
        UI = lang; applyUILang();
        editor.value = '!nice Green\n\n!important Amber\n\n!vital Terracotta\n\n' +
          '- [ ] ~blocked Ana>> !vital Blocked\n- [x] Done\n\n##### Small heading\n';
        updatePreview(); updateStatus();
        document.getElementById('wb-cloud-where').innerHTML = '<a href="#">Local sync status</a>';
      }, lang);
      for (const selector of ['.panel-title', '.tb-label', '.file-name', '#wb-where',
        '#wb-cloud-where a', '#status-bar', '#preview .task-status-blocked', '#preview .md-assignee']) {
        const elements = page.locator(selector);
        assert(await elements.count() > 0, selector + ' exists');
        for (let i = 0; i < await elements.count(); i++) {
          await contrast(elements.nth(i), lang + ' normal ' + selector);
        }
      }
      await page.locator('.file-name').evaluate(e => e.classList.add('loose'));
      await contrast(page.locator('.file-name'), lang + ' loose-file warning');
      await page.locator('#wb-cloud-where').evaluate(e => e.classList.add('warn'));
      await contrast(page.locator('#wb-cloud-where a'), lang + ' sync warning');
      await page.locator('#wb-cloud-where a').hover();
      await page.waitForTimeout(200);
      await contrast(page.locator('#wb-cloud-where a'), lang + ' sync warning hover');
      await page.locator('#wb-cloud-where').evaluate(e => e.classList.remove('warn'));
      await page.locator('.file-name').evaluate(e => e.classList.remove('loose'));

      for (const level of ['nice', 'important', 'vital']) {
        const pills = page.locator('#preview .md-imp-' + level);
        for (let i = 0; i < await pills.count(); i++) {
          const pill = pills.nth(i);
          await page.mouse.move(0, 0);
          await contrast(pill, lang + ' ' + level + ' pill');
          await pill.hover();
          await contrast(pill, lang + ' ' + level + ' pill hover');
        }
      }
      const heading = page.locator('#nav-tree .nav-h5');
      await heading.evaluate(e => e.classList.add('active'));
      await contrast(heading.locator('.nav-label'), lang + ' selected heading');
      await heading.hover();
      await page.waitForTimeout(200);
      await contrast(heading.locator('.nav-label'), lang + ' selected heading hover');

      // Real component classes in a local fixture cover transient and filtered
      // states without microphone/Drive access or unrelated workbook setup.
      await page.evaluate(() => {
        document.getElementById('contrast-fixture')?.remove();
        const fixture = document.createElement('div');
        fixture.id = 'contrast-fixture';
        fixture.style.cssText = 'position:fixed;top:0;left:0;z-index:20000;padding:12px;background:var(--surface)';
        fixture.innerHTML = '<button class="nav-task-chip nav-task-blocked off">Blocked filter</button>' +
          '<button class="nav-task-chip nav-task-done off">Done filter</button>' +
          '<button class="find-chip">Result count <span class="find-n">12</span></button>' +
          '<div class="wb-ch-row current"><span class="wb-count">2 chapters</span></div>' +
          '<div class="gantt-bar vital" style="position:relative;top:0"><span>Vital task</span></div>' +
          '<div class="gantt-bar vital inferred" style="position:relative;top:0"><span>Inferred vital task</span></div>';
        document.body.append(fixture);
        document.getElementById('btn-dictate').disabled = false;
        document.getElementById('btn-dictate').classList.add('active');
        document.getElementById('btn-wb-cloud').classList.add('connected', 'syncing');
      });
      await page.waitForTimeout(200); // button color/background transitions
      for (const selector of ['#btn-dictate', '#btn-wb-cloud', '#contrast-fixture .nav-task-chip',
        '#contrast-fixture .find-n', '#contrast-fixture .wb-count', '#contrast-fixture .gantt-bar span']) {
        const elements = page.locator(selector);
        for (let i = 0; i < await elements.count(); i++) {
          await contrast(elements.nth(i), lang + ' active ' + selector);
        }
      }
      await page.locator('#contrast-fixture .find-chip').evaluate(e => e.classList.add('on'));
      await contrast(page.locator('#contrast-fixture .find-n'), lang + ' selected search count');
      await page.locator('#contrast-fixture .wb-ch-row').hover();
      await page.waitForTimeout(200);
      await contrast(page.locator('#contrast-fixture .wb-count'), lang + ' selected chapter hover');
      const colors = await page.locator(':root').evaluate(e => {
        const css = getComputedStyle(e);
        return ['--imp-nice', '--imp-important', '--imp-vital'].map(name => css.getPropertyValue(name).trim());
      });
      assert.equal(new Set(colors).size, 3, 'importance levels retain distinct colors');
      assert.equal(await page.locator('.tb-btn:disabled').first().evaluate(e => getComputedStyle(e).opacity),
        '0.35', 'genuinely disabled buttons retain their separate styling');
      await page.evaluate(() => {
        document.getElementById('contrast-fixture').remove();
        document.getElementById('btn-dictate').classList.remove('active');
        document.getElementById('btn-wb-cloud').classList.remove('connected', 'syncing');
      });
      console.log('PASS ' + lang + ' functional chrome and normal/hover/selected/warning contrast >= 4.5:1');
    }
    assert.deepEqual(errors, [], 'no browser errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

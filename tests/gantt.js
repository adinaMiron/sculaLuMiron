// Browser check for the chapter Gantt view and its task dependencies.
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROME_PATH || '/usr/bin/google-chrome-stable' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  const markdown = '- [ ] Ana>> Plan #1 !vital start@2026-09-24 end@2026-09-27\n- [ ] Build $1 >>Mihai !important start@2026-09-28 end@2026-10-02\n- [x] Review $1 end@2026-10-04\n- [ ] Later $8\n```\n- [ ] Hidden #8\n```';
  await page.evaluate(text => { editor.value = text; updatePreview(); }, markdown);
  await page.click('#btn-gantt');
  const result = await page.evaluate(() => ({
    open: document.getElementById('gantt-modal').classList.contains('open'),
    labels: [...document.querySelectorAll('.gantt-label a')].map(x => x.textContent),
    bars: [...document.querySelectorAll('.gantt-bar')].map(x => ({ left:parseFloat(x.style.left), width:parseFloat(x.style.width), cls:x.className })),
    paths: document.querySelectorAll('.gantt-arrows > path').length,
    notice: document.getElementById('gantt-notice').textContent,
    metadata: document.querySelector('.gantt-label small').textContent
  }));
  const assert = (condition, label) => { if (!condition) throw Error(label + ': ' + JSON.stringify(result)); };
  assert(result.open && result.labels.length === 4, 'four chapter tasks appear');
  assert(result.labels[0] === 'Plan' && result.labels[1] === 'Build', 'markers removed from task names');
  assert(result.paths === 2, 'two arrows share the #1 prerequisite');
  assert(result.bars[0].left < result.bars[1].left && result.bars[0].width > 0, 'dated bars positioned');
  assert(result.metadata.includes('Ana') && result.metadata.includes('vital') && result.metadata.includes('2026-09-27'), 'metadata visible');
  assert(result.notice.includes('#8'), 'missing dependency reported');
  await page.locator('.gantt-label a').nth(1).click();
  assert(await page.evaluate(() => !document.getElementById('gantt-modal').classList.contains('open') && editor.selectionStart === editor.value.indexOf('- [ ] Build')), 'task opens source line');
  assert(!errors.length, 'no page errors: ' + errors.join('; '));
  console.log('PASS Gantt tasks, dates, metadata, dependencies, navigation');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

const path = require('path');
const { chromium } = require('../node_modules/playwright');
const URL = 'file://' + path.join(__dirname, '..', '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

const filler = n => {
  const out = [];
  for (let i = 0; i < n; i++) out.push('Rând ' + i + ' — ' + 'text lung care se rupe pe mai multe rânduri. '.repeat(3));
  return out.join('\n');
};
const DOC = [
  '# Mecanică', '', filler(12), '', '## Inerție', '', filler(12), '',
  '```', '# nu este titlu, este cod', '```', '',
  '## Inerție', '', filler(30), '', '### Forța de frecare', '', 'Ultimul rând.', ''
].join('\n');

async function runAt(width, height) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForTimeout(300);
  await page.evaluate(doc => {
    const ed = document.getElementById('editor');
    ed.value = doc;
    updatePreview();
    updateStatus();
    if (document.getElementById('nav-panel').classList.contains('collapsed')) toggleNav();
  }, DOC);
  await page.waitForTimeout(200);

  const clickNth = n => page.evaluate(async i => {
    const ed = document.getElementById('editor');
    const pv = document.getElementById('preview');
    document.querySelectorAll('#nav-tree .nav-item')[i].click();
    await new Promise(r => setTimeout(r, 700));
    return {
      picked: ed.value.slice(ed.selectionStart, ed.selectionEnd),
      start: ed.selectionStart, edTop: ed.scrollTop, edMax: ed.scrollHeight - ed.clientHeight,
      pvTop: pv.scrollTop, pvMax: pv.scrollHeight - pv.clientHeight,
      flashed: (pv.querySelector('.md-target') || {}).id || ''
    };
  }, n);

  const last = await clickNth(3);
  check(`[${width}x${height}] preview jumps to bottom heading`, last.flashed === 'forța-de-frecare' && last.pvTop > last.pvMax * 0.5, last);
  const top = await clickNth(0);
  check(`[${width}x${height}] and the preview too (back to top)`, top.flashed === 'mecanică' && top.pvTop < 200, top);
  const headerH = await page.evaluate(() => document.querySelector('header').getBoundingClientRect().height);
  console.log(`  header height at ${width}: ${headerH}`);
  await browser.close();
}

(async () => {
  await runAt(1280, 860);  // inside task-02's new breakpoint
  await runAt(1920, 860);  // outside it - unchanged desktop layout
  await runAt(1024, 860);  // tablet - unchanged
  console.log(failed ? `\n${failed} FAILED` : '\nall good');
})();

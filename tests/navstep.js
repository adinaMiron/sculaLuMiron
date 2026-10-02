// Ctrl+Shift+. / Ctrl+Shift+, — next / previous heading or task, in the
// source, the preview and the navigation panel together.
//
//   node navstep.js        # from tests/
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(URL);
  await page.waitForSelector('#editor');
  const md = '# One\n\ntext\n\n- [ ] first task\n\n## Two\n\nmore\n\n- [x] done task\n';
  await page.evaluate(m => { const e = document.getElementById('editor'); e.value = m; e.dispatchEvent(new Event('input')); }, md);
  await page.waitForSelector('#nav-tree .nav-item');
  const state = () => page.evaluate(() => {
    const e = document.getElementById('editor');
    return { sel: e.value.slice(e.selectionStart, e.selectionEnd),
             active: (document.querySelector('#nav-tree .nav-item.active .nav-label') || {}).textContent };
  });
  await page.evaluate(() => { const e = document.getElementById('editor'); e.focus(); e.setSelectionRange(0, 0); });

  await page.keyboard.press('Control+Shift+.');
  let s = await state();
  check('first press goes past the caret line to the first task', s.active === 'first task' && s.sel.includes('first task'), s);
  await page.keyboard.press('Control+Shift+.');
  s = await state();
  check('next goes to the heading', s.active === 'Two' && s.sel === '## Two', s);
  await page.keyboard.press('Control+Shift+,');
  s = await state();
  check('previous goes back', s.active === 'first task', s);
  await page.keyboard.press('Control+Shift+.');
  await page.keyboard.press('Control+Shift+.');
  await page.keyboard.press('Control+Shift+.');
  s = await state();
  check('wraps to the first heading', s.active === 'One' && s.sel === '# One', s);
  await page.keyboard.press('Control+Shift+,');
  s = await state();
  check('previous wraps to the last task', s.active === 'done task', s);
  const h = await page.evaluate(() => document.getElementById('editor').value);
  check('text untouched', h === md);

  await browser.close();
  process.exit(failed ? 1 : 0);
})();

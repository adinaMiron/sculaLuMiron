// task-03 bug-1 regression — saveIdea() must not append twice when invoked
// again while the first call's persistence writes are still pending.
//
//   PW_CHROME_PATH=/usr/bin/google-chrome-stable node tests/03-for-index-html-page-in-idee/double-save.js
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright'));

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

const seed = () => {
  wbBooks.length = 0; wbChapters.length = 0;
  wbBooks.push({ id: 'wb_s', name: 'Școală', folder: 'scoala', created: 1, updated: 1, order: 0 });
  wbChapters.push({ id: 'c_fiz', workbookId: 'wb_s', title: 'Fizică', file: 'fizica.md', content: '# Fizică\n\ntext\n', created: 1, updated: 1, order: 0 });
  wbCurrentId = null; wbBooted = true;
  invalidateWikiIndex(); renderWorkbooks();
  // Make persistence slow and count calls.
  window.__calls = 0;
  if (!window.__origAppend) window.__origAppend = ideaAppendTo;
  ideaAppendTo = async (...a) => { window.__calls++; await new Promise(r => setTimeout(r, 600)); return window.__origAppend(...a); };
};

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.dismiss());
  await page.goto(URL);
  await page.waitForTimeout(400);

  const fresh = async () => {
    await page.evaluate(seed);
    await page.evaluate(() => loadChapterIntoEditor(wbChapter('c_fiz')));
    await page.evaluate(() => openIdeaModal());
    await page.fill('#idea-text', 'ideea unica');
    await page.waitForTimeout(100);
  };
  const count = () => page.evaluate(() => (wbChapter('c_fiz').content.match(/ideea unica/g) || []).length);

  // 1. Double Ctrl+Enter
  await fresh();
  await page.keyboard.press('Control+Enter');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(1500);
  check('double Ctrl+Enter appends once', await count() === 1, await count());
  check('append called once', await page.evaluate(() => window.__calls) === 1);
  check('textarea cleared', await page.$eval('#idea-text', e => e.value) === '');
  check('modal closed', !(await page.$eval('#idea-modal', e => e.classList.contains('open'))));

  // 2. Triple rapid, spaced within the window
  await fresh();
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(150);
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(150);
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(1500);
  check('three spaced Ctrl+Enter append once', await count() === 1, await count());

  // 3. Double-click on the Save button
  await fresh();
  const btn = await page.$('#idea-modal .btn-primary, #idea-modal button[onclick*="saveIdea"]');
  check('save button found', !!btn);
  if (btn) {
    await btn.dblclick();
    await page.waitForTimeout(1500);
    check('double-click Save appends once', await count() === 1, await count());
  }

  // 4. Guard is released after success: a later, different idea still saves
  await fresh();
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(1500);
  await page.evaluate(() => openIdeaModal());
  await page.fill('#idea-text', 'a doua');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(1500);
  const c = await page.evaluate(() => wbChapter('c_fiz').content);
  check('a later idea saves after the first', /ideea unica\na doua\n$/.test(c), c);

  // 5. Guard released after failure: append returns null, retry works
  await fresh();
  await page.evaluate(() => { ideaAppendTo = async () => null; });
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(300);
  check('failed save keeps modal open', await page.$eval('#idea-modal', e => e.classList.contains('open')));
  await page.evaluate(() => { ideaAppendTo = window.__origAppend; });
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(600);
  check('retry after failure saves once', await count() === 1, await count());

  // 6. Guard released after an exception in the writes
  await fresh();
  await page.evaluate(() => { ideaAppendTo = async () => { throw new Error('boom'); }; });
  await page.evaluate(() => saveIdea().catch(() => {}));
  await page.evaluate(() => { ideaAppendTo = window.__origAppend; });
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(600);
  check('retry after thrown write saves', await count() === 1, await count());

  // 7. Empty idea twice does not wedge the guard
  await page.evaluate(seed);
  await page.evaluate(() => { loadChapterIntoEditor(wbChapter('c_fiz')); openIdeaModal(); document.getElementById('idea-text').value = ''; });
  await page.keyboard.press('Control+Enter');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(200);
  await page.fill('#idea-text', 'ideea unica');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(1200);
  check('save works after empty attempts', await count() === 1, await count());

  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();

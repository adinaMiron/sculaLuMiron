// Undo / redo in index.html — the markdown editor's own history.
//
// The textarea's native stack is not what runs here: toolbar actions edit
// through setRangeText (not recorded by Chrome) and opening a chapter
// replaces .value outright. index.html keeps its own snapshot stack, hooked
// on `beforeinput` and on an override of editor.setRangeText. This drives
// the real page off disk: real keystrokes, the real toolbar buttons, the
// real textarea and preview.
//
//   node mdundo.js        # from tests/
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

const src = page => page.evaluate(() => editor.value);
const sel = page => page.evaluate(() => [editor.selectionStart, editor.selectionEnd]);
const btns = page => page.evaluate(() => ({
  undo: document.getElementById('btn-undo').disabled,
  redo: document.getElementById('btn-redo').disabled
}));
// Longer than UNDO_COALESCE_MS (700), so each phase is its own undo step.
const gap = page => page.waitForTimeout(800);

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text())) return;
    errors.push('CONSOLE ' + m.text());
  });
  page.on('dialog', d => d.accept());
  await page.goto(URL);
  await page.waitForTimeout(400);

  // ---- 1. nothing typed yet, nothing to undo ----------------------------
  check('both buttons start disabled', JSON.stringify(await btns(page)) === '{"undo":true,"redo":true}',
    await btns(page));

  // ---- 2. a burst of typing is one step, a newline starts another -------
  await page.click('#editor');
  await page.keyboard.type('one', { delay: 30 });
  await gap(page);
  await page.keyboard.press('Enter');
  await gap(page);
  await page.keyboard.type('two', { delay: 30 });
  check('the text is in the editor', (await src(page)) === 'one\ntwo', await src(page));
  check('undo is now available, redo is not',
    JSON.stringify(await btns(page)) === '{"undo":false,"redo":true}', await btns(page));

  await page.keyboard.press('Control+z');
  check('Ctrl+Z takes back the whole burst, not one letter', (await src(page)) === 'one\n', await src(page));
  await page.keyboard.press('Control+z');
  check('again, and the newline goes', (await src(page)) === 'one', await src(page));
  await page.keyboard.press('Control+z');
  check('again, and the first burst goes', (await src(page)) === '', await src(page));
  check('nothing left to undo, everything to redo',
    JSON.stringify(await btns(page)) === '{"undo":true,"redo":false}', await btns(page));

  // ---- 3. redo, both spellings ------------------------------------------
  await page.keyboard.press('Control+Shift+z');
  check('Ctrl+Shift+Z brings the first burst back', (await src(page)) === 'one', await src(page));
  await page.keyboard.press('Control+y');
  check('Ctrl+Y redoes too', (await src(page)) === 'one\n', await src(page));
  await page.click('#btn-redo');
  check('and the toolbar button is the third way to it', (await src(page)) === 'one\ntwo', await src(page));
  check('redo is exhausted', (await btns(page)).redo === true, await btns(page));

  // ---- 4. the preview follows the undone text ---------------------------
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(120);
  const prev = await page.evaluate(() => preview.textContent.trim());
  check('the preview is rebuilt from the undone value', !/two/.test(prev), prev);

  // ---- 5. a toolbar action is one step, and the selection comes back ----
  await page.evaluate(() => { editor.value = 'alpha beta'; updatePreview(); updateStatus(); undoReset(); });
  await page.evaluate(() => { editor.focus(); editor.setSelectionRange(0, 5); });
  await page.click('.tb-btn[data-i-title="boldTip"]');
  check('bold wrapped the selection', (await src(page)) === '**alpha** beta', await src(page));
  check('and that is one undo step', (await btns(page)).undo === false);
  await page.click('#btn-undo');
  check('undo takes the markers back off', (await src(page)) === 'alpha beta', await src(page));
  check('and restores the selection it was applied to',
    JSON.stringify(await sel(page)) === '[0,5]', await sel(page));

  // ---- 6. so is a list, and every other setRangeText edit ---------------
  await page.evaluate(() => { editor.value = 'milk'; editor.setSelectionRange(0, 4); undoReset(); });
  await page.click('.tb-btn[data-i="listBtn"]');
  check('the list marker went in', /^- milk/.test(await src(page)), await src(page));
  await page.keyboard.press('Control+z');
  check('one undo takes the whole list edit back', (await src(page)) === 'milk', await src(page));

  // ---- 7. Ctrl+Z in a modal field leaves the document alone -------------
  await page.evaluate(() => { editor.value = 'keep me'; updatePreview(); undoReset(); });
  await page.evaluate(() => openLinkModal());
  await page.fill('#link-url', 'https://example.com');
  await page.keyboard.press('Control+z');
  check('the editor is untouched while a modal input has focus',
    (await src(page)) === 'keep me', await src(page));
  await page.keyboard.press('Escape');

  // ---- 8. a new document starts a new history ---------------------------
  await page.evaluate(() => { editor.focus(); });
  await page.keyboard.type('scratch', { delay: 20 });
  check('there is something to undo', (await btns(page)).undo === false);
  await page.evaluate(() => newFile());
  await page.waitForTimeout(150);
  check('New empties the editor', (await src(page)) === '', await src(page));
  check('and the previous document\'s history goes with it',
    JSON.stringify(await btns(page)) === '{"undo":true,"redo":true}', await btns(page));
  check('the stacks really are empty',
    (await page.evaluate(() => undoStack.length + redoStack.length)) === 0);

  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall good');
  process.exit(failed ? 1 : 0);
})();

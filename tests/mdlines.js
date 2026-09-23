// Insert a blank line above / below the caret's line in index.html.
//   Ctrl+Enter        -> blank line below, caret on it
//   Ctrl+Shift+Enter  -> blank line above, caret on it
// Both edit through editor.setRangeText, so each is one undo step.
// Drives the real page off disk with real keystrokes.
//
//   node mdlines.js        # from tests/
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
const caretLine = page => page.evaluate(() => {
  const v = editor.value, s = editor.selectionStart;
  return v.slice(0, s).split('\n').length - 1;           // 0-based line index of the caret
});

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

  // Typing into the source must not leave a second painted copy behind it.
  await page.evaluate(() => {
    editor.value = 'first\nsecond';
    editor.focus();
    editor.setSelectionRange(9, 9);
  });
  await page.keyboard.press('Space');
  const sourceLayers = await page.evaluate(() => ({
    value: editor.value,
    overlay: document.getElementById('editor-matches').textContent,
    color: getComputedStyle(editor).color
  }));
  check('Space inserts one character in the source', sourceLayers.value === 'first\nsec ond', sourceLayers);
  check('the search overlay stays empty while typing normally',
    sourceLayers.overlay === '' && sourceLayers.color !== 'rgba(0, 0, 0, 0)', sourceLayers);

  await page.evaluate(() => {
    editor.setSelectionRange(0, 5);
    highlightPageMatches(false);
  });
  const matchedLayers = await page.evaluate(() => ({
    overlay: document.getElementById('editor-matches').textContent,
    marks: document.querySelectorAll('#editor-matches mark.page-match').length,
    color: getComputedStyle(editor).color
  }));
  check('search highlighting uses one visible source layer',
    matchedLayers.overlay === sourceLayers.value && matchedLayers.marks === 1 &&
    matchedLayers.color === 'rgba(0, 0, 0, 0)', matchedLayers);
  await page.evaluate(() => { pageMatchQuery = ''; paintEditorMatches(); });

  // three lines, caret parked in the middle one
  await page.evaluate(() => {
    editor.value = 'first\nsecond\nthird';
    updatePreview(); updateStatus(); undoReset();
    editor.focus();
    const p = editor.value.indexOf('second') + 3;   // inside "second"
    editor.setSelectionRange(p, p);
  });

  // ---- Ctrl+Enter: blank line below ------------------------------------
  await page.keyboard.press('Control+Enter');
  check('a blank line is inserted below the caret line',
    (await src(page)) === 'first\nsecond\n\nthird', await src(page));
  check('the caret is on the new blank line', (await caretLine(page)) === 2, await caretLine(page));

  await page.keyboard.press('Control+z');
  check('one undo removes it', (await src(page)) === 'first\nsecond\nthird', await src(page));

  // ---- Ctrl+Shift+Enter: blank line above -----------------------------
  await page.evaluate(() => {
    const p = editor.value.indexOf('second') + 3;
    editor.setSelectionRange(p, p);
  });
  await page.keyboard.press('Control+Shift+Enter');
  check('a blank line is inserted above the caret line',
    (await src(page)) === 'first\n\nsecond\nthird', await src(page));
  check('the caret is on the new blank line', (await caretLine(page)) === 1, await caretLine(page));

  await page.keyboard.press('Control+z');
  check('one undo removes it', (await src(page)) === 'first\nsecond\nthird', await src(page));

  // ---- edges: first line above, last line below ----------------------
  await page.evaluate(() => editor.setSelectionRange(2, 2));   // inside "first"
  await page.keyboard.press('Control+Shift+Enter');
  check('above the first line works', (await src(page)) === '\nfirst\nsecond\nthird', await src(page));
  await page.keyboard.press('Control+z');

  await page.evaluate(() => {
    const p = editor.value.length - 1;                         // inside "third"
    editor.setSelectionRange(p, p);
  });
  await page.keyboard.press('Control+Enter');
  check('below the last line works', (await src(page)) === 'first\nsecond\nthird\n', await src(page));

  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall good');
  process.exit(failed ? 1 : 0);
})();

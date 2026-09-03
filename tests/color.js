// Inline hex colour codes in index.html — "#4F8A97".
//
// A 6- or 8-digit hex colour written straight into the markdown renders as
// the code in mono with a small colour chip in front of it — the same string
// in the live preview and in the HTML export. Drives the real page off disk
// and asserts on the real preview DOM, the real export string, and the graph
// scanner (which must not mistake a colour code for a #tag).
//
//   node color.js        # from tests/
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

async function render(page, md) {
  await page.evaluate(md => {
    document.getElementById('editor').value = md;
    updatePreview(); updateStatus();
  }, md);
  await page.waitForTimeout(80);
}

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
  await page.goto(URL);
  await page.waitForTimeout(300);

  // ---- 1. the preview shows a chip + the code -------------------------------
  await render(page, 'the accent is #4F8A97 in the header\n');
  let chip = await page.evaluate(() => {
    const c = document.querySelector('#preview .md-color');
    const sw = c && c.querySelector('.md-color-sw');
    return c && {
      text: c.textContent,
      swBg: sw && getComputedStyle(sw).backgroundColor,
      tags: document.querySelectorAll('#preview .md-tag').length
    };
  });
  check('the code text is kept', chip && chip.text === '#4F8A97', chip);
  check('the swatch is painted with that colour',
    chip && chip.swBg === 'rgb(79, 138, 151)', chip);
  check('it is not rendered as a #tag', chip && chip.tags === 0, chip);

  // ---- 2. 8-digit (with alpha) works too -----------------------------------
  await render(page, 'faint overlay #00000080 here\n');
  check('an 8-digit #rrggbbaa is a swatch',
    await page.evaluate(() => {
      const c = document.querySelector('#preview .md-color');
      return !!c && c.textContent === '#00000080';
    }));

  // ---- 3. what must NOT become a swatch -----------------------------------
  await render(page, '#project is a tag\nand #12345 and #1234567 are plain\n`#4F8A97` in code stays code\n');
  const negatives = await page.evaluate(() => ({
    tagKept: document.querySelectorAll('#preview .md-tag').length,
    swatches: document.querySelectorAll('#preview .md-color').length,
    codeText: (document.querySelector('#preview code') || {}).textContent
  }));
  check('a real #tag is untouched', negatives.tagKept === 1, negatives);
  check('a 5- or 7-digit run is left as plain text', negatives.swatches === 0, negatives);
  check('a colour inside `code` stays inside the code span',
    negatives.codeText === '#4F8A97', negatives);

  // ---- 4. the export bakes the same markup, with literal-hex CSS ---------
  const exported = await page.evaluate(() =>
    parseMarkdown('brand colour #4F8A97 for buttons', { forExport: true }));
  check('the export renders the same span',
    /<span class="md-color"><span class="md-color-sw" style="background:#4F8A97"><\/span>#4F8A97<\/span>/.test(exported),
    exported);
  const cssHasRule = await page.evaluate(() => {
    const html = document.documentElement.outerHTML;
    // the export template lives inside the page as a literal string
    return /\.md-color-sw \{[^}]*border:/.test(html);
  });
  check('the export template carries a .md-color-sw rule', cssHasRule);

  // ---- 5. the graph scanner ignores a colour code ----------------------
  const scan = await page.evaluate(() =>
    scanNote('palette: #4F8A97 and #ffffff, plus a real #tag').tags.map(t => t.tag));
  check('scanNote() mints a node only for the real tag',
    scan.length === 1 && scan[0] === 'tag', scan);

  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall good');
  process.exit(failed ? 1 : 0);
})();

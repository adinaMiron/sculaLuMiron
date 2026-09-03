// Selection panel → Culoare: the HEX ↔ HSL / RGB converters in #colorTools.
//
// #rowColor carries two read-only converter fields:
//   HEX → HSL   #hexIn  → #hslOut   ("hsl(h, s%, l%)")
//   HSL → RGB   #hslIn  → #hexOut   ("#RRGGBB")
// Drives editor.html off disk and asserts on the real inputs.
//
//   PW_CHROME_PATH=/usr/bin/google-chrome-stable node selcolor.js   # from tests/
const { open, sleep } = require('./lib');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

async function type(page, sel, value) {
  await page.fill(sel, value);
  // the handler is on 'input'; fill() dispatches it, but give it a tick
  await sleep(30);
}

(async () => {
  const { browser, page, errors } = await open({ mobile: false, width: 1280, height: 900 });
  await sleep(300);

  // the panel is remembered hidden across runs — make sure it is open
  const hidden = await page.evaluate(() => document.getElementById('selectionPanel').hidden);
  if (hidden) { await page.click('#toggleSelectionBtn'); await sleep(80); }

  // ---- HEX → HSL (the pre-existing direction still works) -----------------
  await type(page, '#hexIn', '#C7B84A');
  check('hex → hsl', await page.inputValue('#hslOut') === 'hsl(53, 53%, 54%)',
    await page.inputValue('#hslOut'));

  await type(page, '#hexIn', '#fff');
  check('3-digit hex is accepted', await page.inputValue('#hslOut') === 'hsl(0, 0%, 100%)',
    await page.inputValue('#hslOut'));

  await type(page, '#hexIn', 'nonsense');
  check('a bad hex shows —', await page.inputValue('#hslOut') === '—',
    await page.inputValue('#hslOut'));

  // ---- HSL → RGB (#rrggbb, the new direction) ---------------------------
  await type(page, '#hslIn', 'hsl(0, 100%, 50%)');
  check('pure red', await page.inputValue('#hexOut') === '#FF0000',
    await page.inputValue('#hexOut'));

  await type(page, '#hslIn', 'hsl(240, 100%, 50%)');
  check('pure blue', await page.inputValue('#hexOut') === '#0000FF',
    await page.inputValue('#hexOut'));

  await type(page, '#hslIn', '51 55% 54%');
  check('bare "h s% l%" parses', await page.inputValue('#hexOut') === '#CAB749',
    await page.inputValue('#hexOut'));

  await type(page, '#hslIn', '');
  check('empty shows —', await page.inputValue('#hexOut') === '—',
    await page.inputValue('#hexOut'));

  // ---- round-trip: hex → hsl → hex lands back within rounding ----------
  await type(page, '#hexIn', '#4F8A97');
  const hsl = await page.inputValue('#hslOut');
  await type(page, '#hslIn', hsl);
  const back = await page.inputValue('#hexOut');
  const d = ['#4F8A97', back].map(h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)));
  const maxDelta = Math.max(...d[0].map((v, i) => Math.abs(v - d[1][i])));
  check('round-trip #4F8A97 → ' + hsl + ' → ' + back + ' (Δ ' + maxDelta + ')',
    maxDelta <= 3, { hsl, back });

  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall good');
  process.exit(failed ? 1 : 0);
})();

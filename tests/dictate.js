// Voice dictation in index.html: the Caiet vocal transcriber,
// writing into the open chapter. Uses the settings saved under the shared
// "caiet-vocal:settings" blob and has no settings UI of its own.
//
// Drives the real app off disk like graph.js / find.js / nav.js. The
// microphone is Chromium's fake device; the transcription POST is stubbed
// (that endpoint is not what is under test) so the only thing asserted is
// where the returned text lands in the textarea.
//
//   node dictate.js            # from tests/  (PW_CHROME_PATH=/path/to/chrome)
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

// The settings the Caiet vocal page would have saved. `custom` provider +
// endpoint needs no API key, so no secret goes near the test; segMin 0
// disables segment rotation, so one start/stop is exactly one transcription.
const SETTINGS = {
  engine: 'api', provider: 'custom',
  endpoint: 'https://stt.test/audio/transcriptions',
  key: '', model: 'whisper-large-v3', lang: 'ro',
  segMin: 0, tidy: false, hint: ''
};

async function newPage(browser, settings) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text())) return;   // the mammoth CDN, offline
    errors.push('CONSOLE ' + m.text());
  });
  // Stub the transcription service: always returns the same text.
  await page.route('**/audio/transcriptions', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ text: 'salut lume' })
  }));
  await page.addInitScript(s => {
    try { localStorage.setItem('caiet-vocal:settings', JSON.stringify(s)); } catch (e) {}
  }, settings);
  await page.goto(URL);
  await page.waitForFunction(() => !!window.ScuLaFolder && typeof window.toggleDictation === 'function');
  await sleep(150);
  return { ctx, page, errors };
}

// Start dictation, let the fake mic run, stop, wait for the stubbed text to land.
async function dictateOnce(page, ms) {
  await page.click('#btn-dictate');
  await page.waitForFunction(() => document.getElementById('btn-dictate').classList.contains('active'));
  await sleep(ms);
  await page.click('#btn-dictate');
  await page.waitForFunction(() => document.getElementById('editor').value.includes('salut lume'), null, { timeout: 8000 });
  await sleep(100);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  });

  // 1. No caret in the editor -> appended on a fresh line under the last one.
  {
    const { ctx, page, errors } = await newPage(browser, SETTINGS);
    await page.evaluate(() => { const e = document.getElementById('editor'); e.value = 'Linia unu.'; updatePreview(); updateStatus(); });
    await dictateOnce(page, 1300);
    const val = await page.inputValue('#editor');
    check('no caret: text appended on a new paragraph after the last line',
      val === 'Linia unu.\n\nsalut lume', val);
    check('the pill hides and the button clears after it finishes',
      await page.evaluate(() => document.getElementById('dictate-pill').hidden
        && !document.getElementById('btn-dictate').classList.contains('active')));
    check('no page errors', errors.length === 0, errors);
    await ctx.close();
  }

  // 2. Caret in the middle of the text -> inserted exactly there.
  {
    const { ctx, page, errors } = await newPage(browser, SETTINGS);
    await page.evaluate(() => {
      const e = document.getElementById('editor');
      e.value = 'unu doi'; updatePreview(); updateStatus();
      e.focus(); e.setSelectionRange(3, 3);   // right after "unu"
    });
    await dictateOnce(page, 1300);
    const val = await page.inputValue('#editor');
    check('caret respected: text inserted at the caret, not appended',
      val === 'unu salut lume doi', val);
    check('no page errors', errors.length === 0, errors);
    await ctx.close();
  }

  // 3. Each append-run lands after the previous text, one paragraph per run
  //    (matches voice.html's appendText).
  {
    const { ctx, page, errors } = await newPage(browser, SETTINGS);
    await page.evaluate(() => { const e = document.getElementById('editor'); e.value = ''; updatePreview(); });
    await dictateOnce(page, 1200);
    await dictateOnce(page, 1200);
    const val = await page.inputValue('#editor');
    check('a second run appends below the first, never back at the start',
      val === 'salut lume\n\nsalut lume', val);
    check('no page errors', errors.length === 0, errors);
    await ctx.close();
  }

  // 4. No API key set anywhere -> refuses, tells the user, records nothing.
  {
    const bad = Object.assign({}, SETTINGS, { provider: 'groq', endpoint: '', key: '' });
    const { ctx, page, errors } = await newPage(browser, bad);
    await page.evaluate(() => { const e = document.getElementById('editor'); e.value = 'neatins'; updatePreview(); });
    await page.click('#btn-dictate');
    await sleep(600);
    check('unconfigured: the button never goes active',
      await page.evaluate(() => !document.getElementById('btn-dictate').classList.contains('active')));
    check('unconfigured: a toast explains why',
      await page.evaluate(() => {
        const el = document.getElementById('scula-toast');
        return !!el && el.classList.contains('show') && /Caiet vocal/i.test(el.textContent);
      }));
    check('unconfigured: the chapter is untouched', (await page.inputValue('#editor')) === 'neatins');
    check('no page errors', errors.length === 0, errors);
    await ctx.close();
  }

  await browser.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();

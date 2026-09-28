// Voice dictation in index.html: the Caiet vocal transcriber,
// writing into the open chapter. Uses the settings saved under the shared
// "caiet-vocal:settings" blob and has no settings UI of its own.
//
// Drives the real app off disk like graph.js / find.js / nav.js. The
// microphone is Chromium's fake device; the transcription POST is stubbed
// (that endpoint is not what is under test) so the only thing asserted is
// where the returned text lands in the textarea.
//
// Phrase mode: the API engine cuts the recording at pauses and sends each
// phrase alone. The fake microphone plays a WAV written here (0.5 s silence,
// 1.2 s speech-like tone, 2 s silence) via --use-file-for-fake-audio-capture
// (the melody.js route), which yields exactly one phrase per session.
//
//   node dictate.js            # from tests/  (PW_CHROME_PATH=/path/to/chrome)
const path = require('path');
const os = require('os');
const fs = require('fs');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

// 16 kHz mono 16-bit WAV: silence, a modulated 150-250 Hz harmonic tone at
// about -12 dBFS (a pure sine can be eaten by noise suppression), silence.
function speechWav() {
  const sr = 16000, n = Math.round(sr * 3.7), pcm = Buffer.alloc(44 + n * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write('WAVEfmt ', 8);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(sr, 24); pcm.writeUInt32LE(sr * 2, 28); pcm.writeUInt16LE(2, 32);
  pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(n * 2, 40);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    if (t >= 0.5 && t < 1.7) {
      const f0 = 200 + 50 * Math.sin(2 * Math.PI * 3 * t);
      ph += 2 * Math.PI * f0 / sr;
      const env = 0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t);
      v = 0.25 * env * (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.3 * Math.sin(3 * ph));
    }
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2);
  }
  return pcm;
}
const WAV_FILE = path.join(os.tmpdir(), 'dictate-test-speech.wav');
fs.writeFileSync(WAV_FILE, speechWav());

// The settings the Caiet vocal page would have saved. `custom` provider +
// endpoint needs no API key, so no secret goes near the test.
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

// Start dictation, wait for the stubbed text (it now arrives while recording,
// once the phrase's trailing pause has been heard), then stop.
async function dictateOnce(page) {
  const before = (await page.inputValue('#editor')).split('salut lume').length - 1;
  await page.click('#btn-dictate');
  await page.waitForFunction(() => document.getElementById('btn-dictate').classList.contains('active'));
  await page.waitForFunction(([n]) => document.getElementById('editor').value.split('salut lume').length - 1 > n,
    [before], { timeout: 12000 });
  await page.click('#btn-dictate');
  await sleep(300);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
           '--use-file-for-fake-audio-capture=' + WAV_FILE + '%noloop']
  });

  // 1. No caret in the editor -> appended on a fresh line under the last one.
  {
    const { ctx, page, errors } = await newPage(browser, SETTINGS);
    await page.evaluate(() => { const e = document.getElementById('editor'); e.value = 'Linia unu.'; updatePreview(); updateStatus(); });
    await dictateOnce(page);
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
    await dictateOnce(page);
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
    await dictateOnce(page);
    await dictateOnce(page);
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

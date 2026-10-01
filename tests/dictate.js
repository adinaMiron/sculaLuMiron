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

async function newPage(browser, settings, stub) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text())) return;   // the mammoth CDN, offline
    errors.push('CONSOLE ' + m.text());
  });
  // Stub the transcription service: by default always returns the same text.
  await page.route('**/audio/transcriptions', stub || (route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ text: 'salut lume' })
  })));
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
  const runs = () => page.evaluate(() => document.getElementById('editor').value.split('salut lume').length - 1);
  const before = await runs();
  await page.click('#btn-dictate');
  await page.waitForFunction(() => document.getElementById('btn-dictate').classList.contains('active'));
  await sleep(ms);
  await page.click('#btn-dictate');
  // wait for *this* run's text, not one an earlier run already left behind
  await page.waitForFunction(n => document.getElementById('editor').value.split('salut lume').length - 1 > n,
    before, { timeout: 8000 });
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

  // 5-7. Spoken language: only ever Romanian or English. A stub that acts
  //      like Whisper — its own detection hears a short Romanian clip as
  //      Russian — must still end in Romanian text, through the 💡 idea box.
  //      `spoken` is what was "said"; `detect` is what Whisper's
  //      auto-detection answers; `autoFails` makes the undirected request
  //      fail the way a runaway hallucination does.
  function whisperStub(log, { spoken, detect, autoFails }) {
    const said = { ro: 'salut lume', en: 'hello world' };
    return route => {
      const body = route.request().postData() || '';
      const field = name => {
        const m = body.match(new RegExp('name="' + name + '"\\r\\n\\r\\n([^\\r]*)'));
        return m ? m[1] : '';
      };
      const lang = field('language');
      log.push({ lang, format: field('response_format'), prompt: field('prompt') });
      const reply = (status, obj) => route.fulfill({
        status, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(obj)
      });
      if (!lang && autoFails) return reply(400, { error: { message: 'The generated text is too long' } });
      if (!lang && detect === 'russian') return reply(200, {
        language: 'russian', text: 'Салют луме',
        segments: [{ start: 0, end: 1.5, avg_logprob: -1.1 }] });
      const as = lang || (detect === 'english' ? 'en' : 'ro');
      const right = as === spoken;
      return reply(200, {
        language: as === 'en' ? 'english' : 'romanian',
        text: right ? said[spoken] : (as === 'en' ? 'salute loom' : 'helo uorld'),
        segments: [{ start: 0, end: 1.5, avg_logprob: right ? -0.2 : -0.9 }]
      });
    };
  }
  async function ideaDictate(page, wanted) {
    await page.evaluate(() => openIdeaModal());
    await page.click('#btn-idea-dictate');
    await page.waitForFunction(() => document.getElementById('btn-idea-dictate').classList.contains('active'));
    await sleep(1200);
    await page.click('#btn-idea-dictate');
    await page.waitForFunction(w => document.getElementById('idea-text').value.includes(w), wanted, { timeout: 8000 })
      .catch(() => {});   // the checks below report what landed instead
    await sleep(300);
    return page.inputValue('#idea-text');
  }
  for (const c of [
    { name: 'Romanian heard as Russian', spoken: 'ro', detect: 'russian', want: 'salut lume' },
    { name: 'English, preferred language Romanian', spoken: 'en', detect: 'english', want: 'hello world' },
    { name: 'Romanian, the undirected request fails', spoken: 'ro', autoFails: true, want: 'salut lume' }
  ]) {
    const log = [];
    const { ctx, page, errors } = await newPage(browser, SETTINGS, whisperStub(log, c));
    const val = await ideaDictate(page, c.want);
    check(c.name + ': the idea box gets "' + c.want + '"', val === c.want, val);
    check(c.name + ': no Cyrillic, no wrong-language guess',
      !/[Ѐ-ӿ]/.test(val) && !/salute loom|helo uorld/.test(val), val);
    check(c.name + ': no prompt sent, and the first request forces no language',
      log.length > 0 && log.every(r => !r.prompt) && log[0].lang === '', log);
    if (c.detect === 'english')
      check(c.name + ': a detected ro/en answer is kept with one request', log.length === 1, log);
    else
      check(c.name + ': retried forced as ro and as en, still asking for confidence',
        log.filter(r => r.lang).map(r => r.lang + ':' + r.format).sort().join() === 'en:verbose_json,ro:verbose_json', log);
    check('no page errors', errors.length === 0, errors);
    await ctx.close();
  }

  await browser.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();

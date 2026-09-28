// Task 02: the dictation buttons read "⏹ Oprește înregistrarea" while the mic is on.
// Run from the repo root:
//   PW_CHROME_PATH=/usr/bin/google-chrome-stable node tests/02-for-index-html-page-dicteaza-menu/stop-label.js
// Needs tests/node_modules (cd tests && npm install). Exit code is non-zero on any failure.
const path = require('path');
const { chromium } = require('../node_modules/playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', '..', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

const API = { engine: 'api', provider: 'custom', endpoint: 'https://stt.test/audio/transcriptions', key: '', model: 'w', lang: 'ro', segMin: 0, tidy: false, hint: '' };
const LIVE = { ...API, engine: 'live' };
const UNCONF = { ...API, endpoint: '', key: '' };

// Stubbed SpeechRecognition that exposes the last instance as window.__sr.
const SR_STUB = () => {
  class SR {
    constructor() { window.__sr = this; }
    start() { this.started = true; }
    stop() { this.stopped = true; }
  }
  window.SpeechRecognition = SR; window.webkitSpeechRecognition = SR;
};

async function open(browser, settings, { width = 1280, delay = 0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/audio/transcriptions', async route => {
    if (delay) await sleep(delay);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ text: 'salut' }) });
  });
  await page.addInitScript(SR_STUB);
  await page.addInitScript(s => {
    try { if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('caiet-vocal:settings', JSON.stringify(s)); sessionStorage.setItem('__seeded', '1'); } } catch (e) {}
  }, settings);
  await page.goto(URL);
  await page.waitForFunction(() => !!window.ScuLaFolder && typeof window.toggleDictation === 'function');
  await sleep(150);
  return { ctx, page, errors };
}

const snap = (page, id) => page.evaluate(id => {
  const b = document.getElementById(id);
  return { text: b.textContent, title: b.title, aria: b.getAttribute('aria-label'), dI: b.getAttribute('data-i'),
           dT: b.getAttribute('data-i-title'), dA: b.getAttribute('data-i-aria'), active: b.classList.contains('active') };
}, id);
const isActive = (page, id) => page.waitForFunction(id => document.getElementById(id).classList.contains('active'), id);

// Flip the UI language through the real nav control (the EN/RO button).
async function toggleLang(page) {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll('#site-nav button, #site-nav a, #site-nav [role=button]')]
      .find(e => /^(EN|RO)$/i.test(e.textContent.trim()));
    if (el) el.click();
    return !!el;
  });
}

const RO = { btn: '🎤 Dictare', stop: '⏹ Oprește înregistrarea', tip: 'Oprește dictarea', aria: 'Oprește înregistrarea' };
const EN = { btn: '🎤 Dictate', stop: '⏹ Stop recording', tip: 'Stop dictation', aria: 'Stop recording' };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });

  // ---- API engine, romanian
  {
    const { ctx, page, errors } = await open(browser, API, { delay: 2500 });
    const idle = await snap(page, 'btn-dictate');
    check('idle: ro label', idle.text === RO.btn, idle);
    check('idle: no aria-label / data-i-aria', idle.aria === null && idle.dA === null, idle);
    check('idle: data-i keys as markup', idle.dI === 'dictateBtn' && idle.dT === 'dictateTip', idle);
    const idleTitle = idle.title;
    await page.click('#btn-dictate');
    await isActive(page, 'btn-dictate');
    const on = await snap(page, 'btn-dictate');
    check('API rec: exact ro stop label', on.text === RO.stop, on);
    check('API rec: title', on.title === RO.tip, on);
    check('API rec: aria-label', on.aria === RO.aria, on);
    const idea = await snap(page, 'btn-idea-dictate');
    check('API rec: idea button untouched', idea.text === RO.btn && idea.aria === null && !idea.active, idea);
    await sleep(600); // let the colour transition settle
    const bg = await page.$eval('#btn-dictate', b => getComputedStyle(b).backgroundColor);
    const danger = await page.evaluate(() => { const d = document.createElement('i'); d.style.backgroundColor = 'var(--danger)'; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
    check('API rec: red .active background kept', bg === danger && danger !== 'rgba(0, 0, 0, 0)', { bg, danger });
    await sleep(1000);
    await page.click('#btn-dictate');
    const off = await snap(page, 'btn-dictate');
    const pillVisible = await page.waitForFunction(() => !document.getElementById('dictate-pill').hidden, null, { timeout: 2000 }).then(() => true, () => false);
    check('stop: label reverts immediately', off.text === RO.btn && !off.active, off);
    check('stop: pill (Transcriu…) still up while button reverted', pillVisible);
    check('stop: aria-label/data-i-aria gone, title + keys restored', off.aria === null && off.dA === null && off.title === idleTitle && off.dI === 'dictateBtn' && off.dT === 'dictateTip', off);
    await page.waitForFunction(() => document.getElementById('editor').value.includes('salut'), null, { timeout: 10000 });
    const after = await snap(page, 'btn-dictate');
    check('after transcription lands: still normal', after.text === RO.btn && after.aria === null, after);

    // rapid repeated toggling ends in a state consistent with .active
    for (let i = 0; i < 6; i++) { await page.click('#btn-dictate'); await sleep(60); }
    await sleep(600);
    const st = await snap(page, 'btn-dictate');
    check('rapid toggling: label consistent with .active', st.active ? (st.text === RO.stop && st.aria === RO.aria) : (st.text === RO.btn && st.aria === null), st);
    check('no page errors (API)', errors.length === 0, errors);
    await ctx.close();
  }

  // ---- language switch during recording (API)
  {
    const { ctx, page } = await open(browser, API, { delay: 100 });
    await page.click('#btn-dictate');
    await isActive(page, 'btn-dictate');
    check('found nav language toggle', await toggleLang(page));
    await sleep(200);
    const en = await snap(page, 'btn-dictate');
    check('lang switch mid-rec: EN stop label', en.text === EN.stop, en);
    check('lang switch mid-rec: EN tooltip', en.title === EN.tip, en);
    check('lang switch mid-rec: EN aria-label', en.aria === EN.aria, en);
    check('lang switch mid-rec: still active', en.active, en);
    await page.click('#btn-dictate');
    const enOff = await snap(page, 'btn-dictate');
    check('EN stop: normal EN label', enOff.text === EN.btn && enOff.aria === null && !enOff.active, enOff);
    await page.waitForTimeout(400);
    await page.click('#btn-dictate'); await isActive(page, 'btn-dictate');
    const en2 = await snap(page, 'btn-dictate');
    check('EN rec again: EN stop label', en2.text === EN.stop && en2.title === EN.tip && en2.aria === EN.aria, en2);
    await toggleLang(page); await sleep(200);
    const ro2 = await snap(page, 'btn-dictate');
    check('toggle back mid-rec: RO stop label incl. title+aria', ro2.text === RO.stop && ro2.title === RO.tip && ro2.aria === RO.aria, ro2);
    await page.click('#btn-dictate'); await sleep(200);
    const ro3 = await snap(page, 'btn-dictate');
    check('RO stop: normal RO label', ro3.text === RO.btn && ro3.aria === null, ro3);
    await ctx.close();
  }

  // ---- lang switch while idle must not leave stop keys
  {
    const { ctx, page } = await open(browser, API);
    await toggleLang(page); await sleep(150);
    const s = await snap(page, 'btn-dictate');
    check('idle lang switch: EN normal label, no aria', s.text === EN.btn && s.aria === null, s);
    await ctx.close();
  }

  // ---- unconfigured API engine: fail path
  {
    const { ctx, page, errors } = await open(browser, UNCONF);
    await page.click('#btn-dictate'); await sleep(500);
    const s = await snap(page, 'btn-dictate');
    check('unconfigured: label stays Dictare, not active, no aria', s.text === RO.btn && !s.active && s.aria === null && s.dA === null, s);
    const i = await snap(page, 'btn-idea-dictate');
    check('unconfigured: idea button untouched', i.text === RO.btn, i);
    check('unconfigured: no errors', errors.length === 0, errors);
    await ctx.close();
  }

  // ---- mic denied (getUserMedia rejects)
  {
    const { ctx, page } = await open(browser, API);
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('no', 'NotAllowedError')); });
    await page.click('#btn-dictate'); await sleep(500);
    const s = await snap(page, 'btn-dictate');
    check('mic denied: normal label, not active', s.text === RO.btn && !s.active && s.aria === null, s);
    await ctx.close();
  }

  // ---- live engine
  {
    const { ctx, page } = await open(browser, LIVE);
    await page.click('#btn-dictate'); await isActive(page, 'btn-dictate');
    const on = await snap(page, 'btn-dictate');
    check('live: stop label/title/aria', on.text === RO.stop && on.title === RO.tip && on.aria === RO.aria, on);
    await page.click('#btn-dictate');
    const off = await snap(page, 'btn-dictate');
    check('live: manual stop reverts', off.text === RO.btn && off.aria === null && !off.active, off);
    // onend with wantOn true restarts the recogniser; the label must stay "stop"
    await page.click('#btn-dictate'); await isActive(page, 'btn-dictate');
    await page.evaluate(() => window.__sr.onend());
    const restarted = await snap(page, 'btn-dictate');
    check('live: onend with wantOn=true keeps stop label (auto restart)', restarted.text === RO.stop && restarted.active, restarted);
    await page.evaluate(() => window.__sr.onerror({ error: 'not-allowed' }));
    const err = await snap(page, 'btn-dictate');
    check('live: onerror not-allowed reverts', err.text === RO.btn && !err.active && err.aria === null, err);
    await page.evaluate(() => window.__sr.onend());
    const err2 = await snap(page, 'btn-dictate');
    check('live: onend after error stays normal', err2.text === RO.btn && err2.aria === null, err2);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, LIVE);
    await page.click('#btn-dictate'); await isActive(page, 'btn-dictate');
    // engine that does not fire onend itself: stop, then fire onend by hand (wantOn is false)
    await page.click('#btn-dictate');
    await page.evaluate(() => window.__sr.onend());
    const s = await snap(page, 'btn-dictate');
    check('live: onend with wantOn=false is normal', s.text === RO.btn && !s.active && s.aria === null, s);
    await page.click('#btn-dictate'); await isActive(page, 'btn-dictate');
    await page.evaluate(() => { window.__sr.onerror({ error: 'language-not-supported' }); window.__sr.onend(); });
    const l = await snap(page, 'btn-dictate');
    check('live: language-not-supported reverts', l.text === RO.btn && !l.active, l);
    await page.click('#btn-dictate'); await isActive(page, 'btn-dictate');
    await toggleLang(page); await sleep(150);
    const e = await snap(page, 'btn-dictate');
    check('live: lang switch mid-rec -> EN stop label', e.text === EN.stop && e.aria === EN.aria && e.title === EN.tip, e);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, LIVE);
    await page.evaluate(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
    await page.click('#btn-dictate'); await sleep(400);
    const s = await snap(page, 'btn-dictate');
    check('live unsupported: normal label', s.text === RO.btn && !s.active && s.aria === null, s);
    await ctx.close();
  }

  // ---- idea box
  for (const [name, settings] of [['API', API], ['live', LIVE]]) {
    const { ctx, page } = await open(browser, settings);
    await page.keyboard.press('Control+Alt+i');
    await page.waitForSelector('#idea-modal.open');
    await page.click('#btn-idea-dictate'); await isActive(page, 'btn-idea-dictate');
    const i = await snap(page, 'btn-idea-dictate');
    const m = await snap(page, 'btn-dictate');
    check(`idea (${name}): idea button shows stop label`, i.text === RO.stop && i.title === RO.tip && i.aria === RO.aria, i);
    check(`idea (${name}): toolbar button stays Dictare`, m.text === RO.btn && !m.active && m.aria === null, m);
    await toggleLang(page); await sleep(150);
    const ie = await snap(page, 'btn-idea-dictate');
    check(`idea (${name}): lang switch mid-rec`, ie.text === EN.stop && ie.aria === EN.aria, ie);
    await toggleLang(page); await sleep(150);
    await page.evaluate(() => closeIdeaModal());
    await sleep(200);
    const c = await snap(page, 'btn-idea-dictate');
    check(`idea (${name}): closing modal reverts`, c.text === RO.btn && !c.active && c.aria === null && c.dI === 'dictateBtn' && c.dT === 'dictateTip', c);
    await page.keyboard.press('Control+Alt+i');
    await page.waitForSelector('#idea-modal.open');
    const r = await snap(page, 'btn-idea-dictate');
    check(`idea (${name}): reopened reads Dictare`, r.text === RO.btn && r.aria === null, r);
    await page.evaluate(() => closeIdeaModal()); await sleep(100);
    await page.click('#btn-dictate'); await isActive(page, 'btn-dictate');
    const t2 = await snap(page, 'btn-dictate'); const i2 = await snap(page, 'btn-idea-dictate');
    check(`idea (${name}): toolbar recording leaves idea button alone`, t2.text === RO.stop && i2.text === RO.btn && !i2.active, { t2, i2 });
    await ctx.close();
  }

  // ---- narrow screens
  {
    const wide = await open(browser, API, { width: 1280 });
    await wide.page.click('#btn-dictate'); await isActive(wide.page, 'btn-dictate');
    const wBox = await wide.page.$eval('#btn-dictate', b => b.getBoundingClientRect().width);
    const wFs = await wide.page.$eval('#btn-dictate', b => getComputedStyle(b).fontSize);
    check('1280px rec: full text visible (font-size not 0)', wFs !== '0px', wFs);
    await wide.ctx.close();

    const n = await open(browser, API, { width: 390 });
    const idleBox = await n.page.$eval('#btn-dictate', b => b.getBoundingClientRect().width);
    await n.page.click('#btn-dictate'); await isActive(n.page, 'btn-dictate');
    await sleep(600); // .tb-btn transitions; measure the settled state
    const info = await n.page.$eval('#btn-dictate', b => {
      const r = b.getBoundingClientRect(), cs = getComputedStyle(b), bf = getComputedStyle(b, '::before');
      return { w: r.width, h: r.height, fs: cs.fontSize, before: bf.content, pl: cs.paddingLeft, aria: b.getAttribute('aria-label'), title: b.title, text: b.textContent };
    });
    check('390px rec: computed font-size 0px', info.fs === '0px', info);
    check('390px rec: ::before content "⏹"', info.before === '"⏹"', info);
    check('390px rec: narrower than 1280px', info.w < wBox - 30, { narrow: info.w, wide: wBox });
    check('390px rec: tap size not collapsed (>=24px each way)', info.w >= 24 && info.h >= 24, info);
    check('390px rec: padding kept', parseFloat(info.pl) > 0, info);
    check('390px rec: aria + title full', info.aria === RO.aria && info.title === RO.tip, info);
    await n.page.click('#btn-dictate');
    await sleep(600);
    const back = await n.page.$eval('#btn-dictate', b => ({ fs: getComputedStyle(b).fontSize, w: b.getBoundingClientRect().width, text: b.textContent }));
    check('390px stop: full idle label & size restored', back.fs === '13px' && back.text === RO.btn && Math.abs(back.w - idleBox) < 1, { back, idleBox });
    for (const [w, narrow] of [[700, true], [701, false]]) {
      const p = await open(browser, API, { width: w });
      await p.page.click('#btn-dictate'); await isActive(p.page, 'btn-dictate');
      await sleep(600);
      const fs = await p.page.$eval('#btn-dictate', b => getComputedStyle(b).fontSize);
      check(`${w}px rec: icon-only is ${narrow}`, (fs === '0px') === narrow, fs);
      await p.ctx.close();
    }
    await n.page.keyboard.press('Control+Alt+i');
    await n.page.waitForSelector('#idea-modal.open');
    await n.page.click('#btn-idea-dictate'); await isActive(n.page, 'btn-idea-dictate');
    const ib = await n.page.$eval('#btn-idea-dictate', b => ({ fs: getComputedStyle(b).fontSize, text: b.textContent, before: getComputedStyle(b, '::before').content }));
    check('390px idea button: full text, no ::before glyph', ib.fs !== '0px' && ib.text === RO.stop && (ib.before === 'none' || ib.before === 'normal'), ib);
    await n.page.evaluate(() => closeIdeaModal());
    await sleep(400);
    await n.page.click('#btn-dictate'); await isActive(n.page, 'btn-dictate');
    await toggleLang(n.page); await sleep(700);
    const en = await n.page.$eval('#btn-dictate', b => ({ fs: getComputedStyle(b).fontSize, aria: b.getAttribute('aria-label'), title: b.title }));
    check('390px EN rec: icon-only with EN aria/title', en.fs === '0px' && en.aria === EN.aria && en.title === EN.tip, en);
    await n.ctx.close();
  }

  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

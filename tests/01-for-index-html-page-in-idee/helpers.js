// Shared helpers for the task-01 suite: dictation never translates.
// Drives the real index.html off disk with a fake mic, exactly like
// tests/dictate.js, but adds a multipart-body parser (to assert on the
// FormData fields the API engine sends) and a fake webkitSpeechRecognition
// (for the live-engine language check).
const path = require('path');

const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', '..', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const DEFAULT_SETTINGS = {
  engine: 'api', provider: 'custom',
  endpoint: 'https://stt.test/audio/transcriptions',
  key: '', model: 'whisper-large-v3', lang: 'ro',
  segMin: 0, tidy: false, hint: ''
};

function settings(overrides) {
  return Object.assign({}, DEFAULT_SETTINGS, overrides || {});
}

// Splits a raw `multipart/form-data` body (as Playwright hands it back from
// request.postDataBuffer()) into { name -> string value }, plus whether a
// `file` part was present. Good enough for text fields; the file part's
// bytes are not decoded.
function parseMultipart(buffer, contentType) {
  const m = /boundary=(.+)$/.exec(contentType || '');
  if (!m) return null;
  const boundary = '--' + m[1].trim();
  const body = buffer.toString('latin1');
  const fields = {};
  let hasFile = false;
  for (const raw of body.split(boundary)) {
    const part = raw.replace(/^\r\n/, '');
    const head = /Content-Disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i.exec(part);
    if (!head) continue;
    const name = head[1];
    if (head[2] !== undefined) { hasFile = hasFile || name === 'file'; continue; }
    const sep = part.indexOf('\r\n\r\n');
    if (sep < 0) continue;
    fields[name] = part.slice(sep + 4).replace(/\r\n--?$/, '').replace(/\r\n$/, '');
  }
  return { fields, hasFile };
}

// Loads the app with settings seeded into the shared caiet-vocal:settings
// blob and a fake webkitSpeechRecognition installed (harmless when the
// engine is "api" — startLive() is never reached).
async function load(page, opts) {
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text())) return;
    errors.push('CONSOLE ' + m.text());
  });
  await page.addInitScript(() => {
    window.__srLog = [];
    function FakeSR() {
      this._lang = '';
      this.continuous = false;
      this.interimResults = false;
      this.onresult = null; this.onerror = null; this.onend = null;
      Object.defineProperty(this, 'lang', {
        get() { return this._lang; },
        set(v) { this._lang = v; window.__srLog.push(v); }
      });
    }
    FakeSR.prototype.start = function () {};
    FakeSR.prototype.stop = function () {
      if (this.onend) this.onend();
    };
    // Chrome ships both the unprefixed and the webkit-prefixed constructor
    // natively; dictation.js tries the unprefixed one first, so both must
    // be replaced or the real (network-backed) engine wins over the stub.
    window.SpeechRecognition = FakeSR;
    window.webkitSpeechRecognition = FakeSR;
  });
  await page.addInitScript(s => {
    try { localStorage.setItem('caiet-vocal:settings', JSON.stringify(s)); } catch (e) {}
  }, settings(opts));
  await page.goto(URL);
  await page.waitForFunction(() => !!window.ScuLaFolder && typeof window.toggleDictation === 'function');
  await sleep(150);
  return errors;
}

async function openIdea(page) {
  await page.click('#btn-idea');
  await page.waitForSelector('#idea-modal.open');
}

// Presses the given dictate button, waits for it to go active, waits `ms`
// (the fake mic "records" while the button is active), then presses it
// again to stop. Caller waits for the resulting text separately.
async function dictateOnce(page, btnSel, ms) {
  await page.click(btnSel);
  await page.waitForFunction(sel => document.querySelector(sel).classList.contains('active'), btnSel);
  await sleep(ms);
  await page.click(btnSel);
}

module.exports = { URL, settings, parseMultipart, load, openIdea, dictateOnce, sleep };

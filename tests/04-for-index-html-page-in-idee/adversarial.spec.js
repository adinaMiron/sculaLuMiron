const { test, expect } = require('@playwright/test');
const path = require('path');

const url = 'file://' + path.resolve(__dirname, '../../index.html');
const baseSettings = {
  engine: 'api', provider: 'groq', key: 'test-key', model: 'whisper-large-v3-turbo',
  lang: 'en', hint: 'Translate everything to English', segMin: 1, tidy: false
};

async function open(page, settings = {}) {
  await page.addInitScript(s => localStorage.setItem('caiet-vocal:settings', JSON.stringify(s)),
    { ...baseSettings, ...settings });
  await page.goto(url);
  await page.waitForFunction(() => window.ScuLaDictation && window.toggleDictation);
  await page.evaluate(() => {
    window.__mic = { nodes: [], stopped: 0 };
    navigator.mediaDevices.getUserMedia = async () => ({
      getTracks: () => [{ stop: () => window.__mic.stopped++ }]
    });
    window.AudioContext = class {
      constructor() { this.sampleRate = 16000; this.state = 'running'; this.destination = {}; }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createScriptProcessor() {
        const node = { onaudioprocess: null, connect() {}, disconnect() {} };
        window.__mic.nodes.push(node);
        return node;
      }
      close() { return Promise.resolve(); }
    };
    window.__feed = (seconds, amplitude) => {
      const length = Math.round(seconds * 16000);
      const samples = new Float32Array(length);
      if (amplitude) samples.fill(amplitude);
      const node = window.__mic.nodes.at(-1);
      if (!node || !node.onaudioprocess) throw Error('no active microphone');
      node.onaudioprocess({ inputBuffer: { getChannelData: () => samples } });
    };
  });
}

async function phrase(page) {
  await page.evaluate(() => { window.__feed(.6, .1); window.__feed(.8, 0); });
}

function reply(route, text, status = 200, headers = {}) {
  return route.fulfill({ status, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', ...headers },
    body: JSON.stringify(status === 200 ? { text } : { error: { message: text } }) });
}

test('phrase boundary, onset, and index rules hold across arbitrary chunk sizes', async ({ page }) => {
  await open(page);
  const actual = await page.evaluate(() => {
    const output = [];
    const phraser = ScuLaDictation.makePhraser({ sampleRate: 16000,
      onPhrase: (samples, info) => output.push({ ...info, samples: samples.length }) });
    function feed(seconds, amplitude, chunk = 317) {
      const data = new Float32Array(Math.round(seconds * 16000)).fill(amplitude);
      for (let i = 0; i < data.length; i += chunk) phraser.push(data.subarray(i, i + chunk));
    }
    feed(.04, .1); feed(.8, 0); // fewer than three onset frames: ignored
    feed(.48, .1); feed(.8, 0); // under 500 ms: ignored
    feed(.5, .1); feed(.68, 0); feed(.5, .1); feed(.8, 0); // one phrase
    feed(.6, .1); feed(.8, 0); // another phrase
    phraser.flush();
    return output;
  });
  expect(actual).toHaveLength(2);
  expect(actual.map(x => x.index)).toEqual([1, 2]);
  expect(actual[0].voicedSec).toBeGreaterThan(1.5);
  expect(actual[1].voicedSec).toBeGreaterThanOrEqual(.5);
  expect(actual[0].startSec).toBeLessThan(actual[1].startSec);
});

test('request pool starts at most two uploads and releases the third when one finishes', async ({ page }) => {
  const waiting = [];
  let starts = 0;
  await page.route('**/audio/transcriptions', async route => {
    const number = ++starts;
    await new Promise(resolve => waiting[number] = resolve);
    await reply(route, `Phrase ${number}.`);
  });
  await open(page);
  await page.locator('#btn-dictate').click();
  await phrase(page); await phrase(page); await phrase(page);
  await expect.poll(() => starts).toBe(2);
  await expect(page.locator('#dictate-pill-interim')).toContainText('3 în transcriere');
  waiting[2]();
  await expect.poll(() => starts).toBe(3);
  await expect(page.locator('#editor')).toHaveValue('');
  waiting[1](); waiting[3]();
  await expect(page.locator('#editor')).toHaveValue('Phrase 1. Phrase 2. Phrase 3.');
  await page.locator('#btn-dictate').click();
});

test('a second 429 yields one marker and later phrases still upload', async ({ page }) => {
  let requests = 0;
  await page.route('**/audio/transcriptions', route => {
    requests++;
    return requests <= 2 ? reply(route, 'rate limited', 429, { 'Retry-After': '0' })
      : reply(route, 'Later English phrase.');
  });
  await open(page);
  await page.locator('#btn-dictate').click();
  await phrase(page);
  await expect(page.locator('#editor')).toHaveValue('[🎤 ?]');
  await expect(page.locator('#scula-toast')).toContainText('Fraza 1 nu a putut fi transcrisă: rate limited');
  await phrase(page);
  await expect(page.locator('#editor')).toHaveValue('[🎤 ?] Later English phrase.');
  expect(requests).toBe(3);
  await page.locator('#btn-dictate').click();
});

test('custom provider accepts endpoint without key and retains its chosen model', async ({ page }) => {
  let posted;
  await page.route('**/audio/transcriptions', route => {
    posted = route.request().postData();
    expect(route.request().headers().authorization).toBeUndefined();
    return reply(route, 'Bună dimineața.');
  });
  await open(page, { provider: 'custom', key: '', endpoint: 'https://stt.example/audio/transcriptions', model: 'my-local-model' });
  await page.locator('#btn-dictate').click();
  await phrase(page);
  await expect(page.locator('#editor')).toHaveValue('Bună dimineața.');
  expect(posted).toContain('name="model"\r\n\r\nmy-local-model\r\n');
  expect(posted).not.toMatch(/name="(?:language|prompt)"/);
  await page.locator('#btn-dictate').click();
});

test('closing idea modal while microphone permission is pending cannot start a hidden recording', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.__getUserMediaStarted = false;
    navigator.mediaDevices.getUserMedia = () => {
      window.__getUserMediaStarted = true;
      return new Promise(resolve => {
        window.__grantMic = () => resolve({ getTracks: () => [{ stop: () => window.__mic.stopped++ }] });
      });
    };
    openIdeaModal();
  });
  await page.locator('#btn-idea-dictate').click();
  await page.waitForFunction(() => window.__getUserMediaStarted);
  await page.keyboard.press('Escape');
  await expect(page.locator('#idea-modal')).not.toHaveClass(/open/);
  await page.evaluate(() => window.__grantMic());
  await expect.poll(() => page.evaluate(() => window.__mic.nodes.length)).toBe(0);
  await expect(page.locator('#btn-idea-dictate')).not.toHaveClass(/active/);
  await expect(page.locator('#dictate-pill')).toBeHidden();
  expect(await page.evaluate(() => window.__mic.stopped)).toBe(1);
});

test('closing and reopening Quick Idea during permission prompt keeps the new recording and rejects the old one', async ({ page }) => {
  await page.route('**/audio/transcriptions', route => reply(route, 'New idea only.'));
  await open(page);
  await page.evaluate(() => {
    window.__grants = [];
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => {
      window.__grants.push(() => resolve({ getTracks: () => [{ stop: () => window.__mic.stopped++ }] }));
    });
    openIdeaModal();
  });
  await page.locator('#btn-idea-dictate').click();
  await page.waitForFunction(() => window.__grants.length === 1);
  await page.keyboard.press('Escape');
  await page.evaluate(() => openIdeaModal());
  await page.locator('#btn-idea-dictate').click();
  await page.waitForFunction(() => window.__grants.length === 2);
  await page.evaluate(() => window.__grants[0]());
  await expect.poll(() => page.evaluate(() => window.__mic.stopped)).toBe(1);
  expect(await page.evaluate(() => window.__mic.nodes.length)).toBe(0);
  await page.evaluate(() => window.__grants[1]());
  await expect(page.locator('#btn-idea-dictate')).toHaveClass(/active/);
  await phrase(page);
  await expect(page.locator('#idea-text')).toHaveValue('New idea only.');
  expect(await page.evaluate(() => window.__mic.nodes.length)).toBe(1);
  await page.keyboard.press('Escape');
});

test('closing Quick Idea aborts two pending tidy requests and frees both upload slots for the editor', async ({ page }) => {
  let transcriptCount = 0;
  await page.route('**/audio/transcriptions', route => reply(route, `Phrase ${++transcriptCount}.`));
  await open(page, { tidy: true });
  await page.evaluate(() => {
    window.__tidy = { started: 0, aborted: 0 };
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, opts) => {
      if (!String(input).includes('/chat/completions')) return realFetch(input, opts);
      const n = ++window.__tidy.started;
      if (n > 2) return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'Editor phrase.' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return new Promise((resolve, reject) => {
        const abort = () => { window.__tidy.aborted++; reject(new DOMException('Aborted', 'AbortError')); };
        opts.signal.addEventListener('abort', abort, { once: true });
      });
    };
    openIdeaModal();
  });
  await page.locator('#btn-idea-dictate').click();
  await expect(page.locator('#btn-idea-dictate')).toHaveClass(/active/);
  await phrase(page); await phrase(page);
  await page.waitForFunction(() => window.__tidy.started === 2);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__tidy.aborted)).toBe(2);
  await expect(page.locator('#dictate-pill')).toBeHidden();
  await page.locator('#btn-dictate').click();
  await expect(page.locator('#btn-dictate')).toHaveClass(/active/);
  await phrase(page);
  await expect(page.locator('#editor')).toHaveValue('Editor phrase.');
  expect(await page.inputValue('#idea-text')).toBe('');
  expect(transcriptCount).toBe(3);
  await page.locator('#btn-dictate').click();
});

test('stopping mid phrase uploads qualifying speech but drops a short burst', async ({ page }) => {
  let requests = 0;
  await page.route('**/audio/transcriptions', route => { requests++; return reply(route, 'Flushed words.'); });
  await open(page);
  await page.locator('#btn-dictate').click();
  await expect(page.locator('#btn-dictate')).toHaveClass(/active/);
  await page.evaluate(() => window.__feed(.4, .1));
  await page.locator('#btn-dictate').click();
  expect(requests).toBe(0);
  await expect(page.locator('#dictate-pill')).toBeHidden();
  await page.locator('#btn-dictate').click();
  await expect(page.locator('#btn-dictate')).toHaveClass(/active/);
  await page.evaluate(() => window.__feed(.6, .1));
  await page.locator('#btn-dictate').click();
  await expect(page.locator('#editor')).toHaveValue('Flushed words.');
  expect(requests).toBe(1);
  await expect(page.locator('#dictate-pill')).toBeHidden();
});

test('malformed transcription JSON marks its position and does not stop later speech', async ({ page }) => {
  let requests = 0;
  await page.route('**/audio/transcriptions', route => ++requests === 1
    ? route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/json', body: '{invalid' })
    : reply(route, 'Later words.'));
  await open(page);
  await page.locator('#btn-dictate').click();
  await expect(page.locator('#btn-dictate')).toHaveClass(/active/);
  await phrase(page); await phrase(page);
  await expect(page.locator('#editor')).toHaveValue('[🎤 ?] Later words.');
  await expect(page.locator('#scula-toast')).toContainText('Fraza 1 nu a putut fi transcrisă:');
  expect(requests).toBe(2);
  await page.locator('#btn-dictate').click();
});

test('network failure gets one marker without retry and later speech still transcribes', async ({ page }) => {
  let requests = 0;
  await page.route('**/audio/transcriptions', route => ++requests === 1
    ? route.abort('failed') : reply(route, 'Recovered English.'));
  await open(page);
  await page.locator('#btn-dictate').click();
  await expect(page.locator('#btn-dictate')).toHaveClass(/active/);
  await phrase(page);
  await expect(page.locator('#editor')).toHaveValue('[🎤 ?]');
  await expect(page.locator('#scula-toast')).toContainText('Fraza 1 nu a putut fi transcrisă: Conexiune eșuată');
  await phrase(page);
  await expect(page.locator('#editor')).toHaveValue('[🎤 ?] Recovered English.');
  expect(requests).toBe(2);
  await page.locator('#btn-dictate').click();
});

test('missing Web Audio refuses startup without asking for microphone permission', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
    navigator.mediaDevices.getUserMedia = () => { throw Error('must not request microphone'); };
  });
  await page.locator('#btn-dictate').click();
  await expect(page.locator('#btn-dictate')).not.toHaveClass(/active/);
  await expect(page.locator('#dictate-pill')).toBeHidden();
  await expect(page.locator('#scula-toast')).toContainText('Reportofonul nu este disponibil');
  expect(await page.evaluate(() => window.__mic.nodes.length)).toBe(0);
});

test('denied microphone permission leaves no active recorder and a later attempt can succeed', async ({ page }) => {
  await page.route('**/audio/transcriptions', route => reply(route, 'After permission.'));
  await open(page);
  await page.evaluate(() => {
    const grant = navigator.mediaDevices.getUserMedia;
    let first = true;
    navigator.mediaDevices.getUserMedia = (...args) => {
      if (first) { first = false; return Promise.reject(new DOMException('Denied', 'NotAllowedError')); }
      return grant(...args);
    };
  });
  await page.locator('#btn-dictate').click();
  await expect(page.locator('#btn-dictate')).not.toHaveClass(/active/);
  await expect(page.locator('#scula-toast')).toContainText('Nu am acces la microfon');
  expect(await page.evaluate(() => window.__mic.nodes.length)).toBe(0);
  await page.locator('#btn-dictate').click();
  await expect(page.locator('#btn-dictate')).toHaveClass(/active/);
  await phrase(page);
  await expect(page.locator('#editor')).toHaveValue('After permission.');
  await page.locator('#btn-dictate').click();
});

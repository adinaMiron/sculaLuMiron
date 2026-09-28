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

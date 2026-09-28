const { test, expect } = require('@playwright/test');
const path = require('path');

const url = 'file://' + path.resolve(__dirname, '../../index.html');
const settings = {
  engine: 'api', provider: 'groq', key: 'test-key', model: 'whisper-large-v3-turbo',
  lang: 'en', hint: 'Translate to English', tidy: false
};

async function open(page, overrides = {}) {
  await page.addInitScript(value => localStorage.setItem('caiet-vocal:settings', JSON.stringify(value)),
    { ...settings, ...overrides });
  await page.goto(url);
  await page.waitForFunction(() => window.ScuLaDictation && window.toggleDictation);
  await page.evaluate(() => {
    window.__mic = { node: null };
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] });
    window.AudioContext = class {
      constructor() { this.sampleRate = 16000; this.state = 'running'; this.destination = {}; }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createScriptProcessor() {
        return window.__mic.node = { onaudioprocess: null, connect() {}, disconnect() {} };
      }
      close() { return Promise.resolve(); }
    };
    window.__feed = (seconds, amplitude) => {
      const data = new Float32Array(Math.round(seconds * 16000)).fill(amplitude);
      window.__mic.node.onaudioprocess({ inputBuffer: { getChannelData: () => data } });
    };
  });
}

async function phrase(page) {
  await page.evaluate(() => { window.__feed(.6, .1); window.__feed(.8, 0); });
}

function reply(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
}

test('500 ms speech is kept, shorter speech is dropped, and a 700 ms pause separates phrases without duplicate audio', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(() => {
    const out = [];
    const p = ScuLaDictation.makePhraser({ sampleRate: 16000,
      onPhrase: (samples, info) => out.push({ ...info, duration: samples.length / 16000 }) });
    const feed = (seconds, amp) => p.push(new Float32Array(Math.round(seconds * 16000)).fill(amp));
    feed(.49, .1); p.flush(); // below the minimum: no index consumed; partial frame is dropped
    feed(.5, .1); feed(.7, 0);  // exactly the minimum: accepted
    feed(.6, .1); feed(.68, 0); feed(.6, .1); feed(.7, 0); // one phrase across the short pause
    feed(.6, .1); p.flush(); // final phrase in progress
    return out;
  });
  expect(result.map(x => x.index)).toEqual([1, 2, 3]);
  expect(result[0].voicedSec).toBeCloseTo(.5, 2);
  expect(result[1].voicedSec).toBeGreaterThan(1.8);
  for (let i = 1; i < result.length; i++) {
    expect(result[i].startSec).toBeGreaterThanOrEqual(result[i - 1].startSec + result[i - 1].duration);
  }
});

test('tidy request instructs no translation and a failed tidy keeps the raw phrase', async ({ page }) => {
  const transcriptions = [], tidyRequests = [];
  await page.route('**/audio/transcriptions', route => {
    transcriptions.push(route.request().postData());
    return reply(route, { text: transcriptions.length === 1 ? 'Azi am mancat.' : 'Then I went home.' });
  });
  await page.route('**/chat/completions', route => {
    const body = JSON.parse(route.request().postData());
    tidyRequests.push(body);
    return tidyRequests.length === 1
      ? reply(route, { choices: [{ message: { content: 'Azi am mâncat.' } }] })
      : reply(route, { error: { message: 'tidy unavailable' } }, 500);
  });
  await open(page, { tidy: true });
  await page.locator('#btn-dictate').click();
  await phrase(page);
  await expect(page.locator('#editor')).toHaveValue('Azi am mâncat.');
  await phrase(page);
  await expect(page.locator('#editor')).toHaveValue('Azi am mâncat. Then I went home.');
  expect(tidyRequests).toHaveLength(2);
  expect(tidyRequests[0].messages[0].content).toContain('never translate');
  expect(tidyRequests[0].messages[0].content).toContain('add missing diacritics to Romanian words only');
  expect(tidyRequests[0].messages[1].content).toBe('Azi am mancat.');
  expect(transcriptions).toHaveLength(2);
  expect(transcriptions.every(body => !/name="(?:prompt|language)"/.test(body))).toBe(true);
  await page.locator('#btn-dictate').click();
});

test('a transcription in a third language is inserted as returned in Quick Idea', async ({ page }) => {
  await page.route('**/audio/transcriptions', route => reply(route, { text: 'Bonjour, ça va ?' }));
  await open(page);
  await page.locator('#btn-idea').click();
  await page.locator('#btn-idea-dictate').click();
  await phrase(page);
  await expect(page.locator('#idea-text')).toHaveValue('Bonjour, ça va ?');
  await expect(page.locator('#editor')).toHaveValue('');
  await page.keyboard.press('Escape');
});

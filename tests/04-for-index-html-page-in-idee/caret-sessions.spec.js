// The real dictation entry point receives deterministic PCM through a fake
// ScriptProcessor. HTTP replies are controlled so session timing is repeatable.
const { test, expect } = require('@playwright/test');
const path = require('path');

const url = 'file://' + path.resolve(__dirname, '../../index.html');

async function open(page) {
  await page.addInitScript(() => localStorage.setItem('caiet-vocal:settings', JSON.stringify({
    engine: 'api', provider: 'groq', key: 'test-key', model: 'whisper-large-v3-turbo',
    lang: 'ro', hint: 'Translate to Romanian', tidy: false
  })));
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
    window.__phrase = () => {
      const feed = (seconds, amplitude) => {
        const samples = new Float32Array(Math.round(seconds * 16000)).fill(amplitude);
        window.__mic.node.onaudioprocess({ inputBuffer: { getChannelData: () => samples } });
      };
      feed(.6, .1);
      feed(.8, 0);
    };
  });
  await page.locator('#editor').fill('Start end');
  await page.locator('#editor').evaluate(el => {
    el.focus();
    el.setSelectionRange(5, 5);
  });
}

async function startAndSpeak(page) {
  await page.locator('#btn-dictate').click();
  await expect(page.locator('#btn-dictate')).toHaveClass(/active/);
  await page.evaluate(() => window.__phrase());
}

async function stop(page) {
  await page.locator('#btn-dictate').click();
  await expect(page.locator('#btn-dictate')).not.toHaveClass(/active/);
}

function reply(route, text) {
  return route.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ text }) });
}

test('completed sessions insert successively at the saved blurred editor caret', async ({ page }) => {
  let requests = 0;
  await page.route('**/audio/transcriptions', route => reply(route, ++requests === 1 ? 'First session.' : 'Second session.'));
  await open(page);
  await startAndSpeak(page);
  await expect(page.locator('#editor')).toHaveValue('Start First session. end');
  await stop(page);
  await startAndSpeak(page);
  await expect(page.locator('#editor')).toHaveValue('Start First session. Second session. end');
  expect(requests).toBe(2);
  await stop(page);
});

test('overlapping sessions preserve capture order and advance the saved caret after late results', async ({ page }) => {
  let requests = 0;
  let releaseFirst;
  await page.route('**/audio/transcriptions', async route => {
    const n = ++requests;
    if (n === 1) await new Promise(resolve => { releaseFirst = resolve; });
    await reply(route, n === 1 ? 'First session.' : 'Second session.');
  });
  await open(page);
  await startAndSpeak(page);
  await expect.poll(() => requests).toBe(1);
  await stop(page);
  await startAndSpeak(page);
  await expect.poll(() => requests).toBe(2);
  await expect(page.locator('#editor')).toHaveValue('Start end');
  releaseFirst();
  await expect(page.locator('#editor')).toHaveValue('Start First session. Second session. end');
  await stop(page);
});

test('a deliberate caret move is retained when an older session finishes another phrase', async ({ page }) => {
  let requests = 0;
  let releaseSecond;
  await page.route('**/audio/transcriptions', async route => {
    const n = ++requests;
    if (n === 2) await new Promise(resolve => { releaseSecond = resolve; });
    await reply(route, ['First phrase.', 'Late phrase.', 'New session.'][n - 1]);
  });
  await open(page);
  await startAndSpeak(page);
  await expect(page.locator('#editor')).toHaveValue('Start First phrase. end');
  await page.evaluate(() => window.__phrase());
  await expect.poll(() => requests).toBe(2);
  await stop(page);
  await page.locator('#editor').evaluate(el => {
    el.focus();
    el.setSelectionRange(0, 0);
    el.blur();
  });
  releaseSecond();
  await expect(page.locator('#editor')).toHaveValue('Start First phrase. Late phrase. end');
  await startAndSpeak(page);
  await expect(page.locator('#editor')).toHaveValue('New session.Start First phrase. Late phrase. end');
  await stop(page);
});

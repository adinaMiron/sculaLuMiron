// Drive the real index.html dictation entry point with a controlled Web Audio
// implementation. These failures happen after microphone permission succeeds.
const { test, expect } = require('@playwright/test');
const path = require('path');

const url = 'file://' + path.resolve(__dirname, '../../index.html');

async function open(page, failure) {
  await page.addInitScript(() => localStorage.setItem('caiet-vocal:settings', JSON.stringify({
    engine: 'api', provider: 'groq', key: 'test-key', tidy: false
  })));
  await page.goto(url);
  await page.waitForFunction(() => window.ScuLaDictation && window.toggleDictation);
  await page.evaluate(stage => {
    window.__audio = { stage, attempts: 0, tracks: [], contexts: [], nodes: [], resumes: [] };
    navigator.mediaDevices.getUserMedia = async () => {
      const track = { stopped: false, stop() { this.stopped = true; } };
      window.__audio.tracks.push(track);
      return { getTracks: () => [track] };
    };
    window.AudioContext = class {
      constructor() {
        const state = window.__audio;
        this.attempt = ++state.attempts;
        if (this.attempt === 1 && state.stage === 'constructor') throw Error('constructor failed');
        this.sampleRate = 16000;
        this.state = state.stage === 'resume' || state.stage === 'pending-resume' ? 'suspended' : 'running';
        this.destination = {};
        this.closed = false;
        state.contexts.push(this);
      }
      createMediaStreamSource() {
        if (this.attempt === 1 && window.__audio.stage === 'source') throw Error('source failed');
        return {
          connect: () => {
            if (this.attempt === 1 && window.__audio.stage === 'source-connect') throw Error('source connect failed');
          },
          disconnect() {}
        };
      }
      createScriptProcessor() {
        if (this.attempt === 1 && window.__audio.stage === 'processor') throw Error('processor failed');
        const node = {
          onaudioprocess: null,
          connect: () => {
            if (this.attempt === 1 && window.__audio.stage === 'processor-connect') throw Error('processor connect failed');
          },
          disconnect() {}
        };
        window.__audio.nodes.push(node);
        return node;
      }
      resume() {
        window.__audio.resumes.push(this.attempt);
        if (this.attempt === 1 && window.__audio.stage === 'resume') return Promise.reject(Error('resume failed'));
        if (this.attempt === 1 && window.__audio.stage === 'pending-resume') {
          return new Promise(resolve => { window.__audio.resolveResume = resolve; });
        }
        this.state = 'running';
        return Promise.resolve();
      }
      close() { this.closed = true; return Promise.resolve(); }
    };
    window.__speak = () => {
      const node = window.__audio.nodes.at(-1);
      if (!node || !node.onaudioprocess) throw Error('no working recorder');
      for (const [seconds, amplitude] of [[.6, .1], [.8, 0]]) {
        const samples = new Float32Array(Math.round(seconds * 16000)).fill(amplitude);
        node.onaudioprocess({ inputBuffer: { getChannelData: () => samples } });
      }
    };
  }, failure);
}

for (const stage of ['constructor', 'source', 'processor', 'source-connect', 'processor-connect', 'resume']) {
  test(`${stage} startup failure releases microphone and permits a successful retry`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/audio/transcriptions', route => route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ text: 'Retry works.' })
    }));
    await open(page, stage);
    await page.locator('#btn-dictate').click();
    await expect(page.locator('#scula-toast')).toContainText('Reportofonul nu este disponibil');
    await expect(page.locator('#btn-dictate')).not.toHaveClass(/active/);
    await expect(page.locator('#dictate-pill')).toBeHidden();
    expect(await page.evaluate(() => ({
      tracks: __audio.tracks.map(track => track.stopped),
      contexts: __audio.contexts.map(context => context.closed),
      callbacks: __audio.nodes.map(node => node.onaudioprocess)
    }))).toEqual({
      tracks: [true],
      contexts: stage === 'constructor' ? [] : [true],
      callbacks: ['source-connect', 'processor-connect', 'resume'].includes(stage) ? [null] : []
    });
    expect(errors).toEqual([]);

    await page.locator('#btn-dictate').click();
    await expect(page.locator('#btn-dictate')).toHaveClass(/active/);
    await page.evaluate(() => __speak());
    await expect(page.locator('#editor')).toHaveValue('Retry works.');
    await page.locator('#btn-dictate').click();
    await expect(page.locator('#btn-dictate')).not.toHaveClass(/active/);
    expect(await page.evaluate(() => __audio.tracks.map(track => track.stopped))).toEqual([true, true]);
    expect(errors).toEqual([]);
  });
}

test('closing Quick Idea during suspended resume cleans up and leaves a later session usable', async ({ page }) => {
  await page.route('**/audio/transcriptions', route => route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ text: 'New idea.' })
  }));
  await open(page, 'pending-resume');
  await page.evaluate(() => openIdeaModal());
  await page.locator('#btn-idea-dictate').click();
  await page.waitForFunction(() => typeof __audio.resolveResume === 'function');
  await page.keyboard.press('Escape');
  await page.evaluate(() => __audio.resolveResume());
  await expect.poll(() => page.evaluate(() => __audio.contexts[0].closed)).toBe(true);
  expect(await page.evaluate(() => __audio.tracks[0].stopped)).toBe(true);
  await expect(page.locator('#btn-idea-dictate')).not.toHaveClass(/active/);
  await expect(page.locator('#dictate-pill')).toBeHidden();

  await page.evaluate(() => openIdeaModal());
  await page.locator('#btn-idea-dictate').click();
  await expect(page.locator('#btn-idea-dictate')).toHaveClass(/active/);
  await page.evaluate(() => __speak());
  await expect(page.locator('#idea-text')).toHaveValue('New idea.');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => __audio.tracks.map(track => track.stopped))).toEqual([true, true]);
});

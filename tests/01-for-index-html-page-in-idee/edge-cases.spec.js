// task-01: boundary/edge cases around pickModel()'s regex and
// keepsWords()'s two thresholds, plus tidy-up error fallbacks. These are
// not individually named in the spec's acceptance checks, but they pin down
// behaviour the spec's prose implies (§ 1.2, § 1.4).
const { test, expect } = require('@playwright/test');
const { settings, parseMultipart, load, dictateOnce } = require('./helpers');

test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

function captureTranscribe(page, url, text) {
  let captured = null;
  page.route(url, async route => {
    const req = route.request();
    captured = { contentType: req.headers()['content-type'], buffer: await req.postDataBuffer() };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text }) });
  });
  return () => captured;
}

function stubChat(page, url, replyOrFn) {
  page.route(url, async route => {
    if (typeof replyOrFn === 'function') { await replyOrFn(route); return; }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: replyOrFn } }] }),
    });
  });
}

let errors;

test.describe('pickModel(): the English-only regex', () => {
  test('bare "en" model id is swapped', async ({ page }) => {
    errors = await load(page, { provider: 'groq', key: 'k', model: 'en' });
    const getCap = captureTranscribe(page, 'https://api.groq.com/openai/v1/audio/transcriptions', 'ok');
    await dictateOnce(page, '#btn-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('editor').value.includes('ok'));
    expect(parseMultipart(getCap().buffer, getCap().contentType).fields.model).toBe('whisper-large-v3');
    expect(errors).toEqual([]);
  });

  test('dot-suffixed ".en" id is case-insensitively swapped', async ({ page }) => {
    errors = await load(page, { provider: 'groq', key: 'k', model: 'Whisper-Base.EN' });
    const getCap = captureTranscribe(page, 'https://api.groq.com/openai/v1/audio/transcriptions', 'ok');
    await dictateOnce(page, '#btn-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('editor').value.includes('ok'));
    expect(parseMultipart(getCap().buffer, getCap().contentType).fields.model).toBe('whisper-large-v3');
    expect(errors).toEqual([]);
  });

  test('an id that merely contains "en" mid-word is NOT swapped (e.g. "whisper-1")', async ({ page }) => {
    errors = await load(page, { provider: 'openai', key: 'k', model: 'whisper-1' });
    const getCap = captureTranscribe(page, 'https://api.openai.com/v1/audio/transcriptions', 'ok');
    await dictateOnce(page, '#btn-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('editor').value.includes('ok'));
    expect(parseMultipart(getCap().buffer, getCap().contentType).fields.model).toBe('whisper-1');
    expect(errors).toEqual([]);
  });

  test('custom provider with an English-only id falls back to whisper-large-v3', async ({ page }) => {
    errors = await load(page, { provider: 'custom', endpoint: 'https://stt.test/audio/transcriptions', model: 'distil-whisper-large-v3-en' });
    const getCap = captureTranscribe(page, 'https://stt.test/audio/transcriptions', 'ok');
    await dictateOnce(page, '#btn-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('editor').value.includes('ok'));
    expect(parseMultipart(getCap().buffer, getCap().contentType).fields.model).toBe('whisper-large-v3');
    expect(errors).toEqual([]);
  });

  test('no saved model at all falls back to the whisper-large-v3 default (also not swapped further)', async ({ page }) => {
    errors = await load(page, { provider: 'groq', key: 'k', model: '' });
    const getCap = captureTranscribe(page, 'https://api.groq.com/openai/v1/audio/transcriptions', 'ok');
    await dictateOnce(page, '#btn-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('editor').value.includes('ok'));
    expect(parseMultipart(getCap().buffer, getCap().contentType).fields.model).toBe('whisper-large-v3');
    expect(errors).toEqual([]);
  });
});

test.describe('keepsWords(): the 80% word-overlap and 0.8x-1.25x length thresholds', () => {
  // "a b c d e" -> 5 tokens. Keeping exactly 4/5 (80%) at a 4/5 (0.8x) length
  // ratio should just barely pass both thresholds.
  test('exactly 80% overlap and exactly 0.8x length passes (boundary is inclusive)', async ({ page }) => {
    errors = await load(page, { provider: 'groq', key: 'k', tidy: true });
    captureTranscribe(page, 'https://api.groq.com/openai/v1/audio/transcriptions', 'a b c d e');
    stubChat(page, 'https://api.groq.com/openai/v1/chat/completions', 'a b c d');
    await dictateOnce(page, '#btn-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('editor').value.length > 0);
    expect(await page.inputValue('#editor')).toBe('a b c d');
    expect(errors).toEqual([]);
  });

  // Same words, one dropped (3/5 = 60% overlap) -> below 80%, must fall back to raw.
  test('just below 80% overlap falls back to the raw transcript', async ({ page }) => {
    errors = await load(page, { provider: 'groq', key: 'k', tidy: true });
    captureTranscribe(page, 'https://api.groq.com/openai/v1/audio/transcriptions', 'a b c d e');
    stubChat(page, 'https://api.groq.com/openai/v1/chat/completions', 'a b c');
    await dictateOnce(page, '#btn-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('editor').value.length > 0);
    expect(await page.inputValue('#editor')).toBe('a b c d e');
    expect(errors).toEqual([]);
  });

  // All words kept, but padded with extra filler words: overlap is 100% yet
  // the output is 1.4x as long as the raw transcript, over the 1.25x cap.
  test('100% word overlap but output padded past 1.25x length still falls back to raw', async ({ page }) => {
    errors = await load(page, { provider: 'groq', key: 'k', tidy: true });
    captureTranscribe(page, 'https://api.groq.com/openai/v1/audio/transcriptions', 'a b c d e');
    stubChat(page, 'https://api.groq.com/openai/v1/chat/completions', 'a b c d e f g');
    await dictateOnce(page, '#btn-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('editor').value.length > 0);
    expect(await page.inputValue('#editor')).toBe('a b c d e');
    expect(errors).toEqual([]);
  });

  // Raw repeats "a" four times; tidy collapses to two unique tokens. Every
  // raw token is present in the output's token *set* (100% "overlap" by the
  // spec's set-membership rule), but the output is only 0.4x as long, under
  // the 0.8x floor -- this is what the length ratio guard is for.
  test('repeated words collapsed into fewer tokens falls back to raw (length-ratio guard)', async ({ page }) => {
    errors = await load(page, { provider: 'groq', key: 'k', tidy: true });
    captureTranscribe(page, 'https://api.groq.com/openai/v1/audio/transcriptions', 'a a a a b');
    stubChat(page, 'https://api.groq.com/openai/v1/chat/completions', 'a b');
    await dictateOnce(page, '#btn-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('editor').value.length > 0);
    expect(await page.inputValue('#editor')).toBe('a a a a b');
    expect(errors).toEqual([]);
  });

  test('an empty raw transcript never reaches tidy in a way that breaks emit (0-word raw short-circuits true)', async ({ page }) => {
    errors = await load(page, { provider: 'groq', key: 'k', tidy: true });
    // Punctuation-only "transcript": foldWords() finds zero letter/digit tokens.
    captureTranscribe(page, 'https://api.groq.com/openai/v1/audio/transcriptions', '...');
    stubChat(page, 'https://api.groq.com/openai/v1/chat/completions', 'anything at all goes here');
    await page.click('#btn-dictate');
    await page.waitForFunction(() => document.getElementById('btn-dictate').classList.contains('active'));
    await new Promise(r => setTimeout(r, 1300));
    await page.click('#btn-dictate');
    // "..." folds to zero words -> emit() also trims it to nothing -> no text lands and no crash.
    await page.waitForFunction(() => document.getElementById('dictate-pill').hidden);
    expect(await page.inputValue('#editor')).toBe('');
    expect(errors).toEqual([]);
  });
});

test.describe('tidy-up error fallbacks', () => {
  test('chat endpoint returning a non-OK status falls back to the raw transcript', async ({ page }) => {
    errors = await load(page, { provider: 'groq', key: 'k', tidy: true });
    captureTranscribe(page, 'https://api.groq.com/openai/v1/audio/transcriptions', 'salut lume');
    page.route('https://api.groq.com/openai/v1/chat/completions', route => route.fulfill({ status: 500, body: 'oops' }));
    await dictateOnce(page, '#btn-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('editor').value.length > 0);
    expect(await page.inputValue('#editor')).toBe('salut lume');
    expect(errors).toEqual([]);
  });

  test('chat endpoint returning an empty message falls back to the raw transcript', async ({ page }) => {
    errors = await load(page, { provider: 'groq', key: 'k', tidy: true });
    captureTranscribe(page, 'https://api.groq.com/openai/v1/audio/transcriptions', 'salut lume');
    stubChat(page, 'https://api.groq.com/openai/v1/chat/completions', '   ');
    await dictateOnce(page, '#btn-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('editor').value.length > 0);
    expect(await page.inputValue('#editor')).toBe('salut lume');
    expect(errors).toEqual([]);
  });
});

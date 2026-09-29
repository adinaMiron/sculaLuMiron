// task-01: dictation in the 💡 idea box (and the toolbar) keeps the spoken
// language and never translates. Covers spec acceptance checks 1-8.
//
// Run with `/apptest 01-for-index-html-page-in-idee` or, from the root:
//   npx playwright test tests/01-for-index-html-page-in-idee/
const { test, expect } = require('@playwright/test');
const { settings, parseMultipart, load, openIdea, dictateOnce, sleep } = require('./helpers');

test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

// Stubs the transcription endpoint, capturing the request it receives and
// answering with `text`. Returns the captured { contentType, buffer } once
// the request lands (or null if it never did).
function captureTranscribe(page, url, text) {
  let captured = null;
  page.route(url, async route => {
    const req = route.request();
    captured = { contentType: req.headers()['content-type'], buffer: await req.postDataBuffer() };
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ text }),
    });
  });
  return () => captured;
}

function captureChat(page, url, reply) {
  let captured = null;
  page.route(url, async route => {
    const req = route.request();
    let body = null;
    try { body = JSON.parse((await req.postDataBuffer()).toString('utf8')); } catch (e) {}
    captured = body;
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: reply } }] }),
    });
  });
  return () => captured;
}

let errors;

test.describe('acceptance check 1-2: no language, no prompt part', () => {
  test('idea box: lang "ro", hint "cuvinte", text already in #idea-text -> no language/prompt', async ({ page }) => {
    errors = await load(page, { lang: 'ro', hint: 'cuvinte' });
    const getCap = captureTranscribe(page, 'https://stt.test/audio/transcriptions', 'salut lume');
    await openIdea(page);
    await page.fill('#idea-text', 'text deja aici');
    await dictateOnce(page, '#btn-idea-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('idea-text').value.includes('salut lume'));
    const cap = getCap();
    expect(cap).not.toBeNull();
    const parsed = parseMultipart(cap.buffer, cap.contentType);
    expect(parsed.fields).not.toHaveProperty('language');
    expect(parsed.fields).not.toHaveProperty('prompt');
    expect(parsed.hasFile).toBe(true);
    expect(errors).toEqual([]);
  });

  test('idea box: lang "en" -> still no language/prompt', async ({ page }) => {
    errors = await load(page, { lang: 'en', hint: 'words' });
    const getCap = captureTranscribe(page, 'https://stt.test/audio/transcriptions', 'buy milk');
    await openIdea(page);
    await dictateOnce(page, '#btn-idea-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('idea-text').value.includes('buy milk'));
    const parsed = parseMultipart(getCap().buffer, getCap().contentType);
    expect(parsed.fields).not.toHaveProperty('language');
    expect(parsed.fields).not.toHaveProperty('prompt');
    expect(errors).toEqual([]);
  });

  test('toolbar #btn-dictate -> same: no language/prompt', async ({ page }) => {
    errors = await load(page, { lang: 'ro', hint: 'ceva' });
    const getCap = captureTranscribe(page, 'https://stt.test/audio/transcriptions', 'salut lume');
    await dictateOnce(page, '#btn-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('editor').value.includes('salut lume'));
    const parsed = parseMultipart(getCap().buffer, getCap().contentType);
    expect(parsed.fields).not.toHaveProperty('language');
    expect(parsed.fields).not.toHaveProperty('prompt');
    expect(errors).toEqual([]);
  });
});

test.describe('acceptance check 3: the transcript lands verbatim', () => {
  test('English stub text lands exactly, untranslated', async ({ page }) => {
    errors = await load(page, { lang: 'ro' });
    captureTranscribe(page, 'https://stt.test/audio/transcriptions', 'I will buy milk tomorrow');
    await openIdea(page);
    await dictateOnce(page, '#btn-idea-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('idea-text').value.includes('milk'));
    const val = await page.inputValue('#idea-text');
    expect(val).toBe('I will buy milk tomorrow');
    expect(errors).toEqual([]);
  });

  test('Romanian stub text lands exactly, diacritics intact', async ({ page }) => {
    errors = await load(page, { lang: 'en' });
    captureTranscribe(page, 'https://stt.test/audio/transcriptions', 'Mâine cumpăr lapte');
    await openIdea(page);
    await dictateOnce(page, '#btn-idea-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('idea-text').value.includes('lapte'));
    const val = await page.inputValue('#idea-text');
    expect(val).toBe('Mâine cumpăr lapte');
    expect(errors).toEqual([]);
  });
});

test.describe('acceptance check 4: English-only model swapped for the multilingual default', () => {
  test('groq distil-whisper-large-v3-en -> whisper-large-v3', async ({ page }) => {
    errors = await load(page, { provider: 'groq', key: 'k', model: 'distil-whisper-large-v3-en' });
    const getCap = captureTranscribe(page, 'https://api.groq.com/openai/v1/audio/transcriptions', 'ok');
    await dictateOnce(page, '#btn-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('editor').value.includes('ok'));
    const parsed = parseMultipart(getCap().buffer, getCap().contentType);
    expect(parsed.fields.model).toBe('whisper-large-v3');
    expect(errors).toEqual([]);
  });

  test('openai distil-whisper-large-v3-en -> whisper-1', async ({ page }) => {
    errors = await load(page, { provider: 'openai', key: 'k', model: 'distil-whisper-large-v3-en' });
    const getCap = captureTranscribe(page, 'https://api.openai.com/v1/audio/transcriptions', 'ok');
    await dictateOnce(page, '#btn-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('editor').value.includes('ok'));
    const parsed = parseMultipart(getCap().buffer, getCap().contentType);
    expect(parsed.fields.model).toBe('whisper-1');
    expect(errors).toEqual([]);
  });

  test('whisper-large-v3-turbo is sent unchanged', async ({ page }) => {
    errors = await load(page, { provider: 'groq', key: 'k', model: 'whisper-large-v3-turbo' });
    const getCap = captureTranscribe(page, 'https://api.groq.com/openai/v1/audio/transcriptions', 'ok');
    await dictateOnce(page, '#btn-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('editor').value.includes('ok'));
    const parsed = parseMultipart(getCap().buffer, getCap().contentType);
    expect(parsed.fields.model).toBe('whisper-large-v3-turbo');
    expect(errors).toEqual([]);
  });
});

test.describe('acceptance checks 5-7: tidy-up never translates', () => {
  const RAW = 'Maine cumpar lapte si I will call John';

  test('check 5: a punctuation/diacritics fix is accepted', async ({ page }) => {
    errors = await load(page, { provider: 'groq', key: 'k', tidy: true });
    captureTranscribe(page, 'https://api.groq.com/openai/v1/audio/transcriptions', RAW);
    captureChat(page, 'https://api.groq.com/openai/v1/chat/completions', 'Mâine cumpăr lapte și I will call John.');
    await dictateOnce(page, '#btn-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('editor').value.includes('cumpăr'));
    const val = await page.inputValue('#editor');
    expect(val).toBe('Mâine cumpăr lapte și I will call John.');
    expect(errors).toEqual([]);
  });

  test('check 6: a translation is rejected, raw transcript kept', async ({ page }) => {
    errors = await load(page, { provider: 'groq', key: 'k', tidy: true });
    captureTranscribe(page, 'https://api.groq.com/openai/v1/audio/transcriptions', RAW);
    captureChat(page, 'https://api.groq.com/openai/v1/chat/completions', 'Tomorrow I buy milk and I will call John.');
    await dictateOnce(page, '#btn-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('editor').value.length > 0);
    const val = await page.inputValue('#editor');
    expect(val).toBe(RAW);
    expect(errors).toEqual([]);
  });

  test('check 7: the chat system message never says "missing Romanian diacritics"', async ({ page }) => {
    errors = await load(page, { provider: 'groq', key: 'k', tidy: true });
    captureTranscribe(page, 'https://api.groq.com/openai/v1/audio/transcriptions', RAW);
    const getChat = captureChat(page, 'https://api.groq.com/openai/v1/chat/completions', RAW + '.');
    await dictateOnce(page, '#btn-dictate', 1300);
    await page.waitForFunction(() => document.getElementById('editor').value.length > 0);
    const body = getChat();
    expect(body).not.toBeNull();
    const sys = (body.messages || []).find(m => m.role === 'system');
    expect(sys).toBeTruthy();
    expect(sys.content).not.toMatch(/missing Romanian diacritics/i);
    expect(errors).toEqual([]);
  });
});

test.describe('acceptance check 8: the live engine keeps using the saved spoken-language setting', () => {
  test('lang "ro" -> Web Speech gets ro-RO', async ({ page }) => {
    errors = await load(page, { engine: 'live', lang: 'ro' });
    await page.click('#btn-dictate');
    await page.waitForFunction(() => window.__srLog && window.__srLog.length > 0);
    const log = await page.evaluate(() => window.__srLog.slice());
    expect(log[log.length - 1]).toBe('ro-RO');
    await page.click('#btn-dictate');
    expect(errors).toEqual([]);
  });

  test('lang "en" -> Web Speech gets en-US, also from the idea box', async ({ page }) => {
    errors = await load(page, { engine: 'live', lang: 'en' });
    await openIdea(page);
    await page.click('#btn-idea-dictate');
    await page.waitForFunction(() => window.__srLog && window.__srLog.length > 0);
    const log = await page.evaluate(() => window.__srLog.slice());
    expect(log[log.length - 1]).toBe('en-US');
    await page.click('#btn-idea-dictate');
    expect(errors).toEqual([]);
  });
});

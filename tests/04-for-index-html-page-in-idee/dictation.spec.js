// Deterministic Chromium microphone: the app's real ScriptProcessor callback
// receives synthetic PCM frames. Transcription HTTP is intercepted by Playwright.
const { test, expect } = require('@playwright/test');
const path = require('path');

const URL = 'file://' + path.resolve(__dirname, '../../index.html');
const settings = { engine:'api', provider:'groq', key:'test-key', model:'whisper-large-v3-turbo', lang:'ro', hint:'Translate to Romanian', segMin:5, tidy:false };

async function open(page, overrides = {}) {
  await page.addInitScript(value => localStorage.setItem('caiet-vocal:settings', JSON.stringify(value)), { ...settings, ...overrides });
  await page.goto(URL);
  await page.waitForFunction(() => window.ScuLaDictation && window.ScuLaFolder && window.toggleDictation);
  await page.evaluate(() => {
    window.__mic = { node:null, stopped:false };
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks:() => [{ stop:() => { window.__mic.stopped = true; } }] });
    window.AudioContext = class {
      constructor(){ this.sampleRate = 16000; this.state = 'running'; this.destination = {}; }
      createMediaStreamSource(){ return { connect(){}, disconnect(){} }; }
      createScriptProcessor(){
        const node = { onaudioprocess:null, connect(){}, disconnect(){} };
        window.__mic.node = node;
        return node;
      }
      close(){ return Promise.resolve(); }
    };
    window.__feed = (seconds, amp = 0) => {
      const n = Math.round(seconds * 16000), data = new Float32Array(n);
      for (let i = 0; i < n; i++) data[i] = amp * Math.sin(i * 2 * Math.PI * 190 / 16000);
      const node = window.__mic.node;
      if (!node || !node.onaudioprocess) throw Error('mic not recording');
      node.onaudioprocess({ inputBuffer:{ getChannelData:() => data } });
    };
  });
}

async function start(page, selector = '#btn-dictate') {
  await page.locator(selector).click();
  await expect(page.locator(selector)).toHaveClass(/active/);
}
async function phrase(page, seconds = 0.7, pause = 0.8) {
  await page.evaluate(([a,b]) => { window.__feed(a, 0.15); window.__feed(b); }, [seconds, pause]);
}
function textReply(route, text, status = 200, headers = {}) {
  return route.fulfill({ status, headers:{ 'access-control-allow-origin':'*', ...headers }, contentType:'application/json', body:JSON.stringify(status === 200 ? { text } : { error:{ message:text } }) });
}

test('phrase cutter honors pause, minimum speech, flush and consecutive indexes', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(() => {
    const out = [], p = ScuLaDictation.makePhraser({ sampleRate:16000, onPhrase:(audio, info) => out.push({ ...info, duration:audio.length/16000 }) });
    const feed = (sec, amp) => { const n = Math.round(sec*16000), a = new Float32Array(n); a.fill(amp); p.push(a); };
    feed(.4,.1); feed(.8,0); // discarded
    feed(.6,.1); feed(.5,0); feed(.6,.1); feed(.8,0); // one phrase
    feed(.6,.1); feed(.7,0); // second phrase
    feed(.6,.1); p.flush(); // third phrase
    return out;
  });
  expect(result).toHaveLength(3);
  expect(result.map(x => x.index)).toEqual([1,2,3]);
  expect(result[0].voicedSec).toBeGreaterThan(1.6);
  expect(result[1].voicedSec).toBeGreaterThanOrEqual(.5);
  expect(result[2].voicedSec).toBeGreaterThanOrEqual(.5);
});

test('long continuous speech is bounded by hard cut; WAV header and samples are valid', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const phrases = [], p = ScuLaDictation.makePhraser({sampleRate:16000,onPhrase:(a,i)=>phrases.push({seconds:a.length/16000,...i})});
    p.push(new Float32Array(35*16000).fill(.1)); p.flush();
    const wav = await ScuLaDictation.encodeWav16k(new Float32Array([-2,-.5,0,.5,2]),16000);
    const b = await wav.arrayBuffer(), v = new DataView(b);
    return { phrases, type:wav.type, size:wav.size, riff:String.fromCharCode(...new Uint8Array(b,0,4)), wave:String.fromCharCode(...new Uint8Array(b,8,4)), rate:v.getUint32(24,true), channels:v.getUint16(22,true), bits:v.getUint16(34,true), pcm:[0,1,2,3,4].map(i=>v.getInt16(44+2*i,true)) };
  });
  expect(result.phrases.length).toBeGreaterThanOrEqual(2);
  expect(result.phrases.every(p => p.seconds <= 30)).toBe(true);
  expect(result).toMatchObject({type:'audio/wav',size:54,riff:'RIFF',wave:'WAVE',rate:16000,channels:1,bits:16,pcm:[-32768,-16384,0,16383,32767]});
});

test('48 kHz microphone audio is resampled to 16 kHz mono WAV', async ({ page }) => {
  await open(page);
  const wav = await page.evaluate(async () => {
    const data = new Float32Array(48000).fill(.2);
    const blob = await ScuLaDictation.encodeWav16k(data,48000);
    const v = new DataView(await blob.arrayBuffer());
    return { size:blob.size, rate:v.getUint32(24,true), byteRate:v.getUint32(28,true), dataBytes:v.getUint32(40,true), sample:v.getInt16(44,true) };
  });
  expect(wav).toMatchObject({size:32044,rate:16000,byteRate:32000,dataBytes:32000});
  expect(wav.sample).toBeGreaterThan(5000);
});

test('Groq requests have no language or prompt, and mixed-language replies appear during recording in capture order', async ({ page }) => {
  const requests = []; let count = 0;
  await page.route('**/audio/transcriptions', async route => {
    const n = ++count, body = route.request().postDataBuffer(); requests.push(body);
    if (n === 1) await new Promise(r => setTimeout(r, 350));
    await textReply(route, n === 1 ? 'Azi am fost la piață.' : 'Then I went home.');
  });
  await open(page);
  await start(page);
  await phrase(page); await phrase(page);
  await expect(page.locator('#editor')).toHaveValue('Azi am fost la piață. Then I went home.');
  await expect(page.locator('#btn-dictate')).toHaveClass(/active/);
  expect(requests).toHaveLength(2);
  for (const data of requests) {
    const s = data.toString('latin1');
    expect(s).toContain('name="model"\r\n\r\nwhisper-large-v3\r\n');
    expect(s).toContain('name="response_format"\r\n\r\njson\r\n');
    expect(s).toContain('name="temperature"\r\n\r\n0\r\n');
    expect(s).toContain('filename="dictation.wav"');
    expect(s).not.toMatch(/name="(?:language|prompt)"/);
    const i = data.indexOf(Buffer.from('RIFF'));
    expect(i).toBeGreaterThan(0);
    expect(data.toString('ascii',i+8,i+12)).toBe('WAVE');
    expect(data.readUInt32LE(i+24)).toBe(16000);
    expect(data.readUInt16LE(i+22)).toBe(1);
    expect(data.readUInt16LE(i+34)).toBe(16);
  }
  await page.locator('#btn-dictate').click();
  await expect(page.locator('#dictate-pill')).toBeHidden();
});

test('failed first phrase leaves marker and precise error toast; later phrase still inserts', async ({ page }) => {
  let count = 0;
  await page.route('**/audio/transcriptions', route => ++count === 1 ? textReply(route,'backend unavailable',500) : textReply(route,'Și am gătit.'));
  await open(page);
  await start(page); await phrase(page); await phrase(page);
  await expect(page.locator('#editor')).toHaveValue('[🎤 ?] Și am gătit.');
  await expect(page.locator('#scula-toast')).toContainText('Fraza 1 nu a putut fi transcrisă: backend unavailable');
  await page.locator('#btn-dictate').click();
});

test('English UI reports the second phrase number and server error while later speech continues', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('scula:ui-lang', 'en'));
  let count = 0;
  await page.route('**/audio/transcriptions', route => {
    const n = ++count;
    return textReply(route, n === 1 ? 'First phrase.' : n === 2 ? 'service unavailable' : 'Third phrase.', n === 2 ? 503 : 200);
  });
  await open(page);
  await start(page);
  await phrase(page);
  await expect(page.locator('#editor')).toHaveValue('First phrase.');
  await phrase(page);
  await expect(page.locator('#editor')).toHaveValue('First phrase. [🎤 ?]');
  await expect(page.locator('#scula-toast')).toContainText('Phrase 2 could not be transcribed: service unavailable');
  await phrase(page);
  await expect(page.locator('#editor')).toHaveValue('First phrase. [🎤 ?] Third phrase.');
  expect(count).toBe(3);
  await page.locator('#btn-dictate').click();
});

test('idea modal receives text unchanged and discards pending text when closed', async ({ page }) => {
  let count = 0, releaseSecond;
  await page.route('**/audio/transcriptions', async route => {
    if (++count === 1) return textReply(route,'Idee în română.');
    await new Promise(r => { releaseSecond = r; });
    await textReply(route,'Late English idea.');
  });
  await open(page);
  await page.evaluate(() => openIdeaModal());
  await start(page,'#btn-idea-dictate'); await phrase(page);
  await expect(page.locator('#idea-text')).toHaveValue('Idee în română.');
  await phrase(page);
  await expect.poll(() => count).toBe(2);
  await page.evaluate(() => closeIdeaModal());
  await expect(page.locator('#btn-idea-dictate')).not.toHaveClass(/active/);
  releaseSecond();
  await page.evaluate(() => openIdeaModal());
  await expect(page.locator('#idea-text')).toHaveValue('Idee în română.');
  await expect(page.locator('#editor')).toHaveValue('');
});

test('429 is retried once without changing fields', async ({ page }) => {
  let count = 0;
  await page.route('**/audio/transcriptions', route => ++count === 1 ? textReply(route,'rate limit',429,{'Retry-After':'0'}) : textReply(route,'English remains English.'));
  await open(page);
  await start(page); await phrase(page);
  await expect(page.locator('#editor')).toHaveValue('English remains English.');
  expect(count).toBe(2);
  await page.locator('#btn-dictate').click();
});

test('missing Groq key refuses recording and keeps editor intact', async ({ page }) => {
  await open(page,{key:''});
  await page.locator('#editor').fill('Existing work');
  await page.locator('#btn-dictate').click();
  await expect(page.locator('#btn-dictate')).not.toHaveClass(/active/);
  await expect(page.locator('#editor')).toHaveValue('Existing work');
  await expect(page.locator('#scula-toast')).toContainText('Caiet vocal');
});

test('a second recording can start while the first request is pending, preserving session order', async ({ page }) => {
  let count = 0, releaseFirst;
  await page.route('**/audio/transcriptions', async route => {
    if (++count === 1) {
      await new Promise(r => { releaseFirst = r; });
      return textReply(route, 'First session.');
    }
    await textReply(route, 'Second session.');
  });
  await open(page);
  await start(page); await phrase(page);
  await expect.poll(() => count).toBe(1);
  await page.locator('#btn-dictate').click();
  await expect(page.locator('#dictate-pill-interim')).toContainText('transcriere');
  await start(page); await phrase(page);
  await expect.poll(() => count).toBe(2);
  await expect(page.locator('#editor')).toHaveValue('');
  releaseFirst();
  await expect(page.locator('#editor')).toHaveValue('First session.\n\nSecond session.');
  await page.locator('#btn-dictate').click();
});

test('empty transcription is ignored, while the next phrase still inserts', async ({ page }) => {
  let count = 0;
  await page.route('**/audio/transcriptions', route => textReply(route, ++count === 1 ? '' : 'Actual words.'));
  await open(page);
  await start(page); await phrase(page); await phrase(page);
  await expect(page.locator('#editor')).toHaveValue('Actual words.');
  expect(count).toBe(2);
  await page.locator('#btn-dictate').click();
});

test('live engine honors chosen language and accepts final text without an API request', async ({ page }) => {
  let requests = 0;
  await page.route('**/audio/transcriptions', route => { requests++; return textReply(route,'unwanted'); });
  await open(page,{engine:'live',lang:'en'});
  await page.evaluate(() => {
    window.SpeechRecognition = class {
      constructor(){ window.__recognizer = this; }
      start(){}
      stop(){ if (this.onend) this.onend(); }
    };
  });
  await start(page);
  expect(await page.evaluate(() => window.__recognizer.lang)).toBe('en-US');
  await page.evaluate(() => window.__recognizer.onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'Keep English.'}}]}));
  await expect(page.locator('#editor')).toHaveValue('Keep English.');
  await page.locator('#btn-dictate').click();
  await expect(page.locator('#btn-dictate')).not.toHaveClass(/active/);
  expect(requests).toBe(0);
});

test('keyboard activation starts and stops the idea microphone', async ({ page }) => {
  await page.route('**/audio/transcriptions', route => textReply(route,'Typed by voice.'));
  await open(page);
  await page.evaluate(() => openIdeaModal());
  await expect(page.locator('#idea-text')).toBeFocused();
  await page.locator('#btn-idea-dictate').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#btn-idea-dictate')).toHaveClass(/active/);
  await phrase(page);
  await expect(page.locator('#idea-text')).toHaveValue('Typed by voice.');
  await page.locator('#btn-idea-dictate').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#btn-idea-dictate')).not.toHaveClass(/active/);
});

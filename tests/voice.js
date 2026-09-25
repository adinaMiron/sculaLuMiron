// Ad-hoc Playwright checks for voice.html ("Caiet vocal") - specifically the
// "also save the sound of the recording" checkbox: what it records, when it
// records it, and that the audio file lands next to the transcript under the
// same name. Plain Node script, no framework - see README.md.
//
//   node voice.js
//
// The microphone is Chromium's built-in fake device (a 440Hz tone), so this
// runs headless with no hardware. ScuLaFolder has no directory picker on
// file://, so every save takes the "download" route - which is exactly what
// makes the saved files observable here, as download events.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.VOICE_URL || 'file://' + path.resolve(__dirname, '..', 'voice.html');

let failed = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS  ' + name);
  else { failed++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const AUDIO_EXT = /\.(webm|ogg|m4a)$/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openPage(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 900, height: 1000 },
    acceptDownloads: true,
    permissions: []
  });
  const page = await ctx.newPage();
  const downloads = [];
  page.on('download', d => downloads.push(d));
  // The transcription POST is not what is under test; keep it off the network
  // so a failing fetch cannot race the status line we assert on.
  await page.route('**/transcribe*', r => r.abort());
  await page.goto(URL);
  await page.waitForFunction(() => !!window.ScuLaFolder);
  // A proxy endpoint is the one provider that needs no API key, so recording
  // can start without putting a secret in a test.
  await page.click('#setBtn');
  await page.selectOption('#provider', 'custom');
  await page.fill('#endpoint', 'http://127.0.0.1:9/transcribe');
  await page.click('#saveBtn');
  return { ctx, page, downloads };
}

// Record for `ms`, then wait for the keep-recorder's onstop to build the blob.
async function record(page, ms) {
  await page.click('#recBtn');
  await page.waitForFunction(() => document.querySelector('#recBtn').classList.contains('on'));
  await sleep(ms);
  await page.click('#recBtn');
  await sleep(700);
}

async function downloadAll(page, downloads, want = 2) {
  const before = downloads.length;
  await page.click('#dlBtn');
  // Several saves are separate <a download> clicks; give the later ones time
  // to arrive before deciding they never came.
  for (let i = 0; i < 60 && downloads.length < before + want; i++) await sleep(50);
  await sleep(150);
  return downloads.slice(before);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  });

  /* --- 1. ticked before recording: text + sound, one name --- */
  {
    const { ctx, page, downloads } = await openPage(browser);
    await page.check('#keepAudio');
    await record(page, 1500);
    await page.fill('#transcript', 'Merele se culeg în octombrie.');
    const got = await downloadAll(page, downloads);
    const names = got.map(d => d.suggestedFilename());

    check('ticked -> two files saved', got.length === 2, names.join(', '));
    if (got.length === 2) {
      const txt = names.find(n => n.endsWith('.txt'));
      const snd = names.find(n => AUDIO_EXT.test(n));
      check('one .txt and one audio file', !!txt && !!snd, names.join(', '));
      check('audio shares the transcript name',
        txt && snd && snd.replace(AUDIO_EXT, '') === txt.replace(/\.txt$/, ''),
        names.join(' vs '));

      const audio = got.find(d => AUDIO_EXT.test(d.suggestedFilename()));
      const p = await audio.path();
      const size = p ? fs.statSync(p).size : 0;
      check('audio file holds real sound (>4 KB for 1.5s)', size > 4000, size + ' bytes');

      // Container sniff: webm/ogg have fixed magic bytes; mp4 carries "ftyp".
      const head = p ? fs.readFileSync(p).subarray(0, 12) : Buffer.alloc(0);
      const ok = head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) // webm/matroska
        || head.subarray(0, 4).toString('latin1') === 'OggS'
        || head.subarray(4, 8).toString('latin1') === 'ftyp';
      check('audio file is a real container', ok, head.toString('hex'));
    }
    await ctx.close();
  }

  /* --- 2. unticked: the transcript alone, nothing else --- */
  {
    const { ctx, page, downloads } = await openPage(browser);
    await record(page, 900);
    await page.fill('#transcript', 'Fără sunet.');
    const got = await downloadAll(page, downloads);
    check('unticked -> only the transcript', got.length === 1,
      got.map(d => d.suggestedFilename()).join(', '));
    check('unticked -> the one file is the .txt',
      got.length === 1 && got[0].suggestedFilename().endsWith('.txt'),
      got.map(d => d.suggestedFilename()).join(', '));
    await ctx.close();
  }

  /* --- 3. ticked only *after* recording: nothing was captured, and the page
         says so instead of quietly saving a stale take --- */
  {
    const { ctx, page, downloads } = await openPage(browser);
    await record(page, 900);
    await page.check('#keepAudio');
    await page.fill('#transcript', 'Bifat prea târziu.');
    const got = await downloadAll(page, downloads);
    check('ticked after recording -> no audio file', got.length === 1,
      got.map(d => d.suggestedFilename()).join(', '));
    const status = (await page.textContent('#status')) || '';
    check('ticked after recording -> the page says no audio was kept',
      /niciun fișier audio/i.test(status), JSON.stringify(status));
    await ctx.close();
  }

  /* --- 4. a second recording does not inherit the first one's sound --- */
  {
    const { ctx, page, downloads } = await openPage(browser);
    await page.check('#keepAudio');
    await record(page, 1200);
    await page.uncheck('#keepAudio');
    await record(page, 900);
    await page.check('#keepAudio');
    await page.fill('#transcript', 'A doua tură.');
    const got = await downloadAll(page, downloads);
    check('re-recording unticked drops the earlier take', got.length === 1,
      got.map(d => d.suggestedFilename()).join(', '));
    await ctx.close();
  }

  /* --- 4b. the high-quality WAV: a third file, same name, real 24-bit PCM
          whose header agrees with its length, and not silence --- */
  {
    const { ctx, page, downloads } = await openPage(browser);
    await page.check('#keepWav');
    check('ticking WAV ticks the sound too', await page.isChecked('#keepAudio'));
    await record(page, 1500);
    await page.fill('#transcript', 'Cu WAV.');
    const got = await downloadAll(page, downloads, 3);
    const names = got.map(d => d.suggestedFilename());
    check('WAV ticked -> three files saved', got.length === 3, names.join(', '));
    const txt = names.find(n => n.endsWith('.txt'));
    const w = got.find(d => /\.wav$/.test(d.suggestedFilename()));
    check('the .wav shares the transcript name',
      !!(w && txt && w.suggestedFilename() === txt.replace(/\.txt$/, '.wav')), names.join(', '));
    check('the compressed file is still saved beside it', names.some(n => AUDIO_EXT.test(n)), names.join(', '));
    if (w) {
      const b = fs.readFileSync(await w.path());
      const ch = b.readUInt16LE(22), sr = b.readUInt32LE(24), bits = b.readUInt16LE(34);
      const data = b.readUInt32LE(40);
      check('WAV header: RIFF/WAVE, PCM, 24-bit',
        b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE'
          && b.readUInt16LE(20) === 1 && bits === 24, [ch, sr, bits].join('/'));
      check('WAV header sizes agree with the file', data === b.length - 44 && b.readUInt32LE(4) === b.length - 8,
        data + ' vs ' + (b.length - 44));
      const secs = data / (sr * ch * 3);
      check('WAV holds about the recorded length (0.8-2.5 s)', secs > 0.8 && secs < 2.5, secs.toFixed(2) + ' s @ ' + sr);
      let peak = 0;
      for (let o = 44; o + 3 <= b.length; o += 3) {
        const v = Math.abs(b.readIntLE(o, 3)); if (v > peak) peak = v;
      }
      check('WAV is not silence', peak > 1000, 'peak ' + peak);
    }
    await page.uncheck('#keepAudio');
    check('unticking the sound unticks the WAV', !(await page.isChecked('#keepWav')));
    await ctx.close();
  }

  /* --- 5. the checkbox is bilingual like the rest of the UI --- */
  {
    const { ctx, page } = await openPage(browser);
    const ro = await page.textContent('#keepAudio + span');
    await page.click('#navLangBtn');
    await page.waitForFunction(() => document.documentElement.lang === 'en');
    const en = await page.textContent('#keepAudio + span');
    check('checkbox label is translated', /sunetul/i.test(ro) && /sound/i.test(en),
      JSON.stringify([ro, en]));
    await ctx.close();
  }

  await browser.close();
  console.log(failed ? '\n' + failed + ' check(s) failed' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

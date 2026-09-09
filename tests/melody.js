// Ad-hoc Playwright checks for voice.html § 14 - "Melodie din înregistrare":
// the recording turned into a piece of music. Plain Node script, no framework
// - see README.md.
//
//   node melody.js
//
// The source is a WAV synthesised here (a hummed C-major phrase at a known
// 100 BPM), fed through the panel's own "Dintr-un fișier" input, so the path
// under test is the real one: decode -> pitch track -> beat -> arrange ->
// synthesise -> save. ScuLaFolder has no directory picker on file://, so both
// saves take the "download" route - which is what makes the bytes observable,
// and the MIDI is where the arrangement can be read back note by note.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.VOICE_URL || 'file://' + path.resolve(__dirname, '..', 'voice.html');

let failed = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS  ' + name);
  else { failed++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// A sung phrase: twelve notes of C major, one per beat at 100 BPM, with
// enough harmonics to look like a voice to the pitch tracker.
const SEQ = [60, 62, 64, 65, 67, 65, 64, 62, 60, 64, 67, 64];
const BPM = 100;
function hummedWav(sr) {
  const beat = 60 / BPM;
  const n = Math.ceil(SEQ.length * beat * sr) + sr;
  const x = new Float32Array(n);
  for (let i = 0; i < SEQ.length; i++) {
    const f = 440 * Math.pow(2, (SEQ[i] - 69) / 12);
    const s0 = Math.round(i * beat * sr), len = Math.round(beat * 0.85 * sr);
    for (let j = 0; j < len; j++) {
      const t = j / sr, env = Math.min(1, t / 0.02) * Math.exp(-t / 0.55);
      let v = 0;
      for (let h = 1; h <= 8; h++) v += (1 / h) * Math.sin(2 * Math.PI * f * h * t);
      x[s0 + j] += v * env * 0.18;
    }
  }
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-1, Math.min(1, x[i])) * 30000 | 0, 44 + i * 2);
  return buf;
}

// Read a Standard MIDI File back the way a DAW would. Returns one entry per
// track: its name, its program change, and every note-on in order.
function readMidi(b) {
  let p = 0;
  const str = n => { const s = b.toString('latin1', p, p + n); p += n; return s; };
  const u32 = () => { const v = b.readUInt32BE(p); p += 4; return v; };
  const u16 = () => { const v = b.readUInt16BE(p); p += 2; return v; };
  if (str(4) !== 'MThd') throw new Error('no MThd');
  u32();
  const format = u16(), ntrk = u16(), division = u16();
  const tracks = [];
  for (let i = 0; i < ntrk; i++) {
    if (str(4) !== 'MTrk') throw new Error('no MTrk at ' + i);
    const len = u32(), end = p + len;   // u32() first: it moves p
    const tr = { name: '', program: null, channel: null, notes: [] };
    let running = 0, tick = 0;
    while (p < end) {
      let v = 0, c;
      do { c = b[p++]; v = (v << 7) | (c & 0x7f); } while (c & 0x80);
      tick += v;
      let st = b[p];
      if (st & 0x80) p++; else st = running;
      running = st;
      if (st === 0xFF) {
        const type = b[p++];
        let l = 0, cc; do { cc = b[p++]; l = (l << 7) | (cc & 0x7f); } while (cc & 0x80);
        if (type === 0x03) tr.name = b.toString('latin1', p, p + l);
        p += l;
        if (type === 0x2F) break;
      } else if ((st & 0xF0) === 0xC0) { tr.program = b[p]; tr.channel = st & 15; p += 1; }
      else if ((st & 0xF0) === 0xD0) { p += 1; }
      else {
        if ((st & 0xF0) === 0x90 && b[p + 1] > 0) tr.notes.push({ tick, midi: b[p] });
        tr.channel = st & 15;
        p += 2;
      }
    }
    if (p !== end) throw new Error('track ' + i + ' length mismatch');
    tracks.push(tr);
  }
  if (p !== b.length) throw new Error('trailing bytes after the last track');
  return { format, division, tracks };
}

async function openPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1100 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], downloads = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  // The aborted transcription route below is deliberate; its failed fetch is
  // the one console error that is not a finding.
  page.on('console', m => {
    if (m.type() === 'error' && !/ERR_FAILED|ERR_ABORTED/.test(m.text())) errors.push('CONSOLE ' + m.text());
  });
  page.on('download', d => downloads.push(d));
  await page.goto(URL);
  await page.waitForFunction(() => !!window.ScuLaFolder);
  return { ctx, page, errors, downloads };
}

// The info line is the panel's own status; it settles on the summary (which
// carries "BPM") or on one of the "nothing here" messages.
async function makeMelody(page) {
  await page.click('#melMakeBtn');
  await page.waitForFunction(
    () => /BPM|nu am|no |n-am/i.test(document.querySelector('#melInfo').textContent),
    null, { timeout: 180000 });
  return page.textContent('#melInfo');
}
async function grabSave(page, downloads, sel) {
  const before = downloads.length;
  await page.click(sel);
  for (let i = 0; i < 120 && downloads.length === before; i++) await sleep(100);
  if (downloads.length === before) return null;
  const d = downloads[downloads.length - 1];
  return { name: d.suggestedFilename(), bytes: fs.readFileSync(await d.path()) };
}

(async () => {
  // Chromium's own fake microphone plays this WAV, so the recording half runs
  // headless with no hardware. It has to be a real file on disk at launch, and
  // 48 kHz because that is what the capture pipeline wants; the file input
  // half of the run reads the very same bytes.
  const hum = hummedWav(48000);
  const humFile = path.join(os.tmpdir(), 'scula-hum-48k.wav');
  fs.writeFileSync(humFile, hum);
  const browser = await chromium.launch(Object.assign(
    CHROME ? { executablePath: CHROME } : {},
    { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
             '--use-file-for-fake-audio-capture=' + humFile + '%noloop'] }));
  const { ctx, page, errors, downloads } = await openPage(browser);

  // --- the panel is there, closed, and opens ---
  check('panel starts collapsed', await page.isHidden('#melodyBody'));
  await page.click('#melodyToggle');
  check('panel opens', await page.isVisible('#melodyBody'));
  const nChips = await page.$$eval('#leadChips button', b => b.length);
  check('the lead instruments were built', nChips === 13, String(nChips));
  check('piano is the default lead',
    await page.getAttribute('#leadChips button[data-inst="piano"]', 'aria-pressed') === 'true');
  check('make is disabled with no sound', await page.isDisabled('#melMakeBtn'));

  // --- feed it a file ---
  await page.setInputFiles('#melFile', { name: 'hum.wav', mimeType: 'audio/wav', buffer: hum });
  await sleep(200);
  check('a picked file arms the button', !(await page.isDisabled('#melMakeBtn')));

  const info = await makeMelody(page);
  console.log('      info: ' + info);
  const notes = parseInt(info, 10);
  const bpm = parseInt((info.match(/(\d+)\s*BPM/) || [])[1], 10);
  check('found the twelve sung notes', notes === 12, String(notes));
  check('found the beat', Math.abs(bpm - BPM) <= 5, String(bpm));
  check('the tempo box filled itself in',
    Math.abs(parseInt(await page.inputValue('#melTempo'), 10) - BPM) <= 5,
    await page.inputValue('#melTempo'));

  // --- the piano roll drew something ---
  const painted = await page.evaluate(() => {
    const c = document.querySelector('#melRoll');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    return seen.size;
  });
  check('the piano roll is drawn', painted >= 4, painted + ' distinct colours');

  // --- playing it ---
  const playLabel = await page.textContent('#melPlayBtn');
  await page.click('#melPlayBtn');
  await sleep(250);
  check('play flips the button to stop', (await page.textContent('#melPlayBtn')) !== playLabel,
    await page.textContent('#melPlayBtn'));
  await page.click('#melPlayBtn');
  await sleep(150);
  check('stop flips it back', (await page.textContent('#melPlayBtn')) === playLabel);

  // --- the audio export ---
  const wav = await grabSave(page, downloads, '#melWavBtn');
  check('the WAV is saved as melodie_*.wav', !!wav && /^melodie_.*\.wav$/.test(wav.name), wav && wav.name);
  if (wav) {
    const b = wav.bytes;
    check('the WAV is a real 44.1k stereo 16-bit RIFF',
      b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE' &&
      b.readUInt16LE(22) === 2 && b.readUInt32LE(24) === 44100 && b.readUInt16LE(34) === 16 &&
      b.readUInt32LE(4) === b.length - 8 && b.readUInt32LE(40) === b.length - 44,
      b.length + ' bytes');
    let peak = 0, nonzero = 0;
    for (let i = 44; i + 1 < b.length; i += 2) {
      const v = Math.abs(b.readInt16LE(i));
      if (v > peak) peak = v;
      if (v > 200) nonzero++;
    }
    check('the WAV carries real audio', peak > 20000 && peak <= 32767 && nonzero > (b.length - 44) / 8,
      'peak ' + peak);
  }

  // --- the notes export, which is where the arrangement can be read back ---
  const mid = await grabSave(page, downloads, '#melMidiBtn');
  check('the MIDI is saved as melodie_*.mid', !!mid && /^melodie_.*\.mid$/.test(mid.name), mid && mid.name);
  if (mid) {
    const m = readMidi(mid.bytes);
    const lead = m.tracks.find(t => t.name === 'Lead');
    const drums = m.tracks.find(t => t.name === 'Drums');
    check('format 1, one track per part',
      m.format === 1 && m.tracks.length === 5, 'format ' + m.format + ', ' + m.tracks.length + ' tracks');
    check('the lead is the phrase that was sung',
      !!lead && lead.notes.map(n => n.midi).join(',') === SEQ.join(','),
      lead && lead.notes.map(n => n.midi).join(','));
    check('the lead is a piano on channel 1',
      !!lead && lead.program === 0 && lead.channel === 0);
    check('the notes land on the beat grid',
      !!lead && lead.notes.every(n => n.tick % (m.division / 2) === 0),
      lead && lead.notes.map(n => n.tick).slice(0, 6).join(','));
    check('the drums are on the GM percussion channel',
      !!drums && drums.channel === 9 && drums.notes.length > 0 &&
      drums.notes.every(n => [36, 38, 42, 46].includes(n.midi)),
      drums && drums.channel + ' / ' + drums.notes.length + ' hits');
    check('there is a kick on the downbeat of bar 1',
      !!drums && drums.notes.some(n => n.tick === 0 && n.midi === 36));
  }

  // --- changing a setting marks it stale, and remaking honours the change ---
  await page.click('#leadChips button[data-inst="flute"]');
  await sleep(150);
  check('a new instrument marks the melody stale', await page.isDisabled('#melPlayBtn'));
  check('the chip took the press',
    await page.getAttribute('#leadChips button[data-inst="flute"]', 'aria-pressed') === 'true');
  await makeMelody(page);
  check('remaking with the flute works', !(await page.isDisabled('#melPlayBtn')));
  const mid2 = await grabSave(page, downloads, '#melMidiBtn');
  check('the flute is what got played',
    !!mid2 && readMidi(mid2.bytes).tracks.find(t => t.name === 'Lead').program === 73,
    mid2 && String(readMidi(mid2.bytes).tracks.find(t => t.name === 'Lead').program));

  // --- turning the backing off leaves the lead alone ---
  for (const k of ['drums', 'bass', 'chords']) await page.click(`#backChips button[data-back="${k}"]`);
  await sleep(150);
  await makeMelody(page);
  const mid3 = await grabSave(page, downloads, '#melMidiBtn');
  check('with the backing off only the lead is written',
    !!mid3 && readMidi(mid3.bytes).tracks.length === 2,
    mid3 && String(readMidi(mid3.bytes).tracks.length));
  for (const k of ['drums', 'bass', 'chords']) await page.click(`#backChips button[data-back="${k}"]`);
  await sleep(150);

  // --- both languages ---
  const roTitle = await page.textContent('[data-i="melodyTitle"]');
  await page.click('#navLangBtn');
  await sleep(250);
  const enTitle = await page.textContent('[data-i="melodyTitle"]');
  check('the panel speaks English too', enTitle !== roTitle && /Melody/i.test(enTitle),
    roTitle + ' -> ' + enTitle);
  check('an instrument chip is translated',
    (await page.textContent('#leadChips button[data-inst="guitar"]')) === 'Guitar',
    await page.textContent('#leadChips button[data-inst="guitar"]'));
  check('the play button label survives the switch',
    (await page.textContent('#melPlayBtn')) === 'Play', await page.textContent('#melPlayBtn'));
  await page.click('#navLangBtn');
  await sleep(250);
  check('and back to Romanian',
    (await page.textContent('#leadChips button[data-inst="guitar"]')) === 'Chitară',
    await page.textContent('#leadChips button[data-inst="guitar"]'));

  // --- the settings persist like every other setting on this page ---
  await page.check('#melodyArm');
  await page.selectOption('#melScale', 'penta');
  await sleep(200);
  await page.reload();
  await page.waitForFunction(() => !!window.ScuLaFolder);
  await sleep(400);
  check('the keep-for-melody box survives a reload', await page.isChecked('#melodyArm'));
  check('and so does the chosen instrument',
    await page.getAttribute('#leadChips button[data-inst="flute"]', 'aria-pressed') === 'true');
  check('and so does the scale', (await page.inputValue('#melScale')) === 'penta');

  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // --- a real recording feeds the panel, and only the panel -------------
  // The melody box keeps the sound in the page; the transcript box is what
  // writes it to disk. Ticking the first must not make "Descarcă" save an
  // audio file. This also puts a real webm/opus container through the
  // decoder, where everything above used a WAV.
  {
    const { ctx: ctx2, page: p2, downloads: dl2, errors: e2 } = await openPage(browser);
    await p2.route('**/transcribe*', r => r.abort());
    await p2.click('#setBtn');
    await p2.selectOption('#provider', 'custom');
    await p2.fill('#endpoint', 'http://127.0.0.1:9/transcribe');
    await p2.click('#saveBtn');
    await p2.check('#melodyArm');
    await p2.click('#melodyToggle');
    check('the transcript box is left alone', !(await p2.isChecked('#keepAudio')));
    await p2.click('#recBtn');
    await p2.waitForFunction(() => document.querySelector('#recBtn').classList.contains('on'));
    await sleep(8500);          // the whole phrase, once (%noloop)
    await p2.click('#recBtn');
    await sleep(1200);
    check('the recording reaches the melody panel', !(await p2.isDisabled('#melMakeBtn')));
    const info2 = await makeMelody(p2);
    console.log('      info: ' + info2);
    check('the hum that was recorded comes back as the same twelve notes',
      parseInt(info2, 10) === SEQ.length, info2);
    check('and at the tempo it was hummed at',
      Math.abs(parseInt((info2.match(/(\d+)\s*BPM/) || [])[1], 10) - BPM) <= 5, info2);

    await p2.fill('#transcript', 'Fredonat.');
    const before = dl2.length;
    await p2.click('#dlBtn');
    for (let i = 0; i < 40 && dl2.length < before + 2; i++) await sleep(50);
    await sleep(250);
    const got = dl2.slice(before).map(d => d.suggestedFilename());
    check('and Descarcă still writes the transcript alone',
      got.length === 1 && /\.txt$/.test(got[0]), got.join(', '));
    check('no page errors while recording', e2.length === 0, e2.join(' | '));
    await ctx2.close();
  }

  await browser.close();
  console.log(failed ? '\n' + failed + ' FAILED' : '\nall melody checks passed');
  process.exit(failed ? 1 : 0);
})();

// Adversarial review: assertions describe desired behavior, including open findings.
// Run: python3 scripts/run-tests.py song-review
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'test-results/song-review');
fs.mkdirSync(out, { recursive: true });
const results = [];
async function check(name, action) {
  try { await action(); results.push({ name, status: 'PASS' }); console.log('PASS ' + name); }
  catch (e) { results.push({ name, status: 'FAIL', error: e.message }); console.error('FAIL ' + name + ': ' + e.message); }
}
function wav(rate = 22050, channels = 1, bits = 16, seconds = 1) {
  const frames = Math.round(rate * seconds), size = frames * channels * bits / 8;
  const b = Buffer.alloc(44 + size + size % 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * channels * bits / 8, 28);
  b.writeUInt16LE(channels * bits / 8, 32); b.writeUInt16LE(bits, 34);
  b.write('data', 36); b.writeUInt32LE(size, 40);
  return b;
}
const ready = p => p.waitForFunction(() => document.querySelector('#recordState').textContent === 'Ready');
async function click(p, name) { await p.getByRole('button', { name, exact: true }).click(); await ready(p); }
async function stored(p) {
  return p.evaluate(() => new Promise((resolve, reject) => {
    const q = indexedDB.open('scula-song'); q.onerror = () => reject(q.error);
    q.onsuccess = () => { const db = q.result, r = db.transaction('projects').objectStore('projects').getAll();
      r.onsuccess = () => { db.close(); resolve(r.result.find(p => p.id === localStorage.getItem('scula:song:project'))); }; r.onerror = () => reject(r.error); };
  }));
}
async function download(p, selector) {
  const pending = p.waitForEvent('download'); await selector.click();
  const d = await pending; await ready(p); return fs.readFileSync(await d.path());
}
function contrast(a, b) {
  const luminance = s => { const c = s.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return c[0] * .2126 + c[1] * .7152 + c[2] * .0722; };
  const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROME_PATH });
  try {
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const p = await context.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript(() => localStorage.setItem('scula:ui-lang', 'en'));
    await p.goto('file://' + path.join(root, 'song.html')); await ready(p);
    await p.screenshot({ path: path.join(out, 'empty-desktop.png'), fullPage: true });
    for (const lang of ['en', 'ro']) {
      if (lang === 'ro') { await p.click('#navLangBtn'); await p.waitForFunction(() => document.documentElement.lang === 'ro'); }
      for (const width of [320, 390, 768, 1440]) {
        await p.setViewportSize({ width, height: 900 });
        await check(`empty ${lang} layout ${width}px`, async () => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)));
      }
    }
    await p.click('#navLangBtn'); await ready(p);
    await p.setViewportSize({ width: 390, height: 844 });
    await p.screenshot({ path: path.join(out, 'empty-phone.png'), fullPage: true });
    const positions = await p.evaluate(() => Object.fromEntries(['backupHeading', 'recordHeading', 'recordBtn'].map(id => [id, document.getElementById(id).getBoundingClientRect().top + scrollY])));
    console.log('EVIDENCE phone vertical positions ' + JSON.stringify(positions));
    await p.setViewportSize({ width: 1440, height: 900 });
    await check('@song-contrast error text reaches 4.5:1', async () => {
      await p.setInputFiles('#importWav', { name: 'bad.wav', mimeType: 'audio/wav', buffer: Buffer.from('not a WAV') }); await ready(p);
      const colors = await p.locator('#status').evaluate(el => ({ fg: getComputedStyle(el).color, bg: getComputedStyle(el.closest('.panel')).backgroundColor }));
      const ratio = contrast(colors.fg, colors.bg); console.log('EVIDENCE error contrast ' + ratio); assert.ok(ratio >= 4.5, `contrast ${ratio.toFixed(2)}:1`);
    });
    await check('@song-license license link reaches 4.5:1', async () => {
      const colors = await p.locator('[data-i="packLicense"]').evaluate(el => ({ fg: getComputedStyle(el).color, bg: getComputedStyle(el.closest('.panel')).backgroundColor }));
      const ratio = contrast(colors.fg, colors.bg); console.log('EVIDENCE license contrast ' + ratio); assert.ok(ratio >= 4.5, `contrast ${ratio.toFixed(2)}:1`);
    });
    await check('malformed WAV leaves project unchanged', async () => assert.equal((await stored(p)).recordings.length, 0));
    await check('WAV sample-rate/channel/bit-depth boundaries', async () => {
      for (const [rate, channels, bits] of [[8000, 1, 16], [192000, 2, 32], [44100, 1, 24]]) {
        const b = wav(rate, channels, bits, 1 / rate);
        const meta = await p.evaluate(async bytes => ScuLaPerformance.inspectWav(new Blob([new Uint8Array(bytes)])), [...b]);
        assert.equal(meta.sampleRate, rate); assert.equal(meta.channelCount, channels); assert.equal(meta.bitDepth, bits); assert.equal(meta.duration, 1 / rate);
      }
      for (const b of [wav(7999), wav(192001), wav(22050, 3)]) {
        assert.equal(await p.evaluate(async bytes => { try { await ScuLaPerformance.inspectWav(new Blob([new Uint8Array(bytes)])); return false; } catch (_) { return true; } }, [...b]), true);
      }
    });
    const source = wav();
    await p.setInputFiles('#importWav', { name: 'silence.wav', mimeType: 'audio/wav', buffer: source }); await ready(p);
    await click(p, 'Extract melody');
    await check('silence yields zero detected and editable notes', async () => { const r = (await stored(p)).recordings[0]; assert.equal(r.performance.notes.length, 0); assert.equal(r.performance.analysis.detectedNotes.length, 0); });
    await click(p, 'Add note');
    await check('manual note on silence has a positive duration', async () => { const n = (await stored(p)).recordings[0].performance.notes[0]; assert.equal(n.onset, 0); assert.equal(n.offset, .25); });
    for (const [field, value] of [['midi', '-1'], ['midi', '128'], ['midi', '60.5'], ['velocity', '0'], ['velocity', '128'], ['cents', '101'], ['offset', '181'], ['offset', '0'], ['onset', '.25']]) {
      const originalValue = (await stored(p)).recordings[0].performance.notes[0][field];
      await check(`invalid ${field}=${value} retains stored note`, async () => {
        const before = (await stored(p)).recordings[0].performance.notes;
        const input = p.locator(`[data-field="${field}"]`).first(); await input.fill(value); await input.press('Tab'); await ready(p);
        assert.deepEqual((await stored(p)).recordings[0].performance.notes, before);
      });
      if (field === 'velocity' && value === '0') {
        await check('@song-validation rejected edit cannot create an unrestorable backup', async () => {
          const manifest = JSON.parse(await download(p, p.locator('#exportProject')));
          const validation = await p.evaluate(m => { try { ScuLaSongBackup.validate(m); return { valid: true }; } catch (e) { return { valid: false, detail: e.detail }; } }, manifest);
          assert.equal(validation.valid, true, JSON.stringify(validation));
        });
      }
      // Restore through the UI after negative assertions so later cases stay independent.
      const restore = p.locator(`[data-field="${field}"]`).first(); await restore.fill(String(originalValue)); await restore.press('Tab'); await ready(p);
    }
    for (const bpm of [39, 221]) {
      await check(`invalid tempo=${bpm} retains stored tempo`, async () => {
        const before = (await stored(p)).recordings[0].performance.tempoBpm;
        const tempo = p.locator('.performance input[type="number"]').first(); await tempo.fill(String(bpm)); await tempo.press('Tab'); await ready(p);
        const after = (await stored(p)).recordings[0].performance.tempoBpm;
        const restore = p.locator('.performance input[type="number"]').first(); await restore.fill(String(before)); await restore.press('Tab'); await ready(p);
        assert.equal(after, before);
      });
    }
    await check('@song-focus Tab after pitch edit reaches the next note field', async () => {
      const input = p.locator('[data-field="midi"]').first(); await input.fill('69'); await input.press('Tab'); await ready(p);
      assert.equal(await p.evaluate(() => document.activeElement.dataset.field), 'onset');
    });
    await check('undo/redo preserves manual-note changes', async () => { await click(p, 'Undo'); assert.equal((await stored(p)).recordings[0].performance.notes[0].midi, 60); await click(p, 'Redo'); assert.equal((await stored(p)).recordings[0].performance.notes[0].midi, 69); });
    await check('quantization has independently calculated half-beat positions', async () => {
      const data = await p.evaluate(() => { const perf = { tempoBpm: 120, quantizationDivision: 2, analysis: { tempo: { phaseSeconds: 0 } }, notes: [{ onset: .13, offset: .62 }] }; ScuLaPerformance.quantize(perf); return perf.notes[0].quantizedTiming; });
      assert.deepEqual(data, { onset: .25, offset: .5 });
    });
    await click(p, 'Create arrangement version'); await p.click('#addSongSection'); await ready(p);
    await p.screenshot({ path: path.join(out, 'populated-desktop.png'), fullPage: true });
    for (const width of [320, 390]) { await p.setViewportSize({ width, height: 844 }); await check(`populated layout ${width}px`, async () => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))); }
    await p.screenshot({ path: path.join(out, 'populated-phone.png'), fullPage: true });
    await check('original WAV remains byte-identical after derived edits', async () => assert.deepEqual(await download(p, p.locator('.take').first().getByRole('button', { name: 'Save WAV', exact: true })), source));
    await check('derived project remains backup-valid', async () => { const manifest = JSON.parse(await download(p, p.locator('#exportProject'))); assert.equal(await p.evaluate(m => { ScuLaSongBackup.validate(m); return true; }, manifest), true); });
    await check('@song-delete confirmation discloses dependent arrangement and section loss', async () => {
      let message; p.once('dialog', async d => { message = d.message(); await d.dismiss(); });
      await p.locator('.take > .row').getByRole('button', { name: 'Delete', exact: true }).click(); await ready(p);
      assert.match(message, /arrangement/i); assert.match(message, /section|timeline/i);
    });
    await check('cancel take deletion preserves source, arrangement and timeline', async () => { const v = await stored(p); assert.equal(v.recordings.length, 1); assert.equal(v.arrangements.length, 1); assert.equal(v.timeline.length, 1); });
    await check('reload preserves composed project', async () => { const before = await stored(p); await p.reload(); await ready(p); assert.deepEqual(await stored(p), before); });
    await check('accepted take deletion cascades to arrangements and sections', async () => {
      p.once('dialog', d => d.accept()); await p.locator('.take > .row').getByRole('button', { name: 'Delete', exact: true }).click(); await ready(p);
      const v = await stored(p); assert.equal(v.recordings.length, 0); assert.equal(v.arrangements.length, 0); assert.equal(v.timeline.length, 0);
      assert.equal(await p.locator('#undoSongTimeline').isDisabled(), true);
    });
    await check('no uncaught page errors', async () => assert.deepEqual(errors, []));
    await context.close();
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2)); }
  process.exitCode = results.some(r => r.status === 'FAIL') ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });

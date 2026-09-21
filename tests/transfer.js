// The Transfer page — transfer.html.
//
// Driven as two devices at once: two file:// pages in one browser, doing the
// real thing between them. Nothing here is mocked on the Wi-Fi side — the
// offer and the answer are carried across by the test the way a person
// carries them, and the bytes travel over a real RTCDataChannel.
//
//   1. the link: offer -> answer -> both ends green, each naming the other
//   2. a folder with subfolders staged through the real <input webkitdirectory>
//      and sent, then read back on the other side byte for byte
//   3. the store-only .zip the receiving side writes on a phone, parsed here
//      out of the bytes handed to ScuLaFolder.save
//   4. the device book: remembered across a reload, forgotten on demand
//   5. Bluetooth against a stub peripheral: the frames this page writes to the
//      NUS characteristic, chunked at the MTU, and a file arriving back the
//      same way (no hardware, and no browser can be a peripheral anyway)
//   6. a path from the other device can never walk out of its folder
//
// Chrome hides local IPs behind mDNS names, which a container may not resolve,
// so the two peers are launched with that off - see LAUNCH below.
//
//   node transfer.js        # from tests/
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = 'file://' + path.join(__dirname, '..', 'transfer.html');
const LAUNCH = {
  args: ['--disable-features=WebRtcHideLocalIpsWithMdns']
};
if (CHROME) LAUNCH.executablePath = CHROME;

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The tree that gets sent: two levels of subfolder, and 40 kB of pattern so
// the framing is exercised over many chunks rather than one.
//
// Every name here is ASCII on purpose. Diacritics in a *path* are checked
// further down, on a file built inside the page - driving a real <input> with
// a file whose name has a "ț" in it does not work under this harness: the
// browser is handed the path and drops the file, on a bare <input type=file>
// as much as on this page's own.
const TREE = {
  'note.md': '# plan\nprima linie\n',
  'sub/lista.txt': 'zahar, oua, faina\n',
  'sub/adanc/data.json': JSON.stringify({ a: 1, b: [2, 3] }),
  'sub/adanc/bytes.bin': null            // filled with 40 kB of pattern below
};
// Staged inside the page instead of off disk, so the path itself carries
// diacritics across the wire (the manifest is JSON, the names are UTF-8).
const ODD = { path: 'sub/rețetă mâncării.txt', body: 'zahăr, ouă, făină\n' };
function treeDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scula-tx-'));
  const big = Buffer.alloc(40000);
  for (let i = 0; i < big.length; i++) big[i] = (i * 7) & 255;
  for (const rel of Object.keys(TREE)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, TREE[rel] === null ? big : TREE[rel]);
  }
  return { root, big };
}

async function openPage(browser, { id, name, hash = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(URL + hash);
  await page.waitForFunction(() => typeof prefs !== 'undefined' && !!prefs.id);
  // Each browser context has its own storage, so the two pages already have
  // separate device books; naming them is what makes "each end names the
  // other" mean something.
  if (id) await page.evaluate(([i, n]) => { prefs.id = i; prefs.name = n; }, [id, name]);
  return { ctx, page, errors };
}

const linked = page => page.waitForFunction(
  () => document.getElementById('linkState').classList.contains('on'), null, { timeout: 25000 });

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const { root, big } = treeDir();

  const A = await openPage(browser, { id: 'dev-a', name: 'Device A' });
  const B = await openPage(browser, { id: 'dev-b', name: 'Device B' });
  await Promise.all([A, B].map(x => x.page.evaluate(() => Book.clear())));

  /* ==========================================================
     1. The link — two codes, carried across by hand
     ========================================================== */
  await A.page.click('#btnOffer');
  await A.page.waitForFunction(() => document.getElementById('myCode').value.length > 40, null, { timeout: 15000 });
  const offer = await A.page.inputValue('#myCode');
  check('the offer code is made, and carries the S1 marker', /^S1[ZP]/.test(offer), offer.slice(0, 12));

  await B.page.click('#btnJoin');
  await B.page.fill('#theirCode', offer);
  await B.page.click('#useCode');
  await B.page.waitForFunction(() => document.getElementById('myCode').value.length > 40, null, { timeout: 15000 });
  const answer = await B.page.inputValue('#myCode');
  check('the answer code is made', /^S1[ZP]/.test(answer), answer.slice(0, 12));

  await A.page.fill('#theirCode', answer);
  await A.page.click('#useCode');

  let bothLinked = true;
  try { await Promise.all([linked(A.page), linked(B.page)]); }
  catch (e) { bothLinked = false; }
  check('both ends report the link open', bothLinked);
  if (!bothLinked) {
    const st = await A.page.evaluate(() => ({ s: state, ice: pc && pc.iceConnectionState, c: pc && pc.connectionState }));
    console.log('   link never came up:', JSON.stringify(st));
    console.log('   (a container with no loopback UDP cannot make a WebRTC link; the rest is skipped)');
    await browser.close();
    process.exit(1);
  }
  check('each end names the other', (await A.page.textContent('#linkState')).includes('Device B')
    && (await B.page.textContent('#linkState')).includes('Device A'));
  check('the code boxes are put away once the link is up',
    await A.page.evaluate(() => document.getElementById('wifiBox').hidden));

  /* ==========================================================
     2. A folder with subfolders, staged and sent
     ========================================================== */
  // The real <input webkitdirectory>, so webkitRelativePath is what builds
  // the paths - the same road a person's folder takes.
  await A.page.setInputFiles('#fFolder', root);
  await A.page.waitForFunction(() => tray.length >= 4, null, { timeout: 10000 });
  const base = path.basename(root);
  const fromDisk = Object.keys(TREE).map(r => base + '/' + r);
  check('the whole tree is staged, subfolders and all',
    JSON.stringify(await A.page.evaluate(() => tray.map(x => x.path).sort())) === JSON.stringify(fromDisk.slice().sort()),
    await A.page.evaluate(() => tray.map(x => [x.path, x.size])));
  check('every staged file knows its size',
    (await A.page.evaluate(() => tray.map(x => x.size))).every(n => n > 0));

  // One more, built in the page, to carry diacritics in the path itself.
  await A.page.evaluate(([p, body]) => {
    addOne(p, body.length, 'text/plain', new File([body], p.split('/').pop(), { type: 'text/plain' }));
    paintTray();
  }, [ODD.path, ODD.body]);
  const want = fromDisk.concat([ODD.path]).sort();
  check('the tray sums what it holds', /5/.test(await A.page.textContent('#traySum')),
    await A.page.textContent('#traySum'));

  await A.page.click('#sendBtn');
  await B.page.waitForFunction(() => inbox.length >= 5, null, { timeout: 30000 });
  await A.page.waitForFunction(() => !busy, null, { timeout: 30000 });

  const got = await B.page.evaluate(async () => {
    const out = [];
    for (const r of inbox) {
      const buf = new Uint8Array(await r.blob.arrayBuffer());
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum = (sum + buf[i] * (i + 1)) % 4294967296;
      out.push({ path: r.path, size: r.size, sum, head: new TextDecoder().decode(buf.slice(0, 24)) });
    }
    return out;
  });
  const byPath = Object.fromEntries(got.map(g => [g.path, g]));
  check('every file arrived, under its own path',
    JSON.stringify(Object.keys(byPath).sort()) === JSON.stringify(want), Object.keys(byPath).sort());
  check('a path with diacritics survives the trip, text and all',
    byPath[ODD.path] && byPath[ODD.path].head.startsWith('zahăr, ouă'), byPath[ODD.path]);
  check('a text file arrives with its text intact',
    byPath[base + '/sub/lista.txt'] && byPath[base + '/sub/lista.txt'].head.startsWith('zahar, oua'),
    byPath[base + '/sub/lista.txt']);

  // 40 kB of pattern: many chunks, so this is the one that proves the framing
  // and the flow control, not just that something got through.
  let sum = 0;
  for (let i = 0; i < big.length; i++) sum = (sum + big[i] * (i + 1)) % 4294967296;
  const bin = byPath[base + '/sub/adanc/bytes.bin'];
  check('the 40 kB file is byte-for-byte what was sent',
    bin && bin.size === big.length && bin.sum === sum, bin && { size: bin.size, want: big.length });

  /* ==========================================================
     3. The .zip the receiving side writes where there is no folder
     ========================================================== */
  const zip = await B.page.evaluate(async () => {
    let grabbed = null;
    const real = ScuLaFolder.save;
    ScuLaFolder.save = async (name, blob) => {
      grabbed = { name, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
      return { saved: true, via: 'download', name, path: name, message: null };
    };
    await saveZip();
    ScuLaFolder.save = real;
    return grabbed;
  });
  const zbuf = Buffer.from(zip.bytes);
  check('the zip is named for the transfer', /^transfer-\d{4}-\d{2}-\d{2}/.test(zip.name), zip.name);
  // Parse it here rather than trusting it: walk the local headers.
  const entries = [];
  for (let off = 0; off + 4 <= zbuf.length && zbuf.readUInt32LE(off) === 0x04034b50;) {
    const nameLen = zbuf.readUInt16LE(off + 26), extraLen = zbuf.readUInt16LE(off + 28);
    const size = zbuf.readUInt32LE(off + 22);
    const name = zbuf.slice(off + 30, off + 30 + nameLen).toString('utf8');
    const body = zbuf.slice(off + 30 + nameLen + extraLen, off + 30 + nameLen + extraLen + size);
    entries.push({ name, size, body });
    off += 30 + nameLen + extraLen + size;
  }
  check('the zip holds every file, path and all',
    JSON.stringify(entries.map(e => e.name).sort()) === JSON.stringify(want), entries.map(e => e.name));
  const md = entries.filter(e => e.name.endsWith('note.md'))[0];
  check('a file unpacks to exactly what was sent', md && md.body.toString('utf8') === TREE['note.md'],
    md && md.body.toString('utf8'));
  check('the zip ends with a real central directory',
    zbuf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) > 0 &&
    zbuf.readUInt32LE(zbuf.length - 22) === 0x06054b50);
  check('everything shows as saved afterwards',
    await B.page.evaluate(() => inbox.every(r => r.saved)));

  /* ==========================================================
     4. The device book — kept, and forgotten on demand
     ========================================================== */
  const book = await B.page.evaluate(() => Book.all());
  const peer = book.filter(d => d.id === 'dev-a')[0];
  check('the other device is in the book, with its road and its tally',
    !!peer && peer.kind === 'wifi' && peer.name === 'Device A' && peer.bytes > 40000 && peer.count === 5, peer);

  // A reload is the whole point of IndexedDB: the book has to still be there
  // afterwards. It has to be the same context - storage does not cross one.
  await B.page.reload();
  await B.page.waitForFunction(() => typeof prefs !== 'undefined' && !!prefs.id);
  const kept = await B.page.evaluate(() => Book.all());
  check('the book survives a reload', kept.some(d => d.id === 'dev-a'), kept.map(d => d.id));
  await B.page.waitForFunction(() => document.querySelectorAll('#devList .dev').length === 1, null, { timeout: 5000 });
  check('the book is painted on arrival',
    (await B.page.textContent('#devList')).includes('Device A'));

  await B.page.click('#devList .dev .btn.danger');     // "Uită" on the first row
  await B.page.waitForFunction(() => document.querySelectorAll('#devList .dev').length === 0, null, { timeout: 5000 });
  check('forgetting a device empties it out of IndexedDB too',
    (await B.page.evaluate(() => Book.all())).length === 0);

  await B.page.evaluate(() => remember('x1', 'One', 'wifi').then(() => remember('x2', 'Two', 'ble')));
  await B.page.waitForFunction(() => document.querySelectorAll('#devList .dev').length === 2, null, { timeout: 5000 });
  await B.page.click('#forgetAll');
  await B.page.waitForFunction(() => document.querySelectorAll('#devList .dev').length === 0, null, { timeout: 5000 });
  check('"forget every device" clears the lot',
    (await B.page.evaluate(() => Book.all())).length === 0);

  /* ==========================================================
     5. Bluetooth, against a stub peripheral
     ========================================================== */
  const D = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const dp = await D.newPage();
  const derr = [];
  dp.on('pageerror', e => derr.push('PAGEERROR ' + e.message));
  // A peripheral that speaks the Nordic UART service: it keeps every write,
  // and can push notifications back. No browser can be one of these, which is
  // exactly why the other side of BLE is never another browser.
  await dp.addInitScript(() => {
    const written = [];
    let onNotify = null;
    window.__bleWritten = written;
    window.__bleNotify = arr => {
      const u8 = new Uint8Array(arr);
      onNotify({ target: { value: new DataView(u8.buffer, 0, u8.length) } });
    };
    const take = v => {
      const u8 = v instanceof Uint8Array ? v : new Uint8Array(v.buffer || v);
      written.push(Array.from(u8));
      return Promise.resolve();
    };
    const rx = { uuid: '6e400002', properties: { writeWithoutResponse: true }, writeValueWithoutResponse: take };
    const tx = {
      uuid: '6e400003',
      startNotifications: () => Promise.resolve(tx),
      addEventListener: (n, f) => { if (n === 'characteristicvaluechanged') onNotify = f; }
    };
    const service = { getCharacteristic: u => Promise.resolve(/0002/.test(u) ? rx : tx) };
    const device = {
      id: 'stub-ble-1', name: 'Cutia lu Miron',
      gatt: { connect: () => Promise.resolve({ getPrimaryService: () => Promise.resolve(service), disconnect() {} }) },
      addEventListener() {}, forget: () => Promise.resolve()
    };
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: { requestDevice: () => Promise.resolve(device), getDevices: () => Promise.resolve([device]) }
    });
  });
  await dp.goto(URL);
  await dp.waitForFunction(() => typeof prefs !== 'undefined' && !!prefs.id);
  await dp.evaluate(() => Book.clear());

  await dp.click('.tabs .btn[data-trans="ble"]');
  await dp.click('#bleScan');
  // state flips to "on" only after the device is written into the book, so
  // this waits for the whole attach, not just the channel.
  await dp.waitForFunction(() => link.on && link.kind === 'ble' && state === 'on', null, { timeout: 10000 });
  check('the Bluetooth link opens and names the device',
    (await dp.textContent('#linkState')).includes('Cutia lu Miron'));
  check('the Bluetooth device lands in the book',
    (await dp.evaluate(() => Book.all())).some(d => d.kind === 'ble' && d.bleId === 'stub-ble-1'));

  // __bleWritten is left as it is: HELLO went out on connect and belongs in
  // what the peripheral saw.
  await dp.evaluate(() => {
    addOne('dosar/mic.txt', 0, 'text/plain', new File(['salut, lume'], 'mic.txt', { type: 'text/plain' }));
    paintTray();
  });
  await dp.click('#sendBtn');
  await dp.waitForFunction(() => !busy, null, { timeout: 15000 });

  const writes = await dp.evaluate(() => window.__bleWritten.map(a => a.length));
  check('every Bluetooth write stays under the MTU', writes.every(n => n > 0 && n <= 180), writes);
  // Reassemble what the peripheral received, with the page's own framing rules.
  const frames = await dp.evaluate(() => {
    const flat = [];
    for (const w of window.__bleWritten) for (const b of w) flat.push(b);
    const out = [];
    const push = reader((type, p) => out.push({ type, text: new TextDecoder().decode(p) }));
    push(new Uint8Array(flat));
    return out;
  });
  const kinds = frames.map(f => f.type);
  check('the writes reassemble into HELLO, MANIFEST, START, DATA, END, DONE',
    JSON.stringify(kinds) === JSON.stringify([1, 2, 3, 4, 5, 6]), kinds);
  const manifest = frames.filter(f => f.type === 2)[0], data = frames.filter(f => f.type === 4)[0];
  check('the manifest carries the file under its folder',
    manifest && manifest.text.includes('dosar/mic.txt'), manifest && manifest.text);
  check('the bytes on the wire are the file itself',
    data && data.text === 'salut, lume', data && data.text);

  // And the other direction: notifications carrying a file back.
  await dp.evaluate(async () => {
    const body = new TextEncoder().encode('inapoi\n');
    const frames = [
      jframe(2, { tid: 'x', total: body.length, n: 1, files: [{ i: 0, path: 'venit/de-acolo.txt', size: body.length, type: 'text/plain' }] }),
      jframe(3, { i: 0 }),
      frame(4, body),
      jframe(5, { i: 0 }),
      jframe(6, { n: 1, total: body.length })
    ];
    for (const f of frames) {
      // split across notifications, the way a real peripheral would
      for (let i = 0; i < f.length; i += 20) window.__bleNotify(Array.from(f.slice(i, i + 20)));
    }
  });
  await dp.waitForFunction(() => inbox.length === 1, null, { timeout: 10000 });
  const back = await dp.evaluate(async () => ({ path: inbox[0].path, text: await inbox[0].blob.text() }));
  check('a file notified back over Bluetooth is reassembled whole',
    back.path === 'venit/de-acolo.txt' && back.text === 'inapoi\n', back);

  /* ==========================================================
     6. A path from the other device cannot walk out of its folder
     ========================================================== */
  const paths = await dp.evaluate(() => [
    safePath('../../../etc/passwd'),
    safePath('/absolute/thing.txt'),
    safePath('C:\\Windows\\system32\\x.dll'),
    safePath('a/../../b.txt'),
    safePath('')
  ]);
  check('".." and absolute paths are flattened away',
    JSON.stringify(paths) === JSON.stringify(['etc/passwd', 'absolute/thing.txt', 'C_/Windows/system32/x.dll', 'a/b.txt', 'fisier']),
    paths);

  /* ==========================================================
     7. A code carried as a link, and both languages
     ========================================================== */
  const E = await openPage(browser, { hash: '#c=' + offer });
  check('a code opened as a link lands in the box on its own',
    (await E.page.inputValue('#theirCode')) === offer);
  check('and the page is on the Wi-Fi side, ready to answer',
    await E.page.evaluate(() => !document.getElementById('wifiBox').hidden && role === 'answer'));

  await E.page.click('#navLangBtn');
  await E.page.waitForFunction(() => UI === 'en', null, { timeout: 5000 });
  check('English reaches the page', (await E.page.textContent('#sendBtn')).trim() === 'Send');
  await E.page.click('#helpBtn');
  const help = await E.page.textContent('#help-body');
  check('the English help explains both roads and the forgetting',
    /Wi-Fi/.test(help) && /Bluetooth/.test(help) && /Forget every device/.test(help));
  // The modal's own scrim covers the nav, so the toggle is pressed through the
  // element rather than at a point - the modal staying open is the point here.
  await E.page.evaluate(() => document.getElementById('navLangBtn').click());
  await E.page.waitForFunction(() => UI === 'ro', null, { timeout: 5000 });
  const helpRo = await E.page.textContent('#help-body');
  check('and the Romanian help follows the toggle while it is open',
    /Pornesc eu legătura/.test(helpRo) && /Uită toate dispozitivele/.test(helpRo));

  const allErrors = [].concat(A.errors, B.errors, E.errors, derr);
  check('no page errors anywhere', allErrors.length === 0, allErrors);

  await browser.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log(failed ? '\n' + failed + ' FAILED' : '\nall good');
  process.exit(failed ? 1 : 0);
})();

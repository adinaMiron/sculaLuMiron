// Photos and films in index.html — a folder read through its own metadata.
//
// Pick a folder, walk it and its subfolders, and read out of every picture
// and every film when it was taken and where; the file name is asked third,
// for the name a person gave the picture. Everything is parsed by hand in
// the page (Rule 3), so this drives the real page off disk against real
// bytes: a JPEG carrying a real EXIF APP1 segment with a GPS IFD, a PNG
// with an eXIf chunk, and an MP4 whose moov holds "©day" and "©xyz".
//
//   node media.js        # from tests/
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

/* ── Fixtures, built byte by byte ───────────────────────────
   Nothing here is a recorded file: every one is assembled, so what the
   page reads back is exactly what this test wrote. */

// One TIFF/EXIF block: IFD0 → the Exif IFD (DateTimeOriginal) and, when
// asked, the GPS IFD (latitude and longitude as degrees/minutes/seconds).
function exifBlock(dateStr, gps) {
  const ifd0Count = gps ? 2 : 1;
  const ifd0At = 8;
  const exifAt = ifd0At + 2 + ifd0Count * 12 + 4;
  const gpsAt = exifAt + 2 + 12 + 4;
  const dataAt = gps ? gpsAt + 2 + 4 * 12 + 4 : gpsAt;
  const total = dataAt + 20 + (gps ? 48 : 0);
  const b = Buffer.alloc(total);
  b.write('MM', 0, 'ascii');
  b.writeUInt16BE(42, 2);
  b.writeUInt32BE(ifd0At, 4);

  let p = ifd0At;
  b.writeUInt16BE(ifd0Count, p); p += 2;
  const entry = (at, tag, type, count, valueOrOffset) => {
    b.writeUInt16BE(tag, at);
    b.writeUInt16BE(type, at + 2);
    b.writeUInt32BE(count, at + 4);
    b.writeUInt32BE(valueOrOffset, at + 8);
  };
  entry(p, 0x8769, 4, 1, exifAt); p += 12;
  if (gps) { entry(p, 0x8825, 4, 1, gpsAt); p += 12; }
  b.writeUInt32BE(0, p);

  // the Exif IFD: one tag, DateTimeOriginal, pointing at the data area
  b.writeUInt16BE(1, exifAt);
  entry(exifAt + 2, 0x9003, 2, 20, dataAt);
  b.writeUInt32BE(0, exifAt + 14);
  b.write(dateStr + '\0', dataAt, 'ascii');

  if (gps) {
    const latAt = dataAt + 20, lonAt = latAt + 24;
    b.writeUInt16BE(4, gpsAt);
    // a ref is two ASCII bytes, so it rides inside the entry itself
    b.writeUInt16BE(1, gpsAt + 2); b.writeUInt16BE(2, gpsAt + 4);
    b.writeUInt32BE(2, gpsAt + 6); b.write(gps.latRef + '\0', gpsAt + 10, 'ascii');
    entry(gpsAt + 14, 2, 5, 3, latAt);
    b.writeUInt16BE(3, gpsAt + 26); b.writeUInt16BE(2, gpsAt + 28);
    b.writeUInt32BE(2, gpsAt + 30); b.write(gps.lonRef + '\0', gpsAt + 34, 'ascii');
    entry(gpsAt + 38, 4, 5, 3, lonAt);
    b.writeUInt32BE(0, gpsAt + 50);
    const dms = (at, v) => {
      b.writeUInt32BE(v[0], at); b.writeUInt32BE(1, at + 4);
      b.writeUInt32BE(v[1], at + 8); b.writeUInt32BE(1, at + 12);
      b.writeUInt32BE(Math.round(v[2] * 100), at + 16); b.writeUInt32BE(100, at + 20);
    };
    dms(latAt, gps.lat);
    dms(lonAt, gps.lon);
  }
  return b;
}

function jpegWithExif(dateStr, gps) {
  const tiff = exifBlock(dateStr, gps);
  const app1 = Buffer.alloc(4 + 6);
  app1.writeUInt16BE(0xFFE1, 0);
  app1.writeUInt16BE(2 + 6 + tiff.length, 2);
  app1.write('Exif\0\0', 4, 'binary');
  return Buffer.concat([Buffer.from([0xFF, 0xD8]), app1, tiff, Buffer.from([0xFF, 0xD9])]);
}

function plainJpeg() {
  // a JPEG with a comment segment and no EXIF at all
  const com = Buffer.alloc(6);
  com.writeUInt16BE(0xFFFE, 0);
  com.writeUInt16BE(4, 2);
  return Buffer.concat([Buffer.from([0xFF, 0xD8]), com, Buffer.from([0xFF, 0xD9])]);
}

function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  return Buffer.concat([head, data, Buffer.alloc(4)]);   // the CRC is not read
}
function pngWithExif(dateStr) {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', Buffer.alloc(13)),
    pngChunk('eXIf', exifBlock(dateStr, null)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}
function plainPng() {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', Buffer.alloc(13)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function box(type, payload) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + payload.length, 0);
  head.write(type, 4, 'binary');
  return Buffer.concat([head, payload]);
}
// A QuickTime text atom in the plain shape: a length, a language, the text.
function qtText(type, text) {
  const t = Buffer.from(text, 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt16BE(t.length, 0);
  head.writeUInt16BE(0x15C7, 2);
  return box(type, Buffer.concat([head, t]));
}
function mp4(day, xyz) {
  const mvhd = Buffer.alloc(100);
  // version 0, then creation_time: seconds since 1904, here 2001-01-01 UTC
  mvhd.writeUInt32BE(0, 0);
  mvhd.writeUInt32BE(2082844800 + 978307200, 4);
  const kids = [box('mvhd', mvhd)];
  const udta = [];
  if (day) udta.push(qtText('\xa9day', day));
  if (xyz) udta.push(qtText('\xa9xyz', xyz));
  if (udta.length) kids.push(box('udta', Buffer.concat(udta)));
  return Buffer.concat([
    box('ftyp', Buffer.from('isom\0\0\2\0isomiso2', 'binary')),
    box('moov', Buffer.concat(kids)),
    box('mdat', Buffer.alloc(32))
  ]);
}

const GPS = { lat: [44, 25, 36.48], latRef: 'N', lon: [26, 6, 9], lonRef: 'E' };

// The tree the stubbed picker hands over: two levels of subfolders, one
// file that is neither a picture nor a film, and one of every reader.
const TREE = {
  'poze': {
    '2024-07-12 Ana la mare.jpg': plainJpeg(),
    'citate.txt': Buffer.from('not a photo'),
    'vara': {
      'IMG_20240712_153000.jpg': jpegWithExif('2024:07:12 15:30:00', GPS),
      'peisaj.png': pngWithExif('2019:05:04 08:09:10')
    },
    'fara-metadate': { 'Casa 12.png': plainPng() }
  },
  'filme': {
    'VID_20240713_101500 Botezul.mp4': mp4('2024-07-13T10:15:00+0300', '+44.4268+026.1025/'),
    'fara nume.mov': mp4(null, null)
  }
};

function encode(node) {
  if (Buffer.isBuffer(node)) return node.toString('base64');
  const out = {};
  Object.keys(node).forEach(k => { out[k] = encode(node[k]); });
  return out;
}

const readTable = page => page.evaluate(() => Array.from(document.querySelectorAll('#mb-table tbody tr')).map(tr => {
  const td = tr.querySelectorAll('td');
  return {
    file: td[1].childNodes[2] ? td[1].childNodes[2].textContent.trim() : '',
    path: td[1].querySelector('.mb-path').textContent,
    when: td[2].textContent.trim(),
    src: td[3].textContent.trim(),
    where: td[4].textContent.trim(),
    name: td[5].textContent.trim(),
    on: tr.querySelector('.mb-pick').checked
  };
}));

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text())) return;   // the CDN tag, over file://
    errors.push('CONSOLE ' + m.text());
  });
  await page.goto(URL);
  await page.waitForTimeout(350);

  // ---- 0. the picker, stubbed with the tree above -----------------------
  await page.evaluate(tree => {
    const FALLBACK = new Date(2020, 0, 2, 3, 4).getTime();   // local, on purpose
    const bytes = b64 => {
      const bin = atob(b64);
      const a = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
      return a;
    };
    const build = (name, node) => {
      if (typeof node === 'string') {
        return {
          kind: 'file', name: name,
          getFile: async () => new File([bytes(node)], name, { lastModified: FALLBACK })
        };
      }
      const kids = Object.keys(node).map(k => build(k, node[k]));
      return {
        kind: 'directory', name: name,
        entries: async function* () { for (const k of kids) yield [k.name, k]; }
      };
    };
    window.showDirectoryPicker = async () => build('Vacanta', tree);
  }, encode(TREE));

  // ---- 1. the button, and the view it opens -----------------------------
  await page.click('#btn-media');
  check('the 📸 button opens the photos view',
    await page.evaluate(() => document.getElementById('media-view').classList.contains('open')));
  check('and it says so before a folder is chosen',
    /Alege un folder/.test(await page.textContent('#mb-empty')));

  await page.click('#media-view button[data-i="mbPick"]');
  await page.waitForFunction(() => !mbBusy && mbRows.length > 0, null, { timeout: 15000 });

  // ---- 2. what the walk found ------------------------------------------
  const rows = await readTable(page);
  check('every picture and film under the folder is found, the .txt is not',
    rows.length === 6, rows.map(r => r.path));
  check('subfolders are walked, and the path is kept',
    rows.some(r => r.path === 'poze/vara/IMG_20240712_153000.jpg') &&
    rows.some(r => r.path === 'filme/VID_20240713_101500 Botezul.mp4'), rows.map(r => r.path));
  check('the folder name is shown', /Vacanta/.test(await page.textContent('#mb-where')));

  const by = name => rows.find(r => r.path.endsWith(name)) || {};

  // ---- 3. EXIF: the date the shutter fired, and the GPS fix -------------
  const jpg = by('IMG_20240712_153000.jpg');
  check('EXIF DateTimeOriginal is read out of the JPEG',
    jpg.when === '2024-07-12 15:30', jpg);
  check('and it is marked as coming from the metadata',
    jpg.src === 'metadate', jpg);
  check('the GPS IFD becomes degrees',
    jpg.where === '44.4268, 26.1025', jpg);

  // ---- 4. the other two readers ----------------------------------------
  check("a PNG's eXIf chunk is read the same way",
    by('peisaj.png').when === '2019-05-04 08:09' && by('peisaj.png').src === 'metadate', by('peisaj.png'));
  const vid = by('Botezul.mp4');
  check('an MP4 is read out of its moov: "©day" for when',
    vid.when === '2024-07-13 10:15' && vid.src === 'metadate', vid);
  check('and "©xyz" for where', vid.where === '44.4268, 26.1025', vid);
  check('an MP4 with neither falls back to mvhd, which counts from 1904',
    /^2001-01-01/.test(by('fara nume.mov').when), by('fara nume.mov'));

  // ---- 5. the file name, for what only it knows -------------------------
  const ana = by('2024-07-12 Ana la mare.jpg');
  check('with no metadata the date comes off the file name',
    ana.when === '2024-07-12' && ana.src === 'denumire', ana);
  check('and the name is what is left once the date is taken out',
    ana.name === 'Ana la mare', ana);
  check('a name that is only a date and a camera word leaves no name',
    jpg.name === '—', jpg);
  check('a film keeps the words beside its date and its clock',
    vid.name === 'Botezul', vid);
  check('a number that names rather than counts is kept',
    by('Casa 12.png').name === 'Casa 12', by('Casa 12.png'));
  check('and with nothing else to go on, the file system date is used and said so',
    by('Casa 12.png').when === '2020-01-02 03:04' && by('Casa 12.png').src === 'fișier',
    by('Casa 12.png'));

  // ---- 6. the filters ---------------------------------------------------
  await page.selectOption('#mb-kind', 'vid');
  check('"films only" leaves the two films', (await readTable(page)).length === 2);
  await page.selectOption('#mb-kind', 'all');
  await page.check('#mb-opt-meta');
  const onlyMeta = await readTable(page);
  check('"only what the metadata says" drops the rows dated by name or by file',
    onlyMeta.length === 4 && !onlyMeta.some(r => r.src === 'denumire' || r.src === 'fișier'),
    onlyMeta.map(r => r.src));
  await page.uncheck('#mb-opt-meta');
  await page.fill('#mb-q', 'botez');
  await page.waitForTimeout(260);                 // the query box is debounced
  check('the query looks at the path and at the name', (await readTable(page)).length === 1);
  await page.fill('#mb-q', '');
  await page.waitForTimeout(260);

  // ---- 7. what gets written into the chapter ----------------------------
  await page.evaluate(() => { editor.value = ''; updatePreview(); });
  // leave one row out, to prove the tick is what decides
  await page.evaluate(() => {
    const tr = Array.from(document.querySelectorAll('#mb-table tbody tr'))
      .find(r => /fara nume\.mov/.test(r.querySelector('.mb-path').textContent));
    tr.querySelector('.mb-pick').click();
  });
  await page.click('#media-view button[data-i="mbInsertBtn"]');
  await page.waitForTimeout(150);
  const list = await page.evaluate(() => editor.value);
  check('the view closes once it has written',
    !await page.evaluate(() => document.getElementById('media-view').classList.contains('open')));
  check('the list is five lines, the unticked one left out',
    list.trim().split('\n').length === 5 && !/fara nume/.test(list), list);
  check('each line carries an @date this page already reads',
    /- @2024-07-12 15:30 /.test(list), list);
  check('the name is bold and the file is a link',
    /\*\*Ana la mare\*\* — \[Ana la mare\]\(poze\/2024-07-12%20Ana%20la%20mare\.jpg\)/.test(list), list);
  check('and the place is a "^@" marker, last on its line',
    /\^@44\.4268, 26\.1025$/m.test(list), list);
  check('the preview turns it into a place pill',
    await page.evaluate(() => !!preview.querySelector('.md-geo')));
  check('and the 🗺 button appears with it',
    await page.evaluate(() => !document.getElementById('btn-map').hidden));

  // ---- 8. the other two shapes -----------------------------------------
  await page.click('#btn-media');
  await page.selectOption('#mb-format', 'timeline');
  await page.evaluate(() => { editor.value = ''; updatePreview(); });
  await page.click('#media-view button[data-i="mbInsertBtn"]');
  await page.waitForTimeout(150);
  const tl = await page.evaluate(() => editor.value);
  check('as a timeline, every dated row is a "#date - !what" entry',
    /^#2024-07-12 - !/m.test(tl) && /^#2019-05-04 - !/m.test(tl), tl);
  check('and the preview draws one timeline out of the run',
    await page.evaluate(() => preview.querySelectorAll('.md-timeline').length === 1));
  check('a row with no place keeps the image shape "![name](file)"',
    /^#2019-05-04 - !\[peisaj\]\(poze\/vara\/peisaj\.png\)$/m.test(tl), tl);

  await page.click('#btn-media');
  await page.selectOption('#mb-format', 'table');
  await page.evaluate(() => { editor.value = ''; updatePreview(); });
  await page.click('#media-view button[data-i="mbInsertBtn"]');
  await page.waitForTimeout(150);
  const tbl = await page.evaluate(() => editor.value);
  check('as a table it is a real markdown table',
    /^\| Când \| Nume \| Unde \| Fișier \|$/m.test(tbl) && /^\|---\|---\|---\|---\|$/m.test(tbl), tbl.slice(0, 160));
  check('and the place in a cell is bare coordinates — a "^@" would eat the row',
    !/\^@/.test(tbl) && /\| 44\.4268, 26\.1025 \|/.test(tbl), tbl.slice(0, 260));

  // ---- 9. the switches --------------------------------------------------
  await page.click('#btn-media');
  await page.selectOption('#mb-format', 'list');
  await page.uncheck('#mb-opt-name');
  await page.uncheck('#mb-opt-geo');
  await page.uncheck('#mb-opt-link');
  await page.evaluate(() => { editor.value = ''; updatePreview(); });
  await page.click('#media-view button[data-i="mbInsertBtn"]');
  await page.waitForTimeout(150);
  const bare = await page.evaluate(() => editor.value);
  check('with the three switches off, a line is a date and a file name',
    !/\^@/.test(bare) && !/\]\(/.test(bare) && /- @2024-07-12 15:30 — IMG_20240712_153000\.jpg/.test(bare), bare);

  await page.click('#btn-media');
  await page.check('#mb-opt-day');
  await page.evaluate(() => { editor.value = ''; updatePreview(); });
  await page.click('#media-view button[data-i="mbInsertBtn"]');
  await page.waitForTimeout(150);
  const days = await page.evaluate(() => editor.value);
  check('"a heading per day" opens each day with its own heading',
    /^### 2024-07-12$/m.test(days) && /^### 2019-05-04$/m.test(days), days.slice(0, 200));

  // ---- 10. both languages ----------------------------------------------
  await page.click('#btn-media');
  const ro = await page.evaluate(() => [
    document.getElementById('btn-media').textContent,
    document.querySelector('#mb-table th:nth-child(3)').textContent,
    document.querySelector('#mb-format option').textContent
  ]);
  const en = await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'en' }));
    return [
      document.getElementById('btn-media').textContent,
      document.querySelector('#mb-table th:nth-child(3)').textContent,
      document.querySelector('#mb-format option').textContent
    ];
  });
  check('the button, the columns and the options all follow the language',
    /Poze/.test(ro[0]) && ro[1] === 'Când' && ro[2] === 'Listă' &&
    /Photos/.test(en[0]) && en[1] === 'When' && en[2] === 'List', { ro, en });
  check('and the rows survive the repaint',
    (await readTable(page)).length === 6);

  // ---- 11. Esc closes it, like the graph and the garden -----------------
  await page.keyboard.press('Escape');
  check('Escape closes the view',
    !await page.evaluate(() => document.getElementById('media-view').classList.contains('open')));

  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall good');
  process.exit(failed ? 1 : 0);
})();

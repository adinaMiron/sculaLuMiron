// Checks for recipes.html — the PDF reader, the recipe parser, the markdown
// it writes, and the two ways out (a .md file, a workbook chapter).
//
// Same style as the rest of this folder: a plain Node script, PASS/FAIL per
// check, non-zero exit if anything failed. Two differences from the
// editor.html scripts:
//
//   * it serves the repo over http://127.0.0.1 instead of file://, because
//     the workbook check needs IndexedDB and a file:// origin is opaque;
//   * it builds its own PDFs (uncompressed and FlateDecode) at run time, so
//     there is no binary fixture to keep in the repo.
const path = require('path');
const fs = require('fs');
const http = require('http');
const zlib = require('zlib');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const ROOT = path.join(__dirname, '..');

let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || extra === undefined ? '' : '\n      ' + extra));
  if (!ok) failures++;
}

/* ---------- the sample plan (the layout the parser is written for) ---------- */
const SAMPLE = [
  'ZIUA 3',
  'Mic dejun: Terci de ovăz proteic',
  '• 60g fulgi de ovăz fini',
  '• 30g cupă proteină (aromă vanilie/ciocolată)',
  '• Apă fierbinte cât este necesar',
  '• 25g unt de arahide și o banană medie (feliată deasupra)',
  '• Toarnă apa peste ovăz, lasă 2-3 min. Adaugă proteina, untul de arahide',
  'și banana',
  'Prânz: Cartofi dulci cu cotlet de porc',
  '• 300g cartof dulce',
  '• 150g cotlet de porc',
  '• salată de varză, 10ml ulei de măsline (peste salată sau cartofi)',
  '• Taie cartofii dulci și coace-i la cuptor până se înmoaie. Gătește',
  'cotletul pe grătar și servește-l alături de cartofi și salata de varză.',
  'Cina: Pește alb cu broccoli și garnitură',
  '• 200g pește alb',
  '• 250g broccoli, 150g cartofi natur sau 40g orez (negătit)',
  '• sos de iaurt cu usturoi',
  '• Gătește peștele la cuptor sau în tigaie. Fierbe separat broccoli-ul.'
].join('\n');

/* ---------- a PDF, built here so no binary fixture is needed ---------- */
function buildPdf(lines, { compress, objstm, type0 }) {
  // One code per distinct character, declared through a /ToUnicode CMap —
  // the same route a real subset font takes, and the only way ă â î ș ț
  // survive a PDF at all.
  const width = type0 ? 4 : 2;                 // hex digits per code
  const chars = Array.from(new Set(lines.join('').split('')));
  const code = new Map();
  chars.forEach((c, i) => code.set(c, i + 1));
  const cd = c => code.get(c).toString(16).padStart(width, '0');
  const hex = s => Array.from(s).map(cd).join('');

  let content = '';
  let y = 780;
  for (const line of lines) {
    content += `BT /F1 12 Tf 1 0 0 1 72 ${y} Tm <${hex(line)}> Tj ET\n`;
    y -= 20;
  }
  const cmap =
    '/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n' +
    '1 begincodespacerange <00> <ff> endcodespacerange\n' +
    `${chars.length} beginbfchar\n` +
    chars.map(c => `<${cd(c)}> <${c.charCodeAt(0).toString(16).padStart(4, '0')}>`).join('\n') +
    '\nendbfchar\nendcmap CMapName currentdict /CMap defineresource pop end end';

  const font = type0
    ? '<< /Type /Font /Subtype /Type0 /BaseFont /AAAAAA+Helvetica /Encoding /Identity-H ' +
      '/DescendantFonts [7 0 R] /ToUnicode 6 0 R >>'
    : '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /ToUnicode 6 0 R >>';
  const small = [
    [1, '<< /Type /Catalog /Pages 2 0 R >>'],
    [2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    [3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
        '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>'],
    [4, font]
  ];

  const parts = [];
  const push = s => parts.push(Buffer.isBuffer(s) ? s : Buffer.from(s, 'latin1'));
  push('%PDF-1.5\n');
  if (objstm) {
    // What a modern producer actually writes: the page and font dictionaries
    // live compressed inside one /Type /ObjStm, not at file level.
    let head = '', body = '';
    for (const [num, dict] of small) { head += `${num} ${body.length} `; body += dict + '\n'; }
    const raw = Buffer.from(head + body, 'latin1');
    const data = zlib.deflateSync(raw);
    push(`8 0 obj << /Type /ObjStm /N ${small.length} /First ${head.length} ` +
         `/Length ${data.length} /Filter /FlateDecode >>\nstream\n`);
    push(data);
    push('\nendstream endobj\n');
  } else {
    for (const [num, dict] of small) push(`${num} 0 obj ${dict} endobj\n`);
  }
  for (const [num, body] of [[5, content], [6, cmap]]) {
    const raw = Buffer.from(body, 'latin1');
    const data = compress ? zlib.deflateSync(raw) : raw;
    push(`${num} 0 obj << /Length ${data.length}${compress ? ' /Filter /FlateDecode' : ''} >>\nstream\n`);
    push(data);
    push('\nendstream endobj\n');
  }
  push('trailer << /Size 7 /Root 1 0 R >>\n%%EOF\n');
  return Buffer.concat(parts);
}

/* ---------- the shape 100-de-rete-pentru-slabit.pdf is in ----------
   Two things at once, because that file does both and either one alone made
   it unreadable:

     * the page draws nothing itself — it is one `/Fm0 Do`, and every word
       of the book lives inside that Form XObject;
     * every single glyph is its own `BT … Tm … Tj … ET`, so a reader that
       breaks a line at BT/ET puts one character on each line, and one that
       forgets where the last glyph ended cannot tell where a space goes.

   Glyphs are placed on a fixed 0.6em grid and a space is a skipped slot, so
   the only evidence of a word break is the gap — exactly as in the book. */
function buildGlyphFormPdf(lines) {
  const chars = Array.from(new Set(lines.join('').split(''))).filter(c => c !== ' ');
  const code = new Map();
  chars.forEach((c, i) => code.set(c, i + 1));
  const cd = c => code.get(c).toString(16).padStart(2, '0');
  const SIZE = 12, ADVANCE = 0.6;

  let form = '';
  let y = 780;
  for (const line of lines) {
    let x = 72;
    for (const ch of line) {
      if (ch !== ' ') {
        form += `q 1 0 0 1 0 0 cm BT ${SIZE} 0 0 ${SIZE} ${x} ${y} Tm /F1 1 Tf <${cd(ch)}> Tj ET Q\n`;
      }
      x += ADVANCE * SIZE;
    }
    y -= 20;
  }
  const content = 'q /Fm0 Do Q\n';
  const cmap =
    '/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n' +
    '1 begincodespacerange <00> <ff> endcodespacerange\n' +
    `${chars.length} beginbfchar\n` +
    chars.map(c => `<${cd(c)}> <${c.charCodeAt(0).toString(16).padStart(4, '0')}>`).join('\n') +
    '\nendbfchar\nendcmap CMapName currentdict /CMap defineresource pop end end';
  // Real widths: without them the reader has to guess the advance, and a
  // guess is what puts spaces inside words.
  const widths = '[' + chars.map(() => Math.round(ADVANCE * 1000)).join(' ') + ']';

  const parts = [];
  const push = s => parts.push(Buffer.isBuffer(s) ? s : Buffer.from(s, 'latin1'));
  push('%PDF-1.5\n');
  push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n');
  push('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n');
  push('3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
       '/Resources << /XObject << /Fm0 8 0 R >> >> /Contents 5 0 R >> endobj\n');
  push('4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica ' +
       `/FirstChar 1 /LastChar ${chars.length} /Widths ${widths} /ToUnicode 6 0 R >> endobj\n`);
  for (const [num, body, extra] of [[5, content, ''], [6, cmap, '']]) {
    const data = Buffer.from(body, 'latin1');
    push(`${num} 0 obj << /Length ${data.length}${extra} >>\nstream\n`);
    push(data);
    push('\nendstream endobj\n');
  }
  const fdata = zlib.deflateSync(Buffer.from(form, 'latin1'));
  push(`8 0 obj << /Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 595 842] ` +
       `/Resources << /Font << /F1 4 0 R >> >> /Length ${fdata.length} /Filter /FlateDecode >>\nstream\n`);
  push(fdata);
  push('\nendstream endobj\n');
  push('trailer << /Size 9 /Root 1 0 R >>\n%%EOF\n');
  return Buffer.concat(parts);
}

/* ---------- a JPEG 2000 image, hand-built ----------
   Every packet is empty, which is legal and means "no coefficient in this
   precinct was ever coded". That decodes to an all-zero image, and after the
   DC level shift to a uniform mid-grey — so the check proves the box walk,
   the marker segments, the tile and precinct geometry, the packet iteration,
   the inverse wavelet and the level shift, all without needing an encoder to
   produce EBCOT data. The full entropy-coded path is checked against the
   real book below, when it is present. */
function buildJp2(w, h) {
  const u16 = v => Buffer.from([(v >> 8) & 255, v & 255]);
  const u32 = v => Buffer.from([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
  const seg = (m, payload) => Buffer.concat([Buffer.from([0xff, m]), u16(payload.length + 2), payload]);

  const siz = seg(0x51, Buffer.concat([
    u16(0), u32(w), u32(h), u32(0), u32(0), u32(w), u32(h), u32(0), u32(0),
    u16(1), Buffer.from([7, 1, 1])            // one 8-bit unsigned component
  ]));
  const levels = 1;
  const cod = seg(0x52, Buffer.from([
    0,          // Scod: default precincts, no SOP, no EPH
    0,          // LRCP
    0, 1,       // one layer
    0,          // no component transform
    levels,
    4, 4,       // 64x64 code-blocks
    0,          // no code-block style
    1           // 5/3 reversible
  ]));
  const qcd = seg(0x5c, Buffer.concat([
    Buffer.from([0x40]),                       // no quantisation, 2 guard bits
    Buffer.alloc(1 + 3 * levels, 8 << 3)       // one exponent per subband
  ]));
  const packets = Buffer.alloc(levels + 1, 0); // one empty packet per resolution
  const sotLen = 12, sodLen = 2;
  const psot = sotLen + sodLen + packets.length;
  const sot = seg(0x90, Buffer.concat([u16(0), u32(psot), Buffer.from([0, 1])]));
  const cs = Buffer.concat([Buffer.from([0xff, 0x4f]), siz, cod, qcd, sot,
                            Buffer.from([0xff, 0x93]), packets, Buffer.from([0xff, 0xd9])]);

  const box = (type, body) =>
    Buffer.concat([u32(body.length + 8), Buffer.from(type, 'latin1'), body]);
  return Buffer.concat([
    box('jP  ', Buffer.from([0x0d, 0x0a, 0x87, 0x0a])),
    box('ftyp', Buffer.concat([Buffer.from('jp2 ', 'latin1'), u32(0), Buffer.from('jp2 ', 'latin1')])),
    box('jp2c', cs)
  ]);
}

/* ---------- a scanned PDF: pages that hold pictures, not text ----------
   One page per entry, each entry a list of image XObjects drawn in order.
   This is what a scanner or a phone "scan to PDF" writes, and the only route
   into it is recipes.html's PdfText.images() + OCR. */
function buildScanPdf(pages) {
  const objs = [];                                   // [num, dict, data]
  let next = 3;
  const pageNums = pages.map(() => next++);
  const built = pages.map(imgs => {
    const entries = imgs.map((im, k) => {
      const num = next++;
      objs.push([num,
        `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} ` +
        `/ColorSpace ${im.cs} /BitsPerComponent ${im.bpc} /Filter ${im.filter} ` +
        `/Length ${im.data.length} >>`, im.data]);
      return { name: `/X${k}`, num };
    });
    const content = Buffer.from(
      entries.map(e => `q 595 0 0 842 0 0 cm ${e.name} Do Q\n`).join(''), 'latin1');
    const cnum = next++;
    objs.push([cnum, `<< /Length ${content.length} >>`, content]);
    return { entries, cnum };
  });

  const parts = [];
  const push = x => parts.push(Buffer.isBuffer(x) ? x : Buffer.from(x, 'latin1'));
  push('%PDF-1.5\n');
  push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n');
  push(`2 0 obj << /Type /Pages /Kids [${pageNums.map(n => n + ' 0 R').join(' ')}] ` +
       `/Count ${pageNums.length} >> endobj\n`);
  built.forEach((b, i) => {
    const xo = b.entries.map(e => `${e.name} ${e.num} 0 R`).join(' ');
    push(`${pageNums[i]} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
         `/Resources << /XObject << ${xo} >> >> /Contents ${b.cnum} 0 R >> endobj\n`);
  });
  for (const [num, dict, data] of objs) {
    push(`${num} 0 obj ${dict}\nstream\n`);
    push(data);
    push('\nendstream endobj\n');
  }
  push(`trailer << /Size ${next} /Root 1 0 R >>\n%%EOF\n`);
  return Buffer.concat(parts);
}

// Left half ink, right half paper: survives JPEG, Flate and the greyscale
// pass, so one pixel from each half proves the picture arrived intact.
function greyBar(w, h) {
  const b = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b[y * w + x] = x < w / 2 ? 0 : 255;
  return b;
}

/* ---------- a static server, so IndexedDB has a real origin ---------- */
function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('no'); return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

(async () => {
  const { server, port } = await serve();
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'recipes-'));
  const plainPdf = path.join(tmp, 'plan-plain.pdf');
  const flatePdf = path.join(tmp, 'plan-flate.pdf');
  const objstmPdf = path.join(tmp, 'plan-objstm.pdf');
  fs.writeFileSync(plainPdf, buildPdf(SAMPLE.split('\n'), { compress: false }));
  fs.writeFileSync(flatePdf, buildPdf(SAMPLE.split('\n'), { compress: true }));
  fs.writeFileSync(objstmPdf, buildPdf(SAMPLE.split('\n'), { compress: true, objstm: true, type0: true }));

  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    // The browser asks for a favicon this repo does not ship; that 404 is not
    // the page's doing.
    if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errors.push('CONSOLE ' + m.text());
  });
  await page.goto(`http://127.0.0.1:${port}/recipes.html`);
  await page.waitForFunction(() => !!window.ScuLaRecipes);

  /* ---- 0. nothing conditional is on screen before a file is ----
     `hidden` is only a UA rule of display:none, and any class that sets its
     own display outranks it. Every one of these carries such a class. */
  const leaked = await page.evaluate(() =>
    ['filters', 'found', 'onlyShownBox', 'btnStop', 'textCard', 'mdCard', 'reviewCard']
      .filter(id => {
        const el = document.getElementById(id);
        return el && el.hidden && getComputedStyle(el).display !== 'none';
      }));
  check('nothing marked hidden is actually visible', leaked.length === 0, leaked.join(', '));

  /* An empty page is two sections: what a day should come to, and the way
     in. The three that answer a question about recipes wait for one. */
  const start = await page.evaluate(() => ({
    targets: !document.getElementById('targetCard').hidden,
    source:  !document.querySelector('#drop').closest('.card').hidden,
    md:      document.getElementById('mdCard').hidden,
    html:    document.getElementById('htmlCard').hidden,
    review:  document.getElementById('reviewCard').hidden
  }));
  check('an untouched page shows the targets and the source, and nothing else',
        start.targets && start.source && start.md && start.html && start.review,
        JSON.stringify(start));

  /* Typing into the source is "something added" — the review card is what
     that opens, and it is the only one of the three that a bare text can. */
  await page.click('#btnPaste');                       // opens the text box
  await page.fill('#rawText', 'Ziua 1\nMic dejun\nIngrediente\n- 2 ouă\n');
  const typed = await page.evaluate(() => ({
    review: !document.getElementById('reviewCard').hidden,
    md: document.getElementById('mdCard').hidden
  }));
  check('text in the source brings the review card out, the markdown card still waits',
        typed.review && typed.md, JSON.stringify(typed));
  await page.fill('#rawText', '');
  check('and emptying it puts the review card away again',
        await page.evaluate(() => document.getElementById('reviewCard').hidden));

  /* ---- 1. the parser ---- */
  const parsed = await page.evaluate(s => {
    const days = window.ScuLaRecipes.Recipes.parse(s);
    return JSON.parse(JSON.stringify(days));
  }, SAMPLE);

  check('one day parsed', parsed.length === 1, JSON.stringify(parsed.map(d => d.n)));
  const day = parsed[0] || { meals: [] };
  check('day number is 3', day.n === 3, 'got ' + day.n);
  check('three meals', day.meals.length === 3, 'got ' + day.meals.length);

  const [b, l, d] = day.meals;
  check('breakfast recognised', b && b.kind === 'breakfast' && /Terci de ov[ăa]z proteic/.test(b.name),
        b && b.kind + ' / ' + b.name);
  check('lunch recognised', l && l.kind === 'lunch' && /Cartofi dulci/.test(l.name), l && l.kind + ' / ' + l.name);
  check('dinner recognised', d && d.kind === 'dinner' && /Pe[sș]te alb/.test(d.name), d && d.kind + ' / ' + d.name);

  check('breakfast has 4 ingredients', b && b.ingredients.length === 4,
        b && JSON.stringify(b.ingredients.map(i => i.item)));
  check('quantity and unit split', b && b.ingredients[0].qty === '60' && b.ingredients[0].unit === 'g' &&
        /fulgi de ov[ăa]z fini/.test(b.ingredients[0].item), b && JSON.stringify(b.ingredients[0]));
  check('unitless ingredient kept whole', b && /Ap[ăa] fierbinte/.test(b.ingredients[2].item) &&
        b.ingredients[2].qty === '', b && JSON.stringify(b.ingredients[2]));
  check('method split into steps', b && b.steps.length === 2 && /^Toarn/.test(b.steps[0]) &&
        /^Adaug/.test(b.steps[1]), b && JSON.stringify(b.steps));
  check('wrapped line joined into the step', b && /banana/.test(b.steps[1]), b && JSON.stringify(b.steps));
  check('comma list split into two ingredients',
        d && d.ingredients.length === 4 && d.ingredients[1].qty === '250' && d.ingredients[2].qty === '150',
        d && JSON.stringify(d.ingredients));
  check('dinner method kept out of the ingredients', d && d.steps.length === 2 && /^G[ăa]te/.test(d.steps[0]),
        d && JSON.stringify(d.steps));
  check('no step landed in the ingredients',
        day.meals.every(m => m.ingredients.every(i => !/^(Toarn|Taie|G[ăa]te)/.test(i.item))),
        JSON.stringify(day.meals.map(m => m.ingredients.map(i => i.item))));

  /* ---- 2. the PDFs ---- */
  for (const [label, file] of [['uncompressed', plainPdf], ['FlateDecode', flatePdf],
                              ['object streams + Identity-H', objstmPdf]]) {
    await page.evaluate(() => { window.ScuLaRecipes.model.days.length = 0; });
    await page.setInputFiles('#file', file);
    await page.waitForFunction(() => window.ScuLaRecipes.model.days.length > 0, null, { timeout: 8000 })
      .catch(() => {});
    const raw = await page.inputValue('#rawText');
    check(`pdf (${label}): text read`, /Terci de ov[ăa]z proteic/.test(raw), raw.slice(0, 160));
    check(`pdf (${label}): diacritics survived the CMap`, /ov[ăa]z/.test(raw) && raw.includes('ă'),
          raw.slice(0, 80));
    const n = await page.evaluate(() => window.ScuLaRecipes.model.days.length);
    check(`pdf (${label}): one day extracted`, n === 1, 'got ' + n);
  }

  /* ---- 2b. a PDF written by a real producer ----
     Chromium's own printer (Skia) is nothing like the files above: subset
     Identity-H fonts with a /W width array, a flipped text matrix, one run
     per font change. It caught both of the bugs this reader had — lines
     coming out bottom-first, and spaces appearing inside words. */
  const printed = path.join(tmp, 'printed.pdf');
  {
    const maker = await ctx.newPage();
    const body = SAMPLE.split('\n').slice(1)
      .map(l => l.startsWith('•') ? '<li>' + l.slice(1).trim() + '</li>' : '<h2>' + l + '</h2>').join('');
    await maker.setContent('<meta charset="utf-8">' +
      '<style>body{font-family:Georgia,serif;font-size:14pt}h2{font-size:15pt}li{margin:4pt 0}</style>' +
      '<h1>ZIUA 3</h1>' + body, { waitUntil: 'load' });
    await maker.pdf({ path: printed, format: 'A4', printBackground: true });
    await maker.close();
  }
  await page.evaluate(() => { window.ScuLaRecipes.model.days.length = 0; });
  await page.setInputFiles('#file', printed);
  await page.waitForFunction(() => window.ScuLaRecipes.model.days.length > 0, null, { timeout: 8000 })
    .catch(() => {});
  const real = await page.inputValue('#rawText');
  check('printed pdf: reading order is top-down', real.trim().startsWith('ZIUA 3'), real.slice(0, 60));
  check('printed pdf: no spaces broken into words',
        !/\bm in\b|\barom ă\b|10m l/.test(real) && /2-3 min\./.test(real) && /aromă/.test(real),
        (real.match(/.{0,30}m in.{0,20}/) || real.match(/.{0,40}min.{0,10}/) || [''])[0]);
  const realDay = await page.evaluate(() => JSON.parse(JSON.stringify(window.ScuLaRecipes.model.days)));
  check('printed pdf: three meals, in order',
        realDay.length === 1 && realDay[0].meals.length === 3 &&
        realDay[0].meals.map(m => m.kind).join() === 'breakfast,lunch,dinner',
        JSON.stringify(realDay.map(d => d.meals.map(m => m.kind))));
  check('printed pdf: a bulletless wrapped line does not swallow the next ingredient',
        realDay[0] && realDay[0].meals[1].ingredients.length === 4 &&
        realDay[0].meals[1].ingredients[1].item === 'cotlet de porc',
        JSON.stringify(realDay[0] && realDay[0].meals[1].ingredients.map(i => i.item)));

  /* ---- 3. the markdown ---- */
  const md = await page.evaluate(() => window.ScuLaRecipes.allMarkdown());
  check('markdown: day heading', /^# Ziua 3/m.test(md), md.split('\n')[0]);
  check('markdown: meal heading', /^## Mic dejun: Terci de ov[ăa]z proteic/m.test(md));
  check('markdown: numbered sections', /^### 1\. Ingrediente/m.test(md) && /^### 2\. Metoda de preparare/m.test(md));
  check('markdown: ingredient table header',
        /\| Cantitate \| Unitate \| Ingredient \| USDA FDC \|/.test(md));
  // The fourth cell leads with the fdcId — that is the part a reader takes
  // back — and carries what it works out to at this quantity after it.
  check('markdown: ingredient row carries qty, unit and its USDA food',
        /\| 60 \| g \| fulgi de ov[ăa]z fini \| 2346396 \u00b7 227 kcal \u00b7 P 8\.1 \u00b7 C 41\.2 \u00b7 G 3\.5 \|/.test(md),
        (md.match(/\|.*fulgi.*\|/) || [''])[0]);
  check('markdown: method is an ordered list', /^1\. Toarn/m.test(md));
  check('markdown: day totals table', /^## Total pe zi/m.test(md) && /\*\*Total\*\*/.test(md));

  /* ---- 3b. the nutrition pass ---- */
  check('nutrition: a third numbered section, per meal',
        /^### 3\. Valori nutri\u021bionale/m.test(md),
        (md.match(/^###.*$/gm) || []).join(' / '));
  check('nutrition: the table names the food and totals the meal',
        /\| fulgi de ov[ăa]z fini \| Oats, whole grain, rolled, old fashioned \| 60 \| 227 \|/.test(md) &&
        /\| \*\*Total\*\* \|\s*\|/.test(md),
        (md.match(/\|.*Oats.*\|/) || [''])[0]);
  check('nutrition: the day totals stub is filled in rather than empty',
        /\| \*\*Total\*\* \| \d+ \| [\d.]+ \| [\d.]+ \| [\d.]+ \|/.test(md),
        (md.match(/\| \*\*Total\*\*.*\|/g) || []).join(' / '));

  const nut = await page.evaluate(() => {
    const N = window.ScuLaRecipes.Nutrition;
    const one = (qty, unit, item) => {
      const v = N.forIngredient({ qty, unit, item, fdc: '' });
      return { food: v.food, g: Math.round(v.g), kcal: Math.round(v.kcal), guess: v.guess };
    };
    return {
      // a Romanian name, through the alias table
      oats: one('60', 'g', 'fulgi de ovăz fini'),
      // the longest phrase inside a name, not the first word of it
      pb: one('20', 'g', 'unt de arahide (deasupra)'),
      // the *earliest* phrase, so a row named after a carrot is a carrot
      carrot: one('1', '', 'morcov ras o conservă de fasole albă'),
      // a unit that is a thing, weighed by the food's own portion
      slices: one('2', 'felii', 'de pâine integrală'),
      eggs: one('2', '', 'ouă mărimea M'),
      // English, through the words of the descriptions themselves
      english: one('100', 'g', 'raw broccoli'),
      // nothing at all rather than a wrong guess
      nonsense: one('100', 'g', 'qwerty zzz'),
      // every shape the quantity column is allowed to take
      qty: ['60', '1,5', '1/2', '½', '1 ½', '2-3', ''].map(s => N.qtyValue(s)),
      // a real zero is a zero; olive oil has no protein
      oil: N.forIngredient({ qty: '10', unit: 'ml', item: 'ulei de măsline', fdc: '' })
    };
  });
  check('nutrition: a Romanian name finds its USDA food',
        nut.oats.food === 'Oats, whole grain, rolled, old fashioned' && nut.oats.kcal === 227,
        JSON.stringify(nut.oats));
  check('nutrition: the longest phrase wins over the shortest',
        nut.pb.food === 'Peanut butter, creamy', JSON.stringify(nut.pb));
  check('nutrition: the earliest phrase wins over the longest',
        nut.carrot.food === 'Carrots, mature, raw', JSON.stringify(nut.carrot));
  check('nutrition: a slice is weighed by the food it is a slice of',
        nut.slices.g === 64 && /P[âa]ine integral/.test(nut.slices.food), JSON.stringify(nut.slices));
  check('nutrition: no unit at all means pieces of the thing',
        nut.eggs.g === 101, JSON.stringify(nut.eggs));
  check('nutrition: an English name is matched on the descriptions',
        /Broccoli/.test(nut.english.food), JSON.stringify(nut.english));
  check('nutrition: a name nothing matches gets no food rather than a wrong one',
        nut.nonsense.food === '', JSON.stringify(nut.nonsense));
  check('nutrition: every quantity shape the parser writes',
        JSON.stringify(nut.qty) === JSON.stringify([60, 1.5, 0.5, 0.5, 1.5, 2.5, 0]),
        JSON.stringify(nut.qty));
  check('nutrition: a measured zero is a zero, not a blank',
        nut.oil.prot === 0 && nut.oil.fat > 9, JSON.stringify(nut.oil));

  // The book is the whole point of reading a second plan: a name resolved
  // once is answered from then on, and a hand-written entry is never
  // written over.
  const bk = await page.evaluate(() => {
    const N = window.ScuLaRecipes.Nutrition;
    const stats = N.stats();
    const json = JSON.parse(N.toJSON());
    N.fromJSON(JSON.stringify({ v: 1, updated: '2026-01-01', items: {
      "qwerty zzz": { name: 'qwerty zzz', id: '', food: 'Ceva de-al casei',
                      kcal: 100, prot: 10, fat: 1, carb: 2, hand: true }
    } }));
    const after = N.forIngredient({ qty: '200', unit: 'g', item: 'qwerty zzz', fdc: '' });
    N.rematch();
    const kept = N.forIngredient({ qty: '200', unit: 'g', item: 'qwerty zzz', fdc: '' });
    return { stats, keys: Object.keys(json.items).length,
             hasOats: !!json.items['fulgi de ovaz fini'],
             after: { food: after.food, kcal: after.kcal },
             kept: kept.food };
  });
  check('nutrition: reading a plan writes its ingredients into the book',
        bk.stats.total > 0 && bk.keys === bk.stats.total && bk.hasOats,
        JSON.stringify(bk.stats) + ' keys=' + bk.keys);
  check('nutrition: a hand-written entry supplies the numbers itself',
        bk.after.food === 'Ceva de-al casei' && bk.after.kcal === 200,
        JSON.stringify(bk.after));
  check('nutrition: looking the foods up again leaves hand-written entries alone',
        bk.kept === 'Ceva de-al casei', bk.kept);

  /* ---- 3c. the other 38, and the panels that show them ----
     The second table (docs/RECIPES.md § E). The thing worth guarding is
     that a hole in it never becomes a nought: an unmeasured nutrient has
     to stay `null` through the table, through the scaling, and through the
     total, or a sum over four of nine ingredients starts looking like a
     sum over nine. */
  const mic = await page.evaluate(() => {
    const N = window.ScuLaRecipes.Nutrition;
    const defs = N.micros();
    const at = k => defs.findIndex(d => d[0] === k);
    const oats = N.microsOf('2346396');
    const row = N.forIngredient({ qty: '60', unit: 'g', item: 'fulgi de ovăz fini', fdc: '' });
    const scaled = N.microRow(row);
    const sum = N.microSum([row, N.forIngredient({ qty: '10', unit: 'ml', item: 'ulei de măsline', fdc: '' })]);
    return {
      n: defs.length,
      groupsCover: N.microGroups()[N.microGroups().length - 1][2],
      keysUnique: new Set(defs.map(d => d[0])).size,
      units: Array.from(new Set(defs.map(d => d[1]))).sort(),
      oatsFe: oats && oats[at('fe')], oatsFiber: oats && oats[at('fiber')],
      oatsIod: oats && oats[at('iod')],
      local: N.microsOf('L01'),
      scaledFe: scaled[at('fe')], scaledIod: scaled[at('iod')],
      // olive oil has no iron row; oats do — so the total covers one of two
      sumFe: sum.vals[at('fe')], haveFe: sum.have[at('fe')], counted: sum.counted
    };
  });
  check('micro: 38 nutrients, uniquely keyed, and the groups cover them all',
        mic.n === 38 && mic.groupsCover === 38 && mic.keysUnique === 38,
        JSON.stringify({ n: mic.n, cover: mic.groupsCover, uniq: mic.keysUnique }));
  check('micro: three units only, none of them translated',
        JSON.stringify(mic.units) === JSON.stringify(['g', 'mg', 'µg']),
        JSON.stringify(mic.units));
  check('micro: fibre falls back to the AOAC row rather than reading as none',
        mic.oatsFiber > 8 && mic.oatsFe > 3 && mic.oatsFe < 6,
        JSON.stringify([mic.oatsFiber, mic.oatsFe]));
  check('micro: a nutrient the dataset never measured stays null, not nought',
        mic.oatsIod === null && mic.scaledIod === null, JSON.stringify(mic.oatsIod));
  check('micro: a local "L" food has no row at all rather than a row of zeroes',
        mic.local === null, JSON.stringify(mic.local));
  check('micro: 60 g is 0.6 of the table row',
        Math.abs(mic.scaledFe - mic.oatsFe * 0.6) < 1e-9, JSON.stringify([mic.scaledFe, mic.oatsFe]));
  check('micro: a total counts the rows that carried each nutrient',
        mic.counted === 2 && mic.haveFe === 1 && Math.abs(mic.sumFe - mic.scaledFe) < 1e-9,
        JSON.stringify({ counted: mic.counted, have: mic.haveFe }));

  // The panels themselves: nothing built until it is asked for, and what is
  // open survives the re-render every edit causes.
  const panel = await page.evaluate(() => {
    const R = window.ScuLaRecipes;
    const before = document.querySelectorAll('.micro').length;
    const carets = document.querySelectorAll('.nut .morebtn').length;
    const totals = Array.from(document.querySelectorAll('.tot .lbl')).map(e => e.textContent);
    document.querySelector('.nut .morebtn').click();
    const p = document.querySelector('.nut .micro');
    const read = () => Array.from(p.querySelectorAll('.mi')).map(e =>
      e.querySelector('.mn').textContent + '=' + e.querySelector('.mv').textContent);
    const items = read();
    R.renderDays();
    const after = document.querySelector('.nut .micro');
    return { before, carets, totals,
             groups: Array.from(p.querySelectorAll('p.g')).map(e => e.textContent),
             fe: items.find(s => /^Fier=/.test(s)),
             dashes: items.filter(s => /—$/.test(s)).length,
             stillOpen: !!after && !after.hidden };
  });
  check('micro: no panel is built before somebody asks for one',
        panel.before === 0 && panel.carets >= 3, JSON.stringify(panel.before));
  check('micro: a totals line under every meal and one under the day',
        panel.totals.length === 4 && panel.totals[panel.totals.length - 1] === 'Total pe zi',
        JSON.stringify(panel.totals));
  check('micro: the panel opens grouped, named and with its units',
        panel.groups.length >= 4 && /^Fier=[\d.]+ mg$/.test(panel.fe || ''),
        JSON.stringify(panel.groups) + ' / ' + panel.fe);
  check('micro: a nutrient the table lacks is an em-dash, not a zero',
        panel.dashes > 0, String(panel.dashes));
  check('micro: an open panel survives the re-render every edit causes',
        panel.stillOpen === true, JSON.stringify(panel.stillOpen));

  const totPanel = await page.evaluate(() => {
    document.querySelector('.tot .morebtn').click();
    const p = document.querySelector('.tot + .micro');
    const items = Array.from(p.querySelectorAll('.mi')).map(e => ({
      n: e.querySelector('.mn').textContent,
      v: e.querySelector('.mv').textContent,
      part: e.querySelector('.mv').classList.contains('part'),
      title: e.querySelector('.mv').title
    }));
    return { n: items.length, kcal: items.find(x => x.n === 'Energie'),
             marked: items.filter(x => x.part).length,
             titled: items.filter(x => x.title).length,
             mismatch: items.filter(x => x.part !== !!x.title).length };
  });
  check('micro: the meal total leads with the macros it already showed',
        totPanel.n > 20 && /kcal$/.test(totPanel.kcal.v), JSON.stringify(totPanel.kcal));
  check('micro: only a partial total is marked, and every marked one says what it covers',
        totPanel.marked > 0 && totPanel.mismatch === 0 && totPanel.titled === totPanel.marked,
        JSON.stringify(totPanel));
  check('markdown: preview rendered a table', await page.evaluate(() =>
    document.querySelectorAll('#mdPreview table').length >= 3));

  /* ---- 4. saving a .md file goes through ScuLaFolder ---- */
  const saved = await page.evaluate(async () => {
    const calls = [];
    const real = window.ScuLaFolder.save;
    window.ScuLaFolder.save = async (name, blob) => {
      calls.push({ name, text: await blob.text(), type: blob.type });
      return { saved: true, via: 'folder', name, path: name, message: 'ok' };
    };
    document.getElementById('btnSaveMd').click();
    await new Promise(r => setTimeout(r, 200));
    window.ScuLaFolder.save = real;
    return calls;
  });
  check('save: one call to ScuLaFolder.save', saved.length === 1, JSON.stringify(saved.map(s => s.name)));
  check('save: file named after the day', saved[0] && saved[0].name === 'Ziua-3.md', saved[0] && saved[0].name);
  check('save: markdown blob', saved[0] && saved[0].type === 'text/markdown' && /^# Ziua 3/.test(saved[0].text));

  /* ---- 4b. what the save says has to be readable from the save button ----
     The status line is in card 1. A hundred days is a page ten thousand
     pixels tall, so from the buttons at the foot of card 4 that line is far
     off the top of the screen: the file was written and the page looked like
     it had done nothing. The toast is fixed to the viewport, so the message
     has to reach it too. */
  const told = await page.evaluate(async () => {
    const old = document.getElementById('scula-toast');
    if (old) old.remove();
    const real = window.ScuLaFolder.save;
    let quiet = null;
    // Stands in for save(), reporting the way the real one does: the shared
    // toast speaks unless the caller asked it not to.
    window.ScuLaFolder.save = async (name, blob, opts) => {
      quiet = !!(opts && opts.quiet);
      const r = { saved: true, via: 'folder', name, path: name, message: 'Salvat: ' + name };
      if (!quiet) window.ScuLaFolder.toast(r.message);
      return r;
    };
    document.getElementById('btnSaveMd').click();
    await new Promise(r => setTimeout(r, 300));
    window.ScuLaFolder.save = real;
    const el = document.getElementById('scula-toast');
    return { quiet, toast: el && el.classList.contains('show') ? el.textContent : null,
             status: document.getElementById('statusText').textContent };
  });
  check('save: the toast is not silenced, so the message is visible from the button',
        told.quiet === false, 'quiet was ' + told.quiet);
  check('save: the toast actually carried the message', /Salvat: Ziua-3\.md/.test(told.toast || ''),
        JSON.stringify(told.toast));
  check('save: the status line still says it too', /Salvat: Ziua-3\.md/.test(told.status || ''),
        JSON.stringify(told.status));

  /* ---- 5. the workbook chapter ---- */
  await page.click('#btnWorkbook');
  await page.waitForTimeout(400);
  const wb = await page.evaluate(() => new Promise(res => {
    const r = indexedDB.open('scula-md', 1);
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction(['workbooks', 'chapters'], 'readonly');
      const books = tx.objectStore('workbooks').getAll();
      const chapters = tx.objectStore('chapters').getAll();
      tx.oncomplete = () => { db.close(); res({ books: books.result, chapters: chapters.result }); };
    };
    r.onerror = () => res({ books: [], chapters: [], error: String(r.error) });
  }));
  check('workbook: one workbook created', wb.books.length === 1 && wb.books[0].name === 'Rețete',
        JSON.stringify(wb.books.map(x => x.name)) + (wb.error || ''));
  check('workbook: one chapter per day', wb.chapters.length === 1, JSON.stringify(wb.chapters.map(c => c.title)));
  check('workbook: chapter record matches index.html shape',
        wb.chapters[0] && wb.chapters[0].title === 'Ziua 3' && wb.chapters[0].file === 'Ziua-3.md' &&
        wb.chapters[0].workbookId === wb.books[0].id && /^# Ziua 3/.test(wb.chapters[0].content),
        JSON.stringify(wb.chapters[0] && { t: wb.chapters[0].title, f: wb.chapters[0].file }));

  /* ---- 6. OCR: scanned PDFs, several photos, the engine itself ----
     recipes.html loads the engine from whatever address its field holds, so
     these checks point it at tests/fixtures/fake-tesseract.js and drive the
     whole path — pictures out of the PDF, the canvas prep, the worker, the
     parser — offline and deterministically. */
  const emptyPdf = path.join(tmp, 'empty.pdf');
  fs.writeFileSync(emptyPdf, buildPdf([], { compress: false }));
  await page.setInputFiles('#file', emptyPdf);
  await page.waitForTimeout(300);
  check('pdf with neither text nor pictures: says so',
        /scanat|scanned|poz|pictur/i.test(await page.textContent('#statusText')) &&
        await page.evaluate(() => document.getElementById('status').className === 'err'),
        await page.textContent('#statusText'));

  // A JPEG made by this browser, so no binary fixture is needed for the
  // /DCTDecode branch — the one a real scanner writes.
  const jpeg = Buffer.from(await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300; c.height = 200;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 300, 200);
    x.fillStyle = '#000'; x.fillRect(0, 0, 150, 200);
    return c.toDataURL('image/jpeg', 0.92).split(',')[1];
  }), 'base64');

  const scanned = path.join(tmp, 'scanned.pdf');
  fs.writeFileSync(scanned, buildScanPdf([
    [{ w: 300, h: 200, cs: '/DeviceGray', bpc: 8, filter: '/DCTDecode', data: jpeg }],
    // page 2 draws a logo first: too small to be a page, and skipped
    [{ w: 64, h: 64, cs: '/DeviceGray', bpc: 8, filter: '/FlateDecode',
       data: zlib.deflateSync(greyBar(64, 64)) },
     { w: 400, h: 240, cs: '/DeviceGray', bpc: 8, filter: '/FlateDecode',
       data: zlib.deflateSync(greyBar(400, 240)) }]
  ]));

  // The temp dir is outside the served root, so the bytes go in as base64.
  const imgs = await page.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const list = await window.ScuLaRecipes.PdfText.images(bytes.buffer);
    return list.map(i => ({ kind: i.kind, page: i.page, w: i.width, h: i.height,
                            left: i.rgba ? i.rgba[(120 * i.width + 40) * 4] : null,
                            right: i.rgba ? i.rgba[(120 * i.width + 360) * 4] : null }));
  }, fs.readFileSync(scanned).toString('base64'));

  check('scanned pdf: one picture per page, in page order',
        imgs.length === 2 && imgs[0].page === 1 && imgs[1].page === 2, JSON.stringify(imgs));
  check('scanned pdf: the JPEG page is handed over as JPEG',
        imgs[0] && imgs[0].kind === 'jpeg' && imgs[0].w === 300 && imgs[0].h === 200,
        JSON.stringify(imgs[0]));
  check('scanned pdf: the Flate page is unpacked to pixels, ink on the left',
        imgs[1] && imgs[1].kind === 'raw' && imgs[1].left === 0 && imgs[1].right === 255,
        JSON.stringify(imgs[1]));
  check('scanned pdf: a logo-sized picture is not treated as a page',
        imgs.length === 2 && !imgs.some(i => i.w === 64), JSON.stringify(imgs.map(i => i.w)));

  /* auto off: the page says what it needs instead of fetching anything */
  await page.uncheck('#ocrAuto');
  await page.setInputFiles('#file', scanned);
  await page.waitForTimeout(300);
  check('auto off: a scanned pdf asks for OCR rather than failing silently',
        /OCR/i.test(await page.textContent('#statusText')) &&
        await page.evaluate(() => document.getElementById('ocrBox').open &&
                                  document.getElementById('status').className === 'err'),
        await page.textContent('#statusText'));
  check('the days survived the refusal',
        await page.evaluate(() => window.ScuLaRecipes.model.days.length) === 1);

  /* auto on, engine pointed at the stub */
  await page.check('#ocrAuto');
  // the addresses live behind their own fold, as they should
  await page.evaluate(() => { document.getElementById('ocrAdv').open = true; });
  await page.fill('#ocrUrl', '/tests/fixtures/fake-tesseract.js');
  await page.dispatchEvent('#ocrUrl', 'change');
  await page.click('#btnOcrLoad');
  await page.waitForFunction(() => window.ScuLaRecipes.OCR.worker, null, { timeout: 8000 })
    .catch(() => {});
  check('engine: one worker, built for the languages in the field',
        await page.evaluate(() => window.ScuLaRecipes.OCR.workerLangs) === 'ron+eng',
        await page.evaluate(() => window.ScuLaRecipes.OCR.workerLangs));
  check('engine: the badge says it is ready',
        await page.evaluate(() => document.getElementById('ocrState').className.includes('on')),
        await page.textContent('#ocrState'));
  check('engine: it worked once, so it is prepared at the next visit',
        await page.evaluate(() => document.getElementById('ocrWarm').checked));

  await page.evaluate(() => {
    window.__ocrSeen = [];
    window.__ocrText = ['ZIUA 9\nMic dejun: Omletă\n• 3 ouă\n• Bate ouăle și prăjește-le.',
                        'ZIUA 10\nCina: Supă de legume\n• 200g legume\n• Fierbe legumele.'];
  });
  await page.setInputFiles('#file', scanned);
  await page.waitForFunction(() => window.ScuLaRecipes.model.days.length === 2, null, { timeout: 15000 })
    .catch(() => {});
  const ocrDays = await page.evaluate(() => window.ScuLaRecipes.model.days.map(d => d.n));
  check('scanned pdf: both pages recognised, in order', JSON.stringify(ocrDays) === '[9,10]',
        JSON.stringify(ocrDays));
  check('scanned pdf: the recognised text reached the parser',
        /Omlet/.test(await page.inputValue('#rawText')) &&
        /Sup[ăa] de legume/.test(await page.inputValue('#rawText')),
        (await page.inputValue('#rawText')).slice(0, 120));

  const seen = await page.evaluate(() => window.__ocrSeen);
  check('prep: each page reached the engine upscaled towards 1600px',
        seen.length === 2 && seen[0].w === 900 && seen[0].h === 600 &&
        seen[1].w === 1200 && seen[1].h === 720, JSON.stringify(seen));
  check('prep: the picture survived the greyscale pass, ink still on the left',
        seen.every(x => x.left < 40 && x.right > 215), JSON.stringify(seen));

  /* several photos at once: the normal phone case */
  const png = path.join(tmp, 'shot.png');
  fs.writeFileSync(png, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'));
  const png2 = path.join(tmp, 'shot-2.png');
  fs.copyFileSync(png, png2);
  await page.evaluate(() => {
    window.__ocrText = ['ZIUA 4\nMic dejun: Clătite\n• 2 ouă',
                        'ZIUA 5\nCina: Orez cu pui\n• 80g orez'];
  });
  await page.setInputFiles('#file', [png, png2]);
  // the days from the PDF above are still on screen, so wait for the new ones
  await page.waitForFunction(() => window.ScuLaRecipes.model.days.length === 2 &&
                                   window.ScuLaRecipes.model.days[0].n === 4,
                             null, { timeout: 15000 }).catch(() => {});
  const many = await page.evaluate(() => window.ScuLaRecipes.model.days.map(d => d.n));
  check('several photos at once: the first replaces, the rest append',
        JSON.stringify(many) === '[4,5]', JSON.stringify(many));

  /* changing the languages rebuilds the worker rather than reusing a stale one */
  await page.fill('#ocrLangs', 'eng');
  await page.dispatchEvent('#ocrLangs', 'change');
  await page.evaluate(() => { window.__ocrText = ['ZIUA 6\nBreakfast: Toast\n• 2 slices bread']; });
  await page.setInputFiles('#file', png);
  await page.waitForFunction(() => window.ScuLaRecipes.OCR.workerLangs === 'eng', null, { timeout: 15000 })
    .catch(() => {});
  check('changing the languages terminates the old worker and builds a new one',
        await page.evaluate(() => window.ScuLaRecipes.OCR.workerLangs === 'eng' &&
                                  window.__ocrTerminated >= 1),
        await page.evaluate(() => window.ScuLaRecipes.OCR.workerLangs + ' / terminated ' +
                                  window.__ocrTerminated));
  await page.fill('#ocrLangs', 'ron+eng');
  await page.dispatchEvent('#ocrLangs', 'change');

  /* back to the sample day, so the checks below run on known markdown */
  await page.setInputFiles('#file', plainPdf);
  await page.waitForFunction(() => window.ScuLaRecipes.model.days.length === 1 &&
                                   window.ScuLaRecipes.model.days[0].n === 3,
                             null, { timeout: 8000 }).catch(() => {});

  /* ---- 7. the share route (every phone) ---- */
  const shared = await page.evaluate(async () => {
    const files = [];
    delete window.showDirectoryPicker;
    navigator.canShare = () => true;
    navigator.share = async o => { files.push(...(o.files || []).map(f => ({ name: f.name, size: f.size }))); };
    document.getElementById('btnSaveMd').click();
    await new Promise(r => setTimeout(r, 250));
    return files;
  });
  check('share route: the .md is handed to the OS share sheet',
        shared.length === 1 && shared[0].name === 'Ziua-3.md' && shared[0].size > 100,
        JSON.stringify(shared));

  /* ---- 7b. text inside a Form XObject, one glyph per BT ----
     The shape 100-de-rete-pentru-slabit.pdf is in. Before this the file read
     as completely empty, and the page went looking for pictures to OCR. */
  const formPdf = path.join(tmp, 'glyph-form.pdf');
  fs.writeFileSync(formPdf, buildGlyphFormPdf(SAMPLE.split('\n').map(l => l.replace(/^•\s*/, ''))));
  await page.evaluate(() => { window.ScuLaRecipes.model.days.length = 0; });
  await page.setInputFiles('#file', formPdf);
  await page.waitForFunction(() => window.ScuLaRecipes.model.days.length > 0, null, { timeout: 15000 })
    .catch(() => {});
  const formRaw = await page.inputValue('#rawText');
  check('form xobject: the text inside it was found at all',
        /Terci de ov[ăa]z proteic/.test(formRaw), formRaw.slice(0, 120));
  check('form xobject: one glyph per BT did not become one line per glyph',
        /^ZIUA 3$/m.test(formRaw) && formRaw.split('\n').filter(Boolean).length < 30,
        'lines: ' + formRaw.split('\n').filter(Boolean).length);
  check('form xobject: word gaps became spaces',
        /Mic dejun: Terci de ov[ăa]z proteic/.test(formRaw),
        (formRaw.match(/.*Terci.*/) || [''])[0]);
  check('form xobject: diacritics survived',
        formRaw.includes('ă') && /P[eé]ste alb|Pește alb/.test(formRaw),
        (formRaw.match(/.*alb.*/) || [''])[0]);
  const formDays = await page.evaluate(() => JSON.parse(JSON.stringify(window.ScuLaRecipes.model.days)));
  check('form xobject: parsed to one day of three meals',
        formDays.length === 1 && formDays[0].meals.length === 3,
        JSON.stringify(formDays.map(d => d.meals.length)));

  /* ---- 7c. JPEG 2000 ---- */
  const jp2 = buildJp2(64, 48);
  const grey = await page.evaluate(bytes => {
    const { Jpx } = window.ScuLaRecipes;
    const img = Jpx.toRGBA(Jpx.decode(new Uint8Array(bytes)));
    let min = 255, max = 0;
    for (let i = 0; i < img.rgba.length; i += 4) {
      if (img.rgba[i] < min) min = img.rgba[i];
      if (img.rgba[i] > max) max = img.rgba[i];
    }
    return { w: img.width, h: img.height, min, max, alpha: img.rgba[3] };
  }, Array.from(jp2));
  check('jp2: the box tree and the codestream were walked', grey.w === 64 && grey.h === 48,
        grey.w + 'x' + grey.h);
  check('jp2: empty packets decode to a flat DC-shifted image',
        grey.min === 128 && grey.max === 128 && grey.alpha === 255, JSON.stringify(grey));

  // The entropy-coded path, against the file this work was done for. Skipped
  // rather than failed when the book is not in the tree.
  const book = path.join(ROOT, '100-de-rete-pentru-slabit-fin3-comprimat-ghrsvd.pdf');
  if (fs.existsSync(book)) {
    const pdf = fs.readFileSync(book);
    // Pull one page-sized /JPXDecode stream straight out of the file.
    const re = /<<([^<>]{0,300}?)\/Filter \/JPXDecode([^<>]{0,200}?)>>stream\r\n/g;
    let m, pick = null;
    while ((m = re.exec(pdf.toString('latin1')))) {
      const head = m[0];
      const w = +(/\/Width (\d+)/.exec(head) || [])[1];
      const h = +(/\/Height (\d+)/.exec(head) || [])[1];
      const len = +(/\/Length (\d+)/.exec(head) || [])[1];
      if (w > 600 && h > 600) { pick = { at: m.index + head.length, len, w, h }; break; }
    }
    if (pick) {
      const raw = Array.from(pdf.subarray(pick.at, pick.at + pick.len));
      const real = await page.evaluate(bytes => {
        const { Jpx } = window.ScuLaRecipes;
        const t = performance.now();
        const img = Jpx.toRGBA(Jpx.decode(new Uint8Array(bytes), { luma: true }));
        let sum = 0, min = 255, max = 0;
        for (let i = 0; i < img.rgba.length; i += 4) {
          const v = img.rgba[i];
          sum += v; if (v < min) min = v; if (v > max) max = v;
        }
        return { w: img.width, h: img.height, mean: sum / (img.rgba.length / 4),
                 min, max, ms: Math.round(performance.now() - t) };
      }, raw);
      check('jp2 (real book page): decoded at the size the PDF declares',
            real.w === pick.w && real.h === pick.h,
            `${real.w}x${real.h} vs ${pick.w}x${pick.h}`);
      // A page of a real book is neither blank nor noise: it uses most of the
      // range and is mostly light. A broken EBCOT or DWT fails both.
      check('jp2 (real book page): a real picture came out, not a flat field',
            real.max - real.min > 200 && real.mean > 60 && real.mean < 250,
            JSON.stringify(real));
    } else {
      check('jp2 (real book page): a page-sized JPX stream was found', false, 'none matched');
    }
  } else {
    console.log('SKIP  jp2 (real book page): ' + path.basename(book) + ' is not in the tree');
  }

  /* ---- 7d. the parser rules the book needed ---- */
  const rules = await page.evaluate(() => {
    const P = window.ScuLaRecipes.Recipes;
    const out = {};
    // "Sos:" is a part of the dish, not the next meal of the day.
    out.component = P.parse([
      'ZIUA 1',
      'Prânz: Paste cremoase cu pui',
      '100g paste integrale',
      'Sos: 100g iaurt grecesc 2%',
      'Fierbe pastele. Amestecă sosul.'
    ].join('\n'));
    // A quantity written as a word is still a quantity.
    out.words = P.parse([
      'Cina: Salată',
      'o conservă ton în suc propriu',
      'un ou mare (fiert)',
      'Amestecă totul.'
    ].join('\n'));
    // A book that labels its two halves is believed.
    out.labelled = P.parse([
      'Budincă de couscous',
      'Ingrediente: 50g couscous, 250ml lapte',
      'Mod de preparare: Încălzește laptele, adaugă couscousul.'
    ].join('\n'));
    // Prose above the first day header is front matter, not a menu.
    out.front = P.parse([
      'Bine v-am regăsit, prieteni!',
      'Această carte vă propune o sută de meniuri gândite pentru o zi întreagă.',
      'ZIUA 1',
      'Mic dejun: Omletă',
      '2 ouă mărimea M',
      'Bate ouăle.'
    ].join('\n'));
    // Cedilla s/t are the wrong characters for Romanian and get repaired.
    out.cedilla = P.parse('Prânz: Paste\n250ml sos de roşii (passata)\nFierbe pastele.');
    return JSON.parse(JSON.stringify(out));
  });
  const comp = rules.component[0] && rules.component[0].meals;
  check('parser: a component heading stays inside its meal',
        comp && comp.length === 1 && comp[0].ingredients.length === 2 && comp[0].steps.length === 2,
        JSON.stringify(comp && comp.map(m => [m.label || m.kind, m.ingredients.length, m.steps.length])));
  check('parser: the component names the ingredient group',
        comp && comp[0].ingredients[1].group === 'Sos' && /iaurt grecesc/.test(comp[0].ingredients[1].item),
        JSON.stringify(comp && comp[0].ingredients[1]));
  const words = rules.words[0] && rules.words[0].meals[0];
  check('parser: a word quantity is a quantity, and becomes a digit',
        words && words.ingredients.length === 2 &&
        words.ingredients[0].qty === '1' && words.ingredients[0].unit === 'conservă' &&
        words.ingredients[1].qty === '1' && /ou mare/.test(words.ingredients[1].item),
        JSON.stringify(words && words.ingredients));
  check('parser: a word-quantity line did not land in the method',
        words && words.steps.length === 1 && /^Amestec/.test(words.steps[0]),
        JSON.stringify(words && words.steps));
  const lab = rules.labelled[0] && rules.labelled[0].meals[0];
  check('parser: Ingrediente:/Mod de preparare: headings are believed',
        lab && lab.ingredients.length >= 2 && lab.steps.length >= 1 &&
        /couscous/.test(lab.ingredients[0].item) && /^[ÎI]nc[ăa]lze/.test(lab.steps[0]),
        JSON.stringify(lab && { i: lab.ingredients.map(i => i.item), s: lab.steps }));
  check('parser: front matter is not a day',
        rules.front.length === 1 && rules.front[0].n === 1 &&
        rules.front[0].meals.length === 1 && rules.front[0].meals[0].kind === 'breakfast',
        JSON.stringify(rules.front.map(d => [d.n, d.meals.map(m => m.kind)])));
  check('parser: cedilla s/t are repaired to comma-below',
        rules.cedilla[0] && /roșii/.test(rules.cedilla[0].meals[0].ingredients[0].item),
        JSON.stringify(rules.cedilla[0] && rules.cedilla[0].meals[0].ingredients[0]));

  /* ---- 7e. searching, filtering and arranging a hundred days ---- */
  await page.evaluate(() => {
    const R = window.ScuLaRecipes;
    const days = [];
    for (let i = 1; i <= 40; i++) {
      const d = R.Recipes.newDay(i, '');
      const b = R.Recipes.newMeal('breakfast', '', 'Omletă cu șuncă');
      b.ingredients.push({ qty: '2', unit: '', item: 'ouă', group: '', fdc: '' });
      const l = R.Recipes.newMeal('lunch', '', i === 7 ? 'Paste cu ton' : 'Orez cu pui');
      l.ingredients.push({ qty: '80', unit: 'g', item: i === 7 ? 'ton' : 'orez', group: '', fdc: '' });
      d.meals.push(b, l);
      days.push(d);
    }
    R.model.days = days;
    R.renderDays(); R.renderMarkdown();
  });
  const wall = await page.evaluate(() => ({
    cards: document.querySelectorAll('#days .day').length,
    summaries: document.querySelectorAll('#days .daysum').length,
    open: document.querySelectorAll('#days .dayhead').length
  }));
  check('view: forty days render collapsed, one row each',
        wall.cards === 40 && wall.summaries === 40 && wall.open === 0, JSON.stringify(wall));

  await page.fill('#qBox', 'ton');
  await page.waitForTimeout(150);
  const searched = await page.evaluate(() => ({
    cards: document.querySelectorAll('#days .day').length,
    open: document.querySelectorAll('#days .dayhead').length,
    marks: document.querySelectorAll('#days mark').length
  }));
  check('view: a search narrows the list and opens what is left',
        searched.cards === 1 && searched.open === 1, JSON.stringify(searched));

  await page.fill('#qBox', 'sunca');
  await page.waitForTimeout(150);
  check('view: the search folds diacritics — "sunca" finds "șuncă"',
        await page.evaluate(() => document.querySelectorAll('#days .day').length) === 40);

  // the search reaches into the ingredient list, and a collapsed day says
  // which ingredient matched rather than just the dish name on the button
  await page.fill('#qBox', 'orez');
  await page.waitForTimeout(150);
  const ingSeen = await page.evaluate(() => {
    const hits = [...document.querySelectorAll('#days .daysum .dhit')];
    return { days: document.querySelectorAll('#days .day').length,
             hits: hits.length,
             marked: hits.some(h => h.querySelector('mark') && /orez/i.test(h.textContent)) };
  });
  check('view: a search matches ingredients and the collapsed day shows which',
        ingSeen.days === 39 && ingSeen.hits >= 39 && ingSeen.marked, JSON.stringify(ingSeen));
  await page.fill('#qBox', '');
  await page.waitForTimeout(150);

  // the comma-separated ingredient filter: every term must sit in one meal
  await page.evaluate(() => {
    const R = window.ScuLaRecipes;
    R.model.days[0].meals[1].ingredients.push({ qty: '1', unit: '', item: 'ceapă', group: '', fdc: '' });
    R.renderDays();
  });
  await page.fill('#ingBox', 'orez, ceapa');
  await page.waitForTimeout(150);
  const ingFilter = await page.evaluate(() =>
    document.querySelectorAll('#days .day').length);
  check('filter: a comma-separated ingredient list keeps only meals that have every one',
        ingFilter === 1, JSON.stringify({ days: ingFilter }));
  await page.fill('#ingBox', '');
  await page.waitForTimeout(150);

  await page.fill('#qBox', 'ton');
  await page.waitForTimeout(150);
  const onlyShown = await page.evaluate(() => {
    const box = document.getElementById('optOnlyShown');
    const shownBox = document.getElementById('onlyShownBox');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    const md = document.getElementById('mdText').value;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    return { offered: !shownBox.hidden, days: (md.match(/^# /gm) || []).length,
             meals: (md.match(/^## (?!Total)/gm) || []).length,
             all: (document.getElementById('mdText').value.match(/^# /gm) || []).length };
  });
  check('view: "only the recipes shown" narrows the markdown to the search',
        onlyShown.offered && onlyShown.days === 1 && onlyShown.meals === 1 && onlyShown.all === 40,
        JSON.stringify(onlyShown));

  await page.fill('#qBox', '');
  await page.waitForTimeout(150);
  const chip = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('#kindChips .chip')];
    const lunch = chips.find(c => /Prânz|Lunch/.test(c.textContent));
    lunch.click();
    return { chips: chips.length, days: document.querySelectorAll('#days .day').length };
  });
  await page.waitForTimeout(150);
  const chipMeals = await page.evaluate(() =>
    [...document.querySelectorAll('#days .daysum .dmeal')].length);
  check('view: a meal chip shows only that meal of each day',
        chip.chips === 2 && chip.days === 40 && chipMeals === 40,
        JSON.stringify({ ...chip, chipMeals }));
  await page.evaluate(() => {
    const lunch = [...document.querySelectorAll('#kindChips .chip')]
      .find(c => c.getAttribute('aria-pressed') === 'true');
    if (lunch) lunch.click();
  });
  await page.waitForTimeout(150);

  const arranged = await page.evaluate(() => {
    document.getElementById('btnArrange').click();
    const R = window.ScuLaRecipes;
    return { days: R.model.days.length,
             meals: R.model.days.reduce((a, d) => a + d.meals.length, 0),
             kinds: R.model.days[0].meals.map(m => m.kind).join() };
  });
  check('view: arranging a book that already has days changes nothing',
        arranged.days === 40 && arranged.meals === 80 && arranged.kinds === 'breakfast,lunch',
        JSON.stringify(arranged));

  const flat = await page.evaluate(() => {
    const R = window.ScuLaRecipes;
    const d = R.Recipes.newDay(1, '');
    for (let i = 0; i < 7; i++) d.meals.push(R.Recipes.newMeal('other', '', 'Rețeta ' + (i + 1)));
    R.model.days = [d];
    R.renderDays();
    document.getElementById('btnArrange').click();
    return R.model.days.map(x => x.meals.map(m => m.kind));
  });
  check('view: a flat list of recipes is laid out three to a day, in eating order',
        flat.length === 3 && flat[0].join() === 'breakfast,lunch,dinner' && flat[2].length === 1,
        JSON.stringify(flat));

  /* ---- 7f. reading a .md back, and the page that makes ----
     The markdown of docs/RECIPES.md § C is a contract, and a contract is
     only worth having if it can be read as well as written. So: the page's
     own output goes back in and has to come out identical, a file the
     parser would have guessed at is not mistaken for it, and the one thing
     the .md cannot be — a page laid out to be read — is built from the same
     model and carries nothing it would have to fetch. */
  const trip = await page.evaluate(sample => {
    const R = window.ScuLaRecipes;
    R.model.days = R.Recipes.parse(sample);
    R.model.source = 'plan-de-test.pdf';
    R.renderDays(); R.renderMarkdown();
    const out = R.allMarkdown();
    const back = R.Recipes.fromMarkdown(out);
    R.model.days = back.days;
    R.renderDays(); R.renderMarkdown();
    return { md: out, again: R.allMarkdown(), source: back.source,
             days: back.days.length,
             meals: back.days.reduce((a, d) => a + d.meals.length, 0),
             ings: back.days.reduce((a, d) => a + d.meals.reduce((b, m) => b + m.ingredients.length, 0), 0),
             plainLooksLikeMd: R.Recipes.looksLikeMarkdown(sample),
             ownOutputLooksLikeMd: R.Recipes.looksLikeMarkdown(out) };
  }, SAMPLE);
  const firstDiff = (a, b) => {
    const x = a.split('\n'), y = b.split('\n');
    for (let i = 0; i < Math.max(x.length, y.length); i++)
      if (x[i] !== y[i]) return 'line ' + (i + 1) + ': ' + JSON.stringify(x[i]) + ' vs ' + JSON.stringify(y[i]);
    return '';
  };
  check('md-import: a plain plan is not mistaken for markdown',
        trip.plainLooksLikeMd === false);
  check('md-import: the page\'s own output is recognised as markdown',
        trip.ownOutputLooksLikeMd === true);
  check('md-import: reading it back and writing it out gives the same file',
        trip.md === trip.again, firstDiff(trip.md, trip.again));
  check('md-import: the day, its three meals and every ingredient came back',
        trip.days === 1 && trip.meals === 3 && trip.ings === 12,
        JSON.stringify({ days: trip.days, meals: trip.meals, ings: trip.ings }));
  check('md-import: the file names its own source, and that wins over the file name',
        trip.source === 'plan-de-test.pdf', trip.source);

  // Through the button and the file picker, the way a person does it.
  const mdPath = path.join(tmp, 'plan.md');
  fs.writeFileSync(mdPath, trip.md, 'utf8');
  await page.setInputFiles('#mdFile', mdPath);
  await page.waitForTimeout(400);
  const imported = await page.evaluate(() => ({
    days: window.ScuLaRecipes.model.days.length,
    meals: window.ScuLaRecipes.model.days.reduce((a, d) => a + d.meals.length, 0),
    status: document.getElementById('statusText').textContent,
    source: window.ScuLaRecipes.model.source,
    card: !document.getElementById('htmlCard').hidden
  }));
  check('md-import: the picker route lands one day of three meals',
        imported.days === 1 && imported.meals === 3, JSON.stringify(imported));
  check('md-import: the status line says it read markdown, not that it parsed prose',
        /markdown/i.test(imported.status), imported.status);
  check('md-import: the HTML card appears with the days',
        imported.card === true);

  // The corners: an empty method, a totals stub that is not a meal, an
  // escaped pipe inside a cell, and an English file read by a Romanian page.
  const HAND = [
    '# Day 9', '',
    '*Source: notebook.pdf*', '',
    '## Breakfast: Toast', '',
    '### 1. Ingredients', '',
    '| Amount | Unit | Ingredient | USDA FDC |',
    '| --- | --- | --- | --- |',
    '| 2 |  | slices of bread \\| toasted |  |', '',
    '### 2. Method', '',
    '1. ', '',
    '## Day total', '',
    '| Meal | kcal | Protein (g) | Carbs (g) | Fat (g) |',
    '| --- | --- | --- | --- | --- |',
    '| Breakfast: Toast |  |  |  |  |',
    '| **Total** |  |  |  |  |', ''
  ].join('\n');
  const hand = await page.evaluate(text => {
    const r = window.ScuLaRecipes.Recipes.fromMarkdown(text);
    const d = r.days[0];
    return { days: r.days.length, n: d && d.n, title: d && d.title,
             meals: d && d.meals.length, kind: d && d.meals[0].kind,
             item: d && d.meals[0].ingredients[0].item,
             qty: d && d.meals[0].ingredients[0].qty,
             steps: d && d.meals[0].steps.length, source: r.source };
  }, HAND);
  check('md-import: "## Day total" is a stub, not a fourth meal',
        hand.days === 1 && hand.meals === 1, JSON.stringify(hand));
  check('md-import: an English file is read by a Romanian page',
        hand.kind === 'breakfast' && hand.n === 9 && hand.title === '',
        JSON.stringify(hand));
  check('md-import: a cell\'s escaped pipe comes back as a pipe',
        hand.item === 'slices of bread | toasted', hand.item);
  check('md-import: an empty method comes back empty, not as a step called "1."',
        hand.steps === 0, JSON.stringify(hand));

  /* ---- 7g. the page you can share ---- */
  const doc = await page.evaluate(() => {
    const R = window.ScuLaRecipes;
    // An ingredient that would break out of the page if it were not escaped.
    R.model.days[0].meals[0].ingredients[0].item = '<b>ovăz</b> & "co"';
    R.renderMarkdown();
    return R.buildHtmlDoc();
  });
  check('html: one article per day and one section per meal',
        (doc.match(/<article class="day"/g) || []).length === 1 &&
        (doc.match(/<section class="meal"/g) || []).length === 3,
        JSON.stringify({ days: (doc.match(/<article class="day"/g) || []).length,
                         meals: (doc.match(/<section class="meal"/g) || []).length }));
  check('html: the dish, an ingredient and a step are all on it',
        /Terci de ov[ăa]z proteic/.test(doc) && /unt de arahide/.test(doc) &&
        /Toarn[ăa] apa peste ov[ăa]z/.test(doc), '');
  check('html: an ingredient cannot break out of the page',
        doc.indexOf('&lt;b&gt;ovăz&lt;/b&gt; &amp; &quot;co&quot;') > 0 &&
        doc.indexOf('<b>ovăz</b>') < 0);
  // The file carries exactly one script — the filter bar, and the totals
  // that follow an edited quantity, in the same block — and still nothing
  // to fetch, which is the invariant that makes it openable out of an
  // e-mail on a plane.
  check('html: one script of its own and nothing to fetch',
        (doc.match(/<script/gi) || []).length === 1 && !/\ssrc=/i.test(doc) &&
        !/https?:\/\//i.test(doc) && !/@import/i.test(doc));
  check('html: that one script is both halves — the filter and the totals',
        /getElementById\('filters'\)/.test(doc) && /calcMeal/.test(doc));
  check('html: the filter bar sits under the header, above the contents',
        /<\/header>\s*<div class="filters" id="filters" hidden>/.test(doc) &&
        (doc.indexOf('<details class="toc"') < 0 ||
         doc.indexOf('id="filters"') < doc.indexOf('<details class="toc"')),
        doc.slice(doc.indexOf('</header>'), doc.indexOf('</header>') + 120));
  check('html: a nutrition table under every meal, and one for the day',
        (doc.match(/<table class="nutri">/g) || []).length === 3 &&
        /<table class="nutri dtot">/.test(doc),
        String((doc.match(/<table class="nutri">/g) || []).length));
  check('html: the quantity is a field carrying its own numbers',
        /<input class="qty"[^>]*data-g="[\d.]+"[^>]*data-k="[\d.]+"/.test(doc),
        (doc.match(/<input class="qty"[^>]*>/) || [''])[0]);
  // The other 38 travel as data rather than as markup: a written-out panel
  // per ingredient is 1.5 KB, which on a hundred-day book is two megabytes
  // nobody opens (docs/RECIPES.md § E).
  check('html: the field also carries the sparse 38 per 100 g',
        /<input class="qty"[^>]*data-m="\d+:[\d.]+/.test(doc),
        (doc.match(/data-m="[^"]{0,50}/) || [''])[0]);
  check('html: no panel is written into the file, only the empty row it goes in',
        /<tr class="mrow" data-p="0" hidden><td colspan="7"><div class="micro"><\/div><\/td><\/tr>/.test(doc) &&
        // the only `class="mi"` in the file is the one inside the builder
        !/class="mi"/.test(doc.slice(0, doc.indexOf('<script>'))),
        String((doc.match(/class="mi"/g) || []).length));
  check('html: the carets and both summaries ship hidden, for the script to un-hide',
        /<button class="more"[^>]*\shidden/.test(doc) &&
        /<details class="mtot" hidden>/.test(doc) && /<details class="mtot dtotm" hidden>/.test(doc));

  /* The point of that script, driven in the file it ships in: the page is
     opened on its own, off disk, with nothing else around it. */
  const exported = path.join(tmp, 'exported.html');
  fs.writeFileSync(exported, doc);
  const sheet = await browser.newPage();
  const sheetErrors = [];
  sheet.on('pageerror', e => sheetErrors.push(String(e)));
  sheet.on('console', m => { if (m.type() === 'error') sheetErrors.push(m.text()); });
  await sheet.goto('file://' + exported);
  const live = await sheet.evaluate(() => {
    const read = () => {
      const sec = document.querySelector('section.meal');
      const foot = sec.querySelector('tfoot tr');
      const row = sec.querySelector('tbody tr[data-r="0"]');
      return { rowG: row.querySelector('.g').textContent,
               rowKc: row.querySelector('.kc').textContent,
               mealKc: foot.querySelector('.kc').textContent,
               dayKc: document.querySelector('table.dtot tfoot .kc').textContent };
    };
    const before = read();
    const el = document.querySelector('section.meal input.qty');
    el.value = String(parseFloat(el.value) * 2);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return { before, after: read(), was: el.value };
  });
  // Within one, because both ends are rounded for display and 227.4
  // doubles to 455, not to 454.
  const near = (a, b) => Math.abs(Number(a) - Number(b)) <= 1;
  check('html: doubling a quantity doubles that row',
        Number(live.after.rowG) === Number(live.before.rowG) * 2 &&
        near(live.after.rowKc, Number(live.before.rowKc) * 2),
        JSON.stringify(live));
  check('html: the meal total and the day total both follow',
        near(Number(live.after.mealKc) - Number(live.before.mealKc), live.before.rowKc) &&
        near(Number(live.after.dayKc) - Number(live.before.dayKc), live.before.rowKc),
        JSON.stringify(live));
  /* And the panels, in the file they ship in: built on demand out of the
     data attributes, and following the same edited quantity. */
  const sheetMicro = await sheet.evaluate(() => {
    const un = { carets: document.querySelectorAll('button.more:not([hidden])').length,
                 dets: document.querySelectorAll('details.mtot:not([hidden])').length,
                 built: document.querySelectorAll('.micro .mi').length };
    document.querySelector('section.meal button.more').click();
    const tr = document.querySelector('section.meal tr.mrow');
    const read = () => Array.from(tr.querySelectorAll('.mi')).map(e =>
      e.querySelector('.mn').textContent + '=' + e.querySelector('.mv').textContent);
    const opened = read();
    const el = document.querySelector('section.meal input.qty');
    const was = parseFloat(el.value);
    el.value = String(was / 2);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const halved = read();
    const det = document.querySelector('details.mtot');
    det.open = true;
    det.dispatchEvent(new Event('toggle'));
    const tot = Array.from(det.querySelectorAll('.mi')).map(e => ({
      n: e.querySelector('.mn').textContent, v: e.querySelector('.mv').textContent,
      part: e.querySelector('.mv').classList.contains('part'),
      title: e.querySelector('.mv').title }));
    const day = document.querySelector('details.dtotm');
    day.open = true;
    day.dispatchEvent(new Event('toggle'));
    return { un, hidden: tr.hidden, n: opened.length,
             groups: Array.from(tr.querySelectorAll('p.g')).map(e => e.textContent),
             fe: opened.find(s => /^Fier=/.test(s)),
             feHalf: halved.find(s => /^Fier=/.test(s)),
             totFe: tot.find(x => x.n === 'Fier'),
             marked: tot.filter(x => x.part).length,
             mismatch: tot.filter(x => x.part !== !!x.title).length,
             dayN: day.querySelectorAll('.mi').length };
  });
  check('html: the script un-hides the carets it is the reason for, and builds nothing yet',
        sheetMicro.un.carets >= 3 && sheetMicro.un.dets >= 4 && sheetMicro.un.built === 0,
        JSON.stringify(sheetMicro.un));
  check('html: a caret builds its panel out of the data attributes',
        !sheetMicro.hidden && sheetMicro.n > 20 && sheetMicro.groups.length >= 4 &&
        /^Fier=[\d.]+ mg$/.test(sheetMicro.fe || ''),
        JSON.stringify(sheetMicro.fe) + ' / ' + sheetMicro.n);
  check('html: halving the quantity halves the panel with it',
        Math.abs(parseFloat(sheetMicro.feHalf.split('=')[1]) -
                 parseFloat(sheetMicro.fe.split('=')[1]) / 2) < 0.05,
        sheetMicro.fe + ' -> ' + sheetMicro.feHalf);
  check('html: the meal summary fills on open, marking only what it partly covers',
        parseFloat(sheetMicro.totFe.v) > 0 && sheetMicro.marked > 0 && sheetMicro.mismatch === 0,
        JSON.stringify({ fe: sheetMicro.totFe, marked: sheetMicro.marked }));
  check('html: the day summary adds the meals together',
        sheetMicro.dayN > 20, String(sheetMicro.dayN));

  /* The other half of that script, driven the same way: the filter bar
     under the header. Same rules as card 5 — the search box over the whole
     recipe, the comma-separated box over the ingredient names only, and
     every term has to be present. */
  const shownMeals = () => sheet.evaluate(() =>
    Array.from(document.querySelectorAll('section.meal')).filter(m => m.checkVisibility()).length);
  const typeIn = async (id, v) => { await sheet.fill('#' + id, v); await sheet.waitForTimeout(80); };

  check('html: the bar un-hides itself, so a page with scripting off has no dead box',
        await sheet.evaluate(() => !document.getElementById('filters').hidden));

  await typeIn('ing', 'arahide');
  check('html: one ingredient keeps the recipes that have it',
        await shownMeals() === 1, String(await shownMeals()));
  const why = await sheet.evaluate(() => document.querySelectorAll('ul.ing li.hit').length);
  check('html: the ingredient line that matched is pointed at', why >= 1, String(why));
  check('html: and the count line says what is left',
        /o mas/.test(await sheet.textContent('#found')), await sheet.textContent('#found'));

  await typeIn('ing', 'arahide, banana');
  check('html: several ingredients means the recipes that have all of them',
        await shownMeals() === 1, String(await shownMeals()));

  await typeIn('ing', 'arahide, broccoli');
  const none = await sheet.evaluate(() => ({
    meals: Array.from(document.querySelectorAll('section.meal')).filter(m => m.checkVisibility()).length,
    days: Array.from(document.querySelectorAll('article.day')).filter(d => d.checkVisibility()).length,
    found: document.getElementById('found').textContent }));
  check('html: two ingredients no one recipe has leaves nothing, and it says so',
        none.meals === 0 && none.days === 0 && /Nicio re/.test(none.found), JSON.stringify(none));

  await typeIn('ing', '');
  await typeIn('q', 'broccoli');
  check('html: the search box reaches the method, not just the list',
        await shownMeals() === 1, String(await shownMeals()));

  await typeIn('q', 'ziua 3');
  check('html: a day title keeps every meal on that day',
        await shownMeals() === 3, String(await shownMeals()));

  await typeIn('q', '');
  await sheet.click('.chip[data-kind="dinner"]');
  await sheet.waitForTimeout(80);
  check('html: a chip keeps that kind of meal only',
        await shownMeals() === 1, String(await shownMeals()));

  await sheet.click('#found button');
  await sheet.waitForTimeout(80);
  const back = await sheet.evaluate(() => ({
    meals: Array.from(document.querySelectorAll('section.meal')).filter(m => m.checkVisibility()).length,
    hits: document.querySelectorAll('ul.ing li.hit').length,
    quiet: document.getElementById('found').hidden }));
  check('html: clearing the filters puts every recipe back',
        back.meals === 3 && back.hits === 0 && back.quiet === true, JSON.stringify(back));

  check('html: nothing threw in the exported page', sheetErrors.length === 0, sheetErrors.join('\n'));
  await sheet.close();
  check('html: it is a whole document, in the interface language',
        /^<!doctype html>/.test(doc) && /<html lang="ro">/.test(doc) &&
        /Metoda de preparare/.test(doc));
  check('html: it carries its own print rules, so it can be a paper recipe',
        /@media print/.test(doc) && /@page/.test(doc));

  // Typed, not assigned: the field's own input event is what tells the
  // preview to rebuild, and the check further down compares the two.
  await page.fill('#htmlTitle', 'Rețete de iarnă');
  const savedHtml = await page.evaluate(async () => {
    const calls = [];
    const real = window.ScuLaFolder.save;
    window.ScuLaFolder.save = async (name, blob) => {
      calls.push({ name, type: blob.type, head: (await blob.text()).slice(0, 15) });
      return { saved: true, via: 'folder', name, path: name, message: 'ok' };
    };
    document.getElementById('btnHtmlSave').click();
    await new Promise(r => setTimeout(r, 200));
    window.ScuLaFolder.save = real;
    return calls;
  });
  check('html: the export goes out through ScuLaFolder, like every other save',
        savedHtml.length === 1, JSON.stringify(savedHtml));
  check('html: named after the title, diacritics kept',
        savedHtml[0] && savedHtml[0].name === 'Rețete-de-iarnă.html', savedHtml[0] && savedHtml[0].name);
  check('html: an html blob, not markdown',
        savedHtml[0] && savedHtml[0].type === 'text/html' && /^<!doctype html>/.test(savedHtml[0].head),
        JSON.stringify(savedHtml[0]));

  // What the preview shows has to be the file that gets saved, or the
  // preview is a second renderer to keep in step with the first.
  await page.evaluate(() => { document.getElementById('htmlBox').open = true; });
  await page.waitForTimeout(500);
  const same = await page.evaluate(() =>
    document.getElementById('htmlFrame').getAttribute('srcdoc') === window.ScuLaRecipes.buildHtmlDoc());
  check('html: the preview is the exported file, not a second rendering of it', same === true);

  const gone = await page.evaluate(() => {
    const R = window.ScuLaRecipes;
    R.model.days = []; R.renderDays(); R.renderMarkdown();
    return document.getElementById('htmlCard').hidden;
  });
  check('html: the card goes away when there is nothing to make a page of', gone === true);

  // Put the sample day back so the language checks below still have it.
  await page.evaluate(s => {
    const R = window.ScuLaRecipes;
    R.model.days = R.Recipes.parse(s);
    R.renderDays(); R.renderMarkdown();
  }, SAMPLE);

  /* ---- 8. both languages ---- */
  await page.click('#navLangBtn');
  await page.waitForTimeout(200);
  const en = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    h1: document.querySelector('header.page h1').textContent,
    md: window.ScuLaRecipes.allMarkdown(),
    doc: window.ScuLaRecipes.buildHtmlDoc(),
    nav: document.getElementById('navLangBtn').textContent
  }));
  check('i18n: html lang flips', en.lang === 'en', en.lang);
  check('i18n: heading translated', en.h1 === 'Recipes', en.h1);
  check('i18n: nav toggle now offers RO', en.nav === 'RO', en.nav);
  check('i18n: markdown follows the interface language',
        /^# Day 3/m.test(en.md) && /^### 1\. Ingredients/m.test(en.md) && /^## Breakfast:/m.test(en.md),
        en.md.split('\n').slice(0, 6).join(' / '));
  check('i18n: the shareable page follows the interface language too',
        /<html lang="en">/.test(en.doc) && />Ingredients</.test(en.doc) &&
        />Method</.test(en.doc) && /Day 3/.test(en.doc),
        en.doc.slice(0, 120));
  check('i18n: no cedilla forms in the page',
        await page.evaluate(() => !/[şţ]/.test(document.documentElement.outerHTML)));

  await page.click('#navLangBtn');
  await page.waitForTimeout(150);
  check('i18n: back to Romanian',
        await page.evaluate(() => document.documentElement.lang === 'ro' &&
          document.querySelector('header.page h1').textContent === 'Rețete'));

  /* ---- 9. nothing threw along the way ---- */
  check('no console or page errors', errors.length === 0, errors.join('\n      '));

  await browser.close();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

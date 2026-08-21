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
  check('markdown: ingredient row carries qty, unit and an empty USDA cell',
        /\| 60 \| g \| fulgi de ov[ăa]z fini \|\s*\|/.test(md),
        (md.match(/\|.*fulgi.*\|/) || [''])[0]);
  check('markdown: method is an ordered list', /^1\. Toarn/m.test(md));
  check('markdown: day totals table', /^## Total pe zi/m.test(md) && /\*\*Total\*\*/.test(md));
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
  check('workbook: chapter record matches markdown-editor.html shape',
        wb.chapters[0] && wb.chapters[0].title === 'Ziua 3' && wb.chapters[0].file === 'Ziua-3.md' &&
        wb.chapters[0].workbookId === wb.books[0].id && /^# Ziua 3/.test(wb.chapters[0].content),
        JSON.stringify(wb.chapters[0] && { t: wb.chapters[0].title, f: wb.chapters[0].file }));

  /* ---- 6. the two routes that need OCR say so instead of failing ---- */
  const scanned = path.join(tmp, 'scanned.pdf');
  fs.writeFileSync(scanned, buildPdf([], { compress: false }));
  await page.setInputFiles('#file', scanned);
  await page.waitForTimeout(300);
  check('scanned pdf: told to use OCR',
        /OCR|scanat|scanned/i.test(await page.textContent('#statusText')) &&
        await page.evaluate(() => document.getElementById('ocrBox').open),
        await page.textContent('#statusText'));

  // A 1x1 PNG: enough to take the image branch without an engine loaded.
  const png = path.join(tmp, 'shot.png');
  fs.writeFileSync(png, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'));
  await page.setInputFiles('#file', png);
  await page.waitForTimeout(300);
  check('image without an engine: asks for OCR rather than failing silently',
        /OCR/i.test(await page.textContent('#statusText')) &&
        await page.evaluate(() => document.getElementById('status').className === 'err'),
        await page.textContent('#statusText'));
  check('the days survived both refusals', await page.evaluate(() => window.ScuLaRecipes.model.days.length) === 1);

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

  /* ---- 8. both languages ---- */
  await page.click('#navLangBtn');
  await page.waitForTimeout(200);
  const en = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    h1: document.querySelector('header.page h1').textContent,
    md: window.ScuLaRecipes.allMarkdown(),
    nav: document.getElementById('navLangBtn').textContent
  }));
  check('i18n: html lang flips', en.lang === 'en', en.lang);
  check('i18n: heading translated', en.h1 === 'Recipes', en.h1);
  check('i18n: nav toggle now offers RO', en.nav === 'RO', en.nav);
  check('i18n: markdown follows the interface language',
        /^# Day 3/m.test(en.md) && /^### 1\. Ingredients/m.test(en.md) && /^## Breakfast:/m.test(en.md),
        en.md.split('\n').slice(0, 6).join(' / '));
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

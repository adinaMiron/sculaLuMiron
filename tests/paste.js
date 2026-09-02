// Pasting a picture into index.html (Ctrl+V).
//
// Drives the real app off disk like find.js/graph.js and asserts on the real
// textarea value, the real <img> the preview renders, and the real pixels the
// data: URI decodes back to - see tests/README.md.
//
//   node paste.js            # from tests/
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

// Everything below runs in the page: a picture is drawn on a canvas, turned
// into a File, put on a DataTransfer and dispatched as a real paste event.
const HELPERS = `
  window.__mkImage = async (w, h, opts) => {
    const o = opts || {};
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    if (!o.alpha) { x.fillStyle = '#4a3b2a'; x.fillRect(0, 0, w, h); }
    // Noise, so the encoder cannot compress the big one down to nothing.
    const img = x.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = (i * 7) % 255; img.data[i+1] = (i * 13) % 255; img.data[i+2] = (i * 29) % 255;
      img.data[i+3] = o.alpha ? 128 : 255;
    }
    x.putImageData(img, 0, 0);
    return await new Promise(r => c.toBlob(r, o.type || 'image/png'));
  };
  window.__paste = async (opts) => {
    const o = opts || {};
    const dt = new DataTransfer();
    if (o.blob) dt.items.add(new File([o.blob], o.name || 'clip.png', { type: o.blob.type }));
    if (o.text) dt.setData('text/plain', o.text);
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    document.getElementById('editor').dispatchEvent(ev);
    return ev.defaultPrevented;
  };
  window.__sizeOf = src => new Promise(r => {
    const i = new Image();
    i.onload = () => r({ w: i.naturalWidth, h: i.naturalHeight });
    i.onerror = () => r(null);
    i.src = src;
  });
`;

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text())) return;   // the mammoth CDN, offline
    errors.push('CONSOLE ' + m.text());
  });
  await page.goto(URL);
  await page.waitForTimeout(300);
  await page.evaluate(HELPERS);

  const setDoc = async text => page.evaluate(t => {
    const ed = document.getElementById('editor');
    ed.value = t; ed.focus(); ed.setSelectionRange(t.length, t.length);
    updatePreview(); updateStatus();
  }, text);

  // ---- 1. a small picture goes in as a data: URI ------------------------
  await setDoc('# Notes\n\nBefore ');
  const one = await page.evaluate(async () => {
    const blob = await window.__mkImage(24, 18);
    const prevented = await window.__paste({ blob, name: 'schiță.png' });
    await new Promise(r => setTimeout(r, 200));
    const md = document.getElementById('editor').value;
    const img = document.querySelector('#preview img');
    return { prevented, md, src: img ? img.getAttribute('src') : null, alt: img ? img.alt : null };
  });
  check('the paste is taken over by the editor', one.prevented, one.prevented);
  check('the markdown holds an inline data: URI',
    /!\[schiță\]\(data:image\/png;base64,[A-Za-z0-9+/=]+\)$/.test(one.md.trim()), one.md.slice(0, 80));
  check('what was already typed is kept', /^# Notes\n\nBefore !\[/.test(one.md), one.md.slice(0, 40));
  check('the preview renders it', !!one.src && one.src.startsWith('data:image/png;base64,'), one.src && one.src.slice(0, 40));
  check('the alt text comes from the file name', one.alt === 'schiță', one.alt);

  // The data: URI is the whole point: it must survive the parser both ways.
  const roundtrip = await page.evaluate(md => {
    const html = parseMarkdown(md, { forExport: true });
    const m = html.match(/<img src="([^"]+)"/);
    return { html: html.slice(0, 200), src: m ? m[1] : null };
  }, one.md);
  check('the export keeps the data: URI whole', roundtrip.src === one.src, {
    got: roundtrip.src && roundtrip.src.slice(0, 40), want: one.src && one.src.slice(0, 40) });

  // ---- 2. the picture still decodes to a picture ------------------------
  const decoded = await page.evaluate(src => window.__sizeOf(src), one.src);
  check('and it decodes back to the pasted size', decoded && decoded.w === 24 && decoded.h === 18, decoded);

  // ---- 3. text on the clipboard wins ------------------------------------
  await setDoc('start ');
  const two = await page.evaluate(async () => {
    const blob = await window.__mkImage(20, 20);
    const prevented = await window.__paste({ blob, text: 'plain words' });
    await new Promise(r => setTimeout(r, 200));
    return { prevented, md: document.getElementById('editor').value };
  });
  check('a clipboard carrying text is left to the browser', !two.prevented, two);
  check('and nothing is written behind its back', two.md === 'start ', two.md);

  // ---- 4. a clipboard with neither is left alone -------------------------
  const three = await page.evaluate(() => window.__paste({}));
  check('an empty clipboard is left alone', three === false, three);

  // ---- 5. a big picture is downscaled before it goes in ------------------
  await setDoc('');
  const big = await page.evaluate(async () => {
    const blob = await window.__mkImage(3000, 2000);
    await window.__paste({ blob });
    await new Promise(r => setTimeout(r, 1500));
    const md = document.getElementById('editor').value;
    const src = (md.match(/\(([^)]+)\)/) || [])[1] || '';
    return { srcHead: src.slice(0, 30), bytes: src.length, original: blob.size, size: await window.__sizeOf(src) };
  });
  check('a big paste is re-encoded as JPEG', /^data:image\/jpeg;base64,/.test(big.srcHead), big.srcHead);
  check('its long edge is capped at 1600px',
    big.size && Math.max(big.size.w, big.size.h) === 1600, big.size);
  check('and it is smaller than the original', big.bytes < big.original, { bytes: big.bytes, original: big.original });

  // ---- 6. transparency is not thrown away -------------------------------
  await setDoc('');
  const alpha = await page.evaluate(async () => {
    const blob = await window.__mkImage(2200, 1400, { alpha: true });
    await window.__paste({ blob });
    await new Promise(r => setTimeout(r, 2500));
    const md = document.getElementById('editor').value;
    const src = (md.match(/\(([^)]+)\)/) || [])[1] || '';
    // Read the alpha channel back out of the inserted picture.
    const img = new Image();
    await new Promise(r => { img.onload = r; img.onerror = r; img.src = src; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const a = x.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data[3];
    return { head: src.slice(0, 30), a, w: c.width };
  });
  check('a shrunk picture with transparency stays PNG', /^data:image\/png;base64,/.test(alpha.head), alpha.head);
  check('and its transparency survives', alpha.a > 0 && alpha.a < 255, alpha.a);

  // ---- 7. the pasted picture is what a save would carry -----------------
  const saved = await page.evaluate(() => {
    const md = document.getElementById('editor').value;
    return { inValue: md.includes('data:image/'), words: document.getElementById('stat-words').textContent };
  });
  check('the picture lives in the markdown text itself, so every save carries it', saved.inValue, saved);

  check('no page errors', errors.length === 0, errors);

  await browser.close();
  console.log(failed ? '\n' + failed + ' FAILED' : '\nall good');
  process.exit(failed ? 1 : 0);
})();

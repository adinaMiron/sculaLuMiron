// Google Drive in editor.html — the connect / save-to-Drive button.
//
// Nothing here talks to Google: the two Google scripts are intercepted and
// answered with a stub, which is also how the test proves they are fetched
// lazily (on the click, not on page load) — the whole point of taking the
// gapi <script> back out of the shared nav.
//
// Served over http on a throwaway port, because the interesting states need
// localStorage and Chrome will not give a file:// page one. The file://
// branch is checked too — that is the case the button has to explain rather
// than fail in.
//
//   node drive.js        # from tests/, or /apptest drive
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const ROOT = path.join(__dirname, '..');
const FILE_URL = 'file://' + path.join(ROOT, 'editor.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

function serve() {
  const srv = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'editor.html' : req.url.split('?')[0]);
    fs.readFile(f, (e, b) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      res.end(b);
    });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, port: srv.address().port })));
}

// Answer Google with an empty script, and record who asked for what.
async function stubGoogle(ctx, hits) {
  await ctx.route('**://accounts.google.com/**', route => {
    hits.push('gsi'); route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.__gsi=1;' });
  });
  await ctx.route('**://apis.google.com/**', route => {
    hits.push('gapi'); route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.__gapi=1;' });
  });
}

const btnState = page => page.evaluate(() => {
  const b = document.getElementById('driveBtn');
  return b && { label: b.querySelector('.tlabel').textContent, title: b.title, connected: b.classList.contains('connected') };
});
const toastText = page => page.evaluate(() => {
  const t = document.getElementById('scula-toast');
  return t && t.classList.contains('show') ? t.textContent : null;
});

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const { srv, port } = await serve();
  const BASE = `http://127.0.0.1:${port}/editor.html`;

  // ---- 1. the button exists, in the toolbar and not in the shared nav ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const hits = [];
    await stubGoogle(ctx, hits);
    await page.goto(BASE);
    await page.waitForTimeout(300);

    check('no page errors on load', errors.length === 0, errors);
    check('button lives in #toolbar, not in the nav',
      await page.evaluate(() => !!document.querySelector('#toolbar #driveBtn') && !document.querySelector('#site-nav #driveBtn')));
    check('starts disconnected, Romanian label',
      JSON.stringify(await btnState(page)) === JSON.stringify({ label: 'Drive', title: 'Conectează-te la Google Drive și salvează desenul acolo', connected: false }),
      await btnState(page));
    check('no Google script fetched on page load', hits.length === 0, hits);

    // EN toggle repaints it, even though applyUILang() runs first
    await page.click('#navLangBtn');
    await page.waitForTimeout(150);
    check('English label after the toggle', (await btnState(page)).label === 'Drive'
      && (await btnState(page)).title === 'Connect your Google Drive and save this drawing there', await btnState(page));
    await page.click('#navLangBtn');
    await page.waitForTimeout(150);

    // the click is what fetches Google Identity Services
    await page.click('#driveBtn');
    await page.waitForTimeout(400);
    check('clicking loads gsi/client, lazily', hits.includes('gsi'), hits);
    await ctx.close();
  }

  // ---- 2. a stored token makes it a "save here" button ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await stubGoogle(ctx, []);
    await ctx.addInitScript(() => {
      localStorage.setItem('gdrive_token', 'stub-token');
      localStorage.setItem('gdrive_token_exp', String(Date.now() + 3600e3));
      localStorage.setItem('gdrive_folder', JSON.stringify({ id: 'F1', name: 'Desene' }));
    });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForTimeout(300);
    const st = await btnState(page);
    check('connected label', st.label === 'Salvează în Drive' && st.connected === true, st);
    check('title names the chosen folder', st.title.includes('Desene'), st.title);

    // right-click forgets it, like the folder button next door
    page.on('dialog', d => d.accept());
    await page.click('#driveBtn', { button: 'right' });
    await page.waitForTimeout(200);
    const after = await btnState(page);
    check('right-click disconnects', after.label === 'Drive' && after.connected === false, after);
    check('token and folder cleared from storage',
      await page.evaluate(() => !localStorage.getItem('gdrive_token') && !localStorage.getItem('gdrive_folder')));
    check('and it says so', (await toastText(page) || '').includes('deconectat'), await toastText(page));
    await ctx.close();
  }

  // ---- 3. nothing to save yet, on a connected page ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await stubGoogle(ctx, []);
    await ctx.addInitScript(() => {
      localStorage.setItem('gdrive_token', 'stub-token');
      localStorage.setItem('gdrive_token_exp', String(Date.now() + 3600e3));
      localStorage.setItem('gdrive_folder', JSON.stringify({ id: 'F1', name: 'Desene' }));
    });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForTimeout(300);
    await page.click('#driveBtn');
    await page.waitForTimeout(250);
    check('empty canvas is explained, not uploaded',
      (await toastText(page) || '').includes('nimic de salvat'), await toastText(page));
    await ctx.close();
  }

  // ---- 4. off disk, the button explains why Google cannot work ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const hits = [];
    await stubGoogle(ctx, hits);
    const page = await ctx.newPage();
    await page.goto(FILE_URL);
    await page.waitForTimeout(300);
    await page.click('#driveBtn');
    await page.waitForTimeout(250);
    check('file:// is refused with a reason', (await toastText(page) || '').includes('file://'), await toastText(page));
    check('and no popup is attempted there', hits.length === 0, hits);
    await ctx.close();
  }

  // ---- 5. the upload itself, against a stubbed Drive API ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await stubGoogle(ctx, []);
    const calls = [];
    await ctx.route('**://www.googleapis.com/**', async route => {
      const req = route.request();
      calls.push({ url: req.url(), method: req.method(), body: req.postData() || '' });
      const json = b => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
      if (req.url().includes('/upload/drive/v3/files'))
        return json({ id: 'NEW', name: 'uploaded.png', webViewLink: 'https://drive.google.com/file/d/NEW' });
      if (req.method() === 'POST') return json({ id: 'MADE', name: 'Mazgaleste' });   // folder created
      return json({ files: [] });                                                     // folder not found yet
    });
    await ctx.addInitScript(() => {
      localStorage.setItem('gdrive_token', 'stub-token');
      localStorage.setItem('gdrive_token_exp', String(Date.now() + 3600e3));
    });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForTimeout(300);
    await page.click('#newCanvasBtn');
    await page.click('#newCanvasCreate');
    await page.waitForTimeout(200);
    await page.click('#driveBtn');
    await page.waitForTimeout(600);

    const lookup = calls.find(c => c.url.includes('/drive/v3/files?') && c.method === 'GET');
    const made   = calls.find(c => c.method === 'POST' && c.body.includes('application/vnd.google-apps.folder'));
    const up     = calls.find(c => c.url.includes('/upload/drive/v3/files'));
    check('looks for its own folder first', !!lookup && decodeURIComponent(lookup.url).includes("name='Mazgaleste'"), lookup && lookup.url);
    check('creates it when there is none', !!made);
    check('uploads multipart to the upload endpoint', !!up && up.url.includes('uploadType=multipart'), up && up.url);
    check('and files it under that folder', !!up && up.body.includes('"parents":["MADE"]'), up && up.body.slice(0, 200));
    check('the toast reports the saved name', (await toastText(page) || '').includes('uploaded.png'), await toastText(page));
    check('the folder is remembered for next time',
      await page.evaluate(() => (JSON.parse(localStorage.getItem('gdrive_folder') || '{}')).id === 'MADE'));
    await ctx.close();
  }

  await browser.close();
  srv.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();

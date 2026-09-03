// The "Copiază" button on code blocks in index.html's exported HTML.
//
// A fenced code block renders as a plain <pre><code> in the live preview, but
// the standalone HTML that "Export HTML" writes wraps each one in
// .code-block with a copy button, plus a small inline handler. This drives
// the real page off disk, captures the real export string, then loads that
// string in a second page and clicks the real button, asserting on the
// clipboard.
//
//   node codecopy.js        # from tests/
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    permissions: ['clipboard-read', 'clipboard-write']
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text())) return;
    errors.push('CONSOLE ' + m.text());
  });
  await page.goto(URL);
  await page.waitForTimeout(300);

  // ---- 1. the preview keeps code blocks plain -------------------------------
  const previewHtml = await page.evaluate(() => parseMarkdown('```\nconst a = 1;\n```'));
  check('the live preview renders a bare <pre><code>, no button',
    /<pre><code>/.test(previewHtml) && !/code-copy/.test(previewHtml), previewHtml);

  // ---- 2. the export wraps each block with a button -------------------------
  const exportBody = await page.evaluate(() =>
    parseMarkdown('# Notes\n\n```js\nconst a = 1;\n```\n\ntext\n\n```\nplain\n```', { forExport: true }));
  const blocks = (exportBody.match(/class="code-block"/g) || []).length;
  const btns = (exportBody.match(/class="code-copy"/g) || []).length;
  check('both fenced blocks are wrapped', blocks === 2, { blocks });
  check('each gets its own copy button', btns === 2, { btns });
  check('the language class survives on the <code>', /<code class="language-js">/.test(exportBody), exportBody);

  // ---- 3. capture the whole exported document ------------------------------
  const exported = await page.evaluate(() => {
    return new Promise(resolve => {
      const md = '# Demo\n\n```js\nconsole.log("hi");\nconst x = 42;\n```\n';
      editor.value = md; updatePreview(); updateStatus();
      const orig = window.ScuLaFolder.save;
      window.ScuLaFolder.save = (name, blob) => {
        window.ScuLaFolder.save = orig;
        blob.text().then(resolve);
        return Promise.resolve();
      };
      exportHtml();
    });
  });
  check('the exported document carries the copy-button style',
    /\.code-copy \{/.test(exported), exported.slice(0, 200));
  check('and the inline handler (script tag reassembled, not literal)',
    /querySelectorAll\('\.code-copy'\)/.test(exported) && exported.includes('<' + 'script>'), null);

  // ---- 4. load the export and click the real button ------------------------
  // clipboard needs a real (secure-ish) origin, so serve from a file
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'codecopy-')), 'export.html');
  fs.writeFileSync(tmp, exported);
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errors.push('EXPORT PAGEERROR ' + e.message));
  await p2.goto('file://' + tmp, { waitUntil: 'load' });
  const btn = p2.locator('.code-copy').first();
  check('the button is in the DOM', await btn.count() === 1);
  await btn.click();
  await p2.waitForTimeout(100);
  const clip = await p2.evaluate(() => navigator.clipboard.readText());
  check('clicking it copies the block\'s code verbatim',
    clip === 'console.log("hi");\nconst x = 42;', JSON.stringify(clip));
  const label = await btn.textContent();
  check('and the button flips to a confirmation', /Copiat/.test(label), label);
  await p2.waitForTimeout(1600);
  check('then resets', /Copiază/.test(await btn.textContent()), await btn.textContent());

  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall good');
  process.exit(failed ? 1 : 0);
})();

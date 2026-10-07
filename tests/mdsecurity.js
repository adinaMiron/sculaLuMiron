// Authored Markdown must stay inert after import, Drive pull, and HTML export.
// Run: node tests/mdsecurity.js (bundled Chromium; local server and Drive stubs).
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fakeDrive, stub, serve, DIR } = require('./gdsync.js');

const cases = [
  '<span onmouseover="window.reviewExecuted=1">hover</span>',
  '<SPAN STYLE="color:#123456" OnMouseOver="window.reviewExecuted=1">upper</SPAN>',
  '<span style=font-size:20px onpointerenter="window.reviewExecuted=1">unquoted</span>',
  "<span style='background-color:#fedcba' onclick='window.reviewExecuted=1'>single</span>",
  '<span style="color:#123456" title="quoted style=font-size:99px" onfocus="window.reviewExecuted=1" tabindex="0">extra</span>',
  '<span style="background-image:url(javascript:window.reviewExecuted=1);color:expression(window.reviewExecuted=1);font-size:var(--evil);position:fixed">css</span>',
  '<span style="color:#123456;background-color:#fedcba;font-size:20px;behavior:url(evil.htc)" onmouseover="window.reviewExecuted=1"><span onclick="window.reviewExecuted=1">nested</span></span>',
  '<span onmouseover="window.reviewExecuted=1" title="&quot;">entity</span>',
  '[script](javascript:window.reviewExecuted=1)',
  '[control](java\tscript:window.reviewExecuted=1)',
  '[vbscript](vbscript:window.reviewExecuted=1)',
  '[data](data:text/html,evil)',
  '[quotes](#" onmouseover="window.reviewExecuted=1)',
  '![alt" onerror="window.reviewExecuted=1](missing.png)',
  '![unsafe](javascript:evil.png)',
  '![data](data:text/html;base64,AAAA)',
  '![[javascript:evil.png]]',
  'javascript:evil.png',
  '<img src=x onerror="window.reviewExecuted=1">'
];
const content = cases.join('\n\n');

// Inspect DOM attributes and fire harmless local events, including the review's
// mouseover proof. This works on both the editor preview and the exported body.
async function verify(page, selector) {
  const result = await page.evaluate(selector => {
    const root = document.querySelector(selector);
    const bad = [];
    for (const element of root.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        if (/^on/i.test(attribute.name)) bad.push(attribute.name);
        if (/^(href|src)$/i.test(attribute.name)) {
          const value = attribute.value.replace(/[\u0000-\u0020\u007f]/g, '');
          const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1].toLowerCase();
          const allowed = attribute.name === 'href' ? ['http', 'https', 'mailto', 'tel'] : ['http', 'https', 'blob'];
          const raster = attribute.name === 'src' && /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon);base64,/i.test(value);
          if (scheme && !allowed.includes(scheme) && !raster) bad.push(attribute.value);
        }
      }
      if (element.tagName === 'SPAN') {
        if ([...element.attributes].some(a => a.name !== 'style')) bad.push(element.outerHTML);
        for (const property of element.style) {
          if (!['color', 'background-color', 'font-size'].includes(property)) bad.push(property);
        }
      }
      for (const event of ['mouseover', 'pointerenter', 'click', 'focus', 'error']) {
        element.dispatchEvent(new Event(event));
      }
    }
    const formatted = [...root.querySelectorAll('span')].find(el => el.textContent === 'nested' && !el.children.length);
    const styles = formatted && getComputedStyle(formatted);
    return { bad, executed: window.reviewExecuted || 0,
      text: root.textContent, nested: styles && [styles.color, styles.backgroundColor, styles.fontSize],
      css: [...root.querySelectorAll('span')].find(el => el.textContent === 'css')?.getAttribute('style') };
  }, selector);
  assert.deepEqual(result.bad, []);
  assert.equal(result.executed, 0, 'authored content must never execute');
  assert.equal(result.css, null, 'unsupported or unsafe CSS is discarded');
  // The background is on the outer span; colors and font size inherit.
  assert.deepEqual(result.nested, ['rgb(18, 52, 86)', 'rgba(0, 0, 0, 0)', '20px']);
  assert.ok(result.text.includes('hover'));
}

(async () => {
  const { srv, port } = await serve();
  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext();
    await context.route(/^https?:/, route => new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/index.html`);
    await page.waitForFunction(() => wbDraftReady);
    await page.waitForTimeout(1500);

    await page.locator('#file-input').setInputFiles({ name: 'untrusted.md', mimeType: 'text/markdown', buffer: Buffer.from(content) });
    await page.waitForFunction(content => editor.value === content, content);
    await verify(page, '#preview');
    await page.locator('#preview span').filter({ hasText: /^hover$/ }).hover();
    assert.equal(await page.evaluate(() => window.reviewExecuted || 0), 0);
    assert.equal(await page.inputValue('#editor'), content, 'sanitizing rendering preserves authored Markdown');
    console.log('PASS malicious Markdown imported through the real file input remains inert');

    // Exercise the actual export, including loading its saved HTML as a page.
    const html = await page.evaluate(async () => {
      let output;
      const original = ScuLaFolder.save;
      ScuLaFolder.save = (name, blob) => { output = blob; };
      try { exportHtml(); } finally { ScuLaFolder.save = original; }
      return output.text();
    });
    const exported = await context.newPage();
    exported.on('pageerror', error => errors.push(error.message));
    await exported.setContent(html);
    await verify(exported, 'body');
    console.log('PASS saved HTML export remains inert and preserves allowed nested formatting');

    const book = { id: 'security-book', name: 'Security', folder: 'Security', created: 1000, updated: 1000, order: 0 };
    const chapter = { id: 'security-chapter', workbookId: book.id, title: 'Untrusted', file: 'untrusted.md', created: 1000, updated: 9000, order: 0, driveId: 'remote' };
    const drive = fakeDrive([
      { id: 'root', name: 'Scula Markdown', mimeType: DIR, parents: [] },
      { id: 'dir', name: book.folder, mimeType: DIR, parents: ['root'] },
      { id: 'manifest', name: 'index.json', parents: ['root'], body: JSON.stringify({ v: 1, books: [{ ...book, driveId: 'dir' }], chapters: [chapter], deleted: {} }) },
      { id: 'remote', name: chapter.file, parents: ['dir'], body: content }
    ]);
    await stub(context, drive);
    const sync = await page.evaluate(async ({ book, chapter }) => {
      wbBooks = [book];
      wbChapters = [{ ...chapter, updated: 2000, content: 'ORIGINAL' }];
      await wbPut(WB_BOOKS, book);
      await wbPut(WB_CHAPTERS, wbChapters[0]);
      loadChapterIntoEditor(wbChapters[0]);
      gsToken = 'stub-token'; gsTokenExp = Date.now() + 3600e3;
      return cloudSync(true);
    }, { book, chapter });
    assert.equal(sync.down, 1);
    assert.equal(await page.inputValue('#editor'), content);
    await verify(page, '#preview');
    console.log('PASS malicious Markdown downloaded through stubbed Drive sync remains inert');

    // Positive URL compatibility, including embedded raster images and export paths.
    const urls = await page.evaluate(() => [false, true].map(forExport => {
      const html = parseMarkdown('[web](https://example.invalid/?a=1&b=2) [mail](mailto:a@example.invalid) [local](#heading) ![image](images/photo.png) ![raster](data:image/png;base64,AAAA)', { forExport });
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return [...doc.querySelectorAll('[href], [src]')].map(el => el.getAttribute('href') ?? el.getAttribute('src'));
    }));
    for (let i = 0; i < 2; i++) assert.deepEqual(urls[i], [
      'https://example.invalid/?a=1&b=2', 'mailto:a@example.invalid', '#heading',
      (i ? 'public/images/' : '') + 'images/photo.png', 'data:image/png;base64,AAAA'
    ]);
    assert.deepEqual(errors, []);
    console.log('PASS safe links, relative export images and pasted raster data URLs are preserved');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => srv.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

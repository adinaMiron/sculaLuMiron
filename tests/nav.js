// Navigation panel in index.html: clicking a heading takes both
// panes to it - the preview by the heading's id, the Markdown source by the
// line it was read from. On a phone, navigation preserves the active tab:
// Source selects and focuses the line; Preview scrolls without moving the caret.
//
// Drives the real app off disk, like find.js and graph.js, and asserts on the
// real textarea selection, the real scroll offsets and the real preview
// element that gets flashed - see tests/README.md.
//
//   node nav.js             # from tests/
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

// Long enough that both panes have to scroll, with a heading at the bottom,
// a repeated heading (two slugs, two lines) and one that only looks like a
// heading because it sits inside a fence.
const filler = n => {
  const out = [];
  for (let i = 0; i < n; i++) out.push('Rând ' + i + ' — ' + 'text lung care se rupe pe mai multe rânduri. '.repeat(3));
  return out.join('\n');
};
const DOC = [
  '# Mecanică',
  '',
  filler(12),
  '',
  '## Inerție',
  '',
  filler(12),
  '',
  '```',
  '# nu este titlu, este cod',
  '```',
  '',
  '## Inerție',            // same text again: its own slug, its own line
  '',
  filler(30),
  '',
  '### Forța de frecare',  // the one at the bottom of both panes
  '',
  'Ultimul rând.',
  ''
].join('\n');

// Wait for the actual destination, including the scroll limit for a heading
// near the document's end. A timer can sample a smooth scroll still in flight.
async function settlePreview(page, id) {
  await page.waitForFunction(id => {
    const pv = document.getElementById('preview');
    const heading = document.getElementById(id);
    const destination = Math.max(0, Math.min(pv.scrollHeight - pv.clientHeight,
      pv.scrollTop + heading.getBoundingClientRect().top - pv.getBoundingClientRect().top));
    return Math.abs(pv.scrollTop - destination) < 2;
  }, id, { timeout: 3000 });
}

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route(/^https?:/, route => route.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  // The mammoth.js CDN tag (docx import) cannot load in an offline sandbox;
  // that is the environment, not the app.
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text())) return;
    errors.push('CONSOLE ' + m.text());
  });
  await page.goto(URL);
  await page.waitForFunction(() => wbDraftReady);
  await page.waitForTimeout(1350); // documented delayed browser-restoration pass

  await page.evaluate(doc => {
    const ed = document.getElementById('editor');
    ed.value = doc;
    updatePreview();
    updateStatus();
  }, DOC);
  if (await page.locator('#nav-panel').evaluate(el => el.classList.contains('collapsed'))) {
    await page.locator('#btn-nav').click();
  }

  // What the panel made of the source.
  const listed = await page.evaluate(() => ({
    items: Array.from(document.querySelectorAll('#nav-tree .nav-item')).map(n => n.title),
    levels: Array.from(document.querySelectorAll('#nav-tree .nav-item')).map(n => n.className)
  }));
  check('every heading is listed',
    listed.items.join('|') === 'Mecanică|Inerție|Inerție|Forța de frecare', listed.items);
  check('a "#" inside a fence is not one', listed.items.length === 4, listed.items);

  // Clicking one: preview by id, source by line.
  const clickNth = async n => {
    await page.locator('#nav-tree .nav-item').nth(n).click();
    const id = ['mecanică', 'inerție', 'inerție-1', 'forța-de-frecare'][n];
    // The flash is transient and can finish before a long smooth scroll.
    // A previous target may still be flashing during a subsequent click.
    const flashed = await page.evaluate(id => {
      const heading = document.getElementById(id);
      return heading.classList.contains('md-target') ? heading.id : '';
    }, id);
    await settlePreview(page, id);
    return page.evaluate(flashed => {
      const ed = document.getElementById('editor');
      const pv = document.getElementById('preview');
      return {
        picked: ed.value.slice(ed.selectionStart, ed.selectionEnd),
        start: ed.selectionStart,
        focused: document.activeElement === ed,
        edTop: ed.scrollTop,
        edMax: ed.scrollHeight - ed.clientHeight,
        pvTop: pv.scrollTop,
        pvMax: pv.scrollHeight - pv.clientHeight,
        flashed,
        active: (document.querySelector('#nav-tree .nav-item.active') || {}).title || ''
      };
    }, flashed);
  };

  const last = await clickNth(3);
  check('the source jumps to the heading and selects it',
    last.picked === '### Forța de frecare' && last.focused, last);
  check('and scrolls the textarea down to it', last.edTop > last.edMax * 0.5, last);
  check('the preview still jumps to the same heading',
    last.flashed === 'forța-de-frecare' && last.pvTop > last.pvMax * 0.5, last);
  check('the clicked item is the active one', last.active === 'Forța de frecare', last);

  const top = await clickNth(0);
  check('clicking back up takes the source with it',
    top.start === 0 && top.picked === '# Mecanică' && top.edTop === 0, top);
  // The first heading sits at the very top, under its own margin.
  check('and the preview too', top.flashed === 'mecanică' && top.pvTop < 200, top);

  // Two headings with the same text: the second is a different line and a
  // different slug, and the source has to follow the one that was clicked.
  const first = await clickNth(1);
  const second = await clickNth(2);
  check('a repeated heading goes to its own line in the source',
    second.start > first.start && second.picked === '## Inerție', { first: first.start, second: second.start });
  check('and to its own anchor in the preview',
    first.flashed === 'inerție' && second.flashed === 'inerție-1', { first: first.flashed, second: second.flashed });

  // On a phone only one pane is visible. Navigation stays on that tab.
  const phone = await ctx.newPage();
  phone.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await phone.setViewportSize({ width: 390, height: 780 });
  await phone.goto(URL);
  await phone.waitForFunction(() => wbDraftReady);
  await phone.waitForTimeout(1350); // documented delayed browser-restoration pass
  await phone.locator('#editor').fill(DOC);
  await phone.locator('#editor').evaluate(ed => ed.setSelectionRange(0, 0));
  await phone.locator('#btn-nav').click();
  await phone.locator('#nav-tree .nav-item').last().click();
  const phoneState = () => phone.evaluate(() => {
    const ed = document.getElementById('editor');
    return {
      start: ed.selectionStart,
      end: ed.selectionEnd,
      picked: ed.value.slice(ed.selectionStart, ed.selectionEnd),
      edTop: ed.scrollTop,
      edMax: ed.scrollHeight - ed.clientHeight,
      focused: document.activeElement === ed,
      view: document.body.className,
      closed: document.getElementById('nav-panel').classList.contains('collapsed'),
      flashed: (document.querySelector('#preview .md-target') || {}).id || ''
    };
  });
  const onSource = await phoneState();
  check('on a phone Source stays visible and the navigation panel closes',
    /view-source/.test(onSource.view) && onSource.closed && onSource.flashed === '', onSource);
  check('Source selects, focuses and scrolls to the clicked heading',
    onSource.picked === '### Forța de frecare' && onSource.focused && onSource.edTop > onSource.edMax * 0.5, onSource);

  await phone.locator('#tab-preview').click();
  const beforePreview = await phoneState();
  await phone.locator('#btn-nav').click();
  await phone.locator('#nav-tree .nav-item').last().click();
  const previewFlash = (await phoneState()).flashed;
  await settlePreview(phone, 'forța-de-frecare');
  const onPreview = await phoneState();
  check('on a phone Preview stays visible, reaches the heading and closes navigation',
    /view-preview/.test(onPreview.view) && onPreview.closed && previewFlash === 'forța-de-frecare', { ...onPreview, previewFlash });
  check('Preview leaves the source selection and focus alone',
    onPreview.start === beforePreview.start && onPreview.end === beforePreview.end && !onPreview.focused, onPreview);

  check('no page errors', errors.length === 0, errors);

  await browser.close();
  console.log(failed ? '\n' + failed + ' FAILED' : '\nall good');
  process.exit(failed ? 1 : 0);
})();

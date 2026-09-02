// Navigation panel in index.html: clicking a heading takes both
// panes to it - the preview by the heading's id, the Markdown source by the
// line it was read from.
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

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
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
  await page.waitForTimeout(300);

  await page.evaluate(doc => {
    const ed = document.getElementById('editor');
    ed.value = doc;
    updatePreview();
    updateStatus();
    if (document.getElementById('nav-panel').classList.contains('collapsed')) toggleNav();
  }, DOC);
  await page.waitForTimeout(200);

  // What the panel made of the source.
  const listed = await page.evaluate(() => ({
    items: Array.from(document.querySelectorAll('#nav-tree .nav-item')).map(n => n.title),
    levels: Array.from(document.querySelectorAll('#nav-tree .nav-item')).map(n => n.className)
  }));
  check('every heading is listed',
    listed.items.join('|') === 'Mecanică|Inerție|Inerție|Forța de frecare', listed.items);
  check('a "#" inside a fence is not one', listed.items.length === 4, listed.items);

  // Clicking one: preview by id, source by line.
  const clickNth = n => page.evaluate(async i => {
    const ed = document.getElementById('editor');
    const pv = document.getElementById('preview');
    document.querySelectorAll('#nav-tree .nav-item')[i].click();
    await new Promise(r => setTimeout(r, 700));   // the preview scrolls smoothly
    return {
      picked: ed.value.slice(ed.selectionStart, ed.selectionEnd),
      start: ed.selectionStart,
      focused: document.activeElement === ed,
      edTop: ed.scrollTop,
      edMax: ed.scrollHeight - ed.clientHeight,
      pvTop: pv.scrollTop,
      pvMax: pv.scrollHeight - pv.clientHeight,
      flashed: (pv.querySelector('.md-target') || {}).id || '',
      active: (document.querySelector('#nav-tree .nav-item.active') || {}).title || ''
    };
  }, n);

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

  // On a phone only one pane is on screen; the preview is what a nav click
  // asks for, so the source is deliberately left where it was.
  const phone = await ctx.newPage();
  phone.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await phone.setViewportSize({ width: 390, height: 780 });
  await phone.goto(URL);
  await phone.waitForTimeout(300);
  const onPhone = await phone.evaluate(async doc => {
    const ed = document.getElementById('editor');
    ed.value = doc;
    updatePreview();
    if (document.getElementById('nav-panel').classList.contains('collapsed')) toggleNav();
    ed.setSelectionRange(0, 0);
    await new Promise(r => setTimeout(r, 100));
    document.querySelectorAll('#nav-tree .nav-item')[3].click();
    await new Promise(r => setTimeout(r, 400));
    return {
      start: ed.selectionStart,
      focused: document.activeElement === ed,
      view: document.body.className,
      flashed: (document.querySelector('#preview .md-target') || {}).id || ''
    };
  }, DOC);
  check('on a phone the click shows the preview', /view-preview/.test(onPhone.view) && onPhone.flashed === 'forța-de-frecare', onPhone);
  check('and leaves the source (and the keyboard) alone',
    onPhone.start === 0 && !onPhone.focused, onPhone);

  check('no page errors', errors.length === 0, errors);

  await browser.close();
  console.log(failed ? '\n' + failed + ' FAILED' : '\nall good');
  process.exit(failed ? 1 : 0);
})();

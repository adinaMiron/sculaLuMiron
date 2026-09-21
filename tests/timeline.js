// The timeline in index.html — "#1969 - !Primul om pe Lună".
//
// Three characters: "#" opens the date, "!" opens what happened, and the "-"
// between them ties the two. A run of those lines is one block — an <svg>
// drawing with a dot per entry, and the list under it. Drives the real page
// off disk and asserts on the real preview DOM, the real geometry of the
// drawing, and the real export string.
//
//   node timeline.js        # from tests/
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

async function write(page, md) {
  await page.evaluate(md => { editor.value = md; updatePreview(); updateStatus(); }, md);
}

// What the preview made of it: one entry per <li>, plus the dots of the svg.
const readTimeline = page => page.evaluate(() => {
  const tl = preview.querySelector('.md-timeline');
  if (!tl) return null;
  const svg = tl.querySelector('svg.tl-svg');
  const box = svg.getBoundingClientRect();
  return {
    // the x of a dot is a percentage, so what is asserted is where it really
    // landed: its centre, in pixels from the left edge of the drawing
    width: Math.round(box.width),
    height: Math.round(box.height),
    aria: svg.getAttribute('aria-label'),
    dots: Array.from(svg.querySelectorAll('circle.tl-dot')).map(c => {
      const r = c.getBoundingClientRect();
      return Math.round((r.x + r.width / 2 - box.x) * 10) / 10;
    }),
    idx: Array.from(svg.querySelectorAll('text.tl-idx')).map(t => t.textContent),
    dates: Array.from(svg.querySelectorAll('text.tl-date')).map(t => t.textContent),
    tips: Array.from(svg.querySelectorAll('title')).map(t => t.textContent),
    when: Array.from(tl.querySelectorAll('.tl-when')).map(e => e.textContent),
    what: Array.from(tl.querySelectorAll('.tl-what')).map(e => e.innerHTML.trim())
  };
});

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
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

  // ---- 1. three lines are one timeline ----------------------------------
  await write(page, [
    '#1969 - !Primul om pe Lună',
    '#2000-01 - !Trecerea în mileniu',
    '#2026-09-21 - !Azi'
  ].join('\n'));
  let t = await readTimeline(page);
  check('three lines make one block', !!t && t.when.length === 3, t && t.when);
  check('one block only', await page.evaluate(() => preview.querySelectorAll('.md-timeline').length) === 1);
  check('the dates are kept as written', !!t && t.when.join('|') === '1969|2000-01|2026-09-21', t && t.when);
  check('the text is the entry, without its "!" marker',
    !!t && t.what[0] === 'Primul om pe Lună', t && t.what);
  check('the drawing fills the width of the block and keeps its own height',
    !!t && t.height === 98 && t.width > 200, t && { w: t.width, h: t.height });
  check('with a dot per entry, numbered 1..n', !!t && t.idx.join('') === '123', t && t.idx);
  check('and a tooltip naming the entry',
    !!t && t.tips[0] === '1969 — Primul om pe Lună', t && t.tips);
  check('the aria-label spans the first date to the last',
    !!t && t.aria === '1969 – 2026-09-21', t && t.aria);
  check('diacritics survive into the drawing and the list',
    !!t && /Lună/.test(t.tips[0]) && /Lună/.test(t.what[0]), t && t.tips[0]);

  // ---- 2. a dot sits where its date falls -------------------------------
  // 1969 … 2026: the year 2000 is ~54% of the way along, so the middle dot
  // is nowhere near the middle of the three.
  const frac = (t.dots[1] - t.dots[0]) / (t.dots[2] - t.dots[0]);
  check('the middle dot is placed by its date, not by its turn',
    frac > 0.50 && frac < 0.58, { frac, dots: t.dots });
  check('the first and the last sit at 5% and 95% of the drawing',
    Math.abs(t.dots[0] / t.width - 0.05) < 0.01 && Math.abs(t.dots[2] / t.width - 0.95) < 0.01,
    { dots: t.dots, width: t.width });

  // ---- 3. the three shapes an entry can hold ----------------------------
  await write(page, [
    '#2020 - !text simplu cu **aldine**',
    '#2021 - ![Apollo 11](https://nasa.gov/apollo)',
    '#2022 - ![lună](luna.png)'
  ].join('\n'));
  t = await readTimeline(page);
  check('bold inside an entry is still bold', /<strong>aldine<\/strong>/.test(t.what[0]), t.what[0]);
  check('"![…](…)" pointing at a page is a link',
    /^<a href="https:\/\/nasa\.gov\/apollo"/.test(t.what[1]) && !/<img/.test(t.what[1]), t.what[1]);
  check('"![…](…)" pointing at a picture is an image',
    /^<img src="luna\.png"/.test(t.what[2]) && /alt="lună"/.test(t.what[2]), t.what[2]);

  // ---- 4. what must NOT become a timeline -------------------------------
  await write(page, [
    '# Un titlu obișnuit',
    '#etichetă și #2026 într-o propoziție - fără marcaj',
    '#4F8A97 e o culoare',
    'stres -> insomnie'
  ].join('\n'));
  const none = await page.evaluate(() => ({
    blocks: preview.querySelectorAll('.md-timeline').length,
    h1: !!preview.querySelector('h1'),
    tag: !!preview.querySelector('.md-tag'),
    colour: !!preview.querySelector('.md-color-sw'),
    causal: !!preview.querySelector('.md-causal')
  }));
  check('a heading, a #tag, a #rrggbb colour and a causal line are left alone',
    none.blocks === 0 && none.h1 && none.tag && none.colour && none.causal, none);

  // ---- 5. a blank line between two entries keeps them together ----------
  await write(page, '#1900 - !unu\n\n#1950 - !doi\n\ntext de după\n\n#1980 - !trei');
  const split = await page.evaluate(() => Array.from(preview.querySelectorAll('.md-timeline'))
    .map(b => b.querySelectorAll('.tl-item').length));
  check('a blank line inside a run does not break it, a paragraph does',
    split.join(',') === '2,1', split);

  // ---- 6. a timeline ends where the next block starts -------------------
  await write(page, '#1900 - !unu\n| a | b |\n| --- | --- |\n| 1 | 2 |');
  const order = await page.evaluate(() => Array.from(preview.children).map(e => e.tagName + (e.className ? '.' + e.className : '')));
  check('a table right after an entry closes the timeline first',
    order[0] === 'DIV.md-timeline' && order[1] === 'TABLE', order);

  await write(page, '#1900 - !unu\n```\n#1901 - !nu\n```');
  const fenced = await page.evaluate(() => ({
    blocks: preview.querySelectorAll('.md-timeline').length,
    items: preview.querySelectorAll('.tl-item').length,
    code: (preview.querySelector('pre code') || {}).textContent
  }));
  check('a fenced block closes it too, and mints nothing inside the fence',
    fenced.blocks === 1 && fenced.items === 1 && /#1901/.test(fenced.code), fenced);

  // ---- 7. two entries on the same day still read as two -----------------
  await write(page, '#2026-09-21 - !dimineața\n#2026-09-21 - !seara');
  t = await readTimeline(page);
  check('two entries on one day are two dots, not one',
    t.dots.length === 2 && t.dots[1] - t.dots[0] >= 18, t.dots);
  await write(page, '#2026 - !singur');
  const single = await readTimeline(page);
  check('a single entry sits in the middle',
    Math.abs(single.dots[0] / single.width - 0.5) < 0.01, single.dots);

  // ---- 8. [[links]] and #tags inside an entry still work ----------------
  await write(page, '#2026 - !vezi [[Notiță]] și #proiect');
  const inside = await page.evaluate(() => ({
    wiki: !!preview.querySelector('.tl-what .wikilink'),
    tag: (preview.querySelector('.tl-what .md-tag') || {}).textContent
  }));
  check('a [[link]] and a #tag inside an entry are still a link and a tag',
    inside.wiki && /proiect/.test(inside.tag || ''), inside);

  // ---- 9. the toolbar button writes a timeline --------------------------
  await write(page, '');
  await page.click('button[data-i="timelineBtn"]');
  await page.waitForTimeout(150);
  const seeded = await page.evaluate(() => ({
    src: editor.value,
    items: preview.querySelectorAll('.tl-item').length
  }));
  check('the ⏳ button writes three entries that render as one timeline',
    seeded.items === 3 && /^\n#\d{4} - !/.test(seeded.src), seeded);

  // ---- 10. both languages ------------------------------------------------
  const roLabel = await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'ro' }));
    return document.querySelector('button[data-i="timelineBtn"]').textContent;
  });
  const enLabel = await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'en' }));
    return document.querySelector('button[data-i="timelineBtn"]').textContent;
  });
  check('the button is Cronologie in Romanian and Timeline in English',
    /Cronologie/.test(roLabel) && /Timeline/.test(enLabel), { roLabel, enLabel });

  // ---- 11. the export carries the same drawing --------------------------
  const exported = await page.evaluate(() => parseMarkdown(
    '#1969 - !Primul om pe Lună\n#2026-09-21 - ![lună](luna.png)', { forExport: true }));
  check('the export ships the svg and the list',
    /<div class="md-timeline">/.test(exported) && /<svg class="tl-svg"/.test(exported)
    && (exported.match(/class="tl-item"/g) || []).length === 2, exported.slice(0, 120));
  check('and the image path is rewritten for the exported page',
    /<img src="public\/images\/luna\.png"/.test(exported), exported);

  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall good');
  process.exit(failed ? 1 : 0);
})();

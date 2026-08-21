// Knowledge graph + wikilinks in markdown-editor.html.
//
// The only script in this folder that drives markdown-editor.html rather
// than editor.html, so it opens its own page instead of using lib.js's
// open(). Same rules otherwise: real app off disk, real pixels
// (getImageData on the graph canvas), no screenshots - see tests/README.md.
//
//   node graph.js            # from tests/
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'markdown-editor.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const NOTE = [
  '# Mechanics',
  '',
  'Everything here starts from [[#Inertia]] and ends at [[#Force]]. #physics',
  '',
  '## Inertia',
  '',
  'A body keeps its state of motion. ^inertia-law',
  '',
  'See also [[#Force]] and [[Optics]]. #physics #laws',
  '',
  '## Force',
  '',
  'Force is what changes [[#Inertia|inertia]]. Compare [[#^inertia-law]].',
  '',
  '```',
  'not a #tag and not a [[link]]',
  '```',
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

  // ---- 1. the parser -----------------------------------------------------
  await page.evaluate(md => {
    document.getElementById('editor').value = md;
    updatePreview(); updateStatus();
  }, NOTE);
  await page.waitForTimeout(120);

  const parsed = await page.evaluate(() => ({
    wikilinks: document.querySelectorAll('#preview .wikilink').length,
    unresolved: document.querySelectorAll('#preview .wikilink.is-unresolved').length,
    tags: document.querySelectorAll('#preview .md-tag').length,
    headingIds: Array.from(document.querySelectorAll('#preview h1,#preview h2')).map(h => h.id),
    blockAnchor: !!document.querySelector('#preview [id="block-inertia-law"]'),
    codeIsClean: /not a #tag and not a \[\[link\]\]/.test(
      (document.querySelector('#preview pre code') || {}).textContent || '')
  }));
  check('wikilinks rendered', parsed.wikilinks === 6, parsed.wikilinks);
  check('[[Optics]] is unresolved', parsed.unresolved === 1, parsed.unresolved);
  check('#tags rendered', parsed.tags === 3, parsed.tags);
  check('headings carry ids', parsed.headingIds.join(',') === 'mechanics,inertia,force', parsed.headingIds);
  check('^block anchor became an id', parsed.blockAnchor);
  check('code block minted no links or tags', parsed.codeIsClean);

  // ---- 2. following a link inside one note -------------------------------
  const jumped = await page.evaluate(async () => {
    const link = Array.from(document.querySelectorAll('#preview .wikilink'))
      .find(a => a.dataset.wlHeading === 'Force');
    if (!link) return 'no link';
    link.click();
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 60)));
    const el = document.querySelector('#preview [id="force"]');
    return el && el.classList.contains('md-target') ? 'ok' : 'no flash';
  });
  check('[[#Force]] jumps to that heading', jumped === 'ok', jumped);

  // ---- 3. the note-scope graph -------------------------------------------
  await page.evaluate(() => openGraph('note'));
  await page.waitForTimeout(900);

  const g = await page.evaluate(() => ({
    open: gv.open,
    kinds: gv.nodes.reduce((a, n) => (a[n.kind] = (a[n.kind] || 0) + 1, a), {}),
    inNoteEdges: gv.links.filter(l => l.kind === 'link' && l.from.startsWith('head:') && l.to.startsWith('head:')).length,
    outline: gv.links.filter(l => l.kind === 'outline').length,
    tagEdges: gv.links.filter(l => l.kind === 'tag').length,
    rootAnchor: (gv.nodes.find(n => n.kind === 'note' && n.active) || {}).anchor
  }));
  check('graph opened', g.open === true);
  // "# Mechanics" is the note's own title, so it folds into the note node
  // rather than sitting beside it — leaving H2 Inertia and H2 Force.
  check('the leading H1 folds into the note node',
    g.kinds.note === 1 && g.kinds.heading === 2, g.kinds);
  check('and the note node carries its anchor', g.rootAnchor === 'mechanics', g.rootAnchor);
  check('the ^block is a node', g.kinds.block === 1, g.kinds);
  check('#physics and #laws are nodes', g.kinds.tag === 2, g.kinds);
  check('[[Optics]] is an unresolved node', g.kinds.unresolved === 1, g.kinds);
  check('section-to-section edges exist', g.inNoteEdges >= 2, g.inNoteEdges);
  check('the outline is edges too', g.outline === 3, g.outline);
  check('tags are joined to their section', g.tagEdges >= 3, g.tagEdges);

  // Real pixels: the canvas must actually carry the graph.
  const painted = await page.evaluate(() => {
    const c = document.getElementById('graph-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let on = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) on++;
    return { on, total: d.length / 4 };
  });
  check('canvas is painted', painted.on > 500, painted);

  // ---- 4. filters and forces ---------------------------------------------
  const filtered = await page.evaluate(() => {
    const before = gv.nodes.length;
    document.getElementById('gv-showTags').click();          // tags off
    const noTags = gv.nodes.filter(n => n.kind === 'tag').length;
    document.getElementById('gv-existingOnly').click();      // unresolved off
    const noUnres = gv.nodes.filter(n => n.kind === 'unresolved').length;
    document.getElementById('gv-showTags').click();
    document.getElementById('gv-existingOnly').click();
    return { before, noTags, noUnres, after: gv.nodes.length };
  });
  check('Tags filter removes tag nodes', filtered.noTags === 0, filtered);
  check('Existing-only removes unresolved', filtered.noUnres === 0, filtered);
  check('filters are reversible', filtered.after === filtered.before, filtered);

  const depth = await page.evaluate(() => {
    document.getElementById('gv-focus').click();
    const el = document.querySelector('[data-gv="depth"]');
    el.value = '1'; el.dispatchEvent(new Event('input', { bubbles: true }));
    const one = gv.nodes.length;
    el.value = '5'; el.dispatchEvent(new Event('input', { bubbles: true }));
    const five = gv.nodes.length;
    document.getElementById('gv-focus').click();
    return { one, five };
  });
  check('local graph depth widens the graph', depth.five > depth.one, depth);

  const settled = await page.evaluate(async () => {
    const at = t => new Promise(r => setTimeout(r, t));
    gvKick(1);
    await at(5000);
    return gv.alpha;
  });
  check('the simulation settles', settled === 0, settled);

  // ---- 5. across chapters, and the vault scope ---------------------------
  await page.evaluate(() => closeGraph());
  const cross = await page.evaluate(async () => {
    const book = { id: 'wb_test', name: 'Physics', folder: 'Physics', created: Date.now(), updated: Date.now(), order: 0 };
    wbBooks.push(book);
    await wbPersist('workbooks', book);
    const mk = async (title, content) => {
      const ch = {
        id: 'ch_' + title, workbookId: book.id, title, file: title + '.md',
        content, created: Date.now(), updated: Date.now(), order: 0
      };
      wbChapters.push(ch);
      await wbPersist('chapters', ch);
      return ch;
    };
    await mk('Optics', 'Light. See [[Mechanics]]. #physics');
    const m = await mk('Mechanics', 'Matter. See [[Optics]] and [[Nowhere]].');
    renderWorkbooks();
    loadChapterIntoEditor(m);
    await new Promise(r => setTimeout(r, 60));
    openGraph('vault');
    await new Promise(r => setTimeout(r, 500));
    return {
      notes: gv.nodes.filter(n => n.kind === 'note').map(n => n.label).sort(),
      unresolved: gv.nodes.filter(n => n.kind === 'unresolved').map(n => n.label),
      linkEdges: gv.links.filter(l => l.kind === 'link').length,
      active: (gv.nodes.find(n => n.active) || {}).label
    };
  });
  check('both chapters are notes in the vault graph',
    cross.notes.join(',') === 'Mechanics,Optics', cross.notes);
  check('[[Nowhere]] stays unresolved', cross.unresolved.join(',') === 'Nowhere', cross.unresolved);
  check('chapter-to-chapter links became edges', cross.linkEdges >= 3, cross.linkEdges);
  check('the open chapter is the active node', cross.active === 'Mechanics', cross.active);

  // Clicking a note node opens that chapter.
  const opened = await page.evaluate(async () => {
    const optics = gv.nodes.find(n => n.label === 'Optics');
    await gvOpenNode(optics);
    await new Promise(r => setTimeout(r, 200));
    return { current: (wbChapter(wbCurrentId) || {}).title, graphClosed: !gv.open };
  });
  check('clicking a node opens its chapter', opened.current === 'Optics', opened);
  check('and closes the graph', opened.graphClosed);

  // ---- 6. the "[[" suggester ---------------------------------------------
  const sugg = await page.evaluate(async () => {
    const ed = document.getElementById('editor');
    ed.focus();
    ed.value = 'Link to ';
    ed.setSelectionRange(ed.value.length, ed.value.length);
    ed.setRangeText('[[Mech', ed.value.length, ed.value.length, 'end');
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 80));
    const box = document.getElementById('wiki-suggest');
    const first = box.querySelector('.ws-item .ws-name');
    const shown = box.classList.contains('open');
    if (first) first.closest('.ws-item').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 60));
    return { shown, label: first && first.textContent, value: ed.value };
  });
  check('typing "[[" opens the suggester', sugg.shown === true, sugg);
  check('it suggests the matching chapter', sugg.label === 'Mechanics', sugg);
  check('picking one completes the link', sugg.value === 'Link to [[Mechanics]]', sugg);

  // ---- 6b. the note-link modal, and a #tag in the preview ----------------
  const modal = await page.evaluate(async () => {
    const ed = document.getElementById('editor');
    ed.value = 'Start. ';
    ed.setSelectionRange(ed.value.length, ed.value.length);
    updatePreview();
    openWikiModal();
    await new Promise(r => setTimeout(r, 60));
    document.getElementById('wiki-filter').value = 'Mechanics';
    renderWikiPicker();
    document.getElementById('wiki-alias').value = 'the other one';
    paintWikiHint();
    const hint = document.getElementById('wiki-hint').textContent;
    insertWikiLink();
    await new Promise(r => setTimeout(r, 60));
    return { hint, value: ed.value, closed: !document.getElementById('wiki-modal').classList.contains('open') };
  });
  check('the note-link modal previews the markup', /\[\[Mechanics\|the other one\]\]/.test(modal.hint), modal);
  check('and inserts it at the caret', modal.value === 'Start. [[Mechanics|the other one]]', modal);
  check('and closes itself', modal.closed, modal);

  const tagClick = await page.evaluate(async () => {
    const ed = document.getElementById('editor');
    ed.value = '# T\n\nTagged #optics here.\n';
    updatePreview();
    await new Promise(r => setTimeout(r, 60));
    document.querySelector('#preview .md-tag').click();
    await new Promise(r => setTimeout(r, 500));
    const search = document.querySelector('[data-gv="search"]').value;
    const open = gv.open;
    closeGraph();
    return { search, open };
  });
  check('clicking a #tag opens the graph filtered to it',
    tagClick.open && tagClick.search === '#optics', tagClick);

  // ---- 7. i18n -----------------------------------------------------------
  const lang = await page.evaluate(async () => {
    const read = () => ({
      lang: document.documentElement.lang,
      scope: document.querySelector('#gv-scope button[data-scope="note"]').textContent,
      graphBtn: document.querySelector('.tb-btn[onclick="toggleGraph()"]').textContent
    });
    const ro = read();
    window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'en' }));
    await new Promise(r => setTimeout(r, 40));
    const en = read();
    window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'ro' }));
    return { ro, en };
  });
  check('graph UI is Romanian by default', lang.ro.scope === 'Notiță' && lang.ro.graphBtn === '🕸 Graf', lang.ro);
  check('and switches to English', lang.en.scope === 'Note' && lang.en.graphBtn === '🕸 Graph', lang.en);

  // ---- 8. export ---------------------------------------------------------
  const exported = await page.evaluate(md => {
    const html = parseMarkdown(md, { forExport: true });
    return {
      anchor: /<a href="#force" class="wikilink">/.test(html),
      external: /<span class="wikilink[^"]*">Optics<\/span>/.test(html),
      noLiveHandles: !/data-wl-name/.test(html)
    };
  }, NOTE);
  check('export turns same-note links into anchors', exported.anchor, exported);
  check('export degrades cross-note links to text', exported.external, exported);
  check('export carries no app-only handles', exported.noLiveHandles, exported);

  // ---- 9. the same graph on a phone --------------------------------------
  // A 250px palette floating over a 360px canvas would hide the graph it
  // configures, so on a phone it becomes a bottom sheet. Touch is the only
  // pointer there, so the drag/tap route has to work without a mouse.
  const phone = await ctx.browser().newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
  });
  const mp = await phone.newPage();
  const mobileErrors = [];
  mp.on('pageerror', e => mobileErrors.push('PAGEERROR ' + e.message));
  await mp.goto(URL);
  await mp.waitForTimeout(300);
  await mp.evaluate(md => { document.getElementById('editor').value = md; updatePreview(); }, NOTE);
  await mp.evaluate(() => openGraph('note'));
  await mp.waitForTimeout(900);

  const small = await mp.evaluate(() => {
    const panel = document.getElementById('gv-settings');
    const startsClosed = panel.classList.contains('hidden');
    gvToggleSettings();
    const stage = document.getElementById('gv-stage').getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const zoom = document.querySelector('.gv-zoom button').getBoundingClientRect();
    gvToggleSettings();
    return {
      startsClosed,
      full: Math.round(box.width) >= Math.round(stage.width) - 1,
      atBottom: Math.abs(box.bottom - stage.bottom) < 2,
      zoomTarget: Math.min(zoom.width, zoom.height),
      nodes: gv.nodes.length
    };
  });
  check('the palette starts closed on a phone', small.startsClosed, small);
  check('palette is a full-width bottom sheet on a phone', small.full && small.atBottom, small);
  check('zoom buttons meet the 44px touch floor', small.zoomTarget >= 44, small.zoomTarget);
  check('the phone draws the same graph', small.nodes === g.kinds.note + g.kinds.heading
    + g.kinds.block + g.kinds.tag + g.kinds.unresolved, { small, desktop: g.kinds });

  // Drag a node with one finger, then check it actually moved.
  const dragged = await mp.evaluate(async () => {
    const n = gv.nodes.find(x => x.kind === 'heading');
    const before = { x: n.x, y: n.y };
    const c = document.getElementById('graph-canvas');
    const r = c.getBoundingClientRect();
    const at = (t, x, y) => c.dispatchEvent(new PointerEvent(t, {
      pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true,
      clientX: r.left + x, clientY: r.top + y
    }));
    const sx = n.x * gv.scale + gv.tx, sy = n.y * gv.scale + gv.ty;
    at('pointerdown', sx, sy);
    const grabbed = !!gv.drag;
    for (let i = 1; i <= 6; i++) at('pointermove', sx + i * 9, sy + i * 5);
    // Measure before letting go: once released the node is free again and
    // the springs pull it back, so a later sample says nothing about the drag.
    const travelled = Math.hypot(n.x - before.x, n.y - before.y) * gv.scale;
    at('pointerup', sx + 54, sy + 30);
    await new Promise(r2 => setTimeout(r2, 60));
    return { grabbed, travelled, released: !n.fixed };
  });
  check('a node can be grabbed by touch', dragged.grabbed, dragged);
  check('and follows the finger', Math.abs(dragged.travelled - Math.hypot(54, 30)) < 2, dragged);
  check('and is released, not left pinned', dragged.released, dragged);
  check('no errors on the phone', mobileErrors.length === 0, mobileErrors);

  check('no console or page errors', errors.length === 0, errors);

  await browser.close();
  console.log(failed ? '\n' + failed + ' FAILED' : '\nall good');
  process.exit(failed ? 1 : 0);
})();

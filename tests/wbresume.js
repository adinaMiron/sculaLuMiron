// The open chapter survives a reload — index.html.
//
// The bug this pins down: browsers restore a <textarea>'s value on reload
// (and on bringing back a tab they discarded while it sat idle), before any
// script runs. Boot used to resume the last chapter only into an *empty*
// editor, so restored text kept its own chapter out of the editor: the header
// read "untitled.md", wbCurrentId stayed null, and every later keystroke went
// into a loose file that scheduleAutosave() ignores — lost on the next reload.
//
// Two contracts here:
//   1. text nobody has typed into is the browser's restoration, so the
//      chapter is re-attached over it;
//   2. whatever was on screen is never thrown away — the draft journal in
//      localStorage ('scula:md:draft') carries the keystrokes the 800 ms
//      autosave never got to, and the newer of journal/record wins.
//
// Drives the real page off disk like wbsaveall.js, and asserts on the real
// wbCurrentId, the real record in IndexedDB and the real header DOM.
//
//   node wbresume.js        # from tests/
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');
const DRAFT = 'scula:md:draft';

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

const seed = async page => page.evaluate(async () => {
  for (const c of wbChapters.slice()) { try { await wbDrop(WB_CHAPTERS, c.id); } catch (e) {} }
  for (const b of wbBooks.slice()) { try { await wbDrop(WB_BOOKS, b.id); } catch (e) {} }
  for (const r of (await wbAll(WB_PENDING)) || []) { try { await wbDrop(WB_PENDING, r.chapterId); } catch (e) {} }
  wbBooks.length = 0; wbChapters.length = 0; wbPendingIds.clear();
  try { localStorage.removeItem('scula:md:draft'); } catch (e) {}

  const book = { id: 'wb_fiz', name: 'Fizica', folder: 'fizica', created: 1, updated: 1, order: 0 };
  const ch = { id: 'ch_mec', workbookId: 'wb_fiz', title: 'Mecanică', file: 'mecanica.md',
               content: '# Mecanică\n', created: 1, updated: 1, order: 0 };
  wbBooks.push(book); wbChapters.push(ch);
  await wbPut(WB_BOOKS, book);
  await wbPut(WB_CHAPTERS, ch);
  wbBooted = true;
  invalidateWikiIndex();
  await openChapter('ch_mec');
});

// The state the header and the store are in, after whatever just happened.
const state = page => page.evaluate(async () => {
  const el = document.getElementById('current-file');
  const rec = ((await wbAll(WB_CHAPTERS)) || []).find(c => c.id === 'ch_mec') || null;
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem('scula:md:draft') || 'null'); } catch (e) {}
  return {
    current: wbCurrentId,
    label: (el.textContent || '').trim(),
    loose: el.classList.contains('loose'),
    text: document.getElementById('editor').value,
    stored: rec ? rec.content : null,
    say: (document.getElementById('stat-wb').textContent || '').trim(),
    draft
  };
});

/* The race the bug is made of, made deterministic.

   A browser restores a <textarea>'s value from the navigation entry, and
   whether that lands before or after this page's IndexedDB boot is a race —
   won by the restoration exactly when the database is slow to open, which is
   what a tab coming back from being discarded looks like. A copy of the page
   whose textarea already *contains* the text is that side of the race with
   the timing taken out: the value is there before a single script runs, which
   is precisely what the restoration leaves behind. file:// is one origin in
   Chromium, so the copy reads the same IndexedDB as the original. */
const RESTORED = path.join(__dirname, '.restored.html');
async function openRestored(page, text) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  fs.writeFileSync(RESTORED, src.replace('"></textarea>', '">' + escaped + '</textarea>'));
  await page.goto('file://' + RESTORED);
  await page.waitForTimeout(600);
}

// Type the way a person does: the textarea's own oninput chain, which is what
// sets wbUserEdited and schedules both the autosave and the journal.
const type = (page, text) => page.evaluate(t => {
  const e = document.getElementById('editor');
  e.value = t;
  e.dispatchEvent(new Event('input', { bubbles: true }));
}, text);

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
  page.on('dialog', d => d.accept());

  // The journal is written on the way out (wbPark, on pagehide), so a planted
  // entry has to land on the *next* document, before its script reads it.
  // One-shot, keyed on '__plant', so every other reload here is untouched.
  await page.addInitScript(() => {
    try {
      const plant = localStorage.getItem('__plant');
      if (plant) {
        if (plant === 'REMOVE') localStorage.removeItem('scula:md:draft');
        else localStorage.setItem('scula:md:draft', plant);
        localStorage.removeItem('__plant');
      }
    } catch (e) {}
  });

  await page.goto(URL);
  await page.waitForTimeout(350);
  await seed(page);
  await page.waitForTimeout(150);

  /* ---- 1. typing is journalled as well as autosaved ---- */
  await type(page, '# Mecanică\nlinia unu\n');
  await page.waitForTimeout(1100);            // 800 ms autosave + 700 ms journal
  let s = await state(page);
  check('the open chapter is autosaved', s.stored === '# Mecanică\nlinia unu\n', s.stored);
  check('and the same text is journalled under its chapter id',
        s.draft && s.draft.id === 'ch_mec' && s.draft.text === '# Mecanică\nlinia unu\n', s.draft);
  check('an attached editor is not flagged loose', s.current === 'ch_mec' && !s.loose, s);

  /* ---- 2. the reload the bug was about: the browser puts the text back ---- */
  await page.reload();
  await page.waitForTimeout(500);
  s = await state(page);
  check('the browser restored the text on reload', s.text === '# Mecanică\nlinia unu\n', s.text);
  check('the chapter is re-attached over it', s.current === 'ch_mec', s.current);
  check('and the header names the chapter file, not untitled.md',
        s.label === 'mecanica.md' && !s.loose, { label: s.label, loose: s.loose });

  /* ---- 2b. the same thing with the race decided against us: the text is
            already in the textarea when the first script runs ---- */
  await openRestored(page, '# Mecanică\nlinia unu\n');
  s = await state(page);
  check('text restored before boot does not keep its chapter out of the editor',
        s.current === 'ch_mec' && s.label === 'mecanica.md', s);
  check('and the text is still there', s.text === '# Mecanică\nlinia unu\n', s.text);

  // …and when that restored text is ahead of the record — the keystrokes the
  // autosave never got to — it is kept and written back, not replaced.
  await openRestored(page, '# Mecanică\nlinia unu\nlinia trei\n');
  s = await state(page);
  check('restored text ahead of the record is recovered into the chapter',
        s.text === '# Mecanică\nlinia unu\nlinia trei\n' && s.stored === s.text, s);

  await page.goto(URL);
  await page.waitForTimeout(500);

  /* ---- 3. typing after that reload still reaches the store ---- */
  await type(page, '# Mecanică\nlinia unu\nlinia doi\n');
  await page.waitForTimeout(1100);
  s = await state(page);
  check('a keystroke after the reload is autosaved to the chapter',
        s.stored === '# Mecanică\nlinia unu\nlinia doi\n', s.stored);

  /* ---- 4. the journal is ahead of the record: keystrokes the autosave
            never got to, because the tab went away in the 800 ms gap ---- */
  await page.evaluate(async () => {
    const ch = wbChapter('ch_mec');
    ch.content = 'salvat\n'; ch.updated = Date.now() - 10000;
    await wbPut(WB_CHAPTERS, ch);
    // On screen == the record, so the journal is the only thing that can
    // supply the missing line: this isolates it from the restored-text path.
    document.getElementById('editor').value = 'salvat\n';
    localStorage.setItem('__plant', JSON.stringify({
      id: 'ch_mec', name: 'mecanica.md', text: 'salvat\nscris și pierdut\n', at: Date.now()
    }));
  });
  await page.reload();
  await page.waitForTimeout(600);
  s = await state(page);
  check('the journal ahead of the record is what the editor comes up with',
        s.text === 'salvat\nscris și pierdut\n', s.text);
  check('and it is written back into the chapter',
        s.stored === 'salvat\nscris și pierdut\n' && s.current === 'ch_mec', s);

  /* ---- 5. a record that is newer wins: a stale journal is ignored ---- */
  await page.evaluate(async () => {
    const ch = wbChapter('ch_mec');
    ch.content = 'versiunea bună\n'; ch.updated = Date.now();
    await wbPut(WB_CHAPTERS, ch);
    document.getElementById('editor').value = 'versiunea bună\n';   // what is on screen
    localStorage.setItem('scula:md:draft', JSON.stringify({
      id: 'ch_mec', name: 'mecanica.md', text: 'ceva vechi\n', at: Date.now() - 60000
    }));
  });
  await page.reload();
  await page.waitForTimeout(600);
  s = await state(page);
  check('a journal older than the record is ignored', s.text === 'versiunea bună\n', s.text);

  /* ---- 6. no journal at all, and the restored text is ahead of the record:
            the text on screen is still not thrown away ---- */
  await page.evaluate(async () => {
    const ch = wbChapter('ch_mec');
    ch.content = 'versiunea bună\n'; ch.updated = Date.now();
    await wbPut(WB_CHAPTERS, ch);
    document.getElementById('editor').value = 'versiunea bună\nși un rând în plus\n';
    try { localStorage.removeItem('scula:md:draft'); } catch (e) {}
  });
  await page.reload();
  await page.waitForTimeout(600);
  s = await state(page);
  check('restored text ahead of the record survives the resume',
        s.text === 'versiunea bună\nși un rând în plus\n', s.text);
  check('and the chapter now holds it',
        s.stored === 'versiunea bună\nși un rând în plus\n', s.stored);

  /* ---- 6b. the restoration that lands *after* boot: the text changes under
            an attached chapter with no event to announce it, and must not be
            left disagreeing with the record until the next keystroke.

            Whether a browser restores before or after this page's script is
            not ours to choose, so this side is driven the way the browser
            drives it: a plain value assignment with no input event, once boot
            has finished. wbSettleRestore() is the deferred look that
            catches it. ---- */
  await page.evaluate(async () => {
    const ch = wbChapter('ch_mec');
    ch.content = 'rândul salvat\n'; ch.updated = Date.now();
    await wbPut(WB_CHAPTERS, ch);
    localStorage.setItem('__plant', 'REMOVE');      // no journal: the browser is the only source
  });
  await page.reload();
  await page.waitForTimeout(400);                   // boot is done, the settle pass is not
  await page.evaluate(() => { document.getElementById('editor').value = 'rândul salvat\nrândul de pe ecran\n'; });
  await page.waitForTimeout(1400);
  s = await state(page);
  check('a late restoration is written into the chapter, not left dangling',
        s.text === 'rândul salvat\nrândul de pe ecran\n' && s.stored === s.text, s);

  // …but an empty restoration is loss, not recovery: it never erases a chapter.
  await page.evaluate(async () => {
    const ch = wbChapter('ch_mec');
    ch.content = 'nu se șterge\n'; ch.updated = Date.now();
    await wbPut(WB_CHAPTERS, ch);
    localStorage.setItem('__plant', 'REMOVE');
  });
  await page.reload();
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById('editor').value = ''; });
  await page.waitForTimeout(1400);
  s = await state(page);
  check('an empty restoration never erases the chapter, and is put back',
        s.text === 'nu se șterge\n' && s.stored === 'nu se șterge\n', s);

  /* ---- 7. a loose "untitled.md": nothing to autosave into, so the journal
            is all it has — and it comes back ---- */
  await page.evaluate(() => newFile());
  await page.waitForTimeout(200);
  await type(page, 'notiță fără capitol\n');
  await page.waitForTimeout(1000);
  s = await state(page);
  check('text in no chapter is flagged on the header',
        s.current === null && s.label === 'untitled.md' && s.loose, s);
  check('and it is journalled with no chapter id',
        s.draft && s.draft.id === '' && s.draft.text === 'notiță fără capitol\n', s.draft);

  await page.reload();
  await page.waitForTimeout(600);
  s = await state(page);
  check('a loose file is recovered after the reload', s.text === 'notiță fără capitol\n', s.text);
  check('and it is still flagged as belonging to no chapter',
        s.current === null && s.loose, s);

  /* ---- 8. New file is a deliberate discard, not something to resurrect ---- */
  await page.evaluate(() => newFile());
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForTimeout(600);
  s = await state(page);
  check('an emptied editor stays empty after a reload', s.text === '', s.text);

  check('no page errors', errors.length === 0, errors);
  try { fs.unlinkSync(RESTORED); } catch (e) {}
  await browser.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();

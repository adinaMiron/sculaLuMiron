// Quick idea capture in index.html — the 💡 header button, Ctrl+Alt+I.
//
// One textarea. The first line may name the chapter the idea belongs to
// ("Editor: - [ ] write the code"); the rest is appended verbatim to that
// chapter, wherever it lives, and the chapter is written out as Ctrl+S
// would write it. Nothing matched → the whole text is kept and filed in the
// "Idei" workbook under a chapter named for today, both created on demand.
//
// Drives the real modal off disk like wbtodo.js / wbsaveall.js, and asserts
// on the real module state (wbChapters / wbBooks) and the real DOM.
//
//   node idea.js        # from tests/
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

// Two workbooks, none of them called "Idei" — the chapter names are what an
// idea addresses, and "Editor" deliberately lives in a workbook with an
// unrelated name so a match on the workbook cannot be what makes it pass.
const seed = () => {
  wbBooks.length = 0;
  wbChapters.length = 0;
  wbBooks.push(
    { id: 'wb_proj', name: 'Proiecte', folder: 'proiecte', created: 1, updated: 1, order: 0 },
    { id: 'wb_sc',   name: 'Școală',   folder: 'scoala',   created: 1, updated: 1, order: 1 });
  wbChapters.push(
    { id: 'ch_ed',   workbookId: 'wb_proj', title: 'Editor',   file: 'editor.md',
      content: '# Editor\n\ntext existent\n', created: 1, updated: 1, order: 0 },
    { id: 'ch_ret',  workbookId: 'wb_proj', title: 'Rețete',   file: 'retete.md',
      content: '# Rețete\n', created: 1, updated: 1, order: 1 },
    { id: 'ch_fiz',  workbookId: 'wb_sc',   title: 'Fizică',   file: 'fizica.md',
      content: '', created: 1, updated: 1, order: 0 });
  wbCurrentId = null;
  wbBooted = true;
  invalidateWikiIndex();
  renderWorkbooks();
};

const contentOf = (page, id) => page.evaluate(i => wbChapter(i).content, id);

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
  await page.evaluate(seed);
  await page.waitForTimeout(120);

  const isOpen = () => page.$eval('#idea-modal', el => el.classList.contains('open'));
  const hint = () => page.$eval('#idea-hint', el => el.textContent);
  const type = async txt => {
    await page.fill('#idea-text', txt);
    await page.waitForTimeout(80);
  };

  // ── the button sits immediately after "New" in .header-actions ──
  const order = await page.$$eval('.header-actions .btn', els => els.map(b => b.id || b.getAttribute('data-i')));
  check('💡 button is right of New', order[order.indexOf('newFileBtn') + 1] === 'btn-idea', order);

  // ── Ctrl+Alt+I opens it, Escape closes it ──
  await page.keyboard.press('Control+Alt+KeyI');
  await page.waitForTimeout(120);
  check('Ctrl+Alt+I opens the idea box', await isOpen());
  check('the textarea has the caret', await page.evaluate(() => document.activeElement.id) === 'idea-text');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  check('Escape closes it', !(await isOpen()));

  // ── the button opens it too, and the hint says where the idea will land ──
  await page.click('#btn-idea');
  await page.waitForTimeout(120);
  check('the button opens it', await isOpen());
  await type('Editor: - [ ] write code to bla bla bla');
  check('the hint names the target chapter', /Proiecte/.test(await hint()) && /Editor/.test(await hint()), await hint());

  // ── Ctrl+Enter files it: the body lands in Editor, the prefix is gone ──
  await page.click('#idea-text');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(250);
  check('the modal closed after filing', !(await isOpen()));
  const ed = await contentOf(page, 'ch_ed');
  check('the idea was appended to Editor',
    ed === '# Editor\n\ntext existent\n- [ ] write code to bla bla bla\n', ed);
  check('the textarea was emptied', (await page.inputValue('#idea-text')) === '');
  check('no other chapter was touched', (await contentOf(page, 'ch_ret')) === '# Rețete\n');
  check('no "Idei" workbook was created', await page.evaluate(() => !ideaFallbackBook()));

  // ── the pending marker is cleared: filing an idea is a real save ──
  check('the chapter is not left pending', await page.evaluate(() => !wbPendingIds.has('ch_ed')));

  // ── case and diacritics are ignored, and the file name works as a name ──
  await page.evaluate(() => { document.getElementById('idea-text').value = ''; });
  await page.click('#btn-idea');
  await type('retete: idee fara diacritice');
  await page.click('#idea-text');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(250);
  check('"retete" found "Rețete"', (await contentOf(page, 'ch_ret')) === '# Rețete\nidee fara diacritice\n',
    await contentOf(page, 'ch_ret'));

  // ── the open chapter: the textarea must move with the file ──
  await page.evaluate(() => loadChapterIntoEditor(wbChapter('ch_fiz')));
  await page.waitForTimeout(150);
  await page.click('#btn-idea');
  await type('Fizică: - [ ] de recitit');
  await page.click('#idea-text');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(250);
  check('the editor shows the idea when the target is the open chapter',
    (await page.inputValue('#editor')) === '- [ ] de recitit\n', await page.inputValue('#editor'));
  check('the open chapter is not left dirty', await page.evaluate(() => wbDirty === false));

  // ── nothing matched → Idei / today, both created, text kept whole ──
  await page.click('#btn-idea');
  await type('Grădinărit: - [ ] de plantat busuioc');
  const fallbackHint = await hint();
  check('the hint warns it falls back to Idei', /Idei/.test(fallbackHint), fallbackHint);
  await page.click('#idea-text');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(300);

  const today = await page.evaluate(() => ideaToday());
  const filed = await page.evaluate(t => {
    const b = ideaFallbackBook();
    if (!b) return null;
    const c = wbChaptersOf(b.id).find(x => x.title === t);
    return c ? { book: b.name, folder: b.folder, title: c.title, file: c.file, content: c.content } : null;
  }, today);
  check('an "Idei" workbook was created', filed && filed.book === 'Idei', filed);
  check('with a chapter named for today', filed && filed.title === today && filed.file === today + '.md', filed);
  check('and the unmatched name is kept in the text',
    filed && filed.content === 'Grădinărit: - [ ] de plantat busuioc\n', filed && filed.content);

  // ── a second unmatched idea reuses the same day's chapter ──
  await page.click('#btn-idea');
  await type('inca o idee, fara nume de capitol');
  await page.click('#idea-text');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(300);
  const again = await page.evaluate(t => {
    const b = ideaFallbackBook();
    const all = wbChaptersOf(b.id);
    return { n: all.length, content: all.find(x => x.title === t).content };
  }, today);
  check('the same day reuses one chapter', again.n === 1, again);
  check('both ideas are in it',
    again.content === 'Grădinărit: - [ ] de plantat busuioc\ninca o idee, fara nume de capitol\n', again.content);

  // ── an empty box files nothing ──
  const before = await page.evaluate(() => wbChapters.map(c => c.content).join('|'));
  await page.click('#btn-idea');
  await type('   ');
  await page.click('#idea-text');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(200);
  check('an empty idea changes nothing',
    (await page.evaluate(() => wbChapters.map(c => c.content).join('|'))) === before);
  check('and the box stays open', await isOpen());
  await page.keyboard.press('Escape');

  // ── the editor's own chords do not leak through the idea box ──
  await page.evaluate(() => { document.getElementById('idea-text').value = ''; });
  await page.click('#btn-idea');
  await type('Editor: nu italiciza nimic');
  const edBefore = await page.inputValue('#editor');
  await page.click('#idea-text');
  await page.keyboard.press('Control+i');
  await page.waitForTimeout(120);
  check('Ctrl+I inside the idea box leaves the editor alone',
    (await page.inputValue('#editor')) === edBefore);
  await page.keyboard.press('Escape');

  check('no page errors', errors.length === 0, errors);

  await browser.close();
  console.log(failed ? '\n' + failed + ' FAILED' : '\nall good');
  process.exit(failed ? 1 : 0);
})();

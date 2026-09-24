// Drag chapters within and between workbooks, then verify IndexedDB after reload.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const CHROME = process.env.PW_CHROME_PATH || undefined;

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const assert = (ok, message) => { if (!ok) throw new Error(message); console.log('PASS ' + message); };
  try {
    await page.goto(URL);
    await page.waitForFunction(() => wbBooted);
    await page.evaluate(async () => {
      for (const ch of wbChapters) await wbDrop(WB_CHAPTERS, ch.id);
      for (const book of wbBooks) await wbDrop(WB_BOOKS, book.id);
      wbChapters.length = 0; wbBooks.length = 0;
      const books = [
        { id: 'drag_a', name: 'First', folder: 'first', created: 1, updated: 1, order: 0 },
        { id: 'drag_b', name: 'Second', folder: 'second', created: 1, updated: 1, order: 1 },
        { id: 'drag_c', name: 'Empty', folder: 'empty', created: 1, updated: 1, order: 2 }
      ];
      const chapters = [
        { id: 'drag_one', workbookId: 'drag_a', title: 'One', file: 'one.md', content: 'One body', created: 1, updated: 1, order: 0 },
        { id: 'drag_two', workbookId: 'drag_a', title: 'Two', file: 'two.md', content: 'Two body', created: 1, updated: 1, order: 1 },
        { id: 'drag_three', workbookId: 'drag_b', title: 'Two', file: 'two.md', content: 'Three body', created: 1, updated: 1, order: 0 }
      ];
      wbBooks.push(...books); wbChapters.push(...chapters);
      for (const book of books) await wbPut(WB_BOOKS, book);
      for (const ch of chapters) await wbPut(WB_CHAPTERS, ch);
      books.forEach(book => wbOpenBooks.add(book.id));
      renderWorkbooks();
      if (document.getElementById('wb-panel').classList.contains('collapsed')) toggleWorkbooks();
    });
    const row = id => page.locator('.wb-ch-name[data-wb-id="' + id + '"]').locator('..');
    const bookRow = id => page.locator('.wb-book-name[data-wb-id="' + id + '"]').locator('..');
    await row('drag_two').dragTo(row('drag_one'), { targetPosition: { x: 30, y: 2 } });
    await page.waitForFunction(() => wbChaptersOf('drag_a')[0].id === 'drag_two');
    assert(await page.evaluate(() => wbChaptersOf('drag_a').map(ch => ch.id).join(',') === 'drag_two,drag_one'), 'reorder within a workbook');

    await page.evaluate(() => openChapter('drag_two'));
    const targetBox = await row('drag_three').boundingBox();
    await row('drag_two').dragTo(row('drag_three'), { targetPosition: { x: 30, y: targetBox.height - 2 } });
    await page.waitForFunction(() => wbChapter('drag_two').workbookId === 'drag_b');
    const moved = await page.evaluate(() => ({ file: wbChapter('drag_two').file, order: wbChaptersOf('drag_b').map(ch => ch.id) }));
    assert(moved.file.toLowerCase() === 'two-2.md' && moved.order[1] === 'drag_two', 'move after a chapter and resolve a file name collision: ' + JSON.stringify(moved));
    assert(await page.evaluate(() => wbCurrentId === 'drag_two' && editor.value === 'Two body' &&
      document.getElementById('current-file').textContent === wbChapter('drag_two').file &&
      document.getElementById('wb-crumb').textContent.includes('Second')),
    'open chapter stays open with the new workbook path');

    await row('drag_one').dragTo(bookRow('drag_c'));
    await page.waitForFunction(() => wbChapter('drag_one').workbookId === 'drag_c');
    assert(await page.evaluate(() => wbChaptersOf('drag_c')[0].id === 'drag_one' && wbChapter('drag_one').file === 'one.md'), 'move into an empty workbook while keeping its file name');

    await page.reload();
    await page.waitForFunction(() => wbBooted);
    assert(await page.evaluate(() =>
      wbChapter('drag_two').workbookId === 'drag_b' && wbChapter('drag_two').file.toLowerCase() === 'two-2.md' &&
      wbChapter('drag_one').workbookId === 'drag_c' && wbChaptersOf('drag_b')[1].id === 'drag_two'
    ), 'moves persist after reload');
    assert(!errors.length, 'no page errors: ' + errors.join('; '));

    const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const touchPage = await touchContext.newPage();
    const touchErrors = [];
    touchPage.on('pageerror', error => touchErrors.push(error.message));
    await touchPage.goto(URL);
    await touchPage.waitForFunction(() => wbBooted);
    await touchPage.evaluate(async () => {
      const books = [
        { id: 'touch_a', name: 'First', folder: 'touch-first', created: 1, updated: 1, order: 0 },
        { id: 'touch_b', name: 'Second', folder: 'touch-second', created: 1, updated: 1, order: 1 }
      ];
      const chapters = [
        { id: 'touch_one', workbookId: 'touch_a', title: 'One', file: 'one.md', content: 'One', created: 1, updated: 1, order: 0 },
        { id: 'touch_two', workbookId: 'touch_a', title: 'Two', file: 'two.md', content: 'Two', created: 1, updated: 1, order: 1 }
      ];
      wbBooks.push(...books); wbChapters.push(...chapters);
      for (const book of books) await wbPut(WB_BOOKS, book);
      for (const ch of chapters) await wbPut(WB_CHAPTERS, ch);
      wbOpenBooks.add('touch_a');
      renderWorkbooks();
      if (document.getElementById('wb-panel').classList.contains('collapsed')) toggleWorkbooks();
    });
    const touchRow = id => touchPage.locator('.wb-ch-name[data-wb-id="' + id + '"]').locator('..');
    const touchBook = id => touchPage.locator('.wb-book-name[data-wb-id="' + id + '"]').locator('..');
    const cdp = await touchContext.newCDPSession(touchPage);
    const point = async (locator, nearTop = false) => {
      const box = await locator.boundingBox();
      return { x: Math.round(box.x + Math.min(35, box.width / 2)), y: Math.round(box.y + (nearTop ? 3 : box.height / 2)) };
    };
    const touchDrag = async (from, to) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
      await touchPage.waitForTimeout(420);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...to, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await touchDrag(await point(touchRow('touch_two')), await point(touchRow('touch_one'), true));
    await touchPage.waitForFunction(() => wbChaptersOf('touch_a')[0].id === 'touch_two');
    assert(await touchPage.evaluate(() => wbChaptersOf('touch_a').map(ch => ch.id).join(',') === 'touch_two,touch_one'), 'touch hold and drag reorders chapters');
    await touchDrag(await point(touchRow('touch_one')), await point(touchBook('touch_b')));
    await touchPage.waitForFunction(() => wbChapter('touch_one').workbookId === 'touch_b');
    assert(await touchPage.evaluate(() => wbChaptersOf('touch_b')[0].id === 'touch_one'), 'touch drag moves a chapter into another workbook');
    assert(await touchPage.evaluate(() => wbCurrentId === null), 'touch drop does not also open a chapter');
    await touchRow('touch_two').locator('.wb-ch-name').tap();
    await touchPage.waitForFunction(() => wbCurrentId === 'touch_two');
    assert(await touchPage.evaluate(() => wbCurrentId === 'touch_two'), 'ordinary touch tap still opens a chapter');
    assert(!touchErrors.length, 'no touch page errors: ' + touchErrors.join('; '));
    await touchContext.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

// Run: node tests/mdexportshortcut.js (bundled headless Chromium, offline).
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

async function edit(page, text, name) {
  await page.evaluate(({ text, name }) => {
    editor.value = text;
    wbFileLabel(name);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    clearTimeout(wbSaveTimer); // keep the unsaved editor ahead of persistence
    editor.focus();
  }, { text, name });
}

(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage();
    const errors = [];
    const downloads = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('download', download => downloads.push(download));
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    await page.waitForFunction(() => wbDraftReady && wbBooted);
    await page.waitForTimeout(1500); // settle the one-time restoration check
    await page.evaluate(async () => {
      await ScuLaFolder.ready;
      ScuLaFolder.setMode('download');
      detachChapter();
      window.shortcutExports = [];
      const save = ScuLaFolder.save;
      ScuLaFolder.save = (name, blob) => {
        const output = { name, blob };
        shortcutExports.push(output);
        return save(name, blob).then(result => { output.result = result; return result; });
      };
      document.addEventListener('keydown', event => {
        if (event.code === 'KeyS') window.lastSaveKey = {
          key: event.key, prevented: event.defaultPrevented
        };
      });
    });

    for (const [chord, text, label, filename] of [
      ['Control+Shift+S', '# Ultima ciornă\nȘi text nou.', 'draft.md', 'draft.md'],
      ['Meta+Shift+S', 'LATEST MAC DRAFT', 'mac.md', 'mac.md'],
      ['Control+Shift+S', '', 'empty.md', 'empty.md'],
      ['Control+Shift+S', 'UNNAMED DRAFT', '', 'untitled.md']
    ]) {
      await edit(page, text, label);
      const downloadPromise = page.waitForEvent('download');
      await page.keyboard.press(chord);
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), filename);
      assert.equal(await fs.readFile(await download.path(), 'utf8'), text);
      const state = await page.evaluate(() => ({
        key: lastSaveKey, type: shortcutExports.at(-1).blob.type,
        current: wbCurrentId, text: editor.value,
        workbookOpen: document.getElementById('workbook-modal').classList.contains('open')
      }));
      assert.deepEqual(state, { key: { key: 'S', prevented: true }, type: 'text/markdown',
        current: null, text, workbookOpen: false });
    }
    console.log('PASS normal Ctrl/Meta+Shift+S downloads latest loose text, empty drafts and fallback filename');

    await page.evaluate(() => {
      window.originalSaveAll = saveAllModifiedChapters;
      window.saveAllShortcutCalls = 0;
      saveAllModifiedChapters = () => { saveAllShortcutCalls++; };
    });
    for (const chord of ['Control+Alt+S', 'Meta+Alt+S', 'Control+Alt+Shift+S']) {
      await page.keyboard.press(chord);
    }
    assert.deepEqual(await page.evaluate(() => ({ calls: saveAllShortcutCalls, exports: shortcutExports.length })),
      { calls: 3, exports: 4 }, 'Alt+S keeps the existing save-all route');
    await page.evaluate(() => { saveAllModifiedChapters = originalSaveAll; });
    console.log('PASS save-all shortcuts remain separate from file export');

    await page.evaluate(async () => {
      const book = { id: 'shortcut-book', name: 'Book', folder: 'Book', order: 0 };
      const chapter = { id: 'shortcut-chapter', workbookId: book.id, title: 'Chapter',
        file: 'chapter.md', content: 'STORED TEXT', created: 1, updated: 1, order: 0 };
      wbBooks = [book]; wbChapters = [chapter];
      await wbPut(WB_BOOKS, book);
      await wbPut(WB_CHAPTERS, chapter);
      loadChapterIntoEditor(chapter);
    });
    await edit(page, 'UNSAVED CHAPTER TEXT', 'chapter.md');
    const chapterDownload = page.waitForEvent('download');
    await page.keyboard.press('Control+Shift+S');
    assert.equal(await fs.readFile(await (await chapterDownload).path(), 'utf8'), 'UNSAVED CHAPTER TEXT');
    const beforeCancel = await page.evaluate(() => ({
      current: wbCurrentId, dirty: wbDirty, stored: wbChapter(wbCurrentId).content,
      pending: [...wbPendingIds], draft: sessionStorage.getItem(WB_DRAFT_KEY), text: editor.value
    }));
    assert.equal(beforeCancel.dirty, true);
    assert.equal(beforeCancel.stored, 'STORED TEXT');
    console.log('PASS chapter export uses unsaved text and preserves dirty state');

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', { configurable: true, value: ({ files }) => {
        window.canceledShareFile = files[0];
        return Promise.reject(new DOMException('Canceled by user', 'AbortError'));
      } });
      ScuLaFolder.setMode('share');
    });
    const downloadCount = downloads.length;
    await page.keyboard.press('Control+Shift+S');
    await page.waitForFunction(() => shortcutExports.at(-1).result?.cancelled);
    assert.equal(downloads.length, downloadCount, 'canceled sharing does not download');
    const canceled = await page.evaluate(async () => ({
      state: { current: wbCurrentId, dirty: wbDirty, stored: wbChapter(wbCurrentId).content,
        pending: [...wbPendingIds], draft: sessionStorage.getItem(WB_DRAFT_KEY), text: editor.value },
      name: canceledShareFile.name, text: await canceledShareFile.text(),
      message: shortcutExports.at(-1).result.message
    }));
    assert.deepEqual(canceled, { state: beforeCancel, name: 'chapter.md',
      text: 'UNSAVED CHAPTER TEXT', message: null });
    console.log('PASS canceled shared export preserves edits and pending state without a fallback download');

    for (const [lang, wording] of [['ro', 'exportă fișier'], ['en', 'export file']]) {
      await page.evaluate(lang => {
        window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: lang }));
        openHelpModal();
      }, lang);
      assert.match(await page.locator('#help-body').innerText(), new RegExp('Ctrl\\+Shift\\+S.*' + wording));
      const count = await page.evaluate(() => shortcutExports.length);
      await page.keyboard.press('Control+Shift+S');
      assert.equal(await page.evaluate(() => shortcutExports.length), count, 'help dialog owns shortcut');
      await page.keyboard.press('Escape');
    }
    await page.evaluate(() => openLinkModal());
    await page.locator('#link-url').focus();
    const count = await page.evaluate(() => shortcutExports.length);
    await page.keyboard.press('Meta+Shift+S');
    assert.equal(await page.evaluate(() => shortcutExports.length), count, 'link input owns shortcut');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    console.log('PASS RO/EN help documents the shortcut and dialogs keep their keys');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

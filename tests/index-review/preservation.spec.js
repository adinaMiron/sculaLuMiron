const { test, expect, seed, edit, mountDisk } = require('./helpers');

test('normal edit, autosave, switch and reload preserve Unicode and blank lines', async ({ page }) => {
  await seed(page);
  const text = '# Știință 🌱\n\n- [ ] Încercare\n\n';
  await edit(page, text);
  await expect.poll(() => page.evaluate(async () => (await wbAll(WB_CHAPTERS)).find(c => c.id === 'a').content)).toBe(text);
  await page.evaluate(() => openChapter('b'));
  await page.evaluate(() => openChapter('a'));
  await page.reload();
  await page.waitForFunction(() => wbDraftReady);
  await expect(page.locator('#editor')).toHaveValue(text);
});

test('empty chapter is a saved revision, not replaced by previous content', async ({ page }) => {
  await seed(page);
  await edit(page, '');
  await page.evaluate(() => flushChapter());
  await page.reload();
  await page.waitForFunction(() => wbDraftReady);
  await expect(page.locator('#editor')).toHaveValue('');
  expect(await page.evaluate(async () => (await wbAll(WB_CHAPTERS)).find(c => c.id === 'a').content)).toBe('');
});

test('New succeeds after persisting the previous chapter', { tag: '@idx-new-failed-flush' }, async ({ page }) => {
  await seed(page);
  await edit(page, 'SAVE BEFORE NEW');
  await page.locator('[onclick="newFile()"]').click();
  await expect.poll(() => page.evaluate(async () => (await wbAll(WB_CHAPTERS)).find(c => c.id === 'a').content)).toBe('SAVE BEFORE NEW');
  await expect(page.locator('#editor')).toHaveValue('');
});

for (const inFlight of [false, true]) {
test(`P1 new-file failure retains the chapter and recovery journal (${inFlight ? 'already-running flush' : 'immediate failure'})`, { tag: '@idx-new-failed-flush' }, async ({ page }) => {
  await seed(page);
  await edit(page, 'UNSAVED IMPORTANT TEXT');
  const history = await page.evaluate(inFlight => {
    clearTimeout(wbSaveTimer);
    const original = wbTx;
    window.reviewRestoreTx = () => { wbTx = original; };
    wbTx = async (store, mode, run) => {
      if (store !== WB_CHAPTERS || mode !== 'readwrite') return original(store, mode, run);
      if (inFlight && !window.reviewWriteStarted) {
        window.reviewWriteStarted = true;
        await new Promise(resolve => { window.reviewReleaseWrite = resolve; });
      }
      throw new DOMException('Injected full store', 'QuotaExceededError');
    };
    if (inFlight) window.reviewHeldFlush = flushChapter();
    return { undo: undoStack, redo: redoStack };
  }, inFlight);
  expect(history.undo.length).toBeGreaterThan(0);
  await page.locator('[onclick="newFile()"]').click();
  if (inFlight) {
    expect(await page.evaluate(() => ({ text: editor.value, current: wbCurrentId,
      dirty: wbDirty, draft: wbDraftRead() }))).toMatchObject({
      text: 'UNSAVED IMPORTANT TEXT', current: 'a', dirty: true,
      draft: { id: 'a', text: 'UNSAVED IMPORTANT TEXT', dirty: true }
    });
    await page.evaluate(() => reviewReleaseWrite());
  }
  await page.waitForFunction(() => !wbFlushPromise);
  const result = await page.evaluate(async () => ({
    editor: editor.value, current: wbCurrentId, dirty: wbDirty, draft: wbDraftRead(),
    history: { undo: undoStack, redo: redoStack },
    stored: (await wbAll(WB_CHAPTERS)).find(c => c.id === 'a').content,
    errorShown: document.getElementById('stat-wb').textContent === t('wbStoreFailed')
  }));
  expect(result, 'New must not replace editor/journal when its flush fails').toMatchObject({
    editor: 'UNSAVED IMPORTANT TEXT', current: 'a', dirty: true,
    draft: { id: 'a', text: 'UNSAVED IMPORTANT TEXT', dirty: true },
    history, stored: 'ORIGINAL a', errorShown: true
  });
  await expect(page.locator('#current-file')).toHaveText('a.md');
  await page.evaluate(() => reviewRestoreTx());
  await page.locator('[onclick="newFile()"]').click();
  await expect(page.locator('#editor')).toHaveValue('');
  expect(await page.evaluate(async () => ({ current: wbCurrentId, dirty: wbDirty,
    draft: wbDraftRead(), history: undoStack.length + redoStack.length,
    stored: (await wbAll(WB_CHAPTERS)).find(c => c.id === 'a').content }))).toMatchObject({
    current: null, dirty: false, draft: { id: '', text: '' }, history: 0,
    stored: 'UNSAVED IMPORTANT TEXT'
  });
});
}

test('New waits for an already-running flush and saves edits typed during it', { tag: '@idx-new-failed-flush' }, async ({ page }) => {
  await seed(page);
  await edit(page, 'FIRST SNAPSHOT');
  await page.evaluate(() => {
    const original = wbTx;
    wbTx = async (store, mode, run) => {
      if (store === WB_CHAPTERS && mode === 'readwrite' && !window.reviewWriteStarted) {
        window.reviewWriteStarted = true;
        await new Promise(resolve => { window.reviewReleaseWrite = resolve; });
      }
      return original(store, mode, run);
    };
    window.reviewHeldFlush = flushChapter();
  });
  await page.waitForFunction(() => window.reviewWriteStarted);
  await edit(page, 'SECOND SNAPSHOT');
  await page.locator('[onclick="newFile()"]').click();
  await expect(page.locator('#editor')).toHaveValue('SECOND SNAPSHOT');
  expect(await page.evaluate(() => wbCurrentId)).toBe('a');
  await page.evaluate(() => reviewReleaseWrite());
  await expect(page.locator('#editor')).toHaveValue('');
  expect(await page.evaluate(async () => ({ current: wbCurrentId, draft: wbDraftRead(),
    stored: (await wbAll(WB_CHAPTERS)).find(c => c.id === 'a').content }))).toMatchObject({
    current: null, draft: { id: '', text: '' }, stored: 'SECOND SNAPSHOT'
  });
});

test('P2 pending-marker failure remains visible and survives reload', async ({ page }) => {
  await seed(page);
  await edit(page, 'CHANGED SINCE DISK SAVE');
  await page.evaluate(async () => {
    const original = wbTx;
    wbTx = (store, mode, run) => store === WB_PENDING && mode === 'readwrite'
      ? Promise.reject(new DOMException('Injected pending failure', 'QuotaExceededError')) : original(store, mode, run);
    await flushChapter();
  });
  await page.reload();
  await page.waitForFunction(() => wbDraftReady);
  await expect(page.locator('#editor')).toHaveValue('CHANGED SINCE DISK SAVE');
  expect(await page.evaluate(() => [...wbPendingIds]), 'Save all modified must still find the changed chapter').toContain('a');
});

test('P2 failed rename cannot redirect a subsequent save into a new uncommitted filename', async ({ page }) => {
  await seed(page);
  await mountDisk(page);
  await page.evaluate(async () => {
    const original = wbTx;
    wbTx = (store, mode, run) => store === WB_CHAPTERS && mode === 'readwrite'
      ? Promise.reject(new DOMException('Injected rename failure', 'QuotaExceededError')) : original(store, mode, run);
    await renameChapter('a', 'Renamed');
    wbTx = original;
    await syncAllToFolder({ cloud: false });
  });
  expect(await page.evaluate(async () => ({ memory: wbChapter('a').file,
    durable: (await wbAll(WB_CHAPTERS)).find(c => c.id === 'a').file,
    disk: reviewDisk.Review }))).toEqual({ memory: 'a.md', durable: 'a.md',
    disk: { 'a.md': 'ORIGINAL a', 'b.md': 'ORIGINAL b' } });
});

test('P2 failed delete leaves both the mirror and local record intact', async ({ page }) => {
  await seed(page);
  await mountDisk(page);
  page.on('dialog', d => d.accept());
  await page.evaluate(async () => {
    const original = wbTx;
    wbTx = (store, mode, run) => store === WB_CHAPTERS && mode === 'readwrite'
      ? Promise.reject(new DOMException('Injected delete failure', 'AbortError')) : original(store, mode, run);
    await deleteChapter('b');
  });
  const state = await page.evaluate(async () => ({ disk: reviewDisk.Review['b.md'],
    local: (await wbAll(WB_CHAPTERS)).some(c => c.id === 'b'), visible: !!wbChapter('b') }));
  expect(state).toEqual({ disk: 'ORIGINAL b', local: true, visible: true });
});

test('P1 folder sync cannot mirror a stale other-tab revision', async ({ page }) => {
  await seed(page);
  await mountDisk(page);
  // Commit through an independent connection without changing this tab's
  // in-memory version map, equivalent to a second editor tab's transaction.
  await page.evaluate(async () => {
    await wbTx(WB_CHAPTERS, 'readwrite', s => s.put({ ...wbChapter('b'), content: 'NEWER OTHER TAB', updated: 2000 }));
    reviewDisk.Review['b.md'] = 'NEWER OTHER TAB';
    await syncAllToFolder({ cloud: false });
  });
  expect(await page.evaluate(() => reviewDisk.Review['b.md'])).toBe('NEWER OTHER TAB');
});

test('table builder preserves filled cells when increasing dimensions', async ({ page }) => {
  await page.evaluate(() => openTableModal());
  await page.locator('#table-preview-grid thead input').first().fill('KEEP HEADER');
  await page.locator('#table-preview-grid input[data-row="0"]').first().fill('KEEP CELL');
  await page.locator('#tbl-rows').fill('4');
  await expect(page.locator('#table-preview-grid thead input').first()).toHaveValue('KEEP HEADER');
  await expect(page.locator('#table-preview-grid input[data-row="0"]').first()).toHaveValue('KEEP CELL');
});

test('table builder round-trips literal pipes within a cell', async ({ page }) => {
  await edit(page, '');
  await page.evaluate(() => openTableModal());
  await page.locator('#table-preview-grid input[data-row="0"]').first().fill('left | right');
  await page.evaluate(() => insertTable());
  await expect(page.locator('#preview tbody tr').first().locator('td').first()).toHaveText('left | right');
});

test('P1 delayed image paste must not replace text in a different chapter', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    editor.setSelectionRange(0, 8);
    imageBlobToDataUrl = () => new Promise(resolve => { window.reviewFinishImage = resolve; });
    const dt = new DataTransfer();
    dt.items.add(new File(['test'], 'picture.png', { type: 'image/png' }));
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.evaluate(() => openChapter('b'));
  await page.evaluate(() => reviewFinishImage('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='));
  await expect(page.locator('#editor')).toHaveValue('ORIGINAL b');
});

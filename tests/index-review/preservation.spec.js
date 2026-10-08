const { test, expect, seed, edit, mountDisk, URL } = require('./helpers');

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

for (const failure of ['abort', 'request error']) {
test(`P2 pending-marker failure remains visible and survives reload (${failure})`, { tag: '@idx-pending-write-failure' }, async ({ page }) => {
  await seed(page);
  await mountDisk(page);
  await edit(page, 'CHANGED SINCE DISK SAVE');
  const result = await page.evaluate(async failure => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, ...args) {
      const req = original.call(this, value, ...args);
      if (this.name === WB_PENDING) {
        window.reviewPendingWriteFailed = true;
        if (failure === 'abort') this.transaction.abort();
        // A duplicate key produces a real failed request and aborts the write.
        else this.add(value);
      }
      return req;
    };
    const saved = await flushChapter();
    return { saved, injected: reviewPendingWriteFailed, dirty: wbDirty,
      draft: wbDraftRead(), memory: wbChapter('a').content,
      stored: (await wbAll(WB_CHAPTERS)).find(c => c.id === 'a').content,
      pending: await wbAll(WB_PENDING),
      errorShown: document.getElementById('stat-wb').textContent === t('wbStoreFailed'),
      disk: reviewDisk.Review['a.md'] };
  }, failure);
  expect(result).toMatchObject({ saved: false, injected: true, dirty: true,
    draft: { id: 'a', text: 'CHANGED SINCE DISK SAVE', dirty: true },
    memory: 'ORIGINAL a', stored: 'ORIGINAL a', pending: [],
    errorShown: true, disk: 'ORIGINAL a' });
  await page.reload();
  await page.waitForFunction(() => wbDraftReady && !wbDirty);
  await expect(page.locator('#editor')).toHaveValue('CHANGED SINCE DISK SAVE');
  expect(await page.evaluate(() => [...wbPendingIds]), 'Save all modified must still find the changed chapter').toContain('a');
  expect(await page.evaluate(async () => ({
    text: (await wbAll(WB_CHAPTERS)).find(c => c.id === 'a').content,
    pending: await wbAll(WB_PENDING)
  }))).toMatchObject({ text: 'CHANGED SINCE DISK SAVE',
    pending: [{ chapterId: 'a', content: 'CHANGED SINCE DISK SAVE' }] });
  await mountDisk(page);
  await page.evaluate(() => saveAllModifiedChapters());
  expect(await page.evaluate(async () => ({ disk: reviewDisk.Review['a.md'],
    pending: [...wbPendingIds], records: await wbAll(WB_PENDING) }))).toEqual({
    disk: 'CHANGED SINCE DISK SAVE', pending: [], records: []
  });
});
}

test('Pending-marker retry keeps the previous revision until both writes commit', { tag: '@idx-pending-write-failure' }, async ({ page }) => {
  await seed(page);
  await edit(page, 'FIRST PENDING REVISION');
  expect(await page.evaluate(() => flushChapter())).toBe(true);
  await edit(page, 'SECOND PENDING REVISION');
  const failed = await page.evaluate(async () => {
    const original = IDBObjectStore.prototype.put;
    window.reviewRestorePendingPut = () => { IDBObjectStore.prototype.put = original; };
    IDBObjectStore.prototype.put = function(value, ...args) {
      const req = original.call(this, value, ...args);
      if (this.name === WB_PENDING) this.transaction.abort();
      return req;
    };
    return { saved: await flushChapter(), dirty: wbDirty,
      stored: (await wbAll(WB_CHAPTERS)).find(c => c.id === 'a').content,
      records: await wbAll(WB_PENDING), pending: [...wbPendingIds] };
  });
  expect(failed).toMatchObject({ saved: false, dirty: true,
    stored: 'FIRST PENDING REVISION', pending: ['a'],
    records: [{ chapterId: 'a', content: 'FIRST PENDING REVISION' }] });
  const retried = await page.evaluate(async () => {
    reviewRestorePendingPut();
    return { saved: await flushChapter(), dirty: wbDirty,
      stored: (await wbAll(WB_CHAPTERS)).find(c => c.id === 'a').content,
      records: await wbAll(WB_PENDING) };
  });
  expect(retried).toMatchObject({ saved: true, dirty: false,
    stored: 'SECOND PENDING REVISION',
    records: [{ chapterId: 'a', content: 'SECOND PENDING REVISION' }] });
});

for (const action of ['chapter', 'workbook']) {
for (const failure of ['quota', 'abort']) {
test(`P2 failed rename cannot redirect a subsequent save into a new uncommitted filename (${action}, ${failure})`, { tag: '@idx-rename-store-rollback' }, async ({ page }) => {
  await seed(page);
  await mountDisk(page);
  const before = await page.evaluate(async ({ action, failure }) => {
    window.reviewRenameState = async () => {
      const draft = wbDraftRead();
      return {
        book: { ...wbBook('review-book') }, chapter: { ...wbChapter('a') },
        storedBook: (await wbAll(WB_BOOKS)).find(b => b.id === 'review-book'),
        storedChapter: (await wbAll(WB_CHAPTERS)).find(c => c.id === 'a'),
        draft: { id: draft.id, name: draft.name, text: draft.text, dirty: draft.dirty, base: draft.base },
        label: document.getElementById('current-file').textContent,
        crumb: document.getElementById('wb-crumb').textContent,
        path: document.getElementById('wb-crumb').title,
        bookName: document.querySelector('.wb-book-name[data-wb-id="review-book"]').textContent,
        chapterName: document.querySelector('.wb-ch-name[data-wb-id="a"]').textContent,
        disk: structuredClone(reviewDisk), pending: [...wbPendingIds],
        pendingRecords: await wbAll(WB_PENDING)
      };
    };
    const before = await reviewRenameState();
    const original = wbTx;
    window.reviewRestoreRenameTx = () => { wbTx = original; };
    wbTx = async (store, mode, run) => {
      if (store !== (action === 'chapter' ? WB_CHAPTERS : WB_BOOKS) || mode !== 'readwrite') return original(store, mode, run);
      window.reviewRenameStarted = true;
      await new Promise(resolve => { window.reviewReleaseRename = resolve; });
      if (failure === 'quota') throw new DOMException('Injected rename failure', 'QuotaExceededError');
      return original(store, mode, s => {
        const req = run(s);
        s.transaction.abort();
        return req;
      });
    };
    window.reviewRename = action === 'chapter'
      ? renameChapter('a', 'Renamed') : renameWorkbook('review-book', 'Renamed');
    return before;
  }, { action, failure });
  await page.waitForFunction(() => window.reviewRenameStarted);
  expect(await page.evaluate(() => reviewRenameState()), 'pending metadata must not become live').toEqual(before);
  await page.evaluate(async () => {
    reviewReleaseRename();
    await reviewRename;
    // Repainting and refreshing the journal must still use committed names.
    renderWorkbooks();
    wbDraftWrite();
  });
  expect(await page.evaluate(() => reviewRenameState()), 'failed rename preserves durable ownership').toEqual(before);
  expect(await page.evaluate(() => document.getElementById('stat-wb').textContent)).toBe(await page.evaluate(() => t('wbStoreFailed')));
  expect(await page.evaluate(() => reviewDiskEvents)).toEqual([]);
  await page.evaluate(async () => {
    reviewRestoreRenameTx();
    await syncAllToFolder({ cloud: false });
  });
  expect(await page.evaluate(() => reviewRenameState()), 'sync must not create an uncommitted path').toEqual(before);
  await page.evaluate(async action => {
    if (action === 'chapter') await renameChapter('a', 'Renamed');
    else await renameWorkbook('review-book', 'Renamed');
  }, action);
  const retried = await page.evaluate(() => reviewRenameState());
  expect(retried.book).toEqual(retried.storedBook);
  expect(retried.chapter).toEqual(retried.storedChapter);
  expect(retried).toMatchObject(action === 'chapter' ? {
    chapter: { title: 'Renamed', file: 'Renamed.md' }, label: 'Renamed.md',
    draft: { name: 'Renamed.md', text: 'ORIGINAL a' }, path: 'Review/Renamed.md',
    disk: { Review: { 'Renamed.md': 'ORIGINAL a', 'b.md': 'ORIGINAL b' } }
  } : {
    book: { name: 'Renamed', folder: 'Renamed' }, label: 'a.md',
    draft: { name: 'a.md', text: 'ORIGINAL a' }, path: 'Renamed/a.md',
    disk: { Renamed: { 'a.md': 'ORIGINAL a', 'b.md': 'ORIGINAL b' } }
  });
  expect(Object.keys(retried.disk)).toEqual([action === 'chapter' ? 'Review' : 'Renamed']);
  expect(Object.keys(retried.disk[action === 'chapter' ? 'Review' : 'Renamed']).sort()).toEqual(
    [action === 'chapter' ? 'Renamed.md' : 'a.md', 'b.md'].sort());
  expect(retried.pending).toEqual([]);
  expect(retried.pendingRecords).toEqual([]);
});
}
}

test('P2 failed delete leaves both the mirror and local record intact', { tag: '@idx-delete-store-failure' }, async ({ page }) => {
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

for (const scenario of [
  { action: 'chapter', target: 'a', store: 'chapters', key: 'a' },
  { action: 'chapter', target: 'b', store: 'chapters', key: 'b' },
  { action: 'chapter', target: 'a', store: 'pending', key: 'a' },
  { action: 'workbook', target: 'review-book', store: 'chapters', key: 'a' },
  { action: 'workbook', target: 'review-book', store: 'chapters', key: 'b' },
  { action: 'workbook', target: 'review-book', store: 'pending', key: 'b' },
  { action: 'workbook', target: 'review-book', store: 'workbooks', key: 'review-book' }
]) {
for (const failure of ['throw', 'abort']) {
test(`Failed ${scenario.action} deletion rolls back and can retry (${scenario.store}/${scenario.key}, ${failure})`, { tag: '@idx-delete-store-failure' }, async ({ page }) => {
  await seed(page);
  await mountDisk(page);
  page.on('dialog', d => d.accept());
  await page.evaluate(async () => {
    for (const ch of wbChapters) await wbPendingMark(ch);
    window.reviewDeleteGraves = [];
    window.reviewDeleteSyncs = 0;
    const tombstone = cloudTombstone;
    cloudTombstone = async id => { reviewDeleteGraves.push(id); await tombstone(id); };
    cloudAutoSync = () => { reviewDeleteSyncs++; };
    window.reviewDeleteState = async () => ({
      books: structuredClone(wbBooks), chapters: structuredClone(wbChapters),
      storedBooks: await wbAll(WB_BOOKS), storedChapters: await wbAll(WB_CHAPTERS),
      pending: [...wbPendingIds], storedPending: await wbAll(WB_PENDING),
      current: wbCurrentId, dirty: wbDirty, editor: editor.value, draft: wbDraftRead(),
      undo: structuredClone(undoStack), redo: structuredClone(redoStack),
      tree: document.getElementById('wb-tree').innerHTML,
      disk: structuredClone(reviewDisk), events: structuredClone(reviewDiskEvents),
      graves: { ...gsGraves }, storedGraves: await wbMetaGet('deleted'),
      tombstones: [...reviewDeleteGraves], syncs: reviewDeleteSyncs,
      versions: [...wbChapterVersions]
    });
  });
  await edit(page, 'UNSAVED DELETE RECOVERY');
  const before = await page.evaluate(async ({ store, key, failure }) => {
    clearTimeout(wbSaveTimer);
    clearTimeout(wbDraftTimer);
    wbDraftWrite();
    const before = await reviewDeleteState();
    const original = IDBObjectStore.prototype.delete;
    window.reviewRestoreDelete = () => { IDBObjectStore.prototype.delete = original; };
    IDBObjectStore.prototype.delete = function(id) {
      if (this.name !== store || id !== key) return original.call(this, id);
      window.reviewDeleteFailed = true;
      if (failure === 'throw') throw new DOMException('Injected delete failure', 'AbortError');
      const req = original.call(this, id);
      // Abort after earlier sibling/marker deletes have already been queued.
      this.transaction.abort();
      return req;
    };
    return before;
  }, { ...scenario, failure });
  await page.evaluate(async ({ action, target }) => {
    if (action === 'chapter') await deleteChapter(target);
    else await deleteWorkbook(target);
  }, scenario);
  expect(await page.evaluate(() => reviewDeleteFailed)).toBe(true);
  expect(await page.evaluate(() => reviewDeleteState())).toEqual(before);
  expect(await page.locator('#stat-wb').textContent()).toBe(await page.evaluate(() => t('wbStoreFailed')));

  await page.evaluate(async ({ action, target }) => {
    reviewRestoreDelete();
    if (action === 'chapter') await deleteChapter(target);
    else await deleteWorkbook(target);
  }, scenario);
  const after = await page.evaluate(() => reviewDeleteState());
  const removed = scenario.action === 'chapter' ? [scenario.target] : ['a', 'b', 'review-book'];
  const remaining = scenario.action === 'workbook' ? [] : [scenario.target === 'a' ? 'b' : 'a'];
  expect(after.chapters.map(ch => ch.id)).toEqual(remaining);
  expect(after.storedChapters.map(ch => ch.id)).toEqual(remaining);
  expect(after.books.map(book => book.id)).toEqual(scenario.action === 'workbook' ? [] : ['review-book']);
  expect(after.storedBooks.map(book => book.id)).toEqual(after.books.map(book => book.id));
  expect(after.pending).toEqual(remaining);
  expect(after.storedPending.map(record => record.chapterId)).toEqual(remaining);
  expect(after.tombstones).toEqual(removed);
  expect(Object.keys(after.graves).sort()).toEqual([...removed].sort());
  expect(after.storedGraves).toEqual(after.graves);
  expect(after.syncs).toBe(1);
  expect(after.current).toBe(scenario.action === 'chapter' && scenario.target === 'b' ? 'a' : null);
  expect(after.editor).toBe('UNSAVED DELETE RECOVERY');
  expect(after.disk).toEqual(scenario.action === 'workbook' ? {} : {
    Review: { [remaining[0] + '.md']: 'ORIGINAL ' + remaining[0] }
  });
  expect(after.versions.some(([id]) => removed.includes(id))).toBe(false);
  expect(await page.locator('#stat-wb').textContent()).toBe(await page.evaluate(() => t('wbRemoved')));
});
}
}

test('P1 folder sync cannot mirror a stale other-tab revision', { tag: '@idx-stale-folder-mirror' }, async ({ page }) => {
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
  expect(await page.evaluate(async () => ({ pending: [...wbPendingIds], records: await wbAll(WB_PENDING),
    writes: reviewDiskEvents.filter(e => e[0] === 'write' && e[2] === 'b.md') }))).toMatchObject({
    pending: ['b'], records: [{ chapterId: 'b', content: 'NEWER OTHER TAB', updated: 2000 }], writes: []
  });
});

test('Save all modified rejects a stale revision even with the same timestamp', { tag: '@idx-stale-folder-mirror' }, async ({ page }) => {
  await seed(page);
  await mountDisk(page);
  await page.evaluate(async () => {
    await wbPendingMark(wbChapter('b'));
    await wbTx(WB_CHAPTERS, 'readwrite', s => s.put({ ...wbChapter('b'), content: 'NEWER OTHER TAB' }));
    reviewDisk.Review['b.md'] = 'NEWER OTHER TAB';
    await saveAllModifiedChapters();
  });
  expect(await page.evaluate(async () => ({ disk: reviewDisk.Review['b.md'],
    pending: await wbAll(WB_PENDING), cached: wbChapter('b').content,
    editor: editor.value, writes: reviewDiskEvents }))).toMatchObject({
    disk: 'NEWER OTHER TAB', pending: [{ chapterId: 'b', content: 'NEWER OTHER TAB', updated: 1 }],
    cached: 'ORIGINAL b', editor: 'ORIGINAL a', writes: []
  });
});

for (const stage of ['directory', 'write']) {
test(`Folder save aborts a revision changed during ${stage} preparation`, { tag: '@idx-stale-folder-mirror' }, async ({ page }) => {
  await seed(page);
  await mountDisk(page);
  await page.evaluate(stage => {
    const originalDir = ScuLaFolder.dir;
    ScuLaFolder.dir = async (...args) => {
      const md = await originalDir(...args);
      if (stage === 'directory') await new Promise(resolve => { window.reviewReleaseMirror = resolve; });
      const originalBookDir = md.getDirectoryHandle;
      md.getDirectoryHandle = async (...args) => {
        const dir = await originalBookDir(...args);
        const originalFile = dir.getFileHandle;
        dir.getFileHandle = async (...args) => {
          const file = await originalFile(...args);
          const originalWritable = file.createWritable;
          file.createWritable = async () => {
            const writable = await originalWritable();
            writable.abort = async () => { window.reviewMirrorAborted = true; };
            const originalWrite = writable.write;
            writable.write = async blob => {
              await originalWrite(blob);
              if (stage === 'write') await new Promise(resolve => { window.reviewReleaseMirror = resolve; });
            };
            return writable;
          };
          return file;
        };
        return dir;
      };
      return md;
    };
    window.reviewOldMirror = wbSaveMirror(wbBook('review-book'), wbChapter('b'));
  }, stage);
  await page.waitForFunction(() => window.reviewReleaseMirror);
  await page.evaluate(async () => {
    const newer = { ...wbChapter('b'), content: 'NEWER DURING SAVE', updated: 2000 };
    await wbTx(WB_CHAPTERS, 'readwrite', s => s.put(newer));
    // The other tab has already committed its folder mirror.
    reviewDisk.Review['b.md'] = newer.content;
    reviewReleaseMirror();
    window.reviewMirrorResult = await reviewOldMirror;
  });
  expect(await page.evaluate(async () => ({ result: reviewMirrorResult, aborted: reviewMirrorAborted,
    disk: reviewDisk.Review['b.md'], pending: await wbAll(WB_PENDING), writes: reviewDiskEvents }))).toMatchObject({
    result: { path: null, failed: true, pending: true }, aborted: true,
    disk: 'NEWER DURING SAVE', pending: [{ chapterId: 'b', content: 'NEWER DURING SAVE', updated: 2000 }], writes: []
  });
});
}

test('Overlapping folder saves serialize closes and leave the newer mirror acknowledged', { tag: '@idx-stale-folder-mirror' }, async ({ page }) => {
  await seed(page);
  await mountDisk(page);
  await page.evaluate(() => {
    const originalDir = ScuLaFolder.dir;
    let held = false;
    ScuLaFolder.dir = async (...args) => {
      const md = await originalDir(...args);
      const originalBookDir = md.getDirectoryHandle;
      md.getDirectoryHandle = async (...args) => {
        const dir = await originalBookDir(...args);
        const originalFile = dir.getFileHandle;
        dir.getFileHandle = async (...args) => {
          const file = await originalFile(...args);
          const originalWritable = file.createWritable;
          file.createWritable = async () => {
            const writable = await originalWritable();
            const originalClose = writable.close;
            writable.close = async () => {
              if (!held) {
                held = true;
                await new Promise(resolve => { window.reviewReleaseMirror = resolve; });
              }
              await originalClose();
            };
            return writable;
          };
          return file;
        };
        return dir;
      };
      return md;
    };
    window.reviewOldMirror = wbSaveMirror(wbBook('review-book'), wbChapter('b'));
  });
  await page.waitForFunction(() => window.reviewReleaseMirror);
  await page.evaluate(async () => {
    const newer = { ...wbChapter('b'), content: 'NEWER QUEUED SAVE', updated: 2000 };
    await wbTx(WB_CHAPTERS, 'readwrite', s => s.put(newer));
    Object.assign(wbChapter('b'), newer);
    window.reviewNewMirror = wbSaveMirror(wbBook('review-book'), newer);
    reviewReleaseMirror();
    window.reviewMirrorResults = await Promise.all([reviewOldMirror, reviewNewMirror]);
  });
  expect(await page.evaluate(async () => ({ results: reviewMirrorResults,
    disk: reviewDisk.Review['b.md'], pending: [...wbPendingIds], records: await wbAll(WB_PENDING) }))).toMatchObject({
    results: [{ pending: true }, { failed: false, pending: false }],
    disk: 'NEWER QUEUED SAVE', pending: [], records: []
  });
});

test('Folder acknowledgement checks the durable revision after close', { tag: '@idx-stale-folder-mirror' }, async ({ page }) => {
  await seed(page);
  await mountDisk(page);
  await page.evaluate(async () => {
    const originalClear = wbPendingClear;
    wbPendingClear = async (...args) => {
      await wbTx(WB_CHAPTERS, 'readwrite', s => s.put({ ...wbChapter('b'), content: 'NEWER AFTER CLOSE', updated: 2000 }));
      reviewDisk.Review['b.md'] = 'NEWER AFTER CLOSE';
      return originalClear(...args);
    };
    window.reviewMirrorResult = await wbSaveMirror(wbBook('review-book'), wbChapter('b'));
  });
  expect(await page.evaluate(async () => ({ result: reviewMirrorResult,
    disk: reviewDisk.Review['b.md'], pending: await wbAll(WB_PENDING) }))).toMatchObject({
    result: { pending: true }, disk: 'NEWER AFTER CLOSE',
    pending: [{ chapterId: 'b', content: 'NEWER AFTER CLOSE', updated: 2000 }]
  });
});

test('Two tabs share the folder-save lock through file close', { tag: '@idx-stale-folder-mirror' }, async ({ page, context }) => {
  await seed(page);
  const other = await context.newPage();
  await other.goto(URL);
  await other.waitForFunction(() => wbDraftReady);
  await other.waitForTimeout(1350);
  const commits = [];
  for (const tab of [page, other]) {
    await mountDisk(tab);
    await tab.exposeBinding('reviewCommitMirror', (_, text) => { commits.push(text); });
    await tab.evaluate(hold => {
      const originalDir = ScuLaFolder.dir;
      ScuLaFolder.dir = async (...args) => {
        const md = await originalDir(...args);
        const originalBookDir = md.getDirectoryHandle;
        md.getDirectoryHandle = async (...args) => {
          const dir = await originalBookDir(...args);
          const originalFile = dir.getFileHandle;
          dir.getFileHandle = async (...args) => {
            const file = await originalFile(...args);
            const originalWritable = file.createWritable;
            file.createWritable = async () => {
              const writable = await originalWritable();
              const originalClose = writable.close;
              writable.close = async () => {
                if (hold) await new Promise(resolve => { window.reviewReleaseMirror = resolve; });
                await originalClose();
                await reviewCommitMirror(reviewDisk.Review['b.md']);
              };
              return writable;
            };
            return file;
          };
          return dir;
        };
        return md;
      };
    }, tab === page);
  }
  await page.evaluate(() => { window.reviewOldMirror = wbSaveMirror(wbBook('review-book'), wbChapter('b')); });
  await page.waitForFunction(() => window.reviewReleaseMirror);
  await other.evaluate(async () => {
    const ch = wbChapter('b');
    Object.assign(ch, { content: 'NEWER REAL TAB', updated: 2000 });
    await wbPut(WB_CHAPTERS, ch);
    window.reviewNewMirror = wbSaveMirror(wbBook(ch.workbookId), ch);
  });
  await other.waitForFunction(async () => (await navigator.locks.query()).pending.some(lock => lock.name === WB_DB + ':mirror:b'));
  expect(commits).toEqual([]);
  await page.evaluate(async () => { reviewReleaseMirror(); await reviewOldMirror; });
  await other.evaluate(() => reviewNewMirror);
  expect(commits).toEqual(['ORIGINAL b', 'NEWER REAL TAB']);
  expect(await other.evaluate(async () => ({ pending: [...wbPendingIds], records: await wbAll(WB_PENDING) }))).toEqual({ pending: [], records: [] });
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

const pasteImageUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';

async function startDelayedImagePaste(page) {
  await page.evaluate(() => {
    editor.setSelectionRange(0, 8);
    window.reviewOriginalImageDecode = imageBlobToDataUrl;
    imageBlobToDataUrl = () => new Promise(resolve => { window.reviewFinishImage = resolve; });
    window.reviewPasteToasts = [];
    const originalToast = ScuLaFolder.toast;
    ScuLaFolder.toast = message => { reviewPasteToasts.push(message); originalToast(message); };
    const dt = new DataTransfer();
    dt.items.add(new File(['test'], 'picture.png', { type: 'image/png' }));
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
}

async function finishStaleImagePaste(page) {
  await page.evaluate(url => reviewFinishImage(url), pasteImageUrl);
  await expect.poll(() => page.evaluate(() => reviewPasteToasts)).toEqual([
    await page.evaluate(() => t('imagePasteStale'))
  ]);
}

async function pasteState(page) {
  return page.evaluate(async () => ({
    text: editor.value, current: wbCurrentId, dirty: wbDirty,
    selection: [editor.selectionStart, editor.selectionEnd, editor.selectionDirection],
    undo: undoStack, redo: redoStack, draft: wbDraftRead(),
    stored: (await wbAll(WB_CHAPTERS)).map(c => [c.id, c.content]).sort()
  }));
}

test('P1 delayed image paste must not replace text in a different chapter', { tag: '@idx-paste-destination' }, async ({ page }) => {
  await seed(page);
  await startDelayedImagePaste(page);
  await page.evaluate(() => openChapter('b'));
  const before = await pasteState(page);
  await finishStaleImagePaste(page);
  await expect(page.locator('#editor')).toHaveValue('ORIGINAL b');
  expect(await pasteState(page)).toEqual(before);
  expect(before.stored).toEqual([['a', 'ORIGINAL a'], ['b', 'ORIGINAL b']]);

  // The original image is still available to paste again at a chosen location.
  await page.evaluate(() => openChapter('a'));
  await page.evaluate(async () => {
    imageBlobToDataUrl = reviewOriginalImageDecode;
    editor.setSelectionRange(editor.value.length, editor.value.length);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'retry.png', { type: 'image/png' }));
    await handleEditorPaste(new ClipboardEvent('paste', { clipboardData: dt, cancelable: true }));
    await flushChapter();
  });
  const retried = await pasteState(page);
  expect(retried.text).toMatch(/^ORIGINAL a!\[retry\]\(data:image\/png;base64,/);
  expect(retried.stored).toEqual([['a', retried.text], ['b', 'ORIGINAL b']]);
});

for (const change of ['text edit', 'selection offsets', 'selection direction', 'switch away and back', 'replace identical loose draft']) {
test(`P1 delayed image paste is cancelled after ${change}`, { tag: '@idx-paste-destination' }, async ({ page }) => {
  await seed(page);
  if (change === 'replace identical loose draft') await page.evaluate(() => detachChapter());
  await startDelayedImagePaste(page);
  if (change === 'text edit') {
    await edit(page, 'NEW TEXT a');
    // Restore the old offsets: changed text alone must invalidate the paste.
    await page.evaluate(async () => { editor.setSelectionRange(0, 8); await flushChapter(); });
  } else if (change === 'selection offsets') {
    await page.evaluate(() => editor.setSelectionRange(9, 10));
  } else if (change === 'selection direction') {
    await page.evaluate(() => editor.setSelectionRange(0, 8, 'backward'));
  } else if (change === 'switch away and back') {
    await page.evaluate(async () => { await openChapter('b'); await openChapter('a'); editor.setSelectionRange(0, 8); });
  } else {
    page.on('dialog', dialog => dialog.accept());
    await page.evaluate(() => newFile());
    await edit(page, 'ORIGINAL a');
    await page.evaluate(() => editor.setSelectionRange(0, 8));
  }
  const before = await pasteState(page);
  await finishStaleImagePaste(page);
  expect(await pasteState(page)).toEqual(before);
});
}

test('delayed image paste replaces an unchanged selection and supports undo, redo and autosave', { tag: '@idx-paste-destination' }, async ({ page }) => {
  await seed(page);
  await startDelayedImagePaste(page);
  await page.evaluate(url => reviewFinishImage(url), pasteImageUrl);
  const expected = `![picture](${pasteImageUrl}) a`;
  await expect(page.locator('#editor')).toHaveValue(expected);
  await expect(page.locator('#preview img')).toHaveAttribute('src', pasteImageUrl);
  await expect.poll(() => page.evaluate(async () => (await wbAll(WB_CHAPTERS)).find(c => c.id === 'a').content)).toBe(expected);
  expect(await page.evaluate(() => wbDraftRead().text)).toBe(expected);
  await page.evaluate(() => undoEdit());
  await expect(page.locator('#editor')).toHaveValue('ORIGINAL a');
  expect(await page.evaluate(() => [editor.selectionStart, editor.selectionEnd])).toEqual([0, 8]);
  await page.evaluate(() => redoEdit());
  await expect(page.locator('#editor')).toHaveValue(expected);
  await page.evaluate(async () => { await flushChapter(); await openChapter('b'); await openChapter('a'); });
  await expect(page.locator('#editor')).toHaveValue(expected);
});

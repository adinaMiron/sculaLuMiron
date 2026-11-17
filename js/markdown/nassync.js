/* ═══════════════ NAS chapter sync — docs/tasks/nas-sync/ ═══════════════
   The chapters following a folder on the person's own NAS instead of — or
   beside — a Google account. The same merge as cloudSync() (drive.js, § O):
   stable ids, newest `updated` wins per record, deletes travel as tombstones.
   Only the store differs: files found by path through ScuLaNas.store()
   (js/shared/nas.js), which is all this file knows about the NAS.

       <NAS folder>/markdown/
         .scula-index.json                 ← the manifest
         <workbook folder>/<chapter>.md
       <NAS folder>/.scula-trash/<date>/markdown/…   ← what a pass replaced or deleted

   The rules that make it safe (00-overview.md):
   · absence is never deletion — a file or folder missing on the NAS without
     a tombstone is written again, and nothing is removed here because of it;
   · nothing on the NAS is destroyed — a deleted chapter's file is moved to
     the trash, a replaced one is copied there first, and only files the
     manifest lists are touched; a file nobody listed keeps its name;
   · an unreadable or invalid manifest stops the pass before any merge;
   · every file is written under a temporary name and read back (the store);
   · the manifest goes back last, so a pass that died halfway is simply done
     again — and repeating one never makes a second copy of anything.

   What makes it safe between devices (nas-wb-conflict, nas-concurrency):
   · the newest version wins, by its `updated` stamp (the moment it was
     saved) — or, for a file changed outside the app, by the file's own
     time. No conflict chapters are made: the losing text is kept out of the
     workbook, in the trash. This device remembers, per chapter, the version
     it last saw on both sides (`nasSeen` in the meta store); a text of its
     own that loses after it moved on since is written to the trash too, so
     a clock difference never takes a text without a trace. A chapter being
     typed in while a newer version arrives holds the newest text: the
     download is left for later, and the typing goes up with the next pass;
   · a pass that writes holds an advisory lock (`.scula-lock.json`), reads
     the manifest again immediately before writing it, and when another
     device replaced it meanwhile does the merge again from theirs.

   The pass runs from syncNow() — the ☁ button, which also takes in what was
   put into the NAS folder by hand (nas-wb-adopt) — and without being asked
   when the page opens at home, when the device comes home, and after Save
   to workbook (nas-wb-auto). */

const NSYNC = { DIR: 'markdown', MANIFEST: '.scula-index.json', TRASH: '.scula-trash', SEEN: 'nasSeen',
  ROUNDS: 4,          // how often one pass starts over from a manifest another device replaced
  WAIT_MS: 8000,      // how long it waits for another device's lock before giving up
  POLL_MS: 500,
  RETRY_MS: 20000,    // a pass that gave up is tried again by itself — this much later,
  RETRIES: 8 };       // this many times
const NAS_RESTART = {};      // thrown inside a round: the manifest is not the one it read
let nasBusy = false;
let nasLast = { at: 0, error: '' };   // how the last pass of this visit ended — the save/sync row
let nasRetryTimer = 0, nasRetries = 0;

// A pass that could not have its turn — another device holds the lock, or
// kept replacing the manifest — is tried again a little later, by itself,
// whoever started it: that is what the person is told. The repeat is a run
// nobody asked for (nasAuto()).
function nasLater() {
  clearTimeout(nasRetryTimer);
  if (nasRetries++ < NSYNC.RETRIES) nasRetryTimer = setTimeout(() => nasAuto(), NSYNC.RETRY_MS);
}

// NAS sync is on when a NAS folder is remembered on this device.
function nasOn() {
  return typeof ScuLaNas !== 'undefined' && typeof ScuLaNas.pass === 'function' && !!ScuLaNas.folder();
}

// "sha256-…" of a file's bytes, or undefined where the page has no
// crypto.subtle (an insecure address): size and `updated` decide then.
async function nasHash(blob) {
  try {
    const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
    return 'sha256-' + [...sum].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) { return undefined; }
}

// The next free name: a.md, a-2.md, a-3.md — as wbUniqueFile() counts.
function nasFree(want, taken, folder) {
  const dot = folder ? -1 : want.lastIndexOf('.');
  const base = dot > 0 ? want.slice(0, dot) : want, ext = dot > 0 ? want.slice(dot) : '';
  let name = want, i = 1;
  while (taken(name)) name = base + '-' + (++i) + ext;
  return name;
}

function nasDay() {
  const d = new Date(), two = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
}

/* The manifest is the only thing a pass believes about the NAS, so it is
   checked as a whole before anything is merged: the shape Drive's manifest
   has (gsValidateManifest), that it belongs to this store, that every folder
   and file name is one the store accepts — a name read from the NAS never
   becomes a path on its own — and that no two records claim one file. */
function nasValidateManifest(text, store) {
  let man;
  try { man = JSON.parse(text); } catch (e) { throw new Error(t('nasBadManifest')); }
  if (man && typeof man === 'object' && Number.isFinite(man.v) && man.v > 1) throw new Error(t('nasNewerManifest'));
  try {
    gsValidateManifest(man, true);
    const bad = () => { throw new Error('invalid'); };
    const name = value => store.safe(value) === value;
    if (man.store !== store.id) bad();
    const folders = new Map(), files = new Set();
    for (const book of man.books) {
      const key = book.folder.toLowerCase();
      if (!name(book.folder) || [...folders.values()].includes(key)) bad();
      folders.set(book.id, key);
    }
    for (const chapter of man.chapters) {
      const key = folders.get(chapter.workbookId) + '/' + chapter.file.toLowerCase();
      if (!name(chapter.file) || files.has(key)) bad();
      files.add(key);
      if (chapter.size !== undefined && !(Number.isSafeInteger(chapter.size) && chapter.size >= 0)) bad();
      if (chapter.hash !== undefined && !/^sha256-[0-9a-f]{64}$/.test(chapter.hash)) bad();
    }
  } catch (e) { throw new Error(t('nasBadManifest')); }
  return man;
}

// A chapter a tombstone removes here. The stored record is looked at again
// inside the write: one edited after the delete — in the editor, or in
// another tab — is a deliberate re-creation and stays.
async function nasDropChapter(id, when) {
  const lc = wbChapter(id);
  if (id === wbCurrentId && (wbDirty || editor.value !== (lc.content || ''))) return false;
  let dropped = false;
  await wbTx(WB_CHAPTERS, 'readwrite', chapters => {
    const req = chapters.get(id);
    req.onsuccess = () => {
      if (req.result && (req.result.updated || 0) > when) return;
      chapters.delete(id);
      chapters.transaction.objectStore(WB_PENDING).delete(id);
      dropped = true;
    };
    return req;
  });
  if (!dropped) return false;
  wbChapterVersions.delete(id); wbConflictCopies.delete(id); wbPendingIds.delete(id);
  wbChapters = wbChapters.filter(c => c.id !== id);
  if (id === wbCurrentId) detachChapter();
  return true;
}

// Whether a file's bytes are the ones its manifest entry describes: the
// size, and the hash where both the entry and this page have one.
async function nasMatches(rc, blob) {
  if (rc.size !== undefined && rc.size !== blob.size) return false;
  if (!rc.hash) return true;
  const hash = await nasHash(blob);
  return !hash || hash === rc.hash;
}

/* What this device last saw in step, per chapter: { local, remote, hash,
   tag } — the two `updated` stamps, the manifest's hash of the file, and
   the file's size and time as this device read them (only ever compared
   with itself, to tell an untouched file without reading it again). It
   belongs to one NAS folder; another folder starts with nothing seen. */
async function nasSeenLoad(store) {
  let rec = null;
  try { rec = await wbMetaGet(NSYNC.SEEN); } catch (e) {}
  return rec && rec.store === store.id && rec.chapters && typeof rec.chapters === 'object' ? rec.chapters : {};
}
const nasMovedHere = (saw, lc) => !saw || (lc.updated || 0) !== saw.local;
const nasMovedThere = (saw, rc) => !saw || (rc.updated || 0) !== saw.remote || (rc.hash || '') !== (saw.hash || '');

/* The text here that is about to lose to a newer one: written into the
   pass's trash folder beside the file it was (Optica.md → "Optica (Linux-3f9a
   1a2b3c4d).md"), not into the workbook. Nothing is kept when it would keep
   nothing: no text, the very text that wins, or a beginning of it (a write
   that was cut short). The name comes from the text, so a pass that died
   after writing it and is done again writes the same file, not a second. */
async function nasKeepOld(store, run, folder, file, text, winner) {
  if (!text.trim() || winner.startsWith(text)) return;
  const blob = new Blob([text], { type: 'text/markdown' });
  const sum = ((await nasHash(blob)) || 'sha256-' + text.length.toString(16) + Date.now().toString(16)).slice(7, 15);
  const dot = file.lastIndexOf('.');
  const name = store.safe((dot > 0 ? file.slice(0, dot) : file) + ' (' + run.device + ' ' + sum + ')' + (dot > 0 ? file.slice(dot) : ''));
  await store.write(folder.concat(name), blob);
  run.older++;
}

/* The lock. A pass that only reads takes none, so one that finds nothing to
   do writes nothing; the first write takes it. Another device's lock is
   waited for, a little; then the pass gives up ("locked") and is tried
   again later. */
const nasSleep = ms => new Promise(done => setTimeout(done, ms));
async function nasClaim(store, run) {
  const until = Date.now() + NSYNC.WAIT_MS;
  for (;;) {
    if (await store.lock([NSYNC.DIR])) { run.claimed = true; run.at = Date.now(); return; }
    // (A lock this pass held and lost ran out under it: not waited for.)
    if (run.claimed || Date.now() >= until) throw new Error('locked');
    await nasSleep(NSYNC.POLL_MS);
  }
}
// The store as a round uses it: reading is free, and every call that changes
// the NAS first makes sure this device holds the lock. Taking it is also the
// moment to look at the manifest again — if another device replaced it since
// this round read it, nothing more is written from the old one.
function nasGuarded(store, run) {
  const claim = async () => {
    if (run.claimed && Date.now() - run.at < store.LOCK_MS / 2) return;
    const first = !run.claimed;
    await nasClaim(store, run);
    if (!first || run.manText === undefined) return;
    const again = await store.read([NSYNC.DIR, NSYNC.MANIFEST]);
    if ((again ? await again.blob.text() : null) !== run.manText) throw NAS_RESTART;
  };
  const changing = name => async (...args) => { await claim(); return store[name](...args); };
  return { id: store.id, safe: store.safe, read: store.read, list: store.list, claim: claim,
           write: changing('write'), move: changing('move'), copy: changing('copy'),
           mkdir: changing('mkdir'), rmdir: changing('rmdir') };
}

/* One pass: rounds of the merge until one of them ends on the manifest it
   started from. `store` is the file store of the NAS folder; a throw from it
   ends the pass with everything written so far still consistent, because
   the manifest has not been replaced. { adopt:true } — the ☁ press, never a
   run nobody asked for — also takes in what was put into the folder by hand. */
async function nasPass(store, opts) {
  const run = { claimed: false, at: 0, manText: undefined, round: 0, device: (await ScuLaNas.device()).name,
                up: 0, down: 0, gone: 0, older: 0, found: { books: 0, chapters: 0 },
                freshBooks: new Map(), freshChaps: new Map() };
  const guarded = nasGuarded(store, run);
  try {
    for (; run.round < NSYNC.ROUNDS; run.round++) {
      if (!run.claimed) {
        const until = Date.now() + NSYNC.WAIT_MS;
        for (;;) {
          const who = await store.lockOf([NSYNC.DIR]);
          // Ours, with no pass running (ScuLaNas.pass() allows one): left by
          // a pass that died. It would only make the other devices wait.
          if (who === 'mine') await store.unlock([NSYNC.DIR]);
          if (who !== 'other') break;
          if (Date.now() >= until) throw new Error('locked');
          await nasSleep(NSYNC.POLL_MS);
        }
      }
      try {
        await nasRound(guarded, opts, run);
        return { up: run.up, down: run.down, gone: run.gone, older: run.older, found: run.found };
      } catch (e) { if (e !== NAS_RESTART) throw e; }
    }
    throw Object.assign(new Error(t('nasChanged')), { later: true });
  } finally {
    if (run.claimed) { try { await store.unlock([NSYNC.DIR]); } catch (e) {} }
  }
}

/* One round, step for step as cloudSync(): the manifest, the tombstones,
   the workbooks, what was put there by hand, the chapters, the manifest
   back. Throws NAS_RESTART when the manifest it read is no longer the one
   on the NAS; what it did until then stands, and is found again. */
async function nasRound(store, opts, run) {
  const MD = NSYNC.DIR, manPath = [MD, NSYNC.MANIFEST];

  /* 1. the manifest. Only an absent one means an empty store. */
  let man = { v: 1, store: store.id, books: [], chapters: [], deleted: {} }, manText = null;
  const found = await store.read(manPath);
  if (found) {
    manText = await found.blob.text();
    man = nasValidateManifest(manText, store);
  }
  run.manText = manText;
  const manFolder = new Map(man.books.map(b => [b.id, b.folder]));   // where each workbook's files stand now
  const remBooks = new Map(man.books.map(b => [b.id, b]));
  const remChaps = new Map(man.chapters.map(c => [c.id, c]));
  const day = nasDay();
  const toTrash = path => [NSYNC.TRASH, day].concat(path);
  const at = (folder, file) => folder.toLowerCase() + '/' + file.toLowerCase();
  const typing = lc => lc.id === wbCurrentId && (wbDirty || editor.value !== (lc.content || ''));

  /* 1b. started over, after taking in a folder or a file by hand: if the
     other device took in the same one at that moment, theirs stands and
     ours — made seconds ago from the same file — is withdrawn, unless it
     has been worked on since. */
  if (run.freshBooks.size || run.freshChaps.size) {
    const theirFile = new Map(man.chapters.map(c => [at(manFolder.get(c.workbookId), c.file), c.id]));
    for (const [id, was] of [...run.freshChaps]) {
      const other = theirFile.get(was.at), lc = wbChapter(id);
      if (!other || other === id || !lc || wbChapterVersion(lc) !== was.version) continue;
      if (await nasDropChapter(id, Infinity)) { run.freshChaps.delete(id); run.found.chapters--; }
    }
    // A workbook made of the same folder: theirs stands, and what is left of
    // ours — files they had not seen yet — becomes chapters of theirs.
    const theirBook = new Map(man.books.map(b => [b.folder.toLowerCase(), b.id]));
    for (const [id, folder] of [...run.freshBooks]) {
      const other = theirBook.get(folder);
      if (!other || other === id) continue;
      for (const c of wbChapters.filter(c => c.workbookId === id)) {
        const moved = { ...c, workbookId: other };
        if (!await wbPersist(WB_CHAPTERS, moved)) throw new Error(t('wbStoreFailed'));
        Object.assign(c, moved);
        if (run.freshChaps.has(c.id)) run.freshChaps.get(c.id).version = wbChapterVersion(c);
      }
      await wbDrop(WB_BOOKS, id);
      wbBooks = wbBooks.filter(b => b.id !== id);
      wbOpenBooks.delete(id);
      run.freshBooks.delete(id); run.found.books--;
    }
  }

  /* 2. tombstones — the ones Drive sync keeps (`deleted` in the meta store),
     merged both ways and applied to both sides. A record edited after its
     delete was recorded wins over the grave, on whichever side it is, and a
     workbook that still has a living chapter is not removed from under it. */
  let stored = {};
  try { stored = (await wbMetaGet('deleted')) || {}; } catch (e) {}
  const graves = Object.assign({}, man.deleted);
  for (const mine of [stored, gsGraves]) {
    for (const id in mine) if (Number.isFinite(mine[id]) && (!(id in graves) || mine[id] > graves[id])) graves[id] = mine[id];
  }
  const cutoff = Date.now() - GSYNC.GRAVE_MS;
  for (const id in graves) if (graves[id] < cutoff) delete graves[id];

  const after = (record, when) => !!record && (record.updated || 0) > when;
  for (const id of Object.keys(graves)) {
    const when = graves[id], rc = remChaps.get(id), lc = wbChapter(id);
    if (!rc && !lc) continue;
    if (after(rc, when) || after(lc, when) || (lc && !await nasDropChapter(id, when))) { delete graves[id]; continue; }
    if (rc) {
      // Moved, not erased — and only because the manifest listed it.
      if (await store.move([MD, manFolder.get(rc.workbookId), rc.file], toTrash([MD, manFolder.get(rc.workbookId), rc.file]))) run.gone++;
      remChaps.delete(id);
    }
  }
  for (const id of Object.keys(graves)) {
    const when = graves[id], rb = remBooks.get(id), lb = wbBook(id);
    if (!rb && !lb) continue;
    const used = wbChapters.some(c => c.workbookId === id) || [...remChaps.values()].some(c => c.workbookId === id);
    if (after(rb, when) || after(lb, when) || used) { delete graves[id]; continue; }
    if (lb) {
      await wbDrop(WB_BOOKS, id);
      wbBooks = wbBooks.filter(b => b.id !== id);
      wbOpenBooks.delete(id);
    }
    if (rb) {
      // Its listed files went to the trash above. The folder goes only if
      // that left it empty: what a person put there by hand stays, in place.
      await store.rmdir([MD, rb.folder]);
      remBooks.delete(id);
    }
  }
  gsGraves = graves;
  try { await wbMetaSet('deleted', graves); } catch (e) {}

  /* 3. workbooks — newest `updated` wins, in both directions */
  for (const rb of remBooks.values()) {
    const lb = wbBook(rb.id);
    if (lb && (lb.updated || 0) >= (rb.updated || 0)) continue;
    const book = { ...(lb || { id: rb.id, created: rb.created || Date.now() }), name: rb.name,
                   folder: wbUniqueFolder(rb.name, rb.id, rb.folder), updated: rb.updated || Date.now(), order: rb.order || 0 };
    if (!await wbPersist(WB_BOOKS, book)) throw new Error(t('wbStoreFailed'));
    if (lb) Object.assign(lb, book); else wbBooks.push(book);
    run.down++;
  }
  // Each workbook's folder on the NAS. The manifest's name stands until the
  // workbook is renamed here; a new or renamed one takes its own folder name,
  // or the next free one when another workbook owns that.
  const dirOf = new Map(), outBooks = [];
  const claimed = new Set([...remBooks.values()].map(b => b.folder.toLowerCase()));
  for (const lb of wbBooks) {
    const rb = remBooks.get(lb.id), want = store.safe(lb.folder);
    let folder = rb ? rb.folder : null;
    if (!rb || ((lb.updated || 0) > (rb.updated || 0) && want.toLowerCase() !== folder.toLowerCase())) {
      if (rb) claimed.delete(folder.toLowerCase());
      folder = nasFree(want, n => claimed.has(n.toLowerCase()), true);
      claimed.add(folder.toLowerCase());
    }
    dirOf.set(lb.id, folder);
    outBooks.push({ id: lb.id, name: lb.name, folder: folder, created: lb.created || 0,
                    updated: lb.updated || 0, order: lb.order || 0 });
  }

  const seen = await nasSeenLoad(store);
  const sure = new Map();             // chapter id → the tag of its file, known to be what the manifest says

  /* 3b. what the folder holds outside the manifest — the NAS counterpart of
     wbAdoptFromFolder() and of Drive's adoption, by the same rules. A folder
     in markdown/ that no workbook owns becomes a workbook; a text file in a
     workbook's folder whose name no chapter of it has becomes a chapter,
     listed against that same file so that it is not written a second time.
     It only ever adds: a name a chapter already owns is left alone, and so
     is every name starting with a dot. The dates are this moment's, not the
     file's — file times on a share are not to be trusted. */
  if (opts && opts.adopt) {
    const usable = name => name.charAt(0) !== '.' && store.safe(name) === name;
    const byName = (a, b) => a.name.localeCompare(b.name);
    const owned = new Set([...claimed, ...man.books.map(b => b.folder.toLowerCase())]);
    for (const entry of ((await store.list([MD])) || []).filter(e => e.dir).sort(byName)) {
      if (!usable(entry.name) || owned.has(entry.name.toLowerCase())) continue;
      const now = Date.now();
      const book = { id: wbNewId('wb_'), name: entry.name, folder: wbUniqueFolder(entry.name, null, entry.name),
                     created: now, updated: now, order: wbBooks.length };
      wbBooks.push(book);
      if (!await wbPersist(WB_BOOKS, book)) { wbBooks.pop(); continue; }
      wbOpenBooks.add(book.id);
      owned.add(entry.name.toLowerCase()); claimed.add(entry.name.toLowerCase());
      dirOf.set(book.id, entry.name); manFolder.set(book.id, entry.name);
      outBooks.push({ id: book.id, name: book.name, folder: entry.name, created: now, updated: now, order: book.order });
      run.freshBooks.set(book.id, entry.name.toLowerCase());
      run.found.books++;
    }
    for (const book of wbBooks.slice()) {
      const dir = manFolder.get(book.id) || dirOf.get(book.id);    // where its files stand now
      const entries = dir ? await store.list([MD, dir]) : null;
      if (!entries) continue;
      const names = new Set(wbChaptersOf(book.id).map(c => (c.file || '').toLowerCase()));
      for (const rc of remChaps.values()) if (manFolder.get(rc.workbookId) === dir) names.add(rc.file.toLowerCase());
      let order = wbChaptersOf(book.id).length;
      for (const f of entries.filter(e => !e.dir).sort(byName)) {
        if (!usable(f.name) || !WB_ADOPT_RE.test(f.name) || names.has(f.name.toLowerCase())) continue;
        const got = await store.read([MD, dir, f.name]);
        if (!got) continue;
        const text = await got.blob.text(), now = Date.now();
        const ch = { id: wbNewId('ch_'), workbookId: book.id, title: wbTitleFromText(text, f.name.replace(/\.[^.]+$/, '')),
                     file: f.name, content: text, created: now, updated: now, order: order };
        wbChapters.push(ch);
        if (!await wbPersist(WB_CHAPTERS, ch)) { wbChapters.pop(); continue; }
        await wbPendingMark(ch);          // so the markdown folder catches up too
        // Known to the rest of this round as a chapter the NAS already holds.
        const entry = { id: ch.id, workbookId: book.id, title: ch.title, file: f.name, created: now, updated: now,
                        order: order, size: got.blob.size };
        const hash = await nasHash(got.blob);
        if (hash) entry.hash = hash;
        remChaps.set(ch.id, entry); sure.set(ch.id, got.tag);
        run.freshChaps.set(ch.id, { at: at(dir, f.name), version: wbChapterVersion(ch) });
        names.add(f.name.toLowerCase());
        order++; run.found.chapters++;
      }
    }
  }

  /* 4. chapters — the same rule, plus the file body either way. First what
     comes from the NAS: a chapter that is newer there, and one whose file is
     no longer the one the manifest describes. */
  // What stands in each workbook folder, read once: lower-cased name → the
  // entry. peek() only looks (null: no such folder); listing(), further
  // down, makes the folder it is about to write into.
  const lists = new Map();
  const peek = async folder => {
    const key = folder.toLowerCase();
    if (!lists.has(key)) {
      const entries = await store.list([MD, folder]);
      lists.set(key, entries && new Map(entries.map(e => [e.name.toLowerCase(), e])));
    }
    return lists.get(key);
  };
  // Chapters left as the NAS has them this pass (being typed in here: that
  // text is the newest and goes up with the next pass), and chapters whose
  // file the NAS must get again although its entry is not older (the file
  // there was changed outside the app, before this device's own edit).
  const held = new Set(), force = new Set();
  for (const rc of [...remChaps.values()]) {
    const lc = wbChapter(rc.id), saw = seen[rc.id];
    if (!wbBook(rc.workbookId)) continue;
    const dir = manFolder.get(rc.workbookId);
    const ahead = lc ? (rc.updated || 0) - (lc.updated || 0) : 1;
    if (ahead < 0) {
      // Ours is newer by its stamp, and is sent below. The file is read only
      // when it changed after our edit and not as this device left it — a
      // file changed by hand on the NAS since, which may be newer still.
      if (sure.has(rc.id)) continue;
      const listed = await peek(dir), there = listed && listed.get(rc.file.toLowerCase());
      if (!there || there.dir || (saw && saw.tag && saw.tag === there.tag) || !((there.modified || 0) > (lc.updated || 0))) continue;
    }
    if (ahead === 0) {
      // The same version by its stamp. Only the file is looked at — and read
      // only if it is not the file this device already found in order.
      if (sure.has(rc.id)) continue;
      const listed = await peek(dir), there = listed && listed.get(rc.file.toLowerCase());
      if (!there || there.dir) continue;                           // missing: written again below
      if ((rc.size === undefined || rc.size === there.size) && (!rc.hash || (saw && saw.tag && saw.tag === there.tag))) {
        sure.set(rc.id, there.tag);
        continue;
      }
    }
    const got = await store.read([MD, dir, rc.file]);
    if (!got) continue;               // gone without a tombstone: nothing to take; ours, if any, goes up again
    const fits = await nasMatches(rc, got.blob);
    if (ahead <= 0 && fits) { if (ahead === 0) sure.set(rc.id, got.tag); continue; }
    // Bytes the manifest does not describe: a file changed by hand — or one
    // another device is replacing right now. With the lock held and the
    // manifest still the one that was read, it is the first.
    if (!fits) await store.claim();
    // When this version was saved: the manifest's stamp, or — for a file
    // changed outside the app — the file's own time. The newest wins.
    const when = fits ? (rc.updated || 0) : (got.blob.lastModified || Date.now());
    const text = await got.blob.text();
    // The chapter here is newer — or the file holds a beginning of it, a
    // write cut short: it goes to the NAS below, over this file (which is
    // copied to the trash first).
    if (lc && (when <= (lc.updated || 0) || (!fits && (lc.content || '').startsWith(text)))) {
      if (!fits) force.add(rc.id);
      continue;
    }
    const base = wbChapterVersion(lc), baseText = lc?.content || '';
    const unchanged = () => wbChapterVersion(wbChapter(rc.id)) === base
      && !(rc.id === wbCurrentId && (wbDirty || editor.value !== baseText))
      && !wbFlushPromise;
    if (!unchanged()) { held.add(rc.id); continue; }
    let ch = { ...(lc || { id: rc.id, created: rc.created || Date.now() }) };
    ch.workbookId = rc.workbookId;
    ch.title = rc.title; ch.file = wbUniqueFile(rc.workbookId, rc.title, rc.id, rc.file);
    ch.order = rc.order || 0;
    ch.content = text;
    // A file changed by hand is a version newer than the one listed, so the
    // manifest is written again to describe it.
    ch.updated = fits ? (rc.updated || Date.now()) : Math.max(when, (rc.updated || 0) + 1);
    // The text here loses. If it had moved on since the two were last seen in
    // step (or the file is not the listed one), it is not simply dropped: it
    // goes to the NAS trash first, out of the workbook — a clock difference
    // never takes a text without a trace.
    if (lc && (!fits || nasMovedHere(saw, lc))) await nasKeepOld(store, run, toTrash([MD, dir]), rc.file, baseText, text);
    if (!await wbPullApply(rc.id, ch, lc, base, unchanged)) { held.add(rc.id); continue; }
    wbRecordResponsibles(ch.content);
    if (lc) Object.assign(lc, ch);
    else wbChapters.push(ch);
    // No await between the final revision check and replacing the editor.
    if (ch.id === wbCurrentId) loadChapterIntoEditor(ch);
    await wbPendingMark(ch);          // so the markdown folder catches up too
    if (fits) sure.set(ch.id, got.tag);
    run.down++;
  }

  /* Then what goes to the NAS. */
  const listing = async folder => {
    if (!await peek(folder)) {
      await store.mkdir([MD, folder]);
      lists.set(folder.toLowerCase(), new Map());
    }
    return lists.get(folder.toLowerCase());
  };
  // Which chapter the manifest gives each file to.
  const owner = new Map();
  for (const rc of remChaps.values()) owner.set(at(manFolder.get(rc.workbookId), rc.file), rc.id);
  const outChaps = [], noted = {};
  const note = (id, local, entry, tag) => {
    noted[id] = { local: local, remote: entry.updated || 0, hash: entry.hash || '', tag: tag || '' };
  };
  // A listed chapter this pass neither took nor sends: its entry is carried
  // as it is, so the manifest never shrinks because a file could not be read.
  const carry = async rc => {
    const from = manFolder.get(rc.workbookId), to = dirOf.get(rc.workbookId) || from;
    let file = rc.file;
    if (to !== from) {              // its workbook's folder was renamed: the file goes along
      const moved = await store.move([MD, from, rc.file], [MD, to, rc.file]);
      owner.delete(at(from, rc.file));
      if (moved) { file = moved.path[2]; (await listing(to)).set(file.toLowerCase(), { name: file, dir: false, size: rc.size || 1 }); }
      owner.set(at(to, file), rc.id);
    }
    outChaps.push(file === rc.file ? rc : { ...rc, file });
  };
  // The chapters as they are now — one a save changes while the pass is at
  // work goes up as it was, whole, and again with the next pass.
  const queue = wbChapters.map(c => ({ ...c }));
  for (let i = 0; i < queue.length; i++) {
    const lc = queue[i], saw = seen[lc.id];
    const rc = remChaps.get(lc.id), dir = dirOf.get(lc.workbookId);
    if (!dir) { if (rc) await carry(rc); continue; }       // an orphan chapter has nowhere to go
    // Held above: listed as it is, and not in step — the next pass looks again.
    if (rc && held.has(lc.id)) { await carry(rc); if (saw) noted[lc.id] = saw; continue; }
    const was = rc ? { dir: manFolder.get(rc.workbookId), file: rc.file } : null;
    const newer = !rc || (lc.updated || 0) > (rc.updated || 0) || force.has(lc.id);
    const here = !!was && was.dir === dir;                 // already in this workbook's folder
    const own = name => here && name.toLowerCase() === was.file.toLowerCase();
    const mine = name => { const id = owner.get(at(dir, name)); return !id || id === lc.id; };
    const want = store.safe(lc.file);
    const ls = await listing(dir);
    // The file it has, unless it was renamed or moved here; then the name it
    // has on this device, or the next one no other chapter owns.
    let file = here && !(newer && !own(want)) ? was.file : nasFree(want, n => !mine(n));
    let there = ls.get(file.toLowerCase());
    // Some mounts list a folder from memory (KDE's kio-fuse, see settled()
    // in nas.js): a file another device has just written may not be listed
    // yet. Before it counts as missing, it is looked for by its name.
    if (!there) {
      try {
        const got = await store.read([MD, dir, file]);
        if (got) ls.set(file.toLowerCase(), there = { name: file, dir: false, size: got.size, tag: got.tag });
      } catch (e) {
        if (!e || e.name !== 'TypeMismatchError') throw e;
        ls.set(file.toLowerCase(), there = { name: file, dir: true, size: 0, tag: '' });
      }
    }
    // In step: listed, where it should be, and no newer here.
    if (!newer && own(file) && there && !there.dir) {
      outChaps.push(rc);
      note(lc.id, lc.updated || 0, rc, sure.get(lc.id));
      continue;
    }

    // New, newer, renamed, moved to another workbook — or missing on the NAS
    // without a tombstone, which is never a delete: it is written again.
    const text = lc.content || '', blob = new Blob([text], { type: 'text/markdown' });
    const holds = async name => { const cur = await store.read([MD, dir, name]); return !!cur && cur.blob.size === blob.size && await cur.blob.text() === text; };
    // Newer here: what the NAS holds of it is about to be replaced — and is
    // kept in the trash (below), never made a chapter of its own. When both
    // sides had moved on since they were last seen in step, or the file is
    // not the listed one, the status line says an older text went there.
    let curText = null;
    if (rc && newer) {
      const cur = await store.read([MD, was.dir, was.file]);
      if (cur) {
        curText = await cur.blob.text();
        const fits = curText === text || await nasMatches(rc, cur.blob);
        if (!fits) await store.claim();
        if (curText !== text && curText.trim() && !text.startsWith(curText) && (!fits || (nasMovedHere(saw, lc) && nasMovedThere(saw, rc)))) run.older++;
      }
    }
    let write = true, tag = '';
    if (there && !own(file) && (there.dir || there.size > 0)) {
      // Something nobody listed stands under the name. If it is this very
      // text, an earlier pass was cut short after writing it. Otherwise it is
      // not ours to replace: the chapter takes the next free name — which
      // may be the one it already has. (An empty file is nobody's text.)
      if (!there.dir && await holds(there.name)) { write = false; file = there.name; }
      else {
        file = nasFree(want, n => !mine(n) || (!own(n) && ls.has(n.toLowerCase())));
        there = ls.get(file.toLowerCase());
      }
    }
    if (write && there && own(file)) {
      file = there.name;
      if (curText === text) write = false;
      // Our own listed file, about to be replaced: the old text is kept.
      else await store.copy([MD, dir, file], toTrash([MD, dir, file]));
    }
    if (write) {
      tag = (await store.write([MD, dir, file], blob, there ? undefined : { ifAbsent: true })).tag;
      run.up++;
    } else if (there) tag = there.tag || '';
    ls.set(file.toLowerCase(), { name: file, dir: false, size: blob.size, tag: tag });
    if (was && at(was.dir, was.file) !== at(dir, file)) {
      // Renamed or moved: the file under the old name was listed, so it may go.
      await store.move([MD, was.dir, was.file], toTrash([MD, was.dir, was.file]));
      (await listing(was.dir)).delete(was.file.toLowerCase());
      owner.delete(at(was.dir, was.file));
    }
    owner.set(at(dir, file), lc.id);
    const entry = { id: lc.id, workbookId: lc.workbookId, title: lc.title, file: file, created: lc.created || 0,
                    updated: lc.updated || 0, order: lc.order || 0, size: blob.size };
    const hash = await nasHash(blob);
    if (hash) entry.hash = hash;
    outChaps.push(entry);
    note(lc.id, lc.updated || 0, entry, tag);
  }
  const sent = new Set(queue.map(c => c.id));
  for (const rc of remChaps.values()) if (!sent.has(rc.id)) await carry(rc);
  // A renamed workbook's old folder, once nothing of ours is left in it.
  for (const rb of remBooks.values()) {
    if (dirOf.get(rb.id) !== rb.folder && !claimed.has(rb.folder.toLowerCase())) await store.rmdir([MD, rb.folder]);
  }

  /* 5. the manifest goes back last — only when something changed, and only
     over the one this round read. It is read again immediately before it is
     written: if another device replaced it meanwhile, theirs is merged by
     doing the round again from it. */
  // Records in id order, so that every device writes the same file for the
  // same state and "nothing changed" can be seen by comparing.
  const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  outBooks.sort(byId); outChaps.sort(byId);
  const out = { v: 1, store: store.id, updated: Date.now(), books: outBooks, chapters: outChaps, deleted: graves };
  const same = found && JSON.stringify({ ...out, updated: 0 }) === JSON.stringify({ ...man, updated: 0 });
  // (A device with nothing, on a folder with nothing, has nothing to say.)
  const nothing = !found && !outBooks.length && !outChaps.length && !Object.keys(graves).length;
  if (!same && !nothing) {
    await store.claim();
    const again = await store.read(manPath);
    if ((again ? await again.blob.text() : null) !== manText) throw NAS_RESTART;
    await store.write(manPath, new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
  }
  // Both sides are in step now: that is what the next pass compares with.
  try { await wbMetaSet(NSYNC.SEEN, { store: store.id, chapters: noted }); } catch (e) {}
}

/* Runs the pass if NAS sync is on. Resolves null when it is off (or a pass
   is already running in this tab), { ran:false, why } when it did not run —
   "away": the NAS did not answer; "busy": another pass is running, in
   another tab, or Drive's in this one; "locked": another device is syncing
   and did not finish in time (tried again later, see nasLater()) — and
   { ran:true, up, down, gone, older, found:{ books, chapters } } otherwise. Rejects with a translated reason
   when the pass had to stop. opts: see nasPass(). */
async function nasSync(opts) {
  if (nasBusy || !nasOn()) return null;
  if (gsBusy) return { ran: false, why: 'busy' };   // a Drive pass is rewriting the same lists
  nasBusy = true;
  nasPaint();
  try {
    await flushChapter();                        // the open chapter's latest text counts
    const r = await ScuLaNas.pass('chapters', store => nasPass(store, opts));
    if (!r.ran) return r;
    clearTimeout(nasRetryTimer); nasRetries = 0;
    nasLast = { at: Date.now(), error: '' };
    return { ran: true, ...r.value };
  } catch (err) {
    // What the store throws is a word; the person gets a sentence.
    const m = (err && err.message) || String(err);
    if (m === 'locked') { nasLater(); return { ran: false, why: 'locked' }; }
    if (err && err.later) nasLater();
    // The browser's own errors carry an English sentence: the person gets
    // ours, with the error's name kept for whoever has to look into it.
    const said = m === 'away' ? t('nasLost') : /^(exists|size|names|path)$/.test(m) ? t('nasWriteFailed')
      : typeof DOMException === 'function' && err instanceof DOMException ? t('nasBrowserFailed', err.name) : m;
    nasLast = { at: nasLast.at, error: said };
    throw new Error(said);
  } finally {
    nasBusy = false;
    renderWorkbooks();
    nasPaint();
  }
}

// One sentence for the status line.
function nasReport(r) {
  if (!r) return '';
  if (!r.ran) return r.why === 'away' ? t('nasAway') : r.why === 'busy' ? t('nasSyncing') : r.why === 'locked' ? t('nasLocked') : '';
  const parts = [(r.up || r.down || r.gone) ? t('nasDone', r) : t('nasNothing')];
  if (r.found && (r.found.books || r.found.chapters)) parts.push(t('nasAdopted', r.found));
  if (r.older) parts.push(t('nasOlder', r.older));
  return parts.join(' ');
}

/* ── Without being asked (nas-wb-auto) ──
   When the page opens at home, when the device comes home while it is open,
   and after Save to workbook. Never takes in hand-put files (that is the ☁
   press), never asks for anything, and says something only when something
   happened. A pass that could not have its turn — Drive's is running here,
   or another tab's pass — is tried again a little later, as one that gave
   up on another device is (nasLater(), from nasSync()). */
let nasBooted = false, nasWasHome = false;
async function nasAuto() {
  clearTimeout(nasRetryTimer);
  if (!wbBooted || !nasOn() || !ScuLaNas.status().home) return null;
  if (wbSyncBusy) { nasLater(); return null; }      // a ☁ press is still at work: after it
  let r = null;
  try { r = await nasSync(); }
  catch (e) { wbSay(t('nasError', (e && e.message) || String(e)), true); return null; }
  if (r && r.ran) {
    const found = r.found.books || r.found.chapters;
    if (r.up || r.down || r.gone || found) wbSay(nasReport(r));
  } else if (r && r.why === 'busy') nasLater();
  return r;
}
// After Save to workbook. What came down is pending (§ E): with a markdown
// folder chosen and already permitted it goes straight into it, as after a
// Drive sync — no permission prompt this late in the press.
async function nasAfterSave() {
  const r = await nasAuto();
  if (!(r && r.ran && r.down && wbFolderMode() && await ScuLaFolder.dir(false))) return;
  for (const id of [...wbPendingIds]) {
    const ch = wbChapter(id), book = ch && wbBook(ch.workbookId);
    if (book) await wbSaveMirror(book, ch);
  }
  renderWorkbooks();
}
function nasBoot() {
  if (typeof ScuLaNas === 'undefined' || !ScuLaNas.ready) return;
  ScuLaNas.ready.then(() => {
    nasBooted = true;
    nasWasHome = ScuLaNas.status().home;
    nasPaint();
    if (nasWasHome) nasAuto();
  });
}
window.addEventListener('scula-nas', ev => {
  const home = !!(ev.detail && ev.detail.home);
  if (nasBooted && home && !nasWasHome) nasAuto();
  nasWasHome = home;
  nasPaint();
});
window.addEventListener('scula-ui-lang', () => setTimeout(nasPaint, 0));

/* The NAS state in the save/sync row, beside Drive's: nothing while NAS
   sync is off; otherwise away, syncing, in step with the time, or the
   reason the last pass stopped. It
   stands inside #wb-cloud-where, which paintCloud() rebuilds — and which
   therefore calls this last. */
function nasPaint() {
  const where = document.getElementById('wb-cloud-where');
  if (!where) return;
  let el = document.getElementById('wb-nas-where');
  const on = nasOn();
  where.classList.toggle('nas', on);
  if (!on) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('span'); el.id = 'wb-nas-where'; }
  if (where.lastChild !== el) where.appendChild(el);
  const st = ScuLaNas.status();
  const hour = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  let key = 'nasRowHome', arg, tip = '';
  if (nasBusy || st.state === 'sync') key = 'nasRowSync';
  else if (st.state === 'ask') key = 'nasRowAsk';
  else if (st.state === 'error') { key = 'nasRowError'; tip = st.error; }
  else if (!st.home) key = 'nasRowAway';
  else if (nasLast.error) { key = 'nasRowError'; tip = t('nasError', nasLast.error); }
  else if (nasLast.at) { key = 'nasRowOk'; arg = hour(nasLast.at); }
  el.className = key === 'nasRowError' || key === 'nasRowAsk' ? 'warn' : '';
  el.textContent = ' · ' + t(key, arg);
  el.title = tip || t(key + 'Tip');
}

/* ═══════════════════ Google Drive sync — docs/FEATURES.md § O ═══════════════
   "Like bookmarks": the chapters follow the Google account, so every Chrome
   signed into it opens the same workbooks.

   Chrome's own bookmark sync is not reachable from a page — nothing exposes
   it — so the account-shaped store a page *can* write to is Drive. Same OAuth
   client, same lazily-fetched Google Identity Services popup and the same
   localStorage token as editor.html's Drive button (docs/FEATURES.md § D), so
   connecting on one page connects the other; only the folder differs.

   What lands in Drive is the folder mirror, one file per chapter:

       Scula Markdown/
         index.json                     ← the manifest
         <workbook folder>/<chapter>.md

   — real .md files, readable in Drive itself rather than one opaque blob.
   The manifest is what makes this a *sync* and not an upload: it carries the
   stable ids both devices agree on, each record's `updated` stamp, and the
   Drive file id to overwrite. Merge is per record, newest `updated` wins, and
   a delete leaves a tombstone so a chapter deleted here does not come back
   from the other browser.

   IndexedDB stays the source of truth on each device; Drive is a third mirror
   beside the markdown folder, never ahead of it. A pulled chapter is marked
   *pending* (§ E), so the next explicit save writes it to disk too. */

const GSYNC = {
  CLIENT_ID: "766100323605-bv0ot1d4tj6kttem6b3hacrfplohlec1.apps.googleusercontent.com",
  SCOPE: "https://www.googleapis.com/auth/drive.file",
  // Asked for only by 📥 Everything from Drive (cloudPickAll), once: Google
  // keeps the grant, so later silent sign-ins carry it and edits to files put
  // into Drive by hand can be written back to those same files.
  FULL_SCOPE: "https://www.googleapis.com/auth/drive",
  APP_ID: "766100323605",      // the Cloud project number — what ties a Picker choice to this app
  API_KEY: "",                 // optional; the Picker is shown without one (cloudPick)
  FOLDER_NAME: "Scula Markdown",
  MANIFEST: "index.json",
  POLL_MS: 120000,      // pull what the other browsers wrote, while the tab is open
  DEBOUNCE_MS: 6000,    // push, once typing has stopped
  GRAVE_MS: 90 * 24 * 3600 * 1000   // how long a tombstone is worth carrying
};

let gsToken = null, gsTokenExp = 0, gsFolder = null, gsClient = null;
let gsFolderOk = false;               // the remembered folder, confirmed against Drive this page-load
const gsDirOk = new Set();            // workbook folder ids confirmed the same way (gsDirLive)
let gsBusy = false, gsInteractive = false, gsTimer = 0, gsLastAt = 0;
let gsPicking = false;                // Google's file window is open (cloudPick)
let gsGraves = {};                    // id → deleted-at, books and chapters alike
let gsFull = false;                   // full Drive access was granted here (cloudPickAll)

// The token is editor.html's — same origin, same OAuth client, same scope —
// so connecting on either page connects both. Only the folder is ours.
try {
  const tk = localStorage.getItem('gdrive_token');
  const ex = Number(localStorage.getItem('gdrive_token_exp')) || 0;
  if (tk && ex > Date.now() + 60000) { gsToken = tk; gsTokenExp = ex; }
  gsFolder = JSON.parse(localStorage.getItem('gdrive_md_folder') || 'null');
  gsLastAt = Number(localStorage.getItem('gdrive_md_at')) || 0;
  gsFull = localStorage.getItem('gdrive_md_full') === '1';
} catch (e) {}

function gsLive() { return !!gsToken && gsTokenExp > Date.now() + 60000; }
// Connected means "set up here" — a stored folder outlives the hour-long
// token, and that is the difference between "sign in" and "sign in again".
function gsConnected() { return !!(gsFolder && gsFolder.id) || gsLive(); }

function gsLoadScript(src) {
  return new Promise((resolve, reject) => {
    const found = document.querySelector('script[data-src="' + src + '"]');
    if (found) {
      if (found.dataset.loaded) return resolve();
      found.addEventListener('load', () => resolve());
      found.addEventListener('error', () => reject(new Error(src)));
      return;
    }
    const s = document.createElement('script');
    s.src = src; s.async = true; s.dataset.src = src;
    s.addEventListener('load', () => { s.dataset.loaded = '1'; resolve(); });
    s.addEventListener('error', () => reject(new Error(src)));
    document.head.appendChild(s);
  });
}

function gsForget(tokenOnly) {
  if (gsToken && window.google && google.accounts && google.accounts.oauth2)
    try { google.accounts.oauth2.revoke(gsToken, () => {}); } catch (e) {}
  gsToken = null; gsTokenExp = 0;
  try {
    localStorage.removeItem('gdrive_token');
    localStorage.removeItem('gdrive_token_exp');
    if (!tokenOnly) {
      localStorage.removeItem('gdrive_md_folder'); localStorage.removeItem('gdrive_md_at');
      localStorage.removeItem('gdrive_md_full');
    }
  } catch (e) {}
  if (!tokenOnly) { gsFolder = null; gsFolderOk = false; gsLastAt = 0; gsDirOk.clear(); gsFull = false; }
}

/* A background sync must never open a popup — nobody asked for one, and a
   popup blocker would eat it anyway. So the interactive flag travels with the
   call: without it an expired token is an error to report quietly, not a
   sign-in to demand.

   { full } asks for the whole Drive on top of drive.file (cloudPickAll). Once
   granted it is asked for again with every sign-in, which Google answers
   without a consent screen. A person who unticks it in Google's window gets
   a working drive.file token and an error saying the access was not given. */
async function gsAuth(interactive, full) {
  if (gsLive() && !full) return gsToken;
  if (!interactive) throw new Error('stale');
  await gsLoadScript('https://accounts.google.com/gsi/client');
  return new Promise((resolve, reject) => {
    if (!gsClient) {
      gsClient = google.accounts.oauth2.initTokenClient({
        client_id: GSYNC.CLIENT_ID, scope: GSYNC.SCOPE, callback: () => {}
      });
    }
    gsClient.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error_description || resp.error));
      gsToken = resp.access_token;
      gsTokenExp = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
      try {
        localStorage.setItem('gdrive_token', gsToken);
        localStorage.setItem('gdrive_token_exp', String(gsTokenExp));
      } catch (e) {}
      if (full && !google.accounts.oauth2.hasGrantedAllScopes(resp, GSYNC.FULL_SCOPE))
        return reject(new Error(t('cloudAllDenied')));
      resolve(gsToken);
    };
    // Closing the popup is an answer, not a failure to shout about.
    gsClient.error_callback = (err) => reject(new Error((err && err.type) || 'cancelled'));
    const scope = GSYNC.SCOPE + (full || gsFull ? ' ' + GSYNC.FULL_SCOPE : '');
    gsClient.requestAccessToken({ prompt: '', scope: scope });
  });
}

// Every Drive call goes through here, so one expired token buys exactly one
// silent re-auth and retry rather than surfacing as a bare 401.
async function gsRaw(url, opts, retried) {
  const token = await gsAuth(gsInteractive);
  const o = Object.assign({}, opts || {});
  o.headers = Object.assign({}, o.headers || {}, { Authorization: 'Bearer ' + token });
  const r = await fetch(url, o);
  if (r.status === 401 && !retried) { gsForget(true); return gsRaw(url, opts, true); }
  if (!r.ok) {
    let msg = r.status + '';
    try { const e = await r.json(); msg = (e.error && e.error.message) || msg; } catch (e) {}
    const err = new Error(msg); err.status = r.status; throw err;
  }
  return r;
}
const gsJson = (url, opts) => gsRaw(url, opts).then(r => r.json());
const gsText = (url, opts) => gsRaw(url, opts).then(r => r.text());

const GS_FILES = 'https://www.googleapis.com/drive/v3/files';
const GS_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const GS_DIR_MIME = 'application/vnd.google-apps.folder';

/* drive.file only ever lists what this page itself made, so a name search is
   already scoped to our own files — it cannot see, or collide with, anything
   else in the account. With full access (cloudPickAll) every search here is
   still limited to one parent folder, except the root's own (gsFindRoot). */
async function gsChild(name, parentId, isFolder) {
  const q = "name='" + String(name).replace(/'/g, "\\'") + "' and trashed=false"
          + (parentId ? " and '" + parentId + "' in parents" : '')
          + (isFolder ? " and mimeType='" + GS_DIR_MIME + "'" : '');
  const r = await gsJson(GS_FILES + '?pageSize=1&fields=files(id,name)&q=' + encodeURIComponent(q));
  return (r.files && r.files[0]) || null;
}
// Everything directly inside one folder, all pages of it — for the adoption
// step of an explicit sync (cloudSync, 3b).
async function gsList(parentId) {
  const q = "'" + parentId + "' in parents and trashed=false";
  const out = [];
  let page = '';
  do {
    const r = await gsJson(GS_FILES + '?pageSize=1000&fields=nextPageToken,files(id,name,mimeType,modifiedTime)&q='
      + encodeURIComponent(q) + (page ? '&pageToken=' + encodeURIComponent(page) : ''));
    out.push(...((r && r.files) || []));
    page = (r && r.nextPageToken) || '';
  } while (page);
  return out;
}
function gsMakeFolder(name, parentId) {
  const body = { name: name, mimeType: GS_DIR_MIME };
  if (parentId) body.parents = [parentId];
  return gsJson(GS_FILES + '?fields=id,name', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
}
function gsRename(id, name) {
  return gsJson(GS_FILES + '/' + id + '?fields=id,name', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name })
  });
}
// What the page may know about one id: null when Google will not show it —
// gone, or simply not shared with this app.
async function gsMeta(id) {
  try { return await gsJson(GS_FILES + '/' + id + '?fields=id,name,mimeType,parents,trashed'); }
  catch (e) { if (e.status !== 404 && e.status !== 403) throw e; return null; }
}
const gsDownload = id => gsText(GS_FILES + '/' + id + '?alt=media');
const gsTrash = id => gsRaw(GS_FILES + '/' + id, { method: 'DELETE' }).then(() => true, () => false);

// One call for both halves of "write a file": POST creates, PATCH overwrites
// and renames in the same breath, which is what makes a renamed chapter move
// rather than duplicate.
async function gsWrite(name, parentId, blob, fileId) {
  const meta = fileId ? { name: name } : { name: name, parents: [parentId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  form.append('file', blob);
  const url = GS_UPLOAD + (fileId ? '/' + fileId : '') + '?uploadType=multipart&fields=id,name';
  try {
    return await gsJson(url, { method: fileId ? 'PATCH' : 'POST', body: form });
  } catch (e) {
    // The file was removed in Drive since we last saw it — make a new one
    // rather than losing the chapter. Only on a 404: a 403 is usually a rate
    // limit, and re-creating there would duplicate the chapter instead.
    if (fileId && e.status === 404) return gsWrite(name, parentId, blob, null);
    // No file to overwrite and still a 404: the *folder* is gone. Forget that
    // it was confirmed, so the next pass checks it and makes it again.
    if (e.status === 404) gsDirOk.delete(parentId);
    throw e;
  }
}

/* A remembered id is not a folder. It can have been deleted, emptied into the
   bin, or made by a different Google account than the one signed in now — and
   Drive accepts a file into a binned folder without complaint, which is exactly
   how a sync reports success with nothing to show for it in My Drive. So the
   cached id is confirmed once per page-load, and a folder that is gone is made
   again rather than written into. */
async function gsRoot() {
  if (gsFolder && gsFolder.id && gsFolderOk) return gsFolder;
  if (gsFolder && gsFolder.id) {
    let live = null;
    try { live = await gsJson(GS_FILES + '/' + gsFolder.id + '?fields=id,name,trashed'); }
    catch (e) { if (e.status !== 404 && e.status !== 403) throw e; }
    if (live && !live.trashed) return gsRootIs({ id: live.id, name: live.name });
    gsFolder = null;
  }
  return gsRootIs((await gsFindRoot()) || (await gsMakeFolder(GSYNC.FOLDER_NAME, null)));
}
/* A device with no remembered folder — a new phone, a new browser — finds
   the root by name, and the name is not always unique: a root made again
   after the old one was binned, or one made by a device that connected
   before the first had synced, are the same name. Taking whichever Drive
   lists first could land a new phone in an empty one and pull nothing; the
   root that holds the newest manifest is the one the chapters are in. */
async function gsFindRoot() {
  const q = "name='" + GSYNC.FOLDER_NAME.replace(/'/g, "\\'") + "' and trashed=false and mimeType='" + GS_DIR_MIME + "'";
  const r = await gsJson(GS_FILES + '?pageSize=20&fields=files(id,name)&q=' + encodeURIComponent(q));
  const all = (r && r.files) || [];
  if (all.length < 2) return all[0] || null;
  let best = null, bestAt = -1;
  for (const f of all) {
    const mq = "name='" + GSYNC.MANIFEST + "' and trashed=false and '" + f.id + "' in parents";
    let m = null;
    try { m = await gsJson(GS_FILES + '?pageSize=1&fields=files(id,modifiedTime)&q=' + encodeURIComponent(mq)); }
    catch (e) { continue; }
    const hit = m && m.files && m.files[0];
    const at = hit ? (Date.parse(hit.modifiedTime) || 0) : -1;
    if (!best || at > bestAt) { best = f; bestAt = at; }
  }
  return best;
}
function gsRootIs(folder) {
  gsFolder = { id: folder.id, name: folder.name };
  gsFolderOk = true;
  try { localStorage.setItem('gdrive_md_folder', JSON.stringify(gsFolder)); } catch (e) {}
  return gsFolder;
}

/* The same doubt, for a workbook's folder id in the manifest. One that was
   deleted in Drive (or taken down with another workbook that shared it) made
   every write into it a 404, the pass died before the manifest went back, and
   the next pass redid the whole grave list against files already gone. Only
   a 404 means gone: a 403 is usually a rate limit, and re-making the folder
   there would split the workbook in two. */
async function gsDirLive(id) {
  if (gsDirOk.has(id)) return true;
  let live = null;
  try { live = await gsJson(GS_FILES + '/' + id + '?fields=id,trashed'); }
  catch (e) { if (e.status !== 404) throw e; }
  if (!live || live.trashed) return false;
  gsDirOk.add(id);
  return true;
}

/* ── Tombstones ──
   Without one, deleting a chapter here and syncing would simply pull it back
   from the other browser's copy. The grave outlives the record, on both
   sides, and is dropped after GRAVE_MS. */
async function gsGravesLoad() {
  try { gsGraves = (await wbMetaGet('deleted')) || {}; } catch (e) { gsGraves = {}; }
}
async function cloudTombstone(id) {
  if (!id) return;
  gsGraves[id] = Date.now();
  try { await wbMetaSet('deleted', gsGraves); } catch (e) {}
}

/* ── The sync ──
   One pass: read the manifest, merge it against IndexedDB record by record,
   move only what differs, write the manifest back. Returns {up, down} so the
   caller can say what happened.

   { adopt: true } — the ☁ press and Connect, never a background run — also
   takes in what Drive holds that no manifest lists (step 3b): the Drive
   counterpart of wbAdoptFromFolder(). drive.file shows this page only the
   files it made itself and the ones chosen for it in Google's Picker
   (cloudPick), so that is what can be found there. */
function gsValidateManifest(man) {
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const stamp = value => Number.isFinite(value) && value >= 0;
  const strings = (record, fields) => fields.every(field => typeof record[field] === 'string');
  const ids = new Set(), books = new Set();
  const record = (value, fields) => object(value) && strings(value, fields)
    && value.id && !ids.has(value.id) && stamp(value.updated)
    && (value.created === undefined || stamp(value.created))
    && (value.order === undefined || Number.isFinite(value.order));
  const invalid = () => { throw new Error('Invalid Drive manifest'); };
  if (!object(man)) invalid();
  if (man.v !== 1) throw new Error('Unsupported Drive manifest version');
  if (!Array.isArray(man.books) || !Array.isArray(man.chapters) || !object(man.deleted)
      || (man.updated !== undefined && !stamp(man.updated))) invalid();
  for (const book of man.books) {
    if (!record(book, ['id', 'name', 'folder', 'driveId']) || !book.driveId || !book.folder) invalid();
    ids.add(book.id); books.add(book.id);
  }
  for (const chapter of man.chapters) {
    if (!record(chapter, ['id', 'workbookId', 'title', 'file', 'driveId'])
        || !books.has(chapter.workbookId) || !chapter.file || !chapter.driveId) invalid();
    ids.add(chapter.id);
  }
  if (!Object.values(man.deleted).every(stamp)) invalid();
  return man;
}

async function cloudSync(interactive, opts) {
  if (gsBusy) return null;
  if (location.protocol === 'file:') { if (interactive) ScuLaFolder.toast(t('cloudNoFile')); return null; }
  if (!interactive && !gsLive()) { paintCloud(); return null; }

  gsBusy = true; gsInteractive = !!interactive; paintCloud();
  let up = 0, down = 0;
  try {
    await flushChapter();                        // the open chapter's latest text counts
    const rootId = (await gsRoot()).id;

    /* 1. the manifest */
    let man = { v: 1, books: [], chapters: [], deleted: {} }, manId = null;
    const found = await gsChild(GSYNC.MANIFEST, rootId, false);
    if (found) {
      manId = found.id;
      // Only an absent index means an empty workspace. An unreadable or
      // invalid existing index must stop the pass before any merge or write.
      man = gsValidateManifest(JSON.parse(await gsDownload(found.id)));
    }
    const remBooks = new Map((man.books || []).map(b => [b.id, b]));
    const remChaps = new Map((man.chapters || []).map(c => [c.id, c]));

    /* 2. tombstones, merged both ways, then applied to both sides */
    const graves = Object.assign({}, man.deleted || {});
    for (const id in gsGraves) if (!(id in graves) || gsGraves[id] > graves[id]) graves[id] = gsGraves[id];
    const cutoff = Date.now() - GSYNC.GRAVE_MS;
    for (const id in graves) if (graves[id] < cutoff) delete graves[id];

    for (const id in graves) {
      const when = graves[id];
      const rc = remChaps.get(id);
      if (rc) { if (rc.driveId) await gsTrash(rc.driveId); remChaps.delete(id); }
      const rb = remBooks.get(id);
      if (rb) {
        remBooks.delete(id);
        // Deleting a Drive folder takes everything in it. A folder another
        // workbook still writes into (two same-named workbooks used to share
        // one) stays; only this workbook's chapters, graved above, go.
        const shared = rb.driveId && [...remBooks.values()].some(o => o.driveId === rb.driveId);
        if (rb.driveId && !shared) { await gsTrash(rb.driveId); gsDirOk.delete(rb.driveId); }
      }
      // A local record edited *after* the delete was recorded elsewhere is a
      // deliberate re-creation, and wins over the grave.
      const lc = wbChapter(id);
      if (lc && (lc.updated || 0) <= when) {
        try { await wbDrop(WB_CHAPTERS, id); } catch (e) {}
        await wbPendingClear(id);
        wbChapters = wbChapters.filter(c => c.id !== id);
        if (id === wbCurrentId) detachChapter();
      }
      const lb = wbBook(id);
      if (lb && (lb.updated || 0) <= when) {
        try { await wbDrop(WB_BOOKS, id); } catch (e) {}
        wbBooks = wbBooks.filter(b => b.id !== id);
        wbOpenBooks.delete(id);
      }
    }
    gsGraves = graves;
    try { await wbMetaSet('deleted', gsGraves); } catch (e) {}

    /* 3. workbooks — newest `updated` wins, in both directions */
    for (const rb of remBooks.values()) {
      const lb = wbBook(rb.id);
      if (!lb) {
        const book = { id: rb.id, name: rb.name, folder: wbUniqueFolder(rb.name, rb.id, rb.folder), created: rb.created || Date.now(),
                       updated: rb.updated || Date.now(), order: rb.order || 0 };
        wbBooks.push(book);
        await wbPersist(WB_BOOKS, book);
        down++;
      } else if ((rb.updated || 0) > (lb.updated || 0)) {
        lb.name = rb.name; lb.folder = wbUniqueFolder(rb.name, rb.id, rb.folder);
        lb.order = rb.order || 0; lb.updated = rb.updated;
        await wbPersist(WB_BOOKS, lb);
        down++;
      }
    }
    const outBooks = [];
    const dirOf = new Map();          // book id → its Drive folder id, this pass
    const rehomed = new Map();        // book id → 'gone' | 'shared': its chapter files must be written anew
    const claimed = new Set();        // folder ids a workbook already owns — one folder, one workbook
    for (const lb of wbBooks) {
      const rb = remBooks.get(lb.id);
      if (!rb || !rb.driveId || claimed.has(rb.driveId)) continue;
      if (await gsDirLive(rb.driveId)) { claimed.add(rb.driveId); dirOf.set(lb.id, rb.driveId); }
      else rehomed.set(lb.id, 'gone');
    }
    for (const lb of wbBooks) {
      const rb = remBooks.get(lb.id);
      let driveId = dirOf.get(lb.id);
      if (driveId && rb.folder !== lb.folder && (lb.updated || 0) > (rb.updated || 0)) {
        try { await gsRename(driveId, lb.folder); } catch (e) {}
      }
      if (!driveId) {
        if (rb && rb.driveId && !rehomed.has(lb.id)) rehomed.set(lb.id, 'shared');
        // A same-named folder is only reused when no other workbook owns it,
        // or two workbooks end up in one folder and deleting either empties both.
        let dir = await gsChild(lb.folder, rootId, true);
        if (!dir || claimed.has(dir.id)) dir = await gsMakeFolder(lb.folder, rootId);
        driveId = dir.id;
        claimed.add(driveId);
        gsDirOk.add(driveId);
      }
      dirOf.set(lb.id, driveId);
      outBooks.push({ id: lb.id, name: lb.name, folder: lb.folder, created: lb.created || 0,
                      updated: lb.updated || 0, order: lb.order || 0, driveId: driveId });
    }

    /* 3b. what Drive holds outside the manifest. A folder under the root
       that no workbook owns becomes a workbook; a text file in a workbook's
       folder that no chapter owns becomes a chapter, listed against that
       same Drive file so it is not uploaded a second time. Like the folder
       pass it only ever adds: a name a chapter already has is left alone —
       except that a local chapter the manifest has not met yet is paired
       with the same-named file, rather than leaving two of them in Drive.
       The newer of the two wins: a Drive file changed after the local copy
       (an older file in the markdown folder) is pulled into the chapter and
       marked pending, so the folder catches up; otherwise the chapter
       overwrites the file. An open chapter with unsaved typing always wins. */
    const takeover = new Map();       // local chapter id → the unlisted Drive file it overwrites
    if (opts && opts.adopt) {
      for (const dir of await gsList(rootId)) {
        if (dir.mimeType !== GS_DIR_MIME || claimed.has(dir.id) || dir.name.charAt(0) === '.') continue;
        const book = { id: wbNewId('wb_'), name: dir.name, folder: wbUniqueFolder(dir.name, null, dir.name),
                       created: Date.now(), updated: Date.now(), order: wbBooks.length };
        wbBooks.push(book);
        if (!await wbPersist(WB_BOOKS, book)) { wbBooks.pop(); continue; }
        wbOpenBooks.add(book.id);
        claimed.add(dir.id); gsDirOk.add(dir.id); dirOf.set(book.id, dir.id);
        outBooks.push({ id: book.id, name: book.name, folder: book.folder, created: book.created,
                        updated: book.updated, order: book.order, driveId: dir.id });
        down++;
      }
      const owned = new Set([...remChaps.values()].map(c => c.driveId));
      for (const book of wbBooks.slice()) {
        const dirId = dirOf.get(book.id);
        if (!dirId) continue;
        // file name → the local chapter that has it, or null when only the
        // manifest does (a chapter step 4 is about to pull)
        const names = new Map();
        for (const rc of remChaps.values()) if (rc.workbookId === book.id) names.set(rc.file.toLowerCase(), null);
        for (const c of wbChaptersOf(book.id)) names.set((c.file || '').toLowerCase(), c);
        let order = wbChaptersOf(book.id).length;
        for (const f of await gsList(dirId)) {
          if (f.mimeType === GS_DIR_MIME || owned.has(f.id) || !WB_ADOPT_RE.test(f.name)) continue;
          const key = f.name.toLowerCase();
          if (names.has(key)) {
            const twin = names.get(key);
            if (!twin || remChaps.has(twin.id) || takeover.has(twin.id)) continue;
            owned.add(f.id);
            const at = Date.parse(f.modifiedTime) || 0;
            const typing = () => twin.id === wbCurrentId && (wbDirty || editor.value !== (twin.content || ''));
            if (at > (twin.updated || 0) && !typing()) {
              const text = await gsDownload(f.id);
              const ch = { ...twin, content: text, updated: at };
              if (!typing() && await wbPersist(WB_CHAPTERS, ch)) {
                Object.assign(twin, ch);
                wbRecordResponsibles(twin.content);
                if (twin.id === wbCurrentId) loadChapterIntoEditor(twin);
                await wbPendingMark(twin);
                remChaps.set(twin.id, { id: twin.id, workbookId: book.id, title: twin.title, file: twin.file,
                                        updated: twin.updated, driveId: f.id });
                down++;
                continue;
              }
            }
            takeover.set(twin.id, f.id);
            continue;
          }
          const text = await gsDownload(f.id);
          const at = Date.parse(f.modifiedTime) || Date.now();
          const ch = { id: wbNewId('ch_'), workbookId: book.id,
                       title: wbTitleFromText(text, f.name.replace(/\.[^.]+$/, '')),
                       file: f.name, content: text, created: at, updated: at, order: order };
          wbChapters.push(ch);
          if (!await wbPersist(WB_CHAPTERS, ch)) { wbChapters.pop(); continue; }
          wbRecordResponsibles(ch.content);
          await wbPendingMark(ch);        // so the markdown folder catches up too
          // Known to the rest of this pass as a chapter Drive already holds.
          remChaps.set(ch.id, { id: ch.id, workbookId: book.id, title: ch.title, file: ch.file,
                                updated: ch.updated, driveId: f.id });
          names.set(key, ch); owned.add(f.id);
          order++; down++;
        }
      }
    }

    /* 4. chapters — the same rule, plus the file body either way */
    for (const rc of remChaps.values()) {
      const lc = wbChapter(rc.id);
      if (lc && (lc.updated || 0) >= (rc.updated || 0)) continue;   // ours is newer, or the same
      if (!wbBook(rc.workbookId)) continue;                          // its workbook is gone here
      const base = wbChapterVersion(lc), baseText = lc?.content || '';
      const unchanged = () => wbChapterVersion(wbChapter(rc.id)) === base
        && !(rc.id === wbCurrentId && (wbDirty || editor.value !== baseText))
        && !wbFlushPromise;
      // A required pull must succeed before publishing a manifest built from
      // local chapters, or remote-only entries and newer metadata would be lost.
      const text = await gsDownload(rc.driveId);
      let ch = { ...(lc || { id: rc.id, created: rc.created || Date.now() }) };
      ch.workbookId = rc.workbookId;
      ch.title = rc.title; ch.file = wbUniqueFile(rc.workbookId, rc.title, rc.id, rc.file);
      ch.order = rc.order || 0;
      ch.content = text;
      ch.updated = rc.updated || Date.now();
      const competing = () => {
        const id = wbNewId('ch_'), title = t('wbConflictTitle', rc.title);
        return { ...ch, id, title, file: wbSlug(title, 'conflict').slice(0, 40) + '-' + id + '.md',
          created: Date.now(), updated: Date.now(), order: wbChaptersOf(rc.workbookId).length };
      };
      let conflict = false;
      // Recheck both the editor and the durable revision in the transaction:
      // an autosave or another tab can finish while the body is downloading.
      await wbTx(WB_CHAPTERS, 'readwrite', chapters => {
        const req = chapters.get(rc.id);
        req.onsuccess = () => {
          conflict = !unchanged() || wbChapterVersion(req.result) !== base;
          if (conflict) { ch = competing(); chapters.add(ch); }
          else chapters.put(ch);
        };
        return req;
      });
      wbChapterVersions.set(ch.id, wbChapterVersion(ch));
      // Typing can also occur between the transaction's request and commit.
      // Preserve the downloaded body before a later autosave replaces it.
      if (!conflict && !unchanged()) {
        ch = competing();
        if (!await wbPersist(WB_CHAPTERS, ch)) throw new Error(t('wbStoreFailed'));
        conflict = true;
      }
      wbRecordResponsibles(ch.content);
      if (conflict) {
        wbChapters.push(ch);
        await wbPendingMark(ch);
        renderWorkbooks();
        throw new Error(t('cloudPullConflict'));
      }
      if (lc) Object.assign(lc, ch);
      else wbChapters.push(ch);
      // No await between the final revision check and replacing the editor.
      if (ch.id === wbCurrentId) loadChapterIntoEditor(ch);
      await wbPendingMark(ch);          // so the markdown folder catches up too
      down++;
    }
    const outChaps = [];
    for (const lc of wbChapters) {
      const rc = remChaps.get(lc.id);
      const dir = dirOf.get(lc.workbookId);
      if (!dir) continue;               // an orphan chapter has nowhere to go
      let driveId = (rc && rc.driveId) || takeover.get(lc.id);
      // A workbook given a new folder this pass takes its chapters with it,
      // changed or not: the old files went with a deleted folder, or sit in
      // another workbook's.
      const moved = rehomed.get(lc.workbookId);
      const movedBook = rc && rc.workbookId !== lc.workbookId;
      if (!rc || moved || (lc.updated || 0) > (rc.updated || 0)) {
        const file = await gsWrite(lc.file, dir, new Blob([lc.content || ''], { type: 'text/markdown' }),
                                   (moved || movedBook) ? null : driveId);
        if ((moved === 'shared' || movedBook) && driveId) await gsTrash(driveId);
        driveId = file.id;
        up++;
      }
      outChaps.push({ id: lc.id, workbookId: lc.workbookId, title: lc.title, file: lc.file,
                      created: lc.created || 0, updated: lc.updated || 0, order: lc.order || 0,
                      driveId: driveId });
    }

    /* 5. the manifest goes back last, so a run that died halfway leaves the
       old one in place and the next run redoes the work rather than losing
       track of a file it had already written. */
    const out = { v: 1, updated: Date.now(), books: outBooks, chapters: outChaps, deleted: graves };
    const mf = await gsWrite(GSYNC.MANIFEST, rootId,
                             new Blob([JSON.stringify(out)], { type: 'application/json' }), manId);
    if (mf && mf.id) manId = mf.id;

    gsLastAt = Date.now();
    try { localStorage.setItem('gdrive_md_at', String(gsLastAt)); } catch (e) {}
    renderWorkbooks();
    return { up: up, down: down };
  } finally {
    gsBusy = false; gsInteractive = false;
    paintCloud();
  }
}

/* ── The two buttons ──
   ☁ syncs (syncNow, workbooks.js) and only wears the state; its label and
   tip are plain data-i. The Connect button is the one whose words depend on
   the connection, so both halves of it are written here and applyUILang()
   is kept away from it. */
function paintCloud() {
  const on = gsConnected();
  const sync = document.getElementById('btn-wb-cloud');
  if (sync) {
    sync.classList.toggle('connected', on);
    sync.classList.toggle('syncing', gsBusy || wbSyncBusy);
  }
  // Pointing at files in Drive only means something once an account is linked.
  const pick = document.getElementById('btn-wb-pick');
  if (pick) pick.hidden = !on;
  // Everything from Drive is a first-time door only: shown until this browser
  // has finished one Drive sync (with or without an account linked yet — it
  // links one itself), and again after Disconnect forgets that sync.
  const all = document.getElementById('btn-wb-pick-all');
  if (all) all.hidden = !!gsLastAt;
  const link = document.getElementById('btn-wb-connect');
  if (link) {
    link.textContent = t(on ? 'cloudDisconnectBtn' : 'cloudConnectBtn');
    link.title = on ? t('cloudDisconnectTip', (gsFolder && gsFolder.name) || GSYNC.FOLDER_NAME) : t('cloudConnectTip');
  }
  const where = document.getElementById('wb-cloud-where');
  if (!where) return;
  const stale = on && !gsLive();
  where.classList.toggle('warn', stale);
  const msg = !on ? t('cloudOff')
    : gsBusy ? t('cloudSyncing')
    : stale ? t('cloudStale')
    : gsLastAt ? t('cloudAt', gsWhen(gsLastAt))
    : t('cloudReady');
  where.textContent = '';
  // Connected means the folder exists, so "where did my chapters go" is a
  // question the page can answer with a link rather than a name to go hunting.
  if (on && gsFolder && gsFolder.id) {
    const a = document.createElement('a');
    a.href = 'https://drive.google.com/drive/folders/' + encodeURIComponent(gsFolder.id);
    a.target = '_blank'; a.rel = 'noopener';
    a.textContent = msg;
    a.title = t('cloudOpenTip', gsFolder.name || GSYNC.FOLDER_NAME);
    where.appendChild(a);
  } else {
    where.textContent = msg;
  }
}

// A bare time reads as "just now". A stamp from another day has to say which,
// or a sync that quietly stopped working looks exactly like one that just ran.
function gsWhen(ms) {
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString()
    : d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

function cloudError(err) {
  const m = (err && err.message) || String(err);
  if (m === 'cancelled' || m === 'popup_closed' || m === 'popup_failed_to_open' || m === 'stale') {
    paintCloud();
    return;
  }
  wbSay(t('cloudError', m), true);
}

/* Linking the account is its own button, so nothing else on the page ever
   opens a first sign-in. The click is the gesture the popup needs; once the
   folder is found (or made) the ordinary sync pass runs, which is what
   brings down whatever the account already holds. */
async function cloudConnect() {
  if (location.protocol === 'file:') { ScuLaFolder.toast(t('cloudNoFile')); return; }
  if (gsBusy) return;
  try {
    gsInteractive = true;
    await gsAuth(true);
    const f = await gsRoot();
    ScuLaFolder.toast(t('cloudConnected', f.name));
  } catch (err) {
    cloudError(err);
    return;
  } finally {
    gsInteractive = false;
    paintCloud();
  }
  await syncNow();
}
function cloudToggle() { return gsConnected() ? cloudForgetAsk() : cloudConnect(); }

/* ── What was put into Drive by hand ──
   drive.file shows this page the files it made and the ones the person opened
   with it, and Google has no scope for "this one folder": the next step up is
   the whole Drive. So a folder dragged into "Scula Markdown" on
   drive.google.com stays invisible until it is pointed at, and Google's own
   Picker is how that is done without widening anything — it runs on Google's
   side, shows the person their Drive, and hands this page the chosen items
   and nothing else. Once chosen they are ordinary files to the listing, so
   the import itself is step 3b of the pass that follows.

   Choosing a folder shares the folder, not what is in it. Hence the second
   window, opened inside a chosen folder that still lists no chapter; and a
   third, asking for the folder, when files were chosen by walking into one
   the page cannot name. If Google ever does hand over a folder's contents,
   the listing is not empty and the second window never opens. */
function gsPick(parentId, title) {
  return new Promise(resolve => {
    const P = google.picker;
    const view = new P.DocsView(P.ViewId.DOCS)
      .setParent(parentId)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMode(P.DocsViewMode.LIST);          // no thumbnails under drive.file
    const b = new P.PickerBuilder()
      .setAppId(GSYNC.APP_ID)
      .setOAuthToken(gsToken)
      .setOrigin(location.protocol + '//' + location.host)
      .setLocale(UI)
      .setTitle(title)
      .enableFeature(P.Feature.MULTISELECT_ENABLED)
      .addView(view)
      .setCallback(data => {
        if (data.action === P.Action.PICKED) resolve(data.docs || []);
        else if (data.action === P.Action.CANCEL) resolve([]);
      });
    if (GSYNC.API_KEY) b.setDeveloperKey(GSYNC.API_KEY);
    b.build().setVisible(true);
  });
}

async function cloudPick() {
  if (location.protocol === 'file:') { ScuLaFolder.toast(t('cloudNoFile')); return; }
  if (gsPicking || gsBusy || wbSyncBusy) return;
  gsPicking = true;
  let left = 0;                       // chosen, but not something a pass can take in
  try {
    // The windows stay open as long as the person likes and a background
    // pass may run meanwhile, so the flag is raised again after each one.
    const mine = () => { gsInteractive = true; };
    mine();
    await gsAuth(true);
    const root = await gsRoot();
    const known = new Set((await gsList(root.id)).map(f => f.id));
    try {
      await gsLoadScript('https://apis.google.com/js/api.js');
      await new Promise((res, rej) => gapi.load('picker', { callback: res, onerror: () => rej(new Error('picker')) }));
    } catch (e) { throw new Error(t('cloudPickFail')); }

    const folders = new Map(), files = [];
    const take = docs => docs.forEach(d => { if (d.mimeType === GS_DIR_MIME) folders.set(d.id, d); else files.push(d); });
    take(await gsPick(root.id, t('cloudPickTitle', root.name)));
    if (!folders.size && !files.length) return;            // closed: nothing was asked for
    mine();

    // A workbook is a folder directly under the root; anything else is not one.
    const metas = new Map();
    const meta = async id => { if (!metas.has(id)) metas.set(id, await gsMeta(id)); return metas.get(id); };
    const isBook = m => !!m && !m.trashed && m.mimeType === GS_DIR_MIME
      && (m.parents || []).includes(root.id) && m.name.charAt(0) !== '.';

    for (const dir of [...folders.values()]) {
      const m = await meta(dir.id);
      if (!isBook(m)) { left++; continue; }
      const seen = (await gsList(dir.id)).some(f => f.mimeType !== GS_DIR_MIME && WB_ADOPT_RE.test(f.name));
      if (seen && !known.has(dir.id)) continue;
      for (const d of await gsPick(dir.id, t('cloudPickInside', m.name))) {
        if (d.mimeType === GS_DIR_MIME) left++;            // a folder inside a workbook is not a chapter
        else files.push(d);
      }
      mine();
    }

    const byParent = new Map();
    for (const f of files) {
      if (!WB_ADOPT_RE.test(f.name || '')) { left++; continue; }
      const parent = f.parentId || (((await meta(f.id)) || {}).parents || [])[0] || '';
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push(f.name);
    }
    const orphans = [];
    for (const [parent, names] of byParent) {
      const m = parent && parent !== root.id ? await meta(parent) : null;
      if (isBook(m)) continue;
      if (parent && parent !== root.id && !m) orphans.push(...names);   // a folder the page was never shown
      else left += names.length;
    }
    if (orphans.length) {
      const names = orphans.slice(0, 3).join(', ') + (orphans.length > 3 ? '…' : '');
      await gsPick(root.id, t('cloudPickFolderOf', names));
      mine();
      for (const [parent, names] of byParent) {
        if (!parent || parent === root.id || metas.get(parent)) continue;
        metas.delete(parent);
        if (!isBook(await meta(parent))) left += names.length;
      }
    }
  } catch (err) {
    cloudError(err);
    return;
  } finally {
    gsPicking = false; gsInteractive = false;
    paintCloud();
  }
  await syncNow({ note: left ? t('cloudPickLeft', left) : '' });
}

/* ── Everything in "Scula Markdown", nothing to choose ──
   Google's Picker is a docs.google.com frame: the page cannot add a "select
   all" to it. 📥 Everything from Drive asks once for the whole Drive instead
   (GSYNC.FULL_SCOPE). With it the listing in step 3b sees every workbook
   folder under the root and every chapter file in them, and step 4 can
   overwrite those same files when they are edited here — so the ordinary
   adopting sync is the whole import, and later saves sync both ways. Like
   cloudPick, a workbook is a folder directly under the root and a chapter a
   .md/.txt file directly in one; anything deeper is left where it is.
   It is offered only before this browser's first Drive sync (paintCloud),
   so on a device with no account linked yet the press is also the Connect. */
async function cloudPickAll() {
  if (location.protocol === 'file:') { ScuLaFolder.toast(t('cloudNoFile')); return; }
  if (gsPicking || gsBusy || wbSyncBusy) return;
  gsPicking = true;
  try {
    gsInteractive = true;
    const linked = gsConnected();
    await gsAuth(true, true);
    gsFull = true;
    try { localStorage.setItem('gdrive_md_full', '1'); } catch (e) {}
    const f = await gsRoot();
    if (!linked) ScuLaFolder.toast(t('cloudConnected', f.name));
  } catch (err) {
    cloudError(err);
    return;
  } finally {
    gsPicking = false; gsInteractive = false;
    paintCloud();
  }
  await syncNow();
}

// An explicit chapter save also syncs a remembered connection, including
// renewing an expired sign-in. Never enroll a new account from Save. If a
// sync is already running, retain the usual delayed push so edits saved
// during it still get another turn.
async function cloudSyncAfterSave() {
  if (!gsConnected()) return;
  if (location.protocol === 'file:') { ScuLaFolder.toast(t('cloudNoFile')); return; }
  if (gsBusy) { cloudAutoSync(); return; }
  clearTimeout(gsTimer);
  try {
    if (!gsLive()) {
      gsInteractive = true;
      await gsAuth(true);
      await gsRoot();
    }
    const r = await cloudSync(true);
    // What came down is pending (§ E). With a markdown folder chosen and
    // already permitted, it goes straight into it. No permission prompt
    // this late in the press: without one they simply stay pending.
    if (r && r.down && wbFolderMode() && await ScuLaFolder.dir(false)) {
      for (const id of [...wbPendingIds]) {
        const ch = wbChapter(id), book = ch && wbBook(ch.workbookId);
        if (book) await wbSaveMirror(book, ch);
      }
      renderWorkbooks();
    }
    if (r) wbSay(r.up || r.down ? t('cloudDone', r) : t('cloudNothing'), true);
  } catch (err) {
    cloudError(err);
  } finally {
    gsInteractive = false;
    paintCloud();
  }
}

// The Disconnect half of the Connect button.
function cloudForgetAsk() {
  if (!gsConnected()) return;
  if (!confirm(t('cloudForgetAsk'))) return;
  gsForget(false);
  paintCloud();
  wbSay(t('cloudForgot'), true);
}

/* ── Keeping up on its own ──
   A push once typing settles, a pull every couple of minutes and one on
   coming back to the tab. All of them are silent: they skip rather than ask
   for a sign-in, which is what keeps a background timer from throwing a
   popup at someone who is reading. */
function cloudAutoSync() {
  if (!gsConnected() || !gsLive()) return;
  clearTimeout(gsTimer);
  gsTimer = setTimeout(() => { cloudSync(false).catch(cloudError); }, GSYNC.DEBOUNCE_MS);
}
function cloudBoot() {
  gsGravesLoad().then(() => {
    paintCloud();
    if (!gsConnected() || !gsLive()) return;
    cloudSync(false).catch(cloudError);
    setInterval(() => { if (!document.hidden && gsLive()) cloudSync(false).catch(cloudError); }, GSYNC.POLL_MS);
  });
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && gsConnected() && gsLive()) cloudSync(false).catch(cloudError);
});
window.addEventListener('scula-ui-lang', () => setTimeout(paintCloud, 0));

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
let gsGraves = {};                    // id → deleted-at, books and chapters alike

// The token is editor.html's — same origin, same OAuth client, same scope —
// so connecting on either page connects both. Only the folder is ours.
try {
  const tk = localStorage.getItem('gdrive_token');
  const ex = Number(localStorage.getItem('gdrive_token_exp')) || 0;
  if (tk && ex > Date.now() + 60000) { gsToken = tk; gsTokenExp = ex; }
  gsFolder = JSON.parse(localStorage.getItem('gdrive_md_folder') || 'null');
  gsLastAt = Number(localStorage.getItem('gdrive_md_at')) || 0;
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
    if (!tokenOnly) { localStorage.removeItem('gdrive_md_folder'); localStorage.removeItem('gdrive_md_at'); }
  } catch (e) {}
  if (!tokenOnly) { gsFolder = null; gsFolderOk = false; gsLastAt = 0; gsDirOk.clear(); }
}

/* A background sync must never open a popup — nobody asked for one, and a
   popup blocker would eat it anyway. So the interactive flag travels with the
   call: without it an expired token is an error to report quietly, not a
   sign-in to demand. */
async function gsAuth(interactive) {
  if (gsLive()) return gsToken;
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
      resolve(gsToken);
    };
    // Closing the popup is an answer, not a failure to shout about.
    gsClient.error_callback = (err) => reject(new Error((err && err.type) || 'cancelled'));
    gsClient.requestAccessToken({ prompt: '' });
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
   else in the account. */
async function gsChild(name, parentId, isFolder) {
  const q = "name='" + String(name).replace(/'/g, "\\'") + "' and trashed=false"
          + (parentId ? " and '" + parentId + "' in parents" : '')
          + (isFolder ? " and mimeType='" + GS_DIR_MIME + "'" : '');
  const r = await gsJson(GS_FILES + '?pageSize=1&fields=files(id,name)&q=' + encodeURIComponent(q));
  return (r.files && r.files[0]) || null;
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
  return gsRootIs((await gsChild(GSYNC.FOLDER_NAME, null, true)) || (await gsMakeFolder(GSYNC.FOLDER_NAME, null)));
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
   caller can say what happened. */
async function cloudSync(interactive) {
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
      try { man = JSON.parse(await gsDownload(found.id)) || man; } catch (e) {}
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
        const book = { id: rb.id, name: rb.name, folder: rb.folder, created: rb.created || Date.now(),
                       updated: rb.updated || Date.now(), order: rb.order || 0 };
        wbBooks.push(book);
        await wbPersist(WB_BOOKS, book);
        down++;
      } else if ((rb.updated || 0) > (lb.updated || 0)) {
        lb.name = rb.name; lb.folder = rb.folder; lb.order = rb.order || 0; lb.updated = rb.updated;
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

    /* 4. chapters — the same rule, plus the file body either way */
    for (const rc of remChaps.values()) {
      const lc = wbChapter(rc.id);
      if (lc && (lc.updated || 0) >= (rc.updated || 0)) continue;   // ours is newer, or the same
      if (!wbBook(rc.workbookId)) continue;                          // its workbook is gone here
      let text = '';
      try { text = await gsDownload(rc.driveId); } catch (e) { continue; }
      const ch = lc || { id: rc.id, workbookId: rc.workbookId, created: rc.created || Date.now(), order: 0 };
      ch.workbookId = rc.workbookId;
      ch.title = rc.title; ch.file = rc.file;
      ch.order = rc.order || 0;
      ch.content = text;
      ch.updated = rc.updated || Date.now();
      if (!lc) wbChapters.push(ch);
      if (!await wbPersist(WB_CHAPTERS, ch)) continue;
      await wbPendingMark(ch);          // so the markdown folder catches up too
      if (ch.id === wbCurrentId) loadChapterIntoEditor(ch);
      down++;
    }
    const outChaps = [];
    for (const lc of wbChapters) {
      const rc = remChaps.get(lc.id);
      const dir = dirOf.get(lc.workbookId);
      if (!dir) continue;               // an orphan chapter has nowhere to go
      let driveId = rc && rc.driveId;
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

/* ── The button ── */
function paintCloud() {
  const btn = document.getElementById('btn-wb-cloud');
  if (!btn) return;
  const on = gsConnected();
  btn.textContent = on ? t('cloudBtnOn') : t('cloudBtn');
  btn.title = on ? t('cloudTipOn', (gsFolder && gsFolder.name) || GSYNC.FOLDER_NAME) : t('cloudTip');
  btn.setAttribute('aria-label', btn.title);
  btn.classList.toggle('connected', on);
  btn.classList.toggle('syncing', gsBusy);
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

async function cloudButton() {
  if (location.protocol === 'file:') { ScuLaFolder.toast(t('cloudNoFile')); return; }
  if (gsBusy) return;
  const first = !gsConnected();
  try {
    if (first || !gsLive()) {
      gsInteractive = true;
      await gsAuth(true);
      const f = await gsRoot();
      if (first) ScuLaFolder.toast(t('cloudConnected', f.name));
    }
    const r = await cloudSync(true);
    if (r) wbSay(r.up || r.down ? t('cloudDone', r) : t('cloudNothing'), true);
  } catch (err) {
    cloudError(err);
  } finally {
    gsInteractive = false;
    paintCloud();
  }
}

// The same gesture the folder button and editor.html's Drive button use.
function cloudForgetAsk(ev) {
  if (ev) ev.preventDefault();
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

/* ============================================================
   Workbooks — a workbook holds chapters; one chapter is one
   markdown file, the way OneNote holds pages in a notebook.

   IndexedDB (`scula-md`) is the source of truth and works on
   every device, phones included. Where a default folder exists
   (desktop, see docs/FEATURES.md § D) the same chapters are
   mirrored to <folder>/markdown/<workbook>/<chapter>.md, and
   every record keeps the folder + file name it owns — that
   record *is* the correspondence between the UI and the folder.

   Full description: docs/FEATURES.md § E.
   ============================================================ */
const WB_DB = 'scula-md', WB_VER = 2;
const WB_BOOKS = 'workbooks', WB_CHAPTERS = 'chapters', WB_META = 'meta', WB_PENDING = 'pending';

var wbBooted = false;        // var: applyUILang() reads it before this runs
let wbBooks = [];            // [{ id, name, folder, created, updated, order }]
let wbChapters = [];         // [{ id, workbookId, title, file, content, … }]
let wbCurrentId = null;      // open chapter, or null for a loose file
let wbDirty = false;
let wbSaveTimer = 0;
let wbUserEdited = false;    // has anyone actually typed since this page loaded?
// The browser's own "Edit files?" permission prompt is asked at most once per
// page load: past that, a granted handle needs no more asking, and a denied
// or dismissed one should not be re-asked on every autosave tick. Re-picking
// the folder (scula-folder event) is the one thing that earns a fresh ask.
let wbMirrorAsked = false;
// What the textarea already held when the script ran. A browser that restores
// form state — a reload, or a tab the browser discarded while it sat idle and
// reloaded on return — puts the old text back before any script runs. That is
// not work in progress, and mistaking it for work in progress is what used to
// keep a chapter out of its own editor. See loadWorkbooks().
const wbBootText = editor.value;
const wbOpenBooks = new Set();   // which workbooks are expanded in the panel
const wbPendingIds = new Set();  // chapters edited but not yet written to their .md file — see docs/FEATURES.md § E
const wbTodoOnly = new Set();    // TODO-titled workbooks currently filtered to chapters with an open "- [ ]"
let wbTaskStatusFilter = '';      // toolbar filter; empty means all task states
let wbImportanceFilter = '';     // selected importance level; empty shows all tasks
let wbResponsibleFilter = '';    // normalized name chosen in the toolbar; empty means all
let wbPreviewLineMap = null;     // filtered preview line -> original editor line (task checkbox clicks)
let wbPreviewTreeState = '';
let wbResponsibleOptions = '';
const wbResponsibleSeen = new Map(); // names already recorded in IndexedDB, keyed without case
const wbResponsibleScanCache = new Map();
let wbResponsibleWrite = Promise.resolve();

// Read both assignee forms wherever the renderer recognizes them. Code fences
// are skipped because their contents are displayed literally.
const WB_RESPONSIBLE_RE = new RegExp(
  '^[ \\t]*(?:[-*+][ \\t]+(?:\\[[ xX]\\][ \\t]+(?:~(?:inwork|onhold|blocked)[ \\t]+)?)?|\\d+\\.[ \\t]+|#{1,6}[ \\t]+|>[ \\t]+)?' +
  `(${ASSIGNEE_WORD}(?:[ \\t]+${ASSIGNEE_WORD}){0,3})[ \\t]?>>(?=[ \\t])`, 'u'
);
const WB_INLINE_RESPONSIBLE_RE = new RegExp(
  '>>(' + INLINE_ASSIGNEE_WORD + ')(?![\\p{L}\\p{N}_\'-])', 'gu'
);
function wbResponsibleKey(name) { return name.normalize('NFC').toLowerCase(); }
function wbLineResponsibles(line) {
  const names = [];
  const lead = line.match(WB_RESPONSIBLE_RE);
  if (lead) names.push(lead[1].replace(/[ \t]+/g, ' '));
  for (const match of line.matchAll(WB_INLINE_RESPONSIBLE_RE)) names.push(match[1]);
  return names;
}
function wbWalkResponsibleLines(text, visit) {
  let fenced = false;
  String(text || '').split('\n').forEach((line, index) => {
    if (/^[ \t]*```/.test(line)) { fenced = !fenced; return; }
    if (fenced) return;
    wbLineResponsibles(line).forEach(name => visit(name, line, index));
  });
}
function wbNamesIn(text) {
  const names = new Map();
  wbWalkResponsibleLines(text, name => {
    const key = wbResponsibleKey(name);
    if (!names.has(key)) names.set(key, name);
  });
  return names;
}
function wbNamesForChapter(ch) {
  const text = ch.id === wbCurrentId ? editor.value : ch.content || '';
  const cached = wbResponsibleScanCache.get(ch.id);
  if (cached && cached.text === text) return cached.names;
  const names = wbNamesIn(text);
  wbResponsibleScanCache.set(ch.id, { text, names });
  return names;
}

// The meta record only grows when a saved chapter introduces a new name.
// Serializing writes keeps simultaneous autosaves/imports from losing names.
function wbRecordResponsibles(text) {
  let added = false;
  wbNamesIn(text).forEach((name, key) => {
    if (!wbResponsibleSeen.has(key)) { wbResponsibleSeen.set(key, name); added = true; }
  });
  if (added) {
    wbResponsibleWrite = wbResponsibleWrite.then(() =>
      wbMetaSet('responsibles', Array.from(wbResponsibleSeen.values()))
    ).catch(() => {});
  }
}

// Options reflect names still present in chapters; the IndexedDB list keeps
// names once recorded even if their last marker is later removed.
function wbPaintResponsibleSelect() {
  if (!wbBooted) return false;
  const select = document.getElementById('responsible-select');
  if (!select) return false;
  const names = new Map();
  wbChapters.forEach(ch => {
    wbNamesForChapter(ch).forEach((name, key) => { if (!names.has(key)) names.set(key, name); });
  });
  const sorted = Array.from(names, ([key, name]) => ({ key, name }))
    .sort((a, b) => a.name.localeCompare(b.name, UI));
  const signature = JSON.stringify(sorted);
  let changed = false;
  if (signature !== wbResponsibleOptions) {
    wbResponsibleOptions = signature;
    select.replaceChildren(select.firstElementChild);
    sorted.forEach(({ key, name }) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = name;
      select.appendChild(option);
    });
    changed = true;
  }
  select.hidden = !sorted.length;
  if (wbResponsibleFilter && !names.has(wbResponsibleFilter)) {
    wbResponsibleFilter = '';
    changed = true;
  }
  select.value = wbResponsibleFilter;
  return changed;
}
function selectResponsible(value) {
  wbResponsibleFilter = value;
  renderWorkbooks();
  updatePreview();
}
function filterImportance(value) {
  wbImportanceFilter = IMP_LEVELS.includes(value) ? value : '';
  document.getElementById('importance-select').value = wbImportanceFilter;
  renderWorkbooks();
  updatePreview();
}

// Match checklist task lines using the marker boundaries of the renderer.
// Ignore fenced examples rather than treating them as tasks.
function wbTaskHasImportance(line, level) {
  if (!TASK_LINE_RE.test(line)) return false;
  for (const marker of line.matchAll(IMP_RE)) {
    if (marker[2] === level) return true;
  }
  return false;
}
function wbChapterHasImportanceTask(text, level, openOnly = false, responsible = '') {
  let fenced = false;
  for (const line of String(text || '').split('\n')) {
    if (/^[ \t]*```/.test(line)) { fenced = !fenced; continue; }
    if (fenced || !wbTaskHasImportance(line, level)) continue;
    if (openOnly && !WB_OPEN_TASK_RE.test(line)) continue;
    if (responsible) {
      if (!wbLineResponsibles(line).some(name => wbResponsibleKey(name) === responsible)) continue;
    }
    return true;
  }
  return false;
}

// Keep the original line numbers so a checkbox in a narrowed preview still
// toggles the corresponding task in the unfiltered editor text.
function wbPreviewFilteredText(text) {
  if (!wbTaskStatusFilter && !wbResponsibleFilter && !wbImportanceFilter) return { text, lineMap: null };
  const keep = [];
  const lineMap = [];
  let fenced = false;
  String(text || '').split('\n').forEach((line, index) => {
    if (/^[ \t]*```/.test(line)) { fenced = !fenced; return; }
    if (fenced) return;
    if (wbTaskStatusFilter && !wbTaskHasStatus(line, wbTaskStatusFilter)) return;
    if (wbImportanceFilter && !wbTaskHasImportance(line, wbImportanceFilter)) return;
    if (wbResponsibleFilter) {
      if (!wbLineResponsibles(line).some(name => wbResponsibleKey(name) === wbResponsibleFilter)) return;
    }
    keep.push(line);
    lineMap.push(index);
  });
  return { text: keep.join('\n'), lineMap };
}

/* A chapter "has an open task" when a line reads "- [ ]" (optionally indented,
   any of - * + as the bullet). Used only by the TODO filter button. */
const WB_OPEN_TASK_RE = /^[ \t]*[-*+] \[ \]/m;
function wbTaskHasStatus(line, status) {
  if (!TASK_LINE_RE.test(line)) return false;
  const match = line.match(TASK_LINE_RE);
  const marker = match[4].match(TASK_STATUS_LEAD_RE);
  const actual = match[2].toLowerCase() === 'x' ? 'done'
    : marker ? marker[1].slice(1) : 'todo';
  return actual === status;
}
function wbChapterHasTaskStatus(content, status) {
  let fenced = false;
  for (const line of String(content || '').split('\n')) {
    if (/^[ \t]*```/.test(line)) { fenced = !fenced; continue; }
    if (!fenced && wbTaskHasStatus(line, status)) return true;
  }
  return false;
}
function wbChapterHasOpenTask(ch, content) {
  return !!ch && WB_OPEN_TASK_RE.test(content === undefined ? ch.content || '' : content);
}
function wbIsTodoBook(book) { return !!book && /todo/i.test(book.name || ''); }
/* Same regex, applied line by line to the open chapter's own text: what the
   preview shows while "▣ Tasks only" is on — every unchecked "- [ ]" line
   and nothing else (no "- [x]", no surrounding prose). */
function wbOpenTasksOnly(text) {
  return (text || '').split('\n').filter(line => WB_OPEN_TASK_RE.test(line)).join('\n');
}

/* Toolbar status select filters every workbook and the open chapter preview. */
function filterTodoByStatus(status) {
  wbTaskStatusFilter = ['todo', 'inwork', 'onhold', 'blocked', 'done'].includes(status) ? status : '';
  renderWorkbooks();
  updatePreview();
}

/* ── IndexedDB plumbing ── */
function wbDb() {
  return new Promise((res, rej) => {
    let r;
    try { r = indexedDB.open(WB_DB, WB_VER); } catch (e) { rej(e); return; }
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(WB_BOOKS)) db.createObjectStore(WB_BOOKS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(WB_CHAPTERS)) {
        db.createObjectStore(WB_CHAPTERS, { keyPath: 'id' }).createIndex('byWorkbook', 'workbookId');
      }
      if (!db.objectStoreNames.contains(WB_META)) db.createObjectStore(WB_META);
      if (!db.objectStoreNames.contains(WB_PENDING)) db.createObjectStore(WB_PENDING, { keyPath: 'chapterId' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function wbTx(store, mode, run) {
  return wbDb().then(db => new Promise((res, rej) => {
    const tx = db.transaction(store, mode);
    const req = run(tx.objectStore(store));
    tx.oncomplete = () => { db.close(); res(req ? req.result : undefined); };
    tx.onerror = () => { db.close(); rej(tx.error); };
    tx.onabort = () => { db.close(); rej(tx.error); };
  }));
}
const wbAll = store => wbTx(store, 'readonly', s => s.getAll());
const wbPut = (store, v) => wbTx(store, 'readwrite', s => s.put(v));
const wbDrop = (store, k) => wbTx(store, 'readwrite', s => s.delete(k));
// The meta store has no keyPath — put(value, key), get(key).
const wbMetaGet = k => wbTx(WB_META, 'readonly', s => s.get(k));
const wbMetaSet = (k, v) => wbTx(WB_META, 'readwrite', s => s.put(v, k));

async function wbPersist(store, value) {
  try {
    await wbPut(store, value);
    if (store === WB_CHAPTERS) wbRecordResponsibles(value.content);
    return true;
  }
  catch (e) { wbSay(t('wbStoreFailed'), true); return false; }
}

/* ── Pending edits ──
   Autosave already writes the open chapter's text straight to IndexedDB.
   wbPendingIds additionally remembers *which* chapters have changed since
   their .md file was last written — in memory and in the `pending` store,
   so the list survives a reload. A marker is dropped when that chapter's
   file is written by saveToWorkbook() or saveAllModifiedChapters(). */
async function wbPendingMark(ch) {
  wbPendingIds.add(ch.id);
  try { await wbPut(WB_PENDING, { chapterId: ch.id, workbookId: ch.workbookId, content: ch.content, updated: ch.updated || Date.now() }); }
  catch (e) {}
}
async function wbPendingClear(id) {
  wbPendingIds.delete(id);
  try { await wbDrop(WB_PENDING, id); } catch (e) {}
}

/* ── The draft journal ──
   Autosave writes the open chapter to IndexedDB, but two moments are outside
   it: text in a loose "untitled.md" (there is no chapter to write to) and the
   gap between a keystroke and the 800 ms autosave. A tab that goes away in
   either of them takes that text with it — and browsers discard an idle tab
   after a few minutes, then reload it when you come back.

   So every change also lands in localStorage, synchronously, tagged with the
   chapter it belongs to ('' for a loose file) and when it was written. It is
   a journal, not a store: boot compares it against the record and keeps
   whichever is newer, and the next keystroke overwrites it. § E. */
const WB_DRAFT_KEY = 'scula:md:draft';
let wbDraftTimer = 0;
let wbDraftReady = false;    // boot reconciles first; until then, nothing is written

// The header's file name, read or written in one place.
function wbFileLabel(text) {
  const el = document.getElementById('current-file');
  if (!el) return '';
  if (text != null) el.textContent = text;
  return (el.textContent || '').trim();
}
function wbDraftWrite() {
  clearTimeout(wbDraftTimer);
  if (!wbDraftReady) return;
  try {
    localStorage.setItem(WB_DRAFT_KEY, JSON.stringify({
      id: wbCurrentId || '', name: wbFileLabel(), text: editor.value, at: Date.now()
    }));
  } catch (e) {}             // a full quota is not a reason to block typing
}
function wbDraftRead() {
  try {
    const d = JSON.parse(localStorage.getItem(WB_DRAFT_KEY) || 'null');
    return d && typeof d.text === 'string' ? d : null;
  } catch (e) { return null; }
}
/* The journal's text when it is this chapter's and ahead of the record —
   keystrokes the autosave never got to. Otherwise null. A record that is
   newer (a Drive pull, an edit in another tab) always wins. */
function wbDraftAhead(draft, ch) {
  if (!draft || !ch || draft.id !== ch.id) return null;
  if (draft.text === (ch.content || '')) return null;
  if ((draft.at || 0) <= (ch.updated || 0)) return null;
  return draft.text;
}
/* Every path that changes the editor ends in updateStatus(), which is why
   that is where this hangs: one hook for the journal and for the flag. */
function wbEditorChanged() {
  wbPaintAttach();
  if (!wbDraftReady) return;
  clearTimeout(wbDraftTimer);
  wbDraftTimer = setTimeout(wbDraftWrite, 700);
}
/* An editor holding text that belongs to no chapter is the state this bug was
   made of: autosave returns early, so the text lives only in the journal. The
   file name says it in --danger rather than looking like a saved file. */
function wbPaintAttach() {
  const el = document.getElementById('current-file');
  if (!el) return;
  const loose = !wbCurrentId && !!editor.value.trim();
  el.classList.toggle('loose', loose);
  if (loose) el.title = t('looseTip'); else el.removeAttribute('title');
}

/* ── Small helpers ── */
function wbNewId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function wbByOrder(a, b) { return (a.order || 0) - (b.order || 0) || (a.created || 0) - (b.created || 0); }
function wbBook(id) { return wbBooks.find(b => b.id === id) || null; }
function wbChapter(id) { return wbChapters.find(c => c.id === id) || null; }
function wbChaptersOf(id) { return wbChapters.filter(c => c.workbookId === id).sort(wbByOrder); }

// A name every file system accepts. Romanian diacritics survive — they are
// valid in file names everywhere the apps run, and stripping them would make
// the folder unrecognisable next to the UI it mirrors.
function wbSlug(name, fallback) {
  let s = String(name || '').trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  if (s.length > 60) s = s.slice(0, 60).replace(/-+$/, '');
  return s || fallback;
}
function wbUniqueFolder(name, exceptId) {
  const base = wbSlug(name, t('untitledWorkbook'));
  const taken = new Set(wbBooks.filter(b => b.id !== exceptId).map(b => b.folder.toLowerCase()));
  let n = base, i = 1;
  while (taken.has(n.toLowerCase())) n = base + '-' + (++i);
  return n;
}
function wbUniqueFile(workbookId, title, exceptId) {
  const base = wbSlug(title, t('untitledChapter'));
  const taken = new Set(wbChapters.filter(c => c.workbookId === workbookId && c.id !== exceptId)
                                  .map(c => c.file.toLowerCase()));
  let n = base + '.md', i = 1;
  while (taken.has(n.toLowerCase())) n = base + '-' + (++i) + '.md';
  return n;
}
function wbSay(msg, alsoToast) {
  const el = document.getElementById('stat-wb');
  if (el) el.textContent = msg || '';
  if (alsoToast && msg && typeof ScuLaFolder !== 'undefined') ScuLaFolder.toast(msg);
}
// A chapter's name, read out of the text itself: the first heading, or the
// fallback the caller knows (the file name, usually).
function wbTitleFromText(text, fallback) {
  const m = String(text || '').match(/^#{1,3}\s+(.+)$/m);
  const head = m ? m[1].trim().slice(0, 80) : '';
  return head || fallback;
}
function wbGuessTitle() {
  const base = (document.getElementById('current-file').textContent || '').replace(/\.(md|txt)$/i, '');
  return wbTitleFromText(editor.value, base && base !== 'untitled' ? base : t('defaultChapterName'));
}

/* ── The folder mirror ──
   Only the "folder" route owns a directory we can write into. On the share
   and download routes the chapter still lives in IndexedDB, and a person who
   wants the file in their hands uses exportChapter() — docs/FEATURES.md § D. */
function wbFolderMode() {
  return typeof ScuLaFolder !== 'undefined' && ScuLaFolder.mode() === 'folder';
}
async function wbMirrorWrite(book, chapter, text) {
  if (!wbFolderMode()) return null;
  try {
    const md = await ScuLaFolder.dir(!wbMirrorAsked);           // <root>/markdown
    wbMirrorAsked = true;
    if (!md) return null;
    const bookDir = await md.getDirectoryHandle(book.folder, { create: true });
    const fh = await bookDir.getFileHandle(chapter.file, { create: true });
    const w = await fh.createWritable();
    await w.write(new Blob([text], { type: 'text/markdown' }));
    await w.close();
    return ScuLaFolder.name() + '/' + ScuLaFolder.subdir() + '/' + book.folder + '/' + chapter.file;
  } catch (e) { return null; }
}
// Best effort, and never recursive: only files this app knows it wrote are
// removed, and an empty workbook folder is dropped only if the FS agrees it
// is empty. Nothing a person put there by hand is ever deleted.
async function wbMirrorRemove(folder, file) {
  if (!wbFolderMode()) return;
  try {
    const md = await ScuLaFolder.dir(true);
    if (!md) return;
    const bookDir = await md.getDirectoryHandle(folder);
    if (file) await bookDir.removeEntry(file);
    else await md.removeEntry(folder);
  } catch (e) { /* not there, or not empty — leave it alone */ }
}

/* ── The mirror, read back ──
   The mirror used to run one way only: records here, files there. But the
   folder is a folder — a person drops a directory of notes into
   <root>/markdown, or a .md next to the ones a workbook already owns, and
   means those to be a workbook and a chapter. "Sincronizează în dosar" now
   looks before it writes.

   A directory whose name matches no book.folder becomes a workbook; a text
   file inside one whose name matches no chapter.file of that workbook
   becomes a chapter, carrying the file's own text and its first heading (or
   its file name) as the title. Matching is case-insensitive, because two of
   the three file systems these apps run on are.

   This pass only ever *adds*. A file a chapter already owns is left exactly
   as it is — reading it back would quietly overwrite an edit made here that
   hasn't reached disk yet — and nothing on disk is renamed or removed.
   docs/FEATURES.md § E. */
const WB_ADOPT_RE = /\.(md|markdown|txt)$/i;

async function wbDirEntries(handle, kind) {
  const out = [];
  if (!handle || typeof handle.values !== 'function') return out;
  try {
    for await (const entry of handle.values()) if (entry.kind === kind) out.push(entry);
  } catch (e) { return out; }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function wbAdoptFromFolder() {
  const found = { books: 0, chapters: 0 };
  if (!wbFolderMode()) return found;
  let md = null;
  try {
    md = await ScuLaFolder.dir(!wbMirrorAsked);           // <root>/markdown
    wbMirrorAsked = true;
  } catch (e) { return found; }
  if (!md) return found;

  for (const entry of await wbDirEntries(md, 'directory')) {
    if (entry.name.charAt(0) === '.') continue;           // hidden / system, not a workbook
    const folder = entry.name;
    let book = wbBooks.find(b => (b.folder || '').toLowerCase() === folder.toLowerCase());
    if (!book) {
      // The folder name is the workbook's name as well as its folder: it is
      // what the person typed, and wbSlug() would only take it further from
      // the tree it has to keep matching.
      book = {
        id: wbNewId('wb_'), name: folder, folder: folder,
        created: Date.now(), updated: Date.now(), order: wbBooks.length
      };
      wbBooks.push(book);
      if (!await wbPersist(WB_BOOKS, book)) { wbBooks.pop(); continue; }
      wbOpenBooks.add(book.id);
      found.books++;
    }

    const taken = new Set(wbChaptersOf(book.id).map(c => (c.file || '').toLowerCase()));
    let order = wbChaptersOf(book.id).length;
    for (const fileEntry of await wbDirEntries(entry, 'file')) {
      if (!WB_ADOPT_RE.test(fileEntry.name)) continue;
      if (taken.has(fileEntry.name.toLowerCase())) continue;
      let file, text;
      try { file = await fileEntry.getFile(); text = await file.text(); }
      catch (e) { continue; }
      const ch = {
        id: wbNewId('ch_'), workbookId: book.id,
        title: wbTitleFromText(text, fileEntry.name.replace(/\.[^.]+$/, '')),
        file: fileEntry.name, content: text,
        created: file.lastModified || Date.now(),
        updated: file.lastModified || Date.now(),
        order: order
      };
      wbChapters.push(ch);
      if (!await wbPersist(WB_CHAPTERS, ch)) { wbChapters.pop(); continue; }
      taken.add(ch.file.toLowerCase());
      order++;
      found.chapters++;
    }
  }
  return found;
}

/* ── Panel rendering ── */
function wbActBtn(label, title, fn) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'wb-act';
  b.textContent = label;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.addEventListener('click', ev => { ev.stopPropagation(); fn(); });
  return b;
}
/* Inline rename for workbook / chapter names in the panel.
   Reachable by double-clicking a name, or focusing it (one click) and
   pressing F2. Enter/blur commits, Escape cancels. */
let wbNameClickTimer = null;   // debounces the single click on a name vs. a dblclick
let wbLastName = null;         // {type,id} of the last name touched — survives repaints, so F2 still targets it

function wbInlineRename(span, current, commit) {
  if (span.getAttribute('contenteditable') === 'true') return;
  const restore = span.textContent;
  span.setAttribute('contenteditable', 'true');
  span.spellcheck = false;
  span.classList.add('wb-name-editing');
  span.textContent = current;
  span.focus();
  const range = document.createRange();
  range.selectNodeContents(span);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  let settled = false;
  const cleanup = () => {
    span.removeAttribute('contenteditable');
    span.classList.remove('wb-name-editing');
    span.removeEventListener('keydown', onKey);
    span.removeEventListener('blur', onBlur);
  };
  const cancel = () => {
    if (settled) return;
    settled = true;
    cleanup();
    span.textContent = restore;
  };
  const save = () => {
    if (settled) return;
    settled = true;
    const val = span.textContent.replace(/\s+/g, ' ').trim();
    cleanup();
    span.textContent = restore;          // renderWorkbooks() repaints if the name really changed
    if (val && val !== current) commit(val);
  };
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  };
  const onBlur = () => save();
  span.addEventListener('keydown', onKey);
  span.addEventListener('blur', onBlur);
}

function wbInlineRenameById(type, id) {
  const esc = window.CSS && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
  if (type === 'book') {
    const book = wbBook(id);
    const span = document.querySelector('.wb-book-name[data-wb-id="' + esc + '"]');
    if (book && span) wbInlineRename(span, book.name, v => renameWorkbook(id, v));
  } else {
    const ch = wbChapter(id);
    const span = document.querySelector('.wb-ch-name[data-wb-id="' + esc + '"]');
    if (ch && span) wbInlineRename(span, ch.title, v => renameChapter(id, v));
  }
}

// Wire a name <span> so a click still does its normal job (open/toggle, after a
// short delay), while a double-click renames instead. F2 is handled globally.
function wbBindName(span, type, id, singleClick) {
  span.tabIndex = 0;
  span.dataset.wbId = id;
  span.dataset.wbType = type;
  span.title = t('wbRenameHint');
  span.addEventListener('focus', () => { wbLastName = { type, id }; });
  span.addEventListener('click', (e) => {
    e.stopPropagation();
    wbLastName = { type, id };
    clearTimeout(wbNameClickTimer);
    wbNameClickTimer = setTimeout(singleClick, 230);
  });
  span.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    e.preventDefault();
    clearTimeout(wbNameClickTimer);
    wbInlineRenameById(type, id);
  });
}

let wbDraggedChapterId = null;
let wbMovingChapter = false;
let wbTouchDrag = null;
function wbClearDropHint(endDrag = false) {
  document.querySelectorAll('.wb-drop-before, .wb-drop-after, .wb-drop-append' + (endDrag ? ', .wb-dragging' : ''))
    .forEach(el => el.classList.remove('wb-drop-before', 'wb-drop-after', 'wb-drop-append', 'wb-dragging'));
}
function wbBindChapterDrop(el, bookId, targetId = null) {
  el.dataset.wbDropBook = bookId;
  if (targetId) el.dataset.wbDropChapter = targetId;
  el.addEventListener('dragover', e => {
    if (!wbDraggedChapterId || wbMovingChapter || !wbBook(bookId)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    wbClearDropHint();
    const before = targetId && e.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2;
    el.classList.add(targetId ? (before ? 'wb-drop-before' : 'wb-drop-after') : 'wb-drop-append');
  });
  el.addEventListener('drop', e => {
    if (!wbDraggedChapterId || wbMovingChapter) return;
    e.preventDefault();
    e.stopPropagation();
    const before = targetId && e.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2;
    const id = wbDraggedChapterId;
    wbDraggedChapterId = null;
    wbClearDropHint(true);
    wbMoveChapterTo(id, bookId, targetId, before);
  });
}

// A long press starts a chapter move on touch screens. Until then, the list
// keeps its normal tap and vertical scroll behaviour.
function wbTouchAt(x, y) {
  const hit = document.elementFromPoint(x, y);
  const el = hit && hit.closest('[data-wb-drop-book]');
  if (!el || !document.getElementById('wb-tree').contains(el) || !wbBook(el.dataset.wbDropBook)) return null;
  const targetId = el.dataset.wbDropChapter || null;
  const before = !!targetId && y < el.getBoundingClientRect().top + el.offsetHeight / 2;
  return { el, bookId: el.dataset.wbDropBook, targetId, before };
}
function wbTouchHint(x, y) {
  wbClearDropHint();
  const target = wbTouchAt(x, y);
  if (target) target.el.classList.add(target.targetId ? (target.before ? 'wb-drop-before' : 'wb-drop-after') : 'wb-drop-append');
  return target;
}
function wbTouchFor(e) {
  return wbTouchDrag && Array.from(e.changedTouches).find(touch => touch.identifier === wbTouchDrag.identifier);
}
document.addEventListener('touchstart', e => {
  if (!wbTouchDrag || e.touches.length < 2) return;
  clearTimeout(wbTouchDrag.timer);
  wbTouchDrag = null;
  wbDraggedChapterId = null;
  wbClearDropHint(true);
}, { passive: true });
function wbEndTouchDrag(e, cancelled = false) {
  const touch = wbTouchFor(e);
  if (!touch) return;
  const drag = wbTouchDrag;
  clearTimeout(drag.timer);
  wbTouchDrag = null;
  if (!drag.active) return;
  e.preventDefault(); // also suppresses the synthetic click after a drop
  const target = cancelled ? null : wbTouchAt(touch.clientX, touch.clientY);
  wbDraggedChapterId = null;
  wbClearDropHint(true);
  if (target) wbMoveChapterTo(drag.id, target.bookId, target.targetId, target.before);
}
document.addEventListener('touchmove', e => {
  const touch = wbTouchFor(e);
  if (!touch) return;
  if (!wbTouchDrag.active) {
    if (Math.hypot(touch.clientX - wbTouchDrag.x, touch.clientY - wbTouchDrag.y) > 8) {
      clearTimeout(wbTouchDrag.timer);
      wbTouchDrag = null;
    }
    return;
  }
  e.preventDefault();
  wbTouchHint(touch.clientX, touch.clientY);
}, { passive: false });
document.addEventListener('touchend', e => wbEndTouchDrag(e), { passive: false });
document.addEventListener('touchcancel', e => wbEndTouchDrag(e, true), { passive: false });

// Forget the remembered name once the user clicks anywhere that isn't a name.
document.addEventListener('click', (e) => {
  if (!e.target.closest || !e.target.closest('.wb-book-name, .wb-ch-name')) wbLastName = null;
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'F2') return;
  const el = document.activeElement;
  if (el && el.classList && el.classList.contains('wb-book-name')) { e.preventDefault(); wbInlineRenameById('book', el.dataset.wbId); return; }
  if (el && el.classList && el.classList.contains('wb-ch-name')) { e.preventDefault(); wbInlineRenameById('chapter', el.dataset.wbId); return; }
  if (wbLastName) {
    const tag = el && el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (el && el.isContentEditable)) return;
    e.preventDefault();
    clearTimeout(wbNameClickTimer);
    wbInlineRenameById(wbLastName.type, wbLastName.id);
  }
});

function renderWorkbooks() {
  invalidateWikiIndex();      // titles and files are what [[links]] resolve against
  const filterBeforePaint = wbResponsibleFilter;
  wbPaintResponsibleSelect();
  const tree = document.getElementById('wb-tree');
  if (!tree) return;
  tree.textContent = '';

  if (!wbBooks.length) {
    const empty = document.createElement('div');
    empty.className = 'wb-empty';
    empty.textContent = t('wbEmpty');
    tree.appendChild(empty);
  }

  const orderedBooks = wbBooks.slice().sort(wbByOrder);
  orderedBooks.forEach((book, bookIdx) => {
    const chapters = wbChaptersOf(book.id);
    const todoBook = wbIsTodoBook(book);
    const todoFiltered = todoBook && wbTodoOnly.has(book.id);
    const shownChapters = chapters.filter(ch => {
      const content = ch.id === wbCurrentId ? editor.value : ch.content || '';
      if (wbTaskStatusFilter && !wbChapterHasTaskStatus(content, wbTaskStatusFilter)) return false;
      if (wbImportanceFilter) return wbChapterHasImportanceTask(content, wbImportanceFilter, todoFiltered, wbResponsibleFilter);
      return (!todoFiltered || wbChapterHasOpenTask(ch, content)) &&
        (!wbResponsibleFilter || wbNamesForChapter(ch).has(wbResponsibleFilter));
    });
    if ((wbTaskStatusFilter || wbResponsibleFilter || wbImportanceFilter) && !shownChapters.length) return;
    const open = wbOpenBooks.has(book.id) || ((wbTaskStatusFilter || wbResponsibleFilter || wbImportanceFilter) && shownChapters.length > 0);

    const wrap = document.createElement('div');
    wrap.className = 'wb-book' + (open ? ' open' : '');

    const row = document.createElement('div');
    row.className = 'wb-book-row' + (chapters.some(c => wbPendingIds.has(c.id)) ? ' has-modified' : '');
    row.title = book.folder + '/';
    wbBindChapterDrop(row, book.id);
    row.addEventListener('click', () => {
      if (open) wbOpenBooks.delete(book.id); else wbOpenBooks.add(book.id);
      renderWorkbooks();
    });

    const twist = document.createElement('span');
    twist.className = 'wb-twist';
    twist.textContent = open ? '▼' : '▶';
    const name = document.createElement('span');
    name.className = 'wb-book-name';
    name.textContent = '📓 ' + book.name;
    wbBindName(name, 'book', book.id, () => {
      if (wbOpenBooks.has(book.id)) wbOpenBooks.delete(book.id); else wbOpenBooks.add(book.id);
      renderWorkbooks();
    });
    const count = document.createElement('span');
    count.className = 'wb-count';
    count.textContent = todoFiltered || wbResponsibleFilter || wbImportanceFilter ? shownChapters.length + '/' + chapters.length : chapters.length;

    const acts = document.createElement('div');
    acts.className = 'wb-acts';
    if (bookIdx > 0) acts.appendChild(wbActBtn('▲', t('moveWorkbookUpTip'), () => moveWorkbook(book.id, -1)));
    if (bookIdx < orderedBooks.length - 1) acts.appendChild(wbActBtn('▼', t('moveWorkbookDownTip'), () => moveWorkbook(book.id, 1)));
    acts.appendChild(wbActBtn('＋', t('addChapterTip'), () => newChapter(book.id)));
    if (todoBook) {
      const fBtn = wbActBtn('☑', t(todoFiltered ? 'filterTodoOffTip' : 'filterTodoOnTip'), () => {
        if (wbTodoOnly.has(book.id)) { wbTodoOnly.delete(book.id); }
        else { wbTodoOnly.add(book.id); wbOpenBooks.add(book.id); }
        renderWorkbooks();
      });
      if (todoFiltered) fBtn.classList.add('on');
      acts.appendChild(fBtn);
    }
    acts.appendChild(wbActBtn('✎', t('renameWorkbookTip'), () => renameWorkbook(book.id)));
    acts.appendChild(wbActBtn('🗑', t('deleteWorkbookTip'), () => deleteWorkbook(book.id)));

    row.appendChild(twist); row.appendChild(name); row.appendChild(count); row.appendChild(acts);
    wrap.appendChild(row);

    const list = document.createElement('div');
    list.className = 'wb-chapters';
    wbBindChapterDrop(list, book.id);
    if (!chapters.length) {
      const none = document.createElement('div');
      none.className = 'wb-ch-empty';
      none.textContent = t('wbNoChapters');
      list.appendChild(none);
    } else if (todoFiltered && !shownChapters.length) {
      const none = document.createElement('div');
      none.className = 'wb-ch-empty';
      none.textContent = t('wbNoOpenTasks');
      list.appendChild(none);
    }
    chapters.forEach((ch, chIdx) => {
      if (!shownChapters.includes(ch)) return;
      const chRow = document.createElement('div');
      chRow.className = 'wb-ch-row' + (ch.id === wbCurrentId ? ' current' : '') + (wbPendingIds.has(ch.id) ? ' modified' : '');
      chRow.title = book.folder + '/' + ch.file;
      chRow.draggable = true;
      chRow.addEventListener('dragstart', e => {
        if (wbMovingChapter || e.target.closest('[contenteditable="true"]')) { e.preventDefault(); return; }
        clearTimeout(wbNameClickTimer);
        wbDraggedChapterId = ch.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', ch.id);
        requestAnimationFrame(() => chRow.classList.add('wb-dragging'));
      });
      chRow.addEventListener('dragend', () => { wbDraggedChapterId = null; wbClearDropHint(true); });
      chRow.addEventListener('contextmenu', e => { if (wbTouchDrag && wbTouchDrag.active) e.preventDefault(); });
      chRow.addEventListener('touchstart', e => {
        if (wbTouchDrag || wbMovingChapter || e.touches.length !== 1 || e.target.closest('.wb-acts, [contenteditable="true"]')) return;
        const touch = e.changedTouches[0];
        const drag = { id: ch.id, identifier: touch.identifier, x: touch.clientX, y: touch.clientY, active: false, timer: null };
        wbTouchDrag = drag;
        drag.timer = setTimeout(() => {
          if (wbTouchDrag !== drag) return;
          drag.active = true;
          clearTimeout(wbNameClickTimer);
          wbDraggedChapterId = ch.id;
          chRow.classList.add('wb-dragging');
          wbTouchHint(drag.x, drag.y);
        }, 350);
      }, { passive: true });
      wbBindChapterDrop(chRow, book.id, ch.id);
      chRow.addEventListener('click', () => wbSelectChapter(ch.id));

      const chName = document.createElement('span');
      chName.className = 'wb-ch-name';
      chName.textContent = '📄 ' + ch.title;
      wbBindName(chName, 'chapter', ch.id, () => wbSelectChapter(ch.id));

      const chActs = document.createElement('div');
      chActs.className = 'wb-acts';
      if (chIdx > 0) chActs.appendChild(wbActBtn('▲', t('moveChapterUpTip'), () => moveChapter(ch.id, -1)));
      if (chIdx < chapters.length - 1) chActs.appendChild(wbActBtn('▼', t('moveChapterDownTip'), () => moveChapter(ch.id, 1)));
      chActs.appendChild(wbActBtn('✎', t('renameChapterTip'), () => renameChapter(ch.id)));
      chActs.appendChild(wbActBtn('⇪', t('exportChapterTip'), () => exportChapter(ch.id)));
      chActs.appendChild(wbActBtn('🗑', t('deleteChapterTip'), () => deleteChapter(ch.id)));

      chRow.appendChild(chName); chRow.appendChild(chActs);
      list.appendChild(chRow);
    });
    wrap.appendChild(list);
    tree.appendChild(wrap);
  });

  paintWorkbookWhere();
  paintWorkbookCrumb();
  if (filterBeforePaint && !wbResponsibleFilter) updatePreview();
}
function paintWorkbookWhere() {
  const el = document.getElementById('wb-where');
  if (!el) return;
  el.textContent = wbFolderMode()
    ? '📂 ' + ScuLaFolder.name() + '/' + ScuLaFolder.subdir() + '/'
    : t('wbLocalOnly');
}
function paintWorkbookCrumb() {
  const crumb = document.getElementById('wb-crumb');
  if (!crumb) return;
  const ch = wbChapter(wbCurrentId);
  const book = ch ? wbBook(ch.workbookId) : null;
  if (ch && book) {
    crumb.hidden = false;
    crumb.textContent = '📓 ' + book.name + ' › ' + ch.title;
    crumb.title = book.folder + '/' + ch.file;
  } else {
    crumb.hidden = true;
    crumb.textContent = '';
  }
}

/* ── Workbook / chapter operations ── */
async function createWorkbook() {
  const name = (prompt(t('promptNewWorkbook'), t('defaultWorkbookName')) || '').trim();
  if (!name) return null;
  const book = {
    id: wbNewId('wb_'), name, folder: wbUniqueFolder(name),
    created: Date.now(), updated: Date.now(), order: wbBooks.length
  };
  wbBooks.push(book);
  if (!await wbPersist(WB_BOOKS, book)) { wbBooks.pop(); return null; }
  wbOpenBooks.add(book.id);
  renderWorkbooks();
  wbSay(t('workbookCreated', book.name));
  return book;
}

async function renameWorkbook(id, preset) {
  const book = wbBook(id);
  if (!book) return;
  const name = (preset != null ? String(preset) : (prompt(t('promptRenameWorkbook'), book.name) || '')).trim();
  if (!name || name === book.name) return;
  const oldFolder = book.folder;
  book.name = name;
  book.folder = wbUniqueFolder(name, book.id);
  book.updated = Date.now();
  if (!await wbPersist(WB_BOOKS, book)) return;
  if (book.folder !== oldFolder && wbFolderMode()) {
    for (const ch of wbChaptersOf(book.id)) {
      await wbMirrorWrite(book, ch, ch.content || '');
      await wbMirrorRemove(oldFolder, ch.file);
    }
    await wbMirrorRemove(oldFolder, null);
  }
  renderWorkbooks();
}

async function deleteWorkbook(id) {
  const book = wbBook(id);
  if (!book) return;
  if (!confirm(t('confirmDeleteWorkbook', book.name))) return;
  const chapters = wbChaptersOf(book.id);
  for (const ch of chapters) {
    try { await wbDrop(WB_CHAPTERS, ch.id); } catch (e) {}
    await wbPendingClear(ch.id);
    await wbMirrorRemove(book.folder, ch.file);
  }
  await wbMirrorRemove(book.folder, null);
  try { await wbDrop(WB_BOOKS, book.id); } catch (e) {}
  // A grave per record, so the delete travels instead of being undone by the
  // next sync pulling it back from another browser — docs/FEATURES.md § O.
  for (const ch of chapters) await cloudTombstone(ch.id);
  await cloudTombstone(book.id);
  wbChapters = wbChapters.filter(c => c.workbookId !== book.id);
  wbBooks = wbBooks.filter(b => b.id !== book.id);
  wbOpenBooks.delete(book.id);
  if (chapters.some(c => c.id === wbCurrentId)) detachChapter();
  renderWorkbooks();
  wbSay(t('wbRemoved'));
  cloudAutoSync();
}

async function newChapter(workbookId) {
  const book = wbBook(workbookId);
  if (!book) return;
  const title = (prompt(t('promptNewChapter'), t('defaultChapterName')) || '').trim();
  if (!title) return;
  if (!canLeaveEditor()) return;
  await flushChapter();
  const ch = {
    id: wbNewId('ch_'), workbookId: book.id, title,
    file: wbUniqueFile(book.id, title), content: '',
    created: Date.now(), updated: Date.now(), order: wbChaptersOf(book.id).length
  };
  wbChapters.push(ch);
  if (!await wbPersist(WB_CHAPTERS, ch)) { wbChapters.pop(); return; }
  wbOpenBooks.add(book.id);
  loadChapterIntoEditor(ch);
  await wbMirrorWrite(book, ch, '');
}

function loadChapterIntoEditor(ch) {
  wbCurrentId = ch.id;
  wbDirty = false;
  clearTimeout(wbSaveTimer);
  editor.value = ch.content || '';
  undoReset();                 // the old chapter's history is not this one's
  document.getElementById('current-file').textContent = ch.file;
  updatePreview(); updateStatus(); updateNav();
  renderWorkbooks();
  wbMetaSet('last', ch.id).catch(() => {});
  wbDraftWrite();              // the journal points at this chapter from now on
  wbSay(t('chapterOpened', ch.title));
}

async function openChapter(id) {
  const ch = wbChapter(id);
  if (!ch || ch.id === wbCurrentId) return;
  if (!canLeaveEditor()) return;
  await flushChapter();
  loadChapterIntoEditor(ch);
  if (isSmallScreen()) closeAllPanels();
}

// Picking a chapter from the Caiete panel: select it, then close just that
// panel — but only once the switch actually went through (a pending unsaved
// loose file can refuse it via canLeaveEditor's confirm()), and only on
// phone/tablet (isSmallScreen, ≤1024px); on larger screens Caiete stays open.
async function wbSelectChapter(id) {
  await openChapter(id);
  if (wbCurrentId === id && isSmallScreen()) closeWbPanel();
}

async function renameChapter(id, preset) {
  const ch = wbChapter(id);
  if (!ch) return;
  const title = (preset != null ? String(preset) : (prompt(t('promptRenameChapter'), ch.title) || '')).trim();
  if (!title || title === ch.title) return;
  const book = wbBook(ch.workbookId);
  const oldFile = ch.file;
  ch.title = title;
  ch.file = wbUniqueFile(ch.workbookId, title, ch.id);
  ch.updated = Date.now();
  if (!await wbPersist(WB_CHAPTERS, ch)) return;
  if (book && ch.file !== oldFile && wbFolderMode()) {
    await wbMirrorWrite(book, ch, ch.content || '');
    await wbMirrorRemove(book.folder, oldFile);
  }
  if (ch.id === wbCurrentId) document.getElementById('current-file').textContent = ch.file;
  renderWorkbooks();
}

async function deleteChapter(id) {
  const ch = wbChapter(id);
  if (!ch) return;
  if (!confirm(t('confirmDeleteChapter', ch.title))) return;
  const book = wbBook(ch.workbookId);
  const wbPanel = document.getElementById('wb-panel');
  const keepOpen = !isSmallScreen() && !wbPanel.classList.contains('collapsed');
  try { await wbDrop(WB_CHAPTERS, ch.id); } catch (e) {}
  await wbPendingClear(ch.id);
  if (book) await wbMirrorRemove(book.folder, ch.file);
  wbChapters = wbChapters.filter(c => c.id !== ch.id);
  if (ch.id === wbCurrentId) detachChapter();
  await cloudTombstone(ch.id);          // docs/FEATURES.md § O
  renderWorkbooks();
  // On phone/tablet the panel is meant to close once its job is done; on
  // larger screens it stays put — a delete is not a reason to lose it, same
  // as picking a chapter (see wbSelectChapter).
  if (keepOpen && wbPanel.classList.contains('collapsed')) {
    wbPanel.classList.remove('collapsed');
    document.getElementById(PANELS['wb-panel']).classList.add('active');
  }
  wbSay(t('wbRemoved'));
  cloudAutoSync();
}

// Reorder a workbook among its siblings. Chapters keep their workbookId and
// their own per-book order, so they travel with the workbook automatically.
async function moveWorkbook(id, dir) {
  const ordered = wbBooks.slice().sort(wbByOrder);
  const i = ordered.findIndex(b => b.id === id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= ordered.length) return;
  ordered.splice(j, 0, ordered.splice(i, 1)[0]);
  const changed = [];
  ordered.forEach((b, k) => {
    if ((b.order || 0) !== k) { b.order = k; b.updated = Date.now(); changed.push(b); }
  });
  for (const b of changed) { if (!await wbPersist(WB_BOOKS, b)) return; }
  renderWorkbooks();
}

// Reorder a chapter within its workbook.
async function moveChapter(id, dir) {
  const ch = wbChapter(id);
  if (!ch) return;
  const ordered = wbChaptersOf(ch.workbookId);
  const i = ordered.findIndex(c => c.id === id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= ordered.length) return;
  ordered.splice(j, 0, ordered.splice(i, 1)[0]);
  const changed = [];
  ordered.forEach((c, k) => {
    if ((c.order || 0) !== k) { c.order = k; c.updated = Date.now(); changed.push(c); }
  });
  for (const c of changed) { if (!await wbPersist(WB_CHAPTERS, c)) return; }
  renderWorkbooks();
}

// Drop before/after a chapter, or onto a workbook header/empty list to append.
// Persist the entire affected order in one transaction so a reload cannot see
// half a move. The chapter keeps its id, content, and open editor state.
async function wbMoveChapterTo(id, bookId, targetId, before) {
  if (wbMovingChapter) return;
  const ch = wbChapter(id), book = wbBook(bookId);
  if (!ch || !book || targetId === id) return;
  const target = targetId ? wbChapter(targetId) : null;
  if (targetId && (!target || target.workbookId !== bookId)) return;
  wbMovingChapter = true;
  try {
    if (id === wbCurrentId) await flushChapter();
    const oldBook = wbBook(ch.workbookId);
    const oldFile = ch.file;
    const changingBooks = ch.workbookId !== bookId;
    const source = wbChaptersOf(ch.workbookId).filter(c => c.id !== id);
    const destination = changingBooks ? wbChaptersOf(bookId) : source;
    const at = target ? destination.findIndex(c => c.id === targetId) + (before ? 0 : 1) : destination.length;
    if (at < 0) return;
    destination.splice(at, 0, ch);
    const now = Date.now();
    const changes = [];
    const fileTaken = changingBooks && destination.some(item => item.id !== id && item.file.toLowerCase() === ch.file.toLowerCase());
    const movedFile = fileTaken ? wbUniqueFile(bookId, ch.title, ch.id) : ch.file;
    const reindex = (items, workbookId) => items.forEach((item, order) => {
      const file = item.id === id && changingBooks ? movedFile : item.file;
      if (item.workbookId !== workbookId || item.order !== order || item.file !== file) {
        changes.push({ ...item, workbookId, order, file, updated: now });
      }
    });
    if (changingBooks) reindex(source, oldBook.id);
    reindex(destination, bookId);
    if (!changes.length) return;
    const pending = changingBooks && wbPendingIds.has(id)
      ? { chapterId: id, workbookId: bookId, content: ch.content, updated: now } : null;
    try {
      const db = await wbDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(pending ? [WB_CHAPTERS, WB_PENDING] : [WB_CHAPTERS], 'readwrite');
        changes.forEach(item => tx.objectStore(WB_CHAPTERS).put(item));
        if (pending) tx.objectStore(WB_PENDING).put(pending);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }).finally(() => db.close());
    } catch (e) { wbSay(t('wbStoreFailed'), true); return; }
    changes.forEach(item => Object.assign(wbChapter(item.id), item));
    if (changingBooks) {
      wbOpenBooks.add(bookId);
      if (id === wbCurrentId) {
        document.getElementById('current-file').textContent = ch.file;
        wbDraftWrite();
      }
      if (wbFolderMode()) {
        const written = await wbMirrorWrite(book, ch, ch.content || '');
        if (written) {
          await wbMirrorRemove(oldBook.folder, oldFile);
          if (pending) await wbPendingClear(id);
        } else {
          await wbPendingMark(ch);
        }
      }
    }
    renderWorkbooks();
    cloudAutoSync();
  } finally { wbMovingChapter = false; }
}

// Hands one chapter out through the shared route: the markdown folder on
// desktop, the OS share sheet on a phone, a download otherwise.
function exportChapter(id) {
  const ch = wbChapter(id);
  if (!ch) return;
  const book = wbBook(ch.workbookId);
  const name = (book ? book.folder + '-' : '') + ch.file;
  ScuLaFolder.save(name, new Blob([ch.content || ''], { type: 'text/markdown' }));
}

/* Every direction in one press, in this order: read the folder for
   workbooks and chapters that only exist there yet, trade with Google Drive
   (§ O), then write every chapter out into the folder.

   The cloud sits in the middle for the new device's sake. A phone that has
   just been handed a folder has nothing of its own, and what the person
   means by the press is "bring my chapters here": so what Drive holds has to
   reach IndexedDB *before* the write pass, or it would only be marked
   pending and wait for another press. Whatever the read pass adopted is in
   IndexedDB by then too, which is all the merge needs to carry it up.

   A press is where a sign-in is allowed to happen, so a device that was
   never connected, or whose hour-long token lapsed, gets the popup here —
   first thing, while the click still counts as a gesture (the folder's own
   permission prompt, when there is one, goes just before it for the same
   reason). Closing the popup is an answer: the folder half runs anyway.
   { cloud: false } is the first-run modal's "no": the folder only. */
async function syncAllToFolder(opts) {
  if (!wbFolderMode()) { ScuLaFolder.chooser(); return; }
  try { await ScuLaFolder.dir(!wbMirrorAsked); wbMirrorAsked = true; } catch (e) {}
  let cloud = location.protocol !== 'file:' && !(opts && opts.cloud === false);
  let r = null, cloudMsg = '';
  if (cloud && !gsLive()) {
    try {
      gsInteractive = true;
      await gsAuth(true);
    } catch (e) {
      cloud = false;
      const m = (e && e.message) || String(e);
      cloudMsg = /^(cancelled|popup_closed|popup_failed_to_open|stale)$/.test(m) ? t('cloudSkipped') : t('cloudError', m);
    } finally { gsInteractive = false; paintCloud(); }
  }

  await flushChapter();
  const found = await wbAdoptFromFolder();

  if (cloud) {
    try {
      r = await cloudSync(true);
      if (r) cloudMsg = (r.up || r.down) ? t('cloudDone', r) : t('cloudNothing');
    } catch (e) {
      const m = (e && e.message) || String(e);
      cloudMsg = t('cloudError', m);
    }
  }

  let n = 0;
  for (const book of wbBooks) {
    for (const ch of wbChaptersOf(book.id)) {
      if (await wbMirrorWrite(book, ch, ch.content || '')) n++;
    }
  }
  for (const id of [...wbPendingIds]) await wbPendingClear(id);   // everything is on disk now
  renderWorkbooks();

  let msg = t('wbSynced', n);
  if (found.books || found.chapters) msg = t('wbAdopted', found) + ' ' + msg;
  if (cloudMsg) msg += ' ' + cloudMsg;
  wbSay(msg, true);
}

/* ── Autosave: the open chapter is written back to IndexedDB as you type,
   so nothing is lost on any device. Disk mirroring stays on explicit saves,
   which is where a permission prompt is allowed to happen. ── */
function scheduleAutosave() {
  // Every editor mutation the person causes comes through here, including the
  // ones with no chapter attached — which is what tells boot apart from a
  // browser that restored the old text on its own.
  wbUserEdited = true;
  if (!wbCurrentId) return;   // loose text: the journal in updateStatus() has it
  wbDirty = true;
  wbSay(t('wbEditing'));
  clearTimeout(wbSaveTimer);
  wbSaveTimer = setTimeout(() => { flushChapter(); }, 800);
}
async function flushChapter() {
  clearTimeout(wbSaveTimer);
  if (!wbCurrentId || !wbDirty) return;
  const ch = wbChapter(wbCurrentId);
  if (!ch) { wbDirty = false; return; }
  ch.content = editor.value;
  ch.updated = Date.now();
  wbDirty = false;
  if (await wbPersist(WB_CHAPTERS, ch)) {
    const wasPending = wbPendingIds.has(ch.id);
    await wbPendingMark(ch);
    if (!wasPending) renderWorkbooks();   // show the "modified" dot
    wbSay(t('wbAutosaved'));
    cloudAutoSync();                      // and, debounced, up to Drive — § O
  }
}
function detachChapter() {
  clearTimeout(wbSaveTimer);
  wbCurrentId = null;
  wbDirty = false;
  wbMetaSet('last', '').catch(() => {});
  wbDraftWrite();              // now a loose file, and the journal says so
  wbPaintAttach();
  wbSay('');
  renderWorkbooks();
}
// A chapter is always safe to leave (autosave already stored it); a loose
// file with text in it is not.
function canLeaveEditor() {
  if (wbCurrentId) return true;
  if (!editor.value.trim()) return true;
  return confirm(t('confirmLeaveUnsaved'));
}

/* ── Saving into a workbook ── */
async function saveToWorkbook() {
  if (!wbCurrentId) { openWorkbookModal(); return; }
  const ch = wbChapter(wbCurrentId);
  const book = ch && wbBook(ch.workbookId);
  if (!ch || !book) { detachChapter(); openWorkbookModal(); return; }
  clearTimeout(wbSaveTimer);
  ch.content = editor.value;
  ch.updated = Date.now();
  wbDirty = false;
  if (!await wbPersist(WB_CHAPTERS, ch)) return;
  const path = await wbMirrorWrite(book, ch, ch.content);
  await wbPendingClear(ch.id);
  wbSay(path ? t('wbSavedTo', path) : t('wbSavedLocal'), true);
  renderWorkbooks();
  cloudAutoSync();
}

/* Save every chapter edited since its last save — write each one's .md
   file, then drop its pending marker. Header button + Ctrl+Alt+S. */
async function saveAllModifiedChapters() {
  await flushChapter();                       // fold in the open chapter's latest edits
  const ids = [...wbPendingIds];
  if (!ids.length) { wbSay(t('wbNoModified'), true); return; }
  let done = 0, failed = 0;
  for (const id of ids) {
    const ch = wbChapter(id);
    if (!ch) { await wbPendingClear(id); continue; }
    const book = wbBook(ch.workbookId);
    if (!book) { failed++; continue; }
    try {
      await wbMirrorWrite(book, ch, ch.content || '');
      await wbPendingClear(id);
      done++;
    } catch (e) { failed++; }
  }
  wbSay(failed ? t('wbSavedSomeModified', done) : t('wbSavedAllModified', done), true);
  renderWorkbooks();
  cloudAutoSync();
}

function openWorkbookModal() {
  const sel = document.getElementById('wb-select');
  sel.textContent = '';
  wbBooks.slice().sort(wbByOrder).forEach(b => {
    const o = document.createElement('option');
    o.value = b.id; o.textContent = b.name;
    sel.appendChild(o);
  });
  const fresh = document.createElement('option');
  fresh.value = '__new__'; fresh.textContent = t('optNewWorkbook');
  sel.appendChild(fresh);

  const current = wbChapter(wbCurrentId);
  sel.value = current ? current.workbookId : (wbBooks.length ? sel.options[0].value : '__new__');
  document.getElementById('wb-new-name').value = '';
  document.getElementById('wb-chapter-title').value = current ? current.title : wbGuessTitle();
  onWorkbookSelectChange();
  if (current) document.getElementById('wb-chapter-select').value = current.id;
  onChapterSelectChange();
  document.getElementById('workbook-modal').classList.add('open');
  setTimeout(() => {
    const focusNew = sel.value === '__new__';
    document.getElementById(focusNew ? 'wb-new-name' : 'wb-chapter-title').focus();
  }, 40);
}
function closeWorkbookModal() { document.getElementById('workbook-modal').classList.remove('open'); }

function onWorkbookSelectChange() {
  const sel = document.getElementById('wb-select');
  const isNew = sel.value === '__new__';
  document.getElementById('wb-new-field').hidden = !isNew;

  const chSel = document.getElementById('wb-chapter-select');
  chSel.textContent = '';
  const fresh = document.createElement('option');
  fresh.value = '__new__'; fresh.textContent = t('optNewChapter');
  chSel.appendChild(fresh);
  if (!isNew) {
    wbChaptersOf(sel.value).forEach(c => {
      const o = document.createElement('option');
      o.value = c.id; o.textContent = c.title;
      chSel.appendChild(o);
    });
  }
  chSel.value = '__new__';
  onChapterSelectChange();
}
function onChapterSelectChange() {
  const chSel = document.getElementById('wb-chapter-select');
  document.getElementById('wb-title-field').hidden = chSel.value !== '__new__';
  paintWorkbookPathHint();
}
function paintWorkbookPathHint() {
  const hint = document.getElementById('wb-path-hint');
  if (!hint) return;
  const sel = document.getElementById('wb-select');
  const chSel = document.getElementById('wb-chapter-select');
  const book = sel.value === '__new__' ? null : wbBook(sel.value);
  const folder = book ? book.folder
    : wbSlug(document.getElementById('wb-new-name').value, t('untitledWorkbook'));
  const chosen = chSel.value === '__new__' ? null : wbChapter(chSel.value);
  const file = chosen ? chosen.file
    : wbSlug(document.getElementById('wb-chapter-title').value, t('untitledChapter')) + '.md';
  const sub = typeof ScuLaFolder !== 'undefined' ? ScuLaFolder.subdir() : 'markdown';
  hint.textContent = t('wbPathHint', sub + '/' + folder + '/' + file);
}

async function confirmSaveToWorkbook() {
  const sel = document.getElementById('wb-select');
  let book;
  if (sel.value === '__new__') {
    const name = document.getElementById('wb-new-name').value.trim();
    if (!name) { alert(t('needWorkbookName')); return; }
    book = {
      id: wbNewId('wb_'), name, folder: wbUniqueFolder(name),
      created: Date.now(), updated: Date.now(), order: wbBooks.length
    };
    wbBooks.push(book);
    if (!await wbPersist(WB_BOOKS, book)) { wbBooks.pop(); return; }
  } else {
    book = wbBook(sel.value);
    if (!book) return;
  }

  const chSel = document.getElementById('wb-chapter-select');
  let ch;
  if (chSel.value === '__new__') {
    const title = document.getElementById('wb-chapter-title').value.trim();
    if (!title) { alert(t('needChapterTitle')); return; }
    ch = {
      id: wbNewId('ch_'), workbookId: book.id, title,
      file: wbUniqueFile(book.id, title), content: editor.value,
      created: Date.now(), updated: Date.now(), order: wbChaptersOf(book.id).length
    };
    wbChapters.push(ch);
    if (!await wbPersist(WB_CHAPTERS, ch)) { wbChapters.pop(); return; }
  } else {
    ch = wbChapter(chSel.value);
    if (!ch) return;
    ch.content = editor.value;
    ch.updated = Date.now();
    if (!await wbPersist(WB_CHAPTERS, ch)) return;
  }

  clearTimeout(wbSaveTimer);
  wbCurrentId = ch.id;
  wbDirty = false;
  wbOpenBooks.add(book.id);
  wbFileLabel(ch.file);
  wbMetaSet('last', ch.id).catch(() => {});
  wbDraftWrite();              // the journal follows the new attachment
  wbPaintAttach();
  closeWorkbookModal();
  renderWorkbooks();
  const path = await wbMirrorWrite(book, ch, ch.content);
  await wbPendingClear(ch.id);
  wbSay(path ? t('wbSavedTo', path) : t('wbSavedLocal'), true);
}

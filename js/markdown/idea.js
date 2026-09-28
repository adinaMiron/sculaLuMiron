/* ============================================================
   QUICK IDEA CAPTURE  (💡 button, Ctrl+Alt+I)
   One textarea for a thought you don't want to lose. The first
   line may name the chapter it belongs to — not the workbook:

       Editor: - [ ] write code to bla bla bla

   Everything after that first ":" is appended verbatim to the
   chapter called "Editor", wherever it lives, and that chapter is
   written to its .md file exactly as Ctrl+S would write it.
   No chapter of that name anywhere? The text is kept whole and
   filed in the "Idei" workbook, under a chapter named for today —
   both created on the spot if they are not there yet.
   A chapter picker above the textarea (title search, pre-filled with the
   open chapter) overrides that routing — see ideaResolve().
   Full description: docs/FEATURES.md § J.
   ============================================================ */
const IDEA_BOOK = 'Idei';

/* "Editor: - [ ] write the code" → { name:'Editor', body:'- [ ] write the code' }.
   Only the first line is inspected, and only its first ":" — a chapter name
   with a colon in it is not something anyone types into this box, while an
   idea full of colons is ordinary. A name longer than this is prose, not a
   name, so it is left as part of the idea. */
const IDEA_NAME_MAX = 80;
function ideaSplit(raw) {
  const text = String(raw || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return { name: '', body: '', text: '' };
  const nl = text.indexOf('\n');
  const first = nl === -1 ? text : text.slice(0, nl);
  const colon = first.indexOf(':');
  if (colon === -1) return { name: '', body: text, text };
  const name = first.slice(0, colon).trim();
  const rest = (first.slice(colon + 1) + (nl === -1 ? '' : text.slice(nl))).trim();
  if (!name || name.length > IDEA_NAME_MAX || !rest) return { name: '', body: text, text };
  return { name, body: rest, text };
}

/* The chapter a name points at, or null. resolveWiki() is the app's one
   name→note resolver — the same one [[links]] go through — so an idea
   addresses a chapter exactly the way a wikilink does: path, Workbook/Title,
   title, file name, nearest workbook wins. Only the passes after it are new:
   an idea is typed in a hurry, so case and diacritics are ignored, and a
   prefix or fragment that fits exactly one chapter is enough. */
function ideaFold(v) { return fdFold(String(v || '')).toLowerCase(); }
function ideaFindChapter(name) {
  if (!name) return null;
  const direct = resolveWiki(name, wbCurrentId);
  if (direct && direct.chapterId) return wbChapter(direct.chapterId);
  const notes = wikiNotes().filter(n => n.chapterId);
  if (!notes.length) return null;
  const want = ideaFold(name);
  const keys = n => [n.title, n.base, n.file, n.bookName ? n.bookName + '/' + n.title : '']
    .filter(Boolean).map(ideaFold);
  const nearest = hits => {
    const from = wbCurrentId ? wbChapter(wbCurrentId) : null;
    const near = from && hits.find(n => n.bookId === from.workbookId);
    return wbChapter((near || hits[0]).chapterId);
  };
  const exact = notes.filter(n => keys(n).includes(want));
  if (exact.length) return nearest(exact);
  const starts = notes.filter(n => keys(n).some(k => k.startsWith(want)));
  if (starts.length === 1) return nearest(starts);
  const inside = notes.filter(n => keys(n).some(k => k.includes(want)));
  return inside.length === 1 ? nearest(inside) : null;
}

/* Local date, never toISOString() — that is UTC, and an idea jotted down at
   one in the morning would be filed under yesterday. */
function ideaToday() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function ideaFallbackBook() {
  const want = ideaFold(IDEA_BOOK);
  return wbBooks.find(b => ideaFold(b.name) === want) || null;
}
async function ideaEnsureBook() {
  const found = ideaFallbackBook();
  if (found) return found;
  const book = {
    id: wbNewId('wb_'), name: IDEA_BOOK, folder: wbUniqueFolder(IDEA_BOOK),
    created: Date.now(), updated: Date.now(), order: wbBooks.length
  };
  wbBooks.push(book);
  if (!await wbPersist(WB_BOOKS, book)) { wbBooks.pop(); return null; }
  invalidateWikiIndex();
  return book;
}
async function ideaEnsureChapter(book, title) {
  const want = ideaFold(title);
  const found = wbChaptersOf(book.id).find(c => ideaFold(c.title) === want);
  if (found) return found;
  const ch = {
    id: wbNewId('ch_'), workbookId: book.id, title,
    file: wbUniqueFile(book.id, title), content: '',
    created: Date.now(), updated: Date.now(), order: wbChaptersOf(book.id).length
  };
  wbChapters.push(ch);
  if (!await wbPersist(WB_CHAPTERS, ch)) { wbChapters.pop(); return null; }
  invalidateWikiIndex();
  return ch;
}

/* Append one idea to a chapter and write its file — the same two writes
   Ctrl+S makes (IndexedDB, then the folder mirror), for a chapter that is
   usually *not* the one in the editor. When it happens to be the open one,
   the textarea has to move with it, or the next autosave writes the idea
   straight back out. */
async function ideaAppendTo(ch, line) {
  const book = wbBook(ch.workbookId);
  if (!book) return null;
  const open = ch.id === wbCurrentId;
  const before = (open ? editor.value : (ch.content || '')).replace(/\s+$/, '');
  ch.content = (before ? before + '\n' : '') + line + '\n';
  ch.updated = Date.now();
  if (open) {
    clearTimeout(wbSaveTimer);
    editor.value = ch.content;
    undoReset();               // the idea is already written out; undoing it
    wbDirty = false;           // here would lose it on the next autosave

    updatePreview(); updateStatus(); updateNav();
  }
  if (!await wbPersist(WB_CHAPTERS, ch)) return null;
  const path = await wbMirrorWrite(book, ch, ch.content);
  await wbPendingClear(ch.id);
  wbOpenBooks.add(book.id);
  renderWorkbooks();
  return { book, chapter: ch, path };
}

/* ── The chapter picker ──
   { id, how } — how is 'open' (pre-filled soft default) or 'picked'
   (clicked / Enter). null = the input holds a search, or nothing. */
let ideaPick = null;
let ideaSel = 0;

// Titles only, case and diacritics ignored: exact title first, then titles
// that start with the words, then the rest — each group in workbook order,
// then chapter order.
function ideaChapterMatches(q) {
  const want = ideaFold(q).trim();
  if (!want) return [];
  const exact = [], starts = [], rest = [];
  wbBooks.forEach(b => wbChaptersOf(b.id).forEach(c => {
    const title = ideaFold(c.title);
    if (!title.includes(want)) return;
    (title === want ? exact : title.startsWith(want) ? starts : rest).push(c);
  }));
  return exact.concat(starts, rest);
}
// The one chapter the words point at, or { chapter:null, n } when they point
// at none or at several.
function ideaSearchResolve(q) {
  const list = ideaChapterMatches(q);
  const want = ideaFold(q).trim();
  const exact = list.filter(c => ideaFold(c.title) === want);
  if (exact.length === 1) return { chapter: exact[0], n: list.length };
  if (list.length === 1) return { chapter: list[0], n: 1 };
  return { chapter: null, n: list.length };
}

function ideaChapterEl() { return document.getElementById('idea-chapter'); }
function ideaSetPick(pick, title) {
  ideaPick = pick;
  const inp = ideaChapterEl();
  inp.value = pick ? title : '';
  inp.classList.toggle('picked', !!pick);
}
function ideaRenderChapterList() {
  const list = document.getElementById('idea-chapter-list');
  const q = ideaChapterEl().value.trim();
  list.textContent = '';
  if (ideaPick || !q) { list.classList.remove('open'); return; }
  const found = ideaChapterMatches(q);
  if (!found.length) {
    const none = document.createElement('div');
    none.className = 'ws-empty';
    none.textContent = t('ideaNoChapter');
    list.appendChild(none);
  }
  found.slice(0, 50).forEach((c, i) => {
    const book = wbBook(c.workbookId);
    const row = document.createElement('div');
    row.className = 'ws-item' + (i === ideaSel ? ' sel' : '');
    row.setAttribute('role', 'option');
    row.dataset.id = c.id;
    const name = document.createElement('span');
    name.className = 'ws-name';
    name.textContent = c.title;
    const where = document.createElement('span');
    where.className = 'ws-where';
    where.textContent = book ? book.name : '';
    row.append(name, where);
    row.addEventListener('mousedown', e => { e.preventDefault(); ideaChapterPick(c.id); });
    list.appendChild(row);
  });
  list.classList.add('open');
}
function ideaChapterPick(id) {
  const ch = wbChapter(id);
  if (!ch) return;
  ideaSetPick({ id, how: 'picked' }, ch.title);
  ideaRenderChapterList();
  document.getElementById('idea-text').focus();
  ideaPaintHint();
}
function ideaChapterInput() {
  ideaPick = null;
  ideaChapterEl().classList.remove('picked');
  ideaSel = 0;
  ideaRenderChapterList();
  ideaPaintHint();
}
function ideaChapterClear() {
  ideaSetPick(null);
  ideaSel = 0;
  ideaRenderChapterList();
  ideaChapterEl().focus();
  ideaPaintHint();
}
// ArrowUp/ArrowDown from the input: move .sel, clamped, no wrap.
function ideaChapterMove(step) {
  const rows = document.querySelectorAll('#idea-chapter-list .ws-item');
  if (!rows.length) return;
  ideaSel = Math.max(0, Math.min(rows.length - 1, ideaSel + step));
  rows.forEach((r, i) => r.classList.toggle('sel', i === ideaSel));
  rows[ideaSel].scrollIntoView({ block: 'nearest' });
}
// Enter from the input: pick the highlighted row; false when there is none.
function ideaChapterEnter() {
  const row = document.querySelector('#idea-chapter-list .ws-item.sel');
  if (!row) return false;
  ideaChapterPick(row.dataset.id);
  return true;
}

/* Where the idea goes — one function, so the hint can never disagree with
   the save. Order: a picked chapter, then search words that point at exactly
   one, then a "Name:" prefix that resolves, then the open chapter, then the
   original Idei routing. Docs: docs/FEATURES.md § J. */
function ideaResolve() {
  const { name, body, text } = ideaSplit(document.getElementById('idea-text').value);
  const out = { chapter: null, line: text, via: 'fallback', name, q: '', n: 0, body };
  const pick = ideaPick && wbChapter(ideaPick.id) ? ideaPick : null;
  if (ideaPick && !pick) ideaSetPick(null);   // the chapter is gone
  if (pick && pick.how === 'picked') {
    out.chapter = wbChapter(pick.id); out.via = 'picked';
    return out;
  }
  const q = ideaChapterEl().value.trim();
  if (!pick && q) {
    const found = ideaSearchResolve(q);
    if (found.chapter) { out.chapter = found.chapter; out.via = 'search'; return out; }
    out.q = q; out.n = found.n;
  }
  const named = ideaFindChapter(name);
  if (named) { out.chapter = named; out.line = body; out.via = 'prefix'; return out; }
  if (pick && pick.how === 'open') { out.chapter = wbChapter(pick.id); out.via = 'open'; }
  return out;
}

/* ── The modal ── */
function openIdeaModal() {
  const open = wbCurrentId ? wbChapter(wbCurrentId) : null;
  ideaSetPick(open ? { id: open.id, how: 'open' } : null, open ? open.title : '');
  ideaSel = 0;
  ideaRenderChapterList();
  document.getElementById('idea-modal').classList.add('open');
  ideaPaintHint();
  setTimeout(() => {
    const el = document.getElementById('idea-text');
    el.focus();
    el.selectionStart = el.selectionEnd = el.value.length;
  }, 40);
}
function closeIdeaModal() {
  document.getElementById('idea-modal').classList.remove('open');
  if (document.getElementById('btn-idea-dictate').classList.contains('active')) toggleIdeaDictation();
}

// Says where the idea will land, updated on every keystroke — the whole
// point of the box is that you can fire it off without thinking.
function ideaPaintHint() {
  const hint = document.getElementById('idea-hint');
  if (!hint) return;
  const r = ideaResolve();
  const today = ideaToday();
  const ideiTarget = { book: IDEA_BOOK, chapter: today };
  // Search words that were ignored (none or several matches) say so.
  const searchHint = target => t(r.n ? 'ideaHintSearchMany' : 'ideaHintSearchNone',
    { q: r.q, n: r.n, book: target.book, chapter: target.chapter });
  if (r.chapter) {
    const book = wbBook(r.chapter.workbookId);
    const target = { book: book ? book.name : IDEA_BOOK, chapter: r.chapter.title };
    hint.textContent = r.body && r.q ? searchHint(target) : t('ideaHintTo', target);
    return;
  }
  if (r.q) { hint.textContent = searchHint(ideiTarget); return; }
  if (!r.body) { hint.textContent = t('ideaHintIdle'); return; }
  if (r.name) { hint.textContent = t('ideaHintFallback', { name: r.name, ...ideiTarget }); return; }
  const book = ideaFallbackBook();
  const exists = book && wbChaptersOf(book.id).some(c => ideaFold(c.title) === ideaFold(today));
  hint.textContent = t(exists ? 'ideaHintTo' : 'ideaHintNew', ideiTarget);
}

async function saveIdea() {
  const el = document.getElementById('idea-text');
  const r = ideaResolve();
  if (!r.body) { wbSay(t('ideaEmpty'), true); el.focus(); return; }
  let target = r.chapter;
  if (!target) {
    const book = await ideaEnsureBook();
    target = book && await ideaEnsureChapter(book, ideaToday());
  }
  const done = target && await ideaAppendTo(target, r.line);
  if (!done) { wbSay(t('ideaFailed'), true); return; }
  el.value = '';
  ideaSetPick(null);
  ideaRenderChapterList();
  closeIdeaModal();
  const info = { book: done.book.name, chapter: done.chapter.title, path: done.path };
  wbSay(done.path ? t('ideaSavedTo', info) : t('ideaSaved', info), true);
}

/* ── Boot: load the tree, then reopen whatever was last edited ── */
async function loadWorkbooks() {
  try {
    const [books, chapters] = await Promise.all([wbAll(WB_BOOKS), wbAll(WB_CHAPTERS)]);
    wbBooks = (books || []).sort(wbByOrder);
    wbChapters = (chapters || []).sort(wbByOrder);
    try { (await wbAll(WB_PENDING) || []).forEach(r => { if (r && r.chapterId) wbPendingIds.add(r.chapterId); }); } catch (e) {}
  } catch (e) { wbBooks = []; wbChapters = []; }
  try {
    const saved = await wbMetaGet('responsibles');
    if (Array.isArray(saved)) saved.forEach(name => {
      if (typeof name === 'string' && name && !wbResponsibleSeen.has(wbResponsibleKey(name)))
        wbResponsibleSeen.set(wbResponsibleKey(name), name);
    });
  } catch (e) {}
  wbChapters.forEach(ch => wbRecordResponsibles(ch.content));
  wbBooted = true;
  renderWorkbooks();
  // The stored folder handle reloads asynchronously and the shared block
  // fires no event for it, so the "where do files go" line has to wait.
  ScuLaFolder.ready.then(paintWorkbookWhere, paintWorkbookWhere);

  let last = null;
  try { last = await wbMetaGet('last'); } catch (e) {}
  const ch = last ? wbChapter(last) : null;
  const draft = wbDraftRead();
  // Text nobody has typed into is the browser's own form restoration: a
  // reload, or a tab that was discarded while idle and came back. Resuming
  // *over* it is the point — an "untouched editor" used to mean an empty one,
  // so restored text kept its own chapter out of the editor, the header read
  // "untitled.md", and everything typed afterwards went into a loose file
  // autosave ignores. Typing that started while IndexedDB was still opening
  // is the one case that still wins over the resume.
  const untouched = !wbUserEdited && editor.value === wbBootText;
  if (ch && untouched) {
    wbOpenBooks.add(ch.workbookId);
    loadChapterIntoEditor(ch);
    // Whichever is ahead of the record wins: the journal when it carries this
    // chapter's keystrokes, otherwise the text the browser put back on screen
    // (that is what was last seen, and it cannot be older than the record).
    const ahead = wbDraftAhead(draft, ch);
    const boardLink = new URLSearchParams(location.search).has('chapter');
    const back = !boardLink && wbBootText.trim() && wbBootText !== (ch.content || '') ? wbBootText : null;
    const recovered = ahead != null ? ahead : back;
    if (recovered != null) {
      editor.value = recovered;
      wbDirty = true;
      updatePreview(); updateStatus(); updateNav();
      await flushChapter();
      wbSay(t('wbRecovered'), true);
    } else {
      wbSay(t('wbRestored', ch.title));
    }
  } else if (!ch && untouched && draft && draft.text.trim()) {
    // A loose file that was never saved into a chapter: bring the text back
    // instead of opening on the empty page that used to replace it.
    if (!editor.value.trim()) { editor.value = draft.text; undoReset(); }
    if (draft.name && wbFileLabel() === 'untitled.md') wbFileLabel(draft.name);
    updatePreview(); updateStatus(); updateNav();
    wbSay(t('wbDraftRestored'), true);
  }
  wbDraftReady = true;         // reconciled — from here the journal is written
  wbPaintAttach();
  wbDraftWrite();
  setTimeout(wbSettleRestore, 1200);
}

// A Kanban card can return to its exact checklist line. Keep this URL-only
// route independent of the normal last-chapter resume.
async function openKanbanTaskLink() {
  const query = new URLSearchParams(location.search);
  const id = query.get('chapter');
  if (!id || !wbChapter(id)) return;
  if (wbCurrentId !== id) await openChapter(id);
  if (wbCurrentId !== id) return;
  wbUserEdited = true;  // browser form restoration must not replace the selected chapter
  const line = Number(query.get('line'));
  if (!Number.isInteger(line) || line < 0) return;
  const lines = editor.value.split('\n');
  if (line >= lines.length) return;
  const at = lines.slice(0, line).reduce((n, item) => n + item.length + 1, 0);
  setView('source');
  editor.focus();
  editor.setSelectionRange(at, at + lines[line].length);
  try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
}

/* The other side of the same race. Where the restoration lands *after* this
   script instead of before it, the text changes under an attached chapter
   with no event to announce it — so one deferred look settles it. A change
   nobody typed is the browser's, and it is what was last on screen, so it is
   written into the chapter rather than left to disagree with the record until
   the next keystroke. An empty restoration is never allowed to erase a
   chapter that has text: that direction is loss, not recovery. */
function wbSettleRestore() {
  if (wbUserEdited || !wbCurrentId) return;
  const ch = wbChapter(wbCurrentId);
  if (!ch || editor.value === (ch.content || '')) return;
  if (!editor.value.trim() && (ch.content || '').trim()) { editor.value = ch.content; return; }
  wbDirty = true;
  updatePreview(); updateStatus(); updateNav();
  flushChapter().then(() => wbSay(t('wbRecovered'), true), () => {});
}
window.addEventListener('scula-folder', paintWorkbookWhere);
window.addEventListener('scula-folder', () => { wbMirrorAsked = false; });
/* Leaving, hiding, being frozen or being discarded: the journal is written
   synchronously each time, because an IndexedDB write started here is not
   guaranteed to finish, and `beforeunload` alone never fires on a discard. */
function wbPark() { wbDraftWrite(); flushChapter(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) wbPark(); });
// A Kanban tab writes the same chapter store. Pull its changed line into an
// open editor before the next autosave can restore the previous task state.
window.addEventListener('storage', async event => {
  if (event.key !== 'scula:kanban-change' || !event.newValue || !wbBooted) return;
  let change;
  try { change = JSON.parse(event.newValue); } catch (e) { return; }
  const ch = wbChapter(change.chapterId);
  if (!ch) return;
  wbPendingIds.add(ch.id);
  if (ch.id === wbCurrentId) {
    const lines = editor.value.split('\n');
    if (lines[change.lineIndex] !== change.line) return;
    lines[change.lineIndex] = taskSetLineStatus(lines[change.lineIndex], change.status);
    editor.value = lines.join('\n');
    updatePreview(); updateStatus(); scheduleAutosave();
  } else {
    try {
      const latest = await wbTx(WB_CHAPTERS, 'readonly', store => store.get(ch.id));
      if (latest) Object.assign(ch, latest);
      renderWorkbooks();
      cloudAutoSync();
    } catch (e) {}
  }
});
document.addEventListener('freeze', wbPark);
window.addEventListener('pagehide', wbPark);
window.addEventListener('beforeunload', wbPark);


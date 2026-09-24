/* ============================================================
   Writing a [[link]] — two routes to the same list.

   Typing "[[" opens the suggester right at the caret, the way
   Obsidian does it. The toolbar button opens the same
   candidates in a modal, which is the route that works with a
   thumb, in a language with a different keyboard, and for
   anyone who does not know the syntax yet.

   Candidates are: every section and every ^block of the open
   note first (those are the notions you connect inside one
   note), then every chapter of every workbook.
   ============================================================ */
function wikiCandidates(filter) {
  const q = (filter || '').trim().toLowerCase();
  const out = [];
  const home = wikiHome(wbCurrentId);
  if (home) {
    const scan = scanNoteCached(home.id, noteText(home));
    scan.headings.forEach(h => out.push({
      kind: 'heading', label: h.text, where: t('wikiThisNote'),
      insert: '#' + h.text
    }));
    scan.blocks.forEach(b => out.push({
      kind: 'block', label: b.text || ('^' + b.id), where: t('wikiThisNote'),
      insert: '#^' + b.id
    }));
  }
  wikiNotes().forEach(n => {
    if (home && n.id === home.id) return;
    out.push({ kind: 'note', label: n.title, where: n.bookName || t('wikiLooseFile'), insert: n.title });
  });
  return q
    ? out.filter(c => (c.label + ' ' + c.where).toLowerCase().includes(q))
    : out;
}
const WIKI_ICON = { note: '📄', heading: '§', block: '¶' };

/* ── The modal ── */
let wikiPicked = null;
function openWikiModal() {
  saveSelection();
  wikiPicked = null;
  const sel = editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();
  document.getElementById('wiki-filter').value = '';
  document.getElementById('wiki-alias').value = sel;
  document.getElementById('wiki-modal').classList.add('open');
  renderWikiPicker();
  setTimeout(() => document.getElementById('wiki-filter').focus(), 40);
}
function closeWikiModal() { document.getElementById('wiki-modal').classList.remove('open'); }

function renderWikiPicker() {
  const box = document.getElementById('wiki-picker');
  if (!box) return;
  const list = wikiCandidates(document.getElementById('wiki-filter').value);
  box.textContent = '';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'ws-empty';
    empty.textContent = t('wikiNoCandidates');
    box.appendChild(empty);
    wikiPicked = null;
    paintWikiHint();
    return;
  }
  if (!wikiPicked || !list.some(c => c.insert === wikiPicked.insert)) wikiPicked = list[0];
  list.slice(0, 200).forEach(c => {
    const row = document.createElement('div');
    row.className = 'ws-item' + (c.insert === wikiPicked.insert ? ' sel' : '');
    const kind = document.createElement('span');
    kind.className = 'ws-kind';
    kind.textContent = WIKI_ICON[c.kind] || '·';
    const name = document.createElement('span');
    name.className = 'ws-name';
    name.textContent = c.label;
    const where = document.createElement('span');
    where.className = 'ws-where';
    where.textContent = c.where;
    row.appendChild(kind); row.appendChild(name); row.appendChild(where);
    row.addEventListener('click', () => { wikiPicked = c; renderWikiPicker(); });
    row.addEventListener('dblclick', insertWikiLink);
    box.appendChild(row);
  });
  paintWikiHint();
}
function paintWikiHint() {
  const el = document.getElementById('wiki-hint');
  if (!el) return;
  el.textContent = wikiPicked ? t('wikiHint', wikiMarkup()) : '';
}
function wikiMarkup() {
  if (!wikiPicked) return '';
  const alias = (document.getElementById('wiki-alias').value || '').trim();
  return '[[' + wikiPicked.insert + (alias ? '|' + alias : '') + ']]';
}
function insertWikiLink() {
  if (!wikiPicked) return;
  const md = wikiMarkup();
  closeWikiModal();
  restoreSelection();
  insertAtCursor(md);
}

/* ── The "[[" suggester ──
   The caret sits inside a <textarea>, which offers no coordinates for it.
   The standard answer, and the one used here: render a hidden div with the
   textarea's own metrics, put the text up to the caret in it, and measure
   where a marker span lands. */
const wikiSuggest = {
  open: false, start: -1, items: [], sel: 0
};

/* The one mirror. Two callers: the suggester wants where the caret is on
   screen, the search panel wants how far down a hit sits so it can scroll
   there. Both need the same measurement, and neither may count "\n" and
   multiply — lines wrap, which is exactly what makes that wrong. */
const editorMirror = { el: null };
function editorMirrorAt(index) {
  let m = editorMirror.el;
  if (!m) {
    m = document.createElement('div');
    m.setAttribute('aria-hidden', 'true');
    m.style.cssText = 'position:fixed;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;top:0;left:0;pointer-events:none;';
    document.body.appendChild(m);
    editorMirror.el = m;
  }
  const cs = getComputedStyle(editor);
  ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'tabSize']
    .forEach(k => { m.style[k] = cs[k]; });
  m.style.width = editor.clientWidth + 'px';
  m.textContent = editor.value.slice(0, index);
  const mark = document.createElement('span');
  mark.textContent = '\u200b';
  m.appendChild(mark);
  const at = { top: mark.offsetTop, left: mark.offsetLeft, lineHeight: parseFloat(cs.lineHeight || '18') };
  m.textContent = '';                    // the text may be a whole chapter
  return at;
}

function wikiCaretPoint() {
  const at = editorMirrorAt(editor.selectionStart);
  const r = editor.getBoundingClientRect();
  return {
    x: r.left + at.left - editor.scrollLeft,
    y: r.top + at.top - editor.scrollTop + at.lineHeight
  };
}

function closeWikiSuggest() {
  wikiSuggest.open = false;
  wikiSuggest.start = -1;
  const el = document.getElementById('wiki-suggest');
  if (el) el.classList.remove('open');
}

// An unclosed "[[" before the caret, with no "]" or newline since, is a
// link being written. Anything else means there is nothing to suggest.
function wikiQueryAtCaret() {
  const upto = editor.value.slice(0, editor.selectionStart);
  const open = upto.lastIndexOf('[[');
  if (open === -1) return null;
  const tail = upto.slice(open + 2);
  if (/[\]\n]/.test(tail)) return null;
  return { start: open, query: tail };
}

function maybeWikiSuggest() {
  const at = wikiQueryAtCaret();
  if (!at) { closeWikiSuggest(); return; }
  const list = wikiCandidates(at.query).slice(0, 40);
  wikiSuggest.open = true;
  wikiSuggest.start = at.start;
  wikiSuggest.items = list;
  wikiSuggest.sel = 0;
  renderWikiSuggest();
}

function renderWikiSuggest() {
  const el = document.getElementById('wiki-suggest');
  if (!el) return;
  el.textContent = '';
  if (!wikiSuggest.items.length) {
    const empty = document.createElement('div');
    empty.className = 'ws-empty';
    empty.textContent = t('wikiNoCandidates');
    el.appendChild(empty);
  }
  wikiSuggest.items.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'ws-item' + (i === wikiSuggest.sel ? ' sel' : '');
    row.setAttribute('role', 'option');
    const kind = document.createElement('span');
    kind.className = 'ws-kind';
    kind.textContent = WIKI_ICON[c.kind] || '·';
    const name = document.createElement('span');
    name.className = 'ws-name';
    name.textContent = c.label;
    const where = document.createElement('span');
    where.className = 'ws-where';
    where.textContent = c.where;
    row.appendChild(kind); row.appendChild(name); row.appendChild(where);
    // mousedown, not click: the textarea must not lose the caret first
    row.addEventListener('mousedown', e => { e.preventDefault(); acceptWikiSuggest(i); });
    el.appendChild(row);
  });
  el.classList.add('open');
  const p = wikiCaretPoint();
  el.style.left = Math.max(6, Math.min(window.innerWidth - el.offsetWidth - 6, p.x)) + 'px';
  const below = window.innerHeight - p.y;
  el.style.top = (below < el.offsetHeight + 12 ? Math.max(6, p.y - el.offsetHeight - 22) : p.y + 2) + 'px';
  const sel = el.querySelector('.ws-item.sel');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function acceptWikiSuggest(i) {
  const c = wikiSuggest.items[i == null ? wikiSuggest.sel : i];
  if (!c) { closeWikiSuggest(); return; }
  const from = wikiSuggest.start;
  const to = editor.selectionStart;
  const text = '[[' + c.insert + ']]';
  closeWikiSuggest();
  editor.focus();
  editor.setRangeText(text, from, to, 'end');
  updatePreview(); updateStatus(); scheduleAutosave();
}

editor.addEventListener('input', maybeWikiSuggest);
editor.addEventListener('blur', () => setTimeout(closeWikiSuggest, 120));
editor.addEventListener('scroll', () => { if (wikiSuggest.open) renderWikiSuggest(); });
editor.addEventListener('keydown', e => {
  if (!wikiSuggest.open) return;
  if (e.key === 'Escape') { e.preventDefault(); closeWikiSuggest(); return; }
  if (!wikiSuggest.items.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = wikiSuggest.items.length;
    wikiSuggest.sel = (wikiSuggest.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
    renderWikiSuggest();
    return;
  }
  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acceptWikiSuggest(); }
});


/* ============================================================
   Search & filter — one query, three scopes.

   The same three scopes the graph has: the open chapter, every chapter of
   its workbook, or every chapter of every workbook. IndexedDB already holds
   every chapter's text (workbooks are the source of truth, docs/FEATURES.md
   § E), so a workbook-wide search needs no folder permission and no reading
   of files — the open chapter is read from the editor, saved or not, exactly
   as the graph reads it.

   Then two filters narrow what the query found: the kind of line a hit sits
   on, and the #tags its chapter carries. Behaviour: docs/FEATURES.md § H.
   ============================================================ */

const FD_KEY = 'scula:find';
const FD_KINDS = ['heading', 'text', 'list', 'code', 'quote', 'table'];
const FD_SNIPPET = 170;        // characters of a line kept around its hits
const FD_MAX_HITS = 400;       // per chapter — one file cannot flood the list
const FD_MAX_TAGS = 30;        // chips, most-used first
const FD_CTX = 1;              // context lines shown either side of a match
const FD_CTX_MORE = 4;         // …with the "more context" toggle on

var fdReady = false;           // var: applyUILang() reads it before this runs
const fdState = {
  q: '',
  scope: 'note',               // note | workbook | vault
  matchCase: false,
  wholeWord: false,
  regex: false,
  fold: true,                  // ignore diacritics: "sapun" finds "săpun"
  context: false,              // show more lines around each match
  collapse: false,             // fold every chapter by default
  kinds: new Set(),            // empty = every kind of line
  tags: new Set()              // a chapter must carry every selected tag
};
// Chapters folded against whatever `collapse` says — the exceptions, so the
// ⊟ button stays one decision and a chevron stays a second one.
const fdShut = new Set();
let fdLast = { groups: [], matches: 0, notes: 0, kinds: new Map(), tags: new Map(), error: false, scoped: 0 };
let fdTimer = 0, fdLiveTimer = 0;

/* ── Folding ──
   "săpun" and "sapun" are the same word to whoever is looking for it. NFD
   splits a letter from its mark and the mark is what gets dropped — which
   also makes the cedilla ş and the comma-below ș fold to the same s, the
   difference docs/RECIPES.md warns half of all PDFs get wrong. The map keeps
   every folded character pointing back at its source index, so a hit still
   marks the right characters of the original line. */
// \u-escaped on purpose: the class is a range of combining marks, which as
// literal characters would be invisible in the source.
function fdFold(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function fdFoldMap(s) {
  let out = '';
  const map = [];
  for (let i = 0; i < s.length; i++) {
    const f = fdFold(s[i]);
    for (let k = 0; k < f.length; k++) { out += f[k]; map.push(i); }
  }
  map.push(s.length);
  return { text: out, map };
}

// NOT a \b: after "ă" a word boundary cannot match in a non-unicode regex —
// the trap docs/RECIPES.md names — so whole-word looks at the characters on
// either side of the hit instead of at a boundary escape.
const FD_WORD = /[\p{L}\p{N}_]/u;
function fdIsWord(ch) { return !!ch && FD_WORD.test(ch); }

function fdMatcher() {
  if (!fdState.q) return null;
  const q = fdState.fold ? fdFold(fdState.q) : fdState.q;
  const src = fdState.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let re;
  try { re = new RegExp(src, fdState.matchCase ? 'g' : 'gi'); }
  catch (e) { return { error: true }; }
  return { re, fold: fdState.fold, word: fdState.wholeWord, error: false };
}

// Every hit on one line, as [start, end] pairs into the *original* line.
function fdLineHits(line, m) {
  const folded = m.fold ? fdFoldMap(line) : null;
  const hay = folded ? folded.text : line;
  const out = [];
  m.re.lastIndex = 0;
  let hit, guard = 0;
  while ((hit = m.re.exec(hay)) !== null && guard++ < 200) {
    if (hit[0] === '') { m.re.lastIndex++; continue; }   // a regex may match nothing
    const a = hit.index, b = a + hit[0].length;
    if (m.word && (fdIsWord(hay[a - 1]) || fdIsWord(hay[b]))) continue;
    out.push(folded ? [folded.map[a], folded.map[b]] : [a, b]);
  }
  return out;
}

// What kind of line this is — the axis the "Only" chips filter on.
function fdKindOf(line, inFence) {
  if (inFence || /^\s*(?:```|~~~)/.test(line)) return 'code';
  if (/^#{1,6}\s/.test(line)) return 'heading';
  if (/^\s*>/.test(line)) return 'quote';
  if (/^\s*(?:[-*+]|\d+[.)])\s/.test(line)) return 'list';
  if (/^\s*\|/.test(line)) return 'table';
  return 'text';
}

// One chapter, line by line. `section` is the heading a hit sits under, with
// the slug parseMarkdown() gave it — counted the same way, fenced code
// skipped the same way, so the anchor the preview jumps to really exists.
function fdNoteHits(lines, m) {
  const slugSeen = {};
  const hits = [];
  let inFence = false, section = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*(?:```|~~~)/.test(line);
    const kind = fdKindOf(line, inFence);
    if (fence) inFence = !inFence;
    if (kind === 'heading') {
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) section = { text: mdPlain(h[2]), slug: headingSlug(h[2], slugSeen) };
    }
    if (!line.trim()) continue;
    const ranges = fdLineHits(line, m);
    if (ranges.length) hits.push({ line: i, kind, section, ranges });
    if (hits.length >= FD_MAX_HITS) break;
  }
  return hits;
}

/* ── What is being searched ──
   wikiNotes() already lists every chapter of every workbook plus the loose
   document, and noteText() reads the open one from the editor. Both are the
   graph's, and reusing them is what keeps "a note" meaning one thing. */
function fdScopeNotes() {
  const notes = wikiNotes();
  const mine = n => (n.loose ? !wbCurrentId : n.chapterId === wbCurrentId);
  if (fdState.scope === 'note') return notes.filter(mine);
  if (fdState.scope === 'workbook') {
    const book = gvCurrentBookId();
    return book ? notes.filter(n => n.bookId === book) : notes.filter(mine);
  }
  const all = notes.slice();
  all.sort((a, b) =>
    (a.bookName || '').localeCompare(b.bookName || '') ||
    fdNoteOrder(a) - fdNoteOrder(b) ||
    a.title.localeCompare(b.title));
  return all;
}
function fdNoteOrder(n) {
  const ch = n.chapterId ? wbChapter(n.chapterId) : null;
  return ch ? (ch.order || 0) : 0;
}

/* ── The search itself ──
   Scope ▸ query ▸ tags ▸ kinds, in that order. The chip counts come from
   one step earlier than the chips themselves filter, so a chip can always
   be swapped for another without the list going empty first. */
function fdCompute() {
  const res = { groups: [], matches: 0, notes: 0, kinds: new Map(), tags: new Map(),
                error: false, scoped: 0 };
  const m = fdMatcher();
  if (m && m.error) { res.error = true; return res; }

  const notes = fdScopeNotes();
  res.scoped = notes.length;
  const wanted = Array.from(fdState.tags);

  notes.forEach(n => {
    const text = noteText(n);
    const lines = String(text || '').split('\n');
    const hits = m ? fdNoteHits(lines, m) : [];
    if (m && !hits.length) return;

    // Tag chips describe the chapters the query already found.
    const tags = Array.from(new Set(scanNoteCached(n.id, text).tags.map(x => x.tag)));
    tags.forEach(tg => res.tags.set(tg, (res.tags.get(tg) || 0) + 1));
    if (!wanted.every(tg => tags.indexOf(tg) !== -1)) return;

    hits.forEach(h => res.kinds.set(h.kind, (res.kinds.get(h.kind) || 0) + 1));
    const shown = fdState.kinds.size ? hits.filter(h => fdState.kinds.has(h.kind)) : hits;
    if (m && !shown.length) return;

    // The lines ride along: the context block around a hit is cut at render
    // time, once, and only for the chapters that actually matched.
    res.groups.push({ note: n, hits: shown, lines });
    res.matches += shown.length;
    res.notes++;
  });
  return res;
}

/* ── Rendering ──
   A result is a block of lines, not a line: the match sits inside the text
   around it, the way Obsidian shows one, so it can be read and judged
   without opening the chapter. Blank lines are skipped rather than printed
   — in markdown they are the majority of the neighbourhood — and two
   matches whose blocks would overlap become one block, so the same lines
   are never shown twice. Each match keeps its own <mark>, and each <mark>
   is its own place to go. */

// The window around one hit: up to `n` lines that carry something, either
// side, and never wandering more than 3n lines away looking for them.
function fdCtxSpan(lines, line, n) {
  let from = line, to = line, k = 0;
  for (let i = line - 1; i >= 0 && k < n && line - i <= n * 3; i--)
    if (lines[i].trim()) { k++; from = i; }
  k = 0;
  for (let i = line + 1; i < lines.length && k < n && i - line <= n * 3; i++)
    if (lines[i].trim()) { k++; to = i; }
  return { from, to };
}

// The hits of one chapter, grouped into the blocks they will be shown in.
function fdBlocks(hits, lines, n) {
  const out = [];
  hits.forEach((h, hi) => {
    const span = fdCtxSpan(lines, h.line, n);
    const last = out[out.length - 1];
    if (last && span.from <= last.to) { last.to = Math.max(last.to, span.to); last.hits.push(hi); }
    else out.push({ from: span.from, to: span.to, hits: [hi] });
  });
  return out;
}

// One line, its hits marked, without ever letting it become HTML: the text
// is escaped in the gaps between the ranges, never as one string afterwards.
// `cut` is the indentation the whole block shares; `hit` is the index the
// marks carry, so clicking one goes to that match and not to the block's first.
function fdSnippet(line, ranges, cut, hit) {
  const src = line.slice(cut || 0);
  const rs = (ranges || []).map(r => [r[0] - (cut || 0), r[1] - (cut || 0)]).filter(r => r[1] > 0);
  let from = 0;
  if (src.length > FD_SNIPPET && rs.length && rs[0][0] > 30) from = rs[0][0] - 30;
  const to = Math.min(src.length, from + FD_SNIPPET);
  let html = from ? '…' : '';
  let at = from;
  const tag = hit == null ? '<mark>' : '<mark data-fd-hit="' + hit + '">';
  rs.forEach(r => {
    const a = Math.max(r[0], from), b = Math.min(r[1], to);
    if (b <= a || r[0] >= to) return;
    if (a > at) html += attrEsc(src.slice(at, a));
    html += tag + attrEsc(src.slice(a, b)) + '</mark>';
    at = b;
  });
  if (at < to) html += attrEsc(src.slice(at, to));
  if (to < src.length) html += '…';
  return html;
}

// One block: where it is, then its lines — the matched ones marked, the rest
// as context. The shared indentation is dropped so a deep list item still
// reads inside a 300px panel.
function fdBlockHtml(g, gi, blk) {
  const lines = g.lines;
  const byLine = new Map();
  blk.hits.forEach(hi => byLine.set(g.hits[hi].line, hi));
  let cut = Infinity;
  for (let i = blk.from; i <= blk.to; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    cut = Math.min(cut, l.length - l.replace(/^[ \t]+/, '').length);
  }
  if (!isFinite(cut)) cut = 0;

  const first = g.hits[blk.hits[0]];
  const sec = first.section ? first.section.text : '';
  const body = [];
  for (let i = blk.from; i <= blk.to; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const hi = byLine.has(i) ? byLine.get(i) : null;
    body.push('<span class="find-line' + (hi === null ? ' ctx' : '') + '">' +
      (hi === null ? fdSnippet(raw, [], cut, null)
                   : fdSnippet(raw, g.hits[hi].ranges, cut, hi)) + '</span>');
  }
  return '<div class="find-hit" role="button" tabindex="0" data-fd-note="' + gi +
    '" data-fd-hit="' + blk.hits[0] + '">' +
    '<span class="find-where">' + attrEsc(t('findLineNo', first.line + 1)) +
      (sec ? ' · ' + attrEsc(sec) : '') + '</span>' +
    '<span class="find-snip">' + body.join('') + '</span></div>';
}

// Folded, or not: `collapse` is the default and fdShut holds the exceptions.
function fdNoteShut(id) { return fdShut.has(id) ? !fdState.collapse : fdState.collapse; }

function fdPaintScope() {
  document.querySelectorAll('#find-scope button').forEach(b =>
    b.classList.toggle('active', b.dataset.fdScope === fdState.scope));
}
function fdPaintOpts() {
  document.querySelectorAll('#find-opts [data-fd-opt]').forEach(b =>
    b.classList.toggle('on', !!fdState[b.dataset.fdOpt]));
  document.querySelectorAll('#find-opts [data-fd-view]').forEach(b => {
    const on = b.dataset.fdView === 'context' ? fdState.context : fdState.collapse;
    b.classList.toggle('on', on);
    if (b.dataset.fdView === 'collapse') {
      b.textContent = on ? '⊞' : '⊟';
      b.title = t(on ? 'findExpandAllTip' : 'findCollapseAllTip');
    }
  });
}
function fdChip(attr, value, label, count, on) {
  return '<button type="button" class="find-chip' + (on ? ' on' : '') + '" ' + attr + '="' + attrEsc(value) + '">' +
         attrEsc(label) + (count ? '<span class="find-n">' + count + '</span>' : '') + '</button>';
}
function fdPaintKinds(counts) {
  const box = document.getElementById('find-kinds');
  const kinds = FD_KINDS.filter(k => counts.get(k) || fdState.kinds.has(k));
  // Nothing to choose between when every hit is the same kind of line.
  box.hidden = kinds.length < 2;
  if (box.hidden) { box.innerHTML = ''; return; }
  box.innerHTML = '<span class="find-lab">' + attrEsc(t('findKindsLabel')) + '</span>' +
    kinds.map(k => fdChip('data-fd-kind', k, t('findKind_' + k), counts.get(k) || 0, fdState.kinds.has(k))).join('');
}
function fdPaintTags(counts) {
  const box = document.getElementById('find-tags');
  const tags = Array.from(counts.keys())
    .sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b))
    .slice(0, FD_MAX_TAGS);
  fdState.tags.forEach(tg => { if (tags.indexOf(tg) === -1) tags.push(tg); });
  box.hidden = !tags.length;
  if (box.hidden) { box.innerHTML = ''; return; }
  box.innerHTML = '<span class="find-lab">' + attrEsc(t('findTagsLabel')) + '</span>' +
    tags.map(tg => fdChip('data-fd-tag', tg, '#' + tg, counts.get(tg) || 0, fdState.tags.has(tg))).join('');
}

function fdRender() {
  const res = fdLast;
  const box = document.getElementById('find-results');
  const foot = document.getElementById('find-foot');
  document.getElementById('find-q').classList.toggle('bad', res.error);
  fdPaintScope();
  fdPaintOpts();
  fdPaintKinds(res.kinds);
  fdPaintTags(res.tags);

  const empty = msg => { box.innerHTML = '<div class="find-empty"></div>'; box.firstChild.textContent = msg; foot.textContent = ''; };
  if (res.error) return empty(t('findBadRegex'));
  if (!res.scoped) return empty(t('findEmptyScope'));
  if (!fdState.q && !fdState.tags.size) return empty(t('findIdle'));
  if (!res.groups.length) return empty(t('findNothing'));

  const parts = [];
  // A loose document has no workbook to widen to; say so rather than
  // silently searching one file under a "Workbook" chip.
  if (fdState.scope === 'workbook' && !gvCurrentBookId())
    parts.push('<div class="find-note-hint">' + attrEsc(t('findLooseHint')) + '</div>');

  const ctx = fdState.context ? FD_CTX_MORE : FD_CTX;
  res.groups.forEach((g, gi) => {
    const n = g.note;
    const where = n.loose ? t('wikiLooseFile') : (n.bookName || '');
    const shut = fdNoteShut(n.id);
    parts.push('<div class="find-note">');
    parts.push('<div class="find-note-row' + (n.chapterId && n.chapterId === wbCurrentId ? ' current' : '') +
      '" data-fd-note="' + gi + '" title="' + attrEsc(t('findOpenNoteTip')) + '">' +
      '<button type="button" class="find-caret" data-fd-fold="' + gi + '" title="' +
        attrEsc(t(shut ? 'findExpandNoteTip' : 'findCollapseNoteTip')) + '">' + (shut ? '▸' : '▾') + '</button>' +
      '<span class="find-note-title">' + attrEsc(n.title) + '</span>' +
      (where ? '<span class="find-note-book">' + attrEsc(where) + '</span>' : '') +
      (g.hits.length ? '<span class="find-note-n">' + g.hits.length + '</span>' : '') +
      '</div>');
    if (!shut) fdBlocks(g.hits, g.lines, ctx).forEach(blk => parts.push(fdBlockHtml(g, gi, blk)));
    parts.push('</div>');
  });
  box.innerHTML = parts.join('');
  foot.textContent = fdState.q ? t('findFoot', { m: res.matches, n: res.notes })
                               : t('findFootNotes', { n: res.notes });
}

/* ── Going to a hit ──
   Open the chapter if the hit is in another one, select the match in the
   editor, and take the preview to the same section on a screen wide enough
   to be showing both. */
function fdOffsetOfLine(text, line) {
  let at = 0;
  for (let i = 0; i < line; i++) {
    const nl = text.indexOf('\n', at);
    if (nl === -1) return at;
    at = nl + 1;
  }
  return at;
}
async function fdGoto(note, hit) {
  if (note.chapterId && note.chapterId !== wbCurrentId) {
    await openChapter(note.chapterId);
    if (wbCurrentId !== note.chapterId) return;   // the switch was refused
  }
  if (isSmallScreen()) closeAllPanels();
  if (!hit) { if (isMobile()) setView('source'); editor.focus(); return; }

  const base = fdOffsetOfLine(editor.value, hit.line);
  const start = base + hit.ranges[0][0], end = base + hit.ranges[0][1];
  if (isMobile()) setView('source');
  editor.focus();
  editor.setSelectionRange(start, end);
  editor.scrollTop = Math.max(0, editorMirrorAt(start).top - editor.clientHeight / 2);
  if (!isMobile() && hit.section) {
    // openChapter() rebuilds the preview; give it the frame it needs.
    requestAnimationFrame(() => gotoPreviewAnchor(hit.section.slug));
  }
}

/* ── Wiring ── */
function fdRun() {
  if (!findIsOpen()) return;
  fdLast = fdCompute();
  fdRender();
}
function fdRefresh() { clearTimeout(fdTimer); fdSaveSettings(); fdRun(); }
function fdQueryChanged() {
  fdState.q = document.getElementById('find-q').value;
  clearTimeout(fdTimer);
  fdTimer = setTimeout(fdRun, 130);
}
function fdClearQuery() {
  const q = document.getElementById('find-q');
  q.value = '';
  fdState.q = '';
  fdRefresh();
  q.focus();
}
function fdQueryKey(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    if (fdState.q) fdClearQuery(); else toggleFind();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    clearTimeout(fdTimer);
    fdRun();
    const g = fdLast.groups[0];
    if (g) fdGoto(g.note, g.hits[0] || null);
  }
}
// The open chapter is read from the editor, so the results follow the typing
// — debounced, and only while the panel is open.
function fdLive() {
  if (!findIsOpen()) return;
  clearTimeout(fdLiveTimer);
  fdLiveTimer = setTimeout(fdRun, 300);
}
function fdRepaintLang() { if (findIsOpen()) fdRender(); }

function fdSaveSettings() {
  try {
    store.set(FD_KEY, JSON.stringify({
      scope: fdState.scope, matchCase: fdState.matchCase,
      wholeWord: fdState.wholeWord, regex: fdState.regex, fold: fdState.fold,
      context: fdState.context, collapse: fdState.collapse
    }));
  } catch (e) {}
}
async function fdLoadSettings() {
  let raw = null;
  try { raw = await store.get(FD_KEY); } catch (e) {}
  let v = null;
  try { v = raw ? JSON.parse(raw) : null; } catch (e) { v = null; }
  if (v && typeof v === 'object') {
    if (['note', 'workbook', 'vault'].indexOf(v.scope) !== -1) fdState.scope = v.scope;
    ['matchCase', 'wholeWord', 'regex', 'fold', 'context', 'collapse'].forEach(k => {
      if (typeof v[k] === 'boolean') fdState[k] = v[k];
    });
  }
  fdPaintScope();
  fdPaintOpts();
  if (findIsOpen()) fdRun();
}

document.querySelectorAll('#find-scope button').forEach(b =>
  b.addEventListener('click', () => { fdState.scope = b.dataset.fdScope; fdRefresh(); }));
document.querySelectorAll('#find-opts [data-fd-opt]').forEach(b =>
  b.addEventListener('click', () => { fdState[b.dataset.fdOpt] = !fdState[b.dataset.fdOpt]; fdRefresh(); }));
// How the results are shown, not what they are: a repaint, no second search.
document.querySelectorAll('#find-opts [data-fd-view]').forEach(b =>
  b.addEventListener('click', () => {
    if (b.dataset.fdView === 'context') fdState.context = !fdState.context;
    else { fdState.collapse = !fdState.collapse; fdShut.clear(); }
    fdSaveSettings();
    fdRender();
  }));

// The chips and the results are generated, so both are delegated.
function fdToggleIn(set, value) { set.has(value) ? set.delete(value) : set.add(value); }
document.getElementById('find-kinds').addEventListener('click', e => {
  const chip = e.target.closest('[data-fd-kind]');
  if (!chip) return;
  fdToggleIn(fdState.kinds, chip.dataset.fdKind);
  fdRefresh();
});
document.getElementById('find-tags').addEventListener('click', e => {
  const chip = e.target.closest('[data-fd-tag]');
  if (!chip) return;
  fdToggleIn(fdState.tags, chip.dataset.fdTag);
  fdRefresh();
});
// A block goes to its first match; a <mark> inside it goes to that one, which
// is what makes a block holding three matches still three places to go.
function fdHitOf(el, target) {
  const g = fdLast.groups[+el.dataset.fdNote];
  if (!g) return null;
  const mark = target && target.closest ? target.closest('mark[data-fd-hit]') : null;
  const i = mark ? +mark.dataset.fdHit : +el.dataset.fdHit;
  return { note: g.note, hit: g.hits[i] || null };
}
document.getElementById('find-results').addEventListener('click', e => {
  const foldEl = e.target.closest('[data-fd-fold]');
  if (foldEl) {
    const g = fdLast.groups[+foldEl.dataset.fdFold];
    if (g) { fdShut.has(g.note.id) ? fdShut.delete(g.note.id) : fdShut.add(g.note.id); fdRender(); }
    return;
  }
  const hitEl = e.target.closest('.find-hit');
  if (hitEl) {
    const go = fdHitOf(hitEl, e.target);
    if (go) fdGoto(go.note, go.hit);
    return;
  }
  const noteEl = e.target.closest('.find-note-row');
  if (noteEl) {
    const g = fdLast.groups[+noteEl.dataset.fdNote];
    if (g) fdGoto(g.note, null);
  }
});
// A block is a div, so it needs the keys a button would have given it.
document.getElementById('find-results').addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const hitEl = e.target.closest && e.target.closest('.find-hit');
  if (!hitEl) return;
  e.preventDefault();
  const go = fdHitOf(hitEl, null);
  if (go) fdGoto(go.note, go.hit);
});

fdLoadSettings();
fdReady = true;


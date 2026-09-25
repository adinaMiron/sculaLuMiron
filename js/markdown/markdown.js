/* ============================================================
   Wikilinks, tags and block anchors — Obsidian's link syntax.

     [[Note]]            a link to another note (here: a chapter)
     [[Note|shown as]]   …with its own display text
     [[Note#Section]]    …straight to one of its headings
     [[Note#^anchor]]    …straight to one ^block inside it
     [[#Section]]        a link *inside* the note being written
     [[#^anchor]]        …to a ^block inside it
     ![[…]]              an embed: an image is embedded, a note
                         becomes a card that opens it
     #tag                a tag
     text ^anchor        names the block that line is, so
                         [[#^anchor]] can point at it

   A link to a note that does not exist yet is still a legal link.
   Obsidian calls that unresolved, draws it dimmed and offers to
   create the note when you follow it; so does this. The graph
   draws unresolved notes too, unless "Existing notes only" is on.

   Everything here serves both the preview and the graph, and is
   the whole reason the graph has any edges. docs/FEATURES.md § G.
   ============================================================ */

// [[Name#sub|alias]] — the leading "!" is what makes it an embed.
const WIKI_RE = /(!?)\[\[\s*([^\[\]|]+?)\s*(?:\|\s*([^\[\]]*?)\s*)?\]\]/g;
// #tag — letters, digits, _ - and /, at least one letter. A markdown heading
// ("# Title") has a space after the hashes, which this class excludes.
const TAG_RE = /(^|[\s(\[{])#([\p{L}\p{N}_\/-]*[\p{L}_][\p{L}\p{N}_\/-]*)/gu;
// "#rrggbb" (or the 8-digit "#rrggbbaa") — a CSS hex colour written inline.
// Rendered as a small swatch next to the code, identically in the preview
// and the export. Tried before TAG_RE, since "#4F8A97" also satisfies the
// tag pattern (it has letters in it).
const HEX_COLOR_RE = /(^|[\s(\[{])#([0-9a-fA-F]{8}|[0-9a-fA-F]{6})\b/g;
// "@2026-09-03 14:00-15:30" — a date flagged for the calendar. The pattern
// is ScuLaCal's, not this file's: the calendar page and any other page that
// learns to scrape dates must read the exact same syntax, so it lives once
// in the shared nav block (docs/FEATURES.md § L). Global, but only ever used
// through .replace(), which resets lastIndex itself.
const DATE_MARK_RE = window.ScuLaCal ? ScuLaCal.markRe() : /(?!)/g;
// "^@Castelul Peleș" — a place flagged for the map. Same arrangement as the
// date above: the syntax is ScuLaGeo's, in the shared nav block, so this page
// and map.html read one marker (docs/FEATURES.md § S). Also global, also only
// ever used through .replace().
const GEO_MARK_RE = window.ScuLaGeo ? ScuLaGeo.markRe() : /(?!)/g;
// "^anchor" at the very end of a line names that block.
const BLOCK_RE = /\s\^([A-Za-z0-9][A-Za-z0-9-]*)\s*$/;
const IMG_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|tiff?)$/i;
// "Name>> " (or "Label >> ") at the start of a line — a task handed to
// whoever that name is, written the way a todo gets prefixed with its
// owner: "John>> buy milk". Runs on already-&gt;-escaped text (see
// mdUnescape note below), so it matches the escaped "&gt;&gt;", not a
// literal ">>". Anchored to line start (`^`, `m` flag — applyInline() is
// called per line/list-item/table-cell, and a paragraph's own newlines
// still count as line starts) rather than matching anywhere inline:
// nothing but position distinguishes "a name" from "any few words of
// prose", so without that anchor a greedy match runs backward and
// swallows whatever sentence happens to precede an unrelated ">> "
// elsewhere in the line.
const ASSIGNEE_WORD = "[\\p{L}\\p{N}][\\p{L}\\p{N}._'-]{0,20}";
const INLINE_ASSIGNEE_WORD = "[\\p{L}\\p{N}](?:[\\p{L}\\p{N}._'-]{0,19}[\\p{L}\\p{N}])?";
const ASSIGNEE_RE = new RegExp(
  `^(${ASSIGNEE_WORD}(?:[ \\t]+${ASSIGNEE_WORD}){0,3})([ \\t]?)&gt;&gt;(?=[ \\t])`,
  'gmu'
);
// `>>Name` can sit anywhere in a line, in a task or in ordinary text.
// Its direction makes the boundary unambiguous, so this form uses one name token.
const INLINE_ASSIGNEE_RE = new RegExp(
  '&gt;&gt;(' + INLINE_ASSIGNEE_WORD + ')(?![\\p{L}\\p{N}_\'-])', 'gu'
);

// "!nice" / "!important" / "!vital" — how much a line matters. Three levels,
// one word each, written straight into the markdown so the file stays plain
// text and greps like plain text. The syntax is English in both UI languages;
// only the label on the rendered pill is translated (i18n keys imp*).
//
// The lead class is the same guard TAG_RE uses: a marker starts a line or
// follows a space/bracket, so "wow!" and an "![[embed]]" never match, and the
// trailing lookahead is what keeps "!nicely" out. Unlike ASSIGNEE_RE this one
// is *not* anchored to the line — a marker is a fixed word, so there is no
// ambiguity about where it begins and it may sit anywhere in a line.
const IMP_LEVELS = ['nice', 'important', 'vital'];
const IMP_ICON = { nice: '\u{1F331}', important: '\u2B50', vital: '\u{1F525}' };
const IMP_RE = /(^|[\s(\[{])!(nice|important|vital)(?![\p{L}\p{N}_-])/gu;
// The marker a line already carries, with the space after it.
const IMP_LEAD_RE = /^!(?:nice|important|vital)(?![\p{L}\p{N}_-])[ \t]*/u;
// Everything that legally comes *before* the marker on a line: the bullet,
// the number, the "[ ]" of a task, the hashes of a heading, the "> " of a
// quote — and then an assignee prefix, because "Ana>> !vital call her" has
// to keep matching ASSIGNEE_RE, which is anchored to the line start.
const IMP_LINE_LEAD = new RegExp(
  '^([ \\t]*(?:[-*+][ \\t]+(?:\\[[ xX]\\][ \\t]+(?:~(?:inwork|onhold|blocked)[ \\t]+)?)?|\\d+\\.[ \\t]+|#{1,6}[ \\t]+|>[ \\t]+)?' +
  `(?:${ASSIGNEE_WORD}(?:[ \\t]+${ASSIGNEE_WORD}){0,3}[ \\t]?>>[ \\t]+)?)`,
  'u'
);

// parseMarkdown() escapes the text before applyInline() sees it, so a name
// arrives as "A &amp; B". Anything compared against a chapter title, or put
// back into an attribute, has to go through these.
const mdUnescape = s => String(s == null ? '' : s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const attrEsc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Strip the inline markdown a heading may carry, so "## **Newton**" reads and
// slugs as "Newton" everywhere — nav panel, preview anchor, graph label.
function mdPlain(raw) {
  return mdUnescape(raw)
    .replace(WIKI_RE, (m, bang, target, alias) => alias || wikiDefaultLabel(parseWikiTarget(target)))
    // an importance marker on a heading is decoration, not part of its name:
    // dropping it here keeps the slug, the nav label and the graph label clean
    .replace(IMP_RE, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .trim();
}

/* The one slug function. parseMarkdown() puts it on every heading as an id,
   the nav panel and every [[Note#Section]] link jump to that id, so all three
   have to agree — which they only do while this stays the single copy.
   `seen` (optional) is a counter object that keeps repeats unique. */
function headingSlug(raw, seen) {
  let s = mdPlain(raw).toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!s) s = 'section';
  if (seen) {
    seen[s] = (seen[s] || 0) + 1;
    if (seen[s] > 1) s += '-' + (seen[s] - 1);
  }
  return s;
}

// "Name#Section" / "Name#^anchor" / "#Section" / "#^anchor" → its parts.
function parseWikiTarget(raw) {
  const t = mdUnescape(raw).trim();
  const h = t.indexOf('#');
  const name = (h === -1 ? t : t.slice(0, h)).trim();
  const sub = (h === -1 ? '' : t.slice(h + 1)).trim();
  const block = sub.startsWith('^') ? sub.slice(1).trim() : '';
  return { name, sub, block, heading: block ? '' : sub };
}
function wikiDefaultLabel(p) {
  const tail = p.block ? '^' + p.block : p.heading;
  if (p.name && tail) return p.name + ' › ' + tail;
  return p.name || tail || '';
}

/* ── Which notes a [[link]] may point at ──
   Every chapter of every workbook, plus the loose document in the editor
   when it is not a chapter — otherwise a [[#Section]] link would have
   nothing to resolve against in a file that was merely opened. */
const WIKI_LOOSE = '__loose__';      // the id of the loose document, if any
let wikiIndexCache = null;
function invalidateWikiIndex() { wikiIndexCache = null; }
function wikiNotes() {
  if (wikiIndexCache) return wikiIndexCache;
  const notes = wbChapters.map(ch => {
    const book = wbBook(ch.workbookId);
    return {
      id: ch.id,
      chapterId: ch.id,
      title: ch.title,
      file: ch.file,
      base: ch.file.replace(/\.md$/i, ''),
      bookId: ch.workbookId,
      bookName: book ? book.name : '',
      folder: book ? book.folder : '',
      path: (book ? book.folder + '/' : '') + ch.file
    };
  });
  if (!wbCurrentId) {
    const name = (document.getElementById('current-file').textContent || 'untitled.md').trim();
    notes.push({
      id: WIKI_LOOSE, chapterId: null, title: name.replace(/\.(md|txt)$/i, ''),
      file: name, base: name.replace(/\.(md|txt)$/i, ''),
      bookId: null, bookName: '', folder: '', path: name, loose: true
    });
  }
  wikiIndexCache = notes;
  return notes;
}

// The note a name points at, or null when nothing carries that name.
// Obsidian prefers the nearest match; here that means the same workbook.
function resolveWiki(name, fromChapterId) {
  const want = mdUnescape(name).trim().toLowerCase();
  if (!want) return null;
  const notes = wikiNotes();
  const from = fromChapterId ? wbChapter(fromChapterId) : null;
  const tests = [
    n => n.path.toLowerCase() === want,
    n => n.path.replace(/\.md$/i, '').toLowerCase() === want,
    n => (n.bookName ? (n.bookName + '/' + n.title).toLowerCase() : '') === want,
    n => n.title.toLowerCase() === want,
    n => n.base.toLowerCase() === want,
    n => n.file.toLowerCase() === want
  ];
  for (const test of tests) {
    const hits = notes.filter(test);
    if (!hits.length) continue;
    return (from && hits.find(n => n.bookId === from.workbookId)) || hits[0];
  }
  return null;
}

// The note a [[link]] written inside `fromChapterId` refers to: an explicit
// name, or the note it was written in when the link starts with "#".
function wikiHome(fromChapterId) {
  if (fromChapterId) {
    const ch = wbChapter(fromChapterId);
    if (ch) return wikiNotes().find(n => n.chapterId === ch.id) || null;
  }
  return wikiNotes().find(n => n.id === WIKI_LOOSE) || null;
}

/* ── Rendering one [[link]] ──
   Preview gets a live <a> the click handler below knows how to follow.
   Export gets a real anchor when the target is inside the same document,
   and plain styled text otherwise: an exported page is one file, so it has
   nowhere to send a link that points at another chapter. */
function renderWikiLink(bang, target, alias, opts) {
  const forExport = !!(opts && opts.forExport);
  const p = parseWikiTarget(target);
  const embed = bang === '!';
  const label = (alias != null && alias !== '') ? alias : attrEsc(wikiDefaultLabel(p));

  if (embed && !p.sub && IMG_RE.test(p.name)) {
    return `<img src="${attrEsc(resolveImageSrc(p.name, forExport))}" alt="${attrEsc(p.name)}">`;
  }

  const note = p.name ? resolveWiki(p.name, wbCurrentId) : wikiHome(wbCurrentId);
  const here = !p.name || (note && note.id === (wikiHome(wbCurrentId) || {}).id);
  const anchor = p.block ? 'block-' + p.block : p.heading ? headingSlug(p.heading) : '';

  if (forExport) {
    if (here && anchor) return `<a href="#${attrEsc(anchor)}" class="wikilink">${label}</a>`;
    return `<span class="wikilink${note ? '' : ' is-unresolved'}">${label}</span>`;
  }
  const cls = 'wikilink' + (note ? '' : ' is-unresolved') + (embed ? ' is-embed' : '');
  const tip = note
    ? (note.bookName ? note.bookName + ' › ' : '') + note.title + (p.sub ? ' › ' + p.sub : '')
    : t('wlUnresolvedTip', p.name);
  return `<a class="${cls}" role="link" tabindex="0"` +
    ` data-wl-name="${attrEsc(p.name)}" data-wl-heading="${attrEsc(p.heading)}"` +
    ` data-wl-block="${attrEsc(p.block)}" data-wl-note="${attrEsc(note ? note.id : '')}"` +
    ` title="${attrEsc(tip)}">${embed ? '↪ ' : ''}${label}</a>`;
}

function renderTag(lead, tag) {
  return `${lead}<a class="md-tag" role="link" tabindex="0" data-tag="${attrEsc(tag)}">#${tag}</a>`;
}

// "#4F8A97" → the code with a little colour chip in front of it. hex is
// strictly [0-9a-fA-F]{6,8} from HEX_COLOR_RE, so it is safe to drop into
// the inline style and the text as-is. Same output in preview and export.
function renderColorSwatch(lead, hex) {
  const css = '#' + hex;
  return `${lead}<span class="md-color"><span class="md-color-sw" style="background:${css}"></span>${css}</span>`;
}

/* "@2026-09-03 14:00-15:30" — a date and, optionally, a time or an interval.
   The syntax itself lives in ScuLaCal (the shared nav block) so that every
   page reads one syntax and the calendar page never has to guess; this
   function only turns a parsed marker into the pill.

   The label is written out in the current UI language rather than carrying
   a data-i key, because it is a formatted date, not a fixed string —
   calRepaintLang() re-formats it in place on a language switch. The export
   gets the same baked label and no repaint, since it ships without the app. */
function calDateWords(ymd) {
  try {
    return ScuLaCal.dayStart(ymd)
      .toLocaleDateString(UI === 'ro' ? 'ro-RO' : 'en-GB',
                          { day:'numeric', month:'short', year:'numeric' });
  } catch (e) { return ymd; }
}
function calMarkLabel(mark) {
  const d1 = calDateWords(mark.date);
  const spans = mark.endDate && mark.endDate !== mark.date;
  if (mark.allDay) return spans ? d1 + ' – ' + calDateWords(mark.endDate) : d1;
  if (spans) return d1 + ', ' + mark.time + ' – ' + calDateWords(mark.endDate) + ', ' + (mark.endTime || mark.time);
  return d1 + ', ' + mark.time + (mark.endTime ? '–' + mark.endTime : '');
}
// Called from the replace() below with its own `arguments`: the group order
// of ScuLaCal.markRe() is exactly what readMark() indexes into.
function renderDateMark(args) {
  const lead = args[1] || '';
  const mark = window.ScuLaCal && ScuLaCal.readMark(args);
  if (!mark) return args[0];        // "@2026-02-31" — leave the text alone
  // Every value here came out of normDate/normTime, so it is digits, "-"
  // and ":" only and needs no escaping.
  const a = ['data-d="' + mark.date + '"'];
  if (mark.endDate && mark.endDate !== mark.date) a.push('data-d2="' + mark.endDate + '"');
  if (mark.allDay) a.push('data-all="1"');
  else {
    a.push('data-t="' + mark.time + '"');
    if (mark.endTime) a.push('data-t2="' + mark.endTime + '"');
  }
  return `${lead}<span class="md-date" ${a.join(' ')}>\u{1F4C5} ${calMarkLabel(mark)}</span>`;
}
/* ── Pushing the flagged dates into the calendar — docs/FEATURES.md § L ──
   One button, the whole vault. Every "@date" in every chapter becomes an
   event in the shared store, and ScuLaCal.syncSource() with a null ref
   replaces *everything* this page owns in one pass — so a marker that was
   edited moves, and a marker that was deleted takes its event with it.

   The identity that makes that work is sculaKey: chapter + line + the
   marker text. Re-running the sync re-finds the same key and keeps the
   event's id, so anything pointing at it survives; change the line and it
   is a different event, which is the honest answer since the old one no
   longer exists in the source. */
function calTitleOf(line, hit) {
  let s = line.slice(0, hit.index) + line.slice(hit.index + hit.length);
  // the bullet, the "[ ]", the number, the hashes, the quote mark
  s = s.replace(/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+|#{1,6}\s+|>\s+)/, '');
  s = s.replace(TASK_STATUS_LEAD_RE, '');
  s = s.replace(IMP_RE, '$1');
  s = s.replace(/^\s*[\p{L}\p{N}][\p{L}\p{N}._'-]{0,20}(?:[ \t]+[\p{L}\p{N}][\p{L}\p{N}._'-]{0,20}){0,3}[ \t]?>>[ \t]+/u, '');
  s = s.replace(new RegExp('>>' + INLINE_ASSIGNEE_WORD + "(?![\\p{L}\\p{N}_'-])", 'gu'), '');
  s = s.replace(WIKI_RE, (m, bang, target, alias) => alias || target);
  s = s.replace(TAG_RE, '$1');
  s = s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`([^`]+)`/g, '$1');
  return s.replace(/\s+/g, ' ').trim();
}
function calTagsOf(line) {
  const out = [];
  line.replace(TAG_RE, (m, lead, tag) => { out.push(tag); return m; });
  return out;
}
function calScan() {
  const events = [];
  wikiNotes().forEach(n => {
    const text = noteText(n);
    if (!text) return;
    const ref = n.chapterId || 'loose';
    text.split('\n').forEach((line, i) => {
      ScuLaCal.findMarks(line).forEach(hit => {
        const tags = calTagsOf(line);
        events.push(ScuLaCal.make({
          title: calTitleOf(line, hit) || n.title,
          allDay: hit.mark.allDay,
          date: hit.mark.date,
          time: hit.mark.time,
          endDate: hit.mark.endDate,
          endTime: hit.mark.endTime,
          colorId: '2',
          location: '',
          description: n.title + (n.bookName ? ' · ' + n.bookName : ''),
          ext: {
            sculaSource: 'index.html',
            sculaRef: ref,
            sculaKey: ref + ':' + i + ':' + hit.text,
            sculaCal: n.bookName || n.title,
            sculaTags: tags.join(',')
          }
        }));
      });
    });
  });
  return events;
}
// Returns the sync's promise so a caller can wait for it - the writes are a
// chain of IndexedDB transactions, so "the button was clicked" is not yet
// "the events are there".
function calSyncAll() {
  if (!window.ScuLaCal) return Promise.resolve(null);
  const events = calScan();
  return ScuLaCal.syncSource('index.html', null, events).then(r => {
    const total = events.length;
    ScuLaFolder.toast(total ? t('calSynced', [total, r.removed]) : t('calNoDates'),
                      t('calOpen'), () => { location.href = 'calendar.html'; });
    return r;
  });
}

// The pills are generated, so a language switch has to re-format them.
function calRepaintLang() {
  document.querySelectorAll('#preview .md-date').forEach(el => {
    el.textContent = '\u{1F4C5} ' + calMarkLabel({
      date: el.dataset.d,
      endDate: el.dataset.d2 || el.dataset.d,
      allDay: el.dataset.all === '1',
      time: el.dataset.t,
      endTime: el.dataset.t2 || null
    });
  });
}

/* ── "^@" places, and the map they are drawn on — docs/FEATURES.md § S ──
   The marker itself is ScuLaGeo's (shared nav block), so this page only
   does three things with it: paint it in the preview and the export, count
   it so the 🗺 button can hide itself, and hand the open chapter over. */
function renderGeoMark(args) {
  const lead = args[1] || '';
  const place = window.ScuLaGeo && ScuLaGeo.read(args[2]);
  if (!place) return args[0];         // a bare "^@" with nothing after it
  // The text came out of already-escaped markdown, so it goes back in as-is;
  // the one thing to keep out of an attribute is the quote character.
  const attr = place.query.replace(/"/g, '&quot;');
  const note = place.note ? ` <span class="geo-note">${place.note}</span>` : '';
  const coords = place.lat != null ? ' data-lat="' + place.lat + '" data-lon="' + place.lon + '"' : '';
  return `${lead}<span class="md-geo" data-q="${attr}"${coords}>\u{1F4CD} ${place.query}${note}</span>`;
}

// The open chapter as the payload map.html draws. Its title is what the
// header shows, so a loose "untitled.md" names itself the same way.
function mapScan() {
  const title = (document.getElementById('current-file') || {}).textContent || 'untitled.md';
  return ScuLaGeo.scan(editor.value, { title: title.trim(), source: 'index.html' });
}
// 🗺 — hand this chapter's places to the map page and go there.
function openMap() {
  if (!window.ScuLaGeo) return false;
  const payload = mapScan();
  if (!payload.count) { ScuLaFolder.toast(t('mapNone')); return false; }
  ScuLaGeo.send(payload);
  location.href = 'map.html';
  return true;
}
// Open the board at the current chapter; its scope picker can widen to the
// workbook or all workbooks. Flush first so the board sees the latest text.
async function openKanban() {
  await flushChapter();
  const scope = wbCurrentId ? '?scope=' + encodeURIComponent('c:' + wbCurrentId) : '';
  location.href = 'kanban.html' + scope;
}
document.querySelector('#site-nav a[data-page="kanban.html"]').addEventListener('click', event => {
  event.preventDefault();
  flushChapter().then(() => { location.href = 'kanban.html'; });
});
// The button exists only while there is something for it to show. Called
// from updatePreview(), which every keystroke and every chapter opened ends
// in, so it appears with the first marker and leaves with the last.
function mapRefresh() {
  const btn = document.getElementById('btn-map');
  if (!btn) return;
  btn.hidden = !(window.ScuLaGeo && ScuLaGeo.has(editor.value));
}

// "Name>> " marks a task as handed to that person. name is already escaped
// (it came out of already-&gt;-escaped text), so it goes back in as-is. gap
// is the optional space/tab ASSIGNEE_RE allows between name and "&gt;&gt;"
// (as in "Design team >>") — kept outside the span, after it, so it isn't
// colored but isn't dropped from the rendered text either.
function renderAssignee(name, gap) {
  return `<span class="md-assignee">${name}</span>${gap}&gt;&gt;`;
}

/* ── Importance markers — docs/FEATURES.md § C ──────────────────────────
   "!vital" in the source renders as a coloured pill, and the CSS puts a
   matching edge on the block it leads (`:has(> .md-imp)`), so nothing here
   has to know whether it is inside a paragraph, a task or a heading.

   In the preview the pill is a link that searches for its own level, and
   its label carries `data-i` so applyUILang() re-translates it in place on
   a language switch — the preview is ordinary DOM, so that costs nothing.
   The export gets the label baked in and no `data-i`, because it ships
   without the app. */
function renderImportance(lead, level, opts) {
  const key = 'imp' + level.charAt(0).toUpperCase() + level.slice(1);
  const label = attrEsc(t(key));
  const ico = `<span class="md-imp-ico">${IMP_ICON[level]}</span>`;
  if (opts && opts.forExport) {
    return `${lead}<span class="md-imp md-imp-${level}">${ico}${label}</span>`;
  }
  return `${lead}<a class="md-imp md-imp-${level}" role="link" tabindex="0"` +
    ` data-imp="${level}" title="${attrEsc(t('impFindTip'))}">${ico}<span data-i="${key}">${label}</span></a>`;
}

// The marker goes after the bullet / number / "[ ]" / hashes / assignee, so
// the line stays valid markdown. Replaces whatever marker was there;
// `level` empty removes it. Blank lines
// are left alone — marking nothing is never what was meant.
function impSetLine(line, level) {
  if (!line.trim()) return line;
  const lead = line.match(IMP_LINE_LEAD)[1];
  const rest = line.slice(lead.length).replace(IMP_LEAD_RE, '');
  if (!level) return lead + rest;
  return lead + '!' + level + ' ' + rest;
}

// One click marks the caret's line, or every line the selection touches.
function setImportance(value) {
  if (!value) return;
  const level = value === 'none' ? '' : value;
  if (level && IMP_LEVELS.indexOf(level) === -1) return;
  editor.focus();
  const start = editor.selectionStart, end = editor.selectionEnd;
  const val = editor.value;
  const from = val.lastIndexOf('\n', start - 1) + 1;
  const nl = val.indexOf('\n', end);
  const to = nl === -1 ? val.length : nl;
  const block = val.slice(from, to).split('\n').map(l => impSetLine(l, level)).join('\n');
  editor.setRangeText(block, from, to, 'end');
  // setRangeText fires no `input`, so the textarea's own oninput chain
  // (updatePreview / updateStatus / scheduleAutosave) has to be run by hand.
  updatePreview(); updateStatus(); scheduleAutosave();
}

// Clicking a pill answers "what else is this important?" — the search panel
// already does that, and the marker is plain text, so the query is the token.
function impFind(level) {
  if (IMP_LEVELS.indexOf(level) === -1) return;
  const q = document.getElementById('find-q');
  if (!findIsOpen()) togglePanelById('find-panel');
  q.value = '!' + level;
  fdState.q = q.value;
  fdRefresh();
  q.focus(); q.select();
}

// "…text ^anchor" → the text, and the name of the block it is.
function takeBlockId(line) {
  const m = line.match(BLOCK_RE);
  return m ? { text: line.slice(0, m.index), id: m[1] } : { text: line, id: '' };
}
function liWithBlockId(text, opts) {
  const b = takeBlockId(text);
  // A bullet may hold a causal chain; it stays a bullet, and the chain is
  // drawn inside it. docs/FEATURES.md § M.
  const cz = parseCausalLine(b.text);
  const body = cz ? mdCausalHtml(cz, opts) : applyInline(b.text, opts);
  return `<li${b.id ? ` id="block-${attrEsc(b.id)}"` : ''}>${body}</li>`;
}

/* The chain as the preview draws it: a chip per key word, a coloured glyph
   per arrow. The terms go through applyInline, so one written [[like this]]
   is still a link and one written #like-this is still a tag. */
function mdCausalHtml(cz, opts) {
  const html = cz.terms.map((term, i) => {
    const chip = `<span class="md-cause-term">${applyInline(term.raw, opts)}</span>`;
    if (i >= cz.arrows.length) return chip;
    const a = cz.arrows[i];
    const cls = 'md-cause-arrow ' + (a.sign < 0 ? 'md-cause-neg' : 'md-cause-pos') + (a.delay ? ' md-cause-delay' : '');
    return chip + `<span class="${cls}">${(a.delay ? '⋯' : '') + (a.sign < 0 ? '⊣' : '→')}</span>`;
  }).join('');
  return `<div class="md-causal">${html}</div>`;
}

/* ══════════ Timeline — "#1969 - !Primul om pe Lună" ══════════
   Three characters and nothing else to learn: "#" opens the date, "!" opens
   what happened, and the "-" between them is the link that ties the two.
   What follows the "!" is ordinary markdown — a sentence, an ![image](…) or
   a [link](…) — so a timeline carries the same things a paragraph does.
   Consecutive lines are one timeline; docs/FEATURES.md § R. */

// A date, in the shapes people actually write one: a bare year, a year that
// narrows to a month or a day, or a day written the other way round. Kept as
// a source string because it is used inside TIMELINE_RE below.
const TL_DATE_SRC = '\\d{3,4}(?:[-./]\\d{1,2}){0,2}|\\d{1,2}[./]\\d{1,2}[./]\\d{3,4}|\\d{1,2}[./]\\d{3,4}';

/* The whole line has to be an entry, the way a causal chain has to be a whole
   line (§ M): "#" only opens a date when a "- !" follows it on the same line,
   so a #tag, a #rrggbb colour and a "# heading" are all left alone — none of
   them can match, and nothing fires by accident inside a sentence. The spaces
   around the "-" are required: without them "#2026-09" would eat its own
   separator. */
const TIMELINE_RE = new RegExp('^[ \\t]*#(' + TL_DATE_SRC + ')[ \\t]+-[ \\t]+(!.*\\S)[ \\t]*$');

const TL_IMG_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|tiff?)(?:[?#].*)?$/i;

// Where a date sits on the line. A month or a day only refines the year, so
// "1969" and "1969-07-20" are comparable numbers and a timeline may mix them.
function tlDateValue(raw) {
  let m = raw.match(/^(\d{3,4})(?:[-./](\d{1,2}))?(?:[-./](\d{1,2}))?$/);
  if (!m) {
    const d = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{3,4})$/);   // 21.09.2026
    if (d) m = [raw, d[3], d[2], d[1]];
    else {
      const my = raw.match(/^(\d{1,2})[./](\d{3,4})$/);             // 09.2026
      if (my) m = [raw, my[2], my[1], undefined];
    }
  }
  if (!m) return null;
  const y = +m[1], mo = m[2] ? Math.min(12, Math.max(1, +m[2])) : 1;
  const d = m[3] ? Math.min(31, Math.max(1, +m[3])) : 1;
  return y + ((mo - 1) + (d - 1) / 31) / 12;
}

function parseTimelineLine(line) {
  const m = line.match(TIMELINE_RE);
  return m ? { date: m[1], body: m[2] } : null;
}

/* What the "!" opens. The marker doubles as the "!" of an image, so a picture
   is written the way it is written anywhere else — "![lună](luna.png)". The
   same shape pointing at something that is not a picture is what a person
   means by a link, so "![Apollo 11](https://…)" reads as one; anything else
   is the text with its marker removed, run through the ordinary inline pass
   so [[notes]], #tags and **bold** still work inside an entry. */
function tlContentHtml(body, opts) {
  const s = body.trim();
  if (/^!\[\[/.test(s)) return applyInline(s, opts);        // ![[embed]], as-is
  const img = s.match(/^!\[([^\]]*)\]\(([^)\s"]+)(?:\s+"[^"]*")?\)$/);
  if (img) return applyInline(TL_IMG_RE.test(img[2]) || /^data:image\//i.test(img[2]) ? s : s.slice(1), opts);
  return applyInline(s.slice(1), opts);
}

// The entry as one line of text, for the dot's tooltip. The input is already
// escaped, and every replace here keeps it that way.
function tlPlain(body) {
  return body.replace(/^!/, '')
    .replace(/!?\[\[\s*([^\[\]|]+?)\s*(?:\|\s*([^\[\]]*?)\s*)?\]\]/g, (m, a, b) => b || a)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*`]/g, '')
    .trim();
}

/* The block a run of entries becomes: the drawing, then the list. The drawing
   is a real <svg>, and it goes out whole into the exported page — the classes
   are what carry the colour, the way the rest of the preview does it. */
function mdTimelineHtml(entries, opts) {
  // The x of every dot is a percentage and every y is a pixel, so the drawing
  // stretches with the pane while the type, the dots and the spine keep the
  // size they were drawn at. A viewBox would scale the whole thing down
  // instead, and a date would end up four pixels tall in a narrow preview.
  const H = 98, AXIS = 74, X0 = 5, X1 = 95;     // X0/X1 in %, the rest in px
  const REF = 450;                              // px assumed when spacing labels
  const pct = px => (px / REF) * 100;
  const r2 = n => Math.round(n * 100) / 100;
  const vals = entries.map(e => tlDateValue(e.date));
  const known = vals.filter(v => v !== null);
  const lo = known.length ? Math.min.apply(null, known) : 0;
  const span = known.length ? Math.max.apply(null, known) - lo : 0;

  // Proportional where the dates allow it, evenly spaced where they don't
  // (one entry, or every entry on the same day). Two dots never land on top
  // of each other: the second is nudged along, so both stay readable.
  let prev = -Infinity;
  const xs = entries.map((e, i) => {
    const v = vals[i];
    let x = span > 0 && v !== null
      ? X0 + ((v - lo) / span) * (X1 - X0)
      : entries.length > 1 ? X0 + (i / (entries.length - 1)) * (X1 - X0) : (X0 + X1) / 2;
    if (x - prev < pct(22)) x = prev + pct(22);
    prev = x;
    return Math.min(x, 98);
  });

  const rowY = [34, 56];                 // a second row for a crowded stretch
  const rowEnd = [-Infinity, -Infinity];
  // The head is a <marker>, because nothing else can sit at the far end of a
  // line whose x is a percentage: neither a <polygon> nor a transform takes
  // one. Every timeline defines the same one under the same name, which is
  // what makes several of them on a page draw the same head.
  const parts = [
    `<defs><marker id="tl-head" class="tl-head" viewBox="0 0 10 10" refX="9" refY="5"`
    + ` markerWidth="5" markerHeight="5" orient="auto-start-reverse">`
    + `<path d="M0 0 L10 5 L0 10 z"/></marker></defs>`,
    `<line class="tl-axis" x1="1%" y1="${AXIS}" x2="98%" y2="${AXIS}" marker-end="url(#tl-head)"/>`
  ];
  entries.forEach((e, i) => {
    const x = xs[i], label = e.date, w = pct(label.length * 7.4);
    // The first and the last label hang inwards, or they would be cut off
    // by the edge of the block.
    const anchor = x <= X0 ? 'start' : x >= X1 ? 'end' : 'middle';
    const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
    // A label that fits on neither row is dropped rather than drawn over its
    // neighbour — the dot and its number still say which entry it is.
    const row = left > rowEnd[0] + pct(10) ? 0 : left > rowEnd[1] + pct(10) ? 1 : -1;
    if (row >= 0) {
      rowEnd[row] = left + w;
      parts.push(`<line class="tl-tick" x1="${r2(x)}%" y1="${rowY[row] + 5}" x2="${r2(x)}%" y2="${AXIS - 11}"/>`);
      parts.push(`<text class="tl-date" x="${r2(x)}%" y="${rowY[row]}" text-anchor="${anchor}">${label}</text>`);
    }
    const tip = tlPlain(e.body);
    parts.push(`<g class="tl-point"><title>${label}${tip ? ' — ' + tip : ''}</title>`
      + `<circle class="tl-dot" cx="${r2(x)}%" cy="${AXIS}" r="9"/>`
      + `<text class="tl-idx" x="${r2(x)}%" y="${AXIS + 4}" text-anchor="middle">${i + 1}</text></g>`);
  });

  const aria = entries.length > 1
    ? entries[0].date + ' – ' + entries[entries.length - 1].date
    : entries[0].date;
  const list = entries.map(e =>
    `<li class="tl-item"><span class="tl-when">${e.date}</span>`
    + `<div class="tl-what">${tlContentHtml(e.body, opts)}</div></li>`).join('');
  return `<div class="md-timeline">`
    + `<svg class="tl-svg" height="${H}" role="img" aria-label="${aria}">`
    + parts.join('') + `</svg>`
    + `<ol class="tl-list">${list}</ol></div>`;
}

// lineIdx is the source line number in editor.value (so a click on the
// checkbox can flip that exact line); pass null for the export path,
// which has no live editor to write back to.
function liWithTodo(mark, text, opts, lineIdx) {
  const b = takeBlockId(text);
  const checked = mark.toLowerCase() === 'x';
  const dataLine = lineIdx === null || lineIdx === undefined ? '' : ` data-line="${lineIdx}"`;
  const statusMatch = b.text.match(TASK_STATUS_LEAD_RE);
  const status = !checked && statusMatch ? Object.keys(TASK_STATUS_MARKERS).find(key => TASK_STATUS_MARKERS[key] === statusMatch[1]) : '';
  const key = status && 'taskStatus' + status.charAt(0).toUpperCase() + status.slice(1);
  const badge = status ? `<span class="task-status task-status-${status}"${opts && opts.forExport ? '' : ` data-i="${key}"`}>${attrEsc(t(key))}</span> ` : '';
  const body = statusMatch ? b.text.slice(statusMatch[0].length) : b.text;
  return `<li${b.id ? ` id="block-${attrEsc(b.id)}"` : ''} class="task-list-item"><input type="checkbox" class="task-checkbox"${dataLine}${checked ? ' checked' : ''}> ${badge}${applyInline(body, opts)}</li>`;
}

/* ── Following a link ── */

// The one place that jumps the preview to a heading or a ^block. The nav
// panel, every [[wikilink]] and the graph all land here, so they cannot
// drift apart on which element is "the" heading with that text.
// `keepSource` is set only by the nav panel, which is also about to run
// gotoSourceHeading(): it lets a tap stay on the Source tab instead of
// forcing Preview forward, since only one pane is on screen on a phone.
// Wikilinks and the graph always want Preview pulled forward — the target
// only exists rendered — so they leave it unset.
function gotoPreviewAnchor(id, keepSource) {
  if (!id) return false;
  const el = preview.querySelector('[id="' + String(id).replace(/["\\]/g, '\\$&') + '"]');
  if (!el) return false;
  if (isMobile()) {
    if (keepSource && document.body.classList.contains('view-source')) {
      closeAllPanels();
      return true;
    }
    setView('preview');
    closeAllPanels();
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.remove('md-target');
  void el.offsetWidth;                 // restart the flash on a second jump
  el.classList.add('md-target');
  setTimeout(() => el.classList.remove('md-target'), 1300);
  return true;
}

// The other half of a nav-panel click: take the Markdown source to the same
// heading. The preview is jumped to by id, the textarea only knows offsets,
// so this one goes by line — the line updateNav() read the heading from.
// Selecting the whole heading line is what makes the landing visible, the
// same way fdGoto() shows a search hit.
function gotoSourceHeading(line) {
  if (typeof line !== 'number' || line < 0) return false;
  // On a phone only one pane is on screen. gotoPreviewAnchor() switches to
  // Preview when that isn't already the open tab, so only move the caret
  // here when Source is the one visible — otherwise it would raise the
  // keyboard behind a Preview the reader is looking at.
  if (isMobile() && !document.body.classList.contains('view-source')) return false;
  const start = fdOffsetOfLine(editor.value, line);
  const nl = editor.value.indexOf('\n', start);
  editor.focus();
  editor.setSelectionRange(start, nl === -1 ? editor.value.length : nl);
  editor.scrollTop = Math.max(0, editorMirrorAt(start).top - editor.clientHeight / 2);
  return true;
}

// Follow one [[link]]: switch chapter if it points elsewhere, then jump to
// the heading or block inside it. An unresolved name offers to become a
// real chapter, the way Obsidian creates the note when you follow the link.
async function followWikiLink(name, heading, block) {
  const anchor = block ? 'block-' + block : heading ? headingSlug(heading) : '';
  const note = name ? resolveWiki(name, wbCurrentId) : wikiHome(wbCurrentId);

  if (!note) { await offerToCreateNote(name); return; }
  if (note.chapterId && note.chapterId !== wbCurrentId) {
    await openChapter(note.chapterId);
  }
  if (anchor) {
    // The preview is rebuilt by openChapter(); give it the frame it needs.
    requestAnimationFrame(() => {
      if (!gotoPreviewAnchor(anchor)) wbSay(t('wlAnchorMissing', heading || '^' + block));
    });
  }
}

// A link to a note nobody has written yet. Obsidian creates it on the spot;
// here it becomes a chapter of the current workbook (or one you pick).
async function offerToCreateNote(name) {
  const title = mdUnescape(name).trim();
  if (!title) return;
  if (!confirm(t('confirmCreateNote', title))) return;
  let bookId = wbCurrentId ? (wbChapter(wbCurrentId) || {}).workbookId : null;
  if (!bookId) {
    if (wbBooks.length === 1) bookId = wbBooks[0].id;
    else if (!wbBooks.length) { const b = await createWorkbook(); bookId = b && b.id; }
    else {
      const names = wbBooks.map((b, i) => (i + 1) + '. ' + b.name).join('\n');
      const pick = prompt(t('promptPickWorkbook', names), '1');
      const idx = parseInt(pick, 10);
      bookId = wbBooks[idx - 1] ? wbBooks[idx - 1].id : null;
    }
  }
  if (!bookId) return;
  const ch = await createChapterNamed(bookId, title, '# ' + title + '\n\n');
  if (ch) wbSay(t('wlNoteCreated', title), true);
}

// newChapter() without the prompt — used by an unresolved link and by the
// graph, which both already know the title they want.
async function createChapterNamed(workbookId, title, content) {
  const book = wbBook(workbookId);
  if (!book) return null;
  if (!canLeaveEditor()) return null;
  await flushChapter();
  const ch = {
    id: wbNewId('ch_'), workbookId: book.id, title,
    file: wbUniqueFile(book.id, title), content: content || '',
    created: Date.now(), updated: Date.now(), order: wbChaptersOf(book.id).length
  };
  wbChapters.push(ch);
  if (!await wbPersist(WB_CHAPTERS, ch)) { wbChapters.pop(); return null; }
  wbOpenBooks.add(book.id);
  loadChapterIntoEditor(ch);
  await wbMirrorWrite(book, ch, ch.content);
  return ch;
}

/* ── Markdown parser ──
   Single implementation shared by the live preview and the HTML export.
   Pass {forExport:true} for export: it rewrites relative image paths to
   `public/images/…` and recognises a bare image-path line as a standalone
   <img>. Preview (the default, forExport:false) leaves paths as-authored. */
function resolveImageSrc(src, forExport) {
  if (!forExport) return src;
  const isAbsolute = /^(https?:\/\/|\/|data:)/i.test(src);
  return isAbsolute ? src : 'public/images/' + src;
}

function applyInline(text, opts) {
  const forExport = !!(opts && opts.forExport);
  return text
    .replace(INLINE_ASSIGNEE_RE, (m, name) => `&gt;&gt;<span class="md-assignee">${name}</span>`)
    // [[…]] before ![…](…): an embed is "![[" and both start with a bracket
    .replace(WIKI_RE, (m, bang, target, alias) => renderWikiLink(bang, target, alias, opts))
    // "Name>> " before the wikilink brackets are gone: an assignee name
    // can't itself contain "[[" or "]]", so order with WIKI_RE doesn't matter.
    .replace(ASSIGNEE_RE, (m, name, gap) => renderAssignee(name, gap))
    // before the image rule only for readability: "![" can never be a marker
    .replace(IMP_RE, (m, lead, level) => renderImportance(lead, level, opts))
    .replace(/!\[([^\]]*)\]\(([^)\s"]+)(?:\s+"([^"]*)")?\)/g,
      (_, alt, src, title) => `<img src="${resolveImageSrc(src, forExport)}" alt="${alt}"${title ? ` title="${title}"` : ''}>`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // "@date" after the code rule for the same reason TAG_RE runs last: a
    // marker inside `inline code` now follows ">", which the lead class
    // excludes, so backticked text is left alone.
    .replace(DATE_MARK_RE, function () { return renderDateMark(arguments); })
    // "^@place" after the code rule too, and for the same reason — and
    // before TAG_RE, because a "#tag" is where a place's address ends: the
    // marker gives up the "#" and TAG_RE below still gets to paint it.
    .replace(GEO_MARK_RE, function () { return renderGeoMark(arguments); })
    // "#rrggbb" as a swatch — before TAG_RE, which would otherwise eat it.
    // A "#" inside a <code> span produced above is preceded by ">", not a
    // space, so this leaves inline code alone (same guard TAG_RE relies on).
    .replace(HEX_COLOR_RE, (m, lead, hex) => renderColorSwatch(lead, hex))
    // last, and only after a space or a line start: by now every "#" this
    // pass produced sits right after ">" or a quote, so none of them match
    .replace(TAG_RE, (m, lead, tag) => renderTag(lead, tag));
}

/* A fenced code block. In the preview it is a plain <pre><code>; in the
   exported HTML it is wrapped so a "Copy" button can sit in its corner
   (the button is wired up by the small script exportHtml() injects). */
function renderCodeBlock(codeLines, codeLang, forExport) {
  const inner = `<pre><code${codeLang ? ` class="language-${codeLang}"` : ''}>${codeLines.join('\n')}</code></pre>`;
  if (!forExport) return inner;
  return `<div class="code-block"><button type="button" class="code-copy" aria-label="Copiază codul">Copiază</button>${inner}</div>`;
}

function parseMarkdown(md, opts) {
  const forExport = !!(opts && opts.forExport);
  let html = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // Restore innermost spans first so overlapping toolbar selections can
  // render together in both the preview and the exported HTML.
  let previous;
  do {
    previous = html;
    html = html.replace(/&lt;(span\s[^&]*?)&gt;((?:(?!&lt;span\s)[\s\S])*?)&lt;\/span&gt;/g,
      (_, attrs, content) => `<span ${attrs}>${content}</span>`);
  } while (html !== previous);

  const lines = html.split('\n');
  const out = []; let inUL = false; let inOL = false;
  let inCode = false; let codeLang = ''; let codeLines = [];
  let tableBuffer = [];
  let timelineBuffer = [];
  const slugSeen = {};      // keeps two headings of the same name apart

  // A run of "#date - !what" lines is one timeline — docs/FEATURES.md § R.
  function flushTimeline() {
    if (!timelineBuffer.length) return;
    const entries = timelineBuffer;
    timelineBuffer = [];
    out.push(mdTimelineHtml(entries, opts));
  }

  function flushTable() {
    if (!tableBuffer.length) return;
    const rows = tableBuffer;
    tableBuffer = [];
    if (rows.length < 2) { rows.forEach(r => out.push(`<p>${r}</p>`)); return; }
    const headers = rows[0].split('|').map(c => c.trim()).filter((_,i,a) => i>0 && i<a.length-1);
    const sepRow = rows[1].split('|').map(c => c.trim()).filter((_,i,a) => i>0 && i<a.length-1);
    const isSep = sepRow.every(c => /^:?-+:?$/.test(c));
    if (!isSep) { rows.forEach(r => out.push(`<p>${applyInline(r, opts)}</p>`)); return; }
    const aligns = sepRow.map(c => c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left');
    out.push('<table>');
    out.push('<thead><tr>' + headers.map((h,i) => `<th style="text-align:${aligns[i]}">${applyInline(h, opts)}</th>`).join('') + '</tr></thead>');
    if (rows.length > 2) {
      out.push('<tbody>');
      for (let r = 2; r < rows.length; r++) {
        const cells = rows[r].split('|').map(c => c.trim()).filter((_,i,a) => i>0 && i<a.length-1);
        out.push('<tr>' + cells.map((c,i) => `<td style="text-align:${aligns[i]||'left'}">${applyInline(c, opts)}</td>`).join('') + '</tr>');
      }
      out.push('</tbody>');
    }
    out.push('</table>');
  }

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    // fenced code block
    if (line.match(/^```/)) {
      if (!inCode) {
        flushTable(); flushTimeline();
        if (inUL) { out.push('</ul>'); inUL = false; }
        if (inOL) { out.push('</ol>'); inOL = false; }
        inCode = true;
        codeLang = line.slice(3).trim();
        codeLines = [];
      } else {
        out.push(renderCodeBlock(codeLines, codeLang, forExport));
        inCode = false; codeLines = []; codeLang = '';
      }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }

    // table row
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      flushTimeline();
      if (inUL) { out.push('</ul>'); inUL = false; }
      if (inOL) { out.push('</ol>'); inOL = false; }
      tableBuffer.push(line.trim());
      continue;
    } else {
      flushTable();
    }

    // A timeline entry, "#1969 - !Primul om pe Lună". Consecutive entries are
    // one block, and a blank line between two of them is part of it rather
    // than the end of it — people space a list out while writing it.
    const tl = parseTimelineLine(line);
    if (tl) {
      if (inUL) { out.push('</ul>'); inUL = false; }
      if (inOL) { out.push('</ol>'); inOL = false; }
      timelineBuffer.push(tl);
      continue;
    }
    if (timelineBuffer.length && line.trim() === '') {
      let j = lineIdx + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length && TIMELINE_RE.test(lines[j])) continue;
    }
    flushTimeline();

    // A causal chain is a whole line — "stres -> insomnie -| concentrare" —
    // so it is decided before the heading and list branches, and closes an
    // open list the way any other block does. A bullet holding one is
    // handled inside liWithBlockId, which keeps it in its list.
    const cz = parseCausalLine(line);
    if (cz) {
      if (inUL) { out.push('</ul>'); inUL = false; }
      if (inOL) { out.push('</ol>'); inOL = false; }
      out.push(mdCausalHtml(cz, opts));
      continue;
    }

    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) {
      if (inUL) { out.push('</ul>'); inUL = false; }
      if (inOL) { out.push('</ol>'); inOL = false; }
      out.push(`<h${hm[1].length} id="${attrEsc(headingSlug(hm[2], slugSeen))}">${applyInline(hm[2], opts)}</h${hm[1].length}>`);
      continue;
    }
    const olm = line.match(/^\d+\.\s+(.*)/);
    if (olm) {
      if (inUL) { out.push('</ul>'); inUL = false; }
      if (!inOL) { out.push('<ol>'); inOL = true; }
      out.push(liWithBlockId(olm[1], opts));
      continue;
    }
    const tlm = line.match(/^[-*+]\s+\[([ xX])\]\s+(.*)/);
    if (tlm) {
      if (inOL) { out.push('</ol>'); inOL = false; }
      if (!inUL) { out.push('<ul class="task-list">'); inUL = true; }
      out.push(liWithTodo(tlm[1], tlm[2], opts, forExport ? null : lineIdx));
      continue;
    }
    const lm = line.match(/^[-*+]\s+(.*)/);
    if (lm) {
      if (inOL) { out.push('</ol>'); inOL = false; }
      if (!inUL) { out.push('<ul>'); inUL = true; }
      out.push(liWithBlockId(lm[1], opts));
      continue;
    }
    if (inUL) { out.push('</ul>'); inUL = false; }
    if (inOL) { out.push('</ol>'); inOL = false; }
    if (forExport) {
      const imgPathMatch = line.trim().match(/^([^\s<>&]+\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|tiff?))\s*$/i);
      if (imgPathMatch) {
        const src = imgPathMatch[1];
        out.push(`<p><img src="${resolveImageSrc(src, forExport)}" alt="${src}"></p>`);
        continue;
      }
    }
    const pb = takeBlockId(line);
    out.push(pb.text.trim() === ''
      ? '<br>'
      : `<p${pb.id ? ` id="block-${attrEsc(pb.id)}"` : ''}>${applyInline(pb.text, opts)}</p>`);
  }
  flushTable(); flushTimeline();
  if (inCode) out.push(renderCodeBlock(codeLines, codeLang, forExport));
  if (inUL) out.push('</ul>');
  if (inOL) out.push('</ol>');
  return out.join('\n');
}

function updatePreview() {
  const responsibleChanged = wbPaintResponsibleSelect();
  const filtered = wbPreviewFilteredText(editor.value);
  const src = filtered.text;
  wbPreviewLineMap = filtered.lineMap;
  preview.innerHTML = parseMarkdown(src);
  const current = wbCurrentId ? wbChapter(wbCurrentId) : null;
  const currentBook = current ? wbBook(current.workbookId) : null;
  const currentTodoFiltered = wbIsTodoBook(currentBook) && wbTodoOnly.has(currentBook.id);
  const treeState = JSON.stringify([
    wbCurrentId, wbTaskStatusFilter, wbResponsibleFilter, wbImportanceFilter,
    wbResponsibleFilter && current ? wbNamesForChapter(current).has(wbResponsibleFilter) : null,
    wbTaskStatusFilter ? wbChapterHasTaskStatus(editor.value, wbTaskStatusFilter) : null,
    currentTodoFiltered ? WB_OPEN_TASK_RE.test(editor.value) : null,
    wbImportanceFilter && current ? wbChapterHasImportanceTask(editor.value, wbImportanceFilter, currentTodoFiltered, wbResponsibleFilter) : null
  ]);
  if (responsibleChanged || treeState !== wbPreviewTreeState) renderWorkbooks();
  wbPreviewTreeState = treeState;
  updateNav();
  gvRefresh();          // the graph reads the open note; keep it honest
  fdLive();             // and so does the search panel
  gdRefresh();          // and the garden toolbox
  mapRefresh();         // and the 🗺 button only exists while a "^@" does
}

/* Following a [[wikilink]] or a #tag from the preview. Delegated, because
   the preview is rebuilt from scratch on every keystroke. */
preview.addEventListener('click', e => {
  const cb = e.target.closest('.task-checkbox');
  if (cb && cb.dataset.line !== undefined) {
    const previewLineIdx = Number(cb.dataset.line);
    const lineIdx = wbPreviewLineMap ? wbPreviewLineMap[previewLineIdx] : previewLineIdx;
    const lines = editor.value.split('\n');
    if (!Number.isInteger(lineIdx) || !lines[lineIdx]) return;
    lines[lineIdx] = taskSetLineStatus(lines[lineIdx], cb.checked ? 'done' : 'todo');
    undoMark(false);
    editor.value = lines.join('\n');
    updatePreview(); updateStatus(); scheduleAutosave();
    return;
  }
  const wl = e.target.closest('.wikilink');
  if (wl) {
    e.preventDefault();
    followWikiLink(wl.dataset.wlName || '', wl.dataset.wlHeading || '', wl.dataset.wlBlock || '');
    return;
  }
  const tg = e.target.closest('.md-tag');
  if (tg) { e.preventDefault(); openGraphForTag(tg.dataset.tag || ''); return; }
  const im = e.target.closest('.md-imp');
  if (im) { e.preventDefault(); impFind(im.dataset.imp || ''); }
});
preview.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const hit = e.target.closest('.wikilink, .md-tag, .md-imp');
  if (hit) { e.preventDefault(); hit.click(); }
});

// Highlight the selected phrase in the rendered page. Ctrl+Shift+H advances
// through matches; Ctrl+Alt+Shift+H marks every occurrence.
let pageMatchQuery = '', pageMatchIndex = -1, pageMatchCaret = null;
const editorMatches = document.getElementById('editor-matches');
function paintEditorMatches(current = -1) {
  const text = editor.value, query = pageMatchQuery;
  editor.classList.toggle('has-page-matches', !!query);
  const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if (!query) { editorMatches.textContent = ''; return; }
  const lower = text.toLocaleLowerCase(), needle = query.toLocaleLowerCase();
  let from = 0, at, index = 0, html = '';
  while ((at = lower.indexOf(needle, from)) !== -1) {
    html += esc(text.slice(from, at)) + '<mark class="page-match' + (index === current ? ' current' : '') + '">' + esc(text.slice(at, at + query.length));
    if (pageMatchIndex === -1 && pageMatchCaret != null) html += '<span class="page-match-caret" aria-hidden="true" style="left:' + pageMatchCaret + 'ch"></span>';
    html += '</mark>';
    from = at + query.length; index++;
  }
  editorMatches.innerHTML = html + esc(text.slice(from));
}
editor.addEventListener('scroll', () => { editorMatches.scrollTop = editor.scrollTop; editorMatches.scrollLeft = editor.scrollLeft; });
editor.addEventListener('input', () => paintEditorMatches(pageMatchIndex));
// In "all matches" mode the textarea has one native caret, so mirror a
// caret at the same offset in every mark and apply edits to every occurrence.
editor.addEventListener('keydown', e => {
  if (pageMatchIndex !== -1 || !pageMatchQuery || pageMatchCaret == null || document.activeElement !== editor) return;
  const query = pageMatchQuery;
  const lower = editor.value.toLocaleLowerCase(), needle = query.toLocaleLowerCase();
  const starts = []; let p = 0;
  while ((p = lower.indexOf(needle, p)) !== -1) { starts.push(p); p += query.length; }
  if (!starts.length) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault(); pageMatchCaret = Math.max(0, Math.min(query.length, pageMatchCaret + (e.key === 'ArrowLeft' ? -1 : 1)));
    paintEditorMatches(-1); return;
  }
  let remove = 0, insert = '';
  if (e.key === 'Backspace') { if (!pageMatchCaret) return; remove = -1; }
  else if (e.key === 'Delete') { if (pageMatchCaret >= query.length) return; remove = 1; }
  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) insert = e.key;
  else return;
  e.preventDefault(); undoMark(false);
  let value = editor.value;
  starts.slice().reverse().forEach(start => {
    const at = start + pageMatchCaret;
    if (remove < 0) value = value.slice(0, at - 1) + value.slice(at);
    else if (remove > 0) value = value.slice(0, at) + value.slice(at + 1);
    else value = value.slice(0, at) + insert + value.slice(at);
  });
  editor.value = value;
  if (insert) { pageMatchQuery = query.slice(0, pageMatchCaret) + insert + query.slice(pageMatchCaret); pageMatchCaret++; }
  else if (remove) { pageMatchQuery = query.slice(0, pageMatchCaret + (remove < 0 ? -1 : 0)) + query.slice(pageMatchCaret + (remove > 0 ? 1 : 0)); if (remove < 0) pageMatchCaret--; }
  editor.setSelectionRange(editor.selectionStart, editor.selectionStart);
  updatePreview(); updateStatus(); scheduleAutosave(); paintEditorMatches(-1);
});
function highlightPageMatches(all) {
  const selection = window.getSelection();
  let query = selection && selection.toString().trim();
  if (!query && document.activeElement === editor) {
    query = editor.value.slice(editor.selectionStart, editor.selectionEnd).trim();
  }
  if (!query) query = pageMatchQuery;
  if (!query) return;
  if (query !== pageMatchQuery) { pageMatchQuery = query; pageMatchIndex = -1; }
  const count = (editor.value.toLocaleLowerCase().split(query.toLocaleLowerCase()).length - 1);
  if (!count) { paintEditorMatches(-1); return; }
  if (all) { pageMatchIndex = -1; pageMatchCaret = query.length; paintEditorMatches(-1); return; }
  pageMatchIndex = (pageMatchIndex + 1) % count;
  paintEditorMatches(pageMatchIndex);
}

/* ── Navigation panel ── */
function updateNav() {
  const navTree = document.getElementById('nav-tree');
  const lines = editor.value.split('\n');
  const headings = [];
  let inCode = false;
  let slugCount = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^```/)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const m = line.match(/^(#{1,6})\s+(.*)/);
    if (m) {
      const level = m[1].length;
      const raw = m[2].trim();
      // display text and preview anchor both come from the shared helpers,
      // so the nav panel and every [[Note#Section]] link agree on the slug.
      // `line` is what the source jump needs: the preview knows ids, the
      // textarea only knows offsets, and the line is what connects them
      headings.push({ level, text: mdPlain(raw), slug: headingSlug(raw, slugCount), line: i });
    }
  }

  if (!headings.length) {
    navTree.innerHTML = '<div class="nav-empty">' + t('noHeadingsYet') + '</div>';
    return;
  }

  // bullet characters per level
  const bullets = ['', '◆', '◇', '▸', '▹', '·', '·'];

  navTree.innerHTML = '';
  headings.forEach(({ level, text, slug, line }) => {
    const item = document.createElement('div');
    item.className = `nav-item nav-h${level}`;
    item.title = text;

    const bullet = document.createElement('span');
    bullet.className = 'nav-bullet';
    bullet.textContent = bullets[level];

    const label = document.createElement('span');
    label.className = 'nav-label';
    label.textContent = text;

    item.appendChild(bullet);
    item.appendChild(label);

    // clicking takes both panes to that heading: the preview by its id,
    // the Markdown source by the line it was read from. On a phone this
    // stays on whichever tab is already open instead of always jumping to
    // Preview — see gotoPreviewAnchor()'s `keepSource`.
    item.addEventListener('click', () => {
      gotoPreviewAnchor(slug, true);
      gotoSourceHeading(line);
      navTree.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
    });

    navTree.appendChild(item);
  });
}

function updateStatus() {
  const text = editor.value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById('stat-words').textContent = t('statWords', words);
  document.getElementById('stat-lines').textContent = t('statLines', text.split('\n').length);
  document.getElementById('stat-chars').textContent = t('statChars', text.length);
  wbEditorChanged();          // the draft journal and the "in no chapter" flag
}

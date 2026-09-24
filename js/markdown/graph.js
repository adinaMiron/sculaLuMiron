/* ============================================================
   Knowledge graph — Obsidian's graph view.

   Obsidian's model, kept intact: circles are notes, lines are
   the internal links between them; hovering lights up what a
   note is connected to, clicking opens it, and a *local* graph
   shows only what reaches the note you are in, to a chosen
   depth. The settings palette carries the same four sections —
   Filters, Groups, Display, Forces — with the same controls.

   What differs here is what counts as a note. A vault of loose
   files does not exist in this app; a workbook holds chapters
   (docs/FEATURES.md § E), so a chapter is a note and the vault
   is every workbook. That gives three scopes where Obsidian
   has two:

     note      the inside of the open note. Its headings are
               nodes, its ^blocks are nodes, its #tags are
               nodes, and a [[#Section]] link is an edge — so
               notions inside a single note connect to each
               other, not only notes to notes.
     workbook  the chapters of the open workbook, plus whatever
               they link out to.
     vault     every chapter of every workbook — Obsidian's
               global graph.

   The whole thing is one <canvas> and a force simulation of
   about eighty lines. There is no graph library, per the
   repo's no-dependency rule (CLAUDE.md rule 3).

   docs/FEATURES.md § G.
   ============================================================ */

/* Canvas needs real colour strings, so the graph tokens are resolved once
   here rather than per frame — the same rule, and the same reason, as
   editor.html's CHROME cache. There is no live theme toggle yet; if one is
   added, refresh this. See docs/THEME.md § "Canvas colours". */
const GRAPH_CSS = getComputedStyle(document.documentElement);
const gvToken = n => GRAPH_CSS.getPropertyValue(n).trim();
const GRAPH_COLORS = {
  note: gvToken('--graph-note'),
  active: gvToken('--graph-active'),
  heading: gvToken('--graph-heading'),
  block: gvToken('--graph-block'),
  tag: gvToken('--graph-tag'),
  unresolved: gvToken('--graph-unresolved'),
  attachment: gvToken('--graph-attachment'),
  edge: gvToken('--graph-edge'),
  keyword: gvToken('--graph-keyword'),
  causePos: gvToken('--graph-cause-pos'),
  causeNeg: gvToken('--graph-cause-neg'),
  loopR: gvToken('--graph-loop-r'),
  loopB: gvToken('--graph-loop-b'),
  accent: gvToken('--accent'),
  text: gvToken('--text-2'),
  textStrong: gvToken('--text'),
  fontUI: gvToken('--font-ui') || 'sans-serif'
};
// How big a node of each kind starts, before degree and the size slider.
const GV_BASE_R = { note: 6, heading: 5, block: 4, tag: 4.5, unresolved: 4, attachment: 4.5, keyword: 5.5 };
// Changing one of these changes *which* nodes exist, so the graph is rebuilt.
// Everything else only changes how the same graph looks or moves.
const GV_STRUCTURAL = new Set(['search', 'showTags', 'showAttachments', 'existingOnly', 'showOrphans', 'focus', 'depth', 'mode', 'loopsOnly']);

const GV_KEY = 'scula:graph';
const GV_DEFAULTS = {
  scope: 'note',
  mode: 'links',            // 'links' — notes and [[links]]
                            // 'cause' — key words and what causes what
  loopsOnly: false,
  search: '',
  showTags: true,
  showAttachments: false,
  existingOnly: false,
  showOrphans: true,
  focus: false,
  depth: 2,
  groups: [],
  arrows: true,
  textFade: 0.4,
  nodeSize: 1,
  linkThickness: 1,
  centerForce: 0.35,
  repelForce: 0.55,
  linkForce: 0.5,
  linkDistance: 95
};
let gvSettings = Object.assign({}, GV_DEFAULTS);
var gvLangReady = false;      // var: applyUILang() reads it before this runs

const gv = {
  open: false, booted: false,
  nodes: [], links: [], byId: new Map(),
  loops: [], loopPin: -1, loopHot: -1,   // causality mode: the feedback loops
                                          // found, and the one being lit up
  pos: new Map(),                 // survives a rebuild, so a filter toggle
                                  // does not reshuffle the whole picture
  alpha: 0, scale: 1, tx: 0, ty: 0,
  w: 0, h: 0, dpr: 1,
  canvas: null, ctx: null,
  hover: null, drag: null, pan: null, moved: 0,
  pointers: new Map(), pinch: null,
  raf: 0, refreshTimer: 0, fitPending: false
};

/* ── Causal statements ─────────────────────────────────────────────────
   A second thing a note can say, beside "this links to that": *this causes
   that*. One line, a chain of key words joined by arrows —

     stres -> insomnie -> stres          a circle: each one feeds the next
     efort -| oboseală                   more effort, less tiredness
     investiție ~> profit                the effect arrives later

   Four arrows, two questions each. `>` means the effect moves the same way
   as its cause (more → more), `|` means it moves the other way (more →
   less). A `~` instead of the dash means the effect is delayed — the thing
   that makes a loop oscillate instead of just running away. `-->` reads the
   same as `->`, because that is what people type.

   The *whole line* has to be a chain, so an arrow inside a sentence is left
   alone and nothing here fires by accident. docs/FEATURES.md § M. */
const CAUSAL_ARROW_RE = /\s*(-{1,2}|~)(&gt;|>|\|)\s*/;
const CAUSAL_BULLET_RE = /^\s*(?:[-*+]\s+|\d+[.)]\s+)/;
const CAUSAL_MAX_TERM = 64;     // a key word, not a sentence
const CAUSAL_MAX_TERMS = 12;    // a chain, not a whole essay on one line

// A key word may be written as a [[link]] or a #tag — the diagram wants the
// word, not the syntax around it.
function causalTerm(input) {
  const raw = String(input || '').trim();
  const label = raw
    .replace(new RegExp(WIKI_RE.source, 'g'), (m, bang, name, alias) => alias || name)
    .replace(/^[\s#*_~`"'“„([]+/, '')
    .replace(/[\s*_`"'”)\].,;:!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  // `raw` keeps the syntax so the preview can still render a term written
  // as a [[link]] or a #tag; `label`/`key` are what the diagram needs.
  return { raw, label, key: fdFold(label.toLowerCase()) };
}

/* One line in, either a chain or null. `text` must already have any list
   bullet removed — scanNote and the list branch of parseMarkdown each strip
   their own, because only they know they had one. */
function parseCausalLine(text) {
  const body = String(text || '').trim();
  // A heading is a heading and a task is a task; a line still carrying its
  // list marker belongs to the list branch, which strips it and asks again.
  if (!body || /^#{1,6}\s/.test(body) || /^\[[ xX]\]/.test(body) || CAUSAL_BULLET_RE.test(body)) return null;
  const re = new RegExp(CAUSAL_ARROW_RE.source, 'g');
  const terms = [], arrows = [];
  let m, last = 0;
  while ((m = re.exec(body)) !== null) {
    terms.push(causalTerm(body.slice(last, m.index)));
    arrows.push({ sign: m[2] === '|' ? -1 : 1, delay: m[1] === '~' });
    last = m.index + m[0].length;
    if (arrows.length > CAUSAL_MAX_TERMS) return null;
  }
  if (!arrows.length) return null;
  terms.push(causalTerm(body.slice(last)));
  if (terms.some(t => !t.key || t.label.length > CAUSAL_MAX_TERM)) return null;
  return { terms, arrows };
}

/* ── Reading a note ────────────────────────────────────────────────────
   Everything the graph knows about one note's text, in one pass: its
   headings (and the outline they nest into), its ^blocks, its #tags, its
   [[links]] and its images — each remembering which section it sat under,
   so the note-scope graph can hang it off the right notion. */
function scanNote(md) {
  const src = String(md || '');
  // Blank out code first: a fenced block or `inline code` must not mint
  // links or tags. Lengths and newlines survive, so nothing else shifts.
  const clean = src
    .replace(/```[\s\S]*?(?:\n```|$)/g, m => m.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, m => ' '.repeat(m.length));
  // Private copies: WIKI_RE and TAG_RE are global regexes, and helpers
  // called inside these loops run replace() over the shared ones.
  const wikiRe = new RegExp(WIKI_RE.source, 'g');
  const wikiBlank = new RegExp(WIKI_RE.source, 'g');
  const tagRe = new RegExp(TAG_RE.source, TAG_RE.flags);
  const hexRe = new RegExp(HEX_COLOR_RE.source, 'g');
  const imgRe = /!\[[^\]]*\]\(([^)\s"]+)(?:\s+"[^"]*")?\)/g;

  const headings = [], blocks = [], tags = [], links = [], images = [], causal = [];
  const slugSeen = {};
  let section = null;

  clean.split('\n').forEach((line, i) => {
    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    let body = line;
    if (hm) {
      body = hm[2];
      section = { level: hm[1].length, text: mdPlain(hm[2]), slug: headingSlug(hm[2], slugSeen), line: i };
      headings.push(section);
    }
    const b = takeBlockId(body);
    if (b.id && !hm) blocks.push({ id: b.id, text: b.text.trim().slice(0, 90), line: i, section });
    const text = b.text;

    let m;
    wikiRe.lastIndex = 0;
    while ((m = wikiRe.exec(text)) !== null) {
      const p = parseWikiTarget(m[2]);
      if (m[1] === '!' && !p.sub && IMG_RE.test(p.name)) { images.push({ src: p.name, line: i, section }); continue; }
      links.push({ embed: m[1] === '!', name: p.name, heading: p.heading, block: p.block, line: i, section });
    }
    // "[[#Inertia]]" is a link, not a tag named Inertia — blank the links
    // out first, exactly as applyInline() does by replacing them first.
    // ...and blank "#rrggbb" hex colours too, so a colour code in a note
    // isn't mistaken for a #tag / graph node (applyInline() renders it as
    // a swatch, not a tag).
    const noWiki = text.replace(wikiBlank, w => ' '.repeat(w.length))
      .replace(hexRe, w => ' '.repeat(w.length));
    tagRe.lastIndex = 0;
    while ((m = tagRe.exec(noWiki)) !== null) tags.push({ tag: m[2], line: i, section });
    imgRe.lastIndex = 0;
    while ((m = imgRe.exec(text)) !== null) images.push({ src: m[1], line: i, section });

    // A causal chain is a whole line, so a heading never is one; a bullet
    // may be, which is why the marker comes off first.
    if (!hm) {
      const cz = parseCausalLine(text.replace(CAUSAL_BULLET_RE, ''));
      if (cz) causal.push({ terms: cz.terms, arrows: cz.arrows, line: i, section });
    }
  });

  return { headings, blocks, tags, links, images, causal };
}

// Re-scanning every chapter on every keystroke would be wasteful; the text
// a note had last time is validity check enough.
const gvScanCache = new Map();
function scanNoteCached(id, text) {
  const hit = gvScanCache.get(id);
  if (hit && hit.text === text) return hit.scan;
  const scan = scanNote(text);
  gvScanCache.set(id, { text, scan });
  return scan;
}
// The open note's text is whatever is in the editor, saved or not.
function noteText(n) {
  if (!n) return '';
  if (n.loose || (n.chapterId && n.chapterId === wbCurrentId)) return editor.value;
  const ch = wbChapter(n.chapterId);
  return ch ? (ch.content || '') : '';
}
function gvCurrentBookId() {
  const ch = wbCurrentId ? wbChapter(wbCurrentId) : null;
  return ch ? ch.workbookId : null;
}

/* ── Building the graph ──────────────────────────────────────────────── */
function buildGraph() {
  const nodes = new Map();
  const links = [];
  const seenLink = new Set();
  const add = n => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
    return nodes.get(n.id);
  };
  const join = (a, b, kind) => {
    if (!a || !b || a === b) return;
    const k = a + ' -> ' + b + ' ' + kind;
    if (seenLink.has(k)) return;
    seenLink.add(k);
    links.push({ from: a, to: b, kind });
  };
  const tagNode = tag => add({ id: 'tag:' + tag, kind: 'tag', label: '#' + tag, path: '#' + tag, tag });
  const attNode = src => add({ id: 'att:' + src, kind: 'attachment', label: src.split('/').pop(), path: src });
  const unresNode = name => add({ id: 'unres:' + name.toLowerCase(), kind: 'unresolved', label: name, path: name });

  // Causality is a second picture of the same notes, not a fourth scope:
  // every scope can be read either way.
  if (gvSettings.mode === 'cause') {
    const causal = buildCauseScope(nodes, add);
    return { nodes: Array.from(nodes.values()), links: causal };
  }

  if (gvSettings.scope === 'note') buildNoteScope(nodes, add, join, tagNode, attNode, unresNode);
  else buildNotesScope(gvSettings.scope, add, join, tagNode, attNode, unresNode);

  return { nodes: Array.from(nodes.values()), links };
}

/* The notes the current scope covers — the open one, its workbook, or all
   of them. The link scopes each build this inline because they need more
   than the list; causality only needs the list. */
function gvScopeNotes() {
  if (gvSettings.scope === 'note') {
    const home = wikiHome(wbCurrentId);
    return home ? [home] : [];
  }
  const all = wikiNotes();
  if (gvSettings.scope === 'vault') return all;
  const bookId = gvCurrentBookId();
  return all.filter(n => (bookId ? n.bookId === bookId : n.loose));
}

/* Mode "cause": the nodes are key words rather than notes, and every edge
   is one arrow of one causal statement — signed, possibly delayed, and
   pointing the way the writer wrote it. The same relation written twice
   counts once; the same pair with opposite signs stays two arrows, because
   "A helps B" and "A hurts B" are two different claims about the world. */
function buildCauseScope(nodes, add) {
  const links = [];
  const seen = new Map();

  const kwNode = (term, note, st) => {
    if (!term.key) return null;
    const id = 'kw:' + term.key;
    const had = nodes.get(id);
    if (had) { had.notes.add(note.title); return had; }
    return add({
      id, kind: 'keyword', label: term.label, path: term.label,
      noteId: note.id, chapterId: note.chapterId,
      anchor: st.section ? st.section.slug : '',
      notes: new Set([note.title])
    });
  };

  gvScopeNotes().forEach(note => {
    scanNoteCached(note.id, noteText(note)).causal.forEach(st => {
      st.arrows.forEach((arrow, i) => {
        const a = kwNode(st.terms[i], note, st);
        const b = kwNode(st.terms[i + 1], note, st);
        if (!a || !b || a === b) return;      // "x -> x" says nothing
        const key = a.id + ' ' + b.id + ' ' + arrow.sign + (arrow.delay ? 'd' : '');
        const had = seen.get(key);
        if (had) { had.count++; return; }
        const l = { from: a.id, to: b.id, kind: 'cause', sign: arrow.sign, delay: !!arrow.delay, count: 1 };
        seen.set(key, l);
        links.push(l);
      });
    });
  });

  // Outside the note scope the same word can come from several chapters,
  // and which ones is exactly what the tooltip should say.
  if (gvSettings.scope !== 'note') {
    nodes.forEach(n => {
      if (!n.notes || n.notes.size === 0) return;
      const from = Array.from(n.notes);
      n.path = n.label + ' · ' + from.slice(0, 3).join(', ') + (from.length > 3 ? ' …' : '');
    });
  }
  return links;
}

/* ── Circular causality ───────────────────────────────────────────────
   A feedback loop is a cycle in the directed graph, and system dynamics
   reads its sign by multiplying the signs of its arrows: an even number of
   negative arrows leaves the product positive, and the loop feeds itself
   (reinforcing, R — a vicious or virtuous circle); an odd number makes it
   negative, and the loop damps itself (balancing, B — a thermostat).

   Enumeration is a depth-first walk that only ever *starts* a cycle at its
   lowest-numbered node, which is what stops one loop from being reported
   once per member. Both caps are there so a dense diagram cannot hang the
   page — the interesting loops in a hand-written note are short ones. */
const GV_MAX_LOOPS = 40;
const GV_MAX_LOOP_LEN = 8;

function gvFindLoops(g) {
  const order = new Map();
  g.nodes.forEach((n, i) => order.set(n.id, i));
  const out = new Map();
  g.links.forEach(l => {
    const a = order.get(l.from), b = order.get(l.to);
    if (a == null || b == null) return;
    if (!out.has(a)) out.set(a, []);
    out.get(a).push({ to: b, link: l });
  });

  const found = [];
  const path = [], onPath = new Set();
  let stop = false;

  const walk = (start, at) => {
    for (const e of (out.get(at) || [])) {
      if (stop) return;
      if (e.to < start) continue;                 // its own turn comes later
      if (e.to === start) {
        found.push({ start, edges: path.concat([e]) });
        if (found.length >= GV_MAX_LOOPS) { stop = true; return; }
        continue;
      }
      if (onPath.has(e.to) || path.length + 1 >= GV_MAX_LOOP_LEN) continue;
      onPath.add(e.to); path.push(e);
      walk(start, e.to);
      path.pop(); onPath.delete(e.to);
    }
  };

  for (let i = 0; i < g.nodes.length && !stop; i++) {
    path.length = 0; onPath.clear(); onPath.add(i);
    walk(i, i);
  }

  const loops = found.map(f => {
    const links = f.edges.map(e => e.link);
    const nodes = [g.nodes[f.start]].concat(f.edges.slice(0, -1).map(e => g.nodes[e.to]));
    return {
      links, nodes,
      sign: links.reduce((p, l) => p * (l.sign || 1), 1),
      delay: links.some(l => l.delay)
    };
  }).sort((a, b) => a.links.length - b.links.length || b.sign - a.sign);

  // Every node and every arrow remembers which loops it belongs to; that is
  // what the canvas draws with and what "only what is in a loop" filters on.
  g.nodes.forEach(n => { n.loops = new Set(); });
  g.links.forEach(l => { l.loops = new Set(); });
  loops.forEach((loop, i) => {
    loop.nodes.forEach(n => n.loops.add(i));
    loop.links.forEach(l => l.loops.add(i));
  });
  return loops;
}
const gvLoopColor = loop => (loop && loop.sign > 0) ? GRAPH_COLORS.loopR : GRAPH_COLORS.loopB;
const gvCauseGlyph = l => (l.delay ? '⋯' : '') + (l.sign < 0 ? '⊣' : '→');

/* Two arrows between the same pair — "A feeds B, B feeds A", the shortest
   circle there is — would be one line drawn straight. Bow them apart. */
function gvBowLinks(links) {
  const pairs = new Map();
  links.forEach(l => {
    const k = l.from < l.to ? l.from + ' ' + l.to : l.to + ' ' + l.from;
    if (!pairs.has(k)) pairs.set(k, []);
    pairs.get(k).push(l);
  });
  pairs.forEach(arr => {
    if (arr.length === 1) { arr[0].bow = 0; return; }
    arr.forEach((l, i) => { l.bow = (i % 2 ? -1 : 1) * (0.16 + Math.floor(i / 2) * 0.13); });
  });
}

/* Scope "note": the inside of one note. The note is the root, its headings
   hang off it in the order they nest, its ^blocks and #tags hang off the
   section they appear in, and a [[#Section]] link becomes an edge from the
   section that wrote it to the section it names. That last edge is the
   point of this scope — it is how two notions inside one note connect. */
function buildNoteScope(nodes, add, join, tagNode, attNode, unresNode) {
  const home = wikiHome(wbCurrentId);
  if (!home) return;
  const rootId = 'note:' + home.id;
  const scan = scanNoteCached(home.id, noteText(home));

  // A note that opens with a single "# Title" *is* that heading —
  // wbGuessTitle() already reads the first one as the chapter's title, so
  // the graph folds it into the note node rather than drawing both.
  const h1s = scan.headings.filter(h => h.level === 1);
  const merged = (h1s.length === 1 && scan.headings[0] === h1s[0]) ? h1s[0] : null;

  add({
    id: rootId, kind: 'note', active: true, label: home.title,
    path: (home.bookName ? home.bookName + ' › ' : '') + home.title,
    noteId: home.id, chapterId: home.chapterId, anchor: merged ? merged.slug : ''
  });

  const headId = slug => (merged && slug === merged.slug) ? rootId : 'head:' + home.id + ':' + slug;
  const blockId = id => 'block:' + home.id + ':' + id;
  const sectionOf = sec => sec ? headId(sec.slug) : rootId;

  const stack = [];
  scan.headings.forEach(h => {
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    if (h !== merged) {
      add({
        id: headId(h.slug), kind: 'heading', label: h.text, path: home.title + ' › ' + h.text,
        level: h.level, noteId: home.id, chapterId: home.chapterId, anchor: h.slug
      });
      join(stack.length ? headId(stack[stack.length - 1].slug) : rootId, headId(h.slug), 'outline');
    }
    stack.push(h);
  });

  scan.blocks.forEach(b => {
    add({
      id: blockId(b.id), kind: 'block', label: b.text || ('^' + b.id), path: '^' + b.id,
      noteId: home.id, chapterId: home.chapterId, anchor: 'block-' + b.id
    });
    join(sectionOf(b.section), blockId(b.id), 'outline');
  });

  scan.tags.forEach(tg => join(sectionOf(tg.section), tagNode(tg.tag).id, 'tag'));
  scan.images.forEach(im => join(sectionOf(im.section), attNode(im.src).id, 'attachment'));

  scan.links.forEach(l => {
    const from = sectionOf(l.section);
    const kind = l.embed ? 'embed' : 'link';
    if (!l.name) {
      // [[#Section]] / [[#^anchor]] — a link inside this very note
      const to = l.block ? blockId(l.block) : headId(headingSlug(l.heading));
      join(from, nodes.has(to) ? to : unresNode(l.block ? '^' + l.block : l.heading).id, kind);
      return;
    }
    const note = resolveWiki(l.name, home.chapterId);
    if (!note) { join(from, unresNode(l.name).id, kind); return; }
    if (note.id === home.id) {
      const to = l.block ? blockId(l.block) : l.heading ? headId(headingSlug(l.heading)) : rootId;
      join(from, nodes.has(to) ? to : rootId, kind);
      return;
    }
    join(from, add({
      id: 'note:' + note.id, kind: 'note', label: note.title,
      path: (note.bookName ? note.bookName + ' › ' : '') + note.title,
      noteId: note.id, chapterId: note.chapterId, external: true
    }).id, kind);
  });
}

/* Scopes "workbook" and "vault": notes are the nodes, exactly as in
   Obsidian. A note the set links out to is drawn too, even when it lives
   in another workbook — a real link is a real edge. */
function buildNotesScope(scope, add, join, tagNode, attNode, unresNode) {
  const bookId = gvCurrentBookId();
  const all = wikiNotes();
  const inScope = scope === 'vault'
    ? all
    : all.filter(n => (bookId ? n.bookId === bookId : n.loose));
  const inSet = new Set(inScope.map(n => n.id));

  const nodeOf = n => add({
    id: 'note:' + n.id, kind: 'note',
    active: n.chapterId ? n.chapterId === wbCurrentId : (n.loose && !wbCurrentId),
    label: n.title,
    path: (n.bookName ? n.bookName + ' › ' : '') + n.title,
    noteId: n.id, chapterId: n.chapterId, external: !inSet.has(n.id)
  });

  inScope.forEach(nodeOf);
  inScope.forEach(n => {
    const me = 'note:' + n.id;
    const scan = scanNoteCached(n.id, noteText(n));
    scan.tags.forEach(tg => join(me, tagNode(tg.tag).id, 'tag'));
    scan.images.forEach(im => join(me, attNode(im.src).id, 'attachment'));
    scan.links.forEach(l => {
      const kind = l.embed ? 'embed' : 'link';
      if (!l.name) return;                  // a link into itself is not an edge here
      const target = resolveWiki(l.name, n.chapterId);
      if (!target) { join(me, unresNode(l.name).id, kind); return; }
      if (target.id === n.id) return;
      join(me, nodeOf(target).id, kind);
    });
  });
}

/* ── Filters ──────────────────────────────────────────────────────────
   Obsidian's order and Obsidian's meanings: the search drops notes that do
   not match, the toggles drop whole kinds, the local graph keeps only what
   is within `depth` hops of the note you are in, and orphans go last —
   because filtering is exactly what can turn a note into one. */
function gvMatches(n, q) {
  if (!q) return true;
  return (n.label + ' ' + (n.path || '') + ' ' + (n.tag ? '#' + n.tag : '')).toLowerCase().includes(q);
}
function applyGraphFilters(g) {
  let nodes = g.nodes, links = g.links;
  const prune = () => {
    const ids = new Set(nodes.map(n => n.id));
    links = links.filter(l => ids.has(l.from) && ids.has(l.to));
  };

  const q = gvSettings.search.trim().toLowerCase();
  if (q) { nodes = nodes.filter(n => n.active || gvMatches(n, q)); prune(); }
  if (!gvSettings.showTags) { nodes = nodes.filter(n => n.kind !== 'tag'); prune(); }
  if (!gvSettings.showAttachments) { nodes = nodes.filter(n => n.kind !== 'attachment'); prune(); }
  if (gvSettings.existingOnly) { nodes = nodes.filter(n => n.kind !== 'unresolved'); prune(); }

  if (gvSettings.focus) {
    const root = nodes.find(n => n.active);
    if (root) {
      const adj = new Map();
      const pair = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
      links.forEach(l => { pair(l.from, l.to); pair(l.to, l.from); });
      const near = new Map([[root.id, 0]]);
      let front = [root.id];
      for (let d = 1; d <= gvSettings.depth && front.length; d++) {
        const next = [];
        front.forEach(id => (adj.get(id) || []).forEach(o => {
          if (near.has(o)) return;
          near.set(o, d);
          next.push(o);
        }));
        front = next;
      }
      nodes = nodes.filter(n => near.has(n.id));
      prune();
    }
  }

  if (!gvSettings.showOrphans) {
    const deg = new Map();
    links.forEach(l => {
      deg.set(l.from, (deg.get(l.from) || 0) + 1);
      deg.set(l.to, (deg.get(l.to) || 0) + 1);
    });
    nodes = nodes.filter(n => n.active || deg.get(n.id));
    prune();
  }
  return { nodes, links };
}

// A group paints every node whose name, path or tag contains its word.
// The first group that matches wins, as in Obsidian.
function gvNodeColor(n) {
  for (const g of gvSettings.groups) {
    if (g.query && gvMatches(n, g.query.trim().toLowerCase())) return g.color;
  }
  if (n.active) return GRAPH_COLORS.active;
  return GRAPH_COLORS[n.kind] || GRAPH_COLORS.note;
}

/* ── The simulation ───────────────────────────────────────────────────
   Obsidian's four sliders are four forces, and nothing else:

     centre force   how hard every node is pulled to the middle, i.e.
                    how compact the graph ends up
     repel force    how hard nodes push each other apart
     link force     how tight the rubber band on each link is
     link distance  the length that band wants to be

   `alpha` is the simulation's remaining energy: it decays to nothing so
   the graph settles instead of jittering forever, and any change kicks it
   back up. Dragging a node pins it (`fixed`) until you let go. */
function gvKick(a) {
  gv.alpha = Math.max(gv.alpha, a == null ? 0.7 : a);
}
function gvStep() {
  const s = gvSettings, ns = gv.nodes, alpha = gv.alpha;
  if (!ns.length || alpha <= 0) return;

  // Repel: every pair pushes, magnitude ~ 1/d². O(n²), which is the right
  // trade at this scale — a few hundred notes is ~10⁴ pairs a tick.
  const rep = s.repelForce * 4200;
  for (let i = 0; i < ns.length; i++) {
    const a = ns[i];
    for (let j = i + 1; j < ns.length; j++) {
      const b = ns[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = dx * dx + dy * dy + 0.01; }
      const f = rep * alpha / (d2 * Math.sqrt(d2));
      a.vx -= dx * f; a.vy -= dy * f;
      b.vx += dx * f; b.vy += dy * f;
    }
  }

  // Links: a spring that wants to be `linkDistance` long. The busier end
  // of a link moves less, so hubs stay put and leaves swing around them.
  const lf = s.linkForce * 0.55;
  for (const l of gv.links) {
    const a = l.a, b = l.b;
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const f = ((d - s.linkDistance) / d) * lf * alpha;
    const tot = (a.deg + b.deg) || 2;
    a.vx += dx * f * (b.deg / tot); a.vy += dy * f * (b.deg / tot);
    b.vx -= dx * f * (a.deg / tot); b.vy -= dy * f * (a.deg / tot);
  }

  // Centre, then integrate with a velocity decay so nothing runs away.
  const cf = s.centerForce * 0.09 * alpha;
  for (const n of ns) {
    if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
    n.vx -= n.x * cf; n.vy -= n.y * cf;
    n.vx *= 0.62; n.vy *= 0.62;
    n.x += n.vx; n.y += n.vy;
    gv.pos.set(n.id, { x: n.x, y: n.y });
  }

  gv.alpha *= 0.97;
  if (gv.alpha < 0.004) gv.alpha = 0;
}

/* ── Rendering ────────────────────────────────────────────────────────
   Everything is drawn in screen space (node.x/y are graph coordinates,
   `gvSX`/`gvSY` project them), so line widths and label sizes stay honest
   at any zoom without fighting a canvas transform. */
const gvSX = x => x * gv.scale + gv.tx;
const gvSY = y => y * gv.scale + gv.ty;
function gvRadius(n) {
  return (GV_BASE_R[n.kind] || 5) * (1 + Math.sqrt(n.deg) * 0.24) * gvSettings.nodeSize;
}
function gvLabel(n) {
  const s = n.label || '';
  return s.length > 30 ? s.slice(0, 29) + '…' : s;
}

function gvDraw() {
  const ctx = gv.ctx;
  if (!ctx) return;
  ctx.setTransform(gv.dpr, 0, 0, gv.dpr, 0, 0);
  ctx.clearRect(0, 0, gv.w, gv.h);

  // Hovering a node dims everything it is not connected to — Obsidian's
  // single most useful graph gesture.
  const hot = gv.hover;
  const lit = new Set();
  if (hot) {
    lit.add(hot.id);
    gv.links.forEach(l => {
      if (l.from === hot.id) lit.add(l.to);
      else if (l.to === hot.id) lit.add(l.from);
    });
  }

  // Causality mode: one loop can be lit up, pinned by a click in the palette
  // or lit for as long as the pointer rests on its row.
  const focus = gv.loops.length ? (gv.loopPin >= 0 ? gv.loopPin : gv.loopHot) : -1;

  ctx.lineCap = 'round';
  for (const l of gv.links) {
    const a = l.a, b = l.b;
    if (!a || !b) continue;
    const on = !hot || (lit.has(a.id) && lit.has(b.id));
    if (l.kind === 'cause') {
      gvDrawCause(ctx, l, gvSX(a.x), gvSY(a.y), gvSX(b.x), gvSY(b.y), on, focus);
      continue;
    }
    ctx.globalAlpha = on ? (hot ? 0.95 : 0.55) : 0.08;
    ctx.strokeStyle = on && hot ? GRAPH_COLORS.accent : GRAPH_COLORS.edge;
    ctx.lineWidth = gvSettings.linkThickness * (l.kind === 'outline' ? 0.9 : 1.3);
    const x1 = gvSX(a.x), y1 = gvSY(a.y), x2 = gvSX(b.x), y2 = gvSY(b.y);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (gvSettings.arrows && l.kind !== 'outline') gvArrow(ctx, x1, y1, x2, y2, gvRadius(b) * gv.scale);
  }

  const labelAlpha = Math.max(0, Math.min(1, (gv.scale - gvSettings.textFade) / 0.35));
  ctx.font = '11px ' + GRAPH_COLORS.fontUI;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (const n of gv.nodes) {
    const inFocus = focus < 0 || (n.loops && n.loops.has(focus));
    const on = (!hot || lit.has(n.id)) && inFocus;
    const x = gvSX(n.x), y = gvSY(n.y), r = Math.max(1.5, gvRadius(n) * gv.scale);
    ctx.globalAlpha = on ? 1 : 0.12;
    ctx.fillStyle = gvNodeColor(n);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // An unresolved note is a ring, not a disc: it is a name, not a file.
    if (n.kind === 'unresolved') {
      ctx.globalAlpha = on ? 1 : 0.12;
      ctx.fillStyle = gvToken('--bg') || '#14201A';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.5, r - 1.6), 0, Math.PI * 2);
      ctx.fill();
    }
    // A key word that sits on a feedback loop wears that loop's colour, so
    // a circle reads as a circle before anyone opens the loop list.
    if (n.loops && n.loops.size) {
      const li = (focus >= 0 && n.loops.has(focus)) ? focus : Math.min.apply(null, Array.from(n.loops));
      ctx.globalAlpha = on ? 1 : 0.12;
      ctx.strokeStyle = gvLoopColor(gv.loops[li]);
      ctx.lineWidth = (focus >= 0 && n.loops.has(focus)) ? 2.4 : 1.4;
      ctx.beginPath();
      ctx.arc(x, y, r + 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (n === hot || n.active) {
      ctx.globalAlpha = on ? 1 : 0.2;
      ctx.strokeStyle = n === hot ? GRAPH_COLORS.accent : GRAPH_COLORS.active;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    const la = n === hot ? 1 : labelAlpha;
    if (la > 0.02 && on) {
      ctx.globalAlpha = la * (on ? 1 : 0.2);
      ctx.fillStyle = (n === hot || n.active) ? GRAPH_COLORS.textStrong : GRAPH_COLORS.text;
      ctx.fillText(gvLabel(n), x, y + r + 3);
    }
  }
  ctx.globalAlpha = 1;
}

/* One causal arrow, drawn the way a causal-loop diagram draws one: its sign
   is a colour and a glyph (+ / −), a delayed effect is dashed and carries
   the two cross-strokes that mean "later", and an arrow that closes a
   feedback loop is heavier than one that does not. Curved rather than
   straight when it has a twin going the other way. */
function gvDrawCause(ctx, l, x1, y1, x2, y2, on, focus) {
  const inFocus = focus >= 0 && l.loops && l.loops.has(focus);
  const inLoop = !!(l.loops && l.loops.size);
  const dim = !on || (focus >= 0 && !inFocus);
  const col = inFocus ? gvLoopColor(gv.loops[focus])
    : l.sign < 0 ? GRAPH_COLORS.causeNeg : GRAPH_COLORS.causePos;

  const dx = x2 - x1, dy = y2 - y1;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / d, uy = dy / d;               // along the arrow
  const nx = -uy, ny = ux;                      // across it
  const bow = (l.bow || 0) * d;
  const cx = (x1 + x2) / 2 + nx * bow, cy = (y1 + y2) / 2 + ny * bow;

  ctx.globalAlpha = dim ? 0.09 : inLoop ? 0.95 : 0.6;
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = gvSettings.linkThickness * (inFocus ? 2.4 : inLoop ? 1.7 : 1.1);
  if (l.delay) ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx, cy, x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  // The head sits on the tangent at the far end, backed off the node.
  const back = Math.max(2, gvRadius(l.b) * gv.scale) + 1;
  let tx = x2 - cx, ty = y2 - cy;
  const tl = Math.sqrt(tx * tx + ty * ty) || 1;
  tx /= tl; ty /= tl;
  if (d > back + 8) {
    const hx = x2 - tx * back, hy = y2 - ty * back;
    const size = 5 + gvSettings.linkThickness * 1.5;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - tx * size + ty * size * 0.55, hy - ty * size - tx * size * 0.55);
    ctx.lineTo(hx - tx * size - ty * size * 0.55, hy - ty * size + tx * size * 0.55);
    ctx.closePath();
    ctx.fill();
  }

  // Midpoint of the curve (t = 0.5 on a quadratic), where both marks go.
  const mx = 0.25 * x1 + 0.5 * cx + 0.25 * x2;
  const my = 0.25 * y1 + 0.5 * cy + 0.25 * y2;
  if (l.delay && d > 44) {
    ctx.lineWidth = Math.max(1.2, gvSettings.linkThickness * 1.4);
    ctx.beginPath();
    ctx.moveTo(mx - ux * 2.5 + nx * 5, my - uy * 2.5 + ny * 5);
    ctx.lineTo(mx - ux * 2.5 - nx * 5, my - uy * 2.5 - ny * 5);
    ctx.moveTo(mx + ux * 2.5 + nx * 5, my + uy * 2.5 + ny * 5);
    ctx.lineTo(mx + ux * 2.5 - nx * 5, my + uy * 2.5 - ny * 5);
    ctx.stroke();
  }
  if (!dim && gv.scale > 0.5) {
    ctx.globalAlpha = 1;
    ctx.font = 'bold 12px ' + GRAPH_COLORS.fontUI;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(l.sign < 0 ? '−' : '+', mx + nx * 10, my + ny * 10);
  }
}

function gvArrow(ctx, x1, y1, x2, y2, back) {
  const dx = x2 - x1, dy = y2 - y1;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < back + 8) return;
  const ux = dx / d, uy = dy / d;
  const tipX = x2 - ux * (back + 1), tipY = y2 - uy * (back + 1);
  const size = 4 + gvSettings.linkThickness;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - ux * size + uy * size * 0.5, tipY - uy * size - ux * size * 0.5);
  ctx.lineTo(tipX - ux * size - uy * size * 0.5, tipY - uy * size + ux * size * 0.5);
  ctx.closePath();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
}

/* ── Rebuilding ───────────────────────────────────────────────────────
   Nodes keep the position they already had, so toggling a filter moves the
   graph rather than re-scattering it. A brand new node starts next to a
   neighbour it already has, which saves the simulation a lot of work. */
function gvRebuild() {
  if (!gv.open) return;
  invalidateWikiIndex();
  const g = applyGraphFilters(buildGraph());

  // Loops are found *after* the filters, because a search that drops a key
  // word genuinely opens the circle it was part of.
  if (gvSettings.mode === 'cause') {
    gv.loops = gvFindLoops(g);
    if (gvSettings.loopsOnly) {
      g.nodes = g.nodes.filter(n => n.loops.size);
      const ids = new Set(g.nodes.map(n => n.id));
      g.links = g.links.filter(l => l.loops.size && ids.has(l.from) && ids.has(l.to));
    }
    gvBowLinks(g.links);
  } else {
    gv.loops = [];
  }
  if (gv.loopPin >= gv.loops.length) gv.loopPin = -1;
  gv.loopHot = -1;

  const deg = new Map();
  g.links.forEach(l => {
    deg.set(l.from, (deg.get(l.from) || 0) + 1);
    deg.set(l.to, (deg.get(l.to) || 0) + 1);
  });

  const byId = new Map();
  const R = 140;
  g.nodes.forEach((n, i) => {
    const old = gv.pos.get(n.id);
    const a = (i / Math.max(1, g.nodes.length)) * Math.PI * 2;
    n.x = old ? old.x : Math.cos(a) * R + (Math.random() - 0.5) * 20;
    n.y = old ? old.y : Math.sin(a) * R + (Math.random() - 0.5) * 20;
    n.vx = 0; n.vy = 0;
    n.deg = deg.get(n.id) || 0;
    n.fixed = false;
    byId.set(n.id, n);
  });
  g.links.forEach(l => { l.a = byId.get(l.from); l.b = byId.get(l.to); });

  gv.nodes = g.nodes;
  gv.links = g.links;
  gv.byId = byId;
  gv.hover = null;
  gvKick(0.9);
  gvPaintStats();
  gvPaintEmpty();
  renderGvLoops();
  if (gv.fitPending) { gv.fitPending = false; setTimeout(gvFit, 420); }
}

function gvPaintStats() {
  const el = document.getElementById('gv-stats');
  if (!el) return;
  el.textContent = gvSettings.mode === 'cause'
    ? t('gvStatsCause', [gv.nodes.length, gv.links.length, gv.loops.length])
    : t('gvStats', [gv.nodes.length, gv.links.length]);
}
function gvPaintEmpty() {
  const el = document.getElementById('gv-empty');
  if (!el) return;
  const has = gv.nodes.length > 0;
  el.classList.toggle('show', !has);
  if (!has) el.textContent = gvSettings.scope === 'workbook' && !gvCurrentBookId()
    ? t('gvEmptyWorkbook')
    : gvSettings.search ? t('gvEmptySearch')
      : gvSettings.mode === 'cause' ? t('gvEmptyCause')
        : t('gvEmpty');
}

/* ── View: fit, zoom, pan ─────────────────────────────────────────── */
function gvFit() {
  if (!gv.nodes.length || !gv.w) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  gv.nodes.forEach(n => {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  });
  const pad = 70;
  const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
  gv.scale = Math.max(0.15, Math.min(2.2, Math.min((gv.w - pad * 2) / w, (gv.h - pad * 2) / h)));
  gv.tx = gv.w / 2 - ((minX + maxX) / 2) * gv.scale;
  gv.ty = gv.h / 2 - ((minY + maxY) / 2) * gv.scale;
  gvDraw();
}
function gvZoomAt(sx, sy, factor) {
  const next = Math.max(0.08, Math.min(6, gv.scale * factor));
  const k = next / gv.scale;
  gv.tx = sx - (sx - gv.tx) * k;
  gv.ty = sy - (sy - gv.ty) * k;
  gv.scale = next;
  gvDraw();
}
function gvZoomBy(factor) { gvZoomAt(gv.w / 2, gv.h / 2, factor); }

function gvResize() {
  const stage = document.getElementById('gv-stage');
  if (!stage || !gv.canvas) return;
  const r = stage.getBoundingClientRect();
  gv.dpr = Math.min(window.devicePixelRatio || 1, 2);
  gv.w = Math.max(1, Math.round(r.width));
  gv.h = Math.max(1, Math.round(r.height));
  gv.canvas.width = Math.round(gv.w * gv.dpr);
  gv.canvas.height = Math.round(gv.h * gv.dpr);
  gvDraw();
}

/* ── Pointer interaction ──────────────────────────────────────────────
   One pointer route for mouse, touch and pen: drag a node to pin and move
   it, drag the background to pan, two fingers to pinch. A press that never
   travelled is a click, and a click on a node opens it. */
function gvHit(sx, sy) {
  for (let i = gv.nodes.length - 1; i >= 0; i--) {
    const n = gv.nodes[i];
    const r = Math.max(6, gvRadius(n) * gv.scale) + 4;
    const dx = sx - gvSX(n.x), dy = sy - gvSY(n.y);
    if (dx * dx + dy * dy <= r * r) return n;
  }
  return null;
}
function gvLocal(e) {
  const r = gv.canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function gvTip(n, sx, sy) {
  const el = document.getElementById('gv-tip');
  if (!el) return;
  if (!n) { el.classList.remove('show'); return; }
  el.textContent = (n.path || n.label) + (n.deg ? '  ·  ' + t('gvLinksN', n.deg) : '');
  el.classList.add('show');
  const w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = Math.max(4, Math.min(gv.w - w - 4, sx + 12)) + 'px';
  el.style.top = Math.max(4, Math.min(gv.h - h - 4, sy + 14)) + 'px';
}

function gvBindStage() {
  const c = gv.canvas;

  c.addEventListener('pointerdown', e => {
    // Capture keeps a drag alive past the canvas edge. It can throw when the
    // pointer is already gone, and losing the whole gesture over that would
    // be worse than losing the capture.
    try { c.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
    const p = gvLocal(e);
    gv.pointers.set(e.pointerId, p);
    if (gv.pointers.size === 2) {
      const [a, b] = Array.from(gv.pointers.values());
      gv.pinch = { d: Math.hypot(b.x - a.x, b.y - a.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gv.drag = null; gv.pan = null;
      return;
    }
    gv.moved = 0;
    const n = gvHit(p.x, p.y);
    if (n) {
      gv.drag = { node: n, dx: p.x - gvSX(n.x), dy: p.y - gvSY(n.y) };
      n.fixed = true;
      gvKick(0.5);
    } else {
      gv.pan = { x: p.x - gv.tx, y: p.y - gv.ty };
      c.classList.add('panning');
    }
  });

  c.addEventListener('pointermove', e => {
    const p = gvLocal(e);
    if (gv.pointers.has(e.pointerId)) gv.pointers.set(e.pointerId, p);

    if (gv.pinch && gv.pointers.size === 2) {
      const [a, b] = Array.from(gv.pointers.values());
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (gv.pinch.d > 0) gvZoomAt(gv.pinch.x, gv.pinch.y, d / gv.pinch.d);
      gv.pinch.d = d;
      gv.pinch.x = (a.x + b.x) / 2;
      gv.pinch.y = (a.y + b.y) / 2;
      return;
    }
    if (gv.drag) {
      gv.moved += 1;
      const n = gv.drag.node;
      n.x = (p.x - gv.drag.dx - gv.tx) / gv.scale;
      n.y = (p.y - gv.drag.dy - gv.ty) / gv.scale;
      gv.pos.set(n.id, { x: n.x, y: n.y });
      gvKick(0.4);
      return;
    }
    if (gv.pan) {
      gv.moved += 1;
      gv.tx = p.x - gv.pan.x;
      gv.ty = p.y - gv.pan.y;
      gvDraw();
      return;
    }
    const n = gvHit(p.x, p.y);
    if (n !== gv.hover) { gv.hover = n; gvDraw(); }
    gvTip(n, p.x, p.y);
  });

  const release = e => {
    gv.pointers.delete(e.pointerId);
    if (gv.pointers.size < 2) gv.pinch = null;
    if (gv.drag) {
      const n = gv.drag.node;
      n.fixed = false;
      gv.drag = null;
      if (gv.moved < 3) gvOpenNode(n);
    }
    gv.pan = null;
    c.classList.remove('panning');
  };
  c.addEventListener('pointerup', release);
  c.addEventListener('pointercancel', e => {
    gv.pointers.delete(e.pointerId);
    if (gv.drag) { gv.drag.node.fixed = false; gv.drag = null; }
    gv.pan = null; gv.pinch = null;
    c.classList.remove('panning');
  });
  c.addEventListener('pointerleave', () => { gv.hover = null; gvTip(null); gvDraw(); });

  c.addEventListener('wheel', e => {
    e.preventDefault();
    const p = gvLocal(e);
    gvZoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  c.addEventListener('dblclick', e => {
    if (!gvHit(gvLocal(e).x, gvLocal(e).y)) gvFit();
  });
}

/* Clicking a node does what Obsidian does: a note opens, a heading or a
   ^block opens its note and scrolls there, a tag becomes the search, and
   an unresolved name offers to become a real chapter. */
async function gvOpenNode(n) {
  if (!n) return;
  if (n.kind === 'tag') {
    gvSettings.search = '#' + n.tag;
    gvPaintControls();
    gvSaveSettings();
    gvRebuild();
    return;
  }
  if (n.kind === 'attachment') { wbSay(t('gvAttachmentHint', n.path)); return; }
  if (n.kind === 'unresolved') { closeGraph(); await offerToCreateNote(n.label); return; }
  closeGraph();
  if (n.chapterId && n.chapterId !== wbCurrentId) await openChapter(n.chapterId);
  if (n.anchor) requestAnimationFrame(() => gotoPreviewAnchor(n.anchor));
}

/* ── Settings palette ─────────────────────────────────────────────── */
function gvSaveSettings() {
  try { store.set(GV_KEY, JSON.stringify(gvSettings)); } catch (e) { /* not fatal */ }
}
async function gvLoadSettings() {
  let raw = null;
  try { raw = await store.get(GV_KEY); } catch (e) {}
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    Object.keys(GV_DEFAULTS).forEach(k => { if (saved[k] !== undefined) gvSettings[k] = saved[k]; });
    gvSettings.groups = Array.isArray(gvSettings.groups)
      ? gvSettings.groups.filter(g => g && typeof g === 'object')
        .map(g => ({ query: String(g.query || ''), color: String(g.color || GRAPH_COLORS.accent) }))
      : [];
  } catch (e) { /* a corrupt blob just means defaults */ }
}

function gvPaintControls() {
  document.querySelectorAll('#gv-settings [data-gv]').forEach(el => {
    const v = gvSettings[el.dataset.gv];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  });
  document.querySelectorAll('#gv-settings [data-gv-val]').forEach(el => {
    const k = el.dataset.gvVal;
    el.textContent = k === 'linkDistance' || k === 'depth'
      ? String(gvSettings[k])
      : Number(gvSettings[k]).toFixed(2);
  });
  document.querySelectorAll('#gv-scope button').forEach(b =>
    b.classList.toggle('active', b.dataset.scope === gvSettings.scope));
  document.querySelectorAll('#gv-mode button').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === gvSettings.mode));
  renderGvGroups();
}

// Which half of the palette applies is a CSS question (see [data-gv-only]),
// so the mode lives on the overlay as a class.
function gvPaintMode() {
  const view = document.getElementById('graph-view');
  if (view) view.classList.toggle('cause', gvSettings.mode === 'cause');
}

function gvBindControls() {
  document.querySelectorAll('#gv-settings [data-gv]').forEach(el => {
    el.addEventListener('input', () => {
      const k = el.dataset.gv;
      gvSettings[k] = el.type === 'checkbox' ? el.checked
        : el.type === 'range' ? parseFloat(el.value)
          : el.value;
      gvPaintControls();
      gvSaveSettings();
      if (GV_STRUCTURAL.has(k)) gvRebuild();
      else { gvKick(0.25); gvDraw(); }
    });
  });
  document.querySelectorAll('#gv-scope button').forEach(b => {
    b.addEventListener('click', () => setGraphScope(b.dataset.scope));
  });
  document.querySelectorAll('#gv-mode button').forEach(b => {
    b.addEventListener('click', () => setGraphMode(b.dataset.mode));
  });
}

function setGraphScope(scope) {
  if (!scope || scope === gvSettings.scope) return;
  gvSettings.scope = scope;
  gv.pos.clear();                 // a different scope is a different picture
  gvSaveSettings();
  gvPaintControls();
  renderGvLegend();               // a different scope has different kinds in it
  gv.fitPending = true;
  gvRebuild();
}

// Same shape as setGraphScope: a different mode is a different picture too,
// so the remembered positions go with it.
function setGraphMode(mode) {
  if (!mode || mode === gvSettings.mode) return;
  gvSettings.mode = mode;
  gv.pos.clear();
  gv.loopPin = -1; gv.loopHot = -1;
  gvSaveSettings();
  gvPaintControls();
  gvPaintMode();
  renderGvLegend();
  gv.fitPending = true;
  gvRebuild();
}

function gvToggleSettings() {
  const el = document.getElementById('gv-settings');
  if (el) el.classList.toggle('hidden');
}
function gvResetForces() {
  ['centerForce', 'repelForce', 'linkForce', 'linkDistance'].forEach(k => { gvSettings[k] = GV_DEFAULTS[k]; });
  gvPaintControls();
  gvSaveSettings();
  gvKick(0.8);
}

/* Groups: a word and a colour. Every node whose name, path or tag contains
   the word takes that colour — Obsidian's "Groups" section, minus its
   search operators, which this app has no search syntax for. */
function renderGvGroups() {
  const box = document.getElementById('gv-groups');
  if (!box) return;
  box.textContent = '';
  gvSettings.groups.forEach((g, i) => {
    const row = document.createElement('div');
    row.className = 'gv-group';

    const q = document.createElement('input');
    q.type = 'text';
    q.value = g.query || '';
    q.placeholder = t('gvGroupPlaceholder');
    q.addEventListener('input', () => { g.query = q.value; gvSaveSettings(); gvDraw(); });

    const c = document.createElement('input');
    c.type = 'color';
    c.value = g.color || GRAPH_COLORS.accent;
    c.addEventListener('input', () => { g.color = c.value; gvSaveSettings(); gvDraw(); });

    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'gv-x';
    x.textContent = '✕';
    x.title = t('gvRemoveGroup');
    x.setAttribute('aria-label', t('gvRemoveGroup'));
    x.addEventListener('click', () => {
      gvSettings.groups.splice(i, 1);
      gvSaveSettings();
      renderGvGroups();
      gvDraw();
    });

    row.appendChild(q); row.appendChild(c); row.appendChild(x);
    box.appendChild(row);
  });
}
function gvAddGroup() {
  const swatches = ['#C4643C', '#6E9E8A', '#D3CD7C', '#9FB3A5', '#B4785A'];
  gvSettings.groups.push({ query: '', color: swatches[gvSettings.groups.length % swatches.length] });
  gvSaveSettings();
  renderGvGroups();
}

/* The feedback loops the diagram found, shortest first. Resting on a row
   lights that loop on the canvas; clicking pins it, so you can let go of
   the mouse and still read the circle. */
function renderGvLoops() {
  const box = document.getElementById('gv-loops');
  if (!box) return;
  box.textContent = '';
  if (gvSettings.mode !== 'cause') return;
  if (!gv.loops.length) {
    const hint = document.createElement('div');
    hint.className = 'gv-hint';
    hint.textContent = t('gvLoopNone');
    box.appendChild(hint);
    return;
  }
  gv.loops.forEach((loop, i) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'gv-loop ' + (loop.sign > 0 ? 'gv-loop-r' : 'gv-loop-b');
    row.classList.toggle('on', gv.loopPin === i);
    row.title = loop.sign > 0 ? t('gvLoopR') : t('gvLoopB');

    const badge = document.createElement('span');
    badge.className = 'gv-badge';
    badge.textContent = (loop.sign > 0 ? 'R' : 'B') + (i + 1);
    const text = document.createElement('span');
    text.textContent = gvLoopText(loop);
    row.appendChild(badge);
    row.appendChild(text);

    row.addEventListener('mouseenter', () => { gv.loopHot = i; gvDraw(); });
    row.addEventListener('mouseleave', () => { gv.loopHot = -1; gvDraw(); });
    row.addEventListener('click', () => {
      gv.loopPin = gv.loopPin === i ? -1 : i;
      renderGvLoops();
      gvDraw();
    });
    box.appendChild(row);
  });
}
// "stres → insomnie ⊣ odihnă → stres" — the circle written out, closing on
// the word it started from so it reads as a circle rather than a list.
function gvLoopText(loop) {
  const parts = [];
  loop.nodes.forEach((n, i) => { parts.push(n.label, gvCauseGlyph(loop.links[i])); });
  parts.push(loop.nodes[0].label);
  return parts.join(' ');
}

function renderGvLegend() {
  const box = document.getElementById('gv-legend');
  if (!box) return;
  box.textContent = '';
  const kinds = gvSettings.mode === 'cause'
    ? ['keyword', 'causePos', 'causeNeg', 'loopR', 'loopB']
    : gvSettings.scope === 'note'
      ? ['note', 'heading', 'block', 'tag', 'unresolved']
      : ['note', 'active', 'tag', 'unresolved'];
  kinds.forEach(k => {
    const span = document.createElement('span');
    const dot = document.createElement('span');
    dot.className = 'gv-dot';
    dot.style.background = GRAPH_COLORS[k];
    span.appendChild(dot);
    span.appendChild(document.createTextNode(t('gvLegend_' + k)));
    box.appendChild(span);
  });
}

/* ── Opening and closing ──────────────────────────────────────────── */
function gvLoop() {
  if (!gv.open) return;
  if (gv.alpha > 0) { gvStep(); gvDraw(); }
  gv.raf = requestAnimationFrame(gvLoop);
}

function openGraph(scope) {
  const view = document.getElementById('graph-view');
  if (!view) return;
  if (scope) gvSettings.scope = scope;
  // A note scope with nothing open has nothing to draw; fall back the way
  // Obsidian falls back to the global graph.
  if (gvSettings.scope === 'workbook' && !gvCurrentBookId()) gvSettings.scope = 'vault';

  gv.open = true;
  view.classList.add('open');
  if (!gv.booted) {
    gv.canvas = document.getElementById('graph-canvas');
    gv.ctx = gv.canvas.getContext('2d');
    gvBindStage();
    gvBindControls();
    if (window.ResizeObserver) new ResizeObserver(gvResize).observe(document.getElementById('gv-stage'));
    else window.addEventListener('resize', gvResize);
    gv.booted = true;
  }
  gvPaintControls();
  gvPaintMode();
  renderGvLegend();
  // On a phone the palette is a bottom sheet over the canvas, so it starts
  // closed and the ⚙ button brings it up — the same call the side panels
  // make in applyResponsiveDefaults(). On a desktop it sits beside the graph.
  document.getElementById('gv-settings').classList.toggle('hidden', isSmallScreen());
  gvResize();
  gv.fitPending = true;
  gvRebuild();
  cancelAnimationFrame(gv.raf);
  gv.raf = requestAnimationFrame(gvLoop);
}

function closeGraph() {
  const view = document.getElementById('graph-view');
  if (view) view.classList.remove('open');
  gv.open = false;
  cancelAnimationFrame(gv.raf);
  gv.raf = 0;
  gvTip(null);
}
function toggleGraph() {
  if (gv.open) closeGraph();
  else openGraph();
}
function openGraphForTag(tag) {
  gvSettings.search = tag ? '#' + tag : '';
  // A tag is a link-mode notion; opening the causality diagram on it would
  // answer a question nobody asked.
  if (gvSettings.mode !== 'links') { gvSettings.mode = 'links'; gv.pos.clear(); }
  openGraph(wbCurrentId ? 'workbook' : 'note');
}

/* The graph reads the open note, so it follows the editor — debounced,
   because rebuilding on every keystroke would scan every chapter. */
function gvRefresh() {
  if (!gv.open) return;
  clearTimeout(gv.refreshTimer);
  gv.refreshTimer = setTimeout(() => {
    renderGvLegend();
    gvRebuild();
  }, 450);
}

// The legend, the group rows and the node/link count are generated, so
// data-i cannot reach them; applyUILang() calls this instead. The graph
// overlay is a permanently-visible surface while it is open, the same
// reason renderWorkbooks() gets called from there — docs/I18N.md.
function gvRepaintLang() {
  if (!gv.open) return;
  renderGvLegend();
  renderGvGroups();
  renderGvLoops();
  gvPaintStats();
  gvPaintEmpty();
}

gvLoadSettings().then(() => { if (gv.open) gvPaintControls(); });
gvLangReady = true;


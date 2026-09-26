/* Diagrams — ```flow (flowcharts, box-and-arrow) and ```mindmap blocks.
   The text in the fence is the diagram: parsed here, drawn as inline SVG in
   the preview and the HTML export, and edited in a full-screen modal that
   writes the block back. No library — docs/FEATURES.md § U. */

const DG_NODE_RE = /^\s*([A-Za-z0-9_-]+)\s*:\s*(rect|round|pill|ellipse|diamond|para|text)?\s*(?:(-?\d+)\s*,\s*(-?\d+))?\s*(?:(\d+)\s*x\s*(\d+))?\s*(#[0-9a-fA-F]{6})?\s*(?:\|\s?(.*))?$/;
const DG_EDGE_RE = /^\s*([A-Za-z0-9_-]+)\s*(<->|-->|->|--)\s*([A-Za-z0-9_-]+)\s*(#[0-9a-fA-F]{6})?\s*(?:\|\s?(.*))?$/;
// Document data (written into the markdown), not chrome: literal hex.
const DG_COLORS = ['#C1BB45','#6E9E8A','#C4643C','#D9A441','#7A9CC6','#9FB3A5'];
const DG_DEFAULT = '#C1BB45';
const DG_SIZES = { rect:[160,60], round:[160,60], pill:[160,60], para:[160,60], diamond:[160,90], ellipse:[140,70], text:[140,30] };
const DG_SHAPES = ['rect','round','pill','ellipse','diamond','para','text'];
const DG_FAMILY = "'Trebuchet MS', sans-serif";
const DG_FONT = '14px ' + DG_FAMILY;
const DG_HEAD = 10;
const dgEl = id => document.getElementById(id);
const dgF = v => Math.round(v * 10) / 10;

function dgEsc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function dgUnescape(s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
function dgDecode(s) { return String(s || '').replace(/\\(\\|n)/g, (_, c) => c === 'n' ? '\n' : '\\'); }
function dgEncode(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n'); }

/* ── The text formats (§ U) ── */
function dgParseFlow(text) {
  const model = { nodes: [], edges: [], extra: [] };
  const byId = new Map();
  const edgeLines = [];
  String(text || '').split('\n').forEach(raw => {
    if (!raw.trim()) return;
    let m = raw.match(DG_EDGE_RE);
    if (m) { edgeLines.push(m); model.edges.push({ from: m[1], op: m[2], to: m[3], color: m[4] || null, label: dgDecode(m[5]) }); return; }
    m = raw.match(DG_NODE_RE);
    if (m) {
      const shape = m[2] || 'rect';
      const n = { id: m[1], shape, x: m[3] != null ? +m[3] : null, y: m[4] != null ? +m[4] : null,
        w: m[5] != null ? +m[5] : DG_SIZES[shape][0], h: m[6] != null ? +m[6] : DG_SIZES[shape][1],
        color: m[7] || null, label: dgDecode(m[8]) };
      if (byId.has(n.id)) model.nodes[model.nodes.indexOf(byId.get(n.id))] = n;
      else model.nodes.push(n);
      byId.set(n.id, n);
      return;
    }
    model.extra.push(raw);
  });
  model.edges.forEach(e => [e.from, e.to].forEach(id => {
    if (byId.has(id)) return;
    const n = { id, shape: 'rect', x: null, y: null, w: 160, h: 60, color: null, label: id };
    model.nodes.push(n); byId.set(id, n);
  }));
  let k = 0;
  model.nodes.forEach(n => {
    if (n.x !== null && n.y !== null) return;
    n.x = 40 + (k % 4) * 200; n.y = 40 + Math.floor(k / 4) * 130; k++;
  });
  return model;
}

function dgSerializeFlow(model) {
  const out = [];
  model.nodes.forEach(n => {
    let s = `${n.id}: ${n.shape} ${Math.round(n.x)},${Math.round(n.y)} ${Math.round(n.w)}x${Math.round(n.h)}`;
    if (n.color && n.color.toUpperCase() !== DG_DEFAULT) s += ' ' + n.color.toUpperCase();
    out.push(s + ' | ' + dgEncode(n.label));
  });
  model.edges.forEach(e => {
    let s = `${e.from} ${e.op} ${e.to}`;
    if (e.color) s += ' ' + e.color.toUpperCase();
    if (e.label) s += ' | ' + dgEncode(e.label);
    out.push(s);
  });
  (model.extra || []).forEach(l => out.push(l));
  return out.join('\n');
}

function dgParseMindmap(text) {
  let root = null;
  const stack = [];
  String(text || '').split('\n').forEach(raw => {
    if (!raw.trim()) return;
    const lead = raw.match(/^[ \t]*/)[0];
    const indent = lead.replace(/\t/g, '  ').length;
    const node = { label: raw.slice(lead.length).replace(/^[-*+] /, '').trim(), children: [] };
    if (!root) { root = node; return; }
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    (stack.length ? stack[stack.length - 1].node : root).children.push(node);
    stack.push({ indent, node });
  });
  return { root };
}

function dgSerializeMindmap(model) {
  const out = [];
  (function walk(n, depth) {
    out.push('  '.repeat(depth) + n.label);
    n.children.forEach(c => walk(c, depth + 1));
  })(model.root || { label: '', children: [] }, 0);
  return model.root ? out.join('\n') : '';
}

/* ── Measuring and wrapping text (one cached canvas) ── */
let dgCtx = null;
function dgMeasure(text, font) {
  if (!dgCtx) dgCtx = document.createElement('canvas').getContext('2d');
  dgCtx.font = font;
  return dgCtx.measureText(text).width;
}
function dgWrap(label, maxW, font) {
  const lines = [];
  String(label).split('\n').forEach(part => {
    const words = part.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); return; }
    let cur = words[0];
    for (let i = 1; i < words.length; i++) {
      const next = cur + ' ' + words[i];
      if (dgMeasure(next, font) <= maxW) cur = next; else { lines.push(cur); cur = words[i]; }
    }
    lines.push(cur);
  });
  return lines;
}
function dgText(lines, cx, cy, lh, size, weight, cls) {
  const y0 = cy - (lines.length - 1) * lh / 2;
  const spans = lines.map((l, i) => `<tspan x="${dgF(cx)}" dy="${i ? lh : '0.35em'}">${dgEsc(l)}</tspan>`).join('');
  return `<text class="${cls}" x="${dgF(cx)}" y="${dgF(y0)}" text-anchor="middle" font-size="${size}"${weight ? ` font-weight="${weight}"` : ''} font-family="${DG_FAMILY}">${spans}</text>`;
}
function dgBounds() {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  b.add = (x, y, w, h) => { b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x + w); b.y1 = Math.max(b.y1, y + h); };
  b.box = pad => b.x0 === Infinity ? null : { x: b.x0 - pad, y: b.y0 - pad, w: b.x1 - b.x0 + 2 * pad, h: b.y1 - b.y0 + 2 * pad };
  return b;
}

/* ── Flow: geometry and drawing ── */
// Where the ray from a node's centre along (dx,dy) leaves its outline, as a
// fraction of (dx,dy).
function dgClipT(n, dx, dy) {
  const hw = n.w / 2, hh = n.h / 2, ax = Math.abs(dx), ay = Math.abs(dy);
  if (n.shape === 'ellipse') return 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
  if (n.shape === 'diamond') return 1 / (ax / hw + ay / hh);
  return Math.min(ax ? hw / ax : Infinity, ay ? hh / ay : Infinity);
}
function dgEdgeGeom(e, byId) {
  if (e.from === e.to) return null;
  const a = byId.get(e.from), b = byId.get(e.to);
  if (!a || !b) return null;
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
  const dx = bx - ax, dy = by - ay;
  if (!dx && !dy) return null;
  const ta = dgClipT(a, dx, dy), tb = dgClipT(b, -dx, -dy);
  if ((1 - ta - tb) * Math.hypot(dx, dy) < 4) return null;
  const x1 = ax + ta * dx, y1 = ay + ta * dy, x2 = bx - tb * dx, y2 = by - tb * dy;
  return { x1, y1, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
}
// The arrowhead of editor.html's drawArrow(): tip, back point, wings at ±0.55·head.
function dgHead(xt, yt, xf, yf) {
  const ang = Math.atan2(yt - yf, xt - xf);
  const bx = xt - DG_HEAD * Math.cos(ang), by = yt - DG_HEAD * Math.sin(ang);
  const px = DG_HEAD * 0.55 * Math.cos(ang + Math.PI / 2), py = DG_HEAD * 0.55 * Math.sin(ang + Math.PI / 2);
  return { bx, by, d: `M${dgF(xt)} ${dgF(yt)}L${dgF(bx + px)} ${dgF(by + py)}L${dgF(bx - px)} ${dgF(by - py)}Z` };
}
function dgShapeSvg(n, color) {
  const paint = `fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="2"`;
  const { x, y, w, h } = n, cx = x + w / 2, cy = y + h / 2;
  const rect = rx => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ${paint}/>`;
  switch (n.shape) {
    case 'round': return rect(12);
    case 'pill': return rect(dgF(h / 2));
    case 'ellipse': return `<ellipse cx="${dgF(cx)}" cy="${dgF(cy)}" rx="${dgF(w / 2)}" ry="${dgF(h / 2)}" ${paint}/>`;
    case 'diamond': return `<polygon points="${dgF(cx)},${y} ${x + w},${dgF(cy)} ${dgF(cx)},${y + h} ${x},${dgF(cy)}" ${paint}/>`;
    case 'para': { const s = dgF(0.2 * h); return `<polygon points="${x + s},${y} ${x + w},${y} ${x + w - s},${y + h} ${x},${y + h}" ${paint}/>`; }
    case 'text': return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="transparent"/>`;
    default: return rect(2);
  }
}
function dgOutline(x, y, w, h) {
  return `<rect class="dg-outline" x="${dgF(x - 4)}" y="${dgF(y - 4)}" width="${dgF(w + 8)}" height="${dgF(h + 8)}"/>`;
}

// → { svg: inner markup, box: padded bounds | null }. `sel` only in the modal.
function dgFlowSvg(model, sel) {
  const byId = new Map(model.nodes.map(n => [n.id, n]));
  const b = dgBounds();
  const parts = [], over = [];
  model.edges.forEach((e, i) => {
    const g = dgEdgeGeom(e, byId);
    if (!g) return;
    let { x1, y1, x2, y2 } = g;
    const heads = [];
    const colorAttr = e.color ? ` fill="${e.color}"` : '';
    if (e.op === '->' || e.op === '-->' || e.op === '<->') { const h = dgHead(x2, y2, x1, y1); heads.push(h.d); x2 = h.bx; y2 = h.by; }
    if (e.op === '<->') { const h = dgHead(g.x1, g.y1, g.x2, g.y2); heads.push(h.d); x1 = h.bx; y1 = h.by; }
    const isSel = sel && sel.type === 'edge' && sel.i === i;
    let s = `<g class="dg-edge${isSel ? ' dg-selected' : ''}" data-i="${i}">`;
    s += `<path class="dg-edge-hit" d="M${dgF(g.x1)} ${dgF(g.y1)}L${dgF(g.x2)} ${dgF(g.y2)}" stroke="transparent" stroke-width="12" fill="none"/>`;
    s += `<path class="dg-edge-line" d="M${dgF(x1)} ${dgF(y1)}L${dgF(x2)} ${dgF(y2)}" fill="none" stroke-width="2"${e.color ? ` stroke="${e.color}"` : ''}${e.op === '-->' ? ' stroke-dasharray="6 4"' : ''}/>`;
    heads.forEach(d => { s += `<path class="dg-edge-head" d="${d}"${colorAttr}/>`; });
    if (e.label) {
      const text = e.label.replace(/\n/g, ' ');
      const w = dgMeasure(text, '13px ' + DG_FAMILY) + 8;
      s += `<rect class="dg-edge-label-bg" x="${dgF(g.mx - w / 2)}" y="${dgF(g.my - 10)}" width="${dgF(w)}" height="20" rx="4"/>`;
      s += dgText([text], g.mx, g.my, 16, 13, '', 'dg-edge-label');
      b.add(g.mx - w / 2, g.my - 10, w, 20);
    }
    parts.push(s + '</g>');
    if (isSel) over.push(dgOutline(Math.min(g.x1, g.x2), Math.min(g.y1, g.y2), Math.abs(g.x2 - g.x1), Math.abs(g.y2 - g.y1)));
  });
  model.nodes.forEach(n => {
    const color = n.color || DG_DEFAULT;
    const isSel = sel && sel.type === 'node' && sel.id === n.id;
    const lines = dgWrap(n.label, n.w - 16, DG_FONT);
    let s = `<g class="dg-node${isSel ? ' dg-selected' : ''}" data-id="${dgEsc(n.id)}">` + dgShapeSvg(n, color) +
      dgText(lines, n.x + n.w / 2, n.y + n.h / 2, 18, 14, '', 'dg-label') + '</g>';
    parts.push(s);
    b.add(n.x, n.y, n.w, n.h);
    if (isSel) {
      over.push(dgOutline(n.x, n.y, n.w, n.h));
      const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
      [[cx, n.y], [n.x + n.w, cy], [cx, n.y + n.h], [n.x, cy]].forEach(([px, py]) =>
        over.push(`<circle class="dg-port" cx="${dgF(px)}" cy="${dgF(py)}" r="5"/>`));
      over.push(`<rect class="dg-resize" x="${n.x + n.w - 5}" y="${n.y + n.h - 5}" width="10" height="10"/>`);
    }
  });
  return { svg: parts.join('') + over.join(''), box: b.box(20) };
}

/* ── Mind map: automatic layout and drawing ── */
function dgLayoutMindmap(root) {
  if (!root) return null;
  const all = [];
  function make(node, depth, path, side, color, parent) {
    const font = depth === 0 ? '700 16px ' + DG_FAMILY : depth === 1 ? '600 14px ' + DG_FAMILY : DG_FONT;
    const lines = dgWrap(node.label, 220, font);
    const tw = Math.max(0, ...lines.map(l => dgMeasure(l, font)));
    const L = { node, depth, path, side, color, parent, font, lines,
      w: tw + (depth === 0 ? 32 : 24), h: (depth === 0 ? 44 : 34) + 18 * (lines.length - 1), x: 0, y: 0, kids: [] };
    all.push(L);
    return L;
  }
  const R = make(root, 0, '', 0, DG_DEFAULT, null);
  const n = root.children.length, nRight = Math.ceil(n / 2);
  (function build(L) {
    L.node.children.forEach((c, i) => {
      const side = L.depth === 0 ? (i < nRight ? 1 : -1) : L.side;
      const color = L.depth === 0 ? DG_COLORS[(i + 1) % 6] : L.color;
      const K = make(c, L.depth + 1, L.path === '' ? String(i) : L.path + '.' + i, side, color, L);
      L.kids.push(K);
      build(K);
    });
  })(R);
  const ext = L => L.ext !== undefined ? L.ext :
    (L.ext = Math.max(L.h, L.kids.reduce((s, k) => s + ext(k), 0) + 12 * (L.kids.length - 1)));
  function place(L, kids, cy) {
    const total = kids.reduce((s, k) => s + ext(k), 0) + 12 * (kids.length - 1);
    let top = cy - total / 2;
    kids.forEach(K => {
      const kcy = top + ext(K) / 2;
      K.y = kcy - K.h / 2;
      K.x = K.side > 0 ? L.x + L.w + 56 : L.x - 56 - K.w;
      place(K, K.kids, kcy);
      top += ext(K) + 12;
    });
  }
  R.x = -R.w / 2; R.y = -R.h / 2;
  place(R, R.kids.filter(k => k.side > 0), 0);
  place(R, R.kids.filter(k => k.side < 0), 0);
  const byPath = new Map(all.map(L => [L.path, L]));
  return { root: R, all, byPath };
}

function dgMindmapSvg(model, selPath) {
  const lay = dgLayoutMindmap(model.root);
  if (!lay) return { svg: '', box: null, lay: null };
  const b = dgBounds(), edges = [], nodes = [], over = [];
  lay.all.forEach(L => {
    b.add(L.x, L.y, L.w, L.h);
    const cy = L.y + L.h / 2;
    if (L.parent) {
      const P = L.parent, pcy = P.y + P.h / 2;
      const x1 = L.side > 0 ? P.x + P.w : P.x, x2 = L.side > 0 ? L.x : L.x + L.w, mx = (x1 + x2) / 2;
      edges.push(`<path class="dg-mm-edge" fill="none" stroke="${L.color}" stroke-width="${P.depth === 0 ? 3 : 2}" d="M${dgF(x1)} ${dgF(pcy)} C${dgF(mx)} ${dgF(pcy)}, ${dgF(mx)} ${dgF(cy)}, ${dgF(x2)} ${dgF(cy)}"/>`);
    }
    const [rx, op, sw] = L.depth === 0 ? [dgF(L.h / 2), 0.35, 2] : L.depth === 1 ? [8, 0.22, 2] : [8, 0.08, 1.5];
    const isSel = selPath === L.path;
    nodes.push(`<g class="dg-mm-node${isSel ? ' dg-selected' : ''}" data-path="${L.path}">` +
      `<rect x="${dgF(L.x)}" y="${dgF(L.y)}" width="${dgF(L.w)}" height="${dgF(L.h)}" rx="${rx}" fill="${L.color}" fill-opacity="${op}" stroke="${L.color}" stroke-width="${sw}"/>` +
      dgText(L.lines, L.x + L.w / 2, cy, L.depth === 0 ? 20 : 18, L.depth === 0 ? 16 : 14, L.depth === 0 ? 700 : L.depth === 1 ? 600 : '', 'dg-label') + '</g>');
    if (isSel) over.push(dgOutline(L.x, L.y, L.w, L.h));
  });
  return { svg: edges.join('') + nodes.join('') + over.join(''), box: b.box(24), lay };
}

/* ── Preview and export (called from parseMarkdown) ── */
function renderDiagramBlock(lines, kind, lineIdx, opts) {
  const forExport = !!(opts && opts.forExport);
  const text = lines.map(dgUnescape).join('\n');
  const isMm = kind === 'mindmap';
  const model = isMm ? dgParseMindmap(text) : dgParseFlow(text);
  const r = isMm ? dgMindmapSvg(model) : dgFlowSvg(model);
  const aria = t(isMm ? 'dgKindMindmap' : 'dgKindFlow');
  let html = `<figure class="md-diagram md-diagram-${kind}"${forExport ? '' : ` data-line="${lineIdx}"`}>`;
  html += r.box
    ? `<svg class="dg-svg" xmlns="http://www.w3.org/2000/svg" viewBox="${dgF(r.box.x)} ${dgF(r.box.y)} ${dgF(r.box.w)} ${dgF(r.box.h)}" width="${Math.ceil(r.box.w)}" height="${Math.ceil(r.box.h)}" role="img" aria-label="${dgEsc(aria)}">${r.svg}</svg>`
    : `<p class="dg-empty">${dgEsc(t('dgEmpty'))}</p>`;
  if (!forExport) {
    html += `<button type="button" class="dg-edit" data-i="dgEdit" data-i-title="dgEditTip" title="${dgEsc(t('dgEditTip'))}">${dgEsc(t('dgEdit'))}</button>`;
    if (!isMm && model.extra.length) html += `<p class="dg-warn">${dgEsc(t('dgIgnored', model.extra.length))}</p>`;
  }
  return html + '</figure>';
}

/* ── The modal ── */
const dg = {
  open: false, mode: 'new', kind: 'flow', flow: null, mm: null, sel: null, tool: 'select',
  zoom: 1, panX: 0, panY: 0, dirty: false, color: DG_DEFAULT,
  caret: [0, 0], edit: null, drag: null, pinch: null, pointers: new Map(),
  label: null, box: null, lay: null, srcTimer: 0, srcLast: 0
};
let dgUndo = [], dgRedo = [];

function dgIsOpen() { return dg.open; }
function dgCanon() { return dg.kind === 'flow' ? dgSerializeFlow(dg.flow) : dgSerializeMindmap(dg.mm); }
function dgSeed(kind) {
  if (kind === 'mindmap') return [t('dgSeedRoot'), '  ' + t('dgSeedBranch', 1), '  ' + t('dgSeedBranch', 2), '  ' + t('dgSeedBranch', 3)].join('\n');
  return [
    'start: pill 40,40 160x60 | ' + t('dgSeedStart'),
    'step: rect 40,150 160x60 | ' + t('dgSeedStep'),
    'ask: diamond 40,260 160x90 | ' + t('dgSeedAsk'),
    'fix: rect 280,275 160x60 #C4643C | ' + t('dgSeedFix'),
    'end: pill 40,400 160x60 | ' + t('dgSeedEnd'),
    'start -> step', 'step -> ask',
    'ask -> end | ' + t('dgSeedYes'), 'ask -> fix | ' + t('dgSeedNo'),
    'fix --> step'
  ].join('\n');
}
function dgLoad(kind, text) {
  dg.kind = kind;
  if (kind === 'flow') { dg.flow = dgParseFlow(text); dg.mm = null; }
  else { dg.mm = dgParseMindmap(text); dg.flow = null; }
}

// The ```flow / ```mindmap block around editor line `line` (or containing it),
// tracked the same way parseMarkdown does.
function dgBlockAt(text, line, mustOpenAt) {
  const lines = text.split('\n');
  let open = -1, kind = '';
  for (let i = 0; i < lines.length; i++) {
    if (!/^```/.test(lines[i])) continue;
    if (open < 0) { open = i; kind = lines[i].slice(3).trim().toLowerCase(); continue; }
    if ((kind === 'flow' || kind === 'mindmap') && (mustOpenAt ? open === line : line >= open && line <= i))
      return { open, close: i, kind, body: lines.slice(open + 1, i).join('\n'), block: lines.slice(open, i + 1).join('\n') };
    open = -1;
  }
  if (open >= 0 && (kind === 'flow' || kind === 'mindmap') && (mustOpenAt ? open === line : line >= open))
    return { open, close: -1, kind, body: lines.slice(open + 1).join('\n'), block: lines.slice(open).join('\n') };
  return null;
}

function openDiagram(opts) {
  if (dg.open) return;
  dg.caret = [editor.selectionStart, editor.selectionEnd];
  let blk = null;
  if (opts && Number.isInteger(opts.line)) blk = dgBlockAt(editor.value, opts.line, true);
  else if (!opts) blk = dgBlockAt(editor.value, editor.value.slice(0, editor.selectionStart).split('\n').length - 1, false);
  if (blk) { dg.mode = 'edit'; dg.edit = blk; dgLoad(blk.kind, blk.body); }
  else { dg.mode = 'new'; dg.edit = null; dgLoad('flow', dgSeed('flow')); }
  dg.open = true; dg.dirty = false; dg.tool = 'select'; dg.sel = null; dg.label = null; dg.drag = null; dg.pinch = null;
  dg.pointers.clear();
  dgUndo = []; dgRedo = [];
  if (dg.kind === 'mindmap' && dg.mm.root) dg.sel = { type: 'mm', path: '' };
  dgEl('diagram-modal').hidden = false;
  dgEl('dg-source').hidden = true; dgEl('dg-source-btn').setAttribute('aria-pressed', 'false');
  dgEl('dg-label-input').hidden = true;
  dgEl('dg-title').setAttribute('data-i', dg.mode === 'new' ? 'dgTitleNew' : 'dgTitleEdit');
  dgEl('dg-apply').setAttribute('data-i', dg.mode === 'new' ? 'dgInsert' : 'dgUpdate');
  dgChrome(); dgRender(); dgFit();
  dgEl('dg-stage').focus();
}

function closeDiagram(force) {
  if (!dg.open) return true;
  if (!force && dg.dirty && !confirm(t('dgDiscardAsk'))) return false;
  dgLabelEnd(false);
  dg.open = false; dg.drag = null; dg.pinch = null; dg.pointers.clear();
  clearTimeout(dg.srcTimer);
  dgEl('diagram-modal').hidden = true;
  editor.focus();
  return true;
}

function dgApply() {
  if (!dg.open) return;
  dgLabelEnd(true);
  const block = '```' + dg.kind + '\n' + dgCanon() + '\n```';
  const val = editor.value;
  let start = -1, end = -1;
  if (dg.mode === 'edit') {
    const e = dg.edit, lines = val.split('\n');
    const now = /^```\s*(flow|mindmap)\s*$/i.test(lines[e.open] || '') ? dgBlockAt(val, e.open, true) : null;
    if (now && now.body === e.body && (now.close < 0) === (e.close < 0)) {
      start = lines.slice(0, e.open).join('\n').length + (e.open ? 1 : 0);
      end = now.close < 0 ? val.length : start + now.block.length;
    } else {
      const at = val.indexOf(e.block);
      if (at >= 0) { start = at; end = at + e.block.length; }
    }
  }
  let text = block;
  if (start < 0) {
    [start, end] = dg.caret;
    if (start > 0 && val[start - 1] !== '\n') text = '\n' + text;
    if (end >= val.length || val[end] !== '\n') text += '\n';
    if (dg.mode === 'edit' && window.ScuLaFolder) ScuLaFolder.toast(t('dgMovedInserted'));
  }
  editor.focus();
  editor.setRangeText(text, start, end, 'end');
  // The caret sits right after the closing fence, not after an added newline.
  const after = start + text.length - (text.endsWith('\n') && !block.endsWith('\n') ? 1 : 0);
  editor.setSelectionRange(after, after);
  updatePreview(); updateStatus(); scheduleAutosave();
  closeDiagram(true);
}

/* Modal undo: the canonical text before each committed change. */
function dgPush(before) {
  dgUndo.push(before === undefined ? dgCanon() : before);
  if (dgUndo.length > 100) dgUndo.shift();
  dgRedo = [];
  dg.dirty = true;
}
function dgRestore(from, to) {
  if (!from.length) return;
  dgLabelEnd(false);
  to.push(dgCanon());
  const sel = dg.sel;
  dgLoad(dg.kind, from.pop());
  dg.sel = dgSelValid(sel) ? sel : null;
  dg.dirty = true;
  dgRender();
}
function dgSelValid(sel) {
  if (!sel) return false;
  if (sel.type === 'node') return dg.flow && dg.flow.nodes.some(n => n.id === sel.id);
  if (sel.type === 'edge') return dg.flow && sel.i < dg.flow.edges.length;
  if (sel.type === 'mm') return !!(dg.mm && dgMmGet(sel.path));
  return false;
}

/* The chrome: kind switch, tool state, which controls this kind shows. */
function dgPaint() {
  const m = dgEl('diagram-modal');
  m.querySelectorAll('[data-i]').forEach(el => { el.textContent = t(el.getAttribute('data-i')); });
  m.querySelectorAll('[data-i-title]').forEach(el => { el.title = t(el.getAttribute('data-i-title')); });
  m.querySelectorAll('[data-i-aria]').forEach(el => { el.setAttribute('aria-label', t(el.getAttribute('data-i-aria'))); });
}
function dgChrome() {
  const flow = dg.kind === 'flow';
  dgPaint();
  document.querySelectorAll('#dg-kind [data-kind]').forEach(b => {
    b.classList.toggle('active', b.dataset.kind === dg.kind);
    b.disabled = dg.mode === 'edit';
  });
  document.querySelectorAll('#dg-tools [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === dg.tool));
  document.querySelectorAll('#dg-colors [data-color]').forEach(b => b.classList.toggle('active', b.dataset.color === dg.color));
  dgEl('dg-tools').hidden = !flow;
  dgEl('dg-colors').hidden = !flow;
  dgEl('dg-mm-tools').hidden = flow;
  dgEl('dg-stage').classList.toggle('dg-placing', flow && DG_SHAPES.includes(dg.tool));
}
function dgState() {
  const sel = dg.sel;
  const ek = dgEl('dg-edge-kind');
  ek.hidden = !(sel && sel.type === 'edge');
  if (!ek.hidden) ek.value = dg.flow.edges[sel.i].op;
  dgEl('dg-delete').disabled = !sel || (sel.type === 'mm' && sel.path === '');
  dgEl('dg-undo').disabled = !dgUndo.length;
  dgEl('dg-redo').disabled = !dgRedo.length;
  const src = dgEl('dg-source');
  if (!src.hidden && document.activeElement !== src) src.value = dgCanon();
}

function dgRender() {
  const r = dg.kind === 'flow' ? dgFlowSvg(dg.flow, dg.sel) : dgMindmapSvg(dg.mm, dg.sel && dg.sel.path);
  dg.box = r.box; dg.lay = r.lay || null;
  dgEl('dg-world').innerHTML = r.svg;
  dgView(); dgState();
}
function dgView() {
  const tr = `translate(${dg.panX} ${dg.panY}) scale(${dg.zoom})`;
  dgEl('dg-world').setAttribute('transform', tr);
  dgEl('dg-grid').setAttribute('patternTransform', tr);
  if (dg.label) dgLabelPlace();
}
function dgStageRect() { return dgEl('dg-stage').getBoundingClientRect(); }
function dgToWorld(cx, cy) {
  const r = dgStageRect();
  return { x: (cx - r.left - dg.panX) / dg.zoom, y: (cy - r.top - dg.panY) / dg.zoom };
}
// Port of editor.html setZoomAt: the world point under (cx,cy) stays put.
function dgZoomAt(z, cx, cy) {
  const r = dgStageRect();
  const w = dgToWorld(cx, cy);
  dg.zoom = Math.min(4, Math.max(0.25, z));
  dg.panX = cx - r.left - w.x * dg.zoom;
  dg.panY = cy - r.top - w.y * dg.zoom;
  dgView();
}
function dgZoomCentre(f) { const r = dgStageRect(); dgZoomAt(dg.zoom * f, r.left + r.width / 2, r.top + r.height / 2); }
function dgFit() {
  const r = dgStageRect(), b = dg.box;
  if (!b || !r.width || !r.height) { dg.zoom = 1; dg.panX = r.width / 2; dg.panY = r.height / 2; dgView(); return; }
  dg.zoom = Math.max(0.25, Math.min(1, (r.width - 80) / b.w, (r.height - 80) / b.h));
  dg.panX = r.width / 2 - (b.x + b.w / 2) * dg.zoom;
  dg.panY = r.height / 2 - (b.y + b.h / 2) * dg.zoom;
  dgView();
}

function dgSetKind(kind) {
  if (dg.mode === 'edit' || kind === dg.kind) return;
  if (dg.dirty && !confirm(t('dgDiscardAsk'))) return;
  dgLabelEnd(false);
  dgLoad(kind, dgSeed(kind));
  dg.sel = kind === 'mindmap' ? { type: 'mm', path: '' } : null;
  dg.tool = 'select'; dg.dirty = false; dgUndo = []; dgRedo = [];
  dgChrome(); dgRender(); dgFit();
  dgEl('dg-stage').focus();
}
function dgSetTool(tool) { dg.tool = tool; dgChrome(); }

/* ── Flow edits ── */
function dgNode(id) { return dg.flow.nodes.find(n => n.id === id); }
function dgNewId() { let k = 1; while (dgNode('n' + k)) k++; return 'n' + k; }
const dgSnap = v => Math.round(v / 10) * 10;
function dgPlace(shape, wx, wy) {
  dgPush();
  const [w, h] = DG_SIZES[shape];
  const n = { id: dgNewId(), shape, x: dgSnap(wx - w / 2), y: dgSnap(wy - h / 2), w, h, color: dg.color, label: t('dgNewShape') };
  dg.flow.nodes.push(n);
  dg.sel = { type: 'node', id: n.id };
  dg.tool = 'select'; dgChrome(); dgRender();
  dgLabelStart(true);
}
function dgConnect(from, to) {
  if (!to || from === to) return;
  dgPush();
  dg.flow.edges.push({ from, to, op: '->', color: null, label: '' });
  dg.sel = { type: 'edge', i: dg.flow.edges.length - 1 };
  dgRender();
}
function dgDelete() {
  const sel = dg.sel;
  if (!sel) return;
  if (sel.type === 'node') {
    dgPush();
    dg.flow.nodes = dg.flow.nodes.filter(n => n.id !== sel.id);
    dg.flow.edges = dg.flow.edges.filter(e => e.from !== sel.id && e.to !== sel.id);
    dg.sel = null;
  } else if (sel.type === 'edge') {
    dgPush();
    dg.flow.edges.splice(sel.i, 1);
    dg.sel = null;
  } else if (sel.type === 'mm') {
    if (sel.path === '') return;
    dgPush();
    const parts = sel.path.split('.'), idx = +parts.pop(), parentPath = parts.join('.');
    dgMmGet(parentPath).children.splice(idx, 1);
    dg.sel = { type: 'mm', path: parentPath };
  }
  dgRender();
}
function dgSetColor(c) {
  dg.color = c;
  const sel = dg.sel;
  if (dg.kind === 'flow' && sel && sel.type !== 'mm') {
    const item = sel.type === 'node' ? dgNode(sel.id) : dg.flow.edges[sel.i];
    if (item && (item.color || '').toUpperCase() !== c) { dgPush(); item.color = c; }
  }
  dgChrome(); dgRender();
}

/* ── Mind-map edits ── */
function dgMmGet(path) {
  let n = dg.mm && dg.mm.root;
  if (!n || path === '') return n;
  for (const i of path.split('.')) { n = n && n.children[+i]; }
  return n || null;
}
function dgMmAdd(sibling) {
  if (!dg.mm.root) {
    dgPush(); dg.mm.root = { label: t('dgNewNode'), children: [] };
    dg.sel = { type: 'mm', path: '' }; dgRender(); dgLabelStart(true); return;
  }
  const path = dg.sel && dg.sel.type === 'mm' ? dg.sel.path : '';
  dgPush();
  const node = { label: t('dgNewNode'), children: [] };
  let newPath;
  if (sibling && path !== '') {
    const parts = path.split('.'), idx = +parts.pop(), pp = parts.join('.');
    dgMmGet(pp).children.splice(idx + 1, 0, node);
    newPath = (pp === '' ? '' : pp + '.') + (idx + 1);
  } else {
    const parent = dgMmGet(path);
    parent.children.push(node);
    newPath = (path === '' ? '' : path + '.') + (parent.children.length - 1);
  }
  dg.sel = { type: 'mm', path: newPath };
  dgRender();
  dgLabelStart(true);
}
function dgMmMove(key) {
  const L = dg.lay && dg.sel && dg.lay.byPath.get(dg.sel.path);
  if (!L) return;
  let T = null;
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    if (!L.parent) return;
    const sibs = L.parent.kids, i = sibs.indexOf(L) + (key === 'ArrowUp' ? -1 : 1);
    T = sibs[i] || null;
  } else if (!L.parent) {
    T = L.kids.find(k => k.side === (key === 'ArrowRight' ? 1 : -1)) || null;
  } else {
    const outward = (key === 'ArrowRight') === (L.side > 0);
    T = outward ? L.kids[0] || null : L.parent;
  }
  if (T) { dg.sel = { type: 'mm', path: T.path }; dgRender(); }
}

/* ── Label editing over the stage ── */
function dgLabelTarget() {
  const sel = dg.sel;
  if (!sel) return null;
  if (sel.type === 'node') { const n = dgNode(sel.id); return n && { get: () => n.label, set: v => { n.label = v; }, x: n.x, y: n.y, w: n.w, h: n.h }; }
  if (sel.type === 'edge') {
    const e = dg.flow.edges[sel.i];
    const g = e && dgEdgeGeom(e, new Map(dg.flow.nodes.map(n => [n.id, n])));
    return g && { get: () => e.label, set: v => { e.label = v; }, x: g.mx - 80 / dg.zoom, y: g.my - 14 / dg.zoom, w: 160 / dg.zoom, h: 28 / dg.zoom };
  }
  const L = dg.lay && dg.lay.byPath.get(sel.path);
  return L && { get: () => L.node.label, set: v => { L.node.label = v; }, x: L.x, y: L.y, w: L.w, h: L.h };
}
function dgLabelStart(isNew) {
  dgLabelEnd(true);
  const tg = dgLabelTarget();
  if (!tg) return;
  dg.label = { tg, isNew: !!isNew, undoLen: dgUndo.length, sel: dg.sel };
  const inp = dgEl('dg-label-input');
  inp.value = tg.get();
  inp.hidden = false;
  dgLabelPlace();
  inp.focus(); inp.select();
}
function dgLabelPlace() {
  const tg = dg.label.tg, inp = dgEl('dg-label-input');
  inp.style.left = (dg.panX + tg.x * dg.zoom) + 'px';
  inp.style.top = (dg.panY + tg.y * dg.zoom) + 'px';
  inp.style.width = Math.max(60, tg.w * dg.zoom) + 'px';
  inp.style.height = Math.max(24, tg.h * dg.zoom) + 'px';
  inp.style.fontSize = (14 * dg.zoom) + 'px';
}
// commit=true writes the text; false cancels.
function dgLabelEnd(commit) {
  const L = dg.label;
  if (!L) return;
  dg.label = null;
  const inp = dgEl('dg-label-input');
  const mm = dg.kind === 'mindmap';
  let v = inp.value;
  if (mm) v = v.replace(/\s*\n\s*/g, ' ').trim();
  inp.hidden = true;
  const removeNew = mm && L.isNew && (!commit || !v);
  if (removeNew) {
    // "Tab, Esc" leaves nothing behind: undo the creation outright.
    if (dgUndo.length === L.undoLen && dgUndo.length) { dgLoad('mindmap', dgUndo.pop()); if (!dgUndo.length) dg.dirty = false; }
    const parts = L.sel.path.split('.'); parts.pop();
    dg.sel = dg.mm.root ? { type: 'mm', path: L.sel.path === '' ? '' : parts.join('.') } : null;
  } else if (commit && v !== L.tg.get() && !(mm && !v)) {
    if (!L.isNew) dgPush();
    L.tg.set(v);
    dg.dirty = true;
  }
  if (dg.open) { dgRender(); dgEl('dg-stage').focus(); }
}

/* ── Source text ── */
function dgToggleSource() {
  const src = dgEl('dg-source'), show = src.hidden;
  src.hidden = !show;
  dgEl('dg-source-btn').setAttribute('aria-pressed', String(show));
  if (show) src.value = dgCanon();
}
function dgSourceInput() {
  const now = Date.now();
  if (now - dg.srcLast > 700) dgPush();
  dg.srcLast = now;
  clearTimeout(dg.srcTimer);
  dg.srcTimer = setTimeout(() => {
    const sel = dg.sel;
    dgLoad(dg.kind, dgEl('dg-source').value);
    dg.sel = dgSelValid(sel) ? sel : null;
    dg.dirty = true;
    dgRender();
  }, 150);
}

/* ── Pointers: one map, capture on the stage, a second finger pinches ── */
function dgHit(target) {
  const el = target && target.closest && target.closest('.dg-resize, .dg-port, .dg-node, .dg-edge, .dg-mm-node');
  if (!el) return null;
  if (el.classList.contains('dg-resize')) return { type: 'resize' };
  if (el.classList.contains('dg-port')) return { type: 'port' };
  if (el.classList.contains('dg-node')) return { type: 'node', id: el.dataset.id };
  if (el.classList.contains('dg-edge')) return { type: 'edge', i: +el.dataset.i };
  return { type: 'mm', path: el.dataset.path };
}
function dgRubberStart(id, e) {
  const n = dgNode(id);
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('class', 'dg-rubber');
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2, w = dgToWorld(e.clientX, e.clientY);
  line.setAttribute('x1', cx); line.setAttribute('y1', cy); line.setAttribute('x2', w.x); line.setAttribute('y2', w.y);
  dgEl('dg-world').appendChild(line);
  dg.drag = { type: 'rubber', from: id, line };
}
function dgCancelDrag() {
  const d = dg.drag;
  if (!d) return;
  dg.drag = null;
  if (d.type === 'move' || d.type === 'resize') { Object.assign(d.node, d.start); dgRender(); }
  else if (d.type === 'rubber') d.line.remove();
  else if (d.type === 'pan') { dg.panX = d.px; dg.panY = d.py; dgView(); }
}
function dgPointerDown(e) {
  if (e.target.id === 'dg-label-input' || (e.pointerType === 'mouse' && e.button > 0)) return;
  if (dg.label) dgLabelEnd(true);
  const stage = dgEl('dg-stage');
  stage.focus();
  try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  dg.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (dg.pointers.size === 2) {
    dgCancelDrag();
    const [a, b] = [...dg.pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    dg.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: dg.zoom, world: dgToWorld(mid.x, mid.y) };
    return;
  }
  if (dg.pointers.size > 2 || dg.pinch) return;
  e.preventDefault();
  const hit = dgHit(e.target), sx = e.clientX, sy = e.clientY;
  const pan = () => { dg.drag = { type: 'pan', sx, sy, px: dg.panX, py: dg.panY }; };
  if (dg.kind === 'mindmap') {
    if (hit && hit.type === 'mm') { dg.sel = { type: 'mm', path: hit.path }; dgRender(); }
    else pan();
    return;
  }
  if (DG_SHAPES.includes(dg.tool) && !hit) { const w = dgToWorld(sx, sy); dgPlace(dg.tool, w.x, w.y); return; }
  if (dg.tool === 'connect' && hit && hit.type === 'node') { dgRubberStart(hit.id, e); return; }
  if (hit && hit.type === 'port' && dg.sel && dg.sel.type === 'node') { dgRubberStart(dg.sel.id, e); return; }
  if (hit && hit.type === 'resize' && dg.sel && dg.sel.type === 'node') {
    const n = dgNode(dg.sel.id);
    dg.drag = { type: 'resize', node: n, sx, sy, start: { w: n.w, h: n.h }, before: dgCanon(), moved: false };
    return;
  }
  if (hit && hit.type === 'node') {
    const n = dgNode(hit.id);
    if (!dg.sel || dg.sel.id !== hit.id) { dg.sel = { type: 'node', id: hit.id }; dgRender(); }
    dg.drag = { type: 'move', node: n, sx, sy, start: { x: n.x, y: n.y }, before: dgCanon(), moved: false };
    return;
  }
  if (hit && hit.type === 'edge') { dg.sel = { type: 'edge', i: hit.i }; dgRender(); return; }
  if (dg.sel) { dg.sel = null; dgRender(); }
  pan();
}
function dgPointerMove(e) {
  if (!dg.pointers.has(e.pointerId)) return;
  dg.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (dg.pinch) {
    if (dg.pointers.size < 2) return;
    const [a, b] = [...dg.pointers.values()];
    const r = dgStageRect(), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    dg.zoom = Math.min(4, Math.max(0.25, dg.pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / dg.pinch.dist));
    dg.panX = mx - r.left - dg.pinch.world.x * dg.zoom;
    dg.panY = my - r.top - dg.pinch.world.y * dg.zoom;
    dgView();
    return;
  }
  const d = dg.drag;
  if (!d) return;
  if (d.type === 'pan') { dg.panX = d.px + e.clientX - d.sx; dg.panY = d.py + e.clientY - d.sy; dgView(); return; }
  if (d.type === 'rubber') { const w = dgToWorld(e.clientX, e.clientY); d.line.setAttribute('x2', w.x); d.line.setAttribute('y2', w.y); return; }
  const dx = (e.clientX - d.sx) / dg.zoom, dy = (e.clientY - d.sy) / dg.zoom;
  if (!d.moved && Math.abs(e.clientX - d.sx) < 1 && Math.abs(e.clientY - d.sy) < 1) return;
  d.moved = true;
  if (d.type === 'move') { d.node.x = dgSnap(d.start.x + dx); d.node.y = dgSnap(d.start.y + dy); }
  else { d.node.w = Math.max(40, dgSnap(d.start.w + dx)); d.node.h = Math.max(24, dgSnap(d.start.h + dy)); }
  dgRender();
}
function dgPointerUp(e) {
  if (!dg.pointers.has(e.pointerId)) return;
  dg.pointers.delete(e.pointerId);
  if (dg.pinch) { if (!dg.pointers.size) dg.pinch = null; return; }
  const d = dg.drag;
  dg.drag = null;
  if (!d || e.type === 'pointercancel') { if (d) { dg.drag = d; dgCancelDrag(); } return; }
  if (d.type === 'rubber') {
    d.line.remove();
    const hit = dgHit(document.elementFromPoint(e.clientX, e.clientY));
    if (hit && hit.type === 'node' && hit.id !== d.from) dgConnect(d.from, hit.id);
    return;
  }
  if ((d.type === 'move' || d.type === 'resize') && d.moved) {
    const same = d.type === 'move' ? d.node.x === d.start.x && d.node.y === d.start.y : d.node.w === d.start.w && d.node.h === d.start.h;
    if (!same) { dgPush(d.before); dgState(); }
  }
}
function dgDblClick(e) {
  const hit = dgHit(document.elementFromPoint(e.clientX, e.clientY));
  if (!hit || hit.type === 'resize' || hit.type === 'port') return;
  e.preventDefault();
  dg.sel = hit.type === 'mm' ? { type: 'mm', path: hit.path } : hit.type === 'node' ? { type: 'node', id: hit.id } : { type: 'edge', i: hit.i };
  dgRender();
  dgLabelStart(false);
}

/* ── Keys: everything the modal handles, on the modal ── */
function dgKeyDown(e) {
  const inp = dgEl('dg-label-input');
  if (e.target === inp) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dgLabelEnd(false); }
    else if (e.key === 'Enter' && (!e.shiftKey || dg.kind === 'mindmap')) { e.preventDefault(); dgLabelEnd(true); }
    return;
  }
  if (e.target === dgEl('dg-source')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) dgRestore(dgRedo, dgUndo); else dgRestore(dgUndo, dgRedo); return; }
  if (mod && !e.altKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); dgRestore(dgRedo, dgUndo); return; }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (dg.drag && dg.drag.type === 'rubber') dgCancelDrag();
    else if (dg.kind === 'flow' && dg.tool !== 'select') dgSetTool('select');
    else if (dg.sel && dg.kind === 'flow') { dg.sel = null; dgRender(); }
    else closeDiagram(false);
    return;
  }
  if (e.target !== dgEl('dg-stage') || mod || e.altKey) return;
  const k = e.key, sel = dg.sel;
  let done = true;
  if (k === 'Delete' || k === 'Backspace') dgDelete();
  else if (k === 'F2' || (k === 'Enter' && dg.kind === 'flow')) { if (sel) dgLabelStart(false); }
  else if (dg.kind === 'flow') {
    const tool = { v: 'select', a: 'connect', r: 'rect', d: 'diamond', e: 'ellipse', t: 'text' }[k.toLowerCase()];
    if (tool && !e.shiftKey) dgSetTool(tool); else done = false;
  } else if (k === 'Tab') dgMmAdd(false);
  else if (k === 'Enter') dgMmAdd(true);
  else if (/^Arrow/.test(k)) dgMmMove(k);
  else done = false;
  if (done) e.preventDefault();
}

function dgInit() {
  const modal = dgEl('diagram-modal');
  if (!modal) return;
  const stage = dgEl('dg-stage');
  const back = fn => (...a) => { fn(...a); if (!dg.label) stage.focus(); };
  modal.addEventListener('keydown', dgKeyDown);
  document.querySelectorAll('#dg-kind [data-kind]').forEach(b => b.addEventListener('click', () => dgSetKind(b.dataset.kind)));
  document.querySelectorAll('#dg-tools [data-tool]').forEach(b => b.addEventListener('click', back(() => dgSetTool(b.dataset.tool))));
  document.querySelectorAll('#dg-colors [data-color]').forEach(b => b.addEventListener('click', back(() => dgSetColor(b.dataset.color))));
  dgEl('dg-mm-child').addEventListener('click', () => dgMmAdd(false));
  dgEl('dg-mm-sibling').addEventListener('click', () => dgMmAdd(true));
  dgEl('dg-mm-rename').addEventListener('click', () => dgLabelStart(false));
  dgEl('dg-edge-kind').addEventListener('change', e => {
    const edge = dg.sel && dg.sel.type === 'edge' && dg.flow.edges[dg.sel.i];
    if (edge && edge.op !== e.target.value) { dgPush(); edge.op = e.target.value; dgRender(); }
  });
  dgEl('dg-delete').addEventListener('click', back(dgDelete));
  dgEl('dg-undo').addEventListener('click', back(() => dgRestore(dgUndo, dgRedo)));
  dgEl('dg-redo').addEventListener('click', back(() => dgRestore(dgRedo, dgUndo)));
  dgEl('dg-zoom-in').addEventListener('click', back(() => dgZoomCentre(1.25)));
  dgEl('dg-zoom-out').addEventListener('click', back(() => dgZoomCentre(1 / 1.25)));
  dgEl('dg-fit').addEventListener('click', back(dgFit));
  dgEl('dg-source-btn').addEventListener('click', dgToggleSource);
  dgEl('dg-source').addEventListener('input', dgSourceInput);
  dgEl('dg-cancel').addEventListener('click', () => closeDiagram(false));
  dgEl('dg-apply').addEventListener('click', dgApply);
  dgEl('dg-label-input').addEventListener('blur', () => { if (dg.label) dgLabelEnd(true); });
  stage.addEventListener('pointerdown', dgPointerDown);
  stage.addEventListener('pointermove', dgPointerMove);
  stage.addEventListener('pointerup', dgPointerUp);
  stage.addEventListener('pointercancel', dgPointerUp);
  stage.addEventListener('dblclick', dgDblClick);
  stage.addEventListener('wheel', e => { e.preventDefault(); dgZoomAt(dg.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY); }, { passive: false });
  window.addEventListener('scula-ui-lang', () => { if (dg.open) dgChrome(); });
}
dgInit();

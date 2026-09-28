/* Diagrams — ```flow (flowcharts, box-and-arrow), ```mindmap and ```sequence blocks.
   The text in the fence is the diagram: parsed here, drawn as inline SVG in
   the preview and the HTML export, and edited in a full-screen modal that
   writes the block back. No library — docs/FEATURES.md § U. */

const DG_NODE_RE = /^\s*([A-Za-z0-9_-]+)\s*:\s*(rect|round|pill|ellipse|diamond|para|text)?\s*(?:(-?\d+)\s*,\s*(-?\d+))?\s*(?:(\d+)\s*x\s*(\d+))?\s*(#[0-9a-fA-F]{6})?\s*(?:\|\s?(.*))?$/;
const DG_EDGE_RE = /^\s*([A-Za-z0-9_-]+?)(?:\.(nw|ne|sw|se|n|e|s|w))?\s*(<->|-->|->|--)\s*([A-Za-z0-9_-]+?)(?:\.(nw|ne|sw|se|n|e|s|w))?\s*(#[0-9a-fA-F]{6})?\s*(?:\|\s?(.*))?$/;
const DG_MM_ATTR_RE = /^(.*?)\s+\{((?:\s*(?:-?\d+,-?\d+|#[0-9a-fA-F]{6}|from=(?:nw|ne|sw|se|n|e|s|w)|to=(?:nw|ne|sw|se|n|e|s|w)))+)\s*\}$/;
const DG_SEQ_PART_RE = /^\s*participant\s+([\p{L}\p{N}_-]+)\s*(?:\|\s?(.*))?$/u;
const DG_SEQ_NOTE_RE = /^\s*note\s+([\p{L}\p{N}_-]+)\s*\|\s?(.*)$/u;
const DG_SEQ_MSG_RE = /^\s*([\p{L}\p{N}_-]+?)\s*(-->|->)\s*([\p{L}\p{N}_-]+)\s*(?:\|\s?(.*))?$/u;
const DG_KINDS = ['flow', 'mindmap', 'sequence'];
// The 8 connection dots; the second order breaks ties when an end is automatic.
const DG_PORTS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
const DG_PORT_ORDER = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'];
const DG_DIR = (k => ({ n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0], ne: [k, -k], se: [k, k], sw: [-k, k], nw: [-k, -k] }))(Math.SQRT1_2);
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
    if (m) {
      edgeLines.push(m);
      model.edges.push({ from: m[1], fromPort: m[2] || null, op: m[3], to: m[4], toPort: m[5] || null, color: m[6] || null, label: dgDecode(m[7]) });
      return;
    }
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
    let s = `${e.from}${e.fromPort ? '.' + e.fromPort : ''} ${e.op} ${e.to}${e.toPort ? '.' + e.toPort : ''}`;
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
    const node = dgMmNode(raw.slice(lead.length).replace(/^[-*+] /, '').trim());
    if (!root) { root = node; return; }
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    (stack.length ? stack[stack.length - 1].node : root).children.push(node);
    stack.push({ indent, node });
  });
  return { root };
}
// A node line may end in `{x,y #RRGGBB from=port to=port}`; anything else in
// braces stays part of the label.
function dgMmNode(text) {
  const node = { label: text, children: [], x: null, y: null, color: null, fromPort: null, toPort: null };
  const m = text.match(DG_MM_ATTR_RE);
  if (!m) return node;
  node.label = m[1];
  m[2].trim().split(/\s+/).forEach(tok => {
    let p;
    if (tok[0] === '#') node.color = tok.toUpperCase();
    else if ((p = tok.match(/^(from|to)=(\w+)$/))) node[p[1] + 'Port'] = p[2];
    else { const [x, y] = tok.split(','); node.x = +x; node.y = +y; }
  });
  return node;
}

function dgSerializeMindmap(model) {
  const out = [];
  (function walk(n, depth) {
    const tok = [];
    if (n.x != null && n.y != null) tok.push(Math.round(n.x) + ',' + Math.round(n.y));
    if (n.color) tok.push(n.color.toUpperCase());
    if (n.fromPort) tok.push('from=' + n.fromPort);
    if (n.toPort) tok.push('to=' + n.toPort);
    out.push('  '.repeat(depth) + n.label + (tok.length ? ' {' + tok.join(' ') + '}' : ''));
    n.children.forEach(c => walk(c, depth + 1));
  })(model.root || { label: '', children: [] }, 0);
  return model.root ? out.join('\n') : '';
}

// `participant` / `note` are keywords, never ids.
const dgSeqId = id => id !== 'participant' && id !== 'note';
function dgParseSequence(text) {
  const model = { parts: [], events: [], extra: [] };
  const part = (id, label) => {
    let p = model.parts.find(q => q.id === id);
    if (!p) { p = { id, label: id }; model.parts.push(p); }
    if (label) p.label = label;
    return p;
  };
  String(text || '').split('\n').forEach(raw => {
    if (!raw.trim()) return;
    let m = raw.match(DG_SEQ_PART_RE);
    if (m && dgSeqId(m[1])) { part(m[1], dgDecode(m[2])); return; }
    m = raw.match(DG_SEQ_NOTE_RE);
    if (m && dgSeqId(m[1])) { part(m[1]); model.events.push({ type: 'note', who: m[1], label: dgDecode(m[2]) }); return; }
    m = !/^\s*(participant|note)\s/.test(raw) && raw.match(DG_SEQ_MSG_RE);
    if (m && dgSeqId(m[1]) && dgSeqId(m[3])) {
      part(m[1]); part(m[3]);
      model.events.push({ type: 'msg', from: m[1], to: m[3], op: m[2], label: dgDecode(m[4]) });
      return;
    }
    model.extra.push(raw);
  });
  return model;
}
function dgSerializeSequence(model) {
  const out = model.parts.map(p => 'participant ' + p.id + (p.label && p.label !== p.id ? ' | ' + dgEncode(p.label) : ''));
  model.events.forEach(ev => out.push(ev.type === 'note'
    ? `note ${ev.who} | ${dgEncode(ev.label)}`
    : `${ev.from} ${ev.op} ${ev.to}` + (ev.label ? ' | ' + dgEncode(ev.label) : '')));
  (model.extra || []).forEach(l => out.push(l));
  return out.join('\n');
}
function dgParseKind(kind, text) {
  return kind === 'mindmap' ? dgParseMindmap(text) : kind === 'sequence' ? dgParseSequence(text) : dgParseFlow(text);
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

/* ── Ports: the 8 connection dots, all on the drawn outline ── */
// box = {shape, x, y, w, h[, r]} → {n, ne, e, se, s, sw, w, nw}. `r` overrides
// the corner radius (mind-map nodes: 8, the root h/2).
function dgPorts(box) {
  const { x, y, w, h } = box, cx = x + w / 2, cy = y + h / 2, hw = w / 2, hh = h / 2, k = Math.SQRT1_2;
  const p = { n: { x: cx, y }, e: { x: x + w, y: cy }, s: { x: cx, y: y + h }, w: { x, y: cy } };
  const shape = box.shape || 'rect';
  if (shape === 'ellipse') {
    Object.assign(p, { ne: { x: cx + hw * k, y: cy - hh * k }, se: { x: cx + hw * k, y: cy + hh * k },
      sw: { x: cx - hw * k, y: cy + hh * k }, nw: { x: cx - hw * k, y: cy - hh * k } });
  } else if (shape === 'diamond') {
    Object.assign(p, { ne: { x: cx + hw / 2, y: cy - hh / 2 }, se: { x: cx + hw / 2, y: cy + hh / 2 },
      sw: { x: cx - hw / 2, y: cy + hh / 2 }, nw: { x: cx - hw / 2, y: cy - hh / 2 } });
  } else if (shape === 'para') {
    const s = 0.2 * h;
    Object.assign(p, { n: { x: x + (s + w) / 2, y }, s: { x: x + (w - s) / 2, y: y + h }, e: { x: x + w - s / 2, y: cy }, w: { x: x + s / 2, y: cy },
      nw: { x: x + s, y }, ne: { x: x + w, y }, se: { x: x + w - s, y: y + h }, sw: { x, y: y + h } });
  } else {
    // rect (rx 2) and text are sharp; SVG clamps a radius to half the box, so do we.
    const r = Math.min(box.r != null ? box.r : shape === 'round' ? 12 : shape === 'pill' ? h / 2 : 0, hw, hh), d = r * (1 - k);
    Object.assign(p, { nw: { x: x + d, y: y + d }, ne: { x: x + w - d, y: y + d },
      se: { x: x + w - d, y: y + h - d }, sw: { x: x + d, y: y + h - d } });
  }
  return p;
}
// The port of `box` nearest to the point `towards`; ties go to n e s w ne se sw nw.
function dgAutoPort(box, towards) {
  const p = dgPorts(box);
  let best = null, bd = Infinity;
  DG_PORT_ORDER.forEach(k => { const d = Math.hypot(p[k].x - towards.x, p[k].y - towards.y); if (d < bd - 1e-6) { bd = d; best = k; } });
  return best;
}

/* ── Flow: geometry and drawing ── */
// A flow edge runs port to port: a pinned end sits on its dot, an automatic
// one takes the nearest dot. A self-edge is drawn only between two pinned dots.
function dgEdgeGeom(e, byId) {
  const a = byId.get(e.from), b = byId.get(e.to);
  if (!a || !b) return null;
  const self = e.from === e.to;
  if (self && !(e.fromPort && e.toPort && e.fromPort !== e.toPort)) return null;
  const pa = dgPorts(a), pb = dgPorts(b);
  const fp = e.fromPort || dgAutoPort(a, e.toPort ? pb[e.toPort] : { x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const tp = e.toPort || dgAutoPort(b, pa[fp]);
  const p1 = pa[fp], p2 = pb[tp];
  if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 4) return null;
  const g = { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, fp, tp, mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2 };
  if (self) {
    g.c1 = { x: p1.x + 40 * DG_DIR[fp][0], y: p1.y + 40 * DG_DIR[fp][1] };
    g.c2 = { x: p2.x + 40 * DG_DIR[tp][0], y: p2.y + 40 * DG_DIR[tp][1] };
    g.mx = (p1.x + 3 * g.c1.x + 3 * g.c2.x + p2.x) / 8;
    g.my = (p1.y + 3 * g.c1.y + 3 * g.c2.y + p2.y) / 8;
  }
  return g;
}
function dgPathD(x1, y1, x2, y2, c1, c2) {
  return c1 ? `M${dgF(x1)} ${dgF(y1)}C${dgF(c1.x)} ${dgF(c1.y)}, ${dgF(c2.x)} ${dgF(c2.y)}, ${dgF(x2)} ${dgF(y2)}`
    : `M${dgF(x1)} ${dgF(y1)}L${dgF(x2)} ${dgF(y2)}`;
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
// The modal's dots on a box: `cls` "dg-port" (selected) or "dg-port dg-port-target" (a drop target).
function dgPortDots(box, cls, r, hot) {
  const P = dgPorts(box);
  return DG_PORTS.map(k => `<circle class="${cls}${k === hot ? ' dg-port-hot' : ''}" data-port="${k}" cx="${dgF(P[k].x)}" cy="${dgF(P[k].y)}" r="${r}"/>`).join('');
}
function dgEndDots(g) {
  return `<circle class="dg-edge-end" data-end="from" cx="${dgF(g.x1)}" cy="${dgF(g.y1)}" r="6"/>` +
    `<circle class="dg-edge-end" data-end="to" cx="${dgF(g.x2)}" cy="${dgF(g.y2)}" r="6"/>`;
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
    const inTo = g.c2 || { x: g.x1, y: g.y1 }, inFrom = g.c1 || { x: g.x2, y: g.y2 };
    if (e.op === '->' || e.op === '-->' || e.op === '<->') { const h = dgHead(x2, y2, inTo.x, inTo.y); heads.push(h.d); x2 = h.bx; y2 = h.by; }
    if (e.op === '<->') { const h = dgHead(g.x1, g.y1, inFrom.x, inFrom.y); heads.push(h.d); x1 = h.bx; y1 = h.by; }
    const isSel = sel && sel.type === 'edge' && sel.i === i;
    let s = `<g class="dg-edge${isSel ? ' dg-selected' : ''}" data-i="${i}">`;
    s += `<path class="dg-edge-hit" d="${dgPathD(g.x1, g.y1, g.x2, g.y2, g.c1, g.c2)}" stroke="transparent" stroke-width="12" fill="none"/>`;
    s += `<path class="dg-edge-line" d="${dgPathD(x1, y1, x2, y2, g.c1, g.c2)}" fill="none" stroke-width="2"${e.color ? ` stroke="${e.color}"` : ''}${e.op === '-->' ? ' stroke-dasharray="6 4"' : ''}/>`;
    heads.forEach(d => { s += `<path class="dg-edge-head" d="${d}"${colorAttr}/>`; });
    if (e.label) {
      const text = e.label.replace(/\n/g, ' ');
      const w = dgMeasure(text, '13px ' + DG_FAMILY) + 8;
      s += `<rect class="dg-edge-label-bg" x="${dgF(g.mx - w / 2)}" y="${dgF(g.my - 10)}" width="${dgF(w)}" height="20" rx="4"/>`;
      s += dgText([text], g.mx, g.my, 16, 13, '', 'dg-edge-label');
      b.add(g.mx - w / 2, g.my - 10, w, 20);
    }
    if (g.c1) { b.add(Math.min(g.c1.x, g.c2.x), Math.min(g.c1.y, g.c2.y), Math.abs(g.c2.x - g.c1.x), Math.abs(g.c2.y - g.c1.y)); }
    parts.push(s + '</g>');
    if (isSel) {
      over.push(dgOutline(Math.min(g.x1, g.x2), Math.min(g.y1, g.y2), Math.abs(g.x2 - g.x1), Math.abs(g.y2 - g.y1)));
      over.push(dgEndDots(g));
    }
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
      over.push(dgPortDots(n, 'dg-port', 5));
      over.push(`<rect class="dg-resize" x="${n.x + n.w - 5}" y="${n.y + n.h - 5}" width="10" height="10"/>`);
    }
  });
  return { svg: parts.join('') + over.join(''), box: b.box(20) };
}

/* ── Mind map: automatic layout, free positions and drawing ── */
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
  // Free positions (`all` is pre-order): a node's own x,y wins; one without
  // keeps its automatic offset from its parent — so a new node lands beside it.
  all.forEach(L => { L.ax = L.x; L.ay = L.y; });
  all.forEach(L => {
    const nd = L.node;
    if (nd.x != null && nd.y != null) { L.x = nd.x; L.y = nd.y; }
    else if (L.parent) { L.x = L.parent.x + L.ax - L.parent.ax; L.y = L.parent.y + L.ay - L.parent.ay; }
    L.eff = nd.color || L.color;   // own colour, for this node only; the branch colour otherwise
  });
  const byPath = new Map(all.map(L => [L.path, L]));
  return { root: R, all, byPath };
}
function dgMmBox(L) { return { x: L.x, y: L.y, w: L.w, h: L.h, r: L.depth === 0 ? L.h / 2 : 8 }; }
// The connector into L: automatic ends by the side the child sits on, a pinned end on its dot.
function dgMmEdgeGeom(L) {
  const P = L.parent, nd = L.node;
  let fp, tp;
  if (L.x >= P.x + P.w) { fp = 'e'; tp = 'w'; }
  else if (L.x + L.w <= P.x) { fp = 'w'; tp = 'e'; }
  else if (L.y + L.h / 2 > P.y + P.h / 2) { fp = 's'; tp = 'n'; }
  else { fp = 'n'; tp = 's'; }
  fp = nd.fromPort || fp; tp = nd.toPort || tp;
  const p1 = dgPorts(dgMmBox(P))[fp], p2 = dgPorts(dgMmBox(L))[tp];
  const dist = port => port.length === 2 ? Math.max(20, Math.hypot(p2.x - p1.x, p2.y - p1.y) / 3)
    : port === 'e' || port === 'w' ? Math.max(20, Math.abs(p2.x - p1.x) / 2) : Math.max(20, Math.abs(p2.y - p1.y) / 2);
  const d1 = dist(fp), d2 = dist(tp);
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, fp, tp,
    c1: { x: p1.x + DG_DIR[fp][0] * d1, y: p1.y + DG_DIR[fp][1] * d1 }, c2: { x: p2.x + DG_DIR[tp][0] * d2, y: p2.y + DG_DIR[tp][1] * d2 } };
}

function dgMindmapSvg(model, selPath) {
  const lay = dgLayoutMindmap(model.root);
  if (!lay) return { svg: '', box: null, lay: null };
  const b = dgBounds(), edges = [], nodes = [], over = [];
  lay.all.forEach(L => {
    b.add(L.x, L.y, L.w, L.h);
    const cy = L.y + L.h / 2;
    const isSel = selPath === L.path;
    if (L.parent) {
      const g = dgMmEdgeGeom(L);
      edges.push(`<path class="dg-mm-edge" fill="none" stroke="${L.eff}" stroke-width="${L.parent.depth === 0 ? 3 : 2}" d="${dgPathD(g.x1, g.y1, g.x2, g.y2, g.c1, g.c2)}"/>`);
      if (isSel) over.push(dgPortDots(dgMmBox(L), 'dg-port', 5), dgEndDots(g));
    }
    const [rx, op, sw] = L.depth === 0 ? [dgF(L.h / 2), 0.35, 2] : L.depth === 1 ? [8, 0.22, 2] : [8, 0.08, 1.5];
    nodes.push(`<g class="dg-mm-node${isSel ? ' dg-selected' : ''}" data-path="${L.path}">` +
      `<rect x="${dgF(L.x)}" y="${dgF(L.y)}" width="${dgF(L.w)}" height="${dgF(L.h)}" rx="${rx}" fill="${L.eff}" fill-opacity="${op}" stroke="${L.eff}" stroke-width="${sw}"/>` +
      dgText(L.lines, L.x + L.w / 2, cy, L.depth === 0 ? 20 : 18, L.depth === 0 ? 16 : 14, L.depth === 0 ? 700 : L.depth === 1 ? 600 : '', 'dg-label') + '</g>');
    if (isSel) over.unshift(dgOutline(L.x, L.y, L.w, L.h));
  });
  return { svg: edges.join('') + nodes.join('') + over.join(''), box: b.box(24), lay };
}

/* ── Sequence: participants along the top, messages in order below ── */
function dgSeqSvg(model, sel) {
  if (!model.parts.length) return { svg: '', box: null, lay: null };
  const LF = '13px ' + DG_FAMILY, PF = '600 14px ' + DG_FAMILY;
  const flat = s => String(s || '').replace(/\n/g, ' ');
  const idx = new Map(model.parts.map((p, i) => [p.id, i]));
  const P = model.parts.map((p, i) => ({ id: p.id, label: flat(p.label), w: Math.max(100, dgMeasure(flat(p.label), PF) + 24), color: DG_COLORS[i % 6] }));
  const need = P.map(() => 0);   // the widest label between i and i+1
  model.events.forEach(ev => {
    if (ev.type !== 'msg') return;
    const a = idx.get(ev.from), c = idx.get(ev.to);
    if (Math.abs(a - c) === 1) need[Math.min(a, c)] = Math.max(need[Math.min(a, c)], dgMeasure(flat(ev.label), LF) + 48);
  });
  P[0].cx = P[0].w / 2;
  for (let i = 1; i < P.length; i++) P[i].cx = P[i - 1].cx + Math.max(160, (P[i - 1].w + P[i].w) / 2 + 40, need[i - 1]);
  P.forEach(p => { p.x = p.cx - p.w / 2; });
  const b = dgBounds(), parts = [], rows = [], over = [], labels = [];
  let y = 36 + 30, num = 0;
  model.events.forEach((ev, i) => {
    const isSel = sel && sel.type === 'seq' && sel.i === i;
    if (ev.type === 'note') {
      const p = P[idx.get(ev.who)], lines = dgWrap(ev.label, 180, LF);
      const w = Math.max(40, ...lines.map(l => dgMeasure(l, LF))) + 16, h = lines.length * 18 + 16;
      const x = p.cx + 12, top = y + 6;
      rows.push(`<g class="dg-seq-note-g" data-i="${i}"><rect class="dg-seq-note" x="${dgF(x)}" y="${dgF(top)}" width="${dgF(w)}" height="${h}" rx="3" fill="#D9A441" fill-opacity="0.25" stroke="#D9A441" stroke-width="1.5"/>` +
        dgText(lines, x + w / 2, top + h / 2, 18, 13, '', 'dg-seq-note-text dg-label') + '</g>');
      b.add(x, top, w, h);
      labels[i] = { x, y: top, w: Math.max(w, 120), h };
      if (isSel) over.push(dgOutline(x, top, w, h));
      y += h + 12;
      return;
    }
    num++;
    const a = P[idx.get(ev.from)], c = P[idx.get(ev.to)], dash = ev.op === '-->' ? ' stroke-dasharray="6 4"' : '';
    const text = flat(ev.label), tw = text ? dgMeasure(text, LF) + 8 : 0;
    let s = `<g class="dg-seq-msg" data-i="${i}">`;
    if (a === c) {
      const ay = y + 18, x2 = a.cx, y2 = ay + 24, h = dgHead(x2, y2, a.cx + 40, y2);
      s += `<path class="dg-edge-hit" d="M${dgF(a.cx)} ${dgF(ay)}H${dgF(a.cx + 40)}V${dgF(y2)}H${dgF(a.cx)}" stroke="transparent" stroke-width="12" fill="none"/>`;
      s += `<path class="dg-edge-line" d="M${dgF(a.cx)} ${dgF(ay)}H${dgF(a.cx + 40)}V${dgF(y2)}H${dgF(h.bx)}" fill="none" stroke-width="2"${dash}/>`;
      s += `<path class="dg-edge-head" d="${h.d}"/>`;
      if (text) {
        const lx = a.cx + 48, ly = ay + 12;
        s += `<rect class="dg-edge-label-bg" x="${dgF(lx - 4)}" y="${dgF(ly - 10)}" width="${dgF(tw)}" height="20" rx="4"/>`;
        s += `<text class="dg-edge-label" x="${dgF(lx)}" y="${dgF(ly)}" dy="0.35em" font-size="13" font-family="${DG_FAMILY}">${dgEsc(text)}</text>`;
      }
      b.add(a.cx, ay - 10, 48 + tw, 44);
      labels[i] = { x: a.cx + 44, y: ay, w: Math.max(tw, 120), h: 24 };
      s += dgSeqNum(a.cx, ay, num);
      if (isSel) over.push(dgOutline(a.cx, ay, 44 + tw, 24));
      y += 60;
    } else {
      const ay = y + 30, h = dgHead(c.cx, ay, a.cx, ay), mx = (a.cx + c.cx) / 2;
      s += `<path class="dg-edge-hit" d="M${dgF(a.cx)} ${dgF(ay)}H${dgF(c.cx)}" stroke="transparent" stroke-width="12" fill="none"/>`;
      s += `<path class="dg-edge-line" d="M${dgF(a.cx)} ${dgF(ay)}H${dgF(h.bx)}" fill="none" stroke-width="2"${dash}/>`;
      s += `<path class="dg-edge-head" d="${h.d}"/>`;
      if (text) {
        s += `<rect class="dg-edge-label-bg" x="${dgF(mx - tw / 2)}" y="${dgF(ay - 26)}" width="${dgF(tw)}" height="20" rx="4"/>`;
        s += dgText([text], mx, ay - 16, 16, 13, '', 'dg-edge-label');
        b.add(mx - tw / 2, ay - 26, tw, 20);
      }
      const lw = Math.max(tw, 120);
      labels[i] = { x: mx - lw / 2, y: ay - 28, w: lw, h: 24 };
      s += dgSeqNum(a.cx, ay, num);
      if (isSel) over.push(dgOutline(Math.min(a.cx, c.cx), ay - 28, Math.abs(c.cx - a.cx), 32));
      y += 44;
    }
    rows.push(s + '</g>');
  });
  const bottom = y + 16;
  P.forEach(p => {
    parts.push(`<line class="dg-seq-life" x1="${dgF(p.cx)}" y1="36" x2="${dgF(p.cx)}" y2="${dgF(bottom)}" stroke-width="1.5" stroke-dasharray="4 4"/>`);
  });
  P.forEach(p => {
    parts.push(`<g class="dg-seq-part" data-id="${dgEsc(p.id)}"><rect x="${dgF(p.x)}" y="0" width="${dgF(p.w)}" height="36" rx="6" fill="${p.color}" fill-opacity="0.22" stroke="${p.color}" stroke-width="2"/>` +
      dgText([p.label], p.cx, 18, 18, 14, 600, 'dg-label') + '</g>');
    b.add(p.x, 0, p.w, bottom);
  });
  return { svg: parts.join('') + rows.join('') + over.join(''), box: b.box(20), lay: { parts: P, labels } };
}
function dgSeqNum(cx, cy, n) {
  return `<g class="dg-seq-num"><circle cx="${dgF(cx)}" cy="${dgF(cy)}" r="9" fill="#C1BB45"/>` +
    `<text x="${dgF(cx)}" y="${dgF(cy)}" dy="0.35em" text-anchor="middle" font-size="11" font-weight="700" font-family="${DG_FAMILY}">${n}</text></g>`;
}

// One drawing function per kind: → { svg, box, lay }.
function dgSvgFor(kind, model, sel) {
  if (kind === 'mindmap') return dgMindmapSvg(model, sel && sel.path);
  if (kind === 'sequence') return dgSeqSvg(model, sel);
  return dgFlowSvg(model, sel);
}
const DG_KIND_KEY = { flow: 'dgKindFlow', mindmap: 'dgKindMindmap', sequence: 'dgKindSequence' };

/* ── Preview and export (called from parseMarkdown) ── */
function renderDiagramBlock(lines, kind, lineIdx, opts) {
  const forExport = !!(opts && opts.forExport);
  const text = lines.map(dgUnescape).join('\n');
  const model = dgParseKind(kind, text);
  const r = dgSvgFor(kind, model);
  const aria = t(DG_KIND_KEY[kind] || 'dgKindFlow');
  let html = `<figure class="md-diagram md-diagram-${kind}"${forExport ? '' : ` data-line="${lineIdx}"`}>`;
  html += r.box
    ? `<svg class="dg-svg" xmlns="http://www.w3.org/2000/svg" viewBox="${dgF(r.box.x)} ${dgF(r.box.y)} ${dgF(r.box.w)} ${dgF(r.box.h)}" width="${Math.ceil(r.box.w)}" height="${Math.ceil(r.box.h)}" role="img" aria-label="${dgEsc(aria)}">${r.svg}</svg>`
    : `<p class="dg-empty">${dgEsc(t('dgEmpty'))}</p>`;
  if (!forExport) {
    html += `<div class="dg-actions"><button type="button" class="dg-edit" data-i="dgEdit" data-i-title="dgEditTip" title="${dgEsc(t('dgEditTip'))}">${dgEsc(t('dgEdit'))}</button>` +
      `<button type="button" class="dg-dl" data-fmt="svg" data-i="dgDlSvg" data-i-title="dgDlSvgTip" title="${dgEsc(t('dgDlSvgTip'))}">${dgEsc(t('dgDlSvg'))}</button>` +
      `<button type="button" class="dg-dl" data-fmt="png" data-i="dgDlPng" data-i-title="dgDlPngTip" title="${dgEsc(t('dgDlPngTip'))}">${dgEsc(t('dgDlPng'))}</button></div>`;
    if (kind !== 'mindmap' && model.extra.length) html += `<p class="dg-warn">${dgEsc(t('dgIgnored', model.extra.length))}</p>`;
  }
  return html + '</figure>';
}

/* ── Download: a standalone SVG (white, dark lines and text, box colours kept) or a 2× PNG ── */
const DG_EXPORT_CSS = ".dg-label,.dg-edge-label,.dg-seq-num text{fill:#222;font-family:'Trebuchet MS',sans-serif}" +
  '.dg-edge-line:not([stroke]),.dg-seq-life{stroke:#444}.dg-edge-head:not([fill]){fill:#444}.dg-edge-label-bg{fill:#fff}';
function dgExportSvg(kind, text) {
  const r = dgSvgFor(kind, dgParseKind(kind, text));
  const b = r.box || { x: 0, y: 0, w: 200, h: 60 }, W = Math.ceil(b.w), H = Math.ceil(b.h);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${dgF(b.x)} ${dgF(b.y)} ${dgF(b.w)} ${dgF(b.h)}">` +
    `<rect x="${dgF(b.x)}" y="${dgF(b.y)}" width="${dgF(b.w)}" height="${dgF(b.h)}" fill="#ffffff"/>` +
    `<style>${DG_EXPORT_CSS}</style>${r.svg}</svg>`;
}
function dgExportPng(kind, text) {
  const svg = dgExportSvg(kind, text);
  const [, W, H] = svg.match(/width="(\d+)" height="(\d+)"/).map(Number);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 2 * W; c.height = 2 * H;
      const x = c.getContext('2d');
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG')), 'image/png');
    };
    img.onerror = () => reject(new Error('SVG'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
function dgFileName(kind, n, ext) {
  const ch = typeof wbChapter === 'function' && typeof wbCurrentId !== 'undefined' && wbCurrentId ? wbChapter(wbCurrentId) : null;
  const word = { flow: 'flowchart', mindmap: 'mindmap', sequence: 'sequence' }[kind] || 'flowchart';
  return wbSlug(ch && ch.title, 'diagrama') + '-' + word + '-' + n + '.' + ext;
}
// Every diagram block in the text, in order: [{open, kind}].
function dgBlocks(text) {
  const out = [];
  let open = -1, kind = '';
  text.split('\n').forEach((l, i) => {
    if (!/^```/.test(l)) return;
    if (open < 0) { open = i; kind = l.slice(3).trim().toLowerCase(); return; }
    if (DG_KINDS.includes(kind)) out.push({ open, kind });
    open = -1;
  });
  if (open >= 0 && DG_KINDS.includes(kind)) out.push({ open, kind });
  return out;
}
async function dgDownload(kind, text, fmt, n) {
  try {
    const blob = fmt === 'png' ? await dgExportPng(kind, text) : new Blob([dgExportSvg(kind, text)], { type: 'image/svg+xml' });
    await ScuLaFolder.save(dgFileName(kind, n, fmt), blob);
  } catch (e) {
    // A PNG that would not rasterise, or a save that failed (a cancel is not an error: save reports it).
    console.error(e);
    if (window.ScuLaFolder) ScuLaFolder.toast(t('dgDlFailed'));
  }
}
// The preview's ⤓ buttons: the block whose fence opens on editor line `line`.
function dgDownloadAt(line, fmt) {
  const blk = dgBlockAt(editor.value, line, true);
  if (!blk) return;
  const n = dgBlocks(editor.value).filter(b => b.kind === blk.kind && b.open <= blk.open).length;
  dgDownload(blk.kind, blk.body, fmt, n);
}

/* ── The modal ── */
const dg = {
  open: false, mode: 'new', kind: 'flow', flow: null, mm: null, sel: null, tool: 'select',
  seq: null, zoom: 1, panX: 0, panY: 0, dirty: false, color: DG_DEFAULT,
  caret: [0, 0], edit: null, drag: null, pinch: null, pointers: new Map(),
  label: null, box: null, lay: null, srcTimer: 0, srcLast: 0
};
let dgUndo = [], dgRedo = [];

function dgIsOpen() { return dg.open; }
function dgCanon() { return dg.kind === 'flow' ? dgSerializeFlow(dg.flow) : dg.kind === 'sequence' ? dgSerializeSequence(dg.seq) : dgSerializeMindmap(dg.mm); }
function dgSeed(kind) {
  if (kind === 'sequence') return ['participant Ana', 'participant Bogdan',
    'Ana -> Bogdan | ' + t('dgSeqSend'), 'Bogdan --> Ana | ' + t('dgSeqReply'),
    'Bogdan -> Bogdan | ' + t('dgSeqCheck'), 'note Bogdan | ' + t('dgSeqNote')].join('\n');
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
  dg.flow = kind === 'flow' ? dgParseFlow(text) : null;
  dg.mm = kind === 'mindmap' ? dgParseMindmap(text) : null;
  dg.seq = kind === 'sequence' ? dgParseSequence(text) : null;
}

// The ```flow / ```mindmap / ```sequence block around editor line `line` (or containing it),
// tracked the same way parseMarkdown does.
function dgBlockAt(text, line, mustOpenAt) {
  const lines = text.split('\n');
  let open = -1, kind = '';
  for (let i = 0; i < lines.length; i++) {
    if (!/^```/.test(lines[i])) continue;
    if (open < 0) { open = i; kind = lines[i].slice(3).trim().toLowerCase(); continue; }
    if (DG_KINDS.includes(kind) && (mustOpenAt ? open === line : line >= open && line <= i))
      return { open, close: i, kind, body: lines.slice(open + 1, i).join('\n'), block: lines.slice(open, i + 1).join('\n') };
    open = -1;
  }
  if (open >= 0 && DG_KINDS.includes(kind) && (mustOpenAt ? open === line : line >= open))
    return { open, close: -1, kind, body: lines.slice(open + 1).join('\n'), block: lines.slice(open).join('\n') };
  return null;
}

// Tab stays inside an open modal (aria-modal): past its last control to its first, and back.
// Focus outside it (the page behind) is brought back in. True when the key was handled.
function dgTrapTab(modal, e) {
  if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return false;
  const all = [...modal.querySelectorAll('button, input, select, textarea, [tabindex]')]
    .filter(el => el.tabIndex >= 0 && !el.disabled && el.getClientRects().length);
  if (!all.length) return false;
  const first = all[0], last = all[all.length - 1], at = document.activeElement;
  if (all.includes(at) && at !== (e.shiftKey ? first : last)) return false;
  e.preventDefault();
  (e.shiftKey ? last : first).focus();
  return true;
}

function openDiagram(opts) {
  if (dg.open) return;
  if (typeof skIsOpen === 'function' && skIsOpen()) return;   // one full-screen modal at a time
  dg.caret = [editor.selectionStart, editor.selectionEnd];
  let blk = null;
  if (opts && Number.isInteger(opts.line)) blk = dgBlockAt(editor.value, opts.line, true);
  else if (!opts) blk = dgBlockAt(editor.value, editor.value.slice(0, editor.selectionStart).split('\n').length - 1, false);
  if (blk) { dg.mode = 'edit'; dg.edit = blk; dgLoad(blk.kind, blk.body); }
  else { dg.mode = 'new'; dg.edit = null; dgLoad('flow', dgSeed('flow')); }
  dg.open = true; dg.dirty = false; dg.tool = 'select'; dg.sel = null; dg.label = null; dg.drag = null; dg.pinch = null;
  dg.pointers.clear();
  dgUndo = []; dgRedo = []; dg.srcLast = 0;   // a new session's first typing burst is its own undo step
  if (dg.kind === 'mindmap' && dg.mm.root) dg.sel = { type: 'mm', path: '' };
  dgEl('diagram-modal').hidden = false;
  dgSourceShow(dg.kind === 'sequence');   // a sequence is edited by typing: its source opens with it
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
  clearTimeout(dg.srcTimer); dg.srcTimer = 0;
  dgEl('diagram-modal').hidden = true;
  editor.focus();
  return true;
}

function dgApply() {
  if (!dg.open) return;
  dgSourceFlush();
  dgLabelEnd(true);
  const block = '```' + dg.kind + '\n' + dgCanon() + '\n```';
  const val = editor.value;
  let start = -1, end = -1;
  if (dg.mode === 'edit') {
    const e = dg.edit, lines = val.split('\n');
    const now = /^```\s*(flow|mindmap|sequence)\s*$/i.test(lines[e.open] || '') ? dgBlockAt(val, e.open, true) : null;
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
  dgSourceFlush();
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
  if (sel.type === 'seq') return !!(dg.seq && sel.i < dg.seq.events.length);
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
  const flow = dg.kind === 'flow', mm = dg.kind === 'mindmap', seq = dg.kind === 'sequence';
  dgPaint();
  document.querySelectorAll('#dg-kind [data-kind]').forEach(b => {
    b.classList.toggle('active', b.dataset.kind === dg.kind);
    b.disabled = dg.mode === 'edit';
  });
  document.querySelectorAll('#dg-tools [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === dg.tool));
  document.querySelectorAll('#dg-colors [data-color]').forEach(b => b.classList.toggle('active', b.dataset.color === dg.color));
  dgEl('dg-tools').hidden = !flow;
  dgEl('dg-colors').hidden = seq;
  dgEl('dg-color-auto').hidden = !mm;
  dgEl('dg-mm-tools').hidden = !mm;
  dgEl('dg-delete').hidden = seq;
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
  if (dg.kind === 'mindmap') {
    // The swatches mark the selected node's own colour; none when it follows its branch.
    const n = sel && sel.type === 'mm' ? dgMmGet(sel.path) : null, own = n && n.color;
    document.querySelectorAll('#dg-colors [data-color]').forEach(b => b.classList.toggle('active', !!own && b.dataset.color === own));
    dgEl('dg-color-auto').disabled = !own;
    dgEl('dg-mm-auto').disabled = !dgMmFree();
  }
  const src = dgEl('dg-source');
  if (!src.hidden && document.activeElement !== src) src.value = dgCanon();
}

function dgRender() {
  const r = dgSvgFor(dg.kind, dg.kind === 'flow' ? dg.flow : dg.kind === 'sequence' ? dg.seq : dg.mm, dg.sel);
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
  if (kind === 'sequence') dgSourceShow(true);
  dgChrome(); dgRender(); dgFit();
  dgEl('dg-stage').focus();
}
function dgSetTool(tool) { dg.tool = tool; dgChrome(); }
// ⤓ in the modal: the current model; n is its place among blocks of its kind (a new one comes last).
function dgDownloadModal(fmt) {
  dgSourceFlush(); dgLabelEnd(true);
  const same = dgBlocks(editor.value).filter(b => b.kind === dg.kind);
  const n = dg.mode === 'edit' && dg.edit ? Math.max(1, same.filter(b => b.open <= dg.edit.open).length) : same.length + 1;
  dgDownload(dg.kind, dgCanon(), fmt, n);
}

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
function dgConnect(from, to, fromPort, toPort) {
  if (!to || (from === to && !(fromPort && toPort && fromPort !== toPort))) return;
  dgPush();
  dg.flow.edges.push({ from, fromPort: fromPort || null, op: '->', to, toPort: toPort || null, color: null, label: '' });
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
  if (dg.kind === 'mindmap') {
    const n = sel && sel.type === 'mm' ? dgMmGet(sel.path) : null;
    if (n && n.color !== c) { dgPush(); n.color = c; }
    dgRender(); return;
  }
  if (dg.kind === 'flow' && sel && sel.type !== 'mm') {
    const item = sel.type === 'node' ? dgNode(sel.id) : dg.flow.edges[sel.i];
    if (item && (item.color || '').toUpperCase() !== c) { dgPush(); item.color = c; }
  }
  dgChrome(); dgRender();
}

/* ── Mind-map edits ── */
const dgMmBlank = label => ({ label, children: [], x: null, y: null, color: null, fromPort: null, toPort: null });
function dgMmWalk(fn) { (function w(n) { if (!n) return; fn(n); n.children.forEach(w); })(dg.mm && dg.mm.root); }
function dgMmFree() { let any = false; dgMmWalk(n => { if (n.x != null || n.fromPort || n.toPort) any = true; }); return any; }
function dgMmColorAuto() {
  const n = dg.sel && dg.sel.type === 'mm' ? dgMmGet(dg.sel.path) : null;
  if (!n || !n.color) return;
  dgPush(); n.color = null; dgRender();
}
// ↺ Auto layout: every position and pin back to automatic, colours kept — one undo step.
function dgMmAutoLayout() {
  if (!dgMmFree()) return;
  dgPush();
  dgMmWalk(n => { n.x = n.y = null; n.fromPort = n.toPort = null; });
  dgRender(); dgFit();
}
function dgMmGet(path) {
  let n = dg.mm && dg.mm.root;
  if (!n || path === '') return n;
  for (const i of path.split('.')) { n = n && n.children[+i]; }
  return n || null;
}
function dgMmAdd(sibling) {
  if (!dg.mm.root) {
    dgPush(); dg.mm.root = dgMmBlank(t('dgNewNode'));
    dg.sel = { type: 'mm', path: '' }; dgRender(); dgLabelStart(true); return;
  }
  const path = dg.sel && dg.sel.type === 'mm' ? dg.sel.path : '';
  dgPush();
  const node = dgMmBlank(t('dgNewNode'));   // no x,y: placed beside its parent
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
  if (sel.type === 'seq') {
    const ev = dg.seq.events[sel.i], r = dg.lay && dg.lay.labels[sel.i];
    return ev && r && { get: () => ev.label, set: v => { ev.label = v; }, x: r.x, y: r.y, w: r.w, h: r.h };
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
  const show = dgEl('dg-source').hidden;
  if (!show) dgSourceFlush();
  dgSourceShow(show);
}
function dgSourceShow(show) {
  const src = dgEl('dg-source');
  src.hidden = !show;
  dgEl('dg-source-btn').setAttribute('aria-pressed', String(show));
  if (show) src.value = dgCanon();
}
function dgSourceInput() {
  const now = Date.now();
  if (now - dg.srcLast > 700) { dgPush(); dgState(); }   // the undo button is live at once
  dg.srcLast = now;
  clearTimeout(dg.srcTimer);
  dg.srcTimer = setTimeout(dgSourceParse, 150);
}
function dgSourceParse() {
  dg.srcTimer = 0;
  const sel = dg.sel;
  dgLoad(dg.kind, dgEl('dg-source').value);
  dg.sel = dgSelValid(sel) ? sel : null;
  dg.dirty = true;
  dgRender();
}
/* Typing waits 150 ms before it is parsed; whatever reads the model (apply, undo, hiding
   the panel) takes the pending text first, so a quick click never writes a stale model. */
function dgSourceFlush() {
  if (!dg.srcTimer) return;
  clearTimeout(dg.srcTimer);
  dgSourceParse();
}

/* ── Pointers: one map, capture on the stage, a second finger pinches ── */
function dgHit(target) {
  const el = target && target.closest && target.closest('.dg-resize, .dg-edge-end, .dg-port, .dg-node, .dg-edge, .dg-mm-node');
  if (!el) return null;
  if (el.classList.contains('dg-resize')) return { type: 'resize' };
  if (el.classList.contains('dg-edge-end')) return { type: 'end', end: el.dataset.end };
  if (el.classList.contains('dg-port')) return { type: 'port', port: el.dataset.port };
  if (el.classList.contains('dg-node')) return { type: 'node', id: el.dataset.id };
  if (el.classList.contains('dg-edge')) return { type: 'edge', i: +el.dataset.i };
  return { type: 'mm', path: el.dataset.path };
}
function dgRubberLine(p, e) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('class', 'dg-rubber');
  const w = dgToWorld(e.clientX, e.clientY);
  line.setAttribute('x1', p.x); line.setAttribute('y1', p.y); line.setAttribute('x2', w.x); line.setAttribute('y2', w.y);
  dgEl('dg-world').appendChild(line);
  return line;
}
// A new connector from node `id`: from a dot it is pinned there, from the body it is automatic.
function dgRubberStart(id, e, port) {
  const n = dgNode(id);
  const p = port ? dgPorts(n)[port] : { x: n.x + n.w / 2, y: n.y + n.h / 2 };
  dg.drag = { type: 'rubber', from: id, fromPort: port || null, line: dgRubberLine(p, e) };
}
// Dragging one end of the selected flow edge, or of the connector into the selected mind-map node.
function dgEndStart(end, e) {
  let g, cands;
  if (dg.kind === 'flow') {
    const edge = dg.flow.edges[dg.sel.i];
    g = edge && dgEdgeGeom(edge, new Map(dg.flow.nodes.map(n => [n.id, n])));
    cands = dg.flow.nodes.map(n => ({ key: n.id, box: n }));
  } else {
    const L = dg.lay && dg.lay.byPath.get(dg.sel.path);
    if (!L || !L.parent) return;
    g = dgMmEdgeGeom(L);
    const T = end === 'to' ? L : L.parent;   // an end re-attaches only to its own node
    cands = [{ key: T.path, box: dgMmBox(T) }];
  }
  if (!g) return;
  const fixed = end === 'from' ? { x: g.x2, y: g.y2 } : { x: g.x1, y: g.y1 };
  dg.drag = { type: 'end', end, cands, line: dgRubberLine(fixed, e) };
}
// Drop rules: a dot within 12 screen px pins there; else the body under the pointer is automatic; else nothing.
function dgDrop(cx, cy, cands) {
  const w = dgToWorld(cx, cy);
  let best = null, bd = 12 / dg.zoom;
  cands.forEach(c => {
    const P = dgPorts(c.box);
    DG_PORTS.forEach(k => { const d = Math.hypot(P[k].x - w.x, P[k].y - w.y); if (d <= bd) { bd = d; best = { key: c.key, port: k, box: c.box }; } });
  });
  if (best) return best;
  const hit = dgHit(document.elementFromPoint(cx, cy));
  const key = hit && (hit.type === 'node' ? hit.id : hit.type === 'mm' ? hit.path : null);
  const c = key != null && cands.find(q => q.key === key);
  return c ? { key, port: null, box: c.box } : null;
}
// The drop target's dots while a connector or an end is dragged.
function dgTargets(r) {
  let g = dgEl('dg-targets');
  if (!g && !r) return;
  if (!g) { g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.id = 'dg-targets'; dgEl('dg-world').appendChild(g); }
  g.innerHTML = r ? dgPortDots(r.box, 'dg-port dg-port-target', 6, r.port) : '';
}
function dgDragCands(d) { return d.type === 'rubber' ? dg.flow.nodes.map(n => ({ key: n.id, box: n })) : d.cands; }
function dgCancelDrag() {
  const d = dg.drag;
  if (!d) return;
  dg.drag = null;
  if (d.type === 'move' || d.type === 'resize') { Object.assign(d.node, d.start); dgRender(); }
  else if (d.type === 'rubber' || d.type === 'end') { d.line.remove(); dgTargets(null); }
  else if (d.type === 'mmmove') { (d.nodes || []).forEach(q => { q.node.x = q.ox; q.node.y = q.oy; }); dgRender(); }
  else if (d.type === 'seqmove') dgRender();
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
  if (dg.kind === 'sequence') {
    const el = e.target.closest && e.target.closest('.dg-seq-part, .dg-seq-msg, .dg-seq-note-g');
    if (!el) { pan(); return; }
    dg.drag = el.classList.contains('dg-seq-part') ? { type: 'seqmove', id: el.dataset.id, el, sx, moved: false }
      : { type: 'seqclick', i: +el.dataset.i, sx, sy };
    return;
  }
  if (dg.kind === 'mindmap') {
    if (hit && hit.type === 'end' && dg.sel && dg.sel.path) { dgEndStart(hit.end, e); return; }
    const path = !hit ? null : hit.type === 'mm' ? hit.path : hit.type === 'port' && dg.sel ? dg.sel.path : null;
    if (path === null) { pan(); return; }
    // Re-render only when the selection changes (the double-click rule below).
    if (!dg.sel || dg.sel.path !== path) { dg.sel = { type: 'mm', path }; dgRender(); }
    dg.drag = { type: 'mmmove', path, sx, sy, moved: false, before: dgCanon(), nodes: null };
    return;
  }
  if (DG_SHAPES.includes(dg.tool) && !hit) { const w = dgToWorld(sx, sy); dgPlace(dg.tool, w.x, w.y); return; }
  if (dg.tool === 'connect' && hit && hit.type === 'node') { dgRubberStart(hit.id, e); return; }
  if (hit && hit.type === 'port' && dg.sel && dg.sel.type === 'node') { dgRubberStart(dg.sel.id, e, hit.port); return; }
  if (hit && hit.type === 'end' && dg.sel && dg.sel.type === 'edge') { dgEndStart(hit.end, e); return; }
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
  // Re-render only when the selection changes: a re-render replaces #dg-world, and a
  // double-click whose targets were detached never reaches the stage.
  if (hit && hit.type === 'edge') {
    if (!dg.sel || dg.sel.type !== 'edge' || dg.sel.i !== hit.i) { dg.sel = { type: 'edge', i: hit.i }; dgRender(); }
    return;
  }
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
  if (d.type === 'rubber' || d.type === 'end') {
    const w = dgToWorld(e.clientX, e.clientY);
    d.line.setAttribute('x2', w.x); d.line.setAttribute('y2', w.y);
    const r = dgDrop(e.clientX, e.clientY, dgDragCands(d));
    dgTargets(r && (d.type !== 'rubber' || r.key !== d.from || r.port) ? r : null);
    return;
  }
  if (d.type === 'seqclick') return;
  if (d.type === 'seqmove') {
    if (!d.moved && Math.abs(e.clientX - d.sx) < 3) return;
    d.moved = true;
    d.el.setAttribute('transform', `translate(${dgF((e.clientX - d.sx) / dg.zoom)} 0)`);
    return;
  }
  const dx = (e.clientX - d.sx) / dg.zoom, dy = (e.clientY - d.sy) / dg.zoom;
  if (d.type === 'mmmove') {
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
    if (!d.moved) {
      // The whole branch moves: each node in it takes its current place as its own, then the delta.
      d.moved = true; d.nodes = [];
      (function walk(L) { d.nodes.push({ node: L.node, ox: L.node.x, oy: L.node.y, x: L.x, y: L.y }); L.kids.forEach(walk); })(dg.lay.byPath.get(d.path));
    }
    const top = d.nodes[0];
    d.ddx = dgSnap(top.x + dx) - top.x; d.ddy = dgSnap(top.y + dy) - top.y;
    d.nodes.forEach(q => { q.node.x = Math.round(q.x + d.ddx); q.node.y = Math.round(q.y + d.ddy); });
    dgRender();
    return;
  }
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
  if (d.type === 'rubber' || d.type === 'end') {
    d.line.remove(); dgTargets(null);
    const r = dgDrop(e.clientX, e.clientY, dgDragCands(d));
    if (!r) return;
    if (d.type === 'rubber') { dgConnect(d.from, r.key, d.fromPort, r.port); return; }
    dgEndDrop(d.end, r);
    return;
  }
  if (d.type === 'mmmove') {
    if (!d.moved) return;
    if (!d.ddx && !d.ddy) { dg.drag = d; dgCancelDrag(); return; }
    dgPush(d.before); dgState();
    return;
  }
  if (d.type === 'seqmove') { if (d.moved) dgSeqReorder(d.id, dgToWorld(e.clientX, e.clientY).x); else dgRender(); return; }
  if (d.type === 'seqclick') {
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) >= 3 || !dg.seq.events[d.i]) return;
    dg.sel = { type: 'seq', i: d.i }; dgRender(); dgLabelStart(false);
    return;
  }
  if ((d.type === 'move' || d.type === 'resize') && d.moved) {
    const same = d.type === 'move' ? d.node.x === d.start.x && d.node.y === d.start.y : d.node.w === d.start.w && d.node.h === d.start.h;
    if (!same) { dgPush(d.before); dgState(); }
  }
}
// Re-attach the dragged end; the edge keeps its op, colour and label. One undo step.
function dgEndDrop(end, r) {
  if (dg.kind === 'flow') {
    const edge = dg.flow.edges[dg.sel.i];
    const next = Object.assign({}, edge, end === 'from' ? { from: r.key, fromPort: r.port } : { to: r.key, toPort: r.port });
    if (next.from === next.to && !(next.fromPort && next.toPort && next.fromPort !== next.toPort)) return;
    if (next.from === edge.from && next.to === edge.to && next.fromPort === edge.fromPort && next.toPort === edge.toPort) return;
    dgPush(); Object.assign(edge, next);
  } else {
    const n = dgMmGet(dg.sel.path), k = end + 'Port';
    if (!n || n[k] === r.port) return;
    dgPush(); n[k] = r.port;
  }
  dgRender();
}
// A participant dropped at world x: its new index is how many others' lifelines lie left of it.
function dgSeqReorder(id, wx) {
  const from = dg.seq.parts.findIndex(p => p.id === id);
  const to = dg.lay.parts.filter(p => p.id !== id && p.cx < wx).length;
  if (from >= 0 && to !== from) { dgPush(); const [p] = dg.seq.parts.splice(from, 1); dg.seq.parts.splice(to, 0, p); }
  dgRender();
}
function dgDblClick(e) {
  const hit = dgHit(document.elementFromPoint(e.clientX, e.clientY));
  if (!hit || hit.type === 'resize' || hit.type === 'port' || hit.type === 'end') return;
  e.preventDefault();
  dg.sel = hit.type === 'mm' ? { type: 'mm', path: hit.path } : hit.type === 'node' ? { type: 'node', id: hit.id } : { type: 'edge', i: hit.i };
  dgRender();
  dgLabelStart(false);
}

/* ── Keys: everything the modal handles, on the modal ── */
function dgKeyDown(e) {
  // A mind map's stage keeps Tab for "add a child"; everywhere else Tab walks the modal only.
  if (!(dg.kind === 'mindmap' && e.target === dgEl('dg-stage')) && dgTrapTab(dgEl('diagram-modal'), e)) return;
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
    if (dg.drag && dg.drag.type !== 'pan') dgCancelDrag();
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
  else if (dg.kind === 'sequence') done = false;
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
  // Focus left on the page (a click on the bar's empty space leaves it on <body>): Tab comes back in,
  // and every other key (Esc, Ctrl+Z/Y) still reaches the modal, which takes the focus back.
  document.addEventListener('keydown', e => {
    if (!dg.open || modal.contains(e.target)) return;
    if (e.key === 'Tab') { dgTrapTab(modal, e); return; }
    stage.focus();
    dgKeyDown(e);
  }, true);
  document.querySelectorAll('#dg-kind [data-kind]').forEach(b => b.addEventListener('click', () => dgSetKind(b.dataset.kind)));
  document.querySelectorAll('#dg-tools [data-tool]').forEach(b => b.addEventListener('click', back(() => dgSetTool(b.dataset.tool))));
  document.querySelectorAll('#dg-colors [data-color]').forEach(b => b.addEventListener('click', back(() => dgSetColor(b.dataset.color))));
  dgEl('dg-mm-child').addEventListener('click', () => dgMmAdd(false));
  dgEl('dg-mm-sibling').addEventListener('click', () => dgMmAdd(true));
  dgEl('dg-mm-rename').addEventListener('click', () => dgLabelStart(false));
  dgEl('dg-mm-auto').addEventListener('click', back(dgMmAutoLayout));
  dgEl('dg-color-auto').addEventListener('click', back(dgMmColorAuto));
  dgEl('dg-dl-svg').addEventListener('click', back(() => dgDownloadModal('svg')));
  dgEl('dg-dl-png').addEventListener('click', back(() => dgDownloadModal('png')));
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

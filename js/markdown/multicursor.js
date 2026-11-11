/* ── Multiple cursors (Ctrl+Alt+↑/↓ and Alt+Click, as in VS Code) ──
   A <textarea> has one caret, so the extra ones live here: `mc.cursors`
   holds every cursor as {a: anchor, h: head, goal: column for ↑/↓}, the
   native selection shows the primary one and an overlay above the
   textarea paints the others. While there is more than one cursor, the
   capture-phase listeners below take typing, deleting, paste, copy/cut
   and caret movement and apply them at every cursor in one undo step.
   Anything else (a plain click, Escape, a toolbar action, another shortcut,
   undo) drops back to the primary cursor first. */
const mc = { cursors: null, primary: null, value: '', s: 0, e: 0, applying: false, el: null };

const mcWordRe = /[\p{L}\p{N}_]/u;
const mcLineStart = (v, p) => v.lastIndexOf('\n', p - 1) + 1;
const mcLineEnd = (v, p) => { const n = v.indexOf('\n', p); return n === -1 ? v.length : n; };
const mcMin = c => Math.min(c.a, c.h);
const mcMax = c => Math.max(c.a, c.h);

function mcActive() { return !!(mc.cursors && mc.cursors.length > 1); }

/* The cursors are only valid for the text and primary selection they were
   made for. Any edit or caret move from elsewhere invalidates them. */
function mcValid() {
  if (!mcActive()) return false;
  if (editor.value === mc.value && editor.selectionStart === mc.s && editor.selectionEnd === mc.e) return true;
  mcClear();
  return false;
}

function mcClear() {
  if (!mc.cursors) return;
  mc.cursors = null; mc.primary = null;
  mcRender();
}

/* Show the primary cursor natively, remember the state, repaint the rest. */
function mcSync(scrollTo) {
  const p = mc.primary;
  editor.setSelectionRange(mcMin(p), mcMax(p), p.a > p.h ? 'backward' : 'forward');
  mc.value = editor.value; mc.s = editor.selectionStart; mc.e = editor.selectionEnd;
  mcRender(scrollTo);
}

/* Sort by position and fold cursors that now touch or overlap. */
function mcNormalize() {
  const list = mc.cursors.slice().sort((x, y) => mcMin(x) - mcMin(y) || mcMax(x) - mcMax(y));
  const out = [];
  list.forEach(c => {
    const last = out[out.length - 1];
    if (last && (mcMin(c) < mcMax(last) || (mcMin(c) === mcMax(last) && (c.a === c.h || last.a === last.h)))) {
      const lo = Math.min(mcMin(last), mcMin(c)), hi = Math.max(mcMax(last), mcMax(c));
      const keep = c === mc.primary ? c : last;
      if (keep.a <= keep.h) { keep.a = lo; keep.h = hi; } else { keep.a = hi; keep.h = lo; }
      out[out.length - 1] = keep;
      return;
    }
    out.push(c);
  });
  mc.cursors = out;
  if (!out.includes(mc.primary)) mc.primary = out[0];
}

/* Ctrl+Alt+↓ adds a cursor one line below the lowest cursor, Ctrl+Alt+↑
   one line above the highest, at the same column (or the line end when
   the line is shorter). The column sticks, so a short line in between
   does not pull the next cursors to the left. */
/* The native selection as a cursor. */
function mcFromNative() {
  const s = editor.selectionStart, e = editor.selectionEnd;
  const back = editor.selectionDirection === 'backward';
  return { a: back ? e : s, h: back ? s : e, goal: null };
}

function mcAdd(dir) {
  editor.focus();
  const v = editor.value;
  if (!mcValid()) { const c = mcFromNative(); mc.cursors = [c]; mc.primary = c; }
  const edge = mc.cursors.reduce((best, c) => (dir > 0 ? c.h > best.h : c.h < best.h) ? c : best);
  const ls = mcLineStart(v, edge.h);
  const col = edge.goal != null ? edge.goal : edge.h - ls;
  edge.goal = col;
  let ts;
  if (dir > 0) { const le = mcLineEnd(v, edge.h); if (le === v.length) return; ts = le + 1; }
  else { if (ls === 0) return; ts = mcLineStart(v, ls - 1); }
  const tl = mcLineEnd(v, ts) - ts;
  const h = ts + Math.min(col, tl);
  // A one-line selection is copied by column, like VS Code does.
  let a = h;
  if (edge.a !== edge.h && mcLineStart(v, edge.a) === ls) a = ts + Math.min(edge.a - ls, tl);
  const added = { a, h, goal: col };
  mc.cursors.push(added);
  mcNormalize();
  mcSync(added);
}

/* Replace each cursor's range with what `make(cursor, value)` returns:
   {from, to, text}. Each cursor ends after its inserted text. */
function mcReplace(make, coalesce) {
  const v = editor.value;
  mcNormalize();
  const edits = mc.cursors.map(c => ({ c, ...make(c, v) }));
  if (edits.every(x => x.from === x.to && !x.text)) return;
  let out = '', last = 0;
  edits.forEach(x => {
    const from = Math.max(x.from, last), to = Math.max(x.to, from);
    out += v.slice(last, from) + x.text;
    x.c.a = x.c.h = out.length; x.c.goal = null;
    last = to;
  });
  out += v.slice(last);
  const lo = Math.max(0, edits[0].from), hiFromEnd = v.length - last;
  undoMark(coalesce);
  mc.applying = true;
  // Only the changed span goes through the native call, which keeps the
  // scroll position; the undo step was recorded just above.
  editorSetRangeText(out.slice(lo, out.length - hiFromEnd), lo, v.length - hiFromEnd);
  mcNormalize();
  mcSync(mc.primary);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  mc.applying = false;
}

function mcInsert(text) {
  const lines = text.split(/\r?\n/);
  // Pasting as many lines as there are cursors gives each cursor one line.
  const each = lines.length === mc.cursors.length && lines.length > 1;
  mcNormalize();
  const order = new Map(mc.cursors.map((c, i) => [c, i]));
  mcReplace(c => ({ from: mcMin(c), to: mcMax(c), text: each ? lines[order.get(c)] : text }),
    text.length === 1 && text !== '\n');
}

function mcWordLeft(v, p) {
  let i = p;
  while (i > 0 && /\s/.test(v[i - 1])) i--;
  if (i > 0 && mcWordRe.test(v[i - 1])) { while (i > 0 && mcWordRe.test(v[i - 1])) i--; }
  else { while (i > 0 && !/\s/.test(v[i - 1]) && !mcWordRe.test(v[i - 1])) i--; }
  return i;
}
function mcWordRight(v, p) {
  let i = p;
  while (i < v.length && /\s/.test(v[i])) i++;
  if (i < v.length && mcWordRe.test(v[i])) { while (i < v.length && mcWordRe.test(v[i])) i++; }
  else { while (i < v.length && !/\s/.test(v[i]) && !mcWordRe.test(v[i])) i++; }
  return i;
}

function mcDelete(kind) {
  mcReplace((c, v) => {
    if (c.a !== c.h) return { from: mcMin(c), to: mcMax(c), text: '' };
    const p = c.h;
    if (kind === 'back') return { from: Math.max(0, p - 1), to: p, text: '' };
    if (kind === 'fwd') return { from: p, to: Math.min(v.length, p + 1), text: '' };
    if (kind === 'wordBack') return { from: mcWordLeft(v, p), to: p, text: '' };
    return { from: p, to: mcWordRight(v, p), text: '' };
  }, kind === 'back' || kind === 'fwd');
}

/* Arrow keys, Home and End for every cursor; Shift extends each one. */
function mcMove(key, shift, word) {
  const v = editor.value;
  mc.cursors.forEach(c => {
    const sel = c.a !== c.h;
    let h = c.h, goal = null;
    if (key === 'ArrowLeft') h = !shift && sel && !word ? mcMin(c) : word ? mcWordLeft(v, c.h) : Math.max(0, c.h - 1);
    else if (key === 'ArrowRight') h = !shift && sel && !word ? mcMax(c) : word ? mcWordRight(v, c.h) : Math.min(v.length, c.h + 1);
    else if (key === 'Home') {
      const ls = mcLineStart(v, c.h);
      let ind = ls; while (ind < v.length && (v[ind] === ' ' || v[ind] === '\t')) ind++;
      h = c.h === ind ? ls : ind;
    } else if (key === 'End') h = mcLineEnd(v, c.h);
    else {
      const ls = mcLineStart(v, c.h);
      goal = c.goal != null ? c.goal : c.h - ls;
      if (key === 'ArrowUp') {
        if (ls === 0) h = 0;
        else { const ts = mcLineStart(v, ls - 1); h = ts + Math.min(goal, ls - 1 - ts); }
      } else {
        const le = mcLineEnd(v, c.h);
        if (le === v.length) h = v.length;
        else { const ts = le + 1; h = ts + Math.min(goal, mcLineEnd(v, ts) - ts); }
      }
    }
    c.h = h; c.goal = goal;
    if (!shift) c.a = h;
  });
  mcNormalize();
  if (mc.cursors.length < 2) { const p = mc.primary; mcClear(); editor.setSelectionRange(mcMin(p), mcMax(p), p.a > p.h ? 'backward' : 'forward'); return; }
  mcSync(mc.primary);
}

function mcSelectedText() {
  mcNormalize();
  if (mc.cursors.every(c => c.a === c.h)) return null;
  return mc.cursors.map(c => editor.value.slice(mcMin(c), mcMax(c))).join('\n');
}

/* ── Painting the extra cursors ── */
function mcOverlay() {
  if (!mc.el) {
    const el = document.createElement('div');
    el.id = 'editor-cursors';
    el.setAttribute('aria-hidden', 'true');
    el.hidden = true;
    editor.parentNode.insertBefore(el, editor.nextSibling);
    mc.el = el;
  }
  return mc.el;
}

function mcRender(scrollTo) {
  const el = mcOverlay();
  if (!mcActive()) { el.hidden = true; el.textContent = ''; return; }
  const cs = getComputedStyle(editor);
  ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform', 'wordSpacing',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'tabSize']
    .forEach(k => { el.style[k] = cs[k]; });
  el.style.top = (editor.offsetTop + editor.clientTop) + 'px';
  el.style.left = (editor.offsetLeft + editor.clientLeft) + 'px';
  el.style.width = editor.clientWidth + 'px';
  el.style.height = editor.clientHeight + 'px';
  const esc = s => s.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  const v = editor.value;
  let html = '', at = 0;
  mc.cursors.forEach(c => {
    if (c === mc.primary) return;                 // the native caret shows it
    const lo = mcMin(c), hi = mcMax(c);
    const caret = '<span class="mc-caret' + (c === scrollTo ? ' mc-new' : '') + '">⁠</span>';
    html += esc(v.slice(at, lo));
    if (lo === hi) html += caret;
    else if (c.h === lo) html += caret + '<mark>' + esc(v.slice(lo, hi)) + '</mark>';
    else html += '<mark>' + esc(v.slice(lo, hi)) + '</mark>' + caret;
    at = hi;
  });
  el.innerHTML = html + esc(v.slice(at));
  el.hidden = false;
  // Keep a newly added cursor on screen, like the native caret is.
  const nw = el.querySelector('.mc-new');
  if (nw) {
    const top = nw.offsetTop, lh = nw.offsetHeight || parseFloat(cs.lineHeight) || 20;
    if (top < editor.scrollTop) editor.scrollTop = Math.max(0, top - lh);
    else if (top + lh > editor.scrollTop + editor.clientHeight) editor.scrollTop = top + 2 * lh - editor.clientHeight;
  }
  el.scrollTop = editor.scrollTop; el.scrollLeft = editor.scrollLeft;
}

/* ── Wiring ── */
editor.addEventListener('keydown', e => {
  const k = e.key, mod = e.ctrlKey || e.metaKey;
  if ((k === 'ArrowUp' || k === 'ArrowDown') && mod && e.altKey && !e.shiftKey) {
    e.preventDefault(); e.stopImmediatePropagation();
    mcAdd(k === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (!mcValid() || e.isComposing) return;
  if (/^(Shift|Control|Alt|AltGraph|Meta|CapsLock)$/.test(k)) return;
  const take = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if (k === 'Escape') { take(); mcClear(); return; }
  if (/^Arrow(Left|Right|Up|Down)$|^(Home|End)$/.test(k) && !e.altKey && !e.metaKey &&
      (!e.ctrlKey || k === 'ArrowLeft' || k === 'ArrowRight')) {
    take(); mcMove(k, e.shiftKey, e.ctrlKey); return;
  }
  if (k === 'Enter' && !mod && !e.altKey) { take(); mcInsert('\n'); return; }
  if (k === 'Tab' && !mod && !e.altKey && !e.shiftKey) { take(); mcInsert('  '); return; }
  // Typing and deleting arrive as `beforeinput`; keep the other keydown
  // handlers (list Enter, the search-match carets, ...) out of it.
  const altGr = e.getModifierState && e.getModifierState('AltGraph');
  if ((k === 'Backspace' || k === 'Delete') && !e.altKey && !e.metaKey) { e.stopImmediatePropagation(); return; }
  if (k.length === 1 && (altGr || (!mod && !e.altKey))) { e.stopImmediatePropagation(); return; }
  if (mod && !e.altKey && /^[cxv]$/i.test(k)) return;    // the clipboard events below
  mcClear();                                            // any other key works on one cursor
}, true);

editor.addEventListener('beforeinput', e => {
  if (!mcValid()) return;
  const t = e.inputType;
  const take = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if (t === 'insertText' && e.data != null) { take(); mcInsert(e.data); }
  else if (t === 'insertLineBreak' || t === 'insertParagraph') { take(); mcInsert('\n'); }
  else if (t === 'insertFromPaste' && (e.dataTransfer || e.data != null)) {
    take(); mcInsert(e.dataTransfer ? e.dataTransfer.getData('text/plain') : e.data);
  }
  else if (t === 'deleteContentBackward') { take(); mcDelete('back'); }
  else if (t === 'deleteContentForward') { take(); mcDelete('fwd'); }
  else if (t === 'deleteWordBackward') { take(); mcDelete('wordBack'); }
  else if (t === 'deleteWordForward') { take(); mcDelete('wordFwd'); }
  else mcClear();
}, true);

editor.addEventListener('copy', e => {
  if (!mcValid()) return;
  const text = mcSelectedText();
  if (text == null || !e.clipboardData) return;
  e.preventDefault();
  e.clipboardData.setData('text/plain', text);
}, true);
editor.addEventListener('cut', e => {
  if (!mcValid()) return;
  const text = mcSelectedText();
  if (text == null || !e.clipboardData) return;
  e.preventDefault();
  e.clipboardData.setData('text/plain', text);
  mcReplace(c => ({ from: mcMin(c), to: mcMax(c), text: '' }), false);
}, true);

editor.addEventListener('paste', e => {
  if (!mcValid() || !e.clipboardData) return;
  const text = e.clipboardData.getData('text/plain');
  if (!text) { mcClear(); return; }          // an image paste works on one cursor
  e.preventDefault(); e.stopImmediatePropagation();
  mcInsert(text);
}, true);

/* Alt+Click adds a cursor where the click lands; Alt+Click on an extra
   cursor removes it. The browser places its own caret on mousedown (or a
   selection, if the mouse drags), so the new cursor is read on mouseup and
   the native caret goes back to the primary cursor. */
function mcAltClick() {
  if (!mcValid()) { const c = mcFromNative(); mc.cursors = [c]; mc.primary = c; }
  const keep = mc.cursors.slice(), primary = mc.primary;
  document.addEventListener('mouseup', () => {
    const added = mcFromNative();
    mc.cursors = keep; mc.primary = primary;
    const hit = added.a === added.h && keep.find(c => c.a === c.h && c.h === added.h);
    if (hit) {
      mc.cursors = keep.filter(c => c !== hit);
      if (hit === primary) mc.primary = mc.cursors[mc.cursors.length - 1];
    } else mc.cursors.push(added);
    if (!mc.cursors.length) { mcClear(); return; }
    mcNormalize();
    if (mc.cursors.length < 2) {
      const p = mc.primary; mcClear();
      editor.setSelectionRange(mcMin(p), mcMax(p), p.a > p.h ? 'backward' : 'forward');
      return;
    }
    mcSync(hit ? null : added);
  }, { once: true });
}

editor.addEventListener('mousedown', e => {
  if (e.button === 0 && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) { mcAltClick(); return; }
  mcClear();
});
editor.addEventListener('compositionstart', () => mcClear());
editor.addEventListener('input', () => { if (!mc.applying) mcClear(); });
editor.addEventListener('scroll', () => {
  if (mc.el && !mc.el.hidden) { mc.el.scrollTop = editor.scrollTop; mc.el.scrollLeft = editor.scrollLeft; }
});
window.addEventListener('resize', () => { if (mcActive()) mcRender(); });

/* Toolbar actions, Tab and the other edits all go through setRangeText:
   they act on the primary cursor only, so the extra ones are dropped. */
const mcSetRangeText = editor.setRangeText;
editor.setRangeText = function (...args) {
  if (!mc.applying) mcClear();
  return mcSetRangeText.apply(this, args);
};

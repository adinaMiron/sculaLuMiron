/* Freehand sketches — a blank page, or any picture already in the chapter,
   drawn on with Mâzgilește's pen, highlighter and eraser, and written back
   into the chapter as a picture. No library — docs/FEATURES.md § U. */

// Mâzgilește's PALETTE (editor.html), first six. Document data: literal hex.
const SK_COLORS = ['#1e1d1c', '#3f6b52', '#b5493a', '#c79a3d', '#2f5d8a', '#7a4fae'];
const SK_WIDTHS = { 1: 3, 2: 6, 3: 12 };
const skEl = id => document.getElementById(id);
const sk = {
  open: false, loading: false, img: null, caret: [0, 0], w: 0, h: 0, f: 1,
  tool: 'pen', color: SK_COLORS[0], size: 2,
  strokes: [], redo: [], cur: null, pointers: new Set()
};

function skIsOpen() { return sk.open; }

/* Every picture token in the text, outside fenced code: ![alt](src "title")
   and ![[name.ext]] / ![[name.ext|…]] → {start, end, src, alt, embed}. */
function skImageTokens(text) {
  const out = [];
  let pos = 0, fenced = false;
  text.split('\n').forEach(line => {
    if (/^```/.test(line)) fenced = !fenced;
    else if (!fenced) {
      const re = /!\[\[([^\]|]+\.(?:png|jpe?g|gif|webp|svg|bmp|avif))(?:\|[^\]]*)?\]\]|!\[([^\]]*)\]\(([^)\s"]+)(?:\s+"[^"]*")?\)/gi;
      let m;
      while ((m = re.exec(line))) {
        out.push(m[1] !== undefined
          ? { start: pos + m.index, end: pos + m.index + m[0].length, src: m[1], alt: m[1].replace(/^.*\//, '').replace(/\.[^.]+$/, ''), embed: true }
          : { start: pos + m.index, end: pos + m.index + m[0].length, src: m[3], alt: m[2], embed: false });
      }
    }
    pos += line.length + 1;
  });
  return out;
}
// Does token `tk` render as the preview <img src="src">?
function skSameSrc(tk, src) {
  if (tk.src === src) return true;
  try { if (typeof resolveImageSrc === 'function' && resolveImageSrc(tk.src, false) === src) return true; } catch (e) {}
  return tk.embed && decodeURIComponent(src).endsWith(tk.src);
}
// The token behind a preview picture: the k-th <img> with that src ↔ the k-th token with it.
function skTokenFor(src, k) {
  const all = skImageTokens(editor.value).filter(tk => skSameSrc(tk, src));
  return all.length ? all[Math.min(k, all.length - 1)] : null;
}

/* ── Opening ── */
function skLoadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {   // a file:// or cross-site picture taints the canvas: nothing to read back
        const c = document.createElement('canvas'); c.width = c.height = 1;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0); x.getImageData(0, 0, 1, 1);
        resolve(img);
      } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = src;
  });
}
async function openSketch(opts) {
  const dgOpen = () => typeof dgIsOpen === 'function' && dgIsOpen();
  if (sk.open || sk.loading || dgOpen()) return;   // one full-screen modal at a time
  sk.caret = [editor.selectionStart, editor.selectionEnd];
  sk.img = null; sk.target = null;
  let pic = null;
  if (opts && opts.img) {
    const el = opts.img, src = el.getAttribute('src') || '';
    const same = [...document.querySelectorAll('#preview img')].filter(i => !i.closest('.md-diagram') && i.getAttribute('src') === src);
    sk.target = { src, k: Math.max(0, same.indexOf(el)) };
    sk.loading = true;
    try { pic = await skLoadImage(el.currentSrc || el.src); }
    catch (e) { if (window.ScuLaFolder) ScuLaFolder.toast(t('skImgBlocked')); return; }
    finally { sk.loading = false; }
    if (dgOpen()) return;   // the diagram opened while the picture was loading
    const long = Math.max(pic.naturalWidth, pic.naturalHeight) || 1, s = Math.min(1, 2400 / long);
    sk.w = Math.max(1, Math.round(pic.naturalWidth * s)); sk.h = Math.max(1, Math.round(pic.naturalHeight * s));
    sk.img = pic;
  } else { sk.w = 1600; sk.h = 1000; }
  sk.f = Math.max(1, Math.max(sk.w, sk.h) / 1600);
  sk.strokes = []; sk.redo = []; sk.cur = null; sk.pointers.clear();
  ['sk-base', 'sk-ink'].forEach(id => { const c = skEl(id); c.width = sk.w; c.height = sk.h; });
  const bx = skEl('sk-base').getContext('2d');
  bx.fillStyle = '#ffffff'; bx.fillRect(0, 0, sk.w, sk.h);
  if (pic) { bx.clearRect(0, 0, sk.w, sk.h); bx.drawImage(pic, 0, 0, sk.w, sk.h); }
  skRedraw();
  sk.open = true;
  skEl('sketch-modal').hidden = false;
  skChrome(); skFit();
  skEl('sk-stage').focus();
}
function closeSketch(force) {
  if (!sk.open) return true;
  if (!force && sk.strokes.length && !confirm(t('dgDiscardAsk'))) return false;
  sk.open = false; sk.cur = null; sk.pointers.clear();
  skEl('sketch-modal').hidden = true;
  editor.focus();
  return true;
}

/* ── Chrome ── */
function skChrome() {
  const m = skEl('sketch-modal');
  skEl('sk-title').setAttribute('data-i', sk.target ? 'skTitleEdit' : 'skTitleNew');
  skEl('sk-apply').setAttribute('data-i', sk.target ? 'dgUpdate' : 'dgInsert');
  m.querySelectorAll('[data-i]').forEach(el => { el.textContent = t(el.getAttribute('data-i')); });
  m.querySelectorAll('[data-i-title]').forEach(el => { el.title = t(el.getAttribute('data-i-title')); });
  m.querySelectorAll('[data-i-aria]').forEach(el => { el.setAttribute('aria-label', t(el.getAttribute('data-i-aria'))); });
  m.querySelectorAll('[data-sktool]').forEach(b => b.classList.toggle('active', b.dataset.sktool === sk.tool));
  m.querySelectorAll('[data-sksize]').forEach(b => b.classList.toggle('active', +b.dataset.sksize === sk.size));
  m.querySelectorAll('#sk-colors [data-color]').forEach(b => b.classList.toggle('active', b.dataset.color === sk.color));
  skEl('sk-undo').disabled = !sk.strokes.length;
  skEl('sk-redo').disabled = !sk.redo.length;
}
// Both canvases share one CSS size: the bitmap fitted into the stage, aspect kept.
function skFit() {
  const st = skEl('sk-stage').getBoundingClientRect();
  const s = Math.min((st.width - 16) / sk.w, (st.height - 16) / sk.h) || 1;
  ['sk-base', 'sk-ink'].forEach(id => { const c = skEl(id); c.style.width = (sk.w * s) + 'px'; c.style.height = (sk.h * s) + 'px'; });
}

/* ── Drawing (editor.html's smoothPathTo / drawHighlight) ── */
function skWidth(st) { return SK_WIDTHS[st.size] * sk.f * (st.tool === 'pen' ? 1 : 3); }
function skStroke(ctx, st) {
  const p = st.points;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = skWidth(st);
  ctx.strokeStyle = ctx.fillStyle = st.color;
  if (st.tool === 'hl') { ctx.globalAlpha = 0.4; ctx.globalCompositeOperation = 'multiply'; }
  if (st.tool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = ctx.fillStyle = '#000'; }
  if (p.length === 1) {
    ctx.beginPath(); ctx.arc(p[0].x, p[0].y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
  } else {
    // One path, quadratic through the midpoints: a highlighter never darkens where it crosses itself.
    ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
      ctx.quadraticCurveTo(p[i].x, p[i].y, mx, my);
    }
    ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
    ctx.stroke();
  }
  ctx.restore();
}
function skRedraw() {
  const ctx = skEl('sk-ink').getContext('2d');
  ctx.clearRect(0, 0, sk.w, sk.h);
  sk.strokes.forEach(st => skStroke(ctx, st));
  if (sk.cur) skStroke(ctx, sk.cur);
}
function skPoint(e) {
  const r = skEl('sk-ink').getBoundingClientRect();
  return { x: (e.clientX - r.left) * sk.w / r.width, y: (e.clientY - r.top) * sk.h / r.height };
}
function skDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  sk.pointers.add(e.pointerId);
  if (sk.pointers.size > 1) { sk.cur = null; skRedraw(); return; }   // a second finger: no stroke
  try { skEl('sk-stage').setPointerCapture(e.pointerId); } catch (_) {}
  sk.cur = { tool: sk.tool, color: sk.color, size: sk.size, points: [skPoint(e)], id: e.pointerId };
  skRedraw();
}
function skMove(e) {
  if (!sk.cur || sk.cur.id !== e.pointerId) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  (evs.length ? evs : [e]).forEach(ev => sk.cur.points.push(skPoint(ev)));
  skRedraw();
}
function skUp(e) {
  sk.pointers.delete(e.pointerId);
  const st = sk.cur;
  if (!st || st.id !== e.pointerId) return;
  sk.cur = null;
  if (e.type !== 'pointercancel') { delete st.id; sk.strokes.push(st); sk.redo = []; }
  skRedraw(); skChrome();
}
function skUndo() { if (sk.strokes.length) { sk.redo.push(sk.strokes.pop()); skRedraw(); skChrome(); } }
function skRedoStep() { if (sk.redo.length) { sk.strokes.push(sk.redo.pop()); skRedraw(); skChrome(); } }

/* ── Saving: one picture, one markdown undo step ── */
async function skApply() {
  if (!sk.open) return;
  const c = document.createElement('canvas');
  c.width = sk.w; c.height = sk.h;
  const x = c.getContext('2d');
  x.drawImage(skEl('sk-base'), 0, 0); x.drawImage(skEl('sk-ink'), 0, 0);
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const url = await imageBlobToDataUrl(blob);
  const val = editor.value;
  let start, end, text;
  if (sk.target) {
    let tk = skTokenFor(sk.target.src, sk.target.k);
    const alive = tk && val.slice(tk.start, tk.end).startsWith('![');
    if (alive) { start = tk.start; end = tk.end; text = `![${tk.alt}](${url})`; }
  }
  if (start === undefined) {
    const alt = t('skAlt');
    const n = 1 + skImageTokens(val).filter(tk => !tk.embed && tk.alt.startsWith(alt)).length;
    [start, end] = sk.caret;
    text = `![${alt} ${n}](${url})`;
    if (start > 0 && val[start - 1] !== '\n') text = '\n' + text;
    if (end >= val.length || val[end] !== '\n') text += '\n';
    if (sk.target && window.ScuLaFolder) ScuLaFolder.toast(t('skImgMoved'));
  }
  editor.focus();
  editor.setRangeText(text, start, end, 'end');
  updatePreview(); updateStatus(); scheduleAutosave();
  closeSketch(true);
}

/* ── ✎ on a picture in the preview ── */
function skDrawBtnHide() { const b = skEl('img-draw-btn'); if (b) { b.hidden = true; sk.hover = null; } }
function skDrawBtnShow(img) {
  const b = skEl('img-draw-btn'), r = img.getBoundingClientRect();
  sk.hover = img;
  b.hidden = false;
  b.style.left = (r.right - b.offsetWidth - 6) + 'px';
  b.style.top = (r.top + 6) + 'px';
}
function skPicture(el) { const img = el && el.closest && el.closest('#preview img'); return img && !img.closest('.md-diagram') ? img : null; }

function skInit() {
  const modal = skEl('sketch-modal'), pv = skEl('preview'), btn = skEl('img-draw-btn');
  if (!modal) return;
  const stage = skEl('sk-stage');
  skEl('sk-colors').innerHTML = SK_COLORS.map(c =>
    `<button type="button" class="dg-swatch" data-color="${c}" style="background:${c}" data-i-title="dgColorTip" data-i-aria="dgColorTip"></button>`).join('');
  modal.querySelectorAll('[data-sktool]').forEach(b => b.addEventListener('click', () => { sk.tool = b.dataset.sktool; skChrome(); }));
  modal.querySelectorAll('[data-sksize]').forEach(b => b.addEventListener('click', () => { sk.size = +b.dataset.sksize; skChrome(); }));
  modal.querySelectorAll('#sk-colors [data-color]').forEach(b => b.addEventListener('click', () => { sk.color = b.dataset.color; skChrome(); }));
  skEl('sk-undo').addEventListener('click', skUndo);
  skEl('sk-redo').addEventListener('click', skRedoStep);
  skEl('sk-cancel').addEventListener('click', () => closeSketch(false));
  skEl('sk-apply').addEventListener('click', skApply);
  stage.addEventListener('pointerdown', skDown);
  stage.addEventListener('pointermove', skMove);
  stage.addEventListener('pointerup', skUp);
  stage.addEventListener('pointercancel', skUp);
  modal.addEventListener('keydown', e => {
    if (dgTrapTab(modal, e)) return;   // Tab walks the modal only (diagram.js)
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && !e.altKey && k === 'z') { e.preventDefault(); if (e.shiftKey) skRedoStep(); else skUndo(); }
    else if (mod && !e.altKey && k === 'y') { e.preventDefault(); skRedoStep(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeSketch(false); }
    else if (!mod && !e.altKey && { p: 'pen', h: 'hl', e: 'eraser' }[k]) { e.preventDefault(); sk.tool = { p: 'pen', h: 'hl', e: 'eraser' }[k]; skChrome(); }
  });
  // Focus left on the page (a click on the bar's empty space leaves it on <body>): Tab comes back in.
  document.addEventListener('keydown', e => { if (sk.open && !modal.contains(e.target)) dgTrapTab(modal, e); }, true);
  window.addEventListener('resize', () => { if (sk.open) skFit(); });
  window.addEventListener('scula-ui-lang', () => { if (sk.open) skChrome(); });
  if (!pv || !btn) return;
  const touch = window.matchMedia('(hover: none)').matches;
  pv.addEventListener(touch ? 'click' : 'mouseover', e => { const img = skPicture(e.target); if (img) skDrawBtnShow(img); });
  pv.addEventListener('mouseleave', e => { if (e.relatedTarget !== btn) skDrawBtnHide(); });
  btn.addEventListener('mouseleave', e => { if (!skPicture(e.relatedTarget)) skDrawBtnHide(); });
  window.addEventListener('scroll', skDrawBtnHide, true);   // the preview or the pane around it
  // The preview is rebuilt on every keystroke (updatePreview): the picture under the ✎ is gone.
  new MutationObserver(skDrawBtnHide).observe(pv, { childList: true });
  btn.addEventListener('click', () => { const img = sk.hover; skDrawBtnHide(); if (img) openSketch({ img }); });
}
skInit();

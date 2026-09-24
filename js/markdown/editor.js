const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
let savedRange = null;

/* ── Selection helpers ── */
function saveSelection() {
  savedRange = { start: editor.selectionStart, end: editor.selectionEnd };
}
function restoreSelection() {
  if (savedRange) { editor.focus(); editor.setSelectionRange(savedRange.start, savedRange.end); }
}
/* ── Undo / redo ─────────────────────────────────────────────────
   The textarea's own history is unusable here: every toolbar action
   edits through setRangeText (which Chrome does not record) and
   opening a chapter replaces .value outright, so the native stack is
   either empty or still full of the previous file's states. The editor
   keeps its own stack of {value, start, end} snapshots instead.

   Two hooks catch every edit there is: `beforeinput` (typing, paste,
   cut, drag) and the setRangeText override below — which is what makes
   this cover every toolbar action, the line moves, Tab, the [[ ]]
   suggester and dictation without any of them having to remember to
   record. A whole-document replacement (opening a chapter, New, an
   import) calls undoReset() instead: that history belongs to a file
   that is no longer on screen. */
const UNDO_LIMIT = 200;         // snapshots kept, not keystrokes
const UNDO_COALESCE_MS = 700;   // one burst of typing is one undo step
let undoStack = [], redoStack = [], undoTime = 0, undoApplying = false;

function undoSnap() {
  return { value: editor.value, start: editor.selectionStart, end: editor.selectionEnd };
}
/* Called *before* the edit lands, so the snapshot is the state to come
   back to. `coalesce` folds this edit into the burst already recorded. */
function undoMark(coalesce) {
  if (undoApplying) return;
  const top = undoStack[undoStack.length - 1];
  const near = coalesce && top && (Date.now() - undoTime) < UNDO_COALESCE_MS;
  undoTime = Date.now();
  redoStack.length = 0;                        // a new edit forks the history
  if (!near && !(top && top.value === editor.value)) {
    undoStack.push(undoSnap());
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  }
  paintUndo();
}
function undoReset() { undoStack = []; redoStack = []; undoTime = 0; paintUndo(); }
function undoScrollToCaret() {
  const at = editorMirrorAt(editor.selectionStart);
  if (at.top < editor.scrollTop || at.top > editor.scrollTop + editor.clientHeight - at.lineHeight)
    editor.scrollTop = Math.max(0, at.top - editor.clientHeight / 2);
}
function undoApply(s) {
  undoApplying = true;
  editor.value = s.value;
  editor.focus();
  editor.setSelectionRange(s.start, s.end);
  undoApplying = false;
  undoScrollToCaret();
  updatePreview(); updateStatus(); scheduleAutosave();
  paintUndo();
}
function undoEdit() {
  if (!undoStack.length) return;
  redoStack.push(undoSnap());
  undoApply(undoStack.pop());
  undoTime = 0;                 // the next keystroke starts a fresh burst
}
function redoEdit() {
  if (!redoStack.length) return;
  undoStack.push(undoSnap());
  undoApply(redoStack.pop());
  undoTime = 0;
}
function paintUndo() {
  const u = document.getElementById('btn-undo'), r = document.getElementById('btn-redo');
  if (u) u.disabled = !undoStack.length;
  if (r) r.disabled = !redoStack.length;
}

/* Typing, paste, cut, drops — plus the browser's own history events, so a
   context-menu Undo lands in the same stack Ctrl+Z uses. Typing and single
   deletions coalesce; a newline, a paste or a cut each start their own step. */
editor.addEventListener('beforeinput', e => {
  if (e.inputType === 'historyUndo') { e.preventDefault(); undoEdit(); return; }
  if (e.inputType === 'historyRedo') { e.preventDefault(); redoEdit(); return; }
  undoMark((e.inputType === 'insertText' && !/\n/.test(e.data || '')) ||
           e.inputType === 'deleteContentBackward' ||
           e.inputType === 'deleteContentForward');
});

/* Every programmatic edit in this file goes through setRangeText, so one
   override records them all and no new toolbar action can forget to. */
const editorSetRangeText = editor.setRangeText.bind(editor);
editor.setRangeText = function (...args) {
  undoMark(false);
  return editorSetRangeText(...args);
};

function insertAtCursor(text) {
  editor.focus();
  const s = editor.selectionStart, e = editor.selectionEnd;
  editor.setRangeText(text, s, e, 'end');
  updatePreview(); updateStatus();
}

function insertImportanceAtCursor(marker) {
  const select = document.getElementById('importance-insert-select');
  if (!marker) return;
  insertAtCursor(marker);
  select.value = '';
}

/* ── Toolbar actions ── */
function wrapSelection(before, after) {
  editor.focus();
  const start = editor.selectionStart, end = editor.selectionEnd;
  const sel = editor.value.substring(start, end);
  const replacement = before + (sel || 'text') + after;
  editor.setRangeText(replacement, start, end, 'select');
  if (!sel) editor.setSelectionRange(start + before.length, start + before.length + 4);
  updatePreview(); updateStatus();
}

function applyTextColor(color) {
  applyInlineColor('color', color);
}

function applyHighlightColor(color) {
  applyInlineColor('background-color', color);
}

function applyInlineColor(property, color) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return;
  applyInlineStyle(property, color);
}

function applyInlineStyle(property, value) {
  editor.focus();
  const start = editor.selectionStart, end = editor.selectionEnd;
  const source = editor.value;
  const selected = source.slice(start, end) || 'text';
  const opening = source.slice(0, start).match(/<span style="([^"]*)">$/);
  // A second toolbar action on the same selected text updates its span.
  // Partial selections still get their own span, which the parser can nest.
  if (opening && source.slice(end).startsWith('</span>') &&
      !selected.includes('<span') && !selected.includes('</span>')) {
    const styles = opening[1].split(';').map(s => s.trim()).filter(Boolean)
      .filter(s => s.split(':', 1)[0].trim() !== property);
    styles.push(`${property}:${value}`);
    const spanStart = start - opening[0].length;
    const replacement = `<span style="${styles.join(';')}">${selected}</span>`;
    editor.setRangeText(replacement, spanStart, end + '</span>'.length, 'select');
    const textStart = spanStart + replacement.indexOf('>') + 1;
    editor.setSelectionRange(textStart, textStart + selected.length);
  } else {
    const replacement = `<span style="${property}:${value}">${selected}</span>`;
    editor.setRangeText(replacement, start, end, 'select');
    const textStart = start + replacement.indexOf('>') + 1;
    editor.setSelectionRange(textStart, textStart + selected.length);
  }
  updatePreview(); updateStatus();
}

function insertHeading(level) {
  if (!level) return;
  editor.focus();
  const start = editor.selectionStart, val = editor.value;
  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = val.indexOf('\n', start);
  const end = lineEnd === -1 ? val.length : lineEnd;
  const stripped = val.substring(lineStart, end).replace(/^#{1,6}\s*/, '');
  editor.setRangeText('#'.repeat(parseInt(level)) + ' ' + stripped, lineStart, end, 'end');
  document.getElementById('heading-select').value = '';
  updatePreview(); updateStatus();
}

function insertList() {
  editor.focus();
  const start = editor.selectionStart, end = editor.selectionEnd;
  const sel = editor.value.substring(start, end);
  if (sel) {
    editor.setRangeText(sel.split('\n').map(l => '- ' + l).join('\n'), start, end, 'end');
  } else {
    const val = editor.value;
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = val.indexOf('\n', start);
    const lineEndPos = lineEnd === -1 ? val.length : lineEnd;
    const line = val.substring(lineStart, lineEndPos);
    if (!line.startsWith('- ')) editor.setRangeText('- ' + line, lineStart, lineEndPos, 'end');
    else insertAtCursor('\n- ');
  }
  updatePreview(); updateStatus();
}

function insertOrderedList() {
  editor.focus();
  const start = editor.selectionStart, end = editor.selectionEnd;
  const sel = editor.value.substring(start, end);
  if (sel) {
    const lines = sel.split('\n').map((l, i) => `${i + 1}. ${l}`).join('\n');
    editor.setRangeText(lines, start, end, 'end');
  } else {
    const val = editor.value;
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = val.indexOf('\n', start);
    const lineEndPos = lineEnd === -1 ? val.length : lineEnd;
    const line = val.substring(lineStart, lineEndPos);
    if (!/^\d+\.\s/.test(line)) {
      // find what number to continue from by looking at the line above
      const prevText = val.substring(0, lineStart);
      const prevLines = prevText.split('\n');
      let nextNum = 1;
      for (let i = prevLines.length - 1; i >= 0; i--) {
        const m = prevLines[i].match(/^(\d+)\.\s/);
        if (m) { nextNum = parseInt(m[1]) + 1; break; }
        if (prevLines[i].trim() !== '') break;
      }
      editor.setRangeText(`${nextNum}. ${line}`, lineStart, lineEndPos, 'end');
    } else {
      const m = line.match(/^(\d+)\./);
      const nextNum = m ? parseInt(m[1]) + 1 : 1;
      insertAtCursor(`\n${nextNum}. `);
    }
  }
  updatePreview(); updateStatus();
}

function insertTodoList() {
  editor.focus();
  const start = editor.selectionStart, end = editor.selectionEnd;
  const sel = editor.value.substring(start, end);
  if (sel) {
    editor.setRangeText(sel.split('\n').map(l => '- [ ] ' + l).join('\n'), start, end, 'end');
  } else {
    const val = editor.value;
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = val.indexOf('\n', start);
    const lineEndPos = lineEnd === -1 ? val.length : lineEnd;
    const line = val.substring(lineStart, lineEndPos);
    if (!/^[-*+]\s+\[[ xX]\]\s/.test(line)) editor.setRangeText('- [ ] ' + line, lineStart, lineEndPos, 'end');
    else insertAtCursor('\n- [ ] ');
  }
  updatePreview(); updateStatus();
}

// The three middle states stay plain Markdown markers after an unchecked
// task box. A checked box is always done; an unmarked open box is to do.
const TASK_STATUS_MARKERS = { inwork: '~inwork', onhold: '~onhold', blocked: '~blocked' };
const TASK_STATUS_LEAD_RE = /^(~(?:inwork|onhold|blocked))(?:[ \t]+|$)/;
const TASK_LINE_RE = /^([ \t]*[-*+][ \t]+)\[([ xX])\]([ \t]+|$)(.*)$/;
function taskSetLineStatus(line, status) {
  const match = line.match(TASK_LINE_RE);
  if (!match) return line;
  const body = match[4].replace(TASK_STATUS_LEAD_RE, '');
  const marker = TASK_STATUS_MARKERS[status];
  return match[1] + (status === 'done' ? '[x]' : '[ ]') + (match[3] || (marker ? ' ' : ''))
    + (marker ? marker + (body ? ' ' : '') : '') + body;
}

function taskCreateLineStatus(line, status) {
  const match = line.match(/^([ \t]*)(?:([-*+])[ \t]+)?(.*)$/);
  const marker = TASK_STATUS_MARKERS[status];
  return match[1] + (match[2] || '-') + (status === 'done' ? ' [x]' : ' [ ]')
    + (marker ? ' ' + marker : '') + (match[3] ? ' ' + match[3] : '');
}

// Change existing tasks, or make the line(s) at the caret into tasks.
function setTaskStatus(status) {
  const select = document.getElementById('task-status-select');
  if (select) select.value = '';
  if (!['todo', 'inwork', 'onhold', 'blocked', 'done'].includes(status)) return;
  editor.focus();
  const start = editor.selectionStart, end = editor.selectionEnd;
  const val = editor.value;
  const from = val.lastIndexOf('\n', start - 1) + 1;
  const nl = val.indexOf('\n', end);
  const to = nl === -1 ? val.length : nl;
  const old = val.slice(from, to);
  const lines = old.split('\n');
  const hasTask = lines.some(line => TASK_LINE_RE.test(line));
  const next = lines.map(line => hasTask ? taskSetLineStatus(line, status)
    : (line.trim() || lines.length === 1 ? taskCreateLineStatus(line, status) : line)).join('\n');
  if (next === old) return;
  editor.setRangeText(next, from, to, 'end');
  updatePreview(); updateStatus(); scheduleAutosave();
}

function insertLineBelow() {
  editor.focus();
  const start = editor.selectionStart;
  const val = editor.value;
  const lineEnd = val.indexOf('\n', start);
  const lineEndPos = lineEnd === -1 ? val.length : lineEnd;
  editor.setRangeText('\n', lineEndPos, lineEndPos, 'end');
  updatePreview(); updateStatus();
}
function insertLineAbove() {
  editor.focus();
  const start = editor.selectionStart;
  const val = editor.value;
  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  editor.setRangeText('\n', lineStart, lineStart, 'start');
  updatePreview(); updateStatus();
}

function moveLineDown() {
  editor.focus();
  const start = editor.selectionStart, end = editor.selectionEnd;
  const val = editor.value;
  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  const nl = val.indexOf('\n', start);
  const lineEnd = nl === -1 ? val.length : nl;
  if (lineEnd === val.length) return; // already the last line
  const nextNl = val.indexOf('\n', lineEnd + 1);
  const nextLineEnd = nextNl === -1 ? val.length : nextNl;
  const currentLine = val.slice(lineStart, lineEnd);
  const nextLine = val.slice(lineEnd + 1, nextLineEnd);
  editor.setRangeText(nextLine + '\n' + currentLine, lineStart, nextLineEnd, 'select');
  const shift = nextLine.length + 1;
  editor.setSelectionRange(start + shift, end + shift);
  updatePreview(); updateStatus();
}
function moveLineUp() {
  editor.focus();
  const start = editor.selectionStart, end = editor.selectionEnd;
  const val = editor.value;
  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  if (lineStart === 0) return; // already the first line
  const nl = val.indexOf('\n', start);
  const lineEnd = nl === -1 ? val.length : nl;
  const prevLineStart = val.lastIndexOf('\n', lineStart - 2) + 1;
  const prevLineEnd = lineStart - 1;
  const currentLine = val.slice(lineStart, lineEnd);
  const prevLine = val.slice(prevLineStart, prevLineEnd);
  editor.setRangeText(currentLine + '\n' + prevLine, prevLineStart, lineEnd, 'select');
  const shift = prevLine.length + 1;
  editor.setSelectionRange(start - shift, end - shift);
  updatePreview(); updateStatus();
}

/* Ctrl+L — select the current line. Press again (line already fully
   selected) to widen to the whole paragraph: the run of non-blank lines
   the caret sits in. */
function selectLineOrParagraph() {
  editor.focus();
  const val = editor.value;
  const start = editor.selectionStart, end = editor.selectionEnd;
  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  const nl = val.indexOf('\n', end);
  const lineEnd = nl === -1 ? val.length : nl;

  if (start === lineStart && end === lineEnd && lineStart !== lineEnd) {
    // line already selected → grow to the paragraph
    let pStart = lineStart;
    while (pStart > 0) {
      const prevStart = val.lastIndexOf('\n', pStart - 2) + 1;
      if (val.slice(prevStart, pStart - 1).trim() === '') break;
      pStart = prevStart;
    }
    let pEnd = lineEnd;
    while (pEnd < val.length) {
      const nextNl = val.indexOf('\n', pEnd + 1);
      const nextEnd = nextNl === -1 ? val.length : nextNl;
      if (val.slice(pEnd + 1, nextEnd).trim() === '') break;
      pEnd = nextEnd;
    }
    editor.setSelectionRange(pStart, pEnd);
  } else {
    editor.setSelectionRange(lineStart, lineEnd);
  }
  updateStatus();
}

function toggleTodoDone() {
  editor.focus();
  const start = editor.selectionStart, end = editor.selectionEnd;
  const val = editor.value;
  const toggleLine = l => {
    const task = l.match(TASK_LINE_RE);
    if (task) {
      return taskSetLineStatus(l, task[2] === ' ' ? 'done' : 'todo');
    }
    if (/^\s*[-*+]\s+/.test(l)) {
      return l.replace(/^(\s*[-*+]\s+)/, '$1[ ] ');
    }
    return l;
  };
  if (start !== end) {
    const sel = val.substring(start, end);
    editor.setRangeText(sel.split('\n').map(toggleLine).join('\n'), start, end, 'end');
  } else {
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = val.indexOf('\n', start);
    const lineEndPos = lineEnd === -1 ? val.length : lineEnd;
    const line = val.substring(lineStart, lineEndPos);
    editor.setRangeText(toggleLine(line), lineStart, lineEndPos, 'end');
  }
  updatePreview(); updateStatus(); scheduleAutosave();
}

function insertFontSize(size) {
  if (!size) return;
  applyInlineStyle('font-size', `${size}px`);
  document.getElementById('size-select').value = '';
}

/* ── Image URL modal ── */
function openImageModal() {
  saveSelection();
  document.getElementById('image-modal').classList.add('open');
  document.getElementById('img-url').focus();
}
function closeImageModal() {
  document.getElementById('image-modal').classList.remove('open');
  ['img-url','img-alt','img-title'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('pick-name').textContent = t('noFileChosen');
  const thumb = document.getElementById('img-thumb');
  thumb.style.display = 'none'; thumb.src = '';
  document.getElementById('img-local-input').value = '';
}
function handleLocalImage(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    document.getElementById('img-url').value = dataUrl;
    document.getElementById('pick-name').textContent = file.name;
    if (!document.getElementById('img-alt').value)
      document.getElementById('img-alt').value = file.name.replace(/\.[^.]+$/, '');
    const thumb = document.getElementById('img-thumb');
    thumb.src = dataUrl; thumb.style.display = 'block';
  };
  reader.readAsDataURL(file);
}
function insertImage() {
  const url = document.getElementById('img-url').value.trim();
  const alt = document.getElementById('img-alt').value.trim() || 'image';
  const title = document.getElementById('img-title').value.trim();
  if (!url) { document.getElementById('img-url').focus(); return; }
  const md = title ? `![${alt}](${url} "${title}")` : `![${alt}](${url})`;
  closeImageModal(); restoreSelection(); insertAtCursor(md);
}

/* ── Paste an image from the clipboard ──
   Ctrl+V with a picture on the clipboard writes it into the markdown as a
   data: URI, so the picture is part of the .md file itself — every save
   route (workbook, folder mirror, download, share, HTML export) already
   carries the text, so it carries the picture too, and moving the file
   never breaks it.
   A data: URI is text in a textarea that autosaves on every keystroke, so
   anything past PASTE_KEEP_BYTES is downscaled before it goes in. */
const PASTE_MAX_DIM = 1600;             // px on the long edge after shrinking
const PASTE_KEEP_BYTES = 512 * 1024;    // below this, keep the original bytes
const PASTE_JPEG_Q = 0.85;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('read failed'));
    r.readAsDataURL(blob);
  });
}
function imageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}
// Transparency only survives PNG; without it JPEG is several times smaller.
function canvasHasAlpha(ctx, w, h) {
  try {
    const d = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
    return false;
  } catch (e) { return true; }   // tainted canvas — assume the worst, keep PNG
}
async function imageBlobToDataUrl(blob) {
  // Small enough, or a vector we would only ruin by rasterising: keep as-is.
  if (blob.size <= PASTE_KEEP_BYTES || blob.type === 'image/svg+xml')
    return blobToDataUrl(blob);
  let img;
  try { img = await imageFromBlob(blob); }
  catch (e) { return blobToDataUrl(blob); }   // not decodable here — paste raw
  const long = Math.max(img.naturalWidth, img.naturalHeight) || 1;
  const scale = Math.min(1, PASTE_MAX_DIM / long);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const shrunk = canvasHasAlpha(ctx, w, h)
    ? canvas.toDataURL('image/png')
    : canvas.toDataURL('image/jpeg', PASTE_JPEG_Q);
  const original = await blobToDataUrl(blob);
  return shrunk.length < original.length ? shrunk : original;
}
// The picture on the clipboard, whichever way it got there: a file copied in
// the file manager (dt.files) or a screenshot / "Copy image" (dt.items).
function clipboardImage(dt) {
  if (!dt) return null;
  const file = Array.from(dt.files || []).find(f => /^image\//i.test(f.type));
  if (file) return file;
  const item = Array.from(dt.items || [])
    .find(i => i.kind === 'file' && /^image\//i.test(i.type));
  return item ? item.getAsFile() : null;
}
async function handleEditorPaste(e) {
  const dt = e.clipboardData;
  // Text wins whenever the clipboard carries any: a copy out of a word
  // processor brings both, and there the text is what was meant.
  if (dt && dt.getData('text/plain').trim()) return;
  const blob = clipboardImage(dt);
  if (!blob) return;
  e.preventDefault();
  // Where the caret was before the await — decoding takes a moment.
  const start = editor.selectionStart, end = editor.selectionEnd;
  const name = (blob.name || '').replace(/\.[^.]+$/, '').replace(/[\[\]]/g, '').trim();
  try {
    const dataUrl = await imageBlobToDataUrl(blob);
    editor.focus();
    editor.setRangeText(`![${name || t('pastedImageAlt')}](${dataUrl})`, start, end, 'end');
    updatePreview(); updateStatus(); scheduleAutosave();
    if (typeof ScuLaFolder !== 'undefined')
      ScuLaFolder.toast(t('imagePasted', Math.max(1, Math.round(dataUrl.length / 1024))));
  } catch (err) {
    if (typeof ScuLaFolder !== 'undefined') ScuLaFolder.toast(t('imagePasteFailed'));
  }
}
editor.addEventListener('paste', handleEditorPaste);

/* ── Image Explorer Panel ── */
let workingFolderHandle = null;
let selectedImageEntry = null;   // { relativePath, fileHandle, objectUrl }
const IMAGE_EXTS = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg','.avif','.bmp','.ico','.tiff','.tif']);

function isImage(name) {
  const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
  return IMAGE_EXTS.has(ext);
}

/* ── Responsive helpers ── */
function isSmallScreen() { return window.matchMedia('(max-width: 1024px)').matches; }
function isMobile() { return window.matchMedia('(max-width: 700px)').matches; }

function setView(view) {
  document.body.classList.remove('view-source', 'view-preview');
  document.body.classList.add('view-' + view);
  document.getElementById('tab-source').classList.toggle('active', view === 'source');
  document.getElementById('tab-preview').classList.toggle('active', view === 'preview');
}

// Every side panel, paired with the toolbar button that opens it.
const PANELS = {
  'wb-panel': 'btn-workbooks',
  'img-panel': 'btn-explorer',
  'find-panel': 'btn-find',
  'nav-panel': 'btn-nav'
};

function syncBackdrop() {
  const anyOpen = Object.keys(PANELS).some(id => !document.getElementById(id).classList.contains('collapsed'));
  document.getElementById('panel-backdrop').classList.toggle('show', anyOpen && isSmallScreen());
}

function closeAllPanels() {
  Object.keys(PANELS).forEach(id => {
    document.getElementById(id).classList.add('collapsed');
    document.getElementById(PANELS[id]).classList.remove('active');
  });
  syncBackdrop();
}

// Closes only the Caiete (workbooks) panel — used when picking a chapter
// from it, so browsing other panels (search, nav, …) is left undisturbed.
function closeWbPanel() {
  document.getElementById('wb-panel').classList.add('collapsed');
  document.getElementById(PANELS['wb-panel']).classList.remove('active');
  syncBackdrop();
}

function togglePanelById(id) {
  const panel = document.getElementById(id);
  const btn = document.getElementById(PANELS[id]);
  const willOpen = panel.classList.contains('collapsed');
  // On small screens the panels overlay the text, so only one at a time
  if (willOpen && isSmallScreen()) {
    Object.keys(PANELS).forEach(other => {
      if (other === id) return;
      document.getElementById(other).classList.add('collapsed');
      document.getElementById(PANELS[other]).classList.remove('active');
    });
  }
  const collapsed = panel.classList.toggle('collapsed');
  btn.classList.toggle('active', !collapsed);
  syncBackdrop();
  // The workbooks panel floats free on phones/tablets — give it a position
  // (saved, or a sensible default) the moment it becomes visible.
  if (id === 'wb-panel' && !collapsed) positionWbPanelIfFloating();
}

function toggleWorkbooks() { togglePanelById('wb-panel'); }
function togglePanel() { togglePanelById('img-panel'); }
function toggleNav() { togglePanelById('nav-panel'); }

const TB_COLLAPSED_KEY = 'scula:toolbar-collapsed';

function toggleToolbarCollapse() {
  const bar = document.querySelector('.toolbar');
  const btn = document.getElementById('btn-toolbar-toggle');
  const collapsed = bar.classList.toggle('collapsed');
  btn.classList.toggle('active', !collapsed);
  if (isSmallScreen()) {
    try { store.set(TB_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch (e) {}
  }
}

async function initToolbarCollapse() {
  if (!isSmallScreen()) return;
  let saved = null;
  try { saved = await store.get(TB_COLLAPSED_KEY); } catch (e) {}
  const collapsed = saved === '1';
  document.querySelector('.toolbar').classList.toggle('collapsed', collapsed);
  document.getElementById('btn-toolbar-toggle').classList.toggle('active', !collapsed);
}
// Opening the search panel is always a request to search: refresh what is in
// it and put the cursor in the query box. A keyboard shortcut fired while it
// is open but not focused means the same thing, so that focuses rather than
// closes — but a click on the toolbar button or the ✕ always toggles.
function toggleFind(fromClick) {
  const q = document.getElementById('find-q');
  if (!fromClick && findIsOpen() && document.activeElement !== q) { q.focus(); q.select(); return; }
  togglePanelById('find-panel');
  if (findIsOpen()) {
    fdRefresh();
    q.focus();
    q.select();
  }
}
function findIsOpen() {
  const p = document.getElementById('find-panel');
  return !!p && !p.classList.contains('collapsed');
}

async function setWorkingFolder() {
  if (!window.showDirectoryPicker) {
    alert(t('noFsApi'));
    return;
  }
  try {
    workingFolderHandle = await window.showDirectoryPicker({ mode: 'read' });
    document.getElementById('folder-name').textContent = '📂 ' + workingFolderHandle.name;
    selectedImageEntry = null;
    document.getElementById('img-detail').classList.remove('visible');
    await buildTree();
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e);
  }
}

async function buildTree() {
  const container = document.getElementById('tree-container');
  container.innerHTML = '<div class="tree-loading">' + t('scanningFolder') + '</div>';
  try {
    const root = await buildDirNode(workingFolderHandle, '');
    container.innerHTML = '';
    if (!root) {
      container.innerHTML = '<div class="tree-loading">' + t('noImagesFound') + '</div>';
      return;
    }
    container.appendChild(root);
  } catch(e) {
    container.innerHTML = '<div class="tree-loading">' + t('errorReadingFolder') + '</div>';
    console.error(e);
  }
}

async function buildDirNode(dirHandle, pathPrefix) {
  const dirEl = document.createElement('div');
  dirEl.className = 'tree-dir';

  const childrenEl = document.createElement('div');
  childrenEl.className = 'tree-children';

  let hasContent = false;

  // collect entries, sort: dirs first, then files
  const entries = [];
  for await (const [name, handle] of dirHandle.entries()) {
    entries.push({ name, handle });
  }
  entries.sort((a, b) => {
    if (a.handle.kind !== b.handle.kind) return a.handle.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const { name, handle } of entries) {
    if (handle.kind === 'directory') {
      const subPath = pathPrefix ? pathPrefix + '/' + name : name;
      const subNode = await buildDirNode(handle, subPath);
      if (subNode) { childrenEl.appendChild(subNode); hasContent = true; }
    } else if (handle.kind === 'file' && isImage(name)) {
      const relPath = pathPrefix ? pathPrefix + '/' + name : name;
      const itemEl = createImageItem(name, relPath, handle);
      childrenEl.appendChild(itemEl);
      hasContent = true;
    }
  }

  if (!hasContent) return null;

  // Only add the dir label if this isn't the root (pathPrefix is empty for root)
  if (pathPrefix !== '') {
    const labelEl = document.createElement('div');
    labelEl.className = 'tree-dir-label';
    const arrow = document.createElement('span');
    arrow.className = 'tree-arrow';
    arrow.textContent = '▶';
    const nameEl = document.createElement('span');
    nameEl.className = 'tree-dir-name';
    nameEl.textContent = '📁 ' + dirHandle.name;
    labelEl.appendChild(arrow);
    labelEl.appendChild(nameEl);
    labelEl.addEventListener('click', () => {
      const open = childrenEl.classList.toggle('open');
      arrow.classList.toggle('open', open);
    });
    dirEl.appendChild(labelEl);
  } else {
    // root: auto-expand
    childrenEl.classList.add('open');
  }

  dirEl.appendChild(childrenEl);
  return dirEl;
}

function createImageItem(name, relPath, fileHandle) {
  const item = document.createElement('div');
  item.className = 'tree-img-item';

  const thumb = document.createElement('img');
  thumb.className = 'tree-thumb';
  thumb.alt = name;

  // load thumbnail lazily
  fileHandle.getFile().then(file => {
    const url = URL.createObjectURL(file);
    thumb.src = url;
    thumb.dataset.objUrl = url;
  });

  const label = document.createElement('span');
  label.className = 'tree-img-name';
  label.textContent = name;
  label.title = relPath;

  item.appendChild(thumb);
  item.appendChild(label);

  item.addEventListener('click', () => {
    // deselect previous
    document.querySelectorAll('.tree-img-item.selected').forEach(el => el.classList.remove('selected'));
    item.classList.add('selected');
    showImageDetail(name, relPath, fileHandle, thumb.dataset.objUrl || thumb.src);
  });

  item.addEventListener('dblclick', () => {
    if (selectedImageEntry) insertSelectedImage();
  });

  return item;
}

function showImageDetail(name, relPath, fileHandle, objUrl) {
  selectedImageEntry = { relPath, fileHandle, objUrl };
  const detail = document.getElementById('img-detail');
  document.getElementById('detail-img').src = objUrl;
  document.getElementById('detail-info').textContent = relPath;
  detail.classList.add('visible');
}

function insertSelectedImage() {
  if (!selectedImageEntry) return;
  if (isMobile()) {
    setView('source');
    document.getElementById('img-panel').classList.add('collapsed');
    document.getElementById('btn-explorer').classList.remove('active');
    syncBackdrop();
  }
  insertAtCursor(selectedImageEntry.relPath);
}

/* ── Tab key in editor ── */
function handleTab(e) {
  if (e.key === 'Tab') {
    if (wikiSuggest.open) return;      // the "[[" suggester takes Tab to accept
    e.preventDefault();
    const s = editor.selectionStart, end = editor.selectionEnd;
    editor.setRangeText('  ', s, end, 'end');
    updatePreview();
  }
}


/* ── File operations ── */
function newFile() {
  if (wbCurrentId) flushChapter();
  else if (editor.value && !confirm(t('confirmDiscard'))) return;
  editor.value = '';
  undoReset();
  detachChapter();
  document.getElementById('current-file').textContent = 'untitled.md';
  updatePreview(); updateStatus();
}
function openFile() { document.getElementById('file-input').click(); }
function handleFileOpen(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    editor.value = e.target.result;
    undoReset();
    detachChapter();
    document.getElementById('current-file').textContent = file.name;
    updatePreview(); updateStatus();
  };
  reader.readAsText(file);
  event.target.value = '';
}

function importDocx() {
  if (!window.mammoth) {
    alert(t('mammothNotLoaded'));
    return;
  }
  document.getElementById('docx-input').click();
}

function handleDocxImport(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const arrayBuffer = e.target.result;
      const result = await mammoth.convertToHtml({ arrayBuffer });

      // Convert the HTML output to Markdown
      const md = htmlToMarkdown(result.value);

      if (editor.value.trim() && !confirm(t('confirmReplace'))) {
        event.target.value = '';
        return;
      }

      editor.value = md;
      undoReset();
      const mdName = file.name.replace(/\.docx$/i, '.md');
      detachChapter();
      document.getElementById('current-file').textContent = mdName;
      updatePreview(); updateStatus();

      if (result.messages && result.messages.length) {
        const warnings = result.messages.filter(m => m.type === 'warning');
        if (warnings.length) console.warn('DOCX import warnings:', warnings);
      }
    } catch (err) {
      alert(t('importFailed', err.message));
      console.error(err);
    }
    event.target.value = '';
  };
  reader.readAsArrayBuffer(file);
}

function htmlToMarkdown(html) {
  // Use a temporary DOM element to parse the HTML
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  function processNode(node, listCtx) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    const children = () => Array.from(node.childNodes).map(n => processNode(n, listCtx)).join('');

    switch (tag) {
      case 'h1': return '\n# ' + children().trim() + '\n';
      case 'h2': return '\n## ' + children().trim() + '\n';
      case 'h3': return '\n### ' + children().trim() + '\n';
      case 'h4': return '\n#### ' + children().trim() + '\n';
      case 'h5': return '\n##### ' + children().trim() + '\n';
      case 'h6': return '\n###### ' + children().trim() + '\n';

      case 'p': {
        const inner = children().trim();
        return inner ? '\n' + inner + '\n' : '';
      }

      case 'strong': case 'b': return '**' + children() + '**';
      case 'em':     case 'i': return '*' + children() + '*';
      case 'code':             return '`' + children() + '`';

      case 'pre': {
        const codeEl = node.querySelector('code');
        const lang = (codeEl && codeEl.className.match(/language-(\w+)/))?.[1] || '';
        const content = codeEl ? codeEl.textContent : node.textContent;
        return '\n```' + lang + '\n' + content + '\n```\n';
      }

      case 'a': {
        const href = node.getAttribute('href') || '';
        const text = children().trim() || href;
        return `[${text}](${href})`;
      }

      case 'img': {
        const src  = node.getAttribute('src') || '';
        const alt  = node.getAttribute('alt') || '';
        return `![${alt}](${src})`;
      }

      case 'br': return '\n';
      case 'hr': return '\n---\n';

      case 'ul': {
        return '\n' + Array.from(node.children).map(li => {
          const content = processNode(li, 'ul').trim();
          return '- ' + content;
        }).join('\n') + '\n';
      }

      case 'ol': {
        return '\n' + Array.from(node.children).map((li, i) => {
          const content = processNode(li, 'ol').trim();
          return `${i + 1}. ` + content;
        }).join('\n') + '\n';
      }

      case 'li': return children().trim();

      case 'table': {
        const rows = Array.from(node.querySelectorAll('tr'));
        if (!rows.length) return '';
        const toRow = tr => '| ' + Array.from(tr.querySelectorAll('th,td')).map(c => c.textContent.trim().replace(/\|/g, '\\|')).join(' | ') + ' |';
        const header = rows[0];
        const isHeaderRow = header.querySelector('th') !== null;
        const sep = '| ' + Array.from(header.querySelectorAll('th,td')).map(() => '---').join(' | ') + ' |';
        const dataRows = isHeaderRow ? rows.slice(1) : rows;
        const lines = [toRow(header), sep, ...dataRows.map(toRow)];
        return '\n' + lines.join('\n') + '\n';
      }

      case 'blockquote': return '\n> ' + children().trim().split('\n').join('\n> ') + '\n';

      // skip these wrapper elements, just process children
      case 'div': case 'span': case 'section':
      case 'article': case 'main': case 'header':
      case 'footer': case 'body':
        return children();

      default: return children();
    }
  }

  let md = Array.from(tmp.childNodes).map(n => processNode(n, null)).join('');

  // clean up excessive blank lines
  md = md.replace(/\n{3,}/g, '\n\n').trim();
  return md;
}
// Everything this page writes goes through the shared nav block: into
// <default folder>/markdown on desktop, the OS share sheet on a phone, or a
// download. It reports the outcome in the shared toast itself.
const saveOut = (filename, blob) => ScuLaFolder.save(filename, blob);

function exportHtml() {
  const mdFilename = document.getElementById('current-file').textContent || 'document.md';
  const htmlFilename = mdFilename.replace(/\.(md|txt)$/i, '') + '.html';
  const title = mdFilename.replace(/\.(md|txt)$/i, '');
  const bodyHtml = parseMarkdown(editor.value, {forExport: true});
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; max-width: 800px; margin: 40px auto; padding: 0 24px; line-height: 1.8; color: #222; }
    h1, h2, h3, h4, h5, h6 { font-family: 'Trebuchet MS', sans-serif; line-height: 1.3; margin: 1.4em 0 0.5em; }
    h1 { font-size: 2em; border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.2em; }
    h3 { font-size: 1.25em; } h4 { font-size: 1.1em; } h5 { font-size: 1em; } h6 { font-size: 0.9em; color: #555; }
    p { margin: 0 0 1em; }
    ul, ol { margin: 0 0 1em 1.5em; padding: 0; }
    li { margin: 0.3em 0; }
    a { color: #4a6cf7; text-decoration: none; } a:hover { text-decoration: underline; }
    .wikilink { color: #6b5bd6; border-bottom: 1px dashed #b3aae8; }
    .wikilink.is-unresolved { color: #999; border-bottom-color: #ccc; }
    .md-tag { display: inline-block; color: #3f7a63; background: #e6f0ea; border-radius: 10px; padding: 0 7px; font-size: 0.9em; }
    .md-date { display: inline-block; color: #8a6a1f; background: #f6ecd4; border-radius: 10px; padding: 0 7px; font-size: 0.9em; white-space: nowrap; }
    .md-geo { display: inline-block; color: #3f7a63; background: #e4efe8; border-radius: 10px; padding: 0 7px; font-size: 0.9em; }
    .md-geo .geo-note { color: #8a8f8b; font-style: italic; }
    .md-color { font-family: 'Courier New', monospace; font-size: 0.92em; white-space: nowrap; }
    .md-color-sw { display: inline-block; width: 0.85em; height: 0.85em; margin-right: 0.35em; vertical-align: -0.12em; border-radius: 3px; border: 1px solid #ccc; }
    .md-assignee { color: #C4643C; font-weight: 600; }
    .task-list { list-style: none; margin-left: 0; }
    .task-status { display: inline-block; margin-right: 6px; padding: 1px 6px; border-radius: 4px; font-size: 0.82em; font-weight: 700; background: #f4f4f4; }
    .task-status-inwork { color: #736c24; }
    .task-status-onhold { color: #5f6c64; }
    .task-status-blocked { color: #a1421c; }
    .md-imp { display: inline-block; padding: 0 8px; margin-right: 5px; border-radius: 10px; font-size: 0.85em; font-weight: 600; white-space: nowrap; }
    .md-imp-ico { margin-right: 4px; }
    .md-imp-nice { color: #3F7A63; background: #E6F0EA; border: 1px solid #B9D5C8; }
    .md-imp-important { color: #8A6114; background: #FAF0D8; border: 1px solid #E6CE93; }
    .md-imp-vital { color: #A1421C; background: #FBE8E0; border: 1px solid #EEBCA6; }
    :is(p, li, h1, h2, h3, h4, h5, h6):has(> .md-imp-nice) { border-left: 3px solid #6E9E8A; padding-left: 10px; }
    :is(p, li, h1, h2, h3, h4, h5, h6):has(> .md-imp-important) { border-left: 3px solid #D9A441; padding-left: 10px; }
    :is(p, li, h1, h2, h3, h4, h5, h6):has(> .md-imp-vital) { border-left: 3px solid #C4643C; padding-left: 10px; }
    .md-causal { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin: 10px 0; padding: 7px 10px; border-left: 3px solid #B8B04A; border-radius: 4px; background: #FAF8E9; }
    li > .md-causal { margin: 4px 0; }
    .md-cause-term { padding: 1px 9px; border-radius: 10px; font-size: 0.92em; background: #F2EFD6; border: 1px solid #DDD7A8; }
    .md-cause-arrow { font-family: 'Courier New', monospace; font-weight: 700; }
    .md-cause-pos { color: #3F7A63; }
    .md-cause-neg { color: #A1421C; }
    .md-cause-delay { opacity: 0.75; }
    .md-timeline { margin: 14px 0; padding: 12px 14px 6px; border: 1px solid #e2e2e2; border-radius: 8px; background: #fafafa; }
    .tl-svg { display: block; width: 100%; height: 98px; overflow: visible; }
    .tl-axis { stroke: #c9c9c9; stroke-width: 2; }
    .tl-tick { stroke: #c9c9c9; stroke-width: 1; stroke-dasharray: 2 3; }
    .tl-head path { fill: #c9c9c9; }
    .tl-dot { fill: #8A6A1F; stroke: #ffffff; stroke-width: 2; }
    .tl-date { fill: #666; font-family: 'Trebuchet MS', sans-serif; font-size: 13px; }
    .tl-idx { fill: #ffffff; font-family: 'Trebuchet MS', sans-serif; font-size: 11px; font-weight: 700; }
    .tl-list { counter-reset: tl-n; list-style: none; margin: 10px 0 4px; padding: 0; }
    .tl-item { display: flex; gap: 10px; align-items: baseline; padding: 6px 0; border-top: 1px solid #e8e8e8; }
    .tl-item:first-child { border-top: none; }
    .tl-item::before { counter-increment: tl-n; content: counter(tl-n); flex: 0 0 auto; width: 18px; height: 18px; line-height: 18px; text-align: center; border-radius: 50%; font-size: 11px; font-weight: 700; color: #ffffff; background: #8A6A1F; }
    .tl-when { flex: 0 0 auto; color: #8a6a1f; font-family: 'Courier New', monospace; font-size: 0.9em; white-space: nowrap; }
    .tl-what { flex: 1 1 auto; min-width: 0; }
    .tl-what img { max-width: 100%; height: auto; border-radius: 4px; margin: 4px 0 0; }
    @media (max-width: 640px) { .tl-item { flex-wrap: wrap; } .tl-what { flex-basis: 100%; } }
    strong { font-weight: 700; }
    em { font-style: italic; }
    img { max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0; }
    code { background: #f4f4f4; border: 1px solid #e0e0e0; border-radius: 3px; padding: 1px 5px; font-family: 'Courier New', monospace; font-size: 0.88em; }
    pre { background: #f6f8fa; border: 1px solid #e0e0e0; border-radius: 6px; padding: 14px 18px; overflow-x: auto; margin: 0 0 1em; }
    pre code { background: none; border: none; padding: 0; font-size: 0.9em; }
    .md-diagram { margin: 14px 0; padding: 12px; border: 1px solid #e2e2e2; border-radius: 8px; background: #fafafa; overflow: auto; }
    .dg-svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
    .dg-label, .dg-edge-label { fill: #222; font-family: 'Trebuchet MS', sans-serif; }
    .dg-edge-line { stroke: #666; }
    .dg-edge-head { fill: #666; }
    .dg-edge-label-bg { fill: #fafafa; }
    .code-block { position: relative; }
    .code-block pre { margin: 0 0 1em; }
    .code-copy { position: absolute; top: 8px; right: 8px; font-family: 'Trebuchet MS', sans-serif; font-size: 0.8em; padding: 3px 10px; color: #444; background: #fff; border: 1px solid #d0d0d0; border-radius: 4px; cursor: pointer; opacity: 0; transition: opacity 0.15s; }
    .code-block:hover .code-copy, .code-copy:focus { opacity: 1; }
    .code-copy:hover { background: #f0f0f0; }
    .code-copy.copied { color: #3F7A63; border-color: #B9D5C8; background: #E6F0EA; }
    table { border-collapse: collapse; width: 100%; margin: 0 0 1em; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; }
    th { background: #f0f0f0; font-weight: 600; }
    tr:nth-child(even) td { background: #fafafa; }
  </style>
</head>
<body>
${bodyHtml}
  <scr` + `ipt>
  document.querySelectorAll('.code-copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var code = btn.parentElement.querySelector('code');
      var text = code ? code.innerText : '';
      var done = function () {
        btn.textContent = 'Copiat';
        btn.classList.add('copied');
        setTimeout(function () { btn.textContent = 'Copiază'; btn.classList.remove('copied'); }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {});
      } else {
        var ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
        document.body.removeChild(ta);
      }
    });
  });
  <\/scr` + `ipt>
</body>
</html>`;
  saveOut(htmlFilename, new Blob([fullHtml], { type: 'text/html' }));
}

/* ── Table builder ── */
function openTableModal() {
  saveSelection();
  document.getElementById('table-modal').classList.add('open');
  rebuildTableGrid();
}
function closeTableModal() {
  document.getElementById('table-modal').classList.remove('open');
}
function rebuildTableGrid() {
  const rows = Math.min(20, Math.max(1, parseInt(document.getElementById('tbl-rows').value) || 1));
  const cols = Math.min(10, Math.max(1, parseInt(document.getElementById('tbl-cols').value) || 1));
  const container = document.getElementById('table-preview-grid');
  const table = document.createElement('table');
  table.className = 'tbl-builder';

  // Header row
  const thead = document.createElement('thead');
  const hrow = document.createElement('tr');
  for (let c = 0; c < cols; c++) {
    const th = document.createElement('th');
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = `Header ${c + 1}`;
    inp.dataset.row = 'h';
    inp.dataset.col = c;
    th.appendChild(inp);
    hrow.appendChild(th);
  }
  thead.appendChild(hrow);
  table.appendChild(thead);

  // Alignment row
  const tbody = document.createElement('tbody');
  const arow = document.createElement('tr');
  arow.className = 'align-row';
  for (let c = 0; c < cols; c++) {
    const td = document.createElement('td');
    const sel = document.createElement('select');
    sel.className = 'align-select';
    sel.dataset.col = c;
    [['left','⬅ Left'],['center','↔ Center'],['right','➡ Right']].forEach(([v, l]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = l; sel.appendChild(o);
    });
    td.appendChild(sel);
    arow.appendChild(td);
  }
  tbody.appendChild(arow);

  // Data rows
  for (let r = 0; r < rows; r++) {
    const drow = document.createElement('tr');
    for (let c = 0; c < cols; c++) {
      const td = document.createElement('td');
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.placeholder = `Cell`;
      inp.dataset.row = r;
      inp.dataset.col = c;
      td.appendChild(inp);
      drow.appendChild(td);
    }
    tbody.appendChild(drow);
  }
  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);
}

function insertTable() {
  const rows = Math.min(20, Math.max(1, parseInt(document.getElementById('tbl-rows').value) || 1));
  const cols = Math.min(10, Math.max(1, parseInt(document.getElementById('tbl-cols').value) || 1));
  const grid = document.getElementById('table-preview-grid');

  // headers
  const headers = Array.from(grid.querySelectorAll('thead input')).map(i => i.value || i.placeholder);
  // alignments
  const aligns = Array.from(grid.querySelectorAll('.align-select')).map(s => s.value);
  // data cells
  const dataInputs = Array.from(grid.querySelectorAll('tbody tr:not(.align-row) input'));
  const dataRows = [];
  for (let r = 0; r < rows; r++) {
    dataRows.push(dataInputs.slice(r * cols, r * cols + cols).map(i => i.value || ' '));
  }

  // Build separator row with alignment markers
  const sep = aligns.map(a => a === 'center' ? ':---:' : a === 'right' ? '---:' : ':---');

  const pad = (cells) => '| ' + cells.join(' | ') + ' |';
  const lines = [
    pad(headers),
    pad(sep),
    ...dataRows.map(pad)
  ];
  closeTableModal();
  restoreSelection();
  insertAtCursor('\n' + lines.join('\n') + '\n');
}

/* ── Code block ── */
/* Three entries to write over — the shapes a timeline can hold: a sentence,
   a link, and a picture. docs/FEATURES.md § R. */
function insertTimeline() {
  const y = new Date().getFullYear();
  insertAtCursor(
    `\n#${y - 1} - !` + t('timelineSeedText') +
    `\n#${y}-01 - ![` + t('timelineSeedLink') + `](https://exemplu.ro)` +
    `\n#${y}-06-15 - ![` + t('timelineSeedImage') + `](imagine.png)\n`);
}

function insertCodeBlock() {
  editor.focus();
  const start = editor.selectionStart, end = editor.selectionEnd;
  const sel = editor.value.substring(start, end);
  if (sel && !sel.includes('\n')) {
    // inline code
    editor.setRangeText('`' + sel + '`', start, end, 'end');
  } else {
    // fenced code block
    const code = sel || 'your code here';
    editor.setRangeText('\n```\n' + code + '\n```\n', start, end, 'end');
  }
  updatePreview(); updateStatus();
}

/* ── Link modal ── */
function openLinkModal() {
  saveSelection();
  const sel = editor.value.substring(editor.selectionStart, editor.selectionEnd);
  if (sel) document.getElementById('link-text').value = sel;
  document.getElementById('link-modal').classList.add('open');
  document.getElementById('link-url').focus();
}
function closeLinkModal() {
  document.getElementById('link-modal').classList.remove('open');
  ['link-url','link-text','link-title'].forEach(id => document.getElementById(id).value = '');
}
function insertLink() {
  const url = document.getElementById('link-url').value.trim();
  const text = document.getElementById('link-text').value.trim() || url;
  const title = document.getElementById('link-title').value.trim();
  if (!url) { document.getElementById('link-url').focus(); return; }
  const md = title ? `[${text}](${url} "${title}")` : `[${text}](${url})`;
  closeLinkModal(); restoreSelection(); insertAtCursor(md);
}

/* ── Help modal ── */
function paintHelp() { document.getElementById('help-body').innerHTML = t('helpBody'); }
function openHelpModal() { paintHelp(); document.getElementById('help-modal').classList.add('open'); }
function closeHelpModal() { document.getElementById('help-modal').classList.remove('open'); }


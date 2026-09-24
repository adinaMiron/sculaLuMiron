/* ── Responsive initialisation ── */
function applyResponsiveDefaults() {
  if (isSmallScreen()) {
    // Panels overlay the content, so start them closed
    closeAllPanels();
  } else {
    // Desktop: workbooks and nav visible by default, image explorer closed
    ['wb-panel', 'nav-panel'].forEach(id => {
      document.getElementById(id).classList.remove('collapsed');
      document.getElementById(PANELS[id]).classList.add('active');
    });
    ['img-panel', 'find-panel'].forEach(id => {
      document.getElementById(id).classList.add('collapsed');
      document.getElementById(PANELS[id]).classList.remove('active');
    });
    document.getElementById('panel-backdrop').classList.remove('show');
  }
}

/* ── Workbooks panel width: drag-to-resize, persisted per browser ── */
const WB_WIDTH_KEY = 'scula-wb-panel-width';
function initWbPanelResize() {
  const panel = document.getElementById('wb-panel');
  const handle = document.getElementById('wb-resize-handle');
  if (!panel || !handle) return;

  const MIN_W = 160, MAX_W = 640;
  let saved = null;
  try { saved = localStorage.getItem(WB_WIDTH_KEY); } catch (e) {}
  if (saved && !isSmallScreen()) {
    const w = Math.max(MIN_W, Math.min(MAX_W, parseFloat(saved) || MIN_W));
    panel.style.setProperty('--panel-w', w + 'px');
  }
  let startX = 0, startW = 0;

  function onMove(e) {
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const w = Math.max(MIN_W, Math.min(MAX_W, startW + (x - startX)));
    panel.style.setProperty('--panel-w', w + 'px');
  }
  function onUp() {
    panel.classList.remove('resizing');
    handle.classList.remove('active');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    try { localStorage.setItem(WB_WIDTH_KEY, panel.style.getPropertyValue('--panel-w').trim()); } catch (e) {}
  }
  function onDown(e) {
    startX = e.touches ? e.touches[0].clientX : e.clientX;
    startW = panel.getBoundingClientRect().width;
    panel.classList.add('resizing');
    handle.classList.add('active');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
    e.preventDefault();
  }
  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, { passive: false });
}

/* ── Workbooks panel position: floating window on phones/tablets ──
   On a wide screen the panel is a normal flex column. Below the 1024px
   breakpoint (see the media query above) it becomes a floating window
   instead of a full-height drawer, and the person can drag it wherever
   suits them; the position survives a reload through wbMetaSet(), the same
   IndexedDB "meta" store (docs/MAP.md § Workbooks) that already remembers
   the last open chapter. */
const WB_POS_KEY = 'panelPos';
function wbPanelFloating() { return isSmallScreen(); }

function placeWbPanel(x, y) {
  const panel = document.getElementById('wb-panel');
  const pad = 8;
  const w = panel.offsetWidth || 240;
  const h = panel.offsetHeight || 320;
  const maxX = Math.max(pad, window.innerWidth - w - pad);
  const maxY = Math.max(pad, window.innerHeight - h - pad);
  panel.style.left = Math.min(Math.max(pad, x), maxX) + 'px';
  panel.style.top = Math.min(Math.max(pad, y), maxY) + 'px';
}

// Under the header/toolbar, out of the way of the editor's first lines.
function defaultWbPanelPos() { return { x: 10, y: 128 }; }

async function positionWbPanelIfFloating() {
  if (!wbPanelFloating()) return;
  const panel = document.getElementById('wb-panel');
  if (panel.classList.contains('collapsed')) return;
  let pos = null;
  try { pos = await wbMetaGet(WB_POS_KEY); } catch (e) {}
  const d = (pos && typeof pos.x === 'number' && typeof pos.y === 'number') ? pos : defaultWbPanelPos();
  placeWbPanel(d.x, d.y);
}

function initWbPanelDrag() {
  const panel = document.getElementById('wb-panel');
  const header = panel && panel.querySelector('.panel-header');
  if (!panel || !header) return;
  let start = null;
  header.addEventListener('pointerdown', e => {
    if (!wbPanelFloating()) return;           // desktop: not draggable
    if (e.target.closest('button')) return;   // the ✕ close button still clicks
    const r = panel.getBoundingClientRect();
    start = { px: e.clientX, py: e.clientY, x: r.left, y: r.top };
    panel.classList.add('dragging');
    try { header.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  header.addEventListener('pointermove', e => {
    if (!start) return;
    placeWbPanel(start.x + (e.clientX - start.px), start.y + (e.clientY - start.py));
  });
  const endDrag = () => {
    if (!start) return;
    start = null;
    panel.classList.remove('dragging');
    const x = parseFloat(panel.style.left) || 0;
    const y = parseFloat(panel.style.top) || 0;
    wbMetaSet(WB_POS_KEY, { x, y }).catch(() => {});
  };
  header.addEventListener('pointerup', endDrag);
  header.addEventListener('pointercancel', endDrag);
}

setView('source');
applyResponsiveDefaults();
loadWorkbooks().then(async () => { await openKanbanTaskLink(); cloudBoot(); }, cloudBoot);   // § O: the tree first, then Drive
initToolbarCollapse();
initWbPanelResize();
initWbPanelDrag();

let lastSmall = isSmallScreen();
window.addEventListener('resize', () => {
  const nowSmall = isSmallScreen();
  if (nowSmall !== lastSmall) {   // only react when crossing the breakpoint
    lastSmall = nowSmall;
    applyResponsiveDefaults();
  }
  syncBackdrop();
  // Keep the floating panel on screen through an orientation change/resize
  // without treating that as a new chosen position worth persisting.
  const wbPanel = document.getElementById('wb-panel');
  if (wbPanelFloating() && !wbPanel.classList.contains('collapsed')) {
    placeWbPanel(parseFloat(wbPanel.style.left) || 0, parseFloat(wbPanel.style.top) || 0);
  }
});


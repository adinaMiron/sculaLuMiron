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

/* ── First run on a device (docs/FEATURES.md § E "A new device") ──
   A phone or a second computer opens the page with an empty database, no
   folder and no Google account. Instead of leaving the person to find the
   two buttons that fix that, ask once: which folder, then whether to bring
   the chapters down from Drive. The answer is remembered in the workbooks'
   own meta store, so it is per device like everything it sets up.

   A device that already has chapters, a folder or a Google connection is
   not new — it is marked as welcomed without being asked. Automated
   browsers skip it too (every Playwright check starts on an empty
   database); a check that wants it sets window.__sculaWelcome first. */
const WELCOME_KEY = 'welcomed';

async function welcomeMaybe() {
  if (navigator.webdriver && !window.__sculaWelcome) return;
  try { if (await wbMetaGet(WELCOME_KEY)) return; } catch (e) { return; }
  try { await ScuLaFolder.ready; } catch (e) {}
  if (wbBooks.length || wbChapters.length || ScuLaFolder.isSet() || gsConnected()) {
    wbMetaSet(WELCOME_KEY, Date.now()).catch(() => {});
    return;
  }
  welcomeStep('folder');
  document.getElementById('welcome-modal').classList.add('open');
}

function welcomeStep(step) {
  document.getElementById('welcome-step-folder').hidden = step !== 'folder';
  document.getElementById('welcome-step-cloud').hidden = step !== 'cloud';
  welcomePaint();
  const b = document.getElementById(step === 'folder' ? 'btn-welcome-folder' : 'btn-welcome-yes');
  if (b) setTimeout(() => b.focus(), 40);
}

// The two texts that depend on the device and on the answer so far, so
// data-i cannot carry them.
function welcomePaint() {
  const desk = ScuLaFolder.supported();
  document.getElementById('welcome-folder-text').textContent = t(desk ? 'welcomeFolderDesktop' : 'welcomeFolderMobile');
  document.getElementById('btn-welcome-folder').textContent = t(desk ? 'welcomeFolderBtn' : 'welcomeFolderBtnMobile');
  const f = ScuLaFolder.name();
  document.getElementById('welcome-cloud-text').textContent = (f ? t('welcomeCloudFolder', f) : '') + t('welcomeCloudText');
}
window.addEventListener('scula-ui-lang', () => setTimeout(() => {
  if (document.getElementById('welcome-modal').classList.contains('open')) welcomePaint();
}, 0));

// Desktop: the real directory picker; a cancelled picker leaves the question
// open. A phone has no picker, so the "where do files go" sheet stands in —
// it opens above this modal, and the next question waits underneath it.
async function welcomePickFolder() {
  if (!ScuLaFolder.supported()) { ScuLaFolder.chooser(); welcomeStep('cloud'); return; }
  if (await ScuLaFolder.pick()) welcomeStep('cloud');
}
function welcomeFolderLater() { welcomeStep('cloud'); }

/* Yes goes through the same press as the header buttons, so a new device
   gets exactly what "⇩ Sync to folder" does: the Google sign-in popup first
   (still inside this click's gesture), the chapters pulled from Drive, then
   written into the folder. Without a folder the ☁ button's path does the
   pulling. No reads the chosen folder alone, in case it already held a
   markdown tree from another device. */
async function welcomeCloud(yes) {
  document.getElementById('welcome-modal').classList.remove('open');
  wbMetaSet(WELCOME_KEY, Date.now()).catch(() => {});
  if (yes && location.protocol === 'file:') { ScuLaFolder.toast(t('cloudNoFile')); yes = false; }
  if (!yes) {
    if (wbFolderMode()) await syncAllToFolder({ cloud: false });
    return;
  }
  if (wbFolderMode()) await syncAllToFolder();
  else await cloudButton();
  if (gsConnected() && !wbChapters.length) wbSay(t('welcomeCloudEmpty'), true);
}

setView('source');
applyResponsiveDefaults();
loadWorkbooks().then(async () => { await openKanbanTaskLink(); cloudBoot(); welcomeMaybe(); }, cloudBoot);   // § O: the tree first, then Drive
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


# MAP.md — where everything lives

Line anchors so you can `sed -n 'A,Bp' file` instead of scanning. Numbers
drift by a few lines after edits; **search by the name in the right-hand
column** if a range looks wrong. Re-verify with `grep -n` when in doubt.

Shared shape of all three files:

```
<style>  …app CSS, :root palette at the very top…  </style>
<body>
<nav id="site-nav">  + its own <style> + <script>   ← triplicated block
…app markup…
<script>  …app logic, one IIFE/closure…  </script>
```

## The triplicated block (byte-identical in all three files)

`index.html:221-864` · `editor.html:416-1059` · `markdown-editor.html:843-1486`

Two features share it, because both must exist before any app script runs:

| Part | What |
|---|---|
| `#site-nav` links + `#navLangBtn` | page links, UI-language toggle → `docs/I18N.md` |
| `#navFolderBtn` + `window.ScuLaFolder` | where saved files go → `docs/FEATURES.md` § D |
| `#scula-sheet` | the destination chooser (phones/tablets) |
| `#scula-toast` | the shared bottom toast, `ScuLaFolder.toast(msg, action, fn)` |

Inside the block's `<script>`, in order: current-page highlight ·
`LANG_KEY`/lang toggle · `SUBDIR` map + `T` (its own private ro/en
strings) · `supported`/`canShareFiles`/`currentMode` · toast ·
`paintFolder` · IndexedDB helpers (`scula-fs`/`handles`, keys `root` and
`mode`) · `permitted`/`pick`/`forget`/`setMode` · the chooser sheet ·
`dir`/`freeName`/`download`/`shareable`/`shareOut`/`save` ·
`window.ScuLaFolder = {…}`.

**`currentMode()` is the switch that matters** — `"folder"` (a handle is
set), `"share"` (no directory picker but `navigator.canShare({files})`,
i.e. every phone), `"download"`. Read it before assuming what a save does.

Any edit here goes into **all three** files — see the diff snippet in
`CLAUDE.md`.

---

## index.html — 1647 lines · "Caiet vocal" (voice dictation)

`lang="ro"`. **The only app with a working i18n system** — copy its pattern.

| Lines | Contents |
|---|---|
| 11–217 | App CSS. `:root` palette at **12–37** (earth-palette tokens, migrated) |
| 220–863 | **Shared nav + `ScuLaFolder`** (identical in all 3 files) |
| 864–997 | Markup: header, controls, textarea, settings sheet |
| 998–1645 | App script, numbered sections below |

Script sections (comment banners `/* === N. Title === */`):

| Line | Section |
|---|---|
| 1003 | **1. i18n** — `I18N` object (`ro:` 1006 / `en:` 1047), `t()` at 1090, `UI` at 1089 |
| 1093 | 2. Providers |
| 1118 | 3. Settings store — `KEY` 1120, `store` 1121 w/ memory fallback, `save()` 1252, `load()` 1253 |
| 1150 | 4. DOM refs |
| 1181 | 5. Language / engine chips |
| 1196 | **6. UI language** — `applyUILang()` **1200** |
| 1218 | 7. Settings sheet |
| 1290 | 8. Secure-context check |
| 1295 | 9. Recording (MediaRecorder) + segment rotation |
| 1442 | 10. Transcription queue |
| 1536 | 11. Browser dictation (Web Speech API) |
| 1595 | 12. File import |
| 1609 | 13. Copy / share / **save → `ScuLaFolder.save()`** / clear |
| 1641 | 14. Init |

**Two independent language axes — do not conflate:**
- `S.ui` (`UI`) = interface language. Toggle `#uiLangBtn`.
- `S.lang` = *spoken* language for dictation (`ro-RO`/`en-US`/auto), L1542.

---

## editor.html — 4589 lines · "Image Marker" (canvas annotation)

`lang="ro"`. Deep internals in **`HANDOFF.md`** — read that for the layer
model, rendering pipeline, and canvas traps. Map only below.

Theme: ✅ migrated to the earth palette (dark), step 3 of `docs/THEME.md`.
`:root` uses the shared semantic token names (`--surface`, `--text`, …) —
see that doc for the canvas-colour resolution (`CHROME` cache, ~L940).

**Chrome layout (2026-08):** the top bar holds document-level actions only.
Drawing tools and per-element properties live in two **floating, draggable
panels** (`#toolsPanel`, `#selectionPanel`) — see HANDOFF.md § "Mobile /
touch" for why and how.

| Lines | Contents |
|---|---|
| 5–11 | Viewport meta — **page zoom is locked off** (`maximum-scale=1, user-scalable=no`); pinch belongs to the canvas, not the chrome |
| 15–412 | App CSS. `:root` **30–46**. `@font-face` ×9 near top (all 9 files present in `fonts/`) |
| 57–68 | `html,body` — incl. `touch-action: pan-x pan-y`, the other half of the page-zoom lock |
| 72–117 | Top toolbar |
| 121–141 | `#canvasWrap` / `#stage` — **the viewport**: `overflow:hidden` + `touch-action:none` (every gesture is JS), `#stage` is `flex:0 0 auto` + `margin:auto` and carries the pan as a transform |
| 247–340 | **Floating panels** — `.panel`/`.panelHead`/`.panelBody`, `#toolsPanel`, `#selectionPanel`. `.panel` caps `max-width`/`max-height` to the viewport |
| 341–412 | Responsive: 900px (icon-only bar), 720px (sidebar under canvas), 520px (no tool captions), touch |
| 416–1059 | **Shared nav + `ScuLaFolder`** |
| 1065–1093 | Markup: `#toolbar` (file / zoom / capture / panel toggles) |
| 1095–1131 | Markup: `#toolsPanel` — Basic · Shapes · Arrows |
| 1132–1258 | Markup: `#selectionPanel` — one `.selRow` per property |
| 1259–1362 | Markup: modals, stage, sidebar |
| 1364–4587 | App script |

Script sections (banners `/* ===== Title ===== */`):

| Line | Section |
|---|---|
| 1364 | i18n — `I18N` (`ro:`/`en:`), `t()`, `applyUILang()` |
| 1578 | State — `state` object (incl. `zoom`/`panX`/`panY`), style defaults, `PALETTE` |
| 1629 | Utilities — incl. `setBtnLabel`/`setBtnIcon` (icon+label button spans) |
| 1671 | History — `pushHistory`/`commit`/`applyHistory`/`undo`/`redo`, and `committed`, the pre-change state an undo returns to |
| 1729 | Loading an image |
| 1765 | Screen snapshot |
| 1805 | Screen recording — `liveRenderLoop`, `startRecording` |
| 1951 | Recording preview / playback — `recordingBlob` kept for the folder save |
| **2053** | **Viewport: zoom + pan** — `applyZoomDisplay`/`applyPan` (the clamp), `clientToContent`/`panContentTo` (the anchor maths), `setZoom`/`setZoomAt`, buttons, wheel, **`gesture*` page-zoom blockers** |
| 2182 | Pan — `startPan`/`updatePan`/`endPan`, Alt/Space hints |
| 2234 | New canvas modal |
| **2316** | **Rendering** — `renderAll`, `renderBase`, `drawLayer`, all `drawX()` |
| **2672** | **Spline curve** — the whole `spline` layer type in one block: `splineSegments` (the maths), `drawSpline`, `setSplinePoints`, the vertex edits, and the `state.pendingSpline` placing mode. See the section below |
| 3119 | Layer list (sidebar) — `renderLayerList` |
| **3168** | **Toolbar wiring** — every button/handler (IDs unchanged by the panel move) |
| **3421** | **Floating panels** — `placePanel` (clamps every edge inside the viewport), `defaultPos`, drag, persistence |
| **3605** | **Selection panel contents** — `ROW_TYPES` (3620), `pickedVertex`/`syncSplineControls`, `syncSelectionPanel` |
| 3695 | Text box auto-fit |
| 3706 | Pointer/canvas coords — `canvasPoint()` |
| **3745** | **Pointer interaction** — the one gesture layer: `pointers`/`gesture`, `beginPinch`/`updatePinch`, `releasePointer`, `maybeDoubleTap`, then `onDown`/`onMove`/`onUp` |
| 4258 | Text editing overlay — `openTextEditor`, `positionEditor` (+ the `repositionEditor` hook the viewport calls) |
| 4341 | Keyboard shortcuts |
| 4385 | Save — `renderComposite`, **`saveOut()`** 4419 (one line onto `ScuLaFolder.save`) |
| 4424 | Save all sizes (zip) — `makeZip`, `crc32` |
| 4573 | Fonts ready — `document.fonts.load()` startup pass |

Largest region by far is Rendering (2316–3119); go straight to the
specific `drawX()` you need.

### The `spline` layer (2672–2971)

The one shape whose geometry is worth reading before touching. Unlike every
other type it is **re-derived from its vertices on every repaint** and is
editable after the fact, so nothing may cache a sampled path or edit
`l.points` directly.

| Function | What |
|---|---|
| `splineSegments(l)` | vertices → cubic Beziers. Centripetal Catmull-Rom (`SPLINE_ALPHA` 0.5) with non-uniform tangents; `l.tension` scales them, `p.corner` zeroes one side |
| `drawSpline` / `traceSpline` / `pointInSpline` | render, path-trace, and inside-test (the last borrows `baseCtx` as a geometry engine) |
| `nearestOnSpline(l, q)` | closest point on the drawn curve — hit-testing *and* where an inserted vertex goes |
| **`setSplinePoints(l, pts)`** | **the only writer of `l.points`.** Re-fits the box and re-normalises; the correction at its end is what stops the other vertices swinging when the box's centre (= the rotation pivot) moves |
| `splineVertexAt` / `insertSplineVertex` / `removeSplineVertex` / `toggleSplineCorner` | the vertex edits, each ending in `pushHistory(); renderAll()` |
| `startPendingSpline` / `addPendingSplinePoint` / `finishSpline` / `cancelSpline` | the click-to-place mode. It lives in `state.pendingSpline`, **not** `state.drag`, because it spans many clicks rather than one drag |
| `drawSplineVertices(l)` | the handles — circle = smooth vertex, square = corner |

`state.vertexSel` names the vertex the panel's Points row acts on; read it
only through `pickedVertex()` (Selection panel contents), which re-checks
that it still refers to the single selected curve.

**Zoom is the app's, never the browser's.** Three places cooperate and must
stay together — the viewport meta (5–11), `html,body{touch-action}` (57–68)
and the `gesture*` blockers in § Viewport. Remove any one and a pinch starts
scaling the toolbar, panels and sidebar again. See `HANDOFF.md` § Zoom/Pan.

**The view is a transform, not a scroll.** `#canvasWrap` is
`overflow:hidden; touch-action:none` and `#stage` carries
`translate3d(panX, panY, 0)`. Nothing anywhere may go back to
`scrollLeft`/`scrollTop` — that was what made panning lag and drift, and the
pan clamp in `applyPan()` is the only thing deciding how far the view may
travel.

**Two lists must stay in step:** `ROW_TYPES` (3620) says which property
rows show for which layer type, and the handlers in Toolbar wiring (3168)
say which types each control actually writes to. Add a control → add it to
both. `rowSplineEdit` is the one row that also needs a real layer, not just
a matching tool, so `syncSplineControls()` hides it again afterwards.

---

## markdown-editor.html — 3530 lines · Markdown editor

`lang="en"`. No section banners — this table is the only map.

| Lines | Contents |
|---|---|
| 8–837 | App CSS. `:root` **9–24** (earth-palette tokens, migrated). Workbooks panel **181–271**. `@media` 722, 751 |
| 838 | **mammoth.js CDN** (docx import) — only external dep in the repo |
| 842–1485 | **Shared nav + `ScuLaFolder`** |
| 1487–~1747 | Markup: header, toolbar, workspace, panels (incl. `#wb-panel`), modals |
| 1748–3528 | App script |

| Line | Function / region |
|---|---|
| 1755 | `I18N` (`ro:` 1756 / `en:` 1823), `t()`, `store`, `applyUILang` |
| 1939–1941 | `editor`, `preview` refs, `savedRange` |
| 1944–1966 | Selection: `saveSelection`, `restoreSelection`, `insertAtCursor`, `wrapSelection` |
| 1968–2041 | Insert helpers: `insertHeading`, `insertList`, `insertOrderedList`, `insertFontSize` |
| 2043–2078 | Image modal: `openImageModal`, `handleLocalImage`, `insertImage` |
| 2080–2082 | `workingFolderHandle`, `IMAGE_EXTS` — the image **explorer**'s own read-only picker, unrelated to `ScuLaFolder` |
| 2090–2130 | Responsive: `isSmallScreen`, `isMobile`, `setView`, **`PANELS`** (2101) + `togglePanelById` — one map drives all three side panels |
| 2234–2290 | Image tree: `createImageItem`, `showImageDetail`, `insertSelectedImage` |
| 2305 | `resolveImageSrc` — image-path rewrite, export-only |
| 2311 | `applyInline(text, opts)` |
| **2322** | **`parseMarkdown(md, opts)`** — single parser, shared by preview and export |
| 2424–2430 | `updatePreview`, `updateNav` |
| 2512 | `updateStatus` |
| **2533–3117** | **Workbooks** — see the sub-table below |
| 3119–3139 | `newFile`, `openFile`, `handleFileOpen` (all detach from the open chapter) |
| 3141 | `importDocx` |
| 3184 | `htmlToMarkdown` (docx → md) |
| 3286–3293 | **`saveOut()`** (one line onto `ScuLaFolder.save`), `saveFile`, `exportHtml` |
| ~3298–3328 | **Exported-HTML template** — standalone `<style>`/`<body>` string |
| 3342–3447 | Table modal: `rebuildTableGrid`, `insertTable`, `insertCodeBlock` |
| 3449–3470 | Link modal: `openLinkModal`, `insertLink` |
| 3499–3528 | `applyResponsiveDefaults`, init (`loadWorkbooks()` runs here) |

### Workbooks (2533–3117) — `docs/FEATURES.md` § E

A workbook holds chapters; one chapter is one markdown file. IndexedDB
(`scula-md`) is the source of truth on every device; the `markdown` folder
is a mirror, and each record carries the `folder`/`file` it owns — that
record **is** the UI↔folder correspondence.

| Line | Region |
|---|---|
| 2533–2543 | DB/store names, module state (`wbBooks`, `wbChapters`, `wbCurrentId`, …) |
| 2545–2589 | IndexedDB plumbing: `wbDb`, `wbTx`, `wbAll/wbPut/wbDrop`, `wbMetaGet/Set`, `wbPersist` |
| 2591–2620 | `wbSlug` + `wbUniqueFolder`/`wbUniqueFile` — how a title becomes a file name |
| 2632–2664 | **Folder mirror**: `wbFolderMode`, `wbMirrorWrite`, `wbMirrorRemove` (never recursive) |
| 2666–2772 | Panel rendering: `wbActBtn`, `renderWorkbooks`, `paintWorkbookWhere`, `paintWorkbookCrumb` |
| 2777–2926 | Operations: create/rename/delete workbook, new/open/rename/delete/export chapter, `syncAllToFolder` |
| 2928–2960 | Autosave: `scheduleAutosave`, `flushChapter`, `detachChapter`, `canLeaveEditor` |
| 2962–3091 | Saving: `saveToWorkbook`, the modal (`openWorkbookModal` → `confirmSaveToWorkbook`) |
| 3094–3117 | `loadWorkbooks` (boot + resume last chapter), `scula-folder`/visibility/unload hooks |

**Two writes, two moments.** Typing autosaves to IndexedDB only (no
permission prompt is legal outside a gesture); the disk mirror happens on
explicit saves — `saveToWorkbook`, `confirmSaveToWorkbook`, rename, delete,
`syncAllToFolder` — all of which run inside a click.

**Parser is unified (2026-08).** `parseMarkdown(md, {forExport})` and
`applyInline(text, {forExport})` serve both preview (`forExport` falsy) and
export (`forExport: true`) from one implementation — see `resolveImageSrc`
for the only behavioural fork (relative image paths get `public/images/`
prefixed, and a bare image-path line becomes a standalone `<img>`, only
when exporting). New markdown syntax now needs exactly one edit, in
`parseMarkdown`/`applyInline`, not two.

**One trap remains:** exported HTML must stay self-contained (its `<style>`
runs 3304–3324). It ships to people who don't have the app, so it uses
literal hex, not `var(--…)`. **Do not migrate that block to theme tokens.**

---

## Fast recipes

```bash
# where is X?
grep -n "X" *.html

# every hardcoded colour outside :root
grep -n "#[0-9a-fA-F]\{3,8\}\b" editor.html | sed -n '20,$p'

# every user-visible string in markup
grep -n "placeholder=\"\|title=\"\|aria-label=\"" markdown-editor.html

# confirm nav still in sync (see CLAUDE.md for the full diff snippet)
grep -n "site-nav" *.html
```

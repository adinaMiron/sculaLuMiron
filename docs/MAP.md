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

`index.html:221-873` · `editor.html:418-1070` · `markdown-editor.html:843-1495`

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

## index.html — 1659 lines · "Caiet vocal" (voice dictation)

`lang="ro"`. **The only app with a working i18n system** — copy its pattern.

| Lines | Contents |
|---|---|
| 11–217 | App CSS. `:root` palette at **12–37** (earth-palette tokens, migrated) |
| 220–872 | **Shared nav + `ScuLaFolder`** (identical in all 3 files) |
| 873–1006 | Markup: header, controls, textarea, settings sheet |
| 1007–1654 | App script, numbered sections below |

Script sections (comment banners `/* === N. Title === */`):

| Line | Section |
|---|---|
| 1012 | **1. i18n** — `I18N` object (`ro:` 1015 / `en:` 1056), `t()` at 1099, `UI` at 1098 |
| 1102 | 2. Providers |
| 1127 | 3. Settings store — `KEY` 1129, `store` 1130 w/ memory fallback, `save()` 1261, `load()` 1262 |
| 1159 | 4. DOM refs |
| 1190 | 5. Language / engine chips |
| 1205 | **6. UI language** — `applyUILang()` **1209** |
| 1227 | 7. Settings sheet |
| 1299 | 8. Secure-context check |
| 1304 | 9. Recording (MediaRecorder) + segment rotation |
| 1451 | 10. Transcription queue |
| 1545 | 11. Browser dictation (Web Speech API) |
| 1604 | 12. File import |
| 1618 | 13. Copy / share / **save → `ScuLaFolder.save()`** / clear |
| 1650 | 14. Init |

**Two independent language axes — do not conflate:**
- `S.ui` (`UI`) = interface language. Toggle `#uiLangBtn`.
- `S.lang` = *spoken* language for dictation (`ro-RO`/`en-US`/auto), L1551.

---

## editor.html — 4646 lines · "Image Marker" (canvas annotation)

`lang="ro"`. Deep internals in **`HANDOFF.md`** — read that for the layer
model, rendering pipeline, and canvas traps. Map only below.

Theme: ✅ migrated to the earth palette (dark), step 3 of `docs/THEME.md`.
`:root` uses the shared semantic token names (`--surface`, `--text`, …) —
see that doc for the canvas-colour resolution (`CHROME` cache, ~L949).

**Chrome layout (2026-08):** the top bar holds document-level actions only.
Drawing tools and per-element properties live in two **floating, draggable
panels** (`#toolsPanel`, `#selectionPanel`) — see HANDOFF.md § "Mobile /
touch" for why and how.

| Lines | Contents |
|---|---|
| 5–11 | Viewport meta — **page zoom is locked off** (`maximum-scale=1, user-scalable=no`); pinch belongs to the canvas, not the chrome |
| 15–414 | App CSS. `:root` **30–46**. `@font-face` ×9 near top (all 9 files present in `fonts/`) |
| 57–68 | `html,body` — incl. `touch-action: pan-x pan-y`, the other half of the page-zoom lock |
| 72–117 | Top toolbar |
| 121–141 | `#canvasWrap` / `#stage` — **the viewport**: `overflow:hidden` + `touch-action:none` (every gesture is JS), `#stage` is `flex:0 0 auto` + `margin:auto` and carries the pan as a transform |
| 247–342 | **Floating panels** — `.panel`/`.panelHead`/`.panelBody`, `#toolsPanel`, `#selectionPanel`. `.panel` caps `max-width`/`max-height` to the viewport |
| 343–414 | Responsive: 900px (icon-only bar), 720px (sidebar under canvas), 520px (no tool captions), touch |
| 418–1070 | **Shared nav + `ScuLaFolder`** |
| 1078–1105 | Markup: `#toolbar` (file / zoom / capture / panel toggles) |
| 1107–1144 | Markup: `#toolsPanel` — Basic · Shapes · Arrows |
| 1146–1272 | Markup: `#selectionPanel` — one `.selRow` per property |
| 1273–1374 | Markup: modals, stage, sidebar |
| 1376–4644 | App script |

Script sections (banners `/* ===== Title ===== */`):

| Line | Section |
|---|---|
| 1380 | i18n — `I18N` (`ro:`/`en:`), `t()`, `applyUILang()` |
| 1594 | State — `state` object (incl. `zoom`/`panX`/`panY`), style defaults, `PALETTE` |
| 1645 | Utilities — incl. `setBtnLabel`/`setBtnIcon` (icon+label button spans) |
| 1687 | History — `pushHistory`/`commit`/`applyHistory`/`undo`/`redo`, and `committed`, the pre-change state an undo returns to |
| 1745 | Loading an image |
| 1781 | Screen snapshot |
| 1821 | Screen recording — `liveRenderLoop`, `startRecording` |
| 1967 | Recording preview / playback — `recordingBlob` kept for the folder save |
| **2069** | **Viewport: zoom + pan** — `applyZoomDisplay`/`applyPan` (the clamp), `clientToContent`/`panContentTo` (the anchor maths), `setZoom`/`setZoomAt`, buttons, wheel, **`gesture*` page-zoom blockers** |
| 2198 | Pan — `startPan`/`updatePan`/`endPan`, Alt/Space hints |
| 2250 | New canvas modal |
| **2332** | **Rendering** — `renderAll`, `renderBase`, `drawLayer`, all `drawX()` |
| **2688** | **Spline curve + polyline** — both vertex-driven layer types in one block: `splineSegments` (the maths, and the only place `polyline` differs), `drawSpline`, `setSplinePoints`, the vertex edits, and the `state.pendingSpline` placing mode. See the section below |
| 3165 | Layer list (sidebar) — `renderLayerList` |
| **3215** | **Toolbar wiring** — every button/handler (IDs unchanged by the panel move) |
| **3468** | **Floating panels** — `placePanel` (clamps every edge inside the viewport), `defaultPos`, drag, persistence |
| **3652** | **Selection panel contents** — `ROW_TYPES` (3666), `pickedVertex`/`syncSplineControls`, `syncSelectionPanel` |
| 3750 | Text box auto-fit |
| 3761 | Pointer/canvas coords — `canvasPoint()` |
| **3800** | **Pointer interaction** — the one gesture layer: `pointers`/`gesture`, `beginPinch`/`updatePinch`, `releasePointer`, `maybeDoubleTap`, then `onDown`/`onMove`/`onUp` |
| 4315 | Text editing overlay — `openTextEditor`, `positionEditor` (+ the `repositionEditor` hook the viewport calls) |
| 4398 | Keyboard shortcuts |
| 4442 | Save — `renderComposite`, **`saveOut()`** 4473 (one line onto `ScuLaFolder.save`) |
| 4481 | Save all sizes (zip) — `makeZip`, `crc32` |
| 4630 | Fonts ready — `document.fonts.load()` startup pass |

Largest region by far is Rendering (2332–3165); go straight to the
specific `drawX()` you need.

### The `spline` and `polyline` layers (2688–3016)

The two shapes whose geometry is worth reading before touching. Unlike every
other type they are **re-derived from their vertices on every repaint** and
are editable after the fact, so nothing may cache a sampled path or edit
`l.points` directly.

`polyline` is `spline` with straight spans: same vertex list, same box
re-fitting, same dragging / inserting / removing / closing, same hit-testing.
**`splineSegments()` is the only function that branches on the type** — keep
it that way, and ask `isVertexShape(l)` rather than `l.type === 'spline'`
anywhere the question is "does this layer have editable vertices".

| Function | What |
|---|---|
| `isVertexShape(l)` | `spline` or `polyline` — the test every other part of the app should use |
| `splineSegments(l)` | vertices → cubic Beziers. Centripetal Catmull-Rom (`SPLINE_ALPHA` 0.5) with non-uniform tangents; `l.tension` scales them, `p.corner` zeroes one side. For a `polyline`, control points sit on the chord at its thirds instead — the exact straight segment, uniformly parametrised |
| `drawSpline` / `traceSpline` / `pointInSpline` | render, path-trace, and inside-test (the last borrows `baseCtx` as a geometry engine) |
| `nearestOnSpline(l, q)` | closest point on the drawn curve — hit-testing *and* where an inserted vertex goes |
| **`setSplinePoints(l, pts)`** | **the only writer of `l.points`.** Re-fits the box and re-normalises; the correction at its end is what stops the other vertices swinging when the box's centre (= the rotation pivot) moves |
| `splineVertexAt` / `insertSplineVertex` / `removeSplineVertex` / `toggleSplineCorner` | the vertex edits, each ending in `pushHistory(); renderAll()` |
| `startPendingSpline(p, e, type)` / `addPendingSplinePoint` / `finishSpline` / `cancelSpline` | the click-to-place mode, shared by both tools (`type` is the tool name). It lives in `state.pendingSpline`, **not** `state.drag`, because it spans many clicks rather than one drag. Clicking back on the first vertex sets `closed` and finishes |
| `drawSplineVertices(l)` | the handles — circle = smooth vertex, square = corner (so every handle of a polyline is square) |

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

**Two lists must stay in step:** `ROW_TYPES` (3666) says which property
rows show for which layer type, and the handlers in Toolbar wiring (3215)
say which types each control actually writes to. Add a control → add it to
both. `rowSplineEdit` is the one row that also needs a real layer, not just
a matching tool, so `syncSplineControls()` hides it again afterwards — that
function also hides the Corner button and swaps the hint's `data-i` key for
a `polyline`, whose vertices are all corners already.

---

## markdown-editor.html — 3545 lines · Markdown editor

`lang="en"`. No section banners — this table is the only map.

| Lines | Contents |
|---|---|
| 8–837 | App CSS. `:root` **9–24** (earth-palette tokens, migrated). Workbooks panel **181–271**. `@media` 722, 751 |
| 838 | **mammoth.js CDN** (docx import) — only external dep in the repo |
| 842–1494 | **Shared nav + `ScuLaFolder`** |
| 1496–~1756 | Markup: header, toolbar, workspace, panels (incl. `#wb-panel`), modals |
| 1757–3537 | App script |

| Line | Function / region |
|---|---|
| 1764 | `I18N` (`ro:` 1765 / `en:` 1832), `t()`, `store`, `applyUILang` |
| 1948–1950 | `editor`, `preview` refs, `savedRange` |
| 1953–1975 | Selection: `saveSelection`, `restoreSelection`, `insertAtCursor`, `wrapSelection` |
| 1977–2050 | Insert helpers: `insertHeading`, `insertList`, `insertOrderedList`, `insertFontSize` |
| 2052–2087 | Image modal: `openImageModal`, `handleLocalImage`, `insertImage` |
| 2089–2091 | `workingFolderHandle`, `IMAGE_EXTS` — the image **explorer**'s own read-only picker, unrelated to `ScuLaFolder` |
| 2099–2139 | Responsive: `isSmallScreen`, `isMobile`, `setView`, **`PANELS`** (2110) + `togglePanelById` — one map drives all three side panels |
| 2243–2299 | Image tree: `createImageItem`, `showImageDetail`, `insertSelectedImage` |
| 2314 | `resolveImageSrc` — image-path rewrite, export-only |
| 2320 | `applyInline(text, opts)` |
| **2331** | **`parseMarkdown(md, opts)`** — single parser, shared by preview and export |
| 2433–2439 | `updatePreview`, `updateNav` |
| 2521 | `updateStatus` |
| **2542–3126** | **Workbooks** — see the sub-table below |
| 3128–3148 | `newFile`, `openFile`, `handleFileOpen` (all detach from the open chapter) |
| 3150 | `importDocx` |
| 3193 | `htmlToMarkdown` (docx → md) |
| 3295–3302 | **`saveOut()`** (one line onto `ScuLaFolder.save`), `saveFile`, `exportHtml` |
| ~3307–3337 | **Exported-HTML template** — standalone `<style>`/`<body>` string |
| 3351–3456 | Table modal: `rebuildTableGrid`, `insertTable`, `insertCodeBlock` |
| 3458–3479 | Link modal: `openLinkModal`, `insertLink` |
| 3508–3537 | `applyResponsiveDefaults`, init (`loadWorkbooks()` runs here) |

### Workbooks (2542–3126) — `docs/FEATURES.md` § E

A workbook holds chapters; one chapter is one markdown file. IndexedDB
(`scula-md`) is the source of truth on every device; the `markdown` folder
is a mirror, and each record carries the `folder`/`file` it owns — that
record **is** the UI↔folder correspondence.

| Line | Region |
|---|---|
| 2542–2552 | DB/store names, module state (`wbBooks`, `wbChapters`, `wbCurrentId`, …) |
| 2554–2598 | IndexedDB plumbing: `wbDb`, `wbTx`, `wbAll/wbPut/wbDrop`, `wbMetaGet/Set`, `wbPersist` |
| 2600–2629 | `wbSlug` + `wbUniqueFolder`/`wbUniqueFile` — how a title becomes a file name |
| 2641–2673 | **Folder mirror**: `wbFolderMode`, `wbMirrorWrite`, `wbMirrorRemove` (never recursive) |
| 2675–2781 | Panel rendering: `wbActBtn`, `renderWorkbooks`, `paintWorkbookWhere`, `paintWorkbookCrumb` |
| 2786–2935 | Operations: create/rename/delete workbook, new/open/rename/delete/export chapter, `syncAllToFolder` |
| 2937–2969 | Autosave: `scheduleAutosave`, `flushChapter`, `detachChapter`, `canLeaveEditor` |
| 2971–3100 | Saving: `saveToWorkbook`, the modal (`openWorkbookModal` → `confirmSaveToWorkbook`) |
| 3103–3126 | `loadWorkbooks` (boot + resume last chapter), `scula-folder`/visibility/unload hooks |

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
runs 3313–3333). It ships to people who don't have the app, so it uses
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

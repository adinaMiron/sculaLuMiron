# MAP.md — where everything lives

Line anchors so you can `sed -n 'A,Bp' file` instead of scanning. Numbers
drift by a few lines after edits; **search by the name in the right-hand
column** if a range looks wrong. Re-verify with `grep -n` when in doubt.

Shared shape of all four files:

```
<style>  …app CSS, :root palette at the very top…  </style>
<body>
<nav id="site-nav">  + its own <style> + <script>   ← the shared block
…app markup…
<script>  …app logic, one IIFE/closure…  </script>
```

## The shared block (byte-identical in all four files)

`index.html:221-875` · `editor.html:418-1072` ·
`markdown-editor.html:843-1497` · `recipes.html:246-900`

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

Any edit here goes into **all four** files — see the diff snippet in
`CLAUDE.md`.

---

## index.html — 1661 lines · "Caiet vocal" (voice dictation)

`lang="ro"`. **The only app with a working i18n system** — copy its pattern.

| Lines | Contents |
|---|---|
| 11–217 | App CSS. `:root` palette at **12–37** (earth-palette tokens, migrated) |
| 220–874 | **Shared nav + `ScuLaFolder`** (identical in all 4 files) |
| 875–1008 | Markup: header, controls, textarea, settings sheet |
| 1009–1656 | App script, numbered sections below |

Script sections (comment banners `/* === N. Title === */`):

| Line | Section |
|---|---|
| 1014 | **1. i18n** — `I18N` object (`ro:` 1017 / `en:` 1058), `t()` at 1101, `UI` at 1100 |
| 1104 | 2. Providers |
| 1129 | 3. Settings store — `KEY` 1131, `store` 1132 w/ memory fallback, `save()` 1263, `load()` 1264 |
| 1161 | 4. DOM refs |
| 1192 | 5. Language / engine chips |
| 1207 | **6. UI language** — `applyUILang()` **1211** |
| 1229 | 7. Settings sheet |
| 1301 | 8. Secure-context check |
| 1306 | 9. Recording (MediaRecorder) + segment rotation |
| 1453 | 10. Transcription queue |
| 1547 | 11. Browser dictation (Web Speech API) |
| 1606 | 12. File import |
| 1620 | 13. Copy / share / **save → `ScuLaFolder.save()`** / clear |
| 1652 | 14. Init |

**Two independent language axes — do not conflate:**
- `S.ui` (`UI`) = interface language. Toggle `#uiLangBtn`.
- `S.lang` = *spoken* language for dictation (`ro-RO`/`en-US`/auto), L1551.

---

## editor.html — 4648 lines · "Image Marker" (canvas annotation)

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
| 418–1072 | **Shared nav + `ScuLaFolder`** |
| 1080–1107 | Markup: `#toolbar` (file / zoom / capture / panel toggles) |
| 1109–1146 | Markup: `#toolsPanel` — Basic · Shapes · Arrows |
| 1148–1274 | Markup: `#selectionPanel` — one `.selRow` per property |
| 1275–1376 | Markup: modals, stage, sidebar |
| 1378–4646 | App script |

Script sections (banners `/* ===== Title ===== */`):

| Line | Section |
|---|---|
| 1382 | i18n — `I18N` (`ro:`/`en:`), `t()`, `applyUILang()` |
| 1596 | State — `state` object (incl. `zoom`/`panX`/`panY`), style defaults, `PALETTE` |
| 1647 | Utilities — incl. `setBtnLabel`/`setBtnIcon` (icon+label button spans) |
| 1689 | History — `pushHistory`/`commit`/`applyHistory`/`undo`/`redo`, and `committed`, the pre-change state an undo returns to |
| 1747 | Loading an image |
| 1783 | Screen snapshot |
| 1823 | Screen recording — `liveRenderLoop`, `startRecording` |
| 1969 | Recording preview / playback — `recordingBlob` kept for the folder save |
| **2071** | **Viewport: zoom + pan** — `applyZoomDisplay`/`applyPan` (the clamp), `clientToContent`/`panContentTo` (the anchor maths), `setZoom`/`setZoomAt`, buttons, wheel, **`gesture*` page-zoom blockers** |
| 2200 | Pan — `startPan`/`updatePan`/`endPan`, Alt/Space hints |
| 2252 | New canvas modal |
| **2334** | **Rendering** — `renderAll`, `renderBase`, `drawLayer`, all `drawX()` |
| **2690** | **Spline curve + polyline** — both vertex-driven layer types in one block: `splineSegments` (the maths, and the only place `polyline` differs), `drawSpline`, `setSplinePoints`, the vertex edits, and the `state.pendingSpline` placing mode. See the section below |
| 3167 | Layer list (sidebar) — `renderLayerList` |
| **3217** | **Toolbar wiring** — every button/handler (IDs unchanged by the panel move) |
| **3470** | **Floating panels** — `placePanel` (clamps every edge inside the viewport), `defaultPos`, drag, persistence |
| **3654** | **Selection panel contents** — `ROW_TYPES` (3668), `pickedVertex`/`syncSplineControls`, `syncSelectionPanel` |
| 3752 | Text box auto-fit |
| 3763 | Pointer/canvas coords — `canvasPoint()` |
| **3802** | **Pointer interaction** — the one gesture layer: `pointers`/`gesture`, `beginPinch`/`updatePinch`, `releasePointer`, `maybeDoubleTap`, then `onDown`/`onMove`/`onUp` |
| 4317 | Text editing overlay — `openTextEditor`, `positionEditor` (+ the `repositionEditor` hook the viewport calls) |
| 4400 | Keyboard shortcuts |
| 4444 | Save — `renderComposite`, **`saveOut()`** 4475 (one line onto `ScuLaFolder.save`) |
| 4483 | Save all sizes (zip) — `makeZip`, `crc32` |
| 4632 | Fonts ready — `document.fonts.load()` startup pass |

Largest region by far is Rendering (2334–3167); go straight to the
specific `drawX()` you need.

### The `spline` and `polyline` layers (2690–3018)

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

**Two lists must stay in step:** `ROW_TYPES` (3668) says which property
rows show for which layer type, and the handlers in Toolbar wiring (3217)
say which types each control actually writes to. Add a control → add it to
both. `rowSplineEdit` is the one row that also needs a real layer, not just
a matching tool, so `syncSplineControls()` hides it again afterwards — that
function also hides the Corner button and swaps the hint's `data-i` key for
a `polyline`, whose vertices are all corners already.

---

## markdown-editor.html — 3547 lines · Markdown editor

`lang="en"`. No section banners — this table is the only map.

| Lines | Contents |
|---|---|
| 8–837 | App CSS. `:root` **9–24** (earth-palette tokens, migrated). Workbooks panel **181–271**. `@media` 722, 751 |
| 838 | **mammoth.js CDN** (docx import) — only external dep in the repo |
| 842–1496 | **Shared nav + `ScuLaFolder`** |
| 1498–~1758 | Markup: header, toolbar, workspace, panels (incl. `#wb-panel`), modals |
| 1759–3539 | App script |

| Line | Function / region |
|---|---|
| 1766 | `I18N` (`ro:` 1767 / `en:` 1834), `t()`, `store`, `applyUILang` |
| 1950–1952 | `editor`, `preview` refs, `savedRange` |
| 1955–1977 | Selection: `saveSelection`, `restoreSelection`, `insertAtCursor`, `wrapSelection` |
| 1979–2052 | Insert helpers: `insertHeading`, `insertList`, `insertOrderedList`, `insertFontSize` |
| 2054–2089 | Image modal: `openImageModal`, `handleLocalImage`, `insertImage` |
| 2091–2093 | `workingFolderHandle`, `IMAGE_EXTS` — the image **explorer**'s own read-only picker, unrelated to `ScuLaFolder` |
| 2101–2141 | Responsive: `isSmallScreen`, `isMobile`, `setView`, **`PANELS`** (2112) + `togglePanelById` — one map drives all three side panels |
| 2245–2301 | Image tree: `createImageItem`, `showImageDetail`, `insertSelectedImage` |
| 2316 | `resolveImageSrc` — image-path rewrite, export-only |
| 2322 | `applyInline(text, opts)` |
| **2333** | **`parseMarkdown(md, opts)`** — single parser, shared by preview and export |
| 2435–2441 | `updatePreview`, `updateNav` |
| 2523 | `updateStatus` |
| **2544–3128** | **Workbooks** — see the sub-table below |
| 3130–3150 | `newFile`, `openFile`, `handleFileOpen` (all detach from the open chapter) |
| 3152 | `importDocx` |
| 3195 | `htmlToMarkdown` (docx → md) |
| 3297–3304 | **`saveOut()`** (one line onto `ScuLaFolder.save`), `saveFile`, `exportHtml` |
| ~3309–3339 | **Exported-HTML template** — standalone `<style>`/`<body>` string |
| 3353–3458 | Table modal: `rebuildTableGrid`, `insertTable`, `insertCodeBlock` |
| 3460–3481 | Link modal: `openLinkModal`, `insertLink` |
| 3510–3539 | `applyResponsiveDefaults`, init (`loadWorkbooks()` runs here) |

### Workbooks (2544–3128) — `docs/FEATURES.md` § E

A workbook holds chapters; one chapter is one markdown file. IndexedDB
(`scula-md`) is the source of truth on every device; the `markdown` folder
is a mirror, and each record carries the `folder`/`file` it owns — that
record **is** the UI↔folder correspondence.

| Line | Region |
|---|---|
| 2544–2554 | DB/store names, module state (`wbBooks`, `wbChapters`, `wbCurrentId`, …) |
| 2556–2600 | IndexedDB plumbing: `wbDb`, `wbTx`, `wbAll/wbPut/wbDrop`, `wbMetaGet/Set`, `wbPersist` |
| 2602–2631 | `wbSlug` + `wbUniqueFolder`/`wbUniqueFile` — how a title becomes a file name |
| 2643–2675 | **Folder mirror**: `wbFolderMode`, `wbMirrorWrite`, `wbMirrorRemove` (never recursive) |
| 2677–2783 | Panel rendering: `wbActBtn`, `renderWorkbooks`, `paintWorkbookWhere`, `paintWorkbookCrumb` |
| 2788–2937 | Operations: create/rename/delete workbook, new/open/rename/delete/export chapter, `syncAllToFolder` |
| 2939–2971 | Autosave: `scheduleAutosave`, `flushChapter`, `detachChapter`, `canLeaveEditor` |
| 2973–3102 | Saving: `saveToWorkbook`, the modal (`openWorkbookModal` → `confirmSaveToWorkbook`) |
| 3105–3128 | `loadWorkbooks` (boot + resume last chapter), `scula-folder`/visibility/unload hooks |

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
runs 3315–3335). It ships to people who don't have the app, so it uses
literal hex, not `var(--…)`. **Do not migrate that block to theme tokens.**

---

## recipes.html — 2884 lines · "Rețete" (PDF / photo → recipe markdown)

`lang="ro"`. The *why*, the format contract and the USDA plan live in
**`docs/RECIPES.md`** — read that before changing the markdown it writes.
Map only below.

| Lines | Contents |
|---|---|
| 11–243 | App CSS. `:root` **12–51** (earth palette, semantic names). Buttons 92–115, drop zone 116–129, review rows 161–188, markdown preview 189–222, narrow 223–235, touch 236–242 |
| 246–900 | **Shared nav + `ScuLaFolder`** |
| 904–1014 | Markup: the four numbered cards — source ▸ text ▸ review ▸ markdown |
| 1016–2882 | App script, numbered sections below |

| Line | Section |
|---|---|
| 1035 | **1. i18n** — `I18N` (`ro:` 1036 / `en:` 1155), `t()`, `applyUILang()` |
| 1237 | 2. Settings store (`scula:recipes`) |
| **1263** | **3. `PdfText`** — the dependency-free PDF reader |
| **1965** | **4. `Recipes`** — the parser |
| 2234 | 5. The app — state, review cards, markdown |
| 2507 | 6. Getting the text in — `ingest`/`analyse`/`handleFile`, then OCR |
| 2652 | 7. Saving — `.md` via `ScuLaFolder`, chapters via `scula-md` |
| 2754 | 8. Wiring + init |

### `PdfText` (1263–1962)

`extract(buffer)` is the only entry point; everything else is one stage of
it. Order matters — object streams must be expanded before the page tree is
walked, or a modern PDF looks empty.

| Function | What |
|---|---|
| `latin1` / `bytesOf` | bytes ↔ a one-char-per-byte string, so string offsets *are* byte offsets |
| `inflate` | `DecompressionStream`, zlib then raw. The reason this needs no library |
| `unpredict` | PNG predictors (`/Predictor >= 10`) |
| `dictValue(dict, key)` | the loose dictionary reader: `<< >>`, `[ ]`, `/Name`, number, or `n g R` |
| `scanObjects` | every `N 0 obj` in the file; no xref is consulted at all |
| `decodeStream` | the `/Filter` chain + `/DecodeParms`; `null` for anything that isn't text (images, LZW) |
| `expandObjStreams` | `/Type /ObjStm` → the dictionaries hidden inside it |
| `pageList` | `/Root → /Pages → /Kids`, falling back to every `/Type /Page` |
| `parseCMap` / `fontsOf` / `decodeShown` | `/ToUnicode` → the map that keeps ă â î ș ț; WinAnsi when a font has none |
| **`widthsOf`** | `/Widths` (simple) and `/W` + `/DW` (CID) → real glyph advances. Guessing them instead is what puts spaces inside words |
| **`pageText`** (1692) | the tiny interpreter: text operators plus `q`/`Q`/`cm`, with the full text matrix — see the two traps below |
| `joinLines` (1913) | drawing order → reading order; a wide vertical gap becomes a paragraph break |

Two traps this reader was written around, both found by feeding it a PDF
printed by Chromium rather than one hand-built in a test:

- **the page can be flipped.** Skia writes `1 0 0 -1 … Tm`, so its lines
  arrive bottom-first. `show()` normalises with the sign of the composite
  matrix's `d`; nothing downstream needs to know.
- **runs are split by font, not by word.** "min" arrives as `m` + `in` when
  a diacritic pulls in a second font, so a space can only be inferred from
  the *real* advance width — hence `widthsOf`. With a guessed width the
  output reads "m in", "arom ă", "10m l".

### `Recipes` (1965–2231)

`parse(text)` → `[{ n, title, meals:[{ kind, label, name, ingredients:[{ qty,
unit, item, fdc }], steps:[] }] }]`. `toLines` cleans and re-joins wrapped
lines, `isStep` decides ingredient vs method, `parseIngredient` splits
quantity/unit/name, `splitSteps` cuts prose into numbered steps.

**`NOT_LETTER`, never `\b`** — after `ă` a `\b` cannot match (it is not a
word character in a non-unicode regex), which silently turned every Romanian
imperative into an ingredient once. Every word-end test in this block is that
lookahead; keep new verbs and units on it.

### The markdown (`buildDayMarkdown`, 2409)

The output shape is a contract (`docs/RECIPES.md` § C): `#` day, `##` meal,
`### 1. Ingrediente` as a four-column table whose last column is the empty
USDA FDC id, `### 2. Metoda de preparare` as an ordered list, then the
totals stub. Change it there and in that doc together.

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

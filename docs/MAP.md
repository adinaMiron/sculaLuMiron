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

`index.html:221-876` · `editor.html:418-1073` ·
`markdown-editor.html:1385-2040` · `recipes.html:310-965`

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

## markdown-editor.html — 6354 lines · Markdown editor

`lang="en"`. No section banners — this table is the only map.

| Lines | Contents |
|---|---|
| 8–1377 | App CSS. `:root` **9–39** (earth-palette tokens + `--danger` + the `--graph-*` node roles). Workbooks panel **196–286**. Navigation panel **609**. **Search & filter panel 720–893**. **Knowledge graph 1041–1376**. `@media` **907** (the toolbar tightening), 912, 943, 1028, 1035, **1354** (the graph on a phone) |
| 1380 | **mammoth.js CDN** (docx import) — only external dep in the repo |
| 1385–2040 | **Shared nav + `ScuLaFolder`** |
| 2042–~2338 | Markup: header, toolbar, workspace, panels (`#wb-panel`, `#img-panel`, **`#find-panel` 2184–2217**, `#nav-panel`), modals |
| **2340–2469** | Markup: **`#graph-view`** overlay + `#wiki-modal` + `#wiki-suggest` |
| 2471–6354 | App script |

| Line | Function / region |
|---|---|
| 2478 | `I18N` (`ro:` 2479 / `en:` 2605), `t()`, `store`, `applyUILang` |
| 2784–2786 | `editor`, `preview` refs, `savedRange` |
| 2789–2811 | Selection: `saveSelection`, `restoreSelection`, `insertAtCursor`, `wrapSelection` |
| 2813–2886 | Insert helpers: `insertHeading`, `insertList`, `insertOrderedList`, `insertFontSize` |
| 2888–2923 | Image modal: `openImageModal`, `handleLocalImage`, `insertImage` |
| 2925–2927 | `workingFolderHandle`, `IMAGE_EXTS` — the image **explorer**'s own read-only picker, unrelated to `ScuLaFolder` |
| 2935–3005 | Responsive: `isSmallScreen`, `isMobile`, `setView`, **`PANELS`** (2946) + `togglePanelById`, `toggleFind`/`findIsOpen` (2989) — one map drives all four side panels |
| 3097–3153 | Image tree: `createImageItem`, `showImageDetail`, `insertSelectedImage` |
| **3165–3451** | **Wikilinks, tags and block anchors** — see the sub-table below |
| 3453 | `resolveImageSrc` — image-path rewrite, export-only |
| 3459 | `applyInline(text, opts)` |
| **3475** | **`parseMarkdown(md, opts)`** — single parser, shared by preview and export |
| 3581–3605 | `updatePreview` (+ the graph and search refreshes), the `#preview` click delegation, `updateNav` |
| 3663 | `updateStatus` |
| **3684–4270** | **Workbooks** — see the sub-table below |
| **4272–5262** | **Knowledge graph** — see the sub-table below |
| **5264–5679** | **Search & filter** — see the sub-table below |
| **5681–5924** | **Writing a `[[link]]`**: `wikiCandidates` 5694, the modal 5721–5797, the `[[` suggester 5799–5924 (incl. **`editorMirrorAt`** 5799, shared with the search panel) |
| 5927–5947 | `newFile`, `openFile`, `handleFileOpen` (all detach from the open chapter) |
| 5949 | `importDocx` |
| 5992 | `htmlToMarkdown` (docx → md) |
| 6094–6101 | **`saveOut()`** (one line onto `ScuLaFolder.save`), `saveFile`, `exportHtml` |
| ~6106–6140 | **Exported-HTML template** — standalone `<style>`/`<body>` string |
| 6153–6258 | Table modal: `rebuildTableGrid`, `insertTable`, `insertCodeBlock` |
| 6260–6278 | Link modal: `openLinkModal`, `insertLink` |
| 6280–6319 | Event listeners + keyboard shortcuts (Ctrl+1/2/**3**/**4**, Ctrl+Shift+**L**/**F**) |
| 6321–6354 | `applyResponsiveDefaults`, init (`loadWorkbooks()` runs here) |

### Workbooks (3684–4270) — `docs/FEATURES.md` § E

A workbook holds chapters; one chapter is one markdown file. IndexedDB
(`scula-md`) is the source of truth on every device; the `markdown` folder
is a mirror, and each record carries the `folder`/`file` it owns — that
record **is** the UI↔folder correspondence.

| Line | Region |
|---|---|
| 3684–3694 | DB/store names, module state (`wbBooks`, `wbChapters`, `wbCurrentId`, …) |
| 3696–3732 | IndexedDB plumbing: `wbDb`, `wbTx`, `wbAll/wbPut/wbDrop`, `wbMetaGet/Set`, `wbPersist` |
| 3742–3771 | `wbSlug` + `wbUniqueFolder`/`wbUniqueFile` — how a title becomes a file name |
| 3783–3815 | **Folder mirror**: `wbFolderMode`, `wbMirrorWrite`, `wbMirrorRemove` (never recursive) |
| 3815–3925 | Panel rendering: `wbActBtn`, `renderWorkbooks`, `paintWorkbookWhere`, `paintWorkbookCrumb` |
| 3928–4078 | Operations: create/rename/delete workbook, new/open/rename/delete/export chapter, `syncAllToFolder` |
| 4079–4111 | Autosave: `scheduleAutosave`, `flushChapter`, `detachChapter`, `canLeaveEditor` |
| 4113–4243 | Saving: `saveToWorkbook`, the modal (`openWorkbookModal` → `confirmSaveToWorkbook`) |
| 4245–4270 | `loadWorkbooks` (boot + resume last chapter), `scula-folder`/visibility/unload hooks |

**Two writes, two moments.** Typing autosaves to IndexedDB only (no
permission prompt is legal outside a gesture); the disk mirror happens on
explicit saves — `saveToWorkbook`, `confirmSaveToWorkbook`, rename, delete,
`syncAllToFolder` — all of which run inside a click.

### Wikilinks, tags and block anchors (3165–3451) — `docs/FEATURES.md` § G

Obsidian's link syntax, and the only reason the graph has any edges. Both
the preview and the export go through it, and so does the graph scanner.

| Line | Function |
|---|---|
| 3189–3196 | **`WIKI_RE`**, `TAG_RE`, `BLOCK_RE`, `IMG_RE` — the four patterns. `WIKI_RE`/`TAG_RE` are **global**; anything that `exec`s them in a loop must use a private copy (`scanNote` does) |
| 3200–3206 | `mdUnescape` / `attrEsc` — `applyInline` is handed already-escaped text, so a name is `A &amp; B` until it goes through these |
| 3209 | `mdPlain(raw)` — heading text with its inline markdown stripped |
| **3222** | **`headingSlug(raw, seen)`** — the one slug function. `parseMarkdown` writes it as a heading `id`, the nav panel and every `[[Note#Section]]` jump to that id. Three callers, one implementation: keep it that way |
| 3237 | `parseWikiTarget(raw)` → `{name, sub, heading, block}` |
| 3249–3285 | `wikiNotes()` — every note a link may point at (every chapter, plus the loose document), cached; `invalidateWikiIndex()` is called from `renderWorkbooks()` |
| **3288** | **`resolveWiki(name, fromChapterId)`** — path, then `Workbook/Title`, then title, then file name; the nearest match (same workbook) wins, as in Obsidian |
| 3324 | `renderWikiLink(...)` — the live `<a>` for the preview, a real anchor or plain text for the export |
| 3357–3364 | `takeBlockId` / `liWithBlockId` — `…text ^anchor` becomes `id="block-anchor"` |
| **3371** | **`gotoPreviewAnchor(id)`** — the single jump-to-anchor path: nav panel, wikilinks and the graph all land here |
| 3390 | `followWikiLink(name, heading, block)` — switch chapter, then jump |
| 3408 | `offerToCreateNote(name)` — an unresolved link becomes a real chapter |
| 3430 | `createChapterNamed(...)` — `newChapter()` without the prompt |

**The tag pattern runs last in `applyInline`, on purpose.** By then every
`#` the pass produced sits after `>` or a quote, and the lead class
(`(^|[\s(\[{])`) excludes both — which is what keeps `href="#force"` and
`<code>#tag</code>` from being turned into tags. `scanNote` has no such
pass to hide behind, so it blanks the `[[links]]` itself before scanning
tags; without that, `[[#Inertia]]` mints a tag called `Inertia`.

### Knowledge graph (4272–5262) — `docs/FEATURES.md` § G

One `<canvas>`, one force simulation, no library. Obsidian's palette
(Filters · Groups · Display · Forces) drives `gvSettings`, which persists
under `scula:graph`.

| Line | Region |
|---|---|
| 4312–4328 | **`GRAPH_COLORS`** — the `--graph-*` tokens resolved **once**; canvas cannot use `var()`. Same rule as `editor.html`'s `CHROME`, see `docs/THEME.md` |
| 4327–4331 | `GV_BASE_R`, **`GV_STRUCTURAL`** — the settings that change *which* nodes exist (those rebuild; everything else only repaints) |
| 4333–4353 | `GV_DEFAULTS`, `gvSettings`, `gvLangReady` (a **`var`** — `applyUILang` reads it early) |
| 4355–4371 | `gv` — the whole live state: nodes, links, `pos` (survives a rebuild), transform, pointers |
| **4373** | **`scanNote(md)`** — one pass over a note: headings, `^blocks`, `#tags`, `[[links]]`, images, each tagged with the section it sat in |
| 4425–4442 | `scanNoteCached`, `noteText` (the open note reads from the **editor**, saved or not), `gvCurrentBookId` |
| **4445** | **`buildGraph()`** — dispatches on scope |
| **4475** | **`buildNoteScope`** — the note, its headings as an outline, its blocks, its tags, and `[[#Section]]` links as section-to-section edges |
| 4548 | `buildNotesScope` — chapters as nodes (`workbook` and `vault`) |
| 4586–4657 | `gvMatches`, **`applyGraphFilters`** (search → kinds → local-graph depth → orphans, in that order), `gvNodeColor` (groups first) |
| 4659–4722 | **`gvKick`/`gvStep`** — the four forces and the alpha decay |
| 4700–4815 | `gvSX`/`gvSY`, `gvRadius`, **`gvDraw`** (hover dims the unconnected), `gvArrow` |
| **4817** | **`gvRebuild()`** — filter, recompute degrees, keep old positions, re-link |
| 4867–4905 | `gvFit`, `gvZoomAt`/`gvZoomBy`, `gvResize` (dpr-aware) |
| **4907–5026** | **`gvHit` + `gvBindStage`** — the one pointer route: drag a node, drag the background to pan, two fingers to pinch, wheel to zoom |
| 5028 | `gvOpenNode` — note opens, heading/block jumps, tag becomes the search, unresolved offers to be created |
| 5045–5120 | Settings: save/load, `gvPaintControls`, `gvBindControls` (generic over `[data-gv]`), `setGraphScope` |
| 5122–5182 | `renderGvGroups`, `renderGvLegend` |
| 5184–5252 | `gvLoop`, **`openGraph`/`closeGraph`/`toggleGraph`**, `openGraphForTag`, `gvRefresh` (debounced; the graph follows the editor) |
| 5254 | `gvRepaintLang` — what `applyUILang` calls for the generated legend/groups/counts |

**Two lists must stay in step:** a new setting needs a control in the
`#graph-view` markup carrying `data-gv="<key>"` **and** an entry in
`GV_DEFAULTS`; add it to `GV_STRUCTURAL` too if changing it changes which
nodes exist. `gvBindControls`/`gvPaintControls` then need no edit at all.

### Search & filter (5264–5679) — `docs/FEATURES.md` § H

One query, the same three scopes the graph has (open chapter · this
workbook · every workbook), then two rows of chips that narrow what it
found. Reads `wikiNotes()`/`noteText()`/`scanNoteCached()` — the graph's —
so "a note" means one thing in both features. Nothing touches the disk.

| Line | Region |
|---|---|
| 5279–5306 | `FD_KEY` (`scula:find`), **`FD_KINDS`**, `fdReady` (a **`var`** — `applyUILang` reads it early), **`fdState`** (query, scope, four toggles, the two chip sets) |
| 5308–5323 | **`fdFold`/`fdFoldMap`** — NFD minus the combining marks, with every folded character mapped back to its source index so a hit still marks the right characters |
| 5326–5351 | `fdMatcher` (escape or regex, a broken one flagged not thrown), **`fdLineHits`** — whole-word tests the characters either side, **never `\b`** (after `ă` it cannot match) |
| 5353 | `fdKindOf(line, inFence)` — the axis the "Only" chips filter on |
| **5365** | **`fdNoteHits(text, m)`** — one chapter, line by line; `section` carries the `headingSlug()` the preview gave that heading, counted the same way |
| 5391–5413 | `fdScopeNotes` (the three scopes), `fdNoteOrder` |
| **5415** | **`fdCompute()`** — scope ▸ query ▸ tags ▸ kinds. Each chip's count comes from one step earlier than the chip filters |
| 5449 | `fdSnippet` — escapes in the gaps between ranges, so a line of literal HTML is shown, never run |
| 5467–5548 | `fdPaintScope`/`fdPaintOpts`/`fdPaintKinds`/`fdPaintTags`, **`fdRender`** |
| 5550–5578 | `fdOffsetOfLine`, **`fdGoto`** — open the chapter, select the match, take the preview to the same section. Scrolls via `editorMirrorAt` (5799), shared with the `[[` suggester |
| 5580–5619 | `fdRun`/`fdRefresh`/`fdQueryChanged`/`fdClearQuery`/`fdQueryKey`, `fdLive` (called from `updatePreview`), `fdRepaintLang` |
| 5621–5643 | `fdSaveSettings`/`fdLoadSettings` — scope and the four toggles persist under `scula:find` |
| 5645–5676 | Control wiring; the chips and result rows are generated, so both are delegated |

**Parser is unified (2026-08).** `parseMarkdown(md, {forExport})` and
`applyInline(text, {forExport})` serve both preview (`forExport` falsy) and
export (`forExport: true`) from one implementation — see `resolveImageSrc`
for the only behavioural fork (relative image paths get `public/images/`
prefixed, and a bare image-path line becomes a standalone `<img>`, only
when exporting). New markdown syntax now needs exactly one edit, in
`parseMarkdown`/`applyInline`, not two.

**One trap remains:** exported HTML must stay self-contained (its `<style>`
runs 6112–6139). It ships to people who don't have the app, so it uses
literal hex, not `var(--…)`. **Do not migrate that block to theme tokens.**

---

## recipes.html — 5024 lines · "Rețete" (PDF / photo → recipe markdown)

`lang="ro"`. The *why*, the format contract and the USDA plan live in
**`docs/RECIPES.md`** — read that before changing the markdown it writes.
Map only below.

| Lines | Contents |
|---|---|
| 11–302 | App CSS. `:root` **12–51** (earth palette, semantic names). Buttons 92–115, drop zone 116–129, review rows 161–188, **search / chips / collapsed days / `.grp` 189–232**, markdown preview 234–255, folds + checkboxes + `.badge` 257–278, narrow 280–292, touch 294–301 |
| 305–960 | **Shared nav + `ScuLaFolder`** |
| 963–1120 | Markup: the four numbered cards — source ▸ text ▸ review ▸ markdown. The OCR fold is `#ocrBox` (988–1023); the filter bar is `#filters` (1046–1052), `#found` 1053, `#onlyShownBox` 1087 |
| 1122–5022 | App script, numbered sections below |

| Line | Section |
|---|---|
| 1124 | **1. i18n** — `I18N` (`ro:` 1127 / `en:` 1264), `t()` (variadic), `applyUILang()` |
| 1397 | 2. Settings store (`scula:recipes`) |
| **1423** | **3. `Jpx`** — the JPEG 2000 decoder |
| **2473** | **4. `PdfText`** — the dependency-free PDF reader |
| **3433** | **5. `Recipes`** — the parser |
| 3802 | 6. The app — state, **the day view**, review cards, markdown |
| 4395 | 7. Getting the text in — `ingest`/`analyse`/`handleFile(s)`, then OCR |
| 4747 | 8. Saving — `.md` via `ScuLaFolder`, chapters via `scula-md` |
| 4850 | 9. Wiring + init |

### `Jpx` (1445–2461)

`decode(bytes, opts)` → `{ width, height, comps, siz, luma }` and
`toRGBA(res)` → 8-bit RGBA. The only two entry points. It exists because no
browser but Safari decodes JPEG 2000, and a great many scanned books are
stored as `/JPXDecode` — without it those pages are invisible to
`createImageBitmap` and the file reads as empty.

`decode(bytes, { luma:true })` reads **only component 0** when the file has
a component transform. Y is the luma both RCT and ICT are built around, so
OCR gets the grey page it wants for a third of the work; `imageOf` always
asks for that. Packet headers are still parsed for every component — the
lengths are what advance the stream — only tier-1 is skipped.

| Function | What |
|---|---|
| `MQ` (1466) | the arithmetic decoder, Annex C. `QE`/`NMPS`/`NLPS`/`SW` are Table C.2 verbatim |
| `RawBits` / `HeadBits` | the two other bit readers: bypass passes, and packet headers with their 0xFF stuffing |
| `TagTree` (1562) | inclusion and zero-bit-planes, decoded against a rising threshold **across packets** — hence the state on the object |
| `BitModel` (1631) | tier-1: `runSignificance`, `runRefinement`, `runCleanup`. `nbSig` keeps the neighbour counts packed in a byte and updated in `setSig`, which is what stops a naive tier-1 re-reading eight flags per coefficient per plane |
| `synth1D` (1800) | the inverse wavelet, 5/3 and 9/7, over an **absolute** index range — the parity of `i0` decides which samples are low-pass. Whole-sample symmetric extension, filled only in the margins |
| `buildTile` (1888) / `buildCodeblocks` (1960) | the geometry of Annex B: tiles ▸ components ▸ resolutions ▸ subbands ▸ precincts ▸ code-blocks. Precinct indices are computed on the **resolution** grid, not the subband's |
| `numPasses` (2002) / `segmentBreaks` (2014) | how many coding passes a packet declares, and where the encoder terminated (`termall`, `bypass`) |
| `readPacket` (2038) | one packet header: inclusion ▸ zero bit-planes ▸ passes ▸ `Lblock` ▸ segment lengths, then the bodies |
| **`packetSequence`** (2085) | the progression order. Rather than the spec's five nested-loop machines, every (component, resolution, precinct) is listed with the position it projects to and **sorted** — same order, far less to get wrong |
| `decodeCodeblocks` (2133) / `writeBack` (2174) | tier-1 over a tile, then coefficients into their subband. `missing` is how many low bit-planes never arrived — uniform per block, so the mid-point of what is left is the best guess for all of them |
| `reconstruct` (2191) | `2D_INTERLEAVE` + `HOR_SR` + `VER_SR`, coarsest resolution upwards |
| `parseSIZ`/`parseCOD`/`parseQCD` (2239, 1846, 1872) | the marker segments; `parseCOC`/`parseQCC` override them per component |
| `findCodestream` (2258) | the `.jp2` box tree, or a bare `.j2k`, or a codestream with junk in front |
| `decode` (2277) | markers ▸ tiles ▸ packets ▸ tier-1 ▸ wavelet ▸ MCT |
| `toRGBA` (2436) | subsampled components stretched back up; grey, RGB, RGBA and CMYK |

### `PdfText` (2488–3430)

`extract(buffer)` (text) and `images(buffer)` (a scan's pictures) are the
only entry points; everything else is one stage of one of them. Order
matters — object streams must be expanded before the page tree is walked, or
a modern PDF looks empty. Both go through `parseDoc`, which caches the last
document against the very `ArrayBuffer` it was handed, so asking both
questions about one scan costs a single parse.

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
| **`pageText`** (2902) | the entry point; hands off to `runContent` |
| **`runContent`** (2913) | the tiny interpreter, **re-entrant**: text operators plus `q`/`Q`/`cm`/`Do`, with the full text matrix — see the traps below |
| **`formsOf`** (3195) | every `/Form` XObject a resource dictionary offers, inflated and ready for `runContent` to walk into. Memoised, so one form drawn on 108 pages is inflated once; `building` guards a form that draws itself |
| `joinLines` (3150) | drawing order → reading order; a wide vertical gap becomes a paragraph break |
| `parseDoc` / `contentOf` (3354, 3370) | the shared front half: scan ▸ refuse encrypted ▸ expand object streams ▸ page list; then one page's content stream |

The picture half — everything a scanned page needs (`docs/RECIPES.md` § A):

| Function | What |
|---|---|
| `xobjectsOf` (3175) | a page's `/XObject` dict → name → object number |
| `drawnOrder` | the `/Im3 Do` operators, **in painting order**. The dictionary is unordered, and a scanner that cuts a page into strips relies on the order |
| `componentsOf` / `sampleAt` | colour space → components; one sample at 1/2/4/8/16 bits |
| **`imageOf`** (3267) | one `/Subtype /Image` → `{kind:"jpeg", bytes}` (the browser decodes it), or `{kind:"raw", rgba}` — including **`/JPXDecode`, through `Jpx`**. CCITT, JBIG2, LZW and indexed palettes → `null` |
| `collectImages` (3329) | walks a page's XObjects, three levels into `/Form`s, skipping anything logo-sized (`MIN_IMAGE_PX`) |
| **`images`** (3406) | page-ordered pictures; falls back to every image object in the file when the page tree yields none |

Traps this reader was written around, all four found by feeding it real
files rather than ones hand-built in a test:

- **the page may draw nothing itself.** A design tool puts the whole
  layout, text included, in a `/Form` XObject and leaves the page as
  `/Fm0 Do`. A reader that stops at the page sees an empty page and calls
  a perfectly good document a scan. `runContent` recurses; `formsOf`
  supplies what it recurses into.
- **`BT`/`ET` do not mean "line".** Producers exist that wrap *every single
  glyph* in its own text object. Line breaks come from geometry only.
- **`Tm` is not a reason to forget where the last glyph ended.** With a
  fresh `Tm` before every glyph, the gap from `prevEnd` is the only
  evidence a space belongs there — so `prevEnd` survives a `Tm`, and the y
  test in `show()` is what ends a line.
- **the page can be flipped.** Skia writes `1 0 0 -1 … Tm`, so its lines
  arrive bottom-first. `show()` normalises with the sign of the composite
  matrix's `d`; nothing downstream needs to know.
- **runs are split by font, not by word.** "min" arrives as `m` + `in`
  when a diacritic pulls in a second font, so a space can only be inferred
  from the *real* advance width — hence `widthsOf`. With a guessed width
  the output reads "m in", "arom ă", "10m l".

### `Recipes` (3449–3798)

`parse(text)` → `[{ n, title, auto, meals:[{ kind, label, name,
ingredients:[{ qty, unit, item, group, fdc }], steps:[] }] }]`. `toLines`
cleans and re-joins wrapped lines, `isStep` decides ingredient vs method,
`parseIngredient` splits quantity/unit/name, `splitSteps` cuts prose into
numbered steps.

| Piece | What |
|---|---|
| `clean` | among other things, repairs **cedilla ş/ţ to comma-below ș/ț** — a great many PDFs are set in the wrong characters, and everything downstream should only ever see the right ones |
| `WORD_QTY` / `NUM_WORD` | "o conservă ton", "un ou mare" — a quantity written as a word, stored as the digit it means, because that column is meant to be multiplied by |
| `COMPONENT_RE` | "Sos:", "Dressing:", "Topping:" — a part of the dish, not the next meal. Read as meals they left the parent with no method and themselves with no ingredients |
| `SEC_ING` / `SEC_STEP` | "Ingrediente:" / "Mod de preparare:" — believed when present, so a labelled book parses as well as an unlabelled one |
| `day.auto` | true when the parser invented the day rather than reading a header. Once real day headers exist, an invented day with no ingredients is front matter and is dropped |

**`NOT_LETTER`, never `\b`** — after `ă` a `\b` cannot match (it is not a
word character in a non-unicode regex), which silently turned every Romanian
imperative into an ingredient once. Every word-end test in this block is that
lookahead; keep new verbs and units on it.

**Two rules decide a `Word:` header**, in this order: a known meal word
starts a meal; a known component word, *or* an unknown word arriving while
the current meal has ingredients but no method yet, is a component of that
meal. Anything else is still accepted as a custom meal.

### The day view (3875–4270)

A book of 100 menus is 300 meals — 14,274 DOM nodes and a page 140,727
pixels tall if every one is rendered. The list is a **view** over
`model.days`; nothing here mutates it except the explicit edits.

| Line | What |
|---|---|
| 3878–3883 | `FOLD` / `fold()` — search folding. The cedilla forms are `\u`-escaped on purpose: they must not appear literally (tests/recipes.js checks) but real text is full of them |
| 3887 | **`view`** — `{ q, kinds, open, allOpen }`. `open` holds **day objects**, not indices: an index drifts the moment a day above it is deleted |
| 3901 | `dayMatches(day, di)` → the indices of that day's meals that survive the search and chips. A day whose *title* matches keeps all of them |
| 3920 / 3933 | `shownDays()` — what is on screen; `outputDays()` — what the markdown is built from (the same, when "only the recipes shown" is ticked) |
| 3939 / 3966 | `renderFilters` (chips, only for kinds the book has), `paintFound` |
| 3988 | `markInto` — puts the search terms in `<mark>` without letting the text become HTML; matching on the folded string, marks on the original |
| 4012 | `daySummary` — a day nobody is editing, in one row |
| 4043 | `daySelect` — move a meal to another day; options filled on first use |
| **4081** | **`arrangeIntoDays(perDay)`** — a day ends where a meal kind repeats, or, for a flat list with no kinds, `perDay` to a day named in eating order |
| **4111** | **`renderDays`** — collapsed rows, or the full editor for the days that are open. Eight or fewer just open |
| 4380 | `filtersChanged` — re-renders the markdown only when the output actually depends on the filter |

**Two things must stay in step:** `MEAL_KINDS` (3889) is the one list of
meal kinds — the `<select>` in a meal header, the filter chips and
`arrangeIntoDays` all read it. `mealLabel` (3832) is the one place a kind
becomes a word.

### The markdown (`buildDayMarkdown`, 4280)

The output shape is a contract (`docs/RECIPES.md` § C): `#` day, `##` meal,
`### 1. Ingrediente` as a four-column table whose last column is the empty
USDA FDC id, `### 2. Metoda de preparare` as an ordered list, then the
totals stub. Its third argument is the list of meal indices to write, which
is how "only the recipes shown" narrows a day. Change the shape here and in
that doc together.

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

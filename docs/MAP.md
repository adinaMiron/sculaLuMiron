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

## markdown-editor.html — 6481 lines · Markdown editor

`lang="en"`. No section banners — this table is the only map.

| Lines | Contents |
|---|---|
| 8–1377 | App CSS. `:root` **9–39** (earth-palette tokens + `--danger` + the `--graph-*` node roles). Workbooks panel **196–286**. Navigation panel **609**. **Search & filter panel 720–893**. **Knowledge graph 1041–1376**. `@media` **907** (the toolbar tightening), 912, 943, 1028, 1035, **1354** (the graph on a phone) |
| 1380 | **mammoth.js CDN** (docx import) — only external dep in the repo |
| 1385–2040 | **Shared nav + `ScuLaFolder`** |
| 2042–~2338 | Markup: header, toolbar, workspace, panels (`#wb-panel`, `#img-panel`, **`#find-panel` 2184–2217**, `#nav-panel`), modals |
| **2340–2469** | Markup: **`#graph-view`** overlay + `#wiki-modal` + `#wiki-suggest` |
| 2471–6481 | App script |

| Line | Function / region |
|---|---|
| 2478 | `I18N` (`ro:` 2479 / `en:` 2608), `t()`, `store`, `applyUILang` |
| 2790–2792 | `editor`, `preview` refs, `savedRange` |
| 2795–2817 | Selection: `saveSelection`, `restoreSelection`, `insertAtCursor`, `wrapSelection` |
| 2819–2892 | Insert helpers: `insertHeading`, `insertList`, `insertOrderedList`, `insertFontSize` |
| 2894–2928 | Image modal: `openImageModal`, `handleLocalImage`, `insertImage` |
| **2930–3020** | **Pasting a picture** (Ctrl+V): `imageBlobToDataUrl` (2967, the shrink), `clipboardImage` (2990), `handleEditorPaste` (2999) — the picture goes in as a `data:` URI, so it lives in the markdown file itself |
| 3023–3025 | `workingFolderHandle`, `IMAGE_EXTS` — the image **explorer**'s own read-only picker, unrelated to `ScuLaFolder` |
| 3033–3103 | Responsive: `isSmallScreen`, `isMobile`, `setView`, **`PANELS`** (3044) + `togglePanelById`, `toggleFind`/`findIsOpen` (3087) — one map drives all four side panels |
| 3195–3251 | Image tree: `createImageItem`, `showImageDetail`, `insertSelectedImage` |
| **3263–3568** | **Wikilinks, tags and block anchors** — see the sub-table below |
| 3570 | `resolveImageSrc` — image-path rewrite, export-only |
| 3576 | `applyInline(text, opts)` |
| **3592** | **`parseMarkdown(md, opts)`** — single parser, shared by preview and export |
| 3698–3722 | `updatePreview` (+ the graph and search refreshes), the `#preview` click delegation |
| **3724** | **`updateNav()`** — the navigation panel. Each heading remembers its **slug and its source line**; a click takes the preview to the slug (`gotoPreviewAnchor` 3469) and the textarea to the line (`gotoSourceHeading` 3485) |
| 3785 | `updateStatus` |
| **3806–4392** | **Workbooks** — see the sub-table below |
| **4394–5384** | **Knowledge graph** — see the sub-table below |
| **5386–5801** | **Search & filter** — see the sub-table below |
| **5803–6046** | **Writing a `[[link]]`**: `wikiCandidates` 5816, the modal 5843–5919, the `[[` suggester 5921–6046 (incl. **`editorMirrorAt`** 5921, shared with the search panel) |
| 6049–6069 | `newFile`, `openFile`, `handleFileOpen` (all detach from the open chapter) |
| 6071 | `importDocx` |
| 6114 | `htmlToMarkdown` (docx → md) |
| 6216–6223 | **`saveOut()`** (one line onto `ScuLaFolder.save`), `saveFile`, `exportHtml` |
| ~6228–6262 | **Exported-HTML template** — standalone `<style>`/`<body>` string |
| 6275–6380 | Table modal: `rebuildTableGrid`, `insertTable`, `insertCodeBlock` |
| 6382–6400 | Link modal: `openLinkModal`, `insertLink` |
| 6402–6441 | Event listeners + keyboard shortcuts (Ctrl+1/2/**3**/**4**, Ctrl+Shift+**L**/**F**) |
| 6443–6481 | `applyResponsiveDefaults`, init (`loadWorkbooks()` runs here) |

### Workbooks (3806–4392) — `docs/FEATURES.md` § E

A workbook holds chapters; one chapter is one markdown file. IndexedDB
(`scula-md`) is the source of truth on every device; the `markdown` folder
is a mirror, and each record carries the `folder`/`file` it owns — that
record **is** the UI↔folder correspondence.

| Line | Region |
|---|---|
| 3806–3816 | DB/store names, module state (`wbBooks`, `wbChapters`, `wbCurrentId`, …) |
| 3818–3854 | IndexedDB plumbing: `wbDb`, `wbTx`, `wbAll/wbPut/wbDrop`, `wbMetaGet/Set`, `wbPersist` |
| 3864–3893 | `wbSlug` + `wbUniqueFolder`/`wbUniqueFile` — how a title becomes a file name |
| 3905–3937 | **Folder mirror**: `wbFolderMode`, `wbMirrorWrite`, `wbMirrorRemove` (never recursive) |
| 3937–4047 | Panel rendering: `wbActBtn`, `renderWorkbooks`, `paintWorkbookWhere`, `paintWorkbookCrumb` |
| 4050–4200 | Operations: create/rename/delete workbook, new/open/rename/delete/export chapter, `syncAllToFolder` |
| 4201–4233 | Autosave: `scheduleAutosave`, `flushChapter`, `detachChapter`, `canLeaveEditor` |
| 4235–4365 | Saving: `saveToWorkbook`, the modal (`openWorkbookModal` → `confirmSaveToWorkbook`) |
| 4367–4392 | `loadWorkbooks` (boot + resume last chapter), `scula-folder`/visibility/unload hooks |

**Two writes, two moments.** Typing autosaves to IndexedDB only (no
permission prompt is legal outside a gesture); the disk mirror happens on
explicit saves — `saveToWorkbook`, `confirmSaveToWorkbook`, rename, delete,
`syncAllToFolder` — all of which run inside a click.

### Wikilinks, tags and block anchors (3263–3568) — `docs/FEATURES.md` § G

Obsidian's link syntax, and the only reason the graph has any edges. Both
the preview and the export go through it, and so does the graph scanner.

| Line | Function |
|---|---|
| 3287–3294 | **`WIKI_RE`**, `TAG_RE`, `BLOCK_RE`, `IMG_RE` — the four patterns. `WIKI_RE`/`TAG_RE` are **global**; anything that `exec`s them in a loop must use a private copy (`scanNote` does) |
| 3298–3304 | `mdUnescape` / `attrEsc` — `applyInline` is handed already-escaped text, so a name is `A &amp; B` until it goes through these |
| 3307 | `mdPlain(raw)` — heading text with its inline markdown stripped |
| **3320** | **`headingSlug(raw, seen)`** — the one slug function. `parseMarkdown` writes it as a heading `id`, the nav panel and every `[[Note#Section]]` jump to that id. Three callers, one implementation: keep it that way |
| 3335 | `parseWikiTarget(raw)` → `{name, sub, heading, block}` |
| 3347–3383 | `wikiNotes()` — every note a link may point at (every chapter, plus the loose document), cached; `invalidateWikiIndex()` is called from `renderWorkbooks()` |
| **3386** | **`resolveWiki(name, fromChapterId)`** — path, then `Workbook/Title`, then title, then file name; the nearest match (same workbook) wins, as in Obsidian |
| 3422 | `renderWikiLink(...)` — the live `<a>` for the preview, a real anchor or plain text for the export |
| 3455–3462 | `takeBlockId` / `liWithBlockId` — `…text ^anchor` becomes `id="block-anchor"` |
| **3469** | **`gotoPreviewAnchor(id)`** — the single jump-to-anchor path: nav panel, wikilinks and the graph all land here |
| **3485** | **`gotoSourceHeading(line)`** — the same jump for the **Markdown source**: selects the heading's line in the textarea and scrolls to it via `editorMirrorAt` (5921). Nav-panel clicks only; a phone has one pane on screen, so there it does nothing |
| 3507 | `followWikiLink(name, heading, block)` — switch chapter, then jump |
| 3525 | `offerToCreateNote(name)` — an unresolved link becomes a real chapter |
| 3547 | `createChapterNamed(...)` — `newChapter()` without the prompt |

**The tag pattern runs last in `applyInline`, on purpose.** By then every
`#` the pass produced sits after `>` or a quote, and the lead class
(`(^|[\s(\[{])`) excludes both — which is what keeps `href="#force"` and
`<code>#tag</code>` from being turned into tags. `scanNote` has no such
pass to hide behind, so it blanks the `[[links]]` itself before scanning
tags; without that, `[[#Inertia]]` mints a tag called `Inertia`.

### Knowledge graph (4394–5384) — `docs/FEATURES.md` § G

One `<canvas>`, one force simulation, no library. Obsidian's palette
(Filters · Groups · Display · Forces) drives `gvSettings`, which persists
under `scula:graph`.

| Line | Region |
|---|---|
| 4434–4450 | **`GRAPH_COLORS`** — the `--graph-*` tokens resolved **once**; canvas cannot use `var()`. Same rule as `editor.html`'s `CHROME`, see `docs/THEME.md` |
| 4449–4453 | `GV_BASE_R`, **`GV_STRUCTURAL`** — the settings that change *which* nodes exist (those rebuild; everything else only repaints) |
| 4455–4475 | `GV_DEFAULTS`, `gvSettings`, `gvLangReady` (a **`var`** — `applyUILang` reads it early) |
| 4477–4493 | `gv` — the whole live state: nodes, links, `pos` (survives a rebuild), transform, pointers |
| **4495** | **`scanNote(md)`** — one pass over a note: headings, `^blocks`, `#tags`, `[[links]]`, images, each tagged with the section it sat in |
| 4547–4564 | `scanNoteCached`, `noteText` (the open note reads from the **editor**, saved or not), `gvCurrentBookId` |
| **4567** | **`buildGraph()`** — dispatches on scope |
| **4597** | **`buildNoteScope`** — the note, its headings as an outline, its blocks, its tags, and `[[#Section]]` links as section-to-section edges |
| 4670 | `buildNotesScope` — chapters as nodes (`workbook` and `vault`) |
| 4708–4779 | `gvMatches`, **`applyGraphFilters`** (search → kinds → local-graph depth → orphans, in that order), `gvNodeColor` (groups first) |
| 4781–4844 | **`gvKick`/`gvStep`** — the four forces and the alpha decay |
| 4822–4937 | `gvSX`/`gvSY`, `gvRadius`, **`gvDraw`** (hover dims the unconnected), `gvArrow` |
| **4939** | **`gvRebuild()`** — filter, recompute degrees, keep old positions, re-link |
| 4989–5027 | `gvFit`, `gvZoomAt`/`gvZoomBy`, `gvResize` (dpr-aware) |
| **5029–5148** | **`gvHit` + `gvBindStage`** — the one pointer route: drag a node, drag the background to pan, two fingers to pinch, wheel to zoom |
| 5150 | `gvOpenNode` — note opens, heading/block jumps, tag becomes the search, unresolved offers to be created |
| 5167–5242 | Settings: save/load, `gvPaintControls`, `gvBindControls` (generic over `[data-gv]`), `setGraphScope` |
| 5244–5304 | `renderGvGroups`, `renderGvLegend` |
| 5306–5374 | `gvLoop`, **`openGraph`/`closeGraph`/`toggleGraph`**, `openGraphForTag`, `gvRefresh` (debounced; the graph follows the editor) |
| 5376 | `gvRepaintLang` — what `applyUILang` calls for the generated legend/groups/counts |

**Two lists must stay in step:** a new setting needs a control in the
`#graph-view` markup carrying `data-gv="<key>"` **and** an entry in
`GV_DEFAULTS`; add it to `GV_STRUCTURAL` too if changing it changes which
nodes exist. `gvBindControls`/`gvPaintControls` then need no edit at all.

### Search & filter (5386–5801) — `docs/FEATURES.md` § H

One query, the same three scopes the graph has (open chapter · this
workbook · every workbook), then two rows of chips that narrow what it
found. Reads `wikiNotes()`/`noteText()`/`scanNoteCached()` — the graph's —
so "a note" means one thing in both features. Nothing touches the disk.

| Line | Region |
|---|---|
| 5401–5428 | `FD_KEY` (`scula:find`), **`FD_KINDS`**, `fdReady` (a **`var`** — `applyUILang` reads it early), **`fdState`** (query, scope, four toggles, the two chip sets) |
| 5430–5445 | **`fdFold`/`fdFoldMap`** — NFD minus the combining marks, with every folded character mapped back to its source index so a hit still marks the right characters |
| 5448–5473 | `fdMatcher` (escape or regex, a broken one flagged not thrown), **`fdLineHits`** — whole-word tests the characters either side, **never `\b`** (after `ă` it cannot match) |
| 5475 | `fdKindOf(line, inFence)` — the axis the "Only" chips filter on |
| **5487** | **`fdNoteHits(text, m)`** — one chapter, line by line; `section` carries the `headingSlug()` the preview gave that heading, counted the same way |
| 5513–5535 | `fdScopeNotes` (the three scopes), `fdNoteOrder` |
| **5537** | **`fdCompute()`** — scope ▸ query ▸ tags ▸ kinds. Each chip's count comes from one step earlier than the chip filters |
| 5571 | `fdSnippet` — escapes in the gaps between ranges, so a line of literal HTML is shown, never run |
| 5589–5670 | `fdPaintScope`/`fdPaintOpts`/`fdPaintKinds`/`fdPaintTags`, **`fdRender`** |
| 5672–5700 | `fdOffsetOfLine`, **`fdGoto`** — open the chapter, select the match, take the preview to the same section. Scrolls via `editorMirrorAt` (5921), shared with the `[[` suggester |
| 5702–5741 | `fdRun`/`fdRefresh`/`fdQueryChanged`/`fdClearQuery`/`fdQueryKey`, `fdLive` (called from `updatePreview`), `fdRepaintLang` |
| 5743–5765 | `fdSaveSettings`/`fdLoadSettings` — scope and the four toggles persist under `scula:find` |
| 5767–5798 | Control wiring; the chips and result rows are generated, so both are delegated |

**Parser is unified (2026-08).** `parseMarkdown(md, {forExport})` and
`applyInline(text, {forExport})` serve both preview (`forExport` falsy) and
export (`forExport: true`) from one implementation — see `resolveImageSrc`
for the only behavioural fork (relative image paths get `public/images/`
prefixed, and a bare image-path line becomes a standalone `<img>`, only
when exporting). New markdown syntax now needs exactly one edit, in
`parseMarkdown`/`applyInline`, not two.

**One trap remains:** exported HTML must stay self-contained (its `<style>`
runs 6234–6261). It ships to people who don't have the app, so it uses
literal hex, not `var(--…)`. **Do not migrate that block to theme tokens.**

---

## recipes.html — 7072 lines · "Rețete" (PDF / photo → recipe markdown + USDA)

`lang="ro"`. The *why*, the format contract and the USDA plan live in
**`docs/RECIPES.md`** — read that before changing the markdown it writes.
Map only below.

| Lines | Contents |
|---|---|
| 11–337 | App CSS. `:root` **12–51** (earth palette, semantic names). Buttons 92–120, drop zone 121–134, day/meal cards 166–212 including **the per-ingredient USDA line `.ing + .nut` 187–201**, **search / chips / collapsed days / `.grp` 213–257**, markdown preview 258–277, **`#htmlFrame` (the shareable page, previewed) 278–283**, tabs 284–291, folds + checkboxes + `.badge` 292–313 |
| 340–995 | **Shared nav + `ScuLaFolder`** |
| 998–1176 | Markup: **five** numbered cards — source ▸ text ▸ markdown ▸ review, then `#htmlCard` (**1158–1173**, full width under the two columns). The OCR fold is `#ocrBox` (1027–1062); `#optNutri` 1104, **the USDA fold `#nutriBox` 1113–1123**, `#onlyShownBox` 1107, the filter bar is `#filters` (1137), `#found` 1144. `#btnMd` + `#mdFile` + `#bookFile` are in card 1. `<datalist id="usdaList">` is at **1176**, after the wrap and filled once at init |
| 1178–7072 | App script, numbered sections below |

| Line | Section |
|---|---|
| 1199 | **1. i18n** — `I18N` (`ro:` 1202 / `en:` 1394), `t()` (variadic), `applyUILang()` |
| 1572 | 2. Settings store (`scula:recipes`) |
| **1598** | **3. `Jpx`** — the JPEG 2000 decoder |
| **2648** | **4. `PdfText`** — the dependency-free PDF reader |
| **3608** | **5. `Recipes`** — the parser, and the reader that takes its markdown back |
| **4120** | **6. `Nutrition`** — the USDA table, the Romanian names, and what a recipe adds up to |
| 5135 | 7. The app — state, `setStatus`/**`say`**, **the day view**, review cards, markdown, **the shareable HTML page** |
| 6335 | 8. Getting the text in — `ingest`/**`analyse`** (which reader gets the text)/`handleFile(s)`, then OCR |
| 6705 | 9. Saving — `.md`, **`.json` (the ingredient book)** and **`.html`** via `ScuLaFolder`, chapters via `scula-md` |
| 6863 | 10. Wiring + init |

### `Jpx` (1620–2645)

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
| `MQ` (1641) | the arithmetic decoder, Annex C. `QE`/`NMPS`/`NLPS`/`SW` are Table C.2 verbatim |
| `RawBits` / `HeadBits` | the two other bit readers: bypass passes, and packet headers with their 0xFF stuffing |
| `TagTree` (1737) | inclusion and zero-bit-planes, decoded against a rising threshold **across packets** — hence the state on the object |
| `BitModel` (1806) | tier-1: `runSignificance`, `runRefinement`, `runCleanup`. `nbSig` keeps the neighbour counts packed in a byte and updated in `setSig`, which is what stops a naive tier-1 re-reading eight flags per coefficient per plane |
| `synth1D` (1975) | the inverse wavelet, 5/3 and 9/7, over an **absolute** index range — the parity of `i0` decides which samples are low-pass. Whole-sample symmetric extension, filled only in the margins |
| `buildTile` (2063) / `buildCodeblocks` (2135) | the geometry of Annex B: tiles ▸ components ▸ resolutions ▸ subbands ▸ precincts ▸ code-blocks. Precinct indices are computed on the **resolution** grid, not the subband's |
| `numPasses` (2177) / `segmentBreaks` (2189) | how many coding passes a packet declares, and where the encoder terminated (`termall`, `bypass`) |
| `readPacket` (2213) | one packet header: inclusion ▸ zero bit-planes ▸ passes ▸ `Lblock` ▸ segment lengths, then the bodies |
| **`packetSequence`** (2260) | the progression order. Rather than the spec's five nested-loop machines, every (component, resolution, precinct) is listed with the position it projects to and **sorted** — same order, far less to get wrong |
| `decodeCodeblocks` (2308) / `writeBack` (2349) | tier-1 over a tile, then coefficients into their subband. `missing` is how many low bit-planes never arrived — uniform per block, so the mid-point of what is left is the best guess for all of them |
| `reconstruct` (2366) | `2D_INTERLEAVE` + `HOR_SR` + `VER_SR`, coarsest resolution upwards |
| `parseSIZ`/`parseCOD`/`parseQCD` (2414, 2021, 2047) | the marker segments; `parseCOC`/`parseQCC` override them per component |
| `findCodestream` (2433) | the `.jp2` box tree, or a bare `.j2k`, or a codestream with junk in front |
| `decode` (2452) | markers ▸ tiles ▸ packets ▸ tier-1 ▸ wavelet ▸ MCT |
| `toRGBA` (2611) | subsampled components stretched back up; grey, RGB, RGBA and CMYK |

### `PdfText` (2663–3605)

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
| **`pageText`** (3077) | the entry point; hands off to `runContent` |
| **`runContent`** (3088) | the tiny interpreter, **re-entrant**: text operators plus `q`/`Q`/`cm`/`Do`, with the full text matrix — see the traps below |
| **`formsOf`** (3370) | every `/Form` XObject a resource dictionary offers, inflated and ready for `runContent` to walk into. Memoised, so one form drawn on 108 pages is inflated once; `building` guards a form that draws itself |
| `joinLines` (3325) | drawing order → reading order; a wide vertical gap becomes a paragraph break |
| `parseDoc` / `contentOf` (3529, 3545) | the shared front half: scan ▸ refuse encrypted ▸ expand object streams ▸ page list; then one page's content stream |

The picture half — everything a scanned page needs (`docs/RECIPES.md` § A):

| Function | What |
|---|---|
| `xobjectsOf` (3350) | a page's `/XObject` dict → name → object number |
| `drawnOrder` | the `/Im3 Do` operators, **in painting order**. The dictionary is unordered, and a scanner that cuts a page into strips relies on the order |
| `componentsOf` / `sampleAt` | colour space → components; one sample at 1/2/4/8/16 bits |
| **`imageOf`** (3442) | one `/Subtype /Image` → `{kind:"jpeg", bytes}` (the browser decodes it), or `{kind:"raw", rgba}` — including **`/JPXDecode`, through `Jpx`**. CCITT, JBIG2, LZW and indexed palettes → `null` |
| `collectImages` (3504) | walks a page's XObjects, three levels into `/Form`s, skipping anything logo-sized (`MIN_IMAGE_PX`) |
| **`images`** (3581) | page-ordered pictures; falls back to every image object in the file when the page tree yields none |

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

### `Recipes` (3624–4115)

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

#### `fromMarkdown` (3973–4115) — the contract, read back

`fromMarkdown(text)` → `{ days, source }`: the inverse of
`buildDayMarkdown()`, so a `.md` this page wrote comes back as the model it
was built from and every feature downstream works on it. `looksLikeMarkdown`
is what `analyse()` asks to decide which reader gets the text.

| Line | What |
|---|---|
| 3988 (`MD_SOURCE`, `MD_TOTALS`, `MD_RULE`, `MD_SEP_ROW`) | the four lines that are *not* content: the source note, the totals stub's heading, a `---`, and a table's `\| --- \|` row |
| `mdCells` (3999) | one walk over the characters. `\|` is the only escape `cell()` writes, so it is the only one read |
| `looksLikeMarkdown` (4016) | a heading **and** either a `### 1.`/`### 2.` section or a table row — a plan with a stray `#` in it still goes to `parse()` |
| `fromMarkdown` (4022) | `#` day ▸ `##` meal (`## Total pe zi` skipped) ▸ `###` matched on its **leading digit**, so both languages read ▸ table rows below the separator ▸ `1. …` steps |

The rules and the one thing that does not survive (an ingredient's group)
are in `docs/RECIPES.md` § C, "Reading it back".

### `Nutrition` (4131–5130)

The USDA table and everything that turns an ingredient into four numbers.
It sits between the parser and the app because both sides need it: the
markdown writer, the review cards and the shareable page all ask it the
same questions. The *why*, the fallbacks and the format of the ingredient
book are `docs/RECIPES.md` § E.

| Line | What |
|---|---|
| **`USDA_FOODS`** (4156) | 425 rows, `[id, description, kcal, protein, fat, carb, piece g, cup g, tbsp g]` per 100 g. 363 are FoodData Central's Foundation Foods, compiled out of `FoodData_Central_foundation_food_json_2026-04-30.json`; the 62 whose id starts **`L`** are the staples that set does not have — pâine, paste, miere, cașcaval. An `L` id can never be read as an fdcId |
| **`RO_ALIAS`** (4591) | 600 Romanian (and some English) phrases → a row above. Written **already folded**, which is the shape `nfold()` puts a name in |
| `nfold` (4760) | lowercase, no diacritics, punctuation to spaces; `%` and `.` survive because "lapte 1.5%" is a real ingredient. The cedilla forms are `\u`-escaped, same rule as everywhere else in this file |
| `head` (4816) | what is left of a name once the notes come off: a `(…)` is a note, a `+`/`,`/`sau` is the parser having failed to split two ingredients, a leading `de ` is what "2 felii **de** pâine" leaves behind |
| `byWords` (4828) | the English fallback: the words of the name against the words of the descriptions, first word of a description worth two. **Below 0.34 it returns nothing** — a wrong food is worse than none, because a wrong one is silent |
| **`match`** (4851) | alias on the whole name ▸ the alias phrase that starts **earliest** (longest on a tie) ▸ `byWords`. Earliest because Romanian puts the food first: "morcov ras o conservă de fasole albă" is a row about the carrot |
| `UNIT_G` (4875) / `qtyValue` (4900) / **`grams`** (4918) | unit → grams, the quantity column's six shapes (`60`, `1,5`, `1/2`, `½`, `1 ½`, `2-3`), and the two multiplied. A unit that names a *thing* — felie, bucată, cană, conservă — takes the food's own portion weight first and sets `guess` when there is none |
| **the book** (4934–5082) | `learn` (4969) grows it from a plan, `remember` (5032) writes a hand-picked food into it, `rematch` (5050) resolves everything that is not hand-written again, `toJSON`/`fromJSON` (4996, 5011) are the file. An entry marked `hand` supplies its own numbers and is never written over |
| `forIngredient` (5085) / `forMeal` / `forDay` (5110) | one row, one meal, one day. `ok` needs both a food **and** a weight; `known` counts the rows that have both, which is what lets a total say it is incomplete |

`num(v, dp)` is the one rounding rule for the whole feature, so the
markdown, the shareable page and the review cards never disagree about
what 68.7499 is.

### The day view (5280–5681)

A book of 100 menus is 300 meals — 14,274 DOM nodes and a page 140,727
pixels tall if every one is rendered. The list is a **view** over
`model.days`; nothing here mutates it except the explicit edits.

| Line | What |
|---|---|
| 5282–5290 | `FOLD` / `fold()` — search folding. The cedilla forms are `\u`-escaped on purpose: they must not appear literally (tests/recipes.js checks) but real text is full of them |
| 5292 | **`view`** — `{ q, kinds, open, allOpen }`. `open` holds **day objects**, not indices: an index drifts the moment a day above it is deleted |
| 5306 | `dayMatches(day, di)` → the indices of that day's meals that survive the search and chips. A day whose *title* matches keeps all of them |
| 5325 / 5338 | `shownDays()` — what is on screen; `outputDays()` — what the markdown is built from (the same, when "only the recipes shown" is ticked) |
| 5344 / 5371 | `renderFilters` (chips, only for kinds the book has), `paintFound` |
| 5393 | `markInto` — puts the search terms in `<mark>` without letting the text become HTML; matching on the folded string, marks on the original |
| 5417 | `daySummary` — a day nobody is editing, in one row |
| 5448 | `daySelect` — move a meal to another day; options filled on first use |
| **5486** | **`arrangeIntoDays(perDay)`** — a day ends where a meal kind repeats, or, for a flat list with no kinds, `perDay` to a day named in eating order |
| **5516** | **`renderDays`** — collapsed rows, or the full editor for the days that are open. Eight or fewer just open |
| 5874 | `filtersChanged` — re-renders the markdown only when the output actually depends on the filter |

**Two things must stay in step:** `MEAL_KINDS` (5294) is the one list of
meal kinds — the `<select>` in a meal header, the filter chips and
`arrangeIntoDays` all read it. `mealLabel` (5182) is the one place a kind
becomes a word.

### The markdown (`buildDayMarkdown`, 5708)

The output shape is a contract (`docs/RECIPES.md` § C): `#` day, `##` meal,
`### 1. Ingrediente` as a four-column table whose last column is the USDA
food, `### 2. Metoda de preparare` as an ordered list, **`### 3. Valori
nutriționale`** as the per-ingredient table and its total, then the day
totals — which are now numbers rather than a stub. Its third argument is
the list of meal indices to write, which is how "only the recipes shown"
narrows a day. Change the shape here and in that doc together.

`macro(v, dp, known)` (5689) and `fdcCell(v)` (5699) are what fills the new
cells. `macro`'s third argument is the whole point of it: olive oil really
does have no protein and that cell must say `0`, while an ingredient nobody
matched has no protein *number* and that cell must stay empty. `fdcCell`
puts the id first and alone — everything after the `·` is worked out again
from it and the quantity beside it, which is why the file still round-trips
byte-identically.

### The shareable HTML page (5889–6333)

One self-contained `.html` file — no script, no stylesheet, nothing to
fetch — built from the model rather than from the markdown. The *why* is
`docs/RECIPES.md` § G.

| Line | What |
|---|---|
| **`DOC_JS`** (6026) | the one script the file carries, and the reason the preview iframe is `sandbox="allow-scripts"` now. Plain ES5: this document may be opened years from now. Everything it needs is on the elements — grams per unit and the four values per 100 g, as `data-` attributes — so there is no table embedded a second time and still nothing to fetch |
| `qtyHtml` (6133) / **`nutriHtml`** (6155) | the quantity as a field, and the table under the method that follows it. An ingredient with no food gets the field but no `data-k`, which is what keeps it out of the total |
| `DOC_CSS` (5905) | the whole document's stylesheet as an array of lines: earth palette on screen, `@media print` turning it back into ink, `@page` margins. Kept as strings, like every other builder in this file |
| `escHtml` (6112) | the only defence the page has. An ingredient name is user text and goes through it |
| `htmlTitle` (6118) | the field, or the source file's name with its extension and dashes taken off, or the page's own name. Also what `saveHtml()` names the file after |
| `mealHtml` (6189) / `dayHtml` (6228) | a meal is its kind chip, its dish, an ingredient list and an ordered method; ingredient **groups** become subheadings, which is the thing the markdown table cannot carry |
| **`buildHtmlDoc`** (6267) | the whole file as one string — the same string the preview iframe shows and the export saves |
| `paintHtml` (6321) | shows or hides card 5, and rebuilds the preview: only while the fold is open, and 250 ms after the typing stops. The fold decides itself once — open at eight days or fewer |

`dayHtml` also writes a `table.nutri.dtot` per day — the roll-up the
markdown has always had a place for and never had anything to put in.

`saveHtml` (6737) and `openHtml` (6745) are the two ways out, both in
section 9: `ScuLaFolder.save()` for the file, a `blob:` URL for a tab (which
is also how it reaches a printer).

### The ingredient book, on screen and on disk

| Line | What |
|---|---|
| `nutRow` (5212) | the line under every ingredient in the review cards: the food it matched (an `<input list="usdaList">`, not a `<select>` — 425 options under each of a hundred days' ingredients would be tens of thousands of nodes), and what the quantity comes to |
| `fillUsdaList` (5833) / `paintNutri` (5844) | the one datalist, filled once at init; the "417 of 443 have a food" line in `#nutriBox` |
| `learnFrom` (5857) | called from `analyse()` on **every** route in — a PDF, a photo, a paste, an imported `.md` — because the point of the book is that a name is resolved once |
| `BOOK_KEY` (6760) | `scula:nutrition` in the settings store is where it lives between visits; `saveBookFile`/`readBookFile` (6771, 6777) are how it moves to another device. A `.json` picked or dropped goes there rather than to the parser |

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

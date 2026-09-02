# MAP.md — where everything lives

Line anchors so you can `sed -n 'A,Bp' file` instead of scanning. Numbers
drift by a few lines after edits; **search by the name in the right-hand
column** if a range looks wrong. Re-verify with `grep -n` when in doubt.

**When a range in here is off by more than a few lines, fix it in the same
change** — a stale anchor costs the next session a wasted read. Same for any
flow you find yourself repeating: promote it to a `/command`, a skill, or a
hook rather than re-typing it (see `CLAUDE.md` § "Keep this current").

Shared shape of all four files:

```
<style>  …app CSS, :root palette at the very top…  </style>
<body>
<nav id="site-nav">  + its own <style> + <script>   ← the shared block
…app markup…
<script>  …app logic, one IIFE/closure…  </script>
```

## The shared block (byte-identical in all four files)

From the `<nav id="site-nav">` line through `<!-- ===== end toolbar nav ===== -->`
(~650 lines). Rough starts: `voice.html:226` · `editor.html:427` ·
`index.html:1402` · `recipes.html:408` — these drift; grep the
`<nav id="site-nav"` line.

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

Any edit here goes into **all four** files — run `/verify` to confirm they
stayed identical.

---

## voice.html — 1749 lines · "Caiet vocal" (voice dictation)

`lang="ro"`. **The only app with a working i18n system** — copy its pattern.

| Lines | Contents |
|---|---|
| 11–221 | App CSS. `:root` palette at **12–37** (earth-palette tokens, migrated). `.rec-opt` (keep-the-audio row) **137–138** |
| 226–881 | **Shared nav + `ScuLaFolder`** (identical in all 4 files) |
| 885–1020 | Markup: header, controls, `#keepAudio` **913–917**, textarea, settings sheet |
| 1022–1745 | App script, numbered sections below |

Script sections (comment banners `/* === N. Title === */`):

| Line | Section |
|---|---|
| 1027 | **1. i18n** — `I18N` object (`ro:` 1030 / `en:` 1074), `t()` at 1120, `UI` at 1119 |
| 1123 | 2. Providers |
| 1148 | 3. Settings store — `KEY` 1150, `store` 1151 w/ memory fallback, `save()` 1285, `load()` 1286 |
| 1181 | 4. DOM refs |
| 1212 | 5. Language / engine chips |
| 1227 | **6. UI language** — `applyUILang()` **1231** |
| 1249 | 7. Settings sheet |
| 1322 | 8. Secure-context check |
| 1327 | 9. Recording (MediaRecorder) + segment rotation — **keep-the-audio recorder 1345–1397** |
| 1529 | 10. Transcription queue |
| 1623 | 11. Browser dictation (Web Speech API) |
| 1684 | 12. File import |
| 1698 | 13. Copy / share / **save → `ScuLaFolder.save()`** / clear |
| 1743 | 14. Init |

**Two independent language axes — do not conflate:**
- `S.ui` (`UI`) = interface language. Toggle `#uiLangBtn`.
- `S.lang` = *spoken* language for dictation (`ro-RO`/`en-US`/auto), L1627.

**Keeping the sound** (`#keepAudio`, off by default, persisted as
`S.keepAudio`): a **second** `MediaRecorder` on the same stream, started in
`startRec`/`startLive` via `armAudio()` + `startAudioKeep()` and stopped in
`stopRec`/`stopLive`. It is deliberately *not* the transcription recorder —
that one is rotated every `S.segMin` minutes and its segments are separate
containers, which cannot be glued back into one playable file. The checkbox
is read **once, at record time** (`audio.armed`); `#dlBtn` then writes the
blob next to the transcript under the name the transcript actually got
(`r.name`, which `freeName` may have bumped), so both land in
`<folder>/transcript/`. Browser dictation has no stream of its own, so
`startAudioKeep(null)` opens one and `stopOwnStream()` closes it.

---

## editor.html — 4923 lines · "Image Marker" (canvas annotation)

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
| 15–418 | App CSS. `:root` **30–46**. `@font-face` ×9 near top (all 9 files present in `fonts/`) |
| 57–68 | `html,body` — incl. `touch-action: pan-x pan-y`, the other half of the page-zoom lock |
| 72–117 | Top toolbar |
| 121–145 | `#canvasWrap` / `#stage` — **the viewport**: `overflow:hidden` + `touch-action:none` (every gesture is JS), `#stage` is `flex:0 0 auto` + `margin:auto` and carries the pan as a transform. `#stage.infinite` drops the drop shadow — that sheet has no edge worth casting one |
| 251–346 | **Floating panels** — `.panel`/`.panelHead`/`.panelBody`, `#toolsPanel`, `#selectionPanel`. `.panel` caps `max-width`/`max-height` to the viewport |
| 347–418 | Responsive: 900px (icon-only bar), 720px (sidebar under canvas), 520px (no tool captions), touch |
| 422–1076 | **Shared nav + `ScuLaFolder`** |
| 1084–1111 | Markup: `#toolbar` (file / zoom / capture / panel toggles) |
| 1113–1150 | Markup: `#toolsPanel` — Basic · Shapes · Arrows |
| 1152–1263 | Markup: `#selectionPanel` — one `.selRow` per property |
| 1264–1346 | Markup: `#newCanvasOverlay` — the size presets, incl. `.sizePreset[data-infinite="1"]` |
| 1347–1380 | Markup: the other modals, stage, sidebar |
| 1383–4921 | App script |

Script sections (banners `/* ===== Title ===== */`):

| Line | Section |
|---|---|
| 1387 | i18n — `I18N` (`ro:`/`en:`), `t()`, `applyUILang()` |
| 1605 | State — `state` object (incl. `zoom`/`panX`/`panY`, and `infinite`/`originX`/`originY`/`renderScale`), style defaults, `PALETTE` |
| 1664 | Utilities — incl. `setBtnLabel`/`setBtnIcon` (icon+label button spans) |
| 1706 | History — `pushHistory`/`commit`/`applyHistory`/`undo`/`redo`, and `committed`, the pre-change state an undo returns to |
| 1764 | Loading an image — `beginEditing(opts)`, `syncCanvasBuffers`, `setupStage` |
| 1807 | Screen snapshot |
| 1847 | Screen recording — `liveRenderLoop`, `startRecording` |
| 1993 | Recording preview / playback — `recordingBlob` kept for the folder save |
| **2120** | **Viewport: zoom + pan** — `applyZoomDisplay`/`applyPan` (the clamp), `clientToContent`/`panContentTo` (the anchor maths), `clientToWorld`/`panWorldTo`, `setZoom`/`setZoomAt`, `zoomReset`/`fitDrawing`, buttons, wheel, **`gesture*` page-zoom blockers** |
| **2287** | **Infinite canvas** — `INF_PAD`, `worldTransform`, `ensureInfiniteWindow`. See the section below |
| 2368 | Pan — `startPan`/`updatePan`/`endPan`, Alt/Space hints |
| 2420 | New canvas modal — incl. `modalInfinite` |
| **2522** | **Rendering** — `renderAll`, `renderBase`, `drawLayer`, all `drawX()` |
| **2878** | **Spline curve + polyline** — both vertex-driven layer types in one block: `splineSegments` (the maths, and the only place `polyline` differs), `drawSpline`, `setSplinePoints`, the vertex edits, and the `state.pendingSpline` placing mode. See the section below |
| 3366 | Layer list (sidebar) — `renderLayerList` |
| **3416** | **Toolbar wiring** — every button/handler (IDs unchanged by the panel move) |
| **3669** | **Floating panels** — `placePanel` (clamps every edge inside the viewport), `defaultPos`, drag, persistence |
| **3853** | **Selection panel contents** — `ROW_TYPES` (3867), `pickedVertex`/`syncSplineControls`, `syncSelectionPanel` |
| 3951 | Text box auto-fit |
| 3962 | Pointer/canvas coords — `canvasPoint()`, which returns **world** coords |
| **4004** | **Pointer interaction** — the one gesture layer: `pointers`/`gesture`, `beginPinch`/`updatePinch`, `releasePointer`, `maybeDoubleTap`, then `onDown`/`onMove`/`onUp` |
| 4519 | Text editing overlay — `openTextEditor`, `positionEditor` (+ the `repositionEditor` hook the viewport calls) |
| 4602 | Keyboard shortcuts |
| **4646** | **Save** — `EXPORT_MARGIN`/`inkBounds`/`exportRect` (what an export frames), `renderComposite`, **`saveOut()`** 4742 (one line onto `ScuLaFolder.save`) |
| 4751 | Save all sizes (zip) — `qualifyingSizes(rect)`, `makeZip`, `crc32` |
| 4907 | Fonts ready — `document.fonts.load()` startup pass |

Largest region by far is Rendering (2522–3366); go straight to the
specific `drawX()` you need.

### The infinite canvas (2287–2366, and everywhere it touches)

The New canvas modal's `∞ Infinite` size. The two `<canvas>` elements stop
being the drawing and become a **window** onto it: `state.originX/Y` say
where in the unbounded world that window's top-left corner sits,
`naturalW/H` how much world it spans, `renderScale` how many buffer pixels
each world pixel gets. Layer coordinates are world coordinates and are
never rewritten, so undo history, the clipboard and a drag in flight all
survive a window move untouched.

`ensureInfiniteWindow()` re-cuts the window whenever the view escapes it,
always covering the viewport plus `INF_PAD` **screen** px and always at
screen resolution — which is what keeps the buffers about viewport-sized
however far the drawing sprawls or the view zooms out. There is no size
cap because there is nothing that grows.

| Where | What it has to know |
|---|---|
| `worldTransform(ctx)` | the one place the window becomes a `ctx` transform; `renderBase`/`renderOverlay` each wrap their drawing in it, clearing first at identity |
| `canvasPoint(evt)` | scales by `naturalW / rect.width` (world px per CSS px, **not** buffer px) and adds the origin |
| `positionEditor` (both text overlays) | same conversion, the other way: `(l.x - originX) * scale` |
| `applyPan` | the pan clamp is skipped — an infinite sheet has no edge to hold on to. `zoomReset` → `fitDrawing()` is the way back instead |
| end of `ensureInfiniteWindow` | `panOrigin` and `gesture.anchor` hold values in the frame that just moved, and are re-expressed. Without it a long pan runs away from the finger |
| `exportRect()` | there is no sheet to export, so the export frames the ink — see below |

**An export frames the ink, not the sheet.** `inkBounds()` paints the
layers into a scratch canvas and scans the alpha channel for the real
edges (layer boxes are only a first guess — a stroke straddles its path, a
sketchy one wobbles off it, a spline overshoots its vertices); if ink
reaches the scratch canvas's edge it widens and goes again. `exportRect()`
adds `EXPORT_MARGIN` (10) px on each side, and that rectangle is the
exported image's size. A fixed canvas still exports itself, to the pixel.

### The `spline` and `polyline` layers (2878–3216)

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

## index.html — 7788 lines · Markdown editor

`lang="en"`. No section banners — this table is the only map.

| Lines | Contents |
|---|---|
| 8–1499 | App CSS. `:root` **9–47** (earth-palette tokens + `--danger`, the `--graph-*` node roles, and the three `--imp-*` importance levels). Workbooks panel **209–331**, modals **500–557** (`.field input, .field select, .field textarea` — `#idea-text` **522**), navigation panel **656**, **search & filter panel 784–974**, wikilinks/tags/assignee **1116–1160**, **importance markers 1163–1198**, **knowledge graph 1108–1498** |
| 1500–1501 | `apis.google.com` (Google Drive, in flight) + **mammoth.js CDN** (docx import) |
| 1506–2162 | **Shared nav + `ScuLaFolder`** |
| 2164–2509 | Markup: header (**`#btn-idea`** 2168, right of "New"), **toolbar 2180–2265** (the `#importance-select` is at **2207**), workspace 2267, panels (`#wb-panel`, `#img-panel`, **`#find-panel` 2331**, `#nav-panel` 2362), modals — `#image-modal` 2387, `#workbook-modal` 2420, **`#idea-modal` 2451**, `#link-modal` 2467, `#table-modal` 2490 |
| **2511–2636** | Markup: **`#graph-view`** overlay + `#wiki-modal` 2612 + `#wiki-suggest` 2632 |
| 2638–7786 | App script |

| Line | Function / region |
|---|---|
| 2645 | `I18N` (`ro:` 2646 / `en:` 2821; the `idea*` keys at **2807** / **2979**), `t()`, `store`, `applyUILang` **3019** |
| 3046–3048 | `editor`, `preview` refs, `savedRange` |
| 3051–3073 | Selection: `saveSelection`, `restoreSelection`, `insertAtCursor`, `wrapSelection` |
| 3075–3245 | Insert helpers: `insertHeading` 3075, `insertList` 3088, `insertOrderedList` 3106, `insertTodoList` 3139, `toggleTodoDone` 3210, `insertFontSize` 3236 |
| 3247–3318 | Image modal: `openImageModal`, `handleLocalImage` 3260, `insertImage` 3274 |
| **3320–3374** | **Pasting a picture** (Ctrl+V): `imageBlobToDataUrl` (3320, the shrink), `clipboardImage` (3343), `handleEditorPaste` (3351) — the picture goes in as a `data:` URI, so it lives in the markdown file itself |
| 3376–3378 | `workingFolderHandle`, `IMAGE_EXTS` — the image **explorer**'s own read-only picker, unrelated to `ScuLaFolder` |
| 3386–3473 | Responsive: `isSmallScreen`, `isMobile`, `setView`, **`PANELS`** (3397) + `togglePanelById` (3417), `toggleFind`/`findIsOpen` (3462) — one map drives all four side panels |
| 3570–3623 | Image tree: `createImageItem`, `showImageDetail` 3607, `insertSelectedImage` 3615 |
| **3652–4013** | **Wikilinks, tags, importance and block anchors** — see the sub-table below |
| 4073 | `resolveImageSrc` — image-path rewrite, export-only |
| **4079** | **`applyInline(text, opts)`** |
| **4100** | **`parseMarkdown(md, opts)`** — single parser, shared by preview and export |
| 4214–4249 | `updatePreview` (+ the graph and search refreshes), the `#preview` click delegation (checkbox · wikilink · `#tag` · importance pill) |
| **4251** | **`updateNav()`** — the navigation panel. Each heading remembers its **slug and its source line**; a click takes the preview to the slug (`gotoPreviewAnchor` 3972) and the textarea to the line (`gotoSourceHeading` 3993) |
| 4312 | `updateStatus` |
| **4333–5119** | **Workbooks** — see the sub-table below |
| **5121–5299** | **Quick idea capture** — see the sub-table below |
| 5302–5366 | `loadWorkbooks` 5302 (boot + resume last chapter, reloads `wbPendingIds`), `scula-folder`/visibility/unload hooks |
| **5369–6333** | **Knowledge graph** — see the sub-table below |
| **6336–6749** | **Search & filter** — see the sub-table below |
| **6751–6982** | **Writing a `[[link]]`**: `wikiCandidates` 6751, the modal 6778–6854, the `[[` suggester 6906–6982 (incl. **`editorMirrorAt`** 6856, shared with the search panel) |
| 6984–7005 | `newFile`, `openFile`, `handleFileOpen` (all detach from the open chapter) |
| 7006 | `importDocx` |
| 7049 | `htmlToMarkdown` (docx → md) |
| 7151–7158 | **`saveOut()`** (one line onto `ScuLaFolder.save`), `saveFile` 7153, `exportHtml` 7158 |
| ~7163–7207 | **Exported-HTML template** — standalone `<style>` (**7169–7201**)/`<body>` string, literal hex |
| 7219–7335 | Table modal: `rebuildTableGrid`, `insertTable` 7279, `insertCodeBlock` 7310 |
| 7326–7344 | Link modal: `openLinkModal`, `insertLink` 7337 |
| 7346–7418 | Event listeners + keyboard shortcuts (**Ctrl+Alt+0/1/2/3 importance — first, and it returns**, then **Ctrl+Alt+I the idea box** — also an early return, then Ctrl+1/2/**3**/**4**, Ctrl+Shift+**L**/**F**, Ctrl+S save chapter, **Ctrl+Alt+S** save all modified, Ctrl+Shift+1..6 headings). The `#idea-text` keydown handler (**7361**) `stopPropagation()`s every Ctrl/Alt chord so the editor's own shortcuts cannot fire behind the modal |
| **~7420–7700** | **Voice dictation** — a self-contained IIFE (`window.toggleDictation`, toolbar button `#btn-dictate` 2246, status pill `#dictate-pill` 2377, `dictate*` i18n keys). Reads the Caiet vocal settings from the shared **`caiet-vocal:settings`** blob via `store`; no settings UI of its own. Mirrors `voice.html` §§ 2, 9–11 (`PROVIDERS`, MediaRecorder + segment rotation + queue for the `api` engine, Web Speech for `live`). `emit()` writes at the caret — or, when the editor has no caret, appends a paragraph after the last line — then `scheduleAutosave()`s the chapter. It has no `docs/FEATURES.md` section of its own — `voice.html`'s map above is the description |
| 7708–7786 | `applyResponsiveDefaults`, init (`loadWorkbooks()` runs here) |

### Workbooks (4333–5119) — `docs/FEATURES.md` § E

A workbook holds chapters; one chapter is one markdown file. IndexedDB
(`scula-md`) is the source of truth on every device; the `markdown` folder
is a mirror, and each record carries the `folder`/`file` it owns — that
record **is** the UI↔folder correspondence.

| Line | Region |
|---|---|
| 4333–4351 | DB/store names (`scula-md` v2: `workbooks`/`chapters`/`meta`/`pending`), module state (`wbBooks`, `wbChapters`, `wbCurrentId`, `wbPendingIds`, `wbTodoOnly` + `WB_OPEN_TASK_RE` 4348/`wbChapterHasOpenTask`/`wbIsTodoBook` — the TODO-workbook chapter filter, …) |
| 4353–4404 | IndexedDB plumbing: `wbDb`, `wbTx`, `wbAll/wbPut/wbDrop`, `wbMetaGet/Set`, `wbPersist` 4386; `wbPendingMark` 4397/`wbPendingClear` (the `pending` store — chapters edited but not yet mirrored to disk) |
| 4408–4456 | `wbNewId` 4408, `wbSlug` 4417 + `wbUniqueFolder`/`wbUniqueFile` — how a title becomes a file name |
| 4458–4487 | **Folder mirror**: `wbFolderMode`, `wbMirrorWrite`, `wbMirrorRemove` (never recursive) |
| 4489–4734 | Panel rendering: `wbActBtn` 4489, `wbInlineRename` 4505/`wbInlineRenameById` 4550/`wbBindName` 4565 (double-click or F2 renames a name in place), `renderWorkbooks` 4604 (`.modified` dot on a chapter row / `.has-modified` on its book; on a "TODO"-titled book a `☑` act button toggles `wbTodoOnly` — chapters without an open `- [ ]` are hidden), `paintWorkbookWhere` 4713, `paintWorkbookCrumb` |
| 4736–4924 | Operations: create/rename/delete workbook (`createWorkbook` 4736), new/open/rename/delete/export chapter (`newChapter` 4791), `syncAllToFolder` 4909 |
| 4926–4963 | Autosave: `scheduleAutosave` 4926, `flushChapter` 4933 (marks the chapter pending), `detachChapter` 4948, `canLeaveEditor` |
| 4965–5119 | Saving: `saveToWorkbook` 4965 (Ctrl+S), `saveAllModifiedChapters` 4983 (Ctrl+Alt+S — every pending chapter, then clears its marker), the modal (`openWorkbookModal` 5003 → `confirmSaveToWorkbook`) |

**Two writes, two moments.** Typing autosaves to IndexedDB only (no
permission prompt is legal outside a gesture) and marks the chapter
*pending*; the disk mirror happens on explicit saves — `saveToWorkbook`,
`saveAllModifiedChapters`, `confirmSaveToWorkbook`, `ideaAppendTo`, rename,
delete, `syncAllToFolder` — all of which run inside a click, and each clears
the pending marker for the chapter(s) it wrote.

### Quick idea capture (5121–5299) — `docs/FEATURES.md` § J

The 💡 header button and **Ctrl+Alt+I**. One textarea; the first line may
name the chapter the idea belongs to, and the rest is appended to that
chapter and written out exactly as Ctrl+S would write it.

| Line | Region |
|---|---|
| 5135–5142 | `IDEA_BOOK` (`'Idei'`), `IDEA_NAME_MAX` (80 — longer than that is prose, not a chapter name) |
| **5143** | **`ideaSplit(raw)`** → `{name, body, text}`. Only the **first line**, and only its **first `:`** |
| **5163** | **`ideaFindChapter(name)`** — `resolveWiki()` first (so an idea addresses a chapter exactly the way a `[[link]]` does), then case- and diacritic-folded exact, then a unique prefix, then a unique fragment. `ideaFold` 5162 wraps the search panel's `fdFold` (6365) |
| 5187–5193 | `ideaToday()` — **local** date, never `toISOString()` (UTC would file a 1 a.m. idea under yesterday); `ideaFallbackBook()` |
| 5195–5225 | `ideaEnsureBook`/`ideaEnsureChapter` — create "Idei" and today's chapter on demand, `invalidateWikiIndex()` after each |
| **5227** | **`ideaAppendTo(ch, line)`** — the two writes Ctrl+S makes, for a chapter that is usually *not* the open one. When it **is** the open one, `editor.value` moves with it or the next autosave writes the idea back out |
| 5249–5279 | The modal: `openIdeaModal`/`closeIdeaModal`, **`ideaPaintHint`** 5262 (says where the idea will land, on every keystroke) |
| **5281** | **`saveIdea()`** — the "Chapter:" prefix is stripped **only** when it found a chapter; otherwise Idei keeps the text whole |

### Wikilinks, tags, importance and block anchors (3652–4013) — `docs/FEATURES.md` § C, § G

Obsidian's link syntax, and the only reason the graph has any edges. Both
the preview and the export go through it, and so does the graph scanner.

| Line | Function |
|---|---|
| 3662–3712 | **`WIKI_RE`** 3662, `TAG_RE` 3665, `BLOCK_RE` 3667, `IMG_RE` 3668, `ASSIGNEE_RE` 3681, and the importance set — `IMP_LEVELS` 3696/`IMP_ICON` 3697, **`IMP_RE`** 3698, `IMP_LEAD_RE` 3700, `IMP_LINE_LEAD` 3705. `WIKI_RE`/`TAG_RE`/`IMP_RE` are **global**; anything that `exec`s them in a loop must use a private copy (`scanNote` does) |
| 3714–3720 | `mdUnescape` / `attrEsc` — `applyInline` is handed already-escaped text, so a name is `A &amp; B` until it goes through these |
| 3723 | `mdPlain(raw)` — heading text with its inline markdown **and its importance marker** stripped |
| **3739** | **`headingSlug(raw, seen)`** — the one slug function. `parseMarkdown` writes it as a heading `id`, the nav panel and every `[[Note#Section]]` jump to that id. Three callers, one implementation: keep it that way |
| 3754 | `parseWikiTarget(raw)` → `{name, sub, heading, block}` |
| 3772–3803 | `WIKI_LOOSE` 3772, `wikiNotes()` 3775 — every note a link may point at (every chapter, plus the loose document), cached; `invalidateWikiIndex()` 3774 is called from `renderWorkbooks()` |
| **3805** | **`resolveWiki(name, fromChapterId)`** — path, then `Workbook/Title`, then title, then file name; the nearest match (same workbook) wins, as in Obsidian. Also the first pass of `ideaFindChapter` (5163) |
| 3841 | `renderWikiLink(...)` — the live `<a>` for the preview, a real anchor or plain text for the export |
| 3869 | `renderTag(lead, tag)` |
| 3878–3890 | `renderAssignee(name, gap)` — the `Name>> ` marker |
| **3892–3946** | **Importance markers** — `renderImportance` 3892 (the pill; `data-i` on the label in the preview, baked in for the export), `impSetLine` 3907 (put the marker after the bullet / `[ ]` / hashes / assignee, replace or remove), `setImportance` 3916 (what the select and Ctrl+Alt+0..3 call), `impFind` 3937 (a click on a pill searches for its own level) |
| 3948–3955 | `takeBlockId` / `liWithBlockId` — `…text ^anchor` becomes `id="block-anchor"` |
| **3972** | **`gotoPreviewAnchor(id)`** — the single jump-to-anchor path: nav panel, wikilinks and the graph all land here |
| **3993** | **`gotoSourceHeading(line)`** — the same jump for the **Markdown source**: selects the heading's line in the textarea and scrolls to it via `editorMirrorAt` (6856). Nav-panel clicks only; a phone has one pane on screen, so there it does nothing |
| 4010+ | `followWikiLink(name, heading, block)`, `offerToCreateNote(name)` 4028, `createChapterNamed(...)` 4050 |

**The tag pattern runs last in `applyInline`, on purpose.** By then every
`#` the pass produced sits after `>` or a quote, and the lead class
(`(^|[\s(\[{])`) excludes both — which is what keeps `href="#force"` and
`<code>#tag</code>` from being turned into tags. `scanNote` has no such
pass to hide behind, so it blanks the `[[links]]` itself before scanning
tags; without that, `[[#Inertia]]` mints a tag called `Inertia`.

### Knowledge graph (5369–6333) — `docs/FEATURES.md` § G

One `<canvas>`, one force simulation, no library. Obsidian's palette
(Filters · Groups · Display · Forces) drives `gvSettings`, which persists
under `scula:graph`.

| Line | Region |
|---|---|
| 5369–5382 | **`GRAPH_COLORS`** — the `--graph-*` tokens resolved **once**; canvas cannot use `var()`. Same rule as `editor.html`'s `CHROME`, see `docs/THEME.md` |
| 5384–5387 | `GV_BASE_R`, **`GV_STRUCTURAL`** — the settings that change *which* nodes exist (those rebuild; everything else only repaints) |
| 5390–5410 | `GV_DEFAULTS`, `gvSettings`, `gvLangReady` (a **`var`** — `applyUILang` reads it early) |
| 5412–5428 | `gv` — the whole live state: nodes, links, `pos` (survives a rebuild), transform, pointers |
| **5430** | **`scanNote(md)`** — one pass over a note: headings, `^blocks`, `#tags`, `[[links]]`, images, each tagged with the section it sat in |
| 5482–5500 | `scanNoteCached`, `noteText` 5490 (the open note reads from the **editor**, saved or not), `gvCurrentBookId` |
| **5502** | **`buildGraph()`** — dispatches on scope |
| **5532** | **`buildNoteScope`** — the note, its headings as an outline, its blocks, its tags, and `[[#Section]]` links as section-to-section edges |
| 5605 | `buildNotesScope` — chapters as nodes (`workbook` and `vault`) |
| 5643–5714 | `gvMatches` 5643, **`applyGraphFilters`** 5647 (search → kinds → local-graph depth → orphans, in that order), `gvNodeColor` 5696 (groups first) |
| 5716–5767 | **`gvKick`/`gvStep`** (5719) — the four forces and the alpha decay |
| 5771–5872 | `gvSX`/`gvSY` 5771, `gvRadius` 5773, **`gvDraw`** 5781 (hover dims the unconnected), `gvArrow` 5854 |
| **5874** | **`gvRebuild()`** — filter, recompute degrees, keep old positions, re-link |
| 5924–5962 | `gvFit` 5924, `gvZoomAt` 5938/`gvZoomBy`, `gvResize` 5948 (dpr-aware) |
| **5964–6083** | **`gvHit` + `gvBindStage`** (5988) — the one pointer route: drag a node, drag the background to pan, two fingers to pinch, wheel to zoom |
| 6085 | `gvOpenNode` — note opens, heading/block jumps, tag becomes the search, unresolved offers to be created |
| 6102–6177 | Settings: `gvSaveSettings` 6102/load, `gvPaintControls` 6119, `gvBindControls` 6136 (generic over `[data-gv]`), `setGraphScope` 6154 |
| 6179–6239 | `renderGvGroups`, `renderGvLegend` 6222 |
| 6241–6309 | `gvLoop` 6241, **`openGraph`** 6247/`closeGraph` 6279/`toggleGraph`, `openGraphForTag` 6291, `gvRefresh` 6298 (debounced; the graph follows the editor) |
| 6311 | `gvRepaintLang` — what `applyUILang` calls for the generated legend/groups/counts |

**Two lists must stay in step:** a new setting needs a control in the
`#graph-view` markup carrying `data-gv="<key>"` **and** an entry in
`GV_DEFAULTS`; add it to `GV_STRUCTURAL` too if changing it changes which
nodes exist. `gvBindControls`/`gvPaintControls` then need no edit at all.

### Search & filter (6336–6749) — `docs/FEATURES.md` § H

One query, the same three scopes the graph has (open chapter · this
workbook · every workbook), then two rows of chips that narrow what it
found. Reads `wikiNotes()`/`noteText()`/`scanNoteCached()` — the graph's —
so "a note" means one thing in both features. Nothing touches the disk.

| Line | Region |
|---|---|
| 6336–6363 | `FD_KEY` (`scula:find`) 6336, **`FD_KINDS`** 6337, `fdReady` 6342 (a **`var`** — `applyUILang` reads it early), **`fdState`** 6343 (query, scope, four toggles, the two chip sets) |
| 6365–6381 | **`fdFold`/`fdFoldMap`** (6366) — NFD minus the combining marks, with every folded character mapped back to its source index so a hit still marks the right characters. `fdFold` is also what the idea box folds names with (`ideaFold` 5162) |
| 6383–6420 | `fdMatcher` 6383 (escape or regex, a broken one flagged not thrown), **`fdLineHits`** 6394 — whole-word tests the characters either side, **never `\b`** (after `ă` it cannot match) |
| 6410 | `fdKindOf(line, inFence)` — the axis the "Only" chips filter on |
| **6422** | **`fdNoteHits(text, m)`** — one chapter, line by line; `section` carries the `headingSlug()` the preview gave that heading, counted the same way |
| 6448–6468 | `fdScopeNotes` (the three scopes), `fdNoteOrder` 6463 |
| **6472** | **`fdCompute()`** — scope ▸ query ▸ tags ▸ kinds. Each chip's count comes from one step earlier than the chip filters |
| 6506 | `fdSnippet` — escapes in the gaps between ranges, so a line of literal HTML is shown, never run |
| 6524–6605 | `fdPaintScope` 6524/`fdPaintOpts` 6528/`fdPaintKinds`/`fdPaintTags`, **`fdRender`** 6557 |
| 6607–6635 | `fdOffsetOfLine`, **`fdGoto`** 6616 — open the chapter, select the match, take the preview to the same section. Scrolls via `editorMirrorAt` (6856), shared with the `[[` suggester |
| 6637–6676 | `fdRun`/`fdRefresh` 6642/`fdQueryChanged`/`fdClearQuery`/`fdQueryKey`, `fdLive` 6671 (called from `updatePreview`), `fdRepaintLang` 6676 |
| 6678–6713 | `fdSaveSettings`/`fdLoadSettings` 6686 — scope and the four toggles persist under `scula:find` |
| 6715–6749 | Control wiring; the chips and result rows are generated, so both are delegated |

**Parser is unified (2026-08).** `parseMarkdown(md, {forExport})` and
`applyInline(text, {forExport})` serve both preview (`forExport` falsy) and
export (`forExport: true`) from one implementation — see `resolveImageSrc`
for the only behavioural fork (relative image paths get `public/images/`
prefixed, and a bare image-path line becomes a standalone `<img>`, only
when exporting). New markdown syntax now needs exactly one edit, in
`parseMarkdown`/`applyInline`, not two.

**One trap remains:** exported HTML must stay self-contained (its `<style>`
runs 7169–7201). It ships to people who don't have the app, so it uses
literal hex, not `var(--…)`. **Do not migrate that block to theme tokens.**

---

## recipes.html — 8449 lines · "Rețete" (PDF / photo → recipe markdown + USDA)

`lang="ro"`. The *why*, the format contract and the USDA plan live in
**`docs/RECIPES.md`** — read that before changing the markdown it writes.
Map only below.

| Lines | Contents |
|---|---|
| 11–404 | App CSS. `:root` **12–51** (earth palette, semantic names). Buttons 92–120, drop zone 121–134, day/meal cards 166–202 including **the per-ingredient USDA line `.ing + .nut` 187–201**, **the detail panels `.morebtn` / `.micro` / `.tot` 203–250**, **search / chips / collapsed days / `.grp` 262–322**, markdown preview 324–338, **`#htmlFrame` (the shareable page, previewed) 339–348**, tabs 350–355, folds + checkboxes + `.badge` 358–379, then the narrow and touch media blocks 381–403 |
| 407–1062 | **Shared nav + `ScuLaFolder`** |
| 1065–1244 | Markup: **five** numbered cards — left column: source ▸ text ▸ markdown ▸ `#htmlCard` (**Pagina HTML**, step 4); right column: review (step 5). The OCR fold is `#ocrBox` (1094–1129); `#optNutri` 1171, **the USDA fold `#nutriBox` 1180–1190**, `#onlyShownBox` 1174, the filter bar is `#filters` (1222, holds `#qBox` and the comma-separated `#ingBox`), `#found` 1232. `#btnMd` + `#mdFile` + `#bookFile` are in card 1. `<datalist id="usdaList">` is at **1246**, after the wrap and filled once at init |
| 1248–8449 | App script, numbered sections below |

| Line | Section |
|---|---|
| 1269 | **1. i18n** — `I18N` (`ro:` 1272 / `en:` 1477), `t()` (variadic), `applyUILang()`. The 38 nutrient names are the `nut_*` keys, the five headings `gMacro`/`gCarb`/`gFat`/`gMin`/`gVit`/`gOther` |
| 1703 | 2. Settings store (`scula:recipes`) |
| **1729** | **3. `Jpx`** — the JPEG 2000 decoder |
| **2779** | **4. `PdfText`** — the dependency-free PDF reader |
| **3739** | **5. `Recipes`** — the parser, and the reader that takes its markdown back |
| **4251** | **6. `Nutrition`** — the two USDA tables, the Romanian names, and what a recipe adds up to |
| 5732 | 7. The app — state, `setStatus`/**`say`**, **the detail panels**, **the day view**, review cards, markdown, **the shareable HTML page** |
| 7709 | 8. Getting the text in — `ingest`/**`analyse`** (which reader gets the text)/`handleFile(s)`, then OCR |
| 8079 | 9. Saving — `.md`, **`.json` (the ingredient book)** and **`.html`** via `ScuLaFolder`, chapters via `scula-md` |
| 8237 | 10. Wiring + init |

### `Jpx` (1751–2777)

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
| `MQ` (1772) | the arithmetic decoder, Annex C. `QE`/`NMPS`/`NLPS`/`SW` are Table C.2 verbatim |
| `RawBits` / `HeadBits` | the two other bit readers: bypass passes, and packet headers with their 0xFF stuffing |
| `TagTree` (1868) | inclusion and zero-bit-planes, decoded against a rising threshold **across packets** — hence the state on the object |
| `BitModel` (1937) | tier-1: `runSignificance`, `runRefinement`, `runCleanup`. `nbSig` keeps the neighbour counts packed in a byte and updated in `setSig`, which is what stops a naive tier-1 re-reading eight flags per coefficient per plane |
| `synth1D` (2106) | the inverse wavelet, 5/3 and 9/7, over an **absolute** index range — the parity of `i0` decides which samples are low-pass. Whole-sample symmetric extension, filled only in the margins |
| `buildTile` (2194) / `buildCodeblocks` (2266) | the geometry of Annex B: tiles ▸ components ▸ resolutions ▸ subbands ▸ precincts ▸ code-blocks. Precinct indices are computed on the **resolution** grid, not the subband's |
| `numPasses` (2308) / `segmentBreaks` (2320) | how many coding passes a packet declares, and where the encoder terminated (`termall`, `bypass`) |
| `readPacket` (2344) | one packet header: inclusion ▸ zero bit-planes ▸ passes ▸ `Lblock` ▸ segment lengths, then the bodies |
| **`packetSequence`** (2391) | the progression order. Rather than the spec's five nested-loop machines, every (component, resolution, precinct) is listed with the position it projects to and **sorted** — same order, far less to get wrong |
| `decodeCodeblocks` (2439) / `writeBack` (2480) | tier-1 over a tile, then coefficients into their subband. `missing` is how many low bit-planes never arrived — uniform per block, so the mid-point of what is left is the best guess for all of them |
| `reconstruct` (2497) | `2D_INTERLEAVE` + `HOR_SR` + `VER_SR`, coarsest resolution upwards |
| `parseSIZ`/`parseCOD`/`parseQCD` (2545, 2152, 2178) | the marker segments; `parseCOC`/`parseQCC` override them per component |
| `findCodestream` (2564) | the `.jp2` box tree, or a bare `.j2k`, or a codestream with junk in front |
| `decode` (2583) | markers ▸ tiles ▸ packets ▸ tier-1 ▸ wavelet ▸ MCT |
| `toRGBA` (2742) | subsampled components stretched back up; grey, RGB, RGBA and CMYK |

### `PdfText` (2794–3737)

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
| **`pageText`** (3208) | the entry point; hands off to `runContent` |
| **`runContent`** (3219) | the tiny interpreter, **re-entrant**: text operators plus `q`/`Q`/`cm`/`Do`, with the full text matrix — see the traps below |
| **`formsOf`** (3501) | every `/Form` XObject a resource dictionary offers, inflated and ready for `runContent` to walk into. Memoised, so one form drawn on 108 pages is inflated once; `building` guards a form that draws itself |
| `joinLines` (3456) | drawing order → reading order; a wide vertical gap becomes a paragraph break |
| `parseDoc` / `contentOf` (3660, 3676) | the shared front half: scan ▸ refuse encrypted ▸ expand object streams ▸ page list; then one page's content stream |

The picture half — everything a scanned page needs (`docs/RECIPES.md` § A):

| Function | What |
|---|---|
| `xobjectsOf` (3481) | a page's `/XObject` dict → name → object number |
| `drawnOrder` | the `/Im3 Do` operators, **in painting order**. The dictionary is unordered, and a scanner that cuts a page into strips relies on the order |
| `componentsOf` / `sampleAt` | colour space → components; one sample at 1/2/4/8/16 bits |
| **`imageOf`** (3573) | one `/Subtype /Image` → `{kind:"jpeg", bytes}` (the browser decodes it), or `{kind:"raw", rgba}` — including **`/JPXDecode`, through `Jpx`**. CCITT, JBIG2, LZW and indexed palettes → `null` |
| `collectImages` (3635) | walks a page's XObjects, three levels into `/Form`s, skipping anything logo-sized (`MIN_IMAGE_PX`) |
| **`images`** (3712) | page-ordered pictures; falls back to every image object in the file when the page tree yields none |

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

### `Recipes` (3755–4246)

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

#### `fromMarkdown` (4104–4246) — the contract, read back

`fromMarkdown(text)` → `{ days, source }`: the inverse of
`buildDayMarkdown()`, so a `.md` this page wrote comes back as the model it
was built from and every feature downstream works on it. `looksLikeMarkdown`
is what `analyse()` asks to decide which reader gets the text.

| Line | What |
|---|---|
| 4118 (`MD_SOURCE`, `MD_TOTALS`, `MD_RULE`, `MD_SEP_ROW`) | the four lines that are *not* content: the source note, the totals stub's heading, a `---`, and a table's `\| --- \|` row |
| `mdCells` (4130) | one walk over the characters. `\|` is the only escape `cell()` writes, so it is the only one read |
| `looksLikeMarkdown` (4147) | a heading **and** either a `### 1.`/`### 2.` section or a table row — a plan with a stray `#` in it still goes to `parse()` |
| `fromMarkdown` (4153) | `#` day ▸ `##` meal (`## Total pe zi` skipped) ▸ `###` matched on its **leading digit**, so both languages read ▸ table rows below the separator ▸ `1. …` steps |

The rules and the one thing that does not survive (an ingredient's group)
are in `docs/RECIPES.md` § C, "Reading it back".

### `Nutrition` (4262–5729)

The USDA tables and everything that turns an ingredient into numbers. It
sits between the parser and the app because both sides need it: the
markdown writer, the review cards and the shareable page all ask it the
same questions. The *why*, the fallbacks and the format of the ingredient
book are `docs/RECIPES.md` § E.

| Line | What |
|---|---|
| **`USDA_FOODS`** (4287) | 425 rows, `[id, description, kcal, protein, fat, carb, piece g, cup g, tbsp g]` per 100 g. 363 are FoodData Central's Foundation Foods, compiled out of `FoodData_Central_foundation_food_json_2026-04-30.json`; the 62 whose id starts **`L`** are the staples that set does not have — pâine, paste, miere, cașcaval. An `L` id can never be read as an fdcId |
| **`MICRO_DEFS`** (4751) / **`MICRO_GROUPS`** (4758) | the **other 38** nutrients, `[key, unit, decimals]` in display order, and the five headings that group them (`gCarb`, `gFat`, `gMin`, `gVit`, `gOther`). `key` is the i18n suffix: `nut_fe`, `nut_b12`, … |
| **`USDA_MICRO`** (4759) | 363 rows, `fdcId → the 38 values per 100 g`, **sparse** — a hole is the dataset not having measured that nutrient in that food, which is never read as nought. ~42 KB, only the FoodData rows; the 62 `L` staples have none. Fibre falls back `1079 ▸ 2033 (AOAC 2011.25)` and sugars `1063 ▸ the sugars added up`, or rolled oats would read as having no fibre |
| **`RO_ALIAS`** (5132) | 600 Romanian (and some English) phrases → a row above. Written **already folded**, which is the shape `nfold()` puts a name in |
| `nfold` (5301) | lowercase, no diacritics, punctuation to spaces; `%` and `.` survive because "lapte 1.5%" is a real ingredient. The cedilla forms are `\u`-escaped, same rule as everywhere else in this file |
| `micros`/`microGroups` (5338) · **`microsOf`** (5343) · **`microRow`** (5354) · **`microSum`** (5367) | the second table's whole API. `microsOf(id)` is per 100 g, `microRow(row)` is a `forIngredient()` result scaled to its grams, `microSum(rows)` is `{ vals, have, counted, total }` — **`have[i]` is how many rows carried nutrient i**, which is what lets a total say it covers six of nine ingredients instead of quietly summing four. Deliberately **not** part of `forIngredient()`: one screen of a hundred-day book asks that 1,282 times |
| `head` (5412) | what is left of a name once the notes come off: a `(…)` is a note, a `+`/`,`/`sau` is the parser having failed to split two ingredients, a leading `de ` is what "2 felii **de** pâine" leaves behind |
| `byWords` (5424) | the English fallback: the words of the name against the words of the descriptions, first word of a description worth two. **Below 0.34 it returns nothing** — a wrong food is worse than none, because a wrong one is silent |
| **`match`** (5447) | alias on the whole name ▸ the alias phrase that starts **earliest** (longest on a tie) ▸ `byWords`. Earliest because Romanian puts the food first: "morcov ras o conservă de fasole albă" is a row about the carrot |
| `UNIT_G` (5471) / `qtyValue` (5496) / **`grams`** (5514) | unit → grams, the quantity column's six shapes (`60`, `1,5`, `1/2`, `½`, `1 ½`, `2-3`), and the two multiplied. A unit that names a *thing* — felie, bucată, cană, conservă — takes the food's own portion weight first and sets `guess` when there is none |
| **the book** (5539–5678) | `learn` (5565) grows it from a plan, `remember` (5628) writes a hand-picked food into it, `rematch` (5646) resolves everything that is not hand-written again, `toJSON`/`fromJSON` (5592, 5607) are the file. An entry marked `hand` supplies its own numbers and is never written over |
| `forIngredient` (5681) / `forMeal` (5701) / `forDay` (5706) | one row, one meal, one day. `ok` needs both a food **and** a weight; `known` counts the rows that have both, which is what lets a total say it is incomplete |

`num(v, dp)` is the one rounding rule for the whole feature, so the
markdown, the shareable page and the review cards never disagree about
what 68.7497 is.

### The detail panels (5809–6026)

The 38 numbers behind a caret, in the app. Both the review cards and the
shareable page grew the same affordance; this is the app's half, and
`docMicroJs()` (below) is the other.

| Line | What |
|---|---|
| **`microPanel`** (5822) | one panel: the five macros the row already shows, then the 38 headed by group. A group with nothing in it is left out; a nutrient missing from a group that has others is an **em-dash, never a nought**. `have`/`counted` are only passed for a total, and only a genuinely partial number is marked — mark everything and the mark means nothing |
| `macroList` (5887) | the five, in the shape `microPanel` wants them |
| **`moreBtn`** (5898) | the caret on any host. It remembers what was open in a `Set` of **model objects** (`view.micro` for ingredients, `view.tot` for meals and days) so a re-render does not shut it, and it **builds its panel the first time it is asked** — 1,282 ingredient rows apiece would be a hundred thousand nodes nobody has looked at |
| `nutRow` (5921) | the USDA line under an ingredient, now ending in a caret |
| **`totalsBlock`** (5974) | the `.tot` line — a meal's, then a day's — with the same four numbers, `known/total` when they differ, and the same caret onto `microSum()` |

### The day view (6029–6522)

A book of 100 menus is 300 meals — 14,274 DOM nodes and a page 140,727
pixels tall if every one is rendered. The list is a **view** over
`model.days`; nothing here mutates it except the explicit edits.

| Line | What |
|---|---|
| 6029–6035 | `FOLD` / `fold()` — search folding. The cedilla forms are `\u`-escaped on purpose: they must not appear literally (tests/recipes.js checks) but real text is full of them |
| 6039 | **`view`** — `{ q, ing, kinds, open, allOpen, micro, tot }`. Every one of those five sets holds **model objects**, not indices: an index drifts the moment a day above it is deleted. `micro` is the ingredients whose detail panel is open, `tot` the meals and days whose totals panel is |
| 6108 | `dayMatches(day, di)` → the indices of that day's meals that survive the search, the comma-separated ingredient filter (`ingredientTerms`/`mealIngredientHay`) and the chips. A day whose *title* matches keeps all of them — but the ingredient filter is still applied per meal. `termScore`/`markTerms`/`mealHits` (just above) are what a collapsed day uses to show *which* ingredient/step matched, filler words (`FILLER`) discounted |
| 6135 / 6148 | `shownDays()` — what is on screen; `outputDays()` — what the markdown is built from (the same, when "only the recipes shown" is ticked) |
| 6154 / 6182 | `renderFilters` (chips, only for kinds the book has), `paintFound` |
| 6205 | `markInto` — puts the search terms in `<mark>` without letting the text become HTML; matching on the folded string, marks on the original |
| 6229 | `daySummary` — a day nobody is editing, in one row |
| 6269 | `daySelect` — move a meal to another day; options filled on first use |
| **6307** | **`arrangeIntoDays(perDay)`** — a day ends where a meal kind repeats, or, for a flat list with no kinds, `perDay` to a day named in eating order |
| **6337** | **`renderDays`** — collapsed rows, or the full editor for the days that are open. Eight or fewer just open. It is also what appends the per-meal and per-day `totalsBlock` |
| 6716 | `filtersChanged` — re-renders the markdown only when the output actually depends on the filter |

**Two things must stay in step:** `MEAL_KINDS` (6042) is the one list of
meal kinds — the `<select>` in a meal header, the filter chips and
`arrangeIntoDays` all read it. `mealLabel` (5779) is the one place a kind
becomes a word.

### The markdown (`buildDayMarkdown`, 6550)

The output shape is a contract (`docs/RECIPES.md` § C): `#` day, `##` meal,
`### 1. Ingrediente` as a four-column table whose last column is the USDA
food, `### 2. Metoda de preparare` as an ordered list, **`### 3. Valori
nutriționale`** as the per-ingredient table and its total, then the day
totals — which are now numbers rather than a stub. Its third argument is
the list of meal indices to write, which is how "only the recipes shown"
narrows a day. Change the shape here and in that doc together.

`macro(v, dp, known)` (6531) and `fdcCell(v)` (6541) are what fills the new
cells. `macro`'s third argument is the whole point of it: olive oil really
does have no protein and that cell must say `0`, while an ingredient nobody
matched has no protein *number* and that cell must stay empty. `fdcCell`
puts the id first and alone — everything after the `·` is worked out again
from it and the quantity beside it, which is why the file still round-trips
byte-identically.

### The shareable HTML page (6747–7708)

One self-contained `.html` file — one stylesheet of its own, one script of
its own, nothing to fetch — built from the model rather than from the
markdown. The *why* is `docs/RECIPES.md` § G.

| Line | What |
|---|---|
| **`DOC_JS`** (6934) | the totals half of the one script the file carries, and the reason the preview iframe is `sandbox="allow-scripts"` now. Plain ES5: this document may be opened years from now. Everything it needs is on the elements — grams per unit and the four values per 100 g, as `data-` attributes — so there is no table embedded a second time and still nothing to fetch. It is an **array of lines, not a joined string**: `docNutriJs()` (7202) splices the panel half into the same closure, so both share `qty()`/`num()` and `all()` still runs last |
| **`docMicroTexts`** (7044) / **`docMicroJs`** (7074) | the panel half. The 38 nutrient names, units and group headings cross in already localised, and `nHave` as a `%a`/`%b` template. What ships in the markup is the **data** — one `data-m` per quantity field, the same sparse "index:value per 100 g" (`microAttr`, 7458), ~130 bytes a row — and the panel is built when somebody asks. A written-out panel per ingredient would be 1.5 KB, which on a hundred-day book is two megabytes nobody opens |
| **`filterHtml`** (7252) / **`docFilterJs`** (7286) | the other half: the search bar under the header — the same two boxes and chips as card 5 — and the ES5 that drives it. It reads the markup it is filtering (`h3`, `ul.ing`, `ol.steps`, `data-kind`), deliberately **not** the nutrition table, or "oil" would answer with every row whose USDA food is named one. The bar ships `hidden` and the script un-hides it, so a page opened with scripting off has no dead box |
| `jsonForScript` (7216) / `docFilterTexts` (7227) | what crosses into that script: every value escaped past ASCII (the cedilla forms must not appear literally — `tests/recipes.js` checks the preview too), and the counted phrases as templates, so the plural rules of both languages stay in `I18N` |
| `qtyHtml` (7466) / **`nutriHtml`** (7492) | the quantity as a field, and the table under the method that follows it. An ingredient with no food gets the field but no `data-k`, which is what keeps it out of the total. `nutriHtml` also writes the per-row caret and the empty `tr.mrow` its panel goes into, plus one `details.mtot` for the meal — all `hidden`, un-hidden by the script |
| `DOC_CSS` (6747) | the whole document's stylesheet as an array of lines: earth palette on screen, `@media print` turning it back into ink, `@page` margins. Kept as strings, like every other builder in this file |
| `escHtml` (7206) | the only defence the page has. An ingredient name is user text and goes through it |
| `htmlTitle` (7440) | the field, or the source file's name with its extension and dashes taken off, or the page's own name. Also what `saveHtml()` names the file after |
| `mealHtml` (7544) / `dayHtml` (7583) | a meal is its kind chip, its dish, an ingredient list and an ordered method; ingredient **groups** become subheadings, which is the thing the markdown table cannot carry |
| **`buildHtmlDoc`** (7632) | the whole file as one string — the same string the preview iframe shows and the export saves. Order inside `<body>`: header ▸ **filter bar** ▸ contents ▸ days ▸ footer ▸ the one `<script>`, which holds whichever halves this page needs (no bar under two recipes, no totals with the USDA pass off — and no `<script>` at all when neither) |
| `paintHtml` (7695) | shows or hides card 5, and rebuilds the preview: only while the fold is open, and 250 ms after the typing stops. The fold decides itself once — open at eight days or fewer |

`dayHtml` also writes a `table.nutri.dtot` per day — the roll-up the
markdown has always had a place for and never had anything to put in — and
a `details.mtot.dtotm` beside it for the day's 38, which `calcDay` fills by
adding the meals together rather than walking every field twice.
`mealHtml` puts the meal's kind on the section as `data-kind`, which is
what the chips in the exported page match against.

`saveHtml` (8111) and `openHtml` (8119) are the two ways out, both in
section 9: `ScuLaFolder.save()` for the file, a `blob:` URL for a tab (which
is also how it reaches a printer).

### The ingredient book, on screen and on disk

| Line | What |
|---|---|
| `nutRow` (5921) | the line under every ingredient in the review cards: the food it matched (an `<input list="usdaList">`, not a `<select>` — 425 options under each of a hundred days' ingredients would be tens of thousands of nodes), and what the quantity comes to |
| `fillUsdaList` (6675) / `paintNutri` (6686) | the one datalist, filled once at init; the "417 of 443 have a food" line in `#nutriBox` |
| `learnFrom` (6699) | called from `analyse()` on **every** route in — a PDF, a photo, a paste, an imported `.md` — because the point of the book is that a name is resolved once |
| `BOOK_KEY` (8134) | `scula:nutrition` in the settings store is where it lives between visits; `saveBookFile`/`readBookFile` (8145, 8151) are how it moves to another device. A `.json` picked or dropped goes there rather than to the parser |

---

## Fast recipes

```bash
# where is X?
grep -n "X" *.html

# every hardcoded colour outside :root
grep -n "#[0-9a-fA-F]\{3,8\}\b" editor.html | sed -n '20,$p'

# every user-visible string in markup
grep -n "placeholder=\"\|title=\"\|aria-label=\"" index.html

# confirm nav still in sync + JS still parses — one command
/verify
```

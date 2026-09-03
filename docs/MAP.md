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

## The shared block (byte-identical in all five files)

From the `<nav id="site-nav">` line through `<!-- ===== end toolbar nav ===== -->`
(~1120 lines). Rough starts: `voice.html:226` · `editor.html:430` ·
`index.html:1548` · `recipes.html:408` · `calendar.html:248` — these drift;
grep the `<nav id="site-nav"` line.

Three features share it, because all of them must exist before any app
script runs:

| Part | What |
|---|---|
| `#site-nav` links + `#navLangBtn` | page links, UI-language toggle → `docs/I18N.md` |
| `#navFolderBtn` + `window.ScuLaFolder` | where saved files go → `docs/FEATURES.md` § D |
| `#scula-sheet` | the destination chooser (phones/tablets) |
| `#scula-toast` | the shared bottom toast, `ScuLaFolder.toast(msg, action, fn)` |
| **`window.ScuLaCal`** | the shared calendar store → `docs/FEATURES.md` § L |

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

`ScuLaCal` is a **second IIFE** after the `ScuLaFolder` one, in the same
`<script>`. In order inside it: `COLORS` (Google's own event palette) ·
date helpers · **`when`/`daysOf`** (the only readers of the exclusive
`end.date` — § L) · `newId` (base32hex, Google's id rule) · IndexedDB
`scula-cal`, falling back to `localStorage` then memory · the change
fan-out (`BroadcastChannel`) · **`make`** (the only place that knows
Google's field names) · **`syncSource`** (how a page keeps its scraped
events in step) · the **`@date` marker** (`markRe`/`readMark`/`findMarks`)
· `toICS`/`fromICS`/`toGoogleJSON` · `window.ScuLaCal`.

Any edit here goes into **all five** files — run `/verify` to confirm they
stayed identical.

---

## The Help modal (in every file — content differs per page)

Each app has its own **Help** button (top bar / header, near the other
page-level actions) that opens a modal listing *that page's* features and
keyboard shortcuts. Unlike the nav block above, this one does **not** need
to stay byte-identical — only the pattern is shared, the content is not:

| Part | Where |
|---|---|
| Button | top bar/header, styled like its sibling buttons (icon+label in `editor.html`, plain `.btn` elsewhere) |
| Content | `I18N.ro.helpBody` / `I18N.en.helpBody` — one HTML template-literal per language: `<h3>` sections, `<p>`, `<ul><li>`, `<code>` for syntax, `<kbd>` for shortcuts |
| Open/close | `openHelpModal()` / `closeHelpModal()` (`openHelp()`/`closeHelp()` in `calendar.html`); open calls `paintHelp()`, which sets the body's `innerHTML` from `t('helpBody')` |
| Language switch | each file's `"scula-ui-lang"` listener calls `paintHelp()` again if the modal is currently open — the one exception this feature needs to the "modals don't repaint" rule in `docs/I18N.md`, because unlike every other modal here it can plausibly stay open a while |
| Styling | a `.help-body` class (`h3`/`p`/`ul`/`li`/`b`/`code`/`kbd`), reusing each file's own existing modal chrome (`.image-modal`/`.modal-box` in `index.html`, `#newCanvasOverlay`-style overlay in `editor.html`, `.scrim`/`.sheet` in `voice.html`, `.modal`/`.card` in `calendar.html` and, copied from there, `recipes.html`) |

**When a feature changes, update its own file's `helpBody` in the same
change** — it is hand-written prose, not generated from anything else, so
nothing keeps it in sync automatically.

---

## voice.html — 2303 lines · "Caiet vocal" (voice dictation)

`lang="ro"`. **The only app with a working i18n system** — copy its pattern.

| Lines | Contents |
|---|---|
| 11–221 | App CSS. `:root` palette at **12–37** (earth-palette tokens, migrated). `.rec-opt` (keep-the-audio row) **137–138** |
| 226–1352 | **Shared nav + `ScuLaFolder`** (identical in all 4 files) |
| 1356–1491 | Markup: header, controls, `#keepAudio` **1384–1388**, textarea, settings sheet |
| 1493–2216 | App script, numbered sections below |

Script sections (comment banners `/* === N. Title === */`):

| Line | Section |
|---|---|
| 1500 | **1. i18n** — `I18N` object (`ro:` 1501 / `en:` 1545), `t()` at 1591, `UI` at 1590 |
| 1594 | 2. Providers |
| 1621 | 3. Settings store — `KEY` 1621, `store` 1622 w/ memory fallback, `save()` 1754, `load()` 1755 |
| 1652 | 4. DOM refs |
| 1683 | 5. Language / engine chips |
| 1702 | **6. UI language** — `applyUILang()` **1702** |
| 1720 | 7. Settings sheet |
| 1793 | 8. Secure-context check |
| 1798 | 9. Recording (MediaRecorder) + segment rotation — **keep-the-audio recorder 1816–1868** |
| 2000 | 10. Transcription queue |
| 2094 | 11. Browser dictation (Web Speech API) |
| 2155 | 12. File import |
| 2169 | 13. Copy / share / **save → `ScuLaFolder.save()`** / clear |
| 2214 | 14. Init |

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

## editor.html — 5930 lines · "Image Marker" (canvas annotation)

`lang="ro"`. Deep internals in **`HANDOFF.md`** — read that for the layer
model, rendering pipeline, and canvas traps. Map only below.

Theme: ✅ migrated to the earth palette (dark), step 3 of `docs/THEME.md`.
`:root` uses the shared semantic token names (`--surface`, `--text`, …) —
see that doc for the canvas-colour resolution (`CHROME` cache, ~L949).

**Chrome layout (2503-08):** the top bar holds document-level actions only.
Drawing tools and per-element properties live in two **floating, draggable
panels** (`#toolsPanel`, `#selectionPanel`) — see HANDOFF.md § "Mobile /
touch" for why and how.

| Lines | Contents |
|---|---|
| 5–11 | Viewport meta — **page zoom is locked off** (`maximum-scale=1, user-scalable=no`); pinch belongs to the canvas, not the chrome |
| 15–427 | App CSS. `:root` **30–46**. `@font-face` ×9 near top (all 9 files present in `fonts/`) |
| 57–68 | `html,body` — incl. `touch-action: pan-x pan-y`, the other half of the page-zoom lock |
| 73–129 | Top toolbar — incl. `#driveBtn.connected` (the Drive button once a Google account is attached) |
| 130–154 | `#canvasWrap` / `#stage` — **the viewport**: `overflow:hidden` + `touch-action:none` (every gesture is JS), `#stage` is `flex:0 0 auto` + `margin:auto` and carries the pan as a transform. `#stage.infinite` drops the drop shadow — that sheet has no edge worth casting one |
| 265–354 | **Floating panels** — `.panel`/`.panelHead`/`.panelBody`, `#toolsPanel`, `#selectionPanel`. `.panel` caps `max-width`/`max-height` to the viewport |
| 355–427 | Responsive: 900px (icon-only bar), 720px (sidebar under canvas), 520px (no tool captions), touch |
| 431–1558 | **Shared nav + `ScuLaFolder`** |
| 1564–1598 | Markup: `#toolbar` (file / **`#driveBtn`** / **undo+redo** / zoom / capture / panel toggles) |
| 1599–1637 | Markup: `#toolsPanel` — Basic · Shapes · Arrows |
| 1638–1762 | Markup: `#selectionPanel` — one `.selRow` per property |
| 1763–1846 | Markup: `#newCanvasOverlay` — the size presets, incl. `.sizePreset[data-infinite="1"]` |
| 1847–1882 | Markup: the other modals, stage, sidebar |
| 1884–5773 | App script |

Script sections (banners `/* ===== Title ===== */`):

| Line | Section |
|---|---|
| 1891 | i18n — `I18N` (`ro:`/`en:`), `t()`, `applyUILang()` |
| 2135 | State — `state` object (incl. `zoom`/`panX`/`panY`, and `infinite`/`originX`/`originY`/`renderScale`), style defaults, `PALETTE` |
| 2198 | Utilities — incl. `setBtnLabel`/`setBtnIcon` (icon+label button spans) |
| 2270 | History — `pushHistory`/`commit`/`applyHistory`/`undo`/`redo`, `committed` (the pre-change state an undo returns to), and `syncHistoryButtons` (the `#undoBtn`/`#redoBtn` disabled state) |
| 2330 | Loading an image — `beginEditing(opts)`, `syncCanvasBuffers`, `setupStage` |
| 2347 | Screen snapshot |
| 2400 | Screen recording — `liveRenderLoop`, `startRecording` |
| 2533 | Recording preview / playback — `recordingBlob` kept for the folder save |
| **2674** | **Viewport: zoom + pan** — `applyZoomDisplay`/`applyPan` (the clamp), `clientToContent`/`panContentTo` (the anchor maths), `clientToWorld`/`panWorldTo`, `setZoom`/`setZoomAt`, `zoomReset`/`fitDrawing`, buttons, wheel, **`gesture*` page-zoom blockers** |
| **2850** | **Infinite canvas** — `INF_PAD`, `worldTransform`, `ensureInfiniteWindow`. See the section below |
| 2916 | Pan — `startPan`/`updatePan`/`endPan`, Alt/Space hints |
| 2965 | New canvas modal — incl. `modalInfinite` |
| **3062** | **Rendering** — `renderAll`, `renderBase`, `drawLayer`, all `drawX()` |
| **3474** | **Spline curve + polyline** — both vertex-driven layer types in one block: `splineSegments` (the maths, and the only place `polyline` differs), `drawSpline`, `setSplinePoints`, the vertex edits, and the `state.pendingSpline` placing mode. See the section below |
| 3961 | Layer list (sidebar) — `renderLayerList` |
| **3956** | **Toolbar wiring** — every button/handler (IDs unchanged by the panel move) |
| **4344** | **Floating panels** — `placePanel` (clamps every edge inside the viewport), `defaultPos`, drag, persistence |
| **4527** | **Selection panel contents** — `ROW_TYPES` (4527), `pickedVertex`/`syncSplineControls`, `syncSelectionPanel` |
| 4572 | Text box auto-fit |
| 4621 | Pointer/canvas coords — `canvasPoint()`, which returns **world** coords |
| **4680** | **Pointer interaction** — the one gesture layer: `pointers`/`gesture`, `beginPinch`/`updatePinch`, `releasePointer`, `maybeDoubleTap`, then `onDown`/`onMove`/`onUp` |
| 5187 | Text editing overlay — `openTextEditor`, `positionEditor` (+ the `repositionEditor` hook the viewport calls) |
| 5223 | Keyboard shortcuts |
| **5312** | **Save** — `EXPORT_MARGIN`/`inkBounds`/`exportRect` (what an export frames), `renderComposite`, **`saveOut()`** 5401 (one line onto `ScuLaFolder.save`) |
| 5413 | Save all sizes (zip) — `qualifyingSizes(rect)`, `makeZip`, `crc32` |
| 5529 | Fonts ready — `document.fonts.load()` startup pass |
| **5602** | **Google Drive** — `DRIVE` config, `loadScriptOnce`, `driveAuth` (Google Identity Services, in a popup), `driveFetch` (one 402 retry), `drivePickFolder` (only if `DRIVE.API_KEY` is filled in), `driveEnsureFolder` (otherwise a "Mazgaleste" folder it creates), `driveUpload`, `paintDrive`. Both Google scripts are fetched on the first click, never at page load. Tested by `tests/drive.js` against a stubbed Drive API |

Largest region by far is Rendering (3062–3906); go straight to the
specific `drawX()` you need.

### The infinite canvas (2827–2906, and everywhere it touches)

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

### The `spline` and `polyline` layers (3517–3872)

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
| `drawSpline` / `traceSpline` / `pointInSpline` | render, path-trace, and inside-test (the last borrows `baseCtx` as a geometry engine). `drawSpline` honours `l.roughness` ("Stil schiță"): non-zero flattens the exact curve and inks it twice with a wobble — a polyline keeps its corners, a spline is re-smoothed — while `l.points` and the fill stay exact |
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

**Two lists must stay in step:** `ROW_TYPES` (4527) says which property
rows show for which layer type, and the handlers in Toolbar wiring (3995)
say which types each control actually writes to. Add a control → add it to
both. `rowRough` ("Stil schiță") is on every drawn shape including `spline`
and `polyline` — its `.rough-btn` handler writes `l.roughness`, which
`drawSpline` now honours. `rowSplineEdit` is the one row that also needs a real layer, not just
a matching tool, so `syncSplineControls()` hides it again afterwards — that
function also hides the Corner button and swaps the hint's `data-i` key for
a `polyline`, whose vertices are all corners already.

---

## index.html — 8961 lines · Markdown editor

`lang="en"`. No section banners — this table is the only map.

| Lines | Contents |
|---|---|
| 8–1544 | App CSS. `:root` **9–47** (earth-palette tokens + `--danger`, the `--graph-*` node roles, and the three `--imp-*` importance levels). Workbooks panel **209–331**, modals **500–557** (`.field input, .field select, .field textarea` — `#idea-text` **522**), navigation panel **656**, **search & filter panel 784–985** (incl. `.find-caret`, `.find-hit` blocks and `.find-line`), wikilinks/tags/assignee **1145–1189**, **importance markers 1192–1243**, **knowledge graph 1137–1543** |
| 1559 | **mammoth.js CDN** (docx import) — the only CDN tag left in the nav area; the `apis.google.com` one that used to sit beside it is gone (Google Drive loads its scripts on demand now, from `editor.html` only — see that file's § Google Drive) |
| 1551–2209 | **Shared nav + `ScuLaFolder`** |
| 2211–3029 | Markup: header (**`#btn-idea`** 2215, right of "New"), **toolbar 2696–2779** (**`#btn-undo`/`#btn-redo` 2701–2702**, first in the group; the `#importance-select` is at **2728**), workspace 2784, panels (`#wb-panel`, `#img-panel`, **`#find-panel` 2848**, `#nav-panel` 2882), modals — `#image-modal` 2907, `#workbook-modal` 2940, **`#idea-modal` 2971**, `#link-modal` 2987, `#table-modal` 3010 |
| **3031–3156** | Markup: **`#graph-view`** overlay + `#wiki-modal` 3132 + `#wiki-suggest` 3152 |
| 3158–8766 | App script |

| Line | Function / region |
|---|---|
| 3183 | `I18N` (`ro:` 3166 / `en:` 3344; the `idea*` keys at **3330** / **3510**), `t()`, `store`, `applyUILang` **3579** |
| 3608–3610 | `editor`, `preview` refs, `savedRange` |
| 3613–3627 | Selection: `saveSelection`, `restoreSelection` |
| **3642–3729** | **Undo / redo** — the editor's own history, because the textarea's is unusable here (toolbar actions edit through `setRangeText`, which Chrome does not record, and opening a chapter replaces `.value`). `undoMark(coalesce)` **3642** records the state *before* an edit; two hooks feed it and catch every edit there is — the `beforeinput` listener **3675** (typing, paste, cut, and the browser's own history events, routed here) and the `editor.setRangeText` override **3686**, which is what makes every toolbar action, line move, Tab, `[[` completion and dictated word one undo step without any of them knowing. `undoReset()` **3654** on a whole-document swap (chapter open, New, import, an idea appended to the open chapter — that one is already on disk). `paintUndo()` **3682** disables the buttons. Shortcuts at **8347** |
| 3707–3723 | `insertAtCursor`, `wrapSelection` |
| 3725–3928 | Insert helpers: `insertHeading` 3725, `insertList` 3738, `insertOrderedList` 3756, `insertTodoList` 3789, `insertLineBelow` 3807 / `insertLineAbove` 3816 (Ctrl+Enter / Ctrl+Shift+Enter — blank line after/before the caret line), `moveLineDown` 3825 / `moveLineUp` 3842 (Alt+↓/↑), `selectLineOrParagraph` ~3863, `toggleTodoDone` 3893, `insertFontSize` 3919 |
| 3930–4001 | Image modal: `openImageModal`, `handleLocalImage` 3943, `insertImage` 3957 |
| **4026–4080** | **Pasting a picture** (Ctrl+V): `imageBlobToDataUrl` (3987, the shrink), `clipboardImage` (4026), `handleEditorPaste` (4018) — the picture goes in as a `data:` URI, so it lives in the markdown file itself |
| 4059–4061 | `workingFolderHandle`, `IMAGE_EXTS` — the image **explorer**'s own read-only picker, unrelated to `ScuLaFolder` |
| 4069–4166 | Responsive: `isSmallScreen`, `isMobile`, `setView`, **`PANELS`** (4080) + `togglePanelById` (4100), `toggleFind`/`findIsOpen` (4155) — one map drives all four side panels |
| 4253–4306 | Image tree: `createImageItem`, `showImageDetail` 4290, `insertSelectedImage` 4298 |
| **4319–4812** | **Wikilinks, tags, importance and block anchors** — see the sub-table below |
| 4901 | `resolveImageSrc` — image-path rewrite, export-only |
| **4907** | **`applyInline(text, opts)`** |
| 4939 | `renderCodeBlock(codeLines, codeLang, forExport)` — plain `<pre><code>` for preview; wrapped with a "Copiază" button for export |
| **4945** | **`parseMarkdown(md, opts)`** — single parser, shared by preview and export |
| 5059–5094 | `updatePreview` (+ the graph and search refreshes), the `#preview` click delegation (checkbox · wikilink · `#tag` · importance pill) |
| **5097** | **`updateNav()`** — the navigation panel. Each heading remembers its **slug and its source line**; a click takes the preview to the slug (`gotoPreviewAnchor` 4800) and the textarea to the line (`gotoSourceHeading` 4821) |
| 5158 | `updateStatus` |
| **5146–5971** | **Workbooks** — see the sub-table below |
| **5973–6115** | **Quick idea capture** — see the sub-table below |
| 6118–6182 | `loadWorkbooks` 6118 (boot + resume last chapter, reloads `wbPendingIds`), `scula-folder`/visibility/unload hooks |
| **6185–7156** | **Knowledge graph** — see the sub-table below |
| **7152–7673** | **Search & filter** — see the sub-table below |
| **7738–7927** | **Writing a `[[link]]`**: `wikiCandidates` 7738, the modal 7673–7791, the `[[` suggester 7801–7877 (incl. **`editorMirrorAt`** 7843, shared with the search panel) |
| 7879–7900 | `newFile`, `openFile`, `handleFileOpen` (all detach from the open chapter) |
| 7901 | `importDocx` |
| 8039 | `htmlToMarkdown` (docx → md) |
| 8141–8148 | **`saveOut()`** (one line onto `ScuLaFolder.save`), `saveFile` 8143, `exportHtml` 8148 |
| ~8103–8213 | **Exported-HTML template** — standalone `<style>` (**8109–8147**)/`<body>` string, literal hex; ends with an inline (string-split `<scr`+`ipt>`) copy-button handler for `.code-copy` |
| 8150–8303 | Table modal: `rebuildTableGrid`, `insertTable` 8299, `insertCodeBlock` 8330 |
| 8346–8364 | Link modal: `openLinkModal`, `insertLink` 8357 |
| 8314–8386 | Event listeners + keyboard shortcuts (**Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo/redo 8347** — before everything else, and it returns; skipped while another field has focus, so a modal input keeps the browser's own undo. Then **Ctrl+Alt+0/1/2/3 importance — and it returns**, then **Ctrl+Alt+I the idea box** — also an early return, then Ctrl+1/2/**3**/**4**, Ctrl+Shift+**L**/**F**, Ctrl+S save chapter, **Ctrl+Alt+S** save all modified, Ctrl+Shift+1..6 headings, **Ctrl+L `selectLineOrParagraph`** — select the caret's line, press again to widen to the paragraph, **Ctrl+Enter `insertLineBelow`** / **Ctrl+Shift+Enter `insertLineAbove`** — a blank line after/before the caret's line with the caret moved onto it (both defined ~3807–3823), Alt+↑/↓ `moveLineUp`/`moveLineDown`). The `#idea-text` keydown handler (**8333**) `stopPropagation()`s every Ctrl/Alt chord so the editor's own shortcuts cannot fire behind the modal |
| **~8408–8686** | **Voice dictation** — a self-contained IIFE (`window.toggleDictation`, toolbar button `#btn-dictate` 2763, status pill `#dictate-pill` 2897, `dictate*` i18n keys). Reads the Caiet vocal settings from the shared **`caiet-vocal:settings`** blob via `store`; no settings UI of its own. Mirrors `voice.html` §§ 2, 9–11 (`PROVIDERS`, MediaRecorder + segment rotation + queue for the `api` engine, Web Speech for `live`). `emit()` writes at the caret — or, when the editor has no caret, appends a paragraph after the last line — then `scheduleAutosave()`s the chapter. It has no `docs/FEATURES.md` section of its own — `voice.html`'s map above is the description |
| 8740–8816 | `applyResponsiveDefaults`, init (`loadWorkbooks()` runs here) |

### Workbooks (5146–5971) — `docs/FEATURES.md` § E

A workbook holds chapters; one chapter is one markdown file. IndexedDB
(`scula-md`) is the source of truth on every device; the `markdown` folder
is a mirror, and each record carries the `folder`/`file` it owns — that
record **is** the UI↔folder correspondence.

| Line | Region |
|---|---|
| 5183–5201 | DB/store names (`scula-md` v2: `workbooks`/`chapters`/`meta`/`pending`), module state (`wbBooks`, `wbChapters`, `wbCurrentId`, `wbPendingIds`, `wbTodoOnly`/`wbTodoOnlyAll` + `WB_OPEN_TASK_RE`/`wbChapterHasOpenTask`/`wbIsTodoBook`/`toggleTodoFilterAll` — the TODO chapter filter, per-book and the toolbar-wide `▣ Tasks only` switch, …) |
| 5210–5261 | IndexedDB plumbing: `wbDb`, `wbTx`, `wbAll/wbPut/wbDrop`, `wbMetaGet/Set`, `wbPersist` 5199; `wbPendingMark` 5210/`wbPendingClear` (the `pending` store — chapters edited but not yet mirrored to disk) |
| 5265–5313 | `wbNewId` 5265, `wbSlug` 5274 + `wbUniqueFolder`/`wbUniqueFile` — how a title becomes a file name |
| 5315–5344 | **Folder mirror**: `wbFolderMode`, `wbMirrorWrite`, `wbMirrorRemove` (never recursive) |
| 5346–5591 | Panel rendering: `wbActBtn` 5346, `wbInlineRename` 5362/`wbInlineRenameById` 5407/`wbBindName` 5422 (double-click or F2 renames a name in place), `renderWorkbooks` 5461 (`.modified` dot on a chapter row / `.has-modified` on its book; on a "TODO"-titled book a `☑` act button toggles `wbTodoOnly` — chapters without an open `- [ ]` are hidden; the toolbar `▣ Tasks only` button sets `wbTodoOnlyAll` and filters every book the same way, dropping books left empty), `paintWorkbookWhere`, `paintWorkbookCrumb` |
| 5549–5738 | Operations: create/rename/delete workbook (`createWorkbook` 5549), new/open/rename/delete/export chapter (`newChapter` 5604), `syncAllToFolder` 5723 |
| 5785–5822 | Autosave: `scheduleAutosave` 5785, `flushChapter` 5747 (marks the chapter pending), `detachChapter` 5807, `canLeaveEditor` |
| 5779–5971 | Saving: `saveToWorkbook` 5779 (Ctrl+S), `saveAllModifiedChapters` 5797 (Ctrl+Alt+S — every pending chapter, then clears its marker), the modal (`openWorkbookModal` 5862 → `confirmSaveToWorkbook`) |

**Two writes, two moments.** Typing autosaves to IndexedDB only (no
permission prompt is legal outside a gesture) and marks the chapter
*pending*; the disk mirror happens on explicit saves — `saveToWorkbook`,
`saveAllModifiedChapters`, `confirmSaveToWorkbook`, `ideaAppendTo`, rename,
delete, `syncAllToFolder` — all of which run inside a click, and each clears
the pending marker for the chapter(s) it wrote.

### Quick idea capture (5973–6115) — `docs/FEATURES.md` § J

The 💡 header button and **Ctrl+Alt+I**. One textarea; the first line may
name the chapter the idea belongs to, and the rest is appended to that
chapter and written out exactly as Ctrl+S would write it.

| Line | Region |
|---|---|
| 5994–6001 | `IDEA_BOOK` (`'Idei'`), `IDEA_NAME_MAX` (80 — longer than that is prose, not a chapter name) |
| **6002** | **`ideaSplit(raw)`** → `{name, body, text}`. Only the **first line**, and only its **first `:`** |
| **6022** | **`ideaFindChapter(name)`** — `resolveWiki()` first (so an idea addresses a chapter exactly the way a `[[link]]` does), then case- and diacritic-folded exact, then a unique prefix, then a unique fragment. `ideaFold` 6021 wraps the search panel's `fdFold` (7238) |
| 6046–6052 | `ideaToday()` — **local** date, never `toISOString()` (UTC would file a 1 a.m. idea under yesterday); `ideaFallbackBook()` |
| 6009–6041 | `ideaEnsureBook`/`ideaEnsureChapter` — create "Idei" and today's chapter on demand, `invalidateWikiIndex()` after each |
| **6043** | **`ideaAppendTo(ch, line)`** — the two writes Ctrl+S makes, for a chapter that is usually *not* the open one. When it **is** the open one, `editor.value` moves with it or the next autosave writes the idea back out |
| 6110–6140 | The modal: `openIdeaModal`/`closeIdeaModal`, **`ideaPaintHint`** 6123 (says where the idea will land, on every keystroke) |
| **6097** | **`saveIdea()`** — the "Chapter:" prefix is stripped **only** when it found a chapter; otherwise Idei keeps the text whole |

### Wikilinks, tags, importance and block anchors (4319–4812) — `docs/FEATURES.md` § C, § G

Obsidian's link syntax, and the only reason the graph has any edges. Both
the preview and the export go through it, and so does the graph scanner.

| Line | Function |
|---|---|
| 4345–4402 | **`WIKI_RE`** 4345, `TAG_RE` 4348, **`HEX_COLOR_RE`** 4353 (a `#rrggbb`/`#rrggbbaa` colour, tried before `TAG_RE`), `BLOCK_RE` 4361, `IMG_RE` 4362, `ASSIGNEE_RE` 4375, and the importance set — `IMP_RE`, `IMP_LEAD_RE`, `IMP_LINE_LEAD` just below. `WIKI_RE`/`TAG_RE`/`IMP_RE`/`HEX_COLOR_RE` are **global**; anything that `exec`s them in a loop must use a private copy (`scanNote` does) |
| 4408–4414 | `mdUnescape` / `attrEsc` — `applyInline` is handed already-escaped text, so a name is `A &amp; B` until it goes through these |
| 4417 | `mdPlain(raw)` — heading text with its inline markdown **and its importance marker** stripped |
| **4433** | **`headingSlug(raw, seen)`** — the one slug function. `parseMarkdown` writes it as a heading `id`, the nav panel and every `[[Note#Section]]` jump to that id. Three callers, one implementation: keep it that way |
| 4448 | `parseWikiTarget(raw)` → `{name, sub, heading, block}` |
| 4466–4497 | `WIKI_LOOSE` 4466, `wikiNotes()` 4469 — every note a link may point at (every chapter, plus the loose document), cached; `invalidateWikiIndex()` 4468 is called from `renderWorkbooks()` |
| **4499** | **`resolveWiki(name, fromChapterId)`** — path, then `Workbook/Title`, then title, then file name; the nearest match (same workbook) wins, as in Obsidian. Also the first pass of `ideaFindChapter` (6022) |
| 4535 | `renderWikiLink(...)` — the live `<a>` for the preview, a real anchor or plain text for the export |
| 4563 | `renderTag(lead, tag)`, then `renderColorSwatch(lead, hex)` 4570 — the `#rrggbb` chip, same string for preview and export |
| **4578–4700** | **The `@date` marker** — `docs/FEATURES.md` § L. `calDateWords` 4584 / `calMarkLabel` 4591 (the human label), **`renderDateMark` 4600** (the `.md-date` pill; it is handed the replace callback's own `arguments`, whose group order is exactly what `ScuLaCal.readMark` indexes into), then the push: `calTitleOf` 4626 (the line minus the marker, the bullet, the assignee, the importance marker and the inline markdown), `calTagsOf` 4637, `calScan` 4642, **`calSyncAll` 4677** (the 📅 button / Ctrl+Alt+D — returns its promise, since the writes are a chain of IndexedDB transactions), `calRepaintLang` 4689 (the label is a formatted date, so it cannot carry a `data-i` key). The pattern itself is **not here**: `DATE_MARK_RE` **4359** is `ScuLaCal.markRe()`, so every page reads one syntax |
| 4551–4563 | `renderAssignee(name, gap)` — the `Name>> ` marker |
| **4720–4775** | **Importance markers** — `renderImportance` 4720 (the pill; `data-i` on the label in the preview, baked in for the export), `impSetLine` 4735 (put the marker after the bullet / `[ ]` / hashes / assignee, replace or remove), `setImportance` 4744 (what the select and Ctrl+Alt+0..3 call), `impFind` 4765 (a click on a pill searches for its own level) |
| 4776–4783 | `takeBlockId` / `liWithBlockId` — `…text ^anchor` becomes `id="block-anchor"` |
| **4800** | **`gotoPreviewAnchor(id)`** — the single jump-to-anchor path: nav panel, wikilinks and the graph all land here |
| **4821** | **`gotoSourceHeading(line)`** — the same jump for the **Markdown source**: selects the heading's line in the textarea and scrolls to it via `editorMirrorAt` (7843). Nav-panel clicks only; a phone has one pane on screen, so there it does nothing |
| 4809+ | `followWikiLink(name, heading, block)`, `offerToCreateNote(name)` 4827, `createChapterNamed(...)` 4849 |

**The tag pattern runs last in `applyInline`, on purpose.** By then every
`#` the pass produced sits after `>` or a quote, and the lead class
(`(^|[\s(\[{])`) excludes both — which is what keeps `href="#force"` and
`<code>#tag</code>` from being turned into tags. `scanNote` has no such
pass to hide behind, so it blanks the `[[links]]` itself before scanning
tags; without that, `[[#Inertia]]` mints a tag called `Inertia`.

### Knowledge graph (6185–7156) — `docs/FEATURES.md` § G

One `<canvas>`, one force simulation, no library. Obsidian's palette
(Filters · Groups · Display · Forces) drives `gvSettings`, which persists
under `scula:graph`.

| Line | Region |
|---|---|
| 6230–6243 | **`GRAPH_COLORS`** — the `--graph-*` tokens resolved **once**; canvas cannot use `var()`. Same rule as `editor.html`'s `CHROME`, see `docs/THEME.md` |
| 6245–6248 | `GV_BASE_R`, **`GV_STRUCTURAL`** — the settings that change *which* nodes exist (those rebuild; everything else only repaints) |
| 6251–6271 | `GV_DEFAULTS`, `gvSettings`, `gvLangReady` (a **`var`** — `applyUILang` reads it early) |
| 6273–6289 | `gv` — the whole live state: nodes, links, `pos` (survives a rebuild), transform, pointers |
| **6291** | **`scanNote(md)`** — one pass over a note: headings, `^blocks`, `#tags`, `[[links]]`, images, each tagged with the section it sat in |
| 6348–6366 | `scanNoteCached`, `noteText` 6356 (the open note reads from the **editor**, saved or not), `gvCurrentBookId` |
| **6368** | **`buildGraph()`** — dispatches on scope |
| **6398** | **`buildNoteScope`** — the note, its headings as an outline, its blocks, its tags, and `[[#Section]]` links as section-to-section edges |
| 6471 | `buildNotesScope` — chapters as nodes (`workbook` and `vault`) |
| 6509–6580 | `gvMatches` 6509, **`applyGraphFilters`** 6513 (search → kinds → local-graph depth → orphans, in that order), `gvNodeColor` 6562 (groups first) |
| 6582–6634 | **`gvKick`/`gvStep`** (6585) — the four forces and the alpha decay |
| 6637–6737 | `gvSX`/`gvSY` 6638, `gvRadius` 6639, **`gvDraw`** 6647 (hover dims the unconnected), `gvArrow` 6720 |
| **6740** | **`gvRebuild()`** — filter, recompute degrees, keep old positions, re-link |
| 6790–6828 | `gvFit` 6790, `gvZoomAt` 6804/`gvZoomBy`, `gvResize` 6814 (dpr-aware) |
| **6830–6949** | **`gvHit` + `gvBindStage`** (6854) — the one pointer route: drag a node, drag the background to pan, two fingers to pinch, wheel to zoom |
| 6901 | `gvOpenNode` — note opens, heading/block jumps, tag becomes the search, unresolved offers to be created |
| 6968–7043 | Settings: `gvSaveSettings` 6968/load, `gvPaintControls` 6985, `gvBindControls` 7002 (generic over `[data-gv]`), `setGraphScope` 7020 |
| 7045–7105 | `renderGvGroups`, `renderGvLegend` 7088 |
| 7107–7175 | `gvLoop` 7107, **`openGraph`** 7113/`closeGraph` 7145/`toggleGraph`, `openGraphForTag` 7157, `gvRefresh` 7164 (debounced; the graph follows the editor) |
| 7177 | `gvRepaintLang` — what `applyUILang` calls for the generated legend/groups/counts |

**Two lists must stay in step:** a new setting needs a control in the
`#graph-view` markup carrying `data-gv="<key>"` **and** an entry in
`GV_DEFAULTS`; add it to `GV_STRUCTURAL` too if changing it changes which
nodes exist. `gvBindControls`/`gvPaintControls` then need no edit at all.

### Search & filter (7152–7673) — `docs/FEATURES.md` § H

One query, the same three scopes the graph has (open chapter · this
workbook · every workbook), then two rows of chips that narrow what it
found. A result is a **block of lines** — the match inside the text around
it, Obsidian's shape — not a single line. Reads
`wikiNotes()`/`noteText()`/`scanNoteCached()` — the graph's — so "a note"
means one thing in both features. Nothing touches the disk.

| Line | Region |
|---|---|
| 7202–7229 | `FD_KEY` (`scula:find`) 7152, **`FD_KINDS`** 7203, `FD_CTX`/`FD_CTX_MORE` 7208 (context lines, and with the ≡ toggle on), `fdReady` 7210 (a **`var`** — `applyUILang` reads it early), **`fdState`** 7211 (query, scope, six toggles, the two chip sets), **`fdShut`** 7225 (the chapters folded *against* `fdState.collapse` — the button is one decision, a chevron a second) |
| 7238–7260 | **`fdFold`/`fdFoldMap`** (7239) — NFD minus the combining marks, with every folded character mapped back to its source index so a hit still marks the right characters. `fdFold` is also what the idea box folds names with (`ideaFold` 6021) |
| 7256–7281 | `fdMatcher` 7256 (escape or regex, a broken one flagged not thrown), **`fdLineHits`** 7267 — whole-word tests the characters either side, **never `\b`** (after `ă` it cannot match) |
| 7283 | `fdKindOf(line, inFence)` — the axis the "Only" chips filter on |
| **7295** | **`fdNoteHits(lines, m)`** — one chapter, line by line (it is handed the **split** lines, which the group then keeps); `section` carries the `headingSlug()` the preview gave that heading, counted the same way |
| 7320–7338 | `fdScopeNotes` (the three scopes), `fdNoteOrder` 7335 |
| **7344** | **`fdCompute()`** — scope ▸ query ▸ tags ▸ kinds. Each chip's count comes from one step earlier than the chip filters. Each group carries `lines`, so the context is cut at render time and only for chapters that matched |
| **7389–7400** | **`fdCtxSpan`** 7389 (up to *n* lines that carry something either side, never wandering more than 3n away), **`fdBlocks`** 7400 — hits whose spans overlap become one block, so the same lines are never printed twice |
| 7415 | `fdSnippet(line, ranges, cut, hit)` — one line, marked; escapes in the gaps between ranges so a line of literal HTML is shown, never run. `cut` is the block's shared indent, `hit` the index its `<mark>`s carry |
| **7439** | **`fdBlockHtml`** — the block: `find-where`, then a `.find-line` per line (`.ctx` for the ones that are only context, blanks skipped) |
| 7470 | `fdNoteShut(id)` — folded or not: `fdState.collapse` is the default, `fdShut` the exceptions |
| 7472–7511 | `fdPaintScope` 7472/**`fdPaintOpts`** 7476 (also the two `[data-fd-view]` buttons, incl. the ⊟/⊞ swap)/`fdChip`/`fdPaintKinds`/`fdPaintTags` |
| **7513** | **`fdRender`** — a `.find-note` per chapter (chevron, title, count), then its blocks unless it is folded |
| 7561–7589 | `fdOffsetOfLine`, **`fdGoto`** 7520 — open the chapter, select the match, take the preview to the same section. Scrolls via `editorMirrorAt` (7843), shared with the `[[` suggester |
| 7591–7630 | `fdRun`/`fdRefresh` 7596/`fdQueryChanged`/`fdClearQuery`/`fdQueryKey`, `fdLive` 7625 (called from `updatePreview`), `fdRepaintLang` 7630 |
| 7632–7663 | `fdSaveSettings`/`fdLoadSettings` 7591 — scope and the six toggles persist under `scula:find` |
| 7686–7683 | Control wiring; the chips, blocks and chevrons are generated, so all are delegated. **`fdHitOf`** 7686 — a block goes to its first match, a `<mark>` inside it to its own. The keydown listener 7662 is what a `<div>` block needs and a `<button>` gave for free |

**Parser is unified (2044-08).** `parseMarkdown(md, {forExport})` and
`applyInline(text, {forExport})` serve both preview (`forExport` falsy) and
export (`forExport: true`) from one implementation — see `resolveImageSrc`
for the behavioural forks (relative image paths get `public/images/`
prefixed, and a bare image-path line becomes a standalone `<img>`, only
when exporting; a fenced code block is wrapped with a "Copiază" button only
when exporting — `renderCodeBlock`). New markdown syntax now needs exactly
one edit, in `parseMarkdown`/`applyInline`, not two.

**One trap remains:** exported HTML must stay self-contained (its `<style>`
runs 8109–8147). It ships to people who don't have the app, so it uses
literal hex, not `var(--…)`. **Do not migrate that block to theme tokens.**

---

## recipes.html — 9044 lines · "Rețete" (PDF / photo → recipe markdown + USDA)

`lang="ro"`. The *why*, the format contract and the USDA plan live in
**`docs/RECIPES.md`** — read that before changing the markdown it writes.
Map only below.

| Lines | Contents |
|---|---|
| 11–404 | App CSS. `:root` **12–51** (earth palette, semantic names). Buttons 92–120, drop zone 121–134, day/meal cards 166–202 including **the per-ingredient USDA line `.ing + .nut` 187–201**, **the detail panels `.morebtn` / `.micro` / `.tot` 203–250**, **search / chips / collapsed days / `.grp` 262–322**, markdown preview 324–338, **`#htmlFrame` (the shareable page, previewed) 339–348**, tabs 350–355, folds + checkboxes + `.badge` 358–379, then the narrow and touch media blocks 381–403 |
| 407–1533 | **Shared nav + `ScuLaFolder`** |
| 1536–1715 | Markup: **five** numbered cards — left column: source ▸ text ▸ markdown ▸ `#htmlCard` (**Pagina HTML**, step 4); right column: review (step 5). The OCR fold is `#ocrBox` (1565–1600); `#optNutri` 1642, **the USDA fold `#nutriBox` 1651–1661**, `#onlyShownBox` 1645, the filter bar is `#filters` (1693, holds `#qBox` and the comma-separated `#ingBox`), `#found` 1703. `#btnMd` + `#mdFile` + `#bookFile` are in card 1. `<datalist id="usdaList">` is at **1717**, after the wrap and filled once at init |
| 1719–8920 | App script, numbered sections below |

| Line | Section |
|---|---|
| 1744 | **1. i18n** — `I18N` (`ro:` 1743 / `en:` 1948), `t()` (variadic), `applyUILang()`. The 38 nutrient names are the `nut_*` keys, the five headings `gMacro`/`gCarb`/`gFat`/`gMin`/`gVit`/`gOther` |
| 2174 | 2. Settings store (`scula:recipes`) |
| **2226** | **3. `Jpx`** — the JPEG 2471 decoder |
| **3269** | **4. `PdfText`** — the dependency-free PDF reader |
| **4230** | **5. `Recipes`** — the parser, and the reader that takes its markdown back |
| **4737** | **6. `Nutrition`** — the two USDA tables, the Romanian names, and what a recipe adds up to |
| 6237 | 7. The app — state, `setStatus`/**`say`**, **the detail panels**, **the day view**, review cards, markdown, **the shareable HTML page** |
| 8186 | 8. Getting the text in — `ingest`/**`analyse`** (which reader gets the text)/`handleFile(s)`, then OCR |
| 8550 | 9. Saving — `.md`, **`.json` (the ingredient book)** and **`.html`** via `ScuLaFolder`, chapters via `scula-md` |
| 8708 | 10. Wiring + init |

### `Jpx` (2226–3248)

`decode(bytes, opts)` → `{ width, height, comps, siz, luma }` and
`toRGBA(res)` → 8-bit RGBA. The only two entry points. It exists because no
browser but Safari decodes JPEG 2471, and a great many scanned books are
stored as `/JPXDecode` — without it those pages are invisible to
`createImageBitmap` and the file reads as empty.

`decode(bytes, { luma:true })` reads **only component 0** when the file has
a component transform. Y is the luma both RCT and ICT are built around, so
OCR gets the grey page it wants for a third of the work; `imageOf` always
asks for that. Packet headers are still parsed for every component — the
lengths are what advance the stream — only tier-1 is skipped.

| Function | What |
|---|---|
| `MQ` (2247) | the arithmetic decoder, Annex C. `QE`/`NMPS`/`NLPS`/`SW` are Table C.2 verbatim |
| `RawBits` / `HeadBits` | the two other bit readers: bypass passes, and packet headers with their 0xFF stuffing |
| `TagTree` (2343) | inclusion and zero-bit-planes, decoded against a rising threshold **across packets** — hence the state on the object |
| `BitModel` (2412) | tier-1: `runSignificance`, `runRefinement`, `runCleanup`. `nbSig` keeps the neighbour counts packed in a byte and updated in `setSig`, which is what stops a naive tier-1 re-reading eight flags per coefficient per plane |
| `synth1D` (2581) | the inverse wavelet, 5/3 and 9/7, over an **absolute** index range — the parity of `i0` decides which samples are low-pass. Whole-sample symmetric extension, filled only in the margins |
| `buildTile` (2669) / `buildCodeblocks` (2741) | the geometry of Annex B: tiles ▸ components ▸ resolutions ▸ subbands ▸ precincts ▸ code-blocks. Precinct indices are computed on the **resolution** grid, not the subband's |
| `numPasses` (2783) / `segmentBreaks` (2795) | how many coding passes a packet declares, and where the encoder terminated (`termall`, `bypass`) |
| `readPacket` (2819) | one packet header: inclusion ▸ zero bit-planes ▸ passes ▸ `Lblock` ▸ segment lengths, then the bodies |
| **`packetSequence`** (2866) | the progression order. Rather than the spec's five nested-loop machines, every (component, resolution, precinct) is listed with the position it projects to and **sorted** — same order, far less to get wrong |
| `decodeCodeblocks` (2914) / `writeBack` (2955) | tier-1 over a tile, then coefficients into their subband. `missing` is how many low bit-planes never arrived — uniform per block, so the mid-point of what is left is the best guess for all of them |
| `reconstruct` (2972) | `2D_INTERLEAVE` + `HOR_SR` + `VER_SR`, coarsest resolution upwards |
| `parseSIZ`/`parseCOD`/`parseQCD` (3020, 2627, 2653) | the marker segments; `parseCOC`/`parseQCC` override them per component |
| `findCodestream` (3039) | the `.jp2` box tree, or a bare `.j2k`, or a codestream with junk in front |
| `decode` (3058) | markers ▸ tiles ▸ packets ▸ tier-1 ▸ wavelet ▸ MCT |
| `toRGBA` (3217) | subsampled components stretched back up; grey, RGB, RGBA and CMYK |

### `PdfText` (3269–4208)

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
| **`pageText`** (3683) | the entry point; hands off to `runContent` |
| **`runContent`** (3694) | the tiny interpreter, **re-entrant**: text operators plus `q`/`Q`/`cm`/`Do`, with the full text matrix — see the traps below |
| **`formsOf`** (3972) | every `/Form` XObject a resource dictionary offers, inflated and ready for `runContent` to walk into. Memoised, so one form drawn on 108 pages is inflated once; `building` guards a form that draws itself |
| `joinLines` (3931) | drawing order → reading order; a wide vertical gap becomes a paragraph break |
| `parseDoc` / `contentOf` (4131, 4147) | the shared front half: scan ▸ refuse encrypted ▸ expand object streams ▸ page list; then one page's content stream |

The picture half — everything a scanned page needs (`docs/RECIPES.md` § A):

| Function | What |
|---|---|
| `xobjectsOf` (3956) | a page's `/XObject` dict → name → object number |
| `drawnOrder` | the `/Im3 Do` operators, **in painting order**. The dictionary is unordered, and a scanner that cuts a page into strips relies on the order |
| `componentsOf` / `sampleAt` | colour space → components; one sample at 1/2/4/8/16 bits |
| **`imageOf`** (4044) | one `/Subtype /Image` → `{kind:"jpeg", bytes}` (the browser decodes it), or `{kind:"raw", rgba}` — including **`/JPXDecode`, through `Jpx`**. CCITT, JBIG2, LZW and indexed palettes → `null` |
| `collectImages` (4106) | walks a page's XObjects, three levels into `/Form`s, skipping anything logo-sized (`MIN_IMAGE_PX`) |
| **`images`** (4183) | page-ordered pictures; falls back to every image object in the file when the page tree yields none |

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

### `Recipes` (4230–4717)

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

#### `fromMarkdown` (4628–4717) — the contract, read back

`fromMarkdown(text)` → `{ days, source }`: the inverse of
`buildDayMarkdown()`, so a `.md` this page wrote comes back as the model it
was built from and every feature downstream works on it. `looksLikeMarkdown`
is what `analyse()` asks to decide which reader gets the text.

| Line | What |
|---|---|
| 4589 (`MD_SOURCE`, `MD_TOTALS`, `MD_RULE`, `MD_SEP_ROW`) | the four lines that are *not* content: the source note, the totals stub's heading, a `---`, and a table's `\| --- \|` row |
| `mdCells` (4605) | one walk over the characters. `\|` is the only escape `cell()` writes, so it is the only one read |
| `looksLikeMarkdown` (4622) | a heading **and** either a `### 1.`/`### 2.` section or a table row — a plan with a stray `#` in it still goes to `parse()` |
| `fromMarkdown` (4628) | `#` day ▸ `##` meal (`## Total pe zi` skipped) ▸ `###` matched on its **leading digit**, so both languages read ▸ table rows below the separator ▸ `1. …` steps |

The rules and the one thing that does not survive (an ingredient's group)
are in `docs/RECIPES.md` § C, "Reading it back".

### `Nutrition` (4737–6200)

The USDA tables and everything that turns an ingredient into numbers. It
sits between the parser and the app because both sides need it: the
markdown writer, the review cards and the shareable page all ask it the
same questions. The *why*, the fallbacks and the format of the ingredient
book are `docs/RECIPES.md` § E.

| Line | What |
|---|---|
| **`USDA_FOODS`** (4762) | 426 rows, `[id, description, kcal, protein, fat, carb, piece g, cup g, tbsp g]` per 100 g. 363 are FoodData Central's Foundation Foods, compiled out of `FoodData_Central_foundation_food_json_2026-04-30.json`; the 62 whose id starts **`L`** are the staples that set does not have — pâine, paste, miere, cașcaval. An `L` id can never be read as an fdcId |
| **`MICRO_DEFS`** (5226) / **`MICRO_GROUPS`** (5233) | the **other 38** nutrients, `[key, unit, decimals]` in display order, and the five headings that group them (`gCarb`, `gFat`, `gMin`, `gVit`, `gOther`). `key` is the i18n suffix: `nut_fe`, `nut_b12`, … |
| **`USDA_MICRO`** (5234) | 363 rows, `fdcId → the 38 values per 100 g`, **sparse** — a hole is the dataset not having measured that nutrient in that food, which is never read as nought. ~42 KB, only the FoodData rows; the 62 `L` staples have none. Fibre falls back `1550 ▸ 2504 (AOAC 2482.25)` and sugars `1534 ▸ the sugars added up`, or rolled oats would read as having no fibre |
| **`RO_ALIAS`** (5607) | 601 Romanian (and some English) phrases → a row above. Written **already folded**, which is the shape `nfold()` puts a name in |
| `nfold` (5776) | lowercase, no diacritics, punctuation to spaces; `%` and `.` survive because "lapte 1.5%" is a real ingredient. The cedilla forms are `\u`-escaped, same rule as everywhere else in this file |
| `micros`/`microGroups` (5814) · **`microsOf`** (5818) · **`microRow`** (5829) · **`microSum`** (5842) | the second table's whole API. `microsOf(id)` is per 100 g, `microRow(row)` is a `forIngredient()` result scaled to its grams, `microSum(rows)` is `{ vals, have, counted, total }` — **`have[i]` is how many rows carried nutrient i**, which is what lets a total say it covers six of nine ingredients instead of quietly summing four. Deliberately **not** part of `forIngredient()`: one screen of a hundred-day book asks that 1,282 times |
| `head` (5883) | what is left of a name once the notes come off: a `(…)` is a note, a `+`/`,`/`sau` is the parser having failed to split two ingredients, a leading `de ` is what "2 felii **de** pâine" leaves behind |
| `byWords` (5899) | the English fallback: the words of the name against the words of the descriptions, first word of a description worth two. **Below 0.34 it returns nothing** — a wrong food is worse than none, because a wrong one is silent |
| **`match`** (5922) | alias on the whole name ▸ the alias phrase that starts **earliest** (longest on a tie) ▸ `byWords`. Earliest because Romanian puts the food first: "morcov ras o conservă de fasole albă" is a row about the carrot |
| `UNIT_G` (5946) / `qtyValue` (5971) / **`grams`** (5989) | unit → grams, the quantity column's six shapes (`60`, `1,5`, `1/2`, `½`, `1 ½`, `2-3`), and the two multiplied. A unit that names a *thing* — felie, bucată, cană, conservă — takes the food's own portion weight first and sets `guess` when there is none |
| **the book** (6010–6149) | `learn` (6040) grows it from a plan, `remember` (6103) writes a hand-picked food into it, `rematch` (6121) resolves everything that is not hand-written again, `toJSON`/`fromJSON` (6082, 6078) are the file. An entry marked `hand` supplies its own numbers and is never written over |
| `forIngredient` (6156) / `forMeal` (6176) / `forDay` (6181) | one row, one meal, one day. `ok` needs both a food **and** a weight; `known` counts the rows that have both, which is what lets a total say it is incomplete |

`num(v, dp)` is the one rounding rule for the whole feature, so the
markdown, the shareable page and the review cards never disagree about
what 68.7968 is.

### The detail panels (6280–6497)

The 38 numbers behind a caret, in the app. Both the review cards and the
shareable page grew the same affordance; this is the app's half, and
`docMicroJs()` (below) is the other.

| Line | What |
|---|---|
| **`microPanel`** (6297) | one panel: the five macros the row already shows, then the 38 headed by group. A group with nothing in it is left out; a nutrient missing from a group that has others is an **em-dash, never a nought**. `have`/`counted` are only passed for a total, and only a genuinely partial number is marked — mark everything and the mark means nothing |
| `macroList` (6362) | the five, in the shape `microPanel` wants them |
| **`moreBtn`** (6373) | the caret on any host. It remembers what was open in a `Set` of **model objects** (`view.micro` for ingredients, `view.tot` for meals and days) so a re-render does not shut it, and it **builds its panel the first time it is asked** — 1,282 ingredient rows apiece would be a hundred thousand nodes nobody has looked at |
| `nutRow` (6396) | the USDA line under an ingredient, now ending in a caret |
| **`totalsBlock`** (6449) | the `.tot` line — a meal's, then a day's — with the same four numbers, `known/total` when they differ, and the same caret onto `microSum()` |

### The day view (6500–6993)

A book of 100 menus is 300 meals — 14,274 DOM nodes and a page 140,729
pixels tall if every one is rendered. The list is a **view** over
`model.days`; nothing here mutates it except the explicit edits.

| Line | What |
|---|---|
| 6505–6511 | `FOLD` / `fold()` — search folding. The cedilla forms are `\u`-escaped on purpose: they must not appear literally (tests/recipes.js checks) but real text is full of them |
| 6514 | **`view`** — `{ q, ing, kinds, open, allOpen, micro, tot }`. Every one of those five sets holds **model objects**, not indices: an index drifts the moment a day above it is deleted. `micro` is the ingredients whose detail panel is open, `tot` the meals and days whose totals panel is |
| 6583 | `dayMatches(day, di)` → the indices of that day's meals that survive the search, the comma-separated ingredient filter (`ingredientTerms`/`mealIngredientHay`) and the chips. A day whose *title* matches keeps all of them — but the ingredient filter is still applied per meal. `termScore`/`markTerms`/`mealHits` (just above) are what a collapsed day uses to show *which* ingredient/step matched, filler words (`FILLER`) discounted |
| 6606 / 6619 | `shownDays()` — what is on screen; `outputDays()` — what the markdown is built from (the same, when "only the recipes shown" is ticked) |
| 6625 / 6653 | `renderFilters` (chips, only for kinds the book has), `paintFound` |
| 6680 | `markInto` — puts the search terms in `<mark>` without letting the text become HTML; matching on the folded string, marks on the original |
| 6704 | `daySummary` — a day nobody is editing, in one row |
| 6744 | `daySelect` — move a meal to another day; options filled on first use |
| **6782** | **`arrangeIntoDays(perDay)`** — a day ends where a meal kind repeats, or, for a flat list with no kinds, `perDay` to a day named in eating order |
| **6812** | **`renderDays`** — collapsed rows, or the full editor for the days that are open. Eight or fewer just open. It is also what appends the per-meal and per-day `totalsBlock` |
| 7191 | `filtersChanged` — re-renders the markdown only when the output actually depends on the filter |

**Two things must stay in step:** `MEAL_KINDS` (6517) is the one list of
meal kinds — the `<select>` in a meal header, the filter chips and
`arrangeIntoDays` all read it. `mealLabel` (6254) is the one place a kind
becomes a word.

### The markdown (`buildDayMarkdown`, 7025)

The output shape is a contract (`docs/RECIPES.md` § C): `#` day, `##` meal,
`### 1. Ingrediente` as a four-column table whose last column is the USDA
food, `### 2. Metoda de preparare` as an ordered list, **`### 3. Valori
nutriționale`** as the per-ingredient table and its total, then the day
totals — which are now numbers rather than a stub. Its third argument is
the list of meal indices to write, which is how "only the recipes shown"
narrows a day. Change the shape here and in that doc together.

`macro(v, dp, known)` (7006) and `fdcCell(v)` (7016) are what fills the new
cells. `macro`'s third argument is the whole point of it: olive oil really
does have no protein and that cell must say `0`, while an ingredient nobody
matched has no protein *number* and that cell must stay empty. `fdcCell`
puts the id first and alone — everything after the `·` is worked out again
from it and the quantity beside it, which is why the file still round-trips
byte-identically.

### The shareable HTML page (7218–8179)

One self-contained `.html` file — one stylesheet of its own, one script of
its own, nothing to fetch — built from the model rather than from the
markdown. The *why* is `docs/RECIPES.md` § G.

| Line | What |
|---|---|
| **`DOC_JS`** (7409) | the totals half of the one script the file carries, and the reason the preview iframe is `sandbox="allow-scripts"` now. Plain ES5: this document may be opened years from now. Everything it needs is on the elements — grams per unit and the four values per 100 g, as `data-` attributes — so there is no table embedded a second time and still nothing to fetch. It is an **array of lines, not a joined string**: `docNutriJs()` (7677) splices the panel half into the same closure, so both share `qty()`/`num()` and `all()` still runs last |
| **`docMicroTexts`** (7519) / **`docMicroJs`** (7549) | the panel half. The 38 nutrient names, units and group headings cross in already localised, and `nHave` as a `%a`/`%b` template. What ships in the markup is the **data** — one `data-m` per quantity field, the same sparse "index:value per 100 g" (`microAttr`, 7933), ~130 bytes a row — and the panel is built when somebody asks. A written-out panel per ingredient would be 1.5 KB, which on a hundred-day book is two megabytes nobody opens |
| **`filterHtml`** (7727) / **`docFilterJs`** (7761) | the other half: the search bar under the header — the same two boxes and chips as card 5 — and the ES5 that drives it. It reads the markup it is filtering (`h3`, `ul.ing`, `ol.steps`, `data-kind`), deliberately **not** the nutrition table, or "oil" would answer with every row whose USDA food is named one. The bar ships `hidden` and the script un-hides it, so a page opened with scripting off has no dead box |
| `jsonForScript` (7691) / `docFilterTexts` (7702) | what crosses into that script: every value escaped past ASCII (the cedilla forms must not appear literally — `tests/recipes.js` checks the preview too), and the counted phrases as templates, so the plural rules of both languages stay in `I18N` |
| `qtyHtml` (7941) / **`nutriHtml`** (7967) | the quantity as a field, and the table under the method that follows it. An ingredient with no food gets the field but no `data-k`, which is what keeps it out of the total. `nutriHtml` also writes the per-row caret and the empty `tr.mrow` its panel goes into, plus one `details.mtot` for the meal — all `hidden`, un-hidden by the script |
| `DOC_CSS` (7222) | the whole document's stylesheet as an array of lines: earth palette on screen, `@media print` turning it back into ink, `@page` margins. Kept as strings, like every other builder in this file |
| `escHtml` (7681) | the only defence the page has. An ingredient name is user text and goes through it |
| `htmlTitle` (7915) | the field, or the source file's name with its extension and dashes taken off, or the page's own name. Also what `saveHtml()` names the file after |
| `mealHtml` (8019) / `dayHtml` (8058) | a meal is its kind chip, its dish, an ingredient list and an ordered method; ingredient **groups** become subheadings, which is the thing the markdown table cannot carry |
| **`buildHtmlDoc`** (8107) | the whole file as one string — the same string the preview iframe shows and the export saves. Order inside `<body>`: header ▸ **filter bar** ▸ contents ▸ days ▸ footer ▸ the one `<script>`, which holds whichever halves this page needs (no bar under two recipes, no totals with the USDA pass off — and no `<script>` at all when neither) |
| `paintHtml` (8170) | shows or hides card 5, and rebuilds the preview: only while the fold is open, and 250 ms after the typing stops. The fold decides itself once — open at eight days or fewer |

`dayHtml` also writes a `table.nutri.dtot` per day — the roll-up the
markdown has always had a place for and never had anything to put in — and
a `details.mtot.dtotm` beside it for the day's 38, which `calcDay` fills by
adding the meals together rather than walking every field twice.
`mealHtml` puts the meal's kind on the section as `data-kind`, which is
what the chips in the exported page match against.

`saveHtml` (8582) and `openHtml` (8594) are the two ways out, both in
section 9: `ScuLaFolder.save()` for the file, a `blob:` URL for a tab (which
is also how it reaches a printer).

### The ingredient book, on screen and on disk

| Line | What |
|---|---|
| `nutRow` (6396) | the line under every ingredient in the review cards: the food it matched (an `<input list="usdaList">`, not a `<select>` — 426 options under each of a hundred days' ingredients would be tens of thousands of nodes), and what the quantity comes to |
| `fillUsdaList` (7150) / `paintNutri` (7161) | the one datalist, filled once at init; the "418 of 444 have a food" line in `#nutriBox` |
| `learnFrom` (7170) | called from `analyse()` on **every** route in — a PDF, a photo, a paste, an imported `.md` — because the point of the book is that a name is resolved once |
| `BOOK_KEY` (8609) | `scula:nutrition` in the settings store is where it lives between visits; `saveBookFile`/`readBookFile` (8616, 8622) are how it moves to another device. A `.json` picked or dropped goes there rather than to the parser |

---

## Fast recipes

```bash
## calendar.html — 2628 lines · "Calendar" (events on days and hours)

`lang="ro"`. Themed and bilingual from the first commit. The *why*, the
storage contract and the `@date` syntax live in **`docs/FEATURES.md` § L** —
read that before changing what it writes. Map only below.

| Lines | Contents |
|---|---|
| 5–257 | App CSS. `:root` **6–38** (earth tokens plus `--hour-h` / `--gutter-w`, the hour grid's two knobs). Header 39–63, sidebar 64–100, month **101–148**, **hour grid 149–192**, agenda 193–210, modal 211–235, phones **236–256** — the `(pointer:coarse)` block keeps `px` on purpose (44px floor) |
| 260–1387 | **Shared nav + `ScuLaFolder` + `ScuLaCal`** (identical in all five files) |
| 1389–1558 | Markup: header **1389–1405** (view switcher, `+ Eveniment`), sidebar `#side` **1408–1460** (search, the four facet boxes, export/import), `#stage` 1462, **`#ev-modal` 1466–1546** (the one editor — new and existing both land there), `#day-modal` 1548–1558 |
| 1560–2537 | App script, numbered sections below |

Script sections (comment banners `/* === N. Title === */`):

| Line | Section |
|---|---|
| 1562 | **1. i18n** — `I18N` (`ro:` 1565 / `en:` 1610), `t()` 1657, `applyUILang` 1661 |
| 1673 | 2. State — `EVENTS` / `SHOWN` / `anchor` / `view` / **`hidden`** (what is filtered *out*, so an event carrying a brand-new tag is visible by default) |
| 1692 | 3. Dates — `startOfWeek` 1699 is Monday-first, which is the week both `ro-RO` and `en-GB` use |
| 1710 | 4. Reading an event — `evTitle` / `evCal` / `evSrc` / `evTags` / `evColor`, and **`inkOn` 1722** (dark or light text chosen from the colour's luminance — Google's palette runs from Banana to Tomato, so a fixed ink is unreadable on half of it) |
| 1736 | 5. Filtering — `fold` 1738 (NFD minus the combining marks), `matchQuery` 1742, `applyFilters` 1747, `indexByDay` 1763 |
| **1770** | **6. Rendering** — `el` 1776, `renderMonth` 1804, **`lanesFor` 1857** (overlap packing, counted per *cluster* rather than per day), **`renderTime` 1879** (week and day are the same builder; the head and the all-day strip go in one sticky `.tg-top`), `renderAgenda` 1962, `headTitle` 2007, **`render` 2019** (the only entry point), `scrollToHour` 2038 |
| 2046 | 7. Filter sidebar — `facetCounts` 2054, `paintFacet` 2061, `paintFilters` 2082, `toggleFacet` 2099 |
| **2109** | **8. The event editor** — `buildSwatches` 2112, **`openEvent` 2136** (subtracts a day from an all-day end, because storage keeps it exclusive), `saveEvent` 2183, `deleteEvent` 2227, `openDay` 2237 |
| 2249 | 9. Export / import — `exportIcs` 2256, `exportJson` 2261, `copyJson` 2266, `importFile` 2282 |
| 2311 | 10. Moving around — `setView` 2313, `step` 2318, `goToday` 2325 |
| 2328 | 11. Preferences — the view and the filters, under the `meta` key `view`; **a phone with nothing saved opens on the agenda** (month gives a day ~55px) |
| 2353 | 12. Loading — `load()` 2355 |
| **2363** | **13. Wiring** — one delegated listener per container; `byId` 2368. **Drag-to-create 2400–2444** (`SNAP` 2400, `minuteAt` 2402 — a fraction of the column, snapped to 15 minutes). Sidebar 2446, header 2477, editor 2490, **keyboard 2510** (←/→, T, N, M/W/D/A, `/`), `ScuLaCal.onChange` 2522 |
| 2529 | 14. Init |

**The hour grid's geometry is percentages, never pixels.** `--hour-h` and
the root font size can both change, and a block positioned as a % of its
column survives both; `minuteAt()` reads back the same way, off
`getBoundingClientRect`, so drag-to-create needs no unit either.

**One refresh path.** `ScuLaCal.put`/`remove`/`putMany` fire the change
fan-out and this page is subscribed to it, so a save must *not* also call
`load()` — that rendered everything twice.

---

# where is X?
grep -n "X" *.html

# every hardcoded colour outside :root
grep -n "#[0-9a-fA-F]\{3,8\}\b" editor.html | sed -n '20,$p'

# every user-visible string in markup
grep -n "placeholder=\"\|title=\"\|aria-label=\"" index.html

# confirm nav still in sync + JS still parses — one command
/verify
```

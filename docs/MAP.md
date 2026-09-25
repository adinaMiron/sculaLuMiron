# MAP.md — where everything lives

Line anchors so you can `sed -n 'A,Bp' file` instead of scanning. Numbers
drift by a few lines after edits; **search by the name in the right-hand
column** if a range looks wrong. Re-verify with `grep -n` when in doubt.

**When a range in here is off by more than a few lines, fix it in the same
change** — a stale anchor costs the next session a wasted read. Same for any
flow you find yourself repeating: promote it to a `/command`, a skill, or a
hook rather than re-typing it (see `CLAUDE.md` § "Keep this current").

Shared shape of all seven files:

```
<style>  …app CSS, :root palette at the very top…  </style>
<body>
<nav id="site-nav">  + its own <style> + <script>   ← the shared block
…app markup…
<script>  …app logic, one IIFE/closure…  </script>
```

## The shared block (byte-identical in all seven files)

From the `<nav id="site-nav">` line through `<!-- ===== end toolbar nav ===== -->`
(~1279 lines). Rough starts: `voice.html:260` · `editor.html:452` ·
`index.html:1907` · `recipes.html:527` · `calendar.html:269` ·
`transfer.html:197` · `map.html:238` — these drift; grep the
`<nav id="site-nav"` line.

Four features share it, because all of them must exist before any app
script runs:

| Part | What |
|---|---|
| `#site-nav` links + `#navLangBtn` | page links, UI-language toggle → `docs/I18N.md` |
| `#navFolderBtn` + `window.ScuLaFolder` | where saved files go → `docs/FEATURES.md` § D |
| `#scula-sheet` | the destination chooser (phones/tablets) |
| `#scula-toast` | the shared bottom toast, `ScuLaFolder.toast(msg, action, fn)` |
| **`window.ScuLaCal`** | the shared calendar store → `docs/FEATURES.md` § L |
| **`window.ScuLaGeo`** | the `^@` place marker and its scan → `docs/FEATURES.md` § S |

Inside the block's `<script>`, in order: current-page highlight ·
`LANG_KEY`/lang toggle · `SUBDIR` map + `T` (its own private ro/en
strings) · `supported`/`canShareFiles`/`currentMode` · toast ·
`paintFolder` · IndexedDB helpers (`scula-fs`/`handles`, keys `root` and
`mode`) · `permitted`/`pick`/`forget`/`setMode` · the chooser sheet ·
**`rootDir`** (the chosen folder itself — only `transfer.html` needs it, to
move the whole tree across and to write a received one back into it) ·
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

`ScuLaGeo` is a **third IIFE** after that one, ~110 lines, and the smallest
of the three. In order: `KEY` (`scula:map:payload`) · **`markRe`** (the
`^@` marker — its tail is a lookahead, § S says why) · `coords` · `read` ·
`findMarks`/`has` · `tagsOf`/`contextOf` · **`scan`** (text → the layered
payload, one layer per heading) · `send`/`received` · `window.ScuLaGeo`.

Any edit here goes into **all seven** files — run `/verify` to confirm they
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

## voice.html — 3829 lines · "Caiet vocal" (voice dictation)

`lang="ro"`. **The only app with a working i18n system** — copy its pattern.

| Lines | Contents |
|---|---|
| 11–256 | App CSS. `:root` palette at **12–37** (earth-palette tokens, migrated). `.rec-opt` (the keep-the-sound rows) **137–140**, `.rec-sub` indenting the WAV row under its parent, `.melody-card` and the piano roll **216–232** |
| 260–1544 | **Shared nav + `ScuLaFolder` + `ScuLaCal` + `ScuLaGeo`** (identical in all 7 files) |
| 1548–1774 | Markup: header, controls, `#keepAudio` **1580–1584**, `#keepWav` **1586–1590**, `#melodyArm` **1592–1596**, textarea, **the melody panel `#melodyCard` 1607–1684**, settings sheet |
| 1776–3827 | App script, numbered sections below |

Script sections (comment banners `/* === N. Title === */`):

| Line | Section |
|---|---|
| 1781 | **1. i18n** — `I18N` object (`ro:` 1770 / `en:` 1883), `t()` at 1998, `UI` at 1997 |
| 2015 | 2. Providers |
| 2040 | 3. Settings store — `KEY` 2026, `store` 2027 w/ memory fallback, `save()` 2159, `load()` 2160 |
| 2076 | 4. DOM refs |
| 2107 | 5. Language / engine chips |
| 2122 | **6. UI language** — `applyUILang()` **2110** (it also calls `melSyncLabels()`) |
| 2145 | 7. Settings sheet |
| 2227 | 7b. Help |
| 2239 | 8. Secure-context check |
| 2244 | 9. Recording (MediaRecorder) + segment rotation — **keep-the-sound recorder 2248–2301** |
| 2450 | 10. Transcription queue |
| 2544 | 11. Browser dictation (Web Speech API) |
| 2605 | 12. File import |
| 2619 | 13. Copy / share / **save → `ScuLaFolder.save()`** / clear |
| **2665** | **14. Melodie** — the recording turned into music (§ below) |
| 3823 | 15. Init |

**Two independent language axes — do not conflate:**
- `S.ui` (`UI`) = interface language. Toggle `#uiLangBtn`.
- `S.lang` = *spoken* language for dictation (`ro-RO`/`en-US`/auto), L1627.

### The melody (§ 14, 2651–3807)

Analysis and synthesis, both hand-rolled, no library and no samples — see
`docs/FEATURES.md` § P for the why and the shape. Sub-banners inside it:

| Line | Part |
|---|---|
| 2684 | `INSTR` — the fourteen instruments, one object each (partials, ADSR, damping, GM program). `LEAD_ORDER`/`CHORD_ORDER` are what the pickers show |
| 2721 | `SINE` table (16384 entries) + `makeFFT` |
| 2756 | `decodeMono`/`resample`/`decimate2`/`normalise` — blob → mono Float32Array at 22050 |
| 2824 | `trackPitch` — YIN, 46 ms window / 23 ms hop at 11025 |
| 2869 | `segmentNotes` — pitch frames → notes (octave repair, median smoothing, ±0.75-semitone hysteresis) |
| 2954 | `onsetEnvelope`/`detectTempo`/`beatPhase` — spectral flux, then autocorrelation with a log-normal prior around 110 BPM |
| 3024 | `detectKey` (**Pearson**, not a dot product — see the comment there), `snapMidi`, `chordsFor` |
| 3113 | `renderTone` / `renderString` (Karplus-Strong) — one rendered tone per (instrument, pitch) |
| 3204 | the drum one-shots |
| 3243 | `place` (where the note release lives), `reverbTail`, `finishMix` |
| 3316 | `wavBlob` · 3323 `midiBlob` (format 1, a track per part) |
| 3386 | `buildScore` — snap, quantise, bar 1 beat 1 = the first note |
| 3444 | `renderAudio` — lead / chords / bass / drums into one stereo mix |
| 3569 | the panel: DOM refs, the generated chips, `melSay`/`melButtons`/`melSyncLabels` |
| 3636 | `drawRoll` — the piano roll |
| 3700 | `melMake`, `melPlay`/`melStop`, the two saves, the listeners |

`MEL_MAX` (2664) caps the source at 180 s — memory, not taste: the mix is
three Float32Arrays of it at 44100.

**Keeping the sound** (`#keepAudio`, off by default, persisted as
`S.keepAudio`): a **second** `MediaRecorder` on the same stream, started in
`startRec`/`startLive` via `armAudio()` + `startAudioKeep()` and stopped in
`stopRec`/`stopLive`. It is deliberately *not* the transcription recorder —
that one is rotated every `S.segMin` minutes and its segments are separate
containers, which cannot be glued back into one playable file. The checkbox
is read **once, at record time** (`audio.armed`) — together with
`#melodyArm`, which wants the same recorder for a different reason, so
either box arms it; `#dlBtn` then writes the
blob next to the transcript under the name the transcript actually got
(`r.name`, which `freeName` may have bumped), so both land in
`<folder>/transcript/`. Browser dictation has no stream of its own, so
`startAudioKeep(null)` opens one and `stopOwnStream()` closes it.

**The high-quality WAV** (`#keepWav`, persisted as `S.keepWav`, only meaningful
under `#keepAudio` — ticking it ticks that, unticking that unticks it): a
*third* tap, the `wav` object beside `audio`. No `MediaRecorder` can write
lossless audio, so `startWav()` (called from `startAudioKeep`) opens its own
`getUserMedia` stream with echo cancellation, noise suppression and AGC
**off** (the transcription stream is mono with all three on), feeds it into
a `ScriptProcessor` — not an AudioWorklet, which would be a module file and
break `file://` — and `wavTake()` packs every block to 24-bit PCM at the
context's native rate as it arrives, folding into a `Blob` every ~5 s so a
long session can be paged out of memory. `stopWav()` (from `stopAudioKeep`)
tears the graph down and prepends the 44-byte header (`wavPcmBlob()`; the
melody's `wavBlob()` is the 16-bit stereo one). `#dlBtn` saves it as the
third file under the same `r.name` stem, `.wav`. Checked by `tests/voice.js`
case 4b — header, sizes, length and a non-silent peak.

---

## editor.html — 6106 lines · "Image Marker" (canvas annotation)

`lang="ro"`. Deep internals in **`HANDOFF.md`** — read that for the layer
model, rendering pipeline, and canvas traps. Map only below.

Theme: ✅ migrated to the earth palette (dark), step 3 of `docs/THEME.md`.
`:root` uses the shared semantic token names (`--surface`, `--text`, …) —
see that doc for the canvas-colour resolution (`CHROME` cache, ~L949).

**Chrome layout (2650-08):** the top bar holds document-level actions only.
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
| 452–1736 | **Shared nav + `ScuLaFolder` + `ScuLaCal` + `ScuLaGeo`** |
| 1580–1759 | Markup: `#toolbar` (file / **`#driveBtn`** / **undo+redo** / zoom / capture / panel toggles) |
| 1760–1798 | Markup: `#toolsPanel` — Basic · Shapes · Arrows |
| 1799–1923 | Markup: `#selectionPanel` — one `.selRow` per property |
| 1924–2007 | Markup: `#newCanvasOverlay` — the size presets, incl. `.sizePreset[data-infinite="1"]` |
| 2008–2043 | Markup: the other modals, stage, sidebar |
| 2073–6104 | App script |

Script sections (banners `/* ===== Title ===== */`):

| Line | Section |
|---|---|
| 2052 | i18n — `I18N` (`ro:`/`en:`), `t()`, `applyUILang()` |
| 2296 | State — `state` object (incl. `zoom`/`panX`/`panY`, and `infinite`/`originX`/`originY`/`renderScale`), style defaults, `PALETTE` |
| 2359 | Utilities — incl. `setBtnLabel`/`setBtnIcon` (icon+label button spans) |
| 2431 | History — `pushHistory`/`commit`/`applyHistory`/`undo`/`redo`, `committed` (the pre-change state an undo returns to), and `syncHistoryButtons` (the `#undoBtn`/`#redoBtn` disabled state) |
| 2491 | Loading an image — `beginEditing(opts)`, `syncCanvasBuffers`, `setupStage` |
| 2508 | Screen snapshot |
| 2561 | Screen recording — `liveRenderLoop`, `startRecording` |
| 2694 | Recording preview / playback — `recordingBlob` kept for the folder save |
| **2835** | **Viewport: zoom + pan** — `applyZoomDisplay`/`applyPan` (the clamp), `clientToContent`/`panContentTo` (the anchor maths), `clientToWorld`/`panWorldTo`, `setZoom`/`setZoomAt`, `zoomReset`/`fitDrawing`, buttons, wheel, **`gesture*` page-zoom blockers** |
| **3011** | **Infinite canvas** — `INF_PAD`, `worldTransform`, `ensureInfiniteWindow`. See the section below |
| 3077 | Pan — `startPan`/`updatePan`/`endPan`, Alt/Space hints |
| 3126 | New canvas modal — incl. `modalInfinite` |
| **3223** | **Rendering** — `renderAll`, `renderBase`, `drawLayer`, all `drawX()` |
| **3635** | **Spline curve + polyline** — both vertex-driven layer types in one block: `splineSegments` (the maths, and the only place `polyline` differs), `drawSpline`, `setSplinePoints`, the vertex edits, and the `state.pendingSpline` placing mode. See the section below |
| 4122 | Layer list (sidebar) — `renderLayerList` |
| **4117** | **Toolbar wiring** — every button/handler (IDs unchanged by the panel move) |
| **4505** | **Floating panels** — `placePanel` (clamps every edge inside the viewport), `defaultPos`, drag, persistence |
| **4688** | **Selection panel contents** — `ROW_TYPES` (4674), `pickedVertex`/`syncSplineControls`, `syncSelectionPanel` |
| 4733 | Text box auto-fit |
| 4782 | Pointer/canvas coords — `canvasPoint()`, which returns **world** coords |
| **4841** | **Pointer interaction** — the one gesture layer: `pointers`/`gesture`, `beginPinch`/`updatePinch`, `releasePointer`, `maybeDoubleTap`, then `onDown`/`onMove`/`onUp` |
| 5348 | Text editing overlay — `openTextEditor`, `positionEditor` (+ the `repositionEditor` hook the viewport calls) |
| 5384 | Keyboard shortcuts |
| **5473** | **Save** — `EXPORT_MARGIN`/`inkBounds`/`exportRect` (what an export frames), `renderComposite`, **`driveAutoUpload()`** 5663 (§ Google Drive below, called by every save once connected), **`saveOut()`** 5671 (`ScuLaFolder.save`, plus `driveAutoUpload`) |
| 5700 | Save all sizes (zip) — `qualifyingSizes(rect)`, `makeZip`, `crc32` |
| 5853 | Fonts ready — `document.fonts.load()` startup pass |
| **5889** | **Google Drive** — `DRIVE` config, `loadScriptOnce`, `driveAuth` (Google Identity Services, in a popup), `driveFetch` (one 402 retry), `drivePickFolder` (only if `DRIVE.API_KEY` is filled in), `driveEnsureFolder` (otherwise a "Mazgaleste" folder it creates), `driveUpload`, `paintDrive`. Both Google scripts are fetched on the first click, never at page load. **Connecting once sets `driveAutosync`** (persisted as `gdrive_autosync`), which is what makes `saveOut()` above also push to Drive on every later save — `docs/FEATURES.md` § D. Tested by `tests/drive.js` against a stubbed Drive API |

Largest region by far is Rendering (3209–4053); go straight to the
specific `drawX()` you need.

### The infinite canvas (2974–3053, and everywhere it touches)

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

### The `spline` and `polyline` layers (3664–4019)

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

**Two lists must stay in step:** `ROW_TYPES` (4674) says which property
rows show for which layer type, and the handlers in Toolbar wiring (4142)
say which types each control actually writes to. Add a control → add it to
both. `rowRough` ("Stil schiță") is on every drawn shape including `spline`
and `polyline` — its `.rough-btn` handler writes `l.roughness`, which
`drawSpline` now honours. `rowSplineEdit` is the one row that also needs a real layer, not just
a matching tool, so `syncSplineControls()` hides it again afterwards — that
function also hides the Corner button and swaps the hint's `data-i` key for
a `polyline`, whose vertices are all corners already.

---

## index.html — Markdown editor

`index.html` holds CSS, markup, and the shared toolbar navigation block. Its
editor JavaScript is in [`js/markdown/`](../js/markdown/README.md). The script
tags at the bottom of `index.html` show load order. Use `rg` to locate a
function within a feature file.

| Feature | File | Main entry points |
|---|---|---|
| UI language and storage | `js/markdown/i18n.js` | `I18N`, `t`, `applyUILang`, `store` |
| Editor actions, undo, panels, image explorer | `js/markdown/editor.js` | `undoMark`, `insertAtCursor`, `setView`, `togglePanelById` |
| Markdown syntax, timeline, preview, navigation | `js/markdown/markdown.js` | `parseMarkdown`, `updatePreview`, `updateNav`, `renderImportance` |
| Workbooks, chapters, autosave, folder mirror | `js/markdown/workbooks.js` | `loadWorkbooks`, `wbSelectChapter`, `saveToWorkbook` |
| Quick idea capture | `js/markdown/idea.js` | `openIdeaModal`, `saveIdea` |
| Knowledge graph and causality | `js/markdown/graph.js` | `openGraph`, `gvRefresh`, `parseCausalLine` |
| Search and filter | `js/markdown/search.js` | `fdCompute`, `fdRun`, `fdGoto` |
| Garden toolbox | `js/markdown/garden.js` | `openGarden`, `gdRender` |
| Photo and film metadata | `js/markdown/media.js` | `openMedia`, `mbRead`, `mbRender` |
| Wikilink picker and suggester | `js/markdown/wikilinks.js` | `openWikiModal`, `maybeWikiSuggest` |
| Import, export, and file/table/link dialogs | `js/markdown/files.js` | `importDocx`, `exportHtml` |
| Editor event handlers and keyboard shortcuts | `js/markdown/events.js` | DOM event listeners |
| Dictation into editor or idea | `js/markdown/dictation.js` | `toggleDictation`, `toggleIdeaDictation` |
| Responsive layout and initial boot | `js/markdown/startup.js` | `applyResponsiveDefaults`, `loadWorkbooks` |
| First-run modal on a new device (folder, then cloud) | `js/markdown/startup.js` | `welcomeMaybe`, `welcomeCloud`, `#welcome-modal` |
| Google Drive chapter sync | `js/markdown/drive.js` | `cloudSync`, `cloudButton`, `cloudBoot` |

For the behavior and design of each feature, use [`FEATURES.md`](FEATURES.md)
§§ C, E, G, H, J, K, L, M, N, O, R, S, and T.

---

## recipes.html — 10235 lines · "Rețete" (PDF / photo → recipe markdown + USDA)

`lang="ro"`. The *why*, the format contract and the USDA plan live in
**`docs/RECIPES.md`** — read that before changing the markdown it writes.
Map only below.

| Lines | Contents |
|---|---|
| 11–523 | App CSS. `:root` **12–51** (earth palette, semantic names). Help modal 65–87, **the meal picker `#pickModal` / `.pickrow` / `.lib-search` / `.libmeal` 88–125**, buttons 156–184, drop zone 185–198, day/meal cards 231–267 including **the per-ingredient USDA line `.ing + .nut` 245–261**, **the detail panels `.morebtn` / `.micro` / `.tot` 268–319**, **the daily targets `.tgrid` / `.goals` / `.dgoal` 320–372**, **search / chips / collapsed days / `.grp` 382–443**, markdown preview 444–463, **`#htmlFrame` (the shareable page, previewed) 464–468**, tabs 470–477, folds + checkboxes + `.badge` 479–498, then the narrow and touch media blocks 499–522 |
| 527–1811 | **Shared nav + `ScuLaFolder` + `ScuLaCal` + `ScuLaGeo`** |
| 1817–2085 | Markup: **six** numbered cards. **`#targetCard` (1860) is card 1** — the daily targets, full width above the columns, no longer a fold inside the review card. Then **`#cols` (1888)** — which drops to a single column (`.solo`) while the review card is away, so an empty page is not one card beside half a blank screen: left column source (2, 1892) ▸ `#textCard` (1952, 3) ▸ `#mdCard` (1967, 4) ▸ `#htmlCard` (**Pagina HTML**, 2020, 5); right column **`#reviewCard` (2044, `hidden`)** — review (6). `#helpModal` is at 1809 and **`#pickModal` — the meal picker — right after it at 1823**. The OCR fold is `#ocrBox` (1913–1948); `#optNutri` 1990, **the USDA fold `#nutriBox` 1999–2009**, `#onlyShownBox` 1993, the four `#tgKcal`/`#tgProt`/`#tgCarb`/`#tgFat` fields + `#tgNote` + `#btnTgClear` are in card 1, the filter bar is `#filters` (2046, holds `#qBox` and the comma-separated `#ingBox`), `#found` 2056, **`#btnPickMeal` in the row under the days 2061**. `#btnMd` + `#mdFile` + `#bookFile` + **`#libFile`** are in card 2. `<datalist id="usdaList">` is at **2071**, after the wrap and filled once at init |
| 2083–10233 | App script, numbered sections below |

| Line | Section |
|---|---|
| 2108 | **1. i18n** — `I18N` (`ro:` 2097 / `en:` 2386), `t()` (variadic), `applyUILang()`. The 38 nutrient names are the `nut_*` keys, the five headings `gMacro`/`gCarb`/`gFat`/`gMin`/`gVit`/`gOther`; the picker's own words are the `pick*` / `lib*` keys, **the daily targets' the `tg*` ones plus `mdTgTarget`/`mdTgDiff`** |
| 2711 | 2. Settings store (`scula:recipes`) |
| **2737** | **3. `Jpx`** — the JPEG 2147 decoder |
| **3787** | **4. `PdfText`** — the dependency-free PDF reader |
| **4747** | **5. `Recipes`** — the parser, and the two readers that take its own output back (markdown, and the shareable page) |
| **5359** | **6. `Nutrition`** — the two USDA tables, the Romanian names, and what a recipe adds up to |
| 6840 | 7. The app — state, `setStatus`/**`say`**, **the detail panels**, **the daily targets**, **the day view**, **the meal library + picker**, review cards, markdown, **the shareable HTML page** |
| 9357 | 8. Getting the text in — `ingest`/**`analyse`** (which of the three readers gets the text)/`handleFile(s)`, then OCR |
| 9732 | 9. Saving — `.md`, **`.json` (the ingredient book)** and **`.html`** via `ScuLaFolder`, chapters via `scula-md` |
| 9890 | 10. Wiring + init |

### `Jpx` (2745–3752)

`decode(bytes, opts)` → `{ width, height, comps, siz, luma }` and
`toRGBA(res)` → 8-bit RGBA. The only two entry points. It exists because no
browser but Safari decodes JPEG 2147, and a great many scanned books are
stored as `/JPXDecode` — without it those pages are invisible to
`createImageBitmap` and the file reads as empty.

`decode(bytes, { luma:true })` reads **only component 0** when the file has
a component transform. Y is the luma both RCT and ICT are built around, so
OCR gets the grey page it wants for a third of the work; `imageOf` always
asks for that. Packet headers are still parsed for every component — the
lengths are what advance the stream — only tier-1 is skipped.

| Function | What |
|---|---|
| `MQ` (2646) | the arithmetic decoder, Annex C. `QE`/`NMPS`/`NLPS`/`SW` are Table C.2 verbatim |
| `RawBits` / `HeadBits` | the two other bit readers: bypass passes, and packet headers with their 0xFF stuffing |
| `TagTree` (2742) | inclusion and zero-bit-planes, decoded against a rising threshold **across packets** — hence the state on the object |
| `BitModel` (2811) | tier-1: `runSignificance`, `runRefinement`, `runCleanup`. `nbSig` keeps the neighbour counts packed in a byte and updated in `setSig`, which is what stops a naive tier-1 re-reading eight flags per coefficient per plane |
| `synth1D` (2980) | the inverse wavelet, 5/3 and 9/7, over an **absolute** index range — the parity of `i0` decides which samples are low-pass. Whole-sample symmetric extension, filled only in the margins |
| `buildTile` (3068) / `buildCodeblocks` (3140) | the geometry of Annex B: tiles ▸ components ▸ resolutions ▸ subbands ▸ precincts ▸ code-blocks. Precinct indices are computed on the **resolution** grid, not the subband's |
| `numPasses` (3182) / `segmentBreaks` (3194) | how many coding passes a packet declares, and where the encoder terminated (`termall`, `bypass`) |
| `readPacket` (3218) | one packet header: inclusion ▸ zero bit-planes ▸ passes ▸ `Lblock` ▸ segment lengths, then the bodies |
| **`packetSequence`** (3265) | the progression order. Rather than the spec's five nested-loop machines, every (component, resolution, precinct) is listed with the position it projects to and **sorted** — same order, far less to get wrong |
| `decodeCodeblocks` (3313) / `writeBack` (3354) | tier-1 over a tile, then coefficients into their subband. `missing` is how many low bit-planes never arrived — uniform per block, so the mid-point of what is left is the best guess for all of them |
| `reconstruct` (3371) | `2D_INTERLEAVE` + `HOR_SR` + `VER_SR`, coarsest resolution upwards |
| `parseSIZ`/`parseCOD`/`parseQCD` (3406, 3013, 3039) | the marker segments; `parseCOC`/`parseQCC` override them per component |
| `findCodestream` (3438) | the `.jp2` box tree, or a bare `.j2k`, or a codestream with junk in front |
| `decode` (3457) | markers ▸ tiles ▸ packets ▸ tier-1 ▸ wavelet ▸ MCT |
| `toRGBA` (3616) | subsampled components stretched back up; grey, RGB, RGBA and CMYK |

### `PdfText` (3788–4712)

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
| **`pageText`** (4082) | the entry point; hands off to `runContent` |
| **`runContent`** (4093) | the tiny interpreter, **re-entrant**: text operators plus `q`/`Q`/`cm`/`Do`, with the full text matrix — see the traps below |
| **`formsOf`** (4375) | every `/Form` XObject a resource dictionary offers, inflated and ready for `runContent` to walk into. Memoised, so one form drawn on 108 pages is inflated once; `building` guards a form that draws itself |
| `joinLines` (4330) | drawing order → reading order; a wide vertical gap becomes a paragraph break |
| `parseDoc` / `contentOf` (4521, 4537) | the shared front half: scan ▸ refuse encrypted ▸ expand object streams ▸ page list; then one page's content stream |

The picture half — everything a scanned page needs (`docs/RECIPES.md` § A):

| Function | What |
|---|---|
| `xobjectsOf` (4355) | a page's `/XObject` dict → name → object number |
| `drawnOrder` | the `/Im3 Do` operators, **in painting order**. The dictionary is unordered, and a scanner that cuts a page into strips relies on the order |
| `componentsOf` / `sampleAt` | colour space → components; one sample at 1/2/4/8/16 bits |
| **`imageOf`** (4447) | one `/Subtype /Image` → `{kind:"jpeg", bytes}` (the browser decodes it), or `{kind:"raw", rgba}` — including **`/JPXDecode`, through `Jpx`**. CCITT, JBIG2, LZW and indexed palettes → `null` |
| `collectImages` (4509) | walks a page's XObjects, three levels into `/Form`s, skipping anything logo-sized (`MIN_IMAGE_PX`) |
| **`images`** (4586) | page-ordered pictures; falls back to every image object in the file when the page tree yields none |

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

### `Recipes` (4749–5336)

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

#### `fromMarkdown` (5153–5243) — the contract, read back

`fromMarkdown(text)` → `{ days, source }`: the inverse of
`buildDayMarkdown()`, so a `.md` this page wrote comes back as the model it
was built from and every feature downstream works on it. `looksLikeMarkdown`
is what `analyse()` asks to decide which reader gets the text.

| Line | What |
|---|---|
| 5105 (`MD_SOURCE`, `MD_TOTALS`, `MD_RULE`, `MD_SEP_ROW`) | the four lines that are *not* content: the source note, the totals stub's heading, a `---`, and a table's `\| --- \|` row |
| `mdCells` (5130) | one walk over the characters. `\|` is the only escape `cell()` writes, so it is the only one read |
| `looksLikeMarkdown` (5147) | a heading **and** either a `### 1.`/`### 2.` section or a table row — a plan with a stray `#` in it still goes to `parse()` |
| `fromMarkdown` (5153) | `#` day ▸ `##` meal (`## Total pe zi` skipped) ▸ `###` matched on its **leading digit**, so both languages read ▸ table rows below the separator ▸ `1. …` steps |

The rules and the one thing that does not survive (an ingredient's group)
are in `docs/RECIPES.md` § C, "Reading it back".

#### `fromHtml` (5246–5338) — the shareable page, read back

`fromHtml(text)` → `{ days, source }`, the same shape, out of a page
`buildHtmlDoc()` wrote. It is what lets a plan somebody was *sent* become a
plan they can edit, and what fills the meal library (below).
`looksLikeRecipeHtml` (5273) is the sniff `analyse()` asks first, ahead of
`looksLikeMarkdown`.

| Line | What |
|---|---|
| `looksLikeRecipeHtml` (5273) | `article.day` **and** `section.meal` both present in the raw text. A regex, not a parse: a page that is not one of ours must not cost a DOM |
| `htmlQty` (5282) | the `.q` span → the two columns. With the USDA pass on the quantity is an `<input>` and the unit is the text beside it; with it off both are one string, split on `QTY_RE` |
| `fromHtml` (5292) | `DOMParser` on `text/html` — markup only, no script runs and nothing is fetched. `article.day` ▸ `h2` (the same "Ziua 7 alone is a number, not a name" rule as `fromMarkdown`) ▸ `section.meal[data-kind]` ▸ `h3 .kind`/`.dish` ▸ `ul.ing > li` (`li.grp` names the run under it, `.q` + `.it` are the row, `data-fdc` is the USDA id) ▸ `ol.steps > li` |

The ingredient **group** survives this trip and not the markdown one — the
page has a subheading for it and the table has no column. `data-fdc` is
written by `mealHtml` (below) and is the same id the markdown's fourth
column carries.

### `Nutrition` (5356–6789)

The USDA tables and everything that turns an ingredient into numbers. It
sits between the parser and the app because both sides need it: the
markdown writer, the review cards and the shareable page all ask it the
same questions. The *why*, the fallbacks and the format of the ingredient
book are `docs/RECIPES.md` § E.

| Line | What |
|---|---|
| **`USDA_FOODS`** (5381) | 426 rows, `[id, description, kcal, protein, fat, carb, piece g, cup g, tbsp g]` per 100 g. 363 are FoodData Central's Foundation Foods, compiled out of `FoodData_Central_foundation_food_json_2026-04-30.json`; the 62 whose id starts **`L`** are the staples that set does not have — pâine, paste, miere, cașcaval. An `L` id can never be read as an fdcId |
| **`MICRO_DEFS`** (5845) / **`MICRO_GROUPS`** (5852) | the **other 38** nutrients, `[key, unit, decimals]` in display order, and the five headings that group them (`gCarb`, `gFat`, `gMin`, `gVit`, `gOther`). `key` is the i18n suffix: `nut_fe`, `nut_b12`, … |
| **`USDA_MICRO`** (5853) | 363 rows, `fdcId → the 38 values per 100 g`, **sparse** — a hole is the dataset not having measured that nutrient in that food, which is never read as nought. ~42 KB, only the FoodData rows; the 62 `L` staples have none. Fibre falls back `1552 ▸ 2651 (AOAC 2629.25)` and sugars `1536 ▸ the sugars added up`, or rolled oats would read as having no fibre |
| **`RO_ALIAS`** (6226) | 602 Romanian (and some English) phrases → a row above. Written **already folded**, which is the shape `nfold()` puts a name in |
| `nfold` (6395) | lowercase, no diacritics, punctuation to spaces; `%` and `.` survive because "lapte 1.5%" is a real ingredient. The cedilla forms are `\u`-escaped, same rule as everywhere else in this file |
| `micros`/`microGroups` (6432) · **`microsOf`** (6437) · **`microRow`** (6448) · **`microSum`** (6461) | the second table's whole API. `microsOf(id)` is per 100 g, `microRow(row)` is a `forIngredient()` result scaled to its grams, `microSum(rows)` is `{ vals, have, counted, total }` — **`have[i]` is how many rows carried nutrient i**, which is what lets a total say it covers six of nine ingredients instead of quietly summing four. Deliberately **not** part of `forIngredient()`: one screen of a hundred-day book asks that 1,282 times |
| `head` (6506) | what is left of a name once the notes come off: a `(…)` is a note, a `+`/`,`/`sau` is the parser having failed to split two ingredients, a leading `de ` is what "2 felii **de** pâine" leaves behind |
| `byWords` (6518) | the English fallback: the words of the name against the words of the descriptions, first word of a description worth two. **Below 0.34 it returns nothing** — a wrong food is worse than none, because a wrong one is silent |
| **`match`** (6541) | alias on the whole name ▸ the alias phrase that starts **earliest** (longest on a tie) ▸ `byWords`. Earliest because Romanian puts the food first: "morcov ras o conservă de fasole albă" is a row about the carrot |
| `UNIT_G` (6565) / `qtyValue` (6590) / **`grams`** (6608) | unit → grams, the quantity column's six shapes (`60`, `1,5`, `1/2`, `½`, `1 ½`, `2-3`), and the two multiplied. A unit that names a *thing* — felie, bucată, cană, conservă — takes the food's own portion weight first and sets `guess` when there is none |
| **the book** (6624–6769) | `learn` (6659) grows it from a plan, `remember` (6722) writes a hand-picked food into it, `rematch` (6740) resolves everything that is not hand-written again, `toJSON`/`fromJSON` (6673, 6688) are the file. An entry marked `hand` supplies its own numbers and is never written over |
| `forIngredient` (6775) / `forMeal` (6795) / `forDay` (6800) | one row, one meal, one day. `ok` needs both a food **and** a weight; `known` counts the rows that have both, which is what lets a total say it is incomplete |

`num(v, dp)` is the one rounding rule for the whole feature, so the
markdown, the shareable page and the review cards never disagree about
what 68.7968 is.

### The detail panels (6903–7071)

The 38 numbers behind a caret, in the app. Both the review cards and the
shareable page grew the same affordance; this is the app's half, and
`docMicroJs()` (below) is the other.

| Line | What |
|---|---|
| **`microPanel`** (6926) | one panel: the five macros the row already shows, then the 38 headed by group. A group with nothing in it is left out; a nutrient missing from a group that has others is an **em-dash, never a nought**. `have`/`counted` are only passed for a total, and only a genuinely partial number is marked — mark everything and the mark means nothing |
| `macroList` (6991) | the five, in the shape `microPanel` wants them |
| **`moreBtn`** (7002) | the caret on any host. It remembers what was open in a `Set` of **model objects** (`view.micro` for ingredients, `view.tot` for meals and days) so a re-render does not shut it, and it **builds its panel the first time it is asked** — 1,282 ingredient rows apiece would be a hundred thousand nodes nobody has looked at |
| `nutRow` (7025) | the USDA line under an ingredient, now ending in a caret |
| **`totalsBlock`** (7213) | the `.tot` line — a meal's, then a day's — with the same four numbers, `known/total` when they differ, and the same caret onto `microSum()` |

### The daily targets (7073–7206)

Four numbers a day is meant to come to, and every day on the list saying
how close it came. The *why*, and what an empty field means, are
`docs/RECIPES.md` § I.

| Line | What |
|---|---|
| `TARGET_MACROS` (7080) / **`TARGET_BAND`** (7089) / `targets` (7090) / `targetsSet` (7092) | the four in one list — the field's id **is** its i18n key, which is what lets `goalsBlock` label a row without a second table — the ±10 % inside which a day counts as hit, and the values themselves. Each is a number or **`null`**; an empty field is "no opinion about this one" and must never be compared against, which is not the same as a target of nought |
| **`goalOf(key, value)`** (7098) | the one comparison in the feature: `{ target, value, diff, state, pct }`, or `null` when that macro has no target. `state` is `met` / `under` / `over` and every caller — the block, the chip, the markdown, the shareable page — reads it rather than re-deciding |
| `readTargets` (7107) / `paintTargets` (7114) | the fields into the values, and back. `paintTargets` is also what `loadPrefs` calls, so a reload puts the numbers back in the boxes |
| **`paintTargetNote`** (7124) | Atwater in one line: the three macros priced at 4/4/9 against the energy target beside them. Four separate fields cannot show that the two halves of a target disagree, and a set of targets that disagrees with itself is the commonest thing wrong with one |
| **`goalsBlock`** (7142) | the `.goals` box under a day's `totalsBlock`: one row per macro **that has a target**, each with `value / target`, the word for the gap, and a bar. A day whose ingredients are not all matched is marked `known/total` — part of any shortfall is the book's rather than the plan's |
| `goalWord` (7189) | the one place a gap becomes words, so the block, the chip and their tooltips never disagree |
| **`goalChip`** (7198) | the same verdict in one pill on a **collapsed** day (`daySummary`). Energy only: a collapsed day is a line of text, and four comparisons on it is a table |

The targets reach the two files as well: `buildDayMarkdown` writes an
**`Obiectiv`** and a **`Diferență`** row into `## Total pe zi` (skipped by
`fromMarkdown`, so nothing has to read them back), and `dayHtml` puts them
on `table.dtot` as `data-tk`/`data-tp`/`data-tc`/`data-tf` with both rows
written out — `DOC_JS`'s **`goals()`** then keeps the difference following
an edited quantity like every other number on that page.

### The day view (7253–7817)

A book of 100 menus is 300 meals — 14,274 DOM nodes and a page 140,730
pixels tall if every one is rendered. The list is a **view** over
`model.days`; nothing here mutates it except the explicit edits.

| Line | What |
|---|---|
| 7283–7288 | `FOLD` / `fold()` — search folding. The cedilla forms are `\u`-escaped on purpose: they must not appear literally (tests/recipes.js checks) but real text is full of them |
| 7292 | **`view`** — `{ q, ing, kinds, open, allOpen, micro, tot }`. Every one of those five sets holds **model objects**, not indices: an index drifts the moment a day above it is deleted. `micro` is the ingredients whose detail panel is open, `tot` the meals and days whose totals panel is |
| 7362 | `dayMatches(day, di)` → the indices of that day's meals that survive the search, the comma-separated ingredient filter (`ingredientTerms`/`mealIngredientHay`) and the chips. A day whose *title* matches keeps all of them — but the ingredient filter is still applied per meal. `termScore`/`markTerms`/`mealHits` (just above) are what a collapsed day uses to show *which* ingredient/step matched, filler words (`FILLER`) discounted |
| 7375 / 7388 | `shownDays()` — what is on screen; `outputDays()` — what the markdown is built from (the same, when "only the recipes shown" is ticked) |
| 7394 / 7422 | `renderFilters` (chips, only for kinds the book has), `paintFound` |
| 7459 | `markInto` — puts the search terms in `<mark>` without letting the text become HTML; matching on the folded string, marks on the original |
| 7483 | `daySummary` — a day nobody is editing, in one row, ending in **`goalChip`**'s energy verdict when a kcal target is set |
| 7536 | `daySelect` — move a meal to another day; options filled on first use |
| **7574** | **`arrangeIntoDays(perDay)`** — a day ends where a meal kind repeats, or, for a flat list with no kinds, `perDay` to a day named in eating order |
| **7616** | **`paintFlow`** — which of the six cards are worth showing. Cards 4, 5 and 6 all answer a question about recipes, so none appears before one exists; `#reviewCard` is the one this function owns (`#mdCard` is `renderDays`/`renderMarkdown`, `#htmlCard` is `paintHtml`). "Something exists" is a day, **any text in `#rawText`**, or a saved meal library — the last because `#btnPickMeal`, the only way into the library, lives inside `#reviewCard`. Called from `renderDays`, from the `input` on `#rawText`, and after the library is cleared |
| **7624** | **`renderDays`** — collapsed rows, or the full editor for the days that are open. Eight or fewer just open. It is also what appends the per-meal and per-day `totalsBlock`, and the day's **`goalsBlock`** under it |
| 8299 | `filtersChanged` — re-renders the markdown only when the output actually depends on the filter |

**Two things must stay in step:** `MEAL_KINDS` (7281) is the one list of
meal kinds — the `<select>` in a meal header, the filter chips and
`arrangeIntoDays` all read it. `mealLabel` (6883) is the one place a kind
becomes a word.

### The meal library and the picker (7818–8074)

Composing a day one recipe at a time, rather than reading a whole plan out
of one file. The *why* is `docs/RECIPES.md` § H.

| Line | What |
|---|---|
| `LIB_KEY` (7838) / `LIB_MAX` (7842) | `scula:meals` in the settings store, capped at 400 — a library is a picker, not an archive, and the oldest go first |
| `pick` (7844) | `{ day, kind, q }` — which day is selected, which flag (empty = "as saved"), and the search box |
| **`copyMeal`** (7849) | a deep copy of a meal. The ingredient objects must not be shared: the copy on the plan gets its quantity and its food edited and the library's must not follow |
| `mealSignature` (7866) / **`libAdd`** (7871) | what makes two entries the same recipe (the dish and its ingredients — **not** the flag, and not the method), and the one way in |
| `saveLibrary` (7880) / `loadLibrary` (7901) | the store, written as the two fields an entry is (`{ meal, src }`) |
| **`libSum`** (7897) | one entry's four numbers, memoised. The picker redraws every row on every keystroke and `forMeal()` is a matcher run per ingredient; the cache is dropped when the ingredient book changes size |
| `fillPickDays` (7915) / **`renderPickKinds`** (7936) | the day `<select>` (plus "a new day"), and the flag chips — `MEAL_KINDS` minus `other`, with "as saved" first and default |
| `libMatches` (7953) / **`renderLibrary`** (7961) | the folded search over the library, and the rows: flag, dish, what it comes to, where it came from |
| **`addFromLibrary`** (8020) | copy ▸ apply the flag ▸ push onto the chosen day (making one if "a new day") ▸ `learnFrom` ▸ re-render. The day's own `totalsBlock` needs nothing added — it already sums whatever the day holds |
| `openPicker` (8044) / `closePicker` (8052) | the modal is `#pickModal`, the same chrome as `#helpModal` |
| **`readLibFile`** (8057) | a file into the library: `fromHtml` or `fromMarkdown` only. There is nothing dependable to take a single recipe out of a guessed parse |

`⊕` in a meal header (`renderDays`) and `+ din bibliotecă` (per day, and
`#btnPickMeal` under the list) are the two ways in from card 6. The
picker's own words are built in script, so `data-i` cannot reach them — the
`scula-ui-lang` handler repaints them instead.

### The markdown (`buildDayMarkdown`, 8074)

The output shape is a contract (`docs/RECIPES.md` § C): `#` day, `##` meal,
`### 1. Ingrediente` as a four-column table whose last column is the USDA
food, `### 2. Metoda de preparare` as an ordered list, **`### 3. Valori
nutriționale`** as the per-ingredient table and its total, then the day
totals — which are now numbers rather than a stub. Its third argument is
the list of meal indices to write, which is how "only the recipes shown"
narrows a day. Change the shape here and in that doc together.

`macro(v, dp, known)` (8085) and `fdcCell(v)` (8095) are what fills the new
cells. `macro`'s third argument is the whole point of it: olive oil really
does have no protein and that cell must say `0`, while an ingredient nobody
matched has no protein *number* and that cell must stay empty. `fdcCell`
puts the id first and alone — everything after the `·` is worked out again
from it and the quantity beside it, which is why the file still round-trips
byte-identically.

### The shareable HTML page (8300–9341)

One self-contained `.html` file — one stylesheet of its own, one script of
its own, nothing to fetch — built from the model rather than from the
markdown. The *why* is `docs/RECIPES.md` § G.

| Line | What |
|---|---|
| **`DOC_JS`** (8516) | the totals half of the one script the file carries, and the reason the preview iframe is `sandbox="allow-scripts"` now. Plain ES5: this document may be opened years from now. Everything it needs is on the elements — grams per unit and the four values per 100 g, as `data-` attributes — so there is no table embedded a second time and still nothing to fetch. It is an **array of lines, not a joined string**: `docNutriJs()` (8806) splices the panel half into the same closure, so both share `qty()`/`num()` and `all()` still runs last |
| **`docMicroTexts`** (8648) / **`docMicroJs`** (8678) | the panel half. The 38 nutrient names, units and group headings cross in already localised, and `nHave` as a `%a`/`%b` template. What ships in the markup is the **data** — one `data-m` per quantity field, the same sparse "index:value per 100 g" (`microAttr`, 9032), ~130 bytes a row — and the panel is built when somebody asks. A written-out panel per ingredient would be 1.5 KB, which on a hundred-day book is two megabytes nobody opens |
| **`filterHtml`** (8856) / **`docFilterJs`** (8890) | the other half: the search bar under the header — the same two boxes and chips as card 5 — and the ES5 that drives it. It reads the markup it is filtering (`h3`, `ul.ing`, `ol.steps`, `data-kind`), deliberately **not** the nutrition table, or "oil" would answer with every row whose USDA food is named one. The bar ships `hidden` and the script un-hides it, so a page opened with scripting off has no dead box |
| `jsonForScript` (8820) / `docFilterTexts` (8831) | what crosses into that script: every value escaped past ASCII (the cedilla forms must not appear literally — `tests/recipes.js` checks the preview too), and the counted phrases as templates, so the plural rules of both languages stay in `I18N` |
| `qtyHtml` (9070) / **`nutriHtml`** (9096) | the quantity as a field, and the table under the method that follows it. An ingredient with no food gets the field but no `data-k`, which is what keeps it out of the total. `nutriHtml` also writes the per-row caret and the empty `tr.mrow` its panel goes into, plus one `details.mtot` for the meal — all `hidden`, un-hidden by the script |
| `DOC_CSS` (8316) | the whole document's stylesheet as an array of lines: earth palette on screen, `@media print` turning it back into ink, `@page` margins. Kept as strings, like every other builder in this file |
| `escHtml` (8810) | the only defence the page has. An ingredient name is user text and goes through it |
| `htmlTitle` (9044) | the field, or the source file's name with its extension and dashes taken off, or the page's own name. Also what `saveHtml()` names the file after |
| `mealHtml` (9148) / `dayHtml` (9193) | a meal is its kind chip, its dish, an ingredient list and an ordered method; ingredient **groups** become subheadings, which is the thing the markdown table cannot carry. Each `<li>` also carries **`data-fdc`**, the USDA id the row resolved to — the same thing the markdown's fourth column holds, and what `Recipes.fromHtml` reads back |
| **`buildHtmlDoc`** (9266) | the whole file as one string — the same string the preview iframe shows and the export saves. Order inside `<body>`: header ▸ **filter bar** ▸ contents ▸ days ▸ footer ▸ the one `<script>`, which holds whichever halves this page needs (no bar under two recipes, no totals with the USDA pass off — and no `<script>` at all when neither) |
| `paintHtml` (9329) | shows or hides card 5 (`#htmlCard`), and rebuilds the preview: only while the fold is open, and 250 ms after the typing stops. The fold decides itself once — open at eight days or fewer |

`dayHtml` also writes a `table.nutri.dtot` per day — the roll-up the
markdown has always had a place for and never had anything to put in — and
a `details.mtot.dtotm` beside it for the day's 38, which `calcDay` fills by
adding the meals together rather than walking every field twice.
`mealHtml` puts the meal's kind on the section as `data-kind`, which is
what the chips in the exported page match against.

`saveHtml` (9750) and `openHtml` (9758) are the two ways out, both in
section 9: `ScuLaFolder.save()` for the file, a `blob:` URL for a tab (which
is also how it reaches a printer).

### The ingredient book, on screen and on disk

| Line | What |
|---|---|
| `nutRow` (7025) | the line under every ingredient in the review cards: the food it matched (an `<input list="usdaList">`, not a `<select>` — 426 options under each of a hundred days' ingredients would be tens of thousands of nodes), and what the quantity comes to |
| `fillUsdaList` (8244) / `paintNutri` (8255) | the one datalist, filled once at init; the "418 of 444 have a food" line in `#nutriBox` |
| `learnFrom` (8268) | called from `analyse()` on **every** route in — a PDF, a photo, a paste, an imported `.md` — because the point of the book is that a name is resolved once |
| `BOOK_KEY` (9773) | `scula:nutrition` in the settings store is where it lives between visits; `saveBookFile`/`readBookFile` (9784, 9790) are how it moves to another device. A `.json` picked or dropped goes there rather than to the parser |

---

## calendar.html — 2785 lines · "Calendar" (events on days and hours)

`lang="ro"`. Themed and bilingual from the first commit. The *why*, the
storage contract and the `@date` syntax live in **`docs/FEATURES.md` § L** —
read that before changing what it writes. Map only below.

| Lines | Contents |
|---|---|
| 5–257 | App CSS. `:root` **6–38** (earth tokens plus `--hour-h` / `--gutter-w`, the hour grid's two knobs). Header 39–63, sidebar 64–100, month **101–148**, **hour grid 149–192**, agenda 193–210, modal 211–235, phones **236–256** — the `(pointer:coarse)` block keeps `px` on purpose (44px floor) |
| 269–1553 | **Shared nav + `ScuLaFolder` + `ScuLaCal` + `ScuLaGeo`** (identical in all seven files) |
| 1550–1719 | Markup: header **1391–1552** (view switcher, `+ Eveniment`), sidebar `#side` **1555–1607** (search, the four facet boxes, export/import), `#stage` 1609, **`#ev-modal` 1613–1693** (the one editor — new and existing both land there), `#day-modal` 1695–1705 |
| 1739–2784 | App script, numbered sections below |

Script sections (comment banners `/* === N. Title === */`):

| Line | Section |
|---|---|
| 1723 | **1. i18n** — `I18N` (`ro:` 1712 / `en:` 1757), `t()` 1804, `applyUILang` 1808 |
| 1834 | 2. State — `EVENTS` / `SHOWN` / `anchor` / `view` / **`hidden`** (what is filtered *out*, so an event carrying a brand-new tag is visible by default) |
| 1853 | 3. Dates — `startOfWeek` 1846 is Monday-first, which is the week both `ro-RO` and `en-GB` use |
| 1871 | 4. Reading an event — `evTitle` / `evCal` / `evSrc` / `evTags` / `evColor`, and **`inkOn` 1869** (dark or light text chosen from the colour's luminance — Google's palette runs from Banana to Tomato, so a fixed ink is unreadable on half of it) |
| 1897 | 5. Filtering — `fold` 1885 (NFD minus the combining marks), `matchQuery` 1889, `applyFilters` 1894, `indexByDay` 1910 |
| **1931** | **6. Rendering** — `el` 1923, `renderMonth` 1951, **`lanesFor` 2004** (overlap packing, counted per *cluster* rather than per day), **`renderTime` 2026** (week and day are the same builder; the head and the all-day strip go in one sticky `.tg-top`), `renderAgenda` 2109, `headTitle` 2154, **`render` 2166** (the only entry point), `scrollToHour` 2185 |
| 2207 | 7. Filter sidebar — `facetCounts` 2201, `paintFacet` 2208, `paintFilters` 2229, `toggleFacet` 2246 |
| **2270** | **8. The event editor** — `buildSwatches` 2259, **`openEvent` 2283** (subtracts a day from an all-day end, because storage keeps it exclusive), `saveEvent` 2330, `deleteEvent` 2374, `openDay` 2384 |
| 2410 | 9. Export / import — `exportIcs` 2403, `exportJson` 2408, `copyJson` 2413, `importFile` 2429 |
| 2472 | 10. Moving around — `setView` 2460, `step` 2465, `goToday` 2472 |
| 2489 | 11. Preferences — the view and the filters, under the `meta` key `view`; **a phone with nothing saved opens on the agenda** (month gives a day ~55px) |
| 2514 | 12. Loading — `load()` 2502 |
| **2524** | **13. Wiring** — one delegated listener per container; `byId` 2515. **Drag-to-create 2547–2591** (`SNAP` 2547, `minuteAt` 2549 — a fraction of the column, snapped to 15 minutes). Sidebar 2593, header 2624, editor 2637, **keyboard 2657** (←/→, T, N, M/W/D/A, `/`), `ScuLaCal.onChange` 2669 |
| 2690 | 14. Init |

**The hour grid's geometry is percentages, never pixels.** `--hour-h` and
the root font size can both change, and a block positioned as a % of its
column survives both; `minuteAt()` reads back the same way, off
`getBoundingClientRect`, so drag-to-create needs no unit either.

**One refresh path.** `ScuLaCal.put`/`remove`/`putMany` fire the change
fan-out and this page is subscribed to it, so a save must *not* also call
`load()` — that rendered everything twice.

---

## transfer.html — 3108 lines · "Transfer" (files to another device)

`lang="ro"`. Themed and bilingual from the first commit. The *why* — the two
roads, why there is no signalling server, why the other end of Bluetooth is
never another browser — is **`docs/FEATURES.md` § Q**. Map only below.

| Lines | Contents |
|---|---|
| 5–194 | App CSS. `:root` **6–23** (earth tokens, nothing page-specific). Header + `.btn` 37–59, **the link pill `.pill` 61–72**, panels 74–110, the transport tabs 112–117, **the device book `.dev` 119–133**, **the drop zone + `.tray` rows 135–166**, progress 168–172, modal + `.help-body` 174–186, touch 188–193 |
| 197–1481 | **Shared nav + `ScuLaFolder` + `ScuLaCal` + `ScuLaGeo`** (identical in all seven files) |
| 1483–1637 | Markup: header **1483–1491**, **panel 1 the link 1496–1571** (the two transport panes, `#wifiBox` with `#myCode`/`#theirCode`, `#bleScan`, `#advanced`, `#devList`), **panel 2 what you send 1574–1600** (`#drop`, `#fFiles`, `#fFolder`, `#tray`), **panel 3 what arrived 1603–1625** (`#dest`, `#inbox`, the save buttons), Help modal 1627–1637 |
| 1639–3107 | App script, numbered sections below |

Script sections (comment banners `/* === N. Title === */`):

| Line | Section |
|---|---|
| 1641 | **1. i18n** — `I18N` (`ro:` 1644 / `en:` 1720), then **`helpBody` as two assignments after the object** (1794 ro / 1857 en) rather than inside it: it is a page of prose per language. `t()` 1921, `applyUILang` 1925 — which repaints the link state, the tray, the inbox and the device list, because all four are built in JS |
| 1941 | 2. State — `tray` (staged to send) · `inbox` (arrived) · `busy` · `state` · `prefs` · **`link`**, the one object both transports fill in (`send`, `close`, `payload`, `peer`). `safePath` **1989** is the only place a path from the other device is trusted, and it is trusted by being rebuilt |
| 2000 | 3. **The device book** — IndexedDB `scula-sync`, stores `devices` (keyPath `id`) and `meta` (the `prefs` record). `Book` 2007, `remember` 2057, `credit` 2069, **`forgetDevice` 2080** (a BLE row also hands back the browser's own permission via `device.forget()`), `forgetEverything` 2095 |
| **2109** | **4. The wire** — 4-byte length, 1 type byte, payload. `F` (the 8 frame types) 2116, `frame`/`jframe` 2119, **`reader` 2130** (the reassembler both roads share — WebRTC keeps message boundaries, Bluetooth does not, so neither is trusted). Then the codes: `b64u` 2154, **`packCode`/`unpackCode` 2167** — JSON, deflate-raw where `CompressionStream` exists, base64url behind an `S1Z`/`S1P` marker so a code can be fished out of whatever it was pasted with |
| **2191** | **5. Wi-Fi** — `newPc` 2204, **`iceDone` 2212** (waits out gathering so one code carries every candidate; 3.5 s cap so a dead STUN cannot hang the page), `dcSend` 2221 (`bufferedAmount` flow control), `wireChannel` 2235, `startOffer` 2263, `startJoin` 2281, **`useTheirCode` 2293** (an offer is answered whether or not "I'm joining" was pressed) |
| 2324 | 6. **Bluetooth** — the three NUS UUIDs 2332, `BLE_MTU` 2335, `bleAttach` 2339, `bleScan` 2372, `bleReconnect` 2390. The browser is always the *central*; see § Q |
| 2402 | 7. One link, either road — `sendHello`, `dropped`, `hangUp` |
| 2431 | 8. **The tray** — `addOne`/`addFiles` 2438, **`walkEntry` 2457** (a dropped folder, depth-first; the entries must be taken out of the event before the first `await`), `fromDrop` 2480, **`walkHandle` 2500** (a directory handle), `pickFolder` 2525, **`pickScula` 2537** (`ScuLaFolder.rootDir` — the whole chosen folder) |
| 2549 | 9. Sending — `sendTray` 2410: manifest, then per file START ▸ DATA… ▸ END, then DONE |
| 2598 | 10. Receiving — `onFrame` 2604, one branch per type. Saving is async and frames are not, so END and DONE queue their work on `chain` through **`later` 2602** |
| **2662** | **11. Saving what arrived** — `uniqueName` 2664 (never overwrite), `destRoot` 2675, `writeInto` 2681, `autoSave` 2693, `saveOne` 2703, `saveEverything` 2717. Then **the store-only ZIP 2744–2812** (`crc32` 2755, `zipStore` 2760) — how a folder tree arrives whole on a phone, where there is no folder to write into |
| 2814 | 12. Painting — `paintLinkState` 2818, `paintTray` 2856, `paintInbox` 2882, **`paintDevices` 2912** (the book, with its forget and reconnect buttons) |
| 2964 | 13. Wiring — tabs, the buttons, the drop zone, the clipboard helpers, **Help 3059** |
| 3073 | 14. Init — prefs out of `scula-sync`, then **a `#c=` code in the hash** filled into the box and dropped from the address bar |

**The two ends are symmetrical.** A link is a link: once it is up, either
side can send, and step 2 is the same page on both. Nothing in the protocol
knows which one dialled.

---

## map.html — 2378 lines · "Hartă" (the `^@` places on a map)

`lang="ro"`. Themed and bilingual from the first commit. The *why* — the
marker's three rules, why the map is hand-rolled rather than Leaflet, why
both addresses are editable fields — is **`docs/FEATURES.md` § S**. Map
only below.

| Lines | Contents |
|---|---|
| 5–236 | App CSS. `:root` **6–30** (earth tokens + the four **`--pin-*`** place states). Header 44–71, **the layered list `#side` 74–117**, **the map `#stage` 120–167** (the graticule that stands in for tiles, `.tile`, `.pin`), the HUD/attribution/scale 169–185, **the pin popup `#pop` 188–203**, modals 206–225, phones 228–235 (the sidebar becomes a drawer) |
| 238–1522 | **Shared nav + `ScuLaFolder` + `ScuLaCal` + `ScuLaGeo`** (identical in all seven files) |
| 1524–1604 | Markup: header **1524–1536**, **`#side` 1539–1546** (the filter field, the look-one-up field, `#layers`, the foot), **`#stage` 1548–1569** (`#tiles`, `#pins`, `#hud`, `#scale`, `#attrib`, **`#pop` 1559**), settings modal **1572–1592**, help modal **1594–1601** |
| 1606–2372 | App script, numbered sections below |

Script sections (comment banners `/* === N. Title === */`):

| Line | Section |
|---|---|
| 1616 | **1. i18n** — `I18N` (`ro:` 1618 / `en:` 1682), `helpBody` inside the object, `t()` 1735, `applyUILang` 1739 — its tail repaints the source label, the list and the attribution, all three being built in JS |
| 1747 | 2. **Storage** — `store` (try/catch, `file://` can throw), `SET_KEY`/`CACHE_KEY`, **`DEFAULTS` 1754** (the two addresses), the geocode cache 1766–1775 |
| 1776 | 3. State — `PLACES` (flat, shared by the list and the pins) · `LAYERS` · `SOURCE` · `view {lat, lon, z}` · `tileNodes` |
| **1797** | **4. Web Mercator** — `lon2x`/`lat2y`/`x2lon`/`y2lat`, **`origin()` 1813** (the viewport's top-left in world pixels — every other position is derived from it), `pointToLatLon` 1818 |
| **1822** | **5. Tiles** — `tileUrl` 1825 (`{z}/{x}/{y}`, `{s}` too), **`renderTiles` 1831**: the keys are `z/x/y/tx` with `tx` *unwrapped*, so a tile's copy across the antimeridian is its own node; nodes outside the view are dropped. `paintAttrib` 1860 credits OSM only when the address is OSM's |
| **1866** | **6. Pins** — ⚠ **`num()` 1872** before `located()` 1873: `isFinite(null)` is `true`, so a place with no coordinates yet would otherwise land on Null Island. `renderPins` 1880, `renderScale` 1903, `render` 1914 (the one repaint), then the popup: `select` 1916, `placePop` 1929, `openOnOSM` 1941, `copyCoords` 1947. Moving: `panTo` 1954, **`zoomBy` 1957** (re-derives the centre from the anchor, so the point under the cursor stays put), **`fitAll` 1969** |
| 1984 | 7. **The layered list** — `statusWord`/`statusColor` 1986, **`paintList` 1999** (a layer per heading; its name toggles the layer, `▸` collapses it), `paintFoot` 2061, `paintSource` 2071, `toggleSide` 2077 |
| **2079** | **8. The geocoder** — `readGeoResult` 2085 (Nominatim's shape, a bare array, GeoJSON `features`, or a `results` list), `geoFetch` 2104, `enqueue` 2113 (cache first; no address configured means "not found", not a hang), **`pump` 2121** — one request per **`GAP_MS` 2081** (1100 ms, Nominatim's policy), `locateAll` 2143 |
| 2155 | 9. **Where the list comes from** — **`adopt` 2158** (payload → `PLACES`/`LAYERS`), `takePayload` 2183 (`ScuLaGeo.received()`), the `#md-file` reader 2187 (**📄 Open .md** — the same `ScuLaGeo.scan`), `addTyped` 2201 (the sidebar's own look-up) |
| 2220 | 10. Export — `exportGeoJSON` 2223, through `ScuLaFolder.save` like every other save here |
| 2245 | 11. **Dragging, wheeling and pinching** — one pointer map; two pointers is a pinch (integer zoom steps off `log2` of the distance ratio), one is a pan. Then the filter field, the add field and the keys (`+`/`−`/`F`) |
| 2329 | 12. The two modals — settings 2332–2351 (saving re-drops every tile node and re-queues what has no coordinates), help 2353 |
| 2360 | 13. Init — the language, the `scula-ui-lang` listener, the **`storage` listener** (🗺 pressed in another tab repaints a map already open), then `takePayload()` |

**One repaint, three parts.** `render()` is tiles + pins + scale, and every
mutation ends in it. Nothing else touches `style.transform`.

---

## kanban.html — task board

The shared nav block ends near line 1345. The page CSS and controls are at
the top and just after the nav. The board script follows: `openDb`/`readAll`
read the editor's `scula-md` workbooks and chapters; `parseTask` and
`parseDates` extract checklist states, owners, importance, and dates from
Markdown lines; `filterTasks` applies scope, search and filters; `paintBoard`
builds the five columns; `writeStatus` updates one verified source line and
the `pending` store in one transaction. The **Open** link returns to
`index.html` with `chapter` and `line` query parameters.

The chapter Gantt view stays in `index.html`: its modal and CSS are near the
other editor modals, and `js/markdown/gantt.js` parses the open editor text,
lays out dated task bars, and draws `#number` → `$number` dependencies.

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

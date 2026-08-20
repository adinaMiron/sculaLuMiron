# editor.html — dev handoff

Single-file HTML/CSS/JS screen-annotation + drawing tool. No build step, no
external JS libs. 9 fonts via local `.ttf` in `fonts/` next to the HTML
(all referenced in the `@font-face` block at the top of `<style>`), all
now present and working:
Poppins-Regular, Raleway-Regular, Roboto-Regular, NotoMono-Regular
(actually Noto Sans Mono — Google Fonts renamed the family; kept the old
filename/CSS name to match the UI's "Noto Mono" option) pulled from Google
Fonts, OFL-licensed, same treatment as the Excalidraw set below +
Excalifont-Regular, Nunito-Regular, LilitaOne-Regular,
ComicShannsMono-Regular (Excalidraw's actual font lineup, pulled from
their official npm package + Google Fonts' repo, OFL-licensed).
`ink-free.ttf` is a special case: 'Ink Free' ships with Windows and is
Microsoft's font, not redistributable, so it can't be bundled for real.
The `@font-face` rule tries `local('Ink Free')`/`local('Inkfree')` first
(picks up the genuine font on machines that have it) and falls back to
the bundled `ink-free.ttf`, which is actually Patrick Hand (OFL) — a
plain-print handwriting look-alike, not the real Ink Free.
Poppins/Raleway/Roboto/Noto-Sans-Mono/Excalifont/Nunito/Comic-Shanns-Mono/
Patrick-Hand-as-Ink-Free all verified to cover Romanian diacritics
(ă,â,î,ș,ț); Lilita One doesn't (upstream limitation, not ours) — `fontCss()`
appends a `sans-serif` fallback so a missing glyph degrades instead of tofu.

Structure: `<style>` (~L6-204) → HTML markup (~L205-423) → `<script>` IIFE
(~L423-2319). Everything is one closure; no modules, no framework.
Line numbers below are approximate (current file ≈2320 lines) — search by
function name, they don't move much between edits.

## Mental model

Two stacked `<canvas>` elements inside `#stage`:
- `#baseCanvas` — the actual content (background + every layer). This is
  what gets exported.
- `#overlayCanvas` — selection box, resize/rotate handles, in-progress
  drag previews. Never exported, purely UI chrome. Also the element that
  receives all mouse/pointer events (`onDown`/`onMove`/`onUp`).

`state` (plain object, ~L428) holds everything: current tool, style
defaults (color/fill/stroke/font/opacity/roughness/etc — these double as
"defaults for next new shape" AND get live-applied to the current
selection when changed), `state.layers` (the document), zoom/pan, and
canvas readiness/mode flags. `baseImage` (an `Image` or `null`, ~L467) and
`state.bgFill` (hex color or `null`=transparent) together describe what's
"behind" the layers — see `renderBase()` (~L1387).

Render pipeline: `renderAll()` = `renderBase()` + `renderOverlay()` +
`renderLayerList()`. `renderCanvasFrame()` skips the (expensive) layers
panel rebuild — used by the 60fps live-recording loop. Always call
`pushHistory()` right before/after mutating `state.layers` for undo/redo
to work (`snapshot()`/`undo()`/`redo()`, ~L499).

## Layer model

Every layer: `{ id, type, x, y, w, h, rotation, groupId, visible, opacity }`
+ type-specific fields below. `x,y,w,h` are always axis-aligned pre-rotation
bounding-box coords in the canvas's *natural* pixel space (never CSS/zoom
space — `canvasPoint(evt)` at ~L1743 converts mouse events into this space
once, everything downstream is zoom/scroll-agnostic).

| type | extra fields | notes |
|---|---|---|
| `text` | `text, font, fontSize, color, bold, strokeWidth` | `strokeWidth` here = faux-bold outline via `ctx.strokeText`, NOT shared with shape stroke width semantics. Live-edited via a floating `<textarea>` (`openTextEditor`, ~L2020) positioned over the canvas — see gotchas. |
| `rect` | `fill, stroke, strokeWidth, cornerRadius, font, text, textColor, textSize` | Optional embedded text, added by double-clicking the rectangle **only** — drawing one never opens a text editor. No font/size/bold rows in the selection panel: the label inherits `state.font` at creation time. `fill=null`→no fill. |
| `ellipse` | `fill, stroke, strokeWidth` | `w===h` ⇒ labeled "Circle" in layer list. |
| `rhombus` | `fill, stroke, strokeWidth` | 4-point diamond from bbox midpoints. |
| `line` | `color, strokeWidth, x1n,y1n,x2n,y2n` | Endpoints normalized 0..1 within bbox. |
| `arrow` | same as `line` + `headSize` | |
| `splineArrow` | `color, strokeWidth, headSize, points[]` | `points[0]` = arrowhead TIP (first click), `points[last]`= tail. See "spline arrow" below. |
| `freehand` | `color, strokeWidth, points[]` | `points[]` = `{nx,ny}` normalized 0..1 within bbox. |
| `highlight` | `color, points[]` (thickness = `l.h`) | Horizontal-only band (drag locks to start Y). Thickness comes from `state.highlightSize` / the `#rowHiSize` slider — **not** the text "Size" field, which it used to borrow. Rendered with `globalAlpha=0.4*layerOpacity` + `multiply` blend. |
| all shapes except text | `roughness, seed` | Sloppiness (see below). |

Group = shared `groupId` string; no nested groups. Selecting one member
selects all (`groupMembers()`, ~L1513).

## Tools (`state.tool` values, toolbar buttons `data-tool="…"`)

`select, text, rect, ellipse, rhombus, pencil, arrow, splineArrow, line,
highlight`. Keyboard: `v,t,r,o,d,p,a,s,l,h`. Adding a new shape tool
touches ~10 places — grep any existing type (e.g. `'rhombus'`) across the
file to find them all: toolbar button, `drawX()` fn, `drawLayer()`
dispatch, `labelFor()`, `applyColorToSelection()`, stroke-width handler,
sloppiness-button filter, `hitLayer()` padded-hit branch (only needed for
thin/stroke-only shapes), `onDown` creation block, `onMove` resize/point
branch, keyboard map.

Modifier keys while dragging a shape tool: **Shift** = ellipse→circle,
rhombus→equal sides, line→45° snap. **Ctrl** = rect→square,
ellipse/rhombus→same as Shift, arrow/line→snap horizontal/vertical.

## Sloppiness ("Architect/Artist/Cartoonist")

`state.roughness` 0/1/2, per-layer `l.roughness` + `l.seed`. `seed` makes
the "hand-drawn" wobble deterministic per-shape (`mulberry32()`, ~L980) so
it doesn't re-randomize every repaint. `roughLineTo`/`roughStrokeLine`
(~L993/1012) wobble straight segments (rect/rhombus/line/arrow edges,
double-stroked when roughness>0). `roughEllipsePath` (~L1117) does the
same for ellipses via a jittered point ring. roughness=0 always takes a
separate, perfectly-clean rendering branch (not just roughness→0 wobble).

## Freehand smoothing ("no jitters")

`smoothPoints(points, passes, windowRadius)` (~L959): moving-average on
raw drag points, endpoints anchored (critical for `splineArrow` — point 0
must stay exactly where the person clicked for the tip). Applied once on
mouse-up for `pencil`/`splineArrow`/`highlight`. Rendering ALSO runs
`smoothPathTo()` (~L1218, quadratic-curve-through-midpoints) — the two
together are what make freehand strokes look smooth instead of faceted.
Don't skip either step.

## Spline arrow specifics

`points[0]` is the tip. Render (`drawSplineArrow`, ~L1287): compute tangent
from `points[0]` vs `points[min(3,len-1)]` (not points[1] — too noisy),
pull the curve's start back by `headSize` along that tangent so the shaft
doesn't poke through the triangle, draw the triangle separately at the
literal tip. `onDown`/`onMove` reuse the pencil point-capture branch
(`create-splinearrow` mode aliases into the same code as `create-pencil`).

## Canvas sources (what can be "under" the layers)

1. Uploaded image (`Open image` → `baseImage`, original file untouched).
2. Blank canvas (`New canvas` modal → picks one of 7 preset sizes ×
   landscape/portrait × color/transparent bg → `state.bgFill`).
3. Screenshot (`getDisplayMedia` one-frame grab → drawn into an `Image`,
   same path as #1).
4. **Live screen recording** — the interesting one: the shared screen is
   played into a *hidden* `<video>` (`liveVideoEl`), and `liveRenderLoop()`
   (~L608, rAF loop) draws its current frame into `baseCanvas` every tick,
   THEN draws all layers on top — so you can annotate live and it's
   actually baked into what gets recorded. The recorded stream is
   `baseCanvas.captureStream(30)` video track + the original mic/tab audio
   track, merged into one `MediaStream` and fed to `MediaRecorder`
   (`startRecording()`, ~L614) — NOT the raw screen share. On stop, the
   final canvas frame is captured via `toDataURL()` and promoted to a
   normal `baseImage` (layers cleared, since they're now baked in) so the
   person can keep annotating a still frame afterward. Recording controls:
   toolbar Pause/Resume (`mediaRecorder.pause/resume`) + Stop; a separate
   post-recording review modal (`openRecordingPreview`, ~L753) gets full
   play/pause/seek/volume/mute/download/fullscreen controls.

`beginEditing()` (~L545) is the shared reset used by all four sources:
clears layers/history, resets zoom, calls `setupStage()`.

## Zoom / Pan

`state.fitScale` (auto, recomputed on load/resize) × `state.zoom` (user
multiplier, default 1) = actual CSS display scale. `applyZoomDisplay()`
(~L838) only touches `style.width/height`; canvas `.width/.height`
(pixel buffer) always stays at `naturalW/H`. `canvasPoint()` divides by
this same effective scale, so drawing/hit-testing is zoom-agnostic —
never hardcode pixel offsets against screen coordinates elsewhere.
Zoom In/Out/Reset buttons + Ctrl+scroll (wheel listener, `passive:false`
+ `preventDefault` to block native page zoom) + Ctrl+=/-/0.
Pan: Alt+drag or middle-click drag (`startPan/updatePan/endPan`, ~L873,
short-circuits at the top of `onDown`/`onMove`/`onUp` before any tool
logic runs) or arrow keys (40px, 120px w/ Shift) via `canvasWrap.scrollLeft/Top`.

**The browser's own page zoom is switched off** (2026-08) — a pinch used to
scale the entire document, so the toolbar, the floating panels and the layers
sidebar grew along with the drawing. Only the canvas should zoom. Three
independent pieces do it, because no single one covers every engine; treat
them as one unit:

1. `<meta name="viewport" … maximum-scale=1, user-scalable=no …>` — Android
   Chrome and friends.
2. `html,body{ touch-action: pan-x pan-y }` — naming only the pan values
   drops pinch-zoom *and* double-tap zoom for every descendant, while
   one-finger scrolling inside `#canvasWrap` / `#sidebar` / `.panelBody`
   still works. `#overlayCanvas` and `.panelHead` keep their stricter
   `touch-action:none`; the intersection is still `none`, so nothing there
   changes.
3. `gesturestart` / `gesturechange` / `gestureend` → `preventDefault()` on
   `document` (§ Zoom in the script) — iOS Safari ignores `user-scalable=no`
   and drives page zoom from these non-standard events. `preventDefault`
   here does not affect Pointer Events, so the canvas pinch is untouched.

A pinch on the checkered padding around the image never reaches
`#overlayCanvas`, so with page zoom gone it would do nothing at all. A small
zoom-only pinch handler on `#canvasWrap` (`wrapPointers`/`wrapPinch`, § Zoom)
covers that case; it deliberately does **not** move `scrollLeft/Top`, because
`touch-action` still lets the browser scroll that container natively and doing
both would pan at double speed. The `#overlayCanvas` pinch does pan by hand —
it must, `touch-action:none` there leaves no native scrolling to inherit.

Verified with CDP-synthesized pinches on an emulated Pixel 5: a control page
zooms to `visualViewport.scale` 2.5, editor.html stays at 1 for a pinch on the
toolbar and on the sidebar with the canvas zoom untouched at 44%; a pinch over
the image zooms the canvas 44%→353% at page scale 1; a pinch on the padding
zooms 44%→177%; one-finger scroll of `#canvasWrap` still moves it (0→120px);
one-finger touch draw still creates a layer.

## Export

- `renderComposite(w, h, opts)` (~L2122) — the one function that draws
  background+layers at ANY target size, by `ctx.scale()`-ing the context
  rather than touching per-layer coords. Both single-image save and
  multi-size export call this.
- Save image: `renderComposite` at native size → PNG.
- Save all sizes: `qualifyingSizes()` (~L2156) filters the fixed
  `SIZE_PRESETS` list (320×240 … 4096×2160) to those ≤ current canvas's
  larger dimension, matching current orientation; suffix is always the
  *larger* number of the preset pair. Files bundled into one `.zip` via a
  ~90-line hand-rolled STORE-only (uncompressed) zip writer (`makeZip`,
  `crc32`, ~L2172-2247) — no library, because multiple simultaneous
  `<a download>` clicks get blocked/nagged by browsers. JPG export force-
  fills white first if canvas would otherwise be transparent (JPG has no
  alpha).

## Responsive UI

Root `font-size: clamp(14px, 10px + 0.4vw, 26px)`; nearly every toolbar/
sidebar/modal CSS value is `rem`, not `px`, so the whole chrome scales
together with viewport width (verified 14px→26px root across 900px→4K).
If you add new toolbar UI, size it in `rem` (rough conversion used
throughout: `px/14`), not `px`, or it won't scale on large monitors.
**Exception:** inside the `(hover:none) and (pointer:coarse)` touch block,
sizes are deliberately `px` — `rem` there collapsed to ~34px tall buttons
because the root font-size floors at 14px on narrow phones, below the 44px
touch-target floor.

## Mobile / tablet

Works on phones and tablets. Key pieces, all easy to break accidentally:
- `<meta name="viewport" content="width=device-width, initial-scale=1,
  maximum-scale=1, user-scalable=no, viewport-fit=cover">` — without
  `width=device-width` mobile browsers lay out at 980px and shrink-to-fit,
  making everything unusably tiny; `maximum-scale`/`user-scalable` are the
  page-zoom lock described in § Zoom / Pan (the trade-off is deliberate: the
  browser's magnify-the-whole-page gesture is gone, the canvas has its own
  zoom, and the chrome scales with viewport width instead).
- `#overlayCanvas { touch-action: none; }` — **critical.** Without it the
  browser claims a one-finger drag as a page pan and fires `pointercancel`
  mid-stroke, so drawing silently fails on real devices (note: an emulator
  will still appear to work, so this can't be caught by emulation alone).
- All input goes through **Pointer Events** (`pointerdown/move/up/cancel`
  on `#overlayCanvas`, ~L1846), not mouse events, so mouse/touch/pen share
  one path. `setPointerCapture` keeps the stream on the canvas.
- Gestures: 1 finger = draw/select; 2 fingers = pinch-zoom + pan
  (`pinchState`, `pinchCenterAndDist()`). Second finger landing aborts any
  in-progress draw so a pinch never leaves a stray half-shape; the gesture
  stays latched until *all* fingers lift so releasing one doesn't start
  drawing with the other. Double-tap ⇒ `onDblClick` (touch doesn't fire
  `dblclick` reliably) for editing text / rect labels. A pinch on the
  checkered padding *around* the image zooms too, via the separate zoom-only
  `#canvasWrap` handler (§ Zoom / Pan). A pinch on the toolbar, the panels or
  the layers sidebar now does nothing at all — that is the point.
- **Chrome layout (2026-08 rework).** The toolbar used to hold everything in
  one row: on phones and tablets that meant `overflow-x:auto`, so reaching a
  tool was a swipe through nine other buttons. It is now split in three:
  - `#toolbar` keeps only **document-level** actions (open / new / save /
    save-all-sizes, zoom, screenshot / record, the panel toggles). It
    **wraps**, never scrolls — 1 row ≥1280px, 2 rows on a 390px phone
    (~107px). `@media (max-width:900px)` hides `.tlabel` so it's icon-only.
  - `#toolsPanel` — the drawing tools, in three captioned 4-up grids:
    **Basic** (Select/Text/Draw/Highlight), **Shapes**
    (Line/Rect/Ellipse/Rhombus), **Arrows** (Arrow/Spline). All ten are on
    screen at every viewport, no scrolling.
  - `#selectionPanel` — every per-element property (font/size/bold, stroke
    colour + width, fill, corner radius, head size, sloppiness, opacity,
    delete).
- **Buttons are two spans**, `<span class="ticon">` + `<span class="tlabel">`,
  so the label can be dropped on narrow screens while the icon stays. The
  i18n values are therefore **label-only** — the icon lives in the markup.
  Anything relabelling a button at runtime must use `setBtnLabel()` /
  `setBtnIcon()` (Utilities); a bare `btn.textContent = …` wipes the icon
  span out. That bit the Record button, which swaps ⏺→⏹ and back.
- **Panels are draggable** (`makePanelDraggable`, ~L2330). The `.panelHead`
  needs `touch-action:none` for the same reason `#overlayCanvas` does —
  without it touch drags die on `pointercancel`. `placePanel()` is the only
  place that writes `left`/`top`: **it keeps the whole panel inside the
  viewport** — all four edges, not just the header — and sets `max-height`
  from the room left below so `.panelBody` scrolls instead of overflowing.
  Call it after anything that changes a panel's height —
  `syncSelectionPanel()` does. `.panel` also carries
  `max-width:calc(100vw - 1.5rem)` so the fixed panel widths can't exceed a
  narrow phone screen and make a full fit impossible.
  **Don't relax this back to "keep 72px visible"** (the pre-2026-08 rule):
  the sliver left over after a drag off the left edge is the *right* end of
  the header, which is only the collapse/close buttons — and the drag
  handler ignores buttons, so the panel became unreachable for good. Stale
  off-screen positions saved by that build are rescued on load:
  `restorePanels()` re-clamps and writes the corrected position back.
- Position / collapsed / hidden state persists per browser under
  `scula:im-panels` via the shared async `store`. `resetPanels()` (⤢ in the
  toolbar) restores defaults — the escape hatch if a panel ends up somewhere
  useless. `defaultPos()` puts the properties panel on the opposite side
  when the canvas area is wide enough for both, otherwise stacks it under
  the tools palette; on ≤720px it also starts **collapsed**, since two
  expanded panels don't fit a phone.
- **`syncSelectionPanel()`** (~L2450) decides which `.selRow`s are visible:
  from the selected layers' types, or — with nothing selected — from the
  active tool, since the controls then set the defaults for the next shape.
  Select tool + empty selection falls back to `DEFAULT_ROWS`. It is called
  from `renderAll()`, so any selection change already refreshes it.
- `@media (max-width:720px)`: layers sidebar moves below the canvas
  (`#main{flex-direction:column}`, capped `max-height:26vh`) instead of
  eating canvas width; keyboard-shortcut `#hint` hidden.
- `@media (max-width:520px)`: tool captions drop to icon-only so the palette
  stays ~11rem and leaves real canvas visible.
- Screenshot/Record depend on `getDisplayMedia`, which iOS Safari and most
  mobile browsers don't implement at all — platform limitation, not ours.
  The app already alerts rather than failing silently.
- Keyboard-only affordances (Ctrl+scroll zoom, Alt+drag pan, arrow-key pan,
  all letter shortcuts) are simply unreachable on touch; the pinch gesture
  and on-screen zoom buttons are the touch equivalents.

Verified on emulated iPhone 13 / Pixel 5 / iPad Pro 11: touch drag creates
shapes, pinch zoomed 68%→340% with zero stray layers, 44px buttons, no page
overflow — and desktop (1600px) regression-checked afterward (sidebar still
right-side, mouse draw/text/pan/zoom/undo/save all intact).

Panel rework re-verified at 390×844, 820×1180 and 1600×900: zero horizontal
overflow, all 10 tools inside the viewport at every size, both panels fully
on screen, touch-drag moves a panel by exactly the gesture delta, a wild
drag clamps back on screen, position survives reload, `resetPanels()`
restores defaults, and (2026-08 bounds fix, re-verified at those same three
sizes) a drag 3000px past any edge or corner leaves every panel edge inside
the viewport, the panel is still draggable back afterwards, collapse/expand
at the bottom edge stays in bounds, shrinking the window pulls the panels
in, and a stale off-screen saved position is rescued on load, ro↔en keeps icons and diacritics, and a stroke-width
change from the panel still repaints the canvas (dark-pixel count 3.7k→15k
on a selected rect).

## Known traps already hit and fixed (don't reintroduce)

- **Flex-centering + overflow**: `#canvasWrap` used to be
  `display:flex; align-items:center; justify-content:center` — once
  zoomed-in content became taller/wider than the wrapper, the "centered"
  overflow extended *above/left* of the scrollable area and became
  genuinely unclickable (not just visually clipped — `getBoundingClientRect`
  lied about what was interactable). Fixed by dropping the centering and
  using `margin:auto` on `#stage`/`#emptyState` instead — centers when
  content fits, degrades to normal top-left scrollable behavior when it
  doesn't. If you touch `#canvasWrap` layout, keep this pattern.
- **Detached `<video>.play()` hangs forever** if the element isn't
  attached to the DOM when you `getDisplayMedia()` into it (screenshot
  and live-recording code both attach off-screen via
  `position:fixed;top:-9999px` rather than leaving it detached, and await
  `onloadedmetadata` before `.play()`).
- **Mousedown focus stealing**: without `e.preventDefault()` in `onDown`,
  the browser's default post-mousedown focus handling silently steals
  focus back from a just-created `<textarea>` (text tool), making typing
  impossible. Already handled — don't remove that `preventDefault()`.
- **Double-rendering during text edit**: `renderBase()` explicitly skips
  drawing the layer currently being live-edited (`state.editingLayerId`)
  since the floating `<textarea>` already shows it.
- **Unscoped `.swatch` selectors**: color palette and fill palette both
  use `.swatch` — deselect-all-then-select-one logic must be scoped to
  `#palette .swatch` / `#fillPalette .swatch` respectively or they clobber
  each other.
- **Font-load race**: custom `@font-face` fonts only fetch on first
  *use*, so the very first draw with a not-yet-used font silently falls
  back and never redraws once the real font arrives. Fixed by
  force-`document.fonts.load()`-ing all 9 on startup, and again on the
  font-select `change` handler as a belt-and-braces re-render-once-loaded.
- **Headless Chromium cannot decode `getDisplayMedia`/`<video>` streams**
  at all — this is a testing-environment limitation, not an app bug. Any
  automated test of screenshot/recording needs a real (headed) browser
  (Xvfb + `headless:false` works fine in a sandboxed Linux CI box).

## Testing approach used throughout

No test framework — ad hoc Playwright (Python) scripts per feature,
plus pixel-level assertions (read canvas via
`canvas.getContext('2d').getImageData()` or `toDataURL()` → PIL) rather
than trusting visual screenshots alone. For anything touching
screen-capture/recording, launch **headed** (`headless=False`) under Xvfb
(`Xvfb :99 -screen 0 1280x900x24`, `DISPLAY=:99`) since headless Chromium
can't decode media streams. Recorded video output was validated with
`ffprobe`/`ffmpeg` (codec, duration, extracted frames) and Python's
`zipfile` module (CRC integrity) for the zip export — not just "did a
file download."

## Not yet implemented / possible next asks

- No project save/load (JSON serialize `state.layers` + canvas source
  would be the natural extension — nothing currently persists across
  page reloads).
- No live-audio monitor volume/mute *during* recording (only muted
  hidden `<video>`; volume/mute UI exists only in the post-recording
  review modal).
- No text-in-ellipse/rhombus (rect is the only shape with embedded text).
- Group rotation rotates members in place, not orbiting around the
  group's shared center.

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

Structure: `<style>` (L15-406) → the shared nav block (L409-1052) → HTML
markup (L1058-1334) → `<script>` IIFE (L1335-4053). Everything is one
closure; no modules, no framework. Line numbers below are approximate
(current file ≈4055 lines) and several predate later edits — search by
function name, and see `docs/MAP.md` for anchors that are kept current.

## Mental model

Two stacked `<canvas>` elements inside `#stage`:
- `#baseCanvas` — the actual content (background + every layer). This is
  what gets exported.
- `#overlayCanvas` — selection box, resize/rotate handles, in-progress
  drag previews. Never exported, purely UI chrome. Pointer events are
  listened for one level up, on `#canvasWrap` (see § Zoom / Pan), so a
  finger on the checkered padding is handled too; a single-pointer gesture
  over the drawing is what reaches `onDown`/`onMove`/`onUp`.

`state` (plain object, ~L428) holds everything: current tool, style
defaults (color/fill/stroke/font/opacity/roughness/etc — these double as
"defaults for next new shape" AND get live-applied to the current
selection when changed), `state.layers` (the document), zoom/pan, and
canvas readiness/mode flags. `baseImage` (an `Image` or `null`, ~L467) and
`state.bgFill` (hex color or `null`=transparent) together describe what's
"behind" the layers — see `renderBase()` (~L1387).

Render pipeline: `renderAll()` = `renderBase()` + `renderOverlay()` +
`renderLayerList()`. `renderCanvasFrame()` skips the (expensive) layers
panel rebuild — used by the 60fps live-recording loop.

**Undo/redo contract: mutate `state.layers`, then call `pushHistory()`,
then `renderAll()`** — in that order, which is what all ~20 call sites do.
`pushHistory()` puts `committed` (the drawing as it was *before* your
change) on the undo stack and takes a fresh copy; it is not a snapshot of
what you just made. Getting that backwards is what made undo one step
behind until 2026-08 — the first Ctrl+Z restored the state the app was
already in, and the session's first action could never be undone. Calls
that turn out to have changed nothing (a click that only selected, a drag
too small to become a shape) are detected by comparing the serialized
layers and cost no undo step. `resetHistory()` is the one way to clear the
stacks; `beginEditing()` calls it for every new canvas/image.

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
| `spline` | `color, strokeWidth, fill, points[], closed, tension` | Editable curve. `points[]` = `{nx,ny,corner}` normalized 0..1 within bbox; the curve is re-derived from them on every repaint. No `roughness`. See "Spline curve" below. |
| `polyline` | same as `spline` (`tension`/`corner` unused) | The same shape with straight spans. Shares every function with `spline`; only `splineSegments()` branches on the type. See "Spline curve" below. |
| `highlight` | `color, points[]` (thickness = `l.h`) | Horizontal-only band (drag locks to start Y). Thickness comes from `state.highlightSize` / the `#rowHiSize` slider — **not** the text "Size" field, which it used to borrow. Rendered with `globalAlpha=0.4*layerOpacity` + `multiply` blend. |
| all shapes except text, spline and polyline | `roughness, seed` | Sloppiness (see below). |

Group = shared `groupId` string; no nested groups. Selecting one member
selects all (`groupMembers()`, ~L1513).

## Tools (`state.tool` values, toolbar buttons `data-tool="…"`)

`select, text, rect, ellipse, rhombus, pencil, arrow, splineArrow, line,
highlight, spline, polyline`. Keyboard: `v,t,r,o,d,p,a,s,l,h,c,g`. Adding a new shape tool
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

## Spline curve

The `spline` and `polyline` types — the shapes that are **editable after they
are drawn**. Everything for both lives in one block of the script
(§ "Spline curve + polyline", after Rendering); `docs/MAP.md` has a
function-by-function table.

**`polyline` is `spline` with straight spans.** Same vertex list, same box
re-fitting, same dragging / inserting / removing / closing, same hit-testing,
same placing mode; `splineSegments()` is the only function that asks which
type it has, and lays each span's control points on the chord at its thirds
instead of on the Catmull-Rom tangents. Everything else in the app asks
`isVertexShape(l)`. Two consequences: `tension` and a vertex's `corner` flag
mean nothing for a polyline (every joint is already sharp, so the Curve slider
and the Corner button are hidden for it, and double-clicking one of its
vertices does nothing), and any fix to vertex behaviour lands on both shapes
at once. Keep it that way — do not fork the block.

**What it is.** A Catmull-Rom spline through the layer's vertices, converted
to cubic Beziers so the canvas draws the real curve rather than a chain of
sampled segments. Two decisions carry the "smooth, jitter-free" requirement:

- **Centripetal parametrisation** (`SPLINE_ALPHA = 0.5`) rather than the
  textbook uniform one. Uniform Catmull-Rom overshoots into a cusp or a small
  self-intersecting loop whenever vertices bunch up — which hand-placed and
  hand-dragged points reliably do. Centripetal provably cannot, at any
  spacing. Measured on the cluster case in `tests/spline.js`: worst stray from
  the polyline 20.3px uniform vs 4.8px centripetal. The tangents are therefore
  the **non-uniform** Catmull-Rom form; the familiar `(p2-p0)/2` is only
  correct for evenly spaced knots, which is exactly what this gives up. (It
  does reduce to `(p2-p0)/2` when spacing happens to be even.)
- **No smoothing pass and no roughness.** Unlike `freehand` / `splineArrow`,
  nothing here runs through `smoothPoints()` or the hand-drawn wobble, and
  `spline` is deliberately absent from `rowRough` and from the sloppiness
  handler's type filter. The shape is meant to be exact and re-editable. Don't
  "complete" the sloppiness list by adding it.

It does still carry its incoming slope a little past a shoulder — an arch
through four evenly spaced points rises ~9% of its climb above the two top
vertices. That is what an interpolating spline does and what makes it look
drawn rather than folded; it is not jitter. `l.tension` (the "Curve" slider)
scales both tangents, so 0 collapses the whole thing to the straight polyline.

**Two invariants.**

1. **`setSplinePoints(l, pts)` is the only writer of `l.points`.** It re-fits
   the bounding box around the new vertices and re-normalises them. The
   correction at its end is the subtle part: the box's centre is also the
   rotation pivot, so moving one vertex moves the pivot and every *other*
   vertex would swing across the canvas. Since `rotate(q, c) - rotate(q, c')`
   works out to `(I - R)(c - c')` for any `q`, that shift is the same for all
   of them and is applied once, to the box. `tests/spline.js` checks it on a
   30°-rotated curve. Never assign `l.points` directly.
2. **Placing one lives in `state.pendingSpline`, not `state.drag`.** Every
   other create-* tool is one drag; this is a run of clicks, so it needs state
   that survives between them. It only reaches `state.layers` in
   `finishSpline()`. Consequences worth knowing: `renderOverlay` draws it via
   `pendingSplinePreview()` (a copy, so the span trailing the cursor never
   becomes a real vertex); the rubber band needs its **own** `pointermove`
   listener because the gesture layer only tracks pointers that are down; and
   `cancelActiveDraw()` calls `undoPendingSplineTap()` so the first finger of
   a pinch doesn't leave a stray vertex behind — the curve itself survives the
   pinch, because it is work, not a gesture.

**Finishing** is double-click/tap, Enter, clicking the first vertex (which
also closes the path — the way a closed polygon is drawn), or reaching for
another tool. Escape throws it away.
The double-click case works because `addPendingSplinePoint()` refuses a point
within the same slack `maybeDoubleTap()` uses to call it a double-click, so
the second tap of the pair is dropped rather than left as a duplicate vertex.

**Editing** (select tool, shape selected): drag a vertex; double-click one to
flip it between smooth (circle handle) and corner (square handle — a
polyline's are always square); double-click the curve to insert a vertex
where it was clicked; Ctrl/Cmd+click or Delete to
remove one. **Alt is not available** — the gesture layer claims Alt+drag for
panning before `onDown` ever runs. Touch has none of these modifiers, which is
why the selection panel's **Points** row exists: it acts on `state.vertexSel`,
the vertex last touched, read only through `pickedVertex()`.

`hitLayer()` tests the shape itself (`nearestOnSpline`) rather than the padded
bounding box every other stroke shape uses — an open curve's box is mostly
empty air, and a click on that air should reach whatever is behind it.

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

**The view is a transform of `#stage`, not a scroll of `#canvasWrap`**
(rewritten 2026-08). `#canvasWrap` is `overflow:hidden; touch-action:none`;
`#stage` sits at its rest position (`margin:auto` — centred while the
drawing fits, flush top-left once it doesn't) and carries
`translate3d(panX, panY, 0)`. Nothing in the app touches `scrollLeft` /
`scrollTop` any more, and nothing should: sharing the gesture with the
browser's own scrolling is exactly what made panning lag, drift and stick
at the edges.

Two numbers describe the view, both in `state`:

- `state.zoom` — user multiplier, clamped 0.1 … 8. `state.fitScale` (auto,
  recomputed by `setupStage()` on load and on resize) × `state.zoom` =
  `viewScale()`, the actual CSS display scale. The zoom label shows the
  product, so at a 47% fit the 8× ceiling reads "372%".
- `state.panX` / `state.panY` — CSS pixels of translate, clamped by
  `applyPan()`.

`applyZoomDisplay()` only sets `style.width/height` on `#stage` and both
canvases; the canvas *pixel buffers* always stay at `naturalW/H`.
`canvasPoint()` divides by the same effective scale and reads
`getBoundingClientRect()`, which already includes the transform, so drawing
and hit-testing are zoom/pan agnostic — never hardcode pixel offsets against
screen coordinates anywhere else.

The whole thing rests on two functions (§ Viewport, ~L2004):

```js
clientToContent(cx, cy)      // screen point  -> point of the drawing under it
panContentTo(c, cx, cy)      // move the view so drawing-point c sits at (cx,cy)
```

Anchored zoom is those two in sequence — `setZoomAt(z, x, y)` remembers what
is under `(x, y)`, changes the zoom, and puts it back. A pinch is the same
thing driven continuously: `beginPinch()` stores the drawing-point between
the two fingers, and every move re-pins that point under the current
midpoint. One call therefore does both jobs — spreading the fingers zooms,
sliding them pans, and any mix of the two keeps the pinched zone under the
fingers. Do not "fix" a pinch by adding a separate delta-pan on top; that
double-counts and is what the old code got wrong.

`applyPan()` clamps: half of whichever is smaller — the drawing or the
viewport — must stay on screen. It derives the rest position by measuring
(`rect.left - appliedPanX`) rather than assuming, because flexbox centres
the stage while it fits and start-aligns it once it overflows, and the clamp
has to be right in both. `#stage` is `flex:0 0 auto` for the same reason a
shrinkable stage stopped growing at the wrapper's width while the drawing
inside it kept scaling.

Inputs, all of them ending in `setZoomAt` / `panContentTo` / `panBy`:

| Gesture | What it does |
|---|---|
| Pinch (2 fingers, anywhere in the canvas area) | zoom + pan, anchored between the fingers |
| 1 finger on the drawing | the current tool |
| 1 finger / mouse drag on the checkered padding | pan (a tap there with the select tool deselects) |
| Alt+drag, middle-drag, Space+drag | pan |
| Wheel / two-finger trackpad scroll | pan (Shift = horizontal) |
| Ctrl/Cmd+wheel (= trackpad pinch) | zoom at the pointer |
| Arrow keys (Shift = 120px) | pan |
| Zoom −/+ buttons, Ctrl+= / Ctrl+− | zoom 1.25× around the centre of the view |
| Zoom % button, Ctrl+0 | back to fit, centred, pan reset |

**The browser's own page zoom is switched off** (2026-08) — a pinch used to
scale the entire document, so the toolbar, the floating panels and the layers
sidebar grew along with the drawing. Only the canvas should zoom. Three
independent pieces do it, because no single one covers every engine; treat
them as one unit:

1. `<meta name="viewport" … maximum-scale=1, user-scalable=no …>` — Android
   Chrome and friends.
2. `html,body{ touch-action: pan-x pan-y }` — naming only the pan values
   drops pinch-zoom *and* double-tap zoom for every descendant, while
   one-finger scrolling inside `#sidebar` / `.panelBody` still works.
   `#canvasWrap` (and `#overlayCanvas`, `.panelHead`) go further with
   `touch-action:none`, because every gesture over the canvas is the app's.
3. `gesturestart` / `gesturechange` / `gestureend` → `preventDefault()` on
   `document` (§ Viewport in the script) — iOS Safari ignores
   `user-scalable=no` and drives page zoom from these non-standard events.
   `preventDefault` here does not affect Pointer Events, so the app's own
   gestures are untouched.

Verified with CDP-synthesized pinches on an emulated phone and a desktop
window: a pinch over the image and a pinch on the checkered padding both zoom
the canvas with the pinched point staying put to within ~1 canvas pixel, at
page scale 1; a two-finger slide moves the drawing by exactly the distance
the fingers travelled; ctrl+wheel zooms at the mouse; one-finger scroll of
the layers sidebar still works; and a shape drawn after any of it lands under
the finger that drew it (checked with `getImageData`, not screenshots).

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
- `#canvasWrap { touch-action: none; }` and `#overlayCanvas { touch-action:
  none; }` — **critical.** Without them the browser claims a one-finger drag
  as a page pan and fires `pointercancel` mid-stroke, so drawing silently
  fails on real devices (note: an emulator will still appear to work, so this
  can't be caught by emulation alone). The wrapper needs it as well because
  the padding around the image is now a pan surface of ours, not a scroller.
- All input goes through **Pointer Events**, in **one gesture layer**
  (§ Pointer interaction, ~L3312): `pointerdown` on `#canvasWrap`,
  `pointermove` / `pointerup` / `pointercancel` on `window`. Taking the
  up/cancel from `window` is not optional — a finger that lifts somewhere
  other than where it landed (off the image, past the window edge, or
  cancelled by the browser) used to leave a stale entry in the pointer map,
  and from then on every tap was read as the second finger of a pinch:
  the app looked frozen, nothing could be drawn, only a reload fixed it.
  `canvasWrap.setPointerCapture` keeps the stream coming, and a primary
  pointer going down clears anything stale before it can block.
- Gestures: 1 finger on the drawing = draw/select; 1 finger on the padding =
  pan; 2 fingers anywhere = pinch (zoom + pan, anchored between them, see
  § Zoom / Pan). A second finger landing aborts any in-progress draw
  (`cancelActiveDraw`) so a pinch never leaves a stray half-shape or an empty
  text box; lifting one of two continues as a one-finger pan rather than
  suddenly drawing. A pinch on the toolbar, the panels or the layers sidebar
  does nothing at all — that is the point.
- **Double-tap / double-click** is counted in `maybeDoubleTap()`, for every
  pointer type, not left to the native `dblclick`: touch never fires it
  reliably, and pointer capture retargets the compatibility mouse events
  (`mousedown`/`click`/`dblclick`) to the capture element, so a `dblclick`
  listener on `#overlayCanvas` silently stops firing. Both halves must be
  taps — a pointer that travelled more than a few px is a drag and resets the
  counter, otherwise finishing a shape and tapping beside it popped an editor
  open.
- **Chrome layout (2026-08 rework).** The toolbar used to hold everything in
  one row: on phones and tablets that meant `overflow-x:auto`, so reaching a
  tool was a swipe through nine other buttons. It is now split in three:
  - `#toolbar` keeps only **document-level** actions (open / new / save /
    save-all-sizes, zoom, screenshot / record, the panel toggles). It
    **wraps**, never scrolls — 1 row ≥1280px, 2 rows on a 390px phone
    (~107px). `@media (max-width:900px)` hides `.tlabel` so it's icon-only.
  - `#toolsPanel` — the drawing tools, in three captioned 4-up grids:
    **Basic** (Select/Text/Draw/Highlight), **Shapes**
    (Line/Spline/Polyline/Rect/Ellipse/Rhombus), **Arrows** (Arrow/Curved).
    All eleven are on screen at every viewport, no scrolling.
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
  using `margin:auto` on `#stage`/`#emptyState` instead. The wrapper no
  longer scrolls at all (the view is a transform, § Zoom / Pan), but keep the
  `margin:auto` pattern: it is the rest position the pan is measured from.
- **A flex item shrinks unless told not to**: `#stage` without
  `flex:0 0 auto` stopped growing at the wrapper's width, while the two
  canvases inside it (absolutely positioned, sized in CSS px) kept scaling
  with the zoom. Everything derived from the stage's box — the drop shadow,
  the centering, and any pan maths that reads its rect — was wrong past that
  point, while the drawing still *looked* right.
- **Pointer capture retargets the compatibility mouse events**: with
  `canvasWrap.setPointerCapture()` in the gesture layer, `mousedown`,
  `click`, `dblclick` and `auxclick` for that pointer fire at the wrapper,
  not at `#overlayCanvas`. Any listener for those has to sit on the wrapper
  (or be counted from pointer events, as `maybeDoubleTap` does).
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

No test framework — ad hoc Playwright scripts per feature (the accumulated
ones live in `tests/`, Node; earlier ones were Python),
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

# task-01 — implementation report

## Round 4 — bug-1: the ◇ Diagram and ✏ Sketch modals could be stacked

Commit `08fa279` (code + FEATURES § U), then the MAP row + this report.

**The bug.** Neither modal trapped focus, so Tab walked out onto the page toolbar behind it.
`openDiagram()` only checked `dg.open` and `openSketch()` only checked `sk.open`. As a result,
Enter on the other toolbar button opened a second full-screen modal on top of the first.

### What changed

- **`js/markdown/diagram.js`**
  - `openDiagram()` now also returns while `skIsOpen()` is true. The call is guarded with
    `typeof`, the same way `events.js` already guards it.
  - New `dgTrapTab(modal, e)` handles Tab / Shift+Tab without Ctrl, Meta or Alt:
    - It collects the modal's tabbable controls: `tabIndex >= 0`, not disabled, and rendered
      (`getClientRects().length`), so anything `hidden` is skipped.
    - Tab on the last control goes to the first. Shift+Tab on the first goes to the last.
    - If focus is on something outside that list, it moves to the first control (or the last on
      Shift+Tab).
    - It returns `true` when it handled the key.
  - `dgKeyDown` calls `dgTrapTab` first. The exception is Tab on the stage of a mind map: there
    Tab still means "add a child", as in rounds 1–3.
  - `dgInit` adds a capturing `keydown` listener on `document`. When the diagram is open and the
    key's target is outside the modal, it runs the trap. This covers focus left on `<body>`, for
    example after a click on empty bar space.
- **`js/markdown/sketch.js`**
  - `openSketch()` returns while `dgIsOpen()` is true, and also while a picture is still loading
    (new `sk.loading` flag, reset in a `finally`).
  - After the picture has loaded, it checks `dgIsOpen()` again and gives up if the diagram opened
    during the load. Otherwise that async gap could still stack the two modals.
  - The modal's `keydown` calls `dgTrapTab(modal, e)` first. It gets the same capturing
    `document` listener for focus left outside it.
  - `sketch.js` already loads after `diagram.js`, so `dgTrapTab` is always defined when it runs.
- **`docs/FEATURES.md` § U**: after the key table, one paragraph on "only one modal at a time"
  and the Tab trap.
- **`docs/MAP.md`**: `dgTrapTab` added to the `diagram.js` row.

### Decisions

- **No feedback when an open is refused.** It happens silently. With the trap in place, the other
  toolbar button can no longer be reached from inside a modal, so a toast would never be seen in
  practice.
- **Only Tab is trapped.** A `focusin` pull-back would also catch other ways of leaving the modal.
  I didn't add one because it could fight with UI that `ScuLaFolder.save` may show during a
  download. Clicks can't reach the page anyway, since the modals cover the viewport.
- **Mind-map stage.** From the mind-map stage, Tab cannot walk out to the bar buttons, because Tab
  there adds a node. That was already true before this change. Shift+Tab also adds a node there
  (existing behaviour, unchanged).

### Not done / concerns

- Following the orchestrator's instruction, I did not run or write tests or open a browser. The
  only check was `node --check` on both files, and both parse.
- If focus is left on `<body>` inside an open modal, keys other than Tab (Esc, Ctrl+Z) still don't
  reach the modal's handler, and `events.js` swallows them. That was already so before this
  change and is outside bug-1.
- Suggested checks for the tester:
  - Diagram open, Tab repeatedly: focus never lands on `#btn-sketch`.
  - Call `openSketch()` directly while the diagram is open: `#sketch-modal` stays hidden. Do the
    same the other way round.
  - Shift+Tab from the first bar control lands on the last visible control.

---

# Round 3

Spec: `docs/tasks/01-for-index-html-page-please-add/spec.md` (round 3).
Commits: `8a036d0` (diagram.js), `764876c` (sketch.js + page wiring),
the docs commit after it, and this report.

## Up front: what I did not do

- **I did not run `/apptest diagram`, and I did not extend `tests/diagram.js` or add `tests/sketch.js`.**
  The spec's § 2 step 1 and the "implementer's own tests" item in § 10 ask for both. The task
  instruction from the orchestrator says: *"Do not run or write tests yourself — that is the tester's
  job."* The orchestrator's instruction is the more direct and more recent one, so I followed it.
  That leaves these items open for the tester:
  - § 2 step 1: the report was supposed to include the `/apptest diagram` output. It does not.
  - § 2.3: `/verify` and the codecopy / timeline / mdundo / cause / paste suites were not run.
  - § 10: none of the listed `tests/diagram.js` extensions or `tests/sketch.js` checks exist yet.
- The only checks I ran were `node --check` on each changed script. All of them parse.
- I did not open the page in a browser. Everything below was checked by reading the code, not by
  watching it run. Expect first-run defects in the pointer interactions.

## What changed, file by file

### `js/markdown/diagram.js`

I kept the § 12 starting state (`DG_EDGE_RE`, `DG_MM_ATTR_RE`, `dgMmNode`, the sequence
parser/serializer, `DG_PORTS`/`DG_PORT_ORDER`/`DG_DIR`, `dgParseKind`) exactly as it was, and
built on top of it.

- **Ports (§ 3.1–3.2).** `dgPorts(box)` follows the table for every shape. An optional `box.r`
  sets the corner radius: mind-map nodes use 8, the root uses h/2. The radius is clamped to half the
  box, the same way SVG clamps `rx`. `dgAutoPort(box, towards)` returns the nearest port; ties go by
  `DG_PORT_ORDER` (a 1e-6 epsilon, so the earlier port wins an exact tie).
- **Flow edges.** `dgEdgeGeom` now works port to port, with pinned or automatic ends as § 3.2 says.
  `dgClipT` is deleted; nothing else used it. A self-edge is drawn only when both ends are pinned to
  different ports. It is a cubic that leaves each port 40 px along the port's outward direction.
  Arrowheads on that curve take their angle from the control points. The label sits at the curve's
  t = 0.5 point. `dgPathD` builds the straight or cubic `d`.
- **Flow modal (§ 3.4).**
  - A selected node shows 8 `circle.dg-port[data-port]` (r 5).
  - Dragging from a port starts a connector pinned at that end. Dragging from the node body with
    the connect tool starts an automatic one (`dgRubberStart(id, e, port)`).
  - While dragging, `dgTargets` draws `dg-port dg-port-target` circles (r 6, `pointer-events:none`)
    on the node that would receive the drop. The port within 12 screen px gets `dg-port-hot`.
  - Drop resolution is `dgDrop(clientX, clientY, candidates)`: the nearest port within `12/zoom`,
    else the `dgHit` body, else cancel.
  - A selected edge shows `circle.dg-edge-end[data-end]` handles. Dragging one (`dgEndStart` →
    `dgEndDrop`) re-attaches that end and keeps op, colour and label; it is one undo step.
  - `Esc` now cancels any non-pan drag.
- **Mind maps (§ 3.5, § 4).**
  - `dgLayoutMindmap` runs the unchanged automatic layout. It keeps the automatic box as `L.ax/L.ay`,
    then walks pre-order: a node with its own x,y uses it, and a node without keeps its automatic
    offset from its parent. `L.eff` is the effective colour.
  - `dgMmEdgeGeom` applies the automatic side rule, any pins, and the § 3.5 curve distances. With
    e/w ends this reproduces the round-1 curve exactly, because the automatic gap is 56, so
    |dx|/2 = 28 ≥ 20.
  - A selected non-root node shows its 8 dots and two end handles. The `to` handle may only drop on
    that node; the `from` handle only on its parent.
  - Node drag (`mmmove`): 3 px threshold. On start, every node in the dragged subtree gets its current
    position as its own x,y. The dragged node snaps to the 10 px grid and its descendants move by the
    same delta. The drag is one undo step. A drag whose snapped delta is zero is cancelled, so it
    writes no positions.
  - Colours: the swatch sets the selected node's own colour (`dgSetColor`). `#dg-color-auto` clears
    it (`dgMmColorAuto`). The active swatch and the disabled state are kept in `dgState`.
  - `#dg-mm-auto` runs `dgMmAutoLayout`: it clears x/y/pins, keeps colours, is one undo step, and
    fits the view.
  - New nodes are created by `dgMmBlank`, with no x/y.
- **Sequence (§ 5).**
  - `dgSeqSvg` lays the diagram out per § 5.2: box widths, lifeline gaps including the label-width
    rule for adjacent pairs, row heights 44/60/note, numbered circles, the self-loop, and notes
    wrapped at 180.
  - It uses the groups `dg-seq-part`, `dg-seq-msg`, `dg-seq-note-g` and reuses the `dg-edge-*`
    classes. It returns `lay = {parts, labels}` for the modal.
  - `dgSeed('sequence')` produces the seed text through i18n keys.
  - In the modal, the source panel opens automatically for sequence (`dgSourceShow`). Tools, colours,
    the colour-auto button, mind-map tools and Delete are hidden.
  - A participant is dragged sideways (`seqmove`; it gets a `translate` while dragging) and dropped
    by `dgSeqReorder`. Clicking a message or note (`seqclick`, < 3 px) opens `#dg-label-input` over
    its label.
  - `dgBlockAt`, `dgApply`'s fence regex and `dgLoad`/`dgCanon` all accept all three kinds.
- **Download (§ 7).**
  - `dgExportSvg`: its first child is a white rect, then an embedded `<style>` with literal colours.
  - `dgExportPng` renders at 2×.
  - `dgFileName`: `wbSlug(chapter.title, 'diagrama')-word-n.ext`.
  - `dgBlocks` counts n. `dgDownload` saves through `ScuLaFolder.save`. `dgDownloadAt(line, fmt)`
    serves the preview buttons and `dgDownloadModal(fmt)` the modal buttons (new block = count + 1).
- `renderDiagramBlock` is now generic over the three kinds (`dgSvgFor`). It wraps `✎ Edit`,
  `⤓ SVG` and `⤓ PNG` in `.dg-actions`, and it warns about unparsed lines for flow **and** sequence.

### `js/markdown/sketch.js` (new, loaded right after `diagram.js`)

- Public entry points: `openSketch(opts)`, `closeSketch(force)`, `skApply()`, `skIsOpen()` and
  `skImageTokens(text)`. Everything else uses the `sk` prefix.
- **Canvases.** A new sketch is a 1600×1000 white base. An existing picture is drawn at its natural
  size, with the long side capped at 2400. There are two stacked canvases, fitted with the aspect
  ratio kept.
- **Tools.** Pen, highlighter (alpha 0.4, `multiply`, ×3 width, one path per stroke) and eraser
  (`destination-out` on `#sk-ink` only, ×3). The six palette colours, sizes 3/6/12 × f, and undo/redo
  per stroke.
- **Keys.** `P`/`H`/`E`, `Ctrl+Z`/`Ctrl+Shift+Z`/`Ctrl+Y`, and `Esc` to cancel (with a confirm if
  anything was drawn).
- **Pointer.** Pointer capture, mouse button 0 only, and `getCoalescedEvents` when available. A
  second pointer removes the stroke in progress.
- **Apply.** It composites the two canvases, runs the result through `imageBlobToDataUrl`, and makes
  one `setRangeText`. A new sketch becomes `![Schiță n](…)` at the caret, with the § 6.5 newline
  padding. A picture edit replaces the matched token; embeds get alt = file name without extension.
- **Unreadable pictures.** `crossOrigin` is set for http(s) sources and a 1×1 `getImageData` probe
  runs. If the probe fails, the modal does not open and the `skImgBlocked` toast shows instead.
- **✎ button.** `#img-draw-btn` is `position:fixed`. It appears on `mouseover` of a non-diagram
  preview `img`, or on a tap on `(hover:none)` devices. It hides when the pointer leaves the preview,
  on any scroll (a capturing listener on `window`), and when the preview is rebuilt (a
  `MutationObserver` on `#preview`, so `markdown.js`'s `updatePreview` did not need a change).

### `index.html`

- **CSS.**
  - The § 2 fix: `.dg-edge-line:not([stroke])` and `.dg-edge-head:not([fill])`.
  - New rules: `.dg-seq-life`, `.dg-seq-num text`, `.dg-actions`, `.dg-dl` (same visibility rules
    as `.dg-edit`), `.dg-port-target`/`.dg-port-hot`, `.dg-edge-end`, sequence cursors,
    `.sk-stage`, `.img-draw-btn`, and `.dg-btn[hidden]`.
  - `.dg-edit` lost its own absolute positioning; `.dg-actions` now positions all three buttons.
- **Markup.**
  - The `#btn-sketch` toolbar button after `#btn-diagram`.
  - A `sequence` kind button, and `#dg-mm-auto` in `#dg-mm-tools`.
  - `#dg-color-auto` right after `#dg-colors`, and `#dg-dl-svg`/`#dg-dl-png` before the spacer.
  - `#sketch-modal` per § 6.3; its swatches are generated by `sketch.js`. I added `tabindex="0"` to
    `#sk-stage` so it can take focus for the keys.
  - `#img-draw-btn`, and the `sketch.js` script tag.
- The shared nav block was not touched: all edits are outside `<nav id="site-nav">` … end marker.

### Other files

- `js/markdown/markdown.js`: `sequence` is added to the fence dispatch. There is a delegated click on
  `.dg-dl` → `dgDownloadAt`, and a double-click on a `.dg-dl` no longer opens the modal.
- `js/markdown/files.js`: the export CSS gets the `:not([stroke])`/`:not([fill])` fix plus
  `.dg-seq-life {stroke:#888}` and `.dg-seq-num text {fill:#222}`.
- `js/markdown/events.js`: the global keydown handler returns while `skIsOpen()`.
- `js/markdown/i18n.js`: every § 8 key in both languages, with comma-below ș/ț. The `helpBody`
  "Diagrame"/"Diagrams" section gains items for pins, free mind maps, sequence, download and
  sketches.
- **Docs.**
  - `docs/FEATURES.md` § U: retitled; the mindmap attribute grammar; new sub-sections "Ports and
    pins", "Free mind maps", "The ```sequence grammar", "Download", "Sketches"; key-table rows.
  - `docs/MAP.md`: the diagram.js row extended, plus a sketch.js row.
  - `js/markdown/README.md`: a sketch.js row with its load position.
  - `CLAUDE.md`: the index.html table text and the § U routing row.
  - I did not add to CLAUDE.md's tests paragraph, because I wrote no tests.

## Ambiguities and how I resolved them

1. **Tests vs. the orchestrator instruction.** Covered in the first section above.
2. **Target dots on the source node.** § 3.4 shows target dots only on "a node other than the
   source", but the drop rules allow pinning a self-edge between two dots of the source. I show the
   source's target dots only while one of its dots is hot, which means a pinned self-edge is
   possible.
3. **Dropping an end so that `from === to`.** For moving an existing end, I applied the same rule as
   for new connectors: it is kept only when both ends are pinned to different ports; otherwise it is
   cancelled.
4. **Mind-map dots.** § 3.5 shows dots on a selected node, but never says what pressing on one does.
   Pressing on a dot starts a node drag, the same as pressing on the body.
5. **Esc during drags.** `Esc` now cancels any non-pan drag. That covers node, mind-map and
   participant drags as well as connector and end drags; the spec only names connector and end drags.
6. **An empty diagram download** gets a blank 200×60 white SVG/PNG.
7. **Sequence labels with `\n`.** They are drawn on one line, with the newline shown as a space, the
   same way flow edge labels already work. The text still round-trips.

## Concerns / edge cases I could not verify

- **Nothing was run in a browser.** Pointer flows (drop resolution through `elementFromPoint`,
  target dots, end handles, mind-map branch drag, participant reorder, the sequence label click
  leaving focus in `#dg-label-input`) are the most likely places for first-run defects.
- **Old test expectations.** Any `tests/diagram.js` assertion about the old centre-ray endpoint
  coordinates will now fail. § 3.2 expects that; the tester should update those assertions to
  "on the outline ±1 px".
- **Mind-map labels that end in `{…}`.** A label typed so that it ends in a valid attribute block
  (e.g. `Set {1,2}`) will be read back as a position on the next parse. The format has no escape
  for this; the spec does not ask for one.
- **The highlighter's `multiply`.** It blends against the transparent ink canvas, not the picture,
  so over a coloured picture it looks like 40% alpha rather than a true multiply. The saved
  composite matches what is on screen.
- **Matching an embed to its preview image.** For `![[name.png]]`, the preview's `src` is matched by
  "ends with the name". A standard `![]()` matches its raw `src` or `resolveImageSrc(src)`. If
  neither matches, the drawing is inserted at the caret with the `skImgMoved` toast.
- **A pinned port on an edge from the preview text.** Something like `a.x -> b` (an invalid port) is
  not a valid edge line, so it goes to `extra` and triggers the warning.
- `#img-draw-btn` uses `z-index: 60`. I did not check it against every panel's stacking order.

# task-01 (round 3) — Diagrams in the markdown page: connection dots, free mind maps, sequence diagrams, freehand sketches, SVG/PNG download

> This spec **replaces** the round-1 spec (it is in git history, commit
> `3dbe2ed`..`1c0af6f`). Everything round 1 built — ` ```flow ` /
> ` ```mindmap ` blocks, the ◇ Diagram modal, ✎ Edit / double-click — is
> **kept**. The canonical description of what already exists is
> `docs/FEATURES.md` § U and `js/markdown/diagram.js`; read both before
> starting. This spec only states what changes or is added.

## 0. Product decisions (binding — agreed with the product owner)

1. **Keep the existing design.** First re-verify it: run `/apptest diagram`
   (`tests/diagram.js`) and fix every failure before adding anything (§ 1).
2. **8 connection dots** on every flowchart shape **and** every mind-map node:
   the 4 corners and the 4 side midpoints (§ 3.1).
   - Dropping a connector end **on a dot** pins it there. The pin is saved in
     the text and the end stays on that dot when the box moves or resizes.
   - Dropping a connector end **on the box body** leaves the end automatic: the
     app picks the nearest dot and picks again whenever boxes move.
   - Old diagrams (no pins in the text) keep parsing and rendering with no
     change to their text; all their ends are automatic.
3. **Mind maps become free-form:** a node can be dragged; dragging a node
   moves its **whole branch**; a newly added node is placed automatically
   beside its parent; **↺ Auto layout** resets all positions, as **one** undo
   step. Each node can have its **own colour**; a node without one uses its
   branch colour; a colour set on a node applies to that node only (not to
   its children).
4. **Sequence diagram** — new ` ```sequence ` block ("who sends what to
   whom, in order"): participants as boxes along the top with vertical
   lifelines; labelled messages in order, top to bottom; dashed replies;
   self-messages; notes beside a participant; automatic step numbers 1, 2,
   3…. **No** loop / if-else frames. Edited by typing lines with a live
   drawing, plus: drag a participant sideways to reorder, click a message to
   edit its label. Adding messages is done by typing only.
5. **Freehand sketching** reusing Mâzgilește logic: pen, highlighter,
   eraser, 6 colours, 3 thicknesses, undo/redo, touch and stylus. The sketch
   is saved **as a picture in the chapter** (not searchable text — accepted).
   **Any picture already in the chapter** can be opened with a ✎ that
   appears on hover and drawn on; saving replaces that picture in the text as
   **one** markdown undo step.
6. **Download** every diagram as **SVG** or **PNG** (PNG at **2×**), with a
   **white background, dark lines and text, box colours kept**. Buttons in
   the modal **and** on hover over each diagram in the preview. File name
   from the chapter: `Capitol-flowchart-1.png` (§ 7).

## 1. Scope, files, rules

| File | Change |
|---|---|
| `js/markdown/diagram.js` | Ports and pins (flow + mind map), free mind-map positions and colours, the `sequence` kind (parse, serialize, layout, render, modal editing), SVG/PNG export. |
| `js/markdown/sketch.js` | **New.** The freehand sketch modal and the ✎-on-picture flow. Prefix `sk` for every identifier except the public entry points named in § 6. Load it right **after** `diagram.js` (`index.html:4261`). |
| `index.html` | Modal markup additions (§ 4.4, § 5.4, § 7), the new `#sketch-modal` (§ 6), toolbar button `#btn-sketch`, CSS. |
| `js/markdown/markdown.js` | `sequence` joins `flow`/`mindmap` in the fence dispatch (search `mdDiagram`/`renderDiagramBlock`); preview click delegation for the download buttons (§ 7). |
| `js/markdown/files.js` | Export CSS for the sequence classes (§ 5.3) and the `:not([stroke])` fix (§ 2). |
| `js/markdown/events.js` | The global-keydown guard at L31 also returns while the sketch modal is open (`skIsOpen()`). |
| `js/markdown/i18n.js` | New keys, RO and EN (§ 8); `helpBody` "Diagrame"/"Diagrams" section extended with `sequence` and the sketch. |
| Docs | `docs/FEATURES.md` § U (grammar of all three kinds is canonical there; add sub-sections: ports and pins, free mind maps, sequence, download, sketches), `docs/MAP.md` rows for `diagram.js` new entry points and `sketch.js`, `js/markdown/README.md` (load order + row), `CLAUDE.md` index.html table text ("flowcharts, mind maps, sequence diagrams and sketches") and the § U routing row wording, `tests/`-paragraph in CLAUDE.md for the new/extended tests. |

Rules (product code only):
- No new dependency, no library, no build step; must work from `file://`.
- **Do not touch the shared nav block** (`/verify` must show all eight
  identical).
- Chrome colours via theme tokens (`var(--…)`); diagram/sketch colours are
  document data and stay literal hex (as `DG_COLORS` already is).
- Every visible string through `I18N` keys, both languages, Romanian
  diacritics with comma-below ș ț.
- Files are saved only through `ScuLaFolder.save(name, blob)`.
- Every edit to the editor textarea goes through `editor.setRangeText(…)`
  followed by `updatePreview(); updateStatus(); scheduleAutosave();` so it is
  one markdown undo step (FEATURES § K).
- The Tester's Playwright suite under `tests/01-for-index-html-page-please-add/`
  plus its tooling (package.json with a `test` script, playwright.config.*,
  .gitignore entries) is standing team policy and **allowed**; so is
  extending `tests/diagram.js` and adding `tests/sketch.js` (§ 10).

## 2. Step 1 — re-verify what exists (do this first)

1. Run `/apptest diagram`. Every check must pass. Fix product bugs in the
   product; fix a test only if the test is wrong, and say which in your
   report.
2. Known defect to fix now (confirm first with `getComputedStyle`): the
   preview CSS `.dg-edge-line { stroke: var(--text-2) }` and
   `.dg-edge-head { fill: var(--text-2) }` (`index.html` ~L1485) beat the
   renderer's `stroke="#…"` / `fill="#…"` presentation attributes, so a
   coloured edge is drawn grey. Same in the export CSS (`files.js` ~L249).
   Change the selectors to `.dg-edge-line:not([stroke])` and
   `.dg-edge-head:not([fill])` in both places, and use the same pattern for
   every new class below that has a colourable counterpart.
3. `/verify` passes, `tests/codecopy.js`, `tests/timeline.js`,
   `tests/mdundo.js`, `tests/cause.js` pass (their known issues in
   CLAUDE.md "Known issues" excepted).

## 3. Connection dots (flowcharts and mind maps)

### 3.1 The 8 ports — `dgPorts(box)` (public; tests call it)

`box = {shape, x, y, w, h}`; returns
`{n, ne, e, se, s, sw, w, nw}` each `{x, y}` in world coordinates, **all on
the drawn outline**. `cx = x+w/2`, `cy = y+h/2`, `hw = w/2`, `hh = h/2`,
`k = Math.SQRT1_2`.

| shape | n / e / s / w | corners |
|---|---|---|
| `rect`, `text` (and every mind-map node that is not the root) — see note | side midpoints `(cx,y) (x+w,cy) (cx,y+h) (x,cy)` | bounding-box corners `(x,y)` etc. — for mind-map nodes (rx = 8) use the `round` rule with `r = 8` |
| `round` (r = 12), `pill` (r = h/2), mind-map root (r = h/2) | side midpoints | on the rounded corner arc at 45°: `nw = (x + r(1−k), y + r(1−k))`, mirror for the others |
| `ellipse` | side midpoints | `(cx ± hw·k, cy ± hh·k)` |
| `diamond` | the 4 vertices `(cx,y) (x+w,cy) (cx,y+h) (x,cy)` | midpoints of the 4 diamond edges `(cx ± hw/2, cy ± hh/2)` |
| `para` (`s = 0.2h`) | `n = (x + (s+w)/2, y)`, `s = (x + (w−s)/2, y+h)`, `e = (x+w−s/2, cy)`, `w = (x+s/2, cy)` | the polygon vertices: `nw = (x+s, y)`, `ne = (x+w, y)`, `se = (x+w−s, y+h)`, `sw = (x, y+h)` |

Note: `rect` uses rx 2 — treat it as sharp (bounding-box corners).

Port names are the strings `n ne e se s sw w nw`. Outward direction of a
port (used for curves and to pick the head angle): `n (0,−1)`, `e (1,0)`,
`s (0,1)`, `w (−1,0)`, corners the normalised diagonal (e.g. `ne (k,−k)`).

### 3.2 Automatic ends — `dgAutoPort(box, towards)`

Returns the name of the port of `box` nearest (Euclidean) to the point
`towards`; ties broken in the order `n e s w ne se sw nw`.
- **Flow edge**, both ends automatic: `fromPort = dgAutoPort(A, centre(B))`,
  then `toPort = dgAutoPort(B, port point of A)`. One end pinned: the
  automatic end uses the pinned point as `towards`.
- This **replaces** the round-1 centre-ray clipping (`dgClipT`) for edge
  endpoints. Every port is on the outline, so the "endpoint on the target's
  outline ±1 px" test keeps holding; update any test that asserts the old
  exact coordinates, and say so in your report. `dgClipT` may be deleted if
  nothing else uses it.
- Edge not drawn (unchanged rule): `from === to` **with both ends
  automatic**, or the two endpoint points closer than 4 px. A self-edge with
  two different pinned ports **is** drawn: a cubic from port A out along its
  outward direction 40 px and into port B along its outward direction 40 px.
- A flow edge is still a straight segment between its two port points (no
  routing), arrowheads as today.

### 3.3 Flow text format — pinned ports

`DG_EDGE_RE` becomes (normative):
```
^\s*([A-Za-z0-9_-]+?)(?:\.(nw|ne|sw|se|n|e|s|w))?\s*(<->|-->|->|--)\s*([A-Za-z0-9_-]+?)(?:\.(nw|ne|sw|se|n|e|s|w))?\s*(#[0-9a-fA-F]{6})?\s*(?:\|\s?(.*))?$
```
Groups: `from, fromPort, op, to, toPort, color, label`. The edge model gains
`fromPort` and `toPort`, each a port name or `null` (automatic).
Canonical line: `<from>[.<port>] <op> <to>[.<port>][ #RRGGBB][ | label]`,
e.g. `ask.e -> fix.w | nu`. The implementer must check that `a-->b`,
`a -> b`, `a.e->b`, `my-node.se --> x` and every line in the round-1 seed
still parse to the same model as before (ports `null`), and that
`dgSerializeFlow(dgParseFlow(s)) === s` still holds for canonical `s`.
Seeds stay unpinned.

### 3.4 Flow modal behaviour

- The selected node shows **8** `<circle class="dg-port" data-port="ne" r="5">`
  (replacing the current 4). Dragging from a dot starts a connector whose
  `from` end is **pinned** to that port; dragging from the node body with the
  connect tool starts one whose `from` end is automatic.
- While a connector (or an edge end, below) is being dragged and the pointer
  is over a node other than the source, that node shows its 8 dots as
  `<circle class="dg-port dg-port-target" r="6">`; the dot within **12 screen
  px** of the pointer gets class `dg-port-hot`.
- **Drop resolution** (pointerup), used by every connector/end drag:
  1. the nearest port of any node within 12 screen px (`12 / zoom` world) →
     that node, **pinned** to that port;
  2. else the node under the pointer (`dgHit`) → that node, **automatic**;
  3. else → cancel (no change).
  A new connector whose target resolves to its own source node is created
  only if both ends are pinned to different ports; otherwise cancel.
- **Moving an existing edge end:** a selected edge shows two handles
  `<circle class="dg-edge-end" data-end="from|to" r="6">` at its endpoints.
  Dragging one shows a rubber line from the other end; the drop (rules
  above) re-attaches that end to the resolved node/port (the edge keeps op,
  colour, label). Cancel restores it. One modal undo step.
- `Esc` during a connector / end drag cancels it (existing rule extended).
- A pinned end follows its port when the node moves or resizes (it is just
  recomputed from `dgPorts` at render).

### 3.5 Mind-map ports

Every parent→child connector has two ends: the parent end (`from`) and the
child end (`to`). Both are automatic unless pinned (§ 4.1 format).
- **Automatic mind-map rule** (keeps today's look for un-arranged maps):
  let P = parent box, C = child box. If `C.x ≥ P.x + P.w` → from `e`, to `w`;
  else if `C.x + C.w ≤ P.x` → from `w`, to `e`; else if C's centre is below
  P's centre → from `s`, to `n`; else from `n`, to `s`. A pinned end uses its
  port; the other end stays per this rule.
- Curve: `M p1 C c1, c2, p2` with `c1 = p1 + dir(fromPort)·d1`,
  `c2 = p2 + dir(toPort)·d2`; for `e`/`w` ports `d = max(20, |x2−x1|/2)`,
  for `n`/`s` `d = max(20, |y2−y1|/2)`, for corners
  `d = max(20, hypot(x2−x1, y2−y1)/3)`. With `e`/`w` ends this equals the
  round-1 `mx` curve, so un-arranged maps look the same.
- In the modal, selecting a **non-root** node shows its 8 `.dg-port` dots and
  two `.dg-edge-end` handles on its incoming connector. Dragging the
  `data-end="to"` handle and dropping it on one of **this node's** dots pins
  `to` there; on this node's body → `to` automatic; anywhere else → cancel.
  The `data-end="from"` handle likewise against the **parent's** dots/body.
  (Re-parenting by drag is out of scope.) One modal undo step each.

## 4. Free-form mind maps

### 4.1 Text format (extends round-1 `dgParseMindmap`)

A node line may end in an **attribute block** — a space, `{`, one or more
space-separated tokens, `}` at end of line. Normative regex applied to the
trimmed label text:
```
^(.*?)\s+\{((?:\s*(?:-?\d+,-?\d+|#[0-9a-fA-F]{6}|from=(?:nw|ne|sw|se|n|e|s|w)|to=(?:nw|ne|sw|se|n|e|s|w)))+)\s*\}$
```
Tokens: `x,y` (node top-left, world px, integers), `#RRGGBB` (the node's own
colour), `from=<port>` / `to=<port>` (pins of the connector **into** this
node; ignored on the root). A trailing `{…}` that does not match stays part
of the label (e.g. `Mulțimea {a, b}`). Duplicate tokens: last wins.

Node model: `{label, children, x, y, color, fromPort, toPort}` —
`x`/`y`/`color`/ports `null` when absent.

Canonical serialization: `'  '.repeat(depth) + label` and, if any attribute
is set, `' {' + tokens.join(' ') + '}'` with tokens in the order
`x,y`, `#RRGGBB` (upper-case), `from=…`, `to=…`. Example:
```mindmap
Buget {0,-22}
  Costuri {140,-80 #C4643C to=w}
  Echipă
```
Round-trip invariant holds; a map with no attributes serializes exactly as in
round 1.

### 4.2 Layout with positions — `dgLayoutMindmap`

1. Run the existing automatic layout (unchanged) → auto box per node.
2. Walk pre-order. Root: final = its `x,y` if set, else auto. Any other node:
   final = its `x,y` if set, else `parentFinal + (auto − parentAuto)` (it
   keeps its automatic offset from its parent — this is what places a new
   node beside its parent).
3. Width/height always come from the label (never stored).
4. Colours: branch colour as today; **effective colour** = node's own
   `color` if set, else its branch colour (root: own or accent). A node's
   own colour does **not** propagate to descendants. The connector into a
   node is drawn in that node's effective colour.
5. Bounds / viewBox from final boxes, padded 24 as today.

### 4.3 Modal behaviour (mind map)

- **Drag:** pointerdown on a node selects it (re-render only if the
  selection changed — keep the round-2 dblclick fix). Movement ≥ 3 screen px
  starts a drag. The node's new top-left is snapped to the 10 px grid; the
  same delta applies to every descendant. On drag start every node in the
  dragged subtree receives explicit `x,y` = its current final position, then
  moves by the delta. Pointerup with a real move = **one** undo step. A second
  finger cancels and restores (existing pinch rule).
- **Tab / Enter** add a node with `x,y = null` (auto-placed beside its parent
  per § 4.2). Nothing else changes.
- **Colour:** `#dg-colors` is now **visible** for mind maps. A swatch click
  sets the selected node's own colour (one undo step). A new button
  `#dg-color-auto` (label `t('dgColorAuto')`, shown only for mind maps,
  placed right after the six swatches) clears the selected node's own colour;
  disabled when the node has none. Swatch `.active` marks the selected
  node's own colour (none active when it has none).
- **↺ Auto layout:** new button `#dg-mm-auto` in `#dg-mm-tools`, label
  `t('dgAutoLayout')`. Sets `x`, `y`, `fromPort`, `toPort` to `null` on every
  node (colours kept), re-renders, fits the view. **One** undo step. Disabled
  when no node has a position or a pin.
- Arrow-key navigation keeps the round-1 rules, using each node's side from
  the automatic layout.

## 5. Sequence diagrams — ` ```sequence `

### 5.1 Text format

One statement per line, blank lines ignored, `%%` comments and any line
matching nothing go to `extra` (kept, not drawn, "n lines not understood"
warning in preview — same as flow). Participant id:
`[\p{L}\p{N}_-]+` (unicode, `u` flag — `Ștefan` is a valid id).

| Statement | Regex (normative, `u` flag) | Meaning |
|---|---|---|
| participant | `^\s*participant\s+([\p{L}\p{N}_-]+)\s*(?:\|\s?(.*))?$` | declares a participant; optional display label (default = id) |
| note | `^\s*note\s+([\p{L}\p{N}_-]+)\s*\|\s?(.*)$` | note beside that participant |
| message | `^\s*([\p{L}\p{N}_-]+?)\s*(-->|->)\s*([\p{L}\p{N}_-]+)\s*(?:\|\s?(.*))?$` | `->` message, `-->` dashed reply, same id both sides = self-message |

Try participant, then note, then message. `participant` and `note` are
keywords only in those positions (a participant may not be named
`participant`/`note` — such a message line falls to `extra`). Labels use the
flow `\n` / `\\` escaping. Participants are ordered by first appearance
(declaration or message/note). A note naming an unknown id creates it.

Model: `{parts:[{id,label}], events:[{type:'msg', from, to, op, label} |
{type:'note', who, label}], extra:[]}`.

Canonical serialization (`dgSerializeSequence`): every participant as
`participant <id>` (plus ` | <label>` only if label ≠ id), in order; then
events in order (`<from> <op> <to>` + ` | label` if non-empty;
`note <who> | <label>`); then `extra`. Round-trip invariant as flow.

Seed (UI language at open; labels via i18n keys § 8):
```sequence
participant Ana
participant Bogdan
Ana -> Bogdan | trimite factura
Bogdan --> Ana | confirmă primirea
Bogdan -> Bogdan | verifică plata
note Bogdan | în 3 zile
```

### 5.2 Layout (world px)

- Participant box: `w = max(100, textWidth(label, 600 14px) + 24)`, `h = 36`,
  `rx = 6`, colour `DG_COLORS[i % 6]` (fill-opacity 0.22, stroke 2), label
  centred. Boxes top at `y = 0`.
- Lifeline centres: `cx0 = w0/2`; `cx(i+1) = cx(i) + max(160, (w_i + w_{i+1})/2 + 40,
  max(labelWidth + 48) over messages between exactly participants i and i+1 in
  either direction)`.
- Rows start at `y = 36 + 30`. Each message row is 44 high (label above the
  arrow, arrow at row top + 30); a self-message row 60; a note row
  `lines·18 + 16 + 12`. Lifelines: `<line class="dg-seq-life">` dashed
  `4 4`, from `y = 36` to last row bottom + 16.
- Message: straight horizontal line between the two lifelines at the row's
  arrow y; arrowhead at the target (`dgHead`); `-->` dashed `6 4`; label
  (13 px) centred above the line on a label-bg rect. **Step number**: a
  circle `r = 9` (`class="dg-seq-num"`, fill accent `#C1BB45`) centred on
  the start lifeline at the arrow y, with the number (11 px, bold) inside;
  numbering counts messages only (replies and self-messages included), from
  1, in order.
- Self-message: path from `(cx, y)` right 40, down 24, back left to `cx`,
  arrowhead at the end; label left-aligned right of the loop.
- Note: `<rect class="dg-seq-note" rx="3">` fill `#D9A441` opacity 0.25,
  stroke `#D9A441`, left edge at `cx + 12`, text wrapped at 180 px, 13 px.
- Groups: `<g class="dg-seq-part" data-id>` (box + label),
  `<g class="dg-seq-msg" data-i>` (event index; wraps line, head, label,
  number), `<g class="dg-seq-note-g" data-i>`. Message lines reuse
  `dg-edge-line` / `dg-edge-head` / `dg-edge-label` / `dg-edge-label-bg` so
  the existing preview and export CSS apply. Empty model → `dgEmpty`.

### 5.3 Preview and export

`markdown.js` dispatches `sequence` exactly like `flow`/`mindmap`
(`md-diagram md-diagram-sequence`, aria-label `t('dgKindSequence')`, ✎ Edit,
double-click, extra-lines warning). Export CSS in `files.js`: literal hex —
`.dg-seq-life {stroke:#888}`, `.dg-seq-num text {fill:#222}` (and preview:
`.dg-seq-life {stroke: var(--text-3)}`, `.dg-seq-num text {fill: var(--on-accent)}`).

### 5.4 Modal (sequence)

- `#dg-kind` gains a third button `data-kind="sequence"` label
  `t('dgKindSequence')`. New-mode kind switch works across all three (dirty →
  `dgDiscardAsk`). `openDiagram()` caret detection and `{line}` editing
  accept ` ```sequence ` blocks.
- For `sequence`: `#dg-tools`, `#dg-mm-tools`, `#dg-colors`,
  `#dg-color-auto`, `#dg-edge-kind`, `#dg-delete` are hidden. `#dg-source`
  is **shown automatically** on open / kind switch (`aria-pressed="true"`),
  and the source toggle still works. The live drawing follows typing via the
  existing 150 ms re-parse (and the round-2 flush on apply/undo/hide).
- **Reorder:** pointerdown on a `.dg-seq-part` and horizontal movement ≥ 3 px
  drags it (the group gets `transform="translate(dx,0)"` while dragging). On
  pointerup the new index = number of other participants whose lifeline
  centre is left of the pointer's world x. If the index changed, move the
  participant in `parts` (the canonical text now declares them in the new
  order) — one undo step; the source text updates.
- **Label edit:** a single click (pointerdown+up with < 3 px movement) on a
  `.dg-seq-msg` or `.dg-seq-note-g` opens `#dg-label-input` over its label,
  pre-filled and selected; `Enter` commits (one undo step), `Shift+Enter`
  newline, `Esc` cancels without closing the modal, blur commits.
- Pan/zoom/fit/pinch as for the other kinds (drag on empty stage pans).

## 6. Freehand sketches — `js/markdown/sketch.js`

### 6.1 Public entry points
`openSketch(opts)` — no opts: new blank sketch; `{img: HTMLImageElement}`:
draw on that preview picture. `closeSketch(force)`, `skApply()`,
`skIsOpen()`, `skImageTokens(text)` (§ 6.5).

### 6.2 Entry points in the UI
- Toolbar button right after `#btn-diagram`:
  `<button class="tb-btn" id="btn-sketch" onclick="openSketch()" data-i="sketchBtn" data-i-title="sketchTip" title="…">✏ Sketch</button>`.
- **✎ on pictures:** one element `<button type="button" id="img-draw-btn"
  class="img-draw-btn" data-i-title="skDrawOnTip" hidden>✎</button>`, a
  sibling of `#preview` (not inside it — the preview is rebuilt on every
  keystroke), `position:fixed`. On `mouseover` of any `#preview img` that is
  not inside `.md-diagram`, position it at the image's top-right corner
  (`getBoundingClientRect`, 6 px inset) and show it; hide it on
  `mouseleave` of the preview (unless moving onto the button), on preview
  `scroll`, and on `updatePreview`. On touch (`(hover:none)`), a tap on an
  image shows it the same way. Click → `openSketch({img})`.

### 6.3 Modal markup (add after `#diagram-modal`)
```html
<div id="sketch-modal" class="dg-modal sk-modal" role="dialog" aria-modal="true" aria-labelledby="sk-title" hidden>
  <div class="dg-bar">
    <span class="dg-title" id="sk-title"></span>
    <div class="dg-seg" id="sk-tools">
      <button type="button" data-sktool="pen"  data-i-title="skPen"  data-i-aria="skPen">✎</button>
      <button type="button" data-sktool="hl"   data-i-title="skHl"   data-i-aria="skHl">▮</button>
      <button type="button" data-sktool="eraser" data-i-title="skEraser" data-i-aria="skEraser">⌫</button>
    </div>
    <div class="dg-colors" id="sk-colors"><!-- 6 × button.dg-swatch[data-color] --></div>
    <div class="dg-seg" id="sk-sizes">
      <button type="button" data-sksize="1" data-i-title="skThin">·</button>
      <button type="button" data-sksize="2" data-i-title="skMedium">•</button>
      <button type="button" data-sksize="3" data-i-title="skThick">●</button>
    </div>
    <button type="button" class="dg-btn" id="sk-undo" data-i-title="dgUndoTip" data-i-aria="dgUndoTip">↶</button>
    <button type="button" class="dg-btn" id="sk-redo" data-i-title="dgRedoTip" data-i-aria="dgRedoTip">↷</button>
    <span class="dg-spacer"></span>
    <button type="button" class="btn" id="sk-cancel" data-i="dgCancel">Cancel</button>
    <button type="button" class="btn btn-primary" id="sk-apply" data-i="dgInsert">Insert into note</button>
  </div>
  <div class="sk-stage" id="sk-stage"><canvas id="sk-base"></canvas><canvas id="sk-ink"></canvas></div>
</div>
```
It reuses the `.dg-modal` / `.dg-bar` / `.dg-seg` / `.dg-swatch` styles.
`.sk-stage` fills the rest, background `var(--surface)`, centres the two
canvases stacked on top of each other (same CSS size, fitted to the stage
keeping aspect ratio), `touch-action:none`.

### 6.4 Drawing (port from `editor.html`, do not copy the file)
- Bitmap: new sketch **1600×1000**, base filled white `#ffffff`. Existing
  picture: its natural size, scaled down so the long side ≤ 2400; base = the
  picture.
- Two canvases: `#sk-base` (the picture / white, never modified) and
  `#sk-ink` (strokes). Model: `strokes = [{tool, color, size, points:[{x,y}]}]`
  in bitmap px. `#sk-ink` is re-rendered from `strokes` on undo/redo.
- Pointer model from `editor.html` § "Pointer interaction" (~L4939): pointer
  events, `setPointerCapture`, mouse button 0 only, `getCoalescedEvents()`
  when available; `pointerType` pen/touch/mouse all draw. A second
  simultaneous pointer cancels the stroke in progress (removes it). Pressure
  is ignored (constant width).
- Smoothing: `smoothPathTo` (quadratic through midpoints,
  `editor.html:3582`), `lineCap`/`lineJoin` round.
- Tools: **pen** opaque; **highlighter** `globalAlpha 0.4`,
  `globalCompositeOperation 'multiply'` (as `drawHighlight`,
  `editor.html:4085`), width ×3, drawn so one stroke doesn't darken where it
  overlaps itself (draw the stroke once as a single path); **eraser**
  `destination-out` on `#sk-ink` only, width ×3 — it removes ink, never the
  underlying picture.
- Colours (Mâzgilește `PALETTE`, `editor.html:2448`, first six):
  `#1e1d1c #3f6b52 #b5493a #c79a3d #2f5d8a #7a4fae`; default `#1e1d1c`.
- Thickness: sizes 1/2/3 → pen width **3 / 6 / 12** bitmap px × `f`, where
  `f = max(1, longSide / 1600)`; default 2.
- Undo/redo: `#sk-undo`/`#sk-redo`, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y; one step
  per stroke; buttons disabled when empty.
- Keys: `P` pen, `H` highlighter, `E` eraser, `Esc` = cancel.

### 6.5 Saving
- Composite: a canvas at bitmap size, draw base then ink →
  `toBlob('image/png')` → `imageBlobToDataUrl(blob)` (existing,
  `js/markdown/editor.js`, shrinks/chooses JPEG when there is no alpha).
- **New sketch:** insert `![<t('skAlt')> <n>](<dataUrl>)` at the caret
  remembered at open (same newline padding rules as diagram insert), `n` =
  1 + number of image tokens in the chapter whose alt starts with
  `t('skAlt')`. Title `t('skTitleNew')`, apply `t('dgInsert')`.
- **Existing picture:** title `t('skTitleEdit')`, apply `t('dgUpdate')`.
  `skImageTokens(editor.value)` returns, outside fenced code blocks
  (`/^```/` toggling), every `![alt](src "title")` (the `applyInline` regex)
  and `![[name.ext]]` / `![[name.ext|…]]` image embed, as
  `{start, end, src, alt, embed}` in text order. The clicked image is the
  token whose `src` equals `img.getAttribute('src')` with the same ordinal
  (k-th preview `img` with that `src`, diagrams excluded → k-th token with
  that `src`; if fewer tokens, the last one). On apply the whole token is
  replaced by `![alt](dataUrl)` (embed: alt = its file name without
  extension) with **one** `setRangeText`. Before replacing, re-check the
  token text is still at `start`; if not, re-run the lookup; if not found,
  insert at the caret and toast `t('skImgMoved')`.
- **Unreadable picture:** load via `new Image()` with
  `crossOrigin='anonymous'` for `http(s)` sources; after drawing to a test
  canvas call `getImageData(0,0,1,1)`. If loading fails or it throws
  (file:// relative paths taint the canvas), do **not** open the modal;
  toast `t('skImgBlocked')`.
- Cancel with strokes drawn → `confirm(t('dgDiscardAsk'))`.

## 7. Download SVG / PNG

- Public `dgExportSvg(kind, text)` → a standalone SVG string: `xmlns`,
  `width`/`height`/`viewBox` as the preview, a first child
  `<rect x y width height fill="#ffffff"/>` covering the viewBox, and an
  embedded `<style>` with literal colours: text classes (`dg-label`,
  `dg-edge-label`, sequence labels) `fill:#222`; `.dg-edge-line:not([stroke])`
  and `.dg-seq-life` `stroke:#444`; `.dg-edge-head:not([fill])` `fill:#444`;
  `.dg-edge-label-bg` `fill:#fff`; font-family Trebuchet. Node/branch/
  participant colours are kept as rendered. No modal-only markup (grid,
  outlines, ports, handles).
- `dgExportPng(kind, text)` → `Promise<Blob>`: the SVG as
  `data:image/svg+xml;charset=utf-8,…` into an `Image`, canvas at **2×** the
  SVG width/height, white fill, `drawImage`, `toBlob('image/png')`.
- File name `dgFileName(kind, n, ext)` =
  `wbSlug(chapterTitle, 'diagrama') + '-' + word + '-' + n + '.' + ext`,
  `word` = `flowchart` / `mindmap` / `sequence`; chapter title =
  `wbChapter(wbCurrentId).title` (fallback when no chapter). `n` = 1-based
  position of that block among blocks **of the same kind** in the editor text
  (new, unsaved block in the modal → count + 1).
- Save with `ScuLaFolder.save(name, blob)` (SVG blob type
  `image/svg+xml`).
- **Preview:** each preview figure gets, next to `.dg-edit` in a
  `<div class="dg-actions">`, `<button class="dg-dl" data-fmt="svg">SVG</button>`
  and `<button class="dg-dl" data-fmt="png">PNG</button>` (titles
  `t('dgDlSvgTip')`/`t('dgDlPngTip')`), same hover/`:focus-within`/
  `(hover:none)` visibility as `.dg-edit`. Not in export. Click (delegated in
  `markdown.js`) → read the block from the editor via `mdDiagramLine` and
  export it.
- **Modal:** `#dg-dl-svg` and `#dg-dl-png` (`.dg-btn`) just before
  `.dg-spacer`, exporting the **current** model (`dgCanon()`, after
  `dgSourceFlush()`), all three kinds.

## 8. i18n keys (both `ro` and `en`)

| Key | ro | en |
|---|---|---|
| `dgKindSequence` | `Secvență` | `Sequence` |
| `dgColorAuto` | `↺ Culoarea ramurii` | `↺ Branch colour` |
| `dgAutoLayout` | `↺ Aranjare automată` | `↺ Auto layout` |
| `dgDlSvg` / `dgDlPng` | `⤓ SVG` / `⤓ PNG` | `⤓ SVG` / `⤓ PNG` |
| `dgDlSvgTip` | `Descarcă diagrama ca SVG` | `Download the diagram as SVG` |
| `dgDlPngTip` | `Descarcă diagrama ca PNG` | `Download the diagram as PNG` |
| `dgSeqSend` / `dgSeqReply` / `dgSeqCheck` / `dgSeqNote` | `trimite factura` / `confirmă primirea` / `verifică plata` / `în 3 zile` | `sends the invoice` / `confirms receipt` / `checks the payment` / `within 3 days` |
| `sketchBtn` | `✏ Schiță` | `✏ Sketch` |
| `sketchTip` | `Desenează de mână o schiță în capitol` | `Draw a freehand sketch into the chapter` |
| `skTitleNew` / `skTitleEdit` | `Schiță nouă` / `Desenează pe imagine` | `New sketch` / `Draw on picture` |
| `skPen` / `skHl` / `skEraser` | `Stilou (P)` / `Marker (H)` / `Radieră (E)` | `Pen (P)` / `Highlighter (H)` / `Eraser (E)` |
| `skThin` / `skMedium` / `skThick` | `Subțire` / `Mediu` / `Gros` | `Thin` / `Medium` / `Thick` |
| `skAlt` | `Schiță` | `Sketch` |
| `skDrawOnTip` | `Desenează pe această imagine` | `Draw on this picture` |
| `skImgBlocked` | `Imaginea nu poate fi citită aici (fișier local sau alt site) — lipește-o în capitol și încearcă din nou.` | `This picture can't be read here (a local file or another site) — paste it into the chapter and try again.` |
| `skImgMoved` | `Imaginea se mutase — desenul a fost inserat la cursor.` | `The picture had moved — the drawing was inserted at the cursor.` |

Participant names `Ana`, `Bogdan` are the same in both languages.

## 9. Out of scope

Loop/alt/if-else frames, activation bars, creating/deleting sequence
messages with the mouse; re-parenting mind-map nodes by drag; edge routing /
waypoints; multi-select; pressure-sensitive width; zoom/pan inside the
sketch modal; shapes/text tools in the sketch; sketches as vector/editable
text; downloading a sketch (it is already a picture); putting any diagram
in the knowledge graph; Mermaid compatibility.

## 10. Definition of done

- [ ] `/apptest diagram` passes (extended as below); `/verify` passes;
      `codecopy`, `timeline`, `mdundo`, `cause`, `paste` tests still pass.
- [ ] Round-1 diagrams in canonical form round-trip byte-identically; a text
      with no pins/positions renders with all ends automatic.
- [ ] Every item in § 0 is observable in the running page.
- [ ] No console errors from `file://`, desktop and 390×844 touch viewport.
- [ ] Docs updated per § 1 in the same change.
- [ ] Implementer's own tests: extend `tests/diagram.js` (ports and pins
      round-trip; drop-on-dot pins, drop-on-body auto; end re-attach; mind-map
      branch drag + one undo; Auto layout one undo; node colour vs branch;
      sequence parse/serialize/render/reorder/label click; SVG export has a
      white rect and `#222` text rule; PNG blob is `image/png` with 2× width,
      read back with `createImageBitmap`) and add `tests/sketch.js` (a real
      mouse stroke changes `#sk-ink` pixels; eraser clears ink but not the
      base; undo/redo; new sketch inserts one `![Schiță 1](data:image/…)` as
      one markdown undo step; ✎ on a pasted `data:` picture replaces exactly
      that token; a `file://` relative picture toasts `skImgBlocked`). The
      Tester additionally writes the suite under
      `tests/01-for-index-html-page-please-add/` (standing policy).

## 11. Manual verification (human / tester)

Open `index.html` from disk (`file://`), open a chapter titled `Capitol`.
1. ◇ Diagram → seed flowchart. Select `ask`: 8 dots (corners + midpoints).
   Drag from its `e` dot onto `end`'s `nw` dot (it highlights): the arrow
   runs dot to dot. Source text shows `ask.e -> end.nw`. Move `end`: the
   arrow stays on its `nw` corner.
2. Connector tool, drag `start` → `fix` body: an automatic arrow, no `.port`
   in the text; move `fix` around `start`: the end jumps to the nearest dot.
3. Select that edge, drag its arrow-end handle onto `step`: it now points at
   `step`. Ctrl+Z puts it back.
4. Mind map: Tab twice under the root, drag a branch node that has a child:
   the child moves with it. Tab under it: the new node appears beside it.
   Pick terracotta: only that node changes. `↺ Branch colour` restores it.
   `↺ Auto layout`: everything returns to left/right; one Ctrl+Z undoes it.
   Update note: the text shows `{x,y …}` attributes; the preview matches.
5. Kind **Sequence**: the source panel is open with the seed; the drawing
   shows Ana and Bogdan, numbered arrows 1–3, a dashed reply, a self-loop,
   an amber note. Type `Ana -> Cezar | întreabă`: a third column appears,
   step 4. Drag `Cezar` left of `Ana`: the order changes in the text. Click
   the arrow 1 label, type `trimite oferta`, Enter.
6. Insert; hover the preview diagram: `✎ Edit`, `⤓ SVG`, `⤓ PNG`. PNG →
   `Capitol-sequence-1.png`, white background, dark text, box colours, twice
   the preview size. SVG opens in a browser the same way.
7. ✏ Sketch: draw with pen, highlighter over it (see-through), erase part,
   thickness and colour changes, Ctrl+Z / Ctrl+Shift+Z. Insert: one picture
   `![Schiță 1](data:…)`; one Ctrl+Z in the editor removes it.
8. Paste a screenshot into the chapter, hover it: ✎ appears. Draw a circle,
   Update: the same picture now carries the circle; one Ctrl+Z restores the
   original text.
9. Phone viewport (touch): draw with a finger in the sketch; drag a mind-map
   node with a finger; two fingers pinch the diagram stage.
10. Switch UI language with each modal open: all new labels change. Export
    → HTML: sequence diagram present, dark on light, no action buttons.

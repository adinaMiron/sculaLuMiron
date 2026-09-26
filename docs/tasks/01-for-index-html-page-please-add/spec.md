# task-01 — Flowcharts, mind maps and diagrams in the markdown page (`index.html`)

## 0. Decision and why (read first)

**What we build:** two new fenced-block kinds in the markdown, ` ```flow `
(flowcharts and general box-and-arrow diagrams) and ` ```mindmap `, rendered
as inline **SVG** in the preview and in the HTML export, plus a full-screen
**diagram modal** in `index.html` that edits either kind visually and writes
the block back into the chapter.

**Why not embed `editor.html` (Mâzgilește) in an iframe and paste a PNG:**
Mâzgilește is a raster annotation tool. Its arrows are free strokes that do
not attach to shapes, the output would be a `data:` PNG that can never be
edited again, it is 6000 lines with its own nav/Drive/i18n, and a picture is
invisible to search, diff and Drive merge. A flowchart's defining property is
that a connector stays attached when a box moves; that needs a structural
model. A text block keeps the diagram editable, searchable, tiny, Drive-safe,
and requires **no new dependency** (Rule 3 — no Mermaid, no JointJS).

**What we do take from Mâzgilește** (port the logic, don't copy the file):
- Arrowhead geometry — `drawArrow()` `editor.html:3622`: `head` length,
  back point `x2 - head·cos(ang)`, wings at `±0.55·head` perpendicular.
- Zoom around a fixed screen point — `clientToWorld`/`panWorldTo`/`setZoomAt`
  `editor.html:3007–3030` (the world point under the cursor stays put).
- The pointer model — `editor.html` § "Pointer interaction" (~4841):
  one `pointers` map, pointer capture, a second finger cancels the one-finger
  action and starts a pinch (`beginPinch`/`updatePinch`).
- The palette idea (fixed swatch row) — but with the colours below, because
  the output is shown on a dark preview *and* a white export.

Nothing outside `index.html` and `js/markdown/` changes, except docs.
**The shared nav block must not be touched.**

---

## 1. Files

| File | Change |
|---|---|
| `js/markdown/diagram.js` | **New.** All diagram logic: parsers, serializers, layout, SVG renderer, the modal controller. |
| `index.html` | `<script src="js/markdown/diagram.js"></script>` **immediately after** the `markdown.js` tag (currently `index.html:4126`); toolbar button; modal markup; CSS. |
| `js/markdown/markdown.js` | Fence branch in `parseMarkdown()` (~L922–1023) dispatches `flow`/`mindmap` to `renderDiagramBlock()`; preview click/dblclick delegation (~L1057). |
| `js/markdown/files.js` | Export CSS (literal hex) in `exportHtml()` (~L174+). |
| `js/markdown/events.js` | Guard at the top of the global `keydown` handler (L30). |
| `js/markdown/i18n.js` | New keys, RO **and** EN; `helpBody` section in both languages. |
| `js/markdown/README.md`, `docs/MAP.md` (§ index.html table), `docs/FEATURES.md` (new § U), `CLAUDE.md` (table row text for `index.html` + a routing row → § U) | Docs. |

All identifiers in `diagram.js` use the prefix `dg` (functions `dgXxx`,
constants `DG_XXX`) except the four public entry points named below. Use
`const`/`let`, plain functions, no modules, no classes required. Must work
from `file://`.

---

## 2. The text formats (the contract)

The fence opener is `` ``` `` followed by the info string; the kind is
`codeLang.trim().toLowerCase()` and must equal exactly `flow` or `mindmap`.
Anything else stays an ordinary code block (unchanged behaviour).

### 2.1 ` ```flow `

One statement per line. Blank lines ignored. Grammar (regexes are
normative):

**Node** — `DG_NODE_RE`:
```
^\s*([A-Za-z0-9_-]+)\s*:\s*(rect|round|pill|ellipse|diamond|para|text)?\s*(?:(-?\d+)\s*,\s*(-?\d+))?\s*(?:(\d+)\s*x\s*(\d+))?\s*(#[0-9a-fA-F]{6})?\s*(?:\|\s?(.*))?$
```
→ `id`, `shape` (default `rect`), `x,y` (top-left, world px), `w x h`,
`color`, `label`.

**Edge** — `DG_EDGE_RE`:
```
^\s*([A-Za-z0-9_-]+)\s*(<->|-->|->|--)\s*([A-Za-z0-9_-]+)\s*(#[0-9a-fA-F]{6})?\s*(?:\|\s?(.*))?$
```
→ `from`, `op`, `to`, `color`, `label`. Try `DG_EDGE_RE` **before**
`DG_NODE_RE` on each line.

**Label escaping:** in the source, `\n` means a line break and `\\` a
backslash. Decode on parse, encode on serialize (encode `\` first).

**Tolerance rules:**
- Missing shape → `rect`. Missing size → shape default (table § 4.1).
- Missing position → auto-place: the k-th positionless node (0-based, in
  source order) gets `x = 40 + (k % 4) * 200`, `y = 40 + floor(k / 4) * 130`.
  Auto-placed nodes get real coordinates when the modal serializes them.
- Missing label → empty string.
- An id defined twice → the later line's attributes win; the node keeps the
  position in the node order of its **first** appearance.
- An edge naming an id that has no node line → an implicit `rect` node is
  created with `label = id`, auto-placed per the rule above.
- A line matching neither regex (including `%%` comments) goes, verbatim, to
  `model.extra` (array of strings, source order). It is **not drawn** but
  **is re-emitted** by the serializer, so the modal never destroys what it
  does not understand.

**Canonical serialization** (`dgSerializeFlow`): every node in model order,
then every edge in model order, then `extra` lines.
```
<id>: <shape> <x>,<y> <w>x<h>[ <#RRGGBB>] | <label>
<from> <op> <to>[ <#RRGGBB>][ | <label>]
```
- Node color is written only if it differs (case-insensitively) from the
  default `#C1BB45`; edge color only if set. Hex written upper-case.
- A node line always contains ` | `; with an empty label the line ends in
  `| ` (pipe + one space). An edge line gets ` | <label>` only if the label
  is non-empty.
- Coordinates and sizes are integers (`Math.round`).
- **Round-trip invariant:** `dgSerializeFlow(dgParseFlow(s)) === s` for any
  `s` already in canonical form.

Example (this is also the **flow seed**, labels via i18n, § 7):
```flow
start: pill 40,40 160x60 | Început
step: rect 40,150 160x60 | Pas
ask: diamond 40,260 160x90 | Întrebare?
fix: rect 280,275 160x60 #C4643C | Corectează
end: pill 40,400 160x60 | Sfârșit
start -> step
step -> ask
ask -> end | da
ask -> fix | nu
fix --> step
```

### 2.2 ` ```mindmap `

An indented outline, one node per line.
- Leading whitespace: a tab counts as 2 spaces. After the indent, a leading
  `- `, `* ` or `+ ` bullet is stripped (so a pasted markdown list works).
- Label = rest of line, trimmed. Blank lines ignored.
- The **first** non-blank line is the root. Tree building uses a stack of
  `{indent, node}`: for each later line, pop while `top.indent >= indent`;
  if the stack is empty, the node becomes a child of the root (and is
  pushed); else it becomes a child of `top`; then push it.
- There is no "extra" for mind maps; every non-blank line is a node.
- Empty block → `root = null`.

**Canonical serialization** (`dgSerializeMindmap`): root at column 0, each
depth indented by exactly two spaces, no bullets. Round-trip invariant as
above.

Seed:
```mindmap
Idee centrală
  Ramura 1
  Ramura 2
  Ramura 3
```

---

## 3. Public functions in `diagram.js` (tests call these)

| Function | Returns / does |
|---|---|
| `dgParseFlow(text)` | `{nodes:[{id,shape,x,y,w,h,color,label}], edges:[{from,to,op,color,label}], extra:[string]}` — `color` is `null` when absent; node `color` resolved to `#C1BB45` only at render time. |
| `dgSerializeFlow(model)` | string, no fences, no trailing newline |
| `dgParseMindmap(text)` | `{root: {label, children:[…]} \| null}` |
| `dgSerializeMindmap(model)` | string, no fences, no trailing newline |
| `renderDiagramBlock(lines, kind, lineIdx, opts)` | HTML string (§ 5). `lines` are the **HTML-escaped** code lines `parseMarkdown` collected. |
| `openDiagram(opts)` | opens the modal. `opts` omitted → caret logic (§ 6.1). `opts = {line: n}` → edit the block whose opening fence is editor line `n`. |
| `closeDiagram(force)` | closes; `force=true` skips the discard confirm. |
| `dgApply()` | writes the block into the editor and closes (§ 6.4). |
| `dgIsOpen()` | boolean |

---

## 4. Rendering (shared by preview, export and the modal)

Text is measured with one cached offscreen `<canvas>` 2D context
(`dgMeasure(text, font)` → width). Fonts: `14px 'Trebuchet MS', sans-serif`
for flow labels and mind-map depth ≥ 2; `600 14px …` for mind-map depth 1;
`700 16px …` for the mind-map root. Line height 18 px (root 20 px).

Palette `DG_COLORS = ['#C1BB45','#6E9E8A','#C4643C','#D9A441','#7A9CC6','#9FB3A5']`
(accent, sage, terracotta, amber, slate blue, grey-green). These are
*document data* written into the markdown (like the `#rrggbb` swatch), so
they are literal hex; the modal chrome itself uses theme tokens only.

### 4.1 Flow

Shape defaults (w×h): `rect`, `round`, `pill`, `para` 160×60; `diamond`
160×90; `ellipse` 140×70; `text` 140×30. Minimum size 40×24.

Each node → `<g class="dg-node" data-id="ID">` containing the shape and a
`<text class="dg-label">`:
- `rect`: `<rect rx="2">`; `round`: `<rect rx="12">`; `pill`: `<rect rx="h/2">`;
  `ellipse`: `<ellipse>`; `diamond`: `<polygon>` through the 4 edge midpoints;
  `para`: `<polygon>` skewed by `0.2·h` (top edge shifted right);
  `text`: no shape element except a transparent `<rect>` for hit-testing
  (`fill="transparent"`, no stroke).
- Shape attributes: `fill="<color>" fill-opacity="0.18" stroke="<color>"
  stroke-width="2"`.
- Label: split on `\n`, then each part word-wrapped to `w − 16` px (a single
  word longer than that is left on its own line, not broken). Lines are
  `<tspan x="cx" dy="…">`, `text-anchor="middle"`, block vertically centred
  on the node centre. Overflow is allowed (no clipping).

Each edge → `<g class="dg-edge" data-i="INDEX">`:
- Endpoints: from centre A towards centre B, clipped at each node's boundary
  with `(dx,dy)` = the unit direction scaled to the other centre and
  `hw = w/2, hh = h/2`: box shapes (`rect round pill para text`)
  `t = min(hw/|dx|, hh/|dy|)`; `ellipse` `t = 1/√((dx/hw)²+(dy/hh)²)`;
  `diamond` `t = 1/(|dx|/hw + |dy|/hh)`. If A and B overlap such that the
  clipped segment has length < 4 px, or `from === to`, the edge is **not
  drawn** (it stays in the model).
- A `<path class="dg-edge-hit">` with `stroke="transparent" stroke-width="12"`
  first (hit target), then the visible `<path class="dg-edge-line">`,
  `stroke-width="2"`, `stroke` = edge color if set (inline attribute),
  otherwise styled by CSS class.
- Ops: `->` head at B; `-->` head at B + `stroke-dasharray="6 4"`; `--` no
  head; `<->` heads at both ends. Heads are `<path class="dg-edge-head">`
  filled polygons, `head = 10`, geometry from `editor.html` `drawArrow`; the
  line stops at the head's back point. **No `<marker>`** (ids would clash
  between several diagrams in one page, and markers don't take the edge
  colour).
- Label (non-empty): at the segment midpoint, a `<rect class="dg-edge-label-bg">`
  (text width + 8, 20 high, rx 4) under a `<text class="dg-edge-label">`
  (13 px, centred).

Bounds = union of node boxes and edge label boxes; `viewBox` = bounds padded
by 20. Empty model → no SVG, a `<p class="dg-empty">` with `t('dgEmpty')`.

### 4.2 Mind map (automatic layout — the person never positions nodes)

- Node size: `w = textWidth + 24` (root `+32`), label wraps at 220 px text
  width; `h = 34` for one line (root 44), +18 per extra wrapped line.
- Root children split: the first `ceil(n/2)` go **right**, the rest
  **left**. Descendants stay on their ancestor's side.
- Subtree extent: `ext(n) = max(n.h, Σ ext(children) + 12·(k−1))`.
- Children of a node are stacked top-to-bottom in order, the stack
  vertically centred on the parent's centre. Horizontal gap 56 px: a right
  child's left edge = parent's right edge + 56; a left child's right edge =
  parent's left edge − 56.
- Root centre at (0,0); `viewBox` = bounds padded by 24.
- Branch colour: root child `i` gets `DG_COLORS[(i+1) % 6]` (index 0, the
  accent, is the root's); descendants inherit.
- Root: `<rect rx="h/2">` fill accent `fill-opacity="0.35"`, stroke accent 2.
  Depth 1: `<rect rx="8">` fill branch `0.22`, stroke branch 2. Depth ≥ 2:
  `<rect rx="8">` fill branch `0.08`, stroke branch 1.5.
- Edges: `<path class="dg-mm-edge" fill="none" stroke="<branch>">`, width 3
  from the root, 2 deeper; cubic from the parent's facing side midpoint to
  the child's facing side midpoint: `M x1 y1 C mx y1, mx y2, x2 y2`, `mx`
  the horizontal midpoint.
- Each node is `<g class="dg-mm-node" data-path="0.2.1">` (the child-index
  path from the root; root is `""`).

---

## 5. Preview and export integration (`markdown.js`, `files.js`)

In `parseMarkdown()`:
- When a fence **opens**, remember `codeStart = lineIdx`.
- On the closing fence **and** on the unclosed-at-EOF branch (L1023): if the
  kind is `flow`/`mindmap`, `out.push(renderDiagramBlock(codeLines, kind,
  codeStart, opts))` instead of `renderCodeBlock(...)`.

`renderDiagramBlock` first un-escapes the lines (`&lt;`→`<`, `&gt;`→`>`,
then `&amp;`→`&` last), parses, and returns:

```html
<figure class="md-diagram md-diagram-flow" data-line="12">
  <svg class="dg-svg" viewBox="…" width="W" height="H" role="img"
       aria-label="Schemă logică">…</svg>
  <!-- preview only: -->
  <button type="button" class="dg-edit" title="…">✎ Editează</button>
  <!-- preview only, only when extra.length > 0: -->
  <p class="dg-warn">…t('dgIgnored', n)…</p>
</figure>
```
- `md-diagram-mindmap` for the other kind; `aria-label` = `t('dgKindFlow')` /
  `t('dgKindMindmap')`.
- `data-line` is the **preview-source** line index; the click handler maps
  it through `wbPreviewLineMap` exactly as the task-checkbox branch does
  (markdown.js ~L1058–1062).
- `forExport`: no `.dg-edit`, no `.dg-warn`, no `data-line`.
- All label text is HTML-escaped by the renderer.
- SVG sized by `width`/`height` = viewBox size, CSS `max-width:100%;
  height:auto` so wide diagrams shrink to the pane.

Preview click delegation (add to the existing `preview` `click` listener,
before the wikilink branch): `.dg-edit` → `openDiagram({line: mapped})`.
Add a `preview` `dblclick` listener: inside `.md-diagram` → same.

Preview CSS (index.html, near the timeline's `.md-timeline` rules): figure
`margin:14px 0; padding:12px; border:1px solid var(--border);
border-radius:8px; background:var(--surface); position:relative;
overflow:auto`; `.dg-label, .dg-edge-label {fill:var(--text)}`;
`.dg-edge-line {stroke:var(--text-2)}` (inline `stroke` overrides);
`.dg-edge-head {fill:var(--text-2)}` — for coloured edges the renderer
writes the head's `fill` inline too; `.dg-edge-label-bg {fill:var(--surface)}`;
`.dg-edit` absolutely at top-right, `opacity:0` until `.md-diagram:hover`
or `:focus-within`, always visible under `(hover:none)`. `.dg-warn`
`color:var(--text-3); font-size:12px`.

Export CSS (`exportHtml()` template, **literal hex**): `.md-diagram {margin:14px 0;
padding:12px; border:1px solid #e2e2e2; border-radius:8px; background:#fafafa;
overflow:auto}`, `.dg-svg {max-width:100%; height:auto; display:block;
margin:0 auto}`, `.dg-label,.dg-edge-label {fill:#222; font-family:'Trebuchet MS',sans-serif}`,
`.dg-edge-line {stroke:#666}`, `.dg-edge-head {fill:#666}`,
`.dg-edge-label-bg {fill:#fafafa}`.

Fenced content is already blanked by the graph/causality scanner
(`graph.js:175`) and skipped by search and gantt, so `a -> b` inside a
` ```flow ` block must **not** appear in the causality diagram — verify,
don't change.

---

## 6. The modal

### 6.1 Entry points
1. Toolbar button, inserted right after the `⏳ Timeline` button
   (`index.html:3555`):
   `<button class="tb-btn" id="btn-diagram" onclick="openDiagram()" data-i="diagramBtn" data-i-title="diagramTip" title="Draw a flowchart or a mind map">◇ Diagram</button>`
2. `openDiagram()` without opts: if the editor caret line is inside a
   ` ```flow `/` ```mindmap ` block (opening fence line through closing fence
   line inclusive; fences tracked the same way `parseMarkdown` does,
   `/^```/` toggling) → **edit mode** on that block. Otherwise **new mode**,
   kind `flow`, seeded (§ 2.1). Remember the caret (`selectionStart/End`)
   for insertion.
3. `✎` button or double-click on a rendered diagram → edit mode.

No new global keyboard shortcut.

### 6.2 Markup (add after the gantt modal, `index.html` ~L3836)
```html
<div id="diagram-modal" class="dg-modal" role="dialog" aria-modal="true" aria-labelledby="dg-title" hidden>
  <div class="dg-bar">
    <span class="dg-title" id="dg-title"></span>
    <div class="dg-seg" id="dg-kind">
      <button type="button" data-kind="flow" data-i="dgKindFlow">Flowchart</button>
      <button type="button" data-kind="mindmap" data-i="dgKindMindmap">Mind map</button>
    </div>
    <div class="dg-seg" id="dg-tools">  <!-- flow only: one <button type="button" data-tool="…"> each,
         in this order: select connect rect round pill ellipse diamond para text;
         label = a glyph (▢ ⇄ ▭ ▢ ⬭ ◯ ◇ ▱ T), data-i-title = dgTool* key, aria-label same -->
    </div>
    <div class="dg-seg" id="dg-mm-tools">  <!-- mindmap only -->
      #dg-mm-child  #dg-mm-sibling  #dg-mm-rename
    </div>
    <div class="dg-colors" id="dg-colors"><!-- 6 × <button data-color="#…"> --></div>
    <select id="dg-edge-kind" hidden>  <!-- flow, only while an edge is selected -->
      <option value="->"> <option value="-->"> <option value="--"> <option value="<->">
    </select>
    <button id="dg-delete"> <button id="dg-undo"> <button id="dg-redo">
    <button id="dg-zoom-out"> <button id="dg-zoom-in"> <button id="dg-fit">
    <button id="dg-source-btn" aria-pressed="false">
    <span class="dg-spacer"></span>
    <button class="btn" id="dg-cancel">  <button class="btn btn-primary" id="dg-apply">
  </div>
  <div class="dg-body">
    <div class="dg-stage" id="dg-stage" tabindex="0">
      <svg id="dg-svg"><defs><pattern id="dg-grid">…10px dot grid…</pattern></defs>
        <rect class="dg-grid-bg" fill="url(#dg-grid)"/> <g id="dg-world"></g></svg>
      <textarea id="dg-label-input" hidden></textarea>
    </div>
    <textarea id="dg-source" spellcheck="false" hidden></textarea>
  </div>
</div>
```
Every visible string via `data-i` / `data-i-title` keys (§ 7). The grid
`<pattern>` lives only in the modal, never in rendered output.

CSS: `.dg-modal` fixed, `inset:0`, `z-index:120` (above `.image-modal`'s
100), `background:var(--bg)`, flex column. `.dg-bar` wraps (`flex-wrap:wrap`),
`background:var(--surface-2)`, `border-bottom:1px solid var(--border)`.
`.dg-seg button.active` uses `--accent`/`--on-accent` like `.tb-btn.active`.
`.dg-body` flex row, fills the rest. `.dg-stage` `flex:1; position:relative;
overflow:hidden; touch-action:none`. `#dg-source` `width:320px`,
`font-family:var(--font-mono)`; at `max-width:720px` it overlays the stage
full-width. Inside `@media (hover:none) and (pointer:coarse)`: bar buttons
`min-height:44px; min-width:44px` (px deliberately). Selected node/edge:
class `dg-selected` → `outline` drawn as an extra `<rect>` with
`stroke:var(--accent-2); stroke-dasharray:4 3; fill:none`.

Show/hide per kind: `#dg-tools`, `#dg-edge-kind` flow only; `#dg-mm-tools`
mindmap only. `#dg-colors` and `#dg-delete` in both (in mindmap, colours are
automatic, so `#dg-colors` is **hidden** for mindmap).

Title and apply label: new mode → `t('dgTitleNew')` / `t('dgInsert')`;
edit mode → `t('dgTitleEdit')` / `t('dgUpdate')`. In edit mode the kind
buttons are `disabled`. In new mode switching kind: if dirty, `confirm(t('dgDiscardAsk'))`;
on yes (or not dirty) load the other kind's seed and reset the modal undo stack.

On open: `hidden = false`, render, **fit** (§ 6.3), focus `#dg-stage`,
tool = `select`, clear selection, dirty = false, modal undo stack empty.
Repaint strings on `scula-ui-lang` while open.

### 6.3 View: zoom and pan (both kinds)
- `#dg-world` transform `translate(panX,panY) scale(zoom)`; zoom clamped
  0.25–4.
- `clientToWorld(cx,cy)` = `((cx−stageLeft−panX)/zoom, (cy−stageTop−panY)/zoom)`.
  `dgZoomAt(z, cx, cy)` keeps the world point under `(cx,cy)` fixed
  (port of `editor.html` `setZoomAt`).
- Wheel over the stage: `preventDefault`, zoom ×1.1 per notch (`deltaY<0`
  in, `>0` out) at the cursor.
- `#dg-zoom-in`/`#dg-zoom-out`: ×1.25 / ÷1.25 at the stage centre.
- `#dg-fit`: content bounds fitted into the stage with 40 px margin, zoom
  capped at 1, centred. Also applied on open and after a kind switch.
- Drag on empty stage with the select tool (flow) or anywhere not on a node
  (mindmap) → pan.
- Two pointers → pinch: zoom = startZoom × dist/startDist anchored at the
  midpoint, pan follows the midpoint. A second pointer arriving cancels the
  one-finger action in progress and restores what it changed (a node being
  dragged goes back to its start position).

### 6.4 Flow editing
Tools (buttons `#dg-tools [data-tool]`; keyboard in the stage: `V` select,
`A` connect, `R` rect, `D` diamond, `E` ellipse, `T` text; no modifier).

- **Place a shape** (any shape tool): pointerdown on empty stage → node
  with that shape's default size, centred on the pointer, x/y snapped to the
  10 px grid, colour = the last swatch picked in this session (initially
  `#C1BB45`), label `t('dgNewShape')`, id `n<k>` with the smallest k ≥ 1 not
  in use. Then tool returns to `select`, the node is selected and label
  editing opens with the text selected.
- **Select**: pointerdown on a node/edge selects it (single selection; no
  multi-select). Empty stage → clears selection and pans.
- **Move**: drag a selected-or-not node with select → moves; position
  snapped to the 10 px grid on every move; connected edges follow live.
- **Resize**: the selected node shows one 10×10 handle
  (`<rect class="dg-resize">`) at its bottom-right corner; dragging it
  resizes (top-left fixed), snapped to 10 px, min 40×24.
- **Connect**: with `connect`, pointerdown on a node starts a rubber-band
  line (`<line class="dg-rubber">`, dashed accent) to the pointer;
  pointerup over a *different* node creates `from -> to` (op `->`, no
  colour, no label) and selects it; anywhere else cancels. The selected node
  (in select mode) also shows four connection dots (`<circle class="dg-port">`
  r=5 at N/E/S/W midpoints); dragging from a dot behaves exactly like the
  connect tool.
- **Labels**: double-click a node or edge (or `F2`/`Enter` with one
  selected) → `#dg-label-input` positioned over the node's screen rect (edge:
  over the midpoint, 160 px wide), `font-size = 14·zoom px`, current label
  (decoded) selected. `Enter` commits, `Shift+Enter` inserts a newline,
  `Esc` cancels (and must **not** close the modal), blur commits.
- **Colour**: a swatch click sets the selected node's or edge's colour and
  becomes the colour for the next new node. On an edge, any swatch
  (including `#C1BB45`) is stored explicitly.
- **Edge kind**: `#dg-edge-kind` shown only with an edge selected; change →
  sets `op`.
- **Delete**: `Delete`/`Backspace` in the stage, or `#dg-delete` → removes
  the selected node **and every edge touching it**, or the selected edge.
- **Esc** in the stage (not editing a label): if a connect/rubber-band is in
  progress, cancel it; else if something is selected, deselect; else cancel
  the modal (§ 6.6).

### 6.5 Mind-map editing
The map is re-laid out (§ 4.2) and re-rendered after every change. Root is
selected on open.
- Click a node → select. Double-click / `F2` / `#dg-mm-rename` → label
  editing (same `#dg-label-input`, single-line: `Enter` commits, `Esc`
  cancels, blur commits; newlines are not allowed — strip them).
- `Tab` / `#dg-mm-child` → append a child to the selected node, select it,
  open label editing with `t('dgNewNode')` selected. `Tab` must
  `preventDefault` (no focus move).
- `Enter` / `#dg-mm-sibling` → insert a sibling right after the selected
  node; on the root it adds a child instead.
- `Delete`/`Backspace` / `#dg-delete` → delete the selected node and its
  subtree, select its parent. Root cannot be deleted (button disabled while
  root is selected).
- Arrows: `↑`/`↓` previous/next sibling (no wrap). Right-side node: `→`
  first child, `←` parent. Left-side node: `←` first child, `→` parent.
  Root: `→` first right child, `←` first left child.
- Committing an empty label on a node just created by Tab/Enter removes that
  node (so "Tab, Esc" leaves nothing behind); on an existing node an empty
  commit restores the previous label.

### 6.6 Undo, source text, apply, cancel
- **Modal undo**: before each committed change, push the canonical text of
  the model onto `dgUndo` (limit 100) and clear `dgRedo`. A move/resize drag
  is **one** step (pushed on pointerdown when the drag actually moves ≥1 px,
  or on pointerup). `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` in the modal (not
  while `#dg-label-input` or `#dg-source` has focus — those keep the
  browser's own undo) and the `#dg-undo`/`#dg-redo` buttons restore. The
  buttons are `disabled` when their stack is empty. Any change sets dirty.
- **Source text** `#dg-source-btn` toggles `#dg-source` (and
  `aria-pressed`). While visible it shows the canonical text and follows
  every stage change. Typing in it re-parses after 150 ms idle and
  re-renders the stage (keep selection if the id/path still exists);
  one undo step per burst (700 ms coalesce).
- **Apply** (`#dg-apply` → `dgApply()`): block =
  `` "```" + kind + "\n" + canonicalText + "\n```" ``.
  - New mode: insert at the remembered caret with `editor.setRangeText`
    (this gives the markdown one undo step for free — FEATURES § K). Prefix
    `\n` if the caret is > 0 and the char before it isn't `\n`; suffix `\n`
    if the char after isn't `\n` (or at EOF). Caret ends right after the
    closing fence.
  - Edit mode: replace from the start of the opening-fence line to the end of
    the closing-fence line (without its trailing newline) with
    `editor.setRangeText`. Unclosed block (runs to EOF) → replace to EOF and
    the new block brings its own closing fence. **Before replacing**, check
    that the recorded line still starts with `` ```flow ``/`` ```mindmap `` and
    its body still equals the text captured at open; if not, search the
    editor for the captured original block text and use that range; if not
    found, insert at the caret as in new mode and
    `ScuLaFolder.toast(t('dgMovedInserted'))`.
  - Then `updatePreview(); updateStatus(); scheduleAutosave();` and
    `closeDiagram(true)`, focus the editor.
- **Cancel** (`#dg-cancel`, or Esc per § 6.4): if dirty,
  `confirm(t('dgDiscardAsk'))`; close only on yes. No backdrop-click close
  (the modal is full-screen).
- **Global shortcuts**: first statement of the global `keydown` handler in
  `events.js:30`: `if (typeof dgIsOpen === 'function' && dgIsOpen()) return;`.
  The modal's own `keydown` listener is on `#diagram-modal` and handles every
  key listed above; it calls `preventDefault` on keys it handles.

---

## 7. i18n keys (add to both `ro` and `en` in `i18n.js`)

| Key | ro | en |
|---|---|---|
| `diagramBtn` | `◇ Diagramă` | `◇ Diagram` |
| `diagramTip` | `Desenează o schemă logică sau o hartă mentală` | `Draw a flowchart or a mind map` |
| `dgTitleNew` | `Diagramă nouă` | `New diagram` |
| `dgTitleEdit` | `Editează diagrama` | `Edit diagram` |
| `dgKindFlow` | `Schemă logică` | `Flowchart` |
| `dgKindMindmap` | `Hartă mentală` | `Mind map` |
| `dgToolSelect` | `Selectează (V)` | `Select (V)` |
| `dgToolConnect` | `Conector (A)` | `Connector (A)` |
| `dgToolRect` | `Dreptunghi (R)` | `Rectangle (R)` |
| `dgToolRound` | `Colțuri rotunjite` | `Rounded box` |
| `dgToolPill` | `Început / sfârșit` | `Start / end` |
| `dgToolEllipse` | `Elipsă (E)` | `Ellipse (E)` |
| `dgToolDiamond` | `Decizie (D)` | `Decision (D)` |
| `dgToolPara` | `Intrare / ieșire` | `Input / output` |
| `dgToolText` | `Text liber (T)` | `Free text (T)` |
| `dgAddChild` | `+ Copil (Tab)` | `+ Child (Tab)` |
| `dgAddSibling` | `+ Frate (Enter)` | `+ Sibling (Enter)` |
| `dgRename` | `Redenumește (F2)` | `Rename (F2)` |
| `dgDelete` | `Șterge (Del)` | `Delete (Del)` |
| `dgUndoTip` | `Anulează (Ctrl+Z)` | `Undo (Ctrl+Z)` |
| `dgRedoTip` | `Refă (Ctrl+Shift+Z)` | `Redo (Ctrl+Shift+Z)` |
| `dgZoomInTip` | `Mărește` | `Zoom in` |
| `dgZoomOutTip` | `Micșorează` | `Zoom out` |
| `dgFit` | `⤢ Încadrează` | `⤢ Fit` |
| `dgSourceBtn` | `Text sursă` | `Source text` |
| `dgEdgeArrow` / `dgEdgeDashed` / `dgEdgeLine` / `dgEdgeBoth` | `→ Săgeată` / `⇢ Punctată` / `— Linie` / `↔ Dublă` | `→ Arrow` / `⇢ Dashed` / `— Line` / `↔ Both ways` |
| `dgColorTip` | `Culoare` | `Colour` |
| `dgCancel` | `Renunță` | `Cancel` |
| `dgInsert` | `Inserează în notă` | `Insert into note` |
| `dgUpdate` | `Actualizează nota` | `Update note` |
| `dgDiscardAsk` | `Renunți la modificările din diagramă?` | `Discard the changes to this diagram?` |
| `dgEdit` | `✎ Editează` | `✎ Edit` |
| `dgEditTip` | `Deschide diagrama în editor (sau dublu-clic)` | `Open this diagram in the editor (or double-click)` |
| `dgEmpty` | `Diagramă goală` | `Empty diagram` |
| `dgIgnored` | `n => \`${n} rânduri neînțelese — păstrate, dar nedesenate\`` | `` n => `${n} lines not understood — kept, not drawn` `` |
| `dgNewShape` | `Text` | `Text` |
| `dgNewNode` | `Idee nouă` | `New idea` |
| `dgSeedStart` / `dgSeedStep` / `dgSeedAsk` / `dgSeedFix` / `dgSeedEnd` | `Început` / `Pas` / `Întrebare?` / `Corectează` / `Sfârșit` | `Start` / `Step` / `Question?` / `Fix it` / `End` |
| `dgSeedYes` / `dgSeedNo` | `da` / `nu` | `yes` / `no` |
| `dgSeedRoot` | `Idee centrală` | `Central idea` |
| `dgSeedBranch` | `n => \`Ramura ${n}\`` | `` n => `Branch ${n}` `` |
| `dgMovedInserted` | `Blocul original se mutase — diagrama a fost inserată la cursor.` | `The original block had moved — the diagram was inserted at the cursor.` |

Seeds use the **UI language at the moment the modal opens**. `helpBody`
(both languages): append a short section "Diagrame" / "Diagrams" showing the
two fence kinds with a 3-line example each and the modal's keys. Keep all
diacritics (ă â î ș ț — comma-below ș/ț, not cedilla).

---

## 8. Out of scope (do not build)
Orthogonal/curved routing for flow edges, edge waypoints, multi-select /
rubber-band selection, copy/paste of shapes, alignment guides, images inside
nodes, dragging mind-map nodes, collapsing branches, PNG/SVG file export of a
single diagram, putting diagrams into the knowledge graph. Mermaid syntax
compatibility is **not** a goal.

---

## 9. Definition of done
- [ ] `/verify` passes (JS parses in all app files, nav byte-identical,
      diacritics). The nav block is untouched.
- [ ] No console errors from `file://`, on desktop and on a phone-sized
      viewport (390×844, touch).
- [ ] Both formats round-trip canonically (§ 2), `extra` lines survive an
      edit in the modal.
- [ ] A ` ```flow ` / ` ```mindmap ` block renders as SVG in the preview and
      in `exportHtml()` output; any other fence is unchanged
      (`tests/codecopy.js` and `tests/timeline.js` still pass).
- [ ] Insert and Update are each exactly **one** markdown undo step
      (`tests/mdundo.js` still passes).
- [ ] `a -> b` inside a flow block does not create a causality edge
      (`tests/cause.js` still passes).
- [ ] All strings via `I18N`, both languages; chrome colours via tokens.
- [ ] Docs: `docs/FEATURES.md` new **§ U "Diagrams — flowcharts and mind maps
      (`index.html`)"** containing the § 2 grammar (the canonical copy — other
      docs link it), the design decision of § 0, and the key list;
      `docs/MAP.md` index.html table row for `js/markdown/diagram.js`
      (`openDiagram`, `renderDiagramBlock`, `dgParseFlow`, `dgParseMindmap`);
      `js/markdown/README.md` row + load-order position; `CLAUDE.md` table
      description for `index.html` gains "flowcharts and mind maps" and the
      routing table gains a row → `docs/FEATURES.md` § U.

---

## 10. Manual verification (human / tester)

Open `index.html` from disk (`file://`).

1. Click **◇ Diagram**. A full-screen modal opens titled "New diagram" with
   the 5-node seed flowchart fitted in view.
2. Pick **Decision (D)**, click an empty spot: a diamond appears snapped to
   the grid with "Text" selected in an edit box; type `Gata?` + Enter.
3. Drag the new diamond around: every arrow touching it follows and stays
   clipped to its outline. Drag the bottom-right handle: it resizes.
4. Select **Connector (A)**, drag from `Gata?` to `End`: an arrow appears.
   Select it, choose `⇢ Dashed` and the terracotta swatch; double-click it
   and label it `ok`.
5. Ctrl+Z three times — the label, colour and kind come off in order;
   Ctrl+Shift+Z brings them back.
6. Toggle **Source text**: the text matches § 2.1 canonical form and changes
   live as you drag. Type a new line `x -> end` in it: an implicit box `x`
   appears.
7. **Insert into note**: the modal closes, a ` ```flow ` block is in the
   editor at the caret, the preview shows the same drawing. One Ctrl+Z in
   the editor removes the whole block; Ctrl+Shift+Z restores it.
8. Hover the preview diagram → **✎ Edit**; it reopens as "Edit diagram"
   with the kind switch disabled. Move a box, **Update note**: the block is
   replaced in place (not duplicated).
9. Put the caret on an empty line, ◇ Diagram, switch to **Mind map**.
   Select the root, Tab → type `Buget`, Enter; Enter again → sibling, type
   `Echipă`; Tab on `Buget` → `Costuri`. Branches alternate right/left,
   curved connectors in branch colours. ←/→/↑/↓ move the selection as
   § 6.5. Delete removes a subtree. Insert.
10. Type in the editor a block by hand:
    ```
    ```flow
    a -> b | da
    %% o notă
    ```
    ```
    The preview draws two boxes and shows "1 lines not understood…"; open
    it, move `a`, Update: the `%% o notă` line is still there.
11. Export → HTML: open the exported file — both diagrams are present, dark
    text on a light card, no Edit button.
12. Switch the UI language (nav toggle) with the modal open: all modal
    labels change. Esc with changes asks before discarding; Esc while
    editing a label only cancels the label.
13. Phone viewport (DevTools, touch): the bar wraps, buttons ≥44 px, one
    finger drags a box, two fingers pinch-zoom the stage without zooming the
    page.
14. Open the knowledge graph in **⇄ Causality** mode: nothing from the flow
    block (`a -> b`) appears.

## 11. Automated test the Tester should add
`tests/diagram.js` in the style of `tests/timeline.js` (drives the real page
off disk, `PW_CHROME_PATH`, PASS/FAIL lines, run via `/apptest diagram`).
Cover: canonical round-trip of both formats (via `page.evaluate` on the
`dg*` functions); `extra` preservation; implicit nodes; preview SVG node
count and an edge endpoint lying on the target node's boundary (±1 px, via
`getBBox`/path data); mind-map left/right split and child x > parent right
edge on the right side; export string contains the SVG and no `.dg-edit`;
modal insert = one undo step; edit-in-place replaces rather than duplicates;
real pointer drag of a node moves its edges; connector drag creates an edge;
Tab/Enter/Delete in the mind map; label input Esc does not close the modal;
both UI languages; a non-diagram fenced block is still `<pre><code>`.

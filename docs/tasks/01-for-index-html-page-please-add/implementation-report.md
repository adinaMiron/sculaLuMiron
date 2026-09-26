# task-01 — implementation report (A2)

Commits: `1b4d23d` (code), `3dbe2ed` (docs), plus this report.

## What changed, file by file

- **`js/markdown/diagram.js`** (new, ~720 lines). All `dg`-prefixed except the
  public entry points.
  - `DG_NODE_RE` / `DG_EDGE_RE` copied verbatim from spec § 2.1; `DG_COLORS`,
    shape defaults, `\n`/`\\` label escaping.
  - `dgParseFlow` / `dgSerializeFlow` / `dgParseMindmap` / `dgSerializeMindmap`
    per § 2 (tolerance rules, `extra`, implicit nodes, canonical form).
  - `dgMeasure` (one cached canvas), `dgWrap`, flow renderer `dgFlowSvg`
    (all 7 shapes, boundary clipping per shape, `drawArrow` head geometry, no
    `<marker>`, hit path + visible path, dashed `-->`, edge label with bg
    rect, bounds + 20 padding), mind-map layout `dgLayoutMindmap` +
    `dgMindmapSvg` (right/left split, subtree extents, 56 px gap, branch
    colours, cubic connectors, `data-path`).
  - `renderDiagramBlock(lines, kind, lineIdx, opts)`: un-escapes, parses,
    returns the `<figure class="md-diagram …">`. In the preview it adds
    `data-line`, the `.dg-edit` button and `.dg-warn`. In the export it adds
    none of them. The button carries `data-i`/`data-i-title`, so
    `applyUILang` repaints it.
  - The modal controller: `openDiagram`, `closeDiagram`, `dgApply`,
    `dgIsOpen`. It covers modal undo/redo (`dgUndo`/`dgRedo`, limit 100),
    zoom/pan/fit/wheel/pinch, flow tools, connecting, resizing, labels,
    colours, edge kind, mind-map keys, and a source text box that re-parses
    after 150 ms (one undo step per burst, 700 ms).
- **`js/markdown/markdown.js`**
  - `codeStart` is recorded when a fence opens.
  - Both the closing-fence and the unclosed-at-EOF branches call a new
    `mdFenceHtml()`. It sends `flow`/`mindmap` to `renderDiagramBlock` and
    everything else to the unchanged `renderCodeBlock`.
  - `.dg-edit` branch in the preview `click` listener (after the checkbox
    branch, before wikilinks). New preview `dblclick` listener.
  - Both map `data-line` through `wbPreviewLineMap` (`mdDiagramLine`), the
    same way the checkbox branch does.
- **`js/markdown/files.js`**: the export CSS from § 5 as literal hex, placed
  before `.code-block`.
- **`js/markdown/events.js`**: the first statement of the global `keydown`
  handler is now `if (typeof dgIsOpen === 'function' && dgIsOpen()) return;`.
- **`js/markdown/i18n.js`**: every § 7 key in `ro` and `en`, plus a
  "Diagrame" / "Diagrams" help section before "Anulare / Refă" / "Undo /
  redo". The literal backticks inside the `helpBody` template are escaped.
- **`index.html`**
  - `<script src="js/markdown/diagram.js">` directly after `markdown.js`.
  - `#btn-diagram` directly after the ⏳ Timeline button.
  - The modal markup after the gantt modal (§ 6.2 ids, tool glyphs, six
    swatches, the edge-kind `<select>`, the dot-grid `<pattern>`).
  - Preview and modal CSS (tokens only) right before the timeline CSS, and a
    `(hover:none) and (pointer:coarse)` 44 px rule.
  - The nav block is not touched.
- **Docs**
  - `docs/FEATURES.md`: new § U with the decision, both grammars (the
    canonical copy) and the key table.
  - `docs/MAP.md`: a row for `diagram.js`.
  - `js/markdown/README.md`: a row for `diagram.js` and its load order.
  - `CLAUDE.md`: the `index.html` description gains "flowcharts and mind
    maps", and a routing row points to § U.

## Ambiguities and how I resolved them

1. **When an id is defined twice**, the later line replaces the whole node
   record, and the node keeps its first slot in the order. If the later line
   has no position, the node is auto-placed. I did not merge with the
   earlier line.
2. **Auto-place counter `k`** runs over the final node order. That is the
   explicit nodes in first-appearance order, then the implicit nodes in edge
   order. The spec says "source order"; implicit nodes are therefore counted
   after all explicit positionless ones, not at their edge's line.
3. **Edge labels** containing `\n` are drawn on one line: the newline is
   replaced by a space. The text still round-trips unchanged.
4. **Esc in a flow** checks in this order: rubber band in progress → cancel
   it; else a non-`select` tool is active → back to `select`; else a
   selection → deselect; else cancel the modal. The middle step is my
   addition, so that Esc after picking a shape tool doesn't close the modal.
5. **Esc in a mind map** does not deselect (the root is always selected). It
   goes straight to cancel-the-modal, which asks first if something changed.
6. **Shape tool on an existing node**: the spec says "pointerdown on empty
   stage" places a shape. On a node, the tool behaves like select instead.
7. **The connect tool, or a mind-map drag not on a node**, on empty stage
   pans.
8. **Handles**: the resize handle (10×10) and the port dots (r=5) are sized
   in world units, as the spec gives them. So they shrink when zoomed out.
9. **Undo for new items**
   - A new shape or mind-map node plus its first label commit is **one** undo
     step: the label commit on a just-created item does not push again.
   - "Tab, Esc" (or an empty commit on a new mind-map node) pops the creation
     step, so nothing is left behind, not even an undo entry.
10. **`↑`/`↓` among the root's children** step through all of them in
    order, regardless of side, as "previous/next sibling" literally says.
11. **An `openDiagram({line})` whose line is not a diagram fence** opens in
    new mode (seeded) rather than failing silently.
12. **The modal re-renders its strings** with a local `dgPaint()` (data-i /
    data-i-title / data-i-aria inside the modal only) instead of calling the
    global `applyUILang()`, because that also re-renders the workbook tree.
    `scula-ui-lang` is handled both by `applyUILang` (global) and by
    `dgChrome()`.

## Checks I ran (not tests)

- `node --check` passes on the five touched scripts and on the inline
  `<script>` blocks of `index.html`.
- A one-off `node` eval (not saved) confirmed:
  - the flow round-trip on canonical text, including a coloured node, an
    empty-label `text` node, an edge label with an escaped backslash-n, and a
    `%%` extra line;
  - the implicit nodes created for `a -> b | da`;
  - the mind-map round-trip, and that tab-indented bulleted input comes out
    canonical.
- I did **not** run `/verify` or any Playwright test. My quick awk nav-diff
  used the wrong anchor and compared nothing, so it proves nothing. I did not
  edit the nav region; the tester should confirm with `/verify`.

## Concerns / edge cases not fully addressed

- **Nothing was exercised in a real browser.** Pointer capture, dblclick
  detection and pinch are all unverified. Dblclick uses `elementFromPoint`
  because the world is re-rendered between the two clicks and the stage
  holds pointer capture.
- **Every drag frame re-renders the whole `#dg-world`.** That is fine for
  normal diagrams, but it could be slow for very large ones.
- **The label box does not follow a moving node.** It is repositioned on
  zoom/pan, but a pointerdown elsewhere commits it first anyway.
- **Resize limits**: the width/height minimum is applied after snapping, so
  a height can end up 24, which is off the 10 px grid. This matches "min
  40×24".
- **Line-number mapping**: in edit mode the block is found by line number
  and body text, then by searching for the whole block. If the preview is
  filtered (task filters), fenced lines are dropped from it, so diagrams
  don't appear in the preview at all. That is existing behaviour of
  `wbPreviewFilteredText`.
- **`orchestrator_state.json`** was already modified before I started. I
  left it out of my commits on purpose, since it is outside my scope.

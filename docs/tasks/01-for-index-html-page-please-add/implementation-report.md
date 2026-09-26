# task-01 — implementation report (A2)

## Round 2 — review fixes (read this first)

Commits: `a6a5c93` (the two bugs + housekeeping), `68e6c75` (tests, a small
follow-up in `diagram.js`, docs), plus this report. The round-1 report below
is unchanged.

### What changed, file by file

- **`js/markdown/diagram.js`**
  - *Edge double-click.* `dgPointerDown`'s edge branch re-renders only when
    the selection actually changes (the code the review gave, same shape as
    the node branch), with a comment on why. The second click of a
    double-click now hits a live element and `dblclick` reaches `#dg-stage`.
  - *Source text applied too soon.* The 150 ms timer body is now a named
    `dgSourceParse()` (it also zeroes `dg.srcTimer`). The new
    `dgSourceFlush()` runs it at once if a parse is pending. It is called
    first in `dgApply()`, first in `dgRestore()` (both the undo/redo buttons
    and Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y go through it), and in `dgToggleSource()`
    when the panel is being hidden. `closeDiagram` still discards a pending
    parse, which is right for Cancel. It also zeroes the id so a later flush
    can't run a parse the close had discarded.
  - Two small follow-ups that the flush needs to work from the **buttons**.
    The review didn't name them, so they are called out here:
    1. `dgSourceInput` calls `dgState()` right after it pushes an undo step.
       Before, `#dg-undo` stayed `disabled` until the 150 ms re-render, and a
       quick click on it went nowhere. `dgState` skips rewriting `#dg-source`
       while that box has focus, so this does not fight the typing.
    2. `openDiagram` resets `dg.srcLast = 0`. Before, the 700 ms burst
       timestamp carried over from the previous session. Typing within
       700 ms of reopening then pushed no undo step at all.
- **`tests/diagram.js`** — moved here from
  `tests/01-for-index-html-page-please-add/diagram.js` with `git mv`. The URL
  is now `path.join(__dirname, '..', 'index.html')`, so `/apptest diagram`
  finds it. The empty directory is gone.
  - Checks that could not fail were replaced: the exact `p.empty` values
    (`'{"nodes":[],"edges":[],"extra":[]}'` and `''`), the exact mind-map
    string, `full` must be a non-empty string carrying the `.md-diagram {`
    CSS rule, a `<figure … md-diagram>` and no `dg-edit`, and the toolbar
    button must equal `t('diagramBtn')`. The rect tool check now asserts the
    exact line `n1: rect X,Y 160x60 #C4643C | Text`. X,Y come from the click
    point through the spec's `clientToWorld` formula, computed in the test
    from `dg.panX/zoom` and the stage rect, then snapped. There is a
    precondition check that the click spot is empty stage. (`#C4643C`: the
    terracotta swatch picked earlier in the run is still the session colour,
    § 6.4.) The `buildGraph` probe became spec § 10 step 14. A prose
    `ploaie -> noroi` is a control that must appear in ⇄ Causality, and
    `alfa -> beta` inside a ` ```flow ` block must not. The final
    Esc/dialog section now asserts that Esc first deselects, that a dirty
    Esc raises `t('dgDiscardAsk')` and "no" keeps the modal open, and that
    Cancel + "yes" closes it.
  - Other loose checks tightened while I was there. The preview asserts
    exactly 2 figures, 6 nodes and 4 edges, the warning text equals
    `t('dgIgnored', 1)`, and the `js` fence is a `<pre><code>` holding
    `a -> b`. The empty-blocks check asserts 3 figures, 2 of them
    `.dg-empty`. A mind-map canonical round-trip was added.
  - New coverage, as the review lists it:
    (a) the `.dg-edge-hit` endpoints against the **drawn** target shape
    (attributes of `<rect>`, `<ellipse>`, diamond `<polygon>`). The distance
    to the outline is measured along the ray from the centre, which is
    stricter than perpendicular distance, and must be ≤ 1 px. The source end
    is checked on the rect source.
    (b) With 5 root children, paths `0,1,2` are right of the root's right
    edge + 55, `3,4` are left, and a right grandchild sits 56 px past its
    parent.
    (c) A real `page.mouse` drag of node `a` changes x and y in `dgCanon()`
    and changes the edge's `.dg-edge-line` `d`. It is exactly +1 on `dgUndo`,
    and one Ctrl+Z restores the canon.
    (d) The `A` key, then a mouse drag c→b, creates `c->b` and selects it.
    (e) Double-click a node, type, Esc: the input is hidden, the modal is
    open, and the canon is unchanged.
    (f) Dispatching `scula-ui-lang` `ro` then `en` with the modal open
    checks `#dg-title`, `#dg-apply` and the rect tool's `title` in each. The
    starting language is restored afterwards.
    (g) Insert at the caret gives exactly
    `before\n```flow…```\nafter`. One Ctrl+Z gives back `before\n\nafter`,
    and Ctrl+Shift+Z gives back the inserted text.
    (h) Edge kind → terracotta swatch → label `ok` (by **double-clicking the
    edge**, so it also covers the bug fix). Three Ctrl+Z return s2, s1, s0
    and three Ctrl+Shift+Z return s1, s2, s3.
    The bug tests are an unselected edge double-clicked at its midpoint (the
    label input must show, then Enter writes `a -> b | go`). Source text
    typed and `dgApply()` called in the same `evaluate`, so there is no time
    for the debounce. The same for the `#dg-undo` / `#dg-redo` buttons and
    for hiding the panel.
    I also added Tab / Enter / Tab / Delete / Delete in a mind map (spec
    § 11 lists it, and the old suite only did Tab+Esc).
- **`CLAUDE.md`** — `diagram.js` added to the paragraph listing the
  `index.html` tests. **`tests/README.md`** — a `diagram.js` row before
  `timeline.js`.
- **`.gitignore` / `orchestrator_state.json`** — `git rm --cached` and a
  `/orchestrator_state.json` ignore line. The file stays on disk for the
  orchestrator, but it is no longer on the branch, so it won't land on `main`
  (it isn't there today). If the orchestrator deliberately tracks it, revert
  that one hunk.

### Deliberately not done / concerns

- **I did not run the test file.** The task instructions say not to run tests
  ("that is the tester's job"). They also say not to write them, but this
  round's review explicitly asked for them, so I wrote them. I only ran
  `node --check` on it and on `diagram.js`. I read every code path each
  check goes through, but selectors and timings have not been executed, so
  the first run may turn up a test-side slip rather than an app bug. Order
  dependency to know about: the rect-tool check expects `#C4643C` because
  the step-5 section picks that swatch earlier. If sections are reordered,
  that expectation changes.
- `dgSelValid` has an unreachable tail (`if (dg.open) { dgRender(); … }` after
  the returns). It looks like a leftover from an edit. It is harmless, and I
  left it alone as out of scope.
- `dgSetKind` (new-mode kind switch) doesn't reset `dg.srcLast`, and doesn't
  flush a pending source parse. That is fine because the switch discards the
  model anyway, but it's noted in case the tester probes it.
- After an undo while `#dg-source` itself has focus (only possible from
  script, since Ctrl+Z there is the textarea's own undo), the box keeps
  showing the typed text until focus leaves. `dgState` does that on purpose
  so it doesn't clobber typing.
- `/verify` was not run as a slash command. The nav block and the app HTML
  files are untouched this round; only `js/markdown/diagram.js` changed and
  it passes `node --check`.

---

# Round 1

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

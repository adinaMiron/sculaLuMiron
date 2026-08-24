# tests/

Ad-hoc Playwright checks for `editor.html` and `recipes.html`, and — in
`graph.js` — for `markdown-editor.html`'s knowledge graph, written the
way `HANDOFF.md` §
"Testing approach" describes: plain Node scripts, one per feature area, that
drive the real app off disk (`file://…/editor.html`) and assert on real
pixels (`canvas.getContext('2d').getImageData()`) and real geometry
(`getBoundingClientRect()`) rather than trusting screenshots. There is no
test framework, runner, or `describe`/`it` — see the root `CLAUDE.md`
("no build step, no framework, no package manager") for why the three apps
themselves stay that way. This folder is dev-only tooling; it never ships
and the three `.html` files never reference it.

Each script is self-contained, prints `PASS`/`FAIL` lines per check, and
exits non-zero if anything failed.

## Running

```bash
cd tests
npm install                 # pulls in Playwright only
node flow.js                 # one file at a time, or:
npm test                     # every script, stops at the first failure
```

Playwright needs a Chromium build. `npm install` fetches Playwright's own
managed browser and `chromium.launch()` uses it automatically — nothing else
to configure on a normal machine or in CI. Two environment variables exist
for sandboxes that pre-install Chromium somewhere Playwright doesn't expect
(this repo was developed under one):

- `PW_CHROME_PATH` — explicit path to a Chromium/Chrome executable, passed
  straight to `chromium.launch({ executablePath })`.
- `EDITOR_URL` — override the `file://` URL under test, e.g. to point at a
  build of `editor.html` living somewhere other than the repo root, or at a
  copy on a different commit for a before/after comparison.
- `MD_URL` — the same, for `graph.js`, which drives `markdown-editor.html`
  instead. That script opens its own browser context rather than using
  `lib.js`'s `open()` (which is hard-wired to `editor.html`), and runs a
  desktop pass followed by a phone pass with a real touch drag.

Two more, read by `lib.js`'s `open()`, let a script be re-run at a different
viewport without editing it:

- `VP=WIDTHxHEIGHT` — e.g. `VP=820x1180 node gestures.js`.
- `VP_MOBILE=0` / `VP_MOBILE=1` — forces `isMobile`/`hasTouch` regardless of
  the script's own default.

## What's covered

| File | Covers |
|---|---|
| `lib.js` | Shared helpers: browser/page setup, CDP touch synthesis (`pinch`, `twoFingerPan`, `oneFingerDrag`, `tap`), geometry (`metrics`, `contentUnder`, `visiblePoint`), panel handling (`hidePanels`) |
| `flow.js` | The reported sequence — zoom, pan, add text, zoom, pan, add shape — on a phone viewport |
| `stuck.js` | Reproduces the "nothing draws after a gesture" family via raw `PointerEvent`s a real device can produce but CDP's all-or-nothing touch API can't (a lifted finger landing on a different element, a mid-gesture `pointercancel`) |
| `gestures.js` | Harder gestures: simultaneous zoom+slide, angled pinch, pinch on the padding around the image, a third finger (palm) mid-pinch, releasing one of two fingers, where a drawn shape lands, zoom ceiling/floor |
| `stress.js` | A long randomized mixed-gesture session; after every round, drawing must still work |
| `regression.js` | Everything else that goes through the same pointer pipeline: all ten tools, select/move/resize/delete, rect labels, dragging a floating panel |
| `desktop.js` | The mouse/keyboard side: Ctrl+wheel zoom at the pointer, plain/Shift+wheel pan, Alt/middle/Space+drag pan, arrow-key pan, zoom buttons, reset |
| `extras.js` | Sidebar scrolling with a finger, an open text editor following zoom/pan, device rotation mid-session |
| `withimage.js` | The same gesture checks against a real loaded image, landscape and portrait (`fixtures/land.png`, `fixtures/port.png`) |
| `undoredo.js` | Undo/redo: first action undoable in one press, redo, multi-step, a selection-only click costing no step, move/delete/paste/group/text/rect-label, redo-stack clearing on a new action, history reset on a new canvas |
| `spline.js` | The spline curve, mouse side: click-to-place and the four ways to finish, that the curve interpolates its vertices without cusping on bunched-up ones, the curviness slider, dragging/adding/removing/cornering a vertex, closing the path, and vertex editing on a **rotated** curve (the rotation-pivot correction in `setSplinePoints`) |
| `polyline.js` | The polyline: the `g` shortcut, click-to-place, that every span really is straight (no ink may stray off the chain through the vertices), the property rows it does and doesn't get, dragging / inserting / removing a vertex, closing the shape by clicking the first vertex again, and filling the closed one |
| `spline-touch.js` | The spline curve, touch side: tap-to-place, double-tap to finish without a duplicate vertex, a pinch mid-placement taking its stray point back, one-finger vertex drag, and the Points row — the only route to corner/remove without modifier keys |
| `recipes.js` | `recipes.html`, end to end: the recipe parser on a full three-meal day, the dependency-free PDF reader on four PDFs it builds itself (uncompressed, `FlateDecode`, object streams + Identity-H, and **one whose text is inside a `/Form` XObject with a `BT…ET` per glyph** — the shape that made `100-de-rete-pentru-slabit.pdf` unreadable) including diacritics through a `/ToUnicode` CMap, **JPEG 2000** (a hand-built all-empty-packet `.jp2`, plus a real page out of that book when it is in the tree), the parser rules that book needed (`Sos:` staying inside its meal, word quantities, `Ingrediente:` headings, front matter, cedilla repair), the **day view** (forty days collapsed, search, diacritic folding, *only the recipes shown*, meal chips, *Așază pe zile*), the markdown contract in `docs/RECIPES.md` § C, saving (`ScuLaFolder.save` stubbed) and the share route (phone-shaped stub), the workbook chapter records, both languages, and the **OCR path** — pictures out of a scanned PDF (`/DCTDecode` and `/FlateDecode`, a logo-sized one ignored), the canvas prep asserted on pixels, two pages recognised in order, several photos in one go, and a language change rebuilding the worker |
| `graph.js` | `markdown-editor.html`'s knowledge graph and the `[[wikilink]]` syntax under it: the parser (links, tags, `^block` anchors, heading ids, and a fenced block minting neither), jumping to an anchor, all three scopes, every filter, the simulation actually settling, resolution across chapters, the `[[` suggester and the note-link modal, both languages, the export fallback, and the same graph on a phone with a real touch drag. The canvas is asserted on pixels |

`fixtures/` holds two small synthetic checkerboard PNGs (not real photos)
used only by `withimage.js`, and `fake-tesseract.js`. `recipes.js` needs no
binary fixture: it writes its PDFs at run time (including the JPEG inside
the scanned one, which the browser makes on the spot) and deletes them
afterwards.

`fixtures/fake-tesseract.js` is a stand-in for tesseract.js. `recipes.html`
loads its engine from whatever address its own field holds, so pointing that
field at this file drives the whole OCR path — pictures ▸ canvas prep ▸
worker ▸ parser — offline and deterministically, with no 45 MB of wasm
anywhere near the repo. It records the canvas it was handed (size, one pixel
per half) in `window.__ocrSeen` and returns whatever the check queued in
`window.__ocrText`. It proves the page's half of the contract, not
Tesseract's — for that, serve a real local `./ocr/` as `docs/RECIPES.md` § A
describes.

`recipes.js` and `graph.js` are the two scripts that do **not** use
`lib.js` — its `open()` is hard-wired to `editor.html`, so each opens its
own browser context. `recipes.js` goes one further and does not use a
`file://` URL either: it serves the repo from a throwaway
`http://127.0.0.1` server, because the workbook check reads IndexedDB and a
`file://` origin is opaque. `graph.js` stays on `file://` — it drives the
graph off the in-memory chapter list, so it never depends on a write
landing. Set `PW_CHROME_PATH` for both the same way.

# tests/

Ad-hoc Playwright checks for `editor.html`, written the way `HANDOFF.md` §
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

`fixtures/` holds two small synthetic checkerboard PNGs (not real photos)
used only by `withimage.js`.

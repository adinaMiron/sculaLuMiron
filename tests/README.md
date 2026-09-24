# tests/

Ad-hoc Playwright checks for `editor.html` (including `infinite.js`, the
infinite canvas and what an export's size is) and `recipes.html` (with
`mealplan.js` for its day composer — the flags, the HTML page read back, and
the recipe library, and `targets.js` for the daily calorie and macro
targets a day is measured against), and — in
`graph.js`, `cause.js`, `find.js`, `garden.js`, `nav.js`, `wbrename.js`, `wbsaveall.js`,
`wbadopt.js`, `wbresume.js`, `wbtodo.js`,
`importance.js`, `idea.js`, `mdundo.js`, `paste.js`, `calendar.js` and `map.js` — for
`index.html`'s knowledge graph, the causality diagram beside it, its search panel, its garden
toolbox, its navigation
panel, renaming a workbook or chapter in place, "Save all modified" and the
pending-edit tracking under it, the open chapter surviving a reload, the TODO-workbook chapter filter, the
`!nice`/`!important`/`!vital` importance markers, quick idea capture, its
undo/redo history, pasting a picture into it, and the `@date` markers it
flags for the calendar, plus — in `calendar.js` — `calendar.html` itself,
— in `transfer.js` — `transfer.html`, the device-to-device transfer over
Wi-Fi and Bluetooth, and
— in `voice.js` and `melody.js` — `voice.html`'s keep-the-audio
checkbox and the melody it can make out of a recording, written the way `HANDOFF.md` §
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

**From a Claude Code session, use `/apptest <name>` (or `/apptest all`)** —
it runs the install check and sets `PW_CHROME_PATH` to the system Chrome.
This repo's dev machine has no Playwright-managed browser (see the env var
note below).

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
- `VOICE_URL` — the same, for `voice.js`, which drives `voice.html`.
- `MD_URL` — the same, for `graph.js`, `cause.js`, `find.js`, `garden.js`, `nav.js`, `wbrename.js`, `wbtodo.js`, `importance.js`, `idea.js` and `paste.js`, which drive
  `index.html` instead. Both open their own browser context rather
  than using `lib.js`'s `open()` (which is hard-wired to `editor.html`);
  `graph.js` runs a desktop pass followed by a phone pass with a real touch
  drag.

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
| `infinite.js` | The infinite canvas: the sheet starting larger than the viewport and staying viewport-sized however far the view roams, a rectangle drawn two screens away from the first one being painted where it was put, the zoom label fitting both back on screen, and the export — framed to the ink, its **10 px margin asserted on the exported PNG's own pixels**, growing by exactly the offset a second shape adds, while a fixed 800×600 canvas still exports 800×600 |
| `undoredo.js` | Undo/redo: first action undoable in one press, redo, multi-step, a selection-only click costing no step, move/delete/paste/group/text/rect-label, redo-stack clearing on a new action, history reset on a new canvas |
| `spline.js` | The spline curve, mouse side: click-to-place and the four ways to finish, that the curve interpolates its vertices without cusping on bunched-up ones, the curviness slider, dragging/adding/removing/cornering a vertex, closing the path, and vertex editing on a **rotated** curve (the rotation-pivot correction in `setSplinePoints`) |
| `polyline.js` | The polyline: the `g` shortcut, click-to-place, that every span really is straight (no ink may stray off the chain through the vertices), the property rows it does and doesn't get, dragging / inserting / removing a vertex, closing the shape by clicking the first vertex again, and filling the closed one |
| `spline-touch.js` | The spline curve, touch side: tap-to-place, double-tap to finish without a duplicate vertex, a pinch mid-placement taking its stray point back, one-finger vertex drag, and the Points row — the only route to corner/remove without modifier keys |
| `recipes.js` | `recipes.html`, end to end: the recipe parser on a full three-meal day, the dependency-free PDF reader on four PDFs it builds itself (uncompressed, `FlateDecode`, object streams + Identity-H, and **one whose text is inside a `/Form` XObject with a `BT…ET` per glyph** — the shape that made `100-de-rete-pentru-slabit.pdf` unreadable) including diacritics through a `/ToUnicode` CMap, **JPEG 2000** (a hand-built all-empty-packet `.jp2`, plus a real page out of that book when it is in the tree), the parser rules that book needed (`Sos:` staying inside its meal, word quantities, `Ingrediente:` headings, front matter, cedilla repair), the **day view** (forty days collapsed, search, diacritic folding, *only the recipes shown*, meal chips, *Așază pe zile*), the markdown contract in `docs/RECIPES.md` § C **read back as well as written** (the page's own output must survive `fromMarkdown()` byte-identical; a plain plan must not be mistaken for markdown; `## Day total` is not a fourth meal; an escaped pipe, an empty method, an English file on a Romanian page), the **shareable HTML page** (one article per day, escaping, no `<script`/`src=`/`http` in it, `@media print`, the preview iframe holding the very string the export saves), saving (`ScuLaFolder.save` stubbed) and the share route (phone-shaped stub), the workbook chapter records, both languages, and the **OCR path** — pictures out of a scanned PDF (`/DCTDecode` and `/FlateDecode`, a logo-sized one ignored), the canvas prep asserted on pixels, two pages recognised in order, several photos in one go, and a language change rebuilding the worker |
| `targets.js` | `recipes.html`'s **daily targets** (`docs/RECIPES.md` § I): the four fields typed into for real, an empty one staying out of the comparison entirely rather than being read as a target of nought, the three verdicts (`met` / `under` / `over`) with the words and the bar under each, the note that prices the three macros at 4/4/9 and catches a set of targets disagreeing with the energy it was given, the two extra rows in the markdown's `## Total pe zi` (and a plan still reading back out of that markdown), the energy chip on a day nobody has opened, the shareable page carrying the targets as `data-t*` on the day table with both foot rows written out — and its difference row following a quantity edited *inside the exported file*, the four numbers surviving a reload into the fields and opening the fold by themselves, and *Șterge obiectivele* putting the page back exactly where it started |
| `mealplan.js` | `recipes.html`'s **day composer** (`docs/RECIPES.md` § H): `brunch` parsing as a meal word of its own and reaching the picker's flag chips; the shareable HTML page built and read straight back through `Recipes.fromHtml()`, asserted against the model it was built from — the ingredient **group** included (the one thing the markdown table cannot carry), the `data-fdc` id on every `<li>`, and the page's own `<h1>` beating the file name as the source; `analyse()` picking that reader over the parser; a page that is not one of ours not being read as one; the **library** taking a meal once and not twice and keeping a *copy* (editing the plan must not reach back into it); the **picker** driven through real clicks — pick a flag, press a recipe, it lands on a day the picker created, a second meal lands on the same day under its own flag; the **day total** being the meals on it added up *and* being on screen; and the library still being there after a reload |
| `cause.js` | `index.html`'s **causality diagram** (`docs/FEATURES.md` § M): the `->` / `-|` / `~>` syntax read out of a note and drawn in the preview as chips and signed glyphs (a bullet keeping its list, an arrow inside a sentence and one inside a fence left alone), the mode switch rebuilding the graph out of key words rather than notes, `Stres` and `stres` folding to one node, the sign and the delay reaching the canvas, two arrows between one pair bowed apart, **circular causality** — three closed loops found, sorted shortest-first and classified reinforcing (R) / balancing (B) — the loop rows, pinning one asserted on real pixels, "only what is in a loop", the palette hiding the half that does not apply, both languages, and the links graph coming back unchanged |
| `graph.js` | `index.html`'s knowledge graph and the `[[wikilink]]` syntax under it: the parser (links, tags, `^block` anchors, heading ids, and a fenced block minting neither), jumping to an anchor, all three scopes, every filter, the simulation actually settling, resolution across chapters, the `[[` suggester and the note-link modal, both languages, the export fallback, and the same graph on a phone with a real touch drag. The canvas is asserted on pixels |
| `find.js` | `index.html`'s search & filter panel: all three scopes (open chapter, one workbook, every workbook), the four toggles (match case, whole word, regex — including a broken one — and diacritic folding, which has to find "măsură" from "masura" and stop when turned off), the kind of every line counted and filtered on, the tag chips narrowing to the chapters carrying a `#tag`, a hit opening another chapter and landing selected in the textarea, a hit below the fold scrolling to itself through wrapped lines, a line of literal HTML shown rather than run, both languages, and `Ctrl+4` |
| `garden.js` | `index.html`'s garden toolbox: the real garden log this was written for, typos included — every harvest item as its own row and their total in kg, `dovlecel`/`zucchini` summing as one plant while `rosii cherry` stays out of the `rosii` total, an unlisted plot keeping its own words, the lines that must *not* become records (a plant count, a wheelbarrow of mown grass, a step counter, two clock times with no dash between them), an interval becoming a duration, the litres that are water and the "am ramas cu 60 l" that is not, mowing counted as sessions and as rounds, every filter and both groupings, the Garden scope leaving another workbook out, a row click opening its chapter at that line, both languages, and the semicolon-separated CSV |
| `nav.js` | `index.html`'s navigation panel: every heading listed (and a `#` inside a fence not counted as one), a click taking the **preview** to the heading's id and the **Markdown source** to the line it was read from — selected in the textarea and scrolled to through wrapped lines — the repeated heading that has to reach its own line and its own `…-1` anchor, the clicked item becoming the active one, and a phone, where the click shows the preview and deliberately leaves the source (and the keyboard) alone |
| `wbrename.js` | `index.html`'s in-place rename of a workbook or chapter name in the panel: a double-click (and one click then `F2`) turning the name `contenteditable`, Enter and blur committing while the chapter file name follows the title, Escape restoring, an emptied name rejected, and the plain single click still toggling the workbook / opening the chapter after its short delay |
| `wbsaveall.js` | `index.html`'s "Save all modified" button and the pending-edit tracking behind it: editing a chapter records it in `wbPendingIds` and the `pending` object store and shows a `•` on the chapter and workbook rows, `Ctrl+S` clears only the open chapter, `Ctrl+Alt+S` writes every pending chapter and clears them all (content asserted on the real records), a marker created by switching away from an edited chapter, and a marker surviving a page reload. Drives the in-memory document on `file://` but does depend on the IndexedDB writes landing |
| `wbadopt.js` | `index.html`'s "⇩ Sincronizează în dosar" **reading the markdown folder back** (`docs/FEATURES.md` § E): a directory in `<root>/markdown` that no workbook owns becoming one, a `.md` and a `.txt` beside a known chapter becoming chapters with their titles taken from the first heading (or the file name), an empty folder counting as a workbook and a dot-directory and a `.png` not counting at all, a second press adopting nothing twice, and an edit made in the page never overwritten by the file on disk — then, with an account linked, the adopted records reaching Drive in the same press, asserted on the manifest and the uploaded bodies. Two stubs, both real enough to assert on: an in-memory `FileSystemDirectoryHandle` behind `ScuLaFolder.dir()` whose writable really keeps the bytes (so the write half is checked against the tree the read half walked), and the fake Drive `gdsync.js` exports. Served over http, because `gsLive()` needs `localStorage` |
| `wbresume.js` | `index.html`'s **open chapter surviving a reload** and the draft journal behind it (`docs/FEATURES.md` § E): typing both autosaved *and* journalled to `localStorage` under its chapter id; a reload re-attaching the chapter instead of leaving the header on `untitled.md`; the same thing with the race decided against the page — a copy of `index.html` whose textarea already holds the text when the first script runs, which is exactly what a browser's form restoration leaves behind on a discarded tab coming back; a journal ahead of the record recovered and written into the chapter, and one older than the record ignored; restored text ahead of the record kept rather than replaced; a loose "untitled.md" flagged `.loose`, journalled and put back after a reload; and `newFile()` staying a deliberate discard. Reads the real records and the real `localStorage` on `file://` |
| `wbtodo.js` | `index.html`'s TODO-workbook chapter filter: a workbook whose name contains "TODO" gets a `☑` act button (a plain workbook does not), toggling it hides every chapter with no unchecked `- [ ]` box (a chapter that is all `- [x]`, or has no boxes, drops out; the one with an open box stays), the row count switches to `shown/total` and the button takes an `.on` style, toggling off restores every chapter, and a workbook with nothing open shows the empty line. Drives the in-memory records on `file://` |
| `taskstatus.js` | `index.html`'s five task states: the toolbar sets one or several tasks, the three `~` markers become translated preview badges, checkbox clicks switch to done or to do, undo restores a status change, and filtering, assignees, importance, calendar titles and HTML export keep working. Drives the in-memory document on `file://` |
| `importance.js` | `index.html`'s importance markers: `setImportance` and `Ctrl+Alt+1/2/3` / `Ctrl+Alt+0` marking the caret's line or every line of a selection, the marker landing *after* task, heading and assignee prefixes, replacing or clearing markers, the pill colours, labels, export and click to search. Also checks that `#importance-select` filters matching checklist tasks across workbooks and the open preview, excludes fenced examples, responds to live edits and restores all tasks when cleared. Drives the in-memory document on `file://` |
| `idea.js` | `index.html`'s quick idea capture: the 💡 button sitting immediately right of "New", `Ctrl+Alt+I` opening the box with the caret already in it and `Escape` closing it, the hint naming the chapter the idea will land in, `Ctrl+Enter` filing it, the `"Chapter: "` prefix stripped only when it matched (and kept when it did not), a case- and diacritic-folded name (`retete` → `Rețete`), the pending marker cleared so filing counts as a real save, the textarea moving with the file when the target happens to be the open chapter, the `Idei` workbook and today's chapter created on demand and then reused by a second idea the same day, an empty box filing nothing and staying open, and `Ctrl+I` inside the box leaving the editor's text alone. Drives the in-memory records on `file://` |
| `voice.js` | `voice.html`'s "also save the sound of the recording" checkbox: ticked before recording, the transcript and a **playable** audio file come out under one name (the container's magic bytes are checked, not just the size); unticked, only the transcript; ticked only after recording, no file and the page says so; a second recording never inherits the first one's sound; and the label is translated. Runs against Chromium's fake microphone (`--use-fake-device-for-media-stream`), and asserts on the real files — on `file://` there is no directory picker, so every `ScuLaFolder.save` takes the download route and each saved file arrives as a Playwright download |
| `calendar.js` | The calendar, both halves. `calendar.html`: an event added through the real modal and read back in **Google's own event shape** (`start.dateTime` with an offset, an IANA `timeZone`, a base32hex id, our fields as strings under `extendedProperties.private`); the month, week, day and agenda views, with the week block's `top`/`height` asserted as the percentages 14:00–15:30 actually works out to; **dragging the hour grid** from 09:00 to 11:00 prefilling that interval; an all-day span proving `end.date` is stored exclusive the way Google wants it; search folding both case and diacritics (`sedinta` finds `Ședință`); the four facet filters built from the events themselves; and the two exports captured off `ScuLaFolder.save` — the `.ics` checked for a `VCALENDAR` envelope, UTC `DTSTART` for timed events, `VALUE=DATE` for all-day ones, 75-octet folding, and a clean round-trip back through `fromICS`, the JSON checked as an array of `events.insert`-ready bodies. Then `index.html`: `@2026-09-03 14:00-15:30` and its `..` span rendering as pills while an e-mail address, a version number and a backticked marker render as none, and the 📅 button pushing every marker in the vault into the shared store — the title stripped of the bullet, the assignee and the importance marker, the line's `#tag` riding along, a second sync neither duplicating nor changing ids, and an edited marker moving its event while a deleted one takes its event with it. It also checks the things only a rendered page shows: the all-day strip pinned with the day header rather than left to scroll away, the event ink following its background's luminance (Google's palette runs from Banana to Tomato), a phone with no saved view opening on the agenda while a view the person picked survives a reload, and an end date set behind the start being clamped rather than stored backwards. Empties the store through the store's own API rather than `deleteDatabase`, which the open page blocks |
| `transfer.js` | `transfer.html`, driven as **two devices at once**: two browser contexts in one browser, with the offer and the answer carried between them the way a person carries them, and the bytes travelling over a real `RTCDataChannel` — nothing stubbed on the Wi-Fi side. A folder tree staged through the real `<input webkitdirectory>` and sent, read back on the other side byte for byte (a 40 kB file of pattern, so the framing and the flow control are exercised over many chunks, not one), a path carrying diacritics, the store-only `.zip` the receiving side writes where there is no folder — parsed here out of the bytes handed to `ScuLaFolder.save`, local headers walked and a file unpacked — and the device book: the peer remembered with its road and its tally, still there after a reload, gone on "Uită", and the whole list gone on "Uită toate". Then Bluetooth against a **stub peripheral** installed over `navigator.bluetooth` (no browser can be a peripheral, so the other side is never another browser): the frames this page writes to the NUS characteristic, each write under the MTU, reassembling into HELLO ▸ MANIFEST ▸ START ▸ DATA ▸ END ▸ DONE, and a file notified back in 20-byte pieces arriving whole. Plus `safePath` refusing to let `..`, an absolute path or a drive letter walk out of the folder they were meant for, a code opened as a `#c=` link landing in the box on its own, and the help following the language toggle while it is open. Chrome's mDNS host candidates are turned off at launch (`--disable-features=WebRtcHideLocalIpsWithMdns`), which a container cannot resolve; **a file whose *name* carries a diacritic cannot be handed to a real `<input type=file>` under this harness** — the browser drops it, on a bare input as much as on this page's — so the fixture on disk is ASCII and the diacritics ride on a path staged inside the page |
| `paste.js` | Pasting a picture into `index.html` (Ctrl+V): the `data:` URI landing in the markdown at the caret, the `<img>` the preview renders, the export round-trip leaving the URI whole, a clipboard carrying text being left to the browser, a big paste capped at 1600 px and re-encoded as JPEG, and a transparent one staying PNG with its alpha intact — the pasted bytes are decoded back and asserted on pixels |
| `map.js` | The `^@` place marker and `map.html` (`docs/FEATURES.md` § S), both pages in one run. In `index.html`: a marker becoming a `.md-geo` pill, the `#tag` beside it staying a tag (the trailing space the lookahead leaves is the whole reason it does), coordinates and a `|` note read straight off it, a backticked marker and a bare `^@` left alone, and the 🗺 button arriving with the first marker and leaving with the last. Then the hand-over: pressing it lands on `map.html` with one layer per heading in source order, the marker inside a fenced block never having travelled. There the geocoder is a **stubbed route** — two names cost two calls, a place written as coordinates costs none, and a reload costs none at all because the answers are cached; a layer switched off takes its pins with it; a pin is asserted against the projection that placed it rather than against its own attributes; a zoom is asserted to hold the point under the cursor still; the export is parsed back as GeoJSON (`[lon, lat]`, layer, note and tags per feature); a `.md` opened on the map page replaces the list with its own; and both languages. No request leaves the machine and no tile is ever fetched |
| `timeline.js` | `index.html`'s **timeline** (`docs/FEATURES.md` § R): a run of `#1969 - !Primul om pe Lună` lines becoming one block — the dates kept as written, the three things the `!` can open (text, a picture, and the same shape pointing at a page, which is a link), the dot placed by its date rather than by its turn, asserted on where the circle really landed and not on the attribute (its x is a percentage, so the drawing stretches while the type does not), a heading / `#tag` / `#rrggbb` colour / causal line left alone, a blank line inside a run keeping it together while a paragraph ends it, a table and a fence closing one, two entries on the same day still reading as two dots, a `[[link]]` and a `#tag` inside an entry, the ⏳ toolbar button, both languages, and the export carrying the same svg with its image path rewritten |

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

`recipes.js`, `mealplan.js`, `targets.js`, `graph.js`, `cause.js`, `find.js`, `garden.js`, `nav.js`, `wbrename.js`, `wbsaveall.js`, `wbadopt.js`, `wbresume.js`, `wbtodo.js`, `importance.js`, `idea.js`, `paste.js`, `calendar.js`, `map.js`, `drive.js`, `transfer.js` and `voice.js` are the scripts that do **not** use
`lib.js` — its `open()` is hard-wired to `editor.html`, so each opens its
own browser context. `recipes.js` goes one further and does not use a
`file://` URL either: it serves the repo from a throwaway
`http://127.0.0.1` server, because the workbook check reads IndexedDB and a
`file://` origin is opaque. `drive.js` serves the repo the same way and
for the same reason — Chrome gives a `file://` page no `localStorage`, and
the stored Google token is what the connected states are made of. It checks
the `file://` case too, on purpose: that is the one where the button has to
explain itself instead of opening a popup that cannot work. `graph.js`, `cause.js`, `find.js`, `garden.js`, `nav.js`, `wbrename.js`, `wbtodo.js`, `importance.js`, `idea.js` and `paste.js` stay on `file://` — all ten drive the
in-memory document, so none depends on a write landing. (`idea.js` files
ideas without a folder handle, so `wbMirrorWrite` is a no-op and the
assertions are on the records, which is where a phone's ideas live too.) `wbresume.js` is the other way round again: it stays on `file://` and reads
both IndexedDB **and** `localStorage` across reloads, which this Chromium
gives a `file://` page (the draft journal degrades to a no-op where a browser
does not, which is why every access to it is wrapped). It also writes a
throwaway `tests/.restored.html` — a copy of the page whose textarea already
holds text — to stand in for a browser's form restoration without depending
on the race; `file://` is one origin in Chromium, so the copy reads the same
database. `wbsaveall.js` also
stays on `file://` but does read IndexedDB and reloads the page: Chrome keeps
a `file://` database alive for the life of the browser context, which is all
that check needs. `voice.js` stays
there too: Chrome treats `file://` as a secure context, so `getUserMedia`
and `MediaRecorder` both work, and the opaque origin is what forces
`ScuLaFolder` into the download route the check reads its results from. Set
`PW_CHROME_PATH` for all of them the same way.

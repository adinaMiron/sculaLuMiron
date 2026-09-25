# CLAUDE.md

Eight standalone browser tools. **No build step, no framework, no package
manager.** The apps open directly in a browser. `index.html` keeps its CSS and
markup in the page and loads its editor JavaScript from `js/markdown/`;
the other apps keep their JavaScript inline. There is no build step.

| File | Lines | ~Tokens | What it is | Theme |
|---|---|---|---|---|
| `voice.html` | 3829 | 37k | "Caiet vocal" — voice dictation → text, **and the recording turned into a melody** | dark (earth) |
| `editor.html` | 6106 | 55k | "Image Marker" — canvas annotation/drawing (incl. the infinite canvas) | dark (earth) |
| `index.html` + `js/markdown/` | 4036 + scripts | — | Markdown editor + preview + workbooks + search + knowledge graph + causality diagram + timeline + `^@` places + **a folder of photos and films read through its own metadata** + Google Drive sync | dark (earth) |
| `recipes.html` | 10235 | 99k | "Rețete" — PDF/photo → recipe markdown/HTML, with USDA nutrition, a day composed out of a recipe library, and daily calorie/macro targets | dark (earth) |
| `calendar.html` | 2785 | 26k | "Calendar" — events on days and hours, month/week/day/agenda, → Google Calendar | dark (earth) |
| `kanban.html` | ~1620 | ~12k | Kanban view of workbook checklist tasks, with scope, search, filters, and state updates | dark (earth) |
| `transfer.html` | 3108 | 30k | "Transfer" — a file, a pile of files or a whole folder tree to another device, over **Wi-Fi (WebRTC)** or **Bluetooth (Web Bluetooth)**, plus the device book it remembers them in | dark (earth) |
| `map.html` | 2378 | 24k | "Hartă" — the `^@` places written in markdown, drawn on a **hand-rolled slippy map** (OSM tiles, no map library) and listed in layers beside it | dark (earth) |

**What the user calls each page** — requests come in as "work on the X page":
"markdown page" / "index" → `index.html` · "retete" / "rețete" →
`recipes.html` · "voice" / "caiet vocal" → `voice.html` ·
"editor.html" / "mazgaleste" / "drawing page" → `editor.html` ·
"calendar" / "calendarul" → `calendar.html` · "transfer" / "sync" /
"trimite pe alt dispozitiv" → `transfer.html` · "harta" / "hartă" /
"locatii" / "map page" → `map.html` · "kanban" / "task board" → `kanban.html`. The nav order is Markdown,
Calendar, Kanban, Hartă, Caiet vocal, Rețete, Mazgaleste, Transfer, and the old
"Editor" label is now "Mazgaleste". `index.html` is the markdown editor — it's the file
served at the site root, and its nav link is the one highlighted as
current when the site loads at `/` (see the `here` fallback in the shared
nav script).

For a feature/fix/styling change inside one app file, the **`app-change`
skill** is the repeatable loop (locate → narrow read → edit → `/verify` →
sync docs).

## Rule 1: never read a whole HTML file

Reading all seven costs ~319k tokens; `recipes.html` alone is 89k and
`index.html` 76k. **Never `view` an entire app file.** Locate
first, then read a narrow range.

```bash
grep -n "functionName\|#elementId" editor.html   # locate
sed -n '1084,1144p' editor.html                  # read just that
```

`docs/MAP.md` has line anchors for every section of all seven files. Read
it instead of exploring. It is far cheaper than one file scan.

## Routing — read only what the task needs

| Task | Read |
|---|---|
| Anything (locate code) | `docs/MAP.md` |
| Colors, theming, dark/light | `docs/THEME.md` |
| English/Romanian UI, strings | `docs/I18N.md` |
| New tool, button, or feature | `docs/FEATURES.md` |
| Deep work inside `editor.html` | `HANDOFF.md` |
| The infinite canvas, or what an export's size is | `docs/MAP.md` § "The infinite canvas" |
| PDF/OCR reading, JPEG 2000, recipe markdown, importing a `.md` **or a shareable HTML page written here**, searching a big plan, **USDA nutrition**, **the meal library / breakfast-brunch-lunch-dinner flags / the per-day sum**, **the daily calorie/macro targets a day is measured against** | `docs/RECIPES.md` |
| `[[wikilinks]]`, `#tags`, the knowledge graph | `docs/FEATURES.md` § G |
| **Google Drive / the Gmail account** — the chapters following the account across browsers, the manifest, tombstones, or anything OAuth | `docs/FEATURES.md` § O (`index.html`) and § D (`editor.html`) |
| The **causality diagram** — `a -> b` / `-\|` / `~>`, key words, feedback loops, circular causality | `docs/FEATURES.md` § M |
| The **timeline** — `#1969 - !ce s-a întâmplat`, the dates, the SVG drawing, what the `!` can hold | `docs/FEATURES.md` § R |
| Markdown syntax in `index.html` — the parser, `Name>> `, the `!vital` importance markers | `docs/FEATURES.md` § C |
| Searching or filtering inside a workbook or a chapter | `docs/FEATURES.md` § H |
| The 💡 idea box (Ctrl+Alt+I) — how an idea finds its chapter | `docs/FEATURES.md` § J |
| **The melody in `voice.html`** — pitch and beat detection, the instruments, the WAV and MIDI exports, why nothing is sampled | `docs/FEATURES.md` § P |
| Undo/redo in `index.html`, or any new action that edits the textarea | `docs/FEATURES.md` § K |
| **Why a chapter is or isn't saved** — autosave, the `localStorage` draft journal, the open chapter surviving a reload, `untitled.md`, **and the folders and files a person added to the markdown folder by hand becoming workbooks and chapters** | `docs/FEATURES.md` § E |
| The calendar, `window.ScuLaCal`, the `@date` markdown marker, or anything that has to reach Google Calendar | `docs/FEATURES.md` § L |
| **Moving files to another device** — the Wi-Fi (WebRTC) link and its codes, the Bluetooth (NUS) one, folder trees, the received-file routes, the device book and forgetting a device | `docs/FEATURES.md` § Q |
| **The `^@` place marker and the map** — `window.ScuLaGeo`, the layered list, the tiles, the geocoder, the 🗺 button that appears only when a chapter has a place | `docs/FEATURES.md` § S |
| **Photos and films from a folder** — the hand-rolled EXIF and `moov` readers, where each container keeps its metadata, the date and the GPS a camera wrote, the name pulled out of a file name, what gets written into the chapter | `docs/FEATURES.md` § T |

Do not read a doc the task doesn't touch.

## Rule 2: the nav block is copied into every app file

`<nav id="site-nav">` plus its `<style>` and `<script>` is **byte-identical**
in all eight files — from the `<nav id="site-nav">` line through the
`<!-- ===== end toolbar nav ===== -->` marker (~1279 lines; starts near
`voice.html:260`, `editor.html:452`, `index.html:2052`,
`recipes.html:527`, `calendar.html:269`, `transfer.html:197`,
`map.html:238`, `kanban.html:59`, but these
**drift** — grep the `<nav` line). It carries the nav links, the UI-language toggle,
**`window.ScuLaFolder`** — which decides where every saved file goes
(`docs/FEATURES.md` § D) — **`window.ScuLaCal`**, the shared calendar
store every page can write events into (`docs/FEATURES.md` § L) — **and
`window.ScuLaGeo`**, the `^@` place marker and the scan behind the map
(`docs/FEATURES.md` § S). Any change
to it must be applied to **all eight** or they drift.

**Verify with `/verify`** — it extracts the block by those two anchors (no
line numbers) and diffs all eight.

Adding a page means adding a link to every nav copy **and** an entry in the
block's `SUBDIR` map, so the new page gets its own folder.

## Rule 3: respect the constraints

- **No build step.** `index.html` loads plain, ordered scripts from
  `js/markdown/` (see its `README.md`); keep them usable from `file://`.
  The other apps remain single-file. Don't introduce a bundler, npm, or a
  framework for the apps.
- **A browser API is not a dependency.** `transfer.html` speaks WebRTC and
  Web Bluetooth, and neither adds a file, a script tag or a server: the
  two devices talk to each other. The one thing it will not grow is a
  signalling server — the offer and the answer are carried across by the
  person (§ Q). A STUN address is a field, empty by default, in the same
  spirit as the OCR URL below.
- **No new dependencies.** Only external dep in the repo is mammoth.js via
  CDN in `index.html:2047` (docx import). Don't add more. (Google Identity
  Services is fetched on demand by the two Drive features — `editor.html`'s
  button and `index.html`'s chapter sync — and is a `<script>` tag in no
  file; there is no signing into a Google account without Google's own code,
  and every page still works from `file://` without it.) The OCR
  engine in `recipes.html` is the one deliberate exception, and it is still
  not a file in this repo: Tesseract is fetched on first use from an address
  that is a visible, editable field, the page reads PDFs and takes pasted
  text without it, and pointing the field at a local `./ocr/` makes it work
  offline. It loads on arrival of a photo now rather than on a button press
  — `docs/RECIPES.md` § A. The knowledge graph in `index.html`
  and the JPEG 2000 decoder in `recipes.html` § 3 are what the rule looks
  like when it holds: a force-graph library and an image codec, both
  hand-rolled rather than pulled in. **The slippy map in `map.html` is the
  third**: Leaflet would be the obvious answer and it is still a file this
  repo will not carry, so the map is ~200 lines of Web Mercator, `<img>`
  tiles and DOM pins. Its two addresses — the tile template and the
  geocoder — are the OCR URL's pattern again: visible, editable fields,
  empty by default meaning "don't", and a local `./tiles/` folder makes the
  page a map with no internet at all (`docs/FEATURES.md` § S). The codec is 1000 lines for one image
  format, and it is still the right answer — no browser but Safari decodes
  JPEG 2000, and most scanned books are stored in it. **The USDA table in
  `recipes.html` § 6 is the same answer for data**: FoodData Central would
  otherwise be an API key and a network round trip per ingredient, so the
  four numbers a recipe needs are compiled out of
  `FoodData_Central_foundation_food_json_2026-04-30.json` and live in the
  page — 425 foods, ~27 KB, nothing to fetch. The 38 further nutrients
  behind the detail panels are a second table beside it, same answer,
  another ~42 KB (`docs/RECIPES.md` § E).
- **`rem`, not `px`**, for chrome in `editor.html` — the root font-size
  scales with viewport. Exception: inside `(pointer:coarse)` blocks, `px`
  is deliberate (44px touch-target floor).
- **Preserve Romanian diacritics** (ă â î ș ț) in all strings and fonts.
- **Save through `ScuLaFolder.save(name, blob)`**, never a hand-rolled
  `<a download>`. It routes to the chosen folder (desktop), the OS share
  sheet (phones — no mobile browser has `showDirectoryPicker`), or a
  download, and reports what it did — `docs/FEATURES.md` § D.
- **Write events through `ScuLaCal`**, never a private event format. Events
  are stored in the *Google Calendar API* shape, so the export is the API
  body; `ScuLaCal.make()` builds one without you touching a field name, and
  `syncSource()` is how a page keeps its scraped events in step —
  `docs/FEATURES.md` § L.

## Standard workflow

1. Read `docs/MAP.md` → find line range.
2. Read only that range.
3. Edit with `str_replace` (never rewrite a whole file).
4. Verify — run `/verify` (see below).
5. If the change touched theme tokens, i18n keys, or the nav, update the
   matching doc in the same commit.
6. If a `docs/MAP.md` anchor was off by more than a few lines, fix it too.

## Verification (no test framework exists)

Run **`/verify`** — it does both the JS parse-check and the nav-sync diff.
A PostToolUse hook (`.claude/hooks/check-html-js.sh`) already parse-checks
the file you just edited on every save and blocks on a syntax error; `/verify`
is the before-done check across all eight.

```bash
# JS in every <script> block still parses (verified working on all 7 files)
for f in voice.html editor.html index.html recipes.html calendar.html transfer.html map.html; do
  awk '/^<script>$/{f=1;next} /^<\/script>$/{f=0} f' "$f" > /tmp/c.js
  printf "%-24s " "$f"; node --check /tmp/c.js && echo OK
done
```

Note: the `awk` guard matches `<script>` on its **own line**. The CDN tag
in `index.html:2047` has attributes and is correctly skipped. If
you add an attributed `<script …>` on its own line, adjust the pattern.

For behaviour, ad-hoc Playwright scripts are the established approach. The
canonical description of how they work (pixel assertions not screenshots,
`getDisplayMedia` needs a headed browser under Xvfb, …) is in `HANDOFF.md`
§ "Testing approach used throughout" — don't restate it elsewhere, link it.
Run them with **`/apptest <name>`**.

`tests/` holds the accumulated Playwright checks for `editor.html` (zoom,
pan, gestures, undo/redo, every tool, and — in `infinite.js` — the infinite
canvas: drawing two screens apart, the window that follows the view, and the
export framed to the ink plus its 10 px margin, and — in `drive.js` — the
Google Drive button: the lazy script loading, both languages, connect and
disconnect, the folder it creates and the multipart upload, all against a
stubbed Drive API, so no Google account is needed, and — in `selcolor.js` —
the Selection-panel colour converters: `HEX → HSL` and the `HSL → RGB`
(`#rrggbb`) field beside it), for `recipes.html` (`recipes.js` —
the PDF reader including scanned pages, the parser, the markdown both
written and read back, the shareable HTML page **driven in the file it
ships in**, the USDA matcher and the ingredient book, **the 38-nutrient
detail panels on both sides**, the whole OCR path against a stub engine,
all three save routes; `mealplan.js` — the day composer: the `brunch`
flag, the shareable page **read back** into the model it was built from,
the recipe library, and the picker putting a meal on a day under a chosen
flag with the day total following; and `targets.js` — the daily calorie
and macro targets: the three verdicts, an empty field staying out of the
comparison, the two rows the markdown gains, and the difference row
following a quantity edited inside the exported page), for `transfer.html` (`transfer.js` — two
devices at once: two browser contexts, the offer and the answer carried
between them the way a person carries them, a folder tree sent over a real
`RTCDataChannel` and read back byte for byte, the hand-written store-only
`.zip` parsed back out, the device book kept across a reload and forgotten
on demand, and the Bluetooth half driven against a stub NUS peripheral),
for `map.html` (`map.js` — the `^@` marker in the preview and the 🗺 button
that comes and goes with it, the hand-over into the map page, the layers
read back off the headings, the geocoder driven against a stubbed route
(two names, two calls; coordinates cost none) and its answers remembered
across a reload, a pin asserted against the projection that placed it, a
zoom holding the point under the cursor, and the exported GeoJSON),
for `calendar.html` (`calendar.js` — the event
modal writing a real Google-shaped event, all four views including the
week block's geometry and drag-to-create on the hour grid, search, the
four facet filters, and both exports plus the `.ics` round-trip; it also
covers the `@date` markdown marker and the 📅 push in `index.html`),
and for
`index.html`'s knowledge graph (`graph.js`), the **causality diagram** in
the same view (`cause.js` — the `->`/`-|`/`~>` syntax in the preview and in
the diagram, the mode switch, the signed and delayed arrows on the canvas,
and the feedback loops found and classified R/B), its search &
filter panel (`find.js`), its navigation panel (`nav.js`), the
**garden toolbox** in the same file (`garden.js` — the real garden log with
its typos: the harvest rows and their per-plant total, the plot and plant
synonyms, the lines that must *not* become records, an interval turned into
a duration, the water that counts and the "60 l left in the tank" that does
not, mowing sessions and rounds, every filter and both groupings, a row
click landing in the editor, both languages and the CSV), the **Google
Drive sync** that makes the chapters follow the Gmail account (`gdsync.js` —
an in-memory fake Drive: the push down to the file bodies and the manifest,
the pull into an empty database, newest-`updated`-wins both ways, a rename
keeping its Drive file, a delete travelling and staying deleted, and
disconnecting), the
in-place rename of a workbook or chapter name (`wbrename.js`),
"Save all modified" with its pending-edit tracking (`wbsaveall.js`), the
**folder read back into the tree** (`wbadopt.js` — "Sincronizează în dosar"
against an in-memory directory handle: a folder nobody had opened becoming a
workbook, a `.md` and a `.txt` beside a known chapter becoming chapters, the
hidden directory and the picture that must *not*, an edit made here never
overwritten by the file on disk, and the adopted records pushed to Drive in
the same press — through the fake Drive `gdsync.js` now exports rather than
a second copy of it — and a **new phone**: empty database, empty folder, one
press pulling the chapters out of Drive and into the folder),
the open chapter surviving a reload and the draft journal under it
(`wbresume.js` — the browser's own form restoration no longer keeping a
chapter out of its editor, and nothing on screen thrown away),
the TODO-workbook chapter filter (`wbtodo.js`), the
`!nice`/`!important`/`!vital` importance markers (`importance.js`), the
inline `#rrggbb` hex-colour swatch (`color.js` — the preview chip, the
export string, and the graph scanner not minting a node for it), the
💡 quick idea capture with its chapter matching and its `Idei` fallback
(`idea.js`), the editor's own undo/redo history (`mdundo.js` — real
keystrokes and the real toolbar buttons), the blank-line-above/below
shortcuts (`mdlines.js` — Ctrl+Enter / Ctrl+Shift+Enter, caret placement
and one-step undo), the **timeline** (`timeline.js` — the run of
`#date - !what` lines becoming one block, text · image · link, the dot
placed by its date asserted on real geometry, what must *not* become a
timeline, both languages and the export) and the **photos and films**
toolbox (`media.js` — a folder walked through a stubbed picker, every fixture
assembled byte by byte in the test: a JPEG with a real `APP1` segment and a
GPS IFD, a PNG with an `eXIf` chunk, an MP4 whose `moov` holds `©day` and
`©xyz` and one with only `mvhd`; the three date sources and the column that
names them, the name pulled out of a file name, the filters, the tick, and
all three output shapes read back out of the real editor), the
copy-to-clipboard button
on code blocks in the HTML
export (`codecopy.js` — clicks the real button in the exported file, reads
the clipboard back), and for
`voice.html`'s keep-the-audio checkbox (`voice.js` — driven against
Chromium's fake microphone, asserting on the real files that come out) and
its **melody** (`melody.js` — a hummed C-major phrase at a known tempo fed
in both ways, through the file picker and through the microphone itself
with Chromium playing a real WAV into it, then the notes read back out of
the exported MIDI, plus the WAV bytes, the piano roll, both languages, and
the guarantee that arming the melody does not make "Descarcă" write an
audio file).
It is dev-only
tooling with its own `package.json` — `cd tests && npm install && npm test`
— and none of the seven apps reference it; it doesn't count against Rule 3.

**Playwright's bundled browser is not what's installed here.** Every test run
must point at whatever browser the machine does have through `PW_CHROME_PATH`
(read by `tests/lib.js`) — the system Chrome
(`/usr/bin/google-chrome-stable`) on this machine, a pre-installed Chromium
under `/opt/pw-browsers/` in a cloud session. Use **`/apptest <name>`** — it
finds the browser and handles the install check.

## Keep this current (learn as the project goes)

These files are the project's memory. Improve them as you work — in the same
change, not "later":

- **Repeated a flow?** If you run the same multi-step sequence twice, promote
  it: a shell recipe → `.claude/commands/<name>.md`; a judgement-carrying
  procedure → a skill under `.claude/skills/`; something that must happen
  *every* time deterministically → a hook in `.claude/settings.json`. Then
  replace the prose in the docs with a one-line reference to it.
- **Corrected twice?** If the user corrects the same thing more than once, it
  belongs in a doc (or a memory file) — write it down so it isn't corrected a
  third time.
- **Stale anchor / drifted line range / dead reference?** Fix it when you
  notice it. A wrong number in `docs/MAP.md` costs the next session a wasted
  file read.
- **One source of truth.** When two docs explain the same thing, keep the
  fuller one and make the other link it. Don't paste command blocks that a
  `/command` already encodes.
- Existing automation: `/verify` (parse + nav + diacritics), `/apptest`
  (Playwright), `app-change` skill (the per-app edit loop), and a PostToolUse
  hook that parse-checks edited HTML. Prefer extending these over adding new
  ones.

## Known issues (unfixed — confirm before "fixing" something else)

1. `tests/nav.js` fails two checks — the phone pass: "on a phone the click
   shows the preview" and "and leaves the source (and the keyboard) alone".
   A click on a nav item leaves the view on `view-source` and flashes
   nothing. Reproduces on the `index.html` in `HEAD`, so it is not whatever
   you just changed. Every other check passes.
2. `tests/wbrename.js` times out on its first `dblclick` — the
   `.wb-ch-name` span it targets resolves but is never visible. Reproduces
   on `HEAD`, so it is not whatever you just changed.
3. `tests/idea.js` fails one check — "💡 button is right of New": `#btn-help`
   now sits between them. Also reproduces on `HEAD`; either the button moved
   or the check is stale. Its other checks pass.
4. **Not** an issue, though it reads like one: the calendar never talks to
   Google. Events reach Google Calendar as an export the person carries
   over — the `.ics` through its Import screen, or the JSON through the
   API. No OAuth, no network call, deliberately — see Rule 3.

## Planned direction (design toward these)

Shared theme tokens · English + Romanian UI everywhere · room for new tools.
Details in `docs/THEME.md`, `docs/I18N.md`, `docs/FEATURES.md`. When adding
anything now, use theme tokens and i18n keys rather than hardcoded hex and
hardcoded strings — that is what keeps the migrations cheap.

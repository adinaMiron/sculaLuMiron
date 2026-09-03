# CLAUDE.md

Four standalone browser tools. **No build step, no framework, no package
manager.** Each `.html` is a self-contained app (CSS + markup + JS in one
file). Open in a browser; that's the whole toolchain.

| File | Lines | ~Tokens | What it is | Theme |
|---|---|---|---|---|
| `voice.html` | 1749 | 17k | "Caiet vocal" — voice dictation → text | dark (earth) |
| `editor.html` | 5270 | 49k | "Image Marker" — canvas annotation/drawing (incl. the infinite canvas) | dark (earth) |
| `index.html` | 8167 | 70k | Markdown editor + preview + workbooks + search + knowledge graph | dark (earth) |
| `recipes.html` | 8470 | 84k | "Rețete" — PDF/photo → recipe markdown/HTML, with USDA nutrition | dark (earth) |

**What the user calls each page** — requests come in as "work on the X page":
"markdown page" / "index" → `index.html` · "retete" / "rețete" →
`recipes.html` · "voice" / "caiet vocal" → `voice.html` ·
"editor.html" / "mazgaleste" / "drawing page" → `editor.html`. The nav order
is Markdown, Caiet vocal, Rețete, Mazgaleste, and the old "Editor" label is
now "Mazgaleste". `index.html` is the markdown editor — it's the file
served at the site root, and its nav link is the one highlighted as
current when the site loads at `/` (see the `here` fallback in the shared
nav script).

For a feature/fix/styling change inside one app file, the **`app-change`
skill** is the repeatable loop (locate → narrow read → edit → `/verify` →
sync docs).

## Rule 1: never read a whole HTML file

Reading all four costs ~200k tokens; `recipes.html` alone is 84k and
`index.html` 67k. **Never `view` an entire app file.** Locate
first, then read a narrow range.

```bash
grep -n "functionName\|#elementId" editor.html   # locate
sed -n '1084,1144p' editor.html                  # read just that
```

`docs/MAP.md` has line anchors for every section of all four files. Read
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
| PDF/OCR reading, JPEG 2000, recipe markdown, importing a `.md`, the shareable HTML page, searching a big plan, **USDA nutrition** | `docs/RECIPES.md` |
| `[[wikilinks]]`, `#tags`, the knowledge graph | `docs/FEATURES.md` § G |
| Markdown syntax in `index.html` — the parser, `Name>> `, the `!vital` importance markers | `docs/FEATURES.md` § C |
| Searching or filtering inside a workbook or a chapter | `docs/FEATURES.md` § H |
| The 💡 idea box (Ctrl+Alt+I) — how an idea finds its chapter | `docs/FEATURES.md` § J |
| Undo/redo in `index.html`, or any new action that edits the textarea | `docs/FEATURES.md` § K |

Do not read a doc the task doesn't touch.

## Rule 2: the nav block is copied into every app file

`<nav id="site-nav">` plus its `<style>` and `<script>` is **byte-identical**
in all four files — from the `<nav id="site-nav">` line through the
`<!-- ===== end toolbar nav ===== -->` marker (~650 lines; starts near
`voice.html:226`, `editor.html:427`, `index.html:1402`,
`recipes.html:408`, but these **drift** — grep the `<nav` line). It carries
the nav links, the UI-language toggle, **and `window.ScuLaFolder`** — which
decides where every saved file goes (see `docs/FEATURES.md` § D). Any change
to it must be applied to **all four** or they drift.

**Verify with `/verify`** — it extracts the block by those two anchors (no
line numbers) and diffs all four.

Adding a page means adding a link to every nav copy **and** an entry in the
block's `SUBDIR` map, so the new page gets its own folder.

## Rule 3: respect the constraints

- **Single file per app.** Don't split into `.css`/`.js` or introduce a
  bundler, npm, or a framework. The apps are meant to run from `file://`.
- **No new dependencies.** Only external dep in the repo is mammoth.js via
  CDN in `index.html:1390` (docx import). Don't add more. The OCR
  engine in `recipes.html` is the one deliberate exception, and it is still
  not a file in this repo: Tesseract is fetched on first use from an address
  that is a visible, editable field, the page reads PDFs and takes pasted
  text without it, and pointing the field at a local `./ocr/` makes it work
  offline. It loads on arrival of a photo now rather than on a button press
  — `docs/RECIPES.md` § A. The knowledge graph in `index.html`
  and the JPEG 2000 decoder in `recipes.html` § 3 are what the rule looks
  like when it holds: a force-graph library and an image codec, both
  hand-rolled rather than pulled in. The codec is 1000 lines for one image
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
is the before-done check across all four.

```bash
# JS in every <script> block still parses (verified working on all 4 files)
for f in voice.html editor.html index.html recipes.html; do
  awk '/^<script>$/{f=1;next} /^<\/script>$/{f=0} f' "$f" > /tmp/c.js
  printf "%-24s " "$f"; node --check /tmp/c.js && echo OK
done
```

Note: the `awk` guard matches `<script>` on its **own line**. The CDN tag
in `index.html:1380` has attributes and is correctly skipped. If
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
stubbed Drive API, so no Google account is needed), for `recipes.html` (`recipes.js` —
the PDF reader including scanned pages, the parser, the markdown both
written and read back, the shareable HTML page **driven in the file it
ships in**, the USDA matcher and the ingredient book, **the 38-nutrient
detail panels on both sides**, the whole OCR path against a stub engine,
all three save routes), and for
`index.html`'s knowledge graph (`graph.js`), its search &
filter panel (`find.js`), its navigation panel (`nav.js`), the
in-place rename of a workbook or chapter name (`wbrename.js`),
"Save all modified" with its pending-edit tracking (`wbsaveall.js`),
the TODO-workbook chapter filter (`wbtodo.js`), the
`!nice`/`!important`/`!vital` importance markers (`importance.js`), the
inline `#rrggbb` hex-colour swatch (`color.js` — the preview chip, the
export string, and the graph scanner not minting a node for it), the
💡 quick idea capture with its chapter matching and its `Idei` fallback
(`idea.js`), the editor's own undo/redo history (`mdundo.js` — real
keystrokes and the real toolbar buttons) and the copy-to-clipboard button
on code blocks in the HTML
export (`codecopy.js` — clicks the real button in the exported file, reads
the clipboard back), and for
`voice.html`'s keep-the-audio checkbox (`voice.js` — driven against
Chromium's fake microphone, asserting on the real files that come out).
It is dev-only
tooling with its own `package.json` — `cd tests && npm install && npm test`
— and none of the four apps reference it; it doesn't count against Rule 3.

**On this machine there is no `chromium`** — Playwright's bundled browser is
not installed. Every test run must point at the system Chrome:
`PW_CHROME_PATH=/usr/bin/google-chrome-stable node <name>.js` (the var is read
by `tests/lib.js`). Use **`/apptest <name>`** — it handles the install check
and the Chrome path.

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

1. `README.md` is a stub.
2. `tests/nav.js` fails one check — "and the preview too": clicking the
   first heading scrolls the source back to the top but leaves `#preview`
   at ~700px. Reproduces on the `index.html` in `HEAD`, so it is not
   whatever you just changed. The other 15 checks pass.

## Planned direction (design toward these)

Shared theme tokens · English + Romanian UI everywhere · room for new tools.
Details in `docs/THEME.md`, `docs/I18N.md`, `docs/FEATURES.md`. When adding
anything now, use theme tokens and i18n keys rather than hardcoded hex and
hardcoded strings — that is what keeps the migrations cheap.

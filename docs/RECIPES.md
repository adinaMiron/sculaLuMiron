# RECIPES.md — `recipes.html`: PDF / photo → recipe markdown

The fourth tool. It turns a meal plan you already have — a PDF, a
screenshot, a page of text — into markdown a person can read and a program
can parse: **one chapter per day**, each meal split into
**1. Ingrediente** and **2. Metoda de preparare**.

Nothing is uploaded. The file is read in the browser, the markdown is
written in the browser, and it leaves only through `ScuLaFolder.save()` or
into the Markdown editor's own workbook store.

```
file ──► text ──► model ──► markdown ──► .md file  /  workbook chapter
         │        │
         │        └─ Recipes.parse(): days ▸ meals ▸ ingredients + steps
         └─ PdfText.extract() · PdfText.images() + OCR · pasted text
```

Line anchors are in `docs/MAP.md`. This doc is the *why* and the format
contract.

---

## A. Getting the text in

### PDF — `PdfText.extract(arrayBuffer)`

A small PDF reader written for this repo, because a bundled one would break
CLAUDE.md rule 3. It does only what *text* needs:

| Step | What |
|---|---|
| scan | every `N 0 obj … endobj` in the file, last generation wins. No xref walk — an incrementally-updated or slightly broken file still reads |
| inflate | `/FlateDecode` through `DecompressionStream` (a web standard, so still zero dependencies), plus `/ASCIIHexDecode`, `/ASCII85Decode` and PNG predictors |
| expand | `/Type /ObjStm` object streams — modern producers hide the page and font dictionaries in there, and without this the file looks empty |
| pages | `/Root → /Pages → /Kids`, falling back to "every `/Type /Page`, in object order" |
| forms | every `/Form` XObject the page can draw, inflated with its own resources. A design tool routinely puts **the whole page, text included, inside one form** and leaves the page itself as a single `/Fm0 Do` |
| text | the text operators (`BT/ET`, `Tf`, `Td/TD/Tm/T*/TL/Tc/Tw/Tz`, `Tj/TJ/'/"`) plus `q`/`Q`/`cm`/`Do`, with the full text matrix — a producer may flip the page (Skia writes `1 0 0 -1 … Tm`) and then its lines arrive bottom-first |
| unicode | each font's `/ToUnicode` CMap (`bfchar` + `bfrange`, 1- and 2-byte codes). **This is what makes ă â î ș ț survive** — a subset font's raw codes are meaningless without it. No CMap falls back to WinAnsi |
| widths | `/Widths` (simple fonts) and `/W` + `/DW` (CID fonts), so the reader knows where a run actually ended |

What it deliberately does not do: encrypted files (refused, not mangled),
LZW, and rendering of any kind. **A scanned PDF holds pictures, not text**
— `extract()` returns an empty string, and `images()` (below) takes over.

Two heuristics decide the line breaks, and they are the first thing to
touch if a particular PDF comes out jumbled:

- a new line starts when the (sign-normalised) `y` moves by more than
  `0.32 × font size`;
- a space is inserted between two runs when the gap between them exceeds
  `0.18 em` **beyond the real advance width** of everything already on the
  line.

That second one is why `/Widths` and `/W` are parsed at all. Producers
split a line into one run per font — a Romanian diacritic falling back to a
second font is enough — so with an *estimated* character width the output
reads `m in`, `arom ă`, `10m l`. `tests/recipes.js` prints a PDF with
Chromium and asserts against exactly that.

**Nothing structural may decide a line break — only geometry.** This was
learned from `100-de-rete-pentru-slabit.pdf`, which wraps every single
glyph in its own `BT … Tm … Tj … ET`. When `BT`/`ET` flushed the current
line, all 121k characters of that book came out one per line; and because
`Tm` also cleared the anchor the space heuristic measures from, there was
never a gap to measure and not a single space survived. Both are geometry's
job now: `BT`/`ET` only reset the text matrix, and the anchor survives a
`Tm` (a `Tm` that moves to another line is caught by the `y` test, which
flushes anyway).

### JPEG 2000 — `Jpx.decode(bytes, opts)`

Scanned books are very often stored as `/JPXDecode`, and **Safari is the
only browser that can decode JPEG 2000**. `createImageBitmap` is no help,
so those pages used to come back `null` and the file was declared
unreadable. § 3 of `recipes.html` is therefore a JPEG 2000 decoder: MQ
arithmetic coder, EBCOT tier-1, tag trees, packet headers, tiles,
precincts, layers, all five progression orders, 5/3 and 9/7 inverse
wavelets, RCT/ICT, subsampled components and the code-block styles.

It is a lot of code for one image format. The alternative was a file the
user simply cannot open, and the answer this repo gives to "we need X" is
the same one it gave for the knowledge graph: write X, do not add a
dependency.

`imageOf` always asks for `{ luma: true }`, which decodes **only component
0** when the file has a component transform. Y is the luma both RCT and ICT
are built around, so OCR gets the grey page it wants for a third of the
work. Packet headers are still read for every component — their lengths are
what advance the stream — only tier-1 is skipped.

Measured: ~400 ms for a 717×1076 colour page in the browser, ~200 ms for
luma. CCITT, JBIG2 and LZW still come back `null`.

### Scanned PDF — `PdfText.images(arrayBuffer)`

A scan is a picture in a PDF wrapper, so the reader also knows how to get
the picture back out and hand it to OCR. Just enough of the image model for
that, and no more:

| Step | What |
|---|---|
| find | each page's `/Resources → /XObject`, in **painting order** — the `/Im3 Do` operators in the content stream, not the (unordered) dictionary. A `/Subtype /Form` is recursed into, three deep: scanners like to wrap the page image in one |
| filter | anything under 200×200-equivalent (`MIN_IMAGE_PX`) is a logo or a rule, not a page, and is dropped |
| JPEG | `/DCTDecode` bytes are handed over untouched — the browser already has a JPEG decoder and it is better than any we could write |
| pixels | everything Flate/hex/A85-packed is unpacked to RGBA here: `/DeviceGray`, `/DeviceRGB`, `/DeviceCMYK` and `/ICCBased` by its `/N`, at 1, 2, 4, 8 or 16 bits per component, plus `/ImageMask` stencils and the `/Decode [1 0]` flip |
| JPEG 2000 | `/JPXDecode` goes through `Jpx` (above), asked for luma. This is the format most scanned books are actually in, and no browser but Safari can decode it |
| refuse | `/CCITTFaxDecode`, `/JBIG2Decode`, `/LZWDecode` and indexed palettes come back `null`. Each needs a decoder of its own and this file is not growing one |
| fall back | a file whose page tree yields nothing at all: every `/Subtype /Image` object in object order |

The result is `[{ page, kind:"jpeg", bytes } | { page, kind:"raw", width,
height, rgba }]`, page-ordered. `extract()` and `images()` share one parse —
a one-slot cache keyed on the very `ArrayBuffer` handed in — so asking both
questions about a scan costs one pass, not two.

`extract()` and `images()` are the file's only two entry points.

### Images — Tesseract, run in the page

**This changed in 2026-08.** It used to be that OCR needed a button press.
It does not any more: a photo or a scanned PDF is recognised on arrival, and
*Citește singur pozele* (on by default) is what says so. Nothing is uploaded
— the recognition happens in this page, on this device.

What still cannot live in the repo is the recogniser itself. Tesseract is
several megabytes of wasm plus a language model per language, so it is
**fetched on first use rather than bundled**, from an address that stays
visible and editable:

```
the field, if filled   ▸   ./ocr/tesseract.min.js   ▸   the CDN
```

The local path is tried first with the field empty, so dropping the files
next to the page is the whole of "make it work offline" — no configuration.
One catch worth knowing: tesseract.js loads its worker, its wasm core and
each language separately, and **left alone it fetches every one of them from
a CDN**, so a local `tesseract.min.js` would still reach for the network.
The page therefore derives `workerPath` from the folder the engine came
from, and — when that folder is not `http(s):` — `corePath` and `langPath`
too. An offline `./ocr/` holds:

```
tesseract.min.js  worker.min.js  tesseract-core*.js  tesseract-core*.wasm
ron.traineddata.gz  eng.traineddata.gz
```

(`npm pack tesseract.js tesseract.js-core @tesseract.js-data/ron
@tesseract.js-data/eng`, then flatten the four packages into one folder.
~45 MB, which is exactly why it is not in the repo.)

Three things make it fast enough to use all day:

- **one worker for the session.** Starting a worker costs more than
  recognising a page, so it is created once and kept. It is rebuilt only
  when the languages change — the badge next to the button says which
  languages the live one has.
- **the language data caches itself.** Tesseract writes the traineddata into
  IndexedDB, so only the first run on a device pays for it.
- **prepared before it is needed.** *Pregătește motorul la deschiderea
  paginii* starts the worker at load. It ticks itself on the first
  successful start — a device that has done OCR once will do it again —
  and can be unticked.

Measured, with the engine local: ~3.8 s from dropping a photo to parsed
days on a cold page, ~0.5 s once the worker is up. A two-page scanned PDF is
~3.6 s.

Before recognition the picture is redrawn on a canvas: upscaled so its short
side is ~1600px (capped at 3×), *downscaled* if the result would pass 12
megapixels — iOS Safari refuses a canvas much larger — then greyscaled with
the contrast nudged. Phone screenshots are small and tinted, scans are huge,
and this one pass is worth several percent of accuracy on both.

The phone route still works and is still the fastest thing on a phone: every
phone can copy text out of a picture (iOS Live Text, Android Lens), and
*Lipesc textul* takes it. Untick *Citește singur pozele* and the page goes
back to asking before it fetches anything.

### Several files at once

Photographing a plan page by page is the normal case on a phone, so the file
picker, the camera button and a drop all take **several files**: the first
replaces what is on screen, the rest append. They are queued, never
interleaved, so one OCR worker serves the whole batch.

Appending parses **only the piece that was added**. Re-parsing the whole box
would push every day already on screen in a second time — which is what it
used to do whenever *Adaugă la zilele deja extrase* was ticked.

### Pasted text

`Ctrl+V` anywhere on the page takes either a picture (→ OCR) or text (→
straight into step 2). Text is also editable in step 2 and re-analysed with
one button — which is the intended fix for anything the reader got wrong,
OCR included: no OCR is perfect, and step 2 is where a stray `>` in front of
`50g spanac` gets deleted before it reaches the markdown.

---

## B. The parser — `Recipes.parse(text)`

Written for the layout meal plans actually use:

```
ZIUA 3
Mic dejun: Terci de ovăz proteic
• 60g fulgi de ovăz fini
• Toarnă apa peste ovăz, lasă 2-3 min. Adaugă proteina și banana
```

| Piece | Rule |
|---|---|
| day | `ZIUA 3` / `Ziua 3` / `Day 3`, arabic or roman. No day header at all → everything lands in one day |
| meal | `<word>:` where the word is a known meal (mic dejun, prânz, cina, gustare, desert, breakfast, lunch, dinner, snack, dessert). An unknown word before a colon is accepted as a custom meal name, but only if it is not prose and not a quantity |
| ingredient vs step | a line starting with a quantity is an ingredient; a line starting with an imperative (`Toarnă`, `Taie`, `Mix`, `Bake`, …), an impersonal `Se pune…`, two sentences, or one long sentence is a step. Once a meal is in its steps, later lines stay steps unless they start with a quantity |
| quantity | leading number (`60`, `1,5`, `2-3`, `1/2`, `½`) then an optional unit from a fixed list, then the name. `60g fulgi de ovăz fini` → `60` · `g` · `fulgi de ovăz fini` |
| one line, two ingredients | `250g broccoli, 150g cartofi` splits, because the piece after the comma starts with a number. `sos de iaurt cu usturoi` does not |
| wrapped lines | a bulletless line that starts lowercase and follows an unfinished line is glued back onto it — that is what a PDF column break looks like |
| noise | clock times, `◀ Files`, page numbers, bare URLs: dropped |
| component | `Sos:`, `Dressing:`, `Topping:` name a *part of the dish being described*, not the next meal. They attach to the current meal as an ingredient group (`ing.group`). Either a known component word, or an unknown one arriving while the current meal has ingredients but no method yet |
| labelled | `Ingrediente:` / `Mod de preparare:` are believed when present, so a book that labels its two halves parses as well as one that leaves them to be guessed |
| word quantity | `o conservă ton`, `un ou mare`, `two eggs`. Stored as the digit the word means — that column exists to be multiplied by, not read |
| cedilla | `ş`/`ţ` are repaired to `ș`/`ț` on the way in. They are the wrong characters for Romanian and a great many PDFs are set in them |
| front matter | a day the parser invented for the prose above the first real day header is dropped — unless it listed an ingredient, which is what a single pasted recipe looks like |

Reading `Sos:` as a meal was the one mistake with two symptoms: the parent
meal ended up with no method (the steps went to the "meal" below it) and the
component with no ingredients. On a 100-menu book that was 32 meals with no
ingredients and 36 with no method; fixing it left 0 and 2.

**Two traps worth knowing before editing those regexes.**

`\b` does not work after a Romanian diacritic: in a non-unicode regex `ă`
is not a word character, so `toarnă\b` never matches. Every word-end test
here is the `NOT_LETTER` lookahead instead — keep it that way when adding
verbs or units.

Nothing is guessed silently. Every decision the parser makes is shown in
step 4 (*Verifică rețetele*) as an editable field, and the ↧ button moves a
line the parser put in the wrong half. The markdown is regenerated on every
keystroke there.

---

## C. The markdown contract

This is what a later tool reads back, so it is a contract, not a style
choice. One file per day:

```markdown
# Ziua 3

*Sursă: 100-de-rete-pentru-slabit.pdf*

## Mic dejun: Terci de ovăz proteic

### 1. Ingrediente

| Cantitate | Unitate | Ingredient | USDA FDC |
| --- | --- | --- | --- |
| 60 | g | fulgi de ovăz fini |  |
| 30 | g | cupă proteină (aromă vanilie/ciocolată) |  |
|  |  | Apă fierbinte cât este necesar |  |

### 2. Metoda de preparare

1. Toarnă apa peste ovăz, lasă 2-3 min.
2. Adaugă proteina, untul de arahide și banana.

## Total pe zi

| Masă | kcal | Proteine (g) | Carbohidrați (g) | Grăsimi (g) |
| --- | --- | --- | --- | --- |
| Mic dejun: Terci de ovăz proteic |  |  |  |  |
| **Total** |  |  |  |  |
```

Fixed points:

- `#` is the day (= the chapter title, = the file name).
- `##` is a meal: `<meal>: <dish>`, or just `<meal>` when the dish has no
  name of its own.
- `###` sections are numbered and always in this order: **1.** ingredients,
  **2.** method. In an English interface the same file says
  `### 1. Ingredients` / `### 2. Method`, and `# Day 3` — a reader must
  accept both languages, matching on the leading `1.` / `2.` rather than
  on the word.
- The ingredient table always has those four columns in that order. The
  fourth is **empty by design**: it is where a USDA FoodData Central ID
  goes.
- The method is an ordered list, one step per item.
- `## Total pe zi` / `## Day total` is a stub with one row per meal plus a
  `**Total**` row — the place per-day numbers land. It can be turned off.
- Only markdown the editor already renders is used (headings, tables,
  ordered lists, `*em*`). No HTML comments, no front matter: both would
  show up as literal text in `markdown-editor.html`'s preview.

Cells escape `|`, so an ingredient can contain one safely.

### Reading it back — `Recipes.fromMarkdown(text)`

A contract only earns the name if it can be read as well as written, so the
inverse exists: `fromMarkdown(text)` → `{ days, source }`, the same model
`parse()` produces, out of a file this page (or `markdown-editor.html`)
wrote. Everything downstream then works on an imported plan exactly as it
does on a freshly-read PDF — the day cards, the search, the `.md` save, the
workbook, the HTML page.

| Piece | Rule |
|---|---|
| `#` | a day. `Ziua 7` / `Day 7` with nothing after the number keeps `title` **empty**, so it goes on following the interface language, the way a day the parser found does. A heading with a name of its own keeps it |
| `##` | a meal, `<label>: <dish>`. The label goes through `mealKind()`, so a Romanian file read by an English page still knows breakfast from dinner. `## Total pe zi` / `## Day total` is skipped: it is a section of the day, not a meal, and it is written again from the meals on the way out |
| `###` | matched on the leading **`1.` / `2.`**, never on the word — the same file says *Ingrediente* or *Ingredients* depending on the language it was written in, and a reader has to take both. `Ingrediente:`-style headings are believed as a fallback |
| table | header rows are the ones **above the `\| --- \|` row**; a row of four empty cells is how "no ingredients" is spelled and is dropped. `\|` inside a cell comes back as a pipe |
| method | `1. …`, `- …`, or a bare line. `1.` with nothing after it is the empty-method stub and adds no step — the `\s+` in the content match is deliberate: with `\s*`, a step opening `2.5 litri de apă` would lose its first two characters |
| `---`, `*Sursă: …*` | the day separator is ignored; the source line is read and **beats the name of the file it arrived in** — `Ziua-7.md` is a file name, the line inside it is the book |

`looksLikeMarkdown(text)` is what decides which reader gets the text, and
`analyse()` asks it on every route in — a picked file, a drop, a paste,
the box in step 2. It wants a heading **and** either a numbered section or
a table, so a plan with a stray `#` in it still goes to `parse()`.

One thing does not survive the trip, because the table has no column for
it: an ingredient's **group** (`Sos:`, `Topping:`). Everything else does —
`tests/recipes.js` reads the page's own output back and asserts the file
comes out byte-identical, and the 100-menu book of § B round-trips the same
way, all 6,584 lines of it.

---

## D. A hundred days at once

A book of 100 menus parses to 300 meals. Rendered the way the review list
first rendered them that is 14,274 DOM nodes on a page 140,727 pixels tall:
every recipe present, none of them findable. So the list is a **view** over
`model.days` rather than a transcription of it.

| Piece | What |
|---|---|
| collapsed days | a day nobody is editing is one row — its name and the dishes on it. Clicking opens the full editor for that day alone. The same book is then 700 nodes and 10,633 pixels. Eight days or fewer just open, since at that size collapsing is only in the way |
| search | over dish names, ingredients, methods and day titles. **Folded**, because nobody types diacritics into a search box and this app exists to keep them: `sunca` finds `șuncă`. The match is put in `<mark>` on the original text, not the folded one |
| meal chips | filter by kind, and only for the kinds the book actually has — a plan with no desserts should not offer to filter by dessert |
| *Doar rețetele afișate* | filtering is a view by default; ticked, it makes the filter a **selection** — the markdown, the `.md` save and the workbook export all become the filtered set. It only appears while something is filtered out |
| move a meal | a select in the meal header, its options filled on first use: with a hundred days, building every list up front is a thousand nodes nobody looks at |
| *Așază pe zile* | regroups every meal. A day ends where a meal kind repeats; a flat list of recipes with no kinds at all goes three to a day, named in eating order. That is what turns a recipe book into a plan, and on a book that already has days it is a no-op |

`view.open` holds **day objects, not indices** — an index drifts the moment
a day above it is deleted. Nothing in this layer mutates `model.days` except
the explicit edits (delete, move, arrange).

Stopping a long OCR batch keeps the pages already read. A hundred-page scan
is minutes of work, and throwing away eighty finished pages because someone
changed their mind about the last twenty would be rude.

## E. The USDA step (not built yet)

The format above exists so this stays a *reading* problem, never a
re-parsing-free-text problem. A future `nutrition.html` (or a mode inside
this page) would:

1. Read a chapter's markdown — from the workbook store (`scula-md`) or a
   file — and walk it with the contract in § C: `#` → day, `##` → meal,
   the table under a `### 1.` heading → ingredients.
2. For each row with an empty fourth cell, look the name up in **USDA
   FoodData Central** (`api.nal.usda.gov/fdc/v1/foods/search`, free API
   key) and write the chosen `fdcId` back into that cell. Romanian names
   need a translation or a synonym table — that mapping is worth storing
   next to the workbook, keyed by the exact ingredient string, so a name is
   only ever resolved once.
3. Fetch `foods/{fdcId}` once per id, keep the per-100g nutrients
   (energy 1008, protein 1003, carbohydrate 1005, fat 1004), and multiply
   by the row's quantity — which is why quantity and unit are their own
   columns. Non-metric units (`lingură`, `cană`, `buc`) need a
   gram-equivalent table; `g`/`ml` need none.
4. Add the numbers as extra columns on the ingredient table, fill the meal
   rows and the `**Total**` row of the day table, and write the file back.

Two things to keep true if that is built: the ingredient table must stay
row-per-ingredient (never merge two foods into one row), and the FDC id
must stay in the file rather than in a side database — the markdown has to
survive being copied to another device on its own.

Offline is possible too: FoodData Central publishes the whole dataset as
CSV. A stripped "foundation + SR legacy, four nutrients" table is a few
hundred KB of JSON and could ship in the repo without any network at all.

---

## F. Where the output goes

Two buttons, both local:

| Button | Does |
|---|---|
| **Salvează .md** | one day → `<Ziua N>.md`; several days → one file named after the source. Always through `ScuLaFolder.save()` — folder on desktop, OS share sheet on a phone, download otherwise (`docs/FEATURES.md` § D). The page's subfolder is `retete` |
| **Adaugă în caiet** | writes one **chapter per day** into the Markdown editor's workbook store (`scula-md`), creating the workbook — *Rețete* by default — if it is missing. Same records, same fields as `markdown-editor.html` writes (`docs/FEATURES.md` § E), so the chapters simply appear there on its next load |

The workbook route deliberately does **not** write the disk mirror: that
belongs to `markdown-editor.html`, which writes the file on its next
explicit save (a mirror write from here would need that page's `markdown`
subfolder, not this page's). A day added here is safe in IndexedDB
immediately; it reaches the folder when the editor next saves or syncs.

Chapter titles are the day names, so re-running a plan makes `Ziua-3-2.md`
rather than overwriting anything.

---

## G. The page you can share

The markdown is the format a *program* reads. `Exportă .html` is the one a
person does: the same days, laid out to be read, as **one self-contained
file** — no script in it, no stylesheet, no font, nothing to fetch. It
opens out of an e-mail attachment, off a phone, and out of a printer.

```
model ──► buildHtmlDoc() ──► one string ──┬─► <iframe srcdoc>   (card 5)
                                          ├─► ScuLaFolder.save() → .html
                                          └─► blob: URL          → a tab
```

The single string is the point: **what the preview shows is the file that
gets saved**, so there is no second renderer to keep in step with the first.

| Decision | Why |
|---|---|
| built from the **model**, not from the markdown | an ingredient group (`Sos`, `Topping`) has no column in the table, and on a page it can simply be a subheading |
| **no totals stub** | in the markdown, `## Total pe zi` is a place for the USDA pass to write (§ E). In a file meant for reading, five empty columns are furniture |
| previewed in an **iframe**, `sandbox=""` | the file carries a whole document's worth of CSS — page background, print rules, its own type — and none of it may leak into `recipes.html` or be overwritten by it. The sandbox gives it an opaque origin and no scripts; it has none to run |
| the preview is a **fold** | building a second document the size of the page on every keystroke is not free. It is rebuilt only while the fold is open, and only after the typing stops (250 ms). The fold opens itself for eight days or fewer and stays shut for a book — the same size heuristic the day view uses |
| the contents list is a `<details>` | a hundred days is a hundred links: on a phone that is three screens of contents before the first recipe. `<details>` folds it with no script, which is what keeps the file inert. Open at 24 days or fewer |
| ingredients are a **grid**, not a row each | one quantity column per list, as wide as the widest quantity in it. A fixed column is fine until a row says `1 conservă` and the unit spills over the name beside it |
| `@media print` + `@page` | the screen page is the dark earth palette; on paper it turns back into ink, one day per sheet, contents dropped. *Deschide într-o filă* is the route to that — and to a PDF, through the browser's own printer |

`Doar rețetele afișate` narrows this the same way it narrows the markdown:
the page is built from `outputDays()`, so a search is also a way to share
part of a book. The title field defaults to the source file's name with its
extension and dashes taken off, and is what the saved file is named after —
through `slug()`, so Romanian diacritics survive into the file name.

---

## H. Testing

`tests/recipes.js` — a plain Node + Playwright script like the rest of that
folder, but it serves the repo over `http://127.0.0.1` instead of `file://`
because the workbook check needs a real origin for IndexedDB.

It builds its own PDFs at run time (uncompressed, `FlateDecode`, and one
with object streams + an Identity-H font), so there is no binary fixture in
the repo, and it covers: the parser on a full three-meal day, the PDF
reader on all three variants including diacritics through a `/ToUnicode`
CMap, the markdown contract above, the `.md` save (with `ScuLaFolder.save`
stubbed) and the share route (with a phone-shaped stub), the workbook
records, both languages, and the refusal when a PDF holds neither text nor
pictures.

It also builds **the shape this book is in**: a PDF whose page draws
nothing but `/Fm0 Do`, with every glyph inside that form in its own
`BT … ET`, placed on a fixed grid where a space is a skipped slot. That one
fixture covers all three bugs that made the book unreadable — the form not
being followed, the line breaking at `BT`, and the space anchor being lost
at `Tm`.

**JPEG 2000 is checked from both ends.** A hand-built `.jp2` whose packets
are all empty — legal, and meaning "no coefficient here was ever coded" —
decodes to a flat DC-shifted grey, which proves the box walk, the marker
segments, the tile and precinct geometry, the packet iteration, the inverse
wavelet and the level shift without needing an encoder. The entropy-coded
path is then checked against a real page pulled out of
`100-de-rete-pentru-slabit-fin3-comprimat-ghrsvd.pdf` when that file is in
the tree, and skipped with a note when it is not.

**The markdown is checked from both ends.** The page's own output goes
back through `fromMarkdown()` and has to come out byte-identical; a plain
plan must *not* be mistaken for markdown; and a hand-built file covers the
corners — an English file read by a Romanian page, `## Day total` not
becoming a fourth meal, an escaped pipe inside a cell, and `1.` with
nothing after it staying an empty method. The shareable page is checked for
what it must contain (one article per day, one section per meal, the dish,
an ingredient, a step, both languages, `@media print`), for what it must
**not** (a `<script`, an `src=`, an `http` URL, an unescaped `<b>` from an
ingredient name), and for the two things that make it trustworthy: the
preview iframe holds the very string the export saves, and the export goes
out through `ScuLaFolder.save` as `text/html` under a diacritic-keeping
file name.

The parser rules the book needed each have a check of their own
(`Sos:` staying inside its meal, word quantities, `Ingrediente:` headings,
front matter, cedilla repair), and so does the day view: forty days
rendering collapsed, a search narrowing and opening what is left, the
diacritic folding, *only the recipes shown* narrowing the markdown, a meal
chip, and both halves of *Așază pe zile*.

**The OCR path is tested end to end without an engine.** The address field
is what makes that possible: the checks point it at
`tests/fixtures/fake-tesseract.js`, a stand-in worker that records the
canvas it was handed and returns queued text. So a scanned PDF built at run
time — one `/DCTDecode` page (a JPEG the browser makes on the spot), one
`/FlateDecode` page, one logo-sized picture that must be ignored — goes all
the way to parsed days, and the checks can assert the pixels: each page
arrives upscaled to 3× and greyscaled, with the ink still on the left. Also
covered: several photos in one go, and that changing the languages
terminates the old worker instead of reusing it.

What that deliberately does not prove is that *Tesseract itself* still
works. For that, serve the four npm packages listed above from a local
`./ocr/`, point the field at it, and drop a photo — the numbers in § A were
measured that way.

```bash
cd tests && npm install
PW_CHROME_PATH=/path/to/chrome node recipes.js
```

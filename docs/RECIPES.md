# RECIPES.md — `recipes.html`: PDF / photo → recipe markdown

The fourth tool. It turns a meal plan you already have — a PDF, a
screenshot, a page of text — into markdown a person can read and a program
can parse: **one chapter per day**, each meal split into
**1. Ingrediente**, **2. Metoda de preparare** and **3. Valori
nutriționale** — the last worked out against a copy of USDA FoodData
Central that lives in the page (§ E).

Nothing is uploaded. The file is read in the browser, the markdown is
written in the browser, and it leaves only through `ScuLaFolder.save()` or
into the Markdown editor's own workbook store.

```
file ──► text ──► model ──► markdown ──► .md file  /  workbook chapter
         │        │   │
         │        │   └─ Nutrition: ingredient ▸ USDA food ▸ grams ▸ kcal/P/C/G
         │        └─ Recipes.parse(): days ▸ meals ▸ ingredients + steps
         └─ PdfText.extract() · PdfText.images() + OCR · pasted text
```

Line anchors are in `docs/MAP.md`. This doc is the *why* and the format
contract.

### The six cards, and which of them are on screen

The page reads top-down, and the numbers on the cards are the order the
work happens in:

| # | Card | On screen when |
|---|---|---|
| 1 | **Obiective zilnice** — what a day should come to (§ I) | always. It is the measure everything below is read against, so it is asked before anything arrives, and answered once for the whole plan |
| 2 | **Sursa** — the file, the photo, the paste, the `.md` | always. The way in |
| 3 | **Textul citit** — the raw text, correctable | something has been read, or *Lipesc textul* / *Introdu manual* opened the box |
| 4 | **Markdown** (§ C) | there is at least one day |
| 5 | **Pagina HTML** (§ G) | there is at least one day |
| 6 | **Verifică rețetele** — the days, the filters, the totals | something has arrived: a day, **any text in the box**, or a meal library saved on an earlier visit |

Cards 4, 5 and 6 each answer a question *about recipes*, so none of them
has anything to say before a recipe exists — an untouched page is card 1
and card 2 and nothing else. The library clause on card 6 is not a
special case so much as a consequence: `+ din bibliotecă` is the only door
to the library and it is inside that card, so hiding the card on a page
whose only content *is* a library would hide the content with it.

`paintFlow()` is the whole rule for card 6; `#mdCard` and `#htmlCard` are
set where they are built (`renderDays`/`renderMarkdown` and `paintHtml`).

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
straight into step 3). Text is also editable in step 3 and re-analysed with
one button — which is the intended fix for anything the reader got wrong,
OCR included: no OCR is perfect, and step 3 is where a stray `>` in front of
`50g spanac` gets deleted before it reaches the markdown.

### Manual entry — no file at all

*Introdu manual* (next to *Lipesc textul*, card 2) opens the same step-3 box
empty, ready to type. There is no separate manual-entry code path: it is the
same `rawText` → `Recipes.parse()` → `Nutrition` pipeline every other route
feeds, so typing "200g piept de pui" and a "Mod de preparare:" list gets the
same USDA matching, per-ingredient and per-meal totals, and 38-nutrient
detail panels as a plan read from a PDF. `rawPlaceholder` carries a worked
example (ingredients, then method) so a person typing from scratch sees the
expected shape before they start.

### A page this tool wrote — no re-reading at all

The `.html` of § G is a source too. Drop one on card 2 (or pick it, or paste
its text) and `Recipes.fromHtml()` takes it back: days, meals, flags,
ingredients with their **groups**, methods, and the USDA food each row was
matched to. Nothing is guessed, because nothing has to be — the markup is
this page's own.

That is what closes the loop the `.md` route opened. A plan can be sent to
somebody as one readable file, and the person who receives it can edit it,
add to it, or take one recipe out of it (§ H) rather than only read it.

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
| meal | `<word>:` where the word is a known meal (mic dejun, **brunch**, prânz, cina, gustare, desert, breakfast, lunch, dinner, snack, dessert). An unknown word before a colon is accepted as a custom meal name, but only if it is not prose and not a quantity |
| ingredient vs step | a line starting with a quantity is an ingredient; a line starting with an imperative (`Toarnă`, `Taie`, `Mix`, `Bake`, …), an impersonal `Se pune…`, two sentences, or one long sentence is a step. Once a meal is in its steps, later lines stay steps unless they start with a quantity |
| quantity | leading number (`60`, `1,5`, `2-3`, `1/2`, `½`) then an optional unit from a fixed list, then the name. `60g fulgi de ovăz fini` → `60` · `g` · `fulgi de ovăz fini` |
| one line, two ingredients | `250g broccoli, 150g cartofi` splits, because the piece after the comma starts with a number. `sos de iaurt cu usturoi` does not |
| wrapped lines | a bulletless line that starts lowercase and follows an unfinished line is glued back onto it — that is what a PDF column break looks like |
| noise | clock times, `◀ Files`, page numbers, bare URLs: dropped |
| component | `Sos:`, `Dressing:`, `Topping:` name a *part of the dish being described*, not the next meal. They attach to the current meal as an ingredient group (`ing.group`). Either a known component word, or an unknown one arriving while the current meal has ingredients but no method yet. A **known** component word is believed even with nothing after the colon — `Sos:` alone on its line with the sauce listed under it is how recipes are actually written, and the "something has to follow a colon" rule (which is what keeps `Notă: …` from being a header) used to read it as an ingredient called "Sos:" |
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
step 6 (*Verifică rețetele*) as an editable field, and the ↧ button moves a
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
| 60 | g | fulgi de ovăz fini | 2346396 · 227 kcal · P 8.1 · C 41.2 · G 3.5 |
| 30 | g | cupă proteină (aromă vanilie/ciocolată) | L20 · 114 kcal · P 23.4 · C 2.4 · G 1.5 |
|  |  | Apă fierbinte cât este necesar | L47 |

### 2. Metoda de preparare

1. Toarnă apa peste ovăz, lasă 2-3 min.
2. Adaugă proteina, untul de arahide și banana.

### 3. Valori nutriționale

| Ingredient | Aliment USDA | Cantitate (g) | kcal | Proteine (g) | Carbohidrați (g) | Grăsimi (g) |
| --- | --- | --- | --- | --- | --- | --- |
| fulgi de ovăz fini | Oats, whole grain, rolled, old fashioned | 60 | 227 | 8.1 | 41.2 | 3.5 |
| cupă proteină (aromă vanilie/ciocolată) | Pudră proteică (whey) | 30 | 114 | 23.4 | 2.4 | 1.5 |
| Apă fierbinte cât este necesar | Apă |  |  |  |  |  |
| **Total** |  | 90 | 341 | 31.5 | 43.6 | 5 |

## Total pe zi

| Masă | kcal | Proteine (g) | Carbohidrați (g) | Grăsimi (g) |
| --- | --- | --- | --- | --- |
| Mic dejun: Terci de ovăz proteic | 341 | 31.5 | 43.6 | 5 |
| **Total** | 341 | 31.5 | 43.6 | 5 |
| Obiectiv | 2000 | 150 | 200 | 60 |
| Diferență | -1659 | -118.5 | -156.4 | -55 |
```

Fixed points:

- `#` is the day (= the chapter title, = the file name).
- `##` is a meal: `<meal>: <dish>`, or just `<meal>` when the dish has no
  name of its own.
- `###` sections are numbered and always in this order: **1.** ingredients,
  **2.** method, **3.** nutrition. In an English interface the same file
  says `### 1. Ingredients` / `### 2. Method` / `### 3. Nutrition`, and
  `# Day 3` — a reader must accept both languages, matching on the leading
  digit rather than on the word.
- The ingredient table always has those four columns in that order. The
  fourth holds the food this row was matched to: **the id first and
  alone**, then what it comes to at this quantity. Everything after the
  `·` is derived from the id and the quantity beside it, so a reader takes
  the id and ignores the rest — which is what keeps the file
  round-trippable. An id is either an FDC `fdcId` (digits) or a local
  `L…` code (§ E).
- The method is an ordered list, one step per item.
- `### 3.` is **derived, never read**. It is written out of the two
  sections above it, so `fromMarkdown` skips it rather than trying to take
  it back in — as it does any `###` that is not `1.` or `2.` It can be
  turned off.
- `## Total pe zi` / `## Day total` has one row per meal plus a `**Total**`
  row. It used to be an empty stub waiting for this pass; it now carries
  the numbers. It can be turned off.
- **`Obiectiv` / `Diferență`** (`Target` / `Difference`) are two further
  rows in that same table, and only when the reader has set daily targets
  (§ I). Same five columns; a macro with no target leaves both cells empty,
  which is the same "not known" an empty cell means everywhere else here.
  Nothing reads them back — `fromMarkdown` skips the whole `## Total pe zi`
  section — so they cost the round trip nothing.
- **An empty cell means "not known", not "zero".** Olive oil really does
  have no protein and that cell says `0`; an ingredient nothing matched has
  no protein *number* and its cells stay blank, and it is left out of the
  totals rather than counted as nought. A total that quietly swallowed the
  unmatched rows would look complete when it is not.
- Only markdown the editor already renders is used (headings, tables,
  ordered lists, `*em*`). No HTML comments, no front matter: both would
  show up as literal text in `index.html`'s preview.

Cells escape `|`, so an ingredient can contain one safely.

### Reading it back — `Recipes.fromMarkdown(text)`

A contract only earns the name if it can be read as well as written, so the
inverse exists: `fromMarkdown(text)` → `{ days, source }`, the same model
`parse()` produces, out of a file this page (or `index.html`)
wrote. Everything downstream then works on an imported plan exactly as it
does on a freshly-read PDF — the day cards, the search, the `.md` save, the
workbook, the HTML page.

| Piece | Rule |
|---|---|
| `#` | a day. `Ziua 7` / `Day 7` with nothing after the number keeps `title` **empty**, so it goes on following the interface language, the way a day the parser found does. A heading with a name of its own keeps it |
| `##` | a meal, `<label>: <dish>`. The label goes through `mealKind()`, so a Romanian file read by an English page still knows breakfast from dinner. `## Total pe zi` / `## Day total` is skipped: it is a section of the day, not a meal, and it is written again from the meals on the way out |
| `###` | matched on the leading **digit**, never on the word — the same file says *Ingrediente* or *Ingredients* depending on the language it was written in, and a reader has to take both. `1.` is ingredients, `2.` is the method, and **anything else is skipped**, which is what stops `### 3. Valori nutriționale` from being read back as a fourth helping of steps. `Ingrediente:`-style headings are believed as a fallback |
| table | header rows are the ones **above the `\| --- \|` row**; a row of four empty cells is how "no ingredients" is spelled and is dropped. `\|` inside a cell comes back as a pipe. The fourth cell is read down to its **leading id** (`fdcOf`) and no further |
| method | `1. …`, `- …`, or a bare line. `1.` with nothing after it is the empty-method stub and adds no step — the `\s+` in the content match is deliberate: with `\s*`, a step opening `2.5 litri de apă` would lose its first two characters |
| `---`, `*Sursă: …*` | the day separator is ignored; the source line is read and **beats the name of the file it arrived in** — `Ziua-7.md` is a file name, the line inside it is the book |

`looksLikeMarkdown(text)` is what decides which reader gets the text, and
`analyse()` asks it on every route in — a picked file, a drop, a paste,
the box in step 3. It wants a heading **and** either a numbered section or
a table, so a plan with a stray `#` in it still goes to `parse()`.

One thing does not survive **this** trip, because the table has no column
for it: an ingredient's **group** (`Sos:`, `Topping:`). The other round
trip, through the shareable page (§ G), does carry it — a page has a
subheading to put it in. Everything else does —
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
| search | over dish names, ingredients, methods and day titles. Space-separated words are ANDed. **Folded**, because nobody types diacritics into a search box and this app exists to keep them: `sunca` finds `șuncă`. The match is `<mark>`ed on the original text, not the folded one. A collapsed day shows the ingredient lines / steps that matched under each meal (`mealHits`), so the search visibly reaches past the dish name on the button; an open day tints the matching ingredient rows and steps (`.ing.hit` / `.meal.hit`). Filler words (`de`, `cu`, `la`…) still narrow the filter but no longer light up a line on their own once the query has something specific in it (`termScore` / `markTerms`) |
| ingredient filter | a second box, comma-separated. Each term is matched against a meal's **ingredient names and groups only** (not the dish name, not the method), and **all** must be present — `ou, faina, lapte` keeps only the meals that have every one. Folded like the search; applied per meal even when the day title matched the main search |
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

## E. The USDA step

The format of § C exists so this could stay a *reading* problem, never a
re-parsing-free-text problem. It is built now, and it is `Nutrition` —
section 6 of the file (`docs/MAP.md` for the line anchors).

```
ingredient ──► head() ──► match() ──► a food ──┐
   "2 felii de pâine integrală"                ├──► grams() ──► 4 numbers
     ▲                                          │      ▲
     └── the ingredient book answers first ─────┘      └── the food's own
                                                          portion weights
```

### The table is in the page

FoodData Central publishes a free API, and using it would have meant an
API key, a network round trip per ingredient, and a page that does nothing
on a train. So the table is compiled into the file instead, the same answer
this repo gives every time (`CLAUDE.md` rule 3):

| | |
|---|---|
| source | `FoodData_Central_foundation_food_json_2026-04-30.json`, the Foundation Foods set — 363 usable foods |
| kept | per 100 g: **kcal, protein, fat, carbohydrate**, plus the gram weight of one piece, one cup and one tablespoon where the dataset gives them |
| size | ~27 KB of the file, 425 rows |

Three fallbacks, because the dataset is analytical rather than tidy:

- **energy**: `1008 Energy` ▸ `2048 Atwater specific` ▸ `2047 Atwater
  general` ▸ 4/4/9 over the food's own macros. Only 95 of 363 foods carry
  1008, so without this most of the table would have no calories.
- **fat**: `1004 Total lipid` ▸ `1085 Total fat (NLEA)`. Olive oil has only
  the latter — which is why it reads 843 kcal per 100 g here rather than
  the 884 a label would say. It is what the source says, and this table
  does not invent numbers the source does not have.
- **carbohydrate**: `1005 by difference` ▸ `1050 by summation` ▸ `100 −
  water − protein − fat − ash − alcohol`. The dry beans and most of the
  2026 produce rows need the third.

A food the dataset gives no fat at all is read as **0 g of fat**, which is
right for a juice and slightly low for a berry.

### The other 38 — `USDA_MICRO`

Four numbers are what a plan is *judged* on, so they are the ones on
screen. But the file those four were compiled out of carries 227 more per
food, and "how much iron is in this week" is a fair question to ask a page
that already has the answer in it. So there is a **second table beside the
first**, read only when somebody opens a panel:

| | |
|---|---|
| kept | 38 nutrients per 100 g, in five groups — carbohydrate detail (fibre, sugars, starch), fat detail (saturated, mono, poly, trans, cholesterol), 11 minerals, 14 vitamins, and water / ash / beta-carotene / lycopene / lutein+zeaxanthin |
| shape | `fdcId → [v, v, , v, …]`, **sparse**: a hole is the dataset never having measured that nutrient in that food |
| size | ~42 KB, 363 rows — only the FoodData foods. The 62 `L` staples have none, and show em-dashes rather than zeroes |

What is left out is left out on purpose. FoodData's remaining 189 rows are
the individual fatty acids (SFA 4:0 through PUFA 22:6), the amino acids,
the sterols and the tocotrienols: analytical detail that would treble the
table to tell a cook nothing. The four macros are not repeated in it
either — they are on the food itself, and one number should live in one
place.

Two of the 38 need the same kind of fallback the macros do:

- **fibre**: `1079 Fiber, total dietary` ▸ `2033 Total dietary fiber
  (AOAC 2011.25)`, which is how the newer records report it. Without it
  rolled oats read as having no fibre at all — 17 foods, and the ones a
  breakfast is made of.
- **sugars**: `1063 Sugars, Total` ▸ the sugars themselves added up
  (sucrose, glucose, fructose, lactose, maltose, galactose) — the same
  answer the carbohydrate column already gives when "by difference" is
  missing.

**A hole is never read as a nought, all the way to the screen.** A food
FoodData never measured for iron has no iron *number*, and reading it as
zero would make a total that leaves out half the plan look complete. So a
sum carries `have[i]` beside `vals[i]` — how many rows actually
contributed each nutrient — and the panel says *"din 6 din 9 ingrediente
recunoscute"* on any number that covers less than all of them. Only those
are marked; mark everything and the mark means nothing.

### What a panel costs, and where it is built

Nothing, until it is opened. A book of a hundred menus is 1,282 ingredient
rows, and a panel apiece would be roughly a hundred thousand DOM nodes
nobody has looked at. So in the app the caret builds its panel the first
time it is clicked, and remembers what was open in a `Set` of **ingredient
and meal objects** (`view.micro`, `view.tot`) so a re-render does not shut
it.

The shareable page makes the same trade with different arithmetic. A
written-out panel is about 1.5 KB of markup, which on that same book would
be two megabytes of table nobody opens. What ships instead is the *data*:
one `data-m` per quantity field — the same sparse `index:value per 100 g`,
about 130 bytes a row — and the file's own script builds the panel when
somebody asks. Which is also why the carets and the two summaries ship
`hidden` and the script un-hides them: they are the script's doing, and a
page opened with scripting off should be the inert page it always was
rather than one with dead buttons on it (§ G).

### The 62 rows that are not FoodData

Foundation Foods has 363 entries and no bread, no pasta, no honey, no
cașcaval, no couscous — the things a Romanian meal plan is actually made
of. On the 100-menu book that gap was about a third of every day, and a
total that quietly leaves out the bread is worse than no total at all.

So there are 62 more rows, from standard reference values, and they are
marked as what they are: **their id is `L…`, never a number**, so nothing
can mistake one for an fdcId, and the page shows an `L` beside them. The
ingredient book (below) is where one gets corrected.

### Romanian names

The table is in English and an ingredient is written the way a person
writes one — `brânză de vaci slabă`, `de pâine integrală (aprox. 90g)`,
`roșii + castraveți`. Three passes, in the order of how far each can be
trusted:

1. **the alias table on the whole name.** 600 phrases, written already
   folded (lowercase, no diacritics — the shape `nfold()` puts a name in).
2. **the alias phrase inside it.** The one that starts **earliest** wins,
   and the longest of those when two start together. Earliest, because
   Romanian puts the food first and the qualifiers after it: `morcov ras o
   conservă de fasole albă` is a row about the carrot, and a
   longest-phrase-anywhere rule calls it beans. Longest on a tie, because
   `unt` and `unt de arahide` both start at nought.
3. **the English words of the descriptions themselves**, first word of a
   description worth two (FoodData writes `Oats, whole grain, rolled` —
   the food first). **Below a score of 0.34 it returns nothing**: a wrong
   food is worse than none, because an unmatched row is visible and a
   mismatched one is silent.

Before any of that, `head()` takes the notes off: a `(…)` is a note, a `+`
or a `,` or an ` sau ` is the parser having failed to split two
ingredients and the first is the one the row is named after, and a leading
`de ` is what `2 felii **de** pâine` leaves behind once the quantity and
the unit have gone into their own columns.

On the 100-menu book — 1,282 ingredient rows — this finds a food for
**97.6%** of them. What is left is either genuinely vague (`mix de legume
congelate`) or a line the parser put in the wrong half in the first place.

### Quantity → grams

`g` and `ml` need nothing (water's density, close enough for everything but
oil and honey). The rest need a number, and the ones that name a **thing**
rather than a measure — `felie`, `bucată`, `cană`, `lingură`, `conservă` —
take the food's own portion weight from the dataset first, because one
slice of bread and one slice of lemon are not the same slice. With no
portion weight the unit's default is used and the row is flagged `guess`,
which the page shows as `~`.

An empty unit is how `1 banană` and `2 ouă` are written, and means pieces
of the thing. The quantity column's six shapes — `60`, `1,5`, `1/2`, `½`,
`1 ½`, `2-3` — all parse; a range becomes its middle, which is the only
honest number to pick out of one.

### The ingredient book

A recipe book is read once and then the same forty ingredients come back in
every plan after it, so a name is resolved once and written down. The book
is a plain JSON document keyed by the folded ingredient name:

```json
{
  "v": 1,
  "updated": "2026-08-27T00:46:42.509Z",
  "items": {
    "fulgi de ovaz fini": {
      "name": "fulgi de ovăz fini", "id": "2346396",
      "food": "Oats, whole grain, rolled, old fashioned",
      "kcal": 379, "prot": 13.5, "fat": 5.89, "carb": 68.7, "n": 5
    }
  }
}
```

- It **grows on every route in** — a PDF, a photo, a paste, an imported
  `.md` — because they all end at `analyse()`. New names are resolved and
  added; names already in it only have their `n` bumped.
- It lives in the settings store (`scula:nutrition`) between visits, and
  moves between devices as a `.json` file through `ScuLaFolder` like
  everything else here. A `.json` picked or dropped on the page goes to the
  book rather than to the parser.
- Reading one back **merges**: a device that has read two plans should not
  lose the first to a file from the second.
- **`"hand": true` is the escape hatch.** An entry marked that way supplies
  its own four numbers and is never written over — not by a later scan, not
  by *Caută din nou alimentele*. That is how a plan uses an ingredient this
  table has never heard of, and how a number that is wrong gets fixed.

Picking a food by hand in the review cards writes it into the book too, so
the same name is already answered the next time any plan uses it.

### What the reader sees

| Where | What |
|---|---|
| review cards | a line under every ingredient: the food it matched — an `<input list="usdaList">`, so it is searchable by typing and changeable — and `120 g · 168 kcal · P 33.8 · C 0 · G 2.9`. A `?` where nothing matched, an `L` for a local food, a `~` on a guessed weight. A **caret** at the end of that line opens the other 38 |
| review cards | a `TOTAL PE MASĂ` line under each meal's ingredients and a `TOTAL PE ZI` under the day, the same four numbers plus `known/total` when some row has no food — each with the same caret onto the same 38, added up |
| the markdown | the fourth column of the ingredient table, `### 3. Valori nutriționale` per meal, and `## Total pe zi` filled in (§ C). **Unchanged by the panels** — the format is a round-trip contract, and 38 more columns is not something `fromMarkdown()` should have to read back |
| the shareable page | the same table under each method, **and the quantities are fields**; a caret per row and a *Toate valorile nutriționale, adunate* summary per meal and per day, all of it recomputed when a quantity changes |

### The one script the shareable page carries

§ G used to be able to say the file had nothing to run. It now has exactly
one script — three halves, if you like, in one block — and the first
reason is this: **a recipe is something people scale.** Change 60 to 90 in
the ingredient list and the table under it has to follow, or the numbers on
the page are a lie the moment anybody cooks for two. The second part is the
detail panels above; the third is the filter bar, § G. They share one
closure so `qty()` and `num()` ship once rather than three times.

It stays honest about the rest. Everything any of them needs is already in
the markup — grams per unit, the four values per 100 g, and the sparse 38
as `data-m` — so there is no table embedded a second time and **still
nothing to fetch**: no `src`, no `http`, no `@import`. The numbers written
into the file are the ones an untouched field would produce, so a page
opened with scripting off still shows the right thing; it just stops
following. What such a page does *not* show is the carets and the two
summaries, which ship `hidden` for the script to un-hide — a control that
cannot work should not be on the page at all. It is plain ES5, because this
document may be opened years from now on whatever a phone has by then.

The preview iframe in card 5 is `sandbox="allow-scripts"` for the same
reason. There is no `allow-same-origin`, so the frame keeps its opaque
origin either way.

### Two things kept true from the original plan

- The ingredient table stays **row-per-ingredient** — never two foods
  merged into one row.
- The id stays **in the file** rather than in a side database. The book is
  a convenience, not the record: markdown copied to another device on its
  own still knows what its ingredients are.

## F. Where the output goes

Two buttons, both local:

| Button | Does |
|---|---|
| **Salvează .md** | one day → `<Ziua N>.md`; several days → one file named after the source. Always through `ScuLaFolder.save()` — folder on desktop, OS share sheet on a phone, download otherwise (`docs/FEATURES.md` § D). The page's subfolder is `retete` |
| **Salvează baza (.json)** | the ingredient book (§ E), same route. *Citește o bază* reads one back and merges it |
| **Adaugă în caiet** | writes one **chapter per day** into the Markdown editor's workbook store (`scula-md`), creating the workbook — *Rețete* by default — if it is missing. Same records, same fields as `index.html` writes (`docs/FEATURES.md` § E), so the chapters simply appear there on its next load |

The workbook route deliberately does **not** write the disk mirror: that
belongs to `index.html`, which writes the file on its next
explicit save (a mirror write from here would need that page's `markdown`
subfolder, not this page's). A day added here is safe in IndexedDB
immediately; it reaches the folder when the editor next saves or syncs.

Chapter titles are the day names, so re-running a plan makes `Ziua-3-2.md`
rather than overwriting anything.

---

## G. The page you can share

The markdown is the format a *program* reads. `Exportă .html` is the one a
person does: the same days, laid out to be read, as **one self-contained
file** — no stylesheet, no font, nothing to fetch. It opens out of an
e-mail attachment, off a phone, and out of a printer.

It carries exactly one script — one `<script>` block, whichever halves the
page needs. The totals half is there when the nutrition tables are (the
quantities are fields, the totals follow them, and the detail panels come
with it, § E); the filter half is there when there is more than one recipe
to sift. Neither, and the file has no script at all.

**The filter bar, directly under the header and above the contents.** A
hundred days sent to somebody else are no smaller than a hundred days on
this page, so the export carries card 6's search: the same two boxes — a
word or two over the whole recipe, a comma-separated list over the
ingredient names only, every term having to be present — and the same meal
chips, only for the kinds the file actually holds. What matched is tinted
in the ingredient list, the count line says how much is left with a way to
clear it, and the contents list drops the days that went. It matches on
the dish, the ingredient lines and the method, deliberately **not** on the
nutrition table: a search for `ulei` is a search for the recipe's oil, not
for every row whose USDA food happens to be named one.

Two things keep it from costing the file its character. It reads the
markup that is already there rather than a second copy of the recipes, so
nothing is embedded twice; and it ships `hidden`, un-hidden by the script
on arrival, so a page opened with scripting off is the inert document it
always was rather than a page with a dead search box on it. On paper the
bar and the count line are gone, and what is filtered stays filtered — the
first day still shown is the one that starts flush.

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
| every ingredient `<li>` carries **`data-fdc`** | the USDA id the row resolved to, about fifteen bytes. It is the same thing the markdown's fourth column carries, and it is what lets the page be *read back* (below) with a hand-picked food intact rather than matched again from the name |
| **totals only when there are totals** | when the USDA pass is off there is no totals table on the page: in a file meant for reading, five empty columns are furniture. When it is on, the day roll-up is there and so is a table under every method |
| previewed in an **iframe**, `sandbox="allow-scripts"` | the file carries a whole document's worth of CSS — page background, print rules, its own type — and none of it may leak into `recipes.html` or be overwritten by it. The sandbox gives it an opaque origin; **no `allow-same-origin`**, so it keeps that origin even with scripts allowed, and the one script it has is the one this page wrote (§ E) |
| the preview is a **fold** | building a second document the size of the page on every keystroke is not free. It is rebuilt only while the fold is open, and only after the typing stops (250 ms). The fold opens itself for eight days or fewer and stays shut for a book — the same size heuristic the day view uses |
| the contents list is a `<details>` | a hundred days is a hundred links: on a phone that is three screens of contents before the first recipe. `<details>` folds it with no script, which is what keeps the file inert. Open at 24 days or fewer |
| ingredients are a **grid**, not a row each | one quantity column per list, as wide as the widest quantity in it. A fixed column is fine until a row says `1 conservă` and the unit spills over the name beside it |
| the bar is **markup + one pass**, not a rebuild | filtering hides `section.meal` and `article.day` with the `hidden` attribute, and each meal's haystack is worked out once at load. There is no re-render, so a hundred days answer a keystroke without the file needing a framework in it |
| `@media print` + `@page` | the screen page is the dark earth palette; on paper it turns back into ink, one day per sheet, contents dropped. *Deschide într-o filă* is the route to that — and to a PDF, through the browser's own printer |

When a plan is brought in through *Importă .md* (`#btnMd`), the markdown
card grows a **Salvează .html** button of its own beside *Salvează .md*. It
writes the very same document `buildHtmlDoc()` builds for card 5, only its
`<title>`/`<h1>` is the **name of the imported `.md` file** (dashes and
underscores spaced out) rather than `htmlTitle()`'s source-line/page-name
chain. `buildHtmlDoc(titleOverride)` takes the name; everything else is
unchanged.

### Read back — `Recipes.fromHtml(text)`

A format only earns the name if it can be read as well as written, and the
markdown has had its inverse since § C. The page has one now too:
`fromHtml(text)` → `{ days, source }`, the same model, out of a file
`buildHtmlDoc()` wrote. `looksLikeRecipeHtml()` is what `analyse()` asks
first, so a page arriving by any route — picked, dropped, pasted, or handed
to the library (§ H) — goes to it rather than to the parser.

| Piece | Rule |
|---|---|
| reader | `DOMParser`, `text/html`. This is real HTML and the browser already has a reader for it; parsing markup runs no script and fetches nothing, so the file's own filter bar and totals script never execute here. An ingredient written `1 &amp; ½ linguri` comes back as the text it was |
| sniff | `article.day` **and** `section.meal`, both matched on the raw string. A page that is not one of ours must not cost a DOM |
| day | `article.day` ▸ its `h2`. Same rule as the markdown reader: `Ziua 7` with nothing after it is the *number*, not a name, so it goes on following the interface language |
| meal | `section.meal[data-kind]` ▸ `h3` ▸ `.kind` and `.dish`. The kind is read off the section, never inferred from the words beside it — those are only the fallback for a meal that never had one |
| ingredient | `ul.ing > li`. `li.grp` names the run under it (**the group, which markdown cannot carry**); `.q` is the quantity and unit, `.it` the name, `data-fdc` the USDA id |
| quantity | with the USDA pass on, `.q` holds an `<input>` and the unit beside it — the two columns come straight back. With it off both are one string and `QTY_RE` splits them |
| method | `ol.steps > li`, one step per item |
| source | `header.book h1`, falling back to `<title>`. As with the markdown's `*Sursă: …*` line, the name inside the file beats the name of the file |

A page written before `data-fdc` existed simply has its ingredients matched
again — which is exactly what an empty fourth column means in the markdown.

`Doar rețetele afișate` narrows this the same way it narrows the markdown:
the page is built from `outputDays()`, so a search is also a way to share
part of a book. The title field defaults to the source file's name with its
extension and dashes taken off, and is what the saved file is named after —
through `slug()`, so Romanian diacritics survive into the file name.

---

## H. Composing a day — the library and the flags

Everything above starts with a *file*: a plan arrives whole and this page
takes it apart. That is the wrong shape for the other thing people do with
recipes, which is build a day out of ones they already like. So there are
three ways a meal reaches a plan now, not one:

```
a file read start to finish  ▸  a whole plan replaces what is on screen
one recipe from the library  ▸  added to a day, under a flag
"+ masă", typed by hand      ▸  an empty meal to fill in
```

### The flags

`MEAL_KINDS` is the one list of meal kinds — the `<select>` in a meal
header, the filter chips in card 6, the chips in the exported page and the
picker's own row all read it. It is **breakfast · brunch · snack · lunch ·
dinner · dessert · other**, and *brunch* is new: it is a meal word the
parser knows (`brunch`, `brunchul`, `mic dejun târziu`), a label in both
languages, and a flag the picker offers.

`arrangeIntoDays` keeps **two** lists, because they answer two questions.
`KINDS` names the meals of a flat recipe list laid out three to a day, and
brunch is deliberately not in it — a page of recipes with no meal words on
it is breakfast, lunch and dinner, never a brunch nobody wrote. `EAT_ORDER`
is the order a day is read in, and brunch belongs there, between breakfast
and lunch.

### The library

A flat collection of meals, kept between visits in the settings store under
`scula:meals`, capped at 400 — a library is a picker, not an archive, and
the oldest go first. An entry is `{ meal, src }`: the recipe, and where it
came from.

Three ways in, and they are the three the request asked for:

| Route | What |
|---|---|
| **Adaugă din fișier** | an `.html` page written by this tool (§ G) or a `.md` (§ C). Every meal in it goes into the library, and **the plan on screen is not touched** — which is the difference between this and dropping the same file on card 2 |
| **⊕ on any meal** in card 6 | keep this recipe. Whatever is on screen — read from a PDF, typed by hand, corrected — becomes a library entry |
| **Scrie o rețetă** | closes the picker and points at the step-3 box. Typing a recipe is § A's job and always was; once it is parsed, ⊕ keeps it |

Only the two readers fill it from a file. There is nothing dependable to
take a *single* recipe out of a guessed parse, and a library of
half-recognised prose would be worse than an empty one.

Two entries are the same recipe when the **dish and its ingredients**
match. Not the flag — the same soup is somebody's lunch and somebody else's
dinner — and not the method, which is where two copies of one recipe differ
by a comma.

### The picker

One sheet (`#pickModal`, the same chrome as the help sheet): the day, the
flag, a search box, and a row per recipe. A row says the flag it was saved
under, the dish, **what it comes to** — `520 kcal · P 50.6 · C 64.2 · G
4.7` — and where it came from, which is enough to choose by without opening
anything. Pressing it puts the recipe on the day under the chosen flag; the
sheet stays open, because composing a day means adding several.

The flag chips are `MEAL_KINDS` minus `other`, with **"Cum e salvată"**
first and selected by default: a recipe that already knows it is a
breakfast should not have to be told again, and the other chips are there
for the times it does.

Two decisions worth knowing:

- **The recipe is copied, not referenced.** Editing Tuesday's lunch must
  not rewrite the library entry that Wednesday's is also a copy of, so
  `copyMeal()` copies the ingredient objects too — sharing them is exactly
  the bug that would look like the page changing a recipe behind your back.
- **The sum per day needed nothing added.** `totalsBlock` already adds up
  whatever meals a day holds, so a day composed a recipe at a time sums
  itself as it fills: the `TOTAL PE ZI` line moves on every meal added, and
  `## Total pe zi` in the markdown and the day roll-up in the shareable page
  follow from the same `Nutrition.forDay()`. Which is the point — a day can
  be built up to a calorie number and read off as it goes.

`libSum()` is the one concession to size: the picker redraws every row on
every keystroke and `Nutrition.forMeal()` is a matcher run per ingredient,
so four hundred recipes would be a stutter. The four numbers are memoised
per entry and dropped whenever the ingredient book changes size — that is
the only thing that can change what an already-saved recipe adds up to.

---

## I. Daily targets — what a day was meant to come to

§ E turns a day into four numbers. That is only half of what somebody
composing a plan wants to know: the other half is *whether those numbers
are the ones they were aiming at*. The targets are that half. Four fields
— **kcal, proteine, carbohidrați, grăsimi** — and every day on the list
measured against them.

They are **card 1**, a section of their own above the source, because they
are the measure the rest of the page is read against and they are answered
once for the whole plan rather than once per recipe. They used to be a fold
inside card 6, which put the question inside the card that shows the
answer — and left it shut on the one page that had nothing else on it.

They are the reader's numbers, not the table's. **Nothing is guessed and
nothing is filled in by default**: a page nobody has told what to aim for
behaves exactly as it did before this existed — no block under a day, no
chip on a collapsed one, no extra rows in either file it writes. There is
no default target because there is no such thing as a default person, and a
page that invented one would be handing out dietary advice it is in no
position to give.

### An empty field is not a target of nought

Each target is a number **or `null`**. An empty field means "I have no
opinion about this macro", and a macro with no opinion is left out of every
comparison rather than compared against zero — which would mark every day
as wildly over. It is the same rule the whole feature already runs on: in
the ingredient table an empty cell means *not known*, never *nought*
(§ C).

### The three verdicts

`goalOf(key, value)` is the one comparison, and everything reads its answer
rather than deciding again:

| State | When | Shown as |
|---|---|---|
| `met` | within **±10 %** of the target (`TARGET_BAND`) | *la țintă* · green |
| `under` | more than 10 % below | *încă 160* · plain |
| `over` | more than 10 % above | *160 peste* · red |

The band exists because a day is never going to land on 2000 kcal exactly,
and a page that says a day of 1994 missed is a page nobody believes twice.

### Where the verdict shows

| Where | What |
|---|---|
| under a day, in card 6 | a `.goals` block beneath the day's own `TOTAL PE ZI`: one row per macro that has a target — `value / target`, the gap in words, and a bar. Under the total rather than inside it, because the total is what the food *is* and this is an opinion about it |
| a **collapsed** day | one pill: `1840 / 2000 kcal`, coloured by the same three states. Energy only — a collapsed day is a line of text, and four comparisons on it is a table nobody asked to read. It is what lets a hundred-day book be scanned for the days that miss |
| the markdown | an `Obiectiv` and a `Diferență` row in `## Total pe zi` (§ C) |
| the shareable page | the same two rows under the day table, **and the difference follows an edited quantity** — the targets ride on `table.dtot` as `data-tk`/`data-tp`/`data-tc`/`data-tf` and the file's own script does the arithmetic, the same bargain § E's totals strike |

A day some of whose ingredients matched no food is marked `known/total`
beside the comparison. Part of any shortfall there is the ingredient
book's rather than the plan's, and saying which is the difference between a
verdict and a guess dressed up as one.

### The note under the fields

Four separate boxes cannot show that the two halves of a target disagree,
and that is the commonest thing wrong with a set of targets. So the fields
are priced back: protein and carbohydrate at 4 kcal/g, fat at 9, added up
and put beside the energy target — *"Cele trei macronutriente fac 1940
kcal, cu −60 față de ținta de energie."* Nothing is corrected; the reader
is simply told, which is all the page is in a position to do.

### Where they live

In the same settings record as everything else on the page
(`scula:recipes`, § E), written whole as a `targets` object so that "no
target for this one" stays a `null` in the file rather than a missing key.
They come back into the fields on the next visit. There is no fold to
open: card 1 is always on screen, so a set of targets is visible the moment
the page loads.

---

## J. Testing

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
an ingredient, a step, both languages, `@media print`, a nutrition table
per meal and one per day), for what it must **not** (more than its own one
script, an `src=`, an `http` URL, an unescaped `<b>` from an ingredient
name), and for the two things that make it trustworthy: the preview iframe
holds the very string the export saves, and the export goes out through
`ScuLaFolder.save` as `text/html` under a diacritic-keeping file name.

**Then the exported file is opened on its own and driven**, off disk with
nothing around it. Both halves of its script: doubling a quantity has to
double that row, with the meal total and the day total moving by the same
amount; and the filter bar has to un-hide itself, keep the recipes that
have one named ingredient, keep only those that have *both* when two are
named, say so when no recipe has both, reach into the method as well as the
list, keep every meal on a day whose title matched, narrow to one kind on a
chip, and put everything back when the filters are cleared. That is the
check that the one script in it actually earns its place.

**The USDA pass is checked from the name inwards.** A Romanian name
finding its food; the longest phrase beating the shortest (`unt de
arahide`, not `unt`); the earliest beating the longest (`morcov ras o
conservă de fasole albă` is a carrot); a `felie` weighed by the food it is
a slice of; no unit at all meaning pieces; an English name matched on the
descriptions; a name nothing matches getting **no** food rather than a
wrong one; all six shapes of the quantity column; and a measured zero
staying `0` where an unknown stays blank. The book gets its own: reading a
plan writes its ingredients into it, a `"hand": true` entry supplies its
own numbers, and *Caută din nou alimentele* leaves that entry alone.

The parser rules the book needed each have a check of their own
(`Sos:` staying inside its meal, word quantities, `Ingrediente:` headings,
front matter, cedilla repair), and so does the day view: forty days
rendering collapsed, a search narrowing and opening what is left, the
diacritic folding, *only the recipes shown* narrowing the markdown, a meal
chip, and both halves of *Așază pe zile*.

The card flow has its own three checks at the top of the file: an untouched
page showing cards 1 and 2 and nothing else, typing into the source box
bringing card 6 out while card 4 keeps waiting for a parsed day, and
emptying the box putting card 6 away again.

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

`tests/mealplan.js` is the day composer's own script, same style, same
server: brunch parsing as its own kind and reaching the picker's chips; the
shareable page built and read straight back with `fromHtml`, asserted
against the model it was built from (the group included, and the source
line beating the file name); `analyse()` choosing that reader over the
parser; the library taking a meal once and not twice, and keeping a *copy*
— editing the plan must not reach back into it; the picker driven through
real clicks (pick a flag, press a recipe, land it on a day it created), a
second meal landing on the same day under its own flag; the day total being
the meals on it added up **and** being on screen; and the library still
being there after a reload.

`tests/targets.js` is the daily targets' own script (§ I), same style and
same server. It types into the four fields for real, so the input listener
and `savePrefs()` are on the path rather than bypassed, and then checks
what the numbers are worth: that a page with no targets set shows no
comparison anywhere and writes no extra markdown rows; that an **empty
field stays out of the comparison** rather than being read as a target of
nought; all three verdicts against a day whose own totals set them up, with
the words and the bar under each; the note pricing the three macros at
4/4/9 and catching a set of targets that disagrees with the energy beside
it; the `Obiectiv` and `Diferență` rows in `## Total pe zi`, with the same
markdown still reading back as its days; the energy chip on a day nobody
has opened; the exported page carrying `data-tk`…`data-tf` on the day table
with both foot rows written out — and, **driven inside the exported file
itself**, its difference row following an edited quantity and turning red
once the day has gone past; the four numbers surviving a reload into the
fields; and *Șterge obiectivele* putting the page back exactly where it
started.

Run: `/apptest recipes`, `/apptest mealplan` and `/apptest targets`.
(Testing conventions: `HANDOFF.md` § "Testing approach used throughout".)

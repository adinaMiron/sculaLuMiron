# FEATURES.md — adding tools and features

Four scopes: a whole new app page, a new drawing tool in `editor.html`,
new markdown syntax, or the recipe pipeline. Pick the section you need.

---

## A. New app page (a new tool in the suite)

1. **Copy the closest existing app** as the skeleton. Keep it single-file:
   `<style>` → markup → `<script>`. No build step, no framework, no npm.
2. **Paste the shared nav** verbatim from `index.html:221-873`.
3. **Add the new link to every nav copy** — the existing app files plus
   the new one. They must stay byte-identical:
   ```html
   <a href="new-tool.html" data-page="new-tool.html">New Tool</a>
   ```
   Verify with the diff snippet in `CLAUDE.md`.
   Also add the page to `SUBDIR` in that block (§ D below) so its saves
   get a folder — again in every copy.
4. **Start themed and bilingual.** Use `var(--…)` tokens (`docs/THEME.md`)
   and an `I18N` object with `data-i` attributes (`docs/I18N.md`) from the
   first commit. Retrofitting is what makes the other two apps expensive.
5. Reuse the storage wrapper from `index.html:1133-1153` — never call
   `localStorage` directly (these run from `file://`, where it can throw).
6. Add a row to the table in `CLAUDE.md` and a section in `docs/MAP.md`.

Baseline `<head>` — the viewport line is not optional, without it mobile
browsers lay out at 980px and shrink-to-fit:

```html
<!doctype html><html lang="ro" data-theme="dark"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>…</title>
```

---

## B. New drawing tool in `editor.html`

Read `HANDOFF.md` first — it has the layer model and rendering pipeline.

A shape type touches ~11 places. The reliable method: **grep an existing
type and mirror every hit.** `rhombus` is the cleanest template (16 hits):

```bash
grep -n "rhombus" editor.html
```

| # | Line (approx) | What to add |
|---|---|---|
| 1 | 334 | Toolbar `<button class="tool" data-tool="…" title="… (KEY)">` |
| 2 | 1278 | `drawYourShape(ctx, l)` renderer |
| 3 | 1476 | `drawLayer()` dispatch branch |
| 4 | 1576 | `labelFor()` — sidebar layer name |
| 5 | 1684 | fill-palette filter (if it takes a fill) |
| 6 | 1695 | `applyColorToSelection()` stroke branch |
| 7 | 1737 | stroke-width handler |
| 8 | 1762 | sloppiness-button filter (if it uses roughness) |
| 9 | 1863 | `hitLayer()` — only for thin/stroke-only shapes needing padded hit |
| 10 | 2024 | `onDown` creation block (`newBaseLayer` at 2071) |
| 11 | 2097 | `onMove` resize branch (add `create-…` to the mode list) |
| 12 | 2300 | keyboard shortcut map |

Non-obvious requirements:

- **Coordinates are natural canvas pixels, pre-rotation** — never CSS or
  zoom space. `canvasPoint()` (L2808) converts once; everything downstream
  is zoom-agnostic. Never hardcode pixel offsets against screen coords.
- **Normalise interior points to 0..1** within the bounding box (as
  `line`, `freehand`, `splineArrow` do), so resize is free.
- **Support roughness** — take `l.roughness` + `l.seed` and draw via
  `roughLineTo`/`roughStrokeLine` (L1823/1842). `roughness === 0` needs a
  separate clean branch, not wobble-with-zero-amplitude.
- **`pushHistory()`** before/after mutating `state.layers`, or undo breaks.
- **Colours** — read tokens via `getComputedStyle`, once per render pass,
  not per shape (`docs/THEME.md`). The 60fps recording loop is on this path.
- **Pointer Events only** (`pointerdown/move/up/cancel`), never mouse
  events — one code path serves mouse, touch, and pen.

Also update: keyboard-shortcut hint text, the RO+EN `I18N` keys for the
button label and tooltip, and the touch-toolbar overflow check.

### If the shape is editable after it is drawn

`spline` is the template — read HANDOFF.md § "Spline curve" before starting.
Beyond the list above it needed:

- **One writer for the point list.** `setSplinePoints()` re-fits the bounding
  box and re-normalises in one place. A shape whose points can move needs
  this, and needs the rotation-pivot correction inside it — re-fitting the box
  moves its centre, and the centre is what the layer rotates around.
- **A drag mode that is not `create-…`.** `move-vertex` recomputes from
  `d.orig` on every move rather than from the previous frame, so a long drag
  can't accumulate rounding.
- **Handles drawn by `renderOverlay`**, inside the layer's own rotation
  transform, and hit-tested *before* the bounding box's resize handles — at a
  corner the two overlap and the more specific one has to win.
- **A touch route for every modifier-key shortcut.** Alt is unavailable at all
  (the gesture layer takes Alt+drag for panning), and a phone has none of the
  others, so anything reachable only by Ctrl+click needs a button in the
  selection panel too. That is what the Points row is.
- **A `ROW_TYPES` entry that also needs a real selection** must be hidden
  again after the generic pass — see `syncSplineControls()`.

`polyline` is the second shape of this kind, and it added none of the above:
it is `spline` with straight spans, so it reuses the whole block and only
`splineSegments()` branches on the type. If the next editable shape is also a
list of vertices, do the same rather than copying the block — and ask
`isVertexShape(l)`, never `l.type === 'spline'`, when the question is whether
a layer has editable vertices.

---

## C. New markdown syntax in `markdown-editor.html`

The parser is unified: `parseMarkdown(md, opts)` (L3188) and
`applyInline(text, opts)` (L3172) serve **both** the live preview
(`updatePreview()`, opts omitted) and the HTML export
(`exportHtml()`, `{forExport: true}`). Add new syntax once, in these two
functions — no twin to keep in sync.

Syntax that creates a *link* between notes is a third thing again: it also
has to appear in the graph, which reads the text through `scanNote()`
rather than through the parser. See § G.

The only place behaviour forks on `forExport` is `resolveImageSrc()`
(L3166): export rewrites relative image paths to `public/images/…` and
turns a bare image-path line into a standalone `<img>`, because exported
HTML ships without the app's working-folder image tree. If your new
syntax needs export-only handling (e.g. it also touches paths that only
make sense relative to the app's file picker), branch on `opts &&
opts.forExport` the same way rather than forking the function.

Also update `updateNav()` (L3319) if the syntax creates headings, and the
toolbar button + its `I18N` keys.

**The exported-HTML template (L5390-5424) stays literal hex** — it ships
to people without the app, so it can't reference theme tokens.

### Pasting a picture (Ctrl+V)

A picture on the clipboard — a screenshot, "Copy image", a file copied in
the file manager — is pasted straight into the editor as a **`data:` URI**:

```md
![pasted image](data:image/png;base64,iVBORw0…)
```

That is the whole design decision, and it is why the picture needs no
second file: it is text inside the `.md`, so **every** route already
carries it — the workbook autosave, the folder mirror, `saveOut()`, the
share sheet, the HTML export. Move the file anywhere and the picture is
still in it. The parser needs no new syntax either; base64 contains no
space and no `)`, so the existing image rule in `applyInline()` matches a
`data:` URI as-is, and `resolveImageSrc()` already treats `data:` as
absolute.

`handleEditorPaste()` (L2999) is a `paste` listener on `#editor`:

- **Text wins.** If the clipboard carries any non-blank `text/plain`, the
  handler returns and the browser pastes as usual — a copy out of a word
  processor brings both, and there the text is what was meant.
- The picture is read from `clipboardData.files` first, then
  `clipboardData.items` (a screenshot arrives only as an item).
- `imageBlobToDataUrl()` (L2967) keeps the original bytes when they are
  under `PASTE_KEEP_BYTES` (512 KB) or the picture is an SVG. Anything
  larger is drawn to a canvas at `PASTE_MAX_DIM` (1600 px on the long
  edge) and re-encoded: **PNG if any pixel is transparent, JPEG
  otherwise** — a data URI is text in a textarea that autosaves on every
  keystroke, and a raw phone screenshot would put megabytes of base64
  through IndexedDB on every keypress. If the re-encode comes out bigger
  than the original, the original is used.
- The insert goes through `setRangeText` at the caret position captured
  *before* the decode, then `updatePreview(); updateStatus();
  scheduleAutosave()` — `setRangeText` fires no `input` event, so the
  textarea's own `oninput` chain does not run.

Alt text is the pasted file's name when it has one (`schiță.png` →
`![schiță]`), otherwise the `pastedImageAlt` i18n key.

`tests/paste.js` covers all of it — the data URI in the markdown, the
`<img>` in the preview, the export round-trip, text-wins, the 1600 px cap,
the JPEG/PNG choice and that transparency survives.

---

## D. Saving files — one call, three destinations

Every page saves through **one** call. Never build an `<a download>` by hand.

```js
const r = await ScuLaFolder.save(filename, blob);
//  r.via      "folder" | "share" | "download"
//  r.saved    true when it landed somewhere the person chose
//  r.path     "MyFolder/desen/edited-image.png", or just the filename
//  r.message  ready-made, already translated - print it, or null for
//             "say nothing" (they dismissed the share sheet)
if (r.message) setStatus(r.message);   // the shared toast has already said
                                       // it; this puts it in the app's own
                                       // status line as well
```

**Pass `{ quiet:true }` only when the app's own message lands where the
person is looking.** The toast is `position:fixed`, so it is readable from
anywhere on the page; a status line is not. `recipes.html` silenced the toast
and wrote to a status line at the top of the page — which, for a book of a
hundred days, sits ten thousand pixels above the save button. The file was
written every time and the page looked like the button was dead. If a save
can be started from far down a long page, let the toast speak.

`ScuLaFolder` lives in the shared `#site-nav` block copied into every app
file, so it is defined before any app script runs. `save()` picks a route with `currentMode()`:

| Mode | When | What happens |
|---|---|---|
| `folder` | a directory handle is set (desktop Chrome/Edge) | written into `<folder>/<page subfolder>` |
| `share` | no directory picker, but `navigator.canShare({files})` — **every phone and tablet** | handed to the OS share sheet: "Save to Files" on iOS, the Files app on Android, so the person picks any folder |
| `download` | everything else, or their explicit choice | ordinary download |

Full surface:

| Call | Does |
|---|---|
| `save(name, blob, opts)` | route-and-save; always resolves |
| `mode()` | `"folder"` / `"share"` / `"download"` right now |
| `setMode(m)` / `chooser()` | set the route / open the destination sheet |
| `dir(request)` | this page's subfolder handle, or `null` |
| `pick()` / `forget()` | folder chooser / clear |
| `isSet()` / `name()` / `subdir()` / `supported()` / `canShareFiles()` | state |
| `ready` | promise; resolves once the stored handle and mode are reloaded |
| `download(name, blob)` | plain download, no routing |
| `toast(msg[, action, fn])` | the shared bottom toast; with `action` it grows a button |

### The folder route (desktop)

- One root folder from the `📁` nav button (`showDirectoryPicker`,
  `mode:'readwrite'`). Every page's subfolder is created immediately, so
  the layout is visible before anything is saved. The button is
  **desktop-only** — see the share route below.
- The `FileSystemDirectoryHandle` is stored in **IndexedDB** (`scula-fs` →
  `handles` → `root`). It has to be IndexedDB — `localStorage` is strings
  only and cannot hold a handle.
- Each page owns a subfolder, from `SUBDIR` in the shared block:

  | Page | Subfolder |
  |---|---|
  | `index.html` | `transcript` |
  | `editor.html` | `desen` |
  | `markdown-editor.html` | `markdown` |
  | `recipes.html` | `retete` |

- **Permission is re-asked, not remembered.** Chrome drops the grant on
  reload, so on startup the block only *queries* (no gesture available)
  and the first `save()` re-requests inside the click.
- **Nothing is overwritten.** `a.png` taken → `a-1.png`, `a-2.png`, …
- Right-click the nav button to forget the folder.

### The share route (phones and tablets)

**No mobile browser implements `showDirectoryPicker`** — not iOS Safari,
not Chrome for Android. (Chromium's Android work stalled: it needs new
`WebChromeClient` callbacks that missed Android 16.) So there is no folder
to remember on a phone, and any design that assumes one is wrong.

What *does* work is Web Share level 2 — `navigator.share({files})`, iOS
Safari 15+ and Android Chrome. The OS share sheet includes "Save to
Files" / the Files app, so the person drops the file into any folder they
like, and the system remembers the folder they used last. That is as close
to a default folder as a phone gets, and it is what the `share` mode does.

Three traps, all handled in `shareOut()` — keep them handled:

- **`canShare` is the only honest test.** `navigator.share` exists in
  browsers that then refuse files. iOS also accepts only a short list of
  types, so `shareable()` retries text formats as `text/plain` (that is
  why a `.md` shares as plain text) and returns `null` for what it cannot
  place — a `.zip` falls through to a download.
- **`AbortError` means they cancelled.** Do not download behind their
  back, and do not claim anything was saved: `message` is `null`.
- **`NotAllowedError` means the tap expired.** Producing a big PNG or a
  zip can outlive the gesture, and iOS will not open the sheet without
  one. The toast grows a **Salvează / Save** button so one fresh tap
  finishes the job instead of losing the file.

Because the mode is a real preference, it lives in IndexedDB next to the
handle (`scula-fs` → `handles` → `mode`) and is shared by all pages. On
desktop the `📁` button goes straight to the picker; everywhere else it
opens the chooser sheet (`#scula-sheet`) instead.

**The `📁` button is hidden on phones and tablets.** With no
`showDirectoryPicker` it could only ever name the fallback route, so the
shared nav CSS drops it under `@media (hover: none) and (pointer: coarse)`
and `#navLangBtn` inherits the `margin-left:auto` that used to push it
right. Nothing else changes: `currentMode()` already prefers `share` when
there is no picker, so saves go to the OS share sheet on their own, and
`ScuLaFolder.chooser()` still opens `#scula-sheet` for any page that wants
to offer the choice (`markdown-editor.html` does, from its workbook sync).
A page that needs the destination chooser on a phone must call
`chooser()` — do not count on the nav button being there.

### Adding a save, or a page

Build the `Blob`, call `ScuLaFolder.save()`, print `r.message`. A new page
also needs an entry in `SUBDIR` — in all copies of the block.

---

## E. Workbooks and chapters (`markdown-editor.html`)

A **workbook** holds **chapters**; one chapter is one markdown file, the
way OneNote holds pages in a notebook. Code: `markdown-editor.html`
3396–3982, mapped function-by-function in `docs/MAP.md`.

### Two layers, and which one is the truth

| Layer | Where | Holds | Works on |
|---|---|---|---|
| **Store** | IndexedDB `scula-md` | every workbook, every chapter, its full text | **every device** |
| **Mirror** | `<default folder>/markdown/<workbook>/<chapter>.md` | the same text, as real files | desktop only, when a folder is set (§ D) |

**IndexedDB is the source of truth.** No mobile browser can remember a
folder (§ D), so a design where the folder holds the only copy loses the
notes on every phone. The store always has them; the folder is a mirror
that exists when the platform allows one.

Each chapter record carries the names it owns:

```js
{ id, workbookId, title, file, content, created, updated, order }
//                 ^^^^^  ^^^^
//                 UI      folder
```

and each workbook carries `{ id, name, folder, … }` the same way. Those
four fields **are** the correspondence between the UI and the folder —
`title`/`name` is what the person reads, `file`/`folder` is what the file
system gets. Never derive one from the other at save time: `wbSlug()`
computes the file name **once**, when the chapter is created or renamed,
and `wbUniqueFile`/`wbUniqueFolder` keep it collision-free. Recomputing it
per save would silently orphan the file the moment a title is edited.

Diacritics survive slugging (`Fizică` → `Fizică.md`). They're legal file
names everywhere these apps run, and stripping them would make the folder
unreadable next to the UI it mirrors. Only the characters a file system
actually rejects (`\ / : * ? " < > |`, controls) are replaced.

### Two writes, two moments

- **Autosave → store only.** Typing schedules `flushChapter()` 800 ms
  later, which writes the chapter back to IndexedDB. It must not touch
  the disk: `requestPermission()` is only legal inside a user gesture, and
  a keystroke isn't one.
- **Explicit save → store + mirror.** `saveToWorkbook()` (the primary
  header button, Ctrl+S), the save modal, rename, delete and *Sync to
  folder* all run inside a click, so they can call
  `ScuLaFolder.dir(true)` and write the file.

`wbMirrorRemove()` is deliberately **never recursive**: it removes files
this app knows it wrote, and drops a workbook folder only if the file
system agrees it's empty. Nothing a person put in that folder by hand is
ever deleted.

### The three routes, for a chapter

Same three routes as § D, because the same rules apply:

| Route | What "save to workbook" does | Getting a file out |
|---|---|---|
| `folder` | store + writes `markdown/<workbook>/<chapter>.md` | already there |
| `share` (phones) | store only | ⇪ per chapter → `ScuLaFolder.save()` → OS share sheet |
| `download` | store only | ⇪ per chapter → download |

Export names the file `<workbook folder>-<chapter file>.md`, because
neither the share sheet nor the Downloads folder has anywhere to put a
workbook subfolder.

### Adding to it

- New per-chapter action → add a `wbActBtn(...)` in `renderWorkbooks()`
  plus its RO+EN `I18N` keys. The tree is generated, so `data-i` can't
  reach it: `applyUILang()` re-calls `renderWorkbooks()` (guarded by
  `wbBooted`, a `var`, because it runs before the rest of the script).
- New field on a chapter → extend the record and bump nothing; the store
  is schemaless past `keyPath: 'id'`. Add a real `WB_VER` upgrade only if
  you need a new object store or index.
- Anything that changes `title` or `name` must go through the rename path
  so the mirror moves with it.

---

## F. Recipes from a PDF or a photo (`recipes.html`)

A fourth page, and the one place in the repo that reads a *file format*
rather than drawing or typing one. It has its own doc — **`docs/RECIPES.md`**
— because two things there are contracts rather than code:

- **the markdown it writes** (§ C there): `#` day, `##` meal, `### 1.
  Ingrediente` as a four-column table ending in an empty USDA FDC id,
  `### 2. Metoda de preparare` as an ordered list. Anything that reads those
  files later — the planned nutrition pass — depends on that shape. It is
  read as well as written: *Importă .md* takes such a file back
  (`Recipes.fromMarkdown`), so a plan can leave, be edited elsewhere, and
  come home;
- **the OCR policy** (§ A there): no recogniser is bundled or auto-loaded.
  Pasted text and the dependency-free PDF reader are the routes that always
  work; an engine is fetched only when the person presses the button, from
  an address they can repoint at a local copy.

It writes chapters into the same workbook store as § E, one per day, so a
day extracted here shows up in `markdown-editor.html` on its next load.

There is a third way out, for people rather than programs: *Exportă .html*
(§ G there) writes the same recipes as **one self-contained page** — no
script, no stylesheet, nothing to fetch — that opens from an e-mail, on a
phone, and out of a printer. It goes through `ScuLaFolder.save()` like every
other save in this repo (§ D), and card 5 previews it in a sandboxed
`<iframe srcdoc>` holding the very string the file gets.

---

## G. The knowledge graph (`markdown-editor.html`)

Obsidian's graph view, on this app's own notion of a note. Circles are
notes, lines are the links between them; hover to light up what something
is connected to, click to open it. Code: `markdown-editor.html`
2878–3164 (the link syntax) and 3984–4974 (the graph), mapped
function-by-function in `docs/MAP.md`.

### What is a note here

Obsidian has a vault of loose files. This app has workbooks holding
chapters (§ E), so:

| Obsidian | Here |
|---|---|
| vault | every workbook |
| note | a chapter — or the loose file in the editor, if it is not a chapter |
| attachment | an image a note references |
| unresolved link | a `[[name]]` no chapter answers to |

That gives one scope Obsidian does not have. The **note** scope graphs the
*inside* of the open note: its headings are nodes, its `^block` anchors are
nodes, its `#tags` are nodes, and a `[[#Section]]` link is an edge between
two of them. That is what "connecting notions in a single note" means —
the outline gives you the tree, the `[[#…]]` links give you everything the
tree cannot say.

| Scope | Nodes | Edges |
|---|---|---|
| **note** | the note, its headings, its `^blocks`, its `#tags`, whatever it links out to | the outline, plus every `[[…]]` from the section that wrote it |
| **workbook** | the chapters of the open workbook, plus anything they link out to | `[[…]]` between chapters, chapter→tag |
| **vault** | every chapter of every workbook | the same, across all of them |

### The link syntax

Obsidian's, unchanged, because half the point is that notes written here
open in Obsidian and vice versa:

```
[[Note]]              a link to another note
[[Note|shown as]]     …with its own display text
[[Note#Section]]      …straight to one of its headings
[[Note#^anchor]]      …straight to one ^block inside it
[[#Section]]          a link inside the note being written
[[#^anchor]]          …to a ^block inside it
![[image.png]]        embeds the image
![[Note]]             an embed card that opens the note
#tag                  a tag
text… ^anchor         names the block that line is
```

Two ways to write one: type `[[` and the suggester opens at the caret
(↑↓ to move, Enter or Tab to take one, Esc to dismiss), or use the
**⟦⟧ Note link** toolbar button / Ctrl+Shift+L, which opens the same
candidates in a modal — the route that works with a thumb.

**A link to a note that does not exist is still a link.** Obsidian calls it
unresolved, draws it dimmed and creates the note when you follow it; so
does this, as a new chapter in the current workbook. The graph draws
unresolved names as hollow rings, and the *Existing notes only* filter
hides them.

### Resolving a name

`resolveWiki(name, fromChapterId)` tries, in order: the full path
(`Workbook/chapter.md`), the path without `.md`, `Workbook/Title`, the
chapter title, the file's base name, the file name. **The nearest match
wins** — a chapter in the same workbook beats one in another, which is
Obsidian's rule and the reason `[[Intro]]` means the local Intro.

The index behind it (`wikiNotes()`) is cached, and
`invalidateWikiIndex()` is called from `renderWorkbooks()`. Every create,
rename, delete and open path already ends there, so nothing else has to
remember to invalidate it — but a new path that changes a title or a file
name without re-rendering the tree does.

### The settings palette

The same four sections Obsidian has, with the same meanings:

| Section | Controls |
|---|---|
| **Filters** | search · Tags · Attachments · Existing notes only · Orphans · *only what connects to this note* + Depth (Obsidian's local graph) |
| **Groups** | a word and a colour; every node whose name, tag or path contains it takes that colour, first match wins |
| **Display** | Arrows · Text fade threshold · Node size · Link thickness |
| **Forces** | Center force · Repel force · Link force · Link distance |

Filters apply in that order, and **orphans go last on purpose** — filtering
is exactly what turns a note into one.

The whole of `gvSettings` persists under `scula:graph` through the same
`store` wrapper as the UI language (§ `docs/I18N.md`), so it survives a
reload on any device.

### Adding a setting

Two edits, and only two:

1. a control in the `#graph-view` markup carrying `data-gv="<key>"` (plus
   `data-gv-val="<key>"` on the little number beside a slider, and a
   `data-i` label like every other string);
2. a default in `GV_DEFAULTS`.

`gvBindControls()` and `gvPaintControls()` are generic over `[data-gv]` and
need no edit at all. **Add the key to `GV_STRUCTURAL` as well if changing
it changes which nodes exist** — that set is what decides between a rebuild
and a repaint, and getting it wrong shows up as a slider that quietly does
nothing.

### Things worth knowing before changing it

- **No graph library.** The simulation is ~50 lines (`gvStep`): repel every
  pair, spring every link toward `linkDistance`, pull everything to the
  centre, integrate with a velocity decay, and let `alpha` decay to zero so
  it settles instead of twitching forever. Anything that changes the graph
  calls `gvKick()`. This is deliberate, per CLAUDE.md rule 3 — do not
  reach for d3.
- **Canvas colours are resolved once.** `GRAPH_COLORS` reads the
  `--graph-*` tokens at script init, because `ctx.fillStyle` cannot take a
  `var()`. Same rule and the same reason as `editor.html`'s `CHROME` cache
  — see `docs/THEME.md`. Do not call `getComputedStyle` in `gvDraw`.
- **Everything is drawn in screen space.** `node.x/y` are graph
  coordinates; `gvSX`/`gvSY` project them. That keeps line widths and label
  sizes honest at any zoom without fighting a canvas transform.
- **Positions survive a rebuild** (`gv.pos`), so toggling a filter moves the
  graph instead of re-scattering it. Changing *scope* clears them, because
  a different scope is a different picture.
- **The open note reads from the editor, not from storage** (`noteText`),
  so the graph follows what you are typing. `gvRefresh()` debounces that by
  450 ms — a keystroke must not rescan every chapter.
- **`headingSlug()` is the single slug function.** `parseMarkdown` writes
  it as a heading `id`, and the nav panel, every `[[Note#Section]]` link and
  every heading node in the graph jump to that id. A second copy would
  silently break the two it did not update.
- **The tag pattern runs last in `applyInline`.** By then every `#` the pass
  produced sits after `>` or a quote, and the lead class excludes both, so
  `href="#force"` and `<code>#tag</code>` survive. `scanNote` has no such
  pass to hide behind and blanks the `[[links]]` itself first — without
  that, `[[#Inertia]]` mints a tag called `Inertia`.
- **Export does not carry the graph.** An exported HTML file is one
  document with nowhere to send a link to another chapter, so
  `[[#Section]]` becomes a real `#slug` anchor and everything else degrades
  to styled text. Its `<style>` stays literal hex, like the rest of that
  template.
- **`![[Note]]` is a card, not a transclusion.** It renders as an embed
  link that opens the note, and counts as an edge in the graph. Inlining
  another chapter's text would change what `parseMarkdown` means for the
  export path; if that is ever wanted, do it in the preview only.

### Testing

`tests/graph.js` — the one script in that folder that drives
`markdown-editor.html`. It covers the parser, jumping to an anchor, all
three scopes, every filter, the simulation actually settling, cross-chapter
resolution, the `[[` suggester, both languages, the export fallback, and the
same graph on a phone with a real touch drag. Canvas is asserted on pixels
(`getImageData`), never a screenshot.

```bash
cd tests && npm install && node graph.js
```

---

## H. Search and filter (`markdown-editor.html`)

`🔍 Find` in the toolbar, `Ctrl+4` or `Ctrl+Shift+F`, opens a fourth side
panel. Plain `Ctrl+F` is deliberately left to the browser: the preview is a
real page and its own find still has a job there.

### The three scopes

The same three the graph has, and for the same reason — a person thinking
about "this chapter / this caiet / everything" should not have to learn a
second vocabulary:

| Chip | Searches |
|---|---|
| **Capitol** / Chapter | only the chapter open in the editor |
| **Caiet** / Workbook | every chapter of the workbook that chapter belongs to |
| **Tot** / All | every chapter of every workbook |

Nothing is read off disk. Workbooks are the source of truth (§ E) and
IndexedDB already holds every chapter's text, so a workbook-wide search
needs no folder permission and works on a phone. The open chapter is read
from the `<textarea>`, saved or not — `noteText()` and `wikiNotes()`, both
the graph's, are what make "a note" mean one thing across the two features.
A loose file that is not a chapter has no workbook to widen to; the panel
says so instead of silently searching one file under a "Workbook" chip.

### Query, then two filters

`fdCompute()` runs **scope ▸ query ▸ tags ▸ kinds**, in that order. The four
toggles beside the query box:

| | |
|---|---|
| `Aa` | match case |
| `⌈ab⌉` | whole words only |
| `.*` | the query is a regular expression — a broken one flags the box red rather than throwing |
| `ăâ` | ignore diacritics (**on by default**) |

Folding is the one that matters here. `fdFold()` runs NFD and drops the
combining marks, so `masura` finds `măsură` — and the cedilla `ş` and the
comma-below `ș` fold to the same `s`, which is the difference half of all
scanned PDFs get wrong (`docs/RECIPES.md`). `fdFoldMap()` keeps every folded
character pointing back at its source index, so a hit still marks the right
characters of the original line.

Whole-word is **not** `\b`. After `ă` a word boundary cannot match in a
non-unicode regex; the characters either side of the hit are tested against
`/[\p{L}\p{N}_]/u` instead.

Below the toggles, two rows of chips narrow what the query already found:

- **Doar / Only** — the kind of line a hit sits on: `heading`, `text`,
  `list`, `code`, `quote`, `table`. `fdKindOf()` decides it, tracking fenced
  code the way `parseMarkdown()` does. The row hides itself when every hit
  is the same kind — there would be nothing to choose between.
- **Etichete / Tags** — the `#tags` of the chapters found, most-used first.
  Selecting several narrows (a chapter must carry **all** of them), because
  a filter that widened as you added to it would be a strange thing to call
  a filter.

Each chip's count comes from one step *earlier* than the chip itself
filters, so a chip can always be swapped for another without the list going
empty first.

### Going to a hit

Click a result row: the chapter opens if the hit is in another one, the
match is selected in the `<textarea>`, and on a screen wide enough to be
showing both panes the preview jumps to the same section and flashes it.
The heading a hit sits under is slugged with `headingSlug()` and the same
per-note counter `parseMarkdown()` uses, so the anchor really exists.

Scrolling the textarea to the hit goes through `editorMirrorAt()` — one
off-screen twin of the `<textarea>`, shared with the `[[` suggester. Lines
wrap, so counting `\n` and multiplying by the line height is wrong in
exactly the long chapters this is for.

### Adding to it

- A new toggle: a `<button class="find-opt" data-fd-opt="…">` in
  `#find-opts`, a matching boolean on `fdState`, and its use inside
  `fdMatcher()` or `fdLineHits()`. `fdPaintOpts()` and the persisted
  settings pick it up with no further wiring.
- A new kind of line: add it to `FD_KINDS`, teach `fdKindOf()` the test,
  and add a `findKind_<name>` key to both languages.
- The panel's chips and rows are generated, so they carry no `data-i`.
  `fdRepaintLang()` re-renders them on a language switch — the same
  arrangement `renderWorkbooks()` and the graph's legend have.

### Testing

`tests/find.js`. All three scopes, all four toggles, both chip rows, a hit
opening another chapter and landing selected, a hit below the fold scrolling
to itself through wrapped lines, a line of literal HTML shown rather than
run, both languages, `Ctrl+4`.

```bash
cd tests && npm install && node find.js
```

---

## Definition of done (any feature)

- [ ] Works from `file://`, no console errors
- [ ] Strings in `I18N` with RO + EN, no literals in markup or JS
- [ ] Colours via tokens, canvas colours resolved once per pass
- [ ] Sized in `rem` (except inside `(pointer:coarse)` blocks — see below)
- [ ] Touch tested: 44px minimum targets, `touch-action:none` on any
      drawing surface, no page-pan hijack mid-stroke
- [ ] Nav still byte-identical across all files
- [ ] Anything the feature writes to disk goes through
      `ScuLaFolder.save()` (§ D), never a hand-rolled `<a download>`
- [ ] Saving tested with a phone-shaped stub too (no `showDirectoryPicker`,
      `navigator.share` present) — the share route is not optional polish,
      it is the only folder a phone has
- [ ] Undo/redo intact if it mutates document state
- [ ] `docs/MAP.md` line anchors updated if sections moved

**The `rem` exception:** inside `@media (hover:none) and (pointer:coarse)`
blocks, `px` is deliberate — `rem` collapses to ~34px tall buttons there
because the root font-size floors at 14px on narrow phones, below the
44px touch-target floor. Don't "fix" those to `rem`.

**Testing:** no framework. Ad-hoc Playwright (Python) per feature, with
pixel assertions via `getImageData()`/`toDataURL()` → PIL rather than
trusting screenshots. Anything using `getDisplayMedia` (screenshot,
recording) needs a **headed** browser under Xvfb — headless Chromium
cannot decode media streams at all, so an emulator "passing" proves
nothing there.

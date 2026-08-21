# FEATURES.md — adding tools and features

Three scopes: a whole new app page, a new drawing tool in `editor.html`,
or new markdown syntax. Pick the section you need.

---

## A. New app page (a new tool in the suite)

1. **Copy the closest existing app** as the skeleton. Keep it single-file:
   `<style>` → markup → `<script>`. No build step, no framework, no npm.
2. **Paste the shared nav** verbatim from `index.html:221-873`.
3. **Add the new link to all four navs** — the three existing files plus
   the new one. They must stay byte-identical:
   ```html
   <a href="new-tool.html" data-page="new-tool.html">New Tool</a>
   ```
   Verify with the diff snippet in `CLAUDE.md`.
   Also add the page to `SUBDIR` in that block (§ D below) so its saves
   get a folder — again in all four copies.
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

The parser is unified: `parseMarkdown(md, opts)` (L1831) and
`applyInline(text, opts)` (L1820) serve **both** the live preview
(`updatePreview()`, opts omitted) and the HTML export
(`exportHtml()`, `{forExport: true}`). Add new syntax once, in these two
functions — no twin to keep in sync.

The only place behaviour forks on `forExport` is `resolveImageSrc()`
(L1814): export rewrites relative image paths to `public/images/…` and
turns a bare image-path line into a standalone `<img>`, because exported
HTML ships without the app's working-folder image tree. If your new
syntax needs export-only handling (e.g. it also touches paths that only
make sense relative to the app's file picker), branch on `opts &&
opts.forExport` the same way rather than forking the function.

Also update `updateNav()` (L1939) if the syntax creates headings, and the
toolbar button + its `I18N` keys.

**The exported-HTML template (L2209-2233) stays literal hex** — it ships
to people without the app, so it can't reference theme tokens.

---

## D. Saving files — one call, three destinations

Every page saves through **one** call. Never build an `<a download>` by hand.

```js
const r = await ScuLaFolder.save(filename, blob, { quiet:true });
//  r.via      "folder" | "share" | "download"
//  r.saved    true when it landed somewhere the person chose
//  r.path     "MyFolder/desen/edited-image.png", or just the filename
//  r.message  ready-made, already translated - print it, or null for
//             "say nothing" (they dismissed the share sheet)
if (r.message) say(r.message);      // or drop { quiet:true } and the
                                    // shared toast says it for you
```

`ScuLaFolder` lives in the triplicated `#site-nav` block, so it is defined
before any app script runs. `save()` picks a route with `currentMode()`:

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
  `mode:'readwrite'`). All three subfolders are created immediately, so
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
2533–3117, mapped function-by-function in `docs/MAP.md`.

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

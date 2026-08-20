# FEATURES.md — adding tools and features

Three scopes: a whole new app page, a new drawing tool in `editor.html`,
or new markdown syntax. Pick the section you need.

---

## A. New app page (a new tool in the suite)

1. **Copy the closest existing app** as the skeleton. Keep it single-file:
   `<style>` → markup → `<script>`. No build step, no framework, no npm.
2. **Paste the shared nav** verbatim from `index.html:220-585`.
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
5. Reuse the storage wrapper from `index.html:847-867` — never call
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

## D. Saving files — the shared default folder

Every page saves through **one** call:

```js
const r = await ScuLaFolder.save(filename, blob, { quiet:true });
//   r.saved  true  -> written into <default folder>/<page subfolder>
//   r.saved  false -> fell back to a normal browser download
//   r.path         -> "MyFolder/desen/edited-image.png", or just the filename
```

Never build an `<a download>` by hand again — `ScuLaFolder.save()` already
falls back to exactly that when there's no folder, no File System Access
API (Safari, Firefox, every mobile browser), or permission is refused.
Pass `{ quiet:true }` and print `r.path` yourself through the app's own
status line/toast so the message is in the app's voice; omit it and the
shared toast speaks instead.

`ScuLaFolder` lives in the triplicated `#site-nav` block, so it is
defined before any app script runs. Full surface:

| Call | Does |
|---|---|
| `save(name, blob, opts)` | write-or-download; always resolves |
| `dir(request)` | this page's subfolder handle, or `null` |
| `pick()` / `forget()` | folder chooser / clear (also on the nav button) |
| `isSet()` / `name()` / `subdir()` / `supported()` | state |
| `ready` | promise; resolves once the stored handle has been reloaded |
| `download(name, blob)` | plain download, no folder attempt |
| `toast(msg)` | the shared bottom toast (`#scula-toast`) |

How it works:

- The user picks **one** root folder from the `📁` nav button
  (`showDirectoryPicker`, `mode:'readwrite'`). All three subfolders are
  created immediately, so the layout is visible before anything is saved.
- The `FileSystemDirectoryHandle` is stored in **IndexedDB**
  (`scula-fs` → `handles` → `root`). It has to be IndexedDB —
  `localStorage` is strings only and cannot hold a handle.
- Each page owns a subfolder, from `SUBDIR` in the shared block, keyed by
  filename:

  | Page | Subfolder |
  |---|---|
  | `index.html` | `transcript` |
  | `editor.html` | `desen` |
  | `markdown-editor.html` | `markdown` |

- **Permission is re-asked, not remembered.** Chrome drops the grant on
  reload, so on startup the block only *queries* (no gesture available)
  and the first `save()` re-requests inside the click. That's why saves
  must stay in a user gesture — don't move one behind a timer.
- **Nothing is overwritten.** `a.png` taken → `a-1.png`, `a-2.png`, …
- Right-click the nav button to forget the folder.

Adding a save to an existing page: build the `Blob`, call
`ScuLaFolder.save()`, report `r.path`. Adding a new page: add it to
`SUBDIR` (all copies of the block) and do the same.

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

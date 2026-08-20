# MAP.md — where everything lives

Line anchors so you can `sed -n 'A,Bp' file` instead of scanning. Numbers
drift by a few lines after edits; **search by the name in the right-hand
column** if a range looks wrong. Re-verify with `grep -n` when in doubt.

Shared shape of all three files:

```
<style>  …app CSS, :root palette at the very top…  </style>
<body>
<nav id="site-nav">  + its own <style> + <script>   ← triplicated block
…app markup…
<script>  …app logic, one IIFE/closure…  </script>
```

## The triplicated block (byte-identical in all three files)

`index.html:220-863` · `editor.html:391-1034` · `markdown-editor.html:741-1384`

Two features share it, because both must exist before any app script runs:

| Part | What |
|---|---|
| `#site-nav` links + `#navLangBtn` | page links, UI-language toggle → `docs/I18N.md` |
| `#navFolderBtn` + `window.ScuLaFolder` | where saved files go → `docs/FEATURES.md` § D |
| `#scula-sheet` | the destination chooser (phones/tablets) |
| `#scula-toast` | the shared bottom toast, `ScuLaFolder.toast(msg, action, fn)` |

Inside the block's `<script>`, in order: current-page highlight ·
`LANG_KEY`/lang toggle · `SUBDIR` map + `T` (its own private ro/en
strings) · `supported`/`canShareFiles`/`currentMode` · toast ·
`paintFolder` · IndexedDB helpers (`scula-fs`/`handles`, keys `root` and
`mode`) · `permitted`/`pick`/`forget`/`setMode` · the chooser sheet ·
`dir`/`freeName`/`download`/`shareable`/`shareOut`/`save` ·
`window.ScuLaFolder = {…}`.

**`currentMode()` is the switch that matters** — `"folder"` (a handle is
set), `"share"` (no directory picker but `navigator.canShare({files})`,
i.e. every phone), `"download"`. Read it before assuming what a save does.

Any edit here goes into **all three** files — see the diff snippet in
`CLAUDE.md`.

---

## index.html — 1647 lines · "Caiet vocal" (voice dictation)

`lang="ro"`. **The only app with a working i18n system** — copy its pattern.

| Lines | Contents |
|---|---|
| 11–217 | App CSS. `:root` palette at **12–37** (earth-palette tokens, migrated) |
| 220–863 | **Shared nav + `ScuLaFolder`** (identical in all 3 files) |
| 864–997 | Markup: header, controls, textarea, settings sheet |
| 998–1645 | App script, numbered sections below |

Script sections (comment banners `/* === N. Title === */`):

| Line | Section |
|---|---|
| 1003 | **1. i18n** — `I18N` object (`ro:` 1006 / `en:` 1047), `t()` at 1090, `UI` at 1089 |
| 1093 | 2. Providers |
| 1118 | 3. Settings store — `KEY` 1120, `store` 1121 w/ memory fallback, `save()` 1252, `load()` 1253 |
| 1150 | 4. DOM refs |
| 1181 | 5. Language / engine chips |
| 1196 | **6. UI language** — `applyUILang()` **1200** |
| 1218 | 7. Settings sheet |
| 1290 | 8. Secure-context check |
| 1295 | 9. Recording (MediaRecorder) + segment rotation |
| 1442 | 10. Transcription queue |
| 1536 | 11. Browser dictation (Web Speech API) |
| 1595 | 12. File import |
| 1609 | 13. Copy / share / **save → `ScuLaFolder.save()`** / clear |
| 1641 | 14. Init |

**Two independent language axes — do not conflate:**
- `S.ui` (`UI`) = interface language. Toggle `#uiLangBtn`.
- `S.lang` = *spoken* language for dictation (`ro-RO`/`en-US`/auto), L1542.

---

## editor.html — 3813 lines · "Image Marker" (canvas annotation)

`lang="ro"`. Deep internals in **`HANDOFF.md`** — read that for the layer
model, rendering pipeline, and canvas traps. Map only below.

Theme: ✅ migrated to the earth palette (dark), step 3 of `docs/THEME.md`.
`:root` uses the shared semantic token names (`--surface`, `--text`, …) —
see that doc for the canvas-colour resolution (`CHROME` cache, ~L940).

**Chrome layout (2026-08):** the top bar holds document-level actions only.
Drawing tools and per-element properties live in two **floating, draggable
panels** (`#toolsPanel`, `#selectionPanel`) — see HANDOFF.md § "Mobile /
touch" for why and how.

| Lines | Contents |
|---|---|
| 5–11 | Viewport meta — **page zoom is locked off** (`maximum-scale=1, user-scalable=no`); pinch belongs to the canvas, not the chrome |
| 15–388 | App CSS. `:root` **30–46**. `@font-face` ×9 near top (all 9 files present in `fonts/`) |
| 57–68 | `html,body` — incl. `touch-action: pan-x pan-y`, the other half of the page-zoom lock |
| 72–117 | Top toolbar |
| 233–320 | **Floating panels** — `.panel`/`.panelHead`/`.panelBody`, `#toolsPanel`, `#selectionPanel` |
| 321–388 | Responsive: 900px (icon-only bar), 720px (sidebar under canvas), 520px (no tool captions), touch |
| 391–1034 | **Shared nav + `ScuLaFolder`** |
| 1040–1068 | Markup: `#toolbar` (file / zoom / capture / panel toggles) |
| 1069–1105 | Markup: `#toolsPanel` — Basic · Shapes · Arrows |
| 1106–1198 | Markup: `#selectionPanel` — one `.selRow` per property |
| 1199–1316 | Markup: modals, stage, sidebar |
| 1317–3813 | App script |

Script sections (banners `/* ===== Title ===== */`):

| Line | Section |
|---|---|
| 1321 | i18n — `I18N` (`ro:`/`en:`), `t()`, `applyUILang()` |
| 1519 | State — `state` object, style defaults, `PALETTE` |
| 1566 | Utilities — incl. `setBtnLabel`/`setBtnIcon` (icon+label button spans) |
| 1608 | History — `pushHistory`/`snapshot`/`undo`/`redo` |
| 1632 | Loading an image |
| 1665 | Screen snapshot |
| 1705 | Screen recording — `liveRenderLoop`, `startRecording` |
| 1851 | Recording preview / playback — `recordingBlob` kept for the folder save |
| 1953 | Zoom — buttons, Ctrl+scroll, **`gesture*` page-zoom blockers**, `#canvasWrap` pinch |
| 2034 | Pan — `startPan`/`updatePan`/`endPan` |
| 2056 | New canvas modal |
| **2138** | **Rendering** — `renderAll`, `renderBase`, `drawLayer`, all `drawX()` |
| 2633 | Layer list (sidebar) — `renderLayerList` |
| **2681** | **Toolbar wiring** — every button/handler (IDs unchanged by the panel move) |
| **2903** | **Floating panels** — `placePanel`, `defaultPos`, drag, persistence |
| **3075** | **Selection panel contents** — `ROW_TYPES`, `syncSelectionPanel` |
| 3129 | Text box auto-fit |
| 3140 | Pointer/canvas coords — `canvasPoint()` |
| 3171 | Pointer interaction — `onDown`/`onMove`/`onUp`, touch, pinch |
| 3502 | Text editing overlay — `openTextEditor` |
| 3581 | Keyboard shortcuts |
| 3609 | Save — `renderComposite`, **`saveOut()`** 3640 (one line onto `ScuLaFolder.save`) |
| 3648 | Save all sizes (zip) — `makeZip`, `crc32` |
| 3797 | Fonts ready — `document.fonts.load()` startup pass |

Largest region by far is Rendering (2138–2633); go straight to the
specific `drawX()` you need.

**Zoom is the app's, never the browser's.** Three places cooperate and must
stay together — the viewport meta (5–11), `html,body{touch-action}` (57–68)
and the `gesture*` blockers in § Zoom. Remove any one and a pinch starts
scaling the toolbar, panels and sidebar again. See `HANDOFF.md` § Zoom/Pan.

**Two lists must stay in step:** `ROW_TYPES` (3089) says which property
rows show for which layer type, and the handlers in Toolbar wiring (2681)
say which types each control actually writes to. Add a control → add it to
both.

---

## markdown-editor.html — 2706 lines · Markdown editor

`lang="en"`. No section banners — this table is the only map.

| Lines | Contents |
|---|---|
| 8–736 | App CSS. `:root` **9–24** (earth-palette tokens, migrated). `@media` 622, 651 |
| 737 | **mammoth.js CDN** (docx import) — only external dep in the repo |
| 741–1384 | **Shared nav + `ScuLaFolder`** |
| 1386–~1598 | Markup: header, toolbar, workspace, panels, modals |
| 1599–2704 | App script |

| Line | Function / region |
|---|---|
| 1723–1725 | `editor`, `preview` refs, `savedRange` |
| 1728–1750 | Selection: `saveSelection`, `restoreSelection`, `insertAtCursor`, `wrapSelection` |
| 1752–1825 | Insert helpers: `insertHeading`, `insertList`, `insertOrderedList`, `insertFontSize` |
| 1827–1862 | Image modal: `openImageModal`, `handleLocalImage`, `insertImage` |
| 1864–1866 | `workingFolderHandle`, `IMAGE_EXTS` — the image **explorer**'s own read-only picker, unrelated to `ScuLaFolder` |
| 1874–1919 | Responsive: `isSmallScreen`, `isMobile`, `setView`, `togglePanel`, `toggleNav` |
| 2017–2074 | Image tree: `createImageItem`, `showImageDetail`, `insertSelectedImage` |
| 2088 | `resolveImageSrc` — image-path rewrite, export-only |
| 2094 | `applyInline(text, opts)` |
| **2105** | **`parseMarkdown(md, opts)`** — single parser, shared by preview and export |
| 2207–2213 | `updatePreview`, `updateNav` |
| 2295–2323 | `updateStatus`, `newFile`, `openFile`, `importDocx` |
| 2365 | `htmlToMarkdown` (docx → md) |
| 2467–2474 | **`saveOut()`** (one line onto `ScuLaFolder.save`), `saveFile`, `exportHtml` |
| ~1762–1786 | **Exported-HTML template** — standalone `<style>`/`<body>` string |
| 2523–2614 | Table modal: `rebuildTableGrid`, `insertTable`, `insertCodeBlock` |
| 2630–2641 | Link modal: `openLinkModal`, `insertLink` |
| 2678–2704 | `applyResponsiveDefaults`, init |

**Parser is unified (2026-08).** `parseMarkdown(md, {forExport})` and
`applyInline(text, {forExport})` serve both preview (`forExport` falsy) and
export (`forExport: true`) from one implementation — see `resolveImageSrc`
for the only behavioural fork (relative image paths get `public/images/`
prefixed, and a bare image-path line becomes a standalone `<img>`, only
when exporting). New markdown syntax now needs exactly one edit, in
`parseMarkdown`/`applyInline`, not two.

**One trap remains:** exported HTML must stay self-contained (around
2479–2503). It ships to people who don't have the app, so it uses literal
hex, not `var(--…)`. **Do not migrate that block to theme tokens.**

---

## Fast recipes

```bash
# where is X?
grep -n "X" *.html

# every hardcoded colour outside :root
grep -n "#[0-9a-fA-F]\{3,8\}\b" editor.html | sed -n '20,$p'

# every user-visible string in markup
grep -n "placeholder=\"\|title=\"\|aria-label=\"" markdown-editor.html

# confirm nav still in sync (see CLAUDE.md for the full diff snippet)
grep -n "site-nav" *.html
```

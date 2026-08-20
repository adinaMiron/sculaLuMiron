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

`index.html:220-585` · `editor.html:379-744` · `markdown-editor.html:741-1106`

Two features share it, because both must exist before any app script runs:

| Part | What |
|---|---|
| `#site-nav` links + `#navLangBtn` | page links, UI-language toggle → `docs/I18N.md` |
| `#navFolderBtn` + `window.ScuLaFolder` | the one default save folder → `docs/FEATURES.md` § D |
| `#scula-toast` | the shared bottom toast, `ScuLaFolder.toast(msg)` |

Inside the block's `<script>`, in order: current-page highlight ·
`LANG_KEY`/lang toggle · `SUBDIR` map + `T` (its own private ro/en
strings) · toast · IndexedDB helpers (`scula-fs`/`handles`/`root`) ·
`permitted`/`pick`/`forget`/`dir`/`freeName`/`download`/`save` ·
`window.ScuLaFolder = {…}`.

Any edit here goes into **all three** files — see the diff snippet in
`CLAUDE.md`.

---

## index.html — 1367 lines · "Caiet vocal" (voice dictation)

`lang="ro"`. **The only app with a working i18n system** — copy its pattern.

| Lines | Contents |
|---|---|
| 11–217 | App CSS. `:root` palette at **12–37** (earth-palette tokens, migrated) |
| 220–585 | **Shared nav + `ScuLaFolder`** (identical in all 3 files) |
| 586–719 | Markup: header, controls, textarea, settings sheet |
| 720–1370 | App script, numbered sections below |

Script sections (comment banners `/* === N. Title === */`):

| Line | Section |
|---|---|
| 725 | **1. i18n** — `I18N` object (`ro:` 728 / `en:` 771), `t()` at 816, `UI` at 815 |
| 819 | 2. Providers |
| 844 | 3. Settings store — `KEY` 846, `store` w/ memory fallback, `save()` 978, `load()` 979 |
| 876 | 4. DOM refs |
| 907 | 5. Language / engine chips |
| 922 | **6. UI language** — `applyUILang()` **926** |
| 944 | 7. Settings sheet |
| 1016 | 8. Secure-context check |
| 1021 | 9. Recording (MediaRecorder) + segment rotation |
| 1168 | 10. Transcription queue |
| 1262 | 11. Browser dictation (Web Speech API) |
| 1321 | 12. File import |
| 1335 | 13. Copy / share / **download → `ScuLaFolder.save()`** / clear |
| 1366 | 14. Init |

**Two independent language axes — do not conflate:**
- `S.ui` (`UI`) = interface language. Toggle `#uiLangBtn`.
- `S.lang` = *spoken* language for dictation (`ro-RO`/`en-US`/auto), L1268.

---

## editor.html — 3479 lines · "Image Marker" (canvas annotation)

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
| 9–376 | App CSS. `:root` **24–40**. `@font-face` ×9 near top (all 9 files present in `fonts/`) |
| 60–105 | Top toolbar |
| 221–308 | **Floating panels** — `.panel`/`.panelHead`/`.panelBody`, `#toolsPanel`, `#selectionPanel` |
| 309–376 | Responsive: 900px (icon-only bar), 720px (sidebar under canvas), 520px (no tool captions), touch |
| 379–744 | **Shared nav + `ScuLaFolder`** |
| 750–778 | Markup: `#toolbar` (file / zoom / capture / panel toggles) |
| 779–815 | Markup: `#toolsPanel` — Basic · Shapes · Arrows |
| 816–907 | Markup: `#selectionPanel` — one `.selRow` per property |
| 908–1026 | Markup: modals, stage, sidebar |
| 1027–3482 | App script |

Script sections (banners `/* ===== Title ===== */`):

| Line | Section |
|---|---|
| 1031 | i18n — `I18N` (`ro:`/`en:`), `t()`, `applyUILang()` |
| 1233 | State — `state` object, style defaults, `PALETTE` |
| 1280 | Utilities — incl. `setBtnLabel`/`setBtnIcon` (icon+label button spans) |
| 1322 | History — `pushHistory`/`snapshot`/`undo`/`redo` |
| 1346 | Loading an image |
| 1379 | Screen snapshot |
| 1419 | Screen recording — `liveRenderLoop`, `startRecording` |
| 1565 | Recording preview / playback — `recordingBlob` kept for the folder save |
| 1667 | Zoom |
| 1701 | Pan — `startPan`/`updatePan`/`endPan` |
| 1723 | New canvas modal |
| **1805** | **Rendering** — `renderAll`, `renderBase`, `drawLayer`, all `drawX()` |
| 2300 | Layer list (sidebar) — `renderLayerList` |
| **2348** | **Toolbar wiring** — every button/handler (IDs unchanged by the panel move) |
| **2570** | **Floating panels** — `placePanel`, `defaultPos`, drag, persistence |
| **2742** | **Selection panel contents** — `ROW_TYPES`, `syncSelectionPanel` |
| 2796 | Text box auto-fit |
| 2807 | Pointer/canvas coords — `canvasPoint()` |
| 2838 | Pointer interaction — `onDown`/`onMove`/`onUp`, touch, pinch |
| 3169 | Text editing overlay — `openTextEditor` |
| 3248 | Keyboard shortcuts |
| 3276 | Save — `renderComposite`, **`saveOut()`** (the one folder-save wrapper) |
| 3319 | Save all sizes (zip) — `makeZip`, `crc32` |
| 3468 | Fonts ready — `document.fonts.load()` startup pass |

Largest region by far is Rendering (1805–2300); go straight to the
specific `drawX()` you need.

**Two lists must stay in step:** `ROW_TYPES` (2742) says which property
rows show for which layer type, and the handlers in Toolbar wiring (2348)
say which types each control actually writes to. Add a control → add it to
both.

---

## markdown-editor.html — 2431 lines · Markdown editor

`lang="en"`. No section banners — this table is the only map.

| Lines | Contents |
|---|---|
| 8–736 | App CSS. `:root` **9–24** (earth-palette tokens, migrated). `@media` 622, 651 |
| 737 | **mammoth.js CDN** (docx import) — only external dep in the repo |
| 741–1106 | **Shared nav + `ScuLaFolder`** |
| 1108–~1320 | Markup: header, toolbar, workspace, panels, modals |
| 1321–2434 | App script |

| Line | Function / region |
|---|---|
| 1449–1451 | `editor`, `preview` refs, `savedRange` |
| 1454–1476 | Selection: `saveSelection`, `restoreSelection`, `insertAtCursor`, `wrapSelection` |
| 1478–1551 | Insert helpers: `insertHeading`, `insertList`, `insertOrderedList`, `insertFontSize` |
| 1553–1588 | Image modal: `openImageModal`, `handleLocalImage`, `insertImage` |
| 1590–1592 | `workingFolderHandle`, `IMAGE_EXTS` — the image **explorer**'s own read-only picker, unrelated to `ScuLaFolder` |
| 1600–1645 | Responsive: `isSmallScreen`, `isMobile`, `setView`, `togglePanel`, `toggleNav` |
| 1743–1800 | Image tree: `createImageItem`, `showImageDetail`, `insertSelectedImage` |
| 1814 | `resolveImageSrc` — image-path rewrite, export-only |
| 1820 | `applyInline(text, opts)` |
| **1831** | **`parseMarkdown(md, opts)`** — single parser, shared by preview and export |
| 1933–1939 | `updatePreview`, `updateNav` |
| 2021–2049 | `updateStatus`, `newFile`, `openFile`, `importDocx` |
| 2091 | `htmlToMarkdown` (docx → md) |
| 2193–2204 | **`saveOut()`** (the one folder-save wrapper), `saveFile`, `exportHtml` |
| ~1762–1786 | **Exported-HTML template** — standalone `<style>`/`<body>` string |
| 2253–2344 | Table modal: `rebuildTableGrid`, `insertTable`, `insertCodeBlock` |
| 2360–2371 | Link modal: `openLinkModal`, `insertLink` |
| 2408–2434 | `applyResponsiveDefaults`, init |

**Parser is unified (2026-08).** `parseMarkdown(md, {forExport})` and
`applyInline(text, {forExport})` serve both preview (`forExport` falsy) and
export (`forExport: true`) from one implementation — see `resolveImageSrc`
for the only behavioural fork (relative image paths get `public/images/`
prefixed, and a bare image-path line becomes a standalone `<img>`, only
when exporting). New markdown syntax now needs exactly one edit, in
`parseMarkdown`/`applyInline`, not two.

**One trap remains:** exported HTML must stay self-contained (around
2209–2233). It ships to people who don't have the app, so it uses literal
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

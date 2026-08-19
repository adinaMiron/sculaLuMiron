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

---

## index.html — 1025 lines · "Caiet vocal" (voice dictation)

`lang="ro"`. **The only app with a working i18n system** — copy its pattern.

| Lines | Contents |
|---|---|
| 11–206 | App CSS. `:root` palette at **12–26** |
| 210–252 | **Shared nav** (identical in all 3 files) |
| 253–387 | Markup: header, controls, textarea, settings sheet |
| 388–1023 | App script, numbered sections below |

Script sections (comment banners `/* === N. Title === */`):

| Line | Section |
|---|---|
| 392 | **1. i18n** — `I18N` object (`ro:` / `en:`), `t()` at 480, `UI` at 479 |
| 482 | 2. Providers |
| 507 | 3. Settings store — `KEY` 510, `store` w/ memory fallback, `save()` 636, `load()` 637 |
| 539 | 4. DOM refs |
| 570 | 5. Language / engine chips |
| 585 | **6. UI language** — `applyUILang()` **588**, toggle handler 599 |
| 601 | 7. Settings sheet |
| 668 | 8. Secure-context check |
| 673 | 9. Recording (MediaRecorder) + segment rotation |
| 820 | 10. Transcription queue |
| 914 | 11. Browser dictation (Web Speech API) |
| 973 | 12. File import |
| 987 | 13. Copy / share / download / clear |
| 1018 | 14. Init |

**Two independent language axes — do not conflate:**
- `S.ui` (`UI`) = interface language. Toggle `#uiLangBtn`.
- `S.lang` = *spoken* language for dictation (`ro-RO`/`en-US`/auto), L921.

---

## editor.html — 2509 lines · "Image Marker" (canvas annotation)

`lang="en"`. Deep internals in **`HANDOFF.md`** — read that for the layer
model, rendering pipeline, and canvas traps. Map only below.

| Lines | Contents |
|---|---|
| 8–259 | App CSS. `:root` **19–31**. `@font-face` ×9 near top (**broken paths**) |
| 263–305 | **Shared nav** |
| 306–525 | Markup: toolbar, stage, sidebar, modals |
| 526–2509 | App script |

Script sections (banners `/* ===== Title ===== */`):

| Line | Section |
|---|---|
| 530 | State — `state` object, style defaults, `PALETTE` **560** |
| 572 | Utilities |
| 601 | History — `pushHistory`/`snapshot`/`undo`/`redo` |
| 625 | Loading an image |
| 658 | Screen snapshot |
| 698 | Screen recording — `liveRenderLoop`, `startRecording` |
| 838 | Recording preview / playback |
| 942 | Zoom |
| 976 | Pan — `startPan`/`updatePan`/`endPan` |
| 998 | New canvas modal |
| **1080** | **Rendering** — `renderAll`, `renderBase`, `drawLayer`, all `drawX()` |
| 1575 | Layer list (sidebar) — `renderLayerList` |
| **1623** | **Toolbar wiring** — every button/handler |
| 1836 | Text box auto-fit |
| 1847 | Pointer/canvas coords — `canvasPoint()` |
| 1878 | Pointer interaction — `onDown`/`onMove`/`onUp`, touch, pinch |
| 2198 | Text editing overlay — `openTextEditor` |
| 2276 | Keyboard shortcuts |
| 2304 | Save — `renderComposite` |
| 2341 | Save all sizes (zip) — `makeZip`, `crc32` |
| 2493 | Fonts ready — `document.fonts.load()` startup pass |

Largest region by far is Rendering (1080–1575); go straight to the
specific `drawX()` you need.

---

## markdown-editor.html — 2072 lines · Markdown editor

`lang="en"`. No section banners — this table is the only map.

| Lines | Contents |
|---|---|
| 8–734 | App CSS. `:root` **9–22**. `@media` 620, 649 |
| 735 | **mammoth.js CDN** (docx import) — only external dep in the repo |
| 740–782 | **Shared nav** |
| 783–996 | Markup: header, toolbar, workspace, panels, modals |
| 997–2070 | App script |

| Line | Function / region |
|---|---|
| 998–1000 | `editor`, `preview` refs, `savedRange` |
| 1003–1027 | Selection: `saveSelection`, `restoreSelection`, `insertAtCursor`, `wrapSelection` |
| 1027–1101 | Insert helpers: `insertHeading`, `insertList`, `insertOrderedList`, `insertFontSize` |
| 1102–1143 | Image modal: `openImageModal`, `handleLocalImage`, `insertImage` |
| 1139–1141 | `workingFolderHandle`, `IMAGE_EXTS` (File System Access API) |
| 1149–1186 | Responsive: `isSmallScreen`, `isMobile`, `setView`, `togglePanel`, `toggleNav` |
| 1292–1349 | Image tree: `createImageItem`, `showImageDetail`, `insertSelectedImage` |
| **1359** | **`parseMarkdown`** — preview renderer |
| 1452 | `applyInline` |
| 1462 | `applyInlineForExport` ⚠ twin of 1452 |
| **1475** | **`parseMarkdownForExport`** ⚠ twin of 1359 |
| 1568–1574 | `updatePreview`, `updateNav` |
| 1656–1692 | `updateStatus`, `newFile`, `openFile`, `importDocx` |
| 1726 | `htmlToMarkdown` (docx → md) |
| 1825–1835 | `saveFile`, `exportHtml` |
| 1846–1870 | **Exported-HTML template** — standalone `<style>`/`<body>` string |
| 1881–1980 | Table modal: `rebuildTableGrid`, `insertTable`, `insertCodeBlock` |
| 1996–2044 | Link modal: `openLinkModal`, `insertLink` |
| 2044–2070 | `applyResponsiveDefaults`, init |

**Two traps here:**
1. **Duplicated parser.** Add markdown syntax to *both* 1359 and 1475 (and
   both inline fns) or export diverges from preview.
2. **Exported HTML must stay self-contained** (1846–1870). It ships to
   people who don't have the app, so it uses literal hex, not `var(--…)`.
   **Do not migrate that block to theme tokens.**

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

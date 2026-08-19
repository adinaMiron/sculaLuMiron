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

## index.html — 1036 lines · "Caiet vocal" (voice dictation)

`lang="ro"`. **The only app with a working i18n system** — copy its pattern.

| Lines | Contents |
|---|---|
| 11–217 | App CSS. `:root` palette at **12–37** (earth-palette tokens, migrated) |
| 221–263 | **Shared nav** (identical in all 3 files) |
| 264–398 | Markup: header, controls, textarea, settings sheet |
| 399–1034 | App script, numbered sections below |

Script sections (comment banners `/* === N. Title === */`):

| Line | Section |
|---|---|
| 403 | **1. i18n** — `I18N` object (`ro:` / `en:`), `t()` at 491, `UI` at 490 |
| 493 | 2. Providers |
| 518 | 3. Settings store — `KEY` 521, `store` w/ memory fallback, `save()` 647, `load()` 648 |
| 550 | 4. DOM refs |
| 581 | 5. Language / engine chips |
| 596 | **6. UI language** — `applyUILang()` **599**, toggle handler 610 |
| 612 | 7. Settings sheet |
| 679 | 8. Secure-context check |
| 684 | 9. Recording (MediaRecorder) + segment rotation |
| 831 | 10. Transcription queue |
| 925 | 11. Browser dictation (Web Speech API) |
| 984 | 12. File import |
| 998 | 13. Copy / share / download / clear |
| 1029 | 14. Init |

**Two independent language axes — do not conflate:**
- `S.ui` (`UI`) = interface language. Toggle `#uiLangBtn`.
- `S.lang` = *spoken* language for dictation (`ro-RO`/`en-US`/auto), L921.

---

## editor.html — 2533 lines · "Image Marker" (canvas annotation)

`lang="en"`. Deep internals in **`HANDOFF.md`** — read that for the layer
model, rendering pipeline, and canvas traps. Map only below.

Theme: ✅ migrated to the earth palette (dark), step 3 of `docs/THEME.md`.
`:root` uses the shared semantic token names (`--surface`, `--text`, …) —
see that doc for the canvas-colour resolution (`CHROME` cache, ~L537).

| Lines | Contents |
|---|---|
| 8–264 | App CSS. `:root` **20–36**. `@font-face` ×9 near top (**broken paths**) |
| 268–310 | **Shared nav** |
| 311–530 | Markup: toolbar, stage, sidebar, modals |
| 531–2533 | App script |

Script sections (banners `/* ===== Title ===== */`):

| Line | Section |
|---|---|
| 548 | State — `state` object, style defaults, `PALETTE` **582** |
| 594 | Utilities |
| 623 | History — `pushHistory`/`snapshot`/`undo`/`redo` |
| 647 | Loading an image |
| 680 | Screen snapshot |
| 720 | Screen recording — `liveRenderLoop`, `startRecording` |
| 860 | Recording preview / playback |
| 964 | Zoom |
| 998 | Pan — `startPan`/`updatePan`/`endPan` |
| 1020 | New canvas modal |
| **1102** | **Rendering** — `renderAll`, `renderBase`, `drawLayer`, all `drawX()` |
| 1597 | Layer list (sidebar) — `renderLayerList` |
| **1645** | **Toolbar wiring** — every button/handler |
| 1858 | Text box auto-fit |
| 1869 | Pointer/canvas coords — `canvasPoint()` |
| 1900 | Pointer interaction — `onDown`/`onMove`/`onUp`, touch, pinch |
| 2220 | Text editing overlay — `openTextEditor` |
| 2298 | Keyboard shortcuts |
| 2326 | Save — `renderComposite` |
| 2365 | Save all sizes (zip) — `makeZip`, `crc32` |
| 2517 | Fonts ready — `document.fonts.load()` startup pass |

Largest region by far is Rendering (1102–1597); go straight to the
specific `drawX()` you need.

---

## markdown-editor.html — 1988 lines · Markdown editor

`lang="en"`. No section banners — this table is the only map.

| Lines | Contents |
|---|---|
| 8–736 | App CSS. `:root` **9–24** (earth-palette tokens, migrated). `@media` 621, 650 |
| 737 | **mammoth.js CDN** (docx import) — only external dep in the repo |
| 742–784 | **Shared nav** |
| 785–~998 | Markup: header, toolbar, workspace, panels, modals |
| 999–1988 | App script |

| Line | Function / region |
|---|---|
| 1000–1002 | `editor`, `preview` refs, `savedRange` |
| 1005–1029 | Selection: `saveSelection`, `restoreSelection`, `insertAtCursor`, `wrapSelection` |
| 1029–1103 | Insert helpers: `insertHeading`, `insertList`, `insertOrderedList`, `insertFontSize` |
| 1104–1145 | Image modal: `openImageModal`, `handleLocalImage`, `insertImage` |
| 1141–1143 | `workingFolderHandle`, `IMAGE_EXTS` (File System Access API) |
| 1151–1188 | Responsive: `isSmallScreen`, `isMobile`, `setView`, `togglePanel`, `toggleNav` |
| 1294–1351 | Image tree: `createImageItem`, `showImageDetail`, `insertSelectedImage` |
| 1365 | `resolveImageSrc` — image-path rewrite, export-only |
| 1371 | `applyInline(text, opts)` |
| **1382** | **`parseMarkdown(md, opts)`** — single parser, shared by preview and export |
| 1484–1490 | `updatePreview`, `updateNav` |
| 1572–1600 | `updateStatus`, `newFile`, `openFile`, `importDocx` |
| 1642 | `htmlToMarkdown` (docx → md) |
| 1741–1751 | `saveFile`, `exportHtml` |
| ~1762–1786 | **Exported-HTML template** — standalone `<style>`/`<body>` string |
| 1805–1896 | Table modal: `rebuildTableGrid`, `insertTable`, `insertCodeBlock` |
| 1912–1923 | Link modal: `openLinkModal`, `insertLink` |
| 1960–1988 | `applyResponsiveDefaults`, init |

**Parser is unified (2026-08).** `parseMarkdown(md, {forExport})` and
`applyInline(text, {forExport})` serve both preview (`forExport` falsy) and
export (`forExport: true`) from one implementation — see `resolveImageSrc`
for the only behavioural fork (relative image paths get `public/images/`
prefixed, and a bare image-path line becomes a standalone `<img>`, only
when exporting). New markdown syntax now needs exactly one edit, in
`parseMarkdown`/`applyInline`, not two.

**One trap remains:** exported HTML must stay self-contained (around
1762–1786). It ships to people who don't have the app, so it uses literal
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

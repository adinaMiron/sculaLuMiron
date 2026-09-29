# task-02 — Keep the markdown page header on screen at laptop widths

## 1. Problem

On `index.html` (the markdown page) the header row
(`<header>` › `.header-actions`, markup at `index.html:3562–3601`) is a single
fixed-height (52px), non-wrapping flex row. Above 1024px nothing lets it wrap,
so on a laptop (1025–~1600px) its content is wider than the viewport and the
save/sync group — `.wb-save-sync-row`: **Save to workbook**, **Sync to folder**,
the Google button `#btn-wb-cloud` (reads **"☁ Sincronizează acum" / "☁ Sync now"**
when connected), its status text `#wb-cloud-where`, **Save all modified**
(`#btn-save-all-modified`) — is pushed past the right edge. `body` has
`overflow: hidden`, so those buttons are simply unreachable.

Rough sizes in Romanian at 12px: the four save/sync buttons alone are ≈ 900px;
the eleven other header buttons plus the crumb and file name are well over
1000px. So at 1025px neither group fits on one line, and the fix must let
**both** the upper buttons and the save/sync group wrap.

## 2. Agreed product decisions (binding)

1. **Scope: `index.html` only**, and only its `<header>` plus a check of the
   formatting toolbar (`.toolbar`) directly under it. The shared site nav
   (`<nav id="site-nav">` block, Rule 2 in `CLAUDE.md`) and the other eight
   pages are **not touched**. If they have the same problem, that is a separate
   task — mention it in the implementation report, don't fix it.
2. **Only widths above 1024px change.** The existing `@media (max-width: 1024px)`,
   `(max-width: 700px)`, `(max-width: 420px)` and landscape-phone rules stay
   byte-for-byte as they are. `isSmallScreen()` / `isMobile()` in
   `js/markdown/editor.js:548–549` are not touched.
3. **Chosen approach (option "d")**: for widths **1025px – 1600px inclusive**,
   tighten button padding and let the header wrap, with `.wb-save-sync-row`
   breaking onto **its own row** below the other header buttons — the same idea
   as the tablet layout.
4. **Nothing is hidden, moved into a menu, or reduced to an icon.** Every
   button keeps its full text label in both languages. No `⋯ More` dropdown, no
   `display:none`, no `font-size: 0`, no label shortening, no new i18n keys.
5. Buttons that must always be visible with one click (never scrolled, never
   in a menu): Workbooks, New, Idea, Save to workbook, Sync to folder, the
   Google button (Sincronizează acum), Save all modified. (Rarely used: Open .md,
   Import DOCX, Export HTML, Push dates, Gantt, Help — these must *also* stay
   visible under decision 4; the distinction only matters for order, see § 3.4.)
6. **Acceptance widths**: 1025, 1280, 1366, 1440, 1536px, 100% zoom, in both
   Romanian and English. At each, every header button and every toolbar
   control lies fully inside the viewport and the page has no horizontal
   scroll. **Also** checked at 1601 and 1920px so the desktop layout above the
   breakpoint does not regress.
7. **Worst case is the test case**: Google connected (button reads
   "☁ Sincronizează acum"/"☁ Sync now") with a status line in
   `#wb-cloud-where`, the 🗺 Map button (`#btn-map`) visible, a long chapter
   name in `#current-file`, and the workbook crumb `#wb-crumb` shown. The long
   file name, the crumb and the status text **truncate with an ellipsis**
   rather than push buttons out.

## 3. Implementation (CSS + one comment; no JS)

### 3.1 Where

Add **one new media block** in `index.html`'s `<style>`, immediately after the
existing block

```css
  @media (max-width: 1600px) {
    .toolbar-sep { margin: 0 2px; }
  }
```

(`index.html:1138–1140`) and **before** the `/* ═══════════ TABLET (≤ 1024px) ═══════════ */`
comment. Leave the existing 1600px block as is.

Use exactly this media query so it cannot leak into the tablet range:

```css
  @media (min-width: 1025px) and (max-width: 1600px) { … }
```

Start the block with a short comment in the file's style explaining why
(laptop widths: the header wraps instead of spilling; save/sync group gets its
own row; nothing hidden; see docs/tasks/02-…/spec.md is **not** needed — refer
to `docs/FEATURES.md`/`docs/MAP.md` only if you add a line there).

### 3.2 Rules (target values — implement these; deviate only if a measurement in § 5 fails, and record why in the report)

```css
    header {
      height: auto;
      min-height: 52px;          /* one-row look unchanged when it fits */
      padding: 6px 20px;
      gap: 12px;
    }
    .logo { flex: 0 0 auto; white-space: nowrap; }
    .header-actions {
      flex: 1 1 0;
      min-width: 0;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 6px;
    }
    .header-actions .btn { padding: 6px 10px; white-space: nowrap; }
    .header-actions .file-name,
    .header-actions .wb-crumb {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .header-actions .file-name { max-width: 260px; }
    .header-actions .wb-crumb  { max-width: 220px; }

    /* save/sync group: its own row, right-aligned, under the other buttons */
    .wb-save-sync-row {
      display: flex;
      flex: 1 1 100%;
      justify-content: flex-end;
      align-items: center;
      flex-wrap: wrap;           /* last-resort fallback at 1025px in Romanian */
      gap: 6px;
      min-width: 0;
    }
    .wb-save-sync-row .btn { flex: 0 0 auto; }
    .wb-save-sync-row #wb-cloud-where { flex: 0 1 auto; min-width: 0; max-width: 260px; }
```

Notes that are part of the spec:

- **Scope `.btn` to `.header-actions .btn`.** Do not change the global `.btn`
  rule in this range — `.btn` is also used in modals, which must not change.
- Font size of header buttons **stays 12px** (only padding tightens). Do not
  touch `letter-spacing`.
- `#wb-cloud-where` already has `overflow:hidden; text-overflow:ellipsis;
  white-space:nowrap` (`index.html:284–292`); the new `max-width`/`min-width`
  make that ellipsis actually engage. Its `<a>` child (added by `paintCloud()`
  in `js/markdown/drive.js:434`) must still be clickable.
- `.wb-save-sync-row` keeps its **DOM position** (last child of
  `.header-actions`) — **no `order: -1`** here, unlike the tablet rule. So the
  order on screen is: row(s) 1…n = crumb, file name, Workbooks … Export HTML
  (right-aligned, wrapping as needed); last row = the save/sync group,
  right-aligned, under them. This keeps the group where users already look for
  it (the right-hand side).
- The `flex-wrap: wrap` on `.wb-save-sync-row` is a safety net: at 1025px in
  Romanian the four buttons plus the status text may not fit on one line
  beside the logo; then the group itself wraps onto a second line (still no
  horizontal scroll, nothing hidden). At 1280px and up it should be one line —
  verify, and if it is not at 1280/RO, report the measured widths.
- The header now grows in height; `body` is a 100vh flex column, so the
  editor area shrinks accordingly. That is expected. No JS reads the header's
  height (checked: nothing in `js/markdown/` queries `header`), so nothing else
  needs adjusting.

### 3.3 Toolbar check

`.toolbar` already has `flex-wrap: wrap` and `.toolbar-filters` has
`max-width: 100%; flex-wrap: wrap`, so it is expected to fit already. Measure
it at every acceptance width (§ 5). **Only if** a toolbar control's
bounding box exceeds the viewport, add the minimal fix **inside the same new
media block** (e.g. a `max-width` on the offending `.tb-select`), and record
what you changed and why in the implementation report. Do not change toolbar
rules outside that block.

### 3.4 Comment to update

The HTML comment above `<div class="wb-save-sync-row">`
(`index.html:3581–3584`) currently says *"Desktop: display:contents, no layout
change."* Rewrite it so it is true: above 1600px `display:contents`; 1025–1600px
its own right-aligned row under the other header buttons; ≤1024px its own
scrollable row first. Keep it ≤ 5 lines.

### 3.5 Must not change

- Any rule in the `≤1024px`, `≤700px`, `≤420px`, landscape-phone blocks.
- The global `header`, `.header-actions`, `.btn`, `.wb-save-sync-row` rules
  outside the new block (so > 1600px is byte-identical in behaviour).
- The nav block (Rule 2) — `/verify` must still report the nine copies identical.
- Any JS, any i18n string, any other page.
- No new dependency, file, or script tag in product code.

### 3.6 Docs

In `docs/FEATURES.md` or `docs/MAP.md`, no anchor change is required (the
index section of MAP.md lists JS files, not CSS lines). If you find a doc that
describes the header as a single row on desktop, correct it in the same change.

## 4. Tests (standing team policy)

The Tester adds a Playwright suite under
`tests/02-adapt-the-menu-for-small-screens/` plus whatever tooling it needs
(`tests/package.json` `test` script entry, `playwright.config.*` if used,
`.gitignore` entries). That is **allowed and expected**; the product-code
scope limits above do not apply to it. Follow the style of
`tests/03-for-index-html-page-in-idee/picker.js` (plain `node` script, uses
`tests/node_modules/playwright`, browser from `PW_CHROME_PATH`, exit 1 on any
failure), and make sure `cd tests && npm test` runs it.

### 4.1 Setting up the worst case (from `page.evaluate`)

Top-level `let` bindings from the classic scripts are reachable by name.

- Language: `window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'ro' | 'en' }))`
  (the nav stores it under `localStorage['scula:ui-lang']`). Re-run the
  worst-case setup after switching, since `applyUILang()` re-labels buttons.
- Google connected: `gsFolder = { id: 'test-folder', name: 'ScuLa' }; gsLastAt = Date.now() - 86400000; paintCloud();`
  → `#btn-wb-cloud` reads "☁ Sincronizează acum" / "☁ Sync now" and
  `#wb-cloud-where` shows a date + time link. Additionally test once with a
  long injected status (e.g. set the `<a>`'s text to 120 characters) to prove
  the ellipsis.
- Map button: `document.getElementById('btn-map').hidden = false`.
- Crumb: `const c = document.getElementById('wb-crumb'); c.hidden = false; c.textContent = '<long workbook name, ~60 chars, with diacritics>';`
- Long chapter name: `document.getElementById('current-file').textContent = '<~90-char file name>.md'`.

### 4.2 Assertions, at widths 1025, 1280, 1366, 1440, 1536, 1601, 1920 × `ro`, `en` (viewport height 900)

1. Every visible (`offsetParent !== null` or non-zero rect) element matching
   `header .btn, header .file-name, header .wb-crumb, #wb-cloud-where,
   .toolbar .tb-btn, .toolbar .tb-select, .toolbar label` has
   `rect.left >= 0` and `rect.right <= window.innerWidth` (allow 0.5px
   rounding), and `rect.width > 0`.
2. `document.documentElement.scrollWidth <= document.documentElement.clientWidth`
   and the same for `document.body`.
3. No header button is clipped by an ancestor: for each `header .btn`, its
   rect is fully inside the `header`'s rect.
4. Every header button still shows its full label: `btn.scrollWidth <= btn.clientWidth`
   and its `textContent` equals the language's expected label (e.g.
   `☁ Sincronizează acum`, `📚 Salvează tot ce s-a modificat`,
   `☁ Sync now`, `📚 Save all modified`).
5. Truncation: `#current-file`, `#wb-crumb` and `#wb-cloud-where` have
   computed `text-overflow: ellipsis` and, with the long strings,
   `scrollWidth > clientWidth` (i.e. they are truncated, not the buttons) at
   1025–1600px.
6. Save/sync row is its own row at 1025–1600px: the top of
   `.wb-save-sync-row`'s first button is ≥ the bottom of `#btn-workbooks`
   (it sits below the other buttons), and its buttons are right-aligned
   (the rightmost save/sync element's right edge is within 1px of
   `.header-actions`' right edge).
7. Above the breakpoint (1601, 1920): `.wb-save-sync-row` computes
   `display: contents` and `header` computes `height: 52px` — unchanged
   desktop layout. (At 1601 with the full worst case the upper content may
   not fit on one line; if assertion 1 fails at 1601 **only** because the
   pre-existing desktop layout overflows, report it as a finding in the test
   report rather than a regression, with measured widths. At 1920 it must pass.)
8. Tablet untouched: at 1024px `.wb-save-sync-row` computes `order: -1`,
   `overflow-x: auto`, `flex-wrap: nowrap` (the existing tablet rule).
9. Buttons remain functional after the reflow: clicking `#btn-save-all-modified`
   and `#btn-wb-sync` at 1280px reaches their handlers (stub
   `saveAllModifiedChapters` / `syncAllToFolder` on `window` before clicking
   and assert they were called) — proves they are not covered by another element.

Also run `node tests/verify.js` and the existing `tests/idea.js` /
`tests/nav.js` (their known failures are listed in `CLAUDE.md` › Known issues
and must not grow).

## 5. Manual verification (human)

1. Open `index.html` in Chrome from `file://`. Open DevTools → device toolbar
   → Responsive, zoom 100%.
2. In the console run the § 4.1 worst-case snippet (connected Google, map
   button, crumb, long name).
3. Set width to 1025, 1280, 1366, 1440, 1536: every header button, including
   "☁ Sincronizează acum" and "📚 Salvează tot ce s-a modificat", is fully
   visible; the save/sync group sits on its own row under the other buttons,
   right-aligned; the long name, crumb and status end in "…"; there is no
   horizontal scrollbar; the formatting toolbar's last control (the filter
   dropdowns) is on screen.
4. Switch the language (EN/RO toggle in the nav) and repeat step 3.
5. At 1920 the header looks exactly as before (one 52px row). At 1024 and
   below it looks exactly as before (tablet layout, save/sync row first and
   horizontally scrollable).

## 6. Done means

- The new media block and the updated HTML comment are the only product
  changes (plus any toolbar fix from § 3.3, recorded in the report).
- `node tests/verify.js` passes (parse, nav sync ×9, diacritics).
- The Tester's suite passes all assertions in § 4.2 at all listed widths and
  both languages.
- Implementation report lists the measured header height at 1025/1280/1536
  in RO and EN, and whether the save/sync group needed its fallback wrap at
  any width.

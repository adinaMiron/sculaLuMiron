# Task 01 — Move the save/sync buttons onto their own line (attempt 2)

## Requirement (verbatim)

> Move Salveaza and sincronizeaza buttons, like: Salveaza capitolul curent in
> caiet, Sincronizeaza in dosar, Sincronizeaza acum, the syncronizing status
> and Salveaza tot ce s-a modificat, on a new line of the toolbar.

## Why there is an attempt 2, and what is different this time

Attempt 1's code was sound but the implementer ran out of **turns**
(31/30) before finishing its summary; no tester or review ever ran. The
owner asked for a different approach. The approach this time:

- **This spec gives the exact final text of every edit** (paste-ready
  "replace X with Y" blocks below). There is nothing to design and nothing to
  explore. Do not read `docs/MAP.md`, `HANDOFF.md` or other docs; do not
  grep around the codebase beyond the anchors named here.
- **Budget: aim for ≤ 15 tool calls.** Suggested order: 1 grep to confirm
  anchors → 1–2 narrow reads → 5 edits in `index.html` → 2 edits in
  `docs/FEATURES.md` → `node tests/verify.js` → `node gdsync.js` (run from
  `tests/`) → write the report → commit. Write `implementation-report.md`
  **before** any optional extra checking, so a turn cap can never again eat
  the deliverable.
- The one runtime check the implementer must do is `node gdsync.js`,
  because that suite **already** expects the new structure (see "Already
  done" below) and currently fails on this branch.

## Binding decisions (agreed with the product owner)

1. **Placement:** its own row in `index.html`, **directly after `</header>`
   and directly before `<div class="toolbar">`** — a sibling of both, a direct
   child of `<body>`. It is **not** inside `.toolbar` / `#toolbar-groups`, so
   the ☰ collapse (`toggleToolbarCollapse()`, `.toolbar.collapsed`) never
   hides it.
2. **Every screen size** (desktop, tablet ≤ 1024 px, mobile ≤ 700 px, very
   small ≤ 420 px, landscape phone): the row is always visible, on **one
   line**, which **scrolls sideways** (`overflow-x: auto`) when it does not
   fit. It **never wraps**, and its buttons are never squashed (no button's
   text gets clipped or broken across lines).
3. **Left-aligned**, in **today's order**:
   1. `📓 Salvează capitolul în caiet` / `📓 Save to workbook` — `.btn.btn-primary`, `onclick="saveToWorkbook()"`
   2. `⇩ Sincronizează în dosar` / `⇩ Sync to folder` — `#btn-wb-sync`
   3. `☁ Cont Google` / `☁ Sincronizează acum` when connected — `#btn-wb-cloud` (label written by `paintCloud()`)
   4. the sync status text — `#wb-cloud-where`, **directly after ☁**
   5. `📚 Salvează tot ce s-a modificat` / `📚 Save all modified` — `#btn-save-all-modified`
4. Every button keeps its **`id`, `class`, `onclick`, `oncontextmenu`,
   `data-i`, `data-i-title`, `title`** byte-for-byte. `#btn-wb-cloud` keeps
   having **no** `data-i`. Ctrl+S and Ctrl+Alt+S keep working (they call
   functions, not DOM positions — no JS change).
5. Lead decisions: the buttons keep the header's `.btn` look (first one keeps
   `.btn-primary`); the row's background/border use theme tokens
   (`var(--surface)`, `var(--border)`) — **no hex**; the old split rules
   (desktop `display: contents`, tablet `order: -1; width: 100%` inside the
   wrapping header) are replaced by **one** set of row rules; the mobile rule
   `.btn { flex: 1 1 auto; min-width: 0; … }` must not stretch, squash or wrap
   these buttons (handled by a more specific `.wb-save-sync-row .btn` rule).

## Scope

- Product code: **only `index.html`** (CSS + markup). No change in
  `js/markdown/*`. No new i18n keys (the row has no text of its own and no
  `aria-label`). No new dependencies. The shared nav block
  (`<nav id="site-nav">` … `end toolbar nav`) is **not** touched, so nothing is
  copied to the other eight pages.
- Docs: two sentences in `docs/FEATURES.md` (edit 6).
- `docs/MAP.md` has no anchors for the index header markup — nothing to fix
  there.
- **Standing team policy:** the Tester adds a Playwright suite under
  `tests/01-move-salveaza-and-sincronizeaza-buttons-like/` plus whatever
  tooling it needs (a `test` script entry, a playwright config if used,
  `.gitignore` entries). That is expected and is not a scope violation.

## Already done on this branch (do not redo)

`tests/gdsync.js` (~line 289–295) was updated in attempt 1 and survived the
reset: it already asserts
`document.querySelector('#wb-save-sync-row #btn-wb-cloud')` and that its
parent also contains `#btn-save-all-modified`. So the row **must** carry
`id="wb-save-sync-row"` and the five items must be its **direct children**.
Do not edit `tests/gdsync.js`.

## The edits (index.html) — line numbers are from HEAD, grep to confirm

Confirm anchors first with:
`grep -n "wb-save-sync-row\|^<header>\|^</header>\|^<div class=\"toolbar\">" index.html`

### Edit 1 — base CSS (≈ line 86)

Replace the single line

```css
  .wb-save-sync-row { display: contents; }
```

with

```css

  /* Save/sync row: its own line between the header and the formatting
     toolbar, on every screen size, outside #toolbar-groups so the ☰
     collapse never hides it. nowrap + overflow-x:auto (same pattern as
     #site-nav): one line that scrolls sideways, never wraps. */
  .wb-save-sync-row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    flex-wrap: nowrap;
    gap: 8px;
    padding: 6px 20px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    flex-shrink: 0;
  }
  /* 0,2,0 beats the mobile `.btn { flex: 1 1 auto; min-width: 0 }` */
  .wb-save-sync-row .btn { flex: 0 0 auto; white-space: nowrap; }
  .wb-save-sync-row #wb-cloud-where { flex: 0 0 auto; }
```

### Edit 2 — TABLET block `@media (max-width: 1024px)` (≈ lines 1151–1165)

Delete the comment `/* Save/sync trio: its own full-width row, … */` and the
three rules under it (`.wb-save-sync-row { display: flex; order: -1; width:
100%; … }`, `.wb-save-sync-row .btn { … }`, `.wb-save-sync-row
#wb-cloud-where { … }`). Put in their place exactly:

```css
    .wb-save-sync-row { padding: 6px 14px; gap: 6px; }
```

In the same block, the `.toolbar-filters` comment ends with
"`.wb-save-sync-row above. */`" — change "`.wb-save-sync-row above.`" to
"`.wb-save-sync-row.`" (it is no longer above).

### Edit 3 — MOBILE block `@media (max-width: 700px)` (≈ line 1245)

Directly after the line
`.btn { flex: 1 1 auto; min-width: 0; text-align: center; padding: 8px 6px; font-size: 11px; }`
add:

```css
    .wb-save-sync-row { padding: 6px 12px; }
```

Leave the `.btn` line itself untouched. The VERY SMALL (≤ 420 px) block is not
touched (its smaller `.btn` font/padding applies to the row too; that is
wanted).

### Edit 4 — landscape block `@media (max-height: 500px) and (orientation: landscape)` (≈ line 1314)

After `header { height: auto; padding: 4px 12px; }` add:

```css
    .wb-save-sync-row { padding: 4px 12px; }
```

### Edit 5 — markup (≈ lines 3579–3598)

Inside `<div class="header-actions">`, delete everything from the comment
`<!-- Save/sync trio: kept in its own row …` through the `</div>` that closes
`<div class="wb-save-sync-row">` (i.e. the comment, the wrapper, the five
children and their two inner comments). `.header-actions` must end with the
`Export HTML` button, then `</div>`, then `</header>`.

Then, between `</header>` and `<div class="toolbar">`, insert exactly (the
button lines are the existing lines, unchanged apart from indentation):

```html
<!-- Save/sync row: its own line between the header and the formatting
     toolbar, on every screen size, outside #toolbar-groups so the ☰
     collapse never hides it. One line, scrolling sideways if it doesn't
     fit — never wrapping. -->
<div class="wb-save-sync-row" id="wb-save-sync-row">
  <button class="btn btn-primary" onclick="saveToWorkbook()" data-i="saveToWorkbookBtn" data-i-title="saveToWorkbookTip" title="Save this chapter into a workbook (Ctrl+S)">📓 Save to workbook</button>
  <!-- Beside ☁ rather than inside the Caiete panel: the two are one
       gesture on a new device (folder + account), so they sit together. -->
  <button class="btn" id="btn-wb-sync" onclick="syncAllToFolder()" data-i="syncFolderBtn" data-i-title="syncFolderTip" title="Take in new workbooks and chapters from the markdown folder and from Google Drive, then write every chapter into the folder">⇩ Sync to folder</button>
  <!-- Google Drive sync: the chapters follow the Google account, so every
       Chrome signed into it has them — docs/FEATURES.md § O. No data-i:
       the label depends on the connection, so paintCloud() writes both
       halves and applyUILang() must not overwrite one of them. Kept beside
       the Save buttons rather than inside the Caiete/Workbooks panel, so
       it's reachable without opening that panel. -->
  <button class="btn" id="btn-wb-cloud" onclick="cloudButton()" oncontextmenu="cloudForgetAsk(event)">☁ Google account</button>
  <div id="wb-cloud-where"></div>
  <button class="btn" id="btn-save-all-modified" onclick="saveAllModifiedChapters()" data-i="saveAllModifiedBtn" data-i-title="saveAllModifiedTip" title="Save every modified chapter in every workbook (Ctrl+Alt+S)">📚 Save all modified</button>
</div>

```

There must be **no other** element between `</header>` and this row, or
between this row and `<div class="toolbar">`. Copy the button lines from the
file (don't retype them) so every attribute stays byte-identical.

### Edit 6 — docs/FEATURES.md (two sentences)

- ≈ line 803: "It sits in the header right beside `#btn-wb-cloud`" →
  "It sits in the save/sync row (`#wb-save-sync-row`, the line between the
  header and the formatting toolbar) right beside `#btn-wb-cloud`".
- ≈ line 1896: "The button is `#btn-wb-cloud`, in the header next to the Save
  buttons" → "The button is `#btn-wb-cloud`, in the save/sync row under the
  header, next to the Save buttons".

### Not to change

- `js/markdown/startup.js` `defaultWbPanelPos()` (`y: 128`) — leave it; the
  floating Workbooks panel is draggable and clamped.
- The help text in `js/markdown/i18n.js` ("în bara de sus" / "in the top
  bar") stays true: the row is still at the top of the page.
- `tests/idea.js` checks the order of `.header-actions .btn`; the buttons
  around New/💡 do not move. Its one failure is known (CLAUDE.md known issue 3)
  and not ours.
- Nothing else in `index.html`.

## Done means

1. `#wb-save-sync-row` exists once; `document.querySelector('header')
   .nextElementSibling === #wb-save-sync-row` and
   `#wb-save-sync-row.nextElementSibling` is `.toolbar`.
2. Its element children, in order: Save-to-workbook button (`.btn.btn-primary`,
   `data-i="saveToWorkbookBtn"`), `#btn-wb-sync`, `#btn-wb-cloud`,
   `#wb-cloud-where`, `#btn-save-all-modified`. None of them is inside
   `header` any more; `.wb-save-sync-row` appears nowhere inside `header`.
3. All attributes listed in decision 4 are unchanged versus `main`.
4. At viewport widths 1920, 1440, 1024, 800, 700, 390 and 360 (and a landscape
   phone 740×360): the row is visible, the four buttons' vertical centres are
   within 2 px of each other and of `#wb-cloud-where`'s (one line; the status
   may be empty/zero-width when there's nothing to show), their left edges
   strictly increase in the order above, the first button's left edge is
   within 24 px of the row's left edge (left-aligned), and each button has
   `scrollWidth <= clientWidth + 1` and computed `white-space: nowrap` (no
   squashing). At 360 px the row has `scrollWidth > clientWidth` (it
   scrolls) and `flex-wrap` computes to `nowrap`; after `row.scrollLeft =
   9999`, `#btn-save-all-modified`'s rect lies inside the row's rect.
5. Clicking ☰ (`#btn-toolbar-toggle`, visible ≤ 1024 px) collapses
   `#toolbar-groups` (wait ~400 ms for the transition) and leaves the row and
   all its buttons visible and clickable.
6. Computed `background-color` of the row equals the header's (both
   `var(--surface)`), and the row has a 1 px bottom border.
7. Both languages: in RO (the default on a fresh profile) the labels are
   `📓 Salvează capitolul în caiet`, `⇩ Sincronizează în dosar`,
   `☁ Cont Google`, `📚 Salvează tot ce s-a modificat`, and `#wb-cloud-where`
   shows `☁ doar pe acest dispozitiv` right after ☁; after clicking
   `#navLangBtn` they read `📓 Save to workbook`, `⇩ Sync to folder`,
   `📚 Save all modified` and the English ☁ label.
8. Behaviour unchanged: clicking the Save-to-workbook button and pressing
   Ctrl+S reach `saveToWorkbook()` as before; Ctrl+Alt+S and the 📚 button run
   `saveAllModifiedChapters()`.
9. `node tests/verify.js` passes. From `tests/`: `node gdsync.js`,
   `node wbsaveall.js`, `node wbadopt.js` pass; `node idea.js` and
   `node nav.js` show only their known failures (CLAUDE.md known issues 1, 3).
10. No hex colours added; no JS files changed; nav block untouched.

## Manual check (human or tester)

1. Open `index.html` from `file://` in Chrome at full desktop width. Under the
   dark header ("MARKDOWN / editor" + Workbooks/New/Help/…/Export HTML) there
   is a new thin line holding, from the left: 📓 Salvează capitolul în caiet ·
   ⇩ Sincronizează în dosar · ☁ Cont Google · "☁ doar pe acest dispozitiv" ·
   📚 Salvează tot ce s-a modificat. Below it is the formatting toolbar
   (Undo/Redo, H, …).
2. The header no longer contains those buttons.
3. Shrink the window (DevTools device toolbar) to 1024, 700 and 360 px: the
   line stays one line; at 360 px swipe/scroll it sideways to reach 📚.
4. At ≤ 1024 px press ☰: the formatting buttons fold away, the save/sync line
   stays.
5. Press Ctrl+S with text in the editor: the save-to-workbook flow opens as
   before. Toggle the language in the nav: labels switch RO ↔ EN.

## Notes for the Tester

- Suites are plain `node file.js` Playwright scripts (see
  `tests/03-move-kanban-and-gantt-buttons-from/buttons.js` for the pattern);
  the browser is `/usr/bin/google-chrome-stable` (default in `tests/lib.js`).
  Don't prefix commands with `PW_CHROME_PATH=…` — that is refused unattended.
- Cover every "Done means" item 1–8 in the suite; run item 9's existing
  suites and report their results against the known-issue list.

## Implementer deliverables

- The edits above, committed on the current branch.
- `docs/tasks/01-move-salveaza-and-sincronizeaza-buttons-like/implementation-report.md`
  — short: files changed, the verify/gdsync results (paste the pass/fail
  lines), anything that deviated from this spec and why. Write it right
  after the checks, before anything optional.

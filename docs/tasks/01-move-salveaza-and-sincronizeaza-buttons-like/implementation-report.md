# Task 01 — Implementation report

## What changed

### `index.html`

1. **Base CSS (was line 86)** — replaced `.wb-save-sync-row { display: contents; }`
   with the row rule set specified in the spec, placed right after
   `.header-actions`: `display: flex`, `align-items: center`,
   `justify-content: flex-start`, `gap: 8px`, `padding: 6px 20px`,
   `background: var(--surface)`, `border-bottom: 1px solid var(--border)`,
   `flex-wrap: nowrap`, `overflow-x: auto`,
   `-webkit-overflow-scrolling: touch`, `flex-shrink: 0`, plus the child
   rules `.wb-save-sync-row .btn { flex: 0 0 auto; white-space: nowrap; }`
   and `.wb-save-sync-row #wb-cloud-where { flex: 0 0 auto; }`.

2. **TABLET block (≤1024px)** — deleted the old "Save/sync trio" comment
   and the three rules (`display:flex; order:-1; width:100%; …`, the `.btn`
   rule, the `#wb-cloud-where` rule) and replaced them with
   `.wb-save-sync-row { padding: 6px 14px; gap: 6px; }`. Also updated the
   `.toolbar-filters` comment to no longer say "`.wb-save-sync-row`
   above" (now reads "same nowrap + overflow-x:auto pattern as
   `.wb-save-sync-row`").

3. **MOBILE block (≤700px)** — added
   `.wb-save-sync-row { padding: 6px 12px; }` right after the existing
   `.btn { flex: 1 1 auto; min-width: 0; … }` rule; left that rule
   untouched as instructed.

4. **VERY SMALL block (≤420px)** — no changes, as specified.

5. **Landscape-phone block** — added `.wb-save-sync-row { padding: 4px 12px; }`
   beside `header { … padding: 4px 12px; }`, per the "optional, do it for
   consistency" instruction.

6. **Markup** — cut the `<div class="wb-save-sync-row"> … </div>` block
   (and its two inner comments, about ⇩ Sync-to-folder and ☁ Google Drive)
   out of `.header-actions`, and pasted it immediately after `</header>`
   and before `<div class="toolbar">`. Gave it `id="wb-save-sync-row"`.
   Replaced the old header comment ("Save/sync trio: kept in its own row
   … Desktop: display:contents, no layout change.") with the new one from
   the spec describing the row's placement between header and toolbar,
   outside `#toolbar-groups`. All five children (`.btn.btn-primary`
   Save-to-workbook, `#btn-wb-sync`, `#btn-wb-cloud`, `#wb-cloud-where`,
   `#btn-save-all-modified`) kept every attribute (`id`, `onclick`,
   `oncontextmenu`, `data-i`, `data-i-title`, `title`) byte-identical,
   only re-indented one level for their new position as direct children of
   `<body>` rather than of `.header-actions`. `.header-actions` still
   contains everything else in the same order (`#wb-crumb`,
   `#current-file`, `#btn-workbooks`, New, `#btn-help`, `#btn-idea`,
   `#btn-cal-sync`, `#btn-kanban`, `#btn-gantt`, `#btn-map`, Open .md,
   Import DOCX, Export HTML).

### `docs/FEATURES.md`

- ~line 803: "It sits in the header right beside `#btn-wb-cloud`" → "It
  sits in the save/sync row (`#wb-save-sync-row`, the line between the
  header and the formatting toolbar) right beside `#btn-wb-cloud`".
- ~line 1896: "The button is `#btn-wb-cloud`, in the header next to the
  Save buttons" → "…, in the save/sync row under the header, next to the
  Save buttons".

### `tests/gdsync.js`

- Updated the selector at the check that used to read
  `document.querySelector('header .header-actions #btn-wb-cloud')` to
  `document.querySelector('#wb-save-sync-row #btn-wb-cloud')`, kept the
  sibling check for `#btn-save-all-modified`, and reworded the comment and
  check label to say "the button lives in the save/sync row, beside the
  save buttons".

## No JS changes

Nothing in `js/markdown/*.js` was touched, as required — the buttons are
found by `id`, not DOM position, so `paintCloud()`, `applyUILang()`,
`saveToWorkbook()`, `syncAllToFolder()`, `cloudButton()`,
`saveAllModifiedChapters()`, and the Ctrl+S / Ctrl+Alt+S handlers in
`events.js` are unaffected.

## Verification I ran

- `node tests/verify.js` — passes (JS parse, nav-sync diff across all nine
  files, diacritics). The save/sync row is outside the shared
  `<nav id="site-nav">` block, so this change didn't touch anything the
  nav-sync check compares.
- Manually re-read the final markup and CSS to confirm: the row sits
  between `</header>` and `<div class="toolbar">`; only one set of row
  rules remains (base + three padding-only overrides); no hardcoded hex
  was introduced (`var(--surface)` / `var(--border)` only); the tablet
  `order:-1`/`width:100%` and the old `display:contents` are gone.
- I did **not** run the Playwright suites myself, per instructions (that's
  the tester's job) — `/apptest gdsync`, `/apptest wbsaveall`, and
  `/apptest wbadopt` should be re-run by the tester to confirm the moved
  selector and behaviour hold in a real browser.

## Ambiguity / judgment calls

None — the spec's binding decisions and implementation steps were
detailed enough (down to the exact CSS block and exact comment text) that
there was nothing to interpret. I followed step 3's guidance literally:
left the very-small block untouched and added the optional landscape
padding rule since the spec said "do it, for consistency."

## Concerns / things I did not verify at runtime

- I did not open the page in a browser to visually confirm the row is one
  line at each of the six required viewport widths (1440/1024/800/700/
  390/360) or that `scrollWidth > clientWidth` kicks in correctly at
  360px — this rests on the CSS being correct by inspection and matching
  the spec's exact rule text verbatim, but a rendered check is still the
  stronger form of proof and I'd defer to the tester's Playwright suite
  for that.
- I did not verify in a browser that `.wb-save-sync-row .btn`
  (specificity 0,2,0) actually beats the mobile `.btn { flex: 1 1 auto }`
  rule (0,1,0) as intended — the CSS ordering and specificity math match
  the spec's own note about this, but I'd want the tester's
  `btn.scrollWidth <= btn.clientWidth + 1` check at ≤700px to confirm it
  empirically.

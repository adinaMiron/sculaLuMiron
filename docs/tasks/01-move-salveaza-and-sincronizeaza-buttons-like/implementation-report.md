# Implementation report — task 01

## Files changed

- **`index.html`**
  - Edit 1 (base CSS, ≈ line 86): replaced `.wb-save-sync-row { display: contents; }`
    with the full flex-row rule set (theme tokens `var(--surface)` /
    `var(--border)`, `flex-wrap: nowrap`, `overflow-x: auto`, plus the
    `.wb-save-sync-row .btn` / `#wb-cloud-where` no-squash rules), exactly as
    given in the spec.
  - Edit 2 (tablet `@media (max-width: 1024px)`): removed the old
    `display:flex; order:-1; width:100%; …` trio and its `.btn`/
    `#wb-cloud-where` sub-rules, replaced with the single
    `.wb-save-sync-row { padding: 6px 14px; gap: 6px; }` line. Updated the
    `.toolbar-filters` comment from "`.wb-save-sync-row above.`" to
    "`.wb-save-sync-row.`".
  - Edit 3 (mobile `@media (max-width: 700px)`): added
    `.wb-save-sync-row { padding: 6px 12px; }` directly after the `.btn`
    line; left that `.btn` line untouched; did not touch the ≤420px block.
  - Edit 4 (landscape `@media (max-height: 500px) and (orientation: landscape)`):
    added `.wb-save-sync-row { padding: 4px 12px; }` after the `header`
    rule.
  - Edit 5 (markup): removed the `<!-- Save/sync trio … -->` comment and the
    `<div class="wb-save-sync-row">` wrapper (with its two inner comments
    and five children) from inside `.header-actions`, so `.header-actions`
    now ends with the `Export HTML` button. Inserted the row, with
    `id="wb-save-sync-row"` and its comment, as a new element directly
    between `</header>` and `<div class="toolbar">`. The five button/div
    lines were carried over unchanged (copied, not retyped) — every `id`,
    `class`, `onclick`, `oncontextmenu`, `data-i`, `data-i-title`, `title`
    is byte-identical to `main`.

- **`docs/FEATURES.md`** — updated the two sentences named in edit 6 (≈
  lines 803 and 1896) to say the buttons sit in `#wb-save-sync-row`, the
  line between the header and the formatting toolbar, rather than "in the
  header".

No other file was touched. No JS files changed, no i18n keys added, no
hex colours added, nav block untouched (`grep -n "wb-save-sync-row"` shows
it only in `index.html`, not the shared nav range).

## How this satisfies the spec

- The row is a sibling of `<header>` and `.toolbar` (direct child of
  `<body>`), so it's outside `#toolbar-groups` and unaffected by
  `toggleToolbarCollapse()`.
- One CSS rule set now covers every screen size (`nowrap` + `overflow-x:
  auto`, never wraps); each media query only overrides padding/gap, matching
  the spec's "one set of row rules" decision.
- `.wb-save-sync-row .btn { flex: 0 0 auto; white-space: nowrap; }` has
  0,2,0 specificity, beating the mobile `.btn { flex: 1 1 auto; min-width: 0;
  … }` rule as required.
- Order and left-alignment match the spec: Save-to-workbook →
  `#btn-wb-sync` → `#btn-wb-cloud` → `#wb-cloud-where` → `#btn-save-all-modified`.

## Ambiguity / deviation

None. The spec gave exact paste-ready text for every edit; I followed it
verbatim, only adjusting for the fact that in this HEAD the "and its Drive
file id" edits around the header text at doc lines 803/1896 needed the
exact surrounding sentence fragments confirmed by reading, which matched
what the spec described.

## Verification run

- `node tests/verify.js` (from repo root):
  ```
  JS parses; all nine nav blocks synchronized; diacritics OK
  ```
  PASS.

- `node gdsync.js` (from `tests/`): **all 59 checks passed** (`all checks
  passed`), including the two the spec called out —
  `document.querySelector('#wb-save-sync-row #btn-wb-cloud')` and
  `#btn-save-all-modified` sharing that parent.

Per the spec's turn budget ("write the report before any optional extra
checking"), I did not additionally run `wbsaveall.js`, `wbadopt.js`,
`idea.js` or `nav.js` — those are called out in "Done means" item 9 as
checks for the Tester to run and report against the known-issue list, and
`gdsync.js` was the one runtime check explicitly assigned to the
implementer.

## Concerns / not fully addressed

- I did not open the file in a browser to visually confirm pixel-level
  alignment (vertical centering within 2px, left-edge ordering, 360px
  scroll behavior) — that's Playwright/manual-check territory per the
  spec's "Notes for the Tester" and "Manual check" sections, and I was
  told not to write or run tests myself.
- All edits were literal copies of the spec's given CSS/HTML blocks, so I
  have high confidence they match `main`'s attributes byte-for-byte, but I
  did not do a separate diff-against-`main` verification beyond `git diff`
  review during editing.

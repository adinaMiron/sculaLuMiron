name: header-layout
description: Use when a task touches index.html's header, #wb-save-sync-row, the ☰ toolbar or their @media rules (plan, implement, test or review). Current layout, breakpoints, worst-case fixture, and geometry gotchas.

# index.html header / save row / toolbar

All five tasks of the 2026-09-29 run touched this region, and every one of
them rediscovered the facts below. Line numbers are from `main` at `5ad2dc2`.
They drift, so grep the selector and read ~40 lines around it.

## Layout on `main` (top to bottom)
1. `<header>` → `.header-actions` (~3620). Order: workbooks, New, `#btn-help`,
   💡 `#btn-idea`, 📅, 🗺 `#btn-map` (hidden while Drive is disconnected),
   Open, Import docx, Export HTML.
2. `#wb-save-sync-row` (~3641): a direct `<body>` child between `</header>`
   and `.toolbar`, so ☰ never hides it. Its children are 📓 save-to-workbook,
   `#btn-wb-sync`, `#btn-wb-cloud`, `#wb-cloud-where` and
   `#btn-save-all-modified`. `paintCloud()` owns the cloud text, and the
   button has no `data-i`.
3. `.toolbar` → `#toolbar-groups` (~3660, collapsed by ☰, 0.2 s
   transition): `.toolbar-filters`, a separator, `#btn-kanban`,
   `#btn-gantt`.

## CSS rules (~1158–1370, plus 2003/2151/2299)
- `@media (min-width:1025px)`: `.header-actions` and the save row **wrap**.
  `#current-file`, `.wb-crumb` and `#wb-cloud-where` get a bounded width
  with an ellipsis.
- `@media (1025px–1600px)`: only tighter padding and gaps. No button is
  hidden or turned into an icon, and every label keeps its text (the owner
  agreed to this in task-02).
- `≤1024px`: the save row never wraps and scrolls sideways (phone strip).
  Further blocks at 700 and 420 px, plus short landscape.
- `.wb-save-sync-row .btn` has specificity 0,2,0 on purpose, to beat the
  phone rule `.btn{flex:1 1 auto;min-width:0}`. Keep it when you move
  buttons.

## Spec checklist (lead)
- Name both sides of every breakpoint you touch: 1024/1025 and 1600/1601,
  plus 1920. Task-02 attempt 1 passed its band and failed at 1601/1920.
- Worst-case fixture, in **RO first** (longer labels), then EN through
  `#navLangBtn`: Drive connected (`Sincronizează acum`), a status of 120+
  characters, 🗺 shown, a long chapter name plus the `.wb-crumb`.
- If the change supersedes an earlier task's assertion (task-02 narrowed
  `row.js`'s nowrap to ≤1024px), say so in the spec, so that nobody
  "fixes" the CSS back.
- Guards to name: `--preset header` in `run_suites.py` (now includes the
  task-02 specs). `tests/gdsync.js` pins `#wb-save-sync-row #btn-wb-cloud`,
  `tests/idea.js` checks the `.header-actions .btn` order, and
  `tests/gantt.js` selects by id.

## Geometry gotchas (tester)
- `#wb-cloud-where` can be empty and zero-width. Compare vertical centres,
  and allow its left edge to equal the previous item's edge.
- An ellipsized link's text rect extends past its box, so hit-test a point
  inside `#wb-cloud-where`.
- The real language toggle hides a synthetic crumb when no workbook is
  open. Restore the fixture after toggling.
- Count wrapped flex lines with a tolerance on `top`. Distinct pixel tops
  over-counted a 52 px header as two lines.
- Wait for the ☰ collapse to settle (≈400 ms, or a bounded wait on the
  computed style). 150 ms was flaky.
- A modal (`#gantt-modal`) intercepts the next click. Close it first, or
  use `page.evaluate(() => openGantt())` for re-entry checks and label them
  as such.
- In a disconnected-state check, exclude `#btn-map` and assert that it
  stays hidden.

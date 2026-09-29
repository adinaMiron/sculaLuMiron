# Facts confirmed for the 2026-09-29 run

## Where to look
- Nine standalone browser apps; markdown markup/CSS is in `index.html`,
  ordered plain scripts in `js/markdown/`. App execution has no build step.
- `docs/FEATURES.md` § E covers workbook saves; § O covers Drive sync.
  `tests/gdsync.js` checks the cloud button's parent; `tests/idea.js` checks
  `.header-actions .btn` order. `tests/gantt.js` selects buttons by id.
- `docs/MAP.md` has no header/toolbar markup anchors. Its nav line and
  CLAUDE.md's nav line are stale: locate selectors with `rg -n`, then read
  the surrounding range. The digest counted 27 reads of `index.html`.
- Task numbers repeat: always use full slugs under `docs/tasks/` and `tests/`.

## Current markdown layout (task-01 and task-03 merged)
1. `<header>` contains `.header-actions`, ending with Export HTML.
2. `#wb-save-sync-row` is the next body child, followed by `.toolbar`.
   Children: save-to-workbook, `#btn-wb-sync`, `#btn-wb-cloud`,
   `#wb-cloud-where`, `#btn-save-all-modified`. It scrolls horizontally.
3. `.toolbar` contains collapsible `#toolbar-groups`; `.toolbar-filters`
   is followed by a separator, `#btn-kanban`, then `#btn-gantt`.
- `.wb-save-sync-row .btn` specificity (0,2,0) beats the phone `.btn`
  flex rule. Cloud text is owned by `paintCloud()`; the button has no `data-i`.
- Relevant media queries: 1600, 1024, 700, 420 px and short landscape.
  `.toolbar` and `.toolbar-filters` already wrap without a breakpoint gate.
- Task-02's stale branch overflowed with a long `.wb-crumb` at 1601/1920 px.
  This was reported in the retro, not remeasured after the two merges.
  Re-plan from current code; do not assume the old CSS patch still applies.
  Task-02's docs are absent here; use the digest and retro for its evidence.

## Test entry points (two distinct systems)
- Root `npm test` invokes Playwright Test; `playwright.config.js` targets
  only `tests/01-for-index-html-page-please-add`. Inspect discovery when changing it.
- `tests/package.json` has a separate `npm test` loop for plain Node suites.
  The two merged layout suites are absent from that loop. Their hook coverage
  does not replace wiring new suites into the appropriate npm test entry.
- Run `node tests/verify.js` from the root. Run plain browser suites with
  the sandbox runner in README, which sets their working directory to `tests/`.
  Choose affected suites; run broader checks when required by the task.
- Browser defaults differ: `tests/lib.js` uses Playwright's browser, while
  `gantt.js` and layout suites default to a system Chrome wrapper. The runner
  uses an installed Playwright browser when no override is already supplied.
  Missing browser dependencies are an environment failure, not a known failure.

## Historical baseline (retro and task reports, main at 0dac8f7)
- `nav`: "on a phone the click shows the preview", "and leaves the source
  (and the keyboard) alone", and "and the preview too". The third is missing
  from CLAUDE.md; smooth-scroll timing is suspected, not proven.
- `idea`: "💡 button is right of New". `wbrename`: first-double-click timeout.
- Previously passing: verify, gdsync, gantt, wbsaveall, wbadopt, and the two
  layout suites in the header preset. Counts differ between reports; trust
  current output, not a copied count. KNOWN-ONLY is never an all-pass result.
- If the task changes a known failing behavior, investigate that failure;
  matching the historical name alone does not establish lack of regression.

## Unattended command lessons
- Plain Node commands from the proper working directory worked. Browser
  environment prefixes, export/probe chains, outside-project probes, scratch
  removal/moves and worktree attempts were refused. Do not retry refusals.
- A heredoc commit succeeded as a standalone command; adding `cd … &&`
  was refused. Commit only when the current phase requires it; improve does not.
- This improve session could not start the sandbox: bwrap's NETLINK_ROUTE
  socket was denied. Both entry points were attempted; revised runtime behavior
  remains unvalidated. The owner must restore sandbox support before relying on it.

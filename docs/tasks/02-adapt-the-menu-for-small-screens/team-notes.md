## implementer

- Bash browser probes (e.g. checking `$PW_CHROME_PATH`, launching Playwright
  to eyeball layout) are refused under this environment's "don't ask mode" —
  only the tester's own `/apptest`-style scripted run got permission
  implicitly for this task. Don't waste a turn retrying it; just read the
  CSS carefully instead and leave pixel measurements to the tester's suite.
- `.toolbar`/`.toolbar-filters` already wrap freely at every width
  (`flex-wrap: wrap` + `max-width: 100%` with no breakpoint gate), so § 3.3
  toolbar checks in this kind of spec are likely a no-op unless a specific
  `.tb-select` has a fixed width somewhere — grep for `.tb-select` width
  rules before assuming a fix is needed.

## lead

- Current task-02 branch retains the old spec and two Node test files, but no product patch; save controls are already a body-level row. Old header-descendant checks miss all four save buttons.
- The task-01 row suite asserts `nowrap` at desktop widths too; revise that expectation for this task while preserving mobile coverage.
- Root Playwright discovery currently targets only task-01 sketch tests. Add task-02 explicitly; a new test file alone is not run by root `npm test`.

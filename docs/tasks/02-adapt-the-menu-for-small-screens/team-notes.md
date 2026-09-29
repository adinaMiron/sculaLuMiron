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

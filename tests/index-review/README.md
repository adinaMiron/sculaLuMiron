# Index adversarial review tests

Review: [2026-10-08 index review](../../docs/reviews/2026-10-08-index-review.md).

From the repository root, using the existing development dependencies:

```sh
node node_modules/@playwright/test/cli.js test --config tests/index-review/playwright.config.js
```

Set `PW_CHROME_PATH` to use a system Chromium. The default is Playwright's
installed browser. The application itself gains no dependencies or build step.

These tests assert **correct behavior**, including behavior the current page
does not satisfy. A nonzero exit is expected until the corresponding review
findings are fixed. There are no expected-failure annotations or skipped tests
that would turn a reproduced defect into a passing result. Select an individual
finding with its `@<finding-id>` tag where available, or precise test titles.
First inspect the same command with `--list` to confirm every selected case is
relevant. The installed Playwright treats plain `--grep` patterns as
case-insensitive regular expressions: `--grep 'New'` also selects the open rename finding
whose title contains "new uncommitted filename".

For `idx-new-failed-flush`, these commands select exactly four New scenarios
(success, immediate failure, in-flight failure, and edits during a flush):

```sh
node node_modules/@playwright/test/cli.js test --config tests/index-review/playwright.config.js --grep '@idx-new-failed-flush' --list
node node_modules/@playwright/test/cli.js test --config tests/index-review/playwright.config.js --grep '@idx-new-failed-flush'
```

Run relevant passing regression coverage as well. Keep other open findings
visible in the full suite; do not skip or weaken their assertions.

- `preservation.spec.js`: normal autosave/reload and empty documents, failed
  writes, pending markers, rename/delete failures, stale folder mirrors,
  asynchronous image paste, and table entry preservation.
- `computations.spec.js`: calendar validation, leap days, inclusive durations,
  DST and local midnight, duplicate/missing task references, fenced examples,
  large Gantt ranges, garden unit conversion/filters/signs, timeline dates,
  and table dimension limits.
- `ui.spec.js`: desktop/mobile/landscape geometry and screenshots, Gantt
  keyboard ownership and mobile chart visibility, search shortcuts, table
  localization, contrast and coarse-pointer target sizes.

Each case gets an isolated browser context. The tests load the actual
`index.html` from disk and block HTTP(S) requests. They use the real browser
IndexedDB and UI. Failure injection wraps only the relevant storage operation;
the folder adapter commits writes at `close()` and never touches user files.
The asynchronous paste test pauses image decoding to make the navigation race
deterministic. The stale-mirror test commits a competing revision through a
separate IndexedDB transaction without updating the page's cached version,
equivalent to a second tab's committed write.

The 1.35-second initial wait lets the page's documented 1.2-second restoration
pass finish. Screenshots are evidence, not pixel snapshot assertions. Layout
and contrast are asserted numerically. The 1,000-tick large-range limit is a
review test budget to catch unbounded per-day DOM growth, not a claim that the
requirements prescribe that exact limit.

Artifacts are generated under `test-results/index-review/`; structured results
are in `test-results/index-review.json`. They are ignored by Git. Selected
screenshots and compact results from the review run are retained under
`docs/reviews/2026-10-08-index-evidence/`.

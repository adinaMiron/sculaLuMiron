# Project facts (checked on `main` 5ad2dc2, 2026-09-29)

## Where to look
- Nine standalone browser apps, no build step. The markdown app is
  `index.html` (markup and CSS) plus ordered plain scripts in `js/markdown/`.
- `docs/MAP.md` has no anchors for `index.html` markup or CSS, and its nav
  line (and CLAUDE.md's ~2052) is stale: `<nav id="site-nav"` is at ~2317.
  Grep the selector (`rg -n`) and read a narrow range; don't page through
  the file. The digest counted 27 `index.html` reads in one run.
- Header / save row / toolbar work: read `skills/header-layout/SKILL.md`.
- `docs/FEATURES.md` § E covers workbook saves, § O Drive sync.
- Task numbers repeat (`01-for-…` and `01-move-…`), so always use the full
  slug under `docs/tasks/` and `tests/`.

## Tests: two entry points, and neither runs everything
- Root `npm test` = Playwright Test. `playwright.config.js` `testMatch`
  lists only `01-for-index-html-page-please-add` and
  `02-adapt-the-menu-for-small-screens`. A new `*.spec.js` folder must be
  added there.
- `tests/package.json` `npm test` = a `node $f.js` loop over the shared
  suites. None of the `tests/NN-*/` Node suites are in it.
- `run_suites.py --discovery` prints what each entry point covers. Use it
  instead of `npm test -- --list`, which **overwrites
  `test-results/report.json`** with an all-skipped run.
- `run_suites.py` runs both kinds: a name → `node` from `tests/`; a folder
  of `*.spec.js` → `npx playwright test tests/<dir>/ --reporter=line` from
  the root. Use it rather than hand-built commands (see README).
- `node tests/verify.js` from the root: parse check, nav-sync diff and
  diacritics.
- `test-results/` is gitignored. Copy any evidence a review needs into the
  task folder. To check that a retained JSON report is current, grep its
  `expected`/`skipped`/`unexpected` stats and `startTime`.

## Baseline failures on `main` (exact check names)
- `nav`: "on a phone the click shows the preview", "and leaves the source
  (and the keyboard) alone", "and the preview too". CLAUDE.md lists only the
  first two.
- `idea`: "💡 button is right of New" (`#btn-help` sits between them).
- `wbrename`: a timeout on the first dblclick.
- Everything else in `--preset header` passes (verify, gdsync 64, gantt,
  wbsaveall 13, row 23, buttons, task-02 specs 70). A known name does not
  waive a failure in behaviour your task changed.

## Environment (unattended)
- The team sandbox **works** as of the improve step of 2026-09-29: header
  preset ~60 s, `--preset browser-check` → `BROWSER: OK` with Playwright's
  own Chromium. Earlier the same day it failed (bwrap NETLINK_ROUTE; Chromium
  `sandbox_host_linux.cc:41`). If it fails again, that is ENVIRONMENT: say
  so and don't count it as a product finding.
- Refused, so don't retry: `VAR=x cmd` prefixes, `export`, `cd … && …`
  compounds, `rm`/`mv`, `git worktree`, probes outside the project, and
  `perl -i` / `sed -i` on docs. Use Edit/Write and `git rm`.
- `git commit` may hit a read-only `.git/index.lock`. That is not a test
  result: the orchestrator commits the working tree regardless.
- On a retry, `git diff main --stat` first. A "start again" reset can leave
  test files changed (task-01 left `tests/gdsync.js` modified).

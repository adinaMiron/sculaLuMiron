# Project facts (sculaLuMiron)

Things agents rediscovered in run 2026-09-29. CLAUDE.md is the project
guide; this file only adds what it doesn't say or says wrongly for our setup.

## Commands in the unattended Bash
Refused (don't retry, don't rephrase): `VAR=x cmd` prefixes, `export`,
`timeout`, `echo $VAR`, `rm`, `mv`, `perl -pi`, `git worktree add`,
`git -C <path> …`, `git commit` with a `$(cat <<EOF)` heredoc, `ls` outside
the project, and most compounds (`cd X && …`, `a; b`, `… | head`).
So the `/apptest` recipe (export + timeout) does not work here.

Works: one plain command per call from the project root — `node tests/verify.js`,
`git log/diff/show/status` without `-C`, and
`python3 /adina/programming/ai_generated/ai_orchestra/orchestrator/sandbox.py .ai-team/scripts/run_suites.py …`.
Use Read/Grep/Glob instead of cat/grep/sed; Edit instead of perl/sed -i.

## Running Playwright suites
- Use `.ai-team/scripts/run_suites.py` (see README). It runs each suite with
  node from `tests/`, prints only FAIL lines and tags pre-existing ones KNOWN.
- Suites are plain `node file.js` scripts printing `PASS name` / `FAIL name  -> {json}`
  and exiting 1 on any failure. No Playwright Test, no playwright.config.
- `tests/lib.js`, `nav.js`, `idea.js`, `gdsync.js` use `PW_CHROME_PATH || undefined`
  (Playwright's own installed browser). `gantt.js` and the task suites default
  to `/usr/bin/google-chrome-stable` — works in plain Bash, NOT in the sandbox
  (the wrapper's real binary is invisible there); run_suites fixes that.
- `npm test` runs ~50 suites serially: far too long for a step. Don't.
- Per-task suites live in `tests/<full-slug>/*.js` and are not in the
  `npm test` loop. Task numbers repeat across runs (two `03-…` dirs exist):
  always use the full slug.
- Scratch probes: Write them to `tests/node_modules/.scratch/<name>.js`
  (git-ignored; `require('playwright')` resolves; index.html is
  `path.resolve(__dirname, '../../../index.html')`) and run them with
  `run_suites.py --verbose node_modules/.scratch/<name>`. Tried and working
  on 2026-09-29; a plain `node tmp/x.js` was refused for the lead. Never put
  scratch in `tests/<slug>/`: you can't delete it and it gets committed.

## Failing on main at 0d96fbc (pre-existing; don't investigate)
- `nav.js`: "on a phone the click shows the preview", "and leaves the source
  (and the keyboard) alone" (CLAUDE.md #1) and "and the preview too" (NOT in
  CLAUDE.md; pvTop varies 707/726 between runs → a smooth scroll read mid-flight).
- `idea.js`: "💡 button is right of New" (CLAUDE.md #3).
- `wbrename.js`: times out (CLAUDE.md #2).
- Passing on main: `verify`, `gdsync` (64 checks, 25 s), `gantt`,
  `03-move-kanban-and-gantt-buttons-from/buttons`.

## index.html header / toolbar (the hot zone of the last run)
- `docs/MAP.md` has no anchors for index.html markup/CSS: grep index.html.
- CSS ~75–200 plus the TABLET / MOBILE / VERY SMALL / landscape `@media`
  blocks ~1140–1330; markup ~3555–3670 (drifts; grep `header-actions`,
  `wb-save-sync-row`, `toolbar-groups`). A breakpoint change usually needs
  matching edits in all four media blocks.
- Header-sensitive suites: `idea.js` (order of `.header-actions .btn`),
  `nav.js`, `gdsync.js` (line ~293 selects `header .header-actions #btn-wb-cloud`
  — moving that button must update it), `gantt.js` (ids only).
- `.toolbar` / `.toolbar-filters` already `flex-wrap: wrap` at every width.
- Default UI language is Romanian (`lang="ro"` on a fresh profile). Switch with
  a click on `#navLangBtn`, not by dispatching `scula-ui-lang`.
- `#toolbar-groups` collapse is a 0.2 s transition: wait ~400 ms before
  asserting collapsed styles.
- A modal covers the button that opened it: a second `page.click()` times
  out; call the handler via `page.evaluate` (e.g. `openGantt()`).
- `overflow:hidden` + ellipsis elements (`.wb-crumb`, `#wb-cloud-where`): click
  inside the visible box, not the element centre.

## Open state after run 2026-09-29
Branches `task/01-move-salveaza-and-sincronizeaza-buttons-like` and
`task/02-adapt-the-menu-for-small-screens` are unmerged and edit the same
header CSS. Task-02 still overflows above 1600 px with a long `.wb-crumb`.
See `docs/orchestrator-retro.md` § 1 before touching the header again.

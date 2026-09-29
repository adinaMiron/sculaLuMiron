# Orchestrator retrospective — run of 2026-09-29

Task source: `ai_orchestra/tasks/example-tasks.md` (3 tasks, all on
`index.html`'s header/toolbar). Engine: claude throughout. Run cost before
this retro: **≈ $6.41** across 9 calls, of which **$2.32 (36 %) was one
tester call that hit its turn cap and produced no report.**

| Task | Branch | Outcome | Cost |
|---|---|---|---|
| 01 — Save/Sync buttons onto a new toolbar line | `task/01-move-salveaza-and-sincronizeaza-buttons-like` | **Manual review** — implementer hit `max_turns` (31/30) | $1.16 |
| 02 — Header overflow on laptop widths | `task/02-adapt-the-menu-for-small-screens` | **Manual review** — tester hit `max_turns` (81/80) | $3.54 |
| 03 — Kanban/Gantt into the ☰ toolbar | merged to `main` (`8b9106c`) | **Passed**, review round 1 | $1.71 |

## 1. For the maintainer (skim this)

### Merged
- **task-03** — `#btn-kanban` / `#btn-gantt` moved from `.header-actions`
  into `#toolbar-groups`, right after `.toolbar-filters` behind a
  `.toolbar-sep`, as `tb-btn`s. Ids, handlers, i18n keys unchanged.
  `docs/FEATURES.md` updated. Suite
  `tests/03-move-kanban-and-gantt-buttons-from/buttons.js` (12 groups) passes;
  `tests/gantt.js` and `node tests/verify.js` still pass.

### Needs manual review

**task-01 (branch not merged).** The implementer actually finished: the
tool log shows every spec edit (header CSS, the three media blocks, the
markup move of `#wb-save-sync-row`, two `docs/FEATURES.md` passages, the
stale selector in `tests/gdsync.js`), a passing `node tests/verify.js`, a
commit, an amend, and a committed `implementation-report.md`. The cap
fell on its final summary turn. **No tester and no review ever ran.** To
finish it: run `node tests/gdsync.js` and look at the header at 1280/1440/
1920 px in both languages, then review the diff against
`docs/tasks/01-move-salveaza-and-sincronizeaza-buttons-like/spec.md` on
that branch.

**task-02 (branch not merged). The tester found a real bug and ran out of
turns before writing it down.** From its transcript:
- The new 1025–1600 px media block works: every assertion in that band
  passes in RO and EN.
- **At 1601 px and 1920 px, with a long `.wb-crumb` (the spec's
  worst-case state), header controls overflow the viewport, the page scrolls
  horizontally, and header `.btn`s are clipped. That is 18 failures.**
  Cause, per the tester: `.wb-crumb` has no `max-width` above 1600 px. The
  tester said this breaks spec §4.2 assertion 7 ("1920 must pass
  viewport-containment fully"). **Verdict: fail, needs a fix round.**
- `tests/nav.js` showed a **third** failure (a "preview too …" check about
  the preview's top offset), on top of the two in CLAUDE.md known issue 1.
  The tester found it reproducible and was bisecting it against the
  pre-change `index.html` when the cap hit. **So whether task-02 caused it
  is still unknown.** The likely link is a change in header height moving
  the preview's top.
- The suite `tests/02-adapt-the-menu-for-small-screens/laptop-header.js` is
  on the branch. A scratch file `_scratch.js` may be left in the same
  directory: the tester's `rm`/`mv` of it were refused. Delete it before
  merging.

**Tasks 01 and 02 overlap.** Both rewrite the same header CSS and the same
`@media` blocks. Task-01 takes the Sync/Save buttons out of the header,
which removes much of the overflow task-02 was fixing. Each branch was cut
from `main` separately, so they will conflict. **Recommendation:** land
task-01 first. Then re-check the header at 1025–1920 px with a long crumb,
and redo task-02 only for the overflow that is left, **including the
>1600 px band.**

### Housekeeping
- `docs/tasks/` on `main` still holds `01-for-index-html-page-please-add`,
  `02-for-index-html-page-dicteaza-menu` and `03-for-index-html-page-in-idee`
  from an earlier run. Their numbers collide with this run's. Always refer to
  a task by its full slug.
- Stale branches `task/02-for-index-html-page-dicteaza-menu`,
  `task/03-for-index-html-page-in-idee` and `task/04-for-index-html-page-in-idee`
  are still around.
- None of the per-task suites (`tests/0N-<slug>/`) are in `tests/package.json`'s
  `npm test` loop. Wire them in once their tasks are merged.

## 2. What a new teammate should know about this codebase

- **`index.html`'s header is the hot zone.** All three tasks edited
  `.header-actions`, `#wb-save-sync-row`, `#toolbar-groups` and the TABLET /
  MOBILE / VERY SMALL / landscape `@media` blocks, around lines 75–200 and
  1140–1330 of the CSS. Markup sits near lines 3555–3670. A change to one
  breakpoint usually needs matching edits in all four blocks.
- **Tests that are sensitive to header changes:** `tests/idea.js` (checks
  the order of `.header-actions .btn`; one known failure),
  `tests/nav.js` (preview offset; two known failures, possibly three now),
  `tests/gdsync.js` (selects `#btn-wb-cloud` by header ancestry), and
  `tests/gantt.js` (selects by id only, so it is safe). Run all four after
  any header edit, and compare against the known-issue list before calling
  something a regression.
- **The default UI language is Romanian.** A fresh profile loads with
  `lang="ro"`. Switch languages with `#navLangBtn`, not by dispatching
  `scula-ui-lang`.
- **`#toolbar-groups` collapse has a 0.2 s transition.** Wait about 400 ms
  before asserting collapsed styles.
- **Modals cover the buttons that opened them.** A second `page.click()` on
  a button behind a modal times out, so call the handler through
  `page.evaluate`.
- **`overflow:hidden` + ellipsis elements** (for example `#wb-cloud-where`,
  `.wb-crumb`): click inside the visible box. A click on the element's
  centre can land in the clipped part and look like a covered element. The
  task-02 tester lost several turns to this.
- **The test runner is not Playwright Test.** Suites are plain
  `node <file>.js` scripts built on `tests/lib.js`. There is no
  `playwright.config`. `tests/lib.js` already falls back to
  `/usr/bin/google-chrome-stable`.
- **Commands refused in the unattended sandbox** (seen this run):
  `PW_CHROME_PATH=… node …` and `export …` prefixes, `rm`, `mv`,
  `git worktree add`, `git rm -f` on untracked files, and some
  `cd … && …` compounds. What works: `node <suite>.js` run from `tests/`
  with no prefix, `git show <rev>:index.html > /tmp/…`, and scratch files
  written with the Write tool to `/tmp`, never inside the repo.

## 3. Suggestions for `.ai-team/` (with evidence)

1. **Record a baseline for companion suites before the implementer starts.**
   *Evidence:* the task-02 tester spent about 30 of its 81 turns (roughly
   $0.9) trying to learn whether a `nav.js` failure already existed: it tried
   `git worktree`, `git show` into /tmp, and reverse diffs, several of them
   refused. *Proposal:* when a task branch is created, the orchestrator runs
   `node tests/verify.js` plus the companion suites the lead's plan names
   (for `index.html` header work: `idea.js nav.js gdsync.js gantt.js`) on
   the base commit. It saves the PASS/FAIL lines to
   `docs/tasks/<slug>/baseline.txt`. Tester playbook line: *"A failure
   listed in baseline.txt is pre-existing. Do not investigate it."*
   Add a `companion_suites` field to the lead's `plan.json`.

2. **Tester writes a provisional `test-report.json` right after its first
   full suite run, and updates it later.** *Evidence:* task-02's tester had
   a confirmed spec violation (18 failures at 1601/1920 px) by about turn 45.
   It hit the cap at turn 81 without a report, so the orchestrator saw only
   `error_max_turns` and the finding survives only in the stream log.
   Playbook entry: "After the first run of your suite, write
   test-report.json with status `fail`/`pass` and the bugs so far. Overwrite
   it as you learn more." The orchestrator could also treat a report that
   exists at `max_turns` as the result rather than as a crash.

3. **Implementer: one commit, no amend, and the report written before the
   commit.** Or, better, let the orchestrator commit. *Evidence:* task-01's
   implementer did all the work in 28 turns and then spent 3 on
   `git commit` → `git log` → `git commit --amend` → report → second
   commit, which pushed it over the cap of 30. Task-03's Haiku implementer
   also used exactly 30 of 30 turns on a two-button move.
   *Proposal:* raise the implementer turn cap at `low` effort from 30 to 40,
   and add this playbook line: "Write implementation-report.md, then make one
   `git add -A && git commit`. Never amend."

4. **Put a "sandbox-refused commands" block in every role's playbook**,
   using the list in §2. *Evidence:* the task-02 tester made about 12
   refused or repeated calls (`PW_CHROME_PATH=` prefix, `export`, `rm`,
   `mv`, `git rm -f`, `git worktree` ×2, repeated `pwd`/`git log` after
   `cd` confusion). The task-03 lead's notes independently hit the
   `PW_CHROME_PATH` prefix refusal. The block should say: "Run suites as
   `node <suite>.js` with the Bash cwd set to `tests/`. Write scratch
   scripts to `/tmp/` with the Write tool, never inside `tests/`."

5. **Lead: plan overlapping tasks together.** *Evidence:* tasks 01 and 02
   target the same CSS and the same symptom, and each was cut from `main`
   independently, so they conflict. Playbook entry for the planning step:
   "If an earlier task in this run edits the same selectors, say so in the
   spec. Either base this task on that branch or mark it *blocked-by*."
   That needs orchestrator support for stacking a task's branch on an
   unmerged predecessor.

6. **Spec template: name the full width range for layout tasks.**
   *Evidence:* task-02's fix was scoped to 1025–1600 px, but its own
   acceptance check covered 1920 px, and the bug showed up at 1601+. For
   any "doesn't fit on screen" task, the lead should list the widths
   {1024, 1025, 1280, 1440, 1600, 1601, 1920} and the worst-case content
   (long crumb, long sync status, EN and RO). The implementer should check
   the bands on either side of the one it edits, not only its own.

7. **A reusable header-geometry helper in `tests/lib.js`** (lower
   priority). *Evidence:* the task-02 and task-03 suites each wrote their
   own "all controls inside the viewport / no horizontal scroll / not
   clipped / not covered" checks. A shared
   `assertInViewport(page, selectors)` and
   `assertNotCovered(page, sel)` (which clicks inside the visible box)
   would make the next header task's suite shorter and stop the
   clipped-click false positive from coming back.

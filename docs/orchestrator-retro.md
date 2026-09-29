# Orchestrator retrospective: run of 2026-09-29 (final, after both resumes)

This replaces the earlier retro from the same day. That version called
task-02 "manual review, don't merge". It has since been re-run from scratch
and merged, so that advice no longer applies.

Task source: `ai_orchestra/tasks/example-tasks.md`. It had 3 tasks, all on
`index.html`'s header and toolbar. The run had three passes:

| Pass | Calls | What happened |
|---|---|---|
| First | 1–10 | task-03 passed. task-01 (implementer, 31/30 turns) and task-02 (tester, 81/80) hit turn caps and went to manual review. |
| Resume 1 (15:43) | 12–15 | task-01 re-run from the spec, passed first review, merged. Improve step started on Claude, hit the session limit, finished on Codex. |
| Resume 2 (16:11) | 16–36 | task-02 re-run on the merged `main`. Claude hit its limit right after planning, so calls 18–35 ran on **Codex**. Review failed 3 times, the implementer was escalated to max effort, and review failed once more. Then both engines ran out; after the wait, review round 5 ran on Claude and **passed**. Merged `5ad2dc2`. |

| Task | Outcome | Merge |
|---|---|---|
| 01: Save/Sync controls onto their own row | **Passed** on attempt 2, review round 1 | `0dac8f7` |
| 02: header overflow on laptop widths | **Passed** on attempt 2, review round 5, after escalating to standard/max | `5ad2dc2` |
| 03: Kanban/Gantt into the ☰ toolbar | **Passed** on attempt 1, review round 1 | `8b9106c` |

Cost: the Claude calls are metered (≈ $0.8 + $0.56 for task-02's plan/spec
calls, $0.49 for the passing review). **Codex calls 18–35 report
`cost_usd: 0` and `num_turns: 1`**, so their real cost and effort can't be
read from the logs.

## 1. For the maintainer (skim this)

### What landed on `main`
- **task-01:** `📓 Save to workbook`, `#btn-wb-sync`, `#btn-wb-cloud`,
  `#wb-cloud-where` and `#btn-save-all-modified` now live in
  `#wb-save-sync-row`. It is a direct child of `<body>` between `</header>`
  and `.toolbar`, so the ☰ collapse never hides it. `docs/FEATURES.md`
  § E and § O were updated. Suite:
  `tests/01-move-salveaza-and-sincronizeaza-buttons-like/row.js`.
- **task-03:** `#btn-kanban` and `#btn-gantt` now sit inside
  `#toolbar-groups`, after `.toolbar-filters`. Suite:
  `tests/03-move-kanban-and-gantt-buttons-from/buttons.js`.
- **task-02:** two new blocks in `index.html`: `@media (min-width:1025px)`
  and a 1025–1600px block.
  - `.header-actions` and `#wb-save-sync-row` may now **wrap** on desktop.
    `#current-file`, `.wb-crumb` and `#wb-cloud-where` get a bounded width
    with an ellipsis.
  - The 1025–1600px block only tightens button padding and gaps. No button
    is hidden, moved or shrunk to an icon, and every label keeps its text.
  - Rules at ≤1024px are unchanged. On a phone the save row still scrolls
    sideways and never wraps.
  - `docs/FEATURES.md` was updated. task-01's `row.js` wrap assertions
    were narrowed to ≤1024px on purpose, because the desktop row now
    wraps by design.
  - Tests: `tests/02-adapt-the-menu-for-small-screens/*.spec.js`, run by
    root `npm test`. 70/70 pass: 1025–1920px, RO and EN, Drive connected,
    long status, 🗺 shown, long chapter name and crumb.

### Please check by hand
1. **Look at the header at 1025–1600px in a real browser.** The fix
   wraps the header onto extra lines instead of shrinking it. The owner
   agreed to this, but it makes the header taller at laptop widths.
   `docs/tasks/02-adapt-the-menu-for-small-screens/task-02-1025-ro.png`
   shows the result. If a single line was expected, this needs a follow-up
   task.
2. **task-02's reports don't agree with each other.** `test-report.json`
   says `"fail"`, but only because `git commit` hit a read-only
   `.git/index.lock` under Codex; zero bugs were found.
   `implementation-report.md` says "evidence not available". Both were
   written before the final review, which reran the suite itself (70/70)
   and passed. `review.json` is the authoritative record.
3. **Two test runners, and neither runs everything:**
   - root `package.json` → `playwright test`, with `testMatch` limited to
     `01-for-index-html-page-please-add` and `02-adapt-the-menu-for-small-screens`;
   - `tests/package.json` → a `node $f.js` loop that still leaves out
     `01-move-…/row`, `03-move-…/buttons`, `02-for-…/stop-label` and
     `03-for-…/picker`, `double-save`.

   Decide on one, or at least register the Node suites in the loop.
4. **Housekeeping the agents can't do:**
   - delete the stale branches `task/01-for-index-html-page-please-add`,
     `task/02-for-index-html-page-dicteaza-menu`,
     `task/03-for-index-html-page-in-idee` and `task/04-for-index-html-page-in-idee`;
   - check that `tests/02-adapt-the-menu-for-small-screens/_scratch.js`
     is gone (the tester says it removed it; the Glob confirms);
   - remove the `/tmp/sculalumiron-song-inspection` worktree if it still
     exists: it crashed the 09-28 resume (`'main' is already used by
     worktree`).
5. **Stale docs:**
   - `CLAUDE.md` Rule 2 and `docs/MAP.md` put `index.html`'s nav at
     ~2052 / ~1907; it is ~2270 now.
   - CLAUDE.md "Known issues" #1 lists two `nav.js` failures; there are
     three (the third is "and the preview too", which fails on `main` too).
   - CLAUDE.md's Verification section doesn't mention root `npm test` /
     Playwright Test at all.

## 2. What a new teammate should know

- **The header, top to bottom (current `main`):**
  1. `<header>` with `.header-actions`. It ends with Export HTML and wraps
     at ≥1025px.
  2. `#wb-save-sync-row`. It wraps at ≥1025px; at ≤1024px it never wraps
     and scrolls sideways.
  3. `.toolbar` → `#toolbar-groups`, collapsed by ☰. It contains
     `.toolbar-filters`, then `#btn-kanban` and `#btn-gantt`.

  Start any header task from this picture and from `.ai-team/project.md`,
  not from old specs in `docs/tasks/`.
- **Layout breakpoints come in pairs:** 1024/1025 and 1600/1601. A
  responsive spec must name both sides of each, in RO (longer labels) and
  EN.
  - The worst case is Drive connected (`Sincronizează acum`), a long
    status, 🗺 visible (it is hidden when disconnected), and a long
    chapter name plus crumb.
  - The first task-02 attempt passed its target band and failed at 1601
    and 1920px.
- **`.wb-save-sync-row .btn` has specificity 0,2,0 on purpose.** It has to
  beat the phone rule `.btn { flex:1 1 auto; min-width:0 }`.
- **Geometry gotchas the testers found:**
  - `#wb-cloud-where` can be zero-width.
  - An ellipsized link's text rectangle extends past its box, so hit-test
    a point inside `#wb-cloud-where`.
  - The language toggle hides a synthetic crumb when no workbook is open.
  - Count wrapped flex lines with a tolerance on `top`.
  - The ☰ collapse animates for about 0.2 s.
- **A layout change can legitimately break an earlier task's suite.** The
  after-implement hook flagged `row.js`'s "nowrap at 1920px" as NEW FAIL
  on task-02's first pass. That was correct: the fix was to narrow the old
  assertion, not to revert the CSS. The spec should say so up front when
  it supersedes an earlier assertion.
- **Environment, not code, was task-02's real obstacle on attempt 2.**
  - Under Codex, Chromium died at launch (`sandbox_host_linux.cc:41
    shutdown: Operation not permitted`).
  - The team sandbox died on `bwrap … NETLINK_ROUTE`.
  - `git commit` failed on a read-only `.git/index.lock`.

  Reviews 1–4 couldn't produce current browser evidence and kept failing
  on stale retained reports. That triggered the escalation to max effort,
  which was not a code-quality problem. The Claude reviewer then ran
  `npm test -- tests/02-adapt-the-menu-for-small-screens/` directly and
  passed 70/70 in about 43 s.
- **Checking a retained Playwright JSON report:** grep its
  `expected`/`skipped`/`unexpected` stats and `startTime`. Don't trust it
  after `npm test -- --list`, which overwrites
  `test-results/report.json` with an all-skipped run.
- **`test-results/` is gitignored.** Copy evidence you want reviewed into
  the task folder.
- **Retries:** on a restarted task, run `git diff main --stat` first. The
  task-01 reset left `tests/gdsync.js` modified.
- **Paste-ready specs keep working.** task-01 attempt 2 (exact
  before/after blocks) finished with zero deviations on standard/medium.
  task-03 (a literal move) passed on fast/low.

## 3. Suggestions for `.ai-team/` (evidence from this run)

1. **Browser preflight in `run_suites.py` (add `--preset browser-check`),
   and a matching playbook line.** Launch Chromium once through the same
   path `npm test` uses. Print `BROWSER: OK` or
   `BROWSER: BLOCKED (<first stderr line>)`. Exit 3 on BLOCKED, so it
   can't be confused with a test failure.
   - Playbook for tester and lead: run the preflight first. If it prints
     BLOCKED, write the report with `status:"fail"` and
     `summary` starting `ENVIRONMENT:`. Don't count that as a product
     finding.
   - *Evidence:* four task-02 review rounds and one escalation came from
     launch failures. The team notes record `sandbox_host_linux.cc:41`
     three times.
2. **Lead playbook: "blocked verification ≠ failed review".** Before
   failing a review for missing evidence, try
   `npm test -- tests/<slug>/` directly (no sandbox wrapper). If that is
   also blocked, fail with `ENVIRONMENT:` in the summary, so the
   orchestrator (see 6) can tell it apart from a code finding.
   - *Evidence:* round 5 did exactly this and passed in about 43 s,
     against rounds 1–4 that couldn't.
3. **Tester and implementer playbook: a commit failure is not a test
   failure.** If `git commit` is refused or hits `index.lock`, keep
   `status` for the tests alone and mention the commit in `summary`. The
   orchestrator commits anyway ("tests committed regardless of result").
   - *Evidence:* task-02's final `test-report.json` says `fail` with
     `bugs: []` because of index.lock, and that contradicts its own
     summary.
4. **Register the task suites in the hook's and runner's discovery:**
   - add the task-02 Playwright specs to the `header` preset as
     `npm test -- tests/02-adapt-the-menu-for-small-screens/`;
   - add the Node suites `01-move-…/row` and `03-move-…/buttons`
     (already present) to `tests/package.json`'s loop.

   *Evidence:* the hook caught the `row.js` conflict and was worth its
   51–60 s per run. The task-02 specs are currently guarded only by root
   `npm test`, which nothing runs automatically.
5. **Update `project.md`:**
   - the task-02 desktop wrap rules and the 1025/1601 pairs;
   - the geometry gotchas from §2;
   - the two-runner fact (root Playwright Test vs the `tests/` Node loop);
   - the third `nav.js` known failure.

   *Evidence:* all of these were rediscovered by hand in this run's team
   notes.
6. **Orchestrator (outside `.ai-team/`, for the owner):**
   - **(a)** Don't count a review whose summary starts `ENVIRONMENT:`
     toward `escalate_after`.
   - **(b)** Record Codex cost and turns. Every Codex call logged 0/1,
     which leaves 18 calls unaccounted for.
   - **(c)** When the engine switches mid-task, say so in `summary.md`
     for that task.
   - **(d)** Carried over: persist provisional reports before a turn cap,
     and keep implementer caps at ≥45.

   *Evidence:* launcher.log lines 111–119 and the call metas 18–35.

Not recommended, for lack of evidence: a shared `assertInViewport` helper.
The task suites wrote their geometry checks cheaply, and the duplication
hasn't cost anything measurable yet.

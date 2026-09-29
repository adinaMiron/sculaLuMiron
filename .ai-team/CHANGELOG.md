# Changelog

## 2026-09-29 (third improve, after the dictation task merged at 57be8ad)

Everything below was run through the sandbox: `--preset dictation` took
~58 s, and the hook took ~153 s in the worst case (all guards).

- **after-implement.py**
  - `js/markdown/dictation.js` now maps to `dictate`, `idea` and the
    task-01 specs. Other `js/markdown/`, `index.html` and `tests/`
    changes still map to the header guards.
    - Evidence: on call 40 the hook ran 8 header guards but not `dictate`,
      so the implementer ran `dictate idea nav` by hand (implementer
      notes).
  - It runs `tests/<TASK_SLUG>/` first when that folder already holds
    `*.spec.js` (fix rounds), so the budget never skips it.
    - Evidence: call 44 re-ran the task suite by hand after the fix.
  - New `HYGIENE FAIL` line, with exit 1, for `.config/`, `test-results/`,
    `node_modules/` or symlink paths in the diff.
    - Evidence: `git add -A` committed `.config/pulse/HCAlienM7-runtime`
      twice (c058f2d, 97fa838), and review round 1 plus calls 43–45
      (≈ $0.88) existed only for that.
    - Verified against base `1e5e960~1`: it flags the tracked
      `Crash Reports/settings.dat`.
- **run_suites.py**: new `--preset dictation` (verify, dictate, idea, the
  task-01 specs) and timings in the docstring.
- **New `skills/dictation/SKILL.md`**: where the language logic lives, the
  engine invariants, the earlier failed rewrite, `helpers.js` to reuse, and
  the two stub gotchas (both `SpeechRecognition` constructors; the
  ~1300 ms recording against the 1200-byte floor).
  - Evidence: call 41 (tester) was the costliest of the pass at 63 turns
    and $1.56, and its notes record rediscovering both gotchas.
- **project.md**: checked against `57be8ad`. Added the testMatch entry, the
  dictation baseline, and the older-branch check. Added `git -C` and
  `checkout` to the refusals (digest: `git -C … branch -a`, `git -C … log`
  refused; plain `git log` works). Added the pulse symlink and the
  tracked Chrome file.
- **lead.md**: check `git branch -a` for an earlier attempt before planning
  (the task-01 lead notes). Name the preset in the spec. Treat the
  HYGIENE line as blocking at review.
- **implementer.md**: stage named paths, never `git add -A`; how to fix
  a HYGIENE failure.
- **tester.md**: what the hook now runs (don't rerun what's green), and
  the pointer to the dictation skill and helpers.
- **README**: the new skill, the preset, and the hook's new behaviour.

## 2026-09-29 (second improve, after task-02 merged at 5ad2dc2)

The sandbox starts now, so the previous entry's "unvalidated" runner and
hook were run for real. `--preset header` passed through the sandbox in
~60 s with only KNOWN failures (idea 1, nav 3) before any edit.

- **run_suites.py**
  - It now runs `*.spec.js` folders through
    `npx playwright test tests/<dir>/ --reporter=line`. The `line` reporter
    leaves `test-results/report.json` alone.
    - Evidence: the retro § 3.4 says the task-02 specs were guarded by
      nothing automatic. The digest shows 8× `npx playwright test …` and
      2× `npm test -- …spec.js` by hand, with failures.
    - Verified: 70/70 in 19 s.
  - Added `--preset browser-check`: `BROWSER: OK|BLOCKED`, exit 3 on
    BLOCKED.
    - Evidence: the retro § 3.1. Four task-02 review rounds and one
      escalation came from Chromium launch failures
      (`sandbox_host_linux.cc:41`, three times in the notes), and the
      tester made 5 refused browser-path probes.
  - Added `--discovery`: which `tests/NN-*` folders each `npm test` entry
    point covers.
    - Evidence: 10× `npm test -- --list` in the digest, which overwrites
      report.json (task-02 notes). Two passed reviews missed unregistered
      suites.
    - Output matches the retro's list: 4 folders uncovered.
  - The "OK: N checks passed" summary of `row.js` now counts as passes
    (it showed pass=0 before).
- **after-implement.py**
  - Adds the task-02 spec folder to the markdown guards and runs the
    browser preflight first, printing an `ENVIRONMENT:` line on BLOCKED.
  - BUDGET went 240→200 s and the runner timeout 250→215 s, so that the
    preflight plus the suites stay under 300 s.
  - Verified in the sandbox against base `5ad2dc2~1`: 79 s total, all
    guards green apart from KNOWN.
- **New `skills/header-layout/SKILL.md`**: the current header, save-row
  and toolbar structure, the media rules, the spec checklist and the
  geometry gotchas.
  - Evidence: all five tasks this run touched this region. `index.html`
    was read 27×, and the gotchas were rediscovered in the task-01/02/03
    notes.
  - These facts moved out of project.md and tester.md, which shrank the
    always-read files.
- **project.md**
  - Rewritten for `main` after task-02: nav at ~2317, the spec runner, the
    discovery flag, and the baseline with pass counts.
  - The stale "sandbox cannot start" / "task-02 docs absent" lines were
    replaced with the verified state.
  - Added the refused-command list from the digest (`perl -i`/`sed -i`,
    worktree, rm/mv, env prefixes).
- **lead.md**
  - New: rerun the checks through the runner before failing on retained
    evidence. `BROWSER: BLOCKED` becomes `ENVIRONMENT:`, not a finding. A
    commit/index.lock failure is not a test failure. Use `--discovery` at
    review.
  - Evidence: retro § 3.2 and 3.3, and review rounds 1–4 against round 5.
- **implementer.md / tester.md**
  - A commit failure is not a test failure (task-02's `test-report.json`
    said fail with `bugs: []`).
  - Superseded assertions are edited, not reverted.
  - No scratch files and no worktrees; use `--discovery`, never
    `--list`. BLOCKED is reported as ENVIRONMENT.
- **README**: lists the skill and the new runner modes. The sandbox is no
  longer "blocked", and there is no `$S` shell-variable trick (assignments
  risk refusal).

## 2026-09-29 — improve after the resumed run

The prompt described an absent directory, but this checkout already contained
modified project.md, run_suites.py and after-implement.py. Inspected and retained
their useful behavior, including the expanded header preset; did not restore an
older version. No product files or test tooling were changed; no commit was made.

- Added the 28-line README index and short lead/implementer/tester notes.
  Evidence: digest calls 2 and 5 hit turn caps; task-01's exact second-attempt
  spec succeeded; task-02's findings never reached a report. Notes cover retry
  diffs, precise edits, early reports and avoiding repeated refused probes.
- Refreshed project.md around selector anchors and the merged three-row layout.
  Evidence: index.html was read 27 times; the retro documents stale nav anchors,
  a partially reset gdsync selector, and obsolete task-02 assumptions. Cross-
  checked current code. Long-crumb overflow remains a historical observation,
  not a claim of reproduction on the current tree.
- Distinguished root Playwright Test from the plain Node test loop and required
  checking suite discovery. Evidence: both layout reviews accepted task suites
  absent from npm test; current package files confirm two different runners.
- Captured specific tester pitfalls: RO first, the 0.2-second collapse, empty
  cloud status geometry and modal interception. Evidence: task-01/task-03 notes
  and the eight repeated task-02 scratch runs in the digest.
- Tightened run_suites.py while retaining its browser selection and full-slug
  suite support. Evidence: four repeated verify calls, browser-prefix refusals,
  baseline investigations in task-02, and the useful hook reported by the retro.
  Inspection found success on skipped work, blanket acceptance of wbrename
  crashes, substring baseline matches and incomplete known-failure runs.
  Now exact suite/check names plus the completed summary are required for
  KNOWN-ONLY; missing files, timeouts, invalid arguments and budget exhaustion
  cannot produce success. Added bounded defaults and kept output compact.
- Tightened after-implement.py to propagate failures and diagnose an invalid
  base instead of treating it as an empty diff. It retains verify plus the
  seven header guards (including both merged layouts and wbsaveall), with a
  240-second suite budget and bounded subprocess waits below 300 seconds.
  Evidence: retro § 2–3 credits baseline triage and requests these guards;
  inspection found the hook always returned zero. Removed unrelated calendar/
  map mappings and automatic execution of every task-folder JavaScript file:
  existing task folders include helpers and summary scripts, not just suites.
  Test changes also trigger header guards; new suites are run explicitly.

### Validation and remaining blocker

- Python AST parsing, literal subprocess-prefix inspection, always-read file
  line limits and git diff whitespace checks passed. These are static checks.
- Required sandbox invocations were attempted separately for run_suites.py
  (before edits, --preset verify) and the revised after-implement.py. Both exited
  126 before executing project code with:
  `Refused: the sandbox can't start here: bwrap: loopback: Failed to create NETLINK_ROUTE socket: Operation not permitted.`
- Did not retry or bypass the refusal. Revised runtime behavior, browser
  selection and header-preset duration are NOT validated in this session.
  After the owner restores sandbox support, run the README header command and
  the hook with an appropriate base. Check that unknown/missing suites and a
  depleted budget return nonzero, and that known-only output is not called pass.
- Task-02 docs are unavailable in this checkout; its evidence comes from the
  digest and retrospective. Owner actions are recorded in the improve report.

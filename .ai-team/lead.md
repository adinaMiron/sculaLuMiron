# Lead notes

## Planning
- On a retry, run `git diff main --stat` first and name the changes that
  survived in the spec. Don't prescribe duplicate edits.
- Before planning, `git branch -a` for an older `task/NN-<same slug>`: a
  re-queued requirement may have a failed attempt. Say in the spec what
  to avoid (task-01 dictation: the earlier 8k-line rewrite failed 5
  rounds; a small spec passed at standard/medium).
- Name the regression preset in the spec: `--preset header` or
  `--preset dictation`. Domain skills: `skills/header-layout/`,
  `skills/dictation/`.
- Localized markup/CSS moves: give anchor selectors, exact before/after
  blocks, attributes to preserve, and the affected media queries.
  Paste-ready specs passed first review twice (task-01 attempt 2 at
  standard/medium, task-03 at fast/low).
- Effort, from evidence: a literal move → fast/low. A multi-breakpoint
  layout → standard/medium or higher, never low (task-01 failed at
  standard/low on the 30-turn cap). CSS investigation needs more than
  copy-edit effort.
- Header/toolbar tasks: follow the spec checklist in
  `skills/header-layout/SKILL.md` (breakpoint pairs, RO-first worst case,
  superseded assertions).
- Tell the tester where new suites go: `*.spec.js` → add the folder to
  `playwright.config.js` `testMatch`; Node suite → `tests/package.json`
  loop. Two passed reviews missed this.

## Reviewing
- Rerun the checks yourself; don't trust retained reports. Run
  `run_suites.py --preset header` (includes the task-02 specs) and the
  task's own folder through the runner. Task-02 round 5 did this and passed
  in about a minute. Rounds 1–4 failed on stale evidence and triggered a
  needless escalation to max.
- If the runner says `BROWSER: BLOCKED` (exit 3), write `status:"fail"`
  with a summary starting `ENVIRONMENT:`. It is not a code finding, so
  don't list product findings you couldn't observe.
- A tester report that says `fail` only because `git commit` hit
  `index.lock` is not a test failure. Check `git log` for the commit
  before calling work outstanding.
- Run `run_suites.py --discovery` to confirm that the new suite is
  registered with the right `npm test`.
- Read the hook's `HYGIENE` line or run `git diff main --stat`; any
  machine-state `.config/` or unexpected symlink path blocks the merge.
  Declared relative skill/hook links are intentional repository content. The
  tracked Chrome `Crash Reports/settings.dat` predates the run: not a
  finding unless the diff touches it.
- A historical failure name cannot waive a failure in behaviour the task
  changed. Read the observed output.

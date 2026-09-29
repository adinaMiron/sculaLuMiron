# Tester notes

- Start from the hook output. It prints `HYGIENE FAIL` for machine state
  in the diff (a bug to report), then `BROWSER: OK|BLOCKED`, then verify,
  `tests/<TASK_SLUG>/*.spec.js` if it exists (fix rounds), and the guards
  for what changed, with KNOWN tags. Don't rerun what it already ran
  green. If BLOCKED: the report `status` is `"fail"` and the summary
  starts with `ENVIRONMENT:`, with no invented bugs.
- Dictation tests: reuse `tests/01-for-index-html-page-in-idee/helpers.js`
  and read `skills/dictation/SKILL.md` first (two stub gotchas cost the
  task-01 tester most of its 63 turns).
- Write a provisional `test-report.json` after the first complete run and
  update it as you go. Task-02's 18 failures once lived only in stream logs
  when the tester hit its 80-turn cap.
- `status` is about the tests only. A refused commit or a read-only
  `.git/index.lock` goes in `summary`, not into `status:"fail"` (task-02's
  final report contradicted itself this way).
- Run new suites by full slug through the runner (a `*.spec.js` folder
  works too). Then check `run_suites.py --discovery`: the suite must be in
  the right `npm test` (`testMatch` for specs, the `tests/package.json` loop
  for Node files). Never use `npm test -- --list`, which overwrites
  `test-results/report.json`.
- Language: a fresh page is Romanian. Assert RO first, then toggle through
  the real `#navLangBtn`, not a dispatched event.
- Layout work: the worst-case fixture and geometry gotchas are in
  `skills/header-layout/SKILL.md`. Test both sides of every changed
  breakpoint, plus 1920.
- No throwaway files in task folders: task-02 ran `_scratch.js` eight times
  and couldn't delete it (`rm`/`mv` are refused). Put diagnostics in the
  real suite and use `--verbose`. No baseline worktrees either
  (`git worktree` is refused). The KNOWN tags already answer "was it
  failing on main?".
- Timeouts count as failures. KNOWN-ONLY is not a pass. List it separately.

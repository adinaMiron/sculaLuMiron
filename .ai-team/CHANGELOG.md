# Changelog

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

## implementer

- `test-results/` is ignored; copy the successful Playwright JSON report and requested screenshots into the task directory when review needs retained artifacts.
- In this workspace, `git add -A` failed because `.git/index.lock` is read-only; leave the working-tree changes for an agent with writable Git metadata to commit.
- The task-02 Chromium suite now launches here through root `npm test`; its 40 cases pass, and stress measurements are emitted as `TASK-02 MEASUREMENT` lines and JSON attachments.
- Count wrapped flex lines with a tolerance for small top-position differences; distinct pixel tops overstated the 52px header as two lines.

## tester

- The default disconnected page intentionally hides `#btn-map`; disconnected-state geometry checks should exclude it while asserting that it remains hidden.
- Root `npm test` now discovers the new task-02 Playwright file as well as the task-01 Playwright files; all 196 tests passed in Chromium.
- The natural expired Drive status can fit without ellipsis, so the 120-plus-character anchor-text fixture is the reliable truncation check.
- The old task-02 plain Node suite and scratch script asserted superseded layout rules and were removed; use `laptop-header.spec.js` for current coverage.
- An ellipsized inline cloud link has a text rectangle beyond the visible status box; hit-test a point inside `#wb-cloud-where` instead of the link rectangle center.
- The real language toggle hides a synthetic workbook crumb when no workbook is open; restore that fixture state after toggling before layout assertions.

## lead

- Review-time Chromium launch failed before page execution at `sandbox_host_linux.cc:41` with `shutdown: Operation not permitted`; the 39 runner failures are environment failures, not measured layout defects.
- Geometry heights returned only inside a successful assertion message are not retained as measurement evidence; persist or report them explicitly.

- At final review, commits `68e4d04` and `76b0f6a` already contained the follow-up implementation/tests and the working tree was clean; the reports' read-only Git commit blocker was historical. Check branch history before treating it as outstanding work.

- The retained browser-verification-report.json covers 53 successful cases; the latest suite has 64 cases and root discovery totals 221. The final review run hit the same Chromium startup restriction before any page executed.

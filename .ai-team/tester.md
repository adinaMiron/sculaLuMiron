# Tester notes

- Write a provisional test-report.json in the required schema after the first
  complete run; update it as findings change. Task-02's 18 failures survived
  only in stream logs when the tester hit its 80-turn cap.
- Start with hook output and project.md's historical baseline. Record
  KNOWN-ONLY failures separately from passes; investigate new failures and
  any historical failure in behavior changed by this task. Timeouts are failures.
- Run new suites explicitly by full slug, then ensure the appropriate
  `npm test` actually discovers them. Root Playwright Test and the Node loop
  in `tests/package.json` are different entry points.
- Use the real `#navLangBtn` flow: fresh storage starts in Romanian, then
  toggle to English. Dispatching an internal language event misses that flow.
- Test narrow widths plus both sides of the edited breakpoint, 1601/1920 px
  with a long workbook crumb, and short landscape when relevant. Task-02's
  target 1025–1600 px band alone hid desktop overflow.
- Wait for toolbar collapse to settle before geometry checks: its transition
  lasts 0.2 seconds; 150 ms was flaky. Prefer a computed-style condition
  with a bounded wait; existing suites use approximately 400 ms.
- `#wb-cloud-where` may be empty and zero-width: compare vertical centers,
  and allow its left edge to equal the previous item's edge.
- For modal activation, perform one real click and keyboard activation.
  Close the modal before another user click. Use `page.evaluate(openGantt)`
  only for handler reentry tests, labeled as such: an open modal intercepts clicks.
- Avoid throwaway files in task suite folders: task-02 ran _scratch.js eight
  times and could not remove it. Add focused diagnostics to the actual suite
  and use `--verbose` rather than launching a baseline-worktree investigation.

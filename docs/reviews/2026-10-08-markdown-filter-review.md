# Markdown combined-filter review

Date: 2026-10-08
Module: Markdown workbook filtering

The previous contrast verification stopped on this pre-existing regression.
The resumed session addresses this blocker before completing
`md-chrome-contrast`; other pending UI findings remain separate.

- [x] [ID:md-state-importance-intersection] **P2 — The workbook tree matches task state and importance on different task lines.**

  **Location:** `js/markdown/workbooks.js`, `wbChapterHasImportanceTask()` and
  `renderWorkbooks()`; `js/markdown/markdown.js`, `updatePreview()`.

  **Evidence:** With `- [x] !vital urgent` and `- [ ] !nice later` in one
  chapter, selecting to do plus vital retains the chapter while its preview
  is empty. `node tests/importance.js` reproduces this failure. The documented
  contract in `docs/FEATURES.md` requires combined filters on the same task.

  **Correction/verification:** Require the selected state on the same task
  that matches importance and any selected responsible person. Use that
  combined result when deciding whether editing must repaint the tree.
  Cover all five task states, saved and currently edited chapters, and live
  edits that move a matching marker between tasks.

  **Verified:** The regression suite failed 21 assertions before the fix and
  passed all 61 checks afterward. `wbChapterHasImportanceTask()` now accepts
  the selected state, and both tree rendering and preview-triggered tree
  refresh use it. Task-state, Gantt, search, Drive fixture, draft-recovery and
  contrast tests also passed, as did `node tests/verify.js`. The diff was
  inspected; no other pending review finding was changed except the resumed
  contrast finding. Full commands are recorded in the
  [contrast verification](2026-10-07-markdown-evidence/md-chrome-contrast-verification.md).

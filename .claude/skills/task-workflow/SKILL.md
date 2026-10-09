---
name: task-workflow
description: Implement or review an assigned Markdown requirement in this repository, preserving task scope, checkbox evidence and wrapper Git ownership.
---

1. Read `docs/agents/task-policy.md` and the assigned item plus its surrounding
   acceptance context. For a prompt without an MD assignment, keep the user's
   scope; do not create ceremony for a trivial change.
2. Use `python3 scripts/markdown-tasks.py manifest docs/tasks/<module>` to inspect
   tasks without starting a runner. Read referenced prerequisites; the manifest
   lists tasks, it does not select dependency-ready work.
3. Use `python3 scripts/agent-context.py <topic>` if needed, then inspect only
   relevant source/tests. Verify existing behavior before deciding to rewrite it.
4. Implement the requirement; run its targeted checks with
   `python3 scripts/run-tests.py <suite>`. Repair in-scope failures using logs.
5. Review the diff and requirement; update docs and mark only verified work
   complete. Under a wrapper, leave edits unstaged and stop after the assigned
   item. Never launch another wrapper or change runner/control-plane code.

Expected output: implemented behavior; exact checks and results; completed item
ID or precise blocker with log path. No unverified completion or unrelated scope.

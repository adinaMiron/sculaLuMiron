---
description: Run selected repository tests with browser discovery and compact results
argument-hint: "[suite ... | --doctor | --preset header | index-review --grep @finding-id]"
---

Use `python3 scripts/run-tests.py` from repository root, passing the user's
suite names/options as arguments, never evaluating them as shell code.
With no selection, use `--discover` and choose tests relevant to the task.
Use `--doctor` once if browser setup is uncertain. Report status and log paths.
Details only when needed: `.claude/skills/focused-tests/SKILL.md`.

---
name: app-change
description: Implement a feature, fix or UI change in this repository's standalone HTML apps or their shared Markdown/audio helpers.
---

1. Read the assigned requirement/review. Route with
   `python3 scripts/agent-context.py <page-or-topic>`; find symbols with `rg -n`
   and read a narrow range. App names/contracts: `docs/agents/project-guide.md`.
2. Inspect nearby code and tests before making a small patch. Preserve classic
   script order, theme tokens, RO/EN labels and diacritics. Read THEME/I18N only
   for the affected contract. Use existing undo and storage/destination guards.
3. Nav/shared-folder/calendar/geo edits must reach all nine nav copies.
   Save through ScuLaFolder and test the phone share route when exports change.
   Shared PCM/analysis/synthesis changes need relevant Voice AND Song coverage.
4. Run `node tests/verify.js` and selected suites through
   `python3 scripts/run-tests.py <suite>`. Reuse existing fixtures; use the
   focused-tests skill only when test selection/setup needs more guidance.
5. Update changed helpBody translations and affected doc sections/anchors.
   Inspect the diff and run `git diff --check`. Follow AGENTS for task evidence
   and Git ownership.

Expected output: behavior changed, checks/results, affected documentation and any
remaining blocker/manual coverage. Do not report a whole-app pass from syntax alone.

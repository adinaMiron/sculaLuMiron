---
name: focused-tests
description: Select and run this repository's Node and Playwright regressions, diagnose browser setup once, and report concise evidence with full local logs.
---

1. Identify the changed behavior and an existing matching suite. Use
   `python3 scripts/agent-context.py <topic>` or search `tests/README.md`.
   `python3 scripts/run-tests.py --discover` shows entrypoint coverage.
2. For browser setup uncertainty, run `python3 scripts/run-tests.py --doctor`
   once. A launch failure is an environment issue; follow harness permission
   rules instead of retrying unchanged commands or disabling the sandbox.
3. Run `python3 scripts/run-tests.py <name> [name...]`. Spec folders use their
   own config when present. Narrow review cases with `index-review --grep
   @finding-id`; add `--list` to inspect selection without replacing JSON reports.
4. Read the printed log on failure. All failed/timed-out/unrun suites are
   incomplete, including historical known failures. Repair within task scope;
   broaden only if changed behavior or evidence warrants it.
5. For app edits, run `node tests/verify.js` too. Docs-only changes need link,
   accuracy and diff checks, not unrelated browser suites.

Commands run from repository root. Set PW_CHROME_PATH only when overriding
discovery. The runner never installs packages; use the existing package files
when setup is needed. Headed capture tests need a display/Xvfb.

Expected output: suite selection, PASS/FAIL/blocked, useful assertion/error,
full log path and any remaining manual coverage. Never claim the chosen subset
is the entire suite. See `docs/agents/project-guide.md` for test contracts.

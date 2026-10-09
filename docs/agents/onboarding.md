# Use this repository with another harness

Read this when setting up a harness, not at each task. Python 3.9+ and Node
are enough for local workflow/static checks. Browser tests additionally use the
existing Playwright development dependencies; no application build is needed.

## Connect once

1. Point the harness's project instructions at `AGENTS.md`. If it requires a
   different filename, use its supported import mechanism or a short instruction
   to read AGENTS.md once. Keep policy in one place.
2. Register `.claude/skills/`, or let the harness read the matching SKILL.md on
   demand. Every skill has YAML `name`/`description`, steps and expected output.
   Existing `.agents/skills/` links expose the same files to Codex; CLAUDE.md
   imports shared instructions for Claude. No skill requires a provider.
3. Run `python3 scripts/setup-agent-links.py --check`. Use `--write` only to
   create missing repository links; existing conflicting paths are preserved.
   A harness without symlink support can read the canonical skill files directly.
4. If hooks are supported, connect the shared JSON protocol described in
   [tooling](tooling.md#hooks). Existing adapter configs live in
   `.claude/settings.json` and `docs/agents/codex-hooks.json`. Honor the harness's
   own activation/trust requirements. Local fixture tests verify commands and
   decisions, not native hook activation in every installed version.
5. Validate locally with `python3 scripts/run-tests.py agent-tools.py verify`.
   This prints compact results and full log paths without probing a browser.

Do not copy personal settings, credentials, session databases or caches between
harnesses. Repository adapters contain shared commands; local state remains local.

## Work on a task

| Need | Portable command |
|---|---|
| Find code, doc sections and candidate tests | `python3 scripts/agent-context.py <topic>` |
| Read an MD task manifest without launching automation | `python3 scripts/markdown-tasks.py manifest docs/tasks/<module>` |
| Locate a symbol before reading a narrow range | `rg -n 'symbol' <path>` then `sed -n 'START,ENDp' <path>` |
| Run chosen tests and retain logs | `python3 scripts/run-tests.py <suite> ...` |
| Diagnose browser setup once, when needed | `python3 scripts/run-tests.py --doctor` |
| Verify app syntax, shared nav and diacritics | `node tests/verify.js` |

Claude's `/context`, `/apptest` and `/verify` are optional aliases. Other harnesses
run the commands directly. Route by the affected behavior; candidate suites are
not an instruction to run every test. A docs-only task does not need browser setup.

No native skills or hooks? Read the relevant SKILL.md as a document and run its
commands. For post-edit syntax checking use `node scripts/check-source.js <files>`.
Tool adapters must translate their tool names/inputs to the documented hook JSON
and honor its decisions; arbitrary shell scripts and nested tool calls are not
universally intercepted. Explicit checks remain necessary.

## Preserve useful learning

When a workflow repeats, improve its existing skill or script. Use
[workflow maintenance](tooling.md) for choosing a skill, script or hook and
validating it. Keep dated observations in [history](history.md), feature decisions
with their task, and only always-needed rules in AGENTS.md. Avoid another history
survey for routine implementation. Record actual commands/results and log paths
so a resumed session can continue from evidence.

Interactive workflows are portable. The unattended `implement-tasks.sh` and
`fix-review.sh` wrappers still use Codex; selecting a different interactive
harness does not convert those wrappers. See [task policy](task-policy.md) before
working on automation.

# Repository agent instructions

Canonical guidance for every harness. Read once; load linked detail only when
the task needs it. CLAUDE.md imports this file.

## Start small

- Inspect `git status --short`; preserve the user's existing changes.
- Read the assigned prompt/task and relevant review before implementation.
- Run `python3 scripts/agent-context.py <topic>` if the area is unfamiliar.
  Locate symbols with `rg -n`, then read a narrow range. Never dump whole app
  HTML or large reference docs. Do not repeat a repository/history survey.
- Source order: this file → task docs → review docs → project docs → code →
  tests → harness adapters. Specific guidance cannot relax safety rules.

## Project constraints

Nine standalone browser apps; no application framework, build step or new
runtime dependencies. Preserve `file://` and ordered classic Markdown scripts.
Use theme tokens, RO/EN i18n keys and Romanian diacritics. Save through
`ScuLaFolder.save()`; events through `ScuLaCal`. The shared nav block must
stay byte-identical in all nine pages. See
[project guide](docs/agents/project-guide.md) for contracts and command routing.

## Finish correctly

- Make the smallest change that satisfies the request; avoid unrelated cleanup.
- Run the narrowest relevant tests. `node tests/verify.js` checks app syntax,
  nav and diacritics; `python3 scripts/run-tests.py <suite>` retains full logs
  while printing compact results. Use `--doctor` once for browser setup trouble.
- Diagnose and fix in-scope test failures; never skip/weaken tests for a pass.
  Historical failure notes do not waive failures. A relevant unrelated blocker
  leaves the task incomplete: preserve diagnostics, report it, and stop.
- Review the diff, run `git diff --check`, and update affected docs/help.
  Report outcome, tests and remaining limits. Do not claim unperformed checks.
- Commit/push only when authorized; stage named files rather than machine state.

## Tasks, reviews and unattended runs

Read [task policy](docs/agents/task-policy.md) before authoring requirements,
executing Markdown assignments, reviewing implementations or using unattended
runners. It owns task formats, completion evidence and wrapper restrictions.
Mark tasks complete only after implementation, inspection and relevant passing
checks. Under a wrapper, work only its assigned item, leave changes unstaged,
and stop; the wrapper owns Git and external actions.

## Reuse and improve

Use the matching skill under `.claude/skills/<name>/SKILL.md` (also exposed to
Codex through `.agents/skills/`). All harnesses may read these files directly:
`app-change`, `task-workflow`, `focused-tests`, `header-layout`, `dictation`,
`workflow-maintenance`. Load only the relevant skill.

When a workflow repeats or a costly gotcha is verified, reuse or improve its
skill/script. Claude and other agents should create concise skills when useful:
YAML `name` + `description`, steps and expected output. Put deterministic work
in `scripts/`; use quiet, narrow hooks for automatic checks. Keep hook
configuration as a thin harness adapter, not duplicated policy. No new tool or
documentation is needed for a trivial one-off. See
[workflow maintenance](docs/agents/tooling.md) when changing these facilities.

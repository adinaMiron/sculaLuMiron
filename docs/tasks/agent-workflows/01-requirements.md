# Reusable agent workflows

Scope: repository guidance and local developer tooling, for interactive agents
in any harness. Existing unattended orchestration safety requirements remain
in `../agent-orchestration/`; this work does not complete them.

- [x] [ID:shared-guidance] Reduce always-loaded instructions to a concise canonical AGENTS.md, import it from CLAUDE.md, and preserve conditional task/review rules and project constraints in linked docs.
- [x] [ID:focused-context] Provide a small source/doc/test router informed by repository history and inspected code, with reproducible evidence of recurring workflows.
- [x] [ID:portable-tests] Provide a harness-independent test command with browser discovery, explicit suite selection, bounded terminal output, retained logs, and nonzero status for failures or incomplete runs.
- [x] [ID:reusable-skills] Publish concise app-change, task execution, header, dictation, testing and workflow-maintenance skills with YAML metadata and expected outputs; expose one copy to Claude and Codex.
- [x] [ID:tool-hooks] Configure reusable pre-tool read guards and targeted post-edit syntax checks using a shared local implementation, with documented invocation for other harnesses.
- [x] [ID:workflow-verification] Test routing, hooks, test-runner failures and timeouts, skill discovery and configuration consistency without invoking paid models or remote services.

Architecture: scripts under `scripts/` own deterministic behavior; docs under
`docs/agents/` own conditional guidance. `.claude/skills/` holds the requested
skill sources; `.agents/skills/` exposes relative links. Harness configuration
is a thin adapter. Existing orchestration entrypoints remain Codex-specific.

Validation: standard-library fixture tests, existing static verification and
task-parser regression, one real browser preflight and focused browser suite.
No application behavior is being changed.

Completed evidence and integration limits: [decisions and verification](04-decisions.md).

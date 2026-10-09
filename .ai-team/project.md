# Project pointers for the legacy team harness

Shared current policy: [AGENTS.md](../AGENTS.md).
Load [project routing](../docs/agents/project-guide.md) only for the relevant area.
Use `python3 scripts/agent-context.py <topic>` to avoid a full repository scan.

Commands and test behavior are shared through `scripts/run-tests.py`; the old
`scripts/run_suites.py` path delegates there. Every failed test is nonzero.
September baseline failures and environment refusals in the retrospective are
historical observations, not current exceptions.

Header and dictation workflows now live in `.claude/skills/` and are readable
by any harness. Keep role-specific coordination in the team role files; do not
duplicate project policy here. Existing external orchestrator setup remains
specific to that harness.

# Claude Code adapter

@AGENTS.md

AGENTS.md is the shared policy; do not copy its rules here.
Use the relevant skill in `.claude/skills/<skill-name>/SKILL.md`.
Create or improve skills for repetitive workflows when useful, with YAML
`name`/`description`, concise steps and expected output; keep executable logic
in shared `scripts/`. See `docs/agents/tooling.md` only when maintaining tooling.
`/verify`, `/apptest` and `/context` are thin command aliases.
Project hooks are configured in `.claude/settings.json`.

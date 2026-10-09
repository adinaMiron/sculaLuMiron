# Workflow decisions and verification

## 2026-10-09 — Shared implementation, thin adapters

AGENTS.md owns shared policy; CLAUDE.md imports it. Conditional task policy and
project contracts live under docs/agents. Skills use the owner's requested
.claude/skills location, with relative per-skill links for Codex discovery.
Codex hooks link to a reviewable JSON source under docs/agents. Setup validates
all link destinations and refuses existing conflicting config. This session's
protected .agents/.codex directories required filesystem approval to install
the links; future skill links use the same setup command.

The portable runner replaces the legacy team runner's duplicated logic. It
keeps failing historical assertions nonzero, retains complete logs, and never
starts model calls, live automation wrappers or dependency installation.
Intentional skill/hook links are allowed by the legacy hygiene check; arbitrary
and runtime symlinks remain flagged.

Pre-tool hooks guard only unbounded large Read/plain-cat calls. They don't parse
general shell expressions, rewrite commands or grant approval. Post-edit hooks
parse targeted classic HTML/JS; explicit verification covers shell-based edits.
Native Codex hooks still need project/hook trust via /hooks. Interactive native
hook discovery was not tested through a paid agent session; the configured
commands and event/decision contracts were tested locally.

## Verification evidence

- `python3 tests/agent-tools.py`: 18 passing tests covering routing/reference integrity, argument/path
  validation, hook JSON/decisions and syntax behavior, actual configured hook
  commands, skill metadata, idempotent link setup and conflict preservation,
  compact output/full logs, nonzero failures, skipped-only specs, budget
  exhaustion and POSIX descendant cleanup.
- All six skills passed the installed skill-creator frontmatter validator.
- `python3 scripts/setup-agent-links.py --check`: six shared skills and Codex
  hook adapter resolve correctly after installation.
- `node tests/verify.js`: all nine nav copies, app/helper syntax and diacritics.
- `node tests/runner-markdown-tasks.js`: existing Markdown grammar/input guards.
- `python3 scripts/run-tests.py --doctor`: real installed browser launches.
- `python3 scripts/run-tests.py nav`: real standalone navigation suite passes.
- `python3 scripts/run-tests.py index-review --grep @idx-nav-test-contract`:
  three real browser review tests pass. The same selection with `--list` works
  without replacing retained JSON reports. Logs are in ignored test-results/agent.
- Legacy suite entrypoint successfully delegates the verify suite; diff checked
  for whitespace and scope. No application source or trusted wrapper was changed.

Outstanding orchestration confinement/provider work in agent-orchestration is
unchanged. Existing implement-tasks/fix-review wrappers remain Codex-specific;
the shared docs, skills, local checks and hook protocol are harness-independent.

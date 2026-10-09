---
name: workflow-maintenance
description: Capture a repeated repository workflow or verified costly gotcha in a concise skill, shared script or hook without expanding always-loaded instructions.
---

1. Read `docs/agents/tooling.md`; inspect the existing command/skill/script that
   covers the workflow. Use current evidence, not dated failure assumptions.
2. Choose the smallest reusable artifact: judgment/steps → skill; deterministic
   work → shared script; cheap per-tool check → hook. Improve an existing one
   before introducing another. Keep one-off task details with the task.
3. Skills live in `.claude/skills/<name>/SKILL.md` with YAML `name` and
   `description`, concise steps and expected output. Use repository-relative
   paths and harness-independent commands. No required model, paid API or
   automatic subagents. Put long conditional facts in referenced docs.
4. Put code in `scripts/`, adapters in harness config, and keep hooks quiet on
   success. Never auto-install dependencies, approve permissions, start agents,
   run the whole test suite per edit, or claim hooks provide confinement.
5. Add meaningful fixture coverage for executable behavior. Run
   `python3 tests/agent-tools.py`; validate skill frontmatter and links with
   `python3 scripts/setup-agent-links.py --check`. Use `--write` for missing
   links when filesystem permissions allow. Never overwrite personal config.
6. Update the relevant router/doc instead of adding another root instruction
   paragraph. Under an automated assignment, note tooling improvements as
   follow-up scope; do not edit protected runner files.

Expected output: recurring problem and evidence, reusable artifact/path,
invocation, validation results, and honest harness-specific limitations.

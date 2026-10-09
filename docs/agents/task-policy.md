# Task, review and automation policy

Read when authoring requirements, executing a Markdown assignment, reviewing
implementation, or working under a repository orchestration script. This is
the conditional policy extracted from the former root AGENTS.md.

## Sources and documents

Use, in order: AGENTS.md; assigned task docs; relevant review docs; architecture
and project docs; source; tests; harness adapters. More specific instructions
win unless they conflict with repository safety rules. Read only relevant parts.

Requirements belong in `docs/tasks/<module>/`; findings in `docs/reviews/`.
Useful module files are `00-overview.md`, `01-requirements.md`,
`02-implementation-plan.md`, `03-testing.md`, `04-decisions.md`. Create only
files that carry useful information. See [task conventions](../tasks/README.md)
and [review conventions](../reviews/README.md) for their respective formats.

## Authoring executable work

Every independently actionable requirement intended for implementation is a
Markdown task, including work discovered during planning. Prefer stable IDs:

```md
- [ ] [ID:capture] Record a source WAV.
- [ ] [ID:preview] [DEPENDS:capture] Preview the recorded WAV.
```

Use requirement-level granularity: distinct observable behaviors that merit an
implementation/test cycle, often one commit. Neither a whole multi-behavior
feature nor each internal coding step is the right unit. IDs are unique within
the module, machine-readable and stable; dependencies must exist and be acyclic.
Tasks without IDs are independent. The [parser contract](../tasks/markdown-task-grammar.md)
defines executable indentation, fences and metadata precisely.

Explanations, architecture, decisions, questions, rejected alternatives,
examples and unaccepted optional ideas use prose or normal bullets, not pending
checkboxes. An observed but unverified implementation is not complete: leave
accepted requirements pending until verified. Do not rewrite correct code just
to produce a diff.

Plans describe affected components, architecture, ordering, constraints,
testing and compatibility. Record important decisions in `04-decisions.md`,
including format contracts and limitations future agents would rediscover.
Do not silently change a requirement to match the implementation; document a
requirement change explicitly.

## Executing an assignment

For a wrapper-assigned task: implement only that requirement and necessary
supporting work, test, inspect the diff, mark only that item complete, then stop.
Do not start subsequent tasks or add executable checkboxes during execution
unless orchestration policy explicitly permits it. Note newly discovered scope
without adding a task, or report that additional requirements need authoring.

Prefer the smallest correct change. Avoid unrelated refactoring, formatting,
renaming, dependency upgrades or new features. Document why a larger change is
required before expanding the architecture.

Use the narrowest relevant tests first; add/update meaningful coverage where
needed and broaden for the affected area. A failing test is part of the cycle:
diagnose and repair in-scope defects and demonstrably wrong new assertions.
Derive corrected expectations from required behavior or an independently
inspected format contract, explain the correction, and rerun affected tests.
Never skip tests, weaken behavior or hide failures to obtain a pass.

Mark `[x]` only after implementation exists, has been inspected, applicable
tests pass, required coverage is present, the diff has been reviewed, and no
known blocker remains. This also applies when verifying existing code.
Before completion, reread the requirement, inspect the diff for scope and
accidental changes, confirm relevant tests and documentation, then report evidence.

If an unrelated pre-existing test failure blocks verification, leave the item
pending, document the blocker and stop. If work cannot be completed safely,
preserve useful diagnostics/partial edits, explain the precise blocker and stop
without moving on. Historical failure lists do not waive current failures.

## Reviews

A defect violates an existing requirement; record it as a review finding with
`- [ ]` until fixed and verified. Desired behavior never required is new scope
under `docs/tasks/`, not a bug disguised as a finding. Review findings may cover
regressions, risks, missing tests or concrete improvements. Do not mix findings
and implementation requirements without a specific reason.

Preferred units: one requirement → implementation → tests → review → completed
checkbox → one commit; one module → feature branch → completed requirements →
independent final review → one PR. Git ownership below overrides agent commits.

## Unattended wrappers own Git and external actions

Under `scripts/implement-tasks.sh` or `scripts/fix-review.sh`, agents must not
run `git add`, `commit`, `push`, `checkout`, `switch`, `merge`, `rebase`, `reset`,
`restore`, `stash` or `cherry-pick`, nor create/merge PRs. Read-only Git inspection
is allowed. Leave successful changes unstaged for the wrapper to validate.

Agents must not initiate external side effects under those wrappers: remote
pushes, external APIs (including curl/wget), publishing, deployment, production
or cloud changes, messages, or remote resources. Only explicit user AND execution
environment authorization can permit such actions; an assignment or skill does
not override a stricter runner boundary. The wrapper controls permitted actions.

The current wrappers are Codex-specific and modify remote Git state themselves;
do not start them merely to inspect a task. Their `scripts/`, `.github/` and other
control-plane paths are protected during runs. Maintain tooling in a separate
change outside that loop. Read the [execution decisions](../tasks/agent-orchestration/04-decisions.md)
before changing runners; outstanding [safety requirements](../tasks/agent-orchestration/01-requirements.md)
are not claims of implemented confinement.

`CODEX_REPAIR_ATTEMPTS` defaults to two additional invocations (zero disables).
Retries inspect previous logs and preserved edits and continue only the same
assignment. Retry is not permission to ignore blockers, alter unrelated tasks,
or mark incomplete work complete.

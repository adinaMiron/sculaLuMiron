# Repository Agent Instructions

This file contains the canonical repository-wide instructions for AI coding agents.

These instructions are intentionally harness-agnostic and apply whether the repository is being worked on with Codex, Claude Code, Cline, another coding agent, or an orchestration script.

Read this file before making repository changes.

---

# 1. Sources of truth

Repository information should be read in this order when relevant:

1. `AGENTS.md`
2. task-specific documentation under `docs/tasks/`
3. review documentation under `docs/reviews/`
4. architecture and project documentation
5. relevant source code
6. relevant tests
7. harness-specific instructions such as `CLAUDE.md`, `.claude/`, `.codex/`, or similar

More specific instructions take precedence over general instructions when they do not conflict with repository safety rules.

Do not read the entire repository unnecessarily. Start with the smallest relevant context and expand only when needed.

---

# 2. Documentation structure

Implementation requirements belong under:

`docs/tasks/<module>/`

Examples:

- `docs/tasks/song-creation/`
- `docs/tasks/solar-calculator/`
- `docs/tasks/authentication/`

Review findings belong under:

`docs/reviews/`

Do not mix implementation requirements and review findings unless there is a specific reason to do so.

---

# 3. Implementation task documents

Each significant module, page, or feature should have its own directory:

```text
docs/tasks/<module>/
```

Recommended files are:

```text
00-overview.md
01-requirements.md
02-implementation-plan.md
03-testing.md
04-decisions.md
```

Only create files that are useful. Empty documentation files are not required.

See:

`docs/tasks/README.md`

for the complete task documentation convention.

---

# 4. Actionable requirements

Actionable implementation requirements use Markdown checkboxes:

```text
- [ ] Requirement not yet completed.
- [x] Requirement completed and verified.
```

Use `[ ]` only for work that an implementation agent is expected to perform.

Do not use unchecked checkboxes for:

- brainstorming;
- optional ideas;
- explanatory notes;
- questions;
- possible future work;
- general planning notes.

Use normal bullet points for those instead.

---

# Automatic task authoring

When an agent creates or substantially updates implementation requirements, plans, feature specifications, or review documentation, it must distinguish between:

- actionable work;
- explanatory information;
- decisions;
- questions;
- optional ideas.

Every **independently actionable implementation requirement** that is intended to be implemented must be written as a Markdown task:

```text
- [ ] Requirement
```

For non-trivial modules, prefer:

```text
- [ ] [ID:stable-id] Requirement
```

If another requirement must be completed first, use:

```text
- [ ] [ID:task-id] [DEPENDS:other-task-id] Requirement
```

or:

```text
- [ ] [ID:task-id] [DEPENDS:first-task,second-task] Requirement
```

Do not leave actionable implementation requirements as ordinary prose or ordinary bullet points when they are intended to be executed by the task automation.

For example, do not write:

```text
Requirements:
- Support WAV recording.
- Add playback preview.
- Export the completed recording.
```

Write:

```text
Requirements:

- [ ] [ID:wav-recording] Record high-quality WAV audio.

- [ ] [ID:recording-preview] [DEPENDS:wav-recording] Allow playback of the recorded WAV.

- [ ] [ID:recording-export] [DEPENDS:wav-recording] Export the completed recording.
```

## What should become a task

Create a separate `- [ ]` item when the work:

1. represents a distinct observable requirement;
2. can be independently implemented or verified;
3. deserves its own implementation/test cycle;
4. could reasonably correspond to one Git commit.

Do not combine several unrelated requirements into one large checkbox merely to reduce the number of tasks.

Conversely, do not split trivial implementation details into separate tasks when they are merely internal steps required to satisfy one requirement.

Prefer requirement-level granularity rather than line-of-code or function-level granularity.

## What should not become a task

Do not create `- [ ]` items for:

- explanatory prose;
- architecture descriptions;
- background information;
- brainstorming;
- optional ideas that have not been accepted;
- open questions;
- rejected alternatives;
- implementation notes;
- decisions already made;
- examples;
- observations that require no action.

Use ordinary headings, paragraphs, or bullets for those.

## Features containing multiple requirements

A feature name alone is normally not sufficient as an executable task if it contains several independently verifiable behaviors.

For example, instead of:

```text
- [ ] Implement audio recording.
```

prefer:

```text
- [ ] [ID:audio-permission] Request and handle microphone permission.

- [ ] [ID:wav-recording] [DEPENDS:audio-permission] Record microphone input as WAV.

- [ ] [ID:recording-preview] [DEPENDS:wav-recording] Preview a recorded WAV.

- [ ] [ID:recording-storage] [DEPENDS:wav-recording] Save recordings in the song workspace.
```

The feature itself may remain a heading:

```text
## Audio Recording
```

The executable behaviors beneath it become tasks.

## New work discovered while planning

When an agent discovers additional required work while creating a plan, it should add that work as additional unchecked requirements under the appropriate `docs/tasks/<module>/` document.

When an agent is currently executing one task under an automated task runner, it must not silently add new executable checkboxes unless the orchestration policy explicitly permits task creation during execution.

Instead, document newly discovered scope as a note or stop and report that additional requirements should be added.

## Existing implementation

When documenting a module that already contains implemented functionality:

- use `[x]` only if the agent has actually inspected and verified the existing implementation;
- otherwise use `[ ]` and allow the implementation workflow to verify it.

Do not assume existing behavior is correct merely because corresponding code appears to exist.

# 5. Requirement IDs and dependencies

Important requirements should have stable IDs.

Example:

```text
- [ ] [ID:wav-recording] Record high-quality WAV audio.
```

Dependencies may be declared with:

```text
- [ ] [ID:preview] [DEPENDS:wav-recording] Add recording preview.
```

Multiple dependencies are comma-separated:

```text
- [ ] [ID:export] [DEPENDS:wav-recording,preview] Export the recording.
```

IDs must:

- be unique within the module;
- remain stable after creation;
- use concise machine-readable names;
- not contain spaces.

Do not create dependencies on nonexistent task IDs.

Do not create circular dependencies.

Tasks without IDs are treated as independent tasks.

---

# 6. Task completion rule

A requirement may change from:

```text
- [ ]
```

to:

```text
- [x]
```

only when all applicable conditions are satisfied:

1. the requirement is actually implemented;
2. the implementation has been inspected;
3. relevant tests have passed;
4. required tests have been added or updated where appropriate;
5. the resulting changes have been reviewed;
6. no known blocker remains.

A checkbox is evidence of verified completion, not merely evidence that work was attempted.

If the functionality already exists, verify the existing implementation and run the relevant tests before marking the requirement complete.

Do not rewrite correct code merely to create an implementation diff.

---

# 7. Work on one requirement at a time

When an orchestration script assigns one requirement:

- implement only that requirement;
- make supporting changes required by that requirement;
- test it;
- review the diff;
- mark only that requirement complete;
- stop.

Do not automatically start another requirement.

Do not opportunistically implement unrelated later requirements.

This keeps each change reviewable and allows one requirement to correspond to one Git commit.

---

# 8. Scope discipline

Prefer the smallest correct implementation.

Avoid unrelated:

- refactoring;
- cleanup;
- formatting;
- renaming;
- dependency upgrades;
- architectural changes;
- feature additions.

If a larger architectural change is genuinely required, document why before expanding scope.

---

# 9. Tests

Every implementation must consider testing.

Use the narrowest relevant tests first.

Run broader regression tests when the affected area warrants them.

Add or update tests when necessary to demonstrate the requirement.

Do not mark a requirement complete while relevant tests are failing.

If tests fail because of an unrelated pre-existing problem:

- leave the requirement unchecked;
- document the blocker;
- stop rather than silently ignoring the failure.

---

# 10. Implementation plans

Plans belong inside the relevant module directory under `docs/tasks/`.

Plans should describe:

- intended architecture;
- affected components;
- implementation order;
- important constraints;
- testing strategy;
- migrations or compatibility concerns where applicable.

Plans are working documents and may evolve as implementation reveals new information.

Do not silently change the meaning of an existing requirement to match an implementation.

If the requirement itself needs to change, document that decision explicitly.

---

# 11. Decisions

Important implementation decisions should be recorded under the corresponding task module, preferably in:

`04-decisions.md`

Record decisions that future agents would otherwise need to rediscover.

Useful decisions include:

- chosen architecture;
- rejected alternatives;
- compatibility constraints;
- data formats;
- important naming decisions;
- security boundaries;
- known limitations.

Keep decision notes concise.

Do not duplicate information already clearly documented elsewhere.

---

# 12. Reviews

Code-review or implementation-review findings belong under:

`docs/reviews/`

Review findings use:

```text
- [ ] Finding not yet fixed.
- [x] Finding fixed and verified.
```

See:

`docs/reviews/README.md`

for the complete review convention.

A review finding should describe a defect, regression, risk, missing test, or concrete improvement discovered during review.

New product functionality normally belongs under `docs/tasks/`, not `docs/reviews/`.

---

# 13. If review discovers missing requirements

If review identifies functionality that was never part of the documented requirements, distinguish between:

## Defect

The documented requirement exists, but the implementation does not satisfy it.

Record this as a review finding.

## New requirement

The desired behavior was never required.

Add it under the appropriate:

`docs/tasks/<module>/`

Do not disguise new scope as a bug fix.

---

# 14. Git ownership during automated runs

When work is being executed through repository orchestration scripts such as:

```text
scripts/implement-tasks.sh
scripts/fix-review.sh
```

the orchestration script owns Git history.

The implementation agent must not perform:

```text
git add
git commit
git push
git checkout
git switch
git merge
git rebase
git reset
git restore
git stash
git cherry-pick
```

The agent must also not create or merge pull requests.

Read-only Git commands are allowed when useful:

```text
git status
git diff
git log
git show
```

The agent should leave successful changes unstaged for the wrapper to validate.

---

# 15. External side effects

When operating under the repository automation scripts, agents must not initiate external side effects.

Unless explicitly authorized by the user and execution environment, do not:

- push to Git remotes;
- call external APIs;
- use `curl` or `wget` for external communication;
- publish packages;
- deploy software;
- modify production services;
- send messages or emails;
- create remote resources;
- modify cloud infrastructure.

The local orchestration layer controls permitted external actions.

---

# 16. Failure behavior

If assigned work cannot be completed safely:

1. do not mark it complete;
2. leave useful diagnostic work intact when appropriate;
3. explain the blocker precisely;
4. stop;
5. do not continue automatically to unrelated work.

Never mark a checkbox complete merely to allow automation to proceed.

---

# 17. Review before completion

Before declaring work complete:

1. re-read the assigned requirement;
2. inspect the relevant diff;
3. verify the implementation matches the requirement;
4. check for accidental unrelated changes;
5. run relevant tests;
6. confirm documentation remains accurate.

Completion means implemented, tested, and verified.

---

# 18. Preferred implementation unit

The preferred unit of autonomous work is:

```text
one requirement
    ↓
one implementation
    ↓
tests
    ↓
verification
    ↓
one checkbox completed
    ↓
one Git commit
```

The preferred higher-level unit is:

```text
one module
    ↓
one feature branch
    ↓
all requirements completed
    ↓
independent final review
    ↓
one pull request
```

This structure is designed to support reliable autonomous work, easy review, rollback, and parallel agents.


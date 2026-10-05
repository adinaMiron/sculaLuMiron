# Automated Task Implementation Policy

Implementation work may be described under:

`docs/tasks/<module>/`

Each module or page should have its own directory.

## Task syntax

Only actionable implementation requirements use Markdown checkboxes:

```text
- [ ] Requirement not yet completed
- [x] Requirement completed and verified
```

Do not use unchecked Markdown checkboxes for brainstorming, optional ideas, explanatory notes, or possible future work unless they are intended to become executable implementation tasks.

## Task completion rules

A requirement may be changed from `[ ]` to `[x]` only when:

1. the requirement is actually satisfied;
2. the implementation has been inspected;
3. relevant tests have been run successfully;
4. required tests have been added or updated where appropriate;
5. the resulting diff has been reviewed.

If the functionality already exists, verify it and run the relevant tests before marking the requirement complete. Do not rewrite working code merely to generate an implementation diff.

## Scope

Agents should implement one requirement at a time.

Do not opportunistically implement later unchecked requirements while completing the current one.

Small supporting changes required by the current requirement are allowed.

Unrelated refactoring, cleanup, formatting, dependency upgrades, architectural changes, and feature additions are not allowed unless explicitly required.

## Plans and documentation

Files in the same task directory may contain:

- requirements;
- architecture notes;
- implementation plans;
- testing plans;
- investigation results;
- decisions.

Agents should read nearby task documentation when it materially helps understand the assigned requirement.

Plans may be updated as implementation knowledge improves.

Requirement wording should not be silently changed during implementation.

If the requirement itself is incorrect or ambiguous, leave it unchecked and document the problem rather than redefining it.

## Git ownership

When an external orchestration script is managing the task loop, the agent must not perform:

- `git add`
- `git commit`
- `git push`
- branch switching
- merging
- rebasing
- resetting
- stashing
- pull-request creation

The orchestration layer owns Git history.

Read-only Git commands such as `git status`, `git diff`, `git log`, and `git show` are allowed.

## Failure behavior

If a requirement cannot be completed safely:

1. leave it unchecked;
2. preserve useful diagnostic information;
3. explain the blocker;
4. stop work on that requirement;
5. do not continue automatically to another requirement.

## Completion granularity

Prefer:

**one requirement → one implementation → one validation → one commit**

This keeps changes reviewable, reversible, and suitable for parallel agent work.
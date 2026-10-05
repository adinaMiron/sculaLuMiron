# Task and Requirement Documentation

This directory is the canonical location for planned implementation work.

Each significant module, page, application area, or independent feature should normally have its own directory:

```text
docs/tasks/<module>/
```

Examples:

```text
docs/tasks/song-creation/
docs/tasks/solar-calculator/
docs/tasks/authentication/
docs/tasks/payment/
```

---

# 1. Recommended module structure

Use:

```text
docs/tasks/<module>/
├── 00-overview.md
├── 01-requirements.md
├── 02-implementation-plan.md
├── 03-testing.md
└── 04-decisions.md
```

Not every module requires every file.

Create documentation because it carries useful information, not merely to satisfy the directory structure.

---

# 2. `00-overview.md`

Use the overview to explain the module at a high level.

Useful content includes:

- purpose;
- user problem;
- boundaries;
- important existing functionality;
- relevant architecture;
- terminology;
- files or systems likely to be involved.

The overview should help a new agent understand the feature without scanning the entire codebase.

Do not put large numbers of implementation checkboxes in the overview.

---

# 3. `01-requirements.md`

This is normally the primary source of implementation tasks.

Actionable requirements use:

```text
- [ ] Requirement.
```

Completed and verified requirements use:

```text
- [x] Requirement.
```

Example:

```text
# Song Creation Requirements

## Recording

- [x] [ID:audio-core] Provide the shared audio capture layer.

- [ ] [ID:wav-recording] [DEPENDS:audio-core] Record high-quality WAV audio.

- [ ] [ID:recording-preview] [DEPENDS:wav-recording] Allow playback of the recorded WAV.

## Analysis

- [ ] [ID:pitch-analysis] [DEPENDS:wav-recording] Extract pitch information from the recording.

## Arrangement

- [ ] [ID:instrument-engine] Provide the initial instrument playback engine.

- [ ] [ID:voice-to-instrument] [DEPENDS:pitch-analysis,instrument-engine] Convert detected melody into an instrument track.

- [ ] [ID:arrangement] [DEPENDS:voice-to-instrument,recording-preview] Provide the initial song arrangement workflow.
```

---

# 4. Requirement wording

Requirements should describe observable outcomes rather than vague implementation activity.

Prefer:

```text
- [ ] [ID:mobile-menu] Keep all primary navigation actions accessible on screens 320 px wide and larger.
```

over:

```text
- [ ] Fix the mobile menu.
```

Prefer:

```text
- [ ] [ID:invalid-latitude] Reject latitude values outside -90..90 and show a validation message without submitting the calculation.
```

over:

```text
- [ ] Improve validation.
```

A good requirement lets another agent determine objectively whether it is complete.

---

# 5. Requirement IDs

For anything beyond a trivial checklist, give requirements stable IDs.

Syntax:

```text
[ID:<id>]
```

Example:

```text
- [ ] [ID:wav-recording] Record high-quality WAV audio.
```

Recommended ID style:

```text
lowercase-kebab-case
```

Examples:

```text
audio-core
wav-recording
recording-preview
mobile-navigation
invalid-latitude
payment-confirmation
```

IDs must be unique within the module.

Do not reuse an old ID for a different requirement.

---

# 6. Dependencies

Use:

```text
[DEPENDS:id]
```

or:

```text
[DEPENDS:id-one,id-two]
```

Example:

```text
- [ ] [ID:export] [DEPENDS:arrangement,wav-recording] Export the completed song.
```

Dependencies mean that the listed requirements must already be complete before this requirement is eligible for implementation.

Use dependencies only for genuine implementation ordering.

Do not create dependency chains merely to impose an arbitrary preferred sequence.

---

# 7. Independent requirements

A task does not need an ID or dependency if it is small and independent:

```text
- [ ] Correct spacing below the mobile toolbar.
```

However, IDs are recommended when:

- other requirements depend on it;
- it is architecturally important;
- the module contains many tasks;
- the requirement is likely to be referenced in discussions or reviews.

---

# 8. What must not use unchecked checkboxes

The automated task runner treats unchecked Markdown task items as executable work.

Therefore do not write:

```text
- [ ] Maybe investigate WebAudio alternatives.
- [ ] Think about using IndexedDB.
- [ ] Ask whether export should support MP3.
```

unless those are intentionally implementation tasks.

Instead use:

```text
- Maybe investigate WebAudio alternatives.
- Consider IndexedDB if persistent local storage becomes necessary.
- Open question: should export support MP3?
```

This distinction is important.

---

# 9. Implementation plan

Use `02-implementation-plan.md` for technical planning.

A useful plan may include:

- implementation phases;
- relevant files;
- architecture changes;
- reusable existing components;
- interfaces;
- data flow;
- compatibility constraints;
- migration requirements;
- test strategy;
- risks.

The plan should help implementation agents work efficiently without prescribing unnecessary detail.

Do not duplicate requirements verbatim unless necessary for clarity.

---

# 10. Testing documentation

Use `03-testing.md` when testing is substantial enough to deserve its own documentation.

It may describe:

- unit tests;
- integration tests;
- browser tests;
- regression suites;
- manual verification;
- fixtures;
- test data;
- environment constraints;
- known test limitations.

Requirements themselves should still be verified before they are marked complete.

---

# 11. Decisions

Use `04-decisions.md` for decisions future agents need to know.

Recommended format:

```text
## 2026-10-05 — WAV is the canonical raw recording format

Decision:
Use WAV as the canonical preserved recording format.

Reason:
The audio analysis pipeline requires uncompressed source material.

Consequences:
Compressed export formats may be produced later, but analysis must use the WAV source.
```

Keep this file focused on decisions that would otherwise need to be rediscovered.

---

# 12. Ordering

Task files are processed in deterministic filename order.

Use numeric prefixes when sequence matters:

```text
00-overview.md
01-foundation.md
02-recording.md
03-analysis.md
04-arrangement.md
05-export.md
```

Within each file, tasks are considered in line order, subject to dependency readiness.

Dependency metadata is preferred over filename ordering when one task genuinely depends on another.

---

# 13. Automated implementation

The repository task runner is:

```text
scripts/implement-tasks.sh
```

Normal usage:

```text
./scripts/implement-tasks.sh <module>
```

Example:

```text
./scripts/implement-tasks.sh song-creation
```

This operates on:

```text
docs/tasks/song-creation/
```

and normally uses:

```text
feat/song-creation
```

as the feature branch.

The automation is expected to:

1. validate task metadata and dependency relationships;
2. find a ready unchecked requirement;
3. assign exactly that requirement to an implementation agent;
4. allow implementation and local testing;
5. verify that only the assigned task was marked complete;
6. create one commit for that requirement;
7. push the commit;
8. continue with another ready requirement;
9. perform an independent final review when all requirements are complete;
10. create a pull request only after the final review succeeds.

---

# 14. Task completion

Do not manually mark a task `[x]` merely because code was written.

`[x]` means:

```text
implemented + tested + verified
```

If the requirement already existed before the task was documented, it may still be marked complete after:

- inspecting the implementation;
- confirming the behavior;
- running the relevant tests.

An unnecessary code change is not required.

---

# 15. Blocked tasks

If a task is blocked:

- leave it `[ ]`;
- document the reason;
- resolve the blocker explicitly.

Do not mark blocked requirements complete.

If all remaining tasks are blocked by unresolved dependencies, the automated runner should stop rather than ignore the dependency graph.

---

# 16. Adding requirements discovered during implementation

If implementation reveals additional genuinely necessary work, do not silently expand the currently assigned task.

Determine whether the additional work is:

## Required supporting work

Necessary to correctly implement the current requirement.

It may be included in the current implementation.

## Separate requirement

Meaningful independently or not required for current correctness.

Add it to the task documentation as a new requirement for later work.

When an automated runner owns task state, do not add new executable checkboxes during the currently assigned agent run unless the orchestration policy explicitly permits it.

---

# 17. Module completion

A module is not considered complete merely because every checkbox says `[x]`.

After all requirements are complete, perform an independent module-level review covering:

- all requirements;
- integration between implemented features;
- regression tests;
- architecture consistency;
- obvious missing edge cases.

Only after that review passes should the module normally proceed to pull request review.

# Authoring new requirements

When creating a new module specification, converting user requests into a plan, or expanding an existing feature specification, agents must convert every accepted and independently actionable requirement into an unchecked Markdown task.

Use:

```text
- [ ] Requirement
```

Prefer stable IDs for substantial work:

```text
- [ ] [ID:requirement-id] Requirement
```

Add dependencies when implementation ordering is real:

```text
- [ ] [ID:dependent-task] [DEPENDS:prerequisite-task] Requirement
```

The agent should perform requirement decomposition before implementation begins.

For example, a user request such as:

> Add high-quality recording, playback, saving, and WAV export to the Song Creation page.

should normally become several independently verifiable requirements:

```text
## Recording

- [ ] [ID:wav-recording] Record microphone input as high-quality WAV.

- [ ] [ID:recording-preview] [DEPENDS:wav-recording] Allow playback of the recorded audio.

- [ ] [ID:recording-storage] [DEPENDS:wav-recording] Save recordings in the dedicated Song Creation workspace.

- [ ] [ID:wav-export] [DEPENDS:wav-recording] Allow WAV recordings to be exported.
```

Do not leave accepted requirements only in prose if they are intended for future implementation.

## Requirement decomposition

Create one task per independently verifiable outcome.

A good task should normally be:

- understandable without guessing;
- small enough for one focused implementation cycle;
- large enough to represent useful product behavior;
- testable or otherwise objectively verifiable;
- suitable for one Git commit in the automated workflow.

Avoid both extremes:

### Too broad

```text
- [ ] Build Song Creation.
```

### Too narrow

```text
- [ ] Add variable.
- [ ] Add event listener.
- [ ] Call helper function.
```

Prefer:

```text
- [ ] [ID:recording-preview] Allow the user to preview the most recently recorded WAV before saving it.
```

Implementation details belong in the implementation plan, not as separate requirements unless they are themselves externally meaningful constraints.
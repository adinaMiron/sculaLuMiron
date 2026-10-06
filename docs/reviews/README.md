# Review Documentation

This directory stores concrete findings produced by code reviews, implementation reviews, regression reviews, security reviews, UX reviews, and similar verification work.

Review documents are separate from feature requirements.

---

# 1. File naming

Use:

```text
YYYY-MM-DD-<module>-review.md
```

Examples:

```text
2026-10-04-solar-calculator-review.md
2026-10-05-song-creation-review.md
2026-10-08-authentication-security-review.md
```

A new substantial review should normally receive a new file rather than rewriting historical reviews.

---

# 2. Review document structure

Recommended format:

```text
# Song Creation Review

Date: 2026-10-05
Module: song-creation
Reviewed branch: feat/song-creation

## Summary

Short description of what was reviewed.

## Findings

- [ ] Recording preview leaks an AudioContext after repeated playback.

- [ ] WAV export does not preserve the selected sample rate.

- [ ] The mobile transport controls overflow at 320 px.

## Notes

Non-actionable observations may be recorded here as normal bullet points.
```

---

# 3. Checkbox meaning

An unchecked review finding means:

```text
- [ ] Known finding still requiring correction.
```

A completed review finding means:

```text
- [x] Finding corrected and verified.
```

Do not mark a finding complete merely because code was modified.

Completion means:

- the problem was corrected;
- relevant tests passed;
- the fix was inspected;
- the original finding no longer reproduces.

---

# 4. What belongs in a review

Review findings should describe concrete issues such as:

- bugs;
- regressions;
- missing validation;
- incorrect behavior;
- accessibility problems;
- security problems;
- performance regressions;
- missing relevant tests;
- documentation contradicting implementation;
- broken integration;
- requirements that were marked complete but are not actually satisfied.

Prefer precise findings.

Good:

```text
- [ ] Submitting latitude 92 is accepted even though valid latitude is limited to -90..90.
```

Weak:

```text
- [ ] Validation could be better.
```

---

# 5. What does not belong in a review

Do not use review findings as a hidden feature backlog.

For example:

```text
- [ ] Add multi-user collaboration.
```

does not belong in a review if multi-user collaboration was never part of the requirements.

Instead add it under:

```text
docs/tasks/<module>/
```

as a new requirement.

---

# 6. Defect versus new requirement

When review discovers missing behavior, ask:

## Was this behavior already required?

If yes, it is a defect.

Record it as a review finding.

## Was this behavior never required?

If yes, it is new scope.

Create a task requirement under:

```text
docs/tasks/<module>/
```

This distinction prevents feature expansion from being disguised as bug fixing.

---

# 7. One finding at a time

Automated review-fix workflows should process exactly one unchecked finding per agent invocation.

The intended flow is:

```text
first unchecked finding
        ↓
inspect
        ↓
minimal fix
        ↓
relevant tests
        ↓
verify
        ↓
[ ] -> [x]
        ↓
one commit
        ↓
push
```

The agent must stop after that finding.

The orchestration script then validates the result before creating the commit.

---

# 8. Minimal fixes

A review fix should normally be narrower than feature implementation.

Prefer:

- correcting the defect;
- adding the regression test;
- making the smallest supporting change.

Avoid unrelated:

- refactoring;
- cleanup;
- formatting;
- architecture redesign;
- dependency upgrades;
- feature additions.

If review exposes a broader architectural problem, document it separately rather than silently expanding a small fix.

---

# 9. Testing review fixes

Every corrected finding should have appropriate verification.

Where practical, add a regression test that would have failed before the fix.

Run relevant existing tests.

Do not mark the finding complete while relevant tests fail.

---

# 10. Automated review fixing

The repository review runner is:

```text
scripts/fix-review.sh
```

The runner requires Linux and Python 3 with kernel file-sealing support. It
rejects agent changes to the control plane, including `scripts/` and `.github/`;
fixes to those files need a separate human-reviewed change. See the [execution
boundary and startup trust requirements](../tasks/agent-orchestration/04-decisions.md).

The script should be configured for the review document and branch it is processing.

Typical mapping:

```text
docs/reviews/2026-10-04-solar-calculator-review.md

→

fix/review-2026-10-04-solar-calculator
```

The wrapper, rather than the coding agent, should own:

- branch selection;
- staging;
- committing;
- pushing;
- pull-request creation.

The coding agent should own:

- investigation;
- implementation;
- local testing;
- marking the assigned finding complete.

---

# 11. Review-fix Git granularity

Preferred history:

```text
one review finding
        ↓
one verified fix
        ↓
one commit
```

Example:

```text
fix: reject latitude outside valid range
fix: prevent duplicate playback audio contexts
fix: keep mobile transport controls inside viewport
```

This makes fixes independently reviewable and reversible.

---

# 12. Failed review fixes

If a finding cannot be safely corrected:

- leave it `[ ]`;
- preserve useful diagnostic information where appropriate;
- explain the blocker;
- stop.

Do not proceed automatically to another finding after a failed attempt.

---

# 13. Re-review

After all findings are marked complete, consider re-running the relevant module regression tests or requesting a fresh independent review.

For significant modules, the desirable sequence is:

```text
implementation requirements complete
        ↓
independent review
        ↓
review findings documented
        ↓
findings fixed one-by-one
        ↓
final regression verification
        ↓
merge
```

A review file is not merely a checklist. It is a traceable record of defects found and how completion was verified.

---

# 14. Historical review documents

Keep completed review files in the repository unless there is a deliberate documentation-retention policy saying otherwise.

Completed reviews provide useful historical information about:

- past defects;
- recurring problem areas;
- architectural weaknesses;
- regression patterns;
- prior verification.

Do not reuse an old review file for an unrelated later review simply because all its checkboxes are already complete.

# Automatic review finding authoring

When an agent performs a review and discovers a concrete issue requiring correction, every independently actionable finding must be written as an unchecked Markdown task:

```text
- [ ] Finding.
```

Do not leave actionable defects only in review prose.

For example, instead of:

```text
The mobile layout has several problems. The primary button wraps and the
result table overflows.
```

write:

```text
## Findings

- [ ] The primary action button wraps onto two lines at 320 px viewport width.

- [ ] The result table overflows the viewport on screens narrower than 400 px.
```

Each finding should describe one concrete problem that can independently be:

1. reproduced or verified;
2. corrected;
3. tested;
4. marked complete;
5. committed.

## Non-actionable review observations

Do not use checkboxes for observations that require no corrective action.

For example:

```text
## Notes

- The calculator module still uses the original naming convention.
- Existing test organization differs from newer modules.
```

These are observations, not review-fix tasks.

## New features discovered during review

A review agent must distinguish defects from new product requirements.

If expected behavior was already required but is missing or incorrect:

```text
docs/reviews/
```

and create:

```text
- [ ] Concrete review finding.
```

If the behavior was never part of the accepted requirements, do not create it as a review finding merely because it would improve the product.

Instead create a new implementation requirement under:

```text
docs/tasks/<module>/
```

using:

```text
- [ ] [ID:new-requirement] New required behavior.
```

This prevents feature expansion from being hidden inside review-fix work.

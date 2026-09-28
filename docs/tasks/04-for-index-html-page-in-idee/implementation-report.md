# Task 04 implementation report — follow-up

## Changed files

- `js/markdown/i18n.js`: Changed `t()` to forward every argument to functional translations. The existing Romanian and English `dictatePhraseFailed` formatters now receive both the phrase index and the actual error message, so failure toasts no longer end in `undefined`.

## Spec coverage

The phrase-mode capture, ordering, failure marker, cancellation, translations, and documentation from the earlier task-04 implementation were already present in the repository. This follow-up fixes the reported failure-toast defect without changing those paths. The existing call `t("dictatePhraseFailed", slot.idx, slot.err)` now formats both values.

## Scope decisions and uncertainties

- The spec asks for an update to `tests/dictate.js`, but the final instruction for this round says not to run or write tests. I followed that instruction and left test files untouched. No tests were run.
- `docs/I18N.md` does not enumerate `dictate*` keys, so the spec's conditional documentation change did not apply. Its generic one-argument `t()` example was left as it was to stay within scope.
- The fix was reviewed as a one-line source diff. Browser behavior and any other edge cases remain for the tester to verify.

## Commit blocker

I ran the requested `git add -A && git commit -m "Fix dictation failure toast error text"` once. Git could not create `.git/index.lock` because the repository's `.git` directory is read-only in this workspace. The source and report changes are present but uncommitted; I did not retry or work around the refusal.

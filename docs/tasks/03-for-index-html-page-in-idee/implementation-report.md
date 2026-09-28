# task-03 — implementation report (verification pass)

## Summary

Per the re-plan in the spec, this pass verified HEAD (`61cf6fc`) against the
spec by **code review**. It found **no deviations**, so no product code was
changed. Only this report was rewritten.

## What was checked (against the code, not a browser)

- **Markup / CSS (§ 2, 3):** `#idea-modal` has the `#idea-chapter` field, the ×
  button and the `#idea-chapter-list` listbox, in the specified place and with
  the specified attributes. CSS uses theme tokens only and reuses the
  `.ws-*` row classes. The comment above the modal mentions the picker.
- **State, search, rendering (§ 4.1–4.4):** `ideaPick`; `ideaChapterMatches`
  (folded title-only, exact/starts/rest ordering, workbook then chapter
  order, render capped at 50); `ideaSearchResolve` (single exact match, else a
  single match, else null plus `n`); `ideaRenderChapterList` (open only when
  no pick and non-empty input, `textContent` only, `.sel` on the highlighted
  row, `ws-empty` row for no match, no create option); `ideaChapterPick`,
  `ideaChapterInput`, `ideaChapterClear`, and the `openIdeaModal` pre-fill
  (focus stays in `#idea-text`, textarea not cleared).
- **Resolver and hint (§ 4.5, 4.6):** `ideaResolve()` follows the four steps in
  order, and a deleted pick falls through to step 4. `ideaPaintHint()` and
  `saveIdea()` both call it. Hint cases checked: picked, search, open,
  prefix, ignored words with none or several matches (with and without a
  body), and the untouched fallback texts.
- **Save (§ 4.7):** an empty body gives `ideaEmpty` and nothing is written. A
  null chapter creates Idei and today's chapter. On success the textarea and
  the picker are reset and the box closes. `ideaAppendTo()` is unchanged, so
  the append format is the required one (trailing whitespace trimmed, one
  `\n`, the idea, `\n`) and the open-chapter case updates the editor and sets
  `wbDirty = false`.
- **Keyboard (§ 5):** the `#idea-chapter` handler in `events.js` covers Escape,
  Ctrl/Cmd+Enter, ArrowUp/Down (clamped, scrolled into view), Enter (picks
  the highlighted row, otherwise `preventDefault` only) and
  `stopPropagation` for other Ctrl/Cmd/Alt chords.
- **i18n (§ 6):** all six keys exist in `en` and `ro` with the exact specified
  text and diacritics. Both help paragraphs were updated.
- **Existing suite (§ 7):** `tests/idea.js` now clicks `#idea-chapter-clear`
  before the four "nothing matched" cases and keeps all its checks.
- **Docs:** `docs/FEATURES.md` § J and the `docs/MAP.md` row mention
  `ideaResolve` and `ideaChapterPick`.

## Output

`node tests/verify.js`:

```
JS parses; all nine nav blocks synchronized; diacritics OK
```

## Deliberately not done

- **`node tests/idea.js` was not run, and no browser pass was done.** My
  instructions for this run say not to run or write tests (that is the
  tester's job). This conflicts with spec § 0 step 3, and I followed the
  explicit run instruction. The spec's "Done means" items that need a
  browser (§ 8 items on `#editor` / `wbDirty`, § 9 manual steps 1–11) are
  therefore verified by reading the code only, not by execution. The tester
  should run `node tests/idea.js` (expected: only known issue #3 fails) and
  the § 9 walk-through.
- Out of scope, left alone as decided: the UI language switch does not
  repaint an already-open list or hint until the next keystroke.

## Edge cases I noticed (not deviations)

- Pressing Enter in `#idea-chapter` while the list is closed does nothing (as
  specified). It does not move focus to the textarea.
- `ideaResolve()` calls `ideaSetPick(null)` if the picked chapter has been
  deleted. That is a small side effect inside a function the hint also
  calls, and it is harmless because it only clears the input.

## Round addendum — bug-1 (double save appends twice)

**Changed:** `js/markdown/idea.js` only. `saveIdea()` is now a thin wrapper
guarded by a module-level `ideaSaving` flag. A call while a save is in flight
returns immediately. The flag is cleared in `finally`, so a failed save
(`ideaFailed`) or an exception leaves the box usable. The original body moved
unchanged into `ideaSaveNow()`.

**Not done:** no tests written or run (tester's job). Only
`node tests/verify.js` was run after the edit, and it passed. Every entry point
(Ctrl+Enter in either field, the Save button) calls `saveIdea()`, so the guard
covers all of them. A second press during the in-flight save is silently
ignored (no toast).

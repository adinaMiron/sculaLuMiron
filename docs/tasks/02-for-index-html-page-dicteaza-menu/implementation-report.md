# Implementation report — task 02

## Changes
- `js/markdown/dictation.js`: `setBtn(on)` now also swaps `data-i`, `data-i-title`, `data-i-aria`, repaints text/title, and sets/removes `aria-label`. Off state restores exactly the markup's attributes (no aria-label, no data-i-aria). Idempotent. No engine/queue/pill changes.
- `js/markdown/i18n.js`: added `dictateStopBtn`, `dictateStopTip`, `dictateStopAria` in ro and en, beside `dictateBtn`.
- `index.html`: two CSS rules inside the existing `@media (max-width: 700px)` block (`#btn-dictate.active` font-size 0 + `::before` "⏹" 13px). Padding untouched; `.active` red styling untouched; idea button unaffected.
- `docs/FEATURES.md`: paragraph added in the idea-box dictation section.

## Notes
- `t()` is the global from i18n.js; used at call time, so load order is fine.
- `node tests/verify.js` passes. I did not run or write behaviour tests (tester's job).
- Language switch mid-recording works through `applyUILang()` reading the swapped `data-i*` keys. `aria-label` is set by `setBtn` from `t()`. I did not confirm that `applyUILang` repaints `data-i-aria` (the spec says it does, i18n.js ~886-893), so a mid-recording toggle might leave the aria-label in the old language. The tester should check that.
- No MAP.md anchors touched.
- Commit: the first attempt was denied by the environment; see the final message for whether it went through.

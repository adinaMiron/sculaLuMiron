# task-01 implementation report

## Summary

Fixed the four language-biasing spots in `js/markdown/dictation.js` so the
API dictation engine keeps whatever language was actually spoken instead of
translating towards `S.lang`. No PCM rewrite, no new recording pipeline —
`MediaRecorder`, segment rotation, the queue and the live engine are
untouched, per the lead's binding decision. This round only addressed the
lead's review-round-1 blocking finding (below); the product change itself
is unchanged from the prior round.

## This round: removed the committed sandbox symlink

The lead's round-1 review (`review.json`) passed the product change but
blocked the merge on `.config/pulse/HCAlienM7-runtime`, a machine-local
symlink into `/tmp/pulse-PKdhtXMmr18n` created by the sandbox's pulseaudio.
It had already been removed once (`66f905e`) and was re-added by the
implementer's own `git add -A` in `97fa838`. This round:

- `git rm --cached .config/pulse/HCAlienM7-runtime` — untracks it (the
  symlink still exists on disk for the sandbox's pulseaudio to use; only
  the git-tracked copy is gone).
- Added `.config/pulse/` to `.gitignore` so a future `git add -A` on this
  or any later branch cannot restage anything under that directory.
- Verified `git diff main --stat -- .config/` now prints nothing.

No product code changed in this round.

## Changes, file by file

### `js/markdown/dictation.js`

- **Removed `tailPrompt()`** entirely, and dropped its call site in `pump()`
  (`transcribe(item.blob, item.ext)` — no third argument).
- **`transcribe(blob, ext)`** (spec 1.1): dropped the `promptText` parameter;
  no longer appends `language` or `prompt` to the `FormData`. `file`,
  `model`, `response_format=json`, `temperature=0`, headers and URL are
  unchanged.
- **`pickModel()`** (spec 1.2, new helper): returns `S.model ||
  "whisper-large-v3"` unless that id matches `/(^|[-.])en$/i` or
  `/^distil-whisper/i`, in which case it returns `"whisper-1"` for
  `provider === "openai"` and `"whisper-large-v3"` otherwise (covers
  `groq` and `custom`, as the spec's acceptance check 4 only exercises
  those two but the rule in 1.2 is "the provider's multilingual default:
  whisper-1 for openai, whisper-large-v3 for groq and custom"). `transcribe`
  now sends `fd.append("model", pickModel())`.
- **`tidyUp(text)`** (spec 1.3): system prompt rewritten to the
  language-neutral version from the spec (Romanian/English/mixed, keep each
  word in its spoken language, never translate/rephrase/add/remove words,
  fix only punctuation/capitalisation/diacritics-on-Romanian-words, reply
  with corrected text only). No more mention of "missing Romanian
  diacritics" as an instruction that favours Romanian.
- **`keepsWords(raw, out)` / `foldWords(s)`** (spec 1.4, new helpers):
  `foldWords` lowercases, NFD-normalises, strips `\p{M}`, and splits on
  anything that isn't `\p{L}`/`\p{N}` (the `u` flag), dropping empty
  tokens. `keepsWords` returns `true` when `raw` has zero word tokens;
  otherwise it counts how many of `raw`'s tokens (with repeats) are present
  in the *set* of `out`'s tokens, requires that fraction `>= 0.8`, and
  requires `out`'s token count to be within `0.8x`–`1.25x` of `raw`'s.
  `tidyUp` now returns the model's trimmed output only when it's non-empty
  and `keepsWords(text, trimmed)` is true; otherwise it returns the raw
  `text` unchanged.
- Added a one-line "why" comment above each changed function
  (`pickModel`, `transcribe`, `tidyUp`, `keepsWords`/`foldWords`), per the
  spec's instruction.
- The live engine (`startLive`, `live.sr.lang = S.lang === "en" ? "en-US" :
  "ro-RO"`) is untouched, as required.
- `S.lang` and `S.hint` are no longer read anywhere in the API path;
  `S.lang` is still read by the live engine only (verified with grep).

### `docs/FEATURES.md`

Added a new subsection "The API engine never picks a language for you"
under § J right after the existing dictation paragraphs (before the `---`
separator that precedes § K), covering: no `language`/`prompt` sent,
detection once per request/segment, mixed-language segments transcribed as
heard, the English-only-model swap via `pickModel()`, the `tidyUp()`
discard-unless-`keepsWords()` behaviour with its two thresholds, and that
the live engine is unchanged and still uses `S.lang`.

### `js/markdown/i18n.js`

Added one sentence to each help panel, both with diacritics/plain English
as appropriate:
- RO (`<h3>Dictare vocală</h3>`, ~L438-439): "Limba vorbită este detectată
  singură și textul nu este niciodată tradus (cu excepția dictării din
  browser, care folosește limba aleasă în Caiet vocal)."
- EN (`<h3>Voice dictation</h3>`, ~L884-885): "The spoken language is
  detected on its own and the text is never translated (except for browser
  dictation, which uses the language chosen in Caiet vocal)."

### `docs/MAP.md`

Updated the "Dictation into editor or idea" row (L360) to list `pickModel`
and `keepsWords` alongside the existing `toggleDictation`/
`toggleIdeaDictation` entries.

## How this satisfies the spec

Each numbered item in spec § 1 ("Changes in dictation.js") and § 2 ("Docs
and help") maps 1:1 to a change above. Scope was kept to exactly the two
files named in spec § 3 (`js/markdown/dictation.js`, `js/markdown/i18n.js`)
plus the three docs named in § 2. `voice.html` was not touched. The shared
nav block was not touched. No new dependencies, no new settings UI, no new
i18n keys for UI (the two added strings are inside existing help-panel HTML
blocks, not new `t()` keys), no markup/CSS change.

## Ambiguity and how I resolved it

- Spec 1.2 says the multilingual default is "`whisper-1` for `openai`, and
  `whisper-large-v3` for `groq` and `custom`". I implemented this as: if
  `provider === "openai"` use `whisper-1`, else use `whisper-large-v3`
  (which covers `groq`, `custom`, and any other value `S.provider` might
  hold, since `S.provider` is already normalized to a known key elsewhere
  in the file). This matches the spec's explicit list and needs no
  disambiguation.
- Spec acceptance check 4 only exercises `groq` and `openai` explicitly for
  the model guard; I left the `custom` branch falling into the
  `whisper-large-v3` case per the spec's own wording, without adding a
  dedicated test-only branch (no tests were written by me, per instructions).

Nothing else in the spec struck me as ambiguous or contradicting the
existing code.

## Checks run

- `node -c js/markdown/dictation.js` — syntax OK.
- Team runner presets, via
  `python3 .../sandbox.py .ai-team/scripts/run_suites.py <args>`:
  - `--preset browser-check` → `BROWSER: OK`.
  - `dictate idea nav` → `dictate` OK (11/11 pass); `idea` KNOWN-ONLY
    (1 known failure, matches Known issue #3); `nav` KNOWN-ONLY (3 known
    failures, matches Known issue #1).
  - `--preset header` (verify + header guards + task-02 specs + gdsync +
    gantt + wbsaveall) → all OK or KNOWN-ONLY, no new/unrecognized
    failures.

No new Playwright suite was added for this task, per the instruction that
writing/running tests is the tester's job — the spec's § "Tester (standing
policy, allowed)" section describes work explicitly reserved for that role.

## Concerns / left to the tester

- I did not add a suite under `tests/01-for-index-html-page-in-idee/`; per
  the task prompt this implementation round is scoped to product code and
  docs, and test-writing is explicitly the tester's job. The spec's
  acceptance checks 1-9 are not independently verified by me beyond what
  the existing `tests/dictate.js`/`idea.js`/`nav.js` suites (which don't
  target this specific behaviour) and a manual read of the diff can show.
- `keepsWords`'s 80%/0.8x–1.25x thresholds were implemented literally from
  the spec's prose; I did not hand-verify them against the exact acceptance
  check 5/6 transcript pairs by executing the function (no test harness was
  built for this round). Worth the tester's close attention.
- I did not audit whether `S.hint`/`S.lang` are exposed anywhere in the
  settings UI in a way that now looks unused/dead for the API engine (the
  spec doesn't ask for UI changes, and both are still meaningful for the
  live engine and possibly other pages, so I left the settings UI as-is).

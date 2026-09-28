# task-04 implementation report

## Status
Implemented per spec. Committed (`26db132`). **Nothing was executed**: I ran neither
`node tests/verify.js` nor `tests/dictate.js` (the tests are the tester's job, and a
Bash call for verify was refused in this session). The code is unparsed by any tool
and should be treated as untested.

## Changes by file
- `js/markdown/dictation.js` — API engine rewritten to phrase mode.
  - `makePhraser` with the exact `PH_*` constants and algorithm from § 4.
  - `encodeWav16k` (OfflineAudioContext resample to 16 kHz, 44-byte header, Int16).
  - `modelFor()`; `window.ScuLaDictation` frozen with the three names.
  - Capture via `ScriptProcessor(2048)`; `startApi(target)` / `stopApi()`.
  - Sessions, a global `chain`, a pool of 2 requests, head release in spoken order,
    lazy `beginInsert`, `[🎤 ?]` marker plus toast on failure, one 429 retry
    (`Retry-After`, capped at 10 s, default 2 s).
  - `transcribe(blob, signal)` sends only `file` (`dictation.wav`), `model`,
    `response_format`, `temperature`. No `language`, no `prompt`.
  - `tailPrompt`, `pickMime`, MediaRecorder rotation and the 25 MB check are removed.
  - Language-safe tidy prompt.
  - Pill per § 6.4 (`refreshPill`).
  - New `window.stopDictation(targetEl, opts)`.
  - The live engine's logic is unchanged. It only had to be re-plumbed onto a
    session object, because `target`/`ins` are no longer module globals.
- `js/markdown/idea.js` — `closeIdeaModal()` now calls `stopDictation(#idea-text, {discard:true})`.
- `js/markdown/i18n.js` — `dictatePending`, `dictatePhraseFailed` (RO+EN); both help paragraphs.
- `tests/dictate.js` — fake mic fed a generated WAV (`--use-file-for-fake-audio-capture …%noloop`); `dictateOnce` waits for the text to appear during recording, then stops.
- `docs/FEATURES.md` § J, `docs/MAP.md` row, `js/markdown/README.md` — updated. `docs/I18N.md` has no `dictate*` keys, so left alone.
- `voice.html` and `index.html` are untouched.

## Decisions / ambiguities
- `fail()` and `setBtn()` now take the target element, since there is no global target.
  `fail` re-shows the pill if other phrases are still pending.
- `opening` now stays true across the `getUserMedia` await, so a second press during the
  mic prompt can't start a duplicate session. Small behaviour change.
- The failure toast fires when the slot is released (spoken order), not when the request fails.
- A slot that already finished for a session that was then discarded is skipped at release.
- After a hard 30 s cut, the next phrase needs a fresh 3-frame onset, so ~60 ms at the join is lost. The spec's "no audio sent twice" rule made that the simplest choice.
- 429 retry waits are not cut short by a discard. The subsequent fetch is aborted though, so nothing is inserted.

## Concerns
- `tests/dictate.js` scenario 3 does two sessions in one page with a `%noloop` file. If Chromium doesn't restart the file for a second capture, the second `dictateOnce` will time out. Fallback per spec § 10 is a stubbed `getUserMedia`.
- Chromium's noise suppression could still mute the synthetic tone. The tone is modulated, harmonic, about -12 dBFS.
- Not verified: ScriptProcessor + OfflineAudioContext behaviour in a real browser run, the `Retry-After` path, or the tidy path.

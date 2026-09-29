name: dictation
description: Use when a task touches speech dictation (js/markdown/dictation.js, the 💡 idea box's 🎤, voice.html's copy of the engine) — plan, implement, test or review. Where the language logic lives, the engine's invariants, and a ready test harness.

# Dictation (index.html API + live engines)

Facts from task `01-for-index-html-page-in-idee` (merged `57be8ad`). Its
tester spent 63 turns / $1.56 — the largest call of that pass — mostly
rediscovering the two stub gotchas below.

## Where things are
- `js/markdown/dictation.js` serves both the editor's 🎤 (`toggleDictation`)
  and the idea box (`toggleIdeaDictation`). Grep these names:
  - `transcribe(blob, ext)`: the Whisper-style multipart POST. Since task-01
    it sends **no** `language` and **no** `prompt` (the spoken language is
    auto-detected per request/segment). Don't reintroduce either.
  - `pickModel()`: swaps English-only ids (`*-en`, `*.en`, `distil-whisper*`)
    for the multilingual default (`whisper-1` on openai, else
    `whisper-large-v3`).
  - `tidyUp()` + `keepsWords()`/`foldWords()`: the LLM tidy pass is
    language-neutral and its output is discarded unless ≥80 % of the raw
    words survive and the length stays within 0.8–1.25×.
  - `startLive()`: the browser SpeechRecognition engine. It *does* use
    `S.lang` (`ro-RO`/`en-US`) — the Web Speech API needs one language.
- Settings live in `localStorage['caiet-vocal:settings']`, shared with
  `voice.html` (`engine`, `provider`, `endpoint`, `model`, `lang`, `segMin`,
  `tidy`, `hint`). `S.hint` no longer affects index.html.
- `voice.html` (~L2622) has its **own copy** of the engine and still forces
  `language`/prompt. A task on "dictation" must say which page(s) it covers.
- Docs: `docs/FEATURES.md` § J ("The API engine never picks a language for
  you"); help text in `js/markdown/i18n.js` (`Dictare vocală` / `Voice
  dictation` panels, RO and EN).

## Planning
- Keep the fix small. An earlier attempt at this requirement
  (`task/04-for-index-html-page-in-idee`, a PCM + silence-split rewrite,
  ~8k-line diff) failed five review rounds on mic-cleanup races. The small
  spec (no new recording pipeline) passed at standard/medium for both roles.
- Name the acceptance checks as request-body assertions (field present or
  absent, model id), not as "transcribes Romanian correctly": no real STT
  runs in tests.

## Testing — reuse, don't rebuild
- `tests/01-for-index-html-page-in-idee/helpers.js` exports `load(page,
  settings)`, `settings()`, `parseMultipart()`, `openIdea()`,
  `dictateOnce()`. Require it from a new suite instead of copying it.
- Fake mic: `test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream'] } })`. This replaces the config's
  `launchOptions` (and its `PW_CHROME_PATH` executablePath); it works here
  because Playwright's own Chromium is installed.
- Stub the STT endpoint with `page.route(endpoint, …)` and read
  `request.postDataBuffer()`; stub the tidy endpoint the same way (JSON).
- **Gotcha 1:** Chrome has both `window.SpeechRecognition` and
  `window.webkitSpeechRecognition`; `startLive()` tries the unprefixed one
  first. Replace **both** or the real network engine runs and every
  assertion just times out (helpers.js does this).
- **Gotcha 2:** record for ~1300 ms (as `tests/dictate.js` does). A 300 ms
  recording yields a blob under `onstop`'s 1200-byte floor, which is
  dropped silently — it looks like a hung test.
- Guards: `run_suites.py --preset dictation` (verify, `dictate`, `idea`,
  the task-01 specs; ~60 s). The after-implement hook runs the same set
  when `dictation.js` changes.

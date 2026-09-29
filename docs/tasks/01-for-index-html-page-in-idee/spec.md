# task-01 — Dictation in the 💡 idea box keeps the spoken language (never translates)

## 0. What and why

Task: *"In the Idee rapidă box, when the user speaks Romanian write Romanian,
when they speak English write English. Never translate!"*

**Binding owner decision:** an earlier attempt failed, and the owner asked for
**a different approach**. That attempt (branch `task/04-for-index-html-page-in-idee`)
rewrote the API engine to use PCM capture, silence detection and per-phrase
uploads. It never converged. **Do not build pause detection, PCM capture,
per-phrase requests or any new recording pipeline.** Keep `MediaRecorder`, the
segment rotation, the queue and the live engine exactly as they are. This task
is a small, targeted fix to the four places in `js/markdown/dictation.js` that
push the output towards one language.

Root causes, all in `js/markdown/dictation.js` (on `main`):

1. `transcribe()` sends `language` = `S.lang` (the Caiet vocal default is `"ro"`).
   Whisper forced to `ro` turns English speech into Romanian. That is the translation.
2. `transcribe()` sends `prompt` = `tailPrompt()` (the `S.hint` plus the last
   400 characters of the box). That text is decoder context: Romanian context
   pulls English speech towards Romanian, and the other way round.
3. `tidyUp()`'s system prompt asks the model to fix "missing Romanian
   diacritics", which invites it to romanianise English. Nothing checks
   what the model sends back.
4. An English-only saved model (such as Groq `distil-whisper-large-v3-en`) cannot
   write Romanian.

**Lead decisions (binding for this task):**

- The fix lives in the shared engine, so it applies to **both** entry
  points, `#btn-idea-dictate` → `#idea-text` and the toolbar `#btn-dictate` →
  `#editor`. Do not add a target-specific branch.
- **Language is auto-detected by the service.** Whisper detects it once per
  request, which means once per recording, or once per `segMin` segment. A
  recording that mixes both languages is transcribed as Whisper hears it,
  with no language forced. This is an accepted limitation. Document it; don't engineer around it.
- **The browser "live" engine (`S.engine === "live"`) is unchanged.** Web
  Speech cannot auto-detect, so it keeps using `S.lang`. Document this.
- `voice.html` is **not changed**. It has its own copy of the code.
- No new settings UI, no new i18n keys for UI, no markup or CSS change.

## 1. Changes in `js/markdown/dictation.js`

**1.1 `transcribe(blob, ext)`:** never append `language` and never append
`prompt` to the FormData. Remove the `promptText` parameter, delete
`tailPrompt()` and update its caller in `pump()`. `S.lang` and `S.hint` are no
longer read by the API engine. Everything else in the request stays the same:
`file`, `model`, `response_format=json`, `temperature=0`, the headers and the URL.

**1.2 Model guard:** add a helper that picks the model: `S.model || "whisper-large-v3"`.
If that id is English-only, meaning it matches `/(^|[-.])en$/i` or
`/^distil-whisper/i`, replace it with the provider's multilingual default:
`"whisper-1"` for `openai`, and `"whisper-large-v3"` for `groq` and `custom`.
Any other id is sent unchanged (for example `whisper-large-v3-turbo` or `whisper-1`).

**1.3 `tidyUp(text)`:** replace the system prompt with a language-neutral one
that says: the text may be Romanian, English or both mixed; keep every word in
the language it was spoken in; never translate, rephrase, add or remove
words; fix only punctuation and capitalisation, and add diacritics only to
Romanian words; reply with the corrected text only.

**1.4 Never-translate guard on tidy output:** `tidyUp` returns the model's
output **only if** `keepsWords(raw, out)` is true. Otherwise it returns `raw`
unchanged. `keepsWords` works like this:

- Fold both strings: lowercase them, apply NFD, strip `\p{M}`, and split on
  anything that is not `\p{L}` or `\p{N}` (use the `u` flag), dropping empty tokens.
- If raw has 0 words, return true.
- Return true when **at least 80 %** of raw's word tokens (count repeats)
  appear in the set of out's tokens, **and** out's token count is within
  **0.8×–1.25×** of raw's token count.

So a diacritics or punctuation fix passes, and a translation fails.

The comment block above each changed function should say *why* (never translate).

## 2. Docs and help

- `docs/FEATURES.md` § J "Dictating into it" (~L1419): add a paragraph. The API
  engine sends no `language` and no `prompt`, so the service keeps the language
  that was spoken. Detection happens once per request (recording or segment).
  English-only models are replaced by the multilingual default. Tidy-up output
  is discarded if it does not keep ≥80 % of the words. The live engine still
  uses the Caiet vocal spoken-language setting.
- The help sections in `js/markdown/i18n.js`, `<h3>Dictare vocală</h3>` (~L438) and
  `<h3>Voice dictation</h3>` (~L883): add one sentence in each language, with
  diacritics. RO: the language is detected by itself and the text is never
  translated (except for browser dictation, which uses the language chosen in
  Caiet vocal). EN: the same in English.
- `docs/MAP.md` L360 row: list `keepsWords` and the model guard helper name.

## 3. Scope

Product code: only `js/markdown/dictation.js` and `js/markdown/i18n.js`
(help text), plus the docs above. The shared nav block must not change.
There are no new dependencies. The existing `tests/dictate.js` must still pass
(it does not assert on `language`). Update it only if it breaks.

**Tester (standing policy, allowed):** add a Playwright suite in
`tests/01-for-index-html-page-in-idee/*.spec.js` and add that folder to the
`testMatch` array in the root `playwright.config.js`, so root `npm test` runs it.
Add any `.gitignore` entries it needs. Drive the real `index.html` with the
Chromium fake mic (`--use-fake-ui-for-media-stream`,
`--use-fake-device-for-media-stream`), seed `caiet-vocal:settings` in
localStorage the way `tests/dictate.js` does, and stub the endpoints with `page.route`.
Read multipart bodies with `request.postDataBuffer()`.

## 4. Acceptance checks

1. With settings `lang:"ro"` and `hint:"cuvinte"`, and the 💡 box open with `#idea-text`
   already holding text, a dictation from `#btn-idea-dictate` POSTs a
   multipart body that has **no** `name="language"` part and **no**
   `name="prompt"` part.
2. The same is true with `lang:"en"`, and with the toolbar `#btn-dictate`.
3. If the stub returns `"I will buy milk tomorrow"`, `#idea-text` contains exactly
   that English text. If it returns `"Mâine cumpăr lapte"`, the box contains that text, diacritics intact.
4. With the saved model `distil-whisper-large-v3-en` on `groq`, the `model` part is
   `whisper-large-v3`. On `openai` it is `whisper-1`. A saved `whisper-large-v3-turbo`
   is sent unchanged.
5. With `tidy:true` on `groq` (key `"k"`, both groq URLs stubbed), when the transcript is
   `"Maine cumpar lapte si I will call John"` and chat returns
   `"Mâine cumpăr lapte și I will call John."`, the box gets the tidied text.
6. For the same transcript, if chat returns `"Tomorrow I buy milk and I will call John."`
   (a translation), the box gets the **raw** transcript.
7. The chat request's system message contains no instruction that favours
   Romanian over English: it does not contain `missing Romanian diacritics`.
8. With `engine:"live"`, the Web Speech `lang` is still `ro-RO` for `lang:"ro"` and
   `en-US` for `lang:"en"` (stub `webkitSpeechRecognition`).
9. `node tests/verify.js` passes, and `tests/dictate.js` and `tests/idea.js` show no
   new failures. Known issue #3 in `idea.js` is pre-existing.

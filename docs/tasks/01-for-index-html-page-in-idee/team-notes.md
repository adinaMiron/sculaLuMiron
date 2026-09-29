## lead
- The same requirement was attempted before on branch `task/04-for-index-html-page-in-idee` (PCM + silence-split rewrite of `js/markdown/dictation.js`, 8k-line diff, failed 5 review rounds on mic-cleanup races). On a retry, check `git branch -a` for an older task folder with the same slug before planning.
- Dictation language bias lives in `js/markdown/dictation.js`: `transcribe()` sends `language`=`S.lang` (default "ro") and `prompt`=`tailPrompt()`, and `tidyUp()`'s system prompt names Romanian diacritics. `voice.html` has its own copy (~L2622) that is not shared.
- Root `playwright.config.js` `testMatch` lists task folders explicitly; a new `*.spec.js` folder must be added there or root `npm test` skips it.

## implementer
- `git add -A` in this sandbox picks up `.config/pulse/HCAlienM7-runtime`, a runtime symlink into `/tmp` created by the sandbox's pulseaudio, not repo content — `git status`/`git diff` before committing and `git rm --cached` it if it's staged.
- `run_suites.py dictate idea nav` and `--preset header` both finished clean (only the documented known failures) after the dictation.js edits; good smoke check for any future `dictation.js` change.

## tester
- Chrome exposes **both** `window.SpeechRecognition` (unprefixed) and `window.webkitSpeechRecognition` natively, and `dictation.js`'s `startLive()` tries the unprefixed one first. A live-engine test stub must override both — stubbing only `webkitSpeechRecognition` silently falls through to the real (network-backed) API and every assertion on the stub just times out.
- The fake-mic MediaRecorder needs roughly the same ~1300ms "recording" window `tests/dictate.js` uses; a shorter one (e.g. 300ms) often produces a blob under the 1200-byte floor in `dictation.js`'s `onstop`, so it's silently dropped and the transcription request never fires — looks exactly like a hung test, not an obviously-too-short wait.

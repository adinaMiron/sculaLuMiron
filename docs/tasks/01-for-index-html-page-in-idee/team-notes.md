## lead
- The same requirement was attempted before on branch `task/04-for-index-html-page-in-idee` (PCM + silence-split rewrite of `js/markdown/dictation.js`, 8k-line diff, failed 5 review rounds on mic-cleanup races). On a retry, check `git branch -a` for an older task folder with the same slug before planning.
- Dictation language bias lives in `js/markdown/dictation.js`: `transcribe()` sends `language`=`S.lang` (default "ro") and `prompt`=`tailPrompt()`, and `tidyUp()`'s system prompt names Romanian diacritics. `voice.html` has its own copy (~L2622) that is not shared.
- Root `playwright.config.js` `testMatch` lists task folders explicitly; a new `*.spec.js` folder must be added there or root `npm test` skips it.

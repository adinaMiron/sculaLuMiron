# Task 04 implementation report — follow-up

## Changed files

- `js/markdown/dictation.js`: Created a target-bound startup token before loading settings or requesting microphone permission. Closing Quick Idea invalidates the token; a late stream is stopped before Web Audio nodes or a session are created. The same session abort signal now reaches the tidy fetch and the HTTP 429 delay, allowing cancelled work to release its request-pool slot. Restored main's target-aware button label, title, and accessible-name changes. The earlier phrase cutter, ordering, failure marker, and language-safe request behavior remain.
- `js/markdown/idea.js`: Reconciled with main's chapter picker and `saveIdea` reentrancy guard. Closing the modal still discards dictation for the idea field.
- `js/markdown/i18n.js`: Kept main's stop-button, chapter picker, diagram, and sketch strings alongside task-04's phrase-status strings and bilingual dictation help. `t()` forwards both phrase-failure formatter arguments.
- `playwright.config.js`: Discovers `.spec.js` files across `tests/`, retains the task-04 suite and main's existing suites, and supports `PW_CHROME_PATH` with main's reporter and browser settings.
- `docs/FEATURES.md`, `docs/MAP.md`, `js/markdown/README.md`: Combined main's documentation with task-04's phrase-mode behavior, cancellation, and public names. `docs/I18N.md` is main's version; it does not enumerate `dictate*` keys.
- `.gitignore`, `package.json`, `package-lock.json`, `CLAUDE.md`, `index.html`, `song.html`, `js/audio/{analysis,backup,performance}.js`, `js/markdown/{diagram,events,files,markdown,sketch}.js`, main's earlier task records, and its existing test files: copied the current main versions into this older branch's working tree for integration. No task-04 behavior was added to these files. `voice.html` is unchanged.

## Spec coverage and decisions

The earlier task-04 implementation supplies pause-cut WAV phrases, independent language detection without `language` or `prompt`, fixed Groq model, ordered insertion, failure markers, and idea-target discard. This follow-up closes the pending-permission and tidy-abort gaps. A discarded startup remains invalid even if Quick Idea is reopened before the old permission request resolves; the new modal may start its own operation.

The spec's API and live-engine distinction was clear. For the ambiguous case of a cancelled startup whose permission request resolves after a newer startup begins, the old stream is stopped and only the newer operation may attach. The existing live-engine functions were not edited.

## Verification and remaining concerns

`git diff --check` and `node --check` on the changed JavaScript and Playwright configuration passed. I did not run or author tests because this round explicitly assigns testing to the tester. In particular, the requested close-and-reopen and two-pending-tidy regressions still need to be authored and run by the tester, along with `adversarial.spec.js` and the existing suites. Browser permission timing and fetch-abort timing have not been verified here.

Git could not start a real merge: `.git/ORIG_HEAD.lock` cannot be created because `.git` is read-only. The main changes above were reconciled in the working tree, but the branch ancestry is not merged. I ran the requested `git add -A && git commit -m "Fix dictation cancellation and reconcile task 04 with main"` once; Git could not create `.git/index.lock` for the same read-only reason. All changes, including this report, remain uncommitted. I did not retry or work around the refusal.

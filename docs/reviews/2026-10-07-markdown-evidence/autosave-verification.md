# Formatting autosave verification follow-up

The failed `fix-review.sh` invocation stopped during browser launch, before it
could verify `md-format-autosave`. Its log reports Chrome's Crashpad
`setsockopt: Operation not permitted` error followed by `SIGTRAP`. The runner
disables agent-command network access and approvals, so that invocation could
not retry outside its sandbox.

The implementation already calls `updateStatus()` and `scheduleAutosave()` from
the shared `editor.setRangeText` override. No application code changed in this
follow-up.

Running the existing test outside the sandbox exposed an incorrect immediate
draft assertion: `wbEditorChanged()` debounces draft writes by 700 ms. The test
now waits for the matching chapter draft, and lets the 1.2-second startup
restoration check settle before every action, including those after reloads.
It retains checks for immediate dirty state, persisted chapter content, pending
markers, chapter switching, and reload without typing another character.

## Verification

Commands use the installed browser:

```sh
PW_CHROME_PATH=/usr/bin/google-chrome-stable node tests/mdautosave.js
PW_CHROME_PATH=/usr/bin/google-chrome-stable node tests/mdundo.js
PW_CHROME_PATH=/usr/bin/google-chrome-stable node tests/wbsaveall.js
PW_CHROME_PATH=/usr/bin/google-chrome-stable node tests/wbresume.js
```

The autosave, undo, and pending-save suites passed in the earlier follow-up.
`wbresume.js` initially failed at its restored-page scenario with
`page.evaluate: ReferenceError: wbAll is not defined` at line 150. Its
`openRestored()` helper copies `index.html` into `tests/.restored.html` without
adjusting relative script URLs, so the Markdown modules are unavailable in that
copy. That failure kept the finding unchecked in the earlier follow-up.

The fixture now inserts a file-URL base pointing to the repository root, so
the copied page loads the same assets as `index.html`. No application code or
runner policy changed. All four commands above pass in the current session,
including the restored-text scenarios, with no page errors. The autosave suite
verifies all eight actions after startup settles, including the recovery draft,
IndexedDB content, pending marker, chapter switching, and reload.
`md-format-autosave` is now checked after source inspection, successful tests,
and diff review.

The runner's execution policy has not changed. Browser verification outside its
sandbox does not establish that future automated browser runs can launch Chrome.

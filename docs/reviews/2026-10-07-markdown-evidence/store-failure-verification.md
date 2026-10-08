# Failed chapter-store write verification

Finding: `md-failed-store-navigation` in
[`2026-10-07-markdown-review.md`](../2026-10-07-markdown-review.md).

The failed automation attempt made no changes: Chrome exited with `SIGTRAP`
after Crashpad's `setsockopt` received `Operation not permitted` inside the
runner's sandbox. System Chrome launches successfully in the interactive
workspace session.

The preserved fix keeps edits dirty until their IndexedDB write succeeds,
journals the editor before attempting the write, and makes chapter switches
honor a failed flush. Explicit saves share the same serialized write path;
typing during a write remains dirty until the newer text is saved.

## Passing checks

Run browser checks from the repository root with
`PW_CHROME_PATH=/usr/bin/google-chrome-stable node tests/<name>.js`.

- `wbstorefailure`: quota failure and real transaction abort during autosave
  and explicit save; blocked switching; journal recovery on reload; retry
  without typing; edits and switching during delayed writes.
- `wbsaveall`, `wbresume`, `mdautosave`, `wbrename`, `wbadopt`, `graph`.
- `node tests/verify.js`: JavaScript parsing, shared navigation and diacritics.
- `git diff --check`.

The new `wbstorefailure` test also ran against the unchanged baseline export.
It failed at `failed write blocks switching` (`b !== a`), confirming that the
test detects the original data-loss path and passes with the proposed fix.

## Completion blocker

The finding remains unchecked under `AGENTS.md` sections 6 and 9. Broader
regression tests fail on both the working tree and an unchanged export of
baseline commit `0ebf6d13f599429bb24aa143608a34e5ed71e756`:

- `idea.js`: one failure, `💡 button is right of New`; the Help button is
  between New and Idea. The other idea-storage assertions pass.
- `nav.js`: three failures, `and the preview too`, `on a phone the click
  shows the preview`, and `and leaves the source (and the keyboard) alone`.
  Returning to the top heading leaves preview scrolling at 734, and the
  phone remains in source view with the textarea focused.

Baseline checks used `git archive HEAD index.html js assets fonts`, extracted
under `/tmp`, and each existing test's `MD_URL` override. The same browser
and test files produced identical failures without the proposed fix.

These unrelated failures were not changed. Changes are left unstaged for
inspection; no Git history or runner control-plane files were modified.

---
description: Run the Playwright checks in tests/ with the Chrome path this machine needs
argument-hint: "[test name, e.g. recipes | graph | voice | all]"
---

`tests/` is dev-only Playwright tooling (its own `package.json`). Playwright's
own bundled browser is usually **not** the one installed here, so every run
points at whichever browser this machine does have, via `PW_CHROME_PATH` (read
by `tests/lib.js`).

First:

```bash
cd tests && ls node_modules >/dev/null 2>&1 || npm install --no-audit --no-fund
# the browser this machine has: system Chrome, or a pre-installed Chromium
# (a cloud session has one under /opt/pw-browsers, where Playwright's own
# version check may still miss it)
for c in /usr/bin/google-chrome-stable /usr/bin/google-chrome /usr/bin/chromium \
         /opt/pw-browsers/chromium-*/chrome-linux/chrome; do
  [ -x "$c" ] && export PW_CHROME_PATH="$c" && break
done
echo "$PW_CHROME_PATH"
```

Then, for `$ARGUMENTS`:

- a name (`recipes`, `mealplan`, `graph`, `find`, `nav`, `wbrename`, `voice`,
  `transfer`, `infinite`, `flow`, `gestures`, `undoredo`, …):
  ```bash
  cd tests && timeout 900 node <name>.js        # with PW_CHROME_PATH exported above
  ```
- `all` or empty — the whole suite:
  ```bash
  cd tests && timeout 900 npm test              # with PW_CHROME_PATH exported above
  ```

Notes:
- Anything driving `getDisplayMedia` (screenshot/record in `editor.html`) needs a
  **headed** browser under Xvfb — headless Chromium can't decode media streams.
- Canvas assertions use `getImageData` pixel checks, not screenshots.
- Report pass/fail plainly, including the failing output.

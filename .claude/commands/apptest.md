---
description: Run the Playwright checks in tests/ with the Chrome path this machine needs
argument-hint: "[test name, e.g. recipes | graph | voice | all]"
---

`tests/` is dev-only Playwright tooling (its own `package.json`). This machine
has **no `chromium`** — Playwright's bundled browser isn't installed — so every
run must point at the system Chrome via `PW_CHROME_PATH` (read by `tests/lib.js`).

First: `cd tests && ls node_modules >/dev/null 2>&1 || npm install --no-audit --no-fund`

Then, for `$ARGUMENTS`:

- a name (`recipes`, `mealplan`, `graph`, `find`, `nav`, `wbrename`, `voice`,
  `infinite`, `flow`, `gestures`, `undoredo`, …):
  ```bash
  cd tests && PW_CHROME_PATH=/usr/bin/google-chrome-stable timeout 900 node <name>.js
  ```
- `all` or empty — the whole suite:
  ```bash
  cd tests && PW_CHROME_PATH=/usr/bin/google-chrome-stable timeout 900 npm test
  ```

Notes:
- Anything driving `getDisplayMedia` (screenshot/record in `editor.html`) needs a
  **headed** browser under Xvfb — headless Chromium can't decode media streams.
- Canvas assertions use `getImageData` pixel checks, not screenshots.
- Report pass/fail plainly, including the failing output.

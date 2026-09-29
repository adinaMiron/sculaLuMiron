## lead

- `tests/gdsync.js` (~line 293) hard-codes the ☁ button's position (`header .header-actions #btn-wb-cloud`); any move of the save/sync buttons must update that selector or gdsync fails.
- `docs/MAP.md` has no line anchors for `index.html` markup/CSS (only a js/markdown feature table) — grep `index.html` directly; nothing to fix in MAP for header/toolbar moves.
- Prior task suites live as plain node Playwright scripts in `tests/<task-slug>/*.js` (see `tests/03-for-index-html-page-in-idee/`), run with the shared `tests/package.json`/`node_modules`.
- Attempt 2: the orchestrator's "start again" reset reverted `index.html` and `docs/FEATURES.md` but NOT `tests/gdsync.js`, which already asserts `#wb-save-sync-row #btn-wb-cloud` — so on this branch gdsync fails until the row exists with that id.
- Attempt 1 died on the implementer's 30-turn cap (see `docs/orchestrator-retro.md`), not on bad code; the spec now carries paste-ready edits and a ≤15-call budget. Why an attempt failed is in `.orchestrator-logs/launcher.log` and `docs/orchestrator-retro.md`.

## implementer

- Paste-ready specs work as intended: with exact before/after blocks given, all 5 index.html edits + 2 FEATURES.md edits + verify + gdsync fit in well under 15 tool calls.
- `node gdsync.js` must be run from inside `tests/` (not repo root) — `cd tests && node gdsync.js`.

## lead

- `tests/gdsync.js` (~line 293) hard-codes the ☁ button's position (`header .header-actions #btn-wb-cloud`); any move of the save/sync buttons must update that selector or gdsync fails.
- `docs/MAP.md` has no line anchors for `index.html` markup/CSS (only a js/markdown feature table) — grep `index.html` directly; nothing to fix in MAP for header/toolbar moves.
- Prior task suites live as plain node Playwright scripts in `tests/<task-slug>/*.js` (see `tests/03-for-index-html-page-in-idee/`), run with the shared `tests/package.json`/`node_modules`.

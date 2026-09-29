## lead

- `docs/tasks/` already has an unrelated `03-for-index-html-page-in-idee` (and `tests/03-for-index-html-page-in-idee/`); task numbers are not unique — always use the full slug directory.
- `#btn-kanban`/`#btn-gantt` are referenced only by id (`tests/gantt.js`), never by header ancestry; `tests/idea.js` does check the order of `.header-actions .btn`, so rerun it after any header edit (it already fails on HEAD — CLAUDE.md known issue 3).
- There is no playwright.config in `tests/`; suites are plain `node file.js` scripts listed in `tests/package.json`'s `test` loop.

## implementer

- Spec was precise on structure and placement; grep for anchor ids then read narrow ranges worked cleanly
- Added 3 lines to toolbar while removing 2 from header (net +1 line), but changes localized; MAP.md anchors stayed valid
- Verification passed immediately; no iteration needed on the layout change

## tester

- `index.html`'s default UI language is Romanian, not English — a fresh page (empty `localStorage`) loads with `document.documentElement.lang === "ro"` and RO tooltips already applied; toggle with `#navLangBtn` (not by dispatching `scula-ui-lang` directly) to exercise the real nav flow, and assert RO first, then EN.
- `#toolbar-groups`'s collapse is CSS-transitioned (`0.2s`); `waitForTimeout(150)` after clicking `#btn-toolbar-toggle` is flaky — computed `max-height`/`opacity` can still be mid-transition. Wait ~400ms before asserting the collapsed values.
- Clicking a toolbar button that opens a modal (e.g. `#btn-gantt` → `#gantt-modal`) covers the button afterward, so a second real `page.click()` on it times out ("element intercepts pointer events"). To test repeated/rapid activation, call the handler directly via `page.evaluate(() => openGantt())` instead of repeated `page.click()`.

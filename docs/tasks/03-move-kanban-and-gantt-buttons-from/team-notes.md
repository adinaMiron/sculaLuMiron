## lead

- `docs/tasks/` already has an unrelated `03-for-index-html-page-in-idee` (and `tests/03-for-index-html-page-in-idee/`); task numbers are not unique — always use the full slug directory.
- `#btn-kanban`/`#btn-gantt` are referenced only by id (`tests/gantt.js`), never by header ancestry; `tests/idea.js` does check the order of `.header-actions .btn`, so rerun it after any header edit (it already fails on HEAD — CLAUDE.md known issue 3).
- There is no playwright.config in `tests/`; suites are plain `node file.js` scripts listed in `tests/package.json`'s `test` loop.

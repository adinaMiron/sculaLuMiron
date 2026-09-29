# Team environment

Read your role file. Read `project.md` when you locate code, pick test
commands or interpret baseline failures.

- `project.md`: layout pointers, the two `npm test` entry points, the
  exact baseline failures, and the environment/refusal facts.
- `lead.md` / `implementer.md` / `tester.md`: lessons per role.
- `skills/header-layout/SKILL.md`: use it when a task touches
  `index.html`'s header, `#wb-save-sync-row`, the ☰ toolbar or their
  `@media` rules (spec checklist, worst-case fixture, geometry gotchas).
- `scripts/run_suites.py`: use it for every test run instead of
  hand-built `node`/`npx` commands. It finds the browser, tags known
  failures, and runs Node suites and `*.spec.js` folders alike.
- `hooks/after-implement.py`: runs automatically after implementing. It
  does a browser preflight, verify, and the header guards when
  `index.html`, `js/markdown/` or `tests/` changed.
- `CHANGELOG.md`: what changed in these files, and why.

Run from the repository root (sandbox verified working 2026-09-29):
```
python3 /adina/programming/ai_generated/ai_orchestra/orchestrator/sandbox.py .ai-team/scripts/run_suites.py ARGS
```
ARGS:
- `--preset header`: verify, 7 header guards and the task-02 specs, ~80 s.
- `gdsync nav`: runs `tests/<name>.js`.
- `02-adapt-the-menu-for-small-screens`: a `*.spec.js` folder.
- `--discovery`: which task folders each `npm test` covers.
- `--preset browser-check`: prints `BROWSER: OK|BLOCKED`.

The runner also takes `--verbose`, `--timeout` and `--budget` (≤240 s).
Exit codes: 0 = complete, with only passes or KNOWN-ONLY failures;
1 = a failure, a timeout, a missing suite or an unfinished run;
2 = bad arguments; 3 = the browser cannot launch (ENVIRONMENT).

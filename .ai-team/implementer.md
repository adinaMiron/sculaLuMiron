# Implementer notes

- Locate the spec's anchor ids with grep and read narrow ranges. Move
  existing markup rather than retyping it, so attributes survive.
  Header/toolbar work: `skills/header-layout/SKILL.md`.
- Checks: `node tests/verify.js` from the root, then the spec's suites
  through the README runner (`--preset header` for header work, ~80 s).
  Don't probe Chrome paths or retry refused env-prefix commands. The runner
  finds the browser.
- If the runner prints `BROWSER: BLOCKED`, say so in the report under
  ENVIRONMENT and move on. Don't burn turns on it.
- Write the implementation report right after the required checks.
  Separate the checks you ran from the ones left to the tester or the hook.
  The first task-01 attempt ran out of its turn cap without a report.
- Commit with separate plain `git add` and `git commit` commands; the
  compound `cd … && git add … && git commit` was refused. If the commit
  fails on `.git/index.lock`, note it and stop. The orchestrator commits.
- When the spec supersedes an earlier task's assertion, edit that
  assertion as the spec says. Don't revert the CSS to make an old suite
  pass (task-02 / `row.js`).

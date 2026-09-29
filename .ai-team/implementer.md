# Implementer notes

- For these markup moves, locate spec anchor ids and read narrow ranges.
  Preserve original button attributes by moving existing markup. Task-01's
  exact edit blocks eliminated implementation rework on the second attempt.
- Check breakpoint overrides when moving `.btn` elements: save-row buttons
  need their more specific nonshrinking rule even below 700 px.
- Run `node tests/verify.js` from the root, then the spec's targeted suite
  through the README runner. Do not spend turns probing Chrome paths or
  retrying refused environment-prefix commands.
- Write the implementation report immediately after required checks;
  distinguish checks you ran from checks delegated to the tester/hook.
  The first task-01 attempt exhausted its cap without completing the step.
- When a commit is required, use separate plain staging and commit commands;
  the run refused compound `cd … && git add … && git commit …` attempts.

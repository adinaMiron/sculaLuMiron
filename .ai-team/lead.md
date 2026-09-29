# Lead notes

- On a retry, start with `git diff main --stat` (or the supplied base).
  The task-01 reset restored product files but left `tests/gdsync.js` changed.
  Name surviving changes in the spec; do not prescribe duplicate edits.
- For localized markup/CSS moves, give current anchor selectors, exact
  before/after blocks, attribute preservation requirements and affected media
  queries. Task-01's second attempt completed with no deviations this way.
- Use a soft tool-call budget and require the implementation report before
  optional checks. The ≤15-call target helped but was exceeded; do not promise
  it guarantees completion under a 30-turn cap.
- A literal two-button move succeeded with fast/low; the multi-breakpoint
  save-row task failed at standard/low and succeeded at standard/medium
  with a stronger spec and higher cap. Choose based on remaining reasoning,
  not merely file count. CSS investigation needs more than copy-edit effort.
- For responsive work, specify both sides of changed breakpoints, long
  workbook names and RO/EN labels. Task-02 passed its target band but failed
  at 1601 and 1920 px. Reassess old findings after overlapping tasks merge.
- Review actual suite discovery and the appropriate `npm test` command.
  Both passed layout reviews overlooked that the new Node suites were absent
  from `tests/package.json`. Hook coverage is additional coverage.
- Historical failure names help triage; they cannot waive failures in behavior
  the current task changes. Read the observed output before accepting a baseline.

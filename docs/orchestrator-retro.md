# Orchestrator retrospective — run of 2026-09-29 (with the resume)

Task source: `ai_orchestra/tasks/example-tasks.md`. It had 3 tasks, all on
`index.html`'s header and toolbar. Engine: claude throughout. The run had
two passes:

- **First pass** (calls 1–10, ≈ $6.4 + $0.65 retro): task-03 passed. Task-01
  and task-02 each hit a turn cap and went to manual review.
- **Resume** (calls 12–15, ≈ $2.51): the owner asked for another attempt at
  task-01 only. The orchestrator undid the first attempt's code, merged
  `main` in, and ran the full lead → implementer → tester → review loop. It
  passed first time and was merged. Task-02 was skipped because it was
  already finished as `manual_review`.

| Task | Branch | Outcome | Cost |
|---|---|---|---|
| 01 — Save/Sync buttons onto a new line | merged to `main` (`0dac8f7`) | **Passed** on the second attempt, review round 1 | $1.16 (attempt 1, wasted) + $2.51 (attempt 2) |
| 02 — Header overflow on laptop widths | `task/02-adapt-the-menu-for-small-screens` (not merged) | **Manual review.** The tester hit `max_turns` (81/80) after finding a real bug | $3.54 |
| 03 — Kanban/Gantt into the ☰ toolbar | merged to `main` (`8b9106c`) | **Passed**, review round 1 | $1.71 |

## 1. For the maintainer (skim this)

### Merged
- **task-01** (attempt 2): `📓 Save to workbook`, `#btn-wb-sync`,
  `#btn-wb-cloud`, `#wb-cloud-where` and `#btn-save-all-modified` moved out
  of `header .header-actions` into `#wb-save-sync-row`. That row is a
  direct child of `<body>` between `</header>` and `<div class="toolbar">`,
  so the ☰ collapse never hides it.
  - One base CSS rule covers every width: flex, `nowrap`, `overflow-x:auto`,
    and theme tokens only. The four `@media` blocks now change only padding.
  - Ids, handlers, `data-i` keys and titles are byte-identical to before.
  - `docs/FEATURES.md` § E and § O were updated, and so was the placement
    selector in `tests/gdsync.js`.
  - New suite: `tests/01-move-salveaza-and-sincronizeaza-buttons-like/row.js`,
    23 checks from 1920 px down to 360 px plus a landscape phone, in RO and
    EN. It passes.
  - `verify`, `gdsync` (64 checks), `wbsaveall`, `wbadopt` and `gantt` pass.
    `idea` and `nav` show only their known failures.
- **task-03**: `#btn-kanban` and `#btn-gantt` moved into `#toolbar-groups`
  after `.toolbar-filters`. Suite:
  `tests/03-move-kanban-and-gantt-buttons-from/buttons.js`. See the git
  log at `8b9106c`.

### Needs manual review: task-02 (still open, and now stale)
The branch was cut from `main` before task-01 or task-03 landed. It
rewrites the same header CSS and the same four `@media` blocks that
task-01 has since replaced, so **it will conflict, and much of its purpose
is gone**: the five save/sync controls no longer sit in the header.

What its tester found before the cap (it is in the stream log only, not in
any report):
- At **1601 px and 1920 px with a long `.wb-crumb`**, header controls
  overflowed the viewport: 18 failures. `.wb-crumb` has no `max-width`
  above 1600 px.
- The 1025–1600 px band the task targeted passed.

**Recommendation:** don't merge `task/02-adapt-the-menu-for-small-screens`.
Delete it, re-run task-02 as a new task on the current `main`, and have the
lead first measure whether the header still overflows at 1024–1920 px with
a long crumb in both languages. The task may now reduce to a
`.wb-crumb { max-width }` rule. The branch may also hold a stray
`tests/02-adapt-the-menu-for-small-screens/_scratch.js`.

### Housekeeping for a human
- **Stale branches** (local and `origin`): `task/02-adapt-the-menu-for-small-screens`,
  `task/01-for-index-html-page-please-add`, `task/02-for-index-html-page-dicteaza-menu`,
  `task/03-for-index-html-page-in-idee` and `task/04-for-index-html-page-in-idee`.
  The agents can't delete branches.
- **Per-task suites are not in `npm test`.** None of the
  `tests/0N-<slug>/*.js` suites appear in `tests/package.json`'s loop. The
  loop runs `node $f.js` from `tests/`, so entries such as
  `01-move-salveaza-and-sincronizeaza-buttons-like/row` and
  `03-move-kanban-and-gantt-buttons-from/buttons` would work as they are.
- **Stale anchors.** `docs/MAP.md:26` and CLAUDE.md Rule 2 give the
  `index.html` nav line as ~1907 / ~2052. It is now ~2270.
- **An undocumented known failure.** `nav.js` has a third failure, "and the
  preview too" (`pvTop` 707–726, a smooth scroll read mid-flight). It fails
  on `main` too, but CLAUDE.md "Known issues" #1 still lists only two.
- **`.ai-team/project.md` § "Open state" is now wrong**: it says task-01 is
  unmerged. Update it in the improve step.

## 2. What a new teammate should know about this codebase

Most of this is already in `.ai-team/project.md`, written after the first
pass and confirmed by the resume. Read that first. What the resume added
or confirmed:

- **Paste-ready specs make cheap implementers succeed.** Attempt 2's spec
  gave exact before/after text for all 5 `index.html` edits and 2
  `docs/FEATURES.md` edits. The Sonnet implementer followed it verbatim, with
  no deviation, in 111 s for $0.44. The same task with a looser spec died at
  the turn cap in attempt 1. For markup/CSS moves in `index.html`, this is
  the pattern to keep.
- **Header/toolbar layout, as of now.** The layout from top to bottom is:
  - `<header>` with `.header-actions`, which ends with the Export HTML
    button;
  - `#wb-save-sync-row`, the save/sync controls, which scroll sideways and
    never wrap;
  - `.toolbar`, holding `#toolbar-groups`, which the ☰ button collapses
    and which contains `.toolbar-filters`, then `#btn-kanban` and
    `#btn-gantt`.

  Any new header task should start from that picture, not from the old
  specs under `docs/tasks/`.
- **`.wb-save-sync-row .btn` has specificity 0,2,0 on purpose.** It must
  beat the phone rule `.btn { flex: 1 1 auto; min-width: 0 }`. If you add
  buttons to that row, give them the same treatment.
- **`#wb-cloud-where` can be zero-width** when Drive is disconnected. For
  geometry assertions, compare centre-Y, and allow its left edge to equal
  the previous element's.
- **"Start again" resets only some files.** On attempt 2 it reverted
  `index.html` and `docs/FEATURES.md` but not `tests/gdsync.js`, so `gdsync`
  failed on the reset branch until the row existed again. The lead caught
  this by reading the diff against `main`. A lead planning a retry should
  always run `git diff main --stat` first.
- **Run node suites from `tests/`.** `cd tests && node gdsync.js` works
  (both implementer and reviewer did this on attempt 2). `node tests/verify.js`
  runs from the repo root. The heredoc `git commit -m "$(cat <<'EOF' …)"`
  worked when it was the only command, and was refused when prefixed with
  `cd … &&`.
- **The after-implement hook paid off.** `.ai-team/hooks/after-implement.py`
  ran `verify, idea, nav, gdsync, gantt` in 36.5 s and tagged every failure
  KNOWN. The tester then spent no turns on "was this failure already here?",
  which was the $0.9 sink on task-02. Tester cost fell from $2.32 (task-02)
  and $0.71 (task-03) to $0.56 (task-01, attempt 2).

## 3. Suggestions for `.ai-team/` (with evidence from this run)

Suggestions already carried out after the first pass: the baseline/KNOWN
tagging (`run_suites.py`), the after-implement hook, and the refused-command
list in `project.md`. The resume showed they work. What remains:

1. **Refresh `project.md` "Open state" and the header picture.**
   *Evidence:* that section still says task-01 is unmerged, and the header
   notes describe the pre-task-01 layout (the save/sync trio inside
   `.header-actions`). Replace them with the three-row layout from §2 above,
   the 0,2,0 specificity note, and the `#wb-cloud-where` zero-width note.
   Add the third `nav.js` known failure there too, since CLAUDE.md doesn't
   list it.

2. **Add the new suites to the hook.** In `after-implement.py`'s
   `SUITES_FOR`, map `index.html` and `js/markdown/` to also run
   `01-move-salveaza-and-sincronizeaza-buttons-like/row` and
   `03-move-kanban-and-gantt-buttons-from/buttons`, if `run_suites.py`
   accepts slug paths; if it doesn't, make it. Also add `wbsaveall`, which
   the task-01 tester ran by hand. *Evidence:* these are the regression
   guards for the two layouts that just landed, and the next header task is
   exactly the kind of change that could break them. Check the 240 s budget:
   the current set ran in 36.5 s, so there is room.

3. **Playbook for the lead on a retry: diff the branch against `main`
   before writing the spec.** *Evidence:* the orchestrator's reset left
   `tests/gdsync.js` changed on the branch. The lead found this only by
   inspection and had to write around it in the spec. The playbook line:
   "On a restarted task, run `git diff main --stat` first. Any file still
   changed is either in scope or must be named in the spec."

4. **Playbook for the lead: give paste-ready before/after blocks for
   markup/CSS moves, and state a tool-call budget.** *Evidence:* attempt 1
   (loose spec, low effort) ran out of turns at 31/30. Attempt 2
   (paste-ready spec, "≤15 calls, report before optional checks") finished
   in 28 turns, well inside the 45 cap, with zero deviations. The 15-call
   budget was still exceeded: about 25 tool calls, including 2 duplicate
   Greps and 2 commit attempts. So the budget is a useful nudge, not a
   guarantee. Keep the implementer cap at 45 or more.

5. **Implementer playbook: commit as a single plain command, never with a
   `cd … &&` prefix.** *Evidence:* call 13 lost a turn to a refused
   `cd /…/sculaLuMiron && git add -A && git commit …`, then succeeded with
   the same command minus the `cd`. `project.md` currently says heredoc
   commits are refused, which is wrong: it's the `cd &&` prefix that gets
   refused. Correct that line.

6. **Orchestrator: stale-branch awareness for overlapping tasks.** This
   carries over from the first retro and still stands. *Evidence:* task-02's
   branch is now obsolete because task-01 changed the same selectors.
   Nothing in the pipeline flags this. At minimum, the summary for a
   `manual_review` task should note when a later-merged task touched the
   same files (`git diff --name-only` intersection), so the maintainer
   knows to re-run rather than rescue.

7. **Tester writes a provisional `test-report.json` after its first full
   suite run.** This also carries over. *Evidence:* the task-02 finding
   (18 failures above 1600 px) still exists only in a stream log, and I had
   to carry it forward by hand in this retro. Attempt 2's tester finished in
   29 turns, so nothing contradicts the need. Keep it in the tester
   playbook.

Not recommended, for lack of evidence: a shared `assertInViewport` helper
in `tests/lib.js`. The task-01 suite wrote its geometry checks cheaply
($0.56 all in), so the duplication hasn't cost anything measurable yet.

# index.html adversarial implementation review

Date: 2026-10-08  
Module: Markdown workspace (`index.html`, `js/markdown/`)  
Reviewed branch/commit: `main` / `ae3d2ba`  
Scope: requirements, preservation, calculations, normal/edge workflows, responsive UI, contrast and keyboard/touch use.

## Verdict

The workspace has substantial working functionality, but it is **not ready to
be called reliable against the requested criteria**. There are reproducible
paths that discard unsaved text, paste into the wrong chapter, and overwrite a
newer folder copy with stale data. Table editing, Gantt date handling and mobile
Gantt usability also need correction.

This review adds tests and documentation only. Product code and the completed
checkboxes in earlier reviews are unchanged. Every actionable finding below
remains unchecked: **25 findings — 3 P1, 21 P2 and 1 P3**, including three
findings about existing verification. P1 means high-priority preservation risk; P2 means a
functional, calculation, accessibility or verification defect; P3 means polish
or localization. Findings identify observed behavior, not assumed fixes.

## Requirements and evidence

Sources were read in repository order: `AGENTS.md`, relevant task specifications,
the [previous Markdown review](2026-10-07-markdown-review.md) and
[combined-filter review](2026-10-08-markdown-filter-review.md), then architecture,
source and tests.

| Contract | Verification |
|---|---|
| [Diagram/sketch specification](../tasks/01-for-index-html-page-please-add/spec.md): ports, pinned connectors, free mind maps, sequences, sketch history, SVG/PNG exports | Existing Playwright model, modal, phone, sketch and exclusivity tests; `tests/diagram.js` |
| [Dictation language](../tasks/01-for-index-html-page-in-idee/spec.md) and [stop labels](../tasks/02-for-index-html-page-dicteaza-menu/spec.md) | Request/body and transcript fixtures, overlap/length boundaries, provider errors, both languages and recording engines; microphone/services mocked |
| [Quick-idea chapter routing](../tasks/03-for-index-html-page-in-idee/spec.md) | Picker routing, ambiguity, explicit choice versus soft default, double submission, save races |
| [Small-screen header](../tasks/02-adapt-the-menu-for-small-screens/spec.md), [save strip](../tasks/01-move-salveaza-and-sincronizeaza-buttons-like/spec.md), [Kanban/Gantt placement](../tasks/03-move-kanban-and-gantt-buttons-from/spec.md) | Existing layout/interaction suites, desktop breakpoints and long labels, phone/tablet/landscape, new screenshots |
| [FEATURES](../FEATURES.md) §§ C, E, H, J, K, L, N, O, R, T, U and chapter Gantt section | Editing, preservation, filtering, import/export, date/unit calculations, metadata, Drive fault fixtures, diagrams and history |
| [Theme](../THEME.md) small-text contrast ≥ 4.5:1; FEATURES definition-of-done 44px touch targets; [user guide](../../README.md#markdown-editor-indexhtml) | Computed browser colors/geometry, real keyboard actions and coarse-pointer context |

The new reproducible suite is [tests/index-review](../../tests/index-review/README.md).
It uses real Chromium rendering and IndexedDB, isolated browser contexts,
controlled storage failures, a local folder adapter and deterministic delayed
image decoding. HTTP(S) requests are blocked in the new suite. No user files,
real Drive account or production service were changed.

## Findings — preservation and data flow

- [x] [ID:idx-new-failed-flush] **P1 — “New” clears the editor and recovery journal before its save succeeds.**

  **Location:** [files.js](../../js/markdown/files.js), `newFile()`, lines 2–9; `flushChapter()` in workbooks.js.  
  **Reproduce:** Open chapter A, type `UNSAVED IMPORTANT TEXT`, reject its IndexedDB write with `QuotaExceededError`, then click New. The editor becomes empty, `wbCurrentId` becomes `null`, and `wbDraftRead().text` becomes empty. The durable chapter still contains its old text. `newFile()` calls the async flush without awaiting/checking it and immediately resets history and detaches.  
  **Required outcome:** Keep the chapter, dirty state, undo history and recovery text until the flush succeeds; only then replace the editor. Cover an already-running flush as well as immediate failure.  
  **Test:** `preservation.spec.js` — `P1 new-file failure retains the chapter and recovery journal`; the normal successful-New case passes separately.

- [x] [ID:idx-paste-destination] **P1 — Delayed image paste overwrites the selection offsets in whichever chapter is now open.**

  **Location:** [editor.js](../../js/markdown/editor.js), `handleEditorPaste()`, lines 673–698.  
  **Reproduce:** Select characters 0–8 of chapter A, paste an image, pause decoding, open B containing `ORIGINAL b`, then finish decoding. B becomes `![picture](data:…) b`: its first eight characters are replaced and the changed B is scheduled for autosave. Only offsets are captured before the await; chapter/destination identity is not.  
  **Required outcome:** Fence the paste against destination and text/selection changes. A stale completion must preserve both chapters and give the user a safe retry/recovery path.  
  **Test:** `preservation.spec.js` — `P1 delayed image paste must not replace text in a different chapter`.

- [x] [ID:idx-stale-folder-mirror] **P1 — Folder synchronization writes cached chapter text without checking the durable revision.**

  **Location:** [workbooks.js](../../js/markdown/workbooks.js), `wbSaveMirror()` and `syncAllToFolder()`, lines 548–565 and 1335–1380.  
  **Reproduce:** Keep this tab's B at `ORIGINAL b`; commit `NEWER OTHER TAB` to B through another IndexedDB transaction and its mirror; synchronize from the stale tab while A is active. The folder's B becomes `ORIGINAL b` again while IndexedDB still has the newer text. Flushing only the active chapter does not validate other cached chapters.  
  **Required outcome:** Validate/reload the authoritative revision before mirroring each chapter, including Save all modified, and protect against another write during the operation. Preserve newer mirror content and correct pending markers.  
  **Test:** `preservation.spec.js` — `P1 folder sync cannot mirror a stale other-tab revision`.

- [x] [ID:idx-pending-write-failure] **P2 — A failed pending-marker write is silently forgotten after reload.**

  **Location:** [workbooks.js](../../js/markdown/workbooks.js), `wbPendingMark()` at lines 335–339 and `flushChapter()`.  
  **Reproduce:** Allow the chapter text write but reject writes to `WB_PENDING`; edit and flush, then reload. The changed text survives, but `wbPendingIds` is empty. Save all modified can therefore skip the stale folder copy. The empty catch hides the loss of synchronization metadata.  
  **Required outcome:** Persist chapter text and its pending state consistently, or retain a durable retry/recovery indication and report failure. A reload must not present a changed chapter as already mirrored.  
  **Test:** `preservation.spec.js` — `P2 pending-marker failure remains visible and survives reload`. This is a mirror-tracking defect; the test does not claim IndexedDB lost the text.

- [x] [ID:idx-rename-store-rollback] **P2 — Failed rename leaves an uncommitted path in memory and subsequent sync creates an extra file.**

  **Location:** [workbooks.js](../../js/markdown/workbooks.js), `renameWorkbook()` and `renameChapter()`, lines 1047–1068 and 1147–1165.  
  **Reproduce:** Reject the chapter rename write, rename A to Renamed, restore storage, and sync. Memory points to `Renamed.md`; IndexedDB still points to `a.md`; both files now exist in the mirror. The workbook variant likewise mutates the live object before persistence succeeds.  
  **Required outcome:** Commit staged metadata only after storage accepts it, or roll it back on failure; rendering, draft names and folder writes must agree with durable ownership.  
  **Test:** `preservation.spec.js` — `P2 failed rename cannot redirect a subsequent save into a new uncommitted filename`; workbook path is additionally inspected in source.

- [x] [ID:idx-delete-store-failure] **P2 — Failed local deletion still removes the mirror, hides the chapter and creates a cloud tombstone.**

  **Location:** [workbooks.js](../../js/markdown/workbooks.js), `deleteWorkbook()` and `deleteChapter()`, lines 1070–1092 and 1167–1192.  
  **Reproduce:** Reject the chapter-store delete and confirm deleting B. B remains in IndexedDB, disappears from the current tree, and its mirror is removed. The code catches the failure and continues through tombstoning and the success message. Workbook deletion can similarly proceed after only some child operations succeed.  
  **Required outcome:** Stop/report a failed durable deletion before deleting other copies or publishing tombstones; keep the UI consistent and make retries safe.  
  **Test:** `preservation.spec.js` — `P2 failed delete leaves both the mirror and local record intact`; external propagation is a source-traced risk, not a live-cloud experiment.

- [x] [ID:idx-table-resize-loss] **P2 — Changing table dimensions erases all text already entered in the builder.**

  **Location:** [files.js](../../js/markdown/files.js), `rebuildTableGrid()`, lines 309–367.  
  **Reproduce:** Fill a header and first cell, then change Rows to 4. Both values become empty. Rebuilding constructs blank inputs and replaces the entire grid on each input event. A routine “add one more row” loses the table draft before it ever reaches editor undo/autosave.  
  **Required outcome:** Preserve overlapping cells, headers and alignments while resizing; prevent accidental loss when shrinking/re-expanding or temporarily clearing a numeric field.  
  **Test:** `preservation.spec.js` — `table builder preserves filled cells when increasing dimensions`.

- [ ] [ID:idx-table-cell-delimiters] **P2 — Literal pipes entered into a table cell become extra columns.**

  **Location:** [files.js](../../js/markdown/files.js), `insertTable()`, lines 369–398, and Markdown table parsing.  
  **Reproduce:** Enter `left | right` in one cell and Insert. The first rendered cell says only `left`; `right` becomes another cell and shifts subsequent columns. The builder joins unescaped values with the same delimiter it accepts as content.  
  **Required outcome:** Round-trip literal cell content through generated Markdown, preview and export without changing column boundaries.  
  **Test:** `preservation.spec.js` — `table builder round-trips literal pipes within a cell`.

## Findings — computations and boundary behavior

- [ ] [ID:idx-gantt-local-today] **P2 — Undated Gantt tasks use UTC “today” instead of the user's local date.**

  **Location:** [gantt.js](../../js/markdown/gantt.js), `paintGantt()`, line 85.  
  **Reproduce:** At `2026-10-08T21:30:00Z` in Europe/Bucharest, the local date is October 9. An undated task is drawn at October 8, one 38px column before an explicitly dated October 9 task. `toISOString().slice(0,10)` causes the discrepancy.  
  **Required outcome:** Derive today's civil date locally while retaining timezone-independent day-distance calculations. Verify both sides of midnight and positive/negative offsets.  
  **Test:** `computations.spec.js` — `Gantt today uses the local day around midnight`.

- [ ] [ID:idx-gantt-invalid-ranges] **P2 — Invalid and reversed Gantt dates silently become plausible bars.**

  **Location:** [gantt.js](../../js/markdown/gantt.js), `ganttDay()` and `paintGantt()`, lines 13–21 and 86–94.  
  **Reproduce:** `start@2026-02-30` is treated like no date and placed today; `start@2026-10-10 end@2026-10-01` is shortened to October 10. The notice is empty and the metadata still shows the supplied dates. The validator itself correctly rejects impossible dates, but rendering hides that rejection.  
  **Required outcome:** Distinguish absent dates from invalid dates and surface invalid/reversed ranges without presenting an invented valid schedule.  
  **Test:** `computations.spec.js` — `Gantt reports invalid and reversed ranges instead of inventing valid bars`.

- [ ] [ID:idx-gantt-fence-length] **P2 — A short fence inside a longer code block exposes example tasks to Gantt.**

  **Location:** [gantt.js](../../js/markdown/gantt.js), `ganttParse()`, lines 28–32.  
  **Reproduce:** Wrap a three-backtick example containing `- [ ] Example, not a task` inside a four-backtick fence, followed by a real task. Gantt returns both tasks; it tracks only fence character, not delimiter length.  
  **Required outcome:** Respect the enclosing fence's character/length and valid closing syntax, so examples do not affect task counts, dependencies or dates.  
  **Test:** `computations.spec.js` — `Gantt excludes tasks inside a longer enclosing code fence`.

- [ ] [ID:idx-gantt-range-growth] **P2 — A wide date range creates an unbounded day-by-day DOM and stalls the UI.**

  **Location:** [gantt.js](../../js/markdown/gantt.js), `paintGantt()`, lines 96–108.  
  **Reproduce:** One task from `1900-01-01` to `2100-01-01` creates 73,052 day elements and a 511,364px chart. The initial measured synchronous paint took about four seconds on this runner. The minimum 7px step bounds neither day count nor work; larger accepted four-digit year ranges grow further.  
  **Required outcome:** Bound rendering work, using an appropriate coarser scale, virtualization or an explicit supported-range limit; retain a responsive close/edit path.  
  **Test:** `computations.spec.js` — `Gantt large ranges use bounded ticks instead of one element per day`; the 1,000-tick assertion is an explicit test budget, not a pre-existing product limit.

- [ ] [ID:idx-garden-date-validation] **P2 — Garden accepts dates that the shared calendar correctly rejects.**

  **Location:** [garden.js](../../js/markdown/garden.js), `GD_DATE_RE` and `gdScan()`, lines 92–94 and 209–219.  
  **Reproduce:** `@2026-02-29` followed by `udat sm 10 l apa` creates a garden row dated February 29, even though `ScuLaCal.findMarks()` returns no marker. April 31 and month 13 have the same mismatch. Garden normalizes by string manipulation instead of the shared calendar parser required by FEATURES § N.  
  **Required outcome:** Use the calendar's validated marker semantics and do not assign records to nonexistent dates. Verify leap/non-leap years, month lengths and invalid headers following valid ones.  
  **Test:** `computations.spec.js` — `garden respects leap-day validity in its calendar markers`.

- [ ] [ID:idx-garden-code-examples] **P2 — Garden totals include activity examples inside fenced code.**

  **Location:** [garden.js](../../js/markdown/garden.js), `gdScan()`, lines 209–269.  
  **Reproduce:** Under one date, put `udat sm 100 l apa` inside a code fence and a real `udat sm 5 l apa` outside it. Garden totals 105 litres instead of 5. There is no code-fence state, so an instructional snippet can contaminate activity/harvest totals and CSV output.  
  **Required outcome:** Exclude fenced example content, including date markers inside it, from the interpreted log.  
  **Test:** `computations.spec.js` — `garden ignores examples inside fenced code`.

- [ ] [ID:idx-garden-negative-values] **P2 — A negative harvest quantity is silently counted as positive.**

  **Location:** [garden.js](../../js/markdown/garden.js), quantity patterns, `gdItems()` and `gdParseHarvest()`, lines 85–89 and 151–196.  
  **Reproduce:** `cules din sm: -2 kg rosii` contributes positive 2,000 grams. The quantity regex starts at the digit and discards the sign. Related litres/rounds patterns also lack a signed-number boundary.  
  **Required outcome:** Reject unsupported signed quantities clearly or interpret them consistently; never turn a negative value into positive consumption/harvest. Adding correction-entry functionality is not required by this finding.  
  **Test:** `computations.spec.js` — `garden does not reinterpret a negative quantity as positive harvest`.

- [ ] [ID:idx-timeline-invalid-dates] **P2 — Timeline assigns positions to impossible dates by clamping month/day values.**

  **Location:** [markdown.js](../../js/markdown/markdown.js), `tlDateValue()`, lines 570–585.  
  **Reproduce:** `2026-02-30`, `2026-13-01` and `2026-00-00` all produce numeric positions. Month 13 becomes December; month/day zero becomes January 1. The displayed label remains the original invalid date, so the visible label and calculated position disagree.  
  **Required outcome:** Validate complete civil dates while preserving the documented year-only/month-only forms; leave invalid input recognizable instead of plotting a fabricated date.  
  **Test:** `computations.spec.js` — `timeline rejects nonexistent dates instead of silently clamping them`.

## Findings — UI, accessibility and workflow

- [ ] [ID:idx-gantt-phone-chart] **P2 — The sticky Gantt labels leave almost no chart visible on a small phone.**

  **Location:** [index.html](../../index.html), `.gantt-labels` / `.gantt-body`, lines 635–642.  
  **Reproduce:** At 320×640, the body is 294px wide, labels occupy about 267.5px, and only 26.5px remains for dates and bars. The labels stay pinned while horizontal scrolling, so scrolling does not provide a useful overview. See [Gantt screenshot](2026-10-08-index-evidence/gantt-320.png).  
  **Required outcome:** Provide a responsive label/chart arrangement that exposes a usable timeline at the supported phone widths without repeatedly panning through a sliver.  
  **Test:** `ui.spec.js` — `Gantt at 320px leaves a visible, usable timeline beside the labels`.

- [ ] [ID:idx-gantt-dialog-focus] **P2 — Gantt declares itself modal but lets focus escape and fails to restore the opener.**

  **Location:** [gantt.js](../../js/markdown/gantt.js), `openGantt()` / `closeGantt()`, lines 136–139; [editor.js](../../js/markdown/editor.js), ordinary-dialog registration.  
  **Reproduce:** Open Gantt with one task; after two Tabs, focus leaves the dialog. Separately open it and press Escape: focus is not restored to the Gantt button. Its custom class toggle bypasses the ordinary-dialog focus/inert mechanism.  
  **Required outcome:** Give Gantt consistent Tab/Shift+Tab ownership, background isolation, Escape behavior and opener restoration.  
  **Tests:** `ui.spec.js` — `Gantt Tab stays within the dialog and Escape restores the opener` and `Gantt Escape alone restores focus to its opener`.

- [ ] [ID:idx-find-keyboard-toggle] **P2 — Ctrl+4 stops working after it puts focus in the search query.**

  **Location:** [events.js](../../js/markdown/events.js), editable-field early return at lines 65–68 versus shortcut handling at line 136; [editor.js](../../js/markdown/editor.js), `toggleFind()`.  
  **Reproduce:** Focus the editor and press Ctrl+4: search opens and focuses the query. Press Ctrl+4 again: nothing closes because the global handler returns for the focused input before reaching the search shortcut. This contradicts the search toggle behavior and forces a mouse/extra focus move.  
  **Required outcome:** Handle the search panel's own shortcut while its query is focused, keeping unrelated editing shortcuts isolated.  
  **Test:** `ui.spec.js` — `Find keyboard shortcut can close and reopen search while its query has focus`; the existing `tests/find.js` also fails its related reopen assertion.

- [ ] [ID:idx-table-placeholder-contrast] **P2 — Table placeholders fail the documented text-contrast floor.**

  **Location:** [index.html](../../index.html), table builder input styles around lines 765–777; placeholder styling is absent.  
  **Reproduce:** Open Table. Chromium renders a cell's placeholder as RGB(117,117,117) on RGB(27,42,34), a measured **3.25:1** ratio, below the repository's 4.5:1 requirement. These small labels are the guidance for entering data.  
  **Required outcome:** Apply theme-aware placeholder colors meeting the text threshold in the actual table backgrounds and focus states.  
  **Test:** `ui.spec.js` — `table placeholders meet the documented small-text contrast floor`; see [table screenshot](2026-10-08-index-evidence/table-390.png).

- [ ] [ID:idx-table-touch-targets] **P2 — Dynamically generated table controls miss the 44px touch-target requirement.**

  **Location:** [index.html](../../index.html), `.tbl-builder input` and `.align-select`, lines 765–790.  
  **Reproduce:** On a 390×844 coarse-pointer context, table inputs are 24px high and alignment selects are 14px high. These are adjacent editable controls, making wrong-cell selection likely. The earlier toolbar/button touch fixes do not cover this generated grid.  
  **Required outcome:** Supply adequate interactive target sizes and spacing for the table's own controls while retaining access to all supported rows/columns.  
  **Test:** `ui.spec.js` — `dynamic table cells and alignment selects meet the 44px touch floor`.

- [ ] [ID:idx-table-romanian-labels] **P3 — The Romanian table builder retains English controls and generated headings.**

  **Location:** [files.js](../../js/markdown/files.js), `rebuildTableGrid()` and `insertTable()`, lines 325, 343, 359 and 376.  
  **Reproduce:** Set Romanian and open Table. `Header 1`, `Cell`, `Left`, `Center`, and `Right` remain English. Empty headers are inserted into the document from those English placeholders.  
  **Required outcome:** Route generated UI labels/default headings through the existing RO/EN translation mechanism.  
  **Test:** `ui.spec.js` — `Romanian table controls are localized`.

## Findings — verification coverage

- [ ] [ID:idx-contrast-test-transition] **P2 — The existing selected-search contrast assertion samples an active CSS transition and is nondeterministic.**

  **Location:** [tests/mdcontrast.js](../../tests/mdcontrast.js), lines 125–126; `.find-chip` has a 0.12-second color/background transition.  
  **Evidence:** The first run passed both languages. Two later unmodified runs failed at the selected count with different ratios, 4.12:1 and 1.10:1. The test adds `.on` and immediately measures, unlike its other state checks which wait for transitions.  
  **Required outcome:** Settle/finish the relevant animations before evaluating the selected steady state, and keep any intended transition-contrast audit separate. Do not weaken the 4.5:1 threshold.  
  **Verification:** Repeated original runs and a diagnostic run inserting a 250ms wait at this assertion; see validation notes. The new suite contains a settled-state check using real search chips.

- [ ] [ID:idx-todo-test-contract] **P2 — The TODO regression suite still treats the task-state select as the removed toggle button.**

  **Location:** [tests/wbtodo.js](../../tests/wbtodo.js), global-filter checks.  
  **Evidence:** Four assertions fail: global filtering, `.active` styling, per-book button hiding and removal of books without open tasks. They call/click `#btn-filter-todo` as a button; current requirements define a state select. `tests/taskstatus.js` and the corrected combined-filter `tests/importance.js` pass. This is already noted in CLAUDE.md but remains executable stale coverage.  
  **Required outcome:** Update this suite to select states and assert the current combined-filter contract, retaining coverage for per-book filtering and fence exclusion.

- [ ] [ID:idx-nav-test-contract] **P2 — Navigation tests retain obsolete phone expectations and a brittle desktop scroll check.**

  **Location:** [tests/nav.js](../../tests/nav.js), desktop first-heading assertion and phone checks around lines 114–156.  
  **Evidence:** Two runs fail three assertions. The phone assertions require switching from Source to Preview, whereas the current navigation implementation deliberately preserves the active tab (`gotoPreviewEl(..., true)`). The scripted desktop check reads preview scrollTop around 716–734 instead of under 200; the new test using actual clicks and an eventual position assertion passes. The mismatch is also acknowledged in CLAUDE.md; the accepted source/preview behavior needs to be made explicit in the test contract.  
  **Required outcome:** Reconcile the phone assertions and documentation with the accepted navigation workflow, and replace the fixed-delay/programmatic desktop interaction with realistic, settled verification. If that exposes a remaining user-visible scroll defect, keep it as a separate product finding rather than relaxing the expected destination.

## UI and “2026 look” assessment

The [desktop workspace](2026-10-08-index-evidence/writing-1440-en.png) has a
coherent earth palette, a recognizable primary Save action, readable editor
text and useful persistent context. Ordinary dialogs and the main toolbar have
benefited from the previous focus, contrast and target-size fixes. The new
normal-layout tests pass at 1440×900, 390×844, 320×640 and 844×390; the existing
header suite also covers laptop breakpoint boundaries and long translated labels.

As a design judgment, it still feels dense: several stacked action bands,
mixed emoji/glyph icons, compact uppercase labels and many equally weighted
tools compete with writing. At [390px](2026-10-08-index-evidence/writing-390-ro.png),
the expanded controls consume much of the initial viewport, though the editor
remains usable and the collapse control works. The one-line, sideways-scrolling
save strip is an explicit accepted requirement, so its overflow is not reported
as an implementation defect. A light theme or wholesale redesign is not an
existing requirement.

It does not yet meet a consistently clean and pleasant presentation standard:
the Gantt phone view and the table's contrast, touch sizes and untranslated
labels are concrete gaps, captured as actionable findings above. Correcting
those and preserving input through ordinary workflow changes is more urgent
than adding decorative effects. “2026 look” is an aesthetic judgment, not a
testable calendar-year certification.

## Validation and limitations

Run the new tests from the repository root:

```sh
node node_modules/@playwright/test/cli.js test --config tests/index-review/playwright.config.js
```

The tests assert the desired behavior and deliberately remain red on confirmed
defects; none is skipped or annotated as an expected failure. Test commands,
individual results and selected numeric observations are retained in
[validation.json](2026-10-08-index-evidence/validation.json).

- New adversarial Playwright suite: **40 tests — 17 passed, 23 failed**, with
  no skipped tests or retries. Those 23 failed assertions reproduce 22 product
  findings: Gantt focus has two independent test cases. The three additional
  review findings concern existing test reliability/contract mismatches.
- Existing root Playwright suite: **256 passed**, including diagrams/sketches,
  dictation language and responsive header tests.
- First ad-hoc batch: **38 of 40 scripts passed**. `find.js` and `nav.js`
  failed as discussed above. The batch printed 796 passing assertions; this is
  a count of `PASS` lines, not 796 independent test cases.
- Additional task-specific/regression scripts: **9 of 11 passed**. The
  chapter picker (83 checks), double-submit guard (13), stop labels (61),
  save-row and Kanban/Gantt placement, graph, causality, task navigation and
  color checks passed. `wbtodo.js` has stale expectations; `mdcontrast.js`
  sampled a transition. Exact outcomes, including diagnostic reruns, are
  recorded with the evidence. Adding a 250ms wait to that assertion in a
  temporary in-memory diagnostic copy made both languages pass without
  changing the threshold or repository test. The new settled-state search
  contrast case also passes.
- `node tests/verify.js` passed. No product source files were modified.

Successful numerical cases include valid/invalid leap-day validation in the
Gantt helper, three-day inclusive Gantt spans across leap day and both DST
boundaries, duplicate/missing dependencies, zero/one-minute/overnight/23h59
garden durations, decimal-comma kilograms converted to grams, separate piece
counts, filtered totals, timeline ordering/equivalent date formats, and empty,
negative and maximum table dimensions. The root suite covers diagram geometry,
port selection, round trips and export behavior.

Persistence checks cover normal edits/reload, clearing an entire chapter,
storage failure, mirror-write failure, multiple-tab conflicts, delayed cloud
pulls, malformed manifests, failed downloads, quick-idea save races, imports,
exports and draft recovery. A passing mocked service test does not establish
real provider availability or transcription quality.

The environment is Linux, Node v26.8.1, with Europe/Bucharest explicitly
selected in the new suite. Browser and Playwright versions are recorded in
the evidence. Actual
iOS/Safari/Firefox, operating-system share sheets, hardware dictation, real
Google authorization, and destructive browser-storage eviction were not
exercised. Touch and keyboard-resize coverage is browser emulation. The folder
adapter and fault injection validate application decisions, not a particular
disk's durability guarantees. This is broad reproducible coverage, not a claim
of exhaustive correctness or a full security/accessibility certification.

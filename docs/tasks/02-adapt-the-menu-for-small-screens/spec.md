# task-02 — Keep markdown header controls inside laptop viewports

## Current code and retry decision

This spec supersedes the previous attempt's spec. This is a standalone browser
app with no build step. Product layout lives in `index.html`; ordered classic
scripts under `js/markdown/` own behavior and translations.

Read `.ai-team/README.md`, `.ai-team/project.md`, `docs/FEATURES.md` sections E
and O, and the relevant CSS before editing. Current anchors (search selectors,
not old line numbers): header CSS near line 73, save row near 91, cloud status
near 305, crumb near 392, filename near 898, media queries near 1159,
header markup near 3571, save row near 3595, toolbar near 3611.

The owner requested a different approach after the unfinished first attempt.
Task-01 has since moved `#wb-save-sync-row` OUTSIDE `.header-actions`: it is a
body child immediately after `header`, before `.toolbar`. Task-03 moved
`#btn-kanban` and `#btn-gantt` into `#toolbar-groups`, after the filters.
Keep these merged DOM positions. The owner's requested second save/sync row
already exists; make that row fit, rather than moving it back into the header.
This is the lead's resolution of the outdated structural premise in the task.

`git diff main --stat` at planning time contains the old task-02 spec, notes,
`tests/02-adapt-the-menu-for-small-screens/laptop-header.js` and `_scratch.js`,
but no surviving product patch. The old suite assumes save buttons are header
descendants and `display:contents` at desktop widths. Those assumptions are
obsolete. The retrospective reports long-crumb failures at 1601/1920 in the
old attempt; these are evidence to test, not current measurements or waivers.

## Binding product behavior and scope

- Product changes are limited to markdown-page layout CSS and associated
  comments in `index.html`. No JS, translations, new product dependencies,
  script tags, shared `#site-nav` edits, or changes to the other eight pages.
  Correct the save-row layout description in `docs/FEATURES.md` if needed.
- Only widths ABOVE 1024px change. Leave all existing base rules and all
  tablet/phone/short-landscape rules unchanged; add desktop-scoped overrides.
  At 1024px and below retain today's independently scrollable, nonwrapping
  save row and today's collapsible toolbar. Do not restore obsolete
  `order:-1` behavior from the old spec.
- At 1025–1600px inclusive tighten horizontal button padding and permit
  wrapping. The save/sync group remains its own full-width row below the
  complete upper header and above the formatting toolbar. Preserve its
  current left alignment and DOM order. Extra lines are allowed when needed;
  do not impose a fixed two-line height that clips controls.
- No existing button is hidden, moved into a menu, converted to an icon, or
  given a shortened label. Full RO/EN text, icons, titles, IDs, handlers,
  accessibility attributes, and existing conditional visibility are retained.
- Always directly reachable: Workbooks, New, Idea, Save to workbook, Sync to
  folder, Google Sync now, Save all modified. Rarely used Open .md, Import
  DOCX, Export HTML, Push dates, Gantt and Help also remain fully visible.
  Keep Kanban/Gantt in their current toolbar positions.
- Long chapter filenames, workbook crumbs, and cloud status text truncate
  with ellipsis. They must not push buttons out, vanish entirely, or require
  sideways scrolling. The status link remains usable.
- Acceptance is 100% zoom at 1025, 1280, 1366, 1440, 1536px, in RO and EN.
  Also check 1600 (inclusive boundary), 1601 and 1920px. Every expected visible
  header, save-row and toolbar control must fit, without horizontal page or
  control-row scrolling. No exemption for pre-existing desktop overflow.
- Above 1600px preserve normal button padding and the existing separate save
  row. A short-content upper header should retain its 52px single-row look
  when it fits; with long content it may grow to avoid clipping. The owner
  requires no overflow, not the old spec's erroneous `display:contents` rule.
- The formatting toolbar is in scope for verification and only a measured
  overflow correction. Problems on other pages/nav are separate tasks.

## Implementation prescription

Add two media blocks after the existing `@media (max-width: 1600px)` separator
rule and before the TABLET comment. Do not modify that existing rule.

First, `@media (min-width: 1025px)` provides intrinsic sizing safety at all
desktop widths, including 1601 and 1920:

```css
header {
  height: auto;
  min-height: 52px;
  padding: 6px 20px;
  gap: 12px;
}
header .logo { flex: 0 0 auto; white-space: nowrap; }
header .header-actions {
  flex: 1 1 0;
  min-width: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}
header .header-actions .btn { flex: 0 0 auto; white-space: nowrap; }
header #current-file,
header #wb-crumb {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
header #current-file { max-width: 260px; }
header #wb-crumb { max-width: 220px; }
#wb-save-sync-row {
  min-width: 0;
  max-width: 100%;
  flex-wrap: wrap;
  overflow: visible;
}
#wb-save-sync-row #wb-cloud-where {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 260px;
}
```

The existing save-button `flex:0 0 auto; white-space:nowrap` remains effective.
The ID-qualified cloud selector must override the existing
`.wb-save-sync-row #wb-cloud-where { flex:0 0 auto }`. Status ellipsis already
exists in its base rule. Preserve `[hidden]` rules for crumb and Map.

Second, `@media (min-width: 1025px) and (max-width: 1600px)`:

```css
header .header-actions,
#wb-save-sync-row { gap: 6px; }
header .header-actions .btn,
#wb-save-sync-row .btn { padding: 6px 10px; }
```

Keep the 12px button font and letter spacing. Do not style global `.btn`:
that would change modals. Both rows may wrap without reordering children.
The logo stays on the left; action lines remain right aligned. Save controls
remain left aligned on their separate full-width strip. The flex-column body
already allows the editor workspace to shrink as the header grows.

These values are a concrete starting implementation, not measured results.
If geometry checks require a CSS adjustment, keep it within these desktop
queries, preserve all behavior above, and record the failing measurement and
adjustment. No product decision is delegated. Do not use body clipping,
`overflow-x:hidden`, transforms, reduced font size, fixed row heights, or
scrollbars to conceal a failure.

`.toolbar`, `.toolbar-filters` already wrap. Check `.toolbar .tb-btn`, all
selects, color inputs and their labels, and Kanban/Gantt. If an actual control
spills, constrain the offending flex item with `min-width:0`/`max-width:100%`
or allow its group to wrap inside the applicable desktop query. Do not change
mobile toolbar collapse, filters or the shared nav to solve it.

Update BOTH the CSS and markup comments describing the save row: it remains
between header and toolbar at all sizes; it wraps on desktop, while at
<=1024px it retains its existing sideways-scroll behavior. Preserve markup.

## Automated verification (Tester A3)

Standing team policy: add a Playwright suite under
`tests/02-adapt-the-menu-for-small-screens/` and all necessary test tooling
(package.json with test script, playwright.config.*, .gitignore entries).
Product scope/dependency restrictions do not apply to test tooling.

Use a new `laptop-header.spec.js` with the existing root `@playwright/test`.
Expand root `playwright.config.js` discovery to include this suite AND the
currently discovered `tests/01-for-index-html-page-please-add/*.spec.js`.
Keep other existing configuration. `npm test` from root must actually run it;
verify with `npm test -- --list` and run the task suite. Do not accidentally
discover the old plain-Node `laptop-header.js` or `_scratch.js`. Retire or
update stale assertions if retaining that old suite as runnable coverage;
do not use it unchanged as evidence.

Fixture, isolated per case, without real OAuth, Drive writes or folder access:
1. Open `index.html` via file URL, wait for app initialization, dismiss onboarding
   through test state/UI as needed, and wait for `document.fonts.ready`.
2. Set language through `scula-ui-lang` with detail `ro` or `en`, wait for its
   asynchronous `paintCloud` repaint, then apply fixture state.
3. In page context set `gsFolder={id:'test-folder',name:'ScuLa'}`,
   `gsLastAt=Date.now()-86400000`, then call `paintCloud()`. This produces the
   connected button and a real status anchor, even without a live token
   (the status can truthfully be the expired-session message).
4. Reveal `#btn-map`, reveal `#wb-crumb`, set crumb to a diacritic-containing
   workbook name >=100 characters and `#current-file` to a filename >=120
   characters ending `.md`. Keep these values stable during measurement.
5. Test the natural connected status and a stress case replacing only the
   status anchor text with 120 characters. Do not replace its markup or
   inject CSS. Reapply after any asynchronous label repaint.

Run all eight desktop widths above, viewport height 900, device scale 1,
in both languages. Assert:
- Explicit expected button inventory is present and visible, including every
  `header .btn`, all four `#wb-save-sync-row .btn`, visible Map, and all
  normally visible toolbar buttons/selects/color inputs. Do not merely filter
  hidden elements and thereby allow accidentally hidden controls to pass.
  The intentionally hidden Garden and desktop toolbar toggle are exceptions.
- Each control has positive dimensions and lies inside the viewport and its
  containing row, allowing <=1 CSS pixel rounding. Save controls are checked
  against their own row, not `header`. Check both axes for row clipping and
  overlap between controls. Wrapped lines must not cover one another.
- Document/body scrollWidth do not exceed clientWidth; header, actions, save
  row and toolbar have no horizontal overflow. Body overflow:hidden alone
  proves nothing. Check bounds before clicking (Playwright can auto-scroll).
- Every button keeps its localized full label and fits its content without
  clipping or ellipsis. Assert connected text is `☁ Sincronizează acum` /
  `☁ Sync now`; Save all is `📚 Salvează tot ce s-a modificat` /
  `📚 Save all modified`. Compare remaining labels with app translations.
- Long filename, crumb and stress status have nonzero widths, computed
  ellipsis/nowrap/hidden overflow and scrollWidth > clientWidth. Status still
  contains its anchor and retains href, target and accessible link text.
- The save row starts at/below header bottom and ends at/before toolbar top;
  DOM ordering and all handler attributes remain intact. At 1025–1600 check
  compact padding; at 1601/1920 check normal 6px 14px button padding.
- With ordinary short content at 1920, the upper header fits in one 52px row.
  With stress content it can grow; never assert `display:contents`.
- At 1280 in both languages use real locator clicks with harmless handler
  spies for the four save-row actions. Assert exactly one handler invocation
  per click, without force or actual sync side effects. Geometry/hit tests
  cover the remaining header controls. Confirm the status link is hit-testable
  without navigating to Drive.

Regression widths: 1024, 700, 420, 360 and short landscape 844x390. Compare
against pre-change mobile behavior: save row remains flex/nowrap/overflow-x
 auto, original padding/font sizes remain, toolbar toggle still collapses
only its existing groups, and save buttons remain outside the collapse.
Mobile sideways scrolling is explicitly allowed. Inspect source diff to
ensure every <=1024 rule and the nav block remain unchanged.

Run `node tests/verify.js`. Run relevant existing suites: gdsync, wbsaveall,
and the merged task-01 row / task-03 buttons suites. The old task-01 test
asserts nowrap even at desktop widths: update that superseded expectation
to match this task above 1024, retaining its mobile assertions and other
coverage. That intentional contract change is not an unrelated regression.
Use team scripts only via the sandbox command in `.ai-team/README.md`.
Record actual commands/results; if an environment refusal blocks browsers,
do not retry/bypass it and do not claim layout passed. Write the report with
the exact blocker. Historical failures are not automatic waivers.

## Manual verification

Open index.html in Chrome at 100% zoom. Use responsive mode at each desktop
width in the matrix, switching RO and EN with the nav language toggle. Use
the same connected/long-name/visible-Map fixture above in DevTools; do not
connect a real account just for this test. Confirm the top header wraps as
needed, the separate save strip remains below it, all text labels are readable,
long metadata ends in ellipsis, and no button/control requires horizontal
scrolling. Check every toolbar control including filters, Kanban and Gantt.
At 1601 and 1920 check the same stress state and the ordinary short state.
At 1024 and a phone width compare the unchanged scrollable save strip and
collapse interaction. Use test spies for save/sync clicks rather than writing
real data. Capture screenshots of 1025 RO, 1536 RO and 1601 stress state.

## Done and reporting

All desktop matrix cases pass with no clipped, hidden or covered controls,
including at 1601/1920; mobile behavior and shared nav remain unchanged.
The root npm test discovers the new suite. Required verification is reported
accurately. Implementation report names files, CSS decisions, measured header
and save-row heights at 1025/1280/1536/1601/1920 in RO/EN, any wrapping and
any toolbar correction. Test report distinguishes failures from environmental
blocks. Complete required reports before optional broad exploration; the prior
attempt exhausted its turn budget without completing the workflow.

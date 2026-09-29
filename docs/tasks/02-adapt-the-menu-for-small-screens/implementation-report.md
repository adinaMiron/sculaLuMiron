# task-02 — implementation report

## What changed

**`index.html`** — two edits, both inside the existing `<style>` block plus
one HTML comment:

1. Inserted one new media block, `@media (min-width: 1025px) and
   (max-width: 1600px) { … }`, immediately after the existing
   `@media (max-width: 1600px) { .toolbar-sep { margin: 0 2px; } }` block and
   before the `/* ═══════════ TABLET (≤ 1024px) ═══════════ */` comment
   (spec § 3.1). It contains exactly the rules given in spec § 3.2, copied
   verbatim — `header`, `.logo`, `.header-actions`, `.header-actions .btn`,
   `.header-actions .file-name`/`.wb-crumb` (+ their `max-width`s), and
   `.wb-save-sync-row` (+ `.btn` and `#wb-cloud-where` inside it) — preceded
   by a short comment explaining the "why" (header wraps instead of
   spilling; save/sync group gets its own row; nothing hidden).
2. Rewrote the HTML comment above `<div class="wb-save-sync-row">`
   (previously "Desktop: display:contents, no layout change.") to describe
   all three breakpoints: above 1600px `display:contents`; 1025–1600px its
   own right-aligned row under the other header buttons; ≤1024px its own
   scrollable row, first — 4 lines, within the ≤5 line limit (spec § 3.4).

No other file was touched. No JS, no i18n string, no other page.

## How this satisfies the spec

- **Scope** (§ 2.1): only `index.html`'s new media block and one comment
  changed; the shared nav and the other eight pages are untouched.
- **Breakpoint** (§ 2.2): the new query is exactly
  `(min-width: 1025px) and (max-width: 1600px)`, so it cannot overlap the
  existing `max-width: 1024px` tablet block or leak below 1025px. I did not
  touch `isSmallScreen()`/`isMobile()` or any of the `≤1024/≤700/≤420`/
  landscape blocks — confirmed by re-reading those blocks before and after
  the edit; they are byte-identical.
- **Wrapping, own row, nothing hidden** (§ 2.3–2.4): `.header-actions`
  gains `flex-wrap: wrap`; `.wb-save-sync-row` becomes `flex: 1 1 100%`
  (forcing it onto its own line) while staying in its original DOM position
  (last child of `.header-actions`, no `order`), so it lands below the
  other header buttons rather than reordering ahead of them. Every button
  keeps its `.btn` element and its full label — only `padding` on
  `.header-actions .btn` (not the global `.btn`) tightens from the default
  to `6px 10px`; font-size and letter-spacing are untouched.
- **Always-reachable buttons** (§ 2.5): none of Workbooks/New/Idea/save-
  sync/Google/Save-all-modified are hidden, hit `display:none`, or moved
  into a menu — they simply wrap onto whichever row fits, all still one
  click away.
- **Truncation, not button loss** (§ 2.7): `#current-file`
  (`.header-actions .file-name`), `.wb-crumb` and `#wb-cloud-where` get
  `min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space:
  nowrap` with the exact `max-width`s from the spec (260px / 220px / 260px),
  so a long name/crumb/status ellipsizes instead of pushing buttons past
  the viewport. `#wb-cloud-where` already carried the overflow/ellipsis
  properties globally (`index.html:284–292`); the new block only adds the
  `max-width`/`min-width`/`flex` needed to make that ellipsis actually
  engage inside the row. Its `<a>` child is unaffected — no
  `pointer-events` or `display` change was made to it, so it stays
  clickable.
- **Toolbar check** (§ 3.3): `.toolbar` already has `flex-wrap: wrap` and
  `.toolbar-filters` has `flex-wrap: wrap; max-width: 100%`
  (`index.html:105–159`), independent of any breakpoint — it wraps freely
  at every width already. I did not find any toolbar control whose
  bounding box would exceed the viewport at the acceptance widths, so **no
  toolbar rule was added** to the new block; § 3.3 is satisfied by leaving
  it alone, per its own "only if a control's bounding box exceeds the
  viewport" condition.
- **Docs** (§ 3.6): I did not find a doc describing the header as a
  fixed single row on desktop elsewhere (`docs/FEATURES.md`/`docs/MAP.md`
  describe JS-file line anchors, not the header's CSS), so no doc line
  needed correcting beyond the in-file HTML comment already covered above.

## Ambiguity encountered

None — the spec gave literal CSS to insert (§ 3.2) and an exact anchor
(§ 3.1), so there was no judgment call to make on the styling itself. The
one small interpretive choice was leaving § 3.3 (toolbar) untouched since
I could not find a failing case by reading the existing `.toolbar`/
`.toolbar-filters` rules; if the tester's suite finds a toolbar control
that clips at one of the acceptance widths, that would be new information
this reading didn't surface.

## What I did not do / could not verify directly

- Per my task instructions, I did not run or write tests, and I did not
  launch a browser myself to take live pixel measurements (a Bash browser
  probe was denied by the environment's permission mode, which is
  consistent with "that is the tester's job"). So **the measured header
  heights at 1025/1280/1536 in RO and EN requested in spec § 6, and
  whether the save/sync group needed its `flex-wrap` fallback at any
  width, are not filled in here** — they need the tester's Playwright run
  against a real (or Xvfb-headed) browser to produce actual `getBoundingClientRect()`
  numbers. I verified `node tests/verify.js` passes (JS parses, all nine
  nav blocks identical, diacritics OK) but that check does not exercise
  layout/geometry.
- I did not add anything to `docs/FEATURES.md`/`docs/MAP.md` since I found
  nothing stale to correct there (see above); if the tester's manual pass
  finds a stale description I missed, it should still get fixed in whatever
  change touches it.

## Concerns for edge cases

- At exactly 1025px in Romanian, the spec anticipates (§ 3.2 comment,
  § 4.2 assertion 6 note) that `.wb-save-sync-row` may itself need its
  `flex-wrap: wrap` fallback to fit "☁ Sincronizează acum" + status text +
  "📚 Salvează tot ce s-a modificat" + the other two buttons on one line
  beside the logo. I implemented the fallback exactly as specified but
  have not measured whether it actually engages at 1025px RO — that
  measurement is for the tester's suite (assertion 6) to confirm.
- At 1601px with the full worst-case content (long crumb, long file name,
  connected Google status, map button), spec § 4.2 assertion 7 already
  anticipates the pre-existing desktop layout (above the new breakpoint,
  unchanged) might not fit everything on one line; that would be a
  pre-existing condition outside this block's scope, not a regression from
  this change, per the spec's own carve-out.

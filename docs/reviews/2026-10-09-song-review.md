# Song Creation adversarial implementation review

Date: 2026-10-09  
Page: `song.html`  
Reviewed branch: `main`  
Reviewed commit: `3b9968279048fb85251875736478d1451b62ab69`

## Verdict and scope

The source/derived-audio separation and recovery architecture performed well in the existing regression suites, but the page is **not ready for an unqualified approval**. Ordinary numeric edits can persist invalid musical data and produce metadata backups that the same application refuses to restore. The deletion confirmation understates permanent loss of dependent work. Keyboard editing and contrast also need correction.

This review adds tests and documentation only. Findings remain unchecked; no application fixes were made. Existing working-tree changes under `.codex/` were left alone.

Requirements were read from [FEATURES, section V](../FEATURES.md#v-song-creation-songhtml) and the [Song implementation status](../SONG-IMPLEMENTATION-STATUS.md), particularly persistence, editable melody, samples, timeline and backup restoration. The status document is a statement of implemented scope, not independent proof. Findings distinguish contract defects from a concrete workflow improvement requested in this review. “2026 look” is treated as clear hierarchy, legible controls, coherent styling and usable interaction, not a requirement to add a framework or fashionable effects.

## Findings

- [ ] [ID:song-numeric-validation] **P1 — Validate musical numbers before disabling their inputs; current edits can create unrestorable backups.**

  **Reproduce:** Import a one-second silent PCM WAV, choose **Extract melody**, then **Add note**. Enter MIDI `-1`, `128` or `60.5`, or velocity `0`/`128`, and press Tab. Each value is committed to IndexedDB. Cents `101`, offset `181`, and tempos `39`/`221` also pass despite the displayed limits. The explicit offset/onset relationship checks still reject zero-length notes.

  **Cause:** `performanceEditor` calls `run()` before its `checkValidity()` checks. `run` sets state to `saving`; `paintState` disables `.performance input`. Disabled controls are barred from constraint validation, so `checkValidity()` returns true. The note handler does not independently enforce pitch/velocity integers or the numeric bounds; the tempo handler checks integerness but loses its range check. See `song.html:1503–1515`, `1790`, `1881–1882`, `1892–1893`.

  **Preservation impact:** With velocity `0`, **Save metadata** succeeds, but `ScuLaSongBackup.validate` rejects the exported manifest at `recordings[0].performance.notes[0].velocity` (`js/audio/backup.js:21–24`). The saved file is not a usable restoration backup. Invalid MIDI bytes or silent notes are also a downstream risk: melody MIDI constructs event bytes directly from note values (`js/audio/performance.js:149–157`). Original WAV bytes were preserved; this is corruption of derived metadata and portability, not evidence of overwritten source audio.

  **Correction/acceptance:** Validate finite numbers, bounds, integerness and note relationships while the controls are enabled or with explicit model validation before mutation. Preserve the previous value on rejection. Every reachable saved project should produce a valid restorable manifest. New tests `invalid … retains stored …` and `@song-validation` reproduce the failures with normal fill/Tab interaction; each case restores its input through the UI before the next case.

- [ ] [ID:song-delete-dependencies] **P1 — Disclose dependent arrangements and song sections before deleting a take.**

  **Reproduce:** Create a take, add a performance note, create an arrangement and add it to the timeline. Click the take's **Delete**. The dialog says only `Delete “silence” from this browser? Exported copies remain.` Accepting removes the source take, its arrangement versions and linked timeline sections, and clears timeline undo history. Neither language mentions those dependencies. There is no take-deletion undo.

  **Evidence:** The delete handler filters `project.arrangements` by `sourceRecordingId`, filters timeline references and calls `songTimelineHistories.delete(project.id)` (`song.html:1780`). The English/Romanian `deleteAsk` strings are at `1436–1437`. Playwright `@song-delete` fails the disclosure assertion; separate cases verify cancel preserves all three objects and acceptance deletes all three with timeline undo disabled.

  **Correction/acceptance:** Show the counts/types of arrangement versions and sections that will be removed, and make clear that this local deletion cannot be undone. Keep confirmation cancellation side-effect-free. This is a preservation/confirmation defect, not a request to retain dangling timeline references.

- [ ] [ID:song-editor-focus] **P2 — Preserve keyboard focus and edit position after saving a note.**

  **Reproduce:** Change the first note's MIDI pitch to `69` and press Tab. After save, focus is not on the onset field; it falls out of the note editor. Repeated keyboard entry requires finding and focusing the next field again.

  **Evidence:** Playwright `@song-focus` expects the next field's `data-field` to be `onset`, but receives `undefined`. `saveEdit` calls the full `render()` (`song.html:1795`); `render()` destroys the recording cards and their controls (`1767–1771`). Inputs are also disabled during persistence (`1503–1515`). The same architecture affects other rebuilt editors, but only the note case was directly asserted here.

  **Correction/acceptance:** Preserve a stable take/note/field focus target and intended Tab progression across save/render, or update the affected content without rebuilding focused controls. Verify keyboard-only sequential edits, including invalid input, without losing the user's place.

- [ ] [ID:song-error-contrast] **P2 — Raise error and recovery text contrast against the panel surface.**

  **Reproduce:** Import a malformed WAV. The error uses `--danger: #C4643C` on panel `--surface: #1B2A22`, giving **3.74:1**, below the 4.5:1 threshold for normal-size text. Storage recovery text uses the same danger color; that warning is particularly important for preserving work.

  **Evidence:** Computed-style contrast assertion `@song-contrast` fails. Tokens and `#status.error,#backupSummary.error,#recovery` are at `song.html:6–7`. This measurement concerns enabled informational text, not disabled buttons (which have different accessibility treatment).

  **Correction/acceptance:** Use a text token that reaches at least 4.5:1 on its actual background. Check errors, backup validation and persistent storage warnings in both languages; do not rely solely on color to communicate an error.

- [ ] [ID:song-license-contrast] **P2 — Style the optional piano license link for the dark surface.**

  **Reproduce:** On a fresh page, scroll to **Optional piano → Full license**. The link retains the browser's default blue on the dark panel. It is visibly much harder to read than the surrounding text.

  **Evidence:** Desktop and phone screenshots show the default blue link. The `@song-license` test measures **1.60:1**, below 4.5:1, using the computed foreground/background. The link is at `song.html:1408`; the page stylesheet does not provide a matching content-link color.

  **Correction/acceptance:** Use a theme-compatible link color and check normal, visited and keyboard-focus states. Retain an obvious link affordance and accessible focus indication.

- [ ] [ID:song-first-recording-flow] **P2 — Put the primary creation workflow ahead of restoration and lengthy backup guidance.**

  **Classification:** Concrete UX improvement requested by this review, rather than a claim that the musical format contract requires a particular panel order.

  **Evidence:** On the fresh English page at **390 × 844**, the restoration heading starts at document Y **1,324 px**, the source-recording heading at **1,992 px**, and Record at **2,563 px**. Users pass multiple backup-format paragraphs and three restoration file inputs before they can record their first take. The desktop screenshot likewise places restoration before recording. The empty timeline shows many disabled actions, adding visual noise. See `song.html:1364–1403` and the screenshots below.

  **Correction/acceptance:** Prioritize create/record/import on the initial view; make restoration and detailed backup guidance available through clear secondary disclosure. Keep storage-loss guidance visible at the point it matters. Verify both first use and returning-project use on phone and desktop without introducing a mandatory wizard or extra prerequisite clicks. No arbitrary “must fit above the fold” assertion has been added; the test logs actual geometry for review.

## Computation and preservation verification

The new [Playwright review suite](../../tests/song-review.js) runs the real page through `file://`, with actual IndexedDB and downloads. It uses generated deterministic WAVs and explicit expected values; app model assertions are supplemented by existing independent byte/MIDI/render fixtures.

| Area | Cases and evidence |
| --- | --- |
| WAV boundaries | One-frame PCM at 8 kHz/mono/16-bit, 192 kHz/stereo/32-bit, and 44.1 kHz/mono/24-bit with odd payload padding; exact duration `1 / sampleRate`. Reject 7,999 Hz, 192,001 Hz and three channels. |
| Malformed import | Non-WAV bytes leave the project unchanged. Existing suites exercise RIFF/chunk dimensions, unsupported encodings and bounded reads. |
| Silence/manual notes | Silence produces zero detected and edited notes; adding a manual note yields onset 0, offset 0.25 seconds. |
| Numeric edits | Invalid pitch, velocity, cents, duration and tempo cases above; zero-length/overlapping boundary rejection; restore each field before subsequent cases. |
| Quantization | At 120 BPM, two divisions per beat, zero phase, onset 0.13 rounds to 0.25 and offset 0.62 rounds to 0.50 seconds. Existing suites cover timing/MIDI and composition meters. |
| History | Valid pitch change, undo, redo and reload preserve the expected model. |
| Source preservation | Download after note/arrangement/timeline edits is byte-identical to the imported WAV. Valid derived metadata passes backup validation. Invalid velocity reveals the restoration defect. |
| Deletion | Cancel preserves source, arrangement and timeline; acceptance removes dependencies and disables timeline undo. |
| Layout/i18n | Empty RO/EN layouts fit 320, 390, 768 and 1,440 px; populated English layouts fit 320 and 390 px. Internal editor scrolling is distinct from page overflow. |
| Accessibility/interaction | Actual fill/Tab behavior, computed error/link contrast, no uncaught page errors. |

All **24 selected existing song suites passed**: `song-analysis`, `song-evaluation`, `song-bounded-analysis`, `song-analysis-lifecycle`, `song-synthesis`, `song-instruments`, `song-arrangement-generation`, `song-composition`, `song-bounded-render`, `song-samples`, `song-integrity`, `song-incremental-inspection`, `song-archive`, `song`, `song-recovery`, `song-performance`, `song-arrangement`, `song-composition-browser`, `song-sample-browser`, `song-timeline`, `song-backup-import`, `song-render-browser`, `song-archive-browser`, `song-packs`.

These include fake-device capture and PCM endpoints, quota/aborted transactions, atomic finalization, interrupted capture recovery, writer takeover, canceled analysis/import, digest validation, exact source restoration, independent composition snapshots, sample loop/dynamic mapping, arrangement/timeline MIDI, repeated sections, mixed-meter boundaries, exact loop PCM slices, rendering budgets and cancellation. Passing them does not override the new failing cases.

`verify` also passed (app syntax, shared navigation and diacritics). The review suite intentionally exits nonzero while its desired-behavior assertions reproduce open findings; it contains no skipped or expected-failure exemptions. This is a completed review with unresolved application defects, not a claim that regression verification is green.

## Reproduction and artifacts

Run from the repository root:

```sh
python3 scripts/run-tests.py song-review
```

The runner discovers installed Chrome; `PW_CHROME_PATH` can override it. Initial `--doctor` found the Playwright package missing. The declared `tests/package.json` dependency was installed with `npm install --ignore-scripts --package-lock=false`; application files, manifests and lockfiles were not changed. Sandbox initialization failed in this environment, so inspection/testing used approved escalated commands.

- Existing 24-suite logs: `test-results/agent/run-8wi1dd1l/`.
- Static verification: `test-results/agent/run-b0keuau_/02-verify.log`.
- Review machine-readable results: [results.json](../../test-results/song-review/results.json).
- Visual artifacts: [empty desktop](../../test-results/song-review/empty-desktop.png), [empty phone](../../test-results/song-review/empty-phone.png), [populated desktop](../../test-results/song-review/populated-desktop.png), [populated phone](../../test-results/song-review/populated-phone.png).

Artifacts under `test-results/` are local generated evidence, not committed assets; rerunning the suite recreates screenshots/results. Final run: `test-results/agent/run-1ptq9z7n/01-song-review.log`: **24 passing assertions, 14 failing assertions**, grouped into the validation, focus, deletion-disclosure and contrast findings above (38 assertions total). The workflow finding is based on visual inspection and measured geometry, not an arbitrary pass/fail layout threshold.

## Visual judgment and limits

The restrained green/cream palette, consistent rounded panels, system typography and clear primary recording button are a coherent contemporary foundation. Empty desktop and phone screenshots were visually inspected. A blanket “2026 design approved” would be misleading because contrast, keyboard continuity and task hierarchy have concrete defects. Responsive fit alone is not usability approval.

Testing used installed Chromium on Linux, generated audio and fake microphone fixtures. Physical microphone quality, real-world humming accuracy, Bluetooth/hardware interruption, actual mobile share sheets, mobile background suspension, Safari/Firefox, assistive technology and listening quality were not verified. No claim is made that synthetic evaluation establishes real-singer accuracy. Source inspection and regression coverage are substantial but do not prove absence of every race or storage-eviction failure.

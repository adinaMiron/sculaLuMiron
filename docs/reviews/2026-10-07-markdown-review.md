# Markdown editor adversarial review

Date: 2026-10-07  
Module: Markdown editor (`index.html` and `js/markdown/`)  
Reviewed branch: `main`  
Reviewed commit: `21cfd8cc9539e751eda6bc689819d7d757cffb42`

## Verdict

**Changes required.** Ordinary editing and the recent desktop layout work are functional, but the implementation does not reliably preserve work through formatting, imports, storage failures, concurrent tabs, or delayed synchronization. Several actions report success while a folder copy remains stale. Imported Markdown can also execute JavaScript in the editor's origin.

The earthy palette gives the page a coherent identity. Body text and primary actions have good contrast. However, small labels are difficult to read, desktop toolbars are visually crowded, and an expanded mobile toolbar can consume the entire writing area. Against the requested clean, pleasant, contemporary 2026 presentation, this is a partial result: the colors work; the information hierarchy, mobile space allocation, and keyboard behavior need correction. “2026 look” is a qualitative design assessment, not a formal compatibility standard.

This review records defects only; it does not change product code or mark implementation requirements complete. P1 means a high-priority preservation/security defect; P2 means a workflow, accessibility, or verification defect.

## Requirements and method

Requirements were read from `AGENTS.md`, the task specifications, and the canonical feature documentation before source and tests. In particular:

- [Workbooks, drafts, pending edits and folder synchronization](../FEATURES.md#e-workbooks-and-chapters-indexhtml): IndexedDB is the source of truth; chapter text survives editing/reload; pending markers identify stale folder copies.
- [Quick idea capture](../FEATURES.md#j-quick-idea-capture-indexhtml), [undo/redo](../FEATURES.md#k-undo--redo-indexhtml), Drive synchronization in § O, and diagrams/sketches in § U.
- Task specifications for [save-row placement](../tasks/01-move-salveaza-and-sincronizeaza-buttons-like/spec.md), [desktop fitting](../tasks/02-adapt-the-menu-for-small-screens/spec.md), [Kanban/Gantt placement](../tasks/03-move-kanban-and-gantt-buttons-from/spec.md), [idea routing](../tasks/03-for-index-html-page-in-idee/spec.md), and both dictation tasks.
- [Theme contrast requirements](../THEME.md#checklist-per-file), [documented editor workflow and shortcuts](../../README.md#markdown-editor-indexhtml), and the current request's usability/design criteria.

The newer desktop-fitting specification supersedes the older all-width nowrap prescription: wrapping above 1024px is correct. The mobile save strip's horizontal scrolling and Kanban/Gantt disappearing with the collapsed toolbar are explicitly accepted behaviors, not defects in this review.

Verification used system Chromium through Playwright, isolated browser contexts, a temporary localhost server, real editor events and IndexedDB, and controlled folder/Drive/storage failures. Transcription used Chromium's fake microphone and a stubbed response. No real Google account or transcription service was used. Screenshot checks covered RO/EN at 1920×1080, 1366×900, 1025×768, 390×844, 320×640, and 844×390, including touch emulation and collapsed mobile toolbars. The task suite additionally exercises the specified desktop widths and long metadata.

Reproduction scripts and observed state are retained in [the evidence directory](2026-10-07-markdown-evidence/). Run the probes from the repository root with the existing test dependencies:

```sh
node docs/reviews/2026-10-07-markdown-evidence/probe.cjs
node docs/reviews/2026-10-07-markdown-evidence/extra.cjs
```

They print observations rather than asserting that the current defective behavior is desirable. They use temporary browser data and write outputs under `/tmp/markdown-review-2026-10-07` by default; `MARKDOWN_REVIEW_OUTPUT` and `PW_CHROME_PATH` can override the output directory and browser executable.

## Findings: preservation and data flow

- [x] [ID:md-format-autosave] **P1 — Formatting-only edits bypass chapter autosave and disappear on chapter switching.**

  **Location:** [editor.js](../../js/markdown/editor.js), lines 95–122, 141–174 and 866–873; [files.js](../../js/markdown/files.js), lines 397–416; [workbooks.js](../../js/markdown/workbooks.js), lines 1223–1249.

  **Reproduce:** Open a saved chapter, wait beyond the one-time 1.2-second restoration check, select its text and click Bold without typing. After 1.1 seconds, the textarea and draft contain `**ORIGINAL a**`, but IndexedDB contains `ORIGINAL a`, `wbDirty` is false and no pending marker exists. Open another chapter, then return: the formatting is gone and the journal has been overwritten. `setRangeText` records undo but emits no input event; many actions call only preview/status updates. The restoration timer can accidentally hide this defect in tests performed immediately after load.

  **Correction/verification:** Every document mutation, including formatting, inserted links/images/tables/code and Tab indentation, must participate in autosave. Verify persistence and chapter switching after startup has settled, without requiring a subsequent typed character.

  **Verified:** The existing shared `editor.setRangeText` override journals and schedules autosave for programmatic edits. `mdautosave.js`, `mdundo.js`, `wbsaveall.js`, and `wbresume.js` pass with the installed Chrome. The reload test's copied-page fixture now resolves assets from the repository root. See [verification details](2026-10-07-markdown-evidence/autosave-verification.md).

- [ ] [ID:md-failed-store-navigation] **P1 — A failed store write clears the dirty flag and permits leaving the chapter, destroying its recovery draft.**

  **Location:** [workbooks.js](../../js/markdown/workbooks.js), `flushChapter`, `saveToWorkbook`, `openChapter`, `canLeaveEditor` and `loadChapterIntoEditor`.

  **Reproduce:** Reject a chapter write with `QuotaExceededError`, edit A, flush and open B. The error is displayed, but `wbDirty` was already set to false; opening B replaces the single draft journal. Reload and open A: its original text returns and the failed edit has no surviving copy. Both autosave and explicit save clear dirty state before the store confirms success.

  **Correction/verification:** Retain failed edits and retry state; a failed flush must prevent destructive navigation or preserve a recoverable independent draft before navigation proceeds. Verify quota/aborted-write failure followed by switch and reload.

- [ ] [ID:md-import-replaces-edits] **P1 — Opening a Markdown file replaces existing work without flushing or guarding it. DOCX replacement also drops pending chapter edits.**

  **Location:** [files.js](../../js/markdown/files.js), `handleFileOpen` (lines 12–24), `handleDocxImport` (lines 36–56); [workbooks.js](../../js/markdown/workbooks.js), `detachChapter`.

  **Reproduce:** Type `LOST EDIT A` into attached chapter A and open `incoming.md` before the 800ms autosave. The importer replaces the textarea, detaches A and cancels its timer. IndexedDB still contains `ORIGINAL a`; the journal now contains only the imported file. A loose draft is similarly replaced with no confirmation. DOCX asks to replace but does not first preserve the attached chapter's pending text.

  **Correction/verification:** Resolve preservation before replacing the editor and do not proceed after a failed flush. Test attached and loose text, delayed file reads, confirmed/canceled DOCX replacement and storage failure.

- [ ] [ID:md-mirror-failure-markers] **P1 — Failed folder saves clear pending markers and can claim that chapters were saved.**

  **Location:** [workbooks.js](../../js/markdown/workbooks.js), `wbMirrorWrite`, `saveToWorkbook`, `saveAllModifiedChapters`, `syncAllToFolder`, `confirmSaveToWorkbook`; [idea.js](../../js/markdown/idea.js), `ideaAppendTo`.

  **Reproduce:** Set folder mode and make `createWritable` fail. “Save all modified” reports `1 modified chapter saved` and empties pending state although nothing reached disk. With denied folder access, folder sync reports zero chapters written but also clears every pending marker. The mirror helper catches errors and returns null, so the caller's try/catch cannot detect failure. Individual save and idea filing also unconditionally clear markers.

  **Correction/verification:** Distinguish successful mirror writes, intentionally local-only saves, and failed requested folder writes. Clear only confirmed mirrored versions and report partial failure accurately. Test permission denial, disk/quota error and unavailable folder, then retry after reload.

- [ ] [ID:md-rename-failed-copy] **P1 — Rename removes the old mirror even when writing its replacement failed.**

  **Location:** [workbooks.js](../../js/markdown/workbooks.js), `renameWorkbook` (lines 906–923) and `renameChapter` (lines 1002–1016).

  **Reproduce:** Make the new file's writable fail and rename A. The record moves to `Renamed.md` and `removeEntry('a.md')` still executes. Workbook rename repeats this for each chapter. The IndexedDB copy remains, but the previous external copy is deleted without a replacement.

  **Correction/verification:** Remove the source only after a confirmed destination write; retain recoverable correspondence and pending state on failure. Verify failed and partially successful chapter/workbook renames.

- [ ] [ID:md-save-version-race] **P1 — An older save completing after a newer edit clears the newer edit's pending marker.**

  **Location:** [workbooks.js](../../js/markdown/workbooks.js), `saveToWorkbook` and the unconditional `wbPendingClear` calls in save/sync paths.

  **Reproduce:** Start saving `FIRST VERSION` and hold the mirror write. Type and autosave `SECOND VERSION`, then complete the first write. IndexedDB contains the second version; the mirror received the first. Pending state nevertheless becomes empty and the status says the first file was saved. Failure handling alone will not fix this race.

  **Correction/verification:** Tie write completion and marker clearing to the exact saved revision. Verify edits arriving during delayed saves and full-folder syncs remain pending until that version is mirrored.

- [ ] [ID:md-multi-tab-overwrite] **P1 — Two editor tabs silently overwrite each other's chapters.**

  **Location:** [workbooks.js](../../js/markdown/workbooks.js), `wbPersist`, `flushChapter`; [idea.js](../../js/markdown/idea.js), `loadWorkbooks` and the storage listener.

  **Reproduce:** Open the same saved chapter in two same-origin tabs. Save `TAB A NEWER` in A, then type in B's stale document. IndexedDB becomes `TAB B STALE EDIT` while A still displays its own version. There is no revision check, owner coordination or refresh for ordinary Markdown-tab writes; the storage listener handles only Kanban changes. Closing/switching can subsequently replace the only recovery journal too.

  **Correction/verification:** Detect stale writes and preserve the competing text before overwrite. Test two real same-origin contexts/pages, including edits, reload and background/foreground transitions.

- [ ] [ID:md-drive-failed-download] **P1 — A failed chapter download removes that remote chapter from the next Drive manifest.**

  **Location:** [drive.js](../../js/markdown/drive.js), `cloudSync`, chapter download and `outChaps` construction (lines 372–432).

  **Reproduce:** Return a valid manifest containing a remote-only chapter A, then fail its body download with a transient error. Sync skips A and uploads a manifest containing only local B. A's Drive file may still exist, but ordinary sync can no longer discover it because its index entry has been dropped. A local older copy also risks replacing remote metadata with older metadata after download failure.

  **Correction/verification:** Abort publication or preserve untouched remote entries when required downloads fail. Verify retry discovers the same chapter without duplicates or metadata regression.

- [ ] [ID:md-drive-unreadable-manifest] **P1 — An unreadable or malformed Drive manifest is treated as an empty workspace and overwritten.**

  **Location:** [drive.js](../../js/markdown/drive.js), `cloudSync`, lines 291–301 and 435–441.

  **Reproduce:** Have manifest lookup succeed, then return `{invalid` from its download. The broad catch leaves the empty default manifest in place; sync creates local exports and writes a replacement index over the existing one. The same catch covers a failed manifest download. Remote-only records and tombstones are omitted, breaking discovery and deletion history.

  **Correction/verification:** Distinguish “no manifest exists” from “existing manifest could not be read/validated”; the latter must not publish a replacement. Verify transient failure, invalid JSON, unsupported schema and successful retry.

- [ ] [ID:md-drive-pull-edit-race] **P1 — A delayed Drive pull overwrites edits typed while its download is in flight.**

  **Location:** [drive.js](../../js/markdown/drive.js), `cloudSync` lines 374–391; [workbooks.js](../../js/markdown/workbooks.js), `loadChapterIntoEditor`.

  **Reproduce:** Hold a newer remote chapter's download, type `NEW LOCAL WHILE SYNCING`, then return `REMOTE BODY`. The pull does not recheck the local editor/revision. It replaces the record, calls `loadChapterIntoEditor`, cancels the local autosave and writes `REMOTE BODY` into the journal. Both the visible edit and its recovery copy disappear. This also resets local undo history.

  **Correction/verification:** Revalidate the local revision after asynchronous downloads; preserve both versions when local work changed. Test a slow pull with typing, formatting and chapter switching during the request.

- [ ] [ID:md-cloud-mirror-name-collision] **P1 — Independently created cloud notes can acquire the same local mirror path and overwrite each other on folder sync.**

  **Location:** [drive.js](../../js/markdown/drive.js), remote workbook/chapter adoption; [workbooks.js](../../js/markdown/workbooks.js), `wbUniqueFolder`, `wbUniqueFile`, `wbMirrorWrite`.

  **Reproduce:** Local workbook `Review` contains `a.md`; pull a different workbook ID also named/foldered `Review`, with another chapter ID using `a.md`. Both records survive in IndexedDB but both map to `Review/a.md` with different bodies. The full mirror pass writes the same file twice. This is plausible when two offline devices independently create the same workbook/chapter names. Local creation's uniqueness checks do not run during cloud adoption.

  **Correction/verification:** Preserve distinct, stable mirror ownership on remote adoption and renaming. Verify same-name workbooks/chapters from independent device IDs reach separate disk files and survive reload/repeated sync.

- [ ] [ID:md-active-content-injection] **P1 — Markdown span attributes execute JavaScript in the editor's origin.**

  **Location:** [markdown.js](../../js/markdown/markdown.js), `parseMarkdown` lines 887–894 and `updatePreview`'s `innerHTML` assignment.

  **Reproduce:** Preview `<span onmouseover="window.reviewExecuted=1">hover</span>` and hover its text. The marker becomes `1`. The parser escapes raw HTML, then restores arbitrary span attributes instead of restricting them to supported formatting styles. An imported or synchronized note can therefore run code with access to same-origin notes and stored service credentials. The shared export parser retains this active markup too.

  **Correction/verification:** Permit only the intended formatting attributes/styles and reject event handlers and unsafe URLs throughout rendering/export. Verify malicious imported, synchronized and exported content while preserving supported color/highlight/font-size spans. The proof here used only a harmless local marker.

- [ ] [ID:md-dictation-destination] **P1 — A delayed transcription is inserted into whichever chapter is currently in the editor, rather than the chapter that was recorded.**

  **Location:** [dictation.js](../../js/markdown/dictation.js), `target`, `beginInsert`, `enqueue`, `pump`, `emit`.

  **Reproduce:** Record for A, stop, hold the transcription response, open B, then return `SPOKEN FOR CHAPTER A`. The probe autosaves that phrase in B; A remains unchanged. Queue items carry audio/extension but no chapter/session destination. Starting another dictation session can also change the shared target and insertion state while previous requests remain pending.

  **Correction/verification:** Bind pending transcription to its recording destination/session and handle navigation explicitly. Verify delayed responses after chapter changes, idea filing/closure and another recording; no text should be silently misfiled.

- [ ] [ID:md-loose-draft-storage-failure] **P1 — Failure of the loose-file draft journal is silent and loses all loose text on reload.**

  **Location:** [workbooks.js](../../js/markdown/workbooks.js), `wbDraftWrite` lines 305–313 and `scheduleAutosave` lines 1223–1229.

  **Reproduce:** Reject `localStorage.setItem('scula:md:draft', …)` with `QuotaExceededError`, type into an unattached file and wait. No storage failure appears in the status. Reload: the editor is empty. A loose file has no IndexedDB chapter fallback. The embedded-image workflow makes localStorage quota a practical concern, not just an artificial failure.

  **Correction/verification:** Keep editing usable but surface that recovery is unavailable and preserve an alternative recovery/export route. Verify blocked storage and quota failure on loose files containing text and embedded images.

- [ ] [ID:md-idea-save-input-race] **P2 — Quick idea saving clears text entered after the save started.**

  **Location:** [idea.js](../../js/markdown/idea.js), `saveIdea` and `ideaSaveNow` lines 312–334.

  **Reproduce:** Submit `FIRST IDEA`, delay its store write, and enter `SECOND IDEA` while saving. On completion, only the first idea is filed; the box becomes empty and closes, discarding the second. `ideaSaving` prevents duplicate submissions but does not protect input entered after the saved snapshot.

  **Correction/verification:** Preserve edits made during an in-flight submission, or clearly lock the submitted input until completion. Verify delayed successful and failed submissions followed by more typing/dictation.

- [ ] [ID:md-export-stale-editor] **P2 — Chapter export can omit the latest visible edits.**

  **Location:** [workbooks.js](../../js/markdown/workbooks.js), `exportChapter` lines 1151–1157.

  **Reproduce:** Edit the current chapter and immediately use its chapter-row export action. Captured output contains `ORIGINAL a` while the textarea contains `LATEST EDIT`. Export reads `ch.content` without using the active editor snapshot or flushing. Formatting-only edits from the first finding can remain missing indefinitely.

  **Correction/verification:** Export the latest active chapter text even when persistence is delayed or failed. Test immediate export after typing/formatting and export of an inactive chapter.

## Findings: UI, accessibility and workflow

- [ ] [ID:md-mobile-writing-space] **P2 — The default expanded mobile toolbar can leave no usable writing area.**

  **Location:** [index.html](../../index.html), toolbar/mobile rules around lines 1248–1415; [editor.js](../../js/markdown/editor.js), `initToolbarCollapse`.

  **Evidence:** At 390×844 the toolbar is 354px tall and the workspace only 182px. At 320×640 the workspace measures **0px**, with a 411–418px toolbar; at 844×390 landscape the workspace is 51–78px. Users must discover and collapse ☰ before normal writing. After collapse, the measured workspace recovers to 491px at 390 and 287px at 320. The save strip can remain visible as specified while this is corrected.

  **Correction/verification:** Ensure a useful writing area exists on first mobile load and after opening formatting tools, including short landscape and keyboard-reduced viewports. Keep access to all accepted controls. See [390px expanded](2026-10-07-markdown-evidence/ui-390-ro.png), [320px expanded](2026-10-07-markdown-evidence/ui-320-ro.png) and [390px collapsed](2026-10-07-markdown-evidence/ui-390-collapsed.png).

- [ ] [ID:md-chrome-contrast] **P2 — Small functional labels and status text fail the documented contrast target.**

  **Location:** [index.html](../../index.html), `--text-3`, `.panel-title`, `.tb-label`, `.file-name`, `#wb-where`, `#wb-cloud-where`, `#status-bar` and status/importance colors.

  **Evidence:** `#5A6A60` text contrasts at **2.62:1** on `#1B2A22`, **2.30:1** on `#22342A`, and **2.93:1** on `#14201A`. It is used for enabled 10–11px labels, filenames and local/sync statuses, not merely disabled controls. Terracotta `#C4643C` on the page background is **4.18:1** and on the surface **3.74:1**, below 4.5:1 for ordinary small text; tinted vital-pill backgrounds need separate checking. Conversely, body text is **14.49:1**, secondary surface text **6.76:1**, and primary-button text **8.21:1**.

  **Correction/verification:** Improve functional text/status colors against their actual backgrounds and retain distinct importance/error meaning. Verify normal, hover, selected and warning states; keep genuinely disabled/decorative elements separate from active labels.

- [ ] [ID:md-touch-targets] **P2 — Frequently used mobile controls are substantially smaller than the repository's 44px touch-target floor.**

  **Location:** [index.html](../../index.html), phone `.btn`, `.tb-btn`, `.tb-select`, `.tb-color-control input` and close-control rules.

  **Evidence:** On the 390px touch viewport, header/save buttons are about 27–28px high, and some compact actions are also narrower than 44px. Toolbar color inputs remain 20×20px. These are active primary operations and tightly adjacent; the larger workbook-row padding does not correct their targets. The ≤420px rule reduces some button text to 10px as well.

  **Correction/verification:** Provide adequate actual hit areas and spacing without recreating the writing-space failure. Measure touch hitboxes, not just glyph dimensions, at 320/390px in both languages.

- [ ] [ID:md-collapsed-toolbar-focus] **P2 — Collapsed toolbar controls remain in keyboard navigation while invisible.**

  **Location:** [index.html](../../index.html), `.toolbar.collapsed .toolbar-groups`; [editor.js](../../js/markdown/editor.js), `toggleToolbarCollapse`.

  **Reproduce:** Collapse ☰ at 390px, focus the toggle and press Tab. Focus moves to `#heading-select` inside a group with opacity `0` and max-height `0`. The probe found 29 enabled tabbable buttons/selects still inside the hidden group. Keyboard users must pass through invisible controls and can accidentally activate formatting.

  **Correction/verification:** Remove collapsed descendants from interaction/accessibility navigation and restore them when expanded. Verify forward/reverse Tab, focus recovery and toggle expanded-state announcement.

- [ ] [ID:md-modal-editor-shortcuts] **P2 — Editing shortcuts in ordinary dialogs mutate the document behind the dialog.**

  **Location:** [events.js](../../js/markdown/events.js), global shortcut handler, particularly lines 124–149.

  **Reproduce:** Open Insert link, focus a link input and press Ctrl+B. The main document changes from `ORIGINAL a` to `ORIGINAL a**text**`, and focus is pulled to the editor. Idea, diagram and sketch have special guards; image/link/table/workbook fields do not receive the same isolation for several shortcuts. This is both an unexpected workflow interruption and a hidden document edit.

  **Correction/verification:** Apply editor shortcuts only when the editor owns the action; retain appropriate dialog shortcuts. Verify Ctrl+B/I/K, heading/importance shortcuts, line movement and save while focus is in each dialog field.

- [ ] [ID:md-workbook-modal-escape] **P2 — Escape does not dismiss the save-to-workbook dialog.**

  **Location:** [events.js](../../js/markdown/events.js), Escape handler; [workbooks.js](../../js/markdown/workbooks.js), `closeWorkbookModal`.

  **Reproduce:** Open Save to workbook for a loose file, focus its input and press Escape. `#workbook-modal` remains open. Its close function is omitted from the shared Escape handler despite the documented “Esc closes the open window” workflow.

  **Correction/verification:** Dismiss the dialog consistently and return focus to its invoking control without changing the loose draft. Verify Escape at each field and cancellation after validation errors.

- [ ] [ID:md-dialog-focus-semantics] **P2 — Ordinary dialogs lack modal semantics and allow focus to leave the visible dialog.**

  **Location:** [index.html](../../index.html), image/workbook/idea/link/table/help/wiki modal markup; their open/close functions in [files.js](../../js/markdown/files.js), [editor.js](../../js/markdown/editor.js) and [workbooks.js](../../js/markdown/workbooks.js).

  **Reproduce:** Tab through Insert link: focus exits the still-open dialog to the body/background. Link and workbook overlays have no `role="dialog"`, `aria-modal` or associated accessible dialog title. Diagram/sketch already demonstrate working focus containment, and welcome/Gantt have semantic markup, so treatment is inconsistent.

  **Correction/verification:** Provide accessible names/semantics, focus containment and return to the invoking control for ordinary dialogs. Verify Tab/Shift+Tab, close, stacked UI and screen-reader navigation.

- [ ] [ID:md-markdown-export-shortcut] **P2 — The documented Ctrl+Shift+S “export file” shortcut has no implementation.**

  **Location:** [events.js](../../js/markdown/events.js), save shortcut handling; [i18n.js](../../js/markdown/i18n.js), help lines 447 and 898; [README.md](../../README.md), editor shortcut table.

  **Evidence:** The handler tests lowercase `e.key === 's'` for workbook save but has no Shift+S export branch. A normal Ctrl+Shift+S event produces uppercase `S` and is not handled. There is no matching editor-file export function in that handler. A user following help cannot export a loose Markdown draft directly through the promised shortcut and instead must discover the workbook/chapter export workflow.

  **Correction/verification:** Implement the documented export using the latest editor text and shared save route, or explicitly resolve the documentation/product contract. Verify RO/EN help and ordinary keyboard events, including loose drafts and canceled sharing.

## Finding: verification coverage

- [ ] [ID:md-resume-test-fixture] **P2 — The reload/restoration regression suite cannot execute its restored-text cases after the script extraction.**

  **Location:** [tests/wbresume.js](../../tests/wbresume.js), `openRestored` lines 84–90; relative script tags in [index.html](../../index.html).

  **Evidence:** The suite passes its first six checks, then exits with `ReferenceError: wbAll is not defined`. It copies `index.html` into `tests/.restored.html` without rewriting the extracted `js/markdown/...` script URLs, which consequently resolve under `tests/js/markdown/`. The intended restoration, ahead/behind journal, loose-file and late-restoration checks never finish.

  **Correction/verification:** Keep the restored fixture's assets resolving to the real application, then run the complete suite through all recovery cases. Extend preservation coverage with the failures identified above instead of treating the initial green checks as a completed recovery verification.

## Validation results

| Check | Result |
| --- | --- |
| `PW_CHROME_PATH=/usr/bin/google-chrome-stable npx playwright test --reporter=line` | **256 passed**, 3.8 minutes. Covers the registered diagram/sketch, dictation and desktop-header task suites. |
| `node tests/verify.js` | Passed: JavaScript parses, all nine shared nav blocks match, diacritics check passes. |
| Standalone `wbsaveall`, `wbrename`, `wbadopt`, `mdundo`, `paste`, `dictate`, `gantt`, `find`, `taskstatus`, `gdsync` | All passed using system Chrome. These happy-path checks do not establish the failure/concurrency guarantees exercised by the probes. |
| `node tests/wbresume.js` | Failed after six passing checks with `wbAll is not defined` in the copied fixture; see `md-resume-test-fixture`. |
| `node tests/idea.js` | One failure: “Idea button is right of New”; Help now sits between them. All other checks passed. This known placement assertion does not invalidate the observed idea-routing behavior. |
| `node tests/nav.js` | Three failures: desktop “preview too” while smooth scrolling back upward; phone “click shows preview”; phone “leaves source/keyboard alone.” Remaining checks passed. See the contract/timing note below. |
| Adversarial probes | **21 behavior scenarios plus the RO/EN layout matrix completed without harness errors**. Observed defective states are retained in [observations.json](2026-10-07-markdown-evidence/observations.json); they are evidence of failures, not passing regression assertions. |

The probes seed artificial text only. Source inspection additionally established the missing export shortcut, the copy-before-remove ordering, the unsafe export markup, and related call sites listed in the findings. No failing requirement or finding has been marked complete. Product code remains unchanged.

## Design and contract notes

- [Desktop evidence](2026-10-07-markdown-evidence/ui-1366-en.png) shows coherent surfaces, legible body typography and a clear primary save action. The repeated header/save/formatting bands, mixed emoji/glyph controls and numerous equally weighted actions make the interface feel dense. A broad visual redesign is not assumed necessary; the concrete space, contrast, hit-area and focus findings are the immediate corrections supported by evidence.
- At 1025px with default side panels, each source/preview pane is only about 271px wide. The controls fit, but writing wraps aggressively. This is a usability tradeoff rather than a failed desktop-overflow requirement; a responsive change to default panel visibility would need an explicit product decision.
- The current folder contract intentionally imports **new** files only, then overwrites known chapter files from IndexedDB. External edits to an already-known `.md` are therefore replaced during sync; “Sync to folder” is not a bidirectional conflict-preserving merge. This follows § E and is a documented preservation limitation, not an undisclosed bug fix task.
- Drive's accepted “newest timestamp wins” contract does not preserve competing device versions or protect against clock skew. Independent client manifest writes also have no remote compare-and-swap. These are architectural limits to the claimed preservation model; the findings above concern additional demonstrable loss beyond choosing one newest version.
- The draft journal is one shared entry, and actual writes during normal editing are debounced by 700ms, despite § E describing each editor change as synchronously journaled. Lifecycle events attempt a synchronous write, but abrupt process/device loss before the debounce remains an unverified gap. No claim of crash-proof recovery is warranted.
- The old “Tasks only” button/bool/function still described in README and parts of § E have been replaced by task-state selection in the implementation. The newer task-state sections and current tests reflect the select. Treat this as a contract inconsistency when planning fixes; do not recreate a retired control solely to satisfy stale prose.
- `tests/nav.js` also conflicts with a source comment deliberately keeping mobile navigation on Source. Its phone assertions alone do not establish whether that product decision should be reversed. The desktop smooth-scroll assertion needs timing-aware diagnosis before it is accepted as a product defect.
- No real phones, mobile OS keyboard/share sheets, disk-full hardware, live cloud accounts or real speech accuracy were tested. Chromium viewport/touch emulation establishes the geometry and scripted transitions, not physical-device behavior. The newer dictation implementation also adds RO/EN fallback requests beyond the earlier no-forced-language specification; reconcile that historical specification with the current accepted documentation rather than treating the older request shape as the only truth.

# Song Creation — next implementation instructions for Codex/Astra

Prepared: 2026-10-04  
Repository: https://github.com/adinaMiron/sculaLuMiron  
Primary baseline: `docs/SONG-IMPLEMENTATION-STATUS.md`, reviewed 2026-10-04, referencing source snapshot `a3382e37a0d6eb6862a635c6a822eaebead28f14`.

This document is a ready-to-use implementation prompt plus a sequenced roadmap. The status report and selected repository instructions/test documentation/workflow were read to prepare it. No application or tests were executed during preparation, and this is not an independent source-code audit. Recheck the current checkout before modifying anything.

## Ready-to-paste task

You are working on the existing `adinaMiron/sculaLuMiron` repository using Codex/Astra.

Evolve the existing Song Creation / Creează melodie page. Do not recreate it or repeat the initial Song-page implementation. Execute **Milestone A only** in this task. The later milestones below are the roadmap, not authorization to implement them all in one session.

### 1. Inspect and establish the actual baseline

Follow applicable `AGENTS.md` files and repository instructions. Read `CLAUDE.md`, `docs/SONG-IMPLEMENTATION-STATUS.md`, relevant Song entries in `docs/MAP.md` and `docs/FEATURES.md`, `.claude/skills/app-change/SKILL.md`, and relevant sections of `tests/README.md`. Locate symbols before reading narrow implementation ranges. Do not read entire large HTML files.

Inspect the current branch, commit, working tree and existing changes. Preserve unrelated work. Check whether this milestone has already been partly implemented since the status report. Produce a short gap list with source references; implement only confirmed remaining gaps.

Use the established test commands and dependencies. App runtime constraints and test tooling are separate: retain the plain browser application without a build step or new runtime dependencies, while reusing existing locked test dependencies where present. Resolve stale documentation from actual files rather than assuming every instruction is current.

### 2. Preserve the implemented baseline

According to the status report, these features already exist:

- Multiple projects and immutable original WAVs, microphone PCM24 capture, WAV import and IndexedDB persistence/recovery.
- Bounded monophonic humming analysis, measured/interpreted contours, editable notes, quantization and undo/redo.
- Snapshot-based arrangements with Lead, Chords, Bass and Drums; synthesis and WAV/MIDI export.
- Recorded instrument sample sets, pitch/dynamic mapping, editable playback boundaries and sustain loops.
- Whole-song sections, repeats, mix overrides, playback/seek, loops and WAV/MIDI export.
- Separate JSON/WAV backups with bounded validation, SHA-256 verification and independent restored projects.
- RO/EN UI, phone layouts and shared `ScuLaFolder` save routing.

Do not replace these systems with a new architecture. Keep raw evidence, edited melody, composition/arrangement versions, sample playback metadata and original audio distinct. Keep schema compatibility and original source bytes. Do not introduce Python, Basic Pitch, librosa, sfizz, an ML service, a framework or downloaded sample libraries during Milestone A.

## Milestone A — protect work and close verification gaps

Implementation note (2026-10-04): this milestone is implemented on
`codex/song-milestone-a`; see the updated status report and tests README for
behavior, executed results and hardware limits. The requirements below remain
the acceptance reference. Milestone B is the next separate implementation task.

The goal is to recover captured audio after an unexpected page exit, prevent silent competing-tab overwrites, and make CI accurately cover the current Song functionality.

### A1. Make the regression baseline explicit

- Inventory Song tests and distinguish browser tests, unit tests and any runner requiring external human recordings.
- Run `node tests/verify.js` and relevant Song/shared Voice regressions before edits when practical. Record existing failures separately from introduced failures.
- Update `.github/workflows/song.yml` to cover the missing deterministic regression suites. The workflow inspected during preparation omits `song-evaluation`, `song-samples`, `song-sample-browser` and `song-timeline`; verify the latest version before editing.
- Do not run a human-corpus evaluator without its input manifest. Its deterministic regression test and a real-corpus evaluation are different checks.
- Ensure normal changes merged into `main` receive appropriate CI coverage. The inspected push trigger names only `codex/finish-song-analysis-wip`. Add scoped `main` push coverage while retaining useful existing triggers and avoiding duplicate/unrelated work where practical.
- Include relevant helper, test-runner and test-dependency changes in workflow path filters. Preserve read-only workflow permissions.
- Fix the tests README claim that all suites run if it is inaccurate. Do not equate the presence of a test with a passing execution.

Acceptance: the workflow and tests documentation agree; every included deterministic suite is actually invoked; commands and results are reported without invented passes.

### A2. Add a recoverable active-recording journal

Inspect `start`, `stop`, `makeTap`, PCM block folding, `persist`, and the existing storage failure/retry path. Reuse those paths.

- Persist completed PCM chunks periodically while recording, together with the information needed to reconstruct a valid WAV: capture ID, project/take identity, sample rate, channel count, encoding, sequence/frame counts and available recording metadata.
- Use a bounded native browser-storage design. Do not store audio/base64 in localStorage or retain a second unbounded copy in memory.
- Persist each chunk and its checkpoint consistently. Recover only verified committed chunks in sequence; identify a missing sequence rather than silently joining unrelated audio.
- On reopening the page, offer a translated recovery panel for unfinished captures: preview if practical, recover as a new interrupted take, export recovered audio, or discard with confirmation.
- Reconstruct a correct RIFF/WAVE header from the committed payload. Preserve the captured PCM samples; do not normalize or resample during recovery.
- Make normal Stop idempotent with respect to journal finalization. Publish the finished take and clear its journal only after a successful durable commit. Failure must leave a retryable/exportable result.
- Avoid duplicate recovered takes after repeated reloads or retries. A capture/finalization identity should let the application recognize an already published recovery.
- Treat quota failures as visible failures. Reuse the existing retained-audio warning/export/retry behavior; do not claim durability when a checkpoint failed.
- Do not depend on asynchronous `beforeunload` writes completing. Document that only successfully committed chunks are recoverable, and that microphone interruption or device/browser failure can still lose audio since the last checkpoint.
- Keep pending journals out of regular completed-project backups unless explicitly modeled and validated. Existing backup formats must remain readable.

Inspect whether the database requires a versioned upgrade/new store. If it does, implement the upgrade narrowly, handle blocked upgrades visibly, and add an old-database migration test. Do not delete/recreate the user's database to migrate it.

Acceptance: simulated abrupt page/context closure after a known durable checkpoint yields a recoverable take with the expected PCM frames and header; ordinary Stop leaves one take and no stale journal; failed writes/finalization remain recoverable; repeated recovery does not duplicate audio.

### A3. Prevent competing tabs from overwriting projects

The status report says simultaneous-tab merging is absent. Implement a simple explicit single-writer policy; do not build automatic merging in this milestone.

- Inspect storage revision handling and use a browser-native coordination mechanism consistent with supported contexts. Web Locks/BroadcastChannel may help where available, but correctness must not rely only on advisory messages.
- Use an atomic persisted revision/ownership check to reject stale writes. Cover project edits, recordings, sample settings, arrangement/timeline mutations and recovery operations.
- Show RO/EN read-only or conflict status in a second tab and provide a safe reload/takeover path. Preserve pending local work and export access when conflicts occur.
- Handle owner-tab closure, suspended tabs, unavailable coordination APIs and stale owners without silently assuming that a timer proves exclusive ownership.
- Never replace a newer stored project with stale in-memory state. Reuse storage transactions; do not hold an IndexedDB transaction open while awaiting unrelated asynchronous work.

Acceptance: two contexts sharing one origin/database cannot silently overwrite each other; the loser retains its unsaved work with clear recovery/export options; closing the writer allows safe subsequent editing.

### A4. Verify, document and review

Add meaningful tests for the new failure/recovery behaviors rather than tests that merely mirror helper implementation. Include:

- Recovery frame order, final WAV dimensions and decoded/byte-level PCM comparisons.
- Page termination after committed chunks, partial/checkpoint failure, quota failure, retry, discard and duplicate recovery prevention.
- Normal Stop and interrupted capture finalization.
- Existing database upgrade and blocked upgrade behavior if the schema changes.
- Concurrent edits and stale writes through two same-origin tabs/contexts, plus unavailable coordination APIs.
- RO/EN messages and phone-width recovery controls.
- Existing JSON/WAV restore, source immutability and Voice/shared-audio regression coverage.

Run the affected suites and the expanded CI-equivalent Song/shared Voice suite. Perform a separate review for races, journal deletion before durability, stale-tab writes, source mutation, resource leaks, quota handling and stale documentation. Fix findings and rerun affected checks.

Update `docs/SONG-IMPLEMENTATION-STATUS.md`, relevant `docs/FEATURES.md`/`docs/MAP.md` sections and test documentation. Add a concise manual test procedure for real microphones and phones; mark those checks unexecuted unless they were actually performed on hardware. Preserve shared navigation synchronization if touched.

Work autonomously through this milestone. Ask only for a genuinely blocking product choice. Do not commit, push, merge or publish unless separately authorized. Do not use multiple agents unless explicitly authorized by the user or applicable repository instructions.

Completion report: implemented gaps, changed files, recovery/concurrency guarantees and limits, schema compatibility, actual commands/results, unexecuted hardware checks, review findings fixed, and the next recommended milestone.

## Subsequent roadmap — separate implementation tasks

### Milestone B — bounded arrangement/song rendering

Implementation note (2026-10-04): implemented from `c0d29a2`. See
[rendering budgets and behavior](SONG-RENDERING.md) and the status report for
verification and the deliberate long-preview/offline-export distinction.
Milestone C remains a separate task requiring consented human recordings.

The report says bounded source analysis and backup inspection already exist, but full stereo mixes still allocate in memory. Fix this before increasing song lengths or adding large instrument packs.

- Measure the current allocation path. At 44.1 kHz, two Float32 channels for 20 minutes require about 404 MiB for the final buffer alone, before sources, temporary buffers and encoded output.
- Design chunked rendering/export with explicit memory budgets, progress and cancellation. Retain deterministic seeded synthesis, sample loops, section tempo/key, release/reverb tails and mix overrides.
- Consider real-time scheduled playback separately from offline export. Do not require the entire rendered song for a seekable preview.
- Preserve current exact loop-slice semantics. Global peak attenuation requires a deliberate two-pass or equivalent bounded strategy; independently normalizing each chunk would change the mix and create level discontinuities.
- Use `ScuLaFolder` for outputs. Where direct streaming is unsupported, state a conservative fallback/limit rather than promise identical memory behavior on every phone.
- Compare short reference renders against the current implementation, especially chunk boundaries, tail overlap, seeking, loops and MIDI/audio duration. Add memory-budget instrumentation instead of allocating giant fixtures merely to test a cap.

Acceptance: documented peak working-memory limits, responsive cancellation, no boundary discontinuities, preserved mix/loop behavior, and graceful unsupported/oversized export handling.

### Milestone C — establish accuracy on real humming

The report documents generated-signal checks, but no labeled human humming corpus. Improve measured real-world accuracy before adding an ML dependency.

- Use the existing `tests/song-evaluate.js` manifest and evaluator; inspect its supported metrics before extending it.
- Create a consented, redistributable evaluation set with independent manual labels: varied registers/timbres, breathy/quiet notes, slides, vibrato, repeated pitches, pauses, rubato, background noise and phone microphones.
- Never publish private user recordings by default. If recordings are unavailable, prepare the capture/annotation protocol and report the evaluation as blocked by missing data; synthetic tests cannot establish human accuracy.
- Separate tuning and held-out recordings. Record baseline pitch/note accuracy, octave errors, missed/extra notes, onset/offset errors and analysis time.
- Define acceptance thresholds from the baseline and intended editing experience. Keep raw evidence immutable and analyzer versions/backward compatibility explicit.
- Improve segmentation/confidence handling based on failure cases; present ambiguous tempo/key alternatives rather than claiming certainty from short melodies.

Acceptance: reproducible human-corpus results with labels/licensing provenance, baseline versus new measurements, held-out outcomes and honest remaining failure cases.

### Milestone D — realistic sample instruments and performance interpretation

Existing project sample playback is implemented; reuse it as the starting point. Four-part synthesis alone does not establish realistic piano, guitar, strings or winds.

- First inspect the sample renderer's current sustain, envelope, pitch-shift and mapping semantics. Extend the established instrument representation rather than replacing it.
- Add a versioned instrument manifest with source URL/version, exact license text/identifier, attribution requirements, sample hashes, mapping and provenance. Review code, samples and model weights separately.
- Design downloadable/importable optional packs with size checks, cancellation and offline storage. Begin with one small curated instrument; do not download multi-gigabyte libraries automatically.
- Preserve original project WAVs and keep imported pack assets separate. Specify how backups resolve/reference external packs and what happens if a pack is unavailable.
- Do not claim complete SFZ support without an explicit supported-opcode contract and tests. A limited project-native sample map may be the appropriate first step.
- Add instrument-aware performance rules incrementally: piano note-off/pedal and decay; guitar playable range/voicing and pluck decay; sustained winds/strings attack, breath/bow phrasing and suitable expression. Do not apply identical vocal vibrato to every instrument.
- Preserve reproducibility through generator/renderer versioning and deterministic seeds. Make fallback to synthesis visible.
- Review browser/file-context feasibility before proposing sfizz/WASM. Adding an engine or ML dependency requires a separate deliberate architecture/licensing decision.

Acceptance: one genuinely improved instrument with documented provenance, repeatable rendering, sane download/memory behavior, source immutability and convincing audition comparisons. Expand families only after this vertical slice works.

### Milestone E — composition and arrangement control

The current engine already generates diatonic chords, bass, drums and four parts. Add control and musical development, not another generic arrangement button.

- Expose editable chord choices/harmonic rhythm, alternatives with melody compatibility, bass patterns and drum variation/fills.
- Support explicit meter beyond the current 4/4 ruler, with matching generation, timeline, snapping and MIDI events.
- Add a small number of meaningful style presets that change voicing, rhythm, density and instrumentation while preserving the composition.
- Treat human timing and quantization separately; keep original performance timing available.
- Support section development and alternate melodies without silently rewriting arrangement snapshots. Decide snapshot versus live-link semantics explicitly, especially sample-set edits that currently change historical rendered sound.
- Preserve legacy projects and generator versions. Add musical constraints and deterministic fixtures for each new rule.

Acceptance: editable, reproducible musical decisions with audible differences and consistent timeline/export behavior.

### Milestone F — portable projects and expressive interchange

- Add a self-contained backup archive after memory-bounded export is available. Inspect and reuse the existing `transfer.html` store-only ZIP implementation if suitable; do not duplicate it blindly or claim ZIP64/large-file support it lacks.
- Keep existing JSON plus WAV import/export supported. Validate archive paths, counts, byte limits and integrity; stage validation before atomically publishing the restored project.
- Consider continuous pitch-bend MIDI as a separate task. Specify bend range, reset behavior and channel allocation for overlapping notes; one channel-wide bend cannot represent unrelated simultaneous contours. Document integer-note fallback.
- Add MusicXML only after defining supported notation, meter/tuplet/quantization semantics. Preserve richer performance evidence in project JSON.
- Add optional disk mirroring only through existing folder capabilities, with explicit permission/failure handling and honest mobile limitations.

Acceptance: portable restoration preserving audio and musical values, bounded archive processing and backward compatibility; expressive exports state their representational limits.

## Suggested order

1. A: recovery, competing-tab protection and CI.
2. B: bounded rendering, accompanied by real-device capture/playback checks.
3. C: human humming evaluation and targeted analysis improvements.
4. D: one realistic sample instrument, then expand.
5. E: richer composition/arrangement controls.
6. F: portable archives and richer interchange.

Human recording collection for C can begin while A/B are implemented. Missing hardware/data should be recorded as a verification gap, not replaced by a claim based on Chromium emulation.

## Repository placement

Suggested repository path: `docs/SONG-NEXT-IMPLEMENTATION.md`. Link it from the Song section of `docs/MAP.md` or the repository's established task index so future agents can discover it. Keep the status report factual and this document forward-looking. Update checked-off work only after implementation and verification.

## Sources inspected

- https://github.com/adinaMiron/sculaLuMiron/blob/main/docs/SONG-IMPLEMENTATION-STATUS.md
- https://github.com/adinaMiron/sculaLuMiron/blob/main/CLAUDE.md
- https://github.com/adinaMiron/sculaLuMiron/blob/main/tests/README.md
- https://github.com/adinaMiron/sculaLuMiron/blob/main/.github/workflows/song.yml

These are mutable `main` references. The implementing agent must use the current checkout as its authority and record its actual starting commit.

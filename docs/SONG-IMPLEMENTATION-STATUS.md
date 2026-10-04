# Song Creation — implementation status

Reviewed: 2026-10-04  
Repository: [adinaMiron/sculaLuMiron](https://github.com/adinaMiron/sculaLuMiron)  
Original review snapshot: [a3382e37a0d6eb6862a635c6a822eaebead28f14](https://github.com/adinaMiron/sculaLuMiron/commit/a3382e37a0d6eb6862a635c6a822eaebead28f14)

The original review was documentation/source inspection only. Milestone A was
implemented from checkout `616f70d17366bb37f42b825a21c9fb9a98798ccb` on branch
`codex/song-milestone-a`. Its verification results are recorded below separately
from the original review; hardware checks remain unexecuted.

## Current scope

Song Creation / Creează melodie implements the complete workflow from original recordings to a composed instrumental song:

1. Create a project and record or import humming and instrument samples.
2. Extract a musical performance and manually edit its melody.
3. Create separate instrumental arrangement versions.
4. Assemble arrangement versions into a whole-song timeline.
5. Play and export sources, melodies, arrangements, songs and loops.
6. Export and restore project metadata plus its original WAV files.

The central design is separation of the original source WAV, detected musical evidence, editable notes, arrangement snapshots and timeline sections. Derived processing does not overwrite the original recording.

| Area | Implemented |
| --- | --- |
| Project workspace | Multiple named projects, selection, rename and local persistence |
| Source recordings | Microphone capture, WAV import, playback, rename, confirmed deletion and original WAV export |
| Melody | Humming analysis, evidence/contour display, note editing, quantization, undo/redo and MIDI |
| Arrangements | Saved melody snapshots, four instrumental parts, version selection, playback and WAV/MIDI |
| Samples | Instrument sets, pitch/dynamic mapping, waveform timing editor, sustain loops and audition |
| Whole song | Linked sections, repeats, order, mix overrides, seekable playback and WAV/MIDI |
| Song loops | Full/section/custom loops, editable boundaries, snapping and loop WAV/MIDI |
| Backups | JSON/WAV validation, SHA-256 verification, independent restored projects and storage recovery |
| UI | Romanian/English controls, shared navigation, dark styling and responsive phone layouts |

## 1. Project workspace and storage

- Create, open/select and rename projects containing multiple takes.
- Classify takes as melody/humming or instrument sample.
- Store sample instrument, descriptive note, optional MIDI note, articulation, dynamics and free notes.
- Play original takes, show their duration/audio details and waveform, rename them, delete with confirmation and export their WAV.
- Persist project metadata and WAV Blobs separately in IndexedDB `scula-song`, database version 2, using `projects` and `audio` stores plus `workspace`, `captures` and `captureChunks`. The in-place upgrade preserves old projects and source bytes.
- Commit metadata and audio changes through an atomic transaction.
- Retain pending audio and edits in memory when storage fails, show a persistent warning and offer **Retry local storage**. Exports remain available when their source audio is available.
- Keep only small preferences in localStorage, including active project and microphone selection. Audio is not stored there.
- Checkpoint completed PCM Blobs approximately every five seconds, with atomic chunk/checkpoint publication, contiguous-sequence validation, and RO/EN recovery/export/confirmed discard controls.
- Complete takes and delete journals in the same atomic transaction. Stable capture/take IDs prevent duplicate recovery/retry. Failed checkpoints and finalization preserve earlier durable chunks and exportable in-page audio.
- Use a database-wide single writer and atomic ownership/revision checks for project/audio writes; capture append/discard also check ownership. Competing tabs are read-only, stale writes retain local work for export, and explicit takeover reloads latest storage after confirmation when local work is pending.
- Use Web Locks to detect closed cooperating owners and BroadcastChannel/focus for prompt status. Without these APIs, the persisted fence still rejects stale writes; stale ownership may need explicit takeover. No timer proves exclusive ownership.

Project schema version is 1. Projects contain recordings, optional performances, arrangement versions and a timeline. The reserved `derivedAssets` arrays are currently empty; rendered mixes are temporary or exported files.

Implementation: [song.html](../song.html), especially `openDB`, `persist`, `newProject`, `render` and `blobFor`.

## 2. Original WAV capture and import

### Microphone recording

- Request a preferred 48 kHz input and stereo where available, with echo cancellation, noise suppression and automatic gain control disabled.
- Enumerate microphones after permission, remember selection and recover from an expired/unplugged selected device by retrying the default input. Permission denial is reported without automatic retry.
- Display reported input settings separately from the actual Web Audio/WAV sample rate and channel count.
- Prefer an AudioWorklet that packs 4096-frame PCM blocks off the UI thread. Flush the final partial block at Stop.
- Fall back to ScriptProcessor when the worklet cannot load, and identify the backend in the UI.
- Capture actual mono/stereo input rather than manufacture stereo from mono.
- Write 24-bit signed integer PCM WAV with correct interleaving, RIFF dimensions and padding.
- Provide a live level meter, elapsed time, peak waveform and clipping warning.
- Request a screen wake lock when supported. Retain received audio and mark the take interrupted if the input ends or the context suspends.
- Fold PCM into Blobs approximately every five seconds and stop before exceeding RIFF's size limit.

No application normalization, denoising, trimming, pitch correction, effects or resampling modifies the captured master. Browser/device resampling can still occur if input and context rates differ. PCM24 is the file encoding, not a claim about microphone hardware resolution.

### WAV import

Accept mono/stereo integer PCM16/24/32 or float32 WAV at 8–192 kHz. Validate RIFF structure, format/data dimensions and padding. Imported takes retain their original File/Blob bytes, including extra chunks and original encoding. The selected purpose supports both humming and instrument samples.

Implementation: [pcm.js](../js/audio/pcm.js), [performance.js](../js/audio/performance.js), and `makeTap`, `start`, `stop`, `importWav` in [song.html](../song.html).

## 3. Humming analysis and editable melody

### Analysis

- Extract melody from a recorded/imported take, with visible progress and cancellation.
- Reject analysis beyond 180 seconds while retaining the complete source.
- Decode source data using at most 64 KiB reads into a capped 22.05 kHz mono analysis buffer, with low-pass resampling.
- Estimate pitch, attacks, tempo/phase and key using the shared analysis helper.
- Save raw pitch frames and measured dynamics separately from interpreted pitch and detected notes.
- Version 2 interpretation repairs isolated octave readings supported by neighboring frames, merges qualifying short returning slides, preserves clearly periodic quiet phrases and separates repeated notes when measured attacks support a boundary.
- Estimate note cents, confidence, velocity, dynamics, vibrato, legato and attack/release durations.
- Retain an existing performance after canceled/failed reanalysis. Ask before reanalysis replaces edited notes.
- Allow silence to produce an empty performance that can receive manual notes.

### Editing

- Display a piano roll with interpreted, measured or hidden voice contour, plus detected note boundaries.
- Edit MIDI pitch, onset, offset, cents and velocity in a table.
- Add/delete notes and restore detected notes with confirmation.
- Keep detected analysis unchanged while editing a separate note list.
- Edit tempo and quantization grid; select original/edited or quantized timing. Quantized timing is stored separately.
- Keep up to 40 in-session undo/redo states per take.
- Preview edited melody with a synthetic triangle tone.
- Export format 0 MIDI using selected timing, integer pitch and velocity; include full evidence and edited notes in project JSON.

Performance schema is 1; the current helper/analyzer is version 2. Older analyzer version 1 performances remain readable and restorable. Cents and expression remain in JSON; the melody MIDI does not export continuous pitch bends.

Implementation: [analysis.js](../js/audio/analysis.js), [performance.js](../js/audio/performance.js), `analyzeTake`, `performanceEditor`, `previewMelody` and `exportMidi`.

## 4. Instrumental arrangement versions

- Create numbered arrangement versions from a snapshot of the current edited performance.
- Preserve source recording, asset and performance IDs and snapshot provenance.
- Select older versions. Later melody edits/reanalysis do not silently change their snapshots.
- Edit arrangement tempo (40–220 BPM), key/mode and original/quantized timing.
- Generate four parts: **Lead, Chords, Bass and Drums**.
- Give each part independent instrument, enabled/mute and volume controls.
- Offer fourteen pitched synth instruments and standard, soft and electronic drum kits.
- Generate duration-weighted diatonic backing chords, instrument-dependent arpeggios/triads, root bass and kick/snare/hat patterns.
- Transpose the lead by key tonic difference while preserving edited melody relationships and cents.
- Display the four parts together in a colored roll.
- Render a 44.1 kHz stereo mix with panning, releases and reverb, seeded sounds and peak attenuation above 0.95.
- Cancel rendering/playback and release audio resources on Stop and relevant workspace/lifecycle changes.
- Export derived PCM16 stereo WAV and format 1 MIDI containing a metadata track plus four named part tracks, programs and CC7 volumes. Drums use MIDI channel 10.

Song adds acoustic-style piano, guitar, bass and distinct drum models to the shared synthesis kernel. The shared Voice helpers retain their separate behavior. Arrangements use schema/generator version 1. Editing arrangement controls regenerates that version; timeline sections linked to it follow the update.

Implementation: [arrangement.js](../js/audio/arrangement.js), [synthesis.js](../js/audio/synthesis.js), [song-instruments.js](../js/audio/song-instruments.js), and `arrangementEditor` / `arrangementAudio`.

## 5. Recorded instrument sample sets

- Group project sample takes by their Instrument field.
- Select a sample set independently for Lead, Chords and Bass; retain the synth instrument as fallback and MIDI program.
- Map to a nearby recorded MIDI pitch within five semitones and choose the closest dynamic layer among equal pitches.
- Pitch-shift sample playback for the target note/cents and apply velocity-dependent loudness.
- Edit Instrument, MIDI note and Dynamics after recording/import.
- View source peaks and drag playback-start, loop-start, loop-end and crossfade markers, or edit numeric timing fields.
- Configure one-shot playback or a sustain loop with crossfade and release.
- Audition the original recording or edited sample playback.
- Persist sample playback metadata without changing original WAV bytes.

Loops must fit the source and be at least 30 ms; crossfade is 1–100 ms and at most half the loop length; release is 10 ms–2 s. Missing, invalid, undecodable, distant or oversized samples (>64 MiB or 30 seconds) fall back to synthesis. Old projects use one-shot defaults.

Sample metadata edits affect every arrangement selecting that named set. Arrangement notes and MIDI remain fixed, but the rendered sound can change with sample settings.

Implementation: [arrangement.js](../js/audio/arrangement.js), `renderSampleSetEditor`, `arrangementSamples` and `auditionEditedSample`.

## 6. Whole-song timeline and loop editing

### Sections and playback

- Add named sections linked to any arrangement version from any take.
- Choose 1–16 repeats; reorder, duplicate and remove sections.
- Optionally override the four parts' enabled/volume values per section; otherwise inherit the linked arrangement's live mix.
- Keep 40 in-session timeline undo/redo snapshots per project.
- Show proportional section/repeat blocks, tempo/key, a 4/4 beat/bar ruler, playhead and elapsed/total time.
- Seek by overview click/tap, range control or **Play from here**.
- Join sections at musical duration and overlap preceding release/reverb tails.
- Preserve each section's tempo and key without stretching or forced transposition.
- Render/play/export the assembled stereo song, capped at 20 minutes plus its final 1.8-second audio tail.
- Export whole-song PCM16 stereo WAV or format 1 MIDI with section markers, tempo/key changes, programs, effective volumes and four part tracks.

### Loops

- Repeat the full song, a selected section with all repeats, or a custom time interval.
- Edit custom boundaries through overview markers, sliders, seconds or `mm:ss.mmm` fields.
- Set boundaries at the playhead through buttons or `I`/`O` shortcuts; support marker keyboard adjustments.
- Snap to section/repeat boundaries or musical beats.
- Export the selected loop as stereo WAV or multitrack MIDI.
- Produce an exact full-mix PCM slice by default; optionally apply a 5–100 ms fade to the exported loop WAV only.
- Start loop MIDI at tick zero, emit initial tempo/key/program/volume state and clip notes at the boundaries.

Timeline sections and mix overrides persist in JSON/backups. Playback position, loop mode/bounds, snapping, fade settings and undo history are page/session state and reset rather than travel in backups.

Implementation: [song-timeline.js](../js/audio/song-timeline.js), `renderSongTimeline`, `songAudio`, `songLoopBounds` and `exportSongLoopMidi`.

## 7. Exports and backup restoration

All saves use the shared `ScuLaFolder.save` routing. Desktop output is under:

```text
Song Creation/<safe-project-name>-<project-id>/
  recordings/    original humming WAVs
  samples/       original sample WAVs
  exports/       melody MIDI, arrangement WAV/MIDI, song/loop WAV/MIDI
  <project-stem>-project.json
```

Filenames include IDs; name components have a 60-byte UTF-8 budget. Phone share/download uses identifying filenames because nested folders cannot be enforced.

**Save metadata** exports source filenames/relative paths, analysis, edits, snapshots, arrangement controls, sample settings and timeline. WAVs are saved separately, not embedded in JSON. It recomputes SHA-256 for every complete source WAV and saves only a finished manifest; missing/unreadable audio blocks incomplete export.

Restoration implements:

- Separate JSON and multi-WAV file inputs, validation preview, explicit import and cancellation.
- Exact filename matching and rejection of missing/ambiguous files or inconsistent manifest references.
- Schema/version, IDs, timestamps, note structures, provenance, arrangement, sample and timeline validation.
- WAV dimension checks plus SHA-256 comparison where a digest is declared.
- Warnings for legacy/mixed backups whose sources lack digests.
- Bounded RIFF inspection (reads of at most 16 bytes) and incremental SHA-256 (64 KiB reads), with progress and cooperative cancellation.
- Preservation of selected original source bytes and musical values; no analysis or regeneration during restore.
- New project/recording/asset/performance/arrangement/section IDs with consistently remapped references. Repeated imports create independent projects.
- Atomic publication, in-memory recovery/export on failed storage, and retry.

Older projects without optional performance/arrangement/timeline fields are accepted. Unsupported versions and nonempty reserved `derivedAssets` are rejected. SHA-256 detects differences against the supplied manifest; it does not authenticate that manifest.

Implementation: [backup.js](../js/audio/backup.js), [integrity.js](../js/audio/integrity.js), `exportMetadata`, `validateBackup` and `restoreBackup`.

## 8. Existing verification coverage

The repository includes browser checks for recording/project/export behavior, editable performances, arrangements, sample editing, timeline/loops and backup restoration. Node checks cover analysis, evaluation, bounded decoding, lifecycle cancellation, synthesis fixtures, instruments, arrangement generation, sample mapping, RIFF inspection and hashing.

Representative files:

- [song.js](../tests/song.js), [song-performance.js](../tests/song-performance.js), [song-arrangement.js](../tests/song-arrangement.js).
- [song-sample-browser.js](../tests/song-sample-browser.js), [song-timeline.js](../tests/song-timeline.js), [song-backup-import.js](../tests/song-backup-import.js).
- [song-bounded-analysis.js](../tests/song-bounded-analysis.js), [song-integrity.js](../tests/song-integrity.js), [song-evaluation.js](../tests/song-evaluation.js).
- [Song GitHub Actions workflow](../.github/workflows/song.yml): runs the shared `tests/song-regressions.js` entry point for scoped pull requests and pushes to `main` and `codex/finish-song-analysis-wip`, with read-only permissions. Includes all deterministic Song suites, recovery/concurrency, Voice and melody; generated evaluation is distinct from the human-corpus runner.

Milestone A local verification (2026-10-04): all 19 pre-edit baseline checks
passed. The post-change CI-equivalent command
`PW_CHROME_PATH=/usr/bin/google-chrome-stable node tests/song-regressions.js`
exited 0: **all 20 suites passed**, including `verify`, all deterministic Song
checks, recovery/concurrency, Voice and melody. The static check confirmed JS
parsing, synchronized navigation and Romanian diacritics. `git diff --check`
also passed. After the final review edits, targeted reruns of
`node tests/verify.js`, `node tests/song-recovery.js` (15 scenarios) and
`node tests/song-arrangement.js`, with the same browser environment, all exited
0. These are local Chromium results; GitHub Actions was not run here.

A separate diff review checked ownership/revision races, journal deletion order,
source preservation, memory bounds, quota handling, resource cleanup and docs.
Findings fixed include the optional-Web-Crypto fallback, closed-channel cleanup,
mixed Web Locks support, delayed microphone permission after exit/takeover,
read-only playback Stop, long recovery names and recovery of a capture whose
project creation had failed. Existing simulated-page-exit tests now reload before
performing new edits. No source-audio processing or backup schema was replaced.
No human-corpus evaluation was run: no input manifest was supplied. Manual real
microphone/phone checks are listed in [tests README](../tests/README.md#manual-microphone-and-phone-checks-unexecuted).

A labeled-humming evaluator is implemented in [song-evaluate.js](../tests/song-evaluate.js). Documentation reports successful controlled generated-signal cases after version 2 segmentation changes, but no labeled human humming corpus is included. Real-world accuracy has not been established.

## 9. Current limitations and work not implemented

- No automatic disk mirroring or self-contained backup archive: export JSON and source WAVs separately.
- Recovery covers committed capture checkpoints only. Audio after the last successful checkpoint can be lost on page/browser/device interruption; storage eviction still removes local data.
- No simultaneous-tab merge. A single writer is enforced; takeover reloads saved state and pending local work must be exported before confirming its replacement.
- No persisted rendered derived assets; mixes are generated in memory.
- No polyphonic/accompanied transcription guarantee; analysis targets a single unaccompanied humming voice and may need manual edits.
- No continuous cents/expression pitch-bend export in MIDI; those values remain in JSON and, where rendered, audio.
- Full arrangement/song rendering still allocates stereo mixes in memory despite bounded source analysis and backup inspection.
- Background/mobile recording, real microphones, long sessions and phone memory limits still need manual validation. ScriptProcessor fallback may drop audio when the UI thread stalls.
- No new runtime framework, build step or downloaded instrument dependency is required; the page uses ordered plain scripts and browser APIs, including local-file use where supported.

## Source documentation

- [README — Song Creation](../README.md#song-creation-songhtml)
- [FEATURES — Song architecture and testing](FEATURES.md#v-song-creation-songhtml)
- [MAP — code navigation](MAP.md)

This file is a point-in-time status summary. The linked implementation and detailed feature documentation remain the references for exact behavior.

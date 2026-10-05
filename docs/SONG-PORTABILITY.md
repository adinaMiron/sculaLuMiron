# Song portable projects — Milestone F

Implemented from `3b7bf0ac791564e26170bc663d84472b2f37b410` (2026-10-05).
This delivery implements portable archives, preserves loose JSON/WAV backups,
adds optional folder snapshots, and states interchange limits. Continuous
pitch-bend MIDI and MusicXML remain separate, gated exporter work as described
in the roadmap; their proposed contracts are below, not shipped features.

## Saving and restoring

**Save ZIP backup** saves one store-only ZIP containing `project.json`, every
original source WAV under `recordings/` or `samples/`, and any referenced pinned
instrument pack under `pack/` (manifest, WAVs, license). Custom instrument samples
are source recordings and are included even when no current part uses them.
All arrangement versions, performances, raw/interpreted contours, sample edit
settings and timeline sections remain in JSON. Rendering is not required.
The original WAV bytes, including metadata chunks and padding, are preserved.
No remote URLs are fetched. A project referencing the optional piano pack must
have that pack installed before ZIP export; incomplete archives are refused.

Select **ZIP backup**, choose **Validate backup**, then **Import separate
project**. Selecting ZIP clears the loose-file selection and vice versa. Validation
does not publish projects, audio or packs. Imported entity IDs are freshly allocated;
relationships are remapped without regenerating musical values. The existing
JSON plus named WAV selection/export path remains supported, including legacy
backups without hashes (with its existing verification warning).

Project metadata and all source audio publish in the existing fenced IndexedDB
transaction. A failed transaction leaves persistent projects unchanged and keeps
the complete restored project/audio in memory for export or retry. The optional
pack uses its existing separate content-addressed cache: its verified, pinned
assets install only after the user presses Import, before project publication.
Pack installation failure leaves the project staged for retry. If the later
project commit fails, the valid pack can remain cached; this is not a cross-database
transaction. Without IndexedDB, archives without packs retain the established
in-memory recovery/export path; restoring a bundled pack requires its cache.

## Archive contract and budgets

| Property | Supported contract |
| --- | --- |
| Format | Classic ZIP, stored entries, UTF-8 names, fixed 1980-01-01 timestamp |
| Archive size | At most 512 MiB, including headers and central directory |
| Entry count | 1–256, including JSON and pack/license entries |
| Project JSON | At most 16 MiB UTF-8, parsed in memory |
| Entry path | At most 512 UTF-8 bytes, NFC, safe relative components |
| Payload processing | At most 64 KiB per read/write; cooperative cancellation |
| Download/share | At most 32 MiB through the existing shared saver |
| Larger exports | Backpressured writes to the chosen folder |

The writer adapts the inspected `transfer.html` `zipStore` header layout and
CRC-32 polynomial. Its whole-file `arrayBuffer()` collection was unsuitable for
Song. Transfer is otherwise unchanged. Song's helper computes CRCs incrementally,
retains source Blob references, then streams local headers, payload windows,
directory and end record. WAV SHA-256 export remains incremental and occurs in
a separate pass. These budgets describe JavaScript processing, not a promise
about browser-internal Blob/IndexedDB storage, OS caching or device memory.

Import reads bounded headers and validates the entire directory/local-header
layout before processing payloads. It rejects absolute/traversal/drive/backslash
paths, empty or dot components, controls, reserved filenames, trailing dots/spaces,
duplicate and case-colliding paths, malformed UTF-8, inconsistent sizes/offsets,
overlaps/gaps, symlinks/attributes, extra fields/comments, descriptors, compression,
encryption, multi-disk and ZIP64. It deliberately accepts the narrow format Song
writes; re-zipped third-party archives need not be accepted. Archive names must
match the manifest's exact relative paths. Missing or undeclared entries fail.

Every entry's CRC is checked. ZIP source WAVs must additionally declare matching
SHA-256 digests and pass existing bounded WAV and project validation. Bundled pack
bytes, manifest and license must match the pinned catalog. CRCs/digests detect
corruption; the archive is neither signed nor encrypted and does not authenticate
the person who supplied it. Cancellation discards staging or aborts an unfinished
folder write. Once final save/close starts, the cancel button is disabled.

## Optional disk copies

**Save ZIP to chosen folder** makes an explicit, one-way snapshot under the
project's `mirrors/` subfolder using `ScuLaFolder` and the current folder permission.
Each invocation creates a new filename; it never overwrites an earlier copy.
There is no background synchronization, automatic mirroring on every edit,
deletion propagation or restore-from-folder scan. The UI states this directly.

The shared stream saver accepts `requireFolder: true` for this action. Missing or
denied folder access fails without a download/share fallback; write failure aborts
the stream. All nine shared navigation copies contain the same small option check.
On mobile browsers without folder capabilities, use the regular ZIP share/download
route (32 MiB limit) or the existing separate JSON and source WAV exports.

## Expressive interchange boundary

Current MIDI is an integer-note fallback: note numbers, velocities and selected
original/quantized timing travel, with arrangement/song tempo, meter, key, instrument
program and mix events as currently implemented. Cents, continuous contours,
measured vibrato, attacks/releases and sample audio are not encoded as independent
expression. MIDI playback in another instrument is not a promise of the same sound.
JSON preserves that richer evidence; WAV preserves the rendered result.

For a future **separate pitch-bend exporter**, the proposed first contract is:

- An explicit opt-in mode; existing integer-note MIDI remains the default and
  fallback, without altering saved performances or arrangements.
- A declared ±2-semitone bend range, initialized on every allocated pitched channel.
  Out-of-range contours fall back for the whole affected note with a visible report;
  they are not silently clipped or wrapped.
- Each simultaneously active independent contour owns a distinct channel. Reserve
  the percussion channel; do not place unrelated overlapping contours on one
  channel-wide bend. Allocate in onset/ID order; exhaustion must be reported and
  fall back to an integer-only export, not silently detune other notes.
- Set the initial bend before note-on. Emit note-off before resetting to center,
  and reset before reusing the channel and at the export/loop end. Reused channels
  also need the correct instrument and mix state. Clipped loops start with the
  contour value at the clip boundary.
- Use interpreted, voiced contour evidence only within its associated note;
  unvoiced gaps and manually created notes use the edited note's constant cents.
  Specify edit/transposition/quantization mapping and event-rate/error bounds before
  implementation. Acceptance needs overlap, channel-exhaustion, clipping and reset
  fixtures plus verification in an independent MIDI reader/player.

For a future **MusicXML exporter**, notation must be explicitly narrower than the
performance model. The proposed first version is a quantized melody staff with
pitched notes, rests, ties across measures, tempo and key; support the app's current
2/4, 3/4, 4/4 and 6/8 meters with quarter-note BPM. Select a declared straight grid
(quarter/eighth/sixteenth/thirty-second) on a derived copy; never replace original
human timing. Reject ambiguous overlapping melody voices, unsupported tuplets and
durations that cannot be represented on that grid, with a report. Define pickup,
rest filling, enharmonic spelling and loop-boundary behavior before implementation.
Polyphonic parts, percussion notation, tuplets, articulations and engraving remain
outside that proposed initial scope. No MusicXML button/export is shipped yet.

## Verification

`tests/song-archive.js` checks independent Python `zipfile` interoperability,
Unicode/exact payloads, bounded reads/stream chunks, header/path/count/size attacks,
CRC corruption, unsupported ZIP features and cancellation. Python 3 is a test-only
requirement, already present on the Song CI runner.

`tests/song-archive-browser.js` drives the shipped controls: composition/timeline
round trips, exact WAVs, staging/remapping/reload, a valid CRC with stale SHA-256,
missing/extra/mismatched paths, loose-file compatibility, cancellation, project
and pack-cache quota failures/retry,
licensed pack bundling/install, folder permissions/backpressure/write failure,
collision-safe snapshot names, RO/EN phone layout and storage-unavailable export.
Both suites are included in `tests/song-regressions.js` and `tests/package.json`.
Real mobile sharing, physical disk-full behavior and device memory at the archive
limit still require device testing; browser stubs are not those measurements.

Resumed execution results (2026-10-05): both archive suites passed, including
the added pack-cache quota/retry case, and static verification passed. The full
runner passed 26/27 suites; `song-recovery` was killed with exit 137 on standalone
reruns and on the unchanged committed Song page. A complete green regression
run remains blocked; see the [status report](SONG-IMPLEMENTATION-STATUS.md)
for commands, baseline comparison and diagnostic log paths.

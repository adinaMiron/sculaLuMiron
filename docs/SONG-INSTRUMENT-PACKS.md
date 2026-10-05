# Song instrument packs — Milestone D

Implemented from `f726484`, 2026-10-05. This is a single piano implementation;
other instrument families and human listening acceptance remain future work.

## Existing semantics and the extension

Project sample sets already map nearest root pitch (at most five semitones),
then nearest named/numeric velocity. They resample with linear interpolation,
preserve stereo channels, apply a 3 ms attack and a configurable note-off
release, and optionally crossfade a sustain loop. Missing/invalid/unmapped
samples fall back to the chosen synthesizer. Those legacy rules and PCM output
remain unchanged. Project samples still belong to immutable source recordings.

The optional **Salamander Compact Piano** uses that same mapper and bounded
renderer. Its stricter map spans MIDI 45–87 (A2–D#6), with roots 48, 54, 60, 66,
72, 78 and 84, at most three semitones of transposition. Seven mono PCM16 WAVs
at 22,050 Hz retain up to six seconds of recorded decay, with a final 50 ms fade.
No sustain loop, vocal vibrato, synthesized replacement sample, or automatic
normalization is introduced. There is one recorded dynamic layer; velocity
changes amplitude, not sampled timbre. It is a compact audition instrument,
not the full Salamander library or a concert-piano emulation.

Piano performance v1 sets rendered cents to zero without editing saved notes,
evidence or performance snapshots. **Note-off damping** adds a smooth 180 ms
cosine damper release to natural decay. **Hold to bar end** extends each note's
end to the next 4/4 bar boundary, capped at the arrangement end. Repeated strikes
can overlap. There is no sympathetic resonance, half pedal, release-noise layer,
or automatic guitar/wind/string interpretation. The sample naturally ends after
its available decay, including when the pedal remains down. MIDI uses the same
held durations (baked note-offs, not CC64), including section/loop clipping.

## Provenance and license

- Original recordings: Alexander Holm's [Salamander Grand Piano v3](https://github.com/sfzinstruments/SalamanderGrandPiano), CC BY 3.0.
- Conversion source: [Tone.js audio at commit efd8296360f9526e379bfbe5c1698ff54d6a1d34](https://github.com/Tonejs/audio/tree/efd8296360f9526e379bfbe5c1698ff54d6a1d34/salamander).
- Each original MP3's URL and SHA-256, each resulting WAV's size and SHA-256,
  original author/version, exact license text, required attribution, mapping,
  renderer/performance versions and conversion command/tool version are in
  [manifest.json](../assets/song-packs/salamander-compact-v1/manifest.json).
- [LICENSE.txt](../assets/song-packs/salamander-compact-v1/LICENSE.txt) retains the
  complete CC BY 3.0 terms. Attribution and a license link appear in the page;
  pack transfer saves them with the samples. Redistribution of these modified
  samples must retain the attribution, license and modification notice.
- Code review: no Tone.js, SFZ engine, sfizz/WASM or third-party runtime code is
  imported. Model-weight review: no model weights. Browser code remains the
  project's plain scripts. FFmpeg was a one-time asset preparation tool, not an
  application dependency. This license review concerns samples separately from
  application code; it does not relicense the application.

The catalog script contains the manifest as literal data for `file://` use and
pins SHA-256 of its compact `JSON.stringify` form. Tests compare the catalog,
JSON, license and all seven actual asset hashes. The manifest's provenance
records the exact preparation command; hashes pin the delivered PCM regardless
of future converter changes. Never silently replace assets under this version.

## Installation, storage and bounds

The page loads metadata only on arrival. **Install piano** downloads same-origin
assets only on request. The seven shipped WAVs total 1,852,508 bytes (1.77 MiB).
Each response is streamed sequentially, with declared and actual byte limits;
missing/oversized/different data fails validation. Installation supports progress
and AbortController cancellation during fetch, hash validation and publication.
Page exit aborts pending installation. After all samples verify, one IndexedDB
transaction publishes the complete record in separate `scula-song-packs` v1,
`packs` store, keyed by manifest digest. Quota/transaction failure preserves any
previous installation and never exposes partial assets. Competing tabs can only
publish identical pinned assets; their project-writer fence remains independent.

On `file://`, fetch restrictions can block installation. Choose the supplied
`manifest.json` and seven WAVs from `assets/song-packs/salamander-compact-v1`
in the import controls. No directory picker, network or new browser permission
is required for this route. Imports accept only this v1 curated manifest and
exact sample bytes, ignoring JSON whitespace but preserving key order. Generic
third-party manifests, executable manifest fields, SFZ opcodes and model weights
are **not supported**. Extra/duplicate/missing filenames are rejected.

Encoded installation staging is capped at 2 MiB. Decoded piano storage is
3,704,400 bytes (3.53 MiB), shared by all selecting parts during one job. It uses
the existing total 16 MiB sample budget and checks remaining capacity **before**
allocating PCM. Decode reads one small WAV at a time; it does not resample into
an additional Web Audio buffer. Stored hashes are checked again before use.
The renderer retains the 24 MiB working-state/96-active-voice limits and existing
short-preview/long-scheduler/export rules in [SONG-RENDERING.md](SONG-RENDERING.md).
Browser/IndexedDB/Blob internals are not a measured RSS bound.

**Save pack for transfer** uses `ScuLaFolder.save` for manifest, WAVs and license.
This is a set of files, not an archive; download-only browsers may request
permission for multiple downloads. Removal affects only the optional local pack.
Offline playback survives reload while the browser retains storage; clearing
site data or storage eviction requires reinstalling. The page does not install
an offline service worker or promise that the whole hosted app is cached.

## References, backups and compatibility

Selecting the piano stores `parts.<part>.samplePack = {id, version, sha256}`,
`performanceVersion:1`, `pianoPedal:'off'|'bar'`, and arrangement
`rendererVersion:2`. It sets the MIDI/fallback instrument to piano and clears
that part's project `sampleSet`. Switching instruments removes the piano profile.
Arrangement `schemaVersion` and `generatorVersion` remain 1: generation is
unchanged; the new interpretation happens only while rendering/exporting.
Renderer v2 retains the old path when the new opt-in fields are absent.
The project database stays v2 with no migration. Existing Voice synthesis is
unchanged. Unsupported renderer/performance versions are rejected on restore.

Project JSON includes the pinned reference and performance settings, plus an
`instrumentPacks` credit list with source/version, full license and attribution
for known selected packs. Keep these credits when sharing rendered music. Source WAV
exports/backup inspection never mix in pack assets, so project backups remain
JSON plus original WAVs. Restore succeeds without the pack; reinstall the same
pack through download/import or transfer it separately. Missing, damaged,
unknown-digest, out-of-map or unsuitable samples use visible synthesized-piano
fallback. The notice also covers legacy project-sample fallbacks. Old clients
that predate packs can ignore these additive fields and synthesize instead;
use a Milestone D client for the pinned sound. No pack install edits a recording,
analysis, performance, arrangement notes or source blob.

## Verification and audition

`node tests/song-packs.js` covers the actual assets and license, no automatic
downloads, hash tampering, offline import/reload, progress cancellation,
response-size refusal, storage failure/retry, decoded-budget preflight,
source-byte preservation, pinned backup restore without assets, range fallback,
RO/EN phone controls and the shipped audition buttons. It compares PCM across
4096/512-frame render blocks exactly; natural note-off energy versus pedal-held
energy differs as expected; recorded and synthesized renders differ. These are
signal/behavior checks, not claims of listener preference. It runs in
`node tests/song-regressions.js` and the CI workflow watches pack assets.

Manual listening procedure (not executed on physical devices):

1. Install/import the pack; alternate **Audition recorded piano** and **Compare
   synthesized piano** at a comfortable level. Both use the same seven-note
   phrase, velocities, note-offs and mix. Check hammer transients, natural
   decays, root transitions and absence of clicks on headphones/speakers.
2. Select the piano on an arrangement lead/chord part. Compare damping against
   bar pedal on short notes, repeated strikes and bar boundaries. Check exported
   WAV against playback and baked MIDI note lengths in a DAW.
3. Disconnect the network and reload; audition again. Remove the pack and play
   the saved arrangement to check the fallback notice, then reinstall.
4. On an actual phone, repeat import/download/cancel, offline playback, transfer,
   competing playback and long arrangement export. Check memory responsiveness.

Physical phone/audio-device testing and independent listening preference remain
unexecuted. The paired audition controls make that acceptance review repeatable;
expand families only after it is satisfactory. Milestone C's missing human
recordings/labels remain a separate unresolved evaluation requirement.

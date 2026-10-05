# Song composition controls — Milestone E

Implemented from `a49bdb1` (2026-10-05). The application still uses plain scripts,
without a build step, new dependency or database migration.

## Using the controls

Create an arrangement from an edited melody, then choose **Compose a new copy**.
The new version exposes meter, harmony, voicing, density, bass, drums, fills and
lead octave controls. The earlier arrangement remains available in the version
picker. A legacy copy retains its chosen chords but uses the new accompaniment
rules; it is not a promise of identical rendered audio.

Choose one or two **Chord changes per bar**. Each slot offers Auto and seven
major/natural-minor diatonic triads, with their names and melody-match percentages.
An explicit choice remains in place across regeneration and style changes. Auto
uses the triad covering the greatest duration of overlapping melody notes, with
lower scale degree breaking ties. Silence displays “no melody” and defaults to
the tonic. Match measures chord-tone coverage, not aesthetic correctness or
confidence in the detected key. Chromatic chords and free chord durations are
outside this version's contract.

Splitting a bar duplicates its choice; merging keeps the first choice. Changing
meter retains choices in slot order. Choices past a shortened melody's end stay
in the metadata for a later longer version. The editor displays 16 slots per page.

| Preset | Voicing and density | Bass / drums | Instruments: lead, chords, bass, drums |
| --- | --- | --- | --- |
| Ballad | Open held triads | Held roots / sparse, final fill | Piano, strings, bass, soft kit |
| Folk | Close arpeggios on denominator beats | Root/fifth / backbeat, fourth/final fills | Flute, guitar, bass, soft kit |
| Pulse | Open arpeggios on half denominator beats | Chord-tone walk / driving, fourth/final fills | Synth, piano, bass, electronic kit |

Presets replace instrument/sample assignments and the listed accompaniment
settings. They preserve the melody snapshot, explicit chords, harmonic rhythm,
meter, tempo, key, original/quantized timing, part enabled/volume values and lead
octave. Every accompaniment setting can also be changed separately. The UI
explains the replacement before the preset selector is used.

## Meter, timing and exports

Supported meters are **2/4, 3/4, 4/4 and 6/8**. BPM always counts quarter notes.
The ruler, playhead's bar/beat display, beat snapping and arrangement roll use
denominator beats, so 6/8 has six eighth-note ticks per bar and two accented
groups of three. Musical duration rounds up to complete bars. Chord slots divide
each bar equally; thus two changes in 3/4 each last a dotted quarter.

Bass patterns use one root, two root/fifth events, or evenly spaced chord tones
within each harmonic slot. Drum patterns follow the meter; 6/8 places its backbeat
at the second dotted-quarter pulse. Fills replace hats/snares in the last pulse
with four rising-velocity snare strokes and retain kicks. “Every fourth and final
bar” is relative to the arrangement; repeating a section repeats that same fill.
Piano bar pedal releases at the selected meter's bar boundary.

Original performance timing, cents and velocity stay in the saved snapshot.
Selecting quantization affects generated note timing on a copy; returning to
Original restores the saved human intervals. Presets introduce no timing jitter
or swing. Octave/key changes outside MIDI 0–127 are rejected for generator 2.
Piano interpretation still deliberately uses fixed keyboard pitch.

Sections retain their own tempo/key/meter. Arrangement and song MIDI include
time-signature events; clipped loop MIDI emits the active meter at tick zero and
subsequent changes at the same musical boundaries as the audio. Composition MIDI
retains complete silent bar endings, even with all parts muted. WAV includes the
existing final 1.8-second sound tail; MIDI ends at the musical end, including when
a selected loop extends into that final audio-only tail. Pure legacy MIDI output
keeps its previous behavior. Bounded rendering and exact loop WAV slicing remain
unchanged; see [rendering limits](SONG-RENDERING.md).

## Versions, sections and sample links

An arrangement has a saved melody snapshot and editable composition controls.
Editing its controls updates all sections linked to that version; the UI says so.
**Duplicate section** retains that link. **Develop section independently** creates
and selects a new composition version, then links only that section to it. Timeline
undo/redo restores the link; it intentionally retains the new arrangement in the
version library. Existing section mix overrides survive copying.

For an alternate melody, edit notes in the take's melody editor and choose
**New copy with edited melody**. This explicitly captures the current performance
and its provenance in a new version, while copying the selected arrangement's
composition controls. Existing snapshots and timeline links remain unchanged.
The section version picker can also select arrangements from other takes.

Project sample sets remain **shared live links by name**, including mapping,
playback boundaries and loops. Copying an arrangement does not freeze these
settings or guarantee historical audio. Every arrangement displays this notice;
export WAV to preserve its sound. Optional instrument packs keep their existing
pinned version/hash references and visible synthesis fallback. Presets explicitly
clear sample selections when replacing instruments. Source WAV bytes never change.

## Persistence and compatibility

Project and arrangement `schemaVersion:1`, project database v2, backup format and
renderer versions remain supported unchanged. Existing `generatorVersion:1`
arrangements retain their generator. Composition copies use `generatorVersion:2`
and a `composition.version:1` object with:

```text
meter, style, harmonicRhythm, chordDegrees, voicing, density,
bassPattern, drumPattern, fills, leadOctave
```

`chordDegrees` is bounded to 8192 integers, 0 for Auto or 1–7 for a scale degree.
Generated chords retain `bar/root/q/tones` and add slot, start, duration, degree and
compatibility. Backup validation checks settings, chord slots/times, full-bar
duration and existing note/reference constraints. Restore remaps entity IDs and
preserves musical data without regeneration. Older pages lacking generator 2
reject these new versions rather than approximating them.

The existing busy state, writer/revision fence, atomic persistence, retained
in-memory export on storage failure and retry apply to composition edits/copies.
Prospective arrangements and timeline duration are validated before publication.

## Verification and manual checks

`node tests/song-composition.js` checks triads and duration-weighted compatibility,
explicit harmonic slots, bass/fill patterns, meter-aware pedal, timing restoration,
pitch bounds, source/snapshot immutability, 12 fixed meter/preset fingerprints,
mixed-tempo/meter MIDI and clipped loops, silent MIDI duration, exact PCM across
block sizes and audible differences between presets. The fixture may be refreshed
deliberately with `--write-fixture`; ordinary regression runs never rewrite it.

`node tests/song-composition-browser.js` exercises the shipped `file://` UI,
copies/alternate melodies, section undo/redo, presets/chords, meter ruler and snap,
exact loop WAV bytes, MIDI meter changes, invalid-edit rollback, reload, backup
validation/remapping, quota-failure export/retry, read-only composition controls,
immutable source exports and RO/EN at 390-pixel width.
Both suites are in the shared local/CI runner. See the status report for executed
full-suite results.

Physical-device and independent musical listening checks remain **unexecuted**:

1. On a phone and desktop, compare the three presets for the same melody, then
   change only the chord choice, bass pattern or fill and listen for that change.
2. Assemble 3/4 and 6/8 sections at different tempos. Check the audible pulse,
   ruler, seek/snap, repeat join and exported MIDI in a DAW.
3. Compare Original and Quantized with a rubato recording. Return to Original;
   check its phrasing and create an alternate melody without changing the first.
4. Develop one duplicated section. Edit a shared project sample and confirm the
   visible live-link behavior; use a WAV export for the historical sound.

These deterministic patterns are composition tools, not a claim of automatic
musical quality. Human humming accuracy remains the separate, data-blocked C task.

# Song humming evaluation — Milestone C

Prepared 2026-10-05 from checkout `2aa5c8e`. **Human evaluation is blocked by
missing consented recordings and independent labels.** This protocol and the
evaluation tooling are ready; no human baseline, improvement, acceptance
threshold or held-out result has been established. The analyzer remains v2.

## Collect recordings

Start with a pilot of at least 12 adult volunteers, aiming for eight tuning
participants and four held-out participants. This is a collection target, not
evidence of statistical sufficiency. Use pseudonymous participant IDs; assign
each person to one split before analysis, including every microphone/session
they contribute. A coordinator keeps held-out WAVs and labels separate from
the people tuning the analyzer. Never tune on the held-out results.

Record short unaccompanied humming phrases, typically 5–20 seconds, with leading
and trailing silence. Use original melodies or simple exercises whose reuse is
permitted. Avoid backing tracks and incidental speech or other identifiable
people. Cover the following across multiple participants and both splits:

| Condition | Capture instruction |
| --- | --- |
| Register/timbre | Comfortable low, middle and high phrases; record actual pitches, not a prescribed range |
| Quiet/breathy | A quiet phrase, and a loud phrase followed by a quiet one |
| Slides/vibrato | Returning slides, transitions between notes, and sustained vibrato |
| Repeated pitch | Distinct reattacks of one pitch, plus a continuous sustained note |
| Timing | Pauses, short/long notes, and freely timed rubato |
| Room/noise | Quiet room and a documented ordinary background-noise condition |
| Microphone | Desktop and actual phone microphone sessions, documenting device/browser |
| Silence | A room-noise-only take with an empty note list |

In Song, create a humming project, record, Stop, listen to the original, and
export the original WAV through the existing save controls. Retain the original
sample rate/channels and PCM bytes. Do not trim, normalize, denoise, resample or
export a synthesized melody as the reference. Record device, microphone,
browser/OS, room, distance, requested/reported capture settings, interruptions
and clipping in collection notes. Do not discard difficult cases merely because
the detector fails. Document any exclusions before measuring the candidate.

## Consent and provenance

Obtain explicit permission to record, evaluate and redistribute both the WAV
and its labels under a specified license, including any required attribution.
Keep the permission evidence privately with the custodian; put only an opaque
record reference in the manifest. A boolean is a declaration, not proof of
consent or a license grant. Record the actual applicable license identifier,
exact license text and approved pseudonymous attribution. Do not invent these
values or assume recording permission includes redistribution.

The corpus format below requires redistribution permission because this
milestone calls for a redistributable set. Keep private recordings outside the
repository; never publish audio, labels, reports or permission documents by
default. Reports copy manifest provenance, so review them for personal data too.
Preparing/evaluating files locally does not authorize committing or publishing
them. A second person should check provenance before any separate release.

## Label independently

1. Two people listen to the original WAV and inspect its waveform/spectrogram
   without viewing Song detections, contours or exported detected MIDI. A pitch
   reference may help; Song's analyzer output must not supply reference labels.
2. Mark each audible intended note with nearest integer MIDI pitch, onset and
   offset in seconds from the **original file start**, retaining leading silence.
   Use the audible voiced start/end consistently. Keep notes in onset order and
   label rearticulated repetitions separately. Silence uses `notes: []`.
3. Treat vibrato within a sustained intended pitch as one note. A returning
   ornament normally remains with that note; a distinct intended target becomes
   another note. Document ambiguous slides/attacks, the reviewers' disagreement
   and the adjudicated convention. Do not resolve ambiguity by matching Song.
4. The second annotator reviews all labels, especially octave and boundary
   decisions. Resolve disagreements before freezing the manifest. Preserve both
   independent drafts and adjudication notes outside the evaluator manifest.
   Notes it cannot represent fairly (for example overlapping voices) need a
   documented exclusion or a future separately versioned metric, not silent
   removal after seeing a score.
5. Freeze labels, corpus version, split assignment and SHA-256 of each complete
   original WAV. Store originals read-only where practical. Version label fixes
   and rerun both baseline and candidate on the same corrected labels.

## Manifest and runner

`node tests/song-evaluate.js /path/to/manifest.json` reads local WAVs and prints
one JSON report to stdout. No audio is uploaded or modified. Paths are relative
to the manifest (absolute paths also work). Legacy schema 1 remains accepted,
but is reported as evidence `unspecified`; its optional split/consent fields
are not validated. Use schema 2 for this human corpus.

This is a **shape example, not a recording or valid consent declaration**.
Replace all example values with independently collected facts and labels;
replace the hash with the 64 lowercase hex characters from `sha256sum take.wav`.
Add entries from different participants for both splits.

```json
{
  "schemaVersion": 2,
  "corpus": {"id": "song-humming-pilot", "version": "1"},
  "recordings": [{
    "id": "p01-session01-take01",
    "participantId": "p01",
    "split": "tuning",
    "wav": "audio/p01-session01-take01.wav",
    "sha256": "REPLACE_WITH_EXACT_WAV_SHA256",
    "microphone": "Actual device, microphone and browser/OS",
    "environment": "Actual room, noise and microphone distance",
    "tags": ["middle-register", "repeated-pitch", "phone"],
    "consent": {
      "evaluation": true,
      "redistribution": true,
      "record": "Private custodian reference, no personal information"
    },
    "license": {
      "id": "Actual granted license identifier",
      "text": "Exact applicable license text",
      "attribution": "Approved pseudonymous attribution"
    },
    "annotation": {
      "independent": true,
      "annotatorId": "labeler-a",
      "reviewerId": "labeler-b",
      "method": "Listening and spectrogram; adjudication record reference"
    },
    "notes": [
      {"midi": 60, "onset": 0.42, "offset": 0.91},
      {"midi": 60, "onset": 1.03, "offset": 1.48}
    ]
  }]
}
```

Schema 2 checks required provenance declarations, independent annotation with
a separate reviewer, allowed split names, unique recording IDs, valid notes,
WAV hash/format/duration and label bounds. It rejects the same participant or
identical WAV bytes across splits. It cannot verify consent, human origin,
review independence, aliases for the same person, or duplicates that have been
re-encoded. These checks cover the supplied manifest only; a coordinator must
review the complete collection for leakage before distributing separate manifests.
Single-split manifests work
so that tuning can run without loading held-out data. A missing split reports
`null`, never a successful held-out evaluation.

The evaluator keeps Song's supported WAV encodings and 180-second analysis cap.
It processes recordings sequentially, but its Node file loader reads each
complete WAV; this command is intended for short corpus takes, not a bounded
large-file import benchmark.

## Metrics and reproducibility

Reports use schema 2, keeping the existing `analyzerVersion` and `recordings`
fields and adding exact note-correct counts, provenance, full WAV/label hashes,
manifest hash, analyzer/helper/evaluator source hashes, runtime/CPU description,
analysis milliseconds, total audio seconds and analysis-to-audio time ratio.
Timing covers `P.analyze` (decode and analysis), excluding file loading, hashing,
the preliminary WAV inspection and scoring. It includes cooperative yielding
and varies with machine/load; timing is not a deterministic regression threshold.

`summary` combines the supplied recordings; `bySplit` keeps tuning and held-out
results separate. Use the split results for decisions, not a blended score.
Accuracy is weighted by reference-note count, timing error by matched pairs;
per-recording results remain available for participant and condition review.
Signed pair timing errors are rounded to four decimal seconds and their absolute
values feed aggregate timing error. Keep failures and count distributions visible.

The existing temporal alignment pairs notes in order without pitch matching.
Pitch accuracy requires ±0.5 semitone; note accuracy also requires both boundaries
within 50 ms. Unmatched references/detections count as missed/extra notes.
An octave error is a matched note ±12 semitones away. These are **note-level**
metrics, not frame-level pitch accuracy. Extra detections are reported separately
and do not reduce the reference-based accuracy denominator. An all-silent set
scores 1 only when no notes are detected; unmatched timing errors are `null`.

1. Freeze tuning inputs and save an initial report from the unchanged analyzer.
   Capture the checkout commit and working-tree diff alongside the report:
   source hashes distinguish analyzer changes even when a version is unchanged.
2. Inspect tuning failures and the manual corrections they would require. Set
   numerical candidate acceptance thresholds **after measuring that baseline,
   before candidate tuning and before opening held-out results**. Record minimum
   note/pitch accuracy, maxima for octave/missed/extra rates, onset/offset errors,
   analysis time, and tolerable per-participant/condition regressions. Do not
   invent thresholds without a baseline and the intended editing experience.
3. Change segmentation/confidence only for observed failure cases. Preserve raw
   evidence and source WAVs; deliberately version any analyzer behavior change
   and retain old performances. Run generated regressions and then the same
   frozen tuning inputs against baseline and candidate. Repeat timing runs under
   the same runtime and report their variability.
4. After freezing the candidate and thresholds, have the coordinator run baseline
   and candidate on held-out inputs. Compare matching WAV/label hashes, settings
   and evaluator-source hash; differing metric implementations need a new common
   evaluation, not a direct score comparison. Retain per-recording reports,
   condition/participant summaries, absolute metrics and candidate-minus-baseline
   deltas. Report all threshold failures and ambiguous cases. Do not retune on
   these participants and still call them held out.

For each run, redirect stdout to a report in the private corpus directory. Only
keep it as a valid report when the command exits 0 and its JSON parses; failures
emit an error on stderr and no report. Reports do not enforce candidate thresholds
or automatically compare two runs yet. No real-corpus command should be invoked
with fabricated inputs simply to claim this milestone passes.

## Current verification and next action

`node tests/song-evaluation.js` uses generated WAVs to test legacy compatibility,
provenance validation, split isolation, hashes, weighted summaries, timing fields,
unchanged WAV bytes and CLI success/failure. Its dummy consent declarations are
explicit test fixtures, never provenance for real recordings.

Next: collect and independently label the pilot, then measure the unchanged v2
baseline. Real microphone/phone collection, human accuracy, held-out outcomes and
data-driven segmentation/confidence changes remain unexecuted. Milestone C is
partial; this work does not authorize skipping ahead to instrument packs.

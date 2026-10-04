# Song rendering budgets and behavior

Milestone B, 2026-10-04. Starting checkout: `c0d29a2`.

## Allocation baseline

The previous arrangement renderer allocated full dry L/R and wet L/R arrays,
plus an uncapped cache of synthesized tones. The timeline renderer allocated
another full stereo pair and cached every distinct arrangement/mix. Playback
copied the final pair into an AudioBuffer; WAV encoding allocated a contiguous
PCM16 buffer. At 44.1 kHz, **20 minutes × 2 × 4 bytes = 423,360,000 bytes
(403.75 MiB)** for just one final stereo pair, excluding the 1.8-second tail.
These are allocation calculations from the old path, not measured browser RSS.

## Offline WAV rendering

`js/audio/song-renderer.js` uses stateful instrument generators and Schroeder
comb/allpass delay lines. Blocks contain at most 4096 frames per channel.
There is no duration-sized tone, wet buffer, arrangement cache or final mix.
Seeded oscillators/noise, sample interpolation/loops, note placement order and
Float32 rounding preserve the previous renderer's PCM. Section tempo/key and
mix overrides remain inputs to the saved arrangement; source WAVs never change.

The renderer first measures each distinct effective arrangement's peak, then
measures the assembled song with those arrangement gains. A final replay writes
PCM with the single measured song gain. This is three traversals in the general
case, trading CPU time for bounded audio memory without scratch storage. No
chunk is independently normalized. Quiet mixes remain quiet. Progress reports
peak measurement and output rendering separately; Stop cancels either phase.

Loop export scans the same full-song peaks, replays the contributing arrangement
states and emits only the rounded frame interval. PCM is exactly the slice of
the full-song export, including preceding release/reverb tails. Optional fades
use the same Float32 rounding and frame positions as before. MIDI is unchanged.

## Explicit limits

| Resource | Limit / accounting |
| --- | --- |
| Active synthesis/room pool | 24 MiB conservative reservation budget; `session.stats` exposes current and peak reserved bytes |
| Voices | Effective pitches from MIDI −12 through 139 (including cents); 96 across concurrently rendered sections; reserve 192 KiB per voice, including generator state and its block or drum one-shot |
| Active arrangements/tails | 16; reserve 128 KiB each for dry/wet blocks and delay lines |
| PCM blocks / output block | At most 4096 stereo Float32 frames (32 KiB) / 4096 stereo PCM16 frames (16 KiB); within remaining pool headroom |
| Decoded project sample cache | 16 MiB per job, reused across export passes and repeats |
| Each sample input | At most 16 MiB original bytes and 30 seconds; inspect dimensions before decoding; total projected decoded bytes checked before decode |
| Sample decode | Serial within a job; one source ArrayBuffer up to 16 MiB and one bounded decoded result in flight; browser decoder scratch is implementation-dependent |
| Short preview collector | At most 30 seconds at the page's 44.1 kHz (about 10.1 MiB stereo), plus its AudioBuffer copy |
| Long preview queue | At most one second plus one 4096-frame block; no whole-song peak pass or final buffer |
| Download/share fallback | At most 32 MiB encoded WAV; larger output requires a selected writable folder |
| Musical metadata | At most 20,000 enabled note events across effective variants and 5,000 expanded section/repeat instances; current project/backup metadata is separate |
| Song duration | Existing 20-minute musical limit plus 1.8-second final tail; not increased |

The pool is conservative reservation instrumentation, **not a browser heap/RSS
measurement**. Reachable rendering PCM/state is duration-independent; the
page's job sample cache adds at most 16 MiB. During decoding, another bounded
source buffer and decoded result can coexist. Short preview adds its bounded
collector and playback copy; fallback saving can retain 32 MiB of encoded Blob
parts (and the browser may copy Blob/File/share data). Native decoder, audio
engine, Blob backing, browser GC, existing recordings and metadata are outside
the pool counter. No identical total-process memory behavior is promised on
phones. Budget failures leave project data intact and show RO/EN guidance.
Invalid/missing/distant/over-individual-limit samples retain synthesis fallback;
exceeding the aggregate decoded-sample budget stops the render explicitly.

## Preview and seeking

Previews up to 30 seconds use the bounded collector and the exact export gains.
Longer previews schedule short AudioBufferSourceNodes ahead of the playhead,
with continuous timestamps across blocks and loop wraps. They render only
contributing sections and do not scan the rest of the song. Seeking replays
state from the start of the contributing arrangements, including preceding
tails. Thus a late seek into one long arrangement may need a cancellable wait;
it does not allocate that arrangement's complete audio.

**Long previews use a live peak compressor instead of offline measured gain.**
The status/hint explains this distinction. Loud passages may sound different
from exported WAVs; WAV and loop-export semantics remain exact. If synthesis
cannot keep ahead of the audio clock, playback stops with a translated message
instead of silently inserting gaps or accumulating buffers. Stop, seek, edits,
project changes, context suspension and page exit release scheduled nodes.
Hardware/background scheduling is not a real-time guarantee.

## Saving and failures

All output still uses `ScuLaFolder.save`. Its existing Blob route remains
compatible. A stream producer `{size,type,stream,check}` writes chunks directly
to the selected folder, awaiting each write for backpressure. Only successful
completion closes the writable. Failure/cancellation aborts it; an empty newly
created filename may remain, but partial audio is not reported as saved.
A streaming folder failure does not retry as a large download. Without a usable
folder, producers over 32 MiB fail before synthesis; smaller producers can use
the ordinary download/share route. Browser permission and disk errors remain
visible failures, not completed exports. All nine shared navigation blocks
include the identical save extension.

## Verification and manual gaps

`tests/fixtures/song-render-v1.js` retains the short full-buffer reference from
`c0d29a2`, only for testing. `song-bounded-render` compares encoded PCM for all
fourteen instruments, samples, tails, repeats, overrides, high peaks and exact
loop slices/fades. It instruments a 20-minute note without allocating a giant
final mix, checks cancellation/cleanup and enforces budget refusal.
`song-render-browser` exercises the shipped folder saver with a fake writable
handle (backpressure, abort/quota, cancellation, invalid paths), actual scheduled
Web Audio preview, long seeks/loops/Stop, and oversized fallback messages in
English/Romanian at phone width. Existing suites retain short-preview parity,
backup/source-byte, sample and Voice regression checks.

Still unexecuted on physical hardware: long-session browser RSS/GC profiling,
real filesystem disk-full and permission revocation, phone OS sharing/memory
pressure, audible long-preview underruns/limiter behavior, background suspension
and headphones/speakers. To check: build a 20-minute repeated song with samples,
export to a selected folder while recording browser memory, cancel mid-peak-pass
and mid-write, inspect the final/aborted file, then seek and loop on a phone in
both languages. Export a short loop for download/share and verify the large
fallback refusal. Listen at section joins and compare a loud preview to its WAV.

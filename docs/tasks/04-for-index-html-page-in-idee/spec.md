# task-04 — Dictation in `index.html` writes what was spoken, in the language it was spoken

## 0. What and why (read first)

Task text: *"For index.html page, in idee rapidă menu, when user speaks in
Romanian write in Romanian, when he speaks in English write in English.
Never translate!"*

Agreed with the product owner (binding):

1. Applies to **both** dictation entry points in `index.html`: the 💡 idea box
   (`#btn-idea-dictate` → `#idea-text`) **and** the main toolbar 🎤
   (`#btn-dictate` → `#editor`). They share one engine,
   `js/markdown/dictation.js`, so this is one change.
2. The owner dictates through **Groq** and mixes Romanian and English inside
   one dictation ("rom-gleza"). Every phrase must keep its own language.
   Romanian stays Romanian **with diacritics**, English stays English.
   **Nothing is ever translated.**
3. So the recording is **cut at natural pauses (~0.7 s of silence)** and
   **each phrase is sent to the transcription API on its own, with no
   `language` parameter**, so Whisper detects the language per phrase.
4. Each phrase's text is inserted **as soon as it comes back, in the order
   it was spoken** — text appears phrase by phrase while she is still
   talking, not all at once at stop.
5. Fragments shorter than **~0.5 s** of speech are **not sent**.
6. On Groq, `index.html` dictation **always uses `whisper-large-v3`**,
   whatever model the Caiet vocal page saved.
7. `index.html` dictation **always auto-detects** — the spoken-language
   choice saved on the Caiet vocal page (`S.lang`: ro/en/auto) is ignored
   by the API engine here.
8. **No RO/EN switch, no checkbox, no new settings UI.**
9. **`voice.html` is not changed** (not a byte).
10. Team decisions (made by the lead, binding for this task):
    - If Whisper returns text in a language other than Romanian/English, it
      is inserted **as transcribed**. No filtering, no re-request, no
      translation.
    - A phrase whose request fails does **not** stop the others: its place
      in the text is marked with the literal marker `[🎤 ?]` and a toast
      reports the failure (§ 6).
    - The browser "live" engine (`S.engine === "live"`, Web Speech API)
      keeps its current behaviour exactly (it cannot auto-detect; it still
      uses `S.lang`).

### Why no `prompt` is sent any more

Today `transcribe()` sends `prompt` = Caiet vocal hint + the last 400 chars
before the caret. Whisper's prompt is decoder context: a Romanian prompt
pushes an English phrase towards Romanian output (i.e. translation), and
vice versa. "Never translate" outranks the vocabulary hint, so **in
`index.html` the API request carries neither `prompt` nor `language`**.
`tailPrompt()` is deleted. `S.hint` is ignored here (voice.html still uses it).

### Why PCM + our own silence detection instead of MediaRecorder

Cutting at pauses needs sample-accurate boundaries, a pre-roll so the first
syllable isn't clipped, and dropping the silence. MediaRecorder chunks of
compressed Opus cannot be split into independently decodable files. So the
API engine captures PCM through Web Audio, segments it in JS, and uploads
each phrase as a small **16 kHz / 16-bit mono WAV** (32 KB per second —
a 10 s phrase is ~320 KB; Whisper resamples to 16 kHz internally anyway).

---

## 1. Files

| File | Change |
|---|---|
| `js/markdown/dictation.js` | The work. API engine rewritten to phrase mode (§§ 2–7). Live engine untouched. |
| `js/markdown/idea.js` | `closeIdeaModal()` (L140–143): replace the `toggleIdeaDictation()` line with the discard call in § 7.3. Nothing else. |
| `js/markdown/i18n.js` | New keys RO + EN (§ 8); both help paragraphs (RO L419, EN L844). |
| `tests/dictate.js` | Update to the new behaviour (§ 10) — it currently assumes one start/stop = one request and would break. |
| `docs/FEATURES.md` § J "Dictating into it" (~L1386) | Describe phrase mode, auto language, fixed model, no prompt, failure marker, discard-on-close. |
| `docs/MAP.md` L359 row | Add the new public names (`stopDictation`, `ScuLaDictation`). |
| `js/markdown/README.md` L24 | One-line description update. |
| `docs/I18N.md` | Only if it enumerates `dictate*` keys — then add the new ones. |

**Not touched:** `voice.html`, `index.html` (no markup/CSS change is needed;
the pill `#dictate-pill`, `#dictate-pill-state`, `#dictate-pill-interim`
already exist), the shared nav block, any other app. No new script tag, no
new dependency; do **not** load `js/audio/pcm.js` (it is 24-bit; we need
16-bit and write the 44-byte header ourselves).

The Tester will add a Playwright suite under
`tests/04-for-index-html-page-in-idee/` plus whatever tooling it needs
(`package.json` with a `test` script, `playwright.config.*`, `.gitignore`
entries). That is standing team policy and is allowed; the scope limits in
this spec apply to product code only.

---

## 2. Settings used by the API engine in `index.html`

`loadSettings()` is unchanged (still reads `caiet-vocal:settings`). What the
API path does with them:

| Setting | Use in index.html |
|---|---|
| `engine` | `"live"` → unchanged live engine. Anything else → phrase-mode API engine. |
| `provider`, `key`, `endpoint` | Unchanged (URL choice, `Authorization: Bearer`, the "no setup" check `S.provider === "custom" ? !S.endpoint : !S.key` → `fail(t("dictateNoSetup"))`). |
| `model` | `provider === "groq"` → **always `"whisper-large-v3"`**, `S.model` ignored. `openai`/`custom` → `S.model \|\| "whisper-large-v3"` (a Groq model name would 400 on OpenAI; the decision was Groq-specific). |
| `lang` | **Ignored** by the API engine. Never sent. (Live engine still uses it.) |
| `hint` | **Ignored** (see § 0). |
| `segMin` | **Ignored** (phrase cutting replaces segment rotation). |
| `tidy`, `tidyModel` | Honoured as today, but with the language-safe system prompt in § 5.2. |

Put the model rule in one function: `function modelFor(){ return S.provider === "groq" ? "whisper-large-v3" : (S.model || "whisper-large-v3"); }`

---

## 3. Capture (replaces `pickMime`, `startSegment`, `armRotation`, the MediaRecorder `rec` code)

`startApi()`:

1. If `window.AudioContext || window.webkitAudioContext` is missing →
   `fail(t("dictateNoRecorder"))`, return.
2. Setup check (unchanged) → `fail(t("dictateNoSetup"))`.
3. `getUserMedia({ audio:{ channelCount:1, echoCancellation:true,
   noiseSuppression:true, autoGainControl:true } })` (same constraints as
   today); on error `fail(t("dictateNoMic"))`.
4. `ctx = new AudioContext()` (native rate — do not pass `sampleRate`),
   `src = ctx.createMediaStreamSource(stream)`,
   `node = ctx.createScriptProcessor(2048, 1, 1)`;
   `node.onaudioprocess = ev => phraser.push(new Float32Array(ev.inputBuffer.getChannelData(0)))`
   (copy — the buffer is reused); `src.connect(node); node.connect(ctx.destination)`
   (the processor only runs when it reaches the destination; its output buffer
   is never written, so it outputs silence). `if(ctx.state === "suspended") ctx.resume()`.
   ScriptProcessor, not AudioWorklet — same reasoning as `voice.html:2384`:
   no module URL, works from `file://`, and dictation isn't latency-critical.
5. Create the session (§ 6.1), `phraser = makePhraser({ sampleRate: ctx.sampleRate, onPhrase })`,
   `setBtn(true)`, start the 1 s clock (`tickApi`) as today.

`stopApi()` (on the second 🎤 press):
`phraser.flush()` (sends a phrase in progress if it qualifies), disconnect
`node`/`src`, `ctx.close()`, stop all tracks, `setBtn(false)`, then pill per
§ 6.4. No 400 ms delayed track stop is needed any more — PCM is already in hand.

---

## 4. The phrase cutter — `makePhraser` (pure, no DOM, no Web Audio)

Signature: `makePhraser({ sampleRate, onPhrase })` → `{ push(float32Array), flush() }`.
`onPhrase(samples /* Float32Array at sampleRate */, info /* { index, startSec, voicedSec } */)`;
`index` is 1-based per phraser; `startSec` = time of the phrase's first
sample since the first `push`; `voicedSec` as defined below.

Constants (declare them together at the top of the section, these exact names/values):

```
PH_FRAME_MS   = 20     // analysis frame
PH_START_DB   = -50    // absolute floor for "speech starts"
PH_START_OVER = 10     // dB above noise floor to count as speech
PH_KEEP_DB    = -55    // absolute floor for "still speaking" (hysteresis)
PH_KEEP_OVER  = 6      // dB above noise floor to count as still speaking
PH_ONSET      = 3      // consecutive speech frames that start a phrase (60 ms)
PH_PREROLL_MS = 300    // audio kept before the onset
PH_PAUSE_MS   = 700    // silence that ends a phrase
PH_TAIL_MS    = 200    // silence kept after the last voiced frame
PH_MIN_MS     = 500    // shorter voiced span → not sent
PH_SOFT_MS    = 25000  // after this, end at the first 200 ms pause
PH_HARD_MS    = 30000  // never longer than this
```

Algorithm:

- Incoming chunks (any length) are cut into frames of
  `F = Math.round(sampleRate * PH_FRAME_MS / 1000)` samples; a remainder is
  carried to the next `push`. `flush()` drops the remainder (< 20 ms).
- Per frame: `db = 20*log10(rms + 1e-10)`.
- Noise floor `floor`, initial `-60`. Updated **only on frames that are not
  inside a phrase and are not speech frames**:
  `floor = clamp(floor*0.95 + db*0.05, -75, -35)`.
- *Speech frame*: `db > Math.max(PH_START_DB, floor + PH_START_OVER)`.
  *Voiced frame* (used inside a phrase): `db > Math.max(PH_KEEP_DB, floor + PH_KEEP_OVER)`.
- Outside a phrase, keep a pre-roll ring of the last `PH_PREROLL_MS` of
  frames. After `PH_ONSET` consecutive speech frames, a phrase opens; its
  audio = pre-roll frames that precede those onset frames + the onset frames.
  `voiceStart` = start of the first onset frame.
- Inside a phrase every frame is appended. Track `lastVoicedEnd`.
  The phrase **ends** when:
  - `PH_PAUSE_MS` of consecutive non-voiced frames have passed; or
  - phrase length ≥ `PH_SOFT_MS` and ≥ 200 ms (10 frames) of consecutive non-voiced frames; or
  - phrase length reaches `PH_HARD_MS` (cut at that frame).
- On end: trim the audio to `lastVoicedEnd + PH_TAIL_MS` (not beyond what
  was captured). `voicedSec = (lastVoicedEnd − voiceStart)/sampleRate`.
  If `voicedSec * 1000 < PH_MIN_MS` → **drop silently** (no request, no
  marker, no index consumed). Otherwise `onPhrase(...)` with the next index.
- After a **hard** cut the pre-roll ring is **cleared** so no audio is sent
  twice; after a normal end the ring is refilled from the frames that
  follow the trimmed tail (don't reuse samples already sent).
- `flush()`: if inside a phrase, end it now with the same trim and minimum
  rules. Outside, do nothing.

Expose for tests (and only this): `window.ScuLaDictation = Object.freeze({ makePhraser, encodeWav16k, modelFor })`.

---

## 5. Encoding and the request

### 5.1 `encodeWav16k(samples, sampleRate)` → `Promise<Blob>`

- If `sampleRate !== 16000` and `window.OfflineAudioContext` exists:
  `oc = new OfflineAudioContext(1, Math.ceil(samples.length*16000/sampleRate), 16000)`;
  source buffer = `oc.createBuffer(1, samples.length, sampleRate)` filled
  with `samples`; `startRendering()`; take channel 0. If
  `OfflineAudioContext` is missing, keep the native rate.
- Write a canonical 44-byte PCM header (`RIFF`/`WAVE`/`fmt ` 16, format 1,
  channels 1, the output rate, byteRate = rate*2, blockAlign 2, bits 16,
  `data`), samples clamped to [-1, 1] and scaled to Int16 (little-endian).
- `new Blob([...], { type:"audio/wav" })`.

### 5.2 `transcribe(blob, signal)`

Multipart fields, exactly:
`file` (the WAV, filename `"dictation.wav"`), `model` = `modelFor()`,
`response_format` = `"json"`, `temperature` = `"0"`.
**No `language` field. No `prompt` field.** `fetch(url, { method:"POST", headers, body, signal })`.
Error handling as today (network → `t("dictateNetwork")`; HTTP error →
message from `j.error.message` or `"HTTP <status>"`).
**HTTP 429**: retry **once**, after `Retry-After` seconds if the header is a
number (cap 10 s), otherwise 2 s; a second failure is a failure (§ 6.3).
No other retries. Result: `String(data.text || "").trim()`.

Tidy (only when `S.tidy`): `tidyUp()` stays, with its system prompt replaced by:

> "You edit raw speech-to-text output. The text may be Romanian, English, or a mix of both. Keep every word in the language it is written in — never translate, never rephrase, never add or remove words. Fix punctuation and capitalisation, and add missing diacritics to Romanian words only. Reply with the corrected text only."

Tidy is applied per phrase, before insertion. Its failure keeps the raw text (as today).

The old `blob.size > 25 MB` check and `t("dictateTooBig")` usage go (a 30 s
16 kHz phrase is ~1 MB). Leave the i18n key in place.

---

## 6. Sessions, ordering, failures, the pill

### 6.1 Session object

One per 🎤 start: `{ target, ins:{mode,pos,emitted,started:false}, next:0, slots:[], cancelled:false, recording:true, ctrls:Set<AbortController> }`.
Replace the module-level `target`/`ins` with the session's (`emit(session, text)`,
`beginInsert(session)`). Keep `lastCaret` global (it belongs to the editor).
`setBtn` uses the session's target to pick `#btn-dictate` vs `#btn-idea-dictate`.

### 6.2 Order: a single global chain

- Every accepted phrase gets a slot `{ session, seq, state:"pending"|"done"|"failed"|"dropped", text }`
  in a **global** FIFO `chain` (across sessions, in capture order).
- Requests run with **at most 2 in flight** globally (a simple pool; the
  next queued slot starts when one finishes). Groq's free tier limits
  requests per minute; 2 keeps a burst of short phrases from tripping it.
- Whenever a slot settles, **release from the head**: while the head slot
  is not pending, remove it and apply it (done → `emit`, failed → marker,
  dropped → nothing). So phrase 3 returning before phrase 2 waits for 2;
  2 appears the moment it returns, then 3 immediately.
- `beginInsert(session)` runs **lazily, right before the session's first
  insertion** (text or marker), not at start. Rules unchanged:
  target focused → at its caret; else target is `#editor` and `lastCaret`
  exists → there; else append. (Lazy is what keeps a second session that
  was started while the first was still transcribing from inserting
  *before* the first one's late text.)
- `emit` keeps today's joining rules exactly (first append-mode insertion
  opens a new paragraph `\n\n`; later ones join with one space; whitespace
  collapsed; editor → `updatePreview(); updateStatus(); scheduleAutosave();`
  other target → dispatch `input`). An empty transcription (`""`) inserts
  nothing and is not a failure.

### 6.3 A failed phrase

Failure = network error, non-OK HTTP (after the one 429 retry), or bad JSON.
Not a failure: abort because of cancel (§ 7.3) → slot `dropped`, silent.
On failure:
- Its position gets the literal marker **`[🎤 ?]`**, inserted through `emit`
  (so it is spaced like any phrase).
- Toast: `t("dictatePhraseFailed", n, msg)` where `n` = the phrase's
  1-based index in its session and `msg` the error message.
- Following phrases carry on normally. Recording is not stopped.

### 6.4 The pill (`showPill(state, interim)` as today)

- Recording: state `t("dictateRecording", "mm:ss")`, interim
  `t("dictatePending", k)` when `k` = pending slots of any session > 0, else `""`.
- Stopped with pending slots: state `t("dictateTranscribing")`, interim
  `t("dictatePending", k)`.
- Tidying a phrase: state `t("dictateTidying")` briefly as today, then back.
- Nothing recording and nothing pending → `hidePill()`.
- `fail()` keeps its current behaviour for start-up failures only.

---

## 7. Entry points

### 7.1 `window.toggleDictation(targetEl)`

- If a session is recording → stop it (§ 3), return (whatever `targetEl` is).
- If live engine active → `stopLive()` as today.
- Otherwise start a new session on `targetEl || editor` **even if earlier
  phrases are still pending** (they keep their own target and finish first
  thanks to § 6.2).
- `isSecureContext` / `opening` guards unchanged.

### 7.2 `window.toggleIdeaDictation()` — unchanged (calls `toggleDictation(#idea-text)`).

### 7.3 `window.stopDictation(targetEl, opts)` — new

- If the recording session targets `targetEl`, stop it (as § 3).
- If `opts && opts.discard`: for **every** session whose target is
  `targetEl`, set `cancelled = true`, abort its in-flight controllers, and
  mark all its unsettled slots `dropped` (nothing inserted, no toast); then
  run the head release so later slots of other sessions are not blocked.
- Same for the live engine when it targets `targetEl`: `stopLive()`.
- Refresh the pill (§ 6.4).

`idea.js` `closeIdeaModal()` becomes:
```js
function closeIdeaModal() {
  document.getElementById('idea-modal').classList.remove('open');
  stopDictation(document.getElementById('idea-text'), { discard: true });
}
```
Why discard: the modal is closed (Cancel, Escape, or after Save idea filed
the text); a late phrase would otherwise land in a hidden box and leak into
the *next* idea. The pill shows "Transcribing…" while phrases are pending,
so the user can wait before saving.

The main-editor session is never discarded by closing the idea modal.

---

## 8. i18n (`js/markdown/i18n.js`, both languages, next to the other `dictate*` keys)

| Key | RO | EN |
|---|---|---|
| `dictatePending` | ``n => `${n} în transcriere` `` | ``n => `${n} transcribing` `` |
| `dictatePhraseFailed` | ``(n, m) => `Fraza ${n} nu a putut fi transcrisă: ${m}` `` | ``(n, m) => `Phrase ${n} could not be transcribed: ${m}` `` |

Help text (replace the one `<p>` under "Dictare vocală" / "Voice dictation";
also fixes the wrong 🎙 icon):
- RO: `Butonul 🎤 din bară și cel din 💡 Idee rapidă transcriu vorbirea, cu setările (cheia API) din pagina „Caiet vocal”. Înregistrarea se taie la pauze și fiecare frază e transcrisă în limba în care a fost rostită — română sau engleză, niciodată tradusă — și apare imediat, în ordine.`
- EN: `The 🎤 button in the toolbar and the one in 💡 Quick idea transcribe speech using the settings (API key) from the "Caiet vocal" page. The recording is cut at pauses and each phrase is written in the language it was spoken — Romanian or English, never translated — and appears right away, in order.`

Keep diacritics exactly (ă â î ș ț, „”).

---

## 9. What must not change

- Live engine (`startLive`/`stopLive`) byte-for-byte, including `S.lang` → `ro-RO`/`en-US`.
- Where text lands (caret / lastCaret / append with a blank line) — § 6.2.
- `#dictate-pill` markup, button ids, `.active` class usage.
- `voice.html`, the nav block, `index.html`.

---

## 10. Updating `tests/dictate.js` (Implementer)

Its four scenarios keep their intent, but one start/stop no longer equals
one request and Chromium's default fake mic is a periodic short beep. Change:
- Launch with `--use-file-for-fake-audio-capture=<tmp wav>%noloop` (as
  `tests/melody.js:145` does), a WAV written by the test: 0.5 s silence,
  ~1.2 s of a *speech-like* voiced signal (e.g. a 150–250 Hz harmonic tone
  with amplitude/pitch modulation at ~-12 dBFS — a steady pure sine can be
  eaten by `noiseSuppression`), then ≥ 1.5 s silence. Exactly one phrase.
- Replace `dictateOnce` waiting with: wait for the stubbed text, which now
  arrives during recording; then stop.
- Scenario 4 (no key) unchanged.
If the fake-file route proves unreliable with the constraints above, the
fallback is to drive the phraser/emit path through `window.ScuLaDictation`
and a stubbed `getUserMedia` returning a `MediaStream` from an
`AudioContext` `MediaStreamDestination` fed by an `AudioBuffer` — document
which one was used in the file header comment.
`node tests/dictate.js` must pass.

---

## 11. Done means

1. With Groq settings, one 🎤 session containing *"Azi am fost la piață."* ⟶ pause ⟶ *"Then I went home."* ⟶ pause ⟶ *"Și am gătit."* produces three requests and the text `Azi am fost la piață. Then I went home. Și am gătit.` (each in its own language, diacritics kept), appearing phrase by phrase.
2. Every request to Groq has `model=whisper-large-v3` even when Caiet vocal saved `whisper-large-v3-turbo`; **no request has a `language` or `prompt` field**, whatever `S.lang`/`S.hint` are.
3. Out-of-order responses are inserted in spoken order.
4. A < 0.5 s noise sends nothing.
5. A failing phrase leaves `[🎤 ?]` in its place, a toast names it, the rest land.
6. Closing the idea modal while phrases are pending inserts nothing into `#idea-text` later.
7. `S.engine = "live"` behaves exactly as before.
8. `git diff --stat` shows no change to `voice.html` or `index.html`.
9. `node tests/verify.js` passes; `node tests/dictate.js` and `node tests/idea.js` pass (idea.js's known failure #3 in CLAUDE.md excepted).

---

## 12. Manual verification (human / tester)

Needs a real Groq key saved on the Caiet vocal page (engine API, provider
Groq), `index.html` served over `http://localhost` (e.g. `python3 -m http.server`)
or `file://` in Chrome, DevTools → Network open.

1. On Caiet vocal set language **Română** and model **whisper-large-v3-turbo**. Go to `index.html`.
2. Press 🎤 in the toolbar. Say a Romanian sentence, pause ~1 s, an English sentence, pause, a Romanian sentence with ă/ș/ț. Watch each sentence appear while you keep talking. Stop.
   - Expect: Romanian text in Romanian with diacritics, English text in English, never swapped/translated.
   - Network: one `transcriptions` request per sentence; open each payload: `model` = `whisper-large-v3`, **no** `language`, **no** `prompt`; the file is `dictation.wav`.
3. Mix within quick succession (short pauses < 0.5 s) — expect them in one phrase; that's by design.
4. Tap the desk (a click, < 0.5 s) while recording, no speech — no request fires.
5. Ctrl+Alt+I (💡), press its 🎤, dictate mixed RO/EN — same behaviour into the idea box. Stop, Save idea → it files the text.
6. Open 💡 again, start dictating, press Escape mid-sentence — nothing appears later in the idea box when reopened; no extra error toast.
7. DevTools → Network → Offline mid-dictation for one sentence, then back online: that sentence shows `[🎤 ?]`, a toast says "Fraza N nu a putut fi transcrisă: …", later sentences still arrive.
8. Set Caiet vocal engine to **Live**: dictation behaves as before (uses the chosen language, no requests).
9. Open `voice.html` — unchanged behaviour.

### Notes for the automated suite (`tests/04-for-index-html-page-in-idee/`)

- The seam `window.ScuLaDictation.makePhraser` lets segmentation be tested
  deterministically on synthetic Float32 PCM (bursts at ~-20 dBFS separated
  by zeros): 0.7 s gap splits, 0.5 s gap does not, 0.4 s burst dropped,
  0.6 s burst kept, 35 s continuous burst splits at ≤ 30 s, `flush()` emits
  a phrase in progress, `index` increments only on kept phrases.
- End-to-end: stub `**/audio/transcriptions` with `page.route`, reply per
  request with different texts (one Romanian with diacritics, one English)
  and **different delays** (answer the 1st slower than the 2nd) to prove
  ordering; read `request.postDataBuffer()` to assert the multipart fields
  (`model`, absence of `language`/`prompt`, a `RIFF…WAVE` 16 kHz 16-bit mono file).
  Stub a 500 for one phrase to check the marker and the others.
- Verify the stubbed strings land **unchanged** (no translation) in both `#editor` and `#idea-text`.

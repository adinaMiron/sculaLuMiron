# Live class — `curs-live.html` design spec

Status: planned, not implemented. Read this file before any live-class task.
Tasks live in `docs/TASKS-LIVE-CLASS.md` and reference sections here as §N.
If an implementation detail must differ from this spec, update the spec in the same change.

## 1. Goal and principles

- Teachers host free live lessons from their own browser. Students join with a link. The site stays static (GitHub Pages); there is no server code.
- **Option B everywhere.** Only two media streams exist: the teacher's voice (audio) and an optional small face bubble (video). Everything else is small events: slides are sent once, then slide changes, drawing strokes, laser pointer and chat travel as JSON messages.
- **Star topology.** Each student connects only to the teacher. Students never connect to each other. The teacher's browser is the hub and the single source of truth (order, statuses, moderation).
- Follow the project rules: single-file tool, no build step, no framework, no package manager for the site. The only external dependency is `mqtt.js` loaded from a CDN at a pinned version (§3.7).
- UI text is Romanian, organised per `docs/I18N.md`. Colours follow `docs/THEME.md`.
- Hosting works on desktop browsers. Tablets can host too (no screen sharing is needed), but the tab must stay in the foreground.

Non-goals for v1: accounts, server-side recording, student-to-student connections, screen-share video, more than ~100 students.

## 2. Files and URLs

- `curs-live.html` — new file; host and student roles in the same file.
- `editor.html` — gains an embed mode (§6.3). Standalone behaviour must stay unchanged.
- `tests/live/` — dev-only tests (§13). Any `package.json` lives inside `tests/`, never at the repo root.

URL routing (all state in the fragment, which browsers never send to the server):

| URL | Screen |
|---|---|
| `curs-live.html` | Host start screen: course title → "Începe cursul" |
| `curs-live.html#host=<roomId>` | Host view; reload resumes the room from IndexedDB |
| `curs-live.html#j=<roomId>.<roomKey>.<hostKeyHash>` | Student join screen |

Extra flags, appended as `&sig=local` and `&debug=1` (§13).
Encodings: `roomId` 16 random bytes, `roomKey` AES-256 raw key, `hostKeyHash` first 16 bytes of SHA-256 of the host public key; all base64url.

## 3. Connection layer

### 3.1 Signaling transport

Interface: `{ open(topic), send(envelope), onMessage(cb), close() }`.

- `MqttSignal` (default): public MQTT brokers over `wss://`, tried in order from `CONFIG.mqttBrokers`, first that connects wins.
- `LocalSignal`: `BroadcastChannel(topic)`. Used for tests and same-browser demos; forced with `&sig=local`.

Signaling is only needed to connect and reconnect; media and data never pass through it.

### 3.2 Envelope

Cleartext: `{ v: 1, from, to, type, body }`, where `to` is a peer id or `"host"`.
Types: `join` (student→host), `offer` (host→student), `answer`, `ice`, `bye`.
On the wire: AES-GCM with `roomKey`, random 12-byte IV, sent as base64url `iv.ciphertext`.
Topic: `scula-live/` + first 32 hex chars of SHA-256(roomId). Undecryptable messages are ignored silently.

### 3.3 Host authenticity

Anyone with the link holds `roomKey`, so a student could pretend to be the host on the signaling channel. To prevent that:

- The host creates an ECDSA P-256 key pair per room and stores it in IndexedDB.
- Each `offer` body carries `hostPub` (raw, base64url) and `sig` = ECDSA signature over the SDP string.
- A student accepts an offer only if SHA-256(hostPub)[0..16] equals `hostKeyHash` from the link and the signature verifies.

### 3.4 Peer connection

- The host is always the offerer. A student sends `join {peerId}`; the host creates one `RTCPeerConnection` for that student.
- Each connection carries:
  - an audio transceiver (`sendonly` on the host side);
  - a video transceiver (`sendonly`, its track may be `null`);
  - data channel `ctrl`: reliable and ordered, for all JSON messages;
  - data channel `files`: reliable and ordered, for slide bytes;
  - data channel `live`: `ordered: false, maxRetransmits: 0`, for the laser pointer.
- Negotiate once and **never renegotiate**. Camera on/off uses `RTCRtpSender.replaceTrack`.
- The `offer` body also carries `iceServers` (STUN plus the optional TURN from host settings, §9). The student builds its connection from that list, so TURN is configured only by the teacher.

### 3.5 Reconnect

- Student: if the connection state is `failed`, or `disconnected` for more than 5 s, close it and resend `join`. Back off 2, 4, 8 … 30 s.
- Host: a new `hello` with a known `studentKey` replaces that student's old connection (no duplicate entries).
- Host reload: the host restores state from IndexedDB and listens again; students reconnect through their retry loop.

### 3.6 Backpressure

The `files` channel sends 16 KiB chunks. When `bufferedAmount` exceeds 1 MiB, wait for `bufferedamountlow` (threshold 256 KiB) before sending more.

### 3.7 Dependency

`mqtt.js` browser bundle, pinned exact version, from cdnjs or jsdelivr. Record the verified version and the working broker URLs here:

- mqtt.js version: _to fill in T03_
- brokers: _to fill in T03_

## 4. App protocol (data channels)

Every `ctrl` message is JSON `{ t, ... }`.

- The host accepts from students **only**: `hello`, `chat.send`, `video.pref`.
- Students accept messages only from their host connection.
- Unknown or invalid messages are dropped, and logged only in debug mode.

| t | Direction | Fields |
|---|---|---|
| `hello` | S→H | `name` (≤32 chars), `studentKey`, `lastSeq`, `wantsVideo` |
| `welcome` | H→S | `studentId`, `title`, `slides[]` meta, `currentSlideId`, `ops` for the current slide, `chat[]` after `lastSeq`, `statuses{id:status}`, `camOn`, `muted` |
| `wait` | H→S | lobby: waiting for approval (§10) |
| `refused` | H→S | lobby: refused |
| `slide.meta` | H→S | `id`, `kind` (`image`\|`blank`), `mime`, `size`, `w`, `h`, `order` |
| `slide.go` | H→S | `id` |
| `slide.ops` | H→S | `id`, `ops[]` (full replay when a student opens a slide) |
| `draw.ops` | H→S | `slideId`, `ops[]` (live batch, §6.4) |
| `chat.send` | S→H | `cid`, `text`, `kind` (`q`\|`c`) |
| `chat.msg` | H→S | `seq`, `author`, `role` (`host`\|`student`), `text`, `kind`, `ts`, `status`, `cid?` |
| `chat.reject` | H→S | `cid`, `reason` (`length`\|`rate`\|`muted`) |
| `chat.status` | H→S | `seq`, `status` (`new`\|`current`\|`done`\|`hidden`) |
| `mod.mute` | H→S | `muted` |
| `video.pref` | S→H | `on` |
| `host.video` | H→S | `on` |
| `class.end` | H→S | — |

`live` channel: `{ t: "ptr", x, y }` and `{ t: "ptr.hide" }`.
`files` channel: raw bytes of the slide announced by the latest `slide.meta`. The student assembles chunks until `size` bytes have arrived; slides are sent one at a time per student.

## 5. State and persistence

Host in-memory state: `room`, `students` (Map by `studentKey`: name, peerId, connected, muted, wantsVideo, approved), `slides[]`, `currentSlideId`, `opsBySlide`, `chat[]`, `seq`, `camOn`, `settings`.

IndexedDB database `scula-live`, version 1:

| Store | Key | Value |
|---|---|---|
| `rooms` | `roomId` | `role`, `title`, `createdAt`, `ended`; host: keys, settings; student: `studentKey`, `name`, `link` |
| `slides` | `[roomId, slideId]` | `kind`, `blob`, `w`, `h`, `order` |
| `ops` | `[roomId, slideId, n]` | one op (§6.4); `n` is an increasing counter |
| `chat` | `[roomId, seq]` | `chat.msg` fields plus the latest status |

Students store everything they receive, so history stays available offline after class. The host copy is authoritative.
"Șterge istoricul acestui curs" deletes every record with that `roomId`.

## 6. Slides and drawing

### 6.1 Slides (host)

- Add images through a file picker (multiple files) or by pasting.
- Downscale to a longest edge of `CONFIG.imageMaxEdge`, then encode as WebP at quality 0.85 (JPEG fallback if WebP encoding is unsupported).
- "Tablă albă" adds a `blank` slide: white, 1920×1080, no blob.
- The slide strip shows thumbnails in order; clicking one sends `slide.go`.

### 6.2 Transfer

- For each slide, send `slide.meta` on `ctrl`, then the bytes on `files`.
- A late joiner gets the current slide first, then the rest in order.
- Before T15, the student shows the current slide as a plain `<img>`.

### 6.3 `editor.html` embed mode

- URL: `editor.html?embed=1&role=host|viewer`.
  - Embed mode hides standalone-only controls (open/save/download).
  - `host` keeps the drawing tools.
  - `viewer` has no toolbar and ignores all pointer input.
- `postMessage` in both directions. The receiver checks `event.origin === location.origin` and that the source window is the expected one; anything else is ignored.
- Parent → editor:
  - `{ type: "load", slideId, blob | null, w, h }`
  - `{ type: "apply", ops }`
  - `{ type: "reset", ops }` (clear the drawing layer, then replay)
- Editor → parent (host role only):
  - `{ type: "ops", slideId, ops }` (batched, see §6.4)
  - `{ type: "ready" }`

### 6.4 Op model

- Coordinates are normalised to 0..1 of the image width and height, rounded to 4 decimals. Line widths are normalised to the image width.
- Ops:
  - `{ op: "begin", sid, tool, color, w }`, where `tool` is `pen`, `marker` or `eraser`
  - `{ op: "pts", sid, pts: [x, y, x, y, …] }`
  - `{ op: "end", sid }`
  - `{ op: "shape", sid, kind, x1, y1, x2, y2, color, w }`
  - `{ op: "text", sid, x, y, text, color, size }`
  - `{ op: "remove", sid }` (undo)
  - `{ op: "restore", sid }` (redo)
  - `{ op: "clear" }`
- Points are batched and flushed every `CONFIG.drawFlushMs` (40 ms).
- Rendering: the background image sits on one canvas, the drawing on a separate layer. The eraser uses `destination-out` on the drawing layer only. All drawing goes through a single `applyOp`, used for both local input and received ops.
- Text from ops is drawn with `fillText` only (never inserted as HTML).
- Tool mapping from the current `editor.html`: _to fill in T12_

### 6.5 Laser pointer

- A host-only tool that leaves no mark. It sends `ptr` on `live` at most 20 times per second, and `ptr.hide` on pointer leave.
- Viewers draw a red dot on an overlay and fade it after 1.5 s without updates.

## 7. Chat

### 7.1 Ordering

- The host's receive order is the canonical order. The host assigns `seq` (1, 2, 3 …) and `ts` (host clock), then broadcasts `chat.msg` to every student, including the sender.
- Host messages go through the same function, with `role: "host"`.

### 7.2 Validation (host)

- Text is trimmed, 1..`CONFIG.chatMaxLen` characters.
- At most one message per `CONFIG.chatRateMs` per student.
- Muted students cannot send.
- The author name comes from the connection's `studentKey` record, **never** from message content.
- Failures send `chat.reject`; the student shows a Romanian notice.

### 7.3 Pending messages (student)

- A sent message shows as pending under its client id `cid`.
- When the matching `chat.msg` arrives, it takes its place in `seq` order.
- On `chat.reject` it is marked as not sent, with the reason.

### 7.4 Statuses

| Status | Meaning |
|---|---|
| `new` | Default |
| `current` | Being discussed now; highlighted and pinned above the chat as "Acum discutăm" on all screens |
| `done` | Already discussed; faded, with ✓ ("Discutat") |
| `hidden` | Removed by moderation; dropped from student views |

- Only the host changes statuses, from the message's menu.
- Only one message can be `current`. Choosing a new one sets the previous one to `done`.

### 7.5 UI

- Students choose "Întrebare" or "Comentariu" for each message.
- Local filters: "Toate", "Întrebări", "Nediscutate".
- On phones (≤600 px wide) the chat is a collapsible bottom sheet.

### 7.6 Sync

- `hello.lastSeq` → `welcome` contains only newer messages, plus `statuses` for every older message whose status is not `new`.

### 7.7 Moderation (host)

- Hide a message: `chat.status` set to `hidden`.
- Mute or unmute a student: `mod.mute`. A muted student's input is disabled with a notice.

### 7.8 Safety

All user-supplied text (messages, names, titles) is rendered with `textContent`. Never `innerHTML` with user data.

### 7.9 Export

- "Exportă ca Markdown" downloads `curs-<date>.md` with the title, date, and one line per message: `**Nume** (întrebare · discutat): text`.
- Handoff to `markdown-editor.html`: _to fill in T25_

## 8. Audio and face bubble

### 8.1 Audio

- Microphone with `echoCancellation`, `noiseSuppression` and `autoGainControl` enabled.
- Mute sets `track.enabled = false`.
- Students must click "Intră în curs" before any audio plays (browser autoplay rule). Audio and video elements get `playsinline`.

### 8.2 Camera

- Ideal constraints: 240×240 at 15 fps.
- Each video sender is capped with `setParameters`, setting `encodings[0].maxBitrate` to `CONFIG.videoMaxBitrate` (150000).
- The host's self-view is mirrored (`scaleX(-1)`). The stream itself is sent unmirrored.

### 8.3 Host toggle

- Off: `replaceTrack(null)` on all video senders, stop the camera track (the camera light turns off), broadcast `host.video {on:false}`.
- On: reacquire the camera and `replaceTrack` for students whose `wantsVideo` is true.

### 8.4 Student preference

- "Ascunde camera" sends `video.pref {on:false}`. The host calls `replaceTrack(null)` for that student only, so the stream actually stops and saves data.
- "Arată camera" reverses it.
- The choice is saved per room.

### 8.5 Bubble UI

- A circle (`border-radius: 50%`, `object-fit: cover`): 200 px on desktop, 110 px at ≤600 px viewport width.
- Draggable; snaps to the nearest stage corner and never covers the chat panel.
- The corner is saved in `localStorage` under the key `scula-live.bubbleCorner`.

### 8.6 Automatic limit

- With the camera on and at least `CONFIG.videoWarnAt` connected students, the host sees a banner: "Mulți participanți — oprește camera pentru un sunet mai bun", with a button.
- Host setting "Oprește automat camera" (default off) turns the camera off at the threshold instead of only warning.

## 9. CONFIG

A single object at the top of the `curs-live.html` script. In debug mode, `&cfg.<key>=<value>` overrides numeric keys (used by tests).

```js
const CONFIG = {
  mqttBrokers: [/* filled in T03 */],
  stun: ["stun:stun.l.google.com:19302"],
  maxStudents: 100,
  videoWarnAt: 40,
  videoMaxBitrate: 150000,
  video: { width: 240, height: 240, frameRate: 15 },
  imageMaxEdge: 1920,
  chunkSize: 16384,
  chatMaxLen: 500,
  chatRateMs: 2000,
  nameMaxLen: 32,
  drawFlushMs: 40,
  ptrMaxHz: 20,
  reconnectMaxMs: 30000,
};
```

Optional TURN server (URL, username, credential) is a host setting stored in the host's `rooms` record and delivered to students inside the encrypted offer (§3.4).

## 10. Host robustness and lobby

- While the class is active:
  - hold a Screen Wake Lock, and request it again on `visibilitychange`;
  - show a `beforeunload` confirmation.
- "Încheie cursul":
  - broadcasts `class.end`;
  - closes all connections;
  - marks the room `ended`.
- Students then see "Cursul s-a încheiat" and keep their saved history.
- Optional lobby (host setting "Aprob eu participanții"):
  - after `hello`, the host gets a request with the student's name and accepts or refuses it;
  - pending students receive `wait`; refused students receive `refused`;
  - no other data is sent before acceptance.

## 11. Privacy

Before joining, students see a short Romanian notice and must click "Continuă". It covers:

- their name and messages are stored in the browsers of the participants;
- the teacher's browser, and the STUN or TURN provider, can see their IP address;
- what the teacher sees.

No analytics and no third-party calls beyond the MQTT broker and the STUN/TURN servers.

## 12. Layout

**Host view**

- Top bar: title, "Copiază linkul", student count, microphone, camera, settings, "Încheie cursul".
- Centre stage: editor iframe in host role, with the laser tool.
- Below the stage: slide strip plus "Adaugă imagini" and "Tablă albă".
- Right: chat panel (bottom sheet on phones).
- Participant list in a drawer: names, mute, lobby requests.

**Student view**

- Join screen: name, privacy notice, "Intră în curs".
- Stage with the editor iframe in viewer role.
- Face bubble.
- Chat panel.
- Small controls: "Ascunde/Arată camera", volume.

## 13. Testing

### 13.1 Automated

- Playwright in `tests/live/`, Chromium launched with `--use-fake-ui-for-media-stream` and `--use-fake-device-for-media-stream`.
- A static server serves the repo root on localhost.
- Host and student pages share one browser context and use `&sig=local`.

### 13.2 Debug hooks

With `&debug=1`:

- `window.__live` is a read-only snapshot getter: role, peers with connection state, connected count, `seq`, `currentSlideId`, op counts per slide, `camOn`, `wantsVideo`, and inbound/outbound RTP byte counters from `getStats()`.
- A small debug panel lists the last 50 protocol messages.

### 13.3 Manual (human)

Two devices on different networks (for example a phone on mobile data) using the default MQTT signaling. Check:

- joining works;
- audio is clear;
- slides and drawing stay in sync;
- the chat order is identical on both devices;
- hiding the camera stops data use;
- reconnecting after toggling airplane mode works.

## 14. Later (not v1)

- PDF import (pdf.js renders pages to images on the host).
- "+1" votes on questions.
- Pass the pen to a student.
- Local recording with `MediaRecorder`.
- Screen-share fallback.
- Markdown slides.
- Self-hosted signaling.

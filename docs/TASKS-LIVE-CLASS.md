# Tasks — live class (`curs-live.html`)

Spec: `docs/LIVE-CLASS.md` (§ references below point there). Do tasks in order; each task is one line and ends with "Done when:" acceptance criteria. Tests run with `&sig=local` per §13. Never break standalone `index.html`, `editor.html`, `markdown-editor.html`.

## Phase 0 — Foundations

- [ ] T00 Docs routing: add a "live class / curs live" route in `CLAUDE.md` pointing to `docs/LIVE-CLASS.md` and this file, and add an empty `curs-live.html` section to `docs/MAP.md`. Done when: CLAUDE.md routes live-class work to the spec; no code files changed.
- [ ] T01 Dev-only test harness in `tests/live/` per §13.1 (Playwright, Chromium fake-media flags, static server for repo root; any package.json stays inside `tests/`). Done when: one smoke test loading `index.html` passes and the site files are untouched.
- [ ] T02 Create `curs-live.html` skeleton per §2, §9, §12: single file, THEME.md colours, I18N.md string dictionary (RO), CONFIG object with debug overrides, fragment routing to host-start / host / student-join screens, `&debug=1` panel and `window.__live` stub (§13.2). Done when: a test opens each of the three URL forms and sees the right screen in Romanian.

## Phase 1 — Connection (star topology)

- [ ] T03 Signaling per §3.1–3.2: `LocalSignal` and `MqttSignal` with AES-GCM envelopes and hashed topic; verify the current mqtt.js version and at least two working public wss brokers, then fill in §3.7 and `CONFIG.mqttBrokers`. Done when: a test has two pages exchange an envelope via LocalSignal, the raw channel payload does not contain the plaintext, and §3.7 is filled.
- [ ] T04 Room creation per §2 and §5: host start screen (title → "Începe cursul") generates roomId, roomKey and an ECDSA key pair, saves them in IndexedDB `rooms`, shows the student link with "Copiază linkul", and `#host=<roomId>` resumes after reload. Done when: a test creates a room, reloads, and sees the same student link.
- [ ] T05 Peer connections per §3.4: join/offer/answer/ice flow with host as offerer; audio+video transceivers and `ctrl`, `files`, `live` data channels; no renegotiation; host shows connected count. Done when: a test with one host and two student pages shows count 2, all three channels open on both students, and no student-to-student connection in `__live`.
- [ ] T06 Host authenticity per §3.3: signed offers carrying `hostPub`; students verify against `hostKeyHash`. Done when: a test proves an offer signed with a different key is ignored and the real host's offer is accepted.
- [ ] T07 `hello`/`welcome` and message whitelist per §4: student join screen collects the name (≤32 chars) and creates a persistent `studentKey`; host participant drawer lists names; invalid or disallowed messages are dropped. Done when: tests show names in the host list, and a student sending `slide.go` or malformed JSON changes nothing on the host.
- [ ] T08 Reconnect per §3.5 including host reload. Done when: a test reloads a student page and the host list keeps one entry for that student; another test reloads the host page and all students are connected again within 30 s.

## Phase 2 — Audio

- [ ] T09 Teacher audio per §8.1: microphone capture with processing flags, mute button, student "Intră în curs" gesture, `playsinline` playback. Done when: with fake media, `__live` on the student shows inbound audio bytes increasing, and they stop increasing after the host mutes.

## Phase 3 — Slides

- [ ] T10 Host slide management per §6.1 and §5: picker and paste, downscale, WebP encode, "Tablă albă", thumbnail strip, IndexedDB `slides` (no network yet). Done when: a test adds two images and one blank slide, sees three thumbnails, reloads, and still sees three in the same order.
- [ ] T11 Slide transfer per §6.2 and §3.6: `slide.meta` + chunked `files` with backpressure, `slide.go`, late join gets the current slide first, student stores slides and shows the current one as `<img>`. Done when: a student joining after three slides receives all three with byte sizes equal to the host's, and after host `slide.go` the student shows the new slide within 1 s.

## Phase 4 — Drawing (editor.html)

- [ ] T12 Analyse `editor.html` without changing code: document its drawing model, tools, layers and undo history in `docs/MAP.md`, and fill the tool → op mapping in §6.4. Done when: both docs are updated and §6.4 lists every existing tool with its op (or "not synced, reason").
- [ ] T13 Refactor `editor.html` to the op model per §6.4: every user action creates an op applied through a single `applyOp`; separate drawing layer; normalised coordinates; undo/redo as `remove`/`restore`; standalone behaviour unchanged. Done when: a test draws with each tool, records the ops, replays them on a fresh editor, and the drawing layers' `toDataURL()` outputs are identical; existing editor features still work.
- [ ] T14 Embed mode per §6.3: `?embed=1&role=host|viewer`, postMessage API with origin and source checks, viewer ignores input and hides the toolbar. Done when: a test page embedding the editor can `load`, `apply` and `reset`; synthetic pointer input on a viewer changes nothing; a message from a different origin is ignored.
- [ ] T15 Live drawing in `curs-live.html`: host embeds editor (role host) and forwards batched ops as `draw.ops`, stores them in IndexedDB `ops`; students embed editor (role viewer) and apply them; each slide keeps its own drawing. Done when: after synthetic host strokes the student drawing layer matches the host's (pixel diff below 1%), and switching slides back and forth restores each slide's drawing.
- [ ] T16 Drawing late join and reload: `welcome` and `slide.ops` replay full ops for the opened slide; host reload restores ops from IndexedDB. Done when: a student joining after drawing sees the same drawing layer as the host, and a host reload keeps all drawings.
- [ ] T17 Laser pointer per §6.5 on the `live` channel. Done when: host pointer movement shows a red dot on the student within 200 ms, it fades after 1.5 s idle, and no op is recorded.

## Phase 5 — Chat

- [ ] T18 Chat panel and host messages per §7.1, §7.5, §5: host sends messages through the sequencing function; IndexedDB `chat` store; bottom sheet on ≤600 px. Done when: host messages appear with increasing `seq` and survive a host reload.
- [ ] T19 Student messages per §7.2–7.3: `chat.send` with kind toggle "Întrebare/Comentariu", host validation and broadcast, pending → confirmed, `chat.reject` with Romanian notices. Done when: two students sending at nearly the same time see the same order as the host on all three pages; a 501-character message and a second message within 2 s are rejected with notices.
- [ ] T20 Rendering safety per §7.8 across chat, names and titles. Done when: a test sends `<img src=x onerror=window.__pwned=1>` as a name and as a message; it shows as literal text and `window.__pwned` stays undefined on every page.
- [ ] T21 Chat sync per §7.6: `lastSeq` in `hello`, missing messages and statuses in `welcome`; students store chat in IndexedDB. Done when: a student offline while three messages are sent receives exactly those three after reconnecting, with no duplicates.
- [ ] T22 Message statuses per §7.4: host menu "Acum discutăm" / "Discutat"; single `current` rule; pinned current banner on all screens. Done when: marking message A current then B current leaves A `done` and B pinned on host and students, and statuses survive reloads.
- [ ] T23 Local filters per §7.5 ("Toate", "Întrebări", "Nediscutate"). Done when: each filter shows the expected subset in a test with mixed kinds and statuses.
- [ ] T24 Moderation per §7.7: hide message, mute/unmute student. Done when: a hidden message disappears from students; a muted student's input is disabled and a forced `chat.send` from that student is rejected with `muted`.
- [ ] T25 Export per §7.9: "Exportă ca Markdown" download; inspect `markdown-editor.html` storage and, if it can open content from same-origin storage without changing its behaviour, add "Deschide în editor"; document the decision in §7.9. Done when: the downloaded file matches the §7.9 line format and §7.9 records the handoff decision.

## Phase 6 — Face bubble

- [ ] T26 Camera capture and bubble per §8.2 and §8.5 (size only): constraints, bitrate cap on every video sender, mirrored host self-view, circular student bubble. Done when: `__live` on the host shows outbound video around 240 px and below 180 kbps per student, and the student bubble shows the live video.
- [ ] T27 Host camera toggle per §8.3. Done when: after "camera off" student inbound video bytes stop increasing and the host camera track is stopped; after "camera on" they increase again without renegotiation.
- [ ] T28 Student video preference per §8.4. Done when: with two students, after student A hides the camera A's inbound video bytes stop while B's keep increasing; the choice persists after A reloads.
- [ ] T29 Bubble drag and responsive size per §8.5. Done when: at 375 px width the bubble is 110 px, at 1280 px it is 200 px; dragging snaps to the nearest corner, never overlaps the chat panel, and the corner persists after reload.
- [ ] T30 Automatic limit per §8.6 (test with `&cfg.videoWarnAt=2`). Done when: with two students the host sees the banner; with "Oprește automat camera" enabled the camera turns off at the threshold.

## Phase 7 — Hardening and docs

- [ ] T31 Host robustness per §10: wake lock, `beforeunload` confirmation, "Încheie cursul" with `class.end`. Done when: after ending, students see "Cursul s-a încheiat" and still see slides, drawings and chat from IndexedDB after reload.
- [ ] T32 Optional lobby per §10. Done when: with the setting on, a new student gets `wait` and receives no slides or chat until accepted; a refused student sees the refusal screen.
- [ ] T33 Privacy notice and history deletion per §11 and §5. Done when: students cannot join before "Continuă"; "Șterge istoricul acestui curs" removes all IndexedDB records for that room on that device.
- [ ] T34 TURN settings per §3.4 and §9: host settings form, stored per room, delivered in the encrypted offer. Done when: a test sets a dummy TURN entry and the student's `RTCPeerConnection.getConfiguration().iceServers` contains it.
- [ ] T35 English strings per `docs/I18N.md` and theme check per `docs/THEME.md` for `curs-live.html` and the editor embed UI. Done when: switching language shows no Romanian leftovers in the live-class UI and no hard-coded colours remain outside theme variables.
- [ ] T36 Final docs: update `docs/MAP.md` anchors for `curs-live.html` and changed parts of `editor.html`, add the tool to `README.md` and `docs/FEATURES.md`, and copy the §13.3 manual checklist into the README's live-class section. Done when: MAP.md anchors resolve to the right lines and all live-class tests pass in one run.

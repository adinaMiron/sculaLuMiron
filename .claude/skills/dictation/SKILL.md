---
name: dictation
description: Modify or test Markdown/idea-box speech transcription and its language or destination handling using the existing fake-microphone fixtures.
---

1. Confirm the page: `js/markdown/dictation.js` serves Markdown and its idea box;
   `voice.html` has a separate engine. Read FEATURES J and I18N language axes
   only as needed. Do not broaden a Markdown task into Voice changes.
2. Locate `transcribe`, `pickModel`, `tidyUp`, `keepsWords`, `startLive`.
   Markdown API requests deliberately omit forced language/prompt and reject
   translating tidy output. Browser SpeechRecognition still needs a language.
   Preserve asynchronous destination checks when a user switches chapters.
3. Reuse `tests/01-for-index-html-page-in-idee/helpers.js`: `load`, `settings`,
   `parseMultipart`, `openIdea`, `dictateOnce`. Stub both `SpeechRecognition` and
   `webkitSpeechRecognition`; otherwise Chrome can reach the real engine.
4. Use fake mic flags and stub the STT/tidy endpoints. Record about 1300ms:
   short recordings can fall below the 1200-byte acceptance floor. Preserve
   executablePath when overriding Playwright launchOptions; some older specs
   override the complete object and therefore need the bundled browser.
5. Run focused suites (`dictate`, `dictatedestination`, the task spec folder),
   or `python3 scripts/run-tests.py --preset dictation`. Tests prove request and
   destination contracts; they do not prove actual STT recognition quality.

Expected output: page/engine affected, preserved language and destination
behavior, tests/results, and any real-microphone checks still needed.

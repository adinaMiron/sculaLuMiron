---
description: Parse all nine pages and plain JS helpers, compare shared navigation, check diacritics
---

Run `node tests/verify.js` from the repository root. This is the `/verify`
implementation: parses inline scripts plus `js/` helpers, extracts navigation
by its markers and compares all nine pages byte for byte, and checks comma-below
Romanian diacritics. Report failures with output and fix affected code.

The known-good historical comment about cedilla characters is exempted; UI
strings must use ș/ț. The shared nav includes `song.html`; every page addition
must update this inventory as well as `SUBDIR` and the app-change skill.

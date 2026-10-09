# Project guide: load only the relevant section

Nine standalone HTML browser tools, no application build or framework.
Development dependencies live in root/tests package.json and never ship in apps.
`index.html` owns markup/CSS and synchronous ordered `js/markdown/*.js` scripts;
they share classic-script globals. Most other apps keep logic inline. Song and
Voice additionally use plain `js/audio/` helpers; Voice has `js/voice/teleprompter.js`.
Use `file://` where supported; microphone/screen/folder APIs may require localhost.

## Locate before loading

Run `python3 scripts/agent-context.py <topic>` for source paths, doc sections and
test candidates. Then `rg -n 'symbol|selector' path` and read a small range with
`sed -n 'start,endp' path`. Discover doc headings with `rg -n '^##' doc`.
MAP line numbers drift: verify symbols instead of paging through a huge file.
Read task docs and current review requirements before historical advice.

| User's page name | Entry point | Focused reference |
|---|---|---|
| markdown, index | `index.html`, `js/markdown/` | `js/markdown/README.md`, FEATURES C–O, R–U |
| retete, rețete, recipes | `recipes.html` | `docs/RECIPES.md` |
| voice, caiet vocal | `voice.html` | FEATURES P0/P; I18N language axes |
| editor, mazgaleste, drawing | `editor.html` | `HANDOFF.md`, FEATURES B |
| song, creează melodie | `song.html`, `js/audio/` | FEATURES V, `docs/SONG-*.md` by topic |
| calendar | `calendar.html` | FEATURES L |
| kanban, task board | `kanban.html` | FEATURES E, task states |
| transfer | `transfer.html` | FEATURES Q |
| map, hartă, locatii | `map.html` | FEATURES S |

`FEATURES` means `docs/FEATURES.md`. UI tokens: `docs/THEME.md`; RO/EN labels:
`docs/I18N.md`; detailed locations: relevant section of `docs/MAP.md`.

## Shared contracts

- Nav is copied byte-for-byte across all nine pages, from `<nav id="site-nav"`
  through `<!-- ===== end toolbar nav ===== -->`. It owns language preference,
  `ScuLaFolder`, `ScuLaCal`, `ScuLaGeo`. Update all copies and run static verify.
  Adding a page also needs the nav link, `SUBDIR`, verifier inventory and routing.
- Use `ScuLaFolder.save(name, blob)` for exports; test phone share as well as
  desktop folder behavior. Use `ScuLaCal.make()`/`syncSource()` for calendar
  events in Google Calendar shape; all-day `end.date` is exclusive. Calendar
  exports are carried to Google by the user; calendar.html has no OAuth sync.
- Theme tokens and RO/EN i18n keys, preserving ă â î ș ț. Each page's Help modal
  is hand-maintained; update both helpBody translations for changed behavior.
  In editor.html use rem for UI chrome, except deliberate coarse-pointer px
  rules preserving 44px touch targets. Drawing coordinates are world coordinates.
- No new runtime dependencies or bundler. Existing optional integrations:
  Mammoth docx CDN, lazy Google Identity for Drive, user-configured Tesseract OCR,
  tile/geocoder endpoints and licensed optional Song packs. Preserve offline
  baseline behavior; these exceptions do not authorize more dependencies.
- Transfer uses user-carried WebRTC signaling and Web Bluetooth NUS; do not
  add a signaling server. Recipe PDF/JP2 readers, local USDA tables, graph and
  map are deliberately implemented locally.
- Voice/Song share PCM, analysis and synthesis. Source WAV bytes are immutable;
  failed storage must retain exportable audio. Consult Song docs for bounded
  decoding/rendering, capture recovery, licensed packs and archive limits.
- Markdown storage and asynchronous operations have revision/destination guards;
  preserve them when changing workbook saves, imports, paste, dictation or Drive.
  Apply editor edits through its existing undo/history integration.

## Commands and test selection

| Need | Command from repository root |
|---|---|
| Locate a task's code/docs/tests | `python3 scripts/agent-context.py markdown` |
| Parse apps/helpers, compare nav, check diacritics | `node tests/verify.js` |
| Syntax only, specified files | `node scripts/check-source.js index.html js/markdown/files.js` |
| Browser launch diagnosis once | `python3 scripts/run-tests.py --doctor` |
| Named standalone suites | `python3 scripts/run-tests.py nav wbtodo` |
| A Playwright Test task folder | `python3 scripts/run-tests.py 02-adapt-the-menu-for-small-screens` |
| A review tag | `python3 scripts/run-tests.py index-review --grep @idx-nav-test-contract` |
| Discover existing suite entrypoints | `python3 scripts/run-tests.py --discover` |
| Read executable task manifest | `python3 scripts/markdown-tasks.py manifest docs/tasks/<module>` |
| Workflow tooling regression | `python3 scripts/run-tests.py agent-tools.py` |
| Check skill links and hook adapters | `python3 scripts/setup-agent-links.py --check` |

Root `npm test` covers only the three configured task spec directories.
`npm --prefix tests test` is a curated standalone loop; neither is all tests.
`tests/index-review/` has its own config. Select tests by behavior; router/presets
are starting points, not proof of coverage. New spec folders outside root
testMatch need a config; the portable runner reports that instead of silently
running zero cases. Full inventories live in `tests/README.md` and package files.

The runner discovers an explicit PW_CHROME_PATH, installed Playwright browser,
or a system/browser-cache Chrome. It never installs dependencies or contacts a
provider. `--doctor` distinguishes launch/setup failures before expensive runs.
For restricted Codex wrapper environments use the existing
`node tests/runner-browser-sandbox.js` host probe; permission/environment failures
are not product defects. Do not bypass a sandbox or repeat an unchanged failure.

Tests use real DOM geometry, pixels, export round trips and stub external APIs.
Reuse `tests/lib.js` and feature fixtures. Screen-capture tests require a headed
browser/display (Xvfb where available). See HANDOFF testing section for drawing.
Keep full logs in ignored `test-results/`; commit only selected useful evidence.
Do not treat historical known-failure lists as current or passing results.

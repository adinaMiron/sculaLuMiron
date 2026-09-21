# webPages

Seven standalone browser tools. No build step, no dependencies to install —
open any `.html` file in a browser and it runs.

| Tool | File | What it does |
|---|---|---|
| **Caiet vocal** | `voice.html` | Voice dictation → text. Romanian & English, server or in-browser transcription. |
| **Image Marker** | `editor.html` | Screen annotation & drawing: shapes, arrows, freehand, text, screenshots, screen recording. |
| **Markdown Editor** | `index.html` | Markdown editing with live preview, workbooks of chapters, docx import, HTML export, an Obsidian-style knowledge graph over `[[wikilinks]]` and `#tags`, and a folder of photos and films read through its own metadata — when each was taken, where, and the name hiding in the file name. |
| **Calendar** | `calendar.html` | Events on days and hours — month, week, day and agenda views — kept in Google Calendar's own event shape, so the `.ics` and JSON exports are what Google takes. |
| **Transfer** | `transfer.html` | Moves a file, a pile of files or a whole folder tree to another device: **Wi-Fi** (a direct WebRTC link, two codes swapped by hand, no server) or **Bluetooth** (a device speaking the Nordic UART service). Remembers the devices it has talked to, and forgets them on request. |
| **Hartă** | `map.html` | Draws the places written in markdown with `^@` — a name, a street with a number, or plain coordinates — on a map, laid out in layers by the heading each one sits under. The map is hand-rolled (OpenStreetMap tiles, no map library); both the tile address and the geocoder are visible, editable fields, so a local tile folder makes it work with no internet. |
| **Rețete** | `recipes.html` | Reads a meal plan or a recipe book out of a PDF (or a photo, or pasted text) and writes it as recipe markdown — one chapter per day, ingredients and method. Reads its own PDFs and its own JPEG 2000 scans, recognises photos in the page, and lets a hundred days be searched, filtered and rearranged. |

All seven share a common nav bar and link to each other.

## Running

Open the file directly, or serve the folder:

```bash
python3 -m http.server 8000
```

Some features need a secure context (`https://` or `localhost`) rather
than `file://` — microphone capture, screen capture, and the File System
Access API. Use the server command above if those don't work.

## Browser support

Chromium-based browsers get the full feature set. Screen capture and
recording (`getDisplayMedia`) are unavailable on iOS Safari and most
mobile browsers — a platform limitation. The apps warn rather than
failing silently.

`recipes.html` reads PDFs on its own, with no library: text extraction is
built in. Reading text out of a *picture* needs an OCR engine, which is not
bundled — the page asks before loading one, and pasted text (what a phone's
own "copy text from picture" gives you) always works without it. See
[`docs/RECIPES.md`](docs/RECIPES.md).

## Setup note

`editor.html` expects nine fonts in a `fonts/` folder next to it. Four are
bundled; the other five you supply yourself — see `PUT FONTS HERE.txt` for
the exact filenames.

## Contributing

Start with [`CLAUDE.md`](CLAUDE.md) — repo conventions and constraints.
Deeper references live in [`docs/`](docs/) and [`HANDOFF.md`](HANDOFF.md).

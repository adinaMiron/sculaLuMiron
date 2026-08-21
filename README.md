# webPages

Three standalone browser tools. No build step, no dependencies to install —
open any `.html` file in a browser and it runs.

| Tool | File | What it does |
|---|---|---|
| **Caiet vocal** | `index.html` | Voice dictation → text. Romanian & English, server or in-browser transcription. |
| **Image Marker** | `editor.html` | Screen annotation & drawing: shapes, arrows, freehand, text, screenshots, screen recording. |
| **Markdown Editor** | `markdown-editor.html` | Markdown editing with live preview, workbooks of chapters, docx import, HTML export, and an Obsidian-style knowledge graph over `[[wikilinks]]` and `#tags`. |

All three share a common nav bar and link to each other.

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

## Setup note

`editor.html` expects nine fonts in a `fonts/` folder next to it. Four are
bundled; the other five you supply yourself — see `PUT FONTS HERE.txt` for
the exact filenames.

## Contributing

Start with [`CLAUDE.md`](CLAUDE.md) — repo conventions and constraints.
Deeper references live in [`docs/`](docs/) and [`HANDOFF.md`](HANDOFF.md).

# Markdown editor scripts

`index.html` loads these as ordinary browser scripts in the order listed
below. They share the page's global scope, so later files can use functions
and state from earlier ones. Keep the `<script>` tags synchronous and ordered;
`async`, `defer`, or `type="module"` would change startup and inline `onclick`
behavior. All paths are relative, so opening `index.html` with `file://` works.

| File | Find here |
|---|---|
| `i18n.js` | Romanian and English strings, UI language, `store` |
| `editor.js` | Editor selection, undo/redo, formatting actions, image paste and explorer, responsive panels |
| `markdown.js` | Wikilink/date/place/importance/timeline rendering, Markdown parser, preview, navigation |
| `workbooks.js` | IndexedDB, workbooks and chapters, folder mirroring, pending edits, autosave and restore |
| `idea.js` | Quick idea capture and chapter routing |
| `graph.js` | Knowledge graph, causality diagram, graph canvas and settings |
| `search.js` | Search scopes, filters, hit rendering and navigation |
| `garden.js` | Garden log parsing, filters, totals and CSV |
| `media.js` | Photo/video metadata readers, folder scanning and output |
| `wikilinks.js` | Wiki link dialog and `[[` suggestions |
| `files.js` | New/open/import/export, table, timeline, code and link dialogs |
| `events.js` | Editor and keyboard event handlers |
| `dictation.js` | Speech transcription into notes or the idea dialog |
| `drive.js` | Google Drive authentication, merge and sync |
| `startup.js` | Initial rendering, layout and workbook boot (after Drive is defined) |

The shared navigation script (`ScuLaFolder`, `ScuLaCal`, `ScuLaGeo`) remains
inside the common toolbar block in `index.html`, as in the other seven pages.
The new files contain the editor script verbatim. Startup loads last so the
workbook boot can call the Drive functions. See
[`docs/MAP.md`](../../docs/MAP.md) for feature entry points.

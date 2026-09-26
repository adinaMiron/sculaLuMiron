# webPages

Nine standalone browser tools. No build step, no dependencies to install —
open any `.html` file in a browser and it runs.

| Tool | File | What it does |
|---|---|---|
| **Song Creation / Creează melodie** | `song.html` | Named music projects, voice/humming and instrument samples, original 24-bit PCM WAV, local persistence and export. |
| **Caiet vocal** | `voice.html` | Voice dictation → text. Romanian & English, server or in-browser transcription. |
| **Image Marker** | `editor.html` | Screen annotation & drawing: shapes, arrows, freehand, text, screenshots, screen recording. |
| **Markdown Editor** | `index.html` | Markdown editing with live preview, workbooks of chapters, docx import, HTML export, an Obsidian-style knowledge graph over `[[wikilinks]]` and `#tags`, and a folder of photos and films read through its own metadata — when each was taken, where, and the name hiding in the file name. |
| **Calendar** | `calendar.html` | Events on days and hours — month, week, day and agenda views — kept in Google Calendar's own event shape, so the `.ics` and JSON exports are what Google takes. |
| **Kanban** | `kanban.html` | Checklist tasks from one chapter, one workbook, or all workbooks, grouped by state with search, responsible, priority and date filters. Move cards between states and open the source line. |
| **Transfer** | `transfer.html` | Moves a file, a pile of files or a whole folder tree to another device: **Wi-Fi** (a direct WebRTC link, two codes swapped by hand, no server) or **Bluetooth** (a device speaking the Nordic UART service). Remembers the devices it has talked to, and forgets them on request. |
| **Hartă** | `map.html` | Draws the places written in markdown with `^@` — a name, a street with a number, or plain coordinates — on a map, laid out in layers by the heading each one sits under. The map is hand-rolled (OpenStreetMap tiles, no map library); both the tile address and the geocoder are visible, editable fields, so a local tile folder makes it work with no internet. |
| **Rețete** | `recipes.html` | Reads a meal plan or a recipe book out of a PDF (or a photo, or pasted text) and writes it as recipe markdown — one chapter per day, ingredients and method. Reads its own PDFs and its own JPEG 2000 scans, recognises photos in the page, and lets a hundred days be searched, filtered and rearranged. |

All nine share a common nav bar and link to each other.
The Markdown editor's JavaScript lives in [`js/markdown/`](js/markdown/README.md).

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

---

## User guide

This guide brings together the Help panels in the pages. The interface can be
switched between Romanian and English; the guides below use the English labels.

**Jump to:** [Markdown editor](#markdown-editor-indexhtml) ·
[Voice notebook](#voice-notebook-voicehtml) · [Song Creation](#song-creation-songhtml) ·
[Image Marker](#image-marker-editorhtml) ·
[Calendar](#calendar-calendarhtml) · [Kanban](#kanban-kanbanhtml) ·
[Transfer](#transfer-transferhtml) · [Map](#map-maphtml) ·
[Recipes](#recipes-recipeshtml).

### Markdown editor (`index.html`)

#### Workbooks and chapters

- A workbook holds chapters; each chapter is a Markdown file. Write in the
  editor on the left and read the rendered preview on the right.
- Open **Workbooks** with <kbd>Ctrl+2</kbd>. Double-click a name or select it
  and press <kbd>F2</kbd> to rename it. Drag chapters to reorder or move them
  between workbooks; on touch screens, press and hold before dragging.
- Typing autosaves in the page. **Save to workbook** (<kbd>Ctrl+S</kbd>) writes
  to the folder chosen with 📁. **Save all modified** (<kbd>Ctrl+Alt+S</kbd>)
  writes every changed chapter; a dot marks chapters not yet written to disk.
- **Sync to folder** imports new workbooks and chapters from the Markdown
  folder, then writes all chapters back. **Google account** connects and syncs
  with Drive; click again to sync and right-click to disconnect. Drive sync
  needs the page opened over HTTP(S), not `file://`.
- A workbook whose name contains `TODO` gets a button to show chapters with
  open tasks. **Tasks only** applies across all workbooks and shows only
  unchecked task lines in the open chapter.

#### Writing and linking notes

- The toolbar formats bold and italic text, headings, lists, task lists, code,
  tables, images, links, font size, text colour and highlighting. Select text
  before applying size, colour or highlight. Pasting an image with
  <kbd>Ctrl+V</kbd> embeds it in the text.
- Type `[[` for note suggestions; use ↑/↓, then Enter or Tab to insert, or Esc
  to dismiss. The Note link button and <kbd>Ctrl+Shift+L</kbd> open the same
  action. `[[Note]]` opens a chapter, `[[Note#Section]]` jumps to a heading,
  `[[Note#^anchor]]` jumps to a block, and `[[#Section]]` links within the
  current note. `![[image.png]]` embeds an image; `![[Note]]` makes a card that
  opens a note. `#tag` marks a tag. Following a link to a missing note creates
  its chapter.
- The **Graph** button or <kbd>Ctrl+3</kbd> displays notes as linked nodes for
  the open note, its workbook, or all notes. Its side panel has Filters,
  Groups, Display and Forces.
- In the graph, **Causality** displays relationships between key words.
  Write each relationship on its own line: `stress -> insomnia` means more of
  one leads to more of the other; `stress -| sleep` means more stress leads to
  less sleep. `~>` and `~|` mark delayed effects. Closed chains are loops:
  **R** loops amplify and **B** loops balance. Hover a listed loop to light it
  up; click to pin it. Use `[[Note]]` or `#tag` for a linked key word.

#### Other Markdown tools

- **Garden** (🌱 or <kbd>Ctrl+5</kbd>) reads dated notes such as `@22.07.2026`
  and makes activity, harvest and mowing tables. It recognizes place codes
  (`sm`, `s1`, `s2`, `gg`, `gp`, `gn`, and names such as “solar mare”) and
  plant synonyms, while retaining unknown names as written. Filter by date,
  place, plant or activity; group by day, month, place or plant. Totals follow
  the filters; **Up to** starts at today. Export the visible table as CSV, or
  click a row to jump to its source line.
- **Photos** (📸 or <kbd>Ctrl+6</kbd>) reads a folder and its subfolders for
  photo and video dates and GPS. Date sources are metadata (EXIF / video
  `moov` boxes), a date in the filename, then the file date. Names are derived
  from filename text left after removing dates and times. GPS becomes a `^@`
  marker. Choose list (`@date`), timeline (`#date - !event`) or table output;
  each row's checkbox controls what is written. CSV exports all visible rows.
- **Find** (🔍, <kbd>Ctrl+4</kbd> or <kbd>Ctrl+Shift+F</kbd>) searches the
  chapter, workbook or all notes. Options include case matching, whole words,
  regular expressions, ignoring diacritics (on by default), line-kind filters
  and tag filters. Toolbar filters can narrow workbooks and preview lines by
  responsible person, task status or importance.
- **Quick idea** (💡 or <kbd>Ctrl+Alt+I</kbd>) files `Chapter name: idea` in
  that chapter. Without a chapter name, it goes into today's chapter in the
  `Idei` workbook. Press <kbd>Ctrl+Enter</kbd> to file or <kbd>Esc</kbd> to
  close.
- Importance markers are `!nice` 🌱, `!important` ⭐ and `!vital` 🔥. Choose
  one in the toolbar or use <kbd>Ctrl+Alt+1/2/3</kbd>; <kbd>Ctrl+Alt+0</kbd>
  clears it. Clicking a marker searches for notes with the same importance.
- Task states are to do (`- [ ]`), in work (`- [ ] ~inwork`), on hold
  (`- [ ] ~onhold`), blocked (`- [ ] ~blocked`) and done (`- [x]`). Set a
  state from the toolbar for the task at the caret or selected tasks; a preview
  checkbox toggles done/to do.
- **Kanban** (▦) opens tasks from the current chapter, one workbook or all
  workbooks. Search, filter and move tasks between states. Add `start@YYYY-MM-DD`
  or `end@YYYY-MM-DD` to show start or due dates.
- **Gantt** (▤) lays current-chapter tasks across days, including unsaved
  edits. Give a task an ID such as `#1` and refer to it from dependent tasks
  with `$1`; arrows show dependencies. `start@` and `end@` set the date range;
  undated tasks appear today. Click a task title to jump to its editor line.
- Mark a responsible person with `>>Name` anywhere in the text, or use
  `Name>> text` at the start of a line.
- Calendar markers can be dates (`@2026-09-03`), times, time ranges or day
  ranges using `..`. **Push dates** (📅 or <kbd>Ctrl+Alt+D</kbd>) sends them to
  Calendar. Place markers such as `^@Peleș Castle`, `^@12 Lipscani Street,
  Bucharest` or `^@44.4268, 26.1025` go to Map (🗺 or
  <kbd>Ctrl+Alt+M</kbd>); text after `|` is a note, and a `#tag` ends the
  address. Places are grouped under the heading above them.
- Timeline entries use `#date - !event`, for example
  `#1969 - !First man on the Moon`. Put consecutive entries on separate lines.
  Dates can be a year, month or day (`#1969`, `#2026-09`, `#2026-09-21`,
  `#21.09.2026`). After `!`, add text, an image (`![moon](moon.png)`) or a
  link (`![Apollo 11](https://nasa.gov)`). The Timeline toolbar button inserts
  three editable example lines.
- Undo/redo (<kbd>Ctrl+Z</kbd>, <kbd>Ctrl+Shift+Z</kbd> or
  <kbd>Ctrl+Y</kbd>) uses the editor's history and tracks toolbar actions.
  **Import DOCX** converts Word documents to Markdown. **Export HTML** makes a
  self-contained page with copy buttons on code blocks; **Open HTML** opens an
  exported page in a new tab. The 🎙 toolbar button dictates at the caret using
  the Voice notebook settings.

#### Markdown editor shortcuts

| Shortcut | Action |
|---|---|
| <kbd>Ctrl+S</kbd> / <kbd>Ctrl+Shift+S</kbd> | Save to workbook / export file |
| <kbd>Ctrl+Alt+S</kbd> | Save all modified chapters |
| <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Shift+Z</kbd> / <kbd>Ctrl+Y</kbd> | Undo / redo |
| <kbd>Ctrl+B</kbd> / <kbd>Ctrl+I</kbd> | Bold / italic |
| <kbd>Ctrl+K</kbd> / <kbd>Ctrl+Shift+K</kbd> | Insert link / code block |
| <kbd>Ctrl+Shift+1…6</kbd> | Headings H1–H6 |
| <kbd>Ctrl+Enter</kbd> / <kbd>Ctrl+Shift+Enter</kbd> | Blank line after / before |
| <kbd>Alt+↑</kbd> / <kbd>Alt+↓</kbd> | Move line |
| <kbd>Ctrl+L</kbd> | Select line; press again for paragraph |
| <kbd>Ctrl+1</kbd> / <kbd>Ctrl+2</kbd> | Navigation / workbooks |
| <kbd>Ctrl+3</kbd> / <kbd>Ctrl+4</kbd> | Graph / search |
| <kbd>Ctrl+Shift+F</kbd> | Search |
| <kbd>Ctrl+5</kbd> / <kbd>Ctrl+6</kbd> | Garden / photos |
| <kbd>Ctrl+Shift+L</kbd> | Insert `[[note]]` link |
| <kbd>Ctrl+Alt+I</kbd> / <kbd>Ctrl+Alt+D</kbd> / <kbd>Ctrl+Alt+M</kbd> | Quick idea / push dates / map |
| <kbd>Ctrl+Alt+1/2/3</kbd> / <kbd>Ctrl+Alt+0</kbd> | Set / clear importance |
| <kbd>F2</kbd> | Rename selected workbook or chapter |
| <kbd>Esc</kbd> | Close the open window |

### Voice notebook (`voice.html`)

- **Caiet vocal** turns speech into text in the browser or through an external
  transcription engine. Press the large record button to start and again to
  stop; the clock shows elapsed speech time. Spoken language (Romanian,
  English or Auto) is independent of the interface language.
- In **Settings**, choose **Server (accurate)** to send audio to Groq, OpenAI
  or a custom server (requires an API key, kept on this device), or **Browser
  (no key)** for live dictation when the browser supports it.
- To keep the recording, tick **Also save the sound of the recording** before
  recording. The audio is saved with the text under the same name. Afterward,
  copy, share, download or clear the text, or transcribe an existing audio file.
- To make a melody, tick **Also keep the sound for the melody** before
  recording. Open **Melody from the recording** and choose **Make the melody**.
  The page detects pitch and beat, then plays the notes with the selected
  instrument and accompaniment. **Scale** snaps notes to a scale; **No
  snapping** leaves them as sung. Beat snapping can use quarter, eighth or
  sixteenth notes. Tempo is detected but editable. Save as WAV audio or MIDI
  notes; an audio file can also be used, up to its first three minutes. The
  sound is synthesized in the page.
- The 📁 button chooses the destination: a computer folder, the phone share
  sheet or a regular download. Files go into `transcript`.

| Shortcut | Action |
|---|---|
| <kbd>Esc</kbd> | Close Settings or the folder picker |

### Image Marker (`editor.html`)

- **Open image** loads JPG/PNG. **New canvas** starts with a preset size or an
  infinite canvas; infinite-canvas export crops to the drawing with a 10 px
  margin.
- The floating Tools panel groups selection, text, pencil and highlight under
  Basic; rectangle, ellipse, rhombus and line under Shapes; and arrow, curved
  arrow, spline and polyline under Arrows. Drag panels to move them; ⤢ restores
  their default positions.
- For spline curves and polylines, click to add points and press
  <kbd>Enter</kbd> or double-click the last point to finish; <kbd>Escape</kbd>
  cancels. Drag points to reshape. The selection panel's **Points** row has
  Corner and Remove actions for the selected vertex.
- Select a shape to edit its colour, fill, stroke width, sketch style
  (Architect / Artist / Cartoonist), opacity and rotation. Drag a corner handle
  to resize and the top handle to rotate. Hold Shift while clicking to select
  several layers.
- The mouse wheel scrolls; <kbd>Ctrl</kbd>+wheel zooms. The − / 100% / +
  buttons zoom too; <kbd>Ctrl+0</kbd> fits the view. On touch screens, pinch to
  zoom and use one finger to pan. Arrow keys pan; hold <kbd>Shift</kbd> for a
  larger step.
- **Screenshot** loads a screen capture into the editor. **Record** records
  the screen with audio onto the canvas and supports pause/resume.
- **Save** exports the canvas size (or crops an infinite canvas to its
  drawing). **All sizes** exports a ZIP of preset sizes up to the current one.
  **Drive** connects Google and saves into a `Mazgaleste` folder.

| Shortcut | Action |
|---|---|
| <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Shift+Z</kbd> / <kbd>Ctrl+Y</kbd> | Undo / redo |
| <kbd>Ctrl+C</kbd> / <kbd>Ctrl+V</kbd> | Copy / paste |
| <kbd>Ctrl+G</kbd> / <kbd>Ctrl+Shift+G</kbd> | Group / ungroup |
| <kbd>Ctrl+=</kbd> / <kbd>Ctrl+-</kbd> / <kbd>Ctrl+0</kbd> | Zoom in / out / fit |
| <kbd>Delete</kbd> | Delete selection or selected curve point |
| Arrow keys (hold <kbd>Shift</kbd> for more) | Pan the view |
| <kbd>V</kbd>, <kbd>T</kbd>, <kbd>R</kbd>, <kbd>O</kbd>, <kbd>D</kbd> | Select, text, rectangle, ellipse, rhombus |
| <kbd>P</kbd>, <kbd>H</kbd>, <kbd>A</kbd>, <kbd>L</kbd> | Pencil, highlight, arrow, line |
| <kbd>S</kbd>, <kbd>C</kbd>, <kbd>G</kbd> | Curved arrow, spline, polyline |

### Calendar (`calendar.html`)

- Switch among **Month**, **Week**, **Day** and chronological **Agenda**. ‹ / ›
  move to the previous or next period; **Today** returns to the current day.
- **+ Event** opens a blank event. On the Week or Day hour grid, drag to select
  an interval (snaps to 15 minutes) or click once for a full hour. Events have a
  title, start/end date and time, all-day setting, colour, calendar/category,
  tags, place, notes and recurrence.
- The sidebar search and calendar, tag, source and colour filters are built
  from existing events. Newly tagged events remain visible by default.
- Export **.ics** to import into Google Calendar (Settings → Import & export)
  or another calendar. Export **JSON** for Google Calendar's `events.insert`
  API. Exports include only events visible after filtering. **Import .ics /
  .json** reads files exported here.
- Markdown `@date` markers reach Calendar from the editor's 📅 **Push dates**
  action or <kbd>Ctrl+Alt+D</kbd>. Re-syncing updates the event title and date
  without making a duplicate.

| Shortcut | Action |
|---|---|
| <kbd>←</kbd> / <kbd>→</kbd> | Previous / next period |
| <kbd>T</kbd> | Today |
| <kbd>N</kbd> | New event |
| <kbd>M</kbd> / <kbd>W</kbd> / <kbd>D</kbd> / <kbd>A</kbd> | Month / Week / Day / Agenda |
| <kbd>/</kbd> | Search |

### Kanban (`kanban.html`)

Open Kanban from the Markdown editor's ▦ button. Choose the current chapter,
one workbook or all workbooks. The board shows tasks as cards grouped by state;
search and filter by responsible person, importance and date, move cards between
states, and open a task's source line. Use `start@YYYY-MM-DD` and
`end@YYYY-MM-DD` in a task to give it a start or due date. Task states use the
Markdown forms `- [ ]`, `- [ ] ~inwork`, `- [ ] ~onhold`, `- [ ] ~blocked` and
`- [x]`.

### Transfer (`transfer.html`)

Transfer moves files or whole folder trees directly between devices. Wi-Fi
connects two browsers; Bluetooth connects to a device that supports Nordic
UART.

#### Wi-Fi connection

Both devices should be on the same Wi-Fi network. On the sending device choose
**I'll start the link** and share its code, either by copying it or sharing a
link. On the other device choose **I'm joining a link**, paste the code and
press **Use this code**. Send the reply code back to the first device and use it
there too. A green dot means the devices are linked. Either device can send
once connected. Codes are single-use and expire if the page closes or another
link starts. Devices on different networks may need a STUN server in Settings;
some networks, including some mobile and hotel networks, still prevent a direct
connection.

#### Bluetooth and sending files

- Browsers can be Bluetooth centrals but cannot advertise themselves, so two
  browsers cannot connect to each other over Bluetooth. Use Wi-Fi for
  phone-to-phone transfers.
- Bluetooth requires a device advertising Nordic UART Service: service UUID
  `6e400001-b5a3-f393-e0a9-e50e24dcca9e`, write characteristic
  `6e400002-…`, and notify characteristic `6e400003-…`. Choose **Look for a
  device** and select it in the browser chooser. Web Bluetooth works in Chrome
  and Edge, not Safari or Firefox. It is best for notes and small files.
- Add items with **Files…**, **A folder…**, **The Scula folder** (chosen with
  📁, including the `markdown/`, `retete/`, `desen/`, `transcript/` and
  `calendar/` content), or drag files/folders onto the drop area. The send list
  can collect more items; ✕ removes a row. The same path replaces an existing
  item in the outgoing list rather than duplicating it.
- Received files can stay in the list for manual saving, save automatically to
  the page's `transfer` folder, or save automatically into the chosen Scula
  folder while preserving their paths. Nothing is overwritten: name collisions
  become `name-1`, `name-2`, and so on. Direct folder saving requires a selected
  folder and desktop Chrome or Edge. On phones, save using the buttons; **As
  .zip** keeps a received folder tree together.
- Known devices are kept in this browser's IndexedDB with their name, method,
  last-seen time and transfer total. **Forget** removes one; **Forget every
  device** clears the list. **Reconnect** is available for known nearby
  Bluetooth devices. Set the name other devices see in Settings.

If a code is refused, copy it in full. If linking stalls, check that the
devices share a network and that client isolation is off; a phone hotspot can
help. If a transfer stops, fully received files remain saveable. Large folders
are best sent in batches or saved directly as they arrive.

### Map (`map.html`)

- Map places from Markdown `^@` markers. The Markdown page's 🗺 button sends its
  open chapter; **Open .md** reads a file directly. Examples:

  ```text
  ^@Peleș Castle
  ^@12 Lipscani Street, Bucharest
  ^@44.4268, 26.1025
  ^@Peleș Castle | second day, morning
  ```

  Coordinates need no online lookup. Text after `|` is a note. A `#tag` on the
  same line ends the address and remains attached to the line.
- Each place belongs to the layer of the heading above it, such as `## Day 2`.
  Click a layer name to hide/show it or ▸ to collapse it. Click a place to move
  the map there.
- Drag with mouse or finger; use the wheel or <kbd>+</kbd>/<kbd>−</kbd> to
  zoom. <kbd>F</kbd> frames all places. **Fit all** does the same.
- Tiles come from OpenStreetMap. Under ⚙, edit the tile URL template or point
  it at a local `./tiles/{z}/{x}/{y}.png` folder. An empty template leaves the
  graticule and points visible without tiles. Address lookup uses the
  configurable geocoder (Nominatim by default), one request per second;
  results are remembered. An empty geocoder field disables online lookup, so
  only coordinate markers appear.
- **Look up addresses again** repeats address lookup. **Export** saves located
  places as GeoJSON.

### Recipes (`recipes.html`)

- Import a PDF (including scanned PDFs), photo, text, or Markdown file written
  by Recipes or the Markdown editor. Several photos can be added together;
  **Camera** uses the phone camera, **Paste text** accepts copied text, and a
  clipboard image can be pasted with <kbd>Ctrl+V</kbd>. **Import .md** restores
  days, meals, ingredients and steps. A self-contained HTML page exported here
  can also be dropped into the import area and restored, including flags,
  groups and matched USDA foods. **Enter manually** accepts an ingredient list
  with quantities followed by `Method:` and the steps.
- Scanned PDFs and photos are read automatically on the page with Tesseract.
  The OCR engine loads once on first use and can use an editable local address
  for offline copies. The text stays on the device. Review and correct parsed
  days, meals, ingredient quantities, units, foods and method steps.
- Each ingredient is matched against the bundled USDA FoodData Central data;
  nutrition values recalculate from the matched food and quantity. Matches are
  kept in the ingredient book. Open an ingredient's caret for its other values
  such as fibre, vitamins and minerals.
- Build a day one meal at a time with **+ from the library**. Add recipes from
  an HTML/Markdown file or use ⊕ beside a meal in the plan. Choose meal flag
  (breakfast, brunch, lunch, dinner, snack or dessert), target day and recipe;
  **As saved** retains its current flag. A copied recipe can be edited in the
  day without changing the library entry. Daily totals update as meals are
  added.
- **Daily targets** compare each day with calorie, protein, carbohydrate and
  fat targets. A blank field means there is no target for that nutrient, not a
  target of zero. Collapsed days show the energy result; targets are also
  included in Markdown and HTML exports.
- Search and the comma-separated ingredient filter narrow the visible plan.
- Save as **.md** to edit or re-import, **.json** to move the ingredient book,
  or **.html** for a self-contained, searchable page suited to sharing or
  printing. The 📁 button chooses a computer folder, phone share sheet or
  regular download destination.

### Song Creation (`song.html`)

Create or rename a project, allow microphone access, choose a microphone and
record a named **Melody / humming** or **Instrument sample** take. Sample details
are optional. Stop to retain the original WAV; play, rename, delete or save each
take from the project list. Save metadata separately with **Save metadata**.

Source WAVs are genuine 24-bit PCM, at the Web Audio capture rate shown on screen.
The page requests 48 kHz and disabled speech processing, then reports actual
microphone settings. Browser/device quality varies; 24-bit encoding does not
prove 24-bit microphone precision. Keep the page in the foreground.

Projects and WAV Blobs survive reload in IndexedDB. Export backups: clearing
browser storage removes them. Desktop folder saves use `Song Creation/<project>/`
with `recordings/` and `samples/`; phones use the existing share/download route
with ownership in filenames. Metadata export references the WAVs, without
embedding audio. Importing exported projects is a future feature. See
[architecture and testing](docs/FEATURES.md#v-song-creation-songhtml).

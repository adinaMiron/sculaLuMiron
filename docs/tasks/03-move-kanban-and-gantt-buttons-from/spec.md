# task-03 — Move the Kanban and Gantt buttons from the header into the formatting toolbar

## Requirement (verbatim)

> Move Kanban and Gantt buttons from the toolbar near Trimite datele to the
> markdown hamburger menu, at the right of the select filters container.

## Agreed decisions (binding — from the product owner)

1. **"Markdown hamburger menu"** = the formatting toolbar in `index.html`,
   i.e. `.toolbar-groups` (`#toolbar-groups`), the part that folds away behind
   `#btn-toolbar-toggle` (☰) on small screens. Not the ☰ Nav panel, not the
   shared site nav.
2. **Placement**: *outside* the bordered `.toolbar-filters` box, immediately
   after it, preceded by one `<div class="toolbar-sep"></div>`. They open
   views; they do not filter, so they don't go inside the box.
3. **Look**: flat toolbar style — `class="tb-btn"` (like 🔍 Find / 🕸 Graph),
   not the bordered header `.btn`. Labels stay "▦ Kanban" and "▤ Gantt".
4. **Everything else about the buttons stays**: ids `btn-kanban` /
   `btn-gantt`, `onclick="openKanban()"` / `onclick="openGantt()"`,
   `data-i="kanbanBtn"` / `data-i="ganttBtn"`, `data-i-title="kanbanTip"` /
   `data-i-title="ganttTip"`, and the English `title` attributes.
5. **Accepted consequence**: because they live in `.toolbar-groups`, they are
   hidden along with the rest of the toolbar when it is collapsed via ☰ on
   small screens. Do not add special handling to keep them visible.
6. The shared nav block, the other eight pages, `kanban.html`, and the
   Kanban/Gantt views themselves (`openKanban` in `js/markdown/markdown.js`,
   `js/markdown/gantt.js`) are **unchanged**.

## Where things are now (index.html, HEAD)

- Header, `.header-actions` (≈ lines 3564–3580):
  - 3571 `#btn-cal-sync` ("📅 Push dates" / RO "Trimite datele")
  - 3572 `<button class="btn" id="btn-kanban" onclick="openKanban()" data-i="kanbanBtn" data-i-title="kanbanTip" title="Open the task board for this chapter">▦ Kanban</button>`
  - 3573 `<button class="btn" id="btn-gantt" onclick="openGantt()" data-i="ganttBtn" data-i-title="ganttTip" title="Show this chapter's tasks as a Gantt chart">▤ Gantt</button>`
  - then the comment + `#btn-map` …
- Toolbar: `#btn-toolbar-toggle` ≈3604, `<div class="toolbar-groups" id="toolbar-groups">` ≈3606,
  … `#btn-nav` ≈3690, `<div class="toolbar-filters" role="group">` ≈3692
  containing `#btn-filter-todo`, `#responsible-select`, `#importance-select`,
  then `</div>` (closes `.toolbar-filters`), then `</div>` (closes
  `.toolbar-groups`), then `</div>` (closes the toolbar).

Line numbers drift — grep `id="btn-kanban"` and `class="toolbar-filters"`.

## Changes (product code: `index.html` only, plus docs)

### 1. Remove from the header
Delete lines `#btn-kanban` and `#btn-gantt` from `.header-actions`. After the
edit, `#btn-cal-sync` is directly followed by the `<!-- Shown only while the
open chapter holds a "^@" place …` comment and `#btn-map`. Nothing else in
the header changes.

### 2. Insert into the toolbar
Between the `</div>` that closes `.toolbar-filters` and the `</div>` that
closes `.toolbar-groups`, insert exactly (2-space indent, like the siblings):

```html
  <div class="toolbar-sep"></div>
  <button class="tb-btn" id="btn-kanban" onclick="openKanban()" data-i="kanbanBtn" data-i-title="kanbanTip" title="Open the task board for this chapter">▦ Kanban</button>
  <button class="tb-btn" id="btn-gantt" onclick="openGantt()" data-i="ganttBtn" data-i-title="ganttTip" title="Show this chapter's tasks as a Gantt chart">▤ Gantt</button>
```

Resulting DOM order inside `#toolbar-groups`, at the end:
`… #btn-nav, .toolbar-filters, .toolbar-sep, #btn-kanban, #btn-gantt` and
then `#toolbar-groups` closes. Both buttons must be children of
`#toolbar-groups` (not of `.toolbar-filters`, not of `header`).

### 3. No CSS, JS or i18n changes
- No new CSS: `.tb-btn` and `.toolbar-sep` already cover desktop and the
  small-screen media query (`.toolbar-groups` becomes a wrapping flex row;
  its `max-height: 400px` has room for two more buttons).
- No JS change: nothing looks the buttons up by position or by `header`
  ancestry (only `tests/gantt.js` clicks `#btn-gantt` by id).
- No i18n change: the keys `kanbanBtn`, `kanbanTip`, `ganttBtn`, `ganttTip`
  already exist in both languages in `js/markdown/i18n.js`; the `data-i`
  mechanism relabels the buttons wherever they are.
- Do not add the buttons to `.active` state handling; they are plain action
  buttons.

### 4. Docs (same change)
- `docs/FEATURES.md` § "Kanban board (`kanban.html`)" (≈ line 751): change
  "The editor's **▦ Kanban** button" to say it sits in the editor's
  formatting toolbar, right of the task filters (e.g. "The **▦ Kanban**
  button in the editor's toolbar, right of the task filters, saves …").
  § "Chapter Gantt view" ("beside Kanban") stays true — leave it.
- `docs/MAP.md`: it has no line anchor for these two buttons; only fix an
  `index.html` anchor if this edit makes it off by more than a few lines
  (removing 2 and adding 3 lines — likely nothing to fix; check the
  `index.html` section and say so in the implementation report).
- Do not touch `CLAUDE.md` line counts for this (+1 line).

## Out of scope
The nav block (Rule 2 — must stay byte-identical across the nine files), any
other page, `kanban.html`, `openKanban`/`openGantt` behaviour, keyboard
shortcuts, the ☰ collapse behaviour, and the `#btn-map` / other header
buttons.

## Tests
Standing team policy: the Tester adds a Playwright suite under
`tests/03-move-kanban-and-gantt-buttons-from/` plus whatever tooling it needs
(package.json `test` script, playwright.config.*, .gitignore entries). That is
expected and not a scope violation. Existing convention: plain node scripts
using `require('playwright')` with `executablePath:
process.env.PW_CHROME_PATH || '/usr/bin/google-chrome-stable'` (see
`tests/gantt.js`, `tests/03-for-index-html-page-in-idee/`).

What the suite must assert (on `file://…/index.html`):
1. `header #btn-kanban` and `header #btn-gantt` do not exist; `#btn-kanban`
   and `#btn-gantt` each exist exactly once in the document.
2. Both are direct children of `#toolbar-groups`; neither is inside
   `.toolbar-filters`.
3. Order: `.toolbar-filters`' `nextElementSibling` is a `.toolbar-sep`, whose
   next sibling is `#btn-kanban`, whose next sibling is `#btn-gantt`.
4. Both have class `tb-btn` and not `btn`; attributes `onclick`, `data-i`,
   `data-i-title` equal the values above.
5. Labels: English "▦ Kanban" / "▤ Gantt"; after switching the UI language
   to Romanian (the shared nav's language toggle) the labels/titles come from
   the RO strings (`kanbanTip` RO = "Deschide panoul de sarcini pentru acest
   capitol").
6. Desktop (1280×800): on screen, the buttons' bounding boxes lie to the
   right of the `.toolbar-filters` box on the same row (or wrap onto the next
   row start — assert left-of relation only when `top` values match).
7. Clicking `#btn-gantt` opens `#gantt-modal` (`.open`); clicking
   `#btn-kanban` calls `openKanban` (stub `window.openKanban` before the
   click, or assert a navigation toward `kanban.html` — don't depend on
   IndexedDB contents).
8. Small screen (e.g. 390×844): with the toolbar expanded both buttons are
   visible; after clicking `#btn-toolbar-toggle` so `.toolbar` has
   `collapsed`, they are not visible (height 0 / opacity 0 of
   `#toolbar-groups`) — this is the accepted behaviour.
9. `#btn-cal-sync` is still in `.header-actions`, and the existing
   `tests/gantt.js` still passes.

Also run `node tests/verify.js` (parse check, nav-sync, diacritics) — must
pass.

## Manual verification
1. Open `index.html` in a browser at desktop width. The header shows
   … 💡 Idea, 📅 Push dates, (🗺 Map only if the chapter has a `^@`), Open
   .md … — no Kanban or Gantt there.
2. In the toolbar row below, after the bordered box with the three filter
   dropdowns, there is a thin separator, then flat "▦ Kanban" and "▤ Gantt"
   buttons that look like "🔍 Find".
3. Type a task like `- [ ] Plan start@2026-09-24 end@2026-09-27`, click
   ▤ Gantt → the Gantt modal opens. Click ▦ Kanban → the board opens scoped
   to the chapter.
4. Switch the UI to Romanian: tooltips become Romanian.
5. Narrow the window to phone width: the buttons are in the toolbar block;
   tap ☰ to collapse → they disappear with the rest of the toolbar; tap ☰
   again → they come back.

## Done when
- Header no longer contains the two buttons; toolbar contains them exactly as
  in § 2.
- `node tests/verify.js` passes; `tests/gantt.js` passes; the new suite passes.
- `docs/FEATURES.md` Kanban wording updated.

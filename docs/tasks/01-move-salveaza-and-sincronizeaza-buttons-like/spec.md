# Task 01 — Move the save/sync buttons onto their own toolbar line

## Requirement (verbatim)

> Move Salveaza and sincronizeaza buttons, like: Salveaza capitolul curent in
> caiet, Sincronizeaza in dosar, Sincronizeaza acum, the syncronizing status
> and Salveaza tot ce s-a modificat, on a new line of the toolbar.

## Binding decisions (agreed with the product owner)

1. **Placement:** a separate row **between `</header>` and `<div class="toolbar">`**
   in `index.html`. It is **not** inside `.toolbar` / `#toolbar-groups`, so the
   ☰ toolbar collapse (`toggleToolbarCollapse()`, `.toolbar.collapsed`) never
   hides it.
2. **Every screen size** (desktop, tablet ≤1024px, mobile ≤700px, very small
   ≤420px, landscape phone): the row is always visible, on **one line**, which
   **scrolls sideways** when it does not fit. It **never wraps**.
3. **Left-aligned**, in **today's order**:
   1. `📓 Save to workbook` (`.btn.btn-primary`, `saveToWorkbook()`)
   2. `⇩ Sync to folder` (`#btn-wb-sync`)
   3. `☁ …` (`#btn-wb-cloud`)
   4. the status text `#wb-cloud-where` (directly after ☁)
   5. `📚 Save all modified` (`#btn-save-all-modified`)
4. Every button keeps its **id, `onclick`, `oncontextmenu`, `data-i`,
   `data-i-title`, `title`** exactly as today. `#btn-wb-cloud` keeps having
   **no** `data-i` (its label is written by `paintCloud()`). Ctrl+S and
   Ctrl+Alt+S keep working (they call the functions, not the DOM position —
   nothing to change in `events.js`).
5. Lead decisions: buttons keep the header's `.btn` styling (the first one
   keeps `.btn-primary`); the row uses theme tokens (`var(--surface)`,
   `var(--border)`) — **no hardcoded hex**; the old split rules (desktop
   `display: contents`, tablet `order: -1` inside the wrapping header) are
   replaced by **one** set of row rules; the mobile `.btn { flex: 1 1 auto;
   min-width: 0 }` rule must not stretch, squash or wrap these buttons.

## Scope

Product code: **only `index.html`** (markup + CSS). No JS change is needed or
wanted in `js/markdown/*`. No new i18n keys (the row gets no visible text of
its own and no `aria-label`, so nothing needs translating). No new
dependencies. The shared nav block (`<nav id="site-nav">` … `end toolbar nav`)
is **not** touched, so nothing has to be copied to the other eight pages.

Docs: `docs/FEATURES.md` (two sentences, see step 5) and the existing test
`tests/gdsync.js` (one selector, see step 6).

Standing team policy: the Tester adds a Playwright suite under
`tests/01-move-salveaza-and-sincronizeaza-buttons-like/` plus whatever tooling it needs
(`package.json` `test` script entry, playwright config, `.gitignore`
entries). That is expected and is not a scope violation.

## Where things are today (HEAD)

Line numbers drift — grep first (`grep -n "wb-save-sync-row" index.html`).

- `index.html:85-86` — `.header-actions { … }` and
  `.wb-save-sync-row { display: contents; }`.
- `index.html:105-114` — base `.toolbar` rule (surface-2 background).
- `index.html:1143-1165` — TABLET block: `header { … flex-wrap: wrap; padding: 8px 14px }`
  and the comment + `.wb-save-sync-row { display:flex; order:-1; width:100%; … }`,
  `.wb-save-sync-row .btn { flex: 0 0 auto; white-space: nowrap; }`,
  `.wb-save-sync-row #wb-cloud-where { flex: 0 0 auto; }`.
- `index.html:~1184-1188` — comment on `.toolbar-filters` saying "same nowrap +
  overflow-x:auto pattern as .wb-save-sync-row above".
- `index.html:1227-1243` — MOBILE block: `header { padding: 6px 12px }`,
  `.btn { flex: 1 1 auto; min-width: 0; … }`.
- `index.html:1306-1310` — VERY SMALL block: `.btn { font-size:10px; padding: 7px 4px; }`.
- `index.html:1313-1317` — landscape-phone block: `header { padding: 4px 12px }`.
- `index.html:3581-3600` — markup: the comment "Save/sync trio …" and
  `<div class="wb-save-sync-row"> … </div>` as the last child of
  `<div class="header-actions">`, then `</div></header>`, then
  `<div class="toolbar">` at 3603.

## Implementation steps

### 1. Markup — move the row out of the header

Cut the whole `<div class="wb-save-sync-row"> … </div>` (including the inner
comments about ⇩ and ☁, which stay with their buttons) from inside
`.header-actions` and paste it **immediately after `</header>`** and before
`<div class="toolbar">`. Give it an id: `<div class="wb-save-sync-row" id="wb-save-sync-row">`.
Indent its children one level (two spaces) as normal block children.

Replace the old comment above it ("Save/sync trio: kept in its own row so on
tablet/mobile … Desktop: display:contents, no layout change.") with a comment
that describes the new placement, e.g.:

```html
<!-- Save/sync row: its own line between the header and the formatting
     toolbar, on every screen size, outside #toolbar-groups so the ☰
     collapse never hides it. One line, scrolling sideways if it doesn't
     fit — never wrapping. -->
```

The inner children and their attributes must be byte-identical to today
apart from indentation. Final DOM order inside the row:
`.btn.btn-primary[data-i=saveToWorkbookBtn]`, `#btn-wb-sync`, `#btn-wb-cloud`,
`#wb-cloud-where`, `#btn-save-all-modified`.

`.header-actions` must still contain everything else it holds today, in the
same order (`#wb-crumb`, `#current-file`, `#btn-workbooks`, New, `#btn-help`,
`#btn-idea`, `#btn-cal-sync`, `#btn-kanban`, `#btn-gantt`, `#btn-map`, Open
.md, Import DOCX, Export HTML).

### 2. Base CSS — one set of row rules

Replace `.wb-save-sync-row { display: contents; }` (line ~86) with a block
placed right after the header rules (after `.header-actions`), with a short
comment:

```css
  /* Save/sync row: its own line under the header on every screen size.
     nowrap + overflow-x:auto (same pattern as #site-nav) keeps the buttons
     on one line, scrolling sideways instead of wrapping. */
  .wb-save-sync-row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    padding: 6px 20px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    flex-shrink: 0;
  }
  .wb-save-sync-row .btn { flex: 0 0 auto; white-space: nowrap; }
  .wb-save-sync-row #wb-cloud-where { flex: 0 0 auto; }
```

Notes:
- `padding` left 20px matches `header { padding: 0 20px }` so the first
  button lines up with the logo.
- `flex-shrink: 0` matters: `body` is a flex column with `overflow: hidden`;
  without it the row can be squeezed vertically.
- `.wb-save-sync-row .btn` (specificity 0,2,0) beats the mobile/very-small
  `.btn` rules (0,1,0) for `flex`, which is what keeps them from stretching.
  Do **not** use `!important`.

### 3. Responsive CSS — remove the old rules, adjust padding only

- TABLET block (≤1024px): **delete** the "Save/sync trio" comment and the three
  `.wb-save-sync-row …` rules. Add in their place
  `.wb-save-sync-row { padding: 6px 14px; gap: 6px; }` (matches header's
  14px side padding and the 6px gap used there).
- Update the `.toolbar-filters` comment so it no longer says
  "`.wb-save-sync-row` above" — say "same nowrap + overflow-x:auto pattern as
  `.wb-save-sync-row`".
- MOBILE block (≤700px): add `.wb-save-sync-row { padding: 6px 12px; }`.
  Leave `.btn { flex: 1 1 auto; min-width: 0; … }` as is — the more specific
  base rule already overrides `flex` for this row. Because `min-width: 0`
  also applies, `flex: 0 0 auto` + `white-space: nowrap` is what keeps each
  button at its natural width; verify it (see "Done").
- VERY SMALL (≤420px) and landscape-phone blocks: no changes required. (The
  `.btn` font-size/padding tweaks there are allowed to apply to these buttons
  too, same as they do today.) Optionally add
  `.wb-save-sync-row { padding: 4px 12px; }` to the landscape block beside
  `header { … padding: 4px 12px; }` — do it, for consistency.

### 4. Nothing in JS

Do not touch `js/markdown/*.js`. `paintCloud()`, `applyUILang()`,
`saveToWorkbook()`, `syncAllToFolder()`, `cloudButton()`,
`saveAllModifiedChapters()` find elements by id and keep working. The floating
Workbooks panel default position (`defaultWbPanelPos()` → y 128 in
`startup.js`) is intentionally left alone; the panel is draggable and clamped.

### 5. Docs

- `docs/FEATURES.md` ~line 803: "It sits in the header right beside
  `#btn-wb-cloud`" → "It sits in the save/sync row (`#wb-save-sync-row`, the
  line between the header and the formatting toolbar) right beside
  `#btn-wb-cloud`".
- `docs/FEATURES.md` ~line 1896: "The button is `#btn-wb-cloud`, in the header
  next to the Save buttons" → "…, in the save/sync row under the header, next
  to the Save buttons".
- `docs/MAP.md` has no line anchors for `index.html` markup, so there is
  nothing to update there — do not add a new table.
- Do not touch `CLAUDE.md` for this.

### 6. Existing test that encodes the old placement

`tests/gdsync.js` ~line 289-295 asserts
`document.querySelector('header .header-actions #btn-wb-cloud')`. Update it to
`#wb-save-sync-row #btn-wb-cloud` (keep the sibling check for
`#btn-save-all-modified`), and update the check label and the comment above it
to say "in the save/sync row, beside the save buttons". This is the only
existing test that depends on the old position (`tests/idea.js` counts
`.header-actions .btn` order around New/💡 — those buttons do not move; its
known pre-existing failure, CLAUDE.md Known issue 3, is unrelated).

## Done means

1. In the DOM: `#wb-save-sync-row` is `header.nextElementSibling` and
   `document.querySelector('.toolbar').previousElementSibling`; none of the
   five elements is inside `header`; none is inside `.toolbar`.
2. Children of `#wb-save-sync-row` in order: Save to workbook (`.btn-primary`,
   `data-i="saveToWorkbookBtn"`), `#btn-wb-sync`, `#btn-wb-cloud`,
   `#wb-cloud-where`, `#btn-save-all-modified`; all original attributes intact.
3. At viewport widths **1440, 1024, 800, 700, 390, 360** (and 800×400
   landscape): the row is visible (non-zero height, `display` not `none`),
   computed `flex-wrap` is `nowrap`, all five children share the same
   `getBoundingClientRect().top` (±1px), and each `.btn` in the row has
   `scrollHeight` equal to a single line (i.e. its label text does not wrap —
   compare its height to the header's New button at the same width, or check
   `white-space: nowrap`). When the content is wider than the viewport
   (e.g. 360px), the row's `scrollWidth > clientWidth` and `overflow-x` is
   `auto`, and the page itself does not scroll horizontally
   (`document.documentElement.scrollWidth <= innerWidth`).
4. At ≤700px, each row button's rendered width ≥ its content width (not
   squashed): `btn.scrollWidth <= btn.clientWidth + 1`.
5. Row's left edge of the first button is at the row's left padding
   (left-aligned), not centered or right-aligned.
6. Clicking ☰ (`#btn-toolbar-toggle`) so `.toolbar` has class `collapsed`
   leaves `#wb-save-sync-row` and all five children visible.
7. Behaviour unchanged: Ctrl+S saves the open chapter to a workbook,
   Ctrl+Alt+S triggers "save all modified", `#btn-wb-cloud` label is set by
   `paintCloud()` (Romanian default `☁ Cont Google`), switching UI language
   relabels the other three buttons (e.g. RO ↔ EN via the nav language toggle).
8. Row background/border computed from `--surface` / `--border`; no new hex
   literals introduced in the diff.
9. `node tests/verify.js` passes (parse + nav-sync + diacritics).
   `tests/gdsync.js`, `tests/wbsaveall.js`, `tests/wbadopt.js` pass as before
   (`/apptest <name>`; needs `PW_CHROME_PATH`, see CLAUDE.md).

## Manual verification (human/tester)

1. Open `index.html` from `file://` in Chrome at a normal desktop width.
   Directly under the dark header ("Markdown / editor" + Workbooks, New, Help,
   …) there is a new line starting at the left with **📓 Salvează în caiet**
   (highlighted), **⇩ Sincronizează în dosar**, **☁ Cont Google**, the grey
   status text (e.g. "☁ doar pe acest dispozitiv"), **📚 Salvează tot ce s-a
   modificat**. Under that line is the formatting toolbar (☰, ↶ Undo, ↷ Redo, H…).
2. The header row no longer contains any of those five items.
3. Resize to tablet (~800px) and phone (~375px, DevTools device mode): the line
   stays one line; on the phone it can be swiped/scrolled sideways; buttons are
   not squeezed or broken across two lines; nothing else on the page scrolls
   sideways.
4. Press ☰ at tablet/phone width: the formatting buttons hide, the save/sync
   line stays.
5. Type in the editor, press Ctrl+S → the chapter is saved to a workbook as
   before. Press Ctrl+Alt+S → "save all modified" runs as before.
6. Switch the UI language (nav toggle): the three labelled buttons change
   language; ☁ label follows its connection state.

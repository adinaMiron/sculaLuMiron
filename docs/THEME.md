# THEME.md — unified colour theme

Goal: one shared visual identity across all three apps, switchable
light/dark, with no build step.

## Current state — three unrelated themes

| File | Mode | Palette | Accent |
|---|---|---|---|
| `index.html` | **dark** | earth: soil/moss/olive/terra/paper | olive `#C1BB45` |
| `editor.html` | **light** | warm grey + white panels | forest green `#3f6b52` |
| `markdown-editor.html` | **dark** | near-black + purple | violet `#7c6af7` |

```
index.html:12-26           editor.html:19-31          markdown-editor.html:9-22
--soil   #14201A           --bg     #f6f5f3           --bg      #0f0f11
--soil-2 #1B2A22           --panel  #ffffff           --surface #18181c
--soil-3 #22342A           --ink    #1e1d1c           --surface2#1f1f25
--moss   #2E4739           --muted  #6f6a63           --border  #2e2e38
--olive  #C1BB45           --line   #e3e0da           --accent  #7c6af7
--terra  #C4643C           --accent #3f6b52           --accent2 #b5acf9
--paper  #F3EEE1           --accent-soft #eaf1ec      --text    #e8e6f0
--ink    #20261E           --warn   #b5493a           --text2   #9591a8
--mist   #9FB3A5           --gold   #c79a3d           --text3   #5e5a72
```

## ⚠ The trap: same names, opposite meanings

**Do not merge these `:root` blocks by copy-paste.** Names collide with
inverted semantics:

- `--ink` — in `editor.html` it's the **primary body text** (dark on light,
  5 uses). In `index.html` it's a **dark colour used on light chips**
  (2 uses) while body text is `--paper`. Blind merge inverts text colour.
- `--bg` — light `#f6f5f3` in `editor.html`, near-black `#0f0f11` in
  `markdown-editor.html`.
- `--accent` — green in one, violet in the other.

Migrate **one file at a time**, mapping old name → new role explicitly.

## Target token set (semantic, not literal)

Name by *role*, so one set works in both modes and a `[data-theme]`
override flips everything:

```css
:root{
  /* surfaces, back → front */
  --bg:        …   /* page background            */
  --surface:   …   /* panels, toolbars, sidebar  */
  --surface-2: …   /* raised: modals, popovers   */
  --border:    …   /* hairlines, dividers        */

  /* text, strongest → weakest */
  --text:      …   /* primary body text          */
  --text-2:    …   /* secondary / labels         */
  --text-3:    …   /* disabled, placeholder      */

  /* brand */
  --accent:      … /* primary action, active     */
  --accent-soft: … /* tinted accent background   */
  --on-accent:   … /* text ON an accent fill     */

  /* status */
  --warn: …  --danger: …  --ok: …

  /* shape + type (already partly present) */
  --radius: …  --shadow: …
  --font-ui: …  --font-mono: …  --font-display: …
}
[data-theme="light"]{ /* overrides only */ }
```

Suggested source of truth: **`index.html`'s earth palette** — it is the
most distinctive, already dark, and already carries the brand (the nav in
all three files is *already* styled with it: `#14201A`, `#2E4739`,
`#C1BB45`, `#F3EEE1`, `#9FB3A5`). Adopting it means the nav stops being a
foreign object in two of three apps.

## Migration order (cheapest first)

1. **`markdown-editor.html`** — already dark, already ~93 `var()` uses and
   well-tokenised. Mostly renaming `--surface2`→`--surface-2`,
   `--text2`→`--text-2`, then re-pointing hex values. Lowest risk.
2. **`index.html`** — dark, but literal names (`--soil`) must map to
   semantic ones. Keep the old names as aliases during transition:
   `--soil: var(--bg);`
3. **`editor.html`** — hardest: it inverts (light→dark) *and* has 14 hex
   values inside `<script>` that CSS variables can't reach. See below.

## Canvas colours can't use `var()`

`editor.html` draws to `<canvas>`; `ctx.strokeStyle` needs a real colour
string, not `var(--accent)`. Affected (line numbers from `docs/MAP.md`):

| Line | What |
|---|---|
| 538 | default layer `color: '#1e1d1c'` |
| **560** | `PALETTE` — the 8 user-facing swatches |
| 1548, 1562, 1566 | selection box + resize handles `#3f6b52`, handle fill `#fff` |
| 2316 | `#ffffff` fill (zip/export path) |

Find them again after edits with:
```bash
grep -n "#[0-9a-fA-F]\{3,6\}'" editor.html | awk -F: '$1>=526'
```

Resolve tokens at runtime instead:

```js
const css = getComputedStyle(document.documentElement);
const token = n => css.getPropertyValue(n).trim();
octx.strokeStyle = token('--accent');
```

Read it **once per render pass**, not per shape — `getComputedStyle` in a
hot loop will cost you frames in the 60fps recording path
(`liveRenderLoop`). Re-read when the theme changes.

**`PALETTE` is a deliberate exception.** Those 8 swatches are *document
content* — the colours a user picked for their drawing. If they follow the
theme, existing artwork changes colour when the theme flips. Leave
`PALETTE` as literal hex.

Same principle for the **exported-HTML template** in
`markdown-editor.html:1846-1870`: it ships standalone to people without
the app, so it must keep literal hex. Do not tokenise it.

## Theme switching + persistence

Set `data-theme` on `<html>`, persist the choice, and share it across all
three pages via one key:

```js
const THEME_KEY = 'scula:theme';        // shared by all three apps
const LANG_KEY  = 'scula:ui-lang';      // see docs/I18N.md
```

Reuse the storage wrapper from `index.html:510-531` — it already falls
back to in-memory when `localStorage` throws (private mode, `file://`
in some browsers). Don't call `localStorage` directly; these apps are
meant to run from `file://` where it can fail.

Apply before first paint to avoid a flash:
```html
<script>try{document.documentElement.dataset.theme=
  localStorage.getItem('scula:theme')||'dark'}catch(e){}</script>
```

## Checklist per file

- [ ] `:root` replaced with the semantic set; old names aliased if needed
- [ ] every hex outside `:root` replaced with `var(--…)`
      (`grep -n "#[0-9a-fA-F]\{3,8\}" file.html`)
- [ ] `rgba()` literals → tokens or `color-mix()`
- [ ] canvas/JS colours read via `getComputedStyle`, once per pass
- [ ] `PALETTE` and the export template left as literal hex — verify
- [ ] nav still matches the other two files (see CLAUDE.md diff snippet)
- [ ] contrast checked: body text ≥ 4.5:1, large text ≥ 3:1
- [ ] update the palette tables in this doc

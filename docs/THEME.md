# THEME.md — unified colour theme

Goal: one shared visual identity across all three apps, switchable
light/dark, with no build step.

## Current state — one theme left to migrate

| File | Mode | Palette | Accent |
|---|---|---|---|
| `index.html` | **dark** | ✅ migrated to earth palette, semantic names | olive `#C1BB45` |
| `editor.html` | **light** | warm grey + white panels | forest green `#3f6b52` |
| `markdown-editor.html` | **dark** | ✅ migrated to earth palette, semantic names | olive `#C1BB45` |

```
index.html:12-37 (new)     editor.html:19-31          markdown-editor.html:9-24
--bg        #14201A        --bg     #f6f5f3           --bg        #14201A
--surface   #1B2A22        --panel  #ffffff           --surface   #1B2A22
--surface-2 #22342A        --ink    #1e1d1c           --surface-2 #22342A
--border    #2E4739        --muted  #6f6a63           --border    #2E4739
--text      #F3EEE1        --line   #e3e0da           --text      #F3EEE1
--text-2    #9FB3A5        --accent #3f6b52           --text-2    #9FB3A5
--on-text   #20261E        --accent-soft #eaf1ec      --text-3    #5A6A60
--accent    #C1BB45        --warn   #b5493a           --accent    #C1BB45
--on-accent #1A2117        --gold   #c79a3d           --accent-2  #D3CD7C
--danger    #C4643C                                    --on-accent #1A2117
```

Old literal names (pre-migration, kept here for git-blame archaeology):
`--soil`→`--bg`, `--soil-2`→`--surface`, `--soil-3`→`--surface-2`,
`--moss`→`--border`, `--olive`→`--accent`, `--terra`→`--danger`,
`--paper`→`--text`, `--mist`→`--text-2`, `--ink`→`--on-text`,
`--display`→`--font-display`, `--ui`→`--font-ui`, `--mono`→`--font-mono`,
`--r`→`--radius`. The chip-pressed text colour (`#1A2117`, previously
hardcoded, not tokenised) became `--on-accent`, matching the value already
used for that exact role in `markdown-editor.html`.

`index.html` and `markdown-editor.html` still use two slightly different
name sets (`--on-text`/`--danger` vs `--text-3`/`--accent-2`) rather than
one shared token file — they haven't been unified yet. `--on-text` is new:
`index.html`'s `.paper`/`#transcript` card is a light "paper" surface
floating inside the dark theme (background `var(--text)`, i.e. the same
hex as body text, reused as a fill — same trick already used with
`--accent` elsewhere in the file); `--on-text` is the dark ink colour used
for text on top of that surface, following the same `on-X` naming as
`--on-accent`. `markdown-editor.html` has no equivalent (no inverted-light
surface), so it has no `--on-text`; `index.html` in turn has no
`--text-3`/`--accent-2` (no third text tier or secondary accent tint is
used anywhere in the file). Revisit when unifying into one shared token
file — see git history for how `--text-3`/`--accent-2`/`--on-accent` were
derived on the `markdown-editor.html` side.

## ⚠ The trap: same names, opposite meanings

**Do not merge these `:root` blocks by copy-paste.** Names collide with
inverted semantics:

- `--ink` — in `editor.html` it's the **primary body text** (dark on light,
  5 uses). In `index.html` (pre-migration) it was a **dark colour used on
  the light transcript card** (2 uses) while body text was `--paper`; it's
  now `--on-text`. Blind merge would invert text colour.
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

**Decision: the earth palette originally from `index.html` is the chosen
base for all three apps** — soil `#14201A`, moss `#2E4739`, olive
`#C1BB45`, terra `#C4643C`, paper `#F3EEE1`, mist `#9FB3A5` (now the
`--bg`/`--border`/`--accent`/`--danger`/`--text`/`--text-2` tokens). It is
the most distinctive of the three, already dark, and already carries the
brand: the shared nav in all three files is *already* styled with it, so
once `editor.html` migrates too, the nav stops being a foreign object in
one of three apps.

## Migration order (cheapest first)

1. ✅ **`markdown-editor.html`** — done. Renamed `--surface2`→`--surface-2`,
   `--text2`→`--text-2`, `--text3`→`--text-3`, `--accent2`→`--accent-2`,
   re-pointed every value to the earth palette, added `--on-accent`
   (`#1A2117`, mirrors `index.html`'s `.chip[aria-pressed]` text-on-olive
   convention), and swept the remaining literal `#7c6af7`-tinted
   backgrounds (selection highlight, focus rings, active nav item — 5
   spots) plus a few stray `#fff`/`#c9d1d9`/`#f0c080` text colours that
   would have clashed with the new palette. Left untouched, per this doc's
   own rules: the shared nav (742–784, already earth-styled), the
   exported-HTML template (1848–1872, must stay literal hex), and the
   translucent black backdrops/shadows (`#000000bb` etc. — scrims that
   work in any theme, not brand colour). `docs/MAP.md` line anchors were
   updated (+2 lines from the added `--on-accent` token and a comment).
2. ✅ **`index.html`** — done. Renamed `--soil`→`--bg`, `--soil-2`→
   `--surface`, `--soil-3`→`--surface-2`, `--moss`→`--border`, `--olive`→
   `--accent`, `--terra`→`--danger`, `--paper`→`--text`, `--mist`→
   `--text-2`, `--ink`→`--on-text`, `--display`→`--font-display`, `--ui`→
   `--font-ui`, `--mono`→`--font-mono`, `--r`→`--radius`; every `var(--…)`
   call site in the file was repointed to the new names (no aliases kept —
   there was only one file to update, unlike a shared-token-file merge).
   Also tokenised the one hardcoded opaque hex outside `:root`
   (`.chip[aria-pressed] { color: #1A2117 }` → `var(--on-accent)`, same
   value markdown-editor.html already uses for that role). Left as literal
   hex, per this doc's own rules: the shared nav (221–263, already
   earth-styled and byte-identical to the other two files), the `<meta
   theme-color>` tag (can't hold a CSS variable), and the decorative/
   translucent one-offs (background vignette gradient, record-button glow
   gradients, notice/status/placeholder tint colours, `rgba()` scrims) —
   same carve-out markdown-editor.html used for its scrims. `docs/MAP.md`
   line anchors were updated (+11 lines from the expanded `:root` block).
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

Reuse the storage wrapper from `index.html:521-542` — it already falls
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

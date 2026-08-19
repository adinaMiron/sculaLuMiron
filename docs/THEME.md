# THEME.md — unified colour theme

Goal: one shared visual identity across all three apps, switchable
light/dark, with no build step.

## Current state — one theme left to migrate

| File | Mode | Palette | Accent |
|---|---|---|---|
| `index.html` | **dark** | earth: soil/moss/olive/terra/paper | olive `#C1BB45` |
| `editor.html` | **dark** | ✅ migrated to earth palette, semantic names | olive `#C1BB45` |
| `markdown-editor.html` | **dark** | ✅ migrated to earth palette, semantic names | olive `#C1BB45` |

```
index.html:12-26           editor.html:20-36              markdown-editor.html:9-24
--soil   #14201A           --bg          #14201A          --bg        #14201A
--soil-2 #1B2A22           --surface     #1B2A22          --surface   #1B2A22
--soil-3 #22342A           --surface-2   #22342A          --surface-2 #22342A
--moss   #2E4739           --border      #2E4739          --border    #2E4739
--olive  #C1BB45           --accent      #C1BB45          --accent    #C1BB45
--terra  #C4643C           --accent-2    #D3CD7C          --accent-2  #D3CD7C
--paper  #F3EEE1           --accent-soft color-mix(...)   --on-accent #1A2117
--ink    #20261E           --on-accent   #1A2117          --text      #F3EEE1
--mist   #9FB3A5           --text        #F3EEE1          --text-2    #9FB3A5
                            --text-2      #9FB3A5          --text-3    #5A6A60
                            --text-3      #5A6A60
                            --warn        #C4643C
```

`editor.html` is now on the same semantic token names as
`markdown-editor.html` (`--surface-2`/`--on-accent`/`--text-2`/`--text-3`),
plus two names the other two files don't need: `--warn` (its danger/record
state, reuses `index.html`'s `--terra` value) and `--radius`/`--shadow`
(shape tokens, unrelated to colour). `--accent-soft` is computed with
`color-mix()` instead of a literal hex — see step 3 notes below.

`markdown-editor.html` still uses its own name set (`--surface-2` /
`--text-2` / `--text-3` / `--accent-2` / `--on-accent`) rather than the
full target set below — it maps onto `index.html`'s literal names
(`--soil`→`--bg`, `--paper`→`--text`, `--mist`→`--text-2`, …) but the two
files haven't been unified into one shared token file yet. `--text-3` and
`--accent-2`/`--on-accent` have no `index.html` equivalent; they were
derived (see git history) rather than lifted from an existing value —
revisit if `index.html` grows the same tiers during its own migration
(step 2 below).

## ⚠ The trap: same names, opposite meanings

**Do not merge `:root` blocks by copy-paste.** This bit `editor.html`
during its own migration (step 3, now done) and still applies to
`index.html` (step 2, pending) — its literal names (`--ink`, `--bg`, …)
collide in meaning with the semantic set:

- `--ink` — in `index.html` it's a **dark colour used on light chips**
  (2 uses) while body text is `--paper`. `editor.html`'s old `--ink` was
  the *opposite* (primary body text, dark-on-light) — it renamed to
  `--text` during migration specifically to avoid this collision, rather
  than reusing `--ink` for a role `index.html` already uses differently.
- `--bg` — now dark in all three files (`#14201A`), so this specific trap
  is resolved. It still illustrates the risk: `editor.html`'s `--bg` was
  light (`#f6f5f3`) right up until step 3.
- `--accent` — green in `editor.html` pre-migration, violet in
  `markdown-editor.html` pre-migration; both are olive `#C1BB45` now.

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

**Decision: the earth palette from `index.html` is the chosen base for all
three apps** — `--soil #14201A`, `--moss #2E4739`, `--olive #C1BB45`,
`--terra #C4643C`, `--paper #F3EEE1`, `--mist #9FB3A5`. It is the most
distinctive of the three, already dark, and already carries the brand: the
shared nav in all three files is *already* styled with it, so once
`editor.html` and `markdown-editor.html` migrate, the nav stops being a
foreign object in two of three apps.

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
2. **`index.html`** — dark, but literal names (`--soil`) must map to
   semantic ones. Keep the old names as aliases during transition:
   `--soil: var(--bg);`
3. ✅ **`editor.html`** — done. Hardest of the three: inverted light→dark
   *and* had hex values inside `<script>` that CSS variables can't reach.
   `:root` (L20-36) renamed onto the shared semantic set (`--panel`→
   `--surface`, `--ink`→`--text`, `--muted`→`--text-2`, `--line`→
   `--border`, `--gold`→`--accent-2`), `--accent-soft` switched from a
   literal light-green tint to `color-mix(in srgb, var(--accent) 16%,
   var(--surface))` so it stays correct if `--accent`/`--surface` ever
   change, and every `color:#fff` paired with an accent/accent-2/warn fill
   became `color:var(--on-accent)` (plain white on the new bright-olive
   accent fails contrast — 2.0:1; `--on-accent` gets 8.2:1). Left
   untouched, per this doc's own rules: the shared nav (268–310, already
   earth-styled), the `<input type="color">` defaults (content, not
   chrome), the video-preview letterbox (`#111`) and modal backdrop
   scrims (`rgba(20,20,15,.45)` etc — theme-neutral, no brand hue), and
   the two canvas exceptions below (`PALETTE`, the JPEG-export white
   fill). See "Canvas colours" for the selection-box/handle resolution.
   `docs/MAP.md` line anchors updated (+24 lines, mostly the `:root`
   header comment and the canvas `CHROME` token cache).

## Canvas colours can't use `var()`

`editor.html` draws to `<canvas>`; `ctx.strokeStyle` needs a real colour
string, not `var(--accent)`. Current state (line numbers from `docs/MAP.md`):

| Line | What | Resolution |
|---|---|---|
| ~556 | default layer `color: '#1e1d1c'` | **literal**, see below |
| **~582** | `PALETTE` — the 8 user-facing swatches | **literal**, deliberate exception |
| ~1553, ~1567, ~1571 | selection box + resize handles, handle fill | resolved via `CHROME` cache (`--accent`, `--text`) |
| ~2340 | `#ffffff` fill (JPEG export path) | **literal**, deliberate exception |

Find them again after edits with:
```bash
grep -n "#[0-9a-fA-F]\{3,6\}'" editor.html | awk -F: '$1>=531'
```

Resolve tokens at runtime instead, for anything that's app *chrome*
(selection UI, not document content):

```js
const themeCSS = getComputedStyle(document.documentElement);
const themeToken = n => themeCSS.getPropertyValue(n).trim();
const CHROME = { accent: themeToken('--accent'), text: themeToken('--text') };
// ...later, in strokeSelBox/drawHandles:
octx.strokeStyle = CHROME.accent;
```

Read it **once per render pass**, not per shape — `getComputedStyle` in a
hot loop will cost you frames in the 60fps recording path
(`liveRenderLoop`). `editor.html` resolves `CHROME` exactly once, at
script init (before `state` is even defined), not per frame; there's no
live theme toggle yet, so there's nothing to re-read on a theme change —
if one is added later, invalidate/refresh this cache when it fires.

**`PALETTE` is a deliberate exception.** Those 8 swatches are *document
content* — the colours a user picked for their drawing. If they follow the
theme, existing artwork changes colour when the theme flips. Leave
`PALETTE` as literal hex. The **default pen colour** (`state.color`,
~L556) gets the same exception even though it isn't in the `PALETTE`
array itself: its value is literally `PALETTE[0]`, and the swatch UI
highlights whichever swatch equals `state.color` on load (`sw.classList
.add('selected')` — see `docs/MAP.md`'s Toolbar wiring section) —
tokenizing just the default and not the array would silently break that
highlight. The **JPEG-export white fill** (`renderComposite`'s
`forceWhiteBg`) is the same kind of exception for a different reason:
it's an export-file convention (JPEG has no transparency channel), not
UI chrome, so it should stay a predictable white regardless of what
theme the app happens to be in when you hit export.

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

# THEME.md — unified colour theme

Goal: one shared visual identity across all three apps, switchable
light/dark, with no build step.

## Current state — all three migrated

| File | Mode | Palette | Accent |
|---|---|---|---|
| `index.html` | **dark** | ✅ migrated to earth palette, semantic names | olive `#C1BB45` |
| `editor.html` | **dark** | ✅ migrated to earth palette, semantic names | olive `#C1BB45` |
| `markdown-editor.html` | **dark** | ✅ migrated to earth palette, semantic names | olive `#C1BB45` |

None of the three files share one `:root` block yet — each still defines
its own token set, and the names aren't fully unified (see below). What's
unified is the *values*: every file now sits on the same earth palette.

| Role | `index.html` | `editor.html` | `markdown-editor.html` |
|---|---|---|---|
| `--bg` | `#14201A` | `#14201A` | `#14201A` |
| `--surface` | `#1B2A22` | `#1B2A22` | `#1B2A22` |
| `--surface-2` | `#22342A` | `#22342A` | `#22342A` |
| `--border` | `#2E4739` | `#2E4739` | `#2E4739` |
| `--text` | `#F3EEE1` | `#F3EEE1` | `#F3EEE1` |
| `--text-2` | `#9FB3A5` | `#9FB3A5` | `#9FB3A5` |
| `--text-3` | — | `#5A6A60` | `#5A6A60` |
| `--on-text` | `#20261E` | — | — |
| `--accent` | `#C1BB45` | `#C1BB45` | `#C1BB45` |
| `--accent-2` | — | `#D3CD7C` | `#D3CD7C` |
| `--accent-soft` | — | `color-mix(in srgb, var(--accent) 16%, var(--surface))` | — |
| `--on-accent` | `#1A2117` | `#1A2117` | `#1A2117` |
| `--danger` | `#C4643C` | `#C4643C` | — |
| `--radius` | `14px` | `0.714rem` | — (uses `--panel-w` instead, unrelated) |
| `--shadow` | — | `0 2px 10px rgba(0,0,0,.35)` | — |

Where a cell is blank, that file has no equivalent — not a gap to fill,
just a role it doesn't need (`index.html` has no secondary accent tint or
tinted-hover state; `markdown-editor.html` has no danger/status colour;
only `index.html` has an inverted-light surface, hence `--on-text`).

`index.html` (12–37) and `editor.html` (20–36) landed on the closest
naming to each other since they were migrated back-to-back — both use
`--danger` for the terracotta status colour, both use `--on-accent`.
`markdown-editor.html` (9–24), migrated first, predates that convention
and calls the same *shape of* role (a light secondary-accent tint used
for headings/emphasis, not a status colour) `--accent-2` instead —
`editor.html` reused `--accent-2` for its own "gold" secondary accent
(save button, group tag) to match `markdown-editor.html`, so `--accent-2`
and `--danger` both now appear in two of three files, just not the *same*
two. Unifying into one shared token file (dropping `--on-text` into
`markdown-editor.html`-style tiers, or vice versa) is still open —
revisit if these three ever get pulled into one `<style>` include.

## ⚠ The trap: same names, opposite meanings

**Do not merge `:root` blocks by copy-paste.** All three migrations hit
this in one form or another — kept here for git-blame archaeology, since
the specific collisions below no longer exist in the *current* files:

- `--ink` — pre-migration, `editor.html` used it for **primary body text**
  (dark-on-light, 5 uses) while `index.html` used it for a **dark colour
  on a light card** (2 uses, its transcript panel) with body text in
  `--paper`. A blind merge would have inverted one file's text colour.
  Resolved by giving each role its own name: `editor.html`'s `--ink`
  became `--text` (the normal body-text role, matching the other two
  files); `index.html`'s `--ink` became `--on-text` (a role unique to
  it — dark text on its light `.paper`/`#transcript` card, the same
  `on-X` pattern as `--on-accent`).
- `--bg` — light `#f6f5f3` in `editor.html`, near-black in the other two,
  right up until `editor.html`'s migration (step 3). Now dark (`#14201A`)
  in all three.
- `--accent` — forest green in `editor.html`, violet in
  `markdown-editor.html`, both pre-migration. Both are olive `#C1BB45`
  now.
- `--warn`/`--terra`/`--danger` — same status colour, three different
  names across the three files' migrations before they converged on
  `--danger` (see the naming note above).

Migrate **one file at a time**, mapping old name → new role explicitly —
this is what caught the `--ink` collision before it shipped.

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

This is still aspirational — no file defines `--warn`/`--ok` (only
`--danger` exists, in `index.html`/`editor.html`), and no file has a
`[data-theme="light"]` override block yet (see "Theme switching" below).

**Decision: the earth palette originally from `index.html` is the chosen
base for all three apps** — soil `#14201A`, moss `#2E4739`, olive
`#C1BB45`, terra `#C4643C`, paper `#F3EEE1`, mist `#9FB3A5` (now the
`--bg`/`--border`/`--accent`/`--danger`/`--text`/`--text-2` tokens). It is
the most distinctive of the three, already dark, and already carries the
brand: the shared nav in all three files is *already* styled with it, so
now that all three apps have migrated, the nav is no longer a foreign
object in any of them.

## Migration order (cheapest first) — all done

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
3. ✅ **`editor.html`** — done. Hardest of the three: inverted light→dark
   *and* had hex values inside `<script>` that CSS variables can't reach.
   `:root` (L20-36) renamed onto the shared semantic set (`--panel`→
   `--surface`, `--ink`→`--text`, `--muted`→`--text-2`, `--line`→
   `--border`, `--gold`→`--accent-2`, `--warn`→`--danger` to match
   `index.html`'s naming), `--accent-soft` switched from a literal
   light-green tint to `color-mix(in srgb, var(--accent) 16%,
   var(--surface))` so it stays correct if `--accent`/`--surface` ever
   change, and every `color:#fff` paired with an accent/accent-2/danger
   fill became `color:var(--on-accent)` (plain white on the new
   bright-olive accent fails contrast — 2.0:1; `--on-accent` gets 8.2:1).
   Left untouched, per this doc's own rules: the shared nav (268–310,
   already earth-styled), the `<input type="color">` defaults (content,
   not chrome), the video-preview letterbox (`#111`) and modal backdrop
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

Reuse the storage wrapper from `index.html:847-867` — it already falls
back to in-memory when `localStorage` throws (private mode, `file://`
in some browsers). Don't call `localStorage` directly; these apps are
meant to run from `file://` where it can fail.

Apply before first paint to avoid a flash:
```html
<script>try{document.documentElement.dataset.theme=
  localStorage.getItem('scula:theme')||'dark'}catch(e){}</script>
```

Not implemented yet in any of the three files — all three are still a
single fixed dark theme, no `[data-theme]` override block, no toggle UI.
This section describes the intended next step, not current behaviour.

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

---
name: app-change
description: Make a change to one of the four standalone browser apps (index.html / editor.html / markdown-editor.html / recipes.html). Use when the user says "work on the markdown page", "in retete", "in editor.html", "on the voice page", etc. — a feature, button, fix, or styling change inside one app file.
---

# Changing one of the four apps

Four self-contained HTML files, no build step. See `CLAUDE.md` for the hard rules.
This skill is the repeatable loop for a change request.

## 1. Which file

| User says | File | nav label |
|---|---|---|
| "markdown page", "markdown editor" | `markdown-editor.html` | Markdown |
| "retete", "rețete", "recipe(s) page" | `recipes.html` | Rețete |
| "index", "voice", "caiet vocal", "dictation" | `index.html` | Caiet vocal |
| "editor.html", "image marker", "mazgaleste", "drawing/canvas page" | `editor.html` | Mazgaleste (was "Editor") |

## 2. Locate before reading — never read a whole app file

`recipes.html` is ~84k tokens, `markdown-editor.html` ~58k. Reading one blows the
budget.

1. Read `docs/MAP.md` for the section's line anchors. Its numbers **drift** —
   trust the name in the right-hand column, not the range.
2. `grep -n "functionName\|#elementId" <file>` to pin the real location.
3. Read only that narrow range.
4. Route to the one doc the task touches (`docs/THEME.md`, `docs/I18N.md`,
   `docs/FEATURES.md`, `docs/RECIPES.md`, `HANDOFF.md`) — not the others.

## 3. Edit

- `str_replace` / Edit only — never rewrite a file.
- Theme tokens, not hex. i18n keys (RO + EN both), not hardcoded strings.
  Preserve diacritics ă â î ș ț.
- `rem` for chrome in `editor.html` (except inside `(pointer:coarse)` blocks).
- Save via `ScuLaFolder.save(name, blob)` — never a hand-rolled `<a download>`.
- **Touching the `<nav id="site-nav">` block? Apply the identical change to all
  four files** — it is byte-identical across them.

## 4. Verify — run `/verify`

Parse-checks the JS in all four files and diffs the nav block. A PostToolUse
hook already parse-checks the file you edited on each save, but run `/verify`
before calling the change done. For behaviour changes, `/apptest <name>`.

## 5. Sync docs in the same change

If the edit moved line ranges, added an i18n key, changed a theme token, or
touched the nav — update the matching doc (`docs/MAP.md` anchors,
`docs/I18N.md`, `docs/THEME.md`, or the nav note) now, not later.

If you hit friction that will recur (a stale MAP.md anchor, a flow worth a
command, a convention the user had to explain), fix it now — see `CLAUDE.md`
§ "Keep this current".

## 6. Commit only when asked

Then: branch if on `main` is not required here (repo works on `main`), stage
just the files you changed, commit with a message describing the feature, and
push only if the user said to.

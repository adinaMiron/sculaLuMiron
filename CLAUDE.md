# CLAUDE.md

Three standalone browser tools. **No build step, no framework, no package
manager.** Each `.html` is a self-contained app (CSS + markup + JS in one
file). Open in a browser; that's the whole toolchain.

| File | Lines | ~Tokens | What it is | Theme |
|---|---|---|---|---|
| `index.html` | 1647 | 16k | "Caiet vocal" — voice dictation → text | dark (earth) |
| `editor.html` | 3829 | 38k | "Image Marker" — canvas annotation/drawing | dark (earth) |
| `markdown-editor.html` | 3530 | 31k | Markdown editor + live preview + workbooks | dark (earth) |

## Rule 1: never read a whole HTML file

Reading all three costs ~85k tokens; `editor.html` alone is 38k. **Never
`view` an entire app file.** Locate first, then read a narrow range.

```bash
grep -n "functionName\|#elementId" editor.html   # locate
sed -n '1080,1140p' editor.html                  # read just that
```

`docs/MAP.md` has line anchors for every section of all three files. Read
it instead of exploring. It is far cheaper than one file scan.

## Routing — read only what the task needs

| Task | Read |
|---|---|
| Anything (locate code) | `docs/MAP.md` |
| Colors, theming, dark/light | `docs/THEME.md` |
| English/Romanian UI, strings | `docs/I18N.md` |
| New tool, button, or feature | `docs/FEATURES.md` |
| Deep work inside `editor.html` | `HANDOFF.md` |

Do not read a doc the task doesn't touch.

## Rule 2: the nav block is triplicated

`<nav id="site-nav">` plus its `<style>` and `<script>` is **byte-identical**
in all three files (`index.html:220-863`, `editor.html:395-1038`,
`markdown-editor.html:842-1485`). It carries the nav links, the UI-language
toggle, **and `window.ScuLaFolder`** — which decides where every saved file
goes (see `docs/FEATURES.md` § D). Any change to it must be applied to
**all three** or they drift. Verify with:

```bash
sed -n '220,863p' index.html > /tmp/n1
sed -n '395,1038p' editor.html > /tmp/n2
sed -n '842,1485p' markdown-editor.html > /tmp/n3
diff /tmp/n1 /tmp/n2 && diff /tmp/n1 /tmp/n3 && echo "nav in sync"
```

Adding a page means adding a link to all three navs **and** an entry in the
block's `SUBDIR` map, so the new page gets its own folder.

## Rule 3: respect the constraints

- **Single file per app.** Don't split into `.css`/`.js` or introduce a
  bundler, npm, or a framework. The apps are meant to run from `file://`.
- **No new dependencies.** Only external dep in the repo is mammoth.js via
  CDN in `markdown-editor.html:838` (docx import). Don't add more.
- **`rem`, not `px`**, for chrome in `editor.html` — the root font-size
  scales with viewport. Exception: inside `(pointer:coarse)` blocks, `px`
  is deliberate (44px touch-target floor).
- **Preserve Romanian diacritics** (ă â î ș ț) in all strings and fonts.
- **Save through `ScuLaFolder.save(name, blob)`**, never a hand-rolled
  `<a download>`. It routes to the chosen folder (desktop), the OS share
  sheet (phones — no mobile browser has `showDirectoryPicker`), or a
  download, and reports what it did — `docs/FEATURES.md` § D.

## Standard workflow

1. Read `docs/MAP.md` → find line range.
2. Read only that range.
3. Edit with `str_replace` (never rewrite a whole file).
4. Verify — see below.
5. If the change touched theme tokens, i18n keys, or the nav, update the
   matching doc in the same commit.

## Verification (no test framework exists)

```bash
# JS in every <script> block still parses (verified working on all 3 files)
for f in index.html editor.html markdown-editor.html; do
  awk '/^<script>$/{f=1;next} /^<\/script>$/{f=0} f' "$f" > /tmp/c.js
  printf "%-24s " "$f"; node --check /tmp/c.js && echo OK
done
```

Note: the `awk` guard matches `<script>` on its **own line**. The CDN tag
in `markdown-editor.html:838` has attributes and is correctly skipped. If
you add an attributed `<script …>` on its own line, adjust the pattern.

For behaviour, ad-hoc Playwright scripts are the established approach —
see `HANDOFF.md` § "Testing approach". Canvas work needs pixel assertions
(`getImageData`), not screenshots. Anything using `getDisplayMedia`
(screenshot/record in `editor.html`) needs a **headed** browser under
Xvfb; headless Chromium cannot decode media streams at all.

## Known issues (unfixed — confirm before "fixing" something else)

1. `README.md` is a stub; `.gitignore` is a generic Node template for a repo
   with zero Node.

## Planned direction (design toward these)

Shared theme tokens · English + Romanian UI everywhere · room for new tools.
Details in `docs/THEME.md`, `docs/I18N.md`, `docs/FEATURES.md`. When adding
anything now, use theme tokens and i18n keys rather than hardcoded hex and
hardcoded strings — that is what keeps the migrations cheap.

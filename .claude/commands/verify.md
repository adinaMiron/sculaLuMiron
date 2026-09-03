---
description: Parse-check the JS in all five app files, confirm the nav block is in sync, and check diacritics
---

Run the full verification from `CLAUDE.md` and report the results plainly
(name anything that fails, with its output).

## 1. JS in every `<script>` block still parses

```bash
for f in voice.html editor.html index.html recipes.html calendar.html; do
  awk '/^<script>$/{f=1;next} /^<\/script>$/{f=0} f' "$f" > /tmp/c.js
  printf "%-24s " "$f"; node --check /tmp/c.js && echo OK
done
```

## 2. The shared nav block is byte-identical in all five files

Line numbers in `CLAUDE.md` Rule 2 drift — extract from the `<nav id="site-nav"`
line through the `<!-- ===== end toolbar nav ===== -->` marker instead (the
only two anchors present in all four files):

```bash
for f in voice.html editor.html index.html recipes.html calendar.html; do
  awk '/<nav id="site-nav"/{f=1} f{print} /end toolbar nav/{f=0}' "$f" > "/tmp/nav-$f"
done
diff /tmp/nav-voice.html /tmp/nav-editor.html \
  && diff /tmp/nav-voice.html /tmp/nav-index.html \
  && diff /tmp/nav-voice.html /tmp/nav-recipes.html \
  && diff /tmp/nav-voice.html /tmp/nav-calendar.html \
  && echo "nav in sync"
```

If the nav drifted, the fix is to re-apply the change to all five, not to
pick one as canonical without checking which is correct.

## 3. No cedilla diacritics (must be comma-below ș/ț, not ş/ţ)

```bash
grep -nP '[\x{015F}\x{0163}]' voice.html editor.html index.html recipes.html calendar.html
```

Expect **only** these two known-good hits (both are prose *about* the
cedilla, not user-facing strings): `index.html:~6446` (a comment)
and none in `recipes.html` (it uses `\u` escapes). Anything else in markup
or a UI string is a bug — replace ş→ș (U+0219), ţ→ț (U+021B).


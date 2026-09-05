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
grep -n 'ş\|ţ' voice.html editor.html index.html recipes.html calendar.html
```

The literal characters, not `grep -P '[\x{015F}\x{0163}]'` — that form
needs a UTF-8 PCRE build and dies with *"character code point value in
\x{} is too large"* where it does not have one.

Expect **only** one known-good hit, prose *about* the cedilla rather than a
user-facing string: `index.html:~7365` (a comment). `recipes.html` has none
(it uses `\u` escapes). Anything else in markup or a UI string is a bug —
replace ş→ș (U+0219), ţ→ț (U+021B).


#!/usr/bin/env bash
# PostToolUse hook: after an edit to one of the four app HTML files, check that
# the JS in every bare <script> block still parses. Blocks (exit 2) on a syntax
# error so the model sees it immediately instead of at manual-verify time.
set -euo pipefail

input=$(cat)
# file_path lives at .tool_input.file_path; no jq on this box, so grep it out.
file=$(printf '%s' "$input" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//; s/"$//')

case "$(basename "${file:-}")" in
  index.html|editor.html|markdown-editor.html|recipes.html) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

tmp=$(mktemp /tmp/scula-jscheck.XXXXXX.js)
trap 'rm -f "$tmp"' EXIT
# Same guard as CLAUDE.md: <script> on its own line, skips the attributed CDN tag.
awk '/^<script>$/{f=1;next} /^<\/script>$/{f=0} f' "$file" > "$tmp"

if ! err=$(node --check "$tmp" 2>&1); then
  echo "JS syntax error in $(basename "$file") after this edit:" >&2
  echo "$err" | sed "s#$tmp#$(basename "$file")#g" >&2
  exit 2
fi
exit 0

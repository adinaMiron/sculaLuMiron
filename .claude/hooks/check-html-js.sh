#!/usr/bin/env bash
# Compatibility entrypoint; current adapters call the shared Python hook directly.
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
exec python3 "$root/scripts/agent-hook.py"

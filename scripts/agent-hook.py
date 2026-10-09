#!/usr/bin/env python3
"""Shared pre/post tool hook. JSON stdin; empty success or hook feedback stdout."""
from pathlib import Path
import json
import shlex
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
LARGE_BYTES = 24000


def local_file(value, cwd):
    if not isinstance(value, str):
        return None
    path = (Path(cwd) / value).resolve()
    if not path.is_relative_to(ROOT) or not path.is_file():
        return None
    if any(part in {".git", "node_modules", "test-results"} for part in path.relative_to(ROOT).parts):
        return None
    return path


def feedback(event, reason, block=False):
    output = {"hookEventName": event, "additionalContext": reason}
    if block and event == "PreToolUse":
        output.update(permissionDecision="deny", permissionDecisionReason=reason)
    result = {"hookSpecificOutput": output}
    if block and event == "PostToolUse":
        result.update(decision="block", reason=reason)
    return result


def handle(payload):
    event, tool = payload.get("hook_event_name"), payload.get("tool_name")
    data = payload.get("tool_input", {})
    if not isinstance(data, dict):
        return None
    cwd = payload.get("cwd") or str(ROOT)
    if not isinstance(cwd, str):
        return None
    if event == "PreToolUse":
        paths = []
        if tool == "Read" and data.get("limit") is None:
            paths = [data.get("file_path")]
        elif tool in {"Bash", "exec_command"}:
            # Only an unambiguous plain cat; never reinterpret general shell code.
            command = data.get("command", data.get("cmd", ""))
            if not isinstance(command, str):
                return None
            try:
                words = shlex.split(command)
            except ValueError:
                return None
            if words and words[0] == "cat" and all(not w.startswith("-") and
                    not any(c in w for c in "|;&<>$`*?\n") for w in words[1:]):
                paths = words[1:]
        for value in paths:
            path = local_file(value, cwd)
            if path and path.suffix in {".html", ".md", ".js"} and path.stat().st_size > LARGE_BYTES:
                return feedback(event, f"Large file {path.relative_to(ROOT)}: locate with rg -n, then use "
                                "Read with offset/limit or sed -n 'START,ENDp'. Explicit bounded reads are allowed.", True)
    elif event == "PostToolUse":
        values = []
        if tool in {"Edit", "Write", "MultiEdit"}:
            values = [data.get("file_path")]
        elif tool == "apply_patch":
            patch = data.get("command", data.get("input", ""))
            if isinstance(patch, str):
                for line in patch.splitlines():
                    for prefix in ("*** Update File: ", "*** Add File: ", "*** Move to: "):
                        if line.startswith(prefix):
                            values.append(line[len(prefix):])
        paths = {p for value in values if (p := local_file(value, cwd)) and p.suffix in {".html", ".js"}}
        if paths:
            result = subprocess.run(["node", str(ROOT / "scripts/check-source.js"), *map(str, sorted(paths))],
                                    capture_output=True, text=True, timeout=15)
            if result.returncode:
                return feedback(event, "Syntax check failed after edit (edit is already applied):\n" +
                                (result.stderr or result.stdout)[-3500:], True)
    return None


def main():
    try:
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            raise ValueError("expected a JSON object")
        result = handle(payload)
        if result:
            print(json.dumps(result))
        return 0
    except (ValueError, OSError, subprocess.TimeoutExpired) as error:
        print("Agent hook could not check: " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

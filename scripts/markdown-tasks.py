#!/usr/bin/env python3
"""Shared automation task grammar; see docs/tasks/markdown-task-grammar.md.

This intentionally implements the documented subset, not a Markdown renderer.
"""
import argparse
import json
import os
from pathlib import Path
import re
import stat
import sys


TASK = re.compile(r"^ {0,3}- \[([ xX])\](?:[ \t]+.*)?$")
FENCE = re.compile(r"^[ \t]*(`{3,}|~{3,})(.*)$")


def markdown_files(directory):
    # rglob and os.walk's default handling can hide enumeration/stat errors.
    # Inspect every entry explicitly and propagate failures before emitting output.
    with os.scandir(directory) as entries:
        for entry in entries:
            mode = entry.stat().st_mode
            if stat.S_ISDIR(mode):
                if not entry.is_symlink():
                    yield from markdown_files(Path(entry.path))
            elif entry.name.endswith(".md"):
                if not stat.S_ISREG(mode):
                    raise OSError(f"Not a regular Markdown file: {entry.path}")
                yield Path(entry.path)


def tasks(file):
    fence = None
    for number, line in enumerate(file.read_text(encoding="utf-8").split("\n"), 1):
        marker = FENCE.match(line)
        if fence:
            if (marker and marker[1][0] == fence[0]
                    and len(marker[1]) >= len(fence)
                    and not marker[2].strip(" \t")):
                fence = None
            continue
        if marker and (marker[1][0] == "~" or "`" not in marker[2]):
            fence = marker[1]
            continue
        match = TASK.fullmatch(line)
        if match:
            yield number, "pending" if match[1] == " " else "complete", line


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("count", "manifest", "first", "scope-manifest"))
    parser.add_argument("path", type=Path)
    parser.add_argument("--exclude", type=Path)
    args = parser.parse_args()
    mode = args.path.stat().st_mode
    if args.action == "scope-manifest":
        # Inventory the live trees, not just tracked files or the chosen module:
        # additions, deletions and moves must change the resulting evidence.
        files = []
        for name in ("docs/tasks", "docs/reviews"):
            directory = args.path / name
            try:
                directory_mode = directory.stat().st_mode
            except FileNotFoundError:
                if directory.is_symlink():
                    raise
                continue
            if not stat.S_ISDIR(directory_mode):
                raise NotADirectoryError(directory)
            files.extend(markdown_files(directory))
        files.sort()
    elif stat.S_ISDIR(mode):
        files = sorted(markdown_files(args.path))
    elif stat.S_ISREG(mode):
        files = [args.path]
    else:
        raise OSError(f"Not a regular Markdown file or directory: {args.path}")
    # Finish all reads before emitting evidence, so failures cannot look like an
    # empty or partially built manifest to a caller.
    records = [(file, number, state, line) for file in files
               if file != args.exclude
               for number, state, line in tasks(file)]
    if args.action == "scope-manifest":
        # Encode paths/text without literal control characters so shell capture
        # cannot discard NULs or confuse embedded tabs/newlines with separators.
        print(json.dumps([(str(file), number, state, line)
                          for file, number, state, line in records]))
    elif args.action == "count":
        print(sum(state == "pending" for _, _, state, _ in records))
    elif args.action == "first":
        for _, number, state, _ in records:
            if state == "pending":
                print(number)
                break
    else:
        for file, number, state, line in records:
            print(f"{file}\t{number}\t{state}\t{line}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, UnicodeError) as error:
        print(f"ERROR: Cannot parse Markdown tasks: {error}", file=sys.stderr)
        sys.exit(1)

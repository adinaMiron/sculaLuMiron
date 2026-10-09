#!/usr/bin/env python3
"""Check or create repository skill/hook links. Never overwrite existing config."""
import argparse
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]


def expected_links():
    skills = ROOT / ".claude/skills"
    result = {}
    for folder in sorted(skills.iterdir()):
        if not folder.is_dir():
            continue
        source = folder / "SKILL.md"
        text = source.read_text(encoding="utf-8")
        parts = text.split("---", 2)
        if len(parts) != 3 or parts[0].strip():
            raise ValueError(f"Missing YAML frontmatter: {source}")
        name = re.search(r"^name: ([a-z0-9-]+)$", parts[1], re.M)
        description = re.search(r"^description: (.+)$", parts[1], re.M)
        if not name or name[1] != folder.name or not description:
            raise ValueError(f"Expected matching name and description: {source}")
        result[ROOT / ".agents/skills" / folder.name] = "../../.claude/skills/" + folder.name
    result[ROOT / ".codex/hooks.json"] = "../docs/agents/codex-hooks.json"
    return result


def sync_links(write=False):
    links = expected_links()
    missing = []
    # Complete validation before any mutation, including symlinked parent dirs.
    for target, value in links.items():
        for parent in target.parents:
            if parent == ROOT:
                break
            if parent.is_symlink():
                raise ValueError(f"Refusing symlinked parent directory: {parent}")
        if not (target.parent / value).resolve().exists():
            raise ValueError(f"Missing link source: {value}")
        if target.is_symlink() and os.readlink(target) == value:
            continue
        if target.exists() or target.is_symlink():
            raise ValueError(f"Existing path differs; merge manually, not overwritten: {target}")
        missing.append((target, value))
    if write:
        for target, value in missing:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.symlink_to(value, target_is_directory=target.parent.name == "skills")
        print(f"Agent links ready ({len(links)} checked, {len(missing)} created).")
        return 0
    if missing:
        print("Missing adapters: " + ", ".join(str(p.relative_to(ROOT)) for p, _ in missing))
        print("Create with: python3 scripts/setup-agent-links.py --write")
        return 1
    print(f"Agent links OK ({len(links)}); skill names/descriptions valid.")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="default: inspect without writes")
    mode.add_argument("--write", action="store_true", help="create missing links only")
    args = parser.parse_args()
    try:
        return sync_links(args.write)
    except (OSError, ValueError) as error:
        print("ERROR: " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

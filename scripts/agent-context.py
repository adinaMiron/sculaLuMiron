#!/usr/bin/env python3
"""Print a small routing card; never load app bodies or invoke a model."""
from pathlib import Path
import argparse
import re

ROOT = Path(__file__).resolve().parents[1]
# Docs are (path, heading fragment); line locations are computed, not maintained.
ROUTES = {
    "markdown": (["index.html", "js/markdown/README.md"],
                 [("docs/FEATURES.md", "C. New markdown"), ("docs/MAP.md", "index.html")],
                 ["nav", "find", "mdlines"], "app-change"),
    "storage": (["js/markdown/workbooks.js", "js/markdown/drive.js"],
                [("docs/FEATURES.md", "E. Workbooks"), ("docs/FEATURES.md", "O. Google Drive")],
                ["wbstorefailure", "wbresume", "wbsaveall", "gdsync"], "app-change"),
    "header": (["index.html", "js/markdown/startup.js", "js/markdown/events.js"],
               [("docs/MAP.md", "index.html"), ("docs/I18N.md", "shared localization")],
               ["01-move-salveaza-and-sincronizeaza-buttons-like/row", "02-adapt-the-menu-for-small-screens",
                "03-move-kanban-and-gantt-buttons-from/buttons"], "header-layout"),
    "dictation": (["js/markdown/dictation.js", "js/markdown/idea.js", "voice.html"],
                  [("docs/FEATURES.md", "API engine never"), ("docs/I18N.md", "language axes")],
                  ["dictate", "dictatedestination", "01-for-index-html-page-in-idee"], "dictation"),
    "editor": (["editor.html"], [("HANDOFF.md", "Mental model"), ("HANDOFF.md", "Testing approach")],
               ["regression", "gestures", "undoredo"], "app-change"),
    "recipes": (["recipes.html"], [("docs/RECIPES.md", "" )], ["recipes", "mealplan", "targets"], "app-change"),
    "voice": (["voice.html", "js/voice/teleprompter.js", "js/audio/pcm.js"],
              [("docs/FEATURES.md", "P0."), ("docs/FEATURES.md", "P. The melody")],
              ["voice", "melody", "teleprompter"], "app-change"),
    "song": (["song.html", "js/audio/"],
             [("docs/FEATURES.md", "V. Song"), ("docs/SONG-IMPLEMENTATION-STATUS.md", "")],
             ["song", "song-backup-import", "song-recovery"], "app-change"),
    "audio": (["js/audio/pcm.js", "js/audio/analysis.js", "js/audio/synthesis.js"],
              [("docs/SONG-RENDERING.md", ""), ("docs/SONG-PORTABILITY.md", "")],
              ["voice", "melody", "song", "song-synthesis"], "app-change"),
    "calendar": (["calendar.html"], [("docs/FEATURES.md", "L. The calendar")], ["calendar"], "app-change"),
    "kanban": (["kanban.html", "js/markdown/workbooks.js"],
               [("docs/FEATURES.md", "Kanban board")], ["taskstatus", "wbtodo"], "app-change"),
    "transfer": (["transfer.html"], [("docs/FEATURES.md", "Q. Files")], ["transfer"], "app-change"),
    "map": (["map.html"], [("docs/FEATURES.md", "S. Places")], ["map"], "app-change"),
    "shared": (["index.html", "tests/verify.js"], [("docs/MAP.md", "shared block")],
               ["verify", "calendar", "map", "drive"], "app-change"),
    "automation": (["scripts/implement-tasks.sh", "scripts/fix-review.sh", "scripts/codex-runner.sh"],
                   [("docs/agents/task-policy.md", "Unattended"), ("docs/tasks/agent-orchestration/04-decisions.md", "")],
                   ["runner-markdown-tasks", "runner-cli-preflight", "runner-control-plane"], "task-workflow"),
    "tooling": (["scripts/agent-context.py", "scripts/run-tests.py", "scripts/agent-hook.py"],
                [("docs/agents/tooling.md", "")], [], "workflow-maintenance"),
}
ALIASES = {"index": "markdown", "retete": "recipes", "rețete": "recipes", "harta": "map",
           "hartă": "map", "drawing": "editor", "mazgaleste": "editor", "caiet vocal": "voice",
           "song creation": "song", "creează melodie": "song", "nav": "shared", "workbooks": "storage"}


def card(topic):
    key = topic.lower().removesuffix(".html")
    key = ALIASES.get(key, key)
    if key not in ROUTES:
        raise ValueError("Unknown topic; choose: " + ", ".join(ROUTES))
    sources, docs, suites, skill = ROUTES[key]
    lines = [f"{key}: start with the assigned task/review, then locate symbols.",
             "Source: " + ", ".join(sources)]
    for path, fragment in docs:
        headings = [(i, s) for i, s in enumerate((ROOT / path).read_text().splitlines(), 1)
                    if re.match(r"^#{1,3} ", s) and fragment.lower() in s.lower()]
        selected = headings[:3] if fragment else headings[:1]
        lines.extend(f"Doc: {path}:{i} {s}" for i, s in selected)
        if not selected:
            lines.append(f"Doc: {path} (heading moved; search {fragment!r})")
    lines.append(f"Skill: .claude/skills/{skill}/SKILL.md")
    if suites:
        lines.append("Candidate tests (select relevant): python3 scripts/run-tests.py " + " ".join(suites))
    lines.append("Locate: rg -n 'symbol|selector' <source>; read only the matching range.")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("topic", nargs="?")
    args = parser.parse_args()
    if not args.topic:
        print("Topics: " + ", ".join(ROUTES))
        return
    try:
        print(card(args.topic))
    except ValueError as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()

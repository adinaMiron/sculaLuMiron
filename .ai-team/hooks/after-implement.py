#!/usr/bin/env python3
"""After every implementer step: verify.js plus the suites the diff touches.

Output goes to the tester, so it answers up front the question the task-02
tester burned ~30 turns on: "was this failure already there?" (failures on
main are tagged KNOWN by run_suites.py).

Env: TASK_ID, TASK_SLUG, TASK_SPEC, BASE_BRANCH. Must finish within 300 s.
"""
import os
import subprocess
import sys

BUDGET = 240  # seconds of suites; the orchestrator's hard limit is 300

# changed file (prefix) -> suites under tests/ worth running for it
SUITES_FOR = [
    ("index.html", ["idea", "nav", "gdsync", "gantt"]),
    ("js/markdown/", ["idea", "nav", "gdsync", "gantt"]),
    ("calendar.html", ["calendar"]),
    ("map.html", ["map"]),
]


def changed_since(base):
    """Committed and uncommitted changes since the branch left base."""
    res = subprocess.run(["git", "diff", "--name-only", "--merge-base", base],
                         capture_output=True, text=True)
    return [l for l in res.stdout.splitlines() if l.strip()]


def main():
    # argv fallback (`after-implement.py <base> [slug]`) for running it by hand,
    # since `VAR=x cmd` prefixes are refused in unattended Bash
    argv = sys.argv[1:]
    base = os.environ.get("BASE_BRANCH") or (argv[0] if argv else "main")
    slug = os.environ.get("TASK_SLUG") or (argv[1] if len(argv) > 1 else "")
    changed = changed_since(base)
    print("Changed vs " + base + ": " + (", ".join(changed) if changed else "(nothing)"))

    status = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True)
    stray = [l[3:] for l in status.stdout.splitlines()
             if l.startswith("??") and os.path.basename(l[3:].rstrip("/")).startswith(("_", "scratch"))]
    if stray:
        print("WARNING stray scratch files (must not be committed): " + ", ".join(stray))

    suites = ["verify"]
    for prefix, names in SUITES_FOR:
        if any(c == prefix or c.startswith(prefix) for c in changed):
            suites += names
    names = ",".join(dict.fromkeys(suites))
    task = slug if slug and os.path.isdir(os.path.join("tests", slug)) else ""
    print(f"Running: run_suites.py --budget {BUDGET} --suites {names} --task {task or '(none yet)'}")
    sys.stdout.flush()
    res = subprocess.run(["python3", ".ai-team/scripts/run_suites.py", "--budget", str(BUDGET),
                          "--suites", names, "--task", task],
                         capture_output=True, text=True, timeout=290)
    print(res.stdout + res.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

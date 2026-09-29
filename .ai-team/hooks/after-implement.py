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

BUDGET = 200  # seconds of suites; + 60 s preflight cap stays under the 300 s limit

# changed file (prefix) -> suites under tests/ worth running for it
# index.html header/toolbar regression guards: the four shared suites plus
# the layouts merged in the 2026-09-29 run (save/sync row, kanban/gantt move)
MARKDOWN = ["idea", "nav", "gdsync", "gantt", "wbsaveall",
            "01-move-salveaza-and-sincronizeaza-buttons-like/row",
            "03-move-kanban-and-gantt-buttons-from/buttons",
            "02-adapt-the-menu-for-small-screens"]  # Playwright Test specs, ~20-45 s
SUITES_FOR = [
    ("index.html", MARKDOWN),
    ("js/markdown/", MARKDOWN),
    ("tests/", MARKDOWN),
]


def changed_since(base):
    """Committed and uncommitted changes since the branch left base."""
    res = subprocess.run(["git", "diff", "--name-only", "--merge-base", base],
                         capture_output=True, text=True, timeout=5)
    if res.returncode:
        raise RuntimeError("cannot compare base: " + res.stderr.strip())
    return [l for l in res.stdout.splitlines() if l.strip()]


def main():
    # argv fallback (`after-implement.py <base>`) for running it by hand,
    # since `VAR=x cmd` prefixes are refused in unattended Bash
    argv = sys.argv[1:]
    base = os.environ.get("BASE_BRANCH") or (argv[0] if argv else "main")
    if base.startswith("-"):
        print("ERROR: base must be a revision, not an option")
        return 1
    try:
        changed = changed_since(base)
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as e:
        print(f"ERROR: {e}; suite selection incomplete")
        return 1
    print("Changed vs " + base + ": " + (", ".join(changed) if changed else "(nothing)"))

    suites = ["verify"]
    for prefix, names in SUITES_FOR:
        if any(c == prefix or (prefix.endswith("/") and c.startswith(prefix)) for c in changed):
            suites += names
    names = ",".join(dict.fromkeys(suites))
    if len(suites) > 1:
        # task-02 lost four review rounds to a browser that could not launch;
        # say so up front instead of letting it look like 70 product failures
        try:
            pre = subprocess.run(["python3", ".ai-team/scripts/run_suites.py", "--preset", "browser-check"],
                                 capture_output=True, text=True, timeout=60)
            print(pre.stdout.strip() or pre.stderr.strip())
            if pre.returncode == 3:
                print("ENVIRONMENT: the browser cannot launch here; browser suites below are not evidence either way.")
        except (OSError, subprocess.TimeoutExpired) as e:
            print(f"BROWSER: BLOCKED ({e})")
    print(f"Running: run_suites.py --budget {BUDGET} --suites {names}")
    print("New task suites must also be run explicitly by the tester; helper files are not auto-executed.")
    sys.stdout.flush()
    try:
        res = subprocess.run(["python3", ".ai-team/scripts/run_suites.py", "--budget", str(BUDGET),
                              "--suites", names],
                             capture_output=True, text=True, timeout=215)
    except (OSError, subprocess.TimeoutExpired) as e:
        print(f"ERROR: suite runner did not finish: {e}")
        return 1
    print(res.stdout + res.stderr)
    return res.returncode


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""After every implementer step: repo hygiene, verify.js, the task's own
spec folder, and the suites the diff touches.

Output goes to the tester, so it answers up front the question the task-02
tester burned ~30 turns on: "was this failure already there?" (failures on
main are tagged KNOWN by run_suites.py).

Env: TASK_ID, TASK_SLUG, TASK_SPEC, BASE_BRANCH. Must finish within 300 s.
"""
import os
import re
import subprocess
import sys

BUDGET = 200  # seconds of suites; + 60 s preflight cap stays under the 300 s limit

# index.html header/toolbar regression guards: the shared suites plus the
# layouts merged in the 2026-09-29 run (save/sync row, kanban/gantt move)
MARKDOWN = ["idea", "nav", "gdsync", "gantt", "wbsaveall",
            "01-move-salveaza-and-sincronizeaza-buttons-like/row",
            "03-move-kanban-and-gantt-buttons-from/buttons",
            "02-adapt-the-menu-for-small-screens"]  # Playwright Test specs, ~20-45 s
# js/markdown/dictation.js: the shared dictation suite, the idea box it feeds,
# and the language-keeping specs from task 01-for-index-html-page-in-idee (~60 s)
DICTATION = ["dictate", "idea", "01-for-index-html-page-in-idee"]

# Paths that are sandbox/machine state, never repo content. The pulse runtime
# symlink was committed twice by `git add -A` and cost a review round.
JUNK = re.compile(r"^(\.config/|test-results/|playwright-report/|node_modules/|tests/node_modules/)")


def suites_for(path):
    if path == "js/markdown/dictation.js":
        return DICTATION
    if path == "index.html" or path.startswith("js/markdown/") or path.startswith("tests/"):
        return MARKDOWN
    return []


def changed_since(base):
    """Committed and uncommitted changes since the branch left base."""
    res = subprocess.run(["git", "diff", "--name-only", "--merge-base", base],
                         capture_output=True, text=True, timeout=5)
    if res.returncode:
        raise RuntimeError("cannot compare base: " + res.stderr.strip())
    return [l for l in res.stdout.splitlines() if l.strip()]


def own_spec_dir(slug):
    """tests/<TASK_SLUG>/ when it already holds *.spec.js (fix rounds)."""
    if not slug or not re.fullmatch(r"[A-Za-z0-9_-]+", slug):
        return None
    folder = os.path.join("tests", slug)
    if os.path.isdir(folder) and any(f.endswith(".spec.js") for f in os.listdir(folder)):
        return slug
    return None


def main():
    # argv fallback (`after-implement.py <base> [slug]`) for running it by hand,
    # since `VAR=x cmd` prefixes are refused in unattended Bash
    argv = sys.argv[1:]
    base = os.environ.get("BASE_BRANCH") or (argv[0] if argv else "main")
    slug = os.environ.get("TASK_SLUG") or (argv[1] if len(argv) > 1 else "")
    if base.startswith("-"):
        print("ERROR: base must be a revision, not an option")
        return 1
    try:
        changed = changed_since(base)
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as e:
        print(f"ERROR: {e}; suite selection incomplete")
        return 1
    print("Changed vs " + base + ": " + (", ".join(changed) if changed else "(nothing)"))

    junk = [c for c in changed if JUNK.match(c) or os.path.islink(c)]
    if junk:
        print("HYGIENE FAIL: machine/sandbox state in the diff (likely `git add -A`): " + ", ".join(junk))
        print("  fix: `git rm --cached <path>` (keeps the file on disk) and commit; do not rm it.")

    suites = ["verify"]
    own = own_spec_dir(slug)
    if own:
        suites.append(own)  # most relevant first, so the budget never skips it
    for c in changed:
        suites += suites_for(c)
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
    print("New task suites (other than tests/<TASK_SLUG>/*.spec.js) must be run explicitly by the tester.")
    sys.stdout.flush()
    try:
        res = subprocess.run(["python3", ".ai-team/scripts/run_suites.py", "--budget", str(BUDGET),
                              "--suites", names],
                             capture_output=True, text=True, timeout=215)
    except (OSError, subprocess.TimeoutExpired) as e:
        print(f"ERROR: suite runner did not finish: {e}")
        return 1
    print(res.stdout + res.stderr)
    return res.returncode or (1 if junk else 0)


if __name__ == "__main__":
    sys.exit(main())

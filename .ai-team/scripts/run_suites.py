#!/usr/bin/env python3
"""Run Playwright suites under tests/ and print a compact PASS/FAIL digest.

Why: agents kept prefixing `PW_CHROME_PATH=X node`, `export`, `timeout`
and `cd X &&` compounds - all refused unattended - and spent turns
working out whether a failure was pre-existing. This runs each suite with
`node` from tests/, prints only the FAIL lines, and tags failures that are
already listed as known (CLAUDE.md "Known issues") as KNOWN.

Usage (from the project root, through the sandbox):
  run_suites.py nav idea                       # tests/nav.js, tests/idea.js
  run_suites.py 03-move-kanban-and-gantt-buttons-from/buttons
  run_suites.py --preset header                # verify + seven header guards
  run_suites.py --timeout 240 --verbose nav    # full output of each suite
  run_suites.py --budget 200 --preset header   # report incomplete after 200 s

Timings on this machine: verify 0s, idea 5s, nav 5s, gdsync 25s, gantt 1s.

Exit code: 0 for complete runs with no unrecognized failures; 1 for failures,
timeouts, missing files or incomplete runs; 2 for invalid arguments.
KNOWN-ONLY is historical baseline information, not a passing test result.
"""
import argparse
import os
import re
import subprocess
import sys
import time

TESTS = "tests"

PRESETS = {
    # index.html header / toolbar / @media work (retro 2026-09-29 section 2)
    "header": ["verify", "idea", "nav", "gdsync", "gantt", "wbsaveall",
               "01-move-salveaza-and-sincronizeaza-buttons-like/row",
               "03-move-kanban-and-gantt-buttons-from/buttons"],
    # the cheap always-run check
    "verify": ["verify"],
}

# Exact check names reported on main in the 2026-09-29 retrospective.
# These are historical expectations, not proof that a current failure is harmless.
KNOWN = {
    "nav": ["on a phone the click shows the preview",
            "and leaves the source (and the keyboard) alone",
            # Reported on main by the retro; pvTop varies (726, 707).
            # Suspected smooth-scroll timing; not yet listed in CLAUDE.md.
            "and the preview too"],
    "idea": ["💡 button is right of New"],
}


# Loads one suite file (relative to tests/, given as argv[1]) exactly as
# `node <file>` would; __dirname and process.exit behave the same.
# If PW_CHROME_PATH is unset it points it at Playwright's own browser when
# that is installed: gantt.js and the task suites otherwise default to
# google-chrome-stable, a wrapper whose real binary the sandbox cannot see.
RUNNER = ("const fs = require('fs');"
          "if (!process.env.PW_CHROME_PATH) { try {"
          " const p = require('playwright').chromium.executablePath();"
          " if (p && fs.existsSync(p)) process.env.PW_CHROME_PATH = p;"
          " } catch (e) {} }"
          "process.argv[1] = require('path').resolve(process.argv[1]);"
          "require('module').runMain();")  # runs as main: require.main === module


def suite_file(name):
    name = name[:-3] if name.endswith(".js") else name
    name = name[len("tests/"):] if name.startswith("tests/") else name
    if not re.fullmatch(r"[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*", name):
        raise ValueError("suite must be a relative name under tests, using letters, digits, underscores, hyphens and slashes")
    return name, name + ".js"


def run_one(name, timeout, verbose):
    key, rel = suite_file(name)
    full = os.path.realpath(os.path.join(TESTS, rel))
    if not full.startswith(os.path.realpath(TESTS) + os.sep) or not os.path.isfile(full):
        print(f"== {key}: MISSING (no {TESTS}/{rel})")
        return False
    started = time.monotonic()
    try:
        res = subprocess.run(["node", "-e", RUNNER, rel], cwd=TESTS, capture_output=True,
                             text=True, timeout=timeout)
        out, code = (res.stdout or "") + (res.stderr or ""), res.returncode
    except subprocess.TimeoutExpired as e:
        out = e.stdout.decode(errors="replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
        out += e.stderr.decode(errors="replace") if isinstance(e.stderr, bytes) else (e.stderr or "")
        code = "timeout"
    except OSError as e:
        print(f"== {key}: ERROR ({e})")
        return False
    lines = out.splitlines()
    passes = [l for l in lines if l.startswith("PASS")]
    fails = [l for l in lines if l.startswith("FAIL")]
    known_names = KNOWN.get(key, [])
    new = [f for f in fails if f.removeprefix("FAIL ").split("  -> ", 1)[0] not in known_names]
    known = [f for f in fails if f not in new]
    # nav/idea print this summary only after all checks and browser cleanup.
    # A matching failure followed by a crash/timeout must never be waived.
    completed = bool(lines) and lines[-1].strip() == f"{len(fails)} FAILED"
    status = "OK" if code == 0 and not fails else (
        "KNOWN-ONLY" if code == 1 and fails and not new and completed else "FAIL")
    secs = round(time.monotonic() - started)
    print(f"== {key}: {status} exit={code} pass={len(passes)} fail={len(fails)} (known {len(known)}) {secs}s")
    for f in new:
        print("  NEW   " + f[:300])
    for f in known:
        print("  KNOWN " + f[:300])
    if status == "FAIL":
        # crashed or timed out before any check: show the tail
        for l in lines[-15:]:
            print("  | " + l[:300])
    if verbose:
        for l in lines:
            print("  > " + l[:300])
    return status != "FAIL"


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("names", nargs="*")
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--budget", type=int, default=240)
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--preset", choices=PRESETS)
    parser.add_argument("--suites", default="")
    args = parser.parse_args(argv)
    if args.timeout <= 0 or not 1 <= args.budget <= 240:
        parser.error("timeout must be positive and budget must be 1–240 seconds")
    names = args.names + [n for n in args.suites.split(",") if n]
    if args.preset:
        names += PRESETS[args.preset]
    if not names:
        parser.error("provide suite names or --preset")
    try:
        names = [suite_file(n)[0] for n in names]
    except ValueError as e:
        parser.error(str(e))
    ok, t0 = True, time.monotonic()
    for n in dict.fromkeys(names):
        left = args.budget - (time.monotonic() - t0)
        if left < 1:
            print(f"== {n}: NOT RUN (--budget {args.budget}s used up)")
            ok = False
            continue
        ok = run_one(n, min(args.timeout, left), args.verbose) and ok
    print("RESULT: " + ("completed; no unrecognized failures (KNOWN-ONLY is not a pass)" if ok else "FAIL or INCOMPLETE - see above"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

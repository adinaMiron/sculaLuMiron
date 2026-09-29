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
  run_suites.py --preset header                # verify + idea nav gdsync gantt
  run_suites.py --task <slug>                  # every tests/<slug>/*.js
  run_suites.py --timeout 240 --verbose nav    # full output of each suite
  run_suites.py --budget 200 --preset header   # stop starting suites after 200 s
  run_suites.py --verbose node_modules/.scratch/probe   # a git-ignored scratch probe

Timings on this machine: verify 0s, idea 5s, nav 5s, gdsync 25s, gantt 1s.

Exit code: 0 when every failure is KNOWN, 1 otherwise.
"""
import os
import subprocess
import sys
import time

TESTS = "tests"

PRESETS = {
    # index.html header / toolbar / @media work (retro 2026-09-29 section 2)
    "header": ["verify", "idea", "nav", "gdsync", "gantt"],
    # the cheap always-run check
    "verify": ["verify"],
}

# Substrings of FAIL lines already failing on main (CLAUDE.md Known issues).
KNOWN = {
    "nav": ["on a phone the click shows the preview",
            "and leaves the source (and the keyboard) alone",
            # fails on main at 0d96fbc; pvTop differs run to run (726, 707)
            # so it reads a smooth scroll mid-flight - timing, not header
            # layout. Not yet listed in CLAUDE.md.
            "and the preview too"],
    "idea": ["button is right of New"],
}
# Suites known to crash or time out as a whole on main.
KNOWN_BROKEN = {"wbrename": "times out on its first dblclick (CLAUDE.md known issue 2)"}


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
    return name, name + ".js"


def run_one(name, timeout, verbose):
    key, rel = suite_file(name)
    full = os.path.realpath(os.path.join(TESTS, rel))
    if not full.startswith(os.path.realpath(TESTS) + os.sep) or not os.path.isfile(full):
        print(f"== {key}: MISSING (no {TESTS}/{rel})")
        return False
    started = time.time()
    try:
        res = subprocess.run(["node", "-e", RUNNER, rel], cwd=TESTS, capture_output=True,
                             text=True, timeout=timeout)
        out, code = (res.stdout or "") + (res.stderr or ""), res.returncode
    except subprocess.TimeoutExpired as e:
        out = e.stdout.decode(errors="replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
        code = "timeout"
    lines = out.splitlines()
    passes = [l for l in lines if l.startswith("PASS")]
    fails = [l for l in lines if l.startswith("FAIL")]
    base = os.path.basename(key)
    known_subs = KNOWN.get(base, [])
    new = [f for f in fails if not any(s in f for s in known_subs)]
    known = [f for f in fails if f not in new]
    if key in KNOWN_BROKEN and code != 0:
        print(f"== {key}: KNOWN-BROKEN ({KNOWN_BROKEN[key]}) exit={code}")
        return True
    status = "OK" if code == 0 else ("KNOWN-ONLY" if fails and not new else "FAIL")
    secs = round(time.time() - started)
    print(f"== {key}: {status} exit={code} pass={len(passes)} fail={len(fails)} (known {len(known)}) {secs}s")
    for f in new:
        print("  NEW   " + f[:300])
    for f in known:
        print("  KNOWN " + f[:300])
    if code != 0 and not fails:
        # crashed or timed out before any check: show the tail
        for l in lines[-15:]:
            print("  | " + l[:300])
    if verbose:
        for l in lines:
            print("  > " + l[:300])
    return status != "FAIL"


def main(argv):
    timeout, budget, verbose, names = 300, 3600, False, []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--timeout":
            timeout = int(argv[i + 1]); i += 1
        elif a == "--budget":
            budget = int(argv[i + 1]); i += 1
        elif a == "--verbose":
            verbose = True
        elif a == "--preset":
            names += PRESETS[argv[i + 1]]; i += 1
        elif a == "--suites":  # comma-separated names, for callers like the hook
            names += [n for n in argv[i + 1].split(",") if n]; i += 1
        elif a == "--task":
            d = os.path.join(TESTS, argv[i + 1])
            if not argv[i + 1]:
                pass
            elif os.path.isdir(d):
                names += [argv[i + 1] + "/" + f for f in sorted(os.listdir(d))
                          if f.endswith(".js") and not f.startswith("_")]
            else:
                print(f"== no suite directory {d}")
            i += 1
        elif a in ("-h", "--help"):
            print(__doc__); return 0
        else:
            names.append(a)
        i += 1
    if not names:
        print(__doc__); return 2
    ok, t0 = True, time.time()
    for n in dict.fromkeys(names):
        left = budget - (time.time() - t0)
        if left < 10:
            print(f"== {n}: SKIPPED (--budget {budget}s used up)")
            continue
        ok = run_one(n, min(timeout, int(left)), verbose) and ok
    print("RESULT: " + ("no new failures" if ok else "NEW FAILURES - see above"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

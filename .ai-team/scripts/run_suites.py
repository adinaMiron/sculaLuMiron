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
  run_suites.py --preset header                # verify + header guards + specs
  run_suites.py --timeout 240 --verbose nav    # full output of each suite
  run_suites.py --budget 200 --preset header   # report incomplete after 200 s
  run_suites.py 02-adapt-the-menu-for-small-screens   # a *.spec.js folder:
                  # runs `npx playwright test tests/<dir>/ --reporter=line`
                  # from the root (does NOT overwrite test-results/report.json)
  run_suites.py --discovery                    # which tests/NN-* folders each
                                               # npm test entry point runs
  run_suites.py --preset browser-check         # launch Chromium once; exit 3
                                               # with BROWSER: BLOCKED if it can't

Timings on this machine (sandbox, 2026-09-29): verify 0s, idea 5s, nav 5s,
gdsync 25s, gantt 1s, wbsaveall 7s, row 10s, buttons 7s, task-02 specs 19s;
header preset ~80s; dictate 9s, 01-for-index-html-page-in-idee specs 44s.

Exit code: 0 for complete runs with no unrecognized failures; 1 for failures,
timeouts, missing files or incomplete runs; 2 for invalid arguments;
3 when the browser cannot launch at all (environment, not a product bug).
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
               "03-move-kanban-and-gantt-buttons-from/buttons",
               # Playwright Test specs (task-02 desktop wrap, ~45 s)
               "02-adapt-the-menu-for-small-screens"],
    # js/markdown/dictation.js / idea-box dictation work (~60 s)
    "dictation": ["verify", "dictate", "idea", "01-for-index-html-page-in-idee"],
    # the cheap always-run check
    "verify": ["verify"],
    "browser-check": [],
}

# Launches Chromium the way the Node suites do and prints one verdict line.
BROWSER_CHECK = ("const fs = require('fs'); const pw = require('playwright');"
                 "let p = process.env.PW_CHROME_PATH;"
                 "if (!p) { try { const q = pw.chromium.executablePath();"
                 " if (q && fs.existsSync(q)) p = q; } catch (e) {} }"
                 "pw.chromium.launch(p ? { executablePath: p } : {})"
                 ".then(async b => { await b.close(); console.log('BROWSER: OK ' + (p || 'default')); })"
                 ".catch(e => { console.log('BROWSER: BLOCKED (' +"
                 " String(e.message).split('\\n').filter(Boolean).slice(0, 3).join(' | ') + ')');"
                 " process.exit(3); });")


def discovery():
    """Which task folders each `npm test` entry point runs, without --list
    (which overwrites test-results/report.json with an all-skipped run)."""
    try:
        with open("playwright.config.js", encoding="utf-8") as f:
            cfg = f.read()
    except OSError:
        cfg = ""
    m = re.search(r"testMatch\s*:\s*\[([^\]]*)\]", cfg)
    matches = re.findall(r"['\"]([^'\"]+)['\"]", m.group(1)) if m else []
    try:
        with open(os.path.join(TESTS, "package.json"), encoding="utf-8") as f:
            pkg = f.read()
    except OSError:
        pkg = ""
    m = re.search(r"for f in ([^;]*);", pkg)
    loop = m.group(1).split() if m else []
    print("root npm test (playwright.config.js testMatch): " + (", ".join(matches) or "(none found)"))
    print(f"tests/ npm test loop: {len(loop)} suites")
    uncovered = 0
    for d in sorted(os.listdir(TESTS)):
        full = os.path.join(TESTS, d)
        if not re.match(r"\d\d-", d) or not os.path.isdir(full):
            continue
        files = sorted(f for f in os.listdir(full) if f.endswith(".js"))
        specs = [f for f in files if f.endswith(".spec.js")]
        plain = [f[:-3] for f in files if not f.endswith(".spec.js")]
        by_root = bool(specs) and any(f"/{d}/" in p for p in matches)
        in_loop = [p for p in plain if f"{d}/{p}" in loop]
        where = []
        if specs:
            where.append(f"{len(specs)} spec(s) " + ("in root npm test" if by_root else "NOT in root testMatch"))
        if plain:
            where.append(f"node files {plain}: " + (f"in loop {in_loop}" if in_loop else "none in tests/ loop"))
        if (specs and not by_root) or (plain and not in_loop and not specs):
            uncovered += 1
        print(f"  {d}: " + "; ".join(where))
    print(f"DISCOVERY: {uncovered} task folder(s) run by neither npm test "
          "(node files may be helpers; check before registering)")
    return True


def browser_check():
    try:
        res = subprocess.run(["node", "-e", BROWSER_CHECK], cwd=TESTS, capture_output=True,
                             text=True, timeout=60)
        out = ((res.stdout or "") + (res.stderr or "")).strip()
    except (OSError, subprocess.TimeoutExpired) as e:
        out = f"BROWSER: BLOCKED ({e})"
    line = next((l for l in out.splitlines() if l.startswith("BROWSER:")),
                "BROWSER: BLOCKED (" + out[-300:] + ")")
    print(line[:500])
    return line.startswith("BROWSER: OK")


def run_spec_dir(key, timeout, verbose):
    """A tests/<dir>/ of *.spec.js files: Playwright Test from the root."""
    started = time.monotonic()
    try:
        res = subprocess.run(["npx", "playwright", "test", f"{TESTS}/{key}/", "--reporter=line"],
                             capture_output=True, text=True, timeout=timeout)
        out, code = (res.stdout or "") + (res.stderr or ""), res.returncode
    except subprocess.TimeoutExpired as e:
        out = e.stdout.decode(errors="replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
        code = "timeout"
    except OSError as e:
        print(f"== {key}: ERROR ({e})")
        return False
    lines = out.splitlines()
    stats = {k: int(n) for n, k in re.findall(r"^\s*(\d+) (passed|failed|flaky|skipped|did not run)",
                                               out, re.M)}
    secs = round(time.monotonic() - started)
    ok = code == 0 and stats.get("passed", 0) > 0 and not stats.get("failed")
    print(f"== {key}: {'OK' if ok else 'FAIL'} exit={code} pass={stats.get('passed', 0)} "
          f"fail={stats.get('failed', 0)} flaky={stats.get('flaky', 0)} "
          f"skipped={stats.get('skipped', 0)} {secs}s (playwright test)")
    if not ok:
        # the line reporter prints each failure as "  1) [chromium] › file:line › title"
        heads = [l for l in lines if re.match(r"^\s+\d+\) ", l)]
        for l in (heads[:20] if heads else lines[-15:]):
            print("  | " + l.strip()[:300])
    if verbose:
        for l in lines:
            print("  > " + l[:300])
    return ok

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
    folder = os.path.realpath(os.path.join(TESTS, key))
    if (folder.startswith(os.path.realpath(TESTS) + os.sep) and os.path.isdir(folder)
            and any(f.endswith(".spec.js") for f in os.listdir(folder))):
        return run_spec_dir(key, timeout, verbose)
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
    m = re.match(r"OK: (\d+) checks passed", lines[-1] if lines else "")  # row.js summary
    if m and not passes:
        passes = [""] * int(m.group(1))
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
    parser.add_argument("--discovery", action="store_true",
                        help="report which task folders each npm test entry point runs")
    args = parser.parse_args(argv)
    if args.timeout <= 0 or not 1 <= args.budget <= 240:
        parser.error("timeout must be positive and budget must be 1–240 seconds")
    names = args.names + [n for n in args.suites.split(",") if n]
    if args.discovery:
        return 0 if discovery() else 1
    if args.preset == "browser-check":
        return 0 if browser_check() else 3
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

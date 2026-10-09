#!/usr/bin/env python3
"""Run selected Node/Python/Playwright suites with compact output and complete local logs."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
PRESETS = {
    "verify": ["verify"],
    "header": ["verify", "idea", "nav", "gdsync", "gantt", "wbsaveall",
               "01-move-salveaza-and-sincronizeaza-buttons-like/row",
               "03-move-kanban-and-gantt-buttons-from/buttons",
               "02-adapt-the-menu-for-small-screens"],
    "dictation": ["verify", "dictate", "dictatedestination", "01-for-index-html-page-in-idee"],
}
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def browser_environment():
    env = os.environ.copy()
    if env.get("PW_CHROME_PATH"):
        if not os.access(env["PW_CHROME_PATH"], os.X_OK):
            raise ValueError("PW_CHROME_PATH is not executable: " + env["PW_CHROME_PATH"])
        return env
    # First use the browser belonging to the installed test dependency.
    probe = subprocess.run(["node", "-e", "process.stdout.write(require('playwright').chromium.executablePath())"],
                           cwd=ROOT / "tests", capture_output=True, text=True, timeout=10)
    candidates = [probe.stdout.strip()] if probe.returncode == 0 else []
    candidates += [shutil.which(n) for n in ("google-chrome-stable", "google-chrome", "chromium", "chromium-browser")]
    candidates += [str(p) for p in sorted(Path("/opt/pw-browsers").glob("chromium-*/chrome-linux*/chrome"))]
    for candidate in candidates:
        if candidate and os.access(candidate, os.X_OK):
            env["PW_CHROME_PATH"] = candidate
            break
    return env


def suite_command(name, grep=None, listing=False):
    key = name.removeprefix("tests/")
    if not re.fullmatch(r"[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*(?:\.spec)?(?:\.js|\.py)?", key):
        raise ValueError("Use a suite name or relative path under tests/: " + name)
    tests = ROOT / "tests"
    target = tests / key
    if not target.is_dir() and not key.endswith((".js", ".py")):
        target = tests / (key + ".js")
    if not target.resolve().is_relative_to(tests.resolve()) or not target.exists():
        raise ValueError("Suite not found under tests/: " + name)
    spec = target.is_dir() or target.name.endswith(".spec.js")
    if not spec:
        if grep or listing:
            raise ValueError("--grep/--list apply only to Playwright Test specs, not " + name)
        executable = sys.executable if target.suffix == ".py" else "node"
        return [executable, str(target)], tests, False
    folder = target if target.is_dir() else target.parent
    if target.is_dir() and not any(target.glob("*.spec.js")):
        raise ValueError("No *.spec.js files in " + name)
    config = folder / "playwright.config.js"
    if not config.is_file():
        config = ROOT / "playwright.config.js"
        # Root testMatch is an explicit inventory, not every test directory.
        if f"/{folder.relative_to(tests).as_posix()}/" not in config.read_text():
            raise ValueError("Folder is outside root testMatch; add a scoped playwright.config.js: " + name)
    cli = ROOT / "node_modules/@playwright/test/cli.js"
    if not cli.is_file():
        raise ValueError("Missing dev dependencies; install from root package.json before running specs")
    # Override reporter even with --list: never overwrite a retained JSON report.
    command = ["node", str(cli), "test", "--config", str(config), str(target), "--reporter=line"]
    if grep:
        command += ["--grep", grep]
    if listing:
        command.append("--list")
    return command, ROOT, True


def stop_process(process):
    if os.name == "posix":
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=0.5)
        except subprocess.TimeoutExpired:
            pass
        # Kill surviving descendants even when the parent already exited.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    else:
        process.kill()
    process.wait()


def run_logged(command, cwd, env, timeout, log):
    """Return (exit status, timed out). Logs are never an execution input."""
    with log.open("w", encoding="utf-8") as output:
        output.write(json.dumps({"argv": command, "cwd": str(cwd)}) + "\n")
        output.flush()
        process = subprocess.Popen(command, cwd=cwd, env=env, stdout=output,
                                   stderr=subprocess.STDOUT, start_new_session=os.name == "posix")
        try:
            return process.wait(timeout=timeout), False
        except subprocess.TimeoutExpired:
            stop_process(process)
            return 124, True
        except BaseException:
            stop_process(process)
            raise


def inspect_log(log, spec=False, listing=False):
    failed, passed = False, 0
    with log.open(encoding="utf-8", errors="replace") as source:
        next(source, None)  # command metadata, never test evidence
        for raw in source:
            line = ANSI.sub("", raw)
            failed |= bool(re.match(r"\s*(?:FAIL\b|[1-9]\d* FAILED\b)", line))
            match = re.search(r"\b(\d+) passed\b", line)
            if match:
                passed += int(match[1])
    return not failed and (not spec or listing or passed > 0)


def tail(log):
    with log.open("rb") as source:
        source.seek(max(0, log.stat().st_size - 16000))
        lines = source.read().decode("utf-8", errors="replace").splitlines()[-16:]
    for line in lines:
        print("  " + ANSI.sub("", line)[:350])


def discover():
    package = json.loads((ROOT / "tests/package.json").read_text())
    print("Standalone loop: tests/package.json scripts.test (explicit inventory)")
    print(package["scripts"]["test"])
    config = (ROOT / "playwright.config.js").read_text()
    inventory = re.search(r"testMatch\s*:\s*\[([^]]*)\]", config)
    print("Root specs: playwright.config.js testMatch: " + (inventory[1].strip() if inventory else "inspect config"))
    for folder in sorted((ROOT / "tests").iterdir()):
        if folder.is_dir() and any(folder.glob("*.spec.js")):
            config = "own config" if (folder / "playwright.config.js").is_file() else "check root testMatch"
            print(f"  {folder.name}: {config}")
    print("Python checks: use an explicit filename, e.g. agent-tools.py.")
    print("Other standalone suites: python3 scripts/run-tests.py <name>; see tests/README.md.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("names", nargs="*")
    parser.add_argument("--preset", choices=[*PRESETS, "browser-check"])
    parser.add_argument("--doctor", action="store_true")
    parser.add_argument("--discover", "--discovery", action="store_true")
    parser.add_argument("--suites", default="", help="comma-separated names; legacy adapter support")
    parser.add_argument("--timeout", type=float, default=240, help="seconds per suite")
    parser.add_argument("--budget", type=float, default=900, help="seconds for the selected run")
    parser.add_argument("--grep", help="Playwright Test tag/title regex")
    parser.add_argument("--list", action="store_true", help="list selected specs without replacing JSON reports")
    parser.add_argument("--verbose", action="store_true", help="print full logs (default: failure tail only)")
    args = parser.parse_args(argv)
    if not (0 < args.timeout < float("inf") and 0 < args.budget < float("inf")):
        parser.error("timeout and budget must be finite positive seconds")
    if args.discover:
        discover()
        return 0
    doctor = args.doctor or args.preset == "browser-check"
    names = list(dict.fromkeys(args.names + [n for n in args.suites.split(",") if n] + PRESETS.get(args.preset, [])))
    if not names and not doctor:
        parser.error("choose suite names, --preset, --doctor or --discover; no implicit full suite")
    try:
        # Validate every selection before executing any of them.
        selections = [(name, *suite_command(name, args.grep, args.list)) for name in names]
        # Known offline checks must not depend on browser installation/config.
        # Other JS suites retain discovery; do not guess from their source text.
        needs_browser = doctor or (not args.list and any(
            spec or (Path(command[1]).suffix != ".py" and Path(command[1]) != ROOT / "tests/verify.js")
            for _, command, _, spec in selections))
        env = browser_environment() if needs_browser else os.environ.copy()
        if doctor:
            code = ("const {chromium}=require('playwright');"
                    "chromium.launch(process.env.PW_CHROME_PATH?{executablePath:process.env.PW_CHROME_PATH}:{})"
                    ".then(async b=>{await b.close();console.log('BROWSER: OK')})"
                    ".catch(e=>{console.error(e.message);process.exit(3)})")
            selections.insert(0, ("browser-check", ["node", "-e", code], ROOT / "tests", False))
        log_root = ROOT / "test-results/agent"
        log_root.mkdir(parents=True, exist_ok=True)
        run_dir = Path(tempfile.mkdtemp(prefix="run-", dir=log_root))
        deadline = time.monotonic() + args.budget
        failed = False
        for index, (name, command, cwd, spec) in enumerate(selections, 1):
            left = deadline - time.monotonic()
            if left <= 0:
                print("NOT RUN (budget exhausted): " + name)
                failed = True
                continue
            log = run_dir / f"{index:02d}-{name.replace('/', '_')}.log"
            status, timeout = run_logged(command, cwd, env, min(args.timeout, left), log)
            ok = status == 0 and inspect_log(log, spec, args.list)
            label = ("LISTED" if args.list and spec else "PASS") if ok else "FAIL"
            print(f"{label} {name}" + (" (timeout)" if timeout else f" (exit {status})"))
            print("Log: " + str(log))
            if args.verbose or args.list:
                print(log.read_text(errors="replace"))
            elif not ok:
                tail(log)
            failed |= not ok
            if name == "browser-check":
                print("BROWSER: " + ("OK" if ok else "BLOCKED — environment/setup failure"))
                if not ok:
                    return 3
        return 1 if failed else 0
    except (ValueError, OSError, subprocess.TimeoutExpired) as error:
        print("ERROR: " + str(error), file=sys.stderr)
        return 3 if doctor else 2
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())

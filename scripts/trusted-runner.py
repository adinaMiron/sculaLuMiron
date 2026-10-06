#!/usr/bin/env python3
"""Run reviewed wrapper code from Linux sealed memfds, never mutable files.

The initial checkout and host tools are trusted at startup. Seals, rather than
permissions or a temporary directory, keep the running code and its baseline
immutable even when the agent runs as the same user. No model is started here.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shlex
import stat
import subprocess
import sys


CONTROL_PATHS = ("scripts", ".github", ".githooks", ".gitattributes", ".gitmodules")
BODY_MARKER = b"# TRUSTED_RUNNER_BODY\n"


def inventory(root):
    result = {}

    def visit(relative):
        file = root / relative
        try:
            info = file.lstat()
        except FileNotFoundError:
            return
        mode = info.st_mode
        if stat.S_ISLNK(mode):
            value = [mode, os.readlink(file)]
        elif stat.S_ISDIR(mode):
            value = [mode]
            for child in sorted(file.iterdir()):
                visit(relative / child.name)
        elif stat.S_ISREG(mode):
            value = [mode, hashlib.sha256(file.read_bytes()).hexdigest()]
        else:
            raise RuntimeError(f"Unsupported control-plane file: {relative}")
        result[str(relative)] = value

    for name in CONTROL_PATHS:
        visit(Path(name))
    return result


def seal(name, data):
    fd = os.memfd_create(name, os.MFD_ALLOW_SEALING)
    with os.fdopen(os.dup(fd), "wb") as output:
        output.write(data)
    os.fchmod(fd, 0o400)
    seals = (fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW |
             fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL)
    fcntl.fcntl(fd, fcntl.F_ADD_SEALS, seals)
    if fcntl.fcntl(fd, fcntl.F_GET_SEALS) != seals:
        raise RuntimeError("Could not seal trusted wrapper storage")
    return fd


def check(root, baseline_file):
    expected = json.loads(Path(baseline_file).read_bytes())
    actual = inventory(root)
    changed = sorted(name for name in expected.keys() | actual.keys()
                     if expected.get(name) != actual.get(name))
    if changed:
        raise RuntimeError("Control-plane changes rejected; working tree preserved: "
                           + ", ".join(repr(name) for name in changed))


def hold_evidence(files):
    """Keep per-iteration evidence sealed until the wrapper closes our stdin.

    /proc paths refer directly to these live kernel objects, without a mutable
    directory entry. Killing this holder makes validation fail closed.
    """
    fds = []
    try:
        for index, file in enumerate(files):
            fds.append(seal(f"validation-evidence-{index}", Path(file).read_bytes()))
        for fd in fds:
            print(f"/proc/{os.getpid()}/fd/{fd}", flush=True)
        sys.stdin.buffer.read()
    finally:
        for fd in fds:
            os.close(fd)


def launch(runner, args):
    script = Path(runner).resolve(strict=True)
    if script.name not in ("fix-review.sh", "implement-tasks.sh"):
        raise RuntimeError("Unknown runner")
    root = Path(subprocess.check_output(
        ["git", "-C", str(script.parent), "rev-parse", "--show-toplevel"],
        text=True).strip())
    if script.parent != root / "scripts":
        raise RuntimeError("Runner must be in the repository scripts directory")

    baseline = inventory(root)
    script_bytes = script.read_bytes()
    body = script_bytes.split(BODY_MARKER, 1)[1]
    helper = (script.parent / "codex-runner.sh").read_bytes()
    checker = Path(__file__).read_bytes()
    # Reject a concurrent startup change rather than mixing wrapper versions.
    for name, data in ((script.name, script_bytes),
                       ("codex-runner.sh", helper), ("trusted-runner.py", checker)):
        if baseline.get("scripts/" + name) != [
                (script.parent / name).stat().st_mode, hashlib.sha256(data).hexdigest()]:
            raise RuntimeError("Control plane changed during startup")

    checker_fd = seal("wrapper-checker", checker)
    baseline_fd = seal("wrapper-baseline", json.dumps(baseline).encode())
    helper_fd = seal("wrapper-helper", helper)
    prefix = f"""set -Eeuo pipefail
readonly REPO_ROOT={shlex.quote(str(root))}
readonly WRAPPER_HELPER_FD={helper_fd}
readonly WRAPPER_CHECKER_FD={checker_fd}
assert_control_plane() {{
    python3 -I /proc/self/fd/{checker_fd} --check "$REPO_ROOT" /proc/self/fd/{baseline_fd} || exit 1
}}
# Every host Git/GitHub action is gated, including branch preparation and hooks.
git() {{ assert_control_plane; command git "$@"; }}
gh() {{ assert_control_plane; command gh "$@"; }}
assert_control_plane
""".encode()
    runner_fd = seal("wrapper-" + script.name, prefix + body)
    env = dict(os.environ)
    env.pop("BASH_ENV", None)
    env.pop("ENV", None)
    try:
        return subprocess.call(
            ["bash", "--noprofile", "--norc", f"/proc/self/fd/{runner_fd}", *args],
            pass_fds=(checker_fd, baseline_fd, helper_fd, runner_fd), env=env)
    finally:
        for fd in (checker_fd, baseline_fd, helper_fd, runner_fd):
            os.close(fd)


if __name__ == "__main__":
    try:
        if sys.argv[1] == "--check":
            check(Path(sys.argv[2]), sys.argv[3])
        elif sys.argv[1] == "--hold-evidence":
            hold_evidence(sys.argv[2:])
        else:
            sys.exit(launch(sys.argv[1], sys.argv[2:]))
    except (OSError, ValueError, RuntimeError, IndexError, AttributeError) as error:
        print(f"ERROR: Trusted wrapper boundary failed: {error}", file=sys.stderr)
        sys.exit(1)

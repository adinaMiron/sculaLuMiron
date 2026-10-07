#!/usr/bin/env python3
"""Run reviewed wrapper code from Linux sealed memfds, never mutable files.

The initial checkout and host tools are trusted at startup. Seals, rather than
permissions or a temporary directory, keep the running code and its baseline
immutable even when the agent runs as the same user. No model is started here.
"""
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys
import time
from datetime import datetime, timedelta


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


def usage_retry_delay(error, fallback, now=None):
    """Recognize only explicit usage exhaustion, never arbitrary HTTP 429s.

    Exec currently exposes a message in turn.failed.error. Accept structured
    reset fields too, but keep unfamiliar message/date formats on a slow poll.
    Naive human reset times use the CLI process's local timezone.
    """
    if not isinstance(error, dict):
        return 0
    message = error.get("message", "")
    if not isinstance(message, str):
        message = ""
    if error.get("code") != "usage_limit_reached" and not re.search(
            r"\b(?:you['’]ve hit your usage limit|usage limit (?:has been )?"
            r"(?:reached|exceeded)|usage_limit_reached)\b", message, re.I):
        return 0
    now = time.time() if now is None else now

    def seconds(value):
        # Reset fields are data, never shell expressions or commands.
        if isinstance(value, bool):
            return None
        try:
            value = float(value)
            return value if math.isfinite(value) else None
        except (TypeError, ValueError):
            return None

    reset = seconds(error.get("resets_at"))
    if reset is not None and reset > now:
        return math.ceil(reset - now) + 5
    for field in ("retry_after_seconds", "retry_after"):
        delay = seconds(error.get(field))
        if delay is not None and delay > 0:
            return math.ceil(delay) + 5

    relative = re.search(r"try again in ((?:\d+\s*(?:days?|hours?|minutes?|seconds?|[dhms])\s*)+)",
                         message, re.I)
    if relative:
        units = {"d": 86400, "h": 3600, "m": 60, "s": 1}
        delay = sum(int(value) * units[unit.lower()[0]] for value, unit in re.findall(
            r"(\d+)\s*(days?|hours?|minutes?|seconds?|[dhms])", relative[1], re.I))
        return delay + 5 if delay > 0 else fallback

    absolute = re.search(r"try again at (.+?)(?:\.\s|\.$|$)", message, re.I)
    if absolute:
        stamp = re.sub(r"(\d)(?:st|nd|rd|th)\b", r"\1", absolute[1], flags=re.I).strip()
        # ISO timestamps may carry an offset; human-formatted CLI times are local.
        try:
            parsed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        except ValueError:
            parsed = None
        if parsed is None:
            for fmt in ("%I:%M %p on %b %d, %Y", "%b %d, %Y %I:%M %p",
                        "%b %d, %Y, %I:%M %p", "%b %d, %Y at %I:%M %p",
                        "%b %d at %I:%M %p", "%b %d %I:%M %p", "%I:%M %p", "%H:%M"):
                try:
                    parsed = datetime.strptime(stamp, fmt)
                    if fmt in ("%I:%M %p", "%H:%M"):
                        local = datetime.fromtimestamp(now)
                        parsed = local.replace(hour=parsed.hour, minute=parsed.minute,
                                               second=0, microsecond=0)
                        if parsed.timestamp() < now - 60:
                            parsed += timedelta(days=1)
                    elif "%Y" not in fmt:
                        local = datetime.fromtimestamp(now)
                        year = local.year + (local.month == 12 and parsed.month == 1)
                        parsed = parsed.replace(year=year)
                    break
                except ValueError:
                    continue
        if parsed is not None and parsed.timestamp() > now:
            return math.ceil(parsed.timestamp() - now) + 5
    return fallback


def display_text(value, limit=180):
    """Keep untrusted event text on one short terminal line, without escapes."""
    return re.sub(r"[\x00-\x1f\x7f-\x9f]", " ", str(value))[:limit]


class CodexOutput:
    """Readable diagnostics only; never used as validation/retry evidence."""

    def __init__(self, log):
        self.log = log
        self.activity = None
        self.commands = set()
        self.changed = set()

    def detail(self, heading, body=""):
        stamp = datetime.now().strftime("%H:%M:%S")
        print(f"\n[{stamp}] {heading}", file=self.log, flush=True)
        if body:
            print(body, file=self.log, flush=True)

    def progress(self, text):
        if self.activity != text:
            print(text, file=sys.stderr, flush=True)
            self.activity = text

    def event(self, event):
        kind = event.get("type", "Unknown event")
        item = event.get("item")
        if kind in ("item.started", "item.updated", "item.completed") and isinstance(item, dict):
            item_kind = item.get("type")
            if item_kind == "command_execution":
                command = str(item.get("command", ""))
                identity = str(item.get("id", command))
                if identity not in self.commands:
                    self.detail("Command", command)
                    self.commands.add(identity)
                if kind == "item.started":
                    if re.search(r"\b(?:test[s]?/|npm\s+(?:run\s+)?test|pytest|cargo\s+test)", command):
                        self.progress("Running tests...")
                    elif re.search(r"\b(?:cat|sed|rg|head|tail|ls|find)\b", command):
                        self.progress("Reading files...")
                    else:
                        self.progress("Running a command...")
                elif kind == "item.completed":
                    self.detail(f"Command finished (exit {item.get('exit_code', '?')})",
                                item.get("aggregated_output", ""))
            elif item_kind == "file_change":
                if kind == "item.completed":
                    if item.get("status") == "failed":
                        self.detail("File change failed", json.dumps(item, ensure_ascii=False, indent=2))
                        self.progress("File change failed; see log.")
                        return
                    changes = item.get("changes", [])
                    for change in changes if isinstance(changes, list) else []:
                        if not isinstance(change, dict):
                            continue
                        path = str(change.get("path", "?"))
                        self.detail(f"File {change.get('kind', 'changed')}: {path}")
                        if path not in self.changed:
                            try:
                                short_path = str(Path(path).relative_to(Path.cwd()))
                            except ValueError:
                                short_path = path
                            self.progress(f"Edited: {display_text(short_path)}")
                            self.changed.add(path)
            elif item_kind in ("agent_message", "reasoning"):
                if kind == "item.completed":
                    self.detail("Agent summary" if item_kind == "agent_message" else "Agent notes",
                                item.get("text", ""))
            else:
                self.detail(kind, json.dumps(item, ensure_ascii=False, indent=2))
        elif kind in ("turn.failed", "error"):
            error = event.get("error", event)
            message = error.get("message", "Unknown error") if isinstance(error, dict) else error
            self.detail("Codex error", str(message))
            self.progress(f"Codex: {display_text(message)}")
        else:
            self.detail(kind, json.dumps({k: v for k, v in event.items() if k != "type"},
                                        ensure_ascii=False, indent=2))


def watch_codex_events(fallback, log_path=None):
    """Format diagnostics; return only a terminal usage failure's delay.

    Tool output and assistant messages can quote errors, so only top-level
    failure events participate. Keep state in this process, not writable logs.
    A subsequent success or different error replaces an earlier usage error.
    """
    failure = None
    log = open(log_path, "a", encoding="utf-8") if log_path else sys.stderr
    try:
        output = CodexOutput(log)
        for line in sys.stdin:
            try:
                event = json.loads(line)
            except ValueError:
                output.detail("CLI diagnostic", line.rstrip())
                continue
            if not isinstance(event, dict):
                output.detail("CLI diagnostic", line.rstrip())
                continue
            output.event(event)
            kind = event.get("type")
            if kind == "turn.failed":
                failure = event.get("error")
            elif kind == "error":
                failure = event
            elif kind in ("turn.started", "turn.completed"):
                failure = None
    finally:
        if log_path:
            log.close()
    print(usage_retry_delay(failure, fallback), flush=True)


def launch(runner, args):
    script = Path(runner).resolve(strict=True)
    if script.name not in ("fix-review.sh", "implement-tasks.sh"):
        raise RuntimeError("Unknown runner")
    root = Path(subprocess.check_output(
        ["git", "-C", str(script.parent), "rev-parse", "--show-toplevel"],
        text=True).strip())
    if script.parent != root / "scripts":
        raise RuntimeError("Runner must be in the repository scripts directory")

    common_dir = Path(subprocess.check_output(
        ["git", "-C", str(root), "rev-parse", "--git-common-dir"],
        text=True).strip())
    lock_path = (root / common_dir).resolve() / "codex-runner.lock"
    # Keep the inode in place: unlinking it would let a new runner lock a
    # different file while the previous holder still owns this one.
    with lock_path.open("a+b") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError(
                f"Another task/review runner holds the repository lock: {lock_path}") from None
        return launch_locked(root, script, args, lock.fileno())


def launch_locked(root, script, args, lock_fd):
    # Acquire before snapshots, input checks, preflight, or branch preparation.
    baseline = inventory(root)
    script_bytes = script.read_bytes()
    body = script_bytes.split(BODY_MARKER, 1)[1]
    helper = (script.parent / "codex-runner.sh").read_bytes()
    checker = Path(__file__).read_bytes()
    task_parser = (script.parent / "markdown-tasks.py").read_bytes()
    # Reject a concurrent startup change rather than mixing wrapper versions.
    for name, data in ((script.name, script_bytes),
                       ("codex-runner.sh", helper), ("trusted-runner.py", checker),
                       ("markdown-tasks.py", task_parser)):
        if baseline.get("scripts/" + name) != [
                (script.parent / name).stat().st_mode, hashlib.sha256(data).hexdigest()]:
            raise RuntimeError("Control plane changed during startup")

    checker_fd = seal("wrapper-checker", checker)
    baseline_fd = seal("wrapper-baseline", json.dumps(baseline).encode())
    helper_fd = seal("wrapper-helper", helper)
    parser_fd = seal("wrapper-task-parser", task_parser)
    prefix = f"""set -Eeuo pipefail
readonly REPO_ROOT={shlex.quote(str(root))}
readonly WRAPPER_HELPER_FD={helper_fd}
readonly WRAPPER_CHECKER_FD={checker_fd}
markdown_tasks() {{ python3 -I /proc/self/fd/{parser_fd} "$@"; }}
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
            # Bash also holds the lock if the launcher is terminated while the
            # wrapper continues. Close descriptors; never explicitly LOCK_UN
            # the shared open file description while descendants may use it.
            pass_fds=(checker_fd, baseline_fd, helper_fd, parser_fd, runner_fd, lock_fd), env=env)
    finally:
        for fd in (checker_fd, baseline_fd, helper_fd, parser_fd, runner_fd):
            os.close(fd)


if __name__ == "__main__":
    try:
        if sys.argv[1] == "--check":
            check(Path(sys.argv[2]), sys.argv[3])
        elif sys.argv[1] == "--hold-evidence":
            hold_evidence(sys.argv[2:])
        elif sys.argv[1] == "--codex-events":
            watch_codex_events(int(sys.argv[2]), sys.argv[3] if len(sys.argv) > 3 else None)
        else:
            sys.exit(launch(sys.argv[1], sys.argv[2:]))
    except (OSError, ValueError, RuntimeError, IndexError, AttributeError) as error:
        print(f"ERROR: Trusted wrapper boundary failed: {error}", file=sys.stderr)
        sys.exit(1)

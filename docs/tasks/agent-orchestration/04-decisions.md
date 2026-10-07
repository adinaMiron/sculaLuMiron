# Agent orchestration decisions

## 2026-10-07 — Browser-compatible offline command execution

The reported review run stopped because Chromium crashed on Crashpad's
`setsockopt` call under `sandbox_workspace_write.network_access=false`, before
`wbstorefailure.js` could verify the existing fix. This was reproduced with a
local Unix socket pair; the unchecked-finding gate was behaving correctly.

The shared runner now uses command networking together with Codex's enforced
network proxy sandbox. Its complete proxy configuration supplies empty domain
and host Unix socket allowlists, disables upstream proxies, broad local access,
SOCKS, and unrestricted socket access, and binds the HTTP proxy on a dynamically
allocated loopback port. The proxy sandbox allows local socket operations while
blocking outbound destinations. Both settings are mandatory; enabling command
networking alone would allow external access. The
[official configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
documents that domain rules require the enabled proxy. No user option or
automatic fallback disables this enforcement. Strict CLI preflight validates the
proxy table before branch preparation, and approval escalation remains disabled.

`tests/runner-browser-sandbox.js` reads the actual helper configuration and uses
the installed CLI without a model call. It checks local Unix socket operations,
blocked direct host TCP/Unix sockets, rejected HTTP/HTTPS proxy requests, and a
real Playwright browser launch. Optional test paths reproduce repository browser
regressions under that configuration. The sandbox subcommand lacks the exec
command's ignore-user-config flag, so the probe uses an explicit permission
profile; execution preflight separately checks the real exec arguments. These
probes cover the reported incompatibility, not every pending confinement or
credential-isolation requirement.

Verified on `codex-cli 0.160.1` with installed Chrome: all sandbox probes and all
seven `wbstorefailure.js` cases passed, including quota/abort failures, reload
recovery, retry, and concurrent saves. The Markdown review checkbox remains for
the review runner's own verification/completion cycle. No model session, live
review run, remote Git operation, or publication was started for these checks.
The CLI preflight suite (including the installed CLI), 18 output cases, 33
usage-recovery cases, and 157 control-plane cases also passed. Bash/JavaScript
syntax and diff whitespace checks passed; the implementation, test, and
documentation diffs were inspected before completing the requirement.

## 2026-10-07 — Incomplete assignments are a separate failure

An agent can return successfully while leaving its assignment unchecked because
implementation or verification is blocked. Both runners compare that document
against the original text reconstructed from the sealed completion evidence.
An exact original match reports incomplete work and points to the logged agent
summary. Unauthorized document edits still report a validation violation, and
other checkbox changes are checked before reporting incomplete work. Both paths
stop before staging or publication and preserve useful partial edits. This does
not relax the agent sandbox or make blocked tests count as successful.

Offline cases in `tests/runner-output.js` cover unchanged documents with and
without partial implementation edits, document wording changes, and unrelated
checkbox changes in both runners. They check the error, retained blocker log,
preserved edits, and absence of staging, commits, pushes, or GitHub calls.

Verification passed: 18 output cases, 33 usage-recovery cases, and 157
control-plane cases, plus Bash/JavaScript syntax and diff whitespace checks.
The diagnostic change and documentation were inspected. The separate Markdown
finding remains unchecked: its original run could not launch Chromium in the
offline sandbox, and a browser run in this session fails `mdautosave.js`'s
immediate draft assertion because the current journal debounces writes by
700 ms. Neither that test nor Markdown implementation was changed here.

## 2026-10-07 — Concise progress and readable work logs

Both runners show the current assignment and log path, brief activity notices,
deduplicated edited-file names, validation/commit/push progress, and a short
completion or error notice. Agent summaries, source excerpts, command text,
command/test output, CLI stderr, and Git transfer output stay in the logs.
Codex events are decoded into timestamped sections with actual newlines,
rather than dumped as raw JSON. The final agent summary is preserved in full.

Logs are unique timestamped `.log` files in `automation-logs/` inside the
checkout's Git administrative directory, normally `.git/automation-logs/`.
The absolute path is printed when a log is created. Each finding/task gets its
own log; retries append attempt notices and details to that same log. Branch
preparation and the independent final review have separate logs. Linked
worktrees use their own administrative directory, obtained with
`git rev-parse --absolute-git-dir`. This keeps logs out of `git add -A` without
requiring ignore rules on the selected branch. Log creation fails before branch
preparation if storage is unavailable. Logs remain available after failure or
cancellation; they are local diagnostics, never evidence for retry decisions,
checkbox validation, or review verdicts.

Verification: `tests/runner-output.js` uses offline disposable repositories,
fake agents/remotes, and simulated waits to check terminal suppression,
readable multiline details, one log per assignment, retries, failures, log
creation errors, final-review evidence, linked worktrees, and clean commits.
All 10 output cases, 157 control-plane cases, 33 usage-recovery cases, 30
concurrent-lock probes, CLI preflight fixtures, and Markdown parser checks
passed. Bash/Python/JavaScript syntax and diff whitespace checks passed, and
the resulting change was inspected against the requirement. No model or
remote was contacted during verification.

## 2026-10-07 — Explicit model and reasoning effort

Both runners accept optional `CODEX_MODEL` and `CODEX_EFFORT` environment
variables, matching the existing environment-based configuration. The shared
helper validates model identifier syntax and known effort names before Codex
invocation or Git mutation, then adds `--model` and the
`model_reasoning_effort` configuration override as separate array arguments.
Preflight, task/finding execution, retries, and final review use the same array.
Each script also exposes editable `DEFAULT_CODEX_MODEL` and
`DEFAULT_CODEX_EFFORT` settings near its top. Unset environment variables use
these script defaults; supplied values override them, including explicit empty
values that omit the respective CLI override. The shipped defaults are empty,
preserving CLI/model defaults. Both sources use the same shared validation.
User/project configuration remains ignored and execution restrictions remain
in effect. Help is available in both scripts without starting Codex.

Model IDs and model/effort pairings are not hardcoded: account availability and
support change, and the CLI/provider remains responsible for those checks.
Empty-input preflight validates configuration syntax, not remote model access
or every model/effort pairing. No model request is made by the tests.

Verification uses `tests/runner-cli-preflight.js` (including `--real-codex`)
and `tests/runner-usage-limits.js`. Disposable review fixtures pin their own
document/branch so changing the live review target cannot break regression
coverage.

## 2026-10-06 — Automatic usage-limit recovery

The task, finding, and final-review invocations use the shared usage-limit retry
loop. CLI preflight remains a single empty-input invocation before Git mutation;
it also validates JSON event support and the fallback interval configuration.
The CLI's [JSON event stream](https://learn.chatgpt.com/docs/non-interactive-mode)
provides top-level failure events. Only explicit usage exhaustion in those
events qualifies for retry; quoted tool/assistant output, generic HTTP 429,
billing/authentication errors, signal exits, and other failures do not.

The event parser is part of the kernel-sealed checker. Concise progress streams
live to stderr and detailed diagnostics go to the work log. The retry decision
travels through pipes and process memory, never through a writable log.
Recognized future reset timestamps or durations
receive a five-second buffer. Human-readable times use the CLI's local timezone;
time-only values can refer to the next day. Missing/stale/unrecognized times
use the positive `CODEX_USAGE_RETRY_SECONDS` interval (default 300 seconds).
Usage failures retry without a count limit; ordinary failures and validation
violations stop immediately. These waits are not a durable job scheduler.

The same running wrapper retains the lock and sealed evidence throughout the
wait. Git state, assigned-document text (original or completed checkbox), other
checkboxes, and the control plane are checked before waiting and again before
retrying. Final review requires a clean tree and clears its output before every
attempt so a stale PASS cannot authorize publication. Partial task edits are
preserved. A new ephemeral invocation receives the original assignment plus a
continuation instruction; no persisted Codex conversation is resumed and no new
task is selected. The successful attempt still goes through all normal checks
before committing or publishing. Retries do not advance per-run item counters.

Ctrl+C or SIGTERM during the wait cancels and reaps the sleeper, then normal
wrapper cleanup releases evidence and the repository lock. Stopping the process
requires manual reconciliation of partial edits before a new run, as before.
General hostile-process confinement and process-tree resource limits remain
separate requirements. Offline regression coverage is in
`tests/runner-usage-limits.js`; no real limit or paid model session is needed.

Verified with 33 offline recovery cases plus parser/timezone checks, all 157
control-plane regression cases, 30 lock probes, Markdown parser tests, and
repository JavaScript checks. CLI preflight passed against installed
`codex-cli 0.160.1` using empty stdin only; invalid fallback settings are rejected
before model invocation or Git mutation. Bash/JavaScript syntax and diff
whitespace checks also passed. The completed diff was inspected for scope and
preservation of existing validation gates.

## 2026-10-06 — Immutable running wrappers and control-plane checks

Both runner entrypoints immediately replace themselves with
`scripts/trusted-runner.py`, before launching any agent. The launcher requires
Linux, Python 3 with `memfd_create`/file-sealing support, and `/proc/self/fd`.
Unsupported platforms fail before a model invocation or Git mutation.

The launcher copies the selected runner, shared Codex helper, integrity checker,
Markdown task parser, and control-plane inventory into kernel-sealed anonymous
files. Bash executes and sources only these files for the entire run. Write, truncate, grow, and
seal-removal attempts cannot alter them, including from a process with the same
UID. Ordinary permissions or files in `/tmp` would not provide that boundary.
Python runs in isolated mode so repository modules and `PYTHONPATH` cannot
replace checker imports.

The protected workspace paths are `scripts/`, `.github/`, `.githooks/`,
`.gitattributes`, and `.gitmodules`. The inventory includes content hashes,
file types, permission modes, directory entries, and symlink targets. It includes
untracked and ignored files; traversal does not follow symlink directories.
Every agent return (including errors and final review) and every host Git/GitHub
command checks these paths against the sealed startup inventory. Rejected
changes remain unstaged for inspection. Branch preparation also rejects a
target branch whose control plane differs from the startup version.

Control-plane maintenance must be a separate human-reviewed change outside the
automated task/review loop. Start a runner only from a trusted, reviewed checkout
using trusted host executables. After rejection, inspect the preserved changes
before invoking any workspace script again; a rejected workspace is not a
trusted source for a new bootstrap. The immutable snapshot lasts for one run,
not as a persistent installation or attestation of arbitrary future checkouts.

This fixes `protect-wrapper-code`; it does not complete the separate findings
for process confinement or resource/process lifetime limits. Concurrent runner
locking is recorded below.
Checkbox evidence protection is recorded below. These integrity checks do not
establish isolation from an unsandboxed hostile process that can change
files concurrently, modify host tools/Git metadata, or interfere with the host
process. The installed agent boundary must still confine such access.

Verification: `node tests/runner-control-plane.js` uses disposable local Git
repositories, fake model/GitHub adapters, and inert fetch/push commands. It
checks actual kernel seals, script overwrite/replacement, checker/helper edits,
deletion, mode changes, symlinks, ignored additions, workflow changes, failed
agent returns, final-review rejection, unavailable sealing support, branch
control-plane drift, and ordinary successful publication flow.
It does not contact a remote or start a paid model session.

## 2026-10-06 — Sealed per-item validation evidence

Both runners seal their expected document and other-document checkbox manifest
before invoking the agent. Input streams go directly into anonymous files; no
expected or actual evidence is stored in an agent-writable temporary directory.
The manifest is captured synchronously in a shell variable so inventory errors
stop validation, then passed into the sealed holder or comparison.

The existing sealed checker runs as a per-item holder, sealing all evidence
before reporting `/proc/<pid>/fd/<fd>` paths to the wrapper. Those paths have no
replaceable filesystem directory entry. The holder accepts no update commands
and keeps the sealed files alive until the wrapper closes its private pipe.
The wrapper reaps it after validation and on failure; each iteration receives
fresh evidence. Missing evidence or unsuccessful holder termination blocks
staging and publication. This uses the existing Linux/Python sealing boundary
and does not add a permission-based trust assumption.

The offline control-plane suite probes the actual evidence as the same UID,
including chmod followed by writes, truncation, growth, writable mmap, seal
changes, and replacement. It covers both expected documents and nonempty/empty
manifests, altered document/manifest rejection, holder termination, evidence
sealing failure before the agent starts, cleanup, and consecutive items.
These checks establish evidence immutability, not general process confinement
or protection from an unsandboxed process modifying host memory/tools.

## 2026-10-06 — Repository-wide checkbox scope

Both per-item runners use the same manifest of executable checkboxes across
`docs/tasks/` and `docs/reviews/`, excluding only the assigned document, which is
still compared in full. The live trees are inventoried on each side of the agent
invocation, so newly created, deleted, or moved checklists cannot escape through
a tracked-file-only list or a selected-module boundary. A documentation tree may
be absent; its later creation contributes any executable items to the manifest.
Checkbox-free documents and fenced examples remain editable outside the assigned
document. Task selection and dependency validation remain module-local.

The offline runner tests cover unrelated completion/reopening, new pending and
completed items, document/directory creation and deletion, moves, allowed notes,
and normal completion. Rejections leave changes unstaged and block commit, push,
and PR creation for the iteration.

## 2026-10-06 — Exclusive repository runner lock

The shared trusted launcher acquires a nonblocking exclusive `flock` on
`codex-runner.lock` in `git rev-parse --git-common-dir` before taking its
control-plane snapshot or starting the Bash wrapper. Task and review runners,
including invocations from linked worktrees, therefore share one lock. A busy
lock reports an error and exits without validation, agent invocation, branch
preparation, or publication. Lock creation/acquisition errors fail closed.

The launcher and Bash wrapper retain the descriptor through the entire run,
including final review, push, and PR creation. Inheriting the descriptor keeps
the lock held if the launcher exits while the wrapper or its descendants still
run. The kernel releases the lock when all holders exit, including on failure;
the file is intentionally never removed, avoiding a replacement-inode race.
Its presence alone does not indicate an active run, and it must not be deleted
to bypass contention. A surviving descendant may continue to hold the lock.

This is cooperative exclusion between runners, not confinement of arbitrary
processes or protection against manual Git operations. The separate process
confinement and lifetime requirements still apply.

Verification: `node tests/runner-lock.js` exercises all task/review pairings at
preflight, fetch, agent, staging, push, final review, and PR gates, checks linked
worktree contention, and verifies release after success, failures, and launcher
termination. Disposable repositories use fake model/GitHub adapters and inert
fetch/push commands; no remote service or model session is contacted.

## 2026-10-06 — Final review message and verdict contract

The task runner uses Codex's `--output-last-message` file in the worktree's Git
administrative directory as the final review evidence. Console output is not
parsed for verdicts. Startup preflight checks the output option with empty
stdin; each review clears the previous file before invoking the reviewer.

The final message must contain exactly one `VERDICT:` marker, on its last
nonblank line, exactly `VERDICT: PASS` or `VERDICT: FAIL`, outside Markdown
fences. Quoted examples and additional markers are rejected conservatively.
Trailing blank lines and CRLF are allowed. Missing/unreadable output, invalid
verdicts, FAIL, and reviewer errors stop the final push and PR path. This gate
does not retroactively validate per-task pushes that occurred before review.

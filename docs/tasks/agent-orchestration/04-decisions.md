# Agent orchestration decisions

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

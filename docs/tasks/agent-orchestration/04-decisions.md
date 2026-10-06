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
for process confinement, concurrent runners, or resource/process lifetime limits.
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

Both runners now seal their expected document before invoking the agent. The
implementation runner also seals the other-document checkbox manifest. Input
streams go directly into anonymous files; no expected or actual evidence is
stored in an agent-writable temporary directory. The actual manifest is streamed
into the comparison after the agent returns.

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

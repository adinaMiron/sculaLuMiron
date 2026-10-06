# Agent orchestration decisions

## 2026-10-06 — Immutable running wrappers and control-plane checks

Both runner entrypoints immediately replace themselves with
`scripts/trusted-runner.py`, before launching any agent. The launcher requires
Linux, Python 3 with `memfd_create`/file-sealing support, and `/proc/self/fd`.
Unsupported platforms fail before a model invocation or Git mutation.

The launcher copies the selected runner, shared Codex helper, integrity checker,
and control-plane inventory into kernel-sealed anonymous files. Bash executes
and sources only these files for the entire run. Write, truncate, grow, and
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
for agent-writable checkbox evidence, process confinement, concurrent runners,
or resource/process lifetime limits. In particular, these integrity checks do
not establish isolation from an unsandboxed hostile process that can change
files concurrently, modify host tools/Git metadata, or interfere with the host
process. The installed agent boundary must still confine such access.

Verification: `node tests/runner-control-plane.js` uses disposable local Git
repositories, fake model/GitHub adapters, and inert fetch/push commands. It
checks actual kernel seals, script overwrite/replacement, checker/helper edits,
deletion, mode changes, symlinks, ignored additions, workflow changes, failed
agent returns, final-review rejection, unavailable sealing support, branch
control-plane drift, and ordinary successful publication flow.
It does not contact a remote or start a paid model session.

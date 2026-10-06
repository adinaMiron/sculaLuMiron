# Agent Orchestration Review

Date: 2026-10-06
Module: agent-orchestration
Reviewed branch: main
Reviewed commit: 1d633a678e07b2a49a4f03c5c28ce644abcb5da0
Scope: `AGENTS.md`, `docs/reviews/README.md`, `docs/tasks/README.md`,
`scripts/fix-review.sh`, `scripts/implement-tasks.sh`.

## Result

The documentation broadly agrees on checkbox authoring, one assigned item per
invocation, verified completion, and wrapper-owned Git history. The runners do
not yet justify the requested safety assurance. Both fail to launch the installed
Codex CLI, and their validation and isolation have the defects below.

This is a review, not a security certification. Unchecked findings have not been
corrected; only the README wording defect was fixed and inspected. No runner was executed end to end, no model session
was launched, and no commit, push, branch change, or PR was made during this review.

The stricter provider-only communication and isolation requirements requested in
this review are recorded separately in
`docs/tasks/agent-orchestration/01-requirements.md`. They extend the existing
policy, which permits wrapper Git/GitHub traffic and speaks only of the configured
model provider. Neither runner implements an Anthropic/Claude execution path.

## Findings

- [ ] [ID:runner-cli-preflight] **P1 — Both runners use an unsupported CLI argument position and discover this after Git side effects.** `fix-review.sh:86-111` and `implement-tasks.sh:335-360` construct `codex exec ... --ask-for-approval never`. With installed `codex-cli 0.160.0`, `codex exec --ask-for-approval never --help` exits 2 with `unexpected argument '--ask-for-approval'`. The approval option belongs before `exec`, or can be supplied through supported configuration. Validate the complete supported CLI/configuration contract before fetching, switching branches, fast-forwarding, or pushing; fixing only this flag is not proof that all feature overrides work.

- [ ] [ID:protect-wrapper-code] **P1 — Agent-writable orchestration files cross into the trusted wrapper boundary.** Both runners allow workspace writes, including `scripts/`, and later stage everything with `git add -A` (`fix-review.sh:274`, `implement-tasks.sh:552`). They neither protect nor reject changes to their own executable scripts. Agent-controlled wrapper edits can be committed and executed with host privileges on subsequent invocations; executing a shell script from a mutable file also leaves its unread contents exposed during the current run. Run orchestration from an immutable trusted location and reject agent changes to the control plane before any host-side execution or publication. Verify attempted script replacement in an isolated fixture.

- [ ] [ID:protect-validation-state] **P1 — Expected checkbox state is stored in temporary storage writable by the agent.** `fix-review.sh:161,194-195,253` and `implement-tasks.sh:410,446-448,524-531` place expected documents/manifests in ordinary `mktemp -d` directories, then compare against them after the agent returns. The default workspace-write sandbox includes temporary directories, and the parent and child run as the same user; directory mode 0700 does not separate them. Isolate validation evidence from agent writes and verify that attempts to modify expected documents/manifests fail. This is a trust-boundary defect identified by inspection, not a demonstrated sandbox escape.

- [ ] [ID:markdown-task-parser] **P2 — Markdown examples are executable tasks, and the two runners disagree on indentation.** `implement-tasks.sh:72-92,145-182,233-249` scans raw checkbox-looking lines in every Markdown file, including fenced examples. `fix-review.sh:41,177` does the same for column-zero lines but ignores indented task items. A local fixture containing one fenced example followed by one real task was counted as two tasks and selected the example first. Use one documented Markdown task grammar for counting, selection, dependency validation, and manifests; exclude fenced examples and define supported indentation consistently. The documentation explicitly distinguishes examples from executable work.

- [ ] [ID:checkbox-scope] **P2 — Unassigned checkbox changes outside the selected document/module are not checked.** The review runner compares only its selected review file (`fix-review.sh:253-260`); the task runner's other-checkbox manifest covers only `TASKS_ROOT` (`implement-tasks.sh:82-98,529-533`). An invocation can change a different review or module checklist and still reach `git add -A`. Enforce the one-assigned-item rule across task and review documents, including newly added/deleted documents, with tests showing that unrelated transitions and new tasks are rejected.

- [ ] [ID:metadata-validation] **P2 — Duplicate metadata tags and empty trailing dependencies are accepted.** `implement-tasks.sh:54-61,145-204` extracts the last matching tag and relies on Bash comma splitting. Local probes accepted both `- [ ] [ID:a] [ID:b] Duplicate metadata.` and a task with `[DEPENDS:a,]` when `a` existed. Reject repeated ID/DEPENDS tags and malformed dependency lists before selecting work. Preserve the existing successful duplicate-ID-across-tasks, unknown-reference, and cycle checks.

- [ ] [ID:input-errors-fail-closed] **P1 — Input read failures can be interpreted as completion.** `fix-review.sh:41` suppresses every grep error with `|| true`; `implement-tasks.sh:76-78` suppresses grep errors and does not propagate failure from the `find` process substitution. In addition, inputs are checked before branch switching rather than reliably revalidated on the selected branch. A missing/unreadable review file or missing module directory can yield an empty/zero count, leading to completion and push/PR logic. Distinguish zero matches from errors and validate selected-branch inputs before processing. Test deletion, unreadable input, and a module absent on an existing target branch.

- [ ] [ID:protect-base-branch] **P1 — Task branch overrides can target the base branch.** `implement-tasks.sh:288-301,380-408` accepts `TASK_BRANCH=main` with `BASE=main`. No check rejects the equality; the wrapper can switch to main and later commit and push there. Validate branch names and reject base/protected branch destinations before any Git mutation. Add a fixture proving that the invalid configuration exits before fetch/switch/push.

- [ ] [ID:exclusive-runner-lock] **P1 — Concurrent runners can race over one working tree and index.** Neither script takes a repository-wide lock before selecting a branch or invoking an agent. Clean-tree checks are snapshots, so two processes can pass them together, change branches underneath each other, or stage each other's output via `git add -A`. Hold a common exclusive lock for the full run, including branch preparation and publishing, and test concurrent task/review invocations without contacting a remote service.

- [ ] [ID:final-review-worktree-path] **P2 — Final review output assumes `.git` is a directory.** `implement-tasks.sh:585,619` writes to `$REPO_ROOT/.git/codex-task-final-review-$MODULE.txt`. In a linked Git worktree, `.git` is a file, so `tee` fails and final review cannot complete after task commits have already been pushed. Resolve a suitable Git administrative path or use trusted private output storage; cover an ordinary checkout and linked worktree.

- [ ] [ID:final-verdict-contract] **P2 — Final review accepts a PASS line that is not the final verdict.** `implement-tasks.sh:610-630` requests a verdict at the very end, but accepts any exact `VERDICT: PASS` line anywhere in captured stdout unless an exact FAIL line also appears. An answer quoting PASS as an example and ending without a valid verdict passes this check. Capture the final assistant message through the supported CLI output mechanism and validate one unambiguous final verdict. Test missing, contradictory, quoted, and non-final verdicts.

- [ ] [ID:mandatory-final-review] **P2 — PR creation can bypass the documented final review gate.** `implement-tasks.sh:294,301,582,639` permits `FINAL_REVIEW=false` together with `CREATE_PR=true`, despite `docs/tasks/README.md:379` requiring a successful final review before PR creation. Its PR body also claims an independent review ran even when skipped. Make bypass behavior agree with the documented gate and ensure generated PR text describes actual verification.

- [ ] [ID:review-finding-text] **P3 — Review finding extraction does not remove the checkbox prefix.** In `fix-review.sh:181`, `${original_line#- [ ] }` treats brackets as a shell pattern, rather than literal Markdown. The local probe returned `- [ ] Fix an issue.` unchanged. Use literal prefix removal, reject empty finding text, and verify that generated commit subjects contain the finding text without its checkbox marker.

- [x] [ID:defect-scope-wording] **P3 — The review README reversed its new-scope condition.** `docs/reviews/README.md:148-150` asked “Was this behavior never required?” and then said “If no, it is new scope.” Changed the answer to yes and inspected it against section 5 and `AGENTS.md` section 13. This documentation-only correction requires no runtime test.

## Verification performed

- Both scripts passed `bash -n` syntax checks.
- Installed CLI version and local help were inspected; the unsupported argument
  position was reproduced without a model request.
- Function definitions from the task runner, stopping before argument handling
  and Git operations, were evaluated against temporary local Markdown fixtures.
  Fenced-example selection and malformed metadata acceptance were reproduced.
- Dependency cycles and unknown references correctly failed; a dependency-ready
  prerequisite was selected ahead of an earlier dependent task.
- The review finding prefix expression was evaluated in Bash and reproduced the
  unchanged prefix.
- Git status was initially clean. ShellCheck was not installed. Real network
  denial, hostile subprocess isolation, integration configuration, credentials,
  and remote publishing were not dynamically exercised.

## Safety assessment and policy alignment

The Git prohibition in `AGENTS.md` section 14 is explicit. The scripts also check
HEAD, branch, and index after each agent. Those checks detect some violations after
they happen; they are not a complete prevention mechanism. Codex documents
read-only protection of workspace `.git` paths, including resolved worktree Git
directories, under its workspace-write policy. This review found no demonstrated
direct bypass of that protection. It does not establish that every installed
harness/version or tool integration enforces the same boundary.
[Official approval and sandbox documentation](https://learn.chatgpt.com/docs/agent-approvals-security).

Shell network denial does not by itself restrict the harness's model transport or
prove that all integrations are disabled. Provider endpoints and MCP servers have
separate configuration, and these scripts do not verify the effective provider,
endpoint, or complete tool set before running.
[Official configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

`AGENTS.md` section 15 allows explicitly authorized external actions, whereas the
runner prompts prohibit agent networking. The stricter requested policy needs an
explicit automation-specific rule that cannot be relaxed by task text, skills, or
an agent approval request. Model-provider access belongs to the trusted harness;
it is not permission for agent shell commands to call provider APIs themselves.

Both scripts intentionally fetch and push Git remotes and optionally call GitHub.
`CREATE_PR=false` does not prevent fetch or push. The wrapper fast-forwards feature
branches but does not merge PRs into main. Interpreting “only OpenAI or Anthropic”
as a restriction on the entire workflow would conflict with remote Git and PR
operations; the companion requirements describe a provider-only mode separately
from an explicitly enabled wrapper remote mode.

The wrappers trust agents to run relevant tests. They perform whitespace and
checkbox validation, not independent verification of test results. Both publish
per-item changes before any module-level review; the review-fix runner has no
independent final review. That publication order matches the current README
workflow but cannot support a claim that every published change has passed
independent review. Pushes may trigger repository CI or deployment automation.

All three instruction documents already require actionable work to use `- [ ]`,
reserve `[x]` for verified completion, and keep ideas/questions in ordinary prose.
Neither script can determine whether arbitrary prose contains an omitted
requirement. Correct authoring still requires review; a checkbox parser alone
cannot enforce semantic completeness.

No wording change or sandbox configuration can guarantee that generated code
will never harm anyone. Relevant risks include incorrect code, readable secrets
being included in model context, local data loss within writable roots, resource
exhaustion, and publication-triggered automation. The new requirements make these
boundaries explicit and testable without claiming absolute safety.

# Agent Orchestration Safety Requirements

These requirements capture the stricter safety boundaries requested on
2026-10-06. They supplement the existing workflow. They are not implemented or
verified merely because they are documented here.

Existing defects are recorded separately in
`docs/reviews/2026-10-06-agent-orchestration-review.md`.

## Agent execution boundary

- [ ] [ID:agent-confinement] Run agent commands and their descendants inside an independently enforced boundary that denies network access, prevents writes to the trusted repository's Git metadata and orchestration/validation state, and exposes only the intended working files and disposable scratch storage for writing. Verify direct Git operations, direct metadata writes, subprocesses, alternate executables, and symlink/worktree paths using disposable fixtures; stop before invoking a model if the boundary cannot be established.

- [ ] [ID:provider-only-transport] Restrict trusted model transport to explicitly configured OpenAI or Anthropic endpoints using enforced egress controls, while keeping agent-executed code entirely offline. Reject unapproved providers, endpoint overrides, proxy/redirect escapes, and enabled web/MCP/app/plugin integrations before starting a run. Provider credentials must remain outside the agent execution environment. Supporting one approved provider is sufficient; do not advertise Anthropic execution until an independently tested adapter exists.

- [ ] [ID:secret-read-isolation] Prevent agent access to host credential files, unrelated home directories, credential sockets, and inherited secrets, including through subprocess environment and filesystem reads. Use a dedicated minimal execution environment and verify isolation with synthetic secret fixtures rather than real credentials. Document that intended repository content can be sent to the selected model provider.

- [ ] [ID:bounded-execution] Apply configurable wall-clock, process, memory, disk, and provider-spend limits to unattended runs; terminate the entire agent process tree when a limit is reached and preserve diagnostic output without completing or publishing the assigned item.

## Wrapper communication and documentation

- [ ] [ID:explicit-remote-mode] Provide a mode in which the entire workflow has no external communication except approved model transport, with no fetch, push, or GitHub calls. Keep remote Git/PR operations in an explicit separate wrapper mode with documented destinations and privileges. In both modes, only the trusted local wrapper may mutate the trusted repository's Git history; agents may not commit, merge, push, or obtain permission to do so.

- [ ] [ID:aligned-safety-contract] Align `AGENTS.md`, both documentation READMEs, runner prompts, and runtime checks with these execution and communication boundaries. State that task text and agent approval requests cannot loosen automation restrictions, distinguish tested enforcement from behavioral instructions, and retain `- [ ]` for every accepted independently actionable task/requirement/feature behavior/review finding, with `[x]` reserved for inspected and verified completion.

## Usage-limit recovery

- [x] [ID:usage-limit-recovery] Automatically wait and retry the same task, finding, or final review after a Codex usage-limit failure. Honor a reported reset time with a conservative fallback interval, preserve partial work and original validation evidence, retain the repository lock, support cancellation, and stop on unrelated failures or validation violations. Verify recovery and rejection paths using offline fake agents and clocks.

## Incomplete-assignment recovery

- [x] [ID:incomplete-assignment-recovery] Give both runners a configurable, bounded number of automatic repair invocations when a successful agent exit leaves the assigned item unchecked. Supply the original assignment and diagnostic log, preserve partial work, the repository lock, and original sealed evidence, and revalidate before retrying. Keep usage-limit retries separate; reject integrity violations and ordinary CLI failures immediately, and stop without publication when repairs are exhausted. Verify success, exhaustion, disabled recovery, and rejection paths using offline fixtures.

- [x] [ID:repair-test-guidance] Align repository instructions and both runner prompts so agents diagnose and repair implementation defects and demonstrably incorrect tests within their assigned scope, rerun relevant checks, and document why an assertion changed. Keep completion conditional on passing verification; do not permit skipped tests, weakened behavior, or unrelated fixes to manufacture success.

## Browser-test compatibility

- [x] [ID:offline-browser-tests] Allow installed Chromium/Playwright tests to run in the shared runner sandbox without enabling external traffic or host socket access. Verify real browser startup and denied direct/proxied connections with local fixtures, retain strict configuration preflight and completion gates, and document the supported sandbox configuration.

## Runner output

- [x] [ID:incomplete-assignment-diagnostic] Distinguish an unchanged assigned document left unchecked from unauthorized document changes when an agent returns successfully. Stop without staging, committing, or publishing incomplete work, preserve partial edits and the agent's logged blocker, and retain rejection of unrelated checkbox changes. Verify both runners with offline fixtures.

- [x] [ID:readable-runner-output] Show concise assignment, activity, edited-file, completion/failure, and log-location notices in both runners, without raw event JSON, source excerpts, edit instructions, or command output in normal terminal progress. Preserve detailed, readable per-task/per-finding logs and a separate final-review log, append retries to the same assignment log, keep logs out of commits, and retain all existing validation and retry gates. Verify using offline disposable fixtures.

## Model selection

- [x] [ID:openai-model-selection] Let users select an OpenAI model through `CODEX_MODEL` in both runners. Apply it to preflight, task/finding execution, retries, and final review; preserve CLI defaults when unset and reject malformed model identifiers before Codex invocation or Git mutation.

- [x] [ID:reasoning-effort-selection] Let users select reasoning effort through `CODEX_EFFORT` in both runners. Apply it to all Codex invocations, preserve the selected model's default when unset, document model-dependent support, and reject invalid effort values before Codex invocation or Git mutation.

- [x] [ID:script-model-defaults] Provide editable model and effort defaults in both scripts' configuration sections. Environment values take precedence, including explicit empty values that restore CLI/model defaults; validate script defaults through the existing shared runner checks.

## Validation approach

Use offline disposable repositories and fake model/GitHub adapters for normal
runner integration tests. Test real platform isolation separately with synthetic
files and a controlled local network listener. Mocked CLI arguments alone are
not evidence of operating-system enforcement. No test should contact a production
remote, expose real credentials, or launch a paid model session implicitly.

The existing per-item push policy and independent final review have different
purposes. Remote mode needs an explicit documented publication policy; a final
review after pushing cannot retroactively validate earlier publication.

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

## Validation approach

Use offline disposable repositories and fake model/GitHub adapters for normal
runner integration tests. Test real platform isolation separately with synthetic
files and a controlled local network listener. Mocked CLI arguments alone are
not evidence of operating-system enforcement. No test should contact a production
remote, expose real credentials, or launch a paid model session implicitly.

The existing per-item push policy and independent final review have different
purposes. Remote mode needs an explicit documented publication policy; a final
review after pushing cannot retroactively validate earlier publication.

# Maintaining agent workflows

Read this when changing agent tooling or connecting a new harness, not at every
prompt. The [dated research note](history.md) explains the evidence behind it.
For first-time harness setup, use [onboarding](onboarding.md).
Local tools use Python 3.9+ and Node (the existing tests use Node 22 in CI).
Playwright is needed only for browser/spec tests, from the existing dev packages.

## Layers and ownership

| Layer | Canonical location | Load/use when |
|---|---|---|
| Always-needed rules | `AGENTS.md` | Each session; keep small |
| Claude entry point | `CLAUDE.md` importing `@AGENTS.md` | Claude loads shared rules once |
| Conditional task rules | `docs/agents/task-policy.md` | MD assignments, planning, reviews, automation |
| Code/docs/tests router | `scripts/agent-context.py` | Unfamiliar area; prints a short routing card |
| Project contracts | `docs/agents/project-guide.md` | Affected feature only |
| Reusable procedures | `.claude/skills/<name>/SKILL.md` | Matching workflow only |
| Deterministic operations | `scripts/` | Execute without reading implementation every time |
| Local evidence | `test-results/agent/run-*/` | Read selected logs on failure; Git-ignored |

Skills deliberately use standard Markdown + YAML and repository commands.
`.claude/skills/` is the source requested by the owner; `.agents/skills/<name>`
links to each source so Codex discovers the same content. Other harnesses can
read those SKILL.md files directly or register that directory. No model or
provider is required by the workflows. Claude commands are thin aliases:
`/context`, `/apptest`, `/verify`; other harnesses run their documented commands.

To add a skill: use lowercase kebab-case directory/name, YAML `name` and
`description` (when to use it), concise steps and expected output. Keep
non-obvious invariants and links, omit generic coding advice. Reuse current
fixtures/scripts. Run `python3 scripts/setup-agent-links.py --write` to expose
new skills; it validates all targets first and refuses to overwrite any existing
configuration. `--check` is read-only. Relative links survive clone/worktree
relocation. Systems without symlink support can read the sources directly or
manually register them; do not maintain divergent copies.

## Hooks

`scripts/agent-hook.py` accepts a JSON object on stdin:

```json
{"hook_event_name":"PreToolUse","tool_name":"Read","cwd":"/path/to/repo","tool_input":{"file_path":"index.html"}}
```

It returns nothing for ordinary success. A targeted problem returns JSON
`hookSpecificOutput` with the event and concise feedback; pre-tool denial uses
`permissionDecision: deny`, post-edit failure uses `decision: block`/`reason`.
Invalid JSON or an unavailable checker returns nonzero diagnostic output.
Exit 1 is a hook error, not a guaranteed blocked tool in every harness.

- **PreToolUse:** rejects an unbounded Read or unambiguous plain `cat` of a
  repository HTML/JS/MD file over 24,000 bytes. Locate first, then supply
  offset/limit or `sed -n 'START,ENDp'`. Explicit bounds are respected, including
  a large range when the user actually needs it. Commands are never rewritten,
  evaluated or auto-approved. General shell pipelines are not parsed/blocked.
- **PostToolUse:** Edit/Write/MultiEdit file_path or apply_patch file markers
  select only edited HTML/JS. Each classic inline script is parsed independently;
  external scripts/data script tags are skipped. Application scripts are classic,
  not ES modules. Quiet success; bounded syntax feedback on failure. It cannot
  undo the edit. Shell-based edits need an explicit syntax/verify command.
- No model calls, installs, networking, Git mutation or full suite per edit.
  A hook is a convenience check, not a sandbox or universal security boundary.

Claude configuration is `.claude/settings.json`. Codex configuration lives in
`docs/agents/codex-hooks.json`, linked from `.codex/hooks.json`; both call the
same script. The legacy Claude shell hook delegates to it as well.

After installation, restart/reload the relevant harness. Codex requires a trusted
project and trust review of new/changed hooks through `/hooks`; configuration
files alone do not grant that trust. Do not bypass hook trust or change personal
permissions. The unattended Codex wrappers deliberately use their own restricted
configuration; these interactive hooks are not their enforcement mechanism.

Another harness can invoke `python3 /path/to/repo/scripts/agent-hook.py`, translate
its tool event to the JSON above, and honor the returned decision. If it has no
hooks, retain bounded reads and run `node scripts/check-source.js <files>` and
`node tests/verify.js` explicitly. No hook-capable harness is required to work here.

Schemas checked against [Claude hooks](https://code.claude.com/docs/en/hooks),
[Claude imports](https://code.claude.com/docs/en/memory),
[Claude skills](https://code.claude.com/docs/en/skills),
[Codex hooks](https://learn.chatgpt.com/docs/hooks) and
[Codex skills](https://learn.chatgpt.com/docs/skills). Native activation can vary
by installed version; fixture validation does not claim an interactive session
was launched. Installed CLI during research: codex-cli 0.161.0.

## Test runner contract

`scripts/run-tests.py` runs existing suites via argv arrays, never shell eval.
Standalone Node/Python suites run from tests/; specs run from repository root with their
own config or the root's explicit testMatch inventory. `--grep`/`--list` apply
only to specs. Reporter override prevents `--list` from replacing JSON evidence.
Zero passing spec cases is incomplete, not success. Full logs include argv/cwd
and stdout/stderr; default output is status, path and a bounded failure tail.

Python suites use explicit `.py` filenames and the runner's Python interpreter;
for example `python3 scripts/run-tests.py agent-tools.py verify`. Python checks
and the known static `verify.js` suite skip browser discovery. Other JavaScript
suites retain discovery; `--doctor` explicitly requests it. `--grep`/`--list`
remain spec-only. Python browser setup, if ever needed, belongs to that suite.

Options: named suites, `--preset header|dictation|verify`, `--doctor`,
`--discover`, `--grep`, `--list`, `--timeout` (default 240 seconds per suite),
`--budget` (900 seconds per run), `--verbose`. Explicit PW_CHROME_PATH wins over
browser discovery. No implicit full-suite run or package installation.
`--discover` is a coverage aid, not an automatic selector. A spec overriding
launchOptions can still require its own browser; inspect a launch failure once.

Exit codes: 0 complete pass/list/discovery; 1 failed/timed out/incomplete;
2 invalid selection or setup error; 3 browser doctor blocked; 130 interrupted.
POSIX timeouts/cancellation terminate the process group, including descendants;
on non-POSIX hosts only direct-child termination is provided. Use the harness's
process isolation for stronger limits. Historical KNOWN failures never exit zero.
The legacy `.ai-team/scripts/run_suites.py` delegates here and preserves its
argument aliases; its historical success-on-known-failure behavior is removed.

## Verification and growth

Run `python3 scripts/run-tests.py agent-tools.py verify` and
`python3 scripts/setup-agent-links.py --check`. Changes to task parsing or trusted
runners also require their own regressions; don't launch live wrappers as tests.
The existing unattended wrappers remain Codex-specific. Cross-provider unattended
execution needs a tested adapter and the separately documented safety work.

Promote verified repetition, not hypothetical workflows. Keep new task details
with the task, route long reference sections by symbols/headings, and put
deterministic checks in scripts. Don't auto-read every linked doc/skill at startup,
duplicate policy into each harness, install dependencies in hooks, or spin up
agents to save the cost of a tiny command. Measure instruction bytes/words and
observed repeated work; don't promise exact token savings without measurement.

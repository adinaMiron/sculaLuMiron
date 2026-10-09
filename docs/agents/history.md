# Evidence behind the workflow changes

Inspected 2026-10-09 at `a5a256c`, with a clean starting tree. This is a dated
research note, not instructions to load every session or a current failure list.

Sources: chronological/recent Git history; path histories for scripts and agent
instructions; task/review conventions and orchestration decisions; September
retrospective and team notes; project architecture docs; representative app,
Markdown/audio, test-helper, parser and runner source. No private shell history
was available: command frequency below is inferred from checked-in workflows.

| Evidence | Reusable response |
|---|---|
| Initial plain HTML apps (August); later ordered Markdown scripts and shared audio helpers | Preserve file://, classic script order and zero app build step; route by module |
| Historical path touches: FEATURES 119, index.html 114, MAP 112, tests README 86, CLAUDE 79 | Keep an inexpensive router; load individual sections instead of entire docs |
| `docs/orchestrator-retro.md`: 27 index reads in one run; 16 browser-environment calls | Bounded-read pre-hook; one browser doctor command; retained failure logs |
| Same retrospective: repeated speech-recognition stubs and too-short recording fixtures | Standard dictation skill referencing existing test helpers |
| Header tasks repeatedly rediscovered breakpoints, long RO labels and geometry traps | Standard header-layout skill, symbol anchors and focused preset |
| September team tooling already had compact suite output, but historical KNOWN failures could exit zero | Shared runner retains compact output; all failures stay nonzero |
| October review fixes repaired nav/TODO contracts after historical failure lists were written | Remove live claims based on old failure lists; require current evidence |
| October orchestration history: parser, sealed validation, locks, retry logs | Reuse parser; keep wrapper Git/control-plane rules; avoid rewriting trusted runners |
| Root AGENTS 593 lines plus CLAUDE 355 lines, with overlapping workflow text | Canonical small AGENTS, CLAUDE import, conditional task policy |

Recurring commands: `rg -n`, narrow `sed -n`, `git status --short`, `git diff
--check`, `git diff --stat`, `node tests/verify.js`, standalone Node suites,
Playwright Test with targeted config/tag, Markdown task manifests, wrapper
offline regression scripts. Cheap read-only Git checks do not need a new wrapper.

Reproduce path counts (counts of commits touching a path, not model tokens):

```sh
git log --format= --name-only | python3 -c 'import collections,sys; print(collections.Counter(x.strip() for x in sys.stdin if x.strip()).most_common(22))'
```

Instruction byte/word reductions are measurable; actual model-token/cost savings
depend on the harness and task and have not been benchmarked. Avoid claiming
tokenizer-exact savings from line or word counts.

Result: AGENTS.md went from 593 lines / 1,989 words to 70 lines / 530 words;
CLAUDE.md from 355 lines / 4,027 words to an 11-line / 65-word import adapter.
Together: 6,016 → 595 words (about 90% less root instruction text), with task
policy and feature detail moved to conditional references. These are whitespace
word counts, excluding skill discovery metadata and conditionally loaded docs.


## Follow-up audit at fc3830a — 2026-10-09

Reviewed initial and recent Git history, path frequencies, the September
retrospective, current task/review policy, skills/adapters, test inventories,
ordered Markdown modules and representative shared save/calendar/audio code.
The existing workflow implementation was already present; reuse it rather than
create another framework. Frequency evidence remains commit-path counts, not
private shell history or measured model tokens.

Verified gaps and responses:

- Static verification still entered browser discovery, so an invalid browser
  override could prevent an offline check. The runner now skips discovery for
  the known static verifier and Python checks; browser suites retain discovery.
- Python tooling tests lacked the shared runner's compact output/full logs.
  Explicit `.py` suite selection now supplies both, with failure status retained.
- Task/wrapper details were duplicated in root instructions and task policy.
  Root files now route to that policy: 595 → 484 whitespace-delimited words
  (about 19% further reduction). This is not a token/cost benchmark.
- The test guide advertised a nonexistent `/apptest all` and implicit setup;
  it now documents the actual runner and explicit browser setup behavior.
- Markdown's module table omitted Gantt and still said eight total pages;
  corrected against current script tags and the nine-page verifier.

First-time harness setup now has a separate onboarding page; it is not startup
context. Native hook activation remains dependent on harness version and trust.

# Orchestrator retrospective: run of 2026-09-29 (all passes)

This replaces the earlier retro from the same day. That one covered
calls 1–36 (the three header tasks). Since then a fourth pass (calls
39–45) re-ran the dictation requirement as task-01
`01-for-index-html-page-in-idee` and merged it (`57be8ad`).

## 1. For the owner

### What landed on `main`
| Task (slug) | Outcome | Notes |
|---|---|---|
| `01-move-salveaza-and-sincronizeaza-buttons-like`: Save/Sync onto their own row | Passed, attempt 2 | Attempt 1 hit the implementer's 30-turn cap (31/30) |
| `02-adapt-the-menu-for-small-screens`: header fits at 1025–1600 px | Passed, attempt 2, review round 5 | Rounds 1–4 failed on environment (browser/sandbox), not code; implementer escalated to max |
| `03-move-kanban-and-gantt-buttons-from`: Kanban/Gantt into ☰ | Passed first try | fast/low |
| `01-for-index-html-page-in-idee`: idea-box dictation never translates | Passed, review round 2 | Round 1 blocked only on a committed sandbox symlink |

In the dictation task, `js/markdown/dictation.js` no longer sends
`language` or `prompt` to the Whisper endpoint. `pickModel()` swaps out
English-only model ids. The tidy-up prompt is language-neutral, and
`keepsWords()` throws out a tidy result that dropped or translated words.
The FEATURES § J, MAP and RO/EN help text are updated. Its tests are
`tests/01-for-index-html-page-in-idee/*.spec.js` (29, in root `npm test`).
`.gitignore` now ignores `.config/pulse/`.

### Needs manual review
1. **Speak mixed Romanian/English into 💡 in a real browser.** No real
   speech-to-text runs in the tests; they only check the request body.
   Language detection happens once per request/segment, so a phrase that
   mixes languages inside one segment is transcribed in one language
   (accepted limitation; lowering `segMin` is the lever).
2. **`voice.html` still translates.** It keeps its own copy of the engine
   (~L2622) and still forces `language` and a prompt. If "never translate"
   should apply there too, queue it as a task.
3. **The settings text for `hint`** now only applies to `voice.html`. If
   any UI says otherwise, that text is stale.
4. **Header at 1025–1600 px** wraps onto extra lines instead of shrinking
   (task-02, agreed with the owner). Check that this looks right.
5. **Housekeeping only you can do:**
   - `.config/google-chrome-for-testing/Crash Reports/settings.dat` is
     tracked (1e5e960). Untrack it and ignore `.config/` as a whole.
   - Delete the stale branches (`task/04-for-index-html-page-in-idee`, the
     failed 8k-line dictation rewrite, and the older `task/0N-for-…` ones).
   - CLAUDE.md is stale: the nav anchor (~2052, it's ~2317), Known issue
     #1 (nav.js fails three checks, not two), and there's no mention of
     root `npm test`/Playwright Test.
   - There are two test entry points and neither runs everything:
     `row.js` and `buttons.js` are still not in `tests/package.json`'s
     loop.

## 2. For a new teammate

- **Search `index.html` with grep; never page through it.** It was read 27
  times this run. `docs/MAP.md` has no anchors for its markup or CSS. The
  header facts are in `.ai-team/skills/header-layout/`, the dictation facts
  in `.ai-team/skills/dictation/`.
- **Small, paste-ready specs win.** task-01 (header) attempt 2, task-03,
  and the dictation re-run all passed at standard/medium or lower. The
  earlier dictation attempt, a PCM/VAD rewrite, failed five rounds.
  Before planning, check `git branch -a` for an older attempt with the
  same slug.
- **Never `git add -A` in this sandbox.** Pulseaudio's runtime symlink
  under `.config/pulse/` was committed twice (c058f2d, 97fa838), which
  cost a full review round (calls 43–45, ≈ $0.88). The hook now flags
  this.
- **Dictation tests:** stub both `SpeechRecognition` and
  `webkitSpeechRecognition`. Record for ~1300 ms, because shorter blobs
  fall under a 1200-byte floor and are dropped silently. Reuse
  `tests/01-for-index-html-page-in-idee/helpers.js`.
- **Baseline failures on `main`:** nav.js (3), idea.js (1), wbrename
  (timeout). `run_suites.py` tags them KNOWN. They are not evidence
  either way for a task that doesn't touch them.
- **Refused commands:** `VAR=x cmd`, `export`, `cd … &&`,
  `git -C`, `rm`/`mv`, `git worktree`/`checkout`, and `sed -i`/`perl -i`.
  Plain `git log`/`show`/`ls-tree main` work.

## 3. What made this run slow or costly

The metered cost was ≈ $15.8 (lead $7.74 / 20 calls, tester $5.52 / 10,
implementer $2.54 / 11). The 16 Codex calls (18–35) log $0 and 1 turn,
so their real cost is unknown. They read up to 1.8 M input tokens per
tester call.

- **task-02's environment loop, the biggest waste.** 16 Codex calls and an
  escalation to max effort, because Chromium or the sandbox could not
  launch and the reviews kept failing on stale evidence. Round 5
  re-ran the suite itself and passed in about a minute. (Addressed
  earlier: `--preset browser-check`, the `ENVIRONMENT:` rule.)
- **Turn caps.** Call 2 (implementer, 31/30, no report) and call 5
  (tester, 81/80, $2.32, the findings left only in stream logs).
- **Dictation tester, call 41:** 63 turns, $1.56, 8.5 min, the costliest
  call of the last pass. The team notes show it rediscovering the two
  stub gotchas above. They are now in a skill.
- **Hygiene round, calls 43–45:** a whole fix→test→review cycle for one
  symlink that `git add -A` staged.
- **The hook ran the wrong guards for dictation.** A `dictation.js`
  change triggered the eight header guards but not `dictate`, so the
  implementer ran `dictate idea nav` by hand. It is fixed now.
- **Repeated reads.** Every call re-reads the role files (`cat
  .ai-team/README.md …` 6× lead, 5× tester), which is expected. There were
  15× `git status --short` and 12× `git diff --check` in the implementer
  calls, which is cheap and not worth a script.
- **Lead retros/improve:** 4 calls, ≈ $2.9. There was one per resume;
  one per run would be enough.

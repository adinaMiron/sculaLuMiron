# Team environment

Read only the role file for your current step; consult `project.md` when
locating markdown UI code, choosing test commands, or interpreting baselines.

- `project.md`: use when working on the header/toolbar or running its suites.
- `lead.md`: use when planning, retrying or reviewing a task.
- `implementer.md`: use when applying a header/toolbar specification.
- `tester.md`: use when testing layout changes and writing the test report.
- `scripts/run_suites.py`: use when running named Node suites or the header
  preset with compact output and explicit historical failure labels.
- `hooks/after-implement.py`: runs verification after implementation and
  header guards when the diff touches markdown code or tests.
- `CHANGELOG.md`: use when auditing the evidence and validation for these files.

Run from the repository root:
```
python3 /adina/programming/ai_generated/ai_orchestra/orchestrator/sandbox.py .ai-team/scripts/run_suites.py --preset header
python3 /adina/programming/ai_generated/ai_orchestra/orchestrator/sandbox.py .ai-team/scripts/run_suites.py gdsync wbsaveall
python3 /adina/programming/ai_generated/ai_orchestra/orchestrator/sandbox.py .ai-team/scripts/run_suites.py 01-move-salveaza-and-sincronizeaza-buttons-like/row
```
The hook accepts an optional base revision; otherwise BASE_BRANCH or main.
The runner accepts relative suite names (optional `tests/` and `.js`),
`--verbose`, `--timeout` and `--budget` (at most 240 seconds).
Exit 0 means a complete run with only passes or explicitly KNOWN-ONLY failures;
exit 1 means failure/incomplete, exit 2 means invalid runner arguments.
The current session's sandbox startup was refused; runtime verification of
the revised runner/hook is blocked. See CHANGELOG before relying on them.

#!/usr/bin/env python3
"""Offline behavior tests for shared agent tools; no providers or network calls."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), ROOT / "scripts" / (name + ".py"))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


hook = module("agent-hook")
runner = module("run-tests")
router = module("agent-context")
links = module("setup-agent-links")


class Routing(unittest.TestCase):
    def test_cards_have_real_targets_and_are_small(self):
        for topic, (sources, docs, suites, skill) in router.ROUTES.items():
            with self.subTest(topic=topic):
                for source in sources:
                    self.assertTrue((ROOT / source).exists(), source)
                for doc, _ in docs:
                    self.assertTrue((ROOT / doc).is_file(), doc)
                self.assertTrue((ROOT / ".claude/skills" / skill / "SKILL.md").is_file())
                for suite in suites:
                    self.assertTrue((ROOT / "tests" / suite).is_dir() or
                                    (ROOT / "tests" / (suite + ".js")).is_file(), suite)
                card = router.card(topic)
                self.assertLess(len(card), 2000)
                self.assertNotIn("heading moved", card)

    def test_alias_and_unknown(self):
        self.assertEqual(router.card("index.html"), router.card("markdown"))
        with self.assertRaises(ValueError):
            router.card("$(touch unwanted)")


class Hooks(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="agent-hooks-")
        self.root = Path(self.tmp.name)
        self.patch = mock.patch.object(hook, "ROOT", self.root)
        self.patch.start()
        (self.root / "scripts").mkdir()
        (self.root / "scripts/check-source.js").write_bytes((ROOT / "scripts/check-source.js").read_bytes())

    def tearDown(self):
        self.patch.stop()
        self.tmp.cleanup()

    def event(self, tool, data, event="PreToolUse"):
        return hook.handle({"hook_event_name": event, "tool_name": tool,
                            "cwd": str(self.root), "tool_input": data})

    def test_large_reads_bounded_reads_and_small_reads(self):
        large = self.root / "long file.md"
        large.write_text("line\n" * 6000)
        denied = self.event("Read", {"file_path": str(large)})
        self.assertEqual(denied["hookSpecificOutput"]["permissionDecision"], "deny")
        self.assertIn("offset/limit", denied["hookSpecificOutput"]["additionalContext"])
        self.assertIsNone(self.event("Read", {"file_path": str(large), "offset": 100, "limit": 30}))
        (self.root / "small.md").write_text("small")
        self.assertIsNone(self.event("Read", {"file_path": "small.md"}))

    def test_shell_guard_only_handles_plain_cat(self):
        (self.root / "large.html").write_text("x" * 25000)
        self.assertIsNotNone(self.event("Bash", {"command": "cat large.html"}))
        for command in ("rg -n symbol large.html", "sed -n '1,10p' large.html", "cat large.html | head -10",
                        "cat $(touch should-not-exist)", "cat 'unterminated"):
            self.assertIsNone(self.event("Bash", {"command": command}))
        self.assertFalse((self.root / "should-not-exist").exists())

    def test_unknown_tools_and_outside_files_are_ignored(self):
        self.assertIsNone(self.event("MCP", {}))
        self.assertIsNone(self.event("Read", {"file_path": str(ROOT / "index.html")}))
        self.assertIsNone(self.event("Read", {"file_path": None}))
        self.assertIsNone(self.event("Bash", {"command": None}))

    def test_post_edit_parses_separate_scopes_and_attributed_scripts(self):
        page = self.root / 'quotes " and spaces.html'
        page.write_text('<script>const x = 1;</script><script nonce="x">const x = 2;</script>'
                        '<script type="application/json">{"not-js": true}</script><script src="other.js"></script>')
        self.assertIsNone(self.event("Write", {"file_path": str(page)}, "PostToolUse"))
        page.write_text('<script nonce="x">const broken = ;</script>')
        result = self.event("Edit", {"file_path": str(page)}, "PostToolUse")
        self.assertEqual(result["decision"], "block")
        self.assertIn("SyntaxError", result["reason"])
        self.assertIn("already applied", result["reason"])

    def test_apply_patch_checks_multiple_files_and_moves(self):
        (self.root / "valid.js").write_text("const x = 1;")
        (self.root / "moved.js").write_text("const x = ;")
        data = {"command": "*** Begin Patch\n*** Update File: valid.js\n*** Move to: moved.js\n"
                           "*** Delete File: absent.js\n*** End Patch"}
        result = self.event("apply_patch", data, "PostToolUse")
        self.assertIn("moved.js", result["reason"])

    def test_json_cli_and_invalid_input(self):
        command = [sys.executable, str(ROOT / "scripts/agent-hook.py")]
        for payload in ('{', '[]'):
            result = subprocess.run(command, input=payload, text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("could not check", result.stderr)
        result = subprocess.run(command, input=json.dumps({"tool_name": "unknown"}), text=True, capture_output=True)
        self.assertEqual((result.returncode, result.stdout), (0, ""))


class Adapters(unittest.TestCase):
    def test_configured_hook_commands_work_from_a_subdirectory(self):
        event = json.dumps({"hook_event_name": "PreToolUse", "tool_name": "Read",
                            "cwd": str(ROOT), "tool_input": {"file_path": "index.html"}})
        env = dict(os.environ, CLAUDE_PROJECT_DIR=str(ROOT))
        for config in (".claude/settings.json", "docs/agents/codex-hooks.json"):
            command = json.loads((ROOT / config).read_text())["hooks"]["PreToolUse"][0]["hooks"][0]["command"]
            result = subprocess.run(["bash", "-c", command], cwd=ROOT / "tests", env=env,
                                    input=event, text=True, capture_output=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_legacy_hygiene_accepts_declared_links_only(self):
        spec = importlib.util.spec_from_file_location("legacy_hook", ROOT / ".ai-team/hooks/after-implement.py")
        legacy = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(legacy)
        with tempfile.TemporaryDirectory(prefix="agent-hygiene-") as tmp:
            root = Path(tmp)
            (root / ".claude/skills/demo").mkdir(parents=True)
            (root / ".agents/skills").mkdir(parents=True)
            (root / ".agents/skills/demo").symlink_to("../../.claude/skills/demo")
            (root / "runtime").symlink_to("/tmp")
            previous = Path.cwd()
            try:
                os.chdir(root)
                self.assertTrue(legacy.workflow_link(".agents/skills/demo"))
                self.assertFalse(legacy.workflow_link("runtime"))
                (root / ".agents/skills/wrong").symlink_to("/tmp")
                self.assertFalse(legacy.workflow_link(".agents/skills/wrong"))
            finally:
                os.chdir(previous)

    def test_metadata_and_hook_configs_share_protocol(self):
        expected = links.expected_links()
        self.assertGreaterEqual(len(expected), 7)
        claude = json.loads((ROOT / ".claude/settings.json").read_text())["hooks"]
        codex = json.loads((ROOT / "docs/agents/codex-hooks.json").read_text())["hooks"]
        for config in (claude, codex):
            for event in ("PreToolUse", "PostToolUse"):
                entry = config[event][0]
                self.assertIn("scripts/agent-hook.py", entry["hooks"][0]["command"])
                self.assertNotIn("allow", json.dumps(entry))
        self.assertIn("@AGENTS.md", (ROOT / "CLAUDE.md").read_text())

    def test_link_install_is_idempotent_and_conflicts_do_not_overwrite(self):
        with tempfile.TemporaryDirectory(prefix="agent-links-") as tmp:
            root = Path(tmp)
            skill = root / ".claude/skills/demo"
            skill.mkdir(parents=True)
            (skill / "SKILL.md").write_text("---\nname: demo\ndescription: Test workflow.\n---\nSteps.")
            source = root / "docs/agents"
            source.mkdir(parents=True)
            (source / "codex-hooks.json").write_text("{}")
            with mock.patch.object(links, "ROOT", root), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(links.sync_links(), 1)
                self.assertEqual(links.sync_links(True), 0)
                self.assertEqual(links.sync_links(True), 0)
                self.assertEqual(links.sync_links(), 0)
                self.assertEqual((root / ".agents/skills/demo/SKILL.md").read_text(), (skill / "SKILL.md").read_text())
                target = root / ".codex/hooks.json"
                target.unlink()
                target.write_text('{"personal": true}')
                other = root / ".claude/skills/other"
                other.mkdir()
                (other / "SKILL.md").write_text("---\nname: other\ndescription: Another workflow.\n---\n")
                with self.assertRaises(ValueError):
                    links.sync_links(True)
                self.assertFalse((root / ".agents/skills/other").exists())
                self.assertEqual(target.read_text(), '{"personal": true}')


class TestRunner(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="agent-test-runner-")
        self.root = Path(self.tmp.name)
        self.patch = mock.patch.object(runner, "ROOT", self.root)
        self.patch.start()
        (self.root / "tests").mkdir()
        cli = self.root / "node_modules/@playwright/test"
        cli.mkdir(parents=True)
        (cli / "cli.js").write_text("// fixture")
        (self.root / "playwright.config.js").write_text("testMatch: ['**/task/*.spec.js']")

    def tearDown(self):
        self.patch.stop()
        self.tmp.cleanup()

    def test_selection_node_root_specs_own_config_and_escape_rejection(self):
        (self.root / "tests/plain.js").write_text("console.log('PASS check')")
        command, cwd, spec = runner.suite_command("plain")
        self.assertEqual(cwd, self.root / "tests")
        self.assertFalse(spec)
        task = self.root / "tests/task"
        task.mkdir()
        (task / "a.spec.js").write_text("// fixture")
        command, cwd, spec = runner.suite_command("task", "@finding", True)
        self.assertIn(str(self.root / "playwright.config.js"), command)
        self.assertIn("--reporter=line", command)
        self.assertIn("--list", command)
        self.assertEqual(command[command.index("--grep") + 1], "@finding")
        review = self.root / "tests/review"
        review.mkdir()
        (review / "a.spec.js").write_text("// fixture")
        with self.assertRaises(ValueError):
            runner.suite_command("review")
        (review / "playwright.config.js").write_text("// fixture")
        self.assertIn(str(review / "playwright.config.js"), runner.suite_command("review")[0])
        for name in ("../AGENTS", "-bad", "plain; touch bad", "missing"):
            with self.assertRaises(ValueError):
                runner.suite_command(name)
        with self.assertRaises(ValueError):
            runner.suite_command("plain", "filter")
        (self.root / "outside.js").write_text("// outside")
        (self.root / "tests/escape.js").symlink_to(self.root / "outside.js")
        with self.assertRaises(ValueError):
            runner.suite_command("escape")

    def test_failures_and_skipped_only_never_pass(self):
        log = self.root / "output.log"
        for output, spec, expected in (("PASS assertion\n", False, True),
                                       ("FAIL historical known assertion\n", False, False),
                                       ("1 FAILED\n", False, False),
                                       ("3 skipped\n", True, False),
                                       ("2 passed (1s)\n", True, True)):
            log.write_text('{"argv": ["FAIL metadata"]}\n' + output)
            self.assertEqual(runner.inspect_log(log, spec), expected)

    def test_full_logs_compact_output_and_failure_exit(self):
        (self.root / "tests/pass.js").write_text("console.log('PASS assertion'); console.log('x'.repeat(20000))")
        (self.root / "tests/fail.js").write_text("console.log('FAIL known failure'); process.exit(1)")
        out = io.StringIO()
        with mock.patch.object(runner, "browser_environment", return_value=os.environ.copy()), contextlib.redirect_stdout(out):
            status = runner.main(["pass", "fail"])
        self.assertEqual(status, 1)
        self.assertIn("PASS pass", out.getvalue())
        self.assertIn("FAIL fail", out.getvalue())
        self.assertLess(len(out.getvalue()), 3000)
        logs = list((self.root / "test-results/agent").glob("*/*pass.log"))
        self.assertEqual(len(logs), 1)
        self.assertGreater(logs[0].stat().st_size, 20000)

    def test_all_selections_validate_before_any_execution(self):
        (self.root / "tests/pass.js").write_text("console.log('PASS')")
        with mock.patch.object(runner, "run_logged") as run, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(runner.main(["pass", "missing"]), 2)
        run.assert_not_called()

    @unittest.skipUnless(os.name == "posix", "process group termination is POSIX-specific")
    def test_timeout_terminates_descendants(self):
        marker = self.root / "leaked"
        child = "import pathlib,time; time.sleep(1); pathlib.Path(" + repr(str(marker)) + ").write_text('leak')"
        parent = "import subprocess,sys,time; subprocess.Popen([sys.executable,'-c'," + repr(child) + "]); time.sleep(30)"
        status, timed_out = runner.run_logged([sys.executable, "-c", parent], self.root,
                                             os.environ.copy(), .15, self.root / "timeout.log")
        self.assertEqual((status, timed_out), (124, True))
        time.sleep(1.1)
        self.assertFalse(marker.exists())

    def test_budget_exhaustion_reports_unrun_suites(self):
        for name in ("first", "second"):
            (self.root / f"tests/{name}.js").write_text("setTimeout(()=>console.log('PASS'), 30000)")
        out = io.StringIO()
        with mock.patch.object(runner, "browser_environment", return_value=os.environ.copy()), contextlib.redirect_stdout(out):
            self.assertEqual(runner.main(["first", "second", "--budget", "0.1"]), 1)
        self.assertIn("NOT RUN (budget exhausted): second", out.getvalue())


if __name__ == "__main__":
    unittest.main(verbosity=2)

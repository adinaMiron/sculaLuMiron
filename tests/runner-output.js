// Real wrappers in disposable repositories; fake agents/remotes, no model calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const source = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-output-'));
const bin = path.join(tmp, 'bin');
const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
function write(file, text, mode) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, { mode });
}
function run(cmd, args, cwd, env = process.env) {
    const result = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout: 20000 });
    assert.ifError(result.error);
    return result;
}
function git(repo, ...args) {
    const result = run(realGit, args, repo);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

try {
    write(path.join(bin, 'git'), `#!/usr/bin/env node
const args = process.argv.slice(2);
if (['add', 'commit', 'push'].includes(args[0])) {
    require('node:fs').appendFileSync(process.env.PROBE_PUBLICATION, args[0] + '\\n');
}
if (['fetch', 'push'].includes(args[0])) {
    console.log('NOISY_GIT_TRANSFER: Counting objects: 100%');
    process.exit(0);
}
const r = require('node:child_process').spawnSync(${JSON.stringify(realGit)}, args, {stdio: 'inherit'});
process.exit(r.status ?? 99);
`, 0o755);
    write(path.join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n', 0o755);
    write(path.join(bin, 'gh'), `#!/usr/bin/env node
const args = process.argv.slice(2);
require('node:fs').appendFileSync(process.env.PROBE_PUBLICATION, 'gh\\n');
if (args[0] === 'pr' && args[1] === 'create') console.log('https://example.invalid/repo/pull/7');
`, 0o755);
    write(path.join(bin, 'codex'), `#!/usr/bin/env python3
import json, os, pathlib, sys
args = sys.argv[1:]
if args[-1] == '-':
    print('No prompt provided via stdin.', file=sys.stderr)
    sys.exit(1)
def event(kind, item):
    print(json.dumps({'type': kind, 'item': item}), flush=True)
review = '--output-last-message' in args
mode = os.environ['PROBE_MODE']
document = pathlib.Path(os.environ['PROBE_DOC'])
pending = next((line for line in document.read_text().splitlines() if line.startswith('- [ ]')), '')
assert pending in args[-1] if not review else 'FINAL REVIEWER' in args[-1]
print('CLI_STDERR_DETAIL', file=sys.stderr)
print('plain CLI diagnostic', flush=True)
print(json.dumps({'type': 'thread.started', 'thread_id': 'fixture'}), flush=True)
command = {'id': 'read', 'type': 'command_execution', 'command': "/bin/sh -c 'cat source.txt'", 'status': 'in_progress'}
event('item.started', command)
event('item.completed', dict(command, status='completed', exit_code=0, aggregated_output='SOURCE_EXCERPT_LINE_1\\nSOURCE_EXCERPT_LINE_2\\n'))
event('item.completed', {'id': 'notes', 'type': 'reasoning', 'text': 'Detailed implementation notes.\\nAnother line.'})
if not review and mode != 'incomplete-clean':
    changed = pathlib.Path('implementation.txt')
    changed.write_text(changed.read_text() + pending + '\\n' if changed.exists() else pending + '\\n')
    change = {'id': 'edit', 'type': 'file_change', 'changes': [{'path': str(changed.resolve()), 'kind': 'update'}], 'status': 'in_progress'}
    event('item.started', change)
    event('item.completed', dict(change, status='completed'))
    event('item.completed', dict(change, status='completed'))
command = {'id': 'test', 'type': 'command_execution', 'command': "/bin/sh -c 'node tests/probe.js'", 'status': 'in_progress'}
event('item.started', command)
blocked = mode.startswith('incomplete-')
event('item.completed', dict(command, status='completed', exit_code=1 if blocked else 0,
    aggregated_output='Chromium launch failed: Operation not permitted\\n' if blocked else 'PASS detailed check one\\nPASS detailed check two\\n'))
event('item.completed', {'id': 'summary', 'type': 'agent_message', 'text': 'SUMMARY_DETAIL_LINE_1\\nSUMMARY_DETAIL_LINE_2'})
if mode.startswith('incomplete-'):
    event('item.completed', {'id': 'blocker', 'type': 'agent_message', 'text': 'Verification blocked: Chromium socket operations denied. Assignment left unchecked.'})
    if mode == 'incomplete-wording':
        document.write_text(document.read_text() + 'Unauthorized wording change.\\n')
    if mode == 'incomplete-other':
        pathlib.Path('docs/reviews').mkdir(parents=True, exist_ok=True)
        pathlib.Path('docs/reviews/other.md').write_text('- [x] Unassigned finding.\\n')
    print(json.dumps({'type': 'turn.completed'}), flush=True)
    sys.exit(0)
if mode == 'failure':
    print(json.dumps({'type': 'turn.failed', 'error': {'message': 'Authentication failed'}}))
    sys.exit(1)
if mode == 'retry' and not review and not pathlib.Path('retry-marker.txt').exists():
    pathlib.Path('retry-marker.txt').write_text('partial work')
    print(json.dumps({'type': 'turn.failed', 'error': {'message': "You've hit your usage limit."}}))
    sys.exit(1)
if mode == 'retry' and pending.endswith('First assignment.') and not review:
    assert 'USAGE-LIMIT RECOVERY' in args[-1]
if review:
    pathlib.Path(args[args.index('--output-last-message') + 1]).write_text('Reviewed the module.\\nVERDICT: PASS\\n')
else:
    document.write_text(document.read_text().replace(pending, pending.replace('- [ ]', '- [x]'), 1))
print(json.dumps({'type': 'turn.completed'}), flush=True)
`, 0o755);

    let cases = 0;
    for (const runner of ['implement-tasks.sh', 'fix-review.sh']) {
        for (const mode of ['success', 'retry', 'failure', 'log-error', 'linked',
            'incomplete-clean', 'incomplete-partial', 'incomplete-wording', 'incomplete-other']) {
            const incomplete = mode.startsWith('incomplete-');
            const stopped = incomplete || mode === 'failure';
            const repo = path.join(tmp, runner + '-' + mode + ' with spaces');
            fs.mkdirSync(repo);
            for (const name of ['trusted-runner.py', 'markdown-tasks.py', 'codex-runner.sh', 'implement-tasks.sh', 'fix-review.sh']) {
                let content = fs.readFileSync(path.join(source, 'scripts', name), 'utf8');
                if (name === 'fix-review.sh') content = content.replace(/^REVIEW=.*$/m, 'REVIEW="docs/reviews/probe.md"')
                    .replace(/^BRANCH=.*$/m, 'BRANCH="fix/probe"');
                write(path.join(repo, 'scripts', name), content);
            }
            const doc = runner === 'implement-tasks.sh' ? 'docs/tasks/probe/requirements.md' : 'docs/reviews/probe.md';
            write(path.join(repo, doc), '- [ ] First assignment.\n- [ ] Second assignment.\n');
            git(repo, 'init', '-b', 'main');
            git(repo, 'config', 'user.email', 'fixture@example.invalid');
            git(repo, 'config', 'user.name', 'Offline fixture');
            git(repo, 'add', '-A');
            git(repo, 'commit', '-m', 'fixture');
            git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
            let cwd = repo;
            if (mode === 'linked') {
                cwd = repo + ' linked';
                git(repo, 'worktree', 'add', '-b', 'linked', cwd);
            }
            const admin = git(cwd, 'rev-parse', '--absolute-git-dir');
            const logsDir = path.join(admin, 'automation-logs');
            if (mode === 'log-error') write(logsDir, 'not a directory');
            const env = { ...process.env, BROWSER_PREFLIGHT: 'false', PATH: bin + path.delimiter + process.env.PATH,
                PROBE_DOC: doc, PROBE_MODE: mode, CREATE_PR: mode === 'success' ? 'true' : 'false', FINAL_REVIEW: 'true',
                PROBE_PUBLICATION: path.join(tmp, runner + '-' + mode + '-publication.log'),
                MAX_TASKS: '2', MAX_FINDINGS: '2', BASE: 'main', TASK_BRANCH: 'feat/probe', CODEX_USAGE_RETRY_SECONDS: '1',
                CODEX_REPAIR_ATTEMPTS: '0' }; // This suite also retains the explicit no-repair contract.
            const result = run('bash', [path.join(cwd, 'scripts', runner), ...(runner === 'implement-tasks.sh' ? ['probe'] : [])], cwd, env);
            const terminal = result.stdout + result.stderr;
            assert.equal(result.status, stopped || mode === 'log-error' ? 1 : 0, terminal);
            assert(!/SOURCE_EXCERPT|SUMMARY_DETAIL|PASS detailed|CLI_STDERR_DETAIL|NOISY_GIT_TRANSFER|aggregated_output|"type":|\/bin\/sh -c/.test(terminal), terminal);
            if (mode === 'log-error') {
                assert.match(terminal, /Cannot create log directory/);
                assert.equal(git(cwd, 'rev-list', '--count', 'HEAD'), '1');
                assert(!fs.existsSync(path.join(cwd, 'implementation.txt')));
                cases++;
                continue;
            }
            const names = fs.readdirSync(logsDir).sort();
            const assignmentNames = names.filter(name => /^(?:task-probe-\d|fix-\d)-/.test(name));
            assert.equal(assignmentNames.length, stopped ? 1 : 2, names.join('\n'));
            const texts = names.map(name => fs.readFileSync(path.join(logsDir, name), 'utf8'));
            const details = texts.join('\n');
            assert.match(details, /SOURCE_EXCERPT_LINE_1\nSOURCE_EXCERPT_LINE_2/);
            assert.match(details, incomplete ? /Chromium launch failed: Operation not permitted/
                : /PASS detailed check one\nPASS detailed check two/);
            assert.match(details, /SUMMARY_DETAIL_LINE_1\nSUMMARY_DETAIL_LINE_2/);
            assert.match(details, /CLI_STDERR_DETAIL/);
            assert(!details.includes('aggregated_output'));
            assert.equal((terminal.match(/Edited: implementation\.txt/g) || []).length,
                mode === 'incomplete-clean' ? 0 : mode === 'retry' ? 3 : stopped ? 1 : 2);
            assert.match(terminal, /Reading files\.\.\./);
            assert.match(terminal, /Running tests\.\.\./);
            for (const name of names) assert(terminal.includes(path.join(logsDir, name)), name);
            if (incomplete) {
                if (mode === 'incomplete-wording') {
                    assert.match(terminal, /document changed unexpectedly/);
                } else if (mode === 'incomplete-other') {
                    assert.match(terminal, /checkbox/i);
                    assert(!terminal.includes('is still unchecked'), terminal);
                } else {
                    assert.match(terminal, /Assigned (?:finding|requirement) is still unchecked/);
                    assert.match(terminal, /implementation or verification is incomplete/);
                    assert(!terminal.includes('document changed unexpectedly'), terminal);
                }
                assert.match(details, /Verification blocked: Chromium socket operations denied/);
                assert.match(details, /Finished: .*exit 1/);
                assert.equal(git(cwd, 'rev-list', '--count', 'HEAD'), '1');
                assert.equal(git(cwd, 'diff', '--cached', '--name-only'), '');
                assert(!fs.existsSync(env.PROBE_PUBLICATION), 'incomplete assignment must not stage, commit, push, or call GitHub');
                assert.equal(fs.existsSync(path.join(cwd, 'implementation.txt')), mode !== 'incomplete-clean');
                if (mode !== 'incomplete-wording') {
                    assert.equal(fs.readFileSync(path.join(cwd, doc), 'utf8'), '- [ ] First assignment.\n- [ ] Second assignment.\n');
                }
            } else if (mode === 'failure') {
                assert.match(terminal, /Authentication failed/);
                assert.match(details, /ERROR: Codex failed/);
                assert.match(details, /Finished: .*exit 1/);
                assert.equal(git(cwd, 'rev-list', '--count', 'HEAD'), '1');
                assert.equal(git(cwd, 'diff', '--cached', '--name-only'), '');
            } else {
                assert.equal(git(cwd, 'status', '--porcelain'), '');
                assert.equal(git(cwd, 'rev-list', '--count', 'HEAD'), '3');
                assert.match(terminal, /Completed (?:task|finding) 2/);
                assert.match(details, /NOISY_GIT_TRANSFER/);
                if (mode === 'success') assert.match(terminal, /Pull request: https:\/\/example\.invalid\/repo\/pull\/7/);
                if (runner === 'implement-tasks.sh') {
                    assert.equal(names.filter(name => name.startsWith('final-review-probe-')).length, 1);
                    assert.equal(fs.readFileSync(path.join(admin, 'codex-task-final-review-probe.txt'), 'utf8'), 'Reviewed the module.\nVERDICT: PASS\n');
                }
                if (mode === 'retry') {
                    const firstLog = fs.readFileSync(path.join(logsDir, assignmentNames[0]), 'utf8');
                    assert.match(firstLog, /attempt 1/);
                    assert.match(firstLog, /attempt 2/);
                    assert.match(firstLog, /Waiting 1 seconds/);
                }
                if (mode === 'linked') assert(!fs.existsSync(path.join(repo, '.git', 'automation-logs')));
            }
            cases++;
        }
    }
    console.log(`PASS ${cases} offline output cases: concise progress, readable logs, incomplete assignments, tampering rejection, retries, failures, final review, linked worktrees, and clean commits`);
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

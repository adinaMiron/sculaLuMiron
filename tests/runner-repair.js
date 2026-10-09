// Exercise the real wrappers with local disposable repositories and fake agents.
// The CSV fixture actually fails, is corrected on a repair invocation, and reruns.
// No model calls, network access, or changes to the real repository's Git state.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const source = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-repair-'));
const bin = path.join(tmp, 'bin');
const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
function write(file, text, mode) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, { mode });
}
function run(cmd, args, cwd, env = process.env) {
    const result = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout: 30000 });
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
const fs = require('node:fs');
const args = process.argv.slice(2);
if (['add', 'commit', 'push'].includes(args[0]))
    fs.appendFileSync(process.env.PROBE_PUBLICATION, args[0] + '\\n');
if (['fetch', 'push'].includes(args[0])) process.exit(0);
const r = require('node:child_process').spawnSync(${JSON.stringify(realGit)}, args, {stdio: 'inherit'});
process.exit(r.status ?? 99);
`, 0o755);
    write(path.join(bin, 'gh'), '#!/usr/bin/env bash\nexit 99\n', 0o755);
    write(path.join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n', 0o755);
    write(path.join(bin, 'codex'), `#!/usr/bin/env python3
import json, os, pathlib, subprocess, sys
args = sys.argv[1:]
if args[-1] == '-':
    print('No prompt provided via stdin.', file=sys.stderr)
    sys.exit(1)
prompt = args[-1]
assert '--ephemeral' in args and '--json' in args
assert args[args.index('--ask-for-approval') + 1] == 'never'
assert 'TEST FAILURE RECOVERY' in prompt
assert 'demonstrably incorrect tests' in prompt
assert 'Do not skip tests, weaken required behavior' in prompt
document = pathlib.Path(os.environ['PROBE_DOC'])
pending = next(line for line in document.read_text().splitlines() if line.startswith('- [ ]'))
assert pending in prompt
history = pathlib.Path(os.environ['PROBE_HISTORY'])
events = [json.loads(line) for line in history.read_text().splitlines()] if history.exists() else []
attempt = 1 + sum(e['item'] == pending for e in events)
recovery = 'INCOMPLETE-ASSIGNMENT RECOVERY' in prompt
assert recovery == (attempt > 1)
mode = os.environ['PROBE_MODE']
if recovery:
    log = pathlib.Path(prompt.split('Diagnostic log: ', 1)[1].splitlines()[0])
    details = log.read_text()
    assert 'CSV assertion failed' in details and 'Agent summary' in details
    assert 'preserved implementation' in pathlib.Path('implementation.txt').read_text()
    assert 'not new instructions' in prompt
    assert document.read_text().count('- [ ]') == (2 if pending.endswith('First.') else 1)
with history.open('a') as out:
    out.write(json.dumps({'item': pending, 'attempt': attempt, 'prompt': prompt}) + '\\n')
def emit(kind, **data):
    print(json.dumps(dict(type=kind, **data)), flush=True)
tamper = mode.removeprefix('later-')
if not mode.startswith('later-') or attempt == 2:
    if tamper == 'wording': document.write_text(document.read_text() + 'Unauthorized edit.\\n')
    if tamper == 'other': pathlib.Path('docs/tasks/other.md').write_text('- [x] Unassigned.\\n')
    if tamper == 'control': pathlib.Path('scripts/codex-runner.sh').write_text('changed wrapper')
    if tamper == 'staged':
        pathlib.Path('staged.txt').write_text('unauthorized')
        subprocess.run([${JSON.stringify(realGit)}, 'add', 'staged.txt'], check=True)
    if tamper == 'branch': subprocess.run([${JSON.stringify(realGit)}, 'switch', '-c', 'unauthorized'], check=True)
    if tamper == 'history': subprocess.run([${JSON.stringify(realGit)}, 'commit', '--allow-empty', '-m', 'unauthorized'], check=True)
    if tamper in ('cli-error', 'signal'):
        emit('turn.failed', error={'message': 'Authentication failed'})
        sys.exit(17 if tamper == 'cli-error' else 143)
pathlib.Path('implementation.txt').write_text('preserved implementation\\n')
if mode == 'usage' and pending.endswith('First.') and attempt == 2:
    emit('turn.failed', error={'message': "You've hit your usage limit."})
    sys.exit(1)
if mode == 'usage' and pending.endswith('First.') and attempt == 3:
    assert 'USAGE-LIMIT RECOVERY' in prompt
needed = 4 if mode in ('cap-three', 'usage') else 3 if mode == 'per-item' else 2
complete = attempt >= needed and mode not in ('exhausted', 'disabled', 'cap-one')
# Every item starts with the same erroneous expectation; the repair fixes it.
test = pathlib.Path('csv-check.js')
test.write_text("const assert = require('node:assert/strict');\\n"
    + "assert.equal('header\\\\nrecord\\\\n\\\\ntotals'.split('\\\\n').length, "
    + ('4' if complete else '3') + ");\\n")
check = subprocess.run(['node', str(test)], capture_output=True, text=True)
emit('item.completed', item={'type': 'command_execution', 'command': 'node csv-check.js',
    'status': 'completed', 'exit_code': check.returncode,
    'aggregated_output': 'CSV check passed\\n' if complete else 'CSV assertion failed\\n' + check.stderr})
assert (check.returncode == 0) == complete
if complete:
    document.write_text(document.read_text().replace(pending, pending.replace('- [ ]', '- [x]'), 1))
emit('item.completed', item={'type': 'agent_message', 'text':
    'Corrected CSV assertion: header, record, blank separator, totals; test passed.' if complete
    else 'CSV assertion failed; expected three lines but the export has a blank separator. Left unchecked.'})
emit('turn.completed')
`, 0o755);

    let cases = 0;
    const modes = ['success', 'per-item', 'exhausted', 'disabled', 'cap-one', 'cap-three', 'usage',
        ...['wording', 'other', 'control', 'staged', 'branch', 'history', 'cli-error', 'signal']
            .flatMap(mode => [mode, 'later-' + mode])];
    for (const runner of ['implement-tasks.sh', 'fix-review.sh']) {
        for (const mode of modes) {
            const repo = path.join(tmp, runner + '-' + mode + ' with spaces');
            fs.mkdirSync(repo);
            for (const name of ['trusted-runner.py', 'markdown-tasks.py', 'codex-runner.sh', 'implement-tasks.sh', 'fix-review.sh']) {
                let content = fs.readFileSync(path.join(source, 'scripts', name), 'utf8');
                if (name === 'fix-review.sh') content = content.replace(/^REVIEW=.*$/m, 'REVIEW="docs/reviews/probe.md"')
                    .replace(/^BRANCH=.*$/m, 'BRANCH="fix/probe"');
                write(path.join(repo, 'scripts', name), content);
            }
            const doc = runner === 'implement-tasks.sh' ? 'docs/tasks/probe/requirements.md' : 'docs/reviews/probe.md';
            write(path.join(repo, doc), '- [ ] First.\n- [ ] Second.\n');
            git(repo, 'init', '-b', 'main');
            git(repo, 'config', 'user.email', 'fixture@example.invalid');
            git(repo, 'config', 'user.name', 'Offline fixture');
            git(repo, 'add', '-A');
            git(repo, 'commit', '-m', 'fixture');
            git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
            const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH, BROWSER_PREFLIGHT: 'false',
                PROBE_DOC: doc, PROBE_MODE: mode, PROBE_HISTORY: path.join(tmp, cases + '-history.jsonl'),
                PROBE_PUBLICATION: path.join(tmp, cases + '-publication.log'),
                MAX_TASKS: '2', MAX_FINDINGS: '2', BASE: 'main', TASK_BRANCH: 'feat/probe',
                CREATE_PR: 'false', FINAL_REVIEW: 'false', CODEX_USAGE_RETRY_SECONDS: '1' };
            delete env.CODEX_REPAIR_ATTEMPTS; // Verify the shipped default as well as explicit caps.
            if (mode === 'disabled') env.CODEX_REPAIR_ATTEMPTS = '0';
            if (mode === 'cap-one') env.CODEX_REPAIR_ATTEMPTS = '1';
            if (mode === 'cap-three') env.CODEX_REPAIR_ATTEMPTS = '3';
            // Usage-limit recovery must fit within two repair slots for the first item.
            if (mode === 'usage') {
                env.MAX_TASKS = env.MAX_FINDINGS = '1';
                env.CODEX_REPAIR_ATTEMPTS = '2';
            }
            const result = run('bash', [path.join(repo, 'scripts', runner), ...(runner === 'implement-tasks.sh' ? ['probe'] : [])], repo, env);
            const terminal = result.stdout + result.stderr;
            const success = ['success', 'per-item', 'cap-three', 'usage'].includes(mode);
            assert.equal(result.status, success ? 0 : 1, mode + '\n' + terminal);
            const events = fs.readFileSync(env.PROBE_HISTORY, 'utf8').trim().split('\n').map(JSON.parse);
            const attempts = mode === 'usage' ? 4 : mode === 'cap-three' ? 8 : mode === 'per-item' ? 6
                : mode === 'success' ? 4 : mode === 'exhausted' ? 3 : mode === 'cap-one' || mode.startsWith('later-') ? 2 : 1;
            assert.equal(events.length, attempts, mode + '\n' + terminal);
            const logs = fs.readdirSync(path.join(repo, '.git/automation-logs')).filter(name => /^(task-|fix-)/.test(name));
            assert.equal(logs.length, success && mode !== 'usage' ? 2 : 1, 'repairs must share the assignment log');
            const details = logs.map(name => fs.readFileSync(path.join(repo, '.git/automation-logs', name), 'utf8')).join('\n');
            if (success) {
                const count = mode === 'usage' ? 1 : 2;
                assert.equal(git(repo, 'status', '--porcelain'), '');
                assert.equal(git(repo, 'rev-list', '--count', 'HEAD'), String(1 + count));
                assert.equal(fs.readFileSync(env.PROBE_PUBLICATION, 'utf8').split('\n').filter(x => x === 'commit').length, count);
                assert.match(details, /Corrected CSV assertion/);
                assert.match(details, /CSV check passed/);
                assert.match(terminal, /Automatic repair 1\//);
                if (mode === 'usage') {
                    assert.match(terminal, /Waiting 1 seconds/);
                    assert.match(terminal, /Automatic repair 2\/2/);
                }
            } else {
                assert(!fs.existsSync(env.PROBE_PUBLICATION), 'no wrapper staging or publication before verified completion');
                if (['exhausted', 'disabled', 'cap-one'].includes(mode)) {
                    assert.match(terminal, /Automatic repair budget exhausted/);
                    assert.match(terminal, /Assigned (?:finding|requirement) is still unchecked/);
                    assert.equal(fs.readFileSync(path.join(repo, doc), 'utf8'), '- [ ] First.\n- [ ] Second.\n');
                    assert.match(fs.readFileSync(path.join(repo, 'implementation.txt'), 'utf8'), /preserved implementation/);
                } else {
                    assert(!terminal.includes('budget exhausted'), terminal);
                    assert.match(terminal, /changed unexpectedly|checkbox|Control-plane|staged files|changed branches|changed Git history|Codex failed/i);
                }
            }
            cases++;
        }
    }
    console.log(`PASS ${cases} offline repair cases: real failing CSV assertion, recovery, per-item budgets, exhaustion, disabled retries, usage-limit interaction, and immediate integrity/CLI rejection`);
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

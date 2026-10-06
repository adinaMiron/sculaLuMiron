// Offline integration: real disposable Git repositories, fake model and remotes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const source = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-control-'));
const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
const bin = path.join(tmp, 'bin');
function write(file, data, mode) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data, { mode });
}
function run(command, args, cwd, env = process.env) {
    const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 30000 });
    assert.ifError(result.error);
    return result;
}
function git(repo, ...args) {
    const result = run(realGit, args, repo);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

try {
    // Real local Git covers staging/commit behavior; network commands are inert.
    write(path.join(bin, 'git'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PROBE_LOG, JSON.stringify({tool: 'git', args}) + '\\n');
if (['fetch', 'push'].includes(args[0])) process.exit(0);
const r = require('node:child_process').spawnSync(${JSON.stringify(realGit)}, args, {stdio: 'inherit'});
process.exit(r.status ?? 99);
`, 0o755);
    write(path.join(bin, 'gh'), `#!/usr/bin/env node
require('node:fs').appendFileSync(process.env.PROBE_LOG, JSON.stringify({tool: 'gh', args: process.argv.slice(2)}) + '\\n');
`, 0o755);
    write(path.join(bin, 'codex'), `#!/usr/bin/env python3
import errno, fcntl, json, mmap, os, pathlib, signal, sys
root = pathlib.Path.cwd()
log = pathlib.Path(os.environ['PROBE_LOG'])
def record(**entry):
    with log.open('a') as out:
        out.write(json.dumps(entry) + '\\n')
if sys.argv[-1] == '-':
    print('No prompt provided via stdin.', file=sys.stderr)
    sys.exit(1)

# Exercise real kernel enforcement, not a mocked chmod or CLI policy.
sealed = []
for name in os.listdir('/proc/self/fd'):
    fd = int(name)
    try:
        target = os.readlink('/proc/self/fd/' + name)
    except FileNotFoundError:
        continue
    if not target.startswith('/memfd:wrapper-'):
        continue
    expected = fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL
    assert fcntl.fcntl(fd, fcntl.F_GET_SEALS) == expected
    for attack in (lambda: os.pwrite(fd, b'evil', 0), lambda: os.ftruncate(fd, 0),
                   lambda: fcntl.fcntl(fd, fcntl.F_ADD_SEALS, 0)):
        try:
            attack()
        except OSError as e:
            assert e.errno == errno.EPERM, e
        else:
            raise AssertionError('Trusted storage was mutable')
    sealed.append(target)
assert len(sealed) == 4, sealed
record(tool='agent', sealed=sealed)
mode = os.environ['PROBE_MODE']
reviewer = 'You are the FINAL REVIEWER' in sys.argv[-1]
if mode == 'final-review' and not reviewer:
    mode = 'normal'
# Locate the actual evidence objects held by the wrapper's child. These probes
# run as the same UID, outside any Codex sandbox: kernel seals enforce denial.
evidence = []
if not reviewer:
    parent = os.getppid()
    children = pathlib.Path(f'/proc/{parent}/task/{parent}/children').read_text().split()
    for pid in children:
        for entry in pathlib.Path(f'/proc/{pid}/fd').iterdir():
            try:
                target = os.readlink(entry)
            except FileNotFoundError:
                continue
            if not target.startswith('/memfd:validation-evidence-'):
                continue
            original = entry.read_bytes()
            os.chmod(entry, 0o600)  # Ordinary permissions are not the boundary.
            fd = os.open(entry, os.O_RDWR)
            assert fcntl.fcntl(fd, fcntl.F_GET_SEALS) == expected
            attacks = [lambda: os.pwrite(fd, b'forged', 0),
                       lambda: os.ftruncate(fd, len(original) + 1),
                       lambda: fcntl.fcntl(fd, fcntl.F_ADD_SEALS, 0)]
            if original:
                # Truncating an already empty file is a permitted no-op.
                attacks.extend([lambda: os.ftruncate(fd, 0),
                                lambda: os.open(entry, os.O_WRONLY | os.O_TRUNC),
                                lambda: mmap.mmap(fd, len(original), access=mmap.ACCESS_WRITE)])
            for attack in attacks:
                try:
                    attack()
                except OSError as e:
                    assert e.errno == errno.EPERM, e
                else:
                    raise AssertionError('Validation evidence was mutable')
            replacement = root / 'replacement-evidence'
            replacement.write_bytes(b'forged')
            try:
                os.replace(replacement, entry)
            except OSError as e:
                assert e.errno in (errno.EXDEV, errno.EPERM, errno.EACCES), e
            else:
                raise AssertionError('Validation evidence was replaceable')
            replacement.unlink()
            assert entry.read_bytes() == original
            os.close(fd)
            evidence.append(str(entry))
    assert len(evidence) == (2 if os.environ['PROBE_RUNNER'] == 'implement-tasks.sh' else 1), evidence
    record(tool='evidence', paths=evidence)
if mode not in ('normal', 'evidence-document', 'evidence-manifest', 'evidence-holder-exit', 'two-items', 'empty-manifest'):
    runner = root / 'scripts' / os.environ['PROBE_RUNNER']
    payload = '\\nprintf compromised > "' + os.environ['PROBE_MARKER'] + '"\\n'
    if mode in ('replace', 'final-review'):
        replacement = root / 'replacement'
        replacement.write_text(payload)
        replacement.replace(runner)
    elif mode in ('overwrite', 'agent-failure'):
        runner.write_text(payload)
    elif mode == 'helper':
        (root / 'scripts/codex-runner.sh').write_text(payload)
    elif mode == 'checker':
        (root / 'scripts/trusted-runner.py').write_text('raise Exception("UNTRUSTED CHECKER")')
    elif mode == 'delete':
        runner.unlink()
    elif mode == 'chmod':
        runner.chmod(0o600)
    elif mode == 'symlink':
        runner.unlink()
        runner.symlink_to(root / 'innocent.txt')
    elif mode == 'directory-symlink':
        (root / 'scripts').rename(root / 'old-scripts')
        (root / 'scripts').symlink_to(root / 'old-scripts', target_is_directory=True)
    elif mode == 'ignored-addition':
        (root / 'scripts/ignored.sh').write_text(payload)
    elif mode == 'workflow':
        (root / '.github/workflows/new.yml').write_text('name: unapproved\\n')
    record(tool='attack', mode=mode)

if reviewer:
    print('VERDICT: PASS')
else:
    doc = root / ('docs/tasks/probe/01-requirements.md' if os.environ['PROBE_RUNNER'] == 'implement-tasks.sh'
                  else 'docs/reviews/2026-10-04-solar-calcule-review.md')
    doc.write_text(doc.read_text().replace('- [ ]', '- [x]', 1))
    (root / 'implementation.txt').write_text('implemented\\n')
    if mode == 'evidence-document':
        doc.write_text(doc.read_text().replace('Probe', 'Forged'))
    elif mode == 'evidence-manifest':
        other = root / 'docs/tasks/probe/02-other.md'
        other.write_text(other.read_text().replace('Other', 'Forged'))
    elif mode == 'evidence-holder-exit':
        os.kill(int(evidence[0].split('/')[2]), signal.SIGKILL)

if mode == 'agent-failure':
    sys.exit(42)
`, 0o755);

    let count = 0;
    for (const runner of ['fix-review.sh', 'implement-tasks.sh']) {
        const modes = ['normal', 'two-items', 'evidence-document', 'evidence-holder-exit', 'branch-drift', 'sealing-unavailable', 'evidence-sealing-unavailable', 'replace', 'overwrite', 'helper', 'checker', 'delete', 'chmod',
            'symlink', 'directory-symlink', 'ignored-addition', 'workflow', 'agent-failure'];
        if (runner === 'implement-tasks.sh') modes.push('final-review', 'evidence-manifest', 'empty-manifest');
        for (const mode of modes) {
            const repo = path.join(tmp, `${runner}-${mode} with spaces`);
            fs.mkdirSync(repo);
            for (const name of ['fix-review.sh', 'implement-tasks.sh', 'codex-runner.sh', 'trusted-runner.py']) {
                write(path.join(repo, 'scripts', name), fs.readFileSync(path.join(source, 'scripts', name)), 0o755);
            }
            if (mode === 'evidence-sealing-unavailable') {
                const checker = path.join(repo, 'scripts/trusted-runner.py');
                fs.writeFileSync(checker, fs.readFileSync(checker, 'utf8').replace('def seal(name, data):',
                    'def seal(name, data):\n    if name.startswith("validation-evidence-"):\n        raise OSError("Evidence sealing unavailable")'));
            }
            write(path.join(repo, 'docs/tasks/probe/01-requirements.md'), '- [ ] [ID:probe] Probe task.\n');
            write(path.join(repo, 'docs/reviews/2026-10-04-solar-calcule-review.md'), '- [ ] Probe finding.\n');
            if (mode !== 'empty-manifest') write(path.join(repo, 'docs/tasks/probe/02-other.md'), '- [x] [ID:other] Other task.\n');
            if (mode === 'two-items') {
                for (const doc of ['docs/tasks/probe/01-requirements.md', 'docs/reviews/2026-10-04-solar-calcule-review.md']) {
                    fs.appendFileSync(path.join(repo, doc), '- [ ] Second item.\n');
                }
            }
            write(path.join(repo, '.github/workflows/existing.yml'), 'name: existing\n');
            write(path.join(repo, '.gitignore'), 'scripts/ignored.sh\n');
            write(path.join(repo, 'innocent.txt'), 'initial\n');
            git(repo, 'init', '-b', 'main');
            git(repo, 'config', 'user.email', 'fixture@example.invalid');
            git(repo, 'config', 'user.name', 'Runner fixture');
            git(repo, 'config', 'commit.gpgsign', 'false');
            git(repo, 'config', 'core.hooksPath', '/dev/null');
            git(repo, 'add', '-A');
            git(repo, 'commit', '-m', 'fixture');
            git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
            const initial = git(repo, 'rev-parse', 'HEAD');
            if (mode === 'branch-drift') {
                git(repo, 'switch', '-c', runner === 'implement-tasks.sh' ? 'feat/probe' : 'fix/review-2026-10-04');
                fs.appendFileSync(path.join(repo, 'scripts/codex-runner.sh'), '\n# Different branch version\n');
                git(repo, 'add', '-A');
                git(repo, 'commit', '-m', 'different wrapper');
                git(repo, 'switch', 'main');
            }
            const log = path.join(tmp, `${runner}-${mode}.jsonl`);
            const marker = path.join(tmp, `${runner}-${mode}.compromised`);
            write(log, '');
            const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH,
                PROBE_LOG: log, PROBE_MODE: mode, PROBE_RUNNER: runner, PROBE_MARKER: marker,
                CREATE_PR: 'true', FINAL_REVIEW: 'true', MAX_TASKS: '2', MAX_FINDINGS: '2' };
            const runnerArgs = [path.join(repo, 'scripts', runner),
                ...(runner === 'implement-tasks.sh' ? ['probe'] : [])];
            const result = mode === 'sealing-unavailable'
                ? run('python3', ['-I', '-c', `
import os, runpy, sys
def unavailable(*args):
    raise OSError('File sealing unavailable')
os.memfd_create = unavailable
sys.argv = sys.argv[1:]
runpy.run_path(sys.argv[0], run_name='__main__')
`, path.join(repo, 'scripts/trusted-runner.py'), ...runnerArgs], repo, env)
                : run('bash', runnerArgs, repo, env);
            const history = fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
            if (['branch-drift', 'sealing-unavailable', 'evidence-sealing-unavailable'].includes(mode)) {
                assert.equal(result.status, 1, result.stdout + result.stderr);
                assert.match(result.stderr, mode === 'branch-drift' ? /Control-plane changes rejected/ : /(?:File|Evidence) sealing unavailable/);
                assert(!history.some(c => c.tool === 'agent'));
                assert(!history.some(c => c.tool === 'gh' || (c.tool === 'git' && ['add', 'commit', 'push'].includes(c.args[0]))));
                if (mode === 'sealing-unavailable') {
                    assert(!history.some(c => c.tool === 'git' && ['fetch', 'switch', 'merge'].includes(c.args[0])));
                }
                count++;
                continue;
            }
            for (const entry of history.filter(c => c.tool === 'evidence')) {
                for (const evidencePath of entry.paths) assert(!fs.existsSync(evidencePath), 'Evidence holder leaked');
            }
            assert(history.some(c => c.tool === 'agent'), result.stdout + result.stderr);
            assert(!fs.existsSync(marker), 'Mutable wrapper code executed');
            if (['normal', 'two-items', 'empty-manifest'].includes(mode)) {
                assert.equal(result.status, 0, result.stdout + result.stderr);
                assert.equal(git(repo, 'rev-list', '--count', 'HEAD'), mode === 'two-items' ? '3' : '2');
                assert.equal(history.filter(c => c.tool === 'evidence').length, mode === 'two-items' ? 2 : 1);
                assert.equal(git(repo, 'status', '--porcelain'), '');
                assert(history.some(c => c.tool === 'gh' && c.args[0] === 'pr' && c.args[1] === 'create'));
            } else if (mode.startsWith('evidence-')) {
                assert.equal(result.status, 1, result.stdout + result.stderr);
                assert.match(result.stderr, mode === 'evidence-manifest' ? /Another task checkbox was modified/
                    : /document changed unexpectedly/);
                assert(!history.some(c => c.tool === 'gh' || (c.tool === 'git' && ['add', 'commit', 'push'].includes(c.args[0]))));
                assert.equal(git(repo, 'diff', '--cached', '--name-only'), '');
                assert.equal(git(repo, 'rev-parse', 'HEAD'), initial);
            } else {
                assert.equal(result.status, 1, result.stdout + result.stderr);
                assert.match(result.stderr, /Control-plane changes rejected/);
                assert(!result.stderr.includes('UNTRUSTED CHECKER'), 'Checker loaded from writable workspace');
                const after = history.slice(history.findIndex(c => c.tool === 'attack') + 1);
                assert.deepEqual(after, [], 'Host Git/GitHub executed after rejected agent output');
                assert.equal(git(repo, 'diff', '--cached', '--name-only'), '', 'Rejected output was staged');
                if (mode !== 'final-review') assert.equal(git(repo, 'rev-parse', 'HEAD'), initial);
            }
            count++;
        }
    }
    console.log(`PASS ${count} isolated runner cases: kernel seals, validation evidence, control-plane rejection, publication gates, normal completion`);
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

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
const verdictCases = {
    'pass': { message: 'Tests passed.\nVERDICT: PASS\n', pass: true },
    'pass-no-newline': { message: 'VERDICT: PASS', pass: true },
    'pass-blank-tail': { message: 'Tests passed.\r\nVERDICT: PASS\r\n \t\r\n', pass: true },
    'pass-stdout-fail': { message: 'VERDICT: PASS\n', stdout: 'VERDICT: FAIL', pass: true },
    'pass-closed-fence': { message: '```text\nTest results\n```\nVERDICT: PASS\n', pass: true },
    'fail': { message: 'A regression remains.\nVERDICT: FAIL\n' },
    'missing': { message: 'Review complete.\n' },
    'empty': { message: '' },
    'no-file': { message: null },
    'deleted-file': { message: null, remove: true },
    'contradictory': { message: 'VERDICT: FAIL\nVERDICT: PASS\n' },
    'contradictory-reverse': { message: 'VERDICT: PASS\nVERDICT: FAIL\n' },
    'duplicate': { message: 'VERDICT: PASS\nVERDICT: PASS\n' },
    'quoted-block': { message: '> VERDICT: PASS\n' },
    'quoted-inline': { message: '`VERDICT: PASS`\n' },
    'quoted-fence': { message: 'Example:\n```\nVERDICT: PASS\n```\nNo verdict.\n' },
    'unclosed-fence': { message: '```text\nVERDICT: PASS\n' },
    'unclosed-tilde': { message: '  ~~~~text\n~~~\nVERDICT: PASS\n' },
    'quoted-and-final': { message: '> VERDICT: FAIL\nVERDICT: PASS\n' },
    'non-final': { message: 'VERDICT: PASS\nFurther review is needed.\n' },
    'indented': { message: '    VERDICT: PASS\n' },
    'malformed': { message: 'VERDICT: PASS (probably)\n' },
    'agent-error': { message: 'VERDICT: PASS\n', status: 42 },
};
const metadataFailures = {
    'repeated-id': ['[ID:probe] [ID:second]', /Repeated \[ID:/],
    'identical-id': ['[ID:probe] [ID:probe]', /Repeated \[ID:/],
    'malformed-first-id': ['[ID:bad id] [ID:probe]', /Repeated \[ID:/],
    'malformed-last-id': ['[ID:probe] [ID:]', /Repeated \[ID:/],
    'repeated-depends': ['[ID:probe] [DEPENDS:missing] [DEPENDS:other]', /Repeated \[DEPENDS:/],
    'identical-depends': ['[ID:probe] [DEPENDS:other] [DEPENDS:other]', /Repeated \[DEPENDS:/],
    'empty-first-depends': ['[ID:probe] [DEPENDS:] [DEPENDS:other]', /Repeated \[DEPENDS:/],
    'empty-last-depends': ['[ID:probe] [DEPENDS:other] [DEPENDS:]', /Repeated \[DEPENDS:/],
    'trailing-comma': ['[ID:probe] [DEPENDS:other,]', /Malformed or empty \[DEPENDS:/],
    'leading-comma': ['[ID:probe] [DEPENDS:,other]', /Malformed or empty \[DEPENDS:/],
    'middle-empty': ['[ID:probe] [DEPENDS:other,,done]', /Malformed or empty \[DEPENDS:/],
    'trailing-space': ['[ID:probe] [DEPENDS:other, \t]', /Malformed or empty \[DEPENDS:/],
    'middle-space': ['[ID:probe] [DEPENDS:other, \t,done]', /Malformed or empty \[DEPENDS:/],
    'embedded-space': ['[ID:probe] [DEPENDS:ot her]', /Malformed or empty \[DEPENDS:/],
    'empty-list': ['[ID:probe] [DEPENDS:]', /Malformed or empty \[DEPENDS:/],
    'unclosed-list': ['[ID:probe] [DEPENDS:other', /Malformed or empty \[DEPENDS:/],
    'invalid-character': ['[ID:probe] [DEPENDS:other;done]', /Malformed or empty \[DEPENDS:/],
    'duplicate-task-id': ['[ID:other]', /Duplicate task ID 'other'/],
    'unknown-reference': ['[ID:probe] [DEPENDS:missing]', /unknown task ID 'missing'/],
    'duplicate-dependency': ['[ID:probe] [DEPENDS:other,other]', /lists dependency 'other' more than once/],
    'self-dependency': ['[ID:probe] [DEPENDS:probe]', /depends on itself/],
};
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
if (r.status === 0 && args[0] === 'switch' && process.env.PROBE_MODE.startsWith('input-branch-unreadable')) {
    const task = process.env.PROBE_RUNNER === 'implement-tasks.sh';
    const target = process.env.PROBE_MODE.endsWith('-directory') ? 'docs/tasks/probe/nested'
        : task ? 'docs/tasks/probe/01-requirements.md' : 'docs/reviews/2026-10-04-solar-calcule-review.md';
    fs.chmodSync(target, 0);
}
process.exit(r.status ?? 99);
`, 0o755);
    write(path.join(bin, 'gh'), `#!/usr/bin/env node
require('node:fs').appendFileSync(process.env.PROBE_LOG, JSON.stringify({tool: 'gh', args: process.argv.slice(2)}) + '\\n');
`, 0o755);
    write(path.join(bin, 'codex'), `#!/usr/bin/env python3
import errno, fcntl, json, mmap, os, pathlib, re, signal, sys
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
assert len(sealed) == 5, sealed
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
    assert len(evidence) == 2, evidence
    record(tool='evidence', paths=evidence)
if not mode.startswith('scope-') and mode not in ('normal', 'evidence-document', 'evidence-manifest', 'evidence-holder-exit', 'two-items', 'empty-manifest', 'markdown'):
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
    elif mode == 'parser':
        (root / 'scripts/markdown-tasks.py').write_text('raise Exception("UNTRUSTED PARSER")')
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
    output = pathlib.Path(sys.argv[sys.argv.index('--output-last-message') + 1])
    if mode.startswith('verdict-'):
        record(tool='final-message', output=str(output))
        cases = json.loads(${JSON.stringify(JSON.stringify(verdictCases))})
        case = cases[mode[len('verdict-'):]]
        if case.get('remove'):
            output.unlink()
        elif case['message'] is not None:
            output.write_text(case['message'])
        print(case.get('stdout', 'VERDICT: PASS'))
        sys.exit(case.get('status', 0))
    output.write_text('VERDICT: PASS\\n')
    print('VERDICT: PASS')
else:
    doc = root / ('docs/tasks/probe/01-requirements.md' if os.environ['PROBE_RUNNER'] == 'implement-tasks.sh'
                  else 'docs/reviews/2026-10-04-solar-calcule-review.md')
    assigned = int(re.search(r'(?:Assigned line|Line): (\\d+)', sys.argv[-1])[1])
    lines = doc.read_text().splitlines(keepends=True)
    lines[assigned - 1] = lines[assigned - 1].replace('- [ ]', '- [x]', 1)
    doc.write_text(''.join(lines))
    if mode == 'markdown' and os.environ['PROBE_RUNNER'] == 'implement-tasks.sh':
        other = root / 'docs/tasks/probe/02-other.md'
        other.write_text(other.read_text().replace('Example wording', 'Updated example'))
    (root / 'implementation.txt').write_text('implemented\\n')
    if mode == 'evidence-document':
        doc.write_text(doc.read_text().replace('Probe', 'Forged'))
    elif mode == 'evidence-manifest':
        other = root / 'docs/tasks/probe/02-other.md'
        other.write_text(other.read_text().replace('Other', 'Forged'))
    elif mode == 'evidence-holder-exit':
        os.kill(int(evidence[0].split('/')[2]), signal.SIGKILL)
    elif mode == 'input-agent-delete':
        doc.unlink()
    elif mode == 'input-agent-unreadable':
        doc.chmod(0)
    elif mode == 'input-agent-unreadable-directory':
        (root / 'docs/tasks/probe/nested').chmod(0)
    elif mode.startswith('scope-'):
        _, kind, change = mode.split('-', 2)
        directory = root / ('docs/tasks/other-module' if kind == 'task' else 'docs/reviews/other-review')
        other = directory / 'checklist.md'
        if change == 'complete':
            other.write_text(other.read_text().replace('- [ ]', '- [x]', 1))
        elif change == 'reopen':
            other.write_text(other.read_text().replace('- [x]', '- [ ]', 1))
        elif change == 'append':
            other.write_text(other.read_text() + '- [ ] Unassigned new task.\\n')
        elif change in ('new', 'new-complete'):
            nested = directory / 'new-module/nested/new.md'
            nested.parent.mkdir(parents=True)
            nested.write_text('- [ ] Unassigned new task.\\n' if change == 'new' else '- [x] Unassigned completed task.\\n')
        elif change == 'delete':
            other.unlink()
        elif change == 'move':
            other.rename(directory / 'moved.md')
        elif change == 'delete-tree':
            other.unlink()
            directory.rmdir()
        elif change == 'notes':
            other.write_text(other.read_text() + '\\nExplanatory note.\\n~~~md\\n- [ ] Example only.\\n~~~\\n')
            (directory / 'notes.md').write_text('New explanation.\\n~~~md\\n- [ ] Example only.\\n~~~\\n')

if mode == 'agent-failure':
    sys.exit(42)
`, 0o755);

    let count = 0;
    for (const runner of ['fix-review.sh', 'implement-tasks.sh']) {
        const modes = ['normal', 'markdown', 'two-items', 'empty-manifest', 'evidence-document', 'evidence-holder-exit', 'branch-drift', 'sealing-unavailable', 'evidence-sealing-unavailable', 'replace', 'overwrite', 'helper', 'checker', 'parser', 'delete', 'chmod',
            'symlink', 'directory-symlink', 'ignored-addition', 'workflow', 'agent-failure'];
        modes.push('input-branch-missing', 'input-ff-missing', 'input-branch-wrong-type', 'input-branch-invalid-utf8', 'input-agent-delete', 'input-zero');
        // chmod(000) cannot deny reads to root; do not claim that coverage there.
        if (process.getuid() !== 0) {
            modes.push('input-start-unreadable', 'input-branch-unreadable', 'input-agent-unreadable');
            if (runner === 'implement-tasks.sh') modes.push('input-branch-unreadable-directory', 'input-agent-unreadable-directory');
        }
        if (runner === 'implement-tasks.sh') modes.push('graph-fenced-ref', 'graph-indented-cycle', 'final-review', 'final-review-linked', 'evidence-manifest');
        if (runner === 'implement-tasks.sh') modes.push('metadata-valid', ...Object.keys(metadataFailures).map(name => `metadata-${name}`));
        if (runner === 'implement-tasks.sh') modes.push(...Object.keys(verdictCases).map(name => `verdict-${name}`));
        for (const kind of ['task', 'review']) {
            for (const change of ['complete', 'reopen', 'append', 'new', 'new-complete', 'delete', 'move', 'delete-tree', 'notes']) {
                modes.push(`scope-${kind}-${change}`);
            }
        }
        for (const mode of modes.filter(mode => !process.argv.includes('--final-verdict') || mode.startsWith('verdict-'))) {
            const repo = path.join(tmp, `${runner}-${mode} with spaces`);
            fs.mkdirSync(repo);
            for (const name of ['fix-review.sh', 'implement-tasks.sh', 'codex-runner.sh', 'trusted-runner.py', 'markdown-tasks.py']) {
                write(path.join(repo, 'scripts', name), fs.readFileSync(path.join(source, 'scripts', name)), 0o755);
            }
            if (mode === 'evidence-sealing-unavailable') {
                const checker = path.join(repo, 'scripts/trusted-runner.py');
                fs.writeFileSync(checker, fs.readFileSync(checker, 'utf8').replace('def seal(name, data):',
                    'def seal(name, data):\n    if name.startswith("validation-evidence-"):\n        raise OSError("Evidence sealing unavailable")'));
            }
            write(path.join(repo, 'docs/tasks/probe/01-requirements.md'), '- [ ] [ID:probe] Probe task.\n');
            write(path.join(repo, 'docs/reviews/2026-10-04-solar-calcule-review.md'), '- [ ] Probe finding.\n');
            const input = path.join(repo, runner === 'implement-tasks.sh' ? 'docs/tasks/probe' : 'docs/reviews/2026-10-04-solar-calcule-review.md');
            const inputFile = runner === 'implement-tasks.sh' ? path.join(input, '01-requirements.md') : input;
            if (mode.endsWith('unreadable-directory')) write(path.join(input, 'nested/hidden.md'), '- [x] Completed nested task.\n');
            if (mode !== 'empty-manifest') write(path.join(repo, 'docs/tasks/probe/02-other.md'), '- [x] [ID:other] Other task.\n');
            if (mode === 'empty-manifest') {
                // The unselected tree may be absent; an empty sealed manifest
                // must still validate the assigned item successfully.
                fs.rmSync(path.join(repo, runner === 'implement-tasks.sh' ? 'docs/reviews' : 'docs/tasks'), { recursive: true });
            }
            if (mode === 'input-zero') fs.writeFileSync(inputFile, '~~~md\n- [ ] Example\n~~~\n- [x] Done.\n');
            if (mode.startsWith('verdict-')) fs.writeFileSync(inputFile, '- [x] [ID:probe] Probe task.\n');
            if (mode.startsWith('scope-')) {
                const directory = mode.startsWith('scope-task-') ? 'docs/tasks/other-module' : 'docs/reviews/other-review';
                write(path.join(repo, directory, 'checklist.md'), '- [ ] Pending unrelated item.\n- [x] Completed unrelated item.\n');
            }
            if (mode === 'two-items') {
                for (const doc of ['docs/tasks/probe/01-requirements.md', 'docs/reviews/2026-10-04-solar-calcule-review.md']) {
                    fs.appendFileSync(path.join(repo, doc), '- [ ] Second item.\n');
                }
            }
            if (mode === 'markdown') {
                const examples = '```md\n- [ ] [ID:probe] [DEPENDS:missing] Example.\n```\n' +
                    '  ~~~~md\n- [ ] [ID:bad id] Example.\n~~~\n- [ ] Still example.\n  ~~~~\n' +
                    '    - [ ] Indented code.\n\t- [ ] Tab code.\n';
                write(path.join(repo, 'docs/tasks/probe/01-requirements.md'), examples +
                    '   - [ ] [ID:probe] [DEPENDS:other] Probe task.\n');
                write(path.join(repo, 'docs/reviews/2026-10-04-solar-calcule-review.md'), examples +
                    '   - [ ] Probe finding.\n');
                write(path.join(repo, 'docs/tasks/probe/02-other.md'),
                    '```\n- [ ] Example wording\n```\n  - [X] [ID:other] Other task.\n');
            }
            if (mode === 'graph-fenced-ref') {
                write(path.join(repo, 'docs/tasks/probe/01-requirements.md'),
                    '~~~\n- [x] [ID:example] Example.\n~~~\n  - [ ] [ID:probe] [DEPENDS:example] Probe.\n');
            }
            if (mode === 'graph-indented-cycle') {
                write(path.join(repo, 'docs/tasks/probe/01-requirements.md'),
                    ' - [ ] [ID:a] [DEPENDS:b] A.\n   - [ ] [ID:b] [DEPENDS:a] B.\n');
            }
            const metadataFailure = metadataFailures[mode.slice('metadata-'.length)];
            if (mode === 'metadata-valid' || metadataFailure) {
                write(path.join(repo, 'docs/tasks/probe/02-other.md'),
                    '- [x] [ID:other] Other task.\n- [X] [ID:Done_2.0] Completed prerequisite.\n- [x] [ID:done] Done.\n');
                write(path.join(repo, 'docs/tasks/probe/01-requirements.md'), mode === 'metadata-valid'
                    ? '- [ ] [ID:probe] [DEPENDS: other , \tDone_2.0 ] Probe task.\n'
                    // An earlier ready task must not bypass invalid metadata,
                    // including metadata on a completed task.
                    : '- [ ] Ready independent task.\n- [x] ' + metadataFailure[0] + ' Invalid task.\n');
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
            if (mode.startsWith('verdict-')) {
                // Every case begins with an old PASS; a missing CLI output must
                // not reuse it, even when console output also contains PASS.
                write(path.join(repo, '.git/codex-task-final-review-probe.txt'), 'VERDICT: PASS\n');
            }
            if (mode === 'branch-drift') {
                git(repo, 'switch', '-c', runner === 'implement-tasks.sh' ? 'feat/probe' : 'fix/review-2026-10-04');
                fs.appendFileSync(path.join(repo, 'scripts/codex-runner.sh'), '\n# Different branch version\n');
                git(repo, 'add', '-A');
                git(repo, 'commit', '-m', 'different wrapper');
                git(repo, 'switch', 'main');
            }
            const inputBranch = mode.startsWith('input-branch-') || mode === 'input-ff-missing';
            if (inputBranch) {
                const branch = runner === 'implement-tasks.sh' ? 'feat/probe' : 'fix/review-2026-10-04';
                git(repo, 'branch', branch);
                git(repo, 'switch', '-c', 'fixture-input-change');
                if (mode.endsWith('-missing') || mode.endsWith('-wrong-type')) fs.rmSync(input, { recursive: true });
                if (mode.endsWith('-wrong-type')) {
                    if (runner === 'implement-tasks.sh') write(input, '- [x] Wrong type.\n');
                    else write(path.join(input, 'nested.md'), '- [x] Wrong type.\n');
                }
                if (mode.endsWith('-invalid-utf8')) fs.writeFileSync(inputFile, Buffer.from([0xff]));
                fs.appendFileSync(path.join(repo, 'innocent.txt'), 'branch change\n');
                git(repo, 'add', '-A');
                git(repo, 'commit', '-m', 'selected branch inputs');
                const changed = git(repo, 'rev-parse', 'HEAD');
                git(repo, 'update-ref', `refs/heads/${branch}`, mode === 'input-ff-missing' ? initial : changed);
                git(repo, 'update-ref', `refs/remotes/origin/${branch}`, mode === 'input-ff-missing' ? changed : initial);
                git(repo, 'switch', 'main');
            }
            if (mode === 'input-start-unreadable') fs.chmodSync(inputFile, 0);
            const runRoot = mode === 'final-review-linked' ? repo + ' linked worktree' : repo;
            if (runRoot !== repo) {
                git(repo, 'worktree', 'add', '-b', 'fixture-linked', runRoot);
                assert(fs.statSync(path.join(runRoot, '.git')).isFile());
            }
            const log = path.join(tmp, `${runner}-${mode}.jsonl`);
            const marker = path.join(tmp, `${runner}-${mode}.compromised`);
            write(log, '');
            const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH,
                PROBE_LOG: log, PROBE_MODE: mode, PROBE_RUNNER: runner, PROBE_MARKER: marker,
                CREATE_PR: 'true', FINAL_REVIEW: 'true', MAX_TASKS: '2', MAX_FINDINGS: '2' };
            const runnerArgs = [path.join(runRoot, 'scripts', runner),
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
                : run('bash', runnerArgs, runRoot, env);
            // Restore permissions only after the runner exits, for fixture cleanup.
            if (mode.includes('unreadable')) {
                if (fs.existsSync(inputFile)) fs.chmodSync(inputFile, 0o644);
                if (mode.endsWith('-directory')) fs.chmodSync(path.join(input, 'nested'), 0o755);
            }
            const history = fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
            if (mode.startsWith('verdict-')) {
                const testCase = verdictCases[mode.slice('verdict-'.length)];
                assert.equal(result.status, testCase.pass ? 0 : 1, mode + result.stdout + result.stderr);
                assert.equal(history.filter(c => c.tool === 'final-message').length, 1);
                assert.equal(history.filter(c => c.tool === 'agent').length, 1);
                assert.equal(git(repo, 'rev-parse', 'HEAD'), initial);
                assert.equal(git(repo, 'status', '--porcelain'), '');
                if (testCase.pass) {
                    assert(history.some(c => c.tool === 'git' && c.args[0] === 'push'));
                    // No task commit is needed, so the PR gate reaches the
                    // existing-PR query and then correctly finds no new commits.
                    assert(history.some(c => c.tool === 'gh' && c.args[0] === 'pr'));
                } else {
                    assert.match(result.stderr, /Final review failed|unambiguous final verdict|Final reviewer exited with an error/);
                    assert(!history.some(c => c.tool === 'gh' ||
                        (c.tool === 'git' && ['add', 'commit', 'push'].includes(c.args[0]))));
                }
                count++;
                continue;
            }
            if (mode.startsWith('input-')) {
                if (mode === 'input-zero') {
                    assert.equal(result.status, 0, result.stdout + result.stderr);
                    assert.equal(history.filter(c => c.tool === 'agent').length, runner === 'implement-tasks.sh' ? 1 : 0);
                    assert(history.some(c => c.tool === 'git' && c.args[0] === 'push'));
                } else {
                    assert.equal(result.status, 1, result.stdout + result.stderr);
                    // Git may itself report unreadable tracked input as dirty
                    // immediately after switching; that guard also fails closed.
                    assert.match(result.stderr, /Cannot parse Markdown tasks|Review file not found|Task module does not exist|document changed unexpectedly|Commit or stash them before continuing/);
                    assert(!history.some(c => c.tool === 'gh' || (c.tool === 'git' && ['add', 'commit', 'push'].includes(c.args[0]))), result.stdout);
                    assert.equal(history.filter(c => c.tool === 'agent').length, mode.startsWith('input-agent-') ? 1 : 0);
                    if (mode === 'input-start-unreadable') assert(!history.some(c => c.tool === 'git' && ['fetch', 'switch', 'merge'].includes(c.args[0])));
                    if (mode === 'input-ff-missing') assert(history.some(c => c.tool === 'git' && c.args[0] === 'merge'));
                    assert.equal(git(repo, 'diff', '--cached', '--name-only'), '');
                    assert(!result.stdout.includes('All review findings are complete.'));
                    assert(!result.stdout.includes("All requirements for 'probe' are complete."));
                }
                count++;
                continue;
            }
            if (mode.startsWith('graph-') || metadataFailure) {
                assert.equal(result.status, 1, result.stdout + result.stderr);
                assert.match(result.stderr, metadataFailure ? metadataFailure[1]
                    : mode === 'graph-fenced-ref' ? /unknown task ID 'example'/ : /Dependency cycle/);
                if (metadataFailure) assert.match(result.stderr, /docs\/tasks\/probe\/01-requirements\.md:2/);
                assert(!history.some(c => c.tool === 'agent'));
                assert(!history.some(c => c.tool === 'gh' || (c.tool === 'git' && ['fetch', 'switch', 'merge', 'add', 'commit', 'push'].includes(c.args[0]))));
                count++;
                continue;
            }
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
            if (['normal', 'markdown', 'two-items', 'empty-manifest', 'metadata-valid', 'final-review-linked'].includes(mode) || mode.endsWith('-notes')) {
                assert.equal(result.status, 0, result.stdout + result.stderr);
                assert.equal(git(runRoot, 'rev-list', '--count', 'HEAD'), mode === 'two-items' ? '3' : '2');
                assert.equal(history.filter(c => c.tool === 'evidence').length, mode === 'two-items' ? 2 : 1);
                assert.equal(git(runRoot, 'status', '--porcelain'), '');
                assert(history.some(c => c.tool === 'gh' && c.args[0] === 'pr' && c.args[1] === 'create'));
                if (runner === 'implement-tasks.sh' && ['normal', 'final-review-linked'].includes(mode)) {
                    const adminDir = git(runRoot, 'rev-parse', '--absolute-git-dir');
                    const outputName = 'codex-task-final-review-probe.txt';
                    assert.equal(fs.readFileSync(path.join(adminDir, outputName), 'utf8'), 'VERDICT: PASS\n');
                    assert.equal(history.filter(c => c.tool === 'agent').length, 2);
                    if (runRoot !== repo) {
                        assert.notEqual(adminDir, path.join(repo, '.git'));
                        assert(!fs.existsSync(path.join(repo, '.git', outputName)), 'Linked review used the main checkout log');
                        assert.equal(git(repo, 'status', '--porcelain'), '');
                    } else {
                        assert(fs.statSync(path.join(repo, '.git')).isDirectory());
                    }
                }
            } else if (mode.startsWith('evidence-') || mode.startsWith('scope-')) {
                assert.equal(result.status, 1, result.stdout + result.stderr);
                assert.match(result.stderr, mode === 'evidence-manifest' || mode.startsWith('scope-') ? /Unassigned task\/review checkbox changes rejected/
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
    if (process.getuid() === 0) console.log('SKIP chmod-based unreadable input cases: root bypasses file permissions');
    console.log(`PASS ${count} isolated runner cases: kernel seals, validation evidence, repository checkbox scope, control-plane rejection, input errors, publication gates, normal completion`);
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

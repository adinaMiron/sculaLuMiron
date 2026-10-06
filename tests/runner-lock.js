// Offline concurrency integration: real local Git, fake model and publication.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const source = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-lock-'));
const bin = path.join(tmp, 'bin');
const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
const runners = ['implement-tasks.sh', 'fix-review.sh'];
const children = [];
function write(file, data, mode) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data, { mode });
}
function git(repo, ...args) {
    const result = spawnSync(realGit, args, { cwd: repo, encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}
function fixture(name) {
    const repo = path.join(tmp, name + ' with spaces');
    for (const file of [...runners, 'trusted-runner.py', 'codex-runner.sh', 'markdown-tasks.py']) {
        write(path.join(repo, 'scripts', file), fs.readFileSync(path.join(source, 'scripts', file)));
    }
    write(path.join(repo, 'docs/tasks/probe/01-requirements.md'), '- [ ] [ID:probe] Probe task.\n');
    write(path.join(repo, 'docs/reviews/2026-10-04-solar-calcule-review.md'), '- [ ] Probe finding.\n');
    git(repo, 'init', '-b', 'main');
    git(repo, 'config', 'user.email', 'fixture@example.invalid');
    git(repo, 'config', 'user.name', 'Runner fixture');
    git(repo, 'config', 'commit.gpgsign', 'false');
    git(repo, 'config', 'core.hooksPath', '/dev/null');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-m', 'fixture');
    git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    return repo;
}
function start(repo, runner, label, extra = {}) {
    const log = path.join(tmp, label + '.jsonl');
    write(log, '');
    const child = spawn('bash', [path.join(repo, 'scripts', runner),
        ...(runner === runners[0] ? ['probe'] : [])], {
        cwd: repo, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH,
            PROBE_LOG: log, PROBE_RUNNER: runner, PROBE_GATES: '', PROBE_FAIL: '',
            BASE: 'main', TASK_BRANCH: 'feat/probe', MAX_TASKS: '1', MAX_FINDINGS: '1',
            CREATE_PR: 'true', FINAL_REVIEW: 'true', ...extra }
    });
    const run = { child, log, output: '', closed: false };
    children.push(run);
    child.stdout.on('data', data => { run.output += data; });
    child.stderr.on('data', data => { run.output += data; });
    run.done = new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code, signal) => { run.closed = true; resolve({ code, signal }); });
    });
    return run;
}
async function until(predicate, message) {
    const deadline = Date.now() + 20000;
    while (!predicate()) {
        assert(Date.now() < deadline, message());
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}
async function finish(run, code) {
    await until(() => run.closed, () => 'Runner timed out:\n' + run.output);
    assert.equal((await run.done).code, code, run.output);
}
function history(run) {
    return fs.readFileSync(run.log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}
function snapshot(repo) {
    return [git(repo, 'symbolic-ref', 'HEAD'), git(repo, 'rev-parse', 'HEAD'),
        git(repo, 'status', '--porcelain'), git(repo, 'diff'), git(repo, 'diff', '--cached')];
}
async function rejected(repo, runner, label) {
    const before = snapshot(repo);
    const run = start(repo, runner, label);
    await finish(run, 1);
    assert.match(run.output, /Another task\/review runner holds the repository lock/);
    assert(history(run).every(c => c.tool === 'git' &&
        (c.args.includes('--show-toplevel') || c.args.includes('--git-common-dir'))),
    'Contender reached validation, branch preparation, agent, or publication');
    assert.deepEqual(snapshot(repo), before, 'Contender changed the branch, tree, or index');
}

async function main() {
    const adapter = `#!/usr/bin/env python3
import json, os, pathlib, subprocess, sys, time
tool = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
with open(os.environ['PROBE_LOG'], 'a') as out:
    out.write(json.dumps(dict(tool=tool, args=args)) + '\\n')
def gate(phase):
    directory = os.environ.get('PROBE_GATES')
    if not directory:
        return
    ready = pathlib.Path(directory) / (phase + '.ready')
    if ready.exists():
        return
    ready.write_text(str(os.getpid()))
    deadline = time.monotonic() + 30
    while not ready.with_suffix('.release').exists():
        if time.monotonic() > deadline:
            sys.exit('Fixture gate timed out: ' + phase)
        time.sleep(0.02)
if tool == 'git':
    if args[0] in ('fetch', 'add', 'push'):
        gate(args[0])
    if args[0] in ('fetch', 'push'):
        sys.exit(0)  # No remote is configured or contacted.
    sys.exit(subprocess.call([${JSON.stringify(realGit)}, *args]))
if tool == 'gh':
    if args[:2] == ['pr', 'create']:
        gate('pr')
    sys.exit(0)
if args[-1] == '-':
    gate('preflight')
    print('Invalid fixture configuration' if os.environ['PROBE_FAIL'] == 'preflight'
          else 'No prompt provided via stdin.', file=sys.stderr)
    sys.exit(1)
if 'You are the FINAL REVIEWER' in args[-1]:
    gate('final-review')
    print('VERDICT: PASS')
else:
    gate('agent')
    if os.environ['PROBE_FAIL'] == 'agent':
        sys.exit(42)
    doc = pathlib.Path('docs/tasks/probe/01-requirements.md' if os.environ['PROBE_RUNNER'] == 'implement-tasks.sh'
                       else 'docs/reviews/2026-10-04-solar-calcule-review.md')
    doc.write_text(doc.read_text().replace('- [ ]', '- [x]', 1))
`;
    for (const tool of ['git', 'gh', 'codex']) write(path.join(bin, tool), adapter, 0o755);

    let probes = 0;
    for (const ownerRunner of runners) {
        for (const contenderRunner of runners) {
            const label = `${ownerRunner}-${contenderRunner}`;
            const repo = fixture(label);
            const gates = path.join(tmp, label + '-gates');
            fs.mkdirSync(gates);
            // A linked worktree has a .git file and must use the same lock.
            const linked = path.join(tmp, label + '-linked');
            git(repo, 'worktree', 'add', '-b', 'linked-probe', linked, 'HEAD');
            const owner = start(repo, ownerRunner, label + '-owner', { PROBE_GATES: gates });
            const phases = ['preflight', 'fetch', 'agent', 'add', 'push',
                ...(ownerRunner === runners[0] ? ['final-review'] : []), 'pr'];
            for (const phase of phases) {
                await until(() => fs.existsSync(path.join(gates, phase + '.ready')),
                    () => `Missing ${phase} gate:\n${owner.output}`);
                await rejected(repo, contenderRunner, label + '-' + phase);
                if (phase === 'agent') {
                    await rejected(linked, contenderRunner, label + '-linked');
                    probes++;
                }
                probes++;
                write(path.join(gates, phase + '.release'), '');
            }
            await finish(owner, 0);
            assert.equal(git(repo, 'status', '--porcelain'), '');
            const lock = path.join(repo, '.git/codex-runner.lock');
            const inode = fs.statSync(lock).ino;
            // Normal completion releases the kernel lock without deleting it.
            await finish(start(repo, contenderRunner, label + '-after'), 0);
            assert.equal(fs.statSync(lock).ino, inode);
        }
    }

    for (const runner of runners) {
        for (const failure of ['preflight', 'agent']) {
            const repo = fixture(runner + '-' + failure);
            const failed = start(repo, runner, runner + '-' + failure + '-failed', { PROBE_FAIL: failure });
            await finish(failed, 1);
            assert(!history(failed).some(c => c.tool === 'gh' ||
                (c.tool === 'git' && ['add', 'commit', 'push'].includes(c.args[0]))));
            await finish(start(repo, runner, runner + '-' + failure + '-retry'), 0);
        }
        const repo = fixture(runner + '-bad-lock');
        fs.mkdirSync(path.join(repo, '.git/codex-runner.lock'));
        const failed = start(repo, runner, runner + '-bad-lock');
        await finish(failed, 1);
        assert.match(failed.output, /Trusted wrapper boundary failed/);
        assert(history(failed).every(c => c.tool === 'git' && c.args[0] === '-C'));
    }

    // Killing only the Python launcher must not release the surviving Bash
    // wrapper's lock. After its descendants exit, no stale lock blocks a retry.
    const repo = fixture('terminated-launcher');
    const gates = path.join(tmp, 'terminated-gates');
    fs.mkdirSync(gates);
    for (const phase of ['preflight', 'fetch', 'add', 'push', 'final-review', 'pr']) {
        write(path.join(gates, phase + '.release'), '');
    }
    const owner = start(repo, runners[0], 'terminated-owner', { PROBE_GATES: gates });
    await until(() => fs.existsSync(path.join(gates, 'agent.ready')), () => owner.output);
    owner.child.kill('SIGTERM');
    await rejected(repo, runners[1], 'terminated-contender');
    write(path.join(gates, 'agent.release'), '');
    await until(() => owner.closed, () => owner.output);
    assert.equal((await owner.done).signal, 'SIGTERM');
    assert(history(owner).some(c => c.tool === 'gh' && c.args[1] === 'create'));
    await finish(start(repo, runners[1], 'terminated-retry'), 0);
    console.log(`PASS ${probes} concurrent probes: all task/review pairings, full-run lock, linked worktrees, release after success/failure/termination, fail-closed lock errors`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    for (const run of children) {
        if (!run.closed) {
            try { process.kill(-run.child.pid, 'SIGKILL'); } catch (error) {
                if (error.code !== 'ESRCH') throw error;
            }
            await run.done;
        }
    }
    fs.rmSync(tmp, { recursive: true, force: true });
});

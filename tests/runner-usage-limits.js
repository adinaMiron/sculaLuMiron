// Offline usage-limit recovery: disposable Git repositories, fake CLI/remotes,
// and fake sleeps. The cancellation case uses a real, interrupted sleeper.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const source = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-usage-'));
const bin = path.join(tmp, 'bin');
const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
const scripts = ['trusted-runner.py', 'markdown-tasks.py', 'codex-runner.sh', 'implement-tasks.sh', 'fix-review.sh'];
function write(file, data, mode) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data, { mode });
}
function run(cmd, args, cwd, env = process.env, input) {
    const result = spawnSync(cmd, args, { cwd, env, input, encoding: 'utf8', timeout: 20000 });
    assert.ifError(result.error);
    return result;
}
function git(repo, ...args) {
    const result = run(realGit, args, repo);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}
function history(log) {
    return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
}

async function main() {
    const unit = run('python3', ['-I', '-c', `
import datetime, io, json, os, runpy, sys, time
from contextlib import redirect_stdout, redirect_stderr
os.environ['TZ'] = 'UTC'
time.tzset()
module = runpy.run_path(sys.argv[1])
delay = module['usage_retry_delay']
now = datetime.datetime(2026, 10, 6, 10, 0, tzinfo=datetime.timezone.utc).timestamp()
def check(error, expected):
    assert delay(error, 300, now) == expected, (error, delay(error, 300, now), expected)
limit = "You've hit your usage limit. "
for message, expected in [
    (limit, 300),
    (limit + 'Try again in 2h 3m 4s.', 7389),
    (limit + 'Try again in 5 minutes.', 305),
    (limit + 'Try again at 10:30 AM.', 1805),
    (limit + 'Try again at 9:00 AM.', 82805),
    (limit + 'Try again at 10:00 AM.', 300),
    (limit + 'Try again at 10:30 AM on Oct 6, 2026.', 1805),
    (limit + 'Try again at Oct 6th, 2026 10:30 AM.', 1805),
    (limit + 'Try again at Oct 6, 2026 at 10:30 AM.', 1805),
    (limit + 'Try again at Oct 6 at 10:30 AM.', 1805),
    (limit + 'Try again at 2026-10-06T13:30:00+03:00.', 1805),
    (limit + 'Try again at Oct 5, 2026 10:30 AM.', 300),
    (limit + 'Try again at an unfamiliar time.', 300),
    ('usage limit reached', 300),
    ('You’ve hit your usage limit.', 300),
    ('HTTP 429: too many requests', 0),
    ('insufficient_quota: billing required', 0),
    ('Authentication failed', 0),
]: check({'message': message}, expected)
check({'code': 'usage_limit_reached', 'resets_at': now + 3600}, 3605)
check({'code': 'usage_limit_reached', 'resets_at': now - 1}, 300)
check({'code': 'usage_limit_reached', 'retry_after_seconds': 10.5}, 16)
for value in ['NaN', 'Infinity', 'bad', -1, True, None]:
    check({'code': 'usage_limit_reached', 'resets_at': value}, 300)
for value in [None, [], 'usage_limit_reached', {'message': []}]: check(value, 0)
os.environ['TZ'] = 'Europe/Bucharest'
time.tzset()
check({'message': limit + 'Try again at 1:30 PM.'}, 1805)
os.environ['TZ'] = 'UTC'
time.tzset()
def stream(events):
    sys.stdin = io.StringIO(''.join(json.dumps(e) + '\\n' for e in events))
    output = io.StringIO()
    with redirect_stdout(output), redirect_stderr(io.StringIO()):
        module['watch_codex_events'](300)
    return int(output.getvalue())
failure = {'type': 'turn.failed', 'error': {'message': limit}}
assert stream([failure]) == 300
assert stream([failure, {'type': 'turn.completed'}]) == 0
assert stream([failure, {'type': 'error', 'message': 'Authentication failed'}]) == 0
assert stream([{'type': 'item.completed', 'item': {'text': json.dumps(failure)}}]) == 0
assert stream([{'type': 'error', 'message': limit}]) == 300
print('PASS usage classification, reset times, fallback, and event isolation')
`, path.join(source, 'scripts/trusted-runner.py')], source);
    assert.equal(unit.status, 0, unit.stderr);
    process.stdout.write(unit.stdout);

    write(path.join(bin, 'git'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PROBE_LOG, JSON.stringify({tool: 'git', args}) + '\\n');
if (['fetch', 'push'].includes(args[0])) process.exit(0);
const r = require('node:child_process').spawnSync(${JSON.stringify(realGit)}, args, {stdio: 'inherit'});
process.exit(r.status ?? 99);
`, 0o755);
    write(path.join(bin, 'codex'), `#!/usr/bin/env python3
import json, os, pathlib, subprocess, sys
args = sys.argv[1:]
assert '--json' in args
if args[-1] == '-':
    print('No prompt provided via stdin.', file=sys.stderr)
    sys.exit(1)
log = pathlib.Path(os.environ['PROBE_LOG'])
events = [json.loads(line) for line in log.read_text().splitlines()]
review = 'You are the FINAL REVIEWER' in args[-1]
attempt = 1 + sum(e.get('tool') == 'agent' and e['review'] == review for e in events)
with log.open('a') as out:
    out.write(json.dumps({'tool': 'agent', 'attempt': attempt, 'review': review, 'prompt': args[-1]}) + '\\n')
mode = os.environ['PROBE_MODE']
document = pathlib.Path(os.environ['PROBE_DOC'])
output = pathlib.Path(args[args.index('--output-last-message') + 1]) if review else None
limit = {'type': 'turn.failed', 'error': {'message': "You've hit your usage limit. Try again in 2 seconds."}}
if not mode.startswith('final-') or review:
    if attempt == 1 or (mode == 'repeat' and attempt == 2) or mode.startswith('cancel'):
        if mode == 'ordinary':
            print(json.dumps({'type': 'turn.failed', 'error': {'message': 'Authentication failed'}}))
            sys.exit(23)
        if mode == 'quoted':
            print(json.dumps({'type': 'item.completed', 'item': {'text': json.dumps(limit)}}))
            print("You've hit your usage limit.", file=sys.stderr)
            sys.exit(1)
        if mode == 'fallback': limit['error']['message'] = "You've hit your usage limit."
        if mode == 'assigned-tamper': document.write_text('- [ ] Rewritten assignment.\\n')
        elif mode == 'other-tamper': pathlib.Path('docs/tasks/other/requirements.md').write_text('- [x] Other.\\n')
        elif mode == 'control-tamper': pathlib.Path('scripts/evil.sh').write_text('evil')
        elif mode == 'staged':
            pathlib.Path('partial.txt').write_text('partial work\\n')
            subprocess.run([os.environ['REAL_GIT'], 'add', 'partial.txt'], check=True)
        elif mode == 'checked': document.write_text(document.read_text().replace('- [ ]', '- [x]'))
        elif mode == 'final-dirty': pathlib.Path('review-edit.txt').write_text('forbidden')
        if review: output.write_text('VERDICT: PASS\\n')
        elif mode in ('repeat', 'fallback', 'checked') or mode.startswith('cancel'): pathlib.Path('partial.txt').write_text('partial work\\n')
        print(json.dumps(limit))
        if mode == 'later-error': print(json.dumps({'type': 'error', 'message': 'Authentication failed'}))
        sys.exit(130 if mode == 'signal' else 0 if mode == 'zero' else 1)
    assert 'USAGE-LIMIT RECOVERY' in args[-1]
    if mode in ('repeat', 'fallback', 'checked'): assert pathlib.Path('partial.txt').read_text() == 'partial work\\n'
if review:
    assert output.read_text() == '', 'A stale verdict survived the retry'
    if mode != 'final-stale': output.write_text('VERDICT: PASS\\n')
else:
    document.write_text(document.read_text().replace('- [ ]', '- [x]'))
print(json.dumps({'type': 'turn.completed'}))
`, 0o755);
    write(path.join(bin, 'sleep'), `#!/usr/bin/env python3
import json, os, pathlib, time
log = pathlib.Path(os.environ['PROBE_LOG'])
with log.open('a') as out:
    out.write(json.dumps({'tool': 'sleep', 'seconds': __import__('sys').argv[1], 'parent': os.getppid()}) + '\\n')
if os.environ['PROBE_MODE'] == 'wait-tamper': pathlib.Path('scripts/evil.sh').write_text('evil')
if os.environ['PROBE_MODE'].startswith('cancel'): time.sleep(300)
`, 0o755);

    function fixture(runner, mode) {
        const repo = path.join(tmp, runner + '-' + mode);
        fs.mkdirSync(repo);
        for (const script of scripts) write(path.join(repo, 'scripts', script), fs.readFileSync(path.join(source, 'scripts', script)));
        const doc = runner === 'implement-tasks.sh' ? 'docs/tasks/probe/requirements.md' : 'docs/reviews/2026-10-04-solar-calcule-review.md';
        write(path.join(repo, doc), '- [ ] Probe assignment.\n');
        write(path.join(repo, 'docs/tasks/other/requirements.md'), '- [ ] Other.\n');
        git(repo, 'init', '-b', 'main');
        git(repo, 'config', 'user.email', 'fixture@example.invalid');
        git(repo, 'config', 'user.name', 'Offline fixture');
        git(repo, 'add', '-A');
        git(repo, 'commit', '-m', 'fixture');
        git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
        const log = path.join(tmp, runner + '-' + mode + '.jsonl');
        write(log, '');
        const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH,
            PROBE_LOG: log, PROBE_MODE: mode, PROBE_DOC: doc, REAL_GIT: realGit,
            CODEX_USAGE_RETRY_SECONDS: '17', CREATE_PR: 'false', FINAL_REVIEW: mode.startsWith('final-') ? 'true' : 'false',
            BASE: 'main', TASK_BRANCH: 'feat/probe', MAX_TASKS: '1', MAX_FINDINGS: '1' };
        return { repo, log, doc, env, args: [path.join(repo, 'scripts', runner), ...(runner === 'implement-tasks.sh' ? ['probe'] : [])] };
    }
    let count = 0;
    for (const runner of ['implement-tasks.sh', 'fix-review.sh']) {
        for (const mode of ['repeat', 'fallback', 'checked', 'ordinary', 'quoted', 'later-error', 'signal', 'zero',
            'assigned-tamper', 'other-tamper', 'control-tamper', 'staged', 'wait-tamper',
            ...(runner === 'implement-tasks.sh' ? ['final-retry', 'final-stale', 'final-dirty'] : [])]) {
            const f = fixture(runner, mode);
            const result = run('bash', f.args, f.repo, f.env);
            const events = history(f.log);
            const attempts = events.filter(e => e.tool === 'agent' && e.review === mode.startsWith('final-'));
            const sleeps = events.filter(e => e.tool === 'sleep');
            const succeeds = ['repeat', 'fallback', 'checked', 'final-retry'].includes(mode);
            assert.equal(result.status, succeeds ? 0 : 1, mode + '\n' + result.stdout + result.stderr);
            assert.equal(attempts.length, mode === 'repeat' ? 3 : succeeds || mode === 'final-stale' ? 2 : 1, mode);
            assert.equal(sleeps.length, mode === 'repeat' ? 2 : succeeds || ['wait-tamper', 'final-stale'].includes(mode) ? 1 : 0, mode);
            for (const sleep of sleeps) assert.equal(sleep.seconds, mode === 'fallback' ? '17' : '7', mode);
            if (succeeds) {
                assert.equal(git(f.repo, 'status', '--porcelain'), '');
                assert.equal(fs.readFileSync(path.join(f.repo, f.doc), 'utf8'), '- [x] Probe assignment.\n');
                assert.equal(events.filter(e => e.tool === 'git' && e.args[0] === 'commit').length, 1);
                const firstPublish = events.findIndex(e => e.tool === 'git' && ['add', 'commit', 'push'].includes(e.args[0]));
                if (!mode.startsWith('final-')) assert(firstPublish > events.lastIndexOf(attempts.at(-1)));
            } else if (!mode.startsWith('final-')) {
                assert(!events.some(e => e.tool === 'git' && ['add', 'commit', 'push'].includes(e.args[0])));
            }
            if (mode === 'final-stale') assert.match(result.stderr, /unambiguous final verdict/);
            if (mode === 'final-dirty') assert.match(result.stderr, /Final reviewer modified/);
            count++;
        }
        for (const signal of ['SIGINT', 'SIGTERM']) {
            const f = fixture(runner, 'cancel-' + signal);
            const child = spawn('bash', f.args, { cwd: f.repo, env: f.env, stdio: ['ignore', 'ignore', 'pipe'] });
            let diagnostics = '';
            child.stderr.on('data', data => { diagnostics += data; });
            const ended = new Promise(resolve => child.on('exit', (code, signal) => resolve({ code, signal })));
            const deadline = Date.now() + 15000;
            let sleeper;
            while (!(sleeper = history(f.log).find(e => e.tool === 'sleep')) && Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            assert(sleeper, diagnostics);
            const contender = run('bash', f.args, f.repo, f.env);
            assert.equal(contender.status, 1);
            assert.match(contender.stderr, /repository lock/);
            process.kill(sleeper.parent, signal);
            const outcome = await Promise.race([ended, new Promise(resolve => setTimeout(() => resolve(null), 5000).unref())]);
            assert(outcome, 'Cancellation did not stop the runner');
            assert.equal(outcome.code, signal === 'SIGINT' ? 130 : 143, diagnostics);
            assert.equal(history(f.log).filter(e => e.tool === 'agent').length, 1);
            assert.equal(fs.readFileSync(path.join(f.repo, 'partial.txt'), 'utf8'), 'partial work\n');
            const lock = run('python3', ['-I', '-c', 'import fcntl,sys; f=open(sys.argv[1],"a+b"); fcntl.flock(f, fcntl.LOCK_EX|fcntl.LOCK_NB)', path.join(f.repo, '.git/codex-runner.lock')], f.repo);
            assert.equal(lock.status, 0, 'Cancelled wait leaked the repository lock: ' + lock.stderr);
            count++;
        }
    }
    console.log(`PASS ${count} offline recovery cases: partial work, repeated limits, publication guards, final review, cancellation, and locking`);
}
main().then(() => fs.rmSync(tmp, { recursive: true, force: true })).catch(error => {
    console.error(error);
    console.error('Fixtures retained at ' + tmp);
    process.exitCode = 1;
});

// Offline runner integration checks; --real-codex also probes the installed CLI
// with empty stdin only. No model session or real Git mutation is launched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const source = path.resolve(__dirname, '..');
const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-preflight-'));
const repo = path.join(tmp, 'repo with "quotes" and \\slashes');
const bin = path.join(tmp, 'bin');
const log = path.join(tmp, 'calls.jsonl');
const helper = path.join(repo, 'scripts/codex-runner.sh');
const features = ['apps', 'plugins', 'remote_plugin', 'multi_agent', 'hooks', 'goals', 'memories'];
function write(file, text, mode) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, { mode });
}
function run(command, args, env, input = '') {
    const result = spawnSync(command, args, {
        cwd: repo, env, input, encoding: 'utf8', timeout: 15000
    });
    assert.ifError(result.error);
    return result;
}
function calls() {
    return fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}
try {
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
    for (const name of ['codex-runner.sh', 'fix-review.sh', 'implement-tasks.sh', 'trusted-runner.py', 'markdown-tasks.py']) {
        const content = fs.readFileSync(path.join(source, 'scripts', name), 'utf8');
        // Keep the disposable review target independent of the live run target.
        write(path.join(repo, 'scripts', name), name === 'fix-review.sh'
            ? content.replace(/^REVIEW=.*$/m, 'REVIEW="docs/reviews/2026-10-04-solar-calcule-review.md"')
                .replace(/^BRANCH=.*$/m, 'BRANCH="fix/review-2026-10-04"') : content);
    }
    write(path.join(repo, 'docs/tasks/probe/01-requirements.md'), '- [ ] [ID:probe] Probe task.\n');
    write(path.join(repo, 'docs/reviews/2026-10-04-solar-calcule-review.md'), '- [ ] Probe finding.\n');
    const recorder = `
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PROBE_LOG, JSON.stringify({tool: require('node:path').basename(process.argv[1]), args}) + '\\n');
`;
    write(path.join(bin, 'git'), '#!/usr/bin/env node\n' + recorder + `
if (args.includes('--show-toplevel')) console.log(process.env.PROBE_REPO);
else if (args.includes('--git-common-dir')) console.log('.git');
else if (args.includes('--absolute-git-dir')) console.log(require('node:path').join(process.env.PROBE_REPO, '.git'));
else if (args[0] === 'status' || args[0] === 'ls-files') process.exit(0);
else if (args[0] === 'check-ref-format') {
    const result = require('node:child_process').spawnSync(${JSON.stringify(realGit)}, args);
    process.exit(result.status ?? 99);
}
else { console.error('Git mutation sentinel'); process.exit(73); }
`, 0o755);
    write(path.join(bin, 'codex'), '#!/usr/bin/env node\n' + recorder + `
const assert = require('node:assert/strict');
assert.deepEqual(args.slice(0, 3), ['--ask-for-approval', 'never', 'exec']);
for (const flag of ['--json', '--strict-config', '--ephemeral', '--ignore-user-config', '--ignore-rules']) assert(args.includes(flag));
assert.equal(args[args.indexOf('--sandbox') + 1], 'workspace-write');
assert(args.includes('sandbox_workspace_write.network_access=true'));
assert(args.includes('features.network_proxy={enabled=true,domains={},unix_sockets={},allow_upstream_proxy=false,allow_local_binding=false,dangerously_allow_non_loopback_proxy=false,dangerously_allow_all_unix_sockets=false,enable_socks5=false,enable_socks5_udp=false,proxy_url="http://127.0.0.1:0"}'));
for (const feature of ${JSON.stringify(features)}) assert(args.some((a, i) => a === '--disable' && args[i + 1] === feature));
if (args.at(-1) !== '-') process.exit(74); // Fake model launch, never real.
assert.equal(fs.readFileSync(0, 'utf8'), '', 'preflight must not read caller input');
switch (process.env.PROBE_MODE) {
case 'output-unsupported': assert(args.includes('--output-last-message')); console.error("unexpected argument '--output-last-message'"); process.exit(2);
case 'syntax': console.error("unexpected argument '--ignore-rules'"); process.exit(2);
case 'feature': console.error('Unknown feature flag: remote_plugin'); process.exit(1);
case 'config': console.error('Error loading config.toml: unknown configuration field'); process.exit(1);
case 'silent': process.exit(1);
case 'zero': console.error('No prompt provided via stdin.'); process.exit(0);
case 'late-error': console.error('No prompt provided via stdin.\\nError: invalid config'); process.exit(1);
default: console.error('WARNING: harmless startup diagnostic\\nNo prompt provided via stdin.'); process.exit(1);
}
`, 0o755);
    const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH,
        PROBE_LOG: log, PROBE_REPO: repo, CREATE_PR: 'false', FINAL_REVIEW: 'false',
        BASE: 'main', TASK_BRANCH: 'feat/probe', CODEX_USAGE_RETRY_SECONDS: '300',
        CODEX_MODEL: '', CODEX_EFFORT: '' };
    const gitMutations = history => history.filter(c => c.tool === 'git' &&
        !c.args.includes('--show-toplevel') && !c.args.includes('--git-common-dir') && !c.args.includes('--absolute-git-dir') &&
        !['status', 'ls-files', 'check-ref-format'].includes(c.args[0]));
    for (const runner of ['implement-tasks.sh', 'fix-review.sh']) {
        const argv = [path.join(repo, 'scripts', runner), ...(runner === 'implement-tasks.sh' ? ['probe'] : [])];
        for (const [key, values] of [
            ['CODEX_MODEL', ['--model', 'gpt model', 'gpt/model', 'gpt"model', 'gpt\nmodel', '$(false)', '`false`']],
            ['CODEX_EFFORT', ['HIGH', 'unknown', 'high low', 'high\n', '"high"', '$(false)']]
        ]) {
            for (const value of values) {
                write(log, '');
                const result = run('bash', argv, { ...env, [key]: value });
                assert.equal(result.status, 1, result.stderr);
                assert.match(result.stderr, new RegExp(key + ' must be'));
                assert.deepEqual(gitMutations(calls()), []);
                assert(!calls().some(c => c.tool === 'codex'));
            }
        }
        for (const config of [
            {}, { CODEX_MODEL: 'gpt-6.1-sol' }, { CODEX_EFFORT: 'high' },
            ...['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']
                .map(effort => ({ CODEX_MODEL: 'gpt-6.1-sol', CODEX_EFFORT: effort }))
        ]) {
            write(log, '');
            const result = run('bash', argv, { ...env, ...config, PROBE_MODE: 'valid' });
            assert.equal(result.status, 73, result.stdout + result.stderr);
            const args = calls().find(c => c.tool === 'codex').args;
            assert.equal(args.includes('--model'), Boolean(config.CODEX_MODEL));
            if (config.CODEX_MODEL) assert.equal(args[args.indexOf('--model') + 1], config.CODEX_MODEL);
            const effortArgs = args.filter(a => a.startsWith('model_reasoning_effort='));
            assert.deepEqual(effortArgs, config.CODEX_EFFORT ? [`model_reasoning_effort="${config.CODEX_EFFORT}"`] : []);
            assert.deepEqual(gitMutations(calls()).map(c => c.args[0]), ['fetch']);
        }
        write(log, '');
        const help = run('bash', [path.join(repo, 'scripts', runner), '--help'], env);
        assert.equal(help.status, 0, help.stderr);
        assert.match(help.stdout, /CODEX_MODEL/);
        assert.match(help.stdout, /CODEX_EFFORT/);
        assert.deepEqual(gitMutations(calls()), []);
        assert(!calls().some(c => c.tool === 'codex'));

        const runnerFile = path.join(repo, 'scripts', runner);
        const originalScript = fs.readFileSync(runnerFile, 'utf8');
        const defaultEnv = { ...env, PROBE_MODE: 'valid' };
        delete defaultEnv.CODEX_MODEL;
        delete defaultEnv.CODEX_EFFORT;
        try {
            assert.match(originalScript, /^DEFAULT_CODEX_MODEL="[^"]*"$/m, 'script must expose an editable model default');
            assert.match(originalScript, /^DEFAULT_CODEX_EFFORT="[^"]*"$/m, 'script must expose an editable effort default');
            const withDefaults = originalScript
                .replace(/^DEFAULT_CODEX_MODEL=.*$/m, 'DEFAULT_CODEX_MODEL="gpt-6.1-sol"')
                .replace(/^DEFAULT_CODEX_EFFORT=.*$/m, 'DEFAULT_CODEX_EFFORT="high"');
            write(runnerFile, withDefaults);
            for (const [overrides, model, effort] of [
                [{}, 'gpt-6.1-sol', 'high'],
                [{ CODEX_MODEL: 'gpt-6-astra' }, 'gpt-6-astra', 'high'],
                [{ CODEX_EFFORT: 'low' }, 'gpt-6.1-sol', 'low'],
                [{ CODEX_MODEL: 'gpt-6-astra', CODEX_EFFORT: 'medium' }, 'gpt-6-astra', 'medium'],
                [{ CODEX_MODEL: '' }, '', 'high'],
                [{ CODEX_EFFORT: '' }, 'gpt-6.1-sol', ''],
                [{ CODEX_MODEL: '', CODEX_EFFORT: '' }, '', '']
            ]) {
                write(log, '');
                const result = run('bash', argv, { ...defaultEnv, ...overrides });
                assert.equal(result.status, 73, result.stdout + result.stderr);
                const args = calls().find(c => c.tool === 'codex').args;
                assert.equal(args.includes('--model'), Boolean(model));
                if (model) assert.equal(args[args.indexOf('--model') + 1], model);
                assert.deepEqual(args.filter(a => a.startsWith('model_reasoning_effort=')),
                    effort ? [`model_reasoning_effort="${effort}"`] : []);
            }
            for (const [key, value] of [['MODEL', 'bad model'], ['EFFORT', 'unknown']]) {
                write(runnerFile, withDefaults.replace(
                    new RegExp('^DEFAULT_CODEX_' + key + '=.*$', 'm'),
                    `DEFAULT_CODEX_${key}="${value}"`));
                write(log, '');
                const result = run('bash', argv, defaultEnv);
                assert.equal(result.status, 1, result.stderr);
                assert.match(result.stderr, new RegExp('CODEX_' + key + ' must be'));
                assert.deepEqual(gitMutations(calls()), []);
                assert(!calls().some(c => c.tool === 'codex'));
            }
        } finally {
            write(runnerFile, originalScript);
        }
    }
    console.log('PASS both runners: editable script defaults, environment precedence, empty resets, effort levels, help, and invalid input before Codex/Git mutation');
    for (const runner of ['implement-tasks.sh', 'fix-review.sh']) {
        for (const interval of ['0', '-1', '1.5', '01', '1000000', '$(false)', 'abc']) {
            write(log, '');
            const result = run('bash', [path.join(repo, 'scripts', runner),
                ...(runner === 'implement-tasks.sh' ? ['probe'] : [])],
                { ...env, CODEX_USAGE_RETRY_SECONDS: interval });
            assert.equal(result.status, 1, result.stderr);
            assert.match(result.stderr, /CODEX_USAGE_RETRY_SECONDS must be/);
            assert.deepEqual(gitMutations(calls()), []);
            assert(!calls().some(c => c.tool === 'codex'));
        }
    }
    console.log('PASS retry configuration rejected before model invocation or Git mutation');
    for (const createPR of ['true', 'false']) {
        for (const finalReview of ['true', 'false']) {
            write(log, '');
            const result = run('bash', [path.join(repo, 'scripts/implement-tasks.sh'), 'probe'],
                { ...env, CREATE_PR: createPR, FINAL_REVIEW: finalReview, PROBE_MODE: 'valid' });
            const rejected = createPR === 'true' && finalReview === 'false';
            assert.equal(result.status, rejected ? 1 : 73, result.stdout + result.stderr);
            if (rejected) assert.match(result.stderr, /CREATE_PR=true requires FINAL_REVIEW=true/);
            assert.deepEqual(gitMutations(calls()).map(c => c.args[0]), rejected ? [] : ['fetch']);
            assert.equal(calls().filter(c => c.tool === 'codex').length, rejected ? 0 : 1);
        }
    }
    console.log('PASS final review configuration: all four PR/review combinations, bypass rejected before agent or Git mutation');
    const invalidBranches = [
        ['main', 'main', /TASK_BRANCH must differ from BASE/],
        ['release/stable', 'release/stable', /TASK_BRANCH must differ from BASE/],
        ['release/stable', 'main', /TASK_BRANCH targets a protected branch/],
        ['main', 'master', /TASK_BRANCH targets a protected branch/],
    ];
    for (const name of ['bad..name', 'bad name', '-option', 'HEAD', '@{-1}',
        'refs/heads/main', 'refs/remotes/origin/main', 'topic:main', 'topic\nmain', 'topic.lock']) {
        invalidBranches.push(['main', name, /TASK_BRANCH must be a literal short branch name/]);
        invalidBranches.push([name, 'feat/probe', /BASE must be a literal short branch name/]);
    }
    for (const [base, branch, diagnostic] of invalidBranches) {
        write(log, '');
        const result = run('bash', [path.join(repo, 'scripts/implement-tasks.sh'), 'probe'],
            { ...env, BASE: base, TASK_BRANCH: branch, PROBE_MODE: 'valid' });
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stderr, diagnostic);
        assert.deepEqual(gitMutations(calls()), [], 'invalid branches must fail before fetch/switch/push or any Git mutation');
        assert.equal(calls().filter(c => c.tool === 'codex').length, 0);
    }
    // Defaults and valid overrides must still reach branch preparation.
    for (const config of [{ BASE: '', TASK_BRANCH: '' },
        { BASE: 'release/stable', TASK_BRANCH: 'fix/probe-v1.2' }]) {
        write(log, '');
        const result = run('bash', [path.join(repo, 'scripts/implement-tasks.sh'), 'probe'],
            { ...env, ...config, PROBE_MODE: 'valid' });
        assert.equal(result.status, 73, result.stderr);
        assert.deepEqual(gitMutations(calls()).map(c => c.args[0]), ['fetch']);
    }
    console.log(`PASS task branch validation: ${invalidBranches.length} invalid configurations before any Git mutation, defaults and valid overrides`);
    for (const runner of ['fix-review.sh', 'implement-tasks.sh']) {
        for (const mode of ['syntax', 'feature', 'config', 'silent', 'zero', 'late-error', 'valid']) {
            write(log, '');
            const result = run('bash', [path.join(repo, 'scripts', runner),
                ...(runner === 'implement-tasks.sh' ? ['probe'] : [])], { ...env, PROBE_MODE: mode },
                'Caller input must not become a preflight prompt.\n');
            const history = calls();
            assert.equal(history.filter(c => c.tool === 'codex').length, 1);
            const mutations = gitMutations(history);
            if (mode === 'valid') {
                assert.equal(result.status, 73, result.stderr);
                assert.deepEqual(mutations.map(c => c.args[0]), ['fetch']);
                assert(history.findIndex(c => c.tool === 'codex') < history.findIndex(c => c.args[0] === 'fetch'));
            } else {
                assert.equal(result.status, 1, result.stderr);
                assert.match(result.stderr, /CLI\/configuration preflight failed/);
                assert.deepEqual(mutations, [], 'failed preflight must precede every Git mutation');
            }
        }
    }
    // The preflight and execution paths must use identical policy arguments.
    write(log, '');
    const launch = run('bash', ['-c', `
set -Eeuo pipefail
REPO_ROOT="$PROBE_REPO"
die() { echo "$*" >&2; exit 1; }
assert_control_plane() { :; } # This unit probe isolates the CLI contract.
source "$1"
preflight_codex
run_codex_safely 'fixture prompt'
`, 'probe', helper], { ...env, CODEX_MODEL: 'gpt-6.1-sol', CODEX_EFFORT: 'high' });
    assert.equal(launch.status, 74, launch.stderr);
    const invocations = calls();
    assert.equal(invocations.length, 2);
    assert.deepEqual(invocations[0].args.slice(0, -1), invocations[1].args.slice(0, -1));
    console.log('PASS both runners: argument placement, fail-closed preflight before Git, shared launch arguments');

    for (const mode of ['valid', 'output-unsupported']) {
        write(log, '');
        const result = run('bash', [path.join(repo, 'scripts/implement-tasks.sh'), 'probe'],
            { ...env, FINAL_REVIEW: 'true', PROBE_MODE: mode });
        const history = calls();
        const args = history.find(c => c.tool === 'codex').args;
        assert.equal(args[args.indexOf('--output-last-message') + 1], '/dev/null');
        assert.equal(result.status, mode === 'valid' ? 73 : 1, result.stderr);
        assert.deepEqual(gitMutations(history).map(c => c.args[0]), mode === 'valid' ? ['fetch'] : []);
    }

    if (process.argv.includes('--real-codex')) {
        const home = path.join(tmp, 'codex-home');
        fs.mkdirSync(home);
        const realEnv = { ...process.env, CODEX_HOME: home, PROBE_REPO: repo,
            CODEX_MODEL: '', CODEX_EFFORT: '' };
        const probe = `
set -Eeuo pipefail
REPO_ROOT="$PROBE_REPO"
die() { echo "$*" >&2; exit 1; }
assert_control_plane() { :; } # This unit probe isolates the CLI contract.
source "$1"
shift
CODEX_SAFE_ARGS+=("$@")
preflight_codex
`;
        const version = run('codex', ['--version'], realEnv);
        assert.equal(version.status, 0, version.stderr);
        const valid = run('bash', ['-c', probe, 'probe', helper], realEnv);
        assert.equal(valid.status, 0, valid.stderr);
        const review = run('bash', ['-c', probe, 'probe', helper, '--output-last-message', '/dev/null'], realEnv);
        assert.equal(review.status, 0, review.stderr);
        const selected = run('bash', ['-c', probe, 'probe', helper],
            { ...realEnv, CODEX_MODEL: 'gpt-6.1-sol', CODEX_EFFORT: 'high' });
        assert.equal(selected.status, 0, selected.stderr);
        for (const override of [
            ['--unknown-runner-option'],
            ['--disable', 'unknown_runner_feature'],
            ['-c', 'unknown_runner_key=true'],
            ['-c', 'features.unknown_runner_feature=false'],
            ['-c', 'shell_environment_policy.inherit="invalid"'],
            ['-c', 'sandbox_workspace_write.network_access="invalid"'],
            ['-c', 'features.network_proxy.enabled="invalid"'],
            ['-c', 'features.network_proxy.unknown_runner_setting=true'],
            ['-c', 'web_search="invalid"']
        ]) {
            const invalid = run('bash', ['-c', probe, 'probe', helper, ...override], realEnv);
            assert.equal(invalid.status, 1, JSON.stringify(override) + invalid.stderr);
            assert.match(invalid.stderr, /CLI\/configuration preflight failed/);
        }
        // An empty prompt must be rejected only AFTER feature/config validation.
        // Also check that every supported feature override has an effective false
        // state, rather than relying on acceptance by the argument parser alone.
        const featureArgs = features.flatMap(f => ['--disable', f]);
        const listing = run('codex', [...featureArgs, 'features', 'list'], realEnv);
        assert.equal(listing.status, 0, listing.stderr);
        for (const feature of features) {
            const line = listing.stdout.split('\n').find(l => l.split(/\s+/)[0] === feature);
            assert(line && /\sfalse$/.test(line) && !/\bremoved\b/.test(line), line || feature);
        }
        console.log('PASS installed ' + version.stdout.trim() + ': strict config, all feature overrides, empty-stdin contract');
    }
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

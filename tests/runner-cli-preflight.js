// Offline runner integration checks; --real-codex also probes the installed CLI
// with empty stdin only. No model session or real Git mutation is launched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const source = path.resolve(__dirname, '..');
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
    for (const name of ['codex-runner.sh', 'fix-review.sh', 'implement-tasks.sh']) {
        write(path.join(repo, 'scripts', name), fs.readFileSync(path.join(source, 'scripts', name)));
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
else if (args[0] === 'status' || args[0] === 'ls-files') process.exit(0);
else { console.error('Git mutation sentinel'); process.exit(73); }
`, 0o755);
    write(path.join(bin, 'codex'), '#!/usr/bin/env node\n' + recorder + `
const assert = require('node:assert/strict');
assert.deepEqual(args.slice(0, 3), ['--ask-for-approval', 'never', 'exec']);
for (const flag of ['--strict-config', '--ephemeral', '--ignore-user-config', '--ignore-rules']) assert(args.includes(flag));
assert.equal(args[args.indexOf('--sandbox') + 1], 'workspace-write');
for (const feature of ${JSON.stringify(features)}) assert(args.some((a, i) => a === '--disable' && args[i + 1] === feature));
if (args.at(-1) !== '-') process.exit(74); // Fake model launch, never real.
assert.equal(fs.readFileSync(0, 'utf8'), '', 'preflight must not read caller input');
switch (process.env.PROBE_MODE) {
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
        PROBE_LOG: log, PROBE_REPO: repo, CREATE_PR: 'false', FINAL_REVIEW: 'false' };
    for (const runner of ['fix-review.sh', 'implement-tasks.sh']) {
        for (const mode of ['syntax', 'feature', 'config', 'silent', 'zero', 'late-error', 'valid']) {
            write(log, '');
            const result = run('bash', [path.join(repo, 'scripts', runner),
                ...(runner === 'implement-tasks.sh' ? ['probe'] : [])], { ...env, PROBE_MODE: mode },
                'Caller input must not become a preflight prompt.\n');
            const history = calls();
            assert.equal(history.filter(c => c.tool === 'codex').length, 1);
            const mutations = history.filter(c => c.tool === 'git' &&
                !c.args.includes('--show-toplevel') && !['status', 'ls-files'].includes(c.args[0]));
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
source "$1"
preflight_codex
run_codex_safely 'fixture prompt'
`, 'probe', helper], env);
    assert.equal(launch.status, 74, launch.stderr);
    const invocations = calls();
    assert.equal(invocations.length, 2);
    assert.deepEqual(invocations[0].args.slice(0, -1), invocations[1].args.slice(0, -1));
    console.log('PASS both runners: argument placement, fail-closed preflight before Git, shared launch arguments');

    if (process.argv.includes('--real-codex')) {
        const home = path.join(tmp, 'codex-home');
        fs.mkdirSync(home);
        const realEnv = { ...process.env, CODEX_HOME: home, PROBE_REPO: repo };
        const probe = `
set -Eeuo pipefail
REPO_ROOT="$PROBE_REPO"
die() { echo "$*" >&2; exit 1; }
source "$1"
shift
CODEX_SAFE_ARGS+=("$@")
preflight_codex
`;
        const version = run('codex', ['--version'], realEnv);
        assert.equal(version.status, 0, version.stderr);
        const valid = run('bash', ['-c', probe, 'probe', helper], realEnv);
        assert.equal(valid.status, 0, valid.stderr);
        for (const override of [
            ['--unknown-runner-option'],
            ['--disable', 'unknown_runner_feature'],
            ['-c', 'unknown_runner_key=true'],
            ['-c', 'features.unknown_runner_feature=false'],
            ['-c', 'shell_environment_policy.inherit="invalid"'],
            ['-c', 'sandbox_workspace_write.network_access="invalid"'],
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

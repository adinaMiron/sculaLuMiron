// Real local sandbox probe: no model call, remote service, or Git mutation.
// Run from a host that permits Codex to create its own Linux sandbox.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawnSync } = require('node:child_process');
const { promisify } = require('node:util');

const root = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-browser-'));
const unixPath = path.join(scratch, 'host.sock');
let hostConnections = 0;
const server = http.createServer((_req, res) => res.end('host must be unreachable'));
server.on('connection', () => hostConnections++);
const unix = net.createServer(socket => { hostConnections++; socket.end(); });

(async () => {
    // Read the real launch settings; changes to the helper affect this test too.
    const settings = spawnSync('bash', ['-c', `
set -Eeuo pipefail
REPO_ROOT="$1"
die() { echo "$*" >&2; exit 1; }
source "$REPO_ROOT/scripts/codex-runner.sh"
printf '%s\\0' "\${CODEX_SAFE_ARGS[@]}"
`, 'probe', root], { encoding: 'utf8' });
    assert.equal(settings.status, 0, settings.stderr);
    const launch = settings.stdout.split('\0');
    const config = [];
    for (let i = 0; i < launch.length; i++) {
        if (launch[i] === '-c' || launch[i] === '--disable') config.push(launch[i], launch[++i]);
    }
    assert(launch.includes('sandbox_workspace_write.network_access=true'));
    assert(config.some(value => value.startsWith('features.network_proxy=')));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await new Promise(resolve => unix.listen(unixPath, resolve));
    const port = server.address().port;
    const probe = `
const assert = require('node:assert/strict');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
async function blocked(target) {
    await new Promise((resolve, reject) => {
        const socket = net.createConnection(target);
        socket.once('connect', () => { socket.destroy(); reject(new Error('Reached host socket')); });
        socket.once('error', resolve);
        socket.setTimeout(1500, () => { socket.destroy(); resolve(); });
    });
}
(async () => {
    const ipc = spawnSync('python3', ['-c', 'import socket; a,b=socket.socketpair(); a.setsockopt(socket.SOL_SOCKET,socket.SO_PASSCRED,1); a.shutdown(socket.SHUT_WR)'], { encoding: 'utf8' });
    assert.equal(ipc.status, 0, ipc.stderr);
    console.log('PASS local Unix socket operations required by Chromium');
    await blocked({host: '127.0.0.1', port: ${port}});
    await blocked(${JSON.stringify(unixPath)});
    console.log('PASS direct host TCP and Unix socket access denied');
    const proxy = new URL(process.env.HTTP_PROXY || process.env.http_proxy);
    for (const target of ['http://127.0.0.1:${port}/denied', 'http://runner-test.invalid/denied', 'runner-test.invalid:443']) {
        const status = await new Promise((resolve, reject) => {
            const socket = net.createConnection({host: proxy.hostname, port: proxy.port});
            let response = '';
            const authority = target.startsWith('http:') ? new URL(target).host : target;
            socket.on('connect', () => socket.write((target.startsWith('http:') ? 'GET ' : 'CONNECT ')
                + target + ' HTTP/1.1\\r\\nHost: ' + authority + '\\r\\nConnection: close\\r\\n\\r\\n'));
            socket.on('data', data => {
                response += data;
                if (response.includes('\\r\\n')) { socket.destroy(); resolve(response.split(' ')[1]); }
            });
            socket.on('error', reject);
            socket.on('end', () => reject(new Error('Proxy closed without a status')));
            socket.setTimeout(3000, () => socket.destroy(new Error('Proxy timed out')));
        });
        assert.equal(status, '403', 'empty allowlist must reject ' + target);
    }
    console.log('PASS proxied host/public HTTP and HTTPS access denied');
    const { chromium } = require(${JSON.stringify(path.join(__dirname, 'node_modules/playwright'))});
    const browser = await chromium.launch(process.env.PW_CHROME_PATH
        ? {executablePath: process.env.PW_CHROME_PATH} : {});
    try {
        const page = await browser.newPage();
        await page.goto('data:text/html,<title>offline browser works</title>');
        assert.equal(await page.title(), 'offline browser works');
        console.log('PASS Playwright launches Chromium in the runner network sandbox');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
`;
    // sandbox has no --ignore-user-config option. An explicit named profile
    // fixes its filesystem/network permissions; proxy settings come from the
    // runner's complete table override, not the user's proxy configuration.
    const sandbox = ['sandbox', ...config,
        '-c', 'permissions.runner_browser_probe={filesystem={":root"="read",":workspace_roots"="write",":tmpdir"="write","/tmp"="write"},network={enabled=true}}',
        '-P', 'runner_browser_probe', '--'];
    const result = await promisify(execFile)('codex', [...sandbox, process.execPath, '-e', probe], {
        cwd: root, env: process.env, timeout: 30000, maxBuffer: 1024 * 1024
    });
    process.stdout.write(result.stdout);
    assert.equal(hostConnections, 0, 'no direct or proxied probe may reach the host');
    // Optional repository test paths let the reported failure be verified in
    // this same sandbox without starting an agent or the publishing wrapper.
    for (const test of process.argv.slice(2)) {
        const result = await promisify(execFile)('codex', [...sandbox, process.execPath, test], {
            cwd: root, env: process.env, timeout: 120000, maxBuffer: 1024 * 1024
        });
        process.stdout.write(result.stdout);
    }
})().catch(error => {
    console.error(error.stdout || '', error.stderr || error.message);
    process.exitCode = 1;
}).finally(() => {
    server.close();
    unix.close();
    fs.rmSync(scratch, { recursive: true, force: true });
});

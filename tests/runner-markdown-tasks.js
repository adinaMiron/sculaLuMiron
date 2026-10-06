// Shared grammar checks: no model, Git operations, or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const parser = path.join(root, 'scripts/markdown-tasks.py');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-tasks-'));
function parse(action, file, ...extra) {
    const result = spawnSync('python3', ['-I', parser, action, file, ...extra], { encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
}
try {
    const fixtures = [
        ['```md\n- [ ] Example\n```\n- [ ] Real', [4]],
        ['  ~~~~md\n- [ ] Example\n~~~\n- [ ] Example\n```\n- [ ] Example\n ~~~~~ \t\n - [ ] Real\n', [8]],
        ['````\n- [ ] Example\n```\n- [ ] Example\n```` trailing\n- [ ] Example\n`````\n  - [ ] Real\n', [8]],
        ['```\n- [ ] Unclosed example', []],
        ['    ```md\n- [ ] Indented fenced example\n    ```\n- [ ] Real\n', [4]],
        ['\t~~~\n- [ ] Tab-indented fenced example\n\t~~~\n- [ ] Real\n', [4]],
        ['```invalid`info\n- [ ] Real\n', [2]],
        ['- [ ] Zero\n - [ ] One\n  - [x] Two\n   - [X] Three\n    - [ ] Code\n\t- [ ] Code\n> - [ ] Quote\n* [ ] Star\n+ [ ] Plus\n1. [ ] Ordered\n- [ ]no separator\n-  [ ] Extra space\n- [y] Wrong state\n', [1, 2, 3, 4]],
        ['- [ ] CRLF\r\n\r\n   - [x] Complete\r\n- [ ] Last line', [1, 3, 4]],
        ['- [ ]\n- [ ]\tTab separator\n', [1, 2]],
    ];
    const file = path.join(tmp, 'fixture.md');
    for (const [content, expectedLines] of fixtures) {
        fs.writeFileSync(file, content);
        const rows = parse('manifest', file).trimEnd().split('\n').filter(Boolean).map(line => line.split('\t'));
        assert.deepEqual(rows.map(row => Number(row[1])), expectedLines, content);
        const pending = rows.filter(row => row[2] === 'pending');
        assert.equal(parse('count', file), `${pending.length}\n`, content);
        assert.equal(parse('first', file), pending.length ? `${pending[0][1]}\n` : '', content);
        const lines = content.replaceAll('\r\n', '\n').split('\n');
        for (const row of rows) assert.equal(row.slice(3).join('\t'), lines[Number(row[1]) - 1]);
    }
    // A fence cannot leak across files; recurse deterministically and exclude
    // the assigned document without excluding other executable checkboxes.
    const moduleDir = path.join(tmp, 'module');
    fs.mkdirSync(path.join(moduleDir, 'nested'), { recursive: true });
    const first = path.join(moduleDir, '01.md');
    const second = path.join(moduleDir, 'nested', '02.md');
    fs.writeFileSync(first, '- [x] Done\n```\n- [ ] Example\n');
    fs.writeFileSync(second, '  - [ ] Real\n');
    fs.writeFileSync(path.join(moduleDir, 'ignored.txt'), '- [ ] Ignored\n');
    assert.equal(parse('count', moduleDir), '1\n');
    assert.equal(parse('manifest', moduleDir), `${first}\t1\tcomplete\t- [x] Done\n${second}\t1\tpending\t  - [ ] Real\n`);
    assert.equal(parse('manifest', moduleDir, '--exclude', first), `${second}\t1\tpending\t  - [ ] Real\n`);
    for (const doc of ['docs/tasks/README.md', 'docs/reviews/README.md', 'docs/tasks/markdown-task-grammar.md']) {
        assert.equal(parse('manifest', path.join(root, doc)), '', doc + ' contains only examples');
    }
    const missing = spawnSync('python3', ['-I', parser, 'count', path.join(tmp, 'missing.md')], { encoding: 'utf8' });
    assert.equal(missing.status, 1);
    assert.equal(missing.stdout, '');
    // Scope includes both live documentation trees, even when a tree/module
    // did not exist at snapshot time. Unrelated Markdown stays outside it.
    const repo = path.join(tmp, 'repo');
    const taskDir = path.join(repo, 'docs/tasks/selected');
    fs.mkdirSync(taskDir, { recursive: true });
    const assigned = path.join(taskDir, '01.md');
    fs.writeFileSync(assigned, '- [ ] Assigned\n');
    fs.writeFileSync(path.join(repo, 'docs/notes.md'), '- [ ] Outside scope\n');
    const scope = () => JSON.parse(parse('scope-manifest', repo, '--exclude', assigned));
    assert.deepEqual(scope(), []);
    const reviewDir = path.join(repo, 'docs/reviews/nested');
    fs.mkdirSync(reviewDir, { recursive: true });
    const review = path.join(reviewDir, 'review.md');
    fs.writeFileSync(review, '- [X] Review item\n');
    const reviewRecord = [review, 1, 'complete', '- [X] Review item'];
    assert.deepEqual(scope(), [reviewRecord]);
    const otherDir = path.join(repo, 'docs/tasks/other');
    fs.mkdirSync(otherDir);
    const other = path.join(otherDir, 'new.md');
    fs.writeFileSync(other, '- [ ] New task\n');
    const otherRecord = [other, 1, 'pending', '- [ ] New task'];
    assert.deepEqual(scope(), [reviewRecord, otherRecord]);
    fs.writeFileSync(other, '- [ ] New\0task\n');
    assert.deepEqual(scope(), [reviewRecord, [other, 1, 'pending', '- [ ] New\0task']]);
    fs.writeFileSync(other, '- [ ] New task\n');
    fs.rmSync(reviewDir, { recursive: true });
    assert.deepEqual(scope(), [otherRecord]);
    fs.unlinkSync(other);
    assert.deepEqual(scope(), []);
    console.log('PASS shared Markdown grammar: fences, indentation, state, line numbers, ordering, manifests, documentation examples');
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

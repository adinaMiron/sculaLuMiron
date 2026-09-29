// task-01: the sandbox's pulseaudio runtime symlink
// (.config/pulse/*-runtime, pointing into /tmp) must never be tracked by
// git, and .gitignore must be broad enough to stop a future
// `git add -A` from re-staging it under a different generated name.
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const repoRoot = path.resolve(__dirname, '..', '..');

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

test.describe('repo hygiene: pulseaudio symlink', () => {
  test('no .config/pulse path is tracked by git', () => {
    const tracked = git(['ls-files']).split('\n').filter(f => f.startsWith('.config/pulse/'));
    expect(tracked).toEqual([]);
  });

  test('.gitignore covers .config/pulse/', () => {
    const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/(^|\n)\.config\/pulse\/?/);
  });

  test('a fresh runtime-named symlink under .config/pulse/ is ignored by git', () => {
    const dir = path.join(repoRoot, '.config', 'pulse');
    fs.mkdirSync(dir, { recursive: true });
    const linkPath = path.join(dir, 'SomeOtherHost-runtime');
    fs.rmSync(linkPath, { force: true });
    fs.symlinkSync('/tmp/pulse-doesnotexist', linkPath);
    try {
      const status = git(['status', '--porcelain', '--ignored', '.config']);
      // Ignored entries are reported with an "!!" prefix; nothing should
      // show up as untracked ("??").
      expect(status).not.toMatch(/\?\?/);
    } finally {
      fs.rmSync(linkPath, { force: true });
    }
  });

  test('git diff main --stat lists no .config path', () => {
    let diff;
    try {
      diff = git(['diff', 'main', '--stat']);
    } catch {
      test.skip(true, 'no "main" ref reachable in this checkout');
      return;
    }
    expect(diff).not.toMatch(/\.config\//);
  });
});

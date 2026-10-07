import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkIdentity, checkMessage, checkRemote, owner, email, remote } from '../tools/identity-guard.mjs';

test('identity and coauthor guards accept only the repository owner', () => {
  checkIdentity(owner, email); checkRemote(remote); checkMessage(`Fix\n\nCo-authored-by: ${owner} <${email}>`);
  assert.throws(() => checkIdentity('another-user', email));
  assert.throws(() => checkIdentity(owner, 'other@example.com'));
  assert.throws(() => checkMessage('Fix\n\nCo-authored-by: another-user <other@example.com>'));
  assert.throws(() => checkRemote('https://another-user@github.com/SuzukiMintu/Image-To-MFM.git'));
});

test('actual Git hooks stop author, committer, coauthor and outgoing-commit mistakes', () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const fixture = mkdtempSync(join(tmpdir(), 'image-to-mfm-identity-'));
  const env = { ...process.env, GIT_AUTHOR_NAME: owner, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: owner, GIT_COMMITTER_EMAIL: email };
  const git = (args, extra = {}) => execFileSync('git', args, { cwd: fixture, env: { ...env, ...extra }, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  try {
    git(['init', '-b', 'main']);
    mkdirSync(join(fixture, 'tools')); mkdirSync(join(fixture, '.githooks'));
    writeFileSync(join(fixture, 'tools/identity-guard.mjs'), readFileSync(join(root, 'tools/identity-guard.mjs')));
    for (const hook of ['pre-commit', 'commit-msg', 'pre-push']) writeFileSync(join(fixture, '.githooks', hook), readFileSync(join(root, '.githooks', hook)), { mode: 0o755 });
    git(['config', 'core.hooksPath', '.githooks']);
    git(['config', 'user.name', owner]); git(['config', 'user.email', email]);
    git(['commit', '--allow-empty', '-m', 'Valid identity']);
    const before = git(['rev-parse', 'HEAD']);
    assert.throws(() => git(['commit', '--allow-empty', '--author=Other <other@example.com>', '-m', 'Wrong author']));
    assert.throws(() => git(['commit', '--allow-empty', '-m', 'Wrong committer'], { GIT_COMMITTER_EMAIL: 'other@example.com' }));
    assert.throws(() => git(['commit', '--allow-empty', '-m', 'Wrong coauthor\n\nCo-authored-by: Other <other@example.com>']));
    assert.equal(git(['rev-parse', 'HEAD']), before);
    // Deliberately bypass only in this disposable fixture: pre-push must catch
    // a bad commit even when the current identity has been corrected.
    git(['commit', '--no-verify', '--allow-empty', '--author=Other <other@example.com>', '-m', 'Imported bad commit']);
    const bad = git(['rev-parse', 'HEAD']);
    assert.throws(() => execFileSync('node', ['tools/identity-guard.mjs', 'push', 'origin', remote], {
      cwd: fixture, env, input: `refs/heads/main ${bad} refs/heads/main ${before}\n`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }), error => String(error.stderr).includes('Commit author and committer must be'));
    assert.throws(() => git(['commit', '--amend', '--no-edit'], { GIT_AUTHOR_NAME: undefined, GIT_AUTHOR_EMAIL: undefined }));
  } finally {
    assert.equal(dirname(resolve(fixture)), resolve(tmpdir()));
    assert.ok(fixture.startsWith(join(tmpdir(), 'image-to-mfm-identity-')));
    rmSync(fixture, { recursive: true, force: true });
  }
});

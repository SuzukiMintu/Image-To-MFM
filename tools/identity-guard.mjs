import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const owner = 'SuzukiMintu';
export const email = '127496497+SuzukiMintu@users.noreply.github.com';
export const remote = 'https://SuzukiMintu@github.com/SuzukiMintu/Image-To-MFM.git';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

export function checkIdentity(name, address) {
  if (name !== owner || address !== email) {
    throw new Error(`Commit author and committer must be ${owner} <${email}>. Check this repository's user.name/user.email and --author.`);
  }
}

function checkCurrentIdentity() {
  for (const variable of ['GIT_AUTHOR_IDENT', 'GIT_COMMITTER_IDENT']) {
    const match = git('var', variable).match(/^(.*) <([^>]*)> /);
    if (!match) throw new Error('Cannot read commit identity.');
    checkIdentity(match[1], match[2]);
  }
}

export function checkCommit(sha) {
  const [author, authorEmail, committer, committerEmail] = git('show', '-s', '--format=%an%n%ae%n%cn%n%ce', sha).split('\n');
  checkIdentity(author, authorEmail);
  checkIdentity(committer, committerEmail);
  checkMessage(git('show', '-s', '--format=%B', sha));
}

export function checkMessage(message) {
  for (const match of message.matchAll(/^Co-authored-by:\s*(.*?)\s*<([^>]*)>\s*$/gim)) checkIdentity(match[1], match[2]);
}

export function checkRemote(url) {
  if (url !== remote) throw new Error(`Push destination must be ${remote}.`);
}

export function outgoingCommits(updates) {
  const commits = new Set();
  for (const line of updates.trim().split('\n').filter(Boolean)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 4 || !/^[0-9a-f]{40,64}$/.test(parts[1]) || !/^[0-9a-f]{40,64}$/.test(parts[3])) throw new Error('Invalid pre-push input.');
    const [, localSha, , remoteSha] = parts;
    if (/^0+$/.test(localSha)) continue;
    let range;
    if (/^0+$/.test(remoteSha)) range = git('rev-list', localSha, '--not', '--remotes');
    else {
      // If the remote tip is unknown, fetch it before retrying; never skip it.
      git('cat-file', '-e', `${remoteSha}^{commit}`);
      range = git('rev-list', `${remoteSha}..${localSha}`);
    }
    for (const sha of range.split('\n').filter(Boolean)) commits.add(sha);
  }
  return [...commits];
}

export async function authenticatedAccount() {
  // Ask the same credential helper as Git. Keep its token in memory, never
  // print it or put it in process arguments, files, or repository config.
  const credential = execFileSync('git', ['credential', 'fill'], {
    input: `url=${remote}\n\n`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  });
  const token = credential.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9);
  if (!token) throw new Error('No GitHub credential for SuzukiMintu. Sign in with Git Credential Manager.');
  const response = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Image-To-MFM-identity-guard' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Cannot verify the GitHub account. Push stopped.');
  const user = await response.json();
  if (user.id !== 127496497 || user.login !== owner) throw new Error('The authenticated GitHub account is not SuzukiMintu. Push stopped.');
  return user.login;
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  checkCurrentIdentity();
  if (mode === 'commit') return;
  if (mode === 'message') return checkMessage(readFileSync(args[0], 'utf8'));
  if (mode === 'push') {
    checkRemote(args[1]);
    for (const sha of outgoingCommits(readFileSync(0, 'utf8'))) checkCommit(sha);
    await authenticatedAccount();
    return;
  }
  if (mode === 'account') { console.log(await authenticatedAccount()); return; }
  throw new Error('Unknown identity check mode.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); }
  catch (error) {
    // Child-process errors can contain credential helper output. Do not log it.
    console.error(`Identity guard: ${error instanceof Error && !('stderr' in error) ? error.message : 'Git identity or credential lookup failed. Operation stopped.'}`);
    process.exitCode = 1;
  }
}

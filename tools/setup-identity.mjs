import { execFileSync } from 'node:child_process';
import { owner, email, remote } from './identity-guard.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
if (git('remote', 'get-url', 'origin').replace('SuzukiMintu@', '') !== remote.replace('SuzukiMintu@', '')) throw new Error('This setup is only for SuzukiMintu/Image-To-MFM.');
const hooks = git('config', '--default', '', '--get', 'core.hooksPath');
if (hooks && hooks !== '.githooks') throw new Error('Existing hooksPath found; review it before installing.');
git('config', '--local', 'user.name', owner);
git('config', '--local', 'user.email', email);
git('remote', 'set-url', 'origin', remote);
git('config', '--local', 'core.hooksPath', '.githooks');
console.log('Repository identity checks enabled for SuzukiMintu.');

# Git identity

This repository belongs to SuzukiMintu. Before committing or pushing, run
`node tools/setup-identity.mjs` to enable the repository-local identity guards.

- Author and committer must both be `SuzukiMintu <127496497+SuzukiMintu@users.noreply.github.com>`.
- Push only to `https://SuzukiMintu@github.com/SuzukiMintu/Image-To-MFM.git`.
- Keep the `.githooks` checks enabled. Do not bypass them with `--no-verify`,
  `git commit-tree`, a different hooks path, or direct API commits. An explicit
  user request for a particular history repair is required for such an exception.
- If identity verification fails, fix the identity or report the concrete
  blocker. Do not publish with another account.
- Do not stage example images or temporary output from the parent workspace.

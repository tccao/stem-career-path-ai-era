# CLAUDE.md

Repository-wide execution notes for AI agents. Product and security guidance is in
[`AGENTS.md`](AGENTS.md) and [`v3/CLAUDE.md`](v3/CLAUDE.md).

## Execution boundary

If the repository is opened from Windows through a `\\wsl.localhost\...` UNC path, commands may run
in Windows rather than the WSL userland where Node, npm, Firebase CLI, and GitHub authentication are
configured. Bridge through a login and interactive WSL shell:

```bash
wsl.exe bash -lic 'cd /home/tinhc/stem-career-path-ai-era && npm --version'
```

When already inside WSL/Linux, run commands directly.

WSL has its own `gh` authentication and Git credential helper. Perform push and PR operations from
WSL; do not rely on Windows `gh.exe` credentials across interop.

## Active scope

- V3 under `v3/` is the only active application.
- Read `v3/CLAUDE.md` before V3 work and use that revision's documented test and deployment commands.
- `amplify.yml` must remain at repository root because Amplify uses `v3/frontend` as a monorepo app
  root.
- `docs/legacy-v1-v2/` is a Markdown-only historical archive. Exact retired source is available at
  tag `legacy-v1-v2-final`; never deploy that tag.
- `feat/v3-mvp` is the production release line until a separately authorized merge. Maintenance on
  `main` must not merge, deploy, or rewrite it.

## Git and safety

- Preserve unrelated user changes and use a separate worktree when another branch is dirty.
- Never commit service-account keys, secrets, `.env` files, emulator state, `node_modules`, or build
  output.
- Do not reintroduce retired V1/V2 HTML, demo code, duplicate assets, generated docs, or root package
  dependencies.
- During the future V3 merge, keep legacy runtime deletions, take the newest V3 guidance, and retain
  a link to `docs/legacy-v1-v2/`.

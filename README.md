# STEM Graduates Career Path — AI Era

Code For Good's hosted STEM learning and access platform. The active application is V3 under
[`v3/`](v3/): a Vite frontend hosted by AWS Amplify with Firebase authentication, data, and access
enforcement.

## Active implementation

- [`v3/README.md`](v3/README.md) — product status, local development, verification, and deployment.
- [`v3/CLAUDE.md`](v3/CLAUDE.md) — implementation boundaries and security invariants.
- [`amplify.yml`](amplify.yml) — repository-root monorepo build specification for
  `v3/frontend`.

The production release line is `feat/v3-mvp` until it is merged into `main` through a separate,
reviewed operation. This cleanup does not merge or deploy that branch.

## Repository layout

```text
.
├── v3/                       # active hosted application
│   ├── frontend/             # Vite public, student, and staff interfaces
│   ├── backend/              # Firebase configuration, rules, functions, and admin tooling
│   └── docs/                 # active V3 architecture and operational documentation
├── docs/legacy-v1-v2/        # Markdown-only historical design archive
├── amplify.yml               # Amplify monorepo build entrypoint
├── AGENTS.md                 # repository guidance for coding agents
└── CLAUDE.md                 # execution and repository notes
```

V1 source pages, V2 prototype code, generated documents, screenshots, duplicated assets, and root
legacy dependencies were retired from `main`. The annotated tag `legacy-v1-v2-final` preserves their
exact final state.

## Local V3 build

```bash
cd v3/frontend
npm ci
npm run build
```

Use the verification and emulator commands documented in [`v3/README.md`](v3/README.md) for the
specific V3 revision being worked on. Never point emulator mutation tests at production.

## Legacy design history

[`docs/legacy-v1-v2/`](docs/legacy-v1-v2/) contains the curated V1/V2 requirements, AWS design,
service trade-offs, customer journey, sitemap, and reproduction guides. The archive is historical
and must not be treated as the production specification.

Retrieve the exact retired source without changing the current worktree:

```bash
git fetch origin tag legacy-v1-v2-final
git worktree add ../stem-career-path-v1-v2 legacy-v1-v2-final
```

Do not deploy the legacy tag.

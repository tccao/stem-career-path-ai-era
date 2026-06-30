# AGENTS.md

Guidance for AI agents working in this repository.

## Current product

V3 is the only active implementation. It lives entirely under [`v3/`](v3/) and is hosted through
the repository-root [`amplify.yml`](amplify.yml). Read [`v3/CLAUDE.md`](v3/CLAUDE.md),
[`v3/README.md`](v3/README.md), and the relevant `v3/docs/` source before changing V3 behavior.

The production release branch is `feat/v3-mvp` until a separate reviewed merge moves it to `main`.
Never merge or deploy it as a side effect of maintenance work.

## Historical material

V1 and V2 are retired. Their curated requirements, architecture, design trade-offs, and
reproduction instructions live in [`docs/legacy-v1-v2/`](docs/legacy-v1-v2/). Exact source and
assets remain available at annotated tag `legacy-v1-v2-final`.

Legacy archive rules:

- Markdown only under `docs/legacy-v1-v2/`.
- Do not restore root V1 HTML, V2 mocks, `demo/`, `assets/`, `references/`, generated HTML/PDF,
  screenshots, or root legacy package manifests.
- Treat archive documents as historical context, never as active V3 requirements.
- During a future V3 merge, resolve modify/delete conflicts for legacy runtime paths in favor of
  deletion and keep the latest V3 guidance plus the archive link.

## Repository boundaries

```text
v3/frontend/               active browser application
v3/backend/                active Firebase backend and operator tooling
v3/docs/                   active architecture and operational documentation
docs/legacy-v1-v2/         historical Markdown only
amplify.yml                active hosting build configuration
```

- Keep V3 implementation, tests, configuration, and assets under `v3/`.
- Do not add root package dependencies for V3; use the scoped package manifests.
- Never commit Firebase service-account JSON, API secrets, generated build output, or emulator data.
- Preserve role, access-window, MFA, App Check, audit, and server-enforcement invariants documented
  by the V3 revision being changed.
- Prefer focused edits and verification proportional to the security impact.

## Verification

Follow the commands in `v3/README.md` and the active V3 security walkthrough. At minimum, build the
frontend after frontend changes and run the applicable emulator/security tests after auth, access,
rules, or backend changes. Do not use production credentials for emulator tests.

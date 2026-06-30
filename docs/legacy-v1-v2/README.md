# Legacy V1/V2 Design Archive

This directory preserves the requirements, architecture, trade-offs, and reproduction notes for
the retired V1 static landing page and the unshipped V2 AWS platform. It is historical reference,
not the active product specification. The implemented application lives under [`v3/`](../../v3/).

Only Markdown belongs in this directory. Generated HTML/PDF exports, screenshots, source code,
dependencies, and duplicated media were deliberately removed from `main`.

## Exact source snapshot

The annotated Git tag `legacy-v1-v2-final` points to the last `main` commit containing the complete
V1/V2 source, assets, demo, and rendered documentation:

```bash
git fetch origin tag legacy-v1-v2-final
git switch --detach legacy-v1-v2-final
```

For an isolated historical checkout that does not disturb current work:

```bash
git worktree add ../stem-career-path-v1-v2 legacy-v1-v2-final
```

Do not deploy that tag. It exists only to make the retired implementations reproducible.

## Archive map

| Version | Document | Purpose |
| --- | --- | --- |
| V1 | [`v1/requirements.md`](v1/requirements.md) | Original product, content, design, accessibility, and static-page requirements |
| V1 | [`v1/reproduction-guide.md`](v1/reproduction-guide.md) | Exact checkout, file map, local run, and validation procedure |
| V2 | [`v2/requirements.md`](v2/requirements.md) | Planned platform functional and non-functional requirements |
| V2 | [`v2/architecture.md`](v2/architecture.md) | AWS serverless architecture, trust boundaries, data model, and controls |
| V2 | [`v2/customer-journey.md`](v2/customer-journey.md) | Personas and apply-to-expiry lifecycle |
| V2 | [`v2/sitemap-wireframes.md`](v2/sitemap-wireframes.md) | Routes, navigation, and low-fidelity interface layouts |
| V2 | [`v2/service-tradeoffs.md`](v2/service-tradeoffs.md) | Service, cost, nonprofit, and operational trade-offs |
| V2 | [`v2/prototype-reproduction.md`](v2/prototype-reproduction.md) | Consolidated local-demo architecture, ADR outcomes, API, setup, and tests |

## Removed-path map

| Retired path | Historical contents | Where to look now |
| --- | --- | --- |
| `STEM Career Path Landing Page.html` | V1 single-file landing page | Tag plus V1 reproduction guide |
| `mock-dashboard.html`, `mock-booking.html` | V2 interface mocks | Tag plus sitemap/wireframes |
| `demo/` | Runnable V2 Node/AWS-SDK prototype | Tag plus V2 prototype guide |
| `assets/`, `references/` | V1/V2 media, diagrams, and source material | Tag |
| `docs/*.html`, `docs/*.pdf` | Generated copies of Markdown sources | Markdown archive |
| `docs/Ops-Runbook.md` | Hypothetical V2 operations plan | Tag; V2 was never deployed |
| `docs/Well-Architected-Review.md` | Review findings incorporated into Architecture Rev. 4/5 | Architecture and tag |

## Future V3 merge policy

When the production V3 branch is eventually merged into `main`:

- keep retired V1/V2 runtime paths deleted when Git reports modify/delete conflicts;
- keep the newest V3 root guidance, then restore its link to this archive;
- never reintroduce `demo/`, root V1 HTML, mocks, duplicated legacy assets, or root legacy
  dependencies; and
- treat [`v3/README.md`](../../v3/README.md) and the implemented V3 security documentation as the
  active operational sources of truth.

A read-only `git merge-tree` rehearsal against `origin/feat/v3-mvp` on 2026-06-29 identified the
expected future conflicts:

- content conflicts in `README.md`, `AGENTS.md`, `CLAUDE.md`, and `v3/docs/V3-Plan.md`; resolve by
  taking the newest V3 guidance and restoring the archive link and retirement policy;
- modify/delete conflicts for `assets/diagrams/README-mermaid-logos.md` and
  `demo/audit-ui-v1-2026-06-17/README.md`; resolve by keeping both files deleted.

The rehearsal created no merge commit and changed no branch or working-tree files.

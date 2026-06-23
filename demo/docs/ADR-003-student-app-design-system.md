# ADR-003: Adopt the mock-dashboard design system for the student app

**Status:** Accepted
**Date:** 2026-06-16
**Deciders:** Tinh Cao (owner/maintainer); CFG leadership
**Relates to:** the student app built in `public/app.html`; the design reference `../../mock-dashboard.html`

## Context

The student app (`public/app.html`) was first built with a deliberately minimal UI to prove the
backend (auth/role/access guards, path assembly, server-side stage gating). The repo already
contains a polished, single-file **student dashboard mock** (`mock-dashboard.html`) with a full
Code For Good design system: design tokens, a sticky top bar, a fixed sidebar with a path
progress meter and accordion navigation, a gradient "continue learning" card, an eight-pillar
pathway grid with done/current/locked states, and an earn-while-you-learn ladder.

We now want the **live** student app to look and behave like that mock — but driven by real data
from `/api/v1/app/*` (profile + gated path), not the mock's hard-coded `PILLARS`/`FASTTRACK`
arrays.

Forces: keep the demo single-file-per-page (the V1 house style); don't change the backend or its
tests; preserve the server-side gating semantics (the UI reflects state, it never decides it).

## Decision

Replace the student app's UI with the **mock's design system**, wired to the live API. Reuse the
mock's tokens and components verbatim; render the sidebar path tree, stats, "continue" card, and
pathway grid from `GET /api/v1/app/path` + `GET /api/v1/app/profile`; and add the one interaction
the static mock lacked — **submit a deliverable to complete the active stage and unlock the next**.
The mock's `buildTree()` rendering boundary becomes a `fetch` against the real path endpoint.

## Options Considered

### Option A — Port the mock design into `app.html`, wired to the live API *(chosen)*

| Dimension | Assessment |
|-----------|------------|
| Complexity | Med (one file, known design) |
| UX quality | High — matches the CFG-branded mock |
| Backend impact | None — same endpoints, same tests |
| Maintainability | CSS duplicated across `admin.html` / `app.html` / the mock |

**Pros:** the live app finally looks like the product; no backend/test churn; the mock stops
being vaporware and becomes the real thing. **Cons:** a third copy of the CFG CSS tokens lives
inline (admin, app, mock) — drift risk if the brand changes.

### Option B — Keep the minimal UI

**Pros:** nothing to do. **Cons:** leaves a real UX gap; the polished mock goes unused.

### Option C — Extract a shared `design-system.css` used by admin + app (+ mock)

**Pros:** single source of truth for tokens/components, kills duplication. **Cons:** the demo and
the V1 page are intentionally single-file artifacts; a shared stylesheet adds a static-asset
dependency and a build/serve concern that isn't worth it at this size. **Deferred** — it's the
right move once a third branded surface appears or the palette changes.

## Trade-off Analysis

The real tension is **UX fidelity now vs. CSS duplication**. Option A duplicates ~300 lines of
tokens/components into a third file, which is a maintenance smell — but at three small static
pages it's cheaper than standing up a shared-asset pipeline, and the tokens are stable (the CFG
palette is fixed in `CLAUDE.md`). We take the duplication now and record Option C as the refactor
trigger: **extract the shared stylesheet when a fourth branded page appears or the palette
changes.** The gating contract is unchanged — the UI renders `state` (locked/active/complete)
from the server and disables locked actions; it never computes eligibility client-side.

## Consequences

### Easier

- The student app matches the CFG identity and the approved mock; demos look real.
- `mock-dashboard.html`'s design is now exercised against live data instead of hard-coded arrays.

### Harder

- CFG CSS tokens/components are duplicated across `admin.html`, `app.html`, and the mock — a
  palette change touches three files until Option C.
- `mock-dashboard.html` is now largely redundant with the live app; keep it as a design reference
  or retire it (it is not wired to anything).

### Revisit when

- A fourth branded surface appears or the brand palette changes → do Option C (shared stylesheet).

## Action Items

1. [x] Rebuild `public/app.html` on the mock's tokens + components.
2. [x] Render sidebar path tree, progress, stats, "continue" card, and pathway grid from the live API.
3. [x] Add deliverable submission on the active stage (complete → unlock next), reflecting server gating.
4. [x] Verify it serves and the end-to-end student flow still works; tests unchanged (43 pass).
5. [ ] (Future) Extract a shared `design-system.css` when the trigger above fires.

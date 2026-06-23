# ADR-002: Local cloud emulator for the V2 demo (MiniStack)

**Status:** Proposed
**Date:** 2026-06-16
**Deciders:** Tinh Cao (owner/maintainer); CFG leadership
**Refines:** ADR-001 (keeps Node + AWS SDK v3 + Express + `node:test`; supersedes only its *local data store* choice and broadens scope from DynamoDB-only to a fuller local cloud)
**Source of truth:** `docs/Architecture-Design.md` (Rev. 4) §4 service map

## Context

ADR-001 chose the bare **DynamoDB Local jar** because the build/test sandbox has no Docker and the demo's first job is the admin lifecycle over DynamoDB. Two facts have since changed the calculus:

1. **The maintainer's machine has Docker Desktop.** Docker-based local infra is now an option for the deliverable (it still is not in my build sandbox — see Consequences).
2. **We want the demo to exercise more of the architecture than the database** — real auth (Cognito), the SQS provisioning seam, S3 content, and SES email — not just simulate them.

Verified facts (current as of June 2026, post-cutoff, confirmed by web research):

- **LocalStack retired its free *Community* edition on 23 March 2026.** The replacement free *Hobby* tier is **non-commercial use only** and requires a sign-up auth token. For a 501(c)(3) the "non-commercial" line is a gray area.
- **Cognito is a LocalStack *Pro* (paid) feature** — the one capability we most wanted to be real is paywalled there.
- **MiniStack** (github.com/ministackorg/ministack) is **MIT-licensed, free forever, commercial use allowed**, emulates **55+ services including Cognito, DynamoDB, SQS, S3, SES, EventBridge Scheduler** on a single port (4566, LocalStack-compatible), ~270 MB image, <2 s startup, and exposes test hooks (`POST /_ministack/reset`, `GET /_ministack/ses/messages`).

Non-functional priorities are unchanged from ADR-001: production fidelity, low setup friction, clean migration to real AWS, fast tests, single-maintainer maintainability — plus a new one surfaced here: **license cleanliness for a nonprofit.**

## Decision

Use **MiniStack** as the demo's local cloud, run via `demo/docker-compose.yml` on the maintainer's Docker machine. The app talks to it through the standard AWS SDK v3 endpoint override (`AWS_ENDPOINT_URL=http://localhost:4566`, dummy `test`/`test` credentials).

**Dual test targets, one codebase.** Because the SDK client is endpoint-driven, the same code runs against either backend:

- **In my no-Docker build sandbox:** the DynamoDB layer, the state machine, and all logic are tested against the **DynamoDB Local jar** (port 8000) — fully executable where I develop.
- **On the maintainer's machine:** the full integration suite (auth/Cognito, SQS, S3, SES) runs against **MiniStack** (port 4566).

Switching target is one env var; no code changes.

## Options Considered

### Option A — DynamoDB Local jar only (ADR-001's choice)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost / license | $0, clean |
| Fidelity | DB only — auth/SQS/S3/SES stay simulated |
| Setup weight | Java, no Docker |

**Pros:** runs in the build sandbox; nothing to license. **Cons:** demo can't exercise real auth, the provisioning queue, or content gating — exactly the breadth we now want.

### Option B — LocalStack (free Hobby, + cognito-local for the Cognito gap)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Med–High (two tools) |
| Cost / license | Free tier is **non-commercial only** + token; Cognito needs **Pro (paid)** |
| Fidelity | High breadth |
| Setup weight | Docker + token + a second container for Cognito |

**Pros:** most established emulator; broad coverage. **Cons:** Cognito paywalled, free tier's non-commercial restriction is awkward for a nonprofit, mandatory auth token, and the Cognito gap forces a second tool. Most friction of the three.

### Option C — MiniStack  *(chosen)*

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low (one container) |
| Cost / license | **$0, MIT, commercial-OK** |
| Fidelity | Cognito + DynamoDB + SQS + S3 + SES + EventBridge Scheduler in one tool |
| Setup weight | Docker only; LocalStack-compatible endpoint; built-in test hooks |

**Pros:** single container covers the whole V2 service map; MIT removes the licensing question; reset + SES-inspection endpoints are purpose-built for the "test each module" requirement; port 4566 means the SDK config is the standard endpoint-override. **Cons:** **young project** (v1.1.x, ~3 months old) — emulation edge-case risk; I can't run it in my Docker-less sandbox, so its integration tests execute on the maintainer's machine, not in my build loop.

## Trade-off Analysis

The deciding axis is **breadth-with-clean-licensing vs. maturity.** LocalStack is the most battle-tested but, post-March-2026, charges for Cognito and restricts its free tier to non-commercial use — a poor fit for a nonprofit that wants real auth at $0. MiniStack inverts that: one MIT container delivers the full service map (Cognito included) with no license friction, at the cost of being new and therefore less proven on emulation edge cases. We accept the maturity risk because (a) the demo is not production, (b) MIT licensing is a hard win for a nonprofit, and (c) the endpoint-override design means if MiniStack disappoints we fall back to the DynamoDB Local jar (Option A) or LocalStack+cognito-local (Option B) by changing one URL — the application code is insulated either way. The young-project risk is bounded by that escape hatch, not bet against.

## Consequences

### Easier

- One `docker compose up` gives real Cognito, DynamoDB, SQS, S3, SES locally — the demo mirrors the architecture, not just the DB.
- MIT license: no non-commercial caveat, no auth token, no per-service paywall.
- `reset` + SES-message endpoints make per-test isolation and email assertions trivial.

### Harder

- A JVM is no longer enough; the full demo needs **Docker** (the maintainer has it). The DB-only slice still runs on the jar for those without Docker.
- **I cannot run MiniStack in my build sandbox (no Docker).** I build and verify the DynamoDB + logic layers against the jar; the auth/SQS/S3/SES integration tests are written by me but executed by the maintainer against MiniStack. This is stated plainly so test ownership is unambiguous.
- Reliance on a 3-month-old project for the emulation layer (mitigated by the one-URL fallback).

### Revisit when

- MiniStack proves unreliable for a needed service → fall back to LocalStack+cognito-local (Option B) or the jar (Option A), one env var.
- The demo graduates toward deployment → real AWS via AWS SAM (`Architecture-Design.md` §4/§13); the SDK-v3 modules carry over unchanged.

## Action Items

1. [ ] `demo/docker-compose.yml` runs `ministackorg/ministack` on 4566 (done — pin a release tag before CI use).
2. [ ] Single DB/SDK client module reads `AWS_ENDPOINT_URL` so jar↔MiniStack↔AWS is one env var (`.env.example`).
3. [ ] Test harness calls `POST /_ministack/reset` in `beforeEach`; assert SES sends via `GET /_ministack/ses/messages`.
4. [ ] README marks which suites run in-sandbox (jar) vs. on the maintainer's machine (MiniStack), and validate the exact MiniStack env/healthcheck keys on first real `up`.
5. [ ] Note MiniStack + its fallbacks (jar / LocalStack+cognito-local) as the local-emulation decision alongside the §14 triggers if/when this graduates.

## Sources

- LocalStack pricing & Community retirement: <https://blog.localstack.cloud/2026-upcoming-pricing-changes/> · <https://docs.localstack.cloud/aws/licensing/>
- MiniStack project (MIT, service list, ports, test hooks): <https://github.com/ministackorg/ministack> · <https://ministack.org>
- cognito-local (Option B gap-filler): <https://github.com/jagregory/cognito-local>

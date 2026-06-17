# ADR-001: Tech stack for the local V2 demo app

**Status:** Proposed — *local data store refined by [ADR-002](ADR-002-local-cloud-emulator.md)* (Docker now available → MiniStack as the local cloud; the DynamoDB Local jar remains the no-Docker / in-sandbox test target). Language, SDK, Express, and `node:test` choices below still stand.
**Date:** 2026-06-16
**Deciders:** Tinh Cao (owner/maintainer); CFG leadership (per `CLAUDE.md` — new libraries need sign-off)
**Source of truth:** `docs/Architecture-Design.md` (Rev. 4) · `docs/Platform-SRS.md`
**Scope:** the runnable local demo only (`demo/`). Production AWS choices are already decided in the Architecture doc and are **not** reopened here.

## Context

We are building a **local, runnable demo** of the planned V2 platform: a vetted-access learning app (apply → vet/donate → grant → learn → expire). The demo must let a reviewer drive the admin access-lifecycle and see real curriculum, against a database that **mimics production DynamoDB**, with no cloud account required.

Forces at play:

- **Production is already fixed** (`Architecture-Design.md` §3–4): arm64 **Lambda** ×3, **DynamoDB on-demand**, Cognito, SQS, S3+CloudFront, SES, accessed via the **AWS SDK**. The demo's value is proportional to how closely its data-access code matches the code those Lambdas will eventually run.
- **Single volunteer maintainer, near-zero budget** (`Platform-SRS.md` §3). Setup weight and cost-to-run are first-class constraints, not afterthoughts.
- **Repo is HTML/CSS/JS-centric.** The V1 page and both mocks are plain HTML + JS; team familiarity leans JavaScript.
- **Must run offline and free** — a demo gated behind an AWS account, credentials, or per-hour cost defeats the purpose.
- **Environment facts.** Build/dev sandbox has **Node 22, Python 3.10, Java 11, and no Docker**; the maintainer's machine has Node, Python, Java *and* Docker Desktop. The lowest-common-denominator that runs **everywhere we build and test** is "Java present, Docker not guaranteed."
- **Non-functional priorities:** (1) production fidelity, (2) low setup friction, (3) clean migration path to real AWS, (4) fast tests, (5) maintainability by one JS-comfortable volunteer.

## Decision

Build the demo as **Node.js (ESM) + AWS SDK v3 + Express**, talking to the **official AWS DynamoDB Local** (the Java jar, run without Docker), tested with the built-in **`node:test`** runner.

The only difference between demo data-access code and future Lambda code is the **DynamoDB endpoint URL** (`http://localhost:8000` vs the AWS regional endpoint) — same SDK, same commands, same table definitions, same conditional-write semantics.

## Options Considered

### Option A — Node.js + AWS SDK v3 + Express + DynamoDB Local jar  *(chosen)*

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low–Med |
| Cost | $0 (no cloud, no Docker license dependency) |
| Production fidelity | **High** — real DynamoDB engine; code is endpoint-swap away from Lambda |
| Team familiarity | High (JS-centric repo) |
| Setup weight | Java + `npm install` (no Docker) |

**Pros:** Demo repositories become the production repositories verbatim (SDK v3 is the Lambda SDK). DynamoDB Local is AWS's own engine, so GSIs, conditional writes, and the document client behave as in prod. Runs in the no-Docker build sandbox *and* on the maintainer's machine. Express routes map 1:1 onto the API Gateway routes in the docs, making the trust-zone split (`public-fn` / `app-fn` / `system-fn`) legible.
**Cons:** Requires a JVM to be present (Java 11 satisfies it). DynamoDB Local is not byte-identical to the cloud service for a few exotic edge cases (throughput/throttling behavior, some error shapes). Express adds one runtime dependency.

### Option B — Python + boto3 + FastAPI + DynamoDB Local

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low–Med |
| Cost | $0 |
| Production fidelity | High for the DB; **lower for compute** — diverges from the JS Lambda topology |
| Team familiarity | Medium (repo is JS) |
| Setup weight | Python venv + Java + pip |

**Pros:** boto3 + DynamoDB Local is equally faithful at the data layer; FastAPI is ergonomic; pytest is mature.
**Cons:** The handler code would be rewritten in JS if/when it becomes Lambdas, so the demo stops being a production prototype and becomes a throwaway. Adds a second language to a one-maintainer, JS-leaning repo. No upside over A given the team context.

### Option C — Node.js + AWS SDK v3 + LocalStack (Docker)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Med–High |
| Cost | $0 (Community), but heavy |
| Production fidelity | **Highest breadth** — emulates DynamoDB *and* Cognito, SQS, S3, SES |
| Team familiarity | Medium |
| Setup weight | **Docker required** + image pulls + service config |

**Pros:** Could emulate the *whole* stack — Cognito auth, the SQS provisioning seam, S3/CloudFront-style content — so the demo would mirror more of the architecture than just the DB.
**Cons:** **Requires Docker**, which the build/test sandbox does not have, so we could not run it where we develop. Far more setup and moving parts than a single reviewer-facing demo needs; the multi-service breadth is wasted when the demo's job is the admin lifecycle over DynamoDB. Slower startup, heavier resource use. Re-entry point if we later want to demo Cognito/SQS/S3 locally (see Action Items).

### Option D — Node.js + in-memory DynamoDB clone (e.g. dynalite / jest-dynalite)

| Dimension | Assessment |
|-----------|------------|
| Complexity | **Lowest** |
| Cost | $0 |
| Production fidelity | **Medium** — JS reimplementation, not AWS's engine |
| Team familiarity | High |
| Setup weight | `npm install` only (no Java, no Docker) |

**Pros:** Zero external runtime — pure npm, fastest possible "clone and run," great for unit tests.
**Cons:** It is a community re-implementation, not AWS's DynamoDB; some GSI projection, conditional-expression, and pagination behaviors drift from the real service — exactly the semantics our idempotent state machine leans on (`Architecture-Design.md` §9.1, §9A.1). "Mimic production DynamoDB" was the explicit requirement; a lookalike undercuts it. Several such projects are lightly maintained.

### Option E — Real AWS sandbox account (or AWS SAM local)

Rejected for the demo: needs an AWS account + credentials, can't run offline, and (SAM local) still needs Docker for the Lambda emulator. Reserved as the eventual *deployment* path, not the demo path.

## Trade-off Analysis

The core tension is **fidelity vs. setup weight**, resolved by the requirement wording and the environment:

- **Fidelity floor is set by the ask.** "Mimic the production DynamoDB" rules out the in-memory clone (Option D) for anything we want to trust about conditional writes and GSIs. AWS's own DynamoDB Local is the faithful choice that still runs locally.
- **Setup ceiling is set by "no Docker in the build sandbox."** That eliminates LocalStack (C) and SAM-local (E) as the *primary* engine, because we must be able to run and test the demo where we build it. DynamoDB Local's **jar** runs on the JVM with no Docker — it clears the ceiling; the Docker image of the same tool would not.
- **Language is decided by code reuse, not preference.** Node + SDK v3 means the demo's repository/lifecycle modules are the *actual* future Lambda modules (endpoint-swap away). Python (B) would make the demo a throwaway in a JS repo — a real cost with no offsetting benefit here.
- **What we knowingly give up:** LocalStack's breadth. The demo fakes two things the cloud does for real — **auth** (a thin local role/session shim stands in for Cognito) and **gated content delivery** (curriculum served from a seeded table / JSON instead of S3+CloudFront signed cookies). These are documented as demo-only deviations, and Option C remains the re-entry path if we later need to demo them locally.

Express vs. Fastify vs. raw `node:http`: Express chosen for readability and because its routing mirrors the API Gateway route table; Fastify's throughput is irrelevant at demo scale. `node:test` over Jest/Vitest: zero added dependencies, built into Node 22, fast — we trade Jest's richer mocking/snapshots for a leaner install, acceptable for integration-style tests against a live local DynamoDB.

## Consequences

**Easier**
- Demo data-access code graduates to Lambda code by swapping the endpoint — no rewrite.
- One language, one `npm install`, no Docker; runs in CI/sandbox and on the maintainer's machine identically.
- Real DynamoDB semantics let us actually test the idempotent, conditional-write state machine the architecture depends on.

**Harder**
- A JVM must be available (Java 11 satisfies it today; documented as a prerequisite).
- Auth and gated-content delivery are simulated, so the demo does **not** exercise Cognito MFA, the SQS provisioning seam, or CloudFront signed-cookie gating — those stay design-only until a later phase.

**Revisit when**
- We want to demo Cognito/SQS/S3 behavior locally → adopt LocalStack (Option C) behind Docker.
- We move from demo to deployment → AWS SAM (already the chosen IaC in `Architecture-Design.md` §4/§13); the SDK-v3 modules carry straight over.

## Action Items
1. [ ] Pin the DynamoDB Local version and add a fetch/launch script (jar, no Docker) with a health check.
2. [ ] Centralize the endpoint in one DB client module so the demo→AWS switch is a single env var.
3. [ ] Mark the auth shim and JSON/table content delivery as **demo-only** in `demo/README.md`, each pointing at the production mechanism it stands in for.
4. [ ] Record the LocalStack re-entry trigger alongside the §14 triggers in the Architecture doc if/when whole-stack local emulation is wanted.

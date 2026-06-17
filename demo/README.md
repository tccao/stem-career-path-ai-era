# CFG V2 Platform — Local Demo

A runnable, local demo of the Code For Good **V2 vetted-access learning platform**
(`apply → vet/donate → grant → learn → expire`). It mimics the production AWS serverless
design from [`../docs/Architecture-Design.md`](../docs/Architecture-Design.md) against a
**local cloud**, so the data-access code here is the same code the future Lambdas run — only
the endpoint URL differs.

Built in phases, each tested: table schema → state machine → admin dashboard → real curriculum.
Decisions are recorded in [`docs/ADR-001`](docs/ADR-001-demo-tech-stack.md) (stack) and
[`docs/ADR-002`](docs/ADR-002-local-cloud-emulator.md) (local cloud).

---

## Quick start (≈ 3 minutes)

You need **Node ≥ 20** and **Docker** (for MiniStack, the local AWS cloud).

```bash
cd demo
npm install
cp .env.example .env                 # endpoint defaults to MiniStack (http://localhost:4566)

npm run cloud:up                     # start MiniStack (DynamoDB/Cognito/SQS/S3/SES on :4566)
npm run db:create                    # create the 9 tables
npm run db:seed                      # admin + sample applications + real curriculum
npm start                            # http://localhost:3000
```

Then open **http://localhost:3000/admin.html** and sign in:

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@codeforgood.us` | `admin1234` |
| Student | `student@codeforgood.us` | `student1234` |

The admin dashboard shows the applications queue, lets you drive each application through the
state machine (schedule interview → approve → **provision**), and manage members (extend / revoke).

> **No Docker?** Use the official DynamoDB Local jar instead (covers the database; auth/SQS/S3
> stay simulated). Run the jar on port 8000, set `AWS_ENDPOINT_URL=http://localhost:8000` in
> `.env`, then run the same `db:create` / `db:seed` / `start` steps. The jar needs a JVM
> (Java 17+ for the current release). See [ADR-002](docs/ADR-002-local-cloud-emulator.md).

---

## API (URL-versioned)

Every route is mounted under **`/api/v1`** so a future `/api/v2` can run side-by-side without
breaking v1 clients (see `src/app.mjs` and `src/routes/v1/`).

| Method | Route | Zone | Purpose |
|--------|-------|------|---------|
| GET | `/health`, `/api/v1` | — | liveness / version discovery |
| POST | `/api/v1/auth/login` | auth | sign in (demo Cognito stand-in) → token |
| GET | `/api/v1/auth/me` | auth | current user from token |
| POST | `/api/v1/applications` | public | submit an application (age/consent gate) |
| GET | `/api/v1/admin/overview` | admin | counts by lifecycle status |
| GET | `/api/v1/admin/applications?status=` | admin | review queue |
| GET | `/api/v1/admin/applications/:id` | admin | application + audit trail |
| POST | `/api/v1/admin/applications/:id/schedule-interview` | admin | → INTERVIEW_SCHEDULED |
| POST | `/api/v1/admin/applications/:id/approve` | admin | → APPROVED_BENEFICIARY |
| POST | `/api/v1/admin/applications/:id/require-donation` | admin | → DONATION_REQUIRED |
| POST | `/api/v1/admin/applications/:id/confirm-donation` | admin | → DONATION_CONFIRMED |
| POST | `/api/v1/admin/applications/:id/reject` | admin | → REJECTED |
| POST | `/api/v1/admin/applications/:id/request-info` | admin | audited note (no status change) |
| POST | `/api/v1/admin/applications/:id/provision` | admin | → ACTIVE + create member (idempotent) |
| GET | `/api/v1/admin/members` | admin | provisioned students |
| POST | `/api/v1/admin/members/:id/extend` | admin | extend access window |
| POST | `/api/v1/admin/members/:id/revoke` | admin | → REVOKED |
| GET | `/api/v1/curriculum[/:pathKey]` | public | the seeded curriculum |

Admin routes require `Authorization: Bearer <token>` with the `admin` role — **enforced
server-side** (401 unauth, 403 wrong role), never trusted from the client.

---

## Project layout

```
demo/
  docker-compose.yml          # MiniStack — the local AWS cloud (one container, :4566)
  src/
    config.mjs                # endpoint-driven config (one var switches jar/MiniStack/AWS)
    db/ client.mjs tables.mjs # SDK client + the 9 table schemas (Arch §5.1)
    repositories/             # applications, members, audit, demoAuth, content
    services/ lifecycle.mjs   # the server-enforced state machine (Arch §9)
              auth.mjs        # demo auth shim (Cognito stand-in) + route guards
    routes/v1/                # versioned API: auth, public, admin, content
    content/curriculum.json   # real curriculum extracted from ../references/*.pdf
  public/admin.html           # admin dashboard (single file, CFG identity)
  scripts/                    # create-tables, seed, seed-curriculum
  test/                       # node:test suites (schema, lifecycle, admin-api, curriculum)
  docs/                       # ADR-001 (stack), ADR-002 (local cloud)
```

---

## Testing

```bash
npm test          # requires a local endpoint up (MiniStack or the jar) + AWS_ENDPOINT_URL set
```

34 integration tests run against a **real local DynamoDB engine** (not a mock), covering:
table schema + GSIs + conditional-write idempotency; every state-machine transition, illegal
transitions, idempotent provisioning, and the PII-free audit guarantee; the admin API incl.
the 401/403 role guard and the full apply→provision flow over HTTP; and the seeded curriculum.

> **Test ownership note.** The database, state machine, and API suites run anywhere a DynamoDB
> endpoint is reachable. The deeper MiniStack-only integrations (real Cognito, the SQS
> provisioning seam, S3/SES) are wired against MiniStack and run on a Docker host — see ADR-002.

---

## How the demo maps to production AWS

| Demo component | Stands in for (production) |
|----------------|----------------------------|
| Express server, `/api/v1` routes split by zone | API Gateway HTTP API + 3 Lambdas (`public-fn` / `app-fn` / `system-fn`) |
| DynamoDB Local jar **or** MiniStack DynamoDB | DynamoDB on-demand (PITR, deletion protection, TTL) |
| Auth shim (`services/auth.mjs`, HMAC token) | Cognito User Pool — groups `student`/`admin`, MFA required |
| In-process `provision()` | SQS → `system-fn` (sole holder of `AdminCreateUser`) |
| `Curriculum` table / `curriculum.json` | Private S3 + CloudFront signed cookies (gated content, Arch §9.2) |
| `AuditLog` table (append-only, PII-free) | DynamoDB AuditLog + CloudTrail data events + WORM export (Arch §7) |
| `DemoAuth` table | (none — production has no password store; Cognito holds credentials) |

**Demo-only deviations (intentional — see ADRs):** auth is a shim, not Cognito (no MFA, lockout,
or refresh); provisioning runs in-process rather than across the SQS trust seam; curriculum is a
DB read rather than CloudFront-gated bytes; `listMembers`/`overview` use a scan + per-status
queries (fine at pilot scale). MiniStack can supply the real Cognito/SQS/S3/SES later with no
application-code change — only the endpoint differs.

---

## Source of truth

- Production architecture: [`../docs/Architecture-Design.md`](../docs/Architecture-Design.md) (Rev. 4)
- State machine & personas: [`../docs/Customer-Journey.md`](../docs/Customer-Journey.md)
- Curriculum source: [`../references/`](../references/) (the two reference PDFs)

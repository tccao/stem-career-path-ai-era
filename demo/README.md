# CFG V2 Platform — Local Demo

A runnable, local demo of the Code For Good **V2 vetted-access learning platform**
(`apply → vet/donate → grant → learn → expire`). It mimics the production AWS serverless
design from [`../docs/Architecture-Design.md`](../docs/Architecture-Design.md) against a
**local cloud**, so the data-access code here is the same code the future Lambdas run — only
the endpoint URL differs.

Built in phases, each tested: schema → state machine → admin dashboard → real curriculum →
student app. Decisions are recorded in [`docs/ADR-001`](docs/ADR-001-demo-tech-stack.md) (stack)
and [`docs/ADR-002`](docs/ADR-002-local-cloud-emulator.md) (local cloud).

---

## Quick start (≈ 3 minutes)

You need **Node ≥ 20** and **Docker** (for MiniStack, the local AWS cloud).

```bash
cd demo
npm install
cp .env.example .env                 # endpoint defaults to MiniStack (http://localhost:4566)

npm run cloud:up                     # start MiniStack (DynamoDB/Cognito/SQS/S3/SES on :4566)
npm run db:create                    # create the 9 tables
npm run db:seed                      # admin + students + sample applications + real curriculum
npm start                            # http://localhost:3000
```

Two dashboards, seeded logins:

| App | URL | Login |
|-----|-----|-------|
| **Admin** | <http://localhost:3000/admin.html> | `admin@codeforgood.us` / `admin1234` |
| **Student** (fast track) | <http://localhost:3000/app.html> | `student@codeforgood.us` / `student1234` |
| **Student** (full roadmap) | <http://localhost:3000/app.html> | `roadmap@codeforgood.us` / `student1234` |

The **admin** dashboard drives each application through the state machine
(schedule interview → approve → **provision**) and manages members (extend / revoke).
The **student** dashboard shows that member's learning path (8 pillars or the 4-week fast track)
with a progress bar and **server-side stage gating** — fast-track students complete one day at a
time, while full-roadmap students complete one pillar at a time.

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
| POST | `/api/v1/admin/applications/:id/{schedule-interview,approve,require-donation,confirm-donation,reject,request-info,provision}` | admin | drive the state machine |
| GET | `/api/v1/admin/members` | admin | provisioned students |
| GET | `/api/v1/admin/members/:id/progress` | admin | inspect a student's gated progress |
| POST | `/api/v1/admin/members/:id/stages/:stageKey/{locked,unlocked,auto}` | admin | override or restore milestone gating |
| POST | `/api/v1/admin/members/:id/{extend,revoke}` | admin | manage access window |
| GET | `/api/v1/app/profile` | student | current member (ACTIVE + in-window required) |
| GET | `/api/v1/app/path` | student | the member's path with per-stage gating state |
| POST | `/api/v1/app/stages/:stageKey/submit` | student | submit deliverable → complete one gated day/pillar |
| GET | `/api/v1/app/progress` | student | raw progress records |
| GET | `/api/v1/curriculum[/:pathKey]` | public | the seeded curriculum |

Guards are enforced **server-side**, never trusted from the client: admin routes require the
`admin` role (401/403); student routes require the `student` role **and** an ACTIVE, in-window
member (403 `access_expired`); submitting a locked stage is rejected (403 `stage_locked`).

---

## Project layout

```text
demo/
  docker-compose.yml          # MiniStack — the local AWS cloud (one container, :4566)
  src/
    config.mjs                # endpoint-driven config (one var switches jar/MiniStack/AWS)
    db/ client.mjs tables.mjs # SDK client + the 9 table schemas (Arch §5.1)
    repositories/             # applications, members, audit, demoAuth, content, progress
    services/ lifecycle.mjs   # server-enforced application/member state machine (Arch §9)
              student.mjs     # path assembly + server-side sequential stage gating
              auth.mjs        # demo auth shim (Cognito stand-in) + route guards
    routes/v1/                # versioned API: auth, public(apply), admin, app(student), content
    content/curriculum.json   # real curriculum extracted from ../references/*.pdf
  public/
    admin.html                # admin dashboard (applications + members)
    app.html                  # student dashboard (learning path + gated progress)
  scripts/                    # create-tables, seed, seed-curriculum
  test/                       # node:test suites (43 tests)
  docs/                       # ADR-001 (stack), ADR-002 (local cloud)
```

---

## Testing

```bash
npm test          # requires a local endpoint up (MiniStack or the jar) + AWS_ENDPOINT_URL set
```

**46 integration tests** run against a **real local DynamoDB engine** (not a mock): table schema

+ GSIs + conditional-write idempotency; every state-machine transition, illegal transitions,
idempotent provisioning, PII-free audit; the admin API incl. the 401/403 role guard and the full
apply→provision flow; the seeded curriculum; and the student app incl. role/access guards and the
stage-gating logic (submit unlocks next day/pillar; locked stage → 403).

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
| `Curriculum` table + student `path`/`progress` gating | Private S3 + CloudFront signed cookies (gated content, Arch §9.2) |
| `AuditLog` table (append-only, PII-free) | DynamoDB AuditLog + CloudTrail data events + WORM export (Arch §7) |
| `DemoAuth` table | (none — production has no password store; Cognito holds credentials) |

**Demo-only deviations (intentional — see ADRs):** auth is a shim, not Cognito (no MFA, lockout,
or refresh); provisioning runs in-process rather than across the SQS trust seam; curriculum is a
DB read and stage completion is self-attested rather than CloudFront-gated bytes with admin
deliverable-verification; list endpoints use scans (fine at pilot scale). MiniStack can supply the
real Cognito/SQS/S3/SES later with no application-code change — only the endpoint differs.

---

## Source of truth

+ Production architecture: [`../docs/Architecture-Design.md`](../docs/Architecture-Design.md) (Rev. 4)
+ State machine & personas: [`../docs/Customer-Journey.md`](../docs/Customer-Journey.md)
+ Curriculum source: [`../references/`](../references/) (the two reference PDFs)
